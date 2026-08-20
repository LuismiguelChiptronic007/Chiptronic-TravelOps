import {
  api,
  clearSession,
  getStoredUser,
  initials,
  requireAuthPage,
  updateStoredUser,
} from './api.js';
import { applyTheme, getStoredTheme, toggleTheme } from './theme.js';
import {
  showToast,
  openCommandPalette,
  closeCommandPalette,
  showHotkeysHelp,
  registerHotkeys,
  confirmDialog,
  emptyStateSVG
} from './ui.js';

let currentUser = null;
let notifPollTimer = null;
let presencePollTimer = null;
let shellInstalled = false;
let uxInstalled = false;
let shellEventsInstalled = false;

export async function mountShell({ active } = {}) {
  if (!requireAuthPage()) return null;

  applyTheme(getStoredTheme());
  ensureShellElements();
  installGlobalShortcuts();
  installProgressBar();
  initScrollReveal();
  installGlobalErrorHandler();

  let user = getStoredUser();
  try {
    const res = await api.me();
    user = res.user;
    updateStoredUser(user);
  } catch {
    clearSession();
    window.location.href = 'login.html';
    return null;
  }

  currentUser = user;
  renderSidebar(user, active);
  renderTopbar(user, active);
  renderDrawer(user);
  bindShellEvents(user);
  refreshNotificationBadge();
  api.presenceHeartbeat().catch(() => {});

  if (notifPollTimer) clearInterval(notifPollTimer);
  notifPollTimer = setInterval(refreshNotificationBadge, 60000);
  if (presencePollTimer) clearInterval(presencePollTimer);
  presencePollTimer = setInterval(() => api.presenceHeartbeat().catch(() => {}), 60000);

  return user;
}

export async function rebuildShell({ active } = {}) {
  // Reset shell state to force full re-render
  shellInstalled = false;
  uxInstalled = false;
  shellEventsInstalled = false;
  
  // Clear notification poll timer
  if (notifPollTimer) {
    clearInterval(notifPollTimer);
    notifPollTimer = null;
  }
  
  // Re-mount the shell with fresh state
  return await mountShell({ active });
}

export async function updateShellUser({ active } = {}) {
  // Update shell UI with fresh user data without remounting
  let user = getStoredUser();
  try {
    const res = await api.me();
    user = res.user;
    updateStoredUser(user);
  } catch {
    return null;
  }

  currentUser = user;
  renderSidebar(user, active);
  renderTopbar(user, active);
  renderDrawer(user);
  
  return user;
}

function installGlobalShortcuts() {
  registerHotkeys();
}

function ensureShellElements() {
  if (shellInstalled) return;
  shellInstalled = true;

  const appShell = document.querySelector('.app-shell');
  if (appShell) {
    appShell.classList.add('with-sidebar');
  }

  if (!document.getElementById('sidebar')) {
    document.body.insertAdjacentHTML('afterbegin', `
      <button type="button" class="sidebar-mobile-toggle" id="sidebar-toggle" aria-label="Menu" aria-controls="sidebar">
        <span></span><span></span><span></span>
      </button>
      <aside id="sidebar" class="sidebar" aria-label="Menu principal">
        <div class="sidebar-header">
          <a href="index.html" class="sidebar-brand" id="sidebar-brand-link" aria-label="Chiptronic TravelOps">
            <img src="assets/logo-mark.svg" alt="Chiptronic TravelOps" class="sidebar-logo-img" onerror="this.onerror=null;this.src='data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 48 48%22><rect width=%2248%22 height=%2248%22 rx=%2212%22 fill=%22%230a0a0a%22/><text x=%2224%22 y=%2230%22 font-family=%22Inter, sans-serif%22 font-size=%2220%22 font-weight=%22800%22 fill=%22white%22 text-anchor=%22middle%22>C</text></svg>';">
          </a>
        </div>
        <nav class="sidebar-nav" id="sidebar-nav">
          <div class="sidebar-section">Principal</div>
        </nav>
      </aside>
    `);
  }

  if (!document.getElementById('drawer-overlay')) {
    document.body.insertAdjacentHTML('beforeend', `
      <div id="drawer-overlay" class="drawer-overlay hidden" aria-hidden="true"></div>
      <aside id="profile-drawer" class="profile-drawer" aria-hidden="true">
        <div class="drawer-header">
          <div class="drawer-user">
            <div class="avatar lg" id="drawer-avatar">?</div>
            <div>
              <strong id="drawer-name">—</strong>
              <small id="drawer-meta" class="text-muted">—</small>
            </div>
          </div>
          <button type="button" class="icon-btn" id="drawer-close" aria-label="Fechar">✕</button>
        </div>
        <nav class="drawer-nav">
          <a href="profile.html" class="drawer-link">✏️ Editar perfil</a>
          <a href="settings.html" class="drawer-link">⚙️ Configuração</a>
          <a href="admin.html" class="drawer-link drawer-admin-link hidden" id="drawer-admin">🛡️ Painel de admin</a>
          <button type="button" class="drawer-link drawer-btn" id="drawer-theme">🌓 Tema</button>
          <button type="button" class="drawer-link drawer-btn danger" id="drawer-logout">Sair</button>
        </nav>
      </aside>
      <div id="notifications-panel" class="notifications-panel hidden" aria-hidden="true">
        <div class="notifications-header">
          <h3>Notificações</h3>
          <button type="button" class="btn btn-secondary btn-sm" id="notif-read-all">Marcar todas</button>
        </div>
        <div id="notifications-list" class="notifications-list">
          <p class="empty-state">Carregando…</p>
        </div>
      </div>
    `);
  }
}

const ACTIVE_ALIASES = {
  'new': 'new-trip',
  'trip-detail': 'viagens',
  'trip': 'viagens',
};

function renderSidebar(user, active) {
  const nav = document.getElementById('sidebar-nav');
  if (!nav) return;

  let resolvedActive = active || '';
  if (ACTIVE_ALIASES[resolvedActive]) resolvedActive = ACTIVE_ALIASES[resolvedActive];

  const links = [
    { id: 'dashboard',   title: 'Dashboard',       icon: '🏠', href: 'index.html' },
    { id: 'viagens',     title: 'Viagens',         icon: '✈️', href: 'viagens.html' },
    { id: 'new-trip',    title: 'Nova viagem',     icon: '➕', href: 'trip-new.html' }
  ];
  if (user.is_sector_leader && user.led_sector) {
    links.push({ id: 'setor', title: 'Painel do Setor', icon: '👥', href: 'setor.html' });
  }
  links.push(
    { id: 'profile',   title: 'Meu perfil',       icon: '👤', href: 'profile.html' },
    { id: 'settings',  title: 'Configurações',    icon: '⚙️', href: 'settings.html' }
  );

  const html = [
    '<div class="sidebar-section">Principal</div>',
    ...links.map((l) => `
      <a href="${l.href}" class="sidebar-link ${resolvedActive === l.id ? 'active' : ''}" data-id="${l.id}" data-tooltip="${l.title}">
        <span class="sl-icon">${l.icon}</span>
        <span>${l.title}</span>
      </a>
    `)
  ].join('');

  nav.innerHTML = html;
}

function renderTopbar(user, active) {
  const topbar = document.getElementById('topbar');
  if (!topbar) return;

  const avatarHtml = user.avatar_url
    ? `<img src="${user.avatar_url}" alt="">`
    : initials(user.full_name);

  let resolvedActive = active || '';
  if (ACTIVE_ALIASES[resolvedActive]) resolvedActive = ACTIVE_ALIASES[resolvedActive];

  const titles = {
    dashboard:   ['Home', 'Dashboard'],
    viagens:     ['Viagens', 'Listagem'],
    'new-trip':  ['Viagens', 'Nova'],
    setor:       ['Setor', user.led_sector || 'Painel'],
    profile:     ['Conta', 'Meu perfil'],
    settings:    ['Configurações', 'Sistema'],
    admin:       ['Administração', 'Painel de controle']
  };
  const parts = titles[resolvedActive] || ['Viagens', 'Detalhes'];

  topbar.innerHTML = `
    <div class="topbar-left">
      <div class="page-breadcrumb">
        <strong>${parts[0]}</strong>
        <span>${parts[1]}</span>
      </div>
    </div>
    <div class="topbar-right">
      <button type="button" class="icon-btn theme-top-btn" id="theme-toggle-btn" aria-label="Alternar tema" data-tooltip="Alternar tema">
        ${getStoredTheme() === 'dark' ? '☀️' : '🌙'}
      </button>
      <button type="button" class="icon-btn notif-btn" id="btn-notifications" aria-label="Notificações" data-tooltip="Notificações">
        🔔
        <span class="notif-badge hidden" id="notif-badge">0</span>
      </button>
      <button type="button" class="user-profile-btn" id="btn-profile" aria-label="Abrir menu de usuário">
        <div class="avatar pill">${avatarHtml}</div>
        <div class="meta">
          <strong>${escapeHtml(user.full_name)}</strong>
          <small>${escapeHtml(user.sector)} · ${escapeHtml(user.is_sector_leader ? `Líder ${user.led_sector}` : user.position_title)}</small>
        </div>
      </button>
    </div>
  `;
}

function renderDrawer(user) {
  const nameEl = document.getElementById('drawer-name');
  const metaEl = document.getElementById('drawer-meta');
  const avatarEl = document.getElementById('drawer-avatar');
  const themeBtn = document.getElementById('drawer-theme');
  const adminLink = document.getElementById('drawer-admin');

  if (nameEl) nameEl.textContent = user.full_name;
  if (metaEl) {
    const roleLabel = user.is_admin_master
      ? 'Admin Master'
      : user.is_admin
        ? 'Administrador'
        : user.is_sector_leader
          ? `Líder · ${user.led_sector}`
          : user.position_title;
    metaEl.textContent = `${user.sector} · ${roleLabel}`;
  }
  if (avatarEl) {
    avatarEl.innerHTML = user.avatar_url
      ? `<img src="${user.avatar_url}" alt="">`
      : initials(user.full_name);
  }
  if (themeBtn) {
    themeBtn.textContent = getStoredTheme() === 'dark' ? '☀️ Tema claro' : '🌙 Tema escuro';
  }
  if (adminLink) adminLink.classList.toggle('hidden', !user.is_admin);
}

function bindShellEvents(user) {
  if (shellEventsInstalled) return;
  shellEventsInstalled = true;

  document.getElementById('sidebar-toggle')?.addEventListener('click', toggleSidebarMobile);
  document.getElementById('drawer-overlay')?.addEventListener('click', () => {
    closeDrawer();
    closeSidebarMobile();
    closeNotifications();
  });

  document.getElementById('cp-trigger')?.addEventListener('click', () => openCommandPalette());

  const toggleAllTheme = () => {
    const next = toggleTheme();
    ['drawer-theme','theme-toggle-btn'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (id === 'drawer-theme') {
        el.textContent = next === 'dark' ? '☀️ Tema claro' : '🌙 Tema escuro';
      } else {
        el.textContent = next === 'dark' ? '☀️' : '🌙';
      }
    });
    showToast({ type: 'info', title: 'Tema alterado', msg: next === 'dark' ? 'Tema escuro ativado.' : 'Tema claro ativado.', duration: 2200 });
  };
  document.getElementById('drawer-theme')?.addEventListener('click', toggleAllTheme);
  document.getElementById('theme-toggle-btn')?.addEventListener('click', toggleAllTheme);

  document.getElementById('btn-profile')?.addEventListener('click', openDrawer);
  document.getElementById('drawer-close')?.addEventListener('click', closeDrawer);

  document.getElementById('drawer-logout')?.addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Sair da conta?',
      message: 'Você será redirecionado para a tela de login e precisará autenticar novamente.',
      confirmLabel: 'Sair',
      cancelLabel: 'Cancelar',
      tone: 'danger',
      confirmTone: 'danger'
    });
    if (!ok) return;
    clearSession();
    window.location.href = 'login.html';
  });

  document.getElementById('btn-notifications')?.addEventListener('click', (e) => {
    e.stopPropagation();
    closeDrawer();
    closeSidebarMobile();
    refreshOverlay();
    toggleNotifications();
  });

  document.getElementById('notif-read-all')?.addEventListener('click', async () => {
    try {
      await api.markAllNotificationsRead();
      await loadNotifications();
      await refreshNotificationBadge();
      showToast({ type: 'success', title: 'Pronto!', msg: 'Todas as notificações foram marcadas como lidas.', duration: 2400 });
    } catch (err) {
      showToast({ type: 'error', title: 'Erro', msg: err?.message || 'Não foi possível atualizar.', duration: 2800 });
    }
  });

  document.addEventListener('click', (e) => {
    const panel = document.getElementById('notifications-panel');
    const btn = document.getElementById('btn-notifications');
    if (!panel || panel.classList.contains('hidden')) return;
    if (panel.contains(e.target) || btn?.contains(e.target)) return;
    closeNotifications();
  });
}

function isAnyPanelOpen() {
  const dr = document.getElementById('profile-drawer');
  return Boolean(dr && dr.classList.contains('open'));
}
function refreshOverlay() {
  const ov = document.getElementById('drawer-overlay');
  if (!ov) return;
  if (isAnyPanelOpen()) ov.classList.remove('hidden');
  else ov.classList.add('hidden');
}

function toggleSidebarMobile() {
  const sb = document.getElementById('sidebar');
  if (!sb) return;
  const open = sb.classList.toggle('open');
  document.getElementById('sidebar-toggle')?.classList.toggle('is-open', open);
  if (open) { closeDrawer(); closeNotifications(); }
  refreshOverlay();
}
function closeSidebarMobile() {
  const sb = document.getElementById('sidebar');
  if (!sb) return;
  if (window.innerWidth < 880) sb.classList.remove('open');
  document.getElementById('sidebar-toggle')?.classList.remove('is-open');
  refreshOverlay();
}

function openDrawer() {
  document.getElementById('profile-drawer')?.classList.add('open');
  closeSidebarMobile();
  closeNotifications();
  refreshOverlay();
}
function closeDrawer() {
  document.getElementById('profile-drawer')?.classList.remove('open');
  refreshOverlay();
}

async function toggleNotifications() {
  const panel = document.getElementById('notifications-panel');
  if (!panel) return;
  if (panel.classList.contains('hidden')) {
    panel.classList.remove('hidden');
    closeDrawer();
    closeSidebarMobile();
    refreshOverlay();
    await loadNotifications();
  } else {
    panel.classList.add('hidden');
    refreshOverlay();
  }
}
function closeNotifications() {
  document.getElementById('notifications-panel')?.classList.add('hidden');
  refreshOverlay();
}

async function refreshNotificationBadge() {
  const badge = document.getElementById('notif-badge');
  if (!badge) return;
  try {
    const res = await api.notificationUnreadCount();
    const count = res.unread_count || 0;
    if (count > 0) {
      badge.textContent = count > 99 ? '99+' : String(count);
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  } catch {
    badge.classList.add('hidden');
  }
}

async function loadNotifications() {
  const list = document.getElementById('notifications-list');
  if (!list) return;
  list.innerHTML = '<p class="empty-state">Carregando…</p>';
  try {
    const res = await api.listNotifications();
    const items = res.notifications || [];
    if (!items.length) {
      list.innerHTML = `
        <div class="empty-illust">${emptyStateSVG('folder')}</div>
        <div class="empty-state" style="padding-top:0.5rem;">
          <p class="empty-title">Nada por aqui</p>
          <p class="empty-sub">Você não tem notificações. Volte em breve.</p>
        </div>`;
      return;
    }
    list.innerHTML = items
      .map((n) => `
        <button type="button" class="notif-item ${n.is_read ? '' : 'unread'}" data-id="${n.id}" data-link="${escapeHtml(n.link || '')}">
          <strong>${escapeHtml(n.title)}</strong>
          <p>${escapeHtml(n.message)}</p>
          <small class="text-muted">${formatNotifDate(n.created_at)}</small>
        </button>`
      )
      .join('');

    list.querySelectorAll('.notif-item').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.dataset.id);
        const link = btn.dataset.link;
        try {
          await api.markNotificationRead(id);
        } catch { /* ignore */ }
        await refreshNotificationBadge();
        closeNotifications();
        if (link) {
          const normalized = link.startsWith('/') ? link.slice(1) : link;
          window.location.href = normalized;
        }
      });
    });
  } catch (err) {
    list.innerHTML = `<p class="empty-state">${escapeHtml(err.message)}</p>`;
  }
}

function formatNotifDate(iso) {
  if (!iso) return '';
  const d = new Date(iso.includes('T') ? iso : `${iso}Z`);
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function installProgressBar() {
  const bar = document.createElement('div');
  bar.className = 'progress-bar';
  bar.id = 'progress-bar';
  document.body.appendChild(bar);

  let ticking = false;
  const update = () => {
    if (!ticking) {
      window.requestAnimationFrame(() => {
        const doc = document.documentElement;
        const total = doc.scrollHeight - doc.clientHeight;
        const pct = total > 0 ? Math.min(100, (doc.scrollTop / total) * 100) : 0;
        bar.style.width = pct + '%';
        ticking = false;
      });
      ticking = true;
    }
  };
  window.addEventListener('scroll', update, { passive: true });
  update();
}

function installBackToTop() {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'back-to-top';
  btn.id = 'back-to-top';
  btn.setAttribute('aria-label', 'Voltar ao topo');
  btn.setAttribute('data-tooltip', 'Voltar ao topo');
  btn.innerHTML = '↑';
  document.body.appendChild(btn);

  let ticking = false;
  const onScroll = () => {
    if (!ticking) {
      window.requestAnimationFrame(() => {
        const show = window.scrollY > 420;
        btn.classList.toggle('visible', show);
        ticking = false;
      });
      ticking = true;
    }
  };
  window.addEventListener('scroll', onScroll, { passive: true });

  btn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    showToast({ type: 'info', title: 'Topo!', msg: 'Você voltou ao topo da página.', duration: 1400 });
  });
}

/* Scroll Reveal — revela elementos suavemente ao rolar */
function initScrollReveal() {
  const autoTargets = document.querySelectorAll(
    '.stat-card, .panel, .card, .table-wrap, .page-header, .team-member-card, .checklist-box, .mini-stat, .task-day-group, .ranking-row, .member-chip, .list-item'
  );
  const viewportHeight = window.innerHeight;
  autoTargets.forEach((el, i) => {
    const rect = el.getBoundingClientRect();
    if (rect.top < viewportHeight && rect.bottom > 0) {
      el.classList.add('visible');
      return;
    }
    const delay = Math.min(i * 20, 100);
    el.classList.add('reveal');
    el.style.transitionDelay = delay + 'ms';
  });

  if (!('IntersectionObserver' in window)) {
    document.querySelectorAll('.reveal, .reveal-left, .reveal-right, .reveal-scale').forEach((el) => el.classList.add('visible'));
    return;
  }

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
  );

  document.querySelectorAll('.reveal, .reveal-left, .reveal-right, .reveal-scale').forEach((el) => io.observe(el));
}

/* FAB — Quick Actions */
function installFabButtons(user) {
  if (document.getElementById('fab-container')) return;

  const container = document.createElement('div');
  container.className = 'fab-container';
  container.id = 'fab-container';

  const actions = [
    {
      label: 'Nova viagem',
      icon: '✈️',
      href: 'trip-new.html',
      tooltip: 'Criar nova viagem',
      main: true
    },
    {
      label: 'Dashboard',
      icon: '🏠',
      href: 'index.html',
      tooltip: 'Ir para o Dashboard',
      main: false
    }
  ];

  if (user?.is_sector_leader && user?.led_sector) {
    actions.splice(1, 0, {
      label: 'Painel do Setor',
      icon: '👥',
      href: 'setor.html',
      tooltip: 'Ver seu setor',
      main: false
    });
  }

  container.innerHTML = actions.map((a) => {
    if (a.main) {
      return `<a href="${a.href}" class="fab" aria-label="${a.label}" data-tooltip="${a.tooltip}">${a.icon}</a>`;
    }
    return `<a href="${a.href}" class="fab secondary" aria-label="${a.label}" data-tooltip="${a.tooltip}">${a.icon}</a>`;
  }).reverse().join('');

  document.body.appendChild(container);
}

function installGlobalErrorHandler() {
  const IGNORE_MESSAGES = [
    'ResizeObserver loop',
    'textContent assignment',
    'chrome-extension',
    'edge-extension',
    'safari-extension',
  ];

  const normalizeMessage = (message) => {
    if (!message) return '';
    return message
      .replace(/\\/g, '/')
      .replace(/[\\"']/g, '')
      .trim();
  };

  const shouldIgnore = (message) => {
    const normalized = normalizeMessage(message);
    return IGNORE_MESSAGES.some((m) => normalized.includes(m));
  };

  const showErrorToast = (message) => {
    if (shouldIgnore(message)) return;
    const normalized = normalizeMessage(message);
    if (!normalized) return;
    showToast({
      type: 'error',
      title: 'Erro',
      msg: normalized,
      duration: 8000,
    });
  };

  window.addEventListener('error', (event) => {
    if (event.target === window || event.target === document) {
      showErrorToast(event.message);
    }
  }, true);

  window.addEventListener('unhandledrejection', (event) => {
    const message = event.reason?.message || event.reason || 'Erro não tratado.';
    showErrorToast(message);
  });
}

export { showToast, confirmDialog, showHotkeysHelp, emptyStateSVG };

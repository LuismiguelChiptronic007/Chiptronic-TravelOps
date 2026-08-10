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
let shellInstalled = false;
let uxInstalled = false;

export async function mountShell({ active } = {}) {
  if (!requireAuthPage()) return null;

  applyTheme(getStoredTheme());
  ensureShellElements();
  installGlobalShortcuts();
  installUXEnhancements();

  let user = getStoredUser();
  try {
    const res = await api.me();
    user = res.user;
    updateStoredUser(user);
  } catch {
    clearSession();
    triggerPageTransition('login.html');
    return null;
  }

  currentUser = user;
  renderSidebar(user, active);
  renderTopbar(user, active);
  renderDrawer(user);
  bindShellEvents(user);
  installFabButtons(user);
  refreshNotificationBadge();

  if (notifPollTimer) clearInterval(notifPollTimer);
  notifPollTimer = setInterval(refreshNotificationBadge, 60000);

  animatePageIn();
  initScrollReveal();
  return user;
}

function installGlobalShortcuts() {
  registerHotkeys();
}

function ensureShellElements() {
  if (shellInstalled) return;
  shellInstalled = true;

  document.body.classList.add('with-sidebar');

  if (!document.getElementById('sidebar')) {
    document.body.insertAdjacentHTML('afterbegin', `
      <button type="button" class="sidebar-mobile-toggle" id="sidebar-toggle" aria-label="Menu" aria-controls="sidebar">
        <span></span><span></span><span></span>
      </button>
      <aside id="sidebar" class="sidebar" aria-label="Menu principal">
        <a href="index.html" class="sidebar-brand" id="sidebar-brand-link" aria-label="Chiptronic TravelOps">
          <img src="assets/logo-full.svg" alt="Chiptronic TravelOps" class="sidebar-logo-img" onerror="this.onerror=null;this.src='data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 320 80%22><text x=%2220%22 y=%2248%22 font-family=%22Inter, sans-serif%22 font-size=%2228%22 font-weight=%22800%22 fill=%22%231e293b%22>Chiptronic</text><text x=%2222%22 y=%2268%22 font-size=%2212%22 font-weight=%22600%22 fill=%22%2364748b%22>TravelOps</text></svg>';">
        </a>
        <nav class="sidebar-nav" id="sidebar-nav">
          <div class="sidebar-section">Principal</div>
        </nav>
        <div class="sidebar-footer">
          <div class="sidebar-card" id="sidebar-user-card">
            <div class="avatar sm" id="sidebar-avatar-sm">?</div>
            <div>
              <strong id="sidebar-user-name">—</strong>
              <small id="sidebar-user-meta">—</small>
            </div>
            <button type="button" class="icon-btn" id="sidebar-theme-btn" aria-label="Alternar tema" data-tooltip="Alternar tema">🌙</button>
          </div>
        </div>
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

function renderSidebar(user, active) {
  const nav = document.getElementById('sidebar-nav');
  if (!nav) return;

  const links = [
    { id: 'dashboard',   title: 'Dashboard',       icon: '🏠', href: 'dashboard.html' },
    { id: 'viagens',     title: 'Viagens',         icon: '✈️', href: 'viagens.html' },
    { id: 'new-trip',    title: 'Nova viagem',     icon: '➕', href: 'nova-viagem.html' }
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
      <a href="${l.href}" class="sidebar-link ${active === l.id ? 'active' : ''}" data-id="${l.id}" data-tooltip="${l.title}">
        <span class="sl-icon">${l.icon}</span>
        <span>${l.title}</span>
      </a>
    `),
    '<div class="sidebar-section">Ajuda</div>',
    `<a href="#" class="sidebar-link" id="sidebar-shortcuts" data-tooltip="Atalhos">
      <span class="sl-icon">⌨️</span>
      <span>Atalhos de teclado</span>
    </a>`
  ].join('');

  nav.innerHTML = html;

  const name = document.getElementById('sidebar-user-name');
  const meta = document.getElementById('sidebar-user-meta');
  const av = document.getElementById('sidebar-avatar-sm');
  if (name) name.textContent = user.full_name;
  if (meta) {
    const role = user.is_sector_leader ? `Líder · ${user.led_sector}` : user.position_title;
    meta.textContent = `${user.sector} · ${role}`;
  }
  if (av) av.innerHTML = user.avatar_url ? `<img src="${user.avatar_url}" alt="">` : initials(user.full_name);

  const themeBtn = document.getElementById('sidebar-theme-btn');
  if (themeBtn) {
    themeBtn.textContent = getStoredTheme() === 'dark' ? '☀️' : '🌙';
  }

  document.getElementById('sidebar-shortcuts')?.addEventListener('click', (e) => {
    e.preventDefault();
    showHotkeysHelp();
  });
}

function renderTopbar(user, active) {
  const topbar = document.getElementById('topbar');
  if (!topbar) return;

  const avatarHtml = user.avatar_url
    ? `<img src="${user.avatar_url}" alt="">`
    : initials(user.full_name);

  const titles = {
    dashboard:   ['Home', 'Dashboard'],
    viagens:     ['Viagens', 'Listagem'],
    'new-trip':  ['Viagens', 'Nova'],
    setor:       ['Setor', user.led_sector || 'Painel'],
    profile:     ['Conta', 'Meu perfil'],
    settings:    ['Configurações', 'Sistema'],
    'trip-detail': ['Viagens', 'Detalhes']
  };
  const parts = titles[active] || ['Chiptronic', 'Página'];

  topbar.innerHTML = `
    <div class="topbar-left">
      <button type="button" class="icon-btn sidebar-toggle-btn" id="topbar-sidebar-toggle" aria-label="Alternar menu">
        ☰
      </button>
      <div class="breadcrumb">
        <span>${parts[0]}</span>
        <span class="sep">/</span>
        <span class="current">${parts[1]}</span>
      </div>
    </div>
    <div class="topbar-right">
      <button type="button" class="command-palette-trigger" id="cp-trigger" aria-label="Abrir busca rápida">
        <span class="cp-icon">🔍</span>
        <span>Busca rápida…</span>
      </button>
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
}

function bindShellEvents(user) {
  document.getElementById('topbar-sidebar-toggle')?.addEventListener('click', toggleSidebarMobile);
  document.getElementById('sidebar-toggle')?.addEventListener('click', toggleSidebarMobile);
  document.getElementById('drawer-overlay')?.addEventListener('click', () => {
    closeDrawer();
    closeSidebarMobile();
    closeNotifications();
  });

  document.getElementById('cp-trigger')?.addEventListener('click', () => openCommandPalette());

  const toggleAllTheme = () => {
    const next = toggleTheme();
    ['drawer-theme','sidebar-theme-btn','theme-toggle-btn'].forEach((id) => {
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
  document.getElementById('sidebar-theme-btn')?.addEventListener('click', toggleAllTheme);
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
    location.href = 'login.html';
  });

  document.getElementById('btn-notifications')?.addEventListener('click', (e) => {
    e.stopPropagation();
    closeDrawer();
    closeSidebarMobile();
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

function toggleSidebarMobile() {
  const sb = document.getElementById('sidebar');
  const ov = document.getElementById('drawer-overlay');
  if (!sb) return;
  const open = sb.classList.toggle('open');
  document.getElementById('sidebar-toggle')?.classList.toggle('is-open', open);
  if (ov) ov.classList.toggle('hidden', !open);
  if (open) { ov?.classList.remove('hidden'); closeDrawer(); closeNotifications(); }
}
function closeSidebarMobile() {
  const sb = document.getElementById('sidebar');
  if (!sb) return;
  if (window.innerWidth < 880) sb.classList.remove('open');
  document.getElementById('sidebar-toggle')?.classList.remove('is-open');
}

function openDrawer() {
  document.getElementById('profile-drawer')?.classList.add('open');
  document.getElementById('drawer-overlay')?.classList.remove('hidden');
  closeSidebarMobile();
  closeNotifications();
}
function closeDrawer() {
  document.getElementById('profile-drawer')?.classList.remove('open');
  const sidebarOpen = document.getElementById('sidebar')?.classList.contains('open');
  if (!sidebarOpen) document.getElementById('drawer-overlay')?.classList.add('hidden');
}

async function toggleNotifications() {
  const panel = document.getElementById('notifications-panel');
  if (!panel) return;
  if (panel.classList.contains('hidden')) {
    panel.classList.remove('hidden');
    await loadNotifications();
  } else {
    panel.classList.add('hidden');
  }
}
function closeNotifications() {
  document.getElementById('notifications-panel')?.classList.add('hidden');
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
          location.href = normalized;
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

function animatePageIn() {
  const main = document.getElementById('main') || document.querySelector('main');
  if (!main) return;
  main.style.opacity = '0';
  main.style.transform = 'translateY(8px)';
  requestAnimationFrame(() => {
    main.style.transition = 'opacity .35s var(--ease, ease), transform .35s var(--ease, ease)';
    main.style.opacity = '1';
    main.style.transform = 'translateY(0)';
  });
}

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ====== UX Enhancements: Progress Bar, Back to Top, Page Transitions, FAB, Reveal ====== */

function installUXEnhancements() {
  if (uxInstalled) return;
  uxInstalled = true;

  installProgressBar();
  installBackToTop();
  installSmoothLinkTransitions();
}

function installProgressBar() {
  const bar = document.createElement('div');
  bar.className = 'progress-bar';
  bar.id = 'progress-bar';
  document.body.appendChild(bar);

  const update = () => {
    const doc = document.documentElement;
    const total = doc.scrollHeight - doc.clientHeight;
    const pct = total > 0 ? Math.min(100, (doc.scrollTop / total) * 100) : 0;
    bar.style.width = pct + '%';
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

function triggerPageTransition(url) {
  if (!url) return;
  const overlay = document.createElement('div');
  overlay.className = 'page-transition active';
  document.body.appendChild(overlay);
  setTimeout(() => {
    window.location.href = url;
  }, 320);
}

function installSmoothLinkTransitions() {
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href]');
    if (!link) return;
    const href = link.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
    if (link.target === '_blank' || link.download) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (!href.endsWith('.html')) return;
    e.preventDefault();
    triggerPageTransition(href);
  });
}

/* Scroll Reveal — revela elementos suavemente ao rolar */
function initScrollReveal() {
  const autoTargets = document.querySelectorAll(
    '.stat-card, .panel, .card, .table-wrap, .page-header, .team-member-card, .checklist-box, .mini-stat, .task-day-group, .ranking-row, .member-chip, .list-item'
  );
  autoTargets.forEach((el, i) => {
    const delay = Math.min(i * 40, 320);
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

export { showToast, confirmDialog, openCommandPalette, closeCommandPalette, showHotkeysHelp, emptyStateSVG, triggerPageTransition };

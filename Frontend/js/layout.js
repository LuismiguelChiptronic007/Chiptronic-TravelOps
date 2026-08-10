import {
  api,
  clearSession,
  getStoredUser,
  initials,
  requireAuthPage,
  updateStoredUser,
} from './api.js';
import { applyTheme, getStoredTheme, toggleTheme } from './theme.js';

let currentUser = null;
let notifPollTimer = null;

export async function mountShell({ active } = {}) {
  if (!requireAuthPage()) return null;

  applyTheme(getStoredTheme());
  ensureShellElements();

  let user = getStoredUser();
  try {
    const res = await api.me();
    user = res.user;
    updateStoredUser(user);
  } catch {
    clearSession();
    location.href = 'login.html';
    return null;
  }

  currentUser = user;
  renderTopbar(user, active);
  renderDrawer(user);
  bindShellEvents(user);
  refreshNotificationBadge();

  if (notifPollTimer) clearInterval(notifPollTimer);
  notifPollTimer = setInterval(refreshNotificationBadge, 60000);

  return user;
}

function ensureShellElements() {
  if (!document.getElementById('drawer-overlay')) {
    document.body.insertAdjacentHTML(
      'beforeend',
      `
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
      </div>`
    );
  }
}

function renderTopbar(user, active) {
  const topbar = document.getElementById('topbar');
  if (!topbar) return;

  const avatarHtml = user.avatar_url
    ? `<img src="${user.avatar_url}" alt="">`
    : initials(user.full_name);

  const sectorLink =
    user.is_sector_leader && user.led_sector
      ? `<a href="setor.html" class="${active === 'setor' ? 'active' : ''}">Dashboard ${escapeHtml(user.led_sector)}</a>`
      : '';

  topbar.innerHTML = `
    <a class="brand" href="index.html">
      <div class="brand-mark">CT</div>
      <span>Chiptronic TravelOps</span>
    </a>
    <nav class="nav-links">
      <a href="index.html" class="${active === 'dashboard' ? 'active' : ''}">Dashboard</a>
      <a href="viagens.html" class="${active === 'viagens' ? 'active' : ''}">Viagens</a>
      ${sectorLink}
    </nav>
    <div class="user-chip">
      <button type="button" class="icon-btn notif-btn" id="btn-notifications" aria-label="Notificações">
        🔔
        <span class="notif-badge hidden" id="notif-badge">0</span>
      </button>
      <button type="button" class="user-profile-btn" id="btn-profile">
        <div class="meta">
          <strong>${escapeHtml(user.full_name)}</strong>
          <small>${escapeHtml(user.sector)} · ${escapeHtml(user.is_sector_leader ? `Líder ${user.led_sector}` : user.position_title)}</small>
        </div>
        <div class="avatar">${avatarHtml}</div>
      </button>
    </div>`;
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

function bindShellEvents() {
  document.getElementById('btn-profile')?.addEventListener('click', openDrawer);
  document.getElementById('drawer-close')?.addEventListener('click', closeDrawer);
  document.getElementById('drawer-overlay')?.addEventListener('click', () => {
    closeDrawer();
    closeNotifications();
  });
  document.getElementById('drawer-logout')?.addEventListener('click', () => {
    clearSession();
    location.href = 'login.html';
  });
  document.getElementById('drawer-theme')?.addEventListener('click', () => {
    const next = toggleTheme();
    const themeBtn = document.getElementById('drawer-theme');
    if (themeBtn) {
      themeBtn.textContent = next === 'dark' ? '☀️ Tema claro' : '🌙 Tema escuro';
    }
  });

  document.getElementById('btn-notifications')?.addEventListener('click', (e) => {
    e.stopPropagation();
    closeDrawer();
    toggleNotifications();
  });

  document.getElementById('notif-read-all')?.addEventListener('click', async () => {
    try {
      await api.markAllNotificationsRead();
      await loadNotifications();
      await refreshNotificationBadge();
    } catch {
      /* ignore */
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

function openDrawer() {
  document.getElementById('profile-drawer')?.classList.add('open');
  document.getElementById('drawer-overlay')?.classList.remove('hidden');
  closeNotifications();
}

function closeDrawer() {
  document.getElementById('profile-drawer')?.classList.remove('open');
  document.getElementById('drawer-overlay')?.classList.add('hidden');
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
      list.innerHTML = '<p class="empty-state">Nenhuma notificação.</p>';
      return;
    }
    list.innerHTML = items
      .map(
        (n) => `
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
        } catch {
          /* ignore */
        }
        await refreshNotificationBadge();
        closeNotifications();
        if (link) location.href = link.replace(/^\//, '');
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

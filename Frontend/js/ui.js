/* ui.js — Toast, Confirm Dialog, Hotkeys */

const __UI_INSTALLED = { toast: false, confirm: false, hotkeys: false };

const TOAST_ICONS = {
  success: '✓',
  error:   '✕',
  warning: '!',
  info:    'ⓘ'
};

function ensureToastStack() {
  if (__UI_INSTALLED.toast) return document.querySelector('.toast-stack');
  const stack = document.createElement('div');
  stack.className = 'toast-stack';
  document.body.appendChild(stack);
  __UI_INSTALLED.toast = true;
  return stack;
}

export function showToast({ type = 'info', title = '', msg = '', duration = 4200 } = {}) {
  const stack = ensureToastStack();
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon" aria-hidden="true">${TOAST_ICONS[type] ?? 'ⓘ'}</span>
    <div class="toast-content">
      ${title ? `<strong>${title}</strong>` : ''}
      ${msg ? `<p>${msg}</p>` : ''}
    </div>
    <button type="button" class="toast-close" aria-label="Fechar">&times;</button>
  `;
  stack.appendChild(toast);

  const close = (animate = true) => {
    if (!toast.isConnected) return;
    if (animate) {
      toast.classList.add('leaving');
      setTimeout(() => toast.remove(), 250);
    } else {
      toast.remove();
    }
  };

  toast.querySelector('.toast-close').addEventListener('click', () => close(true));
  if (duration > 0) {
    setTimeout(() => close(true), duration);
  }
  return { close };
}

/* Confirm dialog Promise-based */
export function confirmDialog({
  title = 'Confirmar ação',
  message = 'Tem certeza que deseja continuar?',
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  tone = 'confirm',
  confirmTone = ''
} = {}) {
  ensureToastStack();
  return new Promise((resolve) => {
    const icons = {
      danger:  { icon: '!', cls: 'danger' },
      confirm: { icon: '?', cls: 'confirm' },
      info:    { icon: 'ⓘ', cls: 'info' }
    };
    const ic = icons[tone] ?? icons.confirm;
    const confirmBtnCls = confirmTone === 'danger'
      ? 'btn-danger'
      : confirmTone === 'secondary'
      ? 'btn-secondary'
      : 'btn-primary';

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="__cd_title">
        <div class="modal-head">
          <div class="modal-icon ${ic.cls}">${ic.icon}</div>
          <div>
            <h3 id="__cd_title" class="modal-title">${title}</h3>
            ${message ? `<p class="modal-text">${message}</p>` : ''}
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-action="cancel">${cancelLabel}</button>
          <button type="button" class="btn ${confirmBtnCls}" data-action="confirm">${confirmLabel}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    let resolved = false;
    const finish = (val) => {
      if (resolved) return;
      resolved = true;
      const modal = overlay.querySelector('.modal');
      if (modal) {
        modal.style.animation = 'modalIn 0.2s var(--ease, ease) reverse both';
      }
      overlay.style.animation = 'fadeIn 0.18s var(--ease, ease) reverse both';
      setTimeout(() => overlay.remove(), 240);
      resolve(val);
    };

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) finish(false);
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      finish(btn.dataset.action === 'confirm');
    });

    const keyHandler = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        finish(false);
        window.removeEventListener('keydown', keyHandler);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        finish(true);
        window.removeEventListener('keydown', keyHandler);
      }
    };
    setTimeout(() => window.addEventListener('keydown', keyHandler), 0);
  });
}

/* Command Palette */
const PALETTE_DEFAULTS = [
  { id: 'dashboard', title: 'Dashboard',        icon: '🏠', hotkey: 'D', href: 'index.html' },
  { id: 'trips',     title: 'Listar viagens',   icon: '✈️', hotkey: 'V', href: 'viagens.html' },
  { id: 'new-trip',  title: 'Nova viagem',      icon: '➕', hotkey: 'N', href: 'trip-new.html' },
  { id: 'profile',   title: 'Meu perfil',       icon: '👤', hotkey: 'P', href: 'profile.html' },
  { id: 'sector',    title: 'Painel do setor',  icon: '👥', hotkey: 'S', href: 'setor.html' },
  { id: 'config',    title: 'Configurações',    icon: '⚙️', hotkey: 'C', href: 'settings.html' },
  { id: 'help',      title: 'Atalhos (?)',      icon: '⌨️', hotkey: '?', action: 'hotkeys-help' }
];

function ensurePaletteMarkup() {
  if (__UI_INSTALLED.palette) return document.querySelector('.cp-overlay');
  const ov = document.createElement('div');
  ov.className = 'cp-overlay hidden';
  ov.setAttribute('aria-hidden', 'true');
  ov.innerHTML = `
    <div class="cp-box" role="dialog" aria-modal="true" aria-labelledby="__cp_title">
      <div class="cp-input-wrap">
        <label id="__cp_title" class="hidden">Busca rápida</label>
        <span class="search-icon">🔍</span>
        <input type="text" class="cp-input" placeholder="Busque uma ação, página ou comando..." autocomplete="off" spellcheck="false" />
        <button type="button" class="cp-close" aria-label="Fechar">ESC</button>
      </div>
      <div class="cp-list">
        <div class="cp-section-label">⌨️ Sugestões rápidas</div>
      </div>
      <div class="cp-empty hidden">
        <p class="empty-title">Nenhum resultado</p>
        <p class="empty-sub">Tente outra palavra-chave.</p>
      </div>
    </div>
  `;
  document.body.appendChild(ov);
  __UI_INSTALLED.palette = true;
  return ov;
}

function renderItems(container, items, activeIndex, onPick) {
  const sectionLabel = container.querySelector('.cp-section-label')?.outerHTML || '';
  container.innerHTML = sectionLabel;
  if (!items.length) return;
  items.forEach((it, idx) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `cp-item ${idx === activeIndex ? 'active' : ''}`;
    el.innerHTML = `
      <span class="cp-icon">${it.icon ?? '•'}</span>
      <span>
        <span class="cp-title">${it.title}</span>
        ${it.subtitle ? `<div class="cp-sub">${it.subtitle}</div>` : ''}
      </span>
      ${it.hotkey ? `<kbd class="kbd">${it.hotkey}</kbd>` : ''}
    `;
    el.addEventListener('click', () => onPick(it, idx));
    el.addEventListener('mouseenter', () => {
      container.querySelectorAll('.cp-item').forEach((i) => i.classList.remove('active'));
      el.classList.add('active');
    });
    container.appendChild(el);
  });
}

export function openCommandPalette(extraItems = []) {
  const overlay = ensurePaletteMarkup();
  const input = overlay.querySelector('.cp-input');
  const resultsEl = overlay.querySelector('.cp-list');
  const emptyEl = overlay.querySelector('.cp-empty');

  const items = [...PALETTE_DEFAULTS, ...extraItems];
  let state = { list: [...items], active: 0 };
  const refresh = () => {
    renderItems(resultsEl, state.list, state.active, pick);
    emptyEl.classList.toggle('hidden', state.list.length > 0);
  };
  const pick = (it) => {
    close();
    if (typeof it.onPick === 'function') it.onPick();
    else if (it.action === 'hotkeys-help') {
      showHotkeysHelp();
    } else if (it.href) {
      if (!it.href.includes('.html') && !it.href.startsWith('http')) {
        window.location.hash = it.href;
      } else {
        window.location.href = it.href;
      }
    }
  };
  refresh();

  const onInput = () => {
    const q = input.value.trim().toLowerCase();
    if (!q) state.list = [...items];
    else state.list = items.filter(it =>
      (it.title + ' ' + (it.subtitle ?? '') + ' ' + (it.hotkey ?? '')).toLowerCase().includes(q)
    );
    state.active = 0;
    refresh();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowDown') {
      e.preventDefault();
      state.active = (state.active + 1) % Math.max(1, state.list.length);
      refresh();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      state.active = (state.active - 1 + state.list.length) % Math.max(1, state.list.length);
      refresh();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (state.list[state.active]) pick(state.list[state.active], state.active);
    }
  };

  const close = () => {
    overlay.classList.add('hidden');
    overlay.setAttribute('aria-hidden', 'true');
    input.removeEventListener('input', onInput);
    window.removeEventListener('keydown', onKey, true);
    input.value = '';
  };
  const closeOnBackdrop = (e) => { if (e.target === overlay) close(); };
  const closeBtn = overlay.querySelector('.cp-close');
  if (closeBtn) closeBtn.addEventListener('click', close);

  overlay.classList.remove('hidden');
  overlay.setAttribute('aria-hidden', 'false');
  input.addEventListener('input', onInput);
  window.addEventListener('keydown', onKey, true);
  overlay.addEventListener('mousedown', closeOnBackdrop);
  setTimeout(() => input.focus(), 20);
}

export function closeCommandPalette() {
  const ov = document.querySelector('.cp-overlay');
  if (ov && !ov.classList.contains('hidden')) {
    ov.classList.add('hidden');
    ov.setAttribute('aria-hidden', 'true');
    const input = ov.querySelector('.cp-input');
    if (input) input.value = '';
  }
}

/* Hotkeys help */
const DEFAULT_HOTKEYS = [
  { key: 'Ctrl / ⌘ + N', desc: 'Criar nova viagem' },
  { key: 'Ctrl / ⌘ + D', desc: 'Ir para o Dashboard' },
  { key: 'Ctrl / ⌘ + V', desc: 'Ir para listagem de viagens' },
  { key: 'Ctrl / ⌘ + P', desc: 'Abrir meu perfil' },
  { key: 'Ctrl / ⌘ + / ?', desc: 'Ver atalhos disponíveis' },
  { key: 'Tema',          desc: 'Clique no ícone 🌙/☀️ da topbar para alternar' }
];

export function showHotkeysHelp(list = DEFAULT_HOTKEYS) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const rows = list.map(i => `
    <div class="settings-row">
      <div>
        <div style="font-weight:800;">${i.key}</div>
        <div style="font-size:0.85rem;color:var(--muted);">${i.desc}</div>
      </div>
    </div>
  `).join('');
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" style="width:min(560px,100%);">
      <div class="modal-head">
        <div class="modal-icon info">⌨️</div>
        <div>
          <h3 class="modal-title">Atalhos de teclado</h3>
        </div>
      </div>
      <div class="modal-body" style="text-align:left;">${rows}</div>
      <div class="modal-footer">
        <button type="button" class="btn btn-primary" data-action="ok">Entendi</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const close = () => {
    const modal = overlay.querySelector('.modal');
    if (modal) modal.style.animation = 'modalIn 0.2s var(--ease, ease) reverse both';
    overlay.style.animation = 'fadeIn 0.18s var(--ease, ease) reverse both';
    setTimeout(() => overlay.remove(), 240);
  };
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
    if (e.target.closest('[data-action="ok"]')) close();
  });
  const esc = (e) => { if (e.key === 'Escape') { close(); window.removeEventListener('keydown', esc); } };
  window.addEventListener('keydown', esc);
}

/* Register global hotkeys */
export function registerHotkeys() {
  if (__UI_INSTALLED.hotkeys) return;
  __UI_INSTALLED.hotkeys = true;

  const nav = (href) => {
    if (!href) return;
    if (window.location.pathname.includes(href)) showToast({ type: 'info', title: 'Já aqui', msg: 'Você já está nesta página.' });
    else window.location.href = href;
  };

  window.addEventListener('keydown', (e) => {
    const isMod = e.ctrlKey || e.metaKey;

    if (!isMod && e.key === '?') {
      if (e.target && ['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) return;
      e.preventDefault(); showHotkeysHelp(); return;
    }
    if (isMod) {
      switch (e.key.toLowerCase()) {
        case 'n': e.preventDefault(); nav('trip-new.html'); break;
        case 'd': e.preventDefault(); nav('index.html'); break;
        case 'v': e.preventDefault(); nav('viagens.html'); break;
        case 'p': e.preventDefault(); nav('profile.html'); break;
      }
    }
  }, true);
}

/* Small helpers */
export function emptyStateSVG(type = 'folder') {
  const paths = {
    folder: `<svg viewBox="0 0 140 140" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="fg1" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#818cf8" stop-opacity="0.18"/>
      <stop offset="1" stop-color="#ec4899" stop-opacity="0.12"/>
    </linearGradient>
    <linearGradient id="fg2" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stop-color="#6366f1"/>
      <stop offset="1" stop-color="#06b6d4"/>
    </linearGradient>
    <linearGradient id="fg3" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="#c7d2fe"/>
      <stop offset="1" stop-color="#e0e7ff"/>
    </linearGradient>
  </defs>
  <circle cx="70" cy="62" r="52" fill="url(#fg1)"/>
  <g transform="translate(20 32)">
    <rect x="0" y="6" width="100" height="72" rx="12" fill="url(#fg3)" stroke="#a5b4fc" stroke-width="2"/>
    <path d="M0 38h100v34a12 12 0 0 1-12 12H12A12 12 0 0 1 0 72V38z" fill="#e0e7ff"/>
    <path d="M2 14h28l7 12h57a5 5 0 0 1 5 5v7H2V14z" fill="url(#fg2)" opacity=".92"/>
    <path d="M2 14h28l7 12h57a5 5 0 0 1 5 5v7H2V14z" fill="white" opacity=".12"/>
    <circle cx="76" cy="56" r="7" fill="#6366f1" opacity=".9"/>
    <circle cx="76" cy="56" r="3" fill="white"/>
    <path d="M55 46h13l-14 17-7-7-7 7-9-9h14v-2z" fill="#10b981" opacity=".85"/>
  </g>
  <circle cx="30" cy="30" r="4" fill="#ec4899" opacity=".55"/>
  <circle cx="110" cy="96" r="5" fill="#06b6d4" opacity=".55"/>
  <circle cx="108" cy="24" r="3" fill="#f59e0b" opacity=".6"/>
</svg>`,
    airplane: `<svg viewBox="0 0 140 140" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="ag1" cx=".5" cy=".4" r=".7">
      <stop offset="0" stop-color="#6366f1" stop-opacity=".35"/>
      <stop offset="1" stop-color="#ec4899" stop-opacity=".05"/>
    </radialGradient>
    <linearGradient id="ag2" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#6366f1"/>
      <stop offset="1" stop-color="#06b6d4"/>
    </linearGradient>
    <linearGradient id="ag3" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stop-color="#ec4899"/>
      <stop offset="1" stop-color="#f59e0b"/>
    </linearGradient>
  </defs>
  <circle cx="70" cy="72" r="56" fill="url(#ag1)"/>
  <g transform="translate(20 30)">
    <path d="M6 64c24-6 50-16 72-36l-10 50-10-12-17 8-12-12-19 7v-5z" fill="url(#ag2)" opacity=".92"/>
    <path d="M6 64L48 30l-8 40L26 60z" fill="#4338ca" opacity=".75"/>
    <path d="M38 30c12-6 28-12 44-18-2 10-8 22-18 34-10-4-18-10-26-16z" fill="url(#ag3)" opacity=".85"/>
    <circle cx="38" cy="30" r="3" fill="white"/>
    <path d="M56 42l14-6-4 12z" fill="white" opacity=".22"/>
  </g>
  <circle cx="22" cy="22" r="4" fill="#ec4899" opacity=".55"/>
  <circle cx="118" cy="34" r="5" fill="#06b6d4" opacity=".5"/>
  <circle cx="26" cy="116" r="3.5" fill="#f59e0b" opacity=".6"/>
  <circle cx="112" cy="110" r="3" fill="#10b981" opacity=".55"/>
</svg>`,
    search: `<svg viewBox="0 0 140 140" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="sg1" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#818cf8" stop-opacity=".2"/>
      <stop offset="1" stop-color="#06b6d4" stop-opacity=".14"/>
    </linearGradient>
    <linearGradient id="sg2" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#6366f1"/>
      <stop offset="1" stop-color="#06b6d4"/>
    </linearGradient>
  </defs>
  <circle cx="68" cy="64" r="54" fill="url(#sg1)"/>
  <g transform="translate(22 18)">
    <circle cx="36" cy="36" r="34" stroke="url(#sg2)" stroke-width="5" fill="#eef2ff"/>
    <circle cx="36" cy="36" r="34" fill="white" opacity=".35"/>
    <circle cx="36" cy="36" r="12" fill="#c7d2fe"/>
    <circle cx="36" cy="36" r="5" fill="url(#sg2)"/>
    <path d="M62 62l28 28" stroke="url(#sg2)" stroke-width="7" stroke-linecap="round"/>
    <path d="M62 62l28 28" stroke="white" stroke-width="2" stroke-linecap="round" opacity=".5"/>
  </g>
  <circle cx="30" cy="26" r="4" fill="#ec4899" opacity=".55"/>
  <circle cx="110" cy="42" r="3.5" fill="#f59e0b" opacity=".6"/>
  <circle cx="112" cy="108" r="4" fill="#10b981" opacity=".5"/>
  <circle cx="24" cy="106" r="3" fill="#6366f1" opacity=".55"/>
</svg>`,
    tasks: `<svg viewBox="0 0 140 140" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="tg1" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#818cf8" stop-opacity=".18"/>
      <stop offset="1" stop-color="#10b981" stop-opacity=".12"/>
    </linearGradient>
    <linearGradient id="tg2" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#6366f1"/>
      <stop offset="1" stop-color="#ec4899"/>
    </linearGradient>
  </defs>
  <circle cx="70" cy="70" r="54" fill="url(#tg1)"/>
  <g transform="translate(24 24)">
    <rect x="0" y="10" width="92" height="82" rx="14" fill="white" stroke="#c7d2fe" stroke-width="2"/>
    <rect x="0" y="10" width="92" height="24" rx="14" fill="url(#tg2)" opacity=".92"/>
    <rect x="0" y="14" width="92" height="18" fill="white" opacity=".18"/>
    <circle cx="16" cy="22" r="4" fill="white"/>
    <circle cx="26" cy="22" r="4" fill="white" opacity=".8"/>
    <circle cx="36" cy="22" r="4" fill="white" opacity=".6"/>
    <g transform="translate(10 48)">
      <rect width="18" height="18" rx="5" fill="#dcfce7" stroke="#86efac" stroke-width="1.5"/>
      <path d="M4 9l3 3 7-7" stroke="#10b981" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
      <rect x="26" y="2" width="46" height="8" rx="4" fill="#e0e7ff"/>
    </g>
    <g transform="translate(10 74)">
      <rect width="18" height="18" rx="5" fill="#dbeafe" stroke="#93c5fd" stroke-width="1.5"/>
      <path d="M4 9l3 3 7-7" stroke="#3b82f6" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" opacity=".85"/>
      <rect x="26" y="2" width="38" height="8" rx="4" fill="#e0e7ff"/>
    </g>
  </g>
  <circle cx="26" cy="22" r="3.5" fill="#ec4899" opacity=".55"/>
  <circle cx="114" cy="108" r="4" fill="#06b6d4" opacity=".55"/>
</svg>`,
    trips: `<svg viewBox="0 0 140 140" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="vg1" cx=".5" cy=".45" r=".7">
      <stop offset="0" stop-color="#06b6d4" stop-opacity=".3"/>
      <stop offset="1" stop-color="#6366f1" stop-opacity=".08"/>
    </radialGradient>
    <linearGradient id="vg2" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#f59e0b"/>
      <stop offset="1" stop-color="#ef4444"/>
    </linearGradient>
  </defs>
  <circle cx="70" cy="72" r="56" fill="url(#vg1)"/>
  <circle cx="70" cy="72" r="44" stroke="#818cf8" stroke-width="2" fill="none" opacity=".4" stroke-dasharray="4 6"/>
  <g transform="translate(26 26)">
    <circle cx="44" cy="44" r="40" fill="#eef2ff" stroke="#a5b4fc" stroke-width="2"/>
    <path d="M44 4a40 40 0 0 1 28.3 68.3l-8.5-8.5A28 28 0 0 0 44 16V4z" fill="url(#vg2)" opacity=".22"/>
    <g fill="#6366f1">
      <circle cx="28" cy="56" r="3.5"/>
      <circle cx="60" cy="32" r="3.5"/>
      <circle cx="52" cy="62" r="3"/>
      <circle cx="36" cy="26" r="3"/>
    </g>
    <path d="M26 58l14-14 22 14" stroke="#10b981" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    <circle cx="26" cy="58" r="4.5" fill="#10b981"/>
    <circle cx="62" cy="58" r="4.5" fill="#ef4444"/>
    <path d="M40 40l4-14 4 14 14 4-14 4-4 14-4-14-14-4z" fill="url(#vg2)" opacity=".9"/>
  </g>
  <circle cx="24" cy="26" r="4" fill="#ec4899" opacity=".55"/>
  <circle cx="116" cy="30" r="3.5" fill="#f59e0b" opacity=".6"/>
  <circle cx="118" cy="112" r="3" fill="#10b981" opacity=".55"/>
</svg>`,
    success: `<svg viewBox="0 0 140 140" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="scg1" cx=".5" cy=".4" r=".7">
      <stop offset="0" stop-color="#10b981" stop-opacity=".4"/>
      <stop offset="1" stop-color="#06b6d4" stop-opacity=".06"/>
    </radialGradient>
    <linearGradient id="scg2" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#10b981"/>
      <stop offset="1" stop-color="#06b6d4"/>
    </linearGradient>
  </defs>
  <circle cx="70" cy="70" r="56" fill="url(#scg1)"/>
  <circle cx="70" cy="70" r="40" fill="white" stroke="#86efac" stroke-width="2.5"/>
  <path d="M52 70l12 12 24-28" stroke="url(#scg2)" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  <circle cx="30" cy="32" r="3.5" fill="#ec4899" opacity=".5"/>
  <circle cx="108" cy="30" r="4" fill="#f59e0b" opacity=".55"/>
  <circle cx="112" cy="108" r="3" fill="#6366f1" opacity=".5"/>
  <circle cx="26" cy="108" r="4" fill="#06b6d4" opacity=".5"/>
</svg>`
  };
  return paths[type] ?? paths.folder;
}

export function formatCurrencyBR(value) {
  if (value == null || isNaN(value)) return 'R$ 0,00';
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function copyToClipboard(text) {
  if (!text) return Promise.reject('Texto vazio');
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text);
  }
  return new Promise((resolve, reject) => {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      resolve();
    } catch (e) {
      reject(e);
    }
  });
}

export function debounce(fn, wait = 300) {
  let t;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}

export function highlightElement(el, duration = 1800) {
  if (!el) return;
  el.classList.add('highlight-row');
  setTimeout(() => el.classList.remove('highlight-row'), duration);
}

/**
 * Resolve a target (selector string, single element or list) into an array of elements.
 */
function resolveTargets(target) {
  if (!target) return [];
  if (typeof target === 'string') return Array.from(document.querySelectorAll(target));
  if (target instanceof Element) return [target];
  if (target instanceof NodeList || Array.isArray(target)) return Array.from(target);
  return [];
}

/**
 * Destaca as bordas de um ou mais elementos, útil para melhorar a visibilidade
 * no tema claro ou para chamar atenção a um elemento específico (erro, foco, etc).
 *
 * @param {string|Element|NodeList|Element[]} target - Seletor CSS, elemento único ou lista de elementos.
 * @param {Object} [options]
 * @param {string} [options.color] - Cor da borda (aceita variáveis CSS, ex: 'var(--danger)').
 * @param {number} [options.duration] - Duração em ms antes de remover automaticamente. 0 = permanente até chamada manual.
 * @param {string} [options.width] - Espessura da borda (ex: '2px').
 * @returns {Element[]} Os elementos afetados.
 */
export function emphasizeBorders(target, options = {}) {
  const { color, duration = 0, width } = options;
  const elements = resolveTargets(target);

  elements.forEach((el) => {
    el.classList.add('border-emphasis');
    if (color) el.style.setProperty('--border-emphasis-color', color);
    if (width) el.style.setProperty('--border-emphasis-width', width);
  });

  if (duration > 0) {
    setTimeout(() => clearBorderEmphasis(elements), duration);
  }

  return elements;
}

/**
 * Remove o destaque de borda aplicado por emphasizeBorders.
 * @param {string|Element|NodeList|Element[]} target - Seletor CSS, elemento único ou lista de elementos.
 */
export function clearBorderEmphasis(target) {
  const elements = resolveTargets(target);
  elements.forEach((el) => {
    el.classList.remove('border-emphasis');
    el.style.removeProperty('--border-emphasis-color');
    el.style.removeProperty('--border-emphasis-width');
  });
}
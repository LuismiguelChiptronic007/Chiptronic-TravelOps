/**
 * Cliente HTTP da API Chiptronic TravelOps
 */
const TOKEN_KEY = 'cto_token';
const USER_KEY = 'cto_user';

// Allow overriding the API base via `window.__API_BASE` for deploy flexibility.
// Use the deployed worker API as fallback for local file/localhost pages.
const DEPLOYED_API_BASE = 'https://chiptronic-travelops.luismiguelgomesoliveira-014.workers.dev/api';
const API_BASE = (() => {
  if (typeof window === 'undefined') return '/api';
  if (window.__API_BASE) return window.__API_BASE;
  if (location.protocol === 'file:' || location.origin === 'null') {
    return DEPLOYED_API_BASE;
  }
  if (location.origin.includes('localhost') || location.origin.includes('127.0.0.1')) {
    if (location.port === '8787' || location.port === '8788' || location.port === '') {
      return `${location.origin}/api`;
    }
    return DEPLOYED_API_BASE;
  }
  return `${location.origin}/api`;
})();

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
  } catch {
    return null;
  }
}

export function updateStoredUser(user) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

async function request(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const token = getToken();

  if (token) headers.set('Authorization', `Bearer ${token}`);

  if (options.json !== undefined) {
    headers.set('Content-Type', 'application/json');
    options.body = JSON.stringify(options.json);
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  let data = null;
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    data = await res.json();
  }

  if (res.status === 401 && !path.startsWith('/auth/login') && !path.startsWith('/auth/register')) {
    clearSession();
    if (!window.location.pathname.endsWith('login.html') && !window.location.pathname.endsWith('register.html')) {
      window.location.href = 'login.html';
    }
  }

  if (!res.ok) {
    const msg = data?.error || `Erro ${res.status}`;
    const error = new Error(msg);
    error.status = res.status;
    error.data = data;
    throw error;
  }

  return data;
}

export const api = {
  health: () => request('/health'),
  sectors: () => request('/auth/sectors'),
  positions: () => request('/auth/positions'),
  register: (body) => request('/auth/register', { method: 'POST', json: body }),
  login: (body) => request('/auth/login', { method: 'POST', json: body }),
  me: () => request('/auth/me'),
  forgotPassword: (email) => request('/auth/password/forgot-password', { method: 'POST', json: { email } }),
  resetPassword: (body) => request('/auth/password/reset-password', { method: 'POST', json: body }),

  dashboard: () => request('/trips/dashboard'),
  listTrips: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/trips${qs ? `?${qs}` : ''}`);
  },
  getTrip: (id) => request(`/trips/${id}`),
  createTrip: (body) => request('/trips', { method: 'POST', json: body }),
  updateTrip: (id, body) => request(`/trips/${id}`, { method: 'PUT', json: body }),
  deleteTrip: (id) => request(`/trips/${id}`, { method: 'DELETE' }),
  completeTrip: (id) => request(`/trips/${id}/complete`, { method: 'POST' }),

  usersForMembers: (q = '') => {
    const qs = q ? `?q=${encodeURIComponent(q)}` : '';
    return request(`/trips/users-for-members${qs}`);
  },

  workTypes: (opts = {}) => {
    const qs = [];
    if (opts.sector) qs.push(`sector=${encodeURIComponent(opts.sector)}`);
    if (opts.trip_id) qs.push(`trip_id=${encodeURIComponent(opts.trip_id)}`);
    return request(`/trips/work-types${qs.length ? `?${qs.join('&')}` : ''}`);
  },
  projects: (opts = {}) => {
    const qs = [];
    if (opts.sector) qs.push(`sector=${encodeURIComponent(opts.sector)}`);
    if (opts.trip_id) qs.push(`trip_id=${encodeURIComponent(opts.trip_id)}`);
    return request(`/trips/projects${qs.length ? `?${qs.join('&')}` : ''}`);
  },

  leaderProjects: {
    list: () => request('/configuracoes/lider/projetos'),
    create: (name) => request('/configuracoes/lider/projetos', { method: 'POST', json: { name } }),
    remove: (id) => request(`/configuracoes/lider/projetos/${id}`, { method: 'DELETE' }),
    fields: {
      list: (id) => request(`/configuracoes/lider/projetos/${id}/campos`),
      add: (id, field) => request(`/configuracoes/lider/projetos/${id}/campos`, { method: 'POST', json: field }),
      remove: (id, fieldName) => request(`/configuracoes/lider/projetos/${id}/campos/${encodeURIComponent(fieldName)}`, { method: 'DELETE' }),
    },
  },

  leaderWorkTypes: {
    list: () => request('/configuracoes/lider/tipos-trabalho'),
    create: (name) => request('/configuracoes/lider/tipos-trabalho', { method: 'POST', json: { name } }),
    remove: (id) => request(`/configuracoes/lider/tipos-trabalho/${id}`, { method: 'DELETE' }),
    fields: {
      list: (name) => request(`/configuracoes/lider/tipos-trabalho/${encodeURIComponent(name)}/campos`),
      add: (name, field) => request(`/configuracoes/lider/tipos-trabalho/${encodeURIComponent(name)}/campos`, { method: 'POST', json: field }),
      remove: (name, fieldName) => request(`/configuracoes/lider/tipos-trabalho/${encodeURIComponent(name)}/campos/${encodeURIComponent(fieldName)}`, { method: 'DELETE' }),
    },
  },

  addTask: async (id, payload) => {
    const fd = new FormData();
    fd.append('work_type', payload.work_type || '');
    fd.append('location', payload.location || '');
    fd.append('start_time', payload.start_time || '');
    fd.append('end_time', payload.end_time || '');
    fd.append('summary', payload.summary || '');
    fd.append('task_date', payload.task_date || '');
    if (Array.isArray(payload.responsible_ids) && payload.responsible_ids.length) {
      payload.responsible_ids.forEach((id) => fd.append('responsible_ids', String(id)));
    } else if (payload.responsible_id) {
      fd.append('responsible_ids', String(payload.responsible_id));
    }
    fd.append('responsible_id', payload.responsible_id || '');
    fd.append('pending_items', payload.pending_items || '');
    fd.append('vehicle', payload.vehicle || '');
    fd.append('plate', payload.plate || '');
    fd.append('montadora', payload.montadora || '');
    fd.append('modelo', payload.modelo || '');
    fd.append('submodelo', payload.submodelo || '');
    fd.append('project_id', payload.project_id || '');
    if (payload.custom_fields) {
      for (const [name, value] of Object.entries(payload.custom_fields)) {
        fd.append(`custom_${name}`, value || '');
      }
    }
    for (const file of payload.photos || []) {
      fd.append('photos', file);
    }
    const token = getToken();
    const res = await fetch(`${API_BASE}/trips/${id}/tasks`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Falha ao salvar tarefa');
    return data;
  },
  deleteTask: (id, taskId) =>
    request(`/trips/${id}/tasks/${taskId}`, { method: 'DELETE' }),

  getTask: (id, taskId) => request(`/trips/${id}/tasks/${taskId}`),

  updateTask: async (id, taskId, payload) => {
    const fd = new FormData();
    fd.append('work_type', payload.work_type || '');
    fd.append('location', payload.location || '');
    fd.append('start_time', payload.start_time || '');
    fd.append('end_time', payload.end_time || '');
    fd.append('summary', payload.summary || '');
    fd.append('task_date', payload.task_date || '');
    if (Array.isArray(payload.responsible_ids) && payload.responsible_ids.length) {
      payload.responsible_ids.forEach((rid) => fd.append('responsible_ids', String(rid)));
    } else if (payload.responsible_id) {
      fd.append('responsible_ids', String(payload.responsible_id));
    }
    fd.append('responsible_id', payload.responsible_id || '');
    fd.append('pending_items', payload.pending_items || '');
    fd.append('vehicle', payload.vehicle || '');
    fd.append('plate', payload.plate || '');
    fd.append('montadora', payload.montadora || '');
    fd.append('modelo', payload.modelo || '');
    fd.append('submodelo', payload.submodelo || '');
    fd.append('project_id', payload.project_id || '');
    if (payload.custom_fields) {
      for (const [name, value] of Object.entries(payload.custom_fields)) {
        fd.append(`custom_${name}`, value || '');
      }
    }
    for (const file of payload.photos || []) {
      fd.append('photos', file);
    }
    const token = getToken();
    const res = await fetch(
      `${API_BASE}/trips/${id}/tasks/${taskId}`,
      {
        method: 'PUT',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      }
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Falha ao atualizar tarefa');
    return data;
  },

  profile: () => request('/profile'),
  updateProfile: (body) => request('/profile', { method: 'PUT', json: body }),
  uploadAvatar: async (file) => {
    const fd = new FormData();
    fd.append('avatar', file);
    const token = getToken();
    const res = await fetch(`${API_BASE}/profile/avatar`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Falha no avatar');
    return data;
  },

  listNotifications: () => request('/notifications'),
  notificationUnreadCount: () => request('/notifications/unread-count'),
  markNotificationRead: (id) => request(`/notifications/${id}/read`, { method: 'POST' }),
  markAllNotificationsRead: () => request('/notifications/read-all', { method: 'POST' }),
  lunchConfig: () => request('/configuracoes/almoco'),
  saveLunchConfig: (config) =>
    request('/configuracoes/almoco', {
      method: 'POST',
      json: {
        janelaAlmocoInicio: config?.janelaAlmocoInicio ?? config?.inicio ?? '11:00',
        janelaAlmocoFim: config?.janelaAlmocoFim ?? config?.fim ?? '14:00',
      },
    }),

  sectorTeam: (sector = '') => {
    const qs = sector ? `?sector=${encodeURIComponent(sector)}` : '';
    return request(`/sector/team${qs}`);
  },
  sectorDashboard: () => request('/sector/dashboard'),
  sectorAccess: () => request('/sector/access'),
};

export function requireAuthPage() {
  if (!getToken()) {
    window.location.href = 'login.html';
    return false;
  }
  return true;
}

export function redirectIfAuth() {
  if (getToken()) {
    window.location.href = 'index.html';
    return true;
  }
  return false;
}

export function initials(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('') || '?';
}

export function formatDateBR(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

export function formatMoney(v) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatSectorName(name) {
  if (!name) return '';
  const s = String(name).trim();
  if (!s) return s;
  if (s === s.toUpperCase() && s.length <= 25) {
    const special = {
      'T.I INTERNO': 'T.I Interno',
      'TI INTERNO': 'T.I Interno',
      'T.I TELEMETRIA': 'T.I Telemetria',
      'TI TELEMETRIA': 'T.I Telemetria',
    };
    if (special[s]) return special[s];
    return s
      .toLowerCase()
      .replace(/(^|\s)\S/g, (m) => m.toUpperCase());
  }
  return s;
}

export function statusBadge(trip) {
  const cls = `badge badge-${trip.status}`;
  let html = `<span class="${cls}">${trip.status_label || trip.status}</span>`;
  if (trip.is_overdue) {
    html += `<span class="badge badge-overdue">Atrasado</span>`;
  }
  return html;
}

export function showAlert(el, message, type = 'error') {
  if (!el) return;
  el.className = `alert alert-${type}`;
  el.textContent = message;
  el.classList.remove('hidden');
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function hideAlert(el) {
  if (!el) return;
  el.classList.add('hidden');
  el.textContent = '';
}

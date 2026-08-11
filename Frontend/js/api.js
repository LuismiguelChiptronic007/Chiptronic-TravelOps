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
    if (!location.pathname.endsWith('login.html') && !location.pathname.endsWith('register.html')) {
      location.href = 'login.html';
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
  completeTrip: (id) => request(`/trips/${id}/complete`, { method: 'POST' }),

  usersForMembers: (q = '') => {
    const qs = q ? `?q=${encodeURIComponent(q)}` : '';
    return request(`/trips/users-for-members${qs}`);
  },

  workTypes: () => request('/trips/work-types'),

  addTask: async (id, payload) => {
    const fd = new FormData();
    fd.append('work_type', payload.work_type || '');
    fd.append('location', payload.location || '');
    fd.append('start_time', payload.start_time || '');
    fd.append('end_time', payload.end_time || '');
    fd.append('summary', payload.summary || '');
    fd.append('task_date', payload.task_date || '');
    fd.append('pending_items', payload.pending_items || '');
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

  sectorTeam: (sector = '') => {
    const qs = sector ? `?sector=${encodeURIComponent(sector)}` : '';
    return request(`/sector/team${qs}`);
  },
  sectorDashboard: () => request('/sector/dashboard'),
  sectorAccess: () => request('/sector/access'),
};

export function requireAuthPage() {
  if (!getToken()) {
    location.href = 'login.html';
    return false;
  }
  return true;
}

export function redirectIfAuth() {
  if (getToken()) {
    location.href = 'index.html';
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
}

export function hideAlert(el) {
  if (!el) return;
  el.classList.add('hidden');
  el.textContent = '';
}

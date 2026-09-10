import { api, getStoredUser } from './api.js';

const CONSENT_PREFIX = 'cto_loc_consent_';
const MONITOR_KEY = 'cto_loc_monitor';
const LAST_CHECKIN_PREFIX = 'cto_last_checkin_';

let activeMonitors = new Map();
const watchIds = new Map();

function storageGet(key, fallback = null) {
  try {
    const v = localStorage.getItem(key);
    if (v === null) return fallback;
    return JSON.parse(v);
  } catch {
    return fallback;
  }
}

function storageSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

function storageRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch {}
}

export function getLocationConsent(tripId) {
  if (!tripId) return false;
  const val = storageGet(`${CONSENT_PREFIX}${tripId}`, null);
  if (val === null) return null;
  return Boolean(val);
}

export function setLocationConsent(tripId, enabled) {
  if (!tripId) return;
  if (enabled) {
    storageSet(`${CONSENT_PREFIX}${tripId}`, {
      enabled: true,
      granted_at: new Date().toISOString(),
    });
  } else {
    storageSet(`${CONSENT_PREFIX}${tripId}`, {
      enabled: false,
      revoked_at: new Date().toISOString(),
    });
  }
}

export function clearLocationConsent(tripId) {
  if (!tripId) return;
  storageRemove(`${CONSENT_PREFIX}${tripId}`);
  storageRemove(`${LAST_CHECKIN_PREFIX}${tripId}`);
}

function lastCheckinInfo(tripId) {
  return storageGet(`${LAST_CHECKIN_PREFIX}${tripId}`, null);
}

function setLastCheckinInfo(tripId, info) {
  storageSet(`${LAST_CHECKIN_PREFIX}${tripId}`, info);
}

function requestGeolocation(options = {}) {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Navegador não suporta geolocalização.'));
      return;
    }
    const timeoutId = setTimeout(() => {
      reject(new Error('Timeout ao obter localização.'));
    }, options.timeout || 10000);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timeoutId);
        resolve({
          latitude: Number(pos.coords.latitude),
          longitude: Number(pos.coords.longitude),
          accuracy: Number(pos.coords.accuracy),
          timestamp: pos.timestamp,
        });
      },
      (err) => {
        clearTimeout(timeoutId);
        const msg = err?.code === 1
          ? 'Permissão de localização negada. Habilite nas configurações do navegador.'
          : err?.code === 2
            ? 'Localização indisponível no momento.'
            : err?.message || 'Erro ao obter localização.';
        reject(new Error(msg));
      },
      {
        enableHighAccuracy: Boolean(options.highAccuracy ?? true),
        maximumAge: options.maximumAge ?? 60_000,
        timeout: options.timeout ?? 10_000,
      }
    );
  });
}

export async function registrarCheckinTrabalho(trabalhoId, { viagemId, silent = false } = {}) {
  if (!trabalhoId) {
    if (!silent) console.warn('[location] trabalho_id ausente para check-in.');
    return { ok: false, skipped: true, reason: 'no_trabalho_id' };
  }

  const tripId = Number(viagemId) || 0;
  if (tripId) {
    const consent = getLocationConsent(tripId);
    if (consent !== true) {
      return { ok: false, skipped: true, reason: consent === false ? 'consent_revoked' : 'no_consent' };
    }
  } else {
    return { ok: false, skipped: true, reason: 'no_viagem_id' };
  }

  try {
    const loc = await requestGeolocation({
      highAccuracy: true,
      timeout: 12000,
      maximumAge: 45_000,
    });

    const res = await api.trabalhoCheckin({
      trabalho_id: Number(trabalhoId),
      viagem_id: tripId || undefined,
      latitude: loc.latitude,
      longitude: loc.longitude,
      accuracy: loc.accuracy,
    });

    if (tripId) {
      setLastCheckinInfo(tripId, {
        at: new Date().toISOString(),
        trabalho_id: Number(trabalhoId),
        latitude: loc.latitude,
        longitude: loc.longitude,
      });
    }

    return { ok: true, checkin_id: res.checkin_id, location: loc, result: res };
  } catch (e) {
    if (!silent) {
      console.warn('[location] check-in falhou:', e?.message || e);
    }
    return { ok: false, error: e?.message || String(e), skipped: false };
  }
}

function findCurrentTrabalhoForUser(trip, userId) {
  if (!trip || !Array.isArray(trip.tasks)) return null;
  const today = new Date().toISOString().slice(0, 10);
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();

  const todays = trip.tasks.filter((t) => String(t.task_date || '').trim() === today);
  if (!todays.length) return null;

  function tm(value) {
    if (!value || !/^\d{2}:\d{2}$/.test(value)) return null;
    const [h, m] = value.split(':').map(Number);
    return h * 60 + m;
  }

  const mine = todays.filter((t) => {
    const ids = Array.isArray(t.responsible_ids) ? t.responsible_ids : [];
    const legacy = Number(t.responsible_id) || 0;
    return ids.includes(Number(userId)) || legacy === Number(userId);
  });

  const pool = mine.length ? mine : todays;

  let current = null;
  for (const t of pool) {
    const s = tm(t.start_time);
    const e = tm(t.end_time);
    if (s !== null && e !== null && nowMin >= s && nowMin <= e) {
      current = t;
      break;
    }
  }
  if (!current && pool.length) current = pool[0];
  return current;
}

export function startTripLocationMonitor(tripId, opts = {}) {
  if (!tripId) return null;
  stopTripLocationMonitor(tripId);

  const intervalMs = Number(opts.intervalMs) || 5 * 60 * 1000;
  const loadTripFn = opts.loadTrip || (() => api.getTrip(tripId).then((r) => r.trip));

  async function tick() {
    const consent = getLocationConsent(tripId);
    if (consent !== true) {
      return;
    }

    let trip;
    try {
      trip = await loadTripFn();
    } catch {
      return;
    }

    if (!trip || trip.status !== 'in_progress') {
      stopTripLocationMonitor(tripId);
      if (opts.onTripEnded) {
        try { opts.onTripEnded(trip); } catch {}
      }
      return;
    }

    const user = getStoredUser();
    const uid = user?.id;
    if (!uid) return;

    const task = findCurrentTrabalhoForUser(trip, uid);
    if (!task) return;

    const last = lastCheckinInfo(tripId);
    const minIntervalMs = Math.max(60_000, Math.min(intervalMs, 5 * 60 * 1000));
    if (last?.at) {
      try {
        const diff = Date.now() - new Date(last.at).getTime();
        if (diff < minIntervalMs && Number(last.trabalho_id) === Number(task.id)) {
          return;
        }
      } catch {}
    }

    await registrarCheckinTrabalho(task.id, { viagemId: tripId, silent: true });
  }

  const handle = {
    intervalMs,
    intervalId: null,
    tripId,
    stopped: false,
    tickNow: () => tick(),
  };

  handle.intervalId = setInterval(() => {
    if (document.visibilityState === 'hidden') return;
    tick().catch(() => {});
  }, intervalMs);

  document.addEventListener('visibilitychange', () => {
    if (handle.stopped) return;
    if (document.visibilityState === 'visible') {
      tick().catch(() => {});
    }
  }, { once: false });

  activeMonitors.set(Number(tripId), handle);

  setTimeout(() => tick().catch(() => {}), 800);
  return handle;
}

export function stopTripLocationMonitor(tripId, { notify = false, alertEl = null, showAlertFn = null } = {}) {
  if (!tripId) return;
  const h = activeMonitors.get(Number(tripId));
  if (h) {
    if (h.intervalId) clearInterval(h.intervalId);
    h.stopped = true;
    activeMonitors.delete(Number(tripId));
  }
  const wid = watchIds.get(Number(tripId));
  if (wid && 'geolocation' in navigator) {
    try { navigator.geolocation.clearWatch(wid); } catch {}
    watchIds.delete(Number(tripId));
  }

  clearLocationConsent(tripId);

  if (notify) {
    const msg = 'Compartilhamento de localização encerrado para esta viagem. Nenhuma nova posição será enviada.';
    if (typeof showAlertFn === 'function' && alertEl) {
      try { showAlertFn(alertEl, msg, 'success'); } catch {}
    } else if (typeof window !== 'undefined' && 'toast' in window) {
      try { window.toast(msg); } catch {}
    } else {
      console.info('[location]', msg);
    }
  }
}

export function isMonitoringActive(tripId) {
  if (!tripId) return false;
  const h = activeMonitors.get(Number(tripId));
  return Boolean(h && !h.stopped);
}

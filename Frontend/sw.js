const CACHE_NAME = 'travelops-shell-v23';
const APP_SHELL = [
  '/',
  '/index.html',
  '/login.html',
  '/viagens.html',
  '/demandas.html',
  '/trip-new.html',
  '/trip.html',
  '/mapa-operacional.html',
  '/js/config.js',
  '/js/api.js',
  '/js/layout.js',
  '/js/theme.js',
  '/js/ui.js',
  '/js/db-offline.js',
  '/js/dashboard.js',
  '/js/login.js',
  '/js/viagens.js',
  '/js/trip-new.js',
  '/js/trip-detail.js',
  '/js/trip-render.js',
  '/js/trip-history.js',
  '/js/trip-task-edit.js',
  '/js/demandas-src.js',
  '/js/demandas.js',
  '/js/demandas-page.js',

  '/js/location.js',
  '/js/mapa-operacional.js',

  '/assets/icone.png',
  '/assets/favicon.svg',
  '/assets/logo-mark.svg',
  '/assets/default-avatar.svg'
];

self.addEventListener('push', (event) => {
  try {
    const data = event.data?.json?.() || event.data?.text?.() || {};
    const title = typeof data === 'string' ? data : (data.title || 'Chiptronic TravelOps');
    const options = {
      body: typeof data === 'string' ? '' : (data.body || data.message || 'Nova notificação.'),
      icon: '/assets/icone.png',
      badge: '/assets/icone.png',
      data: typeof data === 'string' ? {} : (data.data || {}),
      tag: typeof data === 'string' ? 'generic' : (data.tag || 'travelops-notification'),
      renotify: true,
    };
    event.waitUntil(self.registration.showNotification(title, options));
  } catch (err) {
    const title = 'Chiptronic TravelOps';
    const options = {
      body: 'Nova notificação recebida.',
      icon: '/assets/icone.png',
      badge: '/assets/icone.png',
      tag: 'travelops-notification',
    };
    event.waitUntil(self.registration.showNotification(title, options));
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const urlToOpen = event.notification.data?.url || '/index.html';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsList) => {
      for (const client of clientsList) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(urlToOpen);
    })
  );
});

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then(async (cache) => {
    await Promise.all(APP_SHELL.map(async (asset) => {
      try {
        await cache.add(asset);
      } catch {
        // Um asset opcional ausente nao deve impedir a ativacao do app offline.
      }
    }));
  }));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
  )));
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API calls and non-GET requests must always be handled by the network.
  // HTML pages such as login.html still need the offline navigation fallback.
  if (
    event.request.method !== 'GET' ||
    url.pathname.startsWith('/api/') ||
    url.pathname === '/api'
  ) return;

  const acceptsHtml = event.request.headers.get('accept')?.includes('text/html');
  if (event.request.mode === 'navigate' || acceptsHtml) {
    event.respondWith(
      fetch(event.request).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        const cachedPage = await cache.match(event.request);
        return cachedPage || await cache.match('/') || await cache.match('/index.html') || await cache.match('/offline.html');
      })
    );
    return;
  }

  event.respondWith(
    fetch(event.request).then((response) => {
      if (response.ok && new URL(event.request.url).origin === self.location.origin) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      }
      return response;
    }).catch(() => caches.match(event.request).then((cached) => {
      if (cached) return cached;
      if (event.request.mode === 'navigate') return caches.match('/offline.html');
      return Response.error();
    }))
  );
});
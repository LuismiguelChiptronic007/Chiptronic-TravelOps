const CACHE_NAME = 'travelops-shell-v2';
const APP_SHELL = [
  '/index.html',
  '/login.html',
  '/viagens.html',
  '/trip-new.html',
  '/trip.html',
  '/offline.html',
  '/manifest.json',
  '/css/styles.css',
  '/css/components.css',
  '/css/tables.css',
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
  '/assets/icone.png',
  '/assets/favicon.svg',
  '/assets/logo-mark.svg',
  '/assets/default-avatar.svg'
];

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
  if (event.request.method !== 'GET') return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(async () => {
        const cachedPage = await caches.match(event.request);
        return cachedPage || caches.match('/index.html') || caches.match('/offline.html');
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

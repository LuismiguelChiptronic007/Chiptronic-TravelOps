const CACHE_NAME = 'travelops-shell-v1';
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
  '/assets/icone.png',
  '/assets/favicon.svg',
  '/assets/logo-mark.svg',
  '/assets/default-avatar.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
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

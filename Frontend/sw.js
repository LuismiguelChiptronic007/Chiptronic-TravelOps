<<<<<<< HEAD
const CACHE_NAME = 'travelops-shell-v7';
=======
const CACHE_NAME = 'travelops-shell-v5';
>>>>>>> 2d51f852f158caac4c1b360bbbba5710351d4f54
const APP_SHELL = [
  '/',
  '/index.html',
  '/login.html',
  '/viagens.html',
  '/trip-new.html',
  '/trip.html',
<<<<<<< HEAD
  '/mapa-operacional.html',
=======
>>>>>>> 2d51f852f158caac4c1b360bbbba5710351d4f54
  '/offline.html',
  '/manifest.json',
  '/css/styles.css',
  '/css/components.css',
  '/css/tables.css',
<<<<<<< HEAD
  '/vendor/leaflet/leaflet.css',
  '/vendor/leaflet/leaflet.js',
=======
>>>>>>> 2d51f852f158caac4c1b360bbbba5710351d4f54
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
<<<<<<< HEAD
  '/js/location.js',
  '/js/mapa-operacional.js',
=======
>>>>>>> 2d51f852f158caac4c1b360bbbba5710351d4f54
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

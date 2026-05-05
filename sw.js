const CACHE_NAME = 'medmatch-v3';
const APP_SHELL = [
  '/',
  '/index.html',
  '/icons/apple-touch-icon.png',
  '/icons/favicon-96x96.png',
  '/icons/favicon.svg',
  '/icons/web-app-manifest-192x192.png',
  '/icons/web-app-manifest-512x512.png',
  '/icons/site.webmanifest'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Network-first for API calls (Supabase, Cloudflare Worker, Mapbox)
  const url = new URL(event.request.url);
  const isApiCall = url.hostname.includes('supabase') ||
                    url.hostname.includes('workers.dev') ||
                    url.hostname.includes('mapbox');

  if (isApiCall) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  // Network-first for HTML navigation requests so each deploy is visible
  // on the next page load. Without this, cache-first served the precached
  // index.html forever and new deploys were invisible until the SW script
  // itself changed bytes. Falls back to cache (then to /index.html,
  // then a synthesized 503) so offline mode still renders something.
  const isHTML = event.request.mode === 'navigate' ||
                 event.request.destination === 'document' ||
                 url.pathname === '/' ||
                 url.pathname === '/index.html';
  if (isHTML) {
    event.respondWith(
      fetch(event.request).then((response) => {
        if (response && response.status === 200) {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
        }
        return response;
      }).catch(() =>
        caches.match(event.request).then((cached) =>
          cached || caches.match('/index.html').then((fallback) =>
            fallback || new Response('Offline', { status: 503, statusText: 'Service Unavailable' })
          )
        )
      )
    );
    return;
  }

  // Cache-first for app shell
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request).then((response) => {
        return caches.open(CACHE_NAME).then((cache) => {
          if (event.request.method === 'GET' && response.status === 200) {
            cache.put(event.request, response.clone());
          }
          return response;
        });
      });
    }).catch(() => caches.match('/index.html'))
  );
});

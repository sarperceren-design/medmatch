const CACHE_NAME = 'medmatch-v2';
const APP_SHELL = [
  '/medmatch/',
  '/medmatch/index.html',
  '/medmatch/icons/apple-touch-icon.png',
  '/medmatch/icons/favicon-96x96.png',
  '/medmatch/icons/favicon.svg',
  '/medmatch/icons/web-app-manifest-192x192.png',
  '/medmatch/icons/web-app-manifest-512x512.png',
  '/medmatch/icons/site.webmanifest'
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
  // itself changed bytes. Falls back to cache (then to /medmatch/index.html,
  // then a synthesized 503) so offline mode still renders something.
  const isHTML = event.request.mode === 'navigate' ||
                 event.request.destination === 'document' ||
                 url.pathname === '/medmatch/' ||
                 url.pathname === '/medmatch/index.html';
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
          cached || caches.match('/medmatch/index.html').then((fallback) =>
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
    }).catch(() => caches.match('/medmatch/index.html'))
  );
});

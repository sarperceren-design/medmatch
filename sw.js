const CACHE_NAME = 'medmatch-v1';
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

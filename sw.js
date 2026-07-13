/**
 * High Frequency — Service Worker
 * App-shell caching so the feed loads instantly and works offline.
 * Bump CACHE_VERSION whenever you change the shell files below.
 */
const CACHE_VERSION = 'hf-v1';
const SHELL = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './stories.json',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Only manage same-origin requests. Let the live news source (e.g. Google
  // Sheets) go straight to the network so it always fetches fresh rows.
  if (url.origin !== self.location.origin) return;

  // Stale-while-revalidate for the app shell: serve cache instantly,
  // refresh in the background for the next load.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

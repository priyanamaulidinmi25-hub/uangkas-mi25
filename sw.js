const CACHE_NAME = 'kas-mi25-v1';

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(clients.claim());
});

self.addEventListener('fetch', (e) => {
  // Service Worker dasar agar PWA dapat diinstal di Android/iOS
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});

/* Service worker — cache offline Manajemen Uang Ihsaan */
'use strict';

const CACHE_NAME = 'manajemen-uang-ihsaan-v1.0.0';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './assets/css/app.css',
  './assets/js/core.js',
  './assets/js/render-dashboard.js',
  './assets/js/render-pages.js',
  './assets/js/actions.js',
  './assets/js/app.js',
  './assets/vendor/lucide.min.js',
  './assets/vendor/chart.umd.min.js',
  './assets/fonts/plus-jakarta-sans.woff2',
  './assets/fonts/jetbrains-mono.woff2',
  './icons/favicon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (!response || response.status !== 200 || response.type === 'opaque') return response;
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      });
    })
  );
});

/* Service worker — cache offline Manajemen Uang Ihsaan */
'use strict';

const CACHE_NAME = 'manajemen-uang-ihsaan-v1.2.1';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './assets/css/app.css',
  './assets/js/core.js',
  './assets/js/render-dashboard.js',
  './assets/js/render-pages.js',
  './assets/js/actions.js',
  './assets/js/sync.js',
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

// Jaringan dulu, cache sebagai cadangan. Dengan begitu HTML dan JS selalu
// berasal dari versi yang sama; cache-first untuk aset sempat membuat HTML baru
// berjalan dengan JS lama setelah pembaruan.
async function networkFirst(request, { fallbackToShell = false } = {}) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response && response.ok && response.type === 'basic') {
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (fallbackToShell) {
      const shell = await cache.match('./index.html');
      if (shell) return shell;
    }
    throw error;
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // API selalu langsung ke jaringan; jangan pernah di-cache.
  if (url.pathname.includes('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, { fallbackToShell: true }));
    return;
  }

  event.respondWith(networkFirst(request));
});

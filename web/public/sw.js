/* eslint-disable no-restricted-globals */
/**
 * Service Worker — Molido AI PWA
 *
 * راهبرد کش:
 *   • فایل‌های ثابت (app shell) → cache-first
 *   • درخواست‌های API → network-first با fallback به کش (نمایش آخرین داده در حالت آفلاین)
 *   • ناوبری صفحات → network-first با fallback به صفحه آفلاین
 */

const VERSION = 'v1';
const SHELL_CACHE = `molido-shell-${VERSION}`;
const DATA_CACHE = `molido-data-${VERSION}`;

const SHELL_ASSETS = [
  '/',
  '/dashboard',
  '/offline',
  '/manifest.webmanifest',
  '/logo.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) =>
        Promise.allSettled(SHELL_ASSETS.map((url) => cache.add(url))),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE && key !== DATA_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/** آیا این درخواست به API بک‌اند است؟ */
function isApiRequest(url) {
  return (
    /\/(auth|products|customers|sales|restaurant|reports|notifications|inventory|pos-terminals)(\/|$|\?)/.test(
      url.pathname,
    ) || url.port === '3000'
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // ---- API: network-first ----
  if (isApiRequest(url)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(DATA_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() =>
          caches.match(request).then(
            (cached) =>
              cached ??
              new Response(
                JSON.stringify({
                  message: 'آفلاین هستید — داده‌ای در حافظه موجود نیست',
                  offline: true,
                }),
                {
                  status: 503,
                  headers: { 'Content-Type': 'application/json' },
                },
              ),
          ),
        ),
    );
    return;
  }

  // ---- ناوبری صفحات: network-first ----
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() =>
          caches
            .match(request)
            .then((cached) => cached ?? caches.match('/offline')),
        ),
    );
    return;
  }

  // ---- فایل‌های ثابت: cache-first ----
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
  }
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

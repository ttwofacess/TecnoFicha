const VERSION = '1.2.0'; // ⚠️ subir en cada release que cambie archivos
const SHELL_CACHE = `tecnoficha-shell-${VERSION}`;

const PRECACHE = [
  './',
  './index.html',
  './script.js',
  './site.webmanifest',
  './favicon.svg',

  // Íconos
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',

  // Fuentes
  './fonts/dm-sans-latin-400-normal.woff2',
  './fonts/dm-sans-latin-500-normal.woff2',
  './fonts/dm-sans-latin-600-normal.woff2',
  './fonts/dm-mono-latin-400-normal.woff2',
  './fonts/dm-mono-latin-500-normal.woff2',

  // CSS
  './css/main.css',
  './css/pwa.css',
  './css/base/tokens.css',
  './css/base/fonts.css',
  './css/base/reset.css',
  './css/base/layout.css',
  './css/components/topbar.css',
  './css/components/bottom-nav.css',
  './css/components/buttons.css',
  './css/components/forms.css',
  './css/components/repair-card.css',
  './css/components/empty-state.css',
  './css/components/info-block.css',
  './css/components/toast.css',
  './css/pages/list.css',
  './css/pages/form.css',
  './css/pages/detail.css',
  './css/pages/stats.css',
  './css/utilities/scrollbar.css',

  // JS
  './js/state.js',
  './js/utils.js',
  './js/navigation.js',
  './js/pwa.js',
  './js/backup.js',
  './js/backup-ui.js',
  './js/views/list.js',
  './js/views/form.js',
  './js/views/detail.js',
  './js/views/stats.js',
];

// --- Instalación: precachear el app shell ---
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      // cache: 'reload' evita traer copias viejas del caché HTTP (ej. GitHub Pages cachea ~10 min)
      cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' })))
    )
  );
  // NO llamamos skipWaiting() acá: esperamos a que el usuario acepte actualizar.
});

// --- Activación: limpiar cachés viejos ---
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith('tecnoficha-shell-') && k !== SHELL_CACHE)
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

// --- Mensaje desde la página: activar la nueva versión ---
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// --- Fetch ---
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request));
  }
});

async function cacheFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    // Sin red y sin caché: para navegaciones devolvemos la app
    if (request.mode === 'navigate') {
      const fallback = await cache.match('./index.html');
      if (fallback) return fallback;
    }
    throw err;
  }
}

// sw.js
// Service Worker para soporte offline PWA en SoundFlow

const CACHE_NAME = 'soundflow-v1';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './manifest.json',
    './assets/css/styles.css',
    './assets/css/components.css',
    './assets/icons/icon-192.png',
    './assets/icons/icon-512.png',
    './assets/js/db.js',
    './assets/js/player.js',
    './assets/js/playlists.js',
    './assets/js/downloader.js',
    './assets/js/timer.js',
    './assets/js/ui.js',
    './assets/js/app.js',
    'https://cdn.tailwindcss.com',
    'https://unpkg.com/lucide@latest'
];

// Instalación: Pone en caché la interfaz y los scripts base
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[ServiceWorker] Almacenando recursos base en caché...');
            return cache.addAll(ASSETS_TO_CACHE);
        }).then(() => self.skipWaiting())
    );
});

// Activación: Limpia cachés antiguas de versiones anteriores
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    if (cache !== CACHE_NAME) {
                        console.log('[ServiceWorker] Eliminando caché antigua:', cache);
                        return caches.delete(cache);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Intercepción de peticiones: Responder desde caché si está offline
self.addEventListener('fetch', (event) => {
    // Ignorar peticiones a la API de conversión cuando está online
    if (event.request.url.includes('/api/convert')) {
        return;
    }

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                return cachedResponse;
            }
            return fetch(event.request).catch(() => {
                // Si la red falla y no está en caché, retorna index.html como fallback
                if (event.request.mode === 'navigate') {
                    return caches.match('./index.html');
                }
            });
        })
    );
});
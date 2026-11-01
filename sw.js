// App-shell cache for PixelShrink. Same-origin files only; images are never cached here.
const CACHE_NAME = 'pixelshrink-v7';

const PRECACHE = [
    './',
    './index.html',
    './privacy.html',
    './guide.html',
    './404.html',
    './styles.css?v=20261105',
    './script.js?v=20261105',
    './lib.js?v=20261105',
    './register-sw.js?v=20261105',
    './secure.js?v=20261105',
    './manifest.json',
    './favicon.svg',
    './favicon.ico',
    './favicon-32.png',
    './apple-touch-icon.png',
    './icon-192.png',
    './icon-512.png',
    './icon-maskable-512.png'
];

self.addEventListener('install', function (event) {
    event.waitUntil((async function () {
        const cache = await caches.open(CACHE_NAME);
        await cache.addAll(PRECACHE);
        await self.skipWaiting();
    })());
});

self.addEventListener('activate', function (event) {
    event.waitUntil((async function () {
        const keys = await caches.keys();
        await Promise.all(keys.filter(function (key) {
            return key !== CACHE_NAME;
        }).map(function (key) {
            return caches.delete(key);
        }));
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', function (event) {
    const request = event.request;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;

    event.respondWith((async function () {
        try {
            const response = await fetch(request);
            if (response && response.ok) {
                const cache = await caches.open(CACHE_NAME);
                cache.put(request, response.clone()).catch(function () {
                    // A failed cache write should not break the response.
                });
            }
            return response;
        } catch (error) {
            const cached = await caches.match(request);
            if (cached) return cached;

            if (request.mode === 'navigate') {
                const shell = await caches.match('./index.html');
                if (shell) return shell;
            }

            throw error;
        }
    })());
});

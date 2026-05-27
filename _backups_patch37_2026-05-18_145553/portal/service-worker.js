// Portal Equilibrium — Service Worker v2 (cache bustado)
// MUDANÇA v2: cache renomeado, força browsers a baixar tudo de novo

const CACHE = 'portal-v2';
const ASSETS = [
    './',
    './index.html',
    './login.html',
    './trocar_senha.html',
    './portal.html',
    './portal.css',
    './portal_login.js',
    './portal_trocar_senha.js',
    './portal.js',
    './manifest.json',
    './icon-192.png',
    './icon-512.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE).then(cache => cache.addAll(ASSETS))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Nunca cacheia dados Supabase
    if (url.hostname.includes('supabase.co') ||
        url.hostname.includes('supabase.in') ||
        url.pathname.includes('/auth/') ||
        url.pathname.includes('/rest/') ||
        url.pathname.includes('/rpc/')) {
        return;
    }

    // Network-first pra HTML/JS/CSS (sempre tenta versão fresca primeiro)
    // Se rede falhar, cai no cache
    if (url.origin === self.location.origin &&
        (url.pathname.endsWith('.js') || url.pathname.endsWith('.css') ||
         url.pathname.endsWith('.html') || url.pathname.endsWith('/'))) {
        event.respondWith(
            fetch(event.request).then(response => {
                if (response.ok) {
                    const clone = response.clone();
                    caches.open(CACHE).then(c => c.put(event.request, clone));
                }
                return response;
            }).catch(() => caches.match(event.request))
        );
        return;
    }

    // Cache-first pra outros assets (icons, manifest)
    if (url.origin === self.location.origin) {
        event.respondWith(
            caches.match(event.request).then(cached => {
                if (cached) return cached;
                return fetch(event.request).then(response => {
                    if (response.ok) {
                        const clone = response.clone();
                        caches.open(CACHE).then(c => c.put(event.request, clone));
                    }
                    return response;
                });
            })
        );
    }
});

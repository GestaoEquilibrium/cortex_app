// Portal Equilibrium — Service Worker
// Cache simples de assets estáticos. Dados (RPCs Supabase) NUNCA são cacheados.

const CACHE = 'portal-v1';
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

// Instalação: pré-cacheia assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE).then(cache => cache.addAll(ASSETS))
    );
    self.skipWaiting();
});

// Ativação: limpa caches antigos
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

// Fetch: network-first pra dados, cache-first pra assets
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Nunca cacheia chamadas pro Supabase (dados sensíveis e tempo-real)
    if (url.hostname.includes('supabase.co') ||
        url.hostname.includes('supabase.in') ||
        url.pathname.includes('/auth/') ||
        url.pathname.includes('/rest/') ||
        url.pathname.includes('/rpc/')) {
        return; // Deixa o browser tratar normalmente
    }

    // Cache-first pra assets da mesma origem
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
                }).catch(() => cached);
            })
        );
    }
});

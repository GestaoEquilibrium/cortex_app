// Portal Equilibrium — Service Worker v3 (Sprint 37 — isolamento de sessão)
// MUDANÇA v3: cache renomeado para forçar todos os browsers a baixarem
// portal_login.js, portal.js, portal_trocar_senha.js com a nova storageKey.

const CACHE = 'portal-v3';
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

    // PROTEÇÃO SPRINT 37: nunca interceptar requisições fora do scope /portal/.
    // O scope efetivo do registro é /portal/ (definido pela URL relativa
    // ./service-worker.js), mas adicionamos esta checagem como cinto-e-suspensórios
    // pra garantir que nada fora dessa pasta seja interceptado, mesmo que
    // algum dia o registro mude.
    if (url.origin === self.location.origin && !url.pathname.startsWith('/portal/')) {
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

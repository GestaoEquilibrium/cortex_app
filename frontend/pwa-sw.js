// CORTEX (frontend profissional) — Service Worker PWA
// Objetivo: permitir instalação na tela inicial e um app-shell básico.
// NUNCA cacheia dados do Supabase nem respostas de API — só assets estáticos.
const CACHE = 'cortex-app-v1';
const CORE = [
  './index.html',
  './dashboard.html',
  './favicon.svg',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  './site.webmanifest'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE).catch(()=>{})));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // Só GET e mesma origem entram em jogo; nunca Supabase/APIs externas.
  if (req.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;
  if (/supabase\.co|\/rest\/|\/auth\/|\/functions\//.test(url.href)) return;

  // HTML: network-first (sempre pega versão nova; cai no cache offline).
  if (req.mode === 'navigate' || (req.headers.get('accept')||'').includes('text/html')) {
    e.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(()=>{});
        return res;
      }).catch(() => caches.match(req).then(r => r || caches.match('./dashboard.html')))
    );
    return;
  }

  // Assets estáticos: cache-first.
  if (/\.(css|js|png|jpg|jpeg|svg|woff2?|ico|webmanifest)$/.test(url.pathname)) {
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(()=>{});
        return res;
      }).catch(()=>hit))
    );
  }
});

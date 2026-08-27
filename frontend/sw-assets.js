// ============================================================================
// CORTEX_APP — sw-assets.js  ·  Sprint pwa_v2
// ============================================================================
// Service worker de ESTÁTICOS. Deixa o app abrir rápido no celular sem baixar
// CSS/JS/ícones de novo a cada navegação.
//
// ATENÇÃO — mesma decisão de projeto do sw-push.js:
//   Este worker NUNCA intercepta navegação. Toda requisição com
//   request.mode === 'navigate' (ou destination 'document') passa direto para
//   a rede, sem passar pelo cache. O portal do paciente já teve bug de tela
//   piscando por service worker interceptando rota, e não vamos repetir isso.
//
//   Também NUNCA toca em:
//     - chamadas ao Supabase (dados clínicos e auth)
//     - qualquer requisição que não seja GET
//     - HTML de qualquer tipo
//
//   O que ele cacheia: css, js, png, svg, ico, woff2 dentro de /frontend/.
//   Estratégia: stale-while-revalidate — devolve o cache na hora e atualiza
//   em segundo plano. Trocar de versão (CACHE) invalida tudo.
// ============================================================================

const CACHE = 'cortex-assets-v3';

const EXTENSOES = /\.(css|js|png|jpg|jpeg|svg|ico|webp|woff2?)$/i;

self.addEventListener('install', (event) => {
    self.skipWaiting();
    // Pré-carrega só o essencial da casca. Falha em qualquer item não
    // derruba a instalação.
    event.waitUntil(
        caches.open(CACHE).then((cache) =>
            Promise.allSettled([
                cache.add('/frontend/styles/base.css'),
                cache.add('/frontend/styles/components.css'),
                cache.add('/frontend/styles/cortex-v2.css'),
                cache.add('/frontend/shared/sidebar.js'),
                cache.add('/frontend/icon-192.png')
            ])
        )
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((chaves) => Promise.all(
                chaves.filter((c) => c.startsWith('cortex-assets-') && c !== CACHE)
                      .map((c) => caches.delete(c))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const req = event.request;

    // ── Portões de segurança: sai fora sem fazer nada ──
    if (req.method !== 'GET') return;
    if (req.mode === 'navigate') return;          // nunca intercepta rota
    if (req.destination === 'document') return;   // nem HTML

    let url;
    try { url = new URL(req.url); } catch (_) { return; }

    if (url.origin !== self.location.origin) return;   // Supabase, fontes, CDN
    if (!url.pathname.startsWith('/frontend/')) return;
    if (!EXTENSOES.test(url.pathname)) return;

    // ── Stale-while-revalidate ──
    event.respondWith(
        caches.open(CACHE).then((cache) =>
            cache.match(req).then((cacheado) => {
                const rede = fetch(req).then((resp) => {
                    if (resp && resp.status === 200 && resp.type === 'basic') {
                        cache.put(req, resp.clone());
                    }
                    return resp;
                }).catch(() => cacheado);

                return cacheado || rede;
            })
        )
    );
});

// Permite forçar a limpeza a partir da página (CortexPWA.limparCache()).
self.addEventListener('message', (event) => {
    if (event.data && event.data.tipo === 'limpar-cache') {
        event.waitUntil(caches.delete(CACHE));
    }
});

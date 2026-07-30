// ============================================================================
// CORTEX_APP — Sprint 91 — sw-push.js
// ============================================================================
// Service worker EXCLUSIVO para notificações push do sistema profissional.
//
// ATENÇÃO — decisão de projeto deliberada:
//   Este worker NÃO tem handler de 'fetch' e NÃO faz cache de nada.
//   O portal do paciente já teve bug de tela piscando por service worker
//   interceptando rota; aqui, sem 'fetch', é impossível esse worker
//   interferir em qualquer navegação. Ele só escuta 'push' e 'notificationclick'.
//
// Escopo: /frontend/ (definido no register do notificacoes.js).
// ============================================================================

self.addEventListener('install', () => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
    let dados = {};
    try {
        dados = event.data ? event.data.json() : {};
    } catch (_) {
        dados = { titulo: 'CORTEX', corpo: event.data ? event.data.text() : '' };
    }

    const titulo = dados.titulo || 'CORTEX';
    const opcoes = {
        body: dados.corpo || '',
        icon: dados.icone || '/frontend/icon-192.png',
        badge: '/frontend/icon-192.png',
        tag: dados.tag || dados.id || undefined,
        renotify: !!dados.tag,
        data: {
            url: dados.url || '/frontend/dashboard.html',
            id: dados.id || null
        },
        requireInteraction: dados.tipo === 'bateria_concluida'
    };

    event.waitUntil(self.registration.showNotification(titulo, opcoes));
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    const destino = (event.notification.data && event.notification.data.url) ||
        '/frontend/dashboard.html';

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((lista) => {
            // Se já existe uma aba do CORTEX aberta, reaproveita em vez de
            // abrir outra — o login vive em sessionStorage e não é
            // compartilhado entre abas.
            for (const cliente of lista) {
                if (cliente.url.includes('/frontend/') && 'focus' in cliente) {
                    cliente.focus();
                    if ('navigate' in cliente) {
                        return cliente.navigate(destino).catch(() => null);
                    }
                    return null;
                }
            }
            if (self.clients.openWindow) return self.clients.openWindow(destino);
            return null;
        })
    );
});

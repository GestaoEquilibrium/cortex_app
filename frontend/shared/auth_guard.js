// ============================================================================
// CORTEX_APP — Auth Guard
// ============================================================================
// Inclua este script em todas as páginas que exigem login.
// Se o usuário não estiver autenticado, redireciona para a tela de login.
// ============================================================================

(async function() {
    'use strict';

    if (!window.cortexClient) {
        console.error('CORTEX_APP: cortexClient não inicializado.');
        return;
    }

    // Calcula o caminho relativo até a raiz
    // (assume que estamos em alguma subpasta como /pacientes/)
    const path = window.location.pathname;
    const segmentos = path.split('/').filter(s => s && !s.endsWith('.html'));
    const profundidade = segmentos.length - 1; // -1 porque o primeiro segmento é o domínio
    const caminhoRaiz = profundidade > 0 ? '../'.repeat(profundidade) : './';

    try {
        const { data: { session }, error } = await window.cortexClient.auth.getSession();

        if (error) throw error;

        if (!session) {
            // Não autenticado: redireciona para login
            window.location.href = caminhoRaiz + 'index.html';
            return;
        }

        // Sessão válida — armazena info do usuário globalmente
        window.cortexUser = session.user;

        // Busca dados do profissional
        const { data: profissional, error: profError } = await window.cortexClient
            .from('profissionais')
            .select('id, nome_completo, email, perfil, foto_url')
            .eq('auth_user_id', session.user.id)
            .single();

        if (profError) throw profError;

        if (!profissional) {
            console.error('Profissional não encontrado em profissionais. Vinculação pode estar quebrada.');
            await window.cortexClient.auth.signOut();
            window.location.href = caminhoRaiz + 'index.html';
            return;
        }

        window.cortexProfissional = profissional;

        // Marca que auth está pronto (flag persistente)
        window.cortexAuthReady = true;
        window.cortexAuthDetail = { profissional, session };

        // Dispara evento para que a página possa reagir
        window.dispatchEvent(new CustomEvent('cortex:auth-ready', {
            detail: { profissional, session }
        }));

    } catch (err) {
        console.error('Erro no auth guard:', err);
        window.location.href = caminhoRaiz + 'index.html';
    }
})();

// ============================================================================
// Workaround robusto pra race condition: addEventListener('cortex:auth-ready', fn)
// dispara imediatamente se o auth já estiver pronto quando o listener é registrado.
//
// Isso protege todas as páginas que usam o evento sem precisar mudá-las.
// ============================================================================
(function patchAuthReadyListener() {
    const originalAdd = window.addEventListener.bind(window);
    window.addEventListener = function (type, listener, options) {
        if (type === 'cortex:auth-ready' && window.cortexAuthReady) {
            // Auth já passou: dispara o callback no próximo tick (assíncrono,
            // mantendo o comportamento esperado pelo código)
            Promise.resolve().then(() => {
                try {
                    const fakeEvent = new CustomEvent('cortex:auth-ready', {
                        detail: window.cortexAuthDetail || {}
                    });
                    if (typeof listener === 'function') {
                        listener(fakeEvent);
                    } else if (listener && typeof listener.handleEvent === 'function') {
                        listener.handleEvent(fakeEvent);
                    }
                } catch (e) {
                    console.error('Erro em listener de cortex:auth-ready:', e);
                }
            });
            return;
        }
        return originalAdd(type, listener, options);
    };
})();

// Helper alternativo: window.cortexOnAuthReady(async (detail) => { ... })
window.cortexOnAuthReady = function (callback) {
    if (window.cortexAuthReady) {
        Promise.resolve().then(() => callback(window.cortexAuthDetail || {}));
    } else {
        window.addEventListener('cortex:auth-ready', (ev) => callback(ev.detail || {}), { once: true });
    }
};

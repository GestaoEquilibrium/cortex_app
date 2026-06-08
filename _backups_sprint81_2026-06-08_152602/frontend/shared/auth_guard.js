// ============================================================================
// CORTEX_APP — Auth Guard (Sprint 37 — anti-loop)
// ============================================================================
// Inclua este script em todas as páginas que exigem login.
// Se o usuário não estiver autenticado, redireciona para a tela de login.
//
// SPRINT 37 — Mudanças anti-loop:
//   1. Antes de redirecionar para o login, SEMPRE chama signOut() pra
//      limpar a sessão. Sem isso, auth.js (no index) detecta a sessão
//      residual e redireciona de volta pra dashboard → loop ("pisca").
//
//   2. Detecta sessão de paciente (user_metadata.paciente_id presente)
//      e força signOut + redirect, sem nem tentar buscar em `profissionais`.
//      Isso elimina o erro `PGRST116` que antes derrubava no catch.
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

    // Helper: limpa a sessão e redireciona pro login. SEM chamar signOut
    // antes do redirect, o auth.js do index re-detecta a sessão residual
    // e devolve pra dashboard → loop.
    async function redirecionarParaLogin(motivo) {
        try {
            await window.cortexClient.auth.signOut();
        } catch (e) {
            console.warn('signOut falhou:', e);
        }
        // Pequena espera pra garantir que o storage foi limpo antes do reload
        setTimeout(() => {
            window.location.href = caminhoRaiz + 'index.html';
        }, 50);
    }

    try {
        const { data: { session }, error } = await window.cortexClient.auth.getSession();

        if (error) throw error;

        if (!session) {
            // Não autenticado: redireciona para login (sem signOut, não tem sessão)
            window.location.href = caminhoRaiz + 'index.html';
            return;
        }

        // ─── Bloqueio de sessão de PACIENTE no sistema profissional ────────
        // Pacientes têm `paciente_id` em user_metadata. Se aparecer aqui, é
        // sessão do portal vazando — limpa e manda pro login do sistema.
        const meta = session.user?.user_metadata || {};
        if (meta.paciente_id) {
            console.warn('CORTEX_APP: sessão de paciente detectada no sistema profissional. Limpando.');
            await redirecionarParaLogin('sessao_paciente');
            return;
        }

        // Sessão válida — armazena info do usuário globalmente
        window.cortexUser = session.user;

        // Busca dados do profissional
        const { data: profissional, error: profError } = await window.cortexClient
            .from('profissionais')
            .select('id, nome_completo, email, perfil, foto_url')
            .eq('auth_user_id', session.user.id)
            .maybeSingle(); // maybeSingle: 0 linhas = null (sem erro), não levanta PGRST116

        if (profError) throw profError;

        if (!profissional) {
            // Sessão de auth.users válida mas SEM vínculo em `profissionais`.
            // Pode ser: paciente sem flag, ex-funcionário desvinculado, ou
            // conta órfã. Em todos os casos, limpa e manda pro login.
            console.error('Profissional não encontrado para auth_user_id:', session.user.id);
            await redirecionarParaLogin('sem_vinculo_profissional');
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
        await redirecionarParaLogin('erro_inesperado');
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

// ============================================================================
// CORTEX — chat_badge.js
// ----------------------------------------------------------------------------
// Contador de mensagens não lidas no item "Mensagens" da sidebar e um ponto
// no item da barra inferior do celular. Carregado pelo sidebar.js em todas
// as páginas, como a central de notificações.
//
//   · Conta pela função chat_nao_lidas() do banco.
//   · Assina o Realtime de chat_mensagens (a RLS garante que só chega o que
//     é da pessoa) e recarrega o número a cada mensagem nova ou lida.
//   · Fora da página de mensagens, avisa com um toast.
//   · Polling de 60 s como rede de segurança.
// ============================================================================

window.CortexChatBadge = (function () {
    'use strict';

    const POLL_MS = 60000;
    const state = { n: 0, canal: null, pollTimer: null, iniciado: false };

    function pintar() {
        const badge = document.getElementById('chat-nav-badge');
        if (badge) {
            badge.textContent = state.n > 99 ? '99+' : String(state.n);
            badge.hidden = state.n === 0;
        }
        document.querySelectorAll('#cortex-tabbar [data-nav="mensagens"]').forEach((el) => {
            el.classList.toggle('tem-badge', state.n > 0);
        });
    }

    async function atualizar() {
        try {
            const { data, error } = await window.cortexClient.rpc('chat_nao_lidas');
            if (error) throw error;
            state.n = Number(data) || 0;
            pintar();
        } catch (err) {
            console.warn('[chat_badge]', err.message || err);
        }
    }

    function assinar() {
        const profId = window.cortexProfissional && window.cortexProfissional.id;
        if (!profId || state.canal) return;
        try {
            state.canal = window.cortexClient
                .channel('cortex-chat-badge-' + profId)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_mensagens' }, (payload) => {
                    const m = payload.new;
                    if (!m) return;
                    const minha = m.autor_tipo === 'profissional' && m.autor_prof_id === profId;
                    atualizar();
                    // A página de mensagens já avisa do jeito dela.
                    if (payload.eventType === 'INSERT' && !minha && !window.CortexChatPagina && window.CortexUI) {
                        window.CortexUI.toast('💬 Nova mensagem', 'info');
                    }
                })
                .subscribe();
        } catch (err) {
            console.warn('[chat_badge] realtime indisponível:', err.message || err);
        }
        if (!state.pollTimer) {
            state.pollTimer = setInterval(() => {
                if (document.visibilityState === 'visible') atualizar();
            }, POLL_MS);
        }
    }

    async function iniciar() {
        if (state.iniciado) return;
        if (!window.cortexClient || !window.cortexProfissional) return;
        state.iniciado = true;
        await atualizar();
        assinar();
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') atualizar();
        });
    }

    return { iniciar, atualizar };
})();

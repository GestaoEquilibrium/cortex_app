// ============================================================================
// CORTEX — chat_badge.js
// ----------------------------------------------------------------------------
// Tudo do chat que vive fora da página de mensagens. Carregado pelo sidebar.js
// em todas as páginas, como a central de notificações.
//
//   · Contador de não lidas no item "Mensagens" da sidebar e ponto na barra
//     inferior do celular (função chat_nao_lidas(), Realtime de
//     chat_mensagens, polling de 60 s).
//   · Cartão flutuante quando chega mensagem: nome de quem mandou, grupo,
//     texto e botão Responder. Vem pela linha em `notificacoes` do tipo
//     'chat_mensagem' que o banco cria junto com a mensagem (RLS garante que
//     só chega a da pessoa). Não aparece se a conversa já está aberta.
//   · Convite para ativar as notificações do navegador, para todo mundo que
//     ainda não decidiu. "Agora não" volta a perguntar no dia seguinte.
// ============================================================================

window.CortexChatBadge = (function () {
    'use strict';

    const POLL_MS = 60000;
    const POP_MS = 9000;          // quanto o cartão fica na tela
    const POP_MAX = 3;            // cartões ao mesmo tempo
    const CONVITE_ATRASO_MS = 1800;
    const CHAVE_ADIADO = 'cortex_push_adiado_em';

    const state = { n: 0, canal: null, canalNotif: null, pollTimer: null, iniciado: false, vistos: new Set() };

    // ── Helpers ────────────────────────────────────────────────────────────

    function esc(t) {
        return String(t == null ? '' : t)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function iniciais(nome) {
        const p = String(nome || '').trim().split(/\s+/).filter(Boolean);
        if (!p.length) return '?';
        return ((p[0][0] || '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
    }

    // Mesma conta do chat.js: cada pessoa sempre com a mesma cor.
    function tom(nome) {
        let h = 0;
        for (const ch of String(nome || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
        return 1 + (h % 4);
    }

    function basePathFrontend() {
        const p = window.location.pathname;
        const idx = p.indexOf('/frontend/');
        if (idx >= 0) return p.substring(0, idx + '/frontend/'.length);
        return '/frontend/';
    }

    function hoje() {
        const d = new Date();
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }

    function lerLocal(k) { try { return window.localStorage.getItem(k); } catch (_) { return null; } }
    function gravarLocal(k, v) { try { window.localStorage.setItem(k, v); } catch (_) { /* privado */ } }

    // ── Contador ───────────────────────────────────────────────────────────

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

    // ── Cartão flutuante ───────────────────────────────────────────────────

    function conversaDaUrl(url) {
        const m = /[?&]conversa=([^&#]+)/.exec(String(url || ''));
        return m ? decodeURIComponent(m[1]) : null;
    }

    function containerPops() {
        let el = document.getElementById('chat-pops');
        if (!el) {
            el = document.createElement('div');
            el.id = 'chat-pops';
            document.body.appendChild(el);
        }
        return el;
    }

    function irParaConversa(conversaId) {
        if (window.CortexChatPagina && typeof window.CortexChatAbrir === 'function') {
            window.CortexChatAbrir(conversaId);
            return;
        }
        window.location.href = basePathFrontend() + 'chat/chat.html?conversa=' + encodeURIComponent(conversaId);
    }

    function fecharPop(card) {
        if (!card || card.dataset.fechando) return;
        card.dataset.fechando = '1';
        card.classList.add('saindo');
        setTimeout(() => card.remove(), 220);
    }

    // n = linha de `notificacoes` (titulo "Autor · Contexto", corpo, url).
    function mostrarPopup(n) {
        if (!n || !n.id || state.vistos.has(n.id)) return null;
        state.vistos.add(n.id);

        const conversaId = conversaDaUrl(n.url);
        // Conversa aberta na tela: a mensagem já apareceu no lugar dela.
        if (conversaId && window.CortexChatConversaAberta === conversaId && document.visibilityState === 'visible') return null;

        const partes = String(n.titulo || '').split(' · ');
        const nome = partes.shift() || 'Mensagem';
        const ctx = partes.join(' · ');
        const externo = ctx === 'Externo';

        const card = document.createElement('div');
        card.className = 'chat-pop';
        card.setAttribute('role', 'status');
        card.dataset.conversa = conversaId || '';
        card.innerHTML =
            '<div class="chat-pop-av tom-' + tom(nome) + (externo ? ' ext' : '') + '">' + esc(externo ? 'EXT' : iniciais(nome)) + '</div>' +
            '<div class="chat-pop-corpo">' +
                '<div class="chat-pop-topo">' +
                    '<span class="chat-pop-nome">' + esc(nome) + '</span>' +
                    (ctx ? '<span class="chat-pop-ctx">' + esc(ctx) + '</span>' : '') +
                '</div>' +
                '<div class="chat-pop-texto">' + esc(n.corpo || '') + '</div>' +
                (conversaId ? '<button type="button" class="chat-pop-responder">Responder</button>' : '') +
            '</div>' +
            '<button type="button" class="chat-pop-fechar" aria-label="Fechar">×</button>' +
            '<div class="chat-pop-barra" style="animation-duration:' + POP_MS + 'ms"></div>';

        const pops = containerPops();
        // Mais que POP_MAX: os mais antigos saem (os que já estão saindo não contam).
        const vivos = Array.from(pops.querySelectorAll('.chat-pop:not(.saindo)'));
        vivos.slice(0, Math.max(0, vivos.length - (POP_MAX - 1))).forEach(fecharPop);
        pops.appendChild(card);

        let timer = null;
        const armar = () => {
            clearTimeout(timer);
            timer = setTimeout(() => {
                // Aba em segundo plano: espera a pessoa voltar para começar a contar.
                if (document.visibilityState !== 'visible') { armar(); return; }
                fecharPop(card);
            }, POP_MS);
        };
        armar();
        card.addEventListener('mouseenter', () => { clearTimeout(timer); card.classList.add('parado'); });
        card.addEventListener('mouseleave', () => { card.classList.remove('parado'); armar(); });

        card.querySelector('.chat-pop-fechar').addEventListener('click', (e) => { e.stopPropagation(); fecharPop(card); });
        if (conversaId) {
            const abrir = (e) => { e.stopPropagation(); fecharPop(card); irParaConversa(conversaId); };
            card.querySelector('.chat-pop-responder').addEventListener('click', abrir);
            card.addEventListener('click', abrir);
        }
        return card;
    }

    // Abriu a conversa (aqui ou em outra aba): cartões dela somem.
    function fecharPopsDaConversa(conversaId) {
        document.querySelectorAll('#chat-pops .chat-pop[data-conversa="' + conversaId + '"]').forEach(fecharPop);
    }

    // ── Convite para ativar o push ─────────────────────────────────────────

    function pushSuportado() {
        return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    }

    function ehIosNaoInstalado() {
        const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
            (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        const instalado = window.navigator.standalone === true ||
            (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
        return ios && !instalado;
    }

    function devePerguntar() {
        if (!pushSuportado() || ehIosNaoInstalado()) return false;
        if (!window.CortexNotificacoes || typeof window.CortexNotificacoes.ativarPush !== 'function') return false;
        if (Notification.permission !== 'default') return false;   // já aceitou ou bloqueou
        return lerLocal(CHAVE_ADIADO) !== hoje();
    }

    function mostrarConvite() {
        if (document.getElementById('chat-convite')) return null;
        const el = document.createElement('div');
        el.id = 'chat-convite';
        el.className = 'chat-convite';
        el.setAttribute('role', 'dialog');
        el.setAttribute('aria-label', 'Ativar notificações');
        el.innerHTML =
            '<div class="chat-convite-ico">🔔</div>' +
            '<div class="chat-convite-txt">' +
                '<strong>Ativar notificações</strong>' +
                '<span>Receba as mensagens da equipe e os avisos do CORTEX neste aparelho, mesmo com o sistema fechado.</span>' +
            '</div>' +
            '<div class="chat-convite-btns">' +
                '<button type="button" class="chat-convite-ok">Ativar</button>' +
                '<button type="button" class="chat-convite-depois">Agora não</button>' +
            '</div>';
        document.body.appendChild(el);
        requestAnimationFrame(() => el.classList.add('visivel'));

        const fechar = () => { el.classList.remove('visivel'); setTimeout(() => el.remove(), 260); };

        el.querySelector('.chat-convite-depois').addEventListener('click', () => {
            gravarLocal(CHAVE_ADIADO, hoje());
            fechar();
        });
        el.querySelector('.chat-convite-ok').addEventListener('click', async () => {
            const btn = el.querySelector('.chat-convite-ok');
            btn.disabled = true;
            btn.textContent = 'Ativando…';
            let ok = false;
            try { ok = await window.CortexNotificacoes.ativarPush(); } catch (_) { ok = false; }
            // Não deu (negou, fechou o pedido do navegador ou erro): não insiste hoje.
            if (!ok && Notification.permission === 'default') gravarLocal(CHAVE_ADIADO, hoje());
            fechar();
        });
        return el;
    }

    // ── Realtime ───────────────────────────────────────────────────────────

    function assinar() {
        const profId = window.cortexProfissional && window.cortexProfissional.id;
        if (!profId || state.canal) return;
        try {
            state.canal = window.cortexClient
                .channel('cortex-chat-badge-' + profId)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_mensagens' }, (payload) => {
                    if (!payload.new) return;
                    atualizar();
                })
                // Entrar ou sair de um grupo muda o que conta como não lido.
                .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_participantes' }, (payload) => {
                    const p = payload.new || payload.old || {};
                    if (p.prof_id === profId && payload.eventType !== 'UPDATE') atualizar();
                })
                .subscribe();

            // O cartão vem pela notificação, que já chega com nome e texto prontos.
            state.canalNotif = window.cortexClient
                .channel('cortex-chat-pop-' + profId)
                .on('postgres_changes', {
                    event: '*', schema: 'public', table: 'notificacoes', filter: 'destinatario_id=eq.' + profId
                }, (payload) => {
                    const n = payload.new;
                    if (!n || n.tipo !== 'chat_mensagem') return;
                    if (payload.eventType === 'INSERT') { mostrarPopup(n); return; }
                    // Lida em outra aba/aparelho: tira o cartão daqui também.
                    if (payload.eventType === 'UPDATE' && n.lida_em) {
                        const cid = conversaDaUrl(n.url);
                        if (cid) fecharPopsDaConversa(cid);
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

    // ── Início ─────────────────────────────────────────────────────────────

    async function iniciar() {
        if (state.iniciado) return;
        if (!window.cortexClient || !window.cortexProfissional) return;
        state.iniciado = true;
        await atualizar();
        assinar();
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') atualizar();
        });
        if (devePerguntar()) setTimeout(() => { if (devePerguntar()) mostrarConvite(); }, CONVITE_ATRASO_MS);
    }

    return { iniciar, atualizar, mostrarPopup, fecharPopsDaConversa, mostrarConvite, devePerguntar };
})();

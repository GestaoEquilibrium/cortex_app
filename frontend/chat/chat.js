// ============================================================================
// CORTEX — Mensagens (chat 1:1)
// ----------------------------------------------------------------------------
// Conversas entre profissionais do CORTEX, e — para quem atende o chat
// externo — com os profissionais de fora da área externa.
//
// Como funciona:
//   · Lista e envio passam pelas funções chat_* do banco (validam quem é
//     participante). A leitura do histórico é SELECT direto em chat_mensagens,
//     que só devolve o que a RLS deixa.
//   · Mensagem nova chega pelo Realtime (INSERT em chat_mensagens, filtrado
//     pela mesma RLS). Se o Realtime cair, o polling de 20 s segura.
//   · Abrir uma conversa marca como lidas as mensagens do outro lado.
//
// URL: ?conversa=<id>  abre direto;  ?com=<profissional_id>  abre (ou cria)
// a conversa com aquele profissional.
// ============================================================================

(function () {
    'use strict';

    const LIMITE_HISTORICO = 300;
    const POLL_MS = 20000;
    const MAX_TEXTO = 4000;

    const c = () => window.cortexClient;
    const app = () => document.getElementById('chat-app');

    const state = {
        eu: null,
        conversas: [],
        ativa: null,          // conversa aberta (objeto da lista)
        mensagens: [],
        contatos: null,
        busca: '',
        canal: null,
        pollTimer: null,
        enviando: false,
        fotos: {}             // foto_url -> URL assinada
    };

    // Avisa o contador da sidebar que esta página já cuida das não lidas.
    window.CortexChatPagina = true;

    // ── Helpers ────────────────────────────────────────────────────────────

    function esc(t) {
        const d = document.createElement('div');
        d.textContent = t ?? '';
        return d.innerHTML;
    }

    function toast(msg, tipo) {
        if (window.CortexUI && window.CortexUI.toast) window.CortexUI.toast(msg, tipo || 'info');
    }

    function iniciais(nome) {
        const p = String(nome || '').trim().split(/\s+/).filter(Boolean);
        if (!p.length) return '?';
        return ((p[0][0] || '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
    }

    // Tom do avatar estável por nome, para cada pessoa ter sempre a mesma cor.
    function tom(nome) {
        let h = 0;
        for (const ch of String(nome || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
        return 1 + (h % 4);
    }

    function perfilLabel(p) {
        return (window.CortexUI && window.CortexUI.PERFIL_LABELS && window.CortexUI.PERFIL_LABELS[p]) || p || '';
    }

    function dataLocal(iso) {
        return iso ? new Date(iso) : null;
    }

    function mesmoDia(a, b) {
        return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    }

    function hhmm(d) {
        return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }

    // Na lista: hora se foi hoje, "Ontem", ou dd/mm.
    function horaLista(iso) {
        const d = dataLocal(iso);
        if (!d || isNaN(d)) return '';
        const hoje = new Date();
        if (mesmoDia(d, hoje)) return hhmm(d);
        const ontem = new Date(hoje); ontem.setDate(hoje.getDate() - 1);
        if (mesmoDia(d, ontem)) return 'Ontem';
        return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    }

    function rotuloDia(d) {
        const hoje = new Date();
        if (mesmoDia(d, hoje)) return 'Hoje';
        const ontem = new Date(hoje); ontem.setDate(hoje.getDate() - 1);
        if (mesmoDia(d, ontem)) return 'Ontem';
        return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
    }

    function subtitulo(conv) {
        const o = conv.outro || {};
        if (conv.tipo === 'externa') {
            const partes = ['Profissional externo'];
            if (o.conselho || o.registro) partes.push([o.conselho, o.registro].filter(Boolean).join(' '));
            if (o.clinica) partes.push(o.clinica);
            return partes.join(' · ');
        }
        const partes = [perfilLabel(o.perfil)];
        if (o.especialidade) partes.push(o.especialidade);
        if (o.ativo === false) partes.push('desligado');
        return partes.filter(Boolean).join(' · ');
    }

    function avatarHtml(conv, extra) {
        const o = conv.outro || {};
        const ext = conv.tipo === 'externa';
        const classe = ext ? 'externa' : 'tom-' + tom(o.nome);
        const foto = (!ext && o.foto_url) ? ` data-foto="${esc(o.foto_url)}"` : '';
        return `<div class="chat-av ${classe} ${extra || ''}"${foto}>${esc(iniciais(o.nome))}${ext ? '<span class="chat-av-ext">EXT</span>' : ''}</div>`;
    }

    // Foto do profissional: URL assinada do bucket, com cache. Troca as
    // iniciais pela imagem depois que a URL chega, sem travar o render.
    async function pintarFotos() {
        const els = Array.from(app().querySelectorAll('.chat-av[data-foto]'));
        for (const el of els) {
            const chave = el.getAttribute('data-foto');
            if (!chave) continue;
            try {
                if (!state.fotos[chave]) {
                    const { data } = await c().storage.from('profissionais-fotos').createSignedUrl(chave, 600);
                    state.fotos[chave] = (data && data.signedUrl) || null;
                }
                if (state.fotos[chave] && !el.querySelector('img')) {
                    el.innerHTML = `<img src="${esc(state.fotos[chave])}" alt="">`;
                }
            } catch (_) { /* fica com as iniciais */ }
        }
    }

    function minha(m) {
        return m.autor_tipo === 'profissional' && m.autor_prof_id === state.eu.id;
    }

    // ── Dados ──────────────────────────────────────────────────────────────

    async function carregarConversas() {
        try {
            const { data, error } = await c().rpc('chat_minhas_conversas');
            if (error) throw error;
            state.conversas = Array.isArray(data) ? data : [];
            // Mantém o objeto ativo apontando para a linha nova da lista.
            if (state.ativa) {
                const nova = state.conversas.find(x => x.id === state.ativa.id);
                if (nova) { nova.nao_lidas = 0; state.ativa = nova; }
            }
            renderLista();
        } catch (err) {
            console.error('[chat] conversas:', err);
            toast('Não foi possível carregar as conversas.', 'danger');
        }
    }

    async function carregarMensagens(conversaId) {
        const { data, error } = await c()
            .from('chat_mensagens')
            .select('id, conversa_id, autor_tipo, autor_prof_id, autor_externo_id, texto, criado_em, lida_em')
            .eq('conversa_id', conversaId)
            .order('criado_em', { ascending: false })
            .limit(LIMITE_HISTORICO);
        if (error) throw error;
        return (data || []).slice().reverse();
    }

    async function marcarLida(conv) {
        conv.nao_lidas = 0;   // otimista: a lista já mostra sem o contador
        try {
            await c().rpc('chat_marcar_lida', { p_conversa: conv.id });
        } catch (err) {
            console.warn('[chat] marcar lida:', err);
        }
        if (window.CortexChatBadge) window.CortexChatBadge.atualizar();
    }

    // ── Lista ──────────────────────────────────────────────────────────────

    function conversasFiltradas() {
        const q = state.busca.trim().toLowerCase();
        if (!q) return state.conversas;
        return state.conversas.filter(cv =>
            String(cv.outro?.nome || '').toLowerCase().includes(q) ||
            String(cv.ultima_previa || '').toLowerCase().includes(q));
    }

    function renderLista() {
        const alvo = document.getElementById('chat-convs');
        if (!alvo) return;
        const lista = conversasFiltradas();

        if (!lista.length) {
            alvo.innerHTML = `
                <div class="chat-convs-vazio">
                    <div class="ico">${state.busca ? '🔍' : '💬'}</div>
                    ${state.busca
                        ? 'Nada com esse nome.'
                        : 'Nenhuma conversa ainda.<br>Clique em <strong>Nova</strong> para falar com alguém da equipe.'}
                </div>`;
            return;
        }

        alvo.innerHTML = lista.map(cv => {
            const naoLidas = Number(cv.nao_lidas || 0);
            const classes = ['chat-conv', cv.tipo === 'externa' ? 'externa' : '',
                             naoLidas ? 'nao-lida' : '',
                             state.ativa && state.ativa.id === cv.id ? 'ativa' : ''].join(' ');
            return `
                <button class="${classes}" data-conversa="${esc(cv.id)}">
                    ${avatarHtml(cv)}
                    <div class="chat-conv-corpo">
                        <div class="chat-conv-topo">
                            <span class="chat-conv-nome">${esc(cv.outro?.nome || '—')}</span>
                            <span class="chat-conv-hora">${horaLista(cv.ultima_mensagem_em)}</span>
                        </div>
                        <div class="chat-conv-previa">
                            <span class="chat-conv-txt">${cv.ultima_previa ? esc(cv.ultima_previa) : '<em>Sem mensagens ainda</em>'}</span>
                            ${naoLidas ? `<span class="chat-pill">${naoLidas > 99 ? '99+' : naoLidas}</span>` : ''}
                        </div>
                    </div>
                </button>`;
        }).join('');

        alvo.querySelectorAll('[data-conversa]').forEach(b =>
            b.addEventListener('click', () => abrirConversa(b.dataset.conversa)));
        pintarFotos();
    }

    // ── Conversa aberta ────────────────────────────────────────────────────

    async function abrirConversa(id) {
        const conv = state.conversas.find(x => x.id === id);
        if (!conv) return;
        state.ativa = conv;
        state.mensagens = [];
        app().classList.add('aberta');
        renderLista();
        renderThread(true);

        try {
            state.mensagens = await carregarMensagens(id);
        } catch (err) {
            console.error('[chat] mensagens:', err);
            toast('Não foi possível abrir a conversa.', 'danger');
        }
        if (!state.ativa || state.ativa.id !== conv.id) return;   // trocou de conversa no meio
        renderThread(false);
        if (Number(conv.nao_lidas || 0) > 0 || state.mensagens.some(m => !minha(m) && !m.lida_em)) {
            marcarLida(conv);
            renderLista();
        }
        try {
            const url = new URL(window.location.href);
            url.searchParams.set('conversa', id);
            url.searchParams.delete('com');
            history.replaceState(null, '', url);
        } catch (_) { /* ignora */ }
    }

    function fecharConversa() {
        state.ativa = null;
        state.mensagens = [];
        app().classList.remove('aberta');
        renderLista();
        renderThread(false);
        try {
            const url = new URL(window.location.href);
            url.searchParams.delete('conversa');
            history.replaceState(null, '', url);
        } catch (_) { /* ignora */ }
    }

    function renderThread(carregando) {
        const alvo = document.getElementById('chat-thread');
        if (!alvo) return;
        const conv = state.ativa;

        if (!conv) {
            alvo.innerHTML = `
                <div class="chat-vazio">
                    <div class="chat-vazio-ico">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                    </div>
                    <h2>Suas mensagens</h2>
                    <p>Escolha uma conversa ao lado ou comece uma nova com alguém da equipe.
                       Tudo fica dentro do CORTEX, sem passar pelo WhatsApp.</p>
                </div>`;
            return;
        }

        const ext = conv.tipo === 'externa';
        alvo.innerHTML = `
            <div class="chat-cab">
                <button class="chat-cab-voltar" id="chat-voltar" aria-label="Voltar">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>
                </button>
                ${avatarHtml(conv)}
                <div class="chat-cab-info">
                    <div class="chat-cab-nome">${esc(conv.outro?.nome || '—')}</div>
                    <div class="chat-cab-sub">${esc(subtitulo(conv))}</div>
                </div>
                ${ext ? '<span class="chat-cab-chip externa">Externo</span>' : '<span class="chat-cab-chip">Equipe</span>'}
            </div>
            <div class="chat-msgs" id="chat-msgs">
                ${carregando
                    ? '<div class="loading-state"><div class="spinner"></div><p>Carregando...</p></div>'
                    : renderMensagens()}
            </div>
            <div class="chat-escrever">
                <textarea id="chat-texto" rows="1" maxlength="${MAX_TEXTO}"
                          placeholder="${window.innerWidth > 768 ? 'Escreva uma mensagem… (Enter envia, Shift+Enter quebra a linha)' : 'Escreva uma mensagem…'}"></textarea>
                <button class="chat-enviar" id="chat-enviar" title="Enviar" aria-label="Enviar">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                </button>
            </div>
            <div class="chat-dica" id="chat-dica"></div>`;

        document.getElementById('chat-voltar').addEventListener('click', fecharConversa);
        const ta = document.getElementById('chat-texto');
        const btn = document.getElementById('chat-enviar');
        btn.addEventListener('click', enviar);
        ta.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); }
        });
        ta.addEventListener('input', () => { autoAltura(ta); dica(ta); });
        if (!carregando) {
            rolarFim();
            if (window.innerWidth > 768) ta.focus();
        }
        pintarFotos();
    }

    function renderMensagens() {
        if (!state.mensagens.length) {
            return `<div class="chat-msgs-vazio"><div class="ico">👋</div>Nenhuma mensagem ainda.<br>Diga oi.</div>`;
        }
        let html = '';
        let diaAnterior = null;
        for (const m of state.mensagens) {
            const d = dataLocal(m.criado_em);
            if (!diaAnterior || !mesmoDia(d, diaAnterior)) {
                html += `<div class="chat-dia">${esc(rotuloDia(d))}</div>`;
                diaAnterior = d;
            }
            html += renderMensagem(m);
        }
        return html;
    }

    function renderMensagem(m) {
        const eh = minha(m);
        const ext = m.autor_tipo === 'externo';
        const ticks = eh
            ? `<span class="msg-tick ${m.lida_em ? 'lida' : ''}" title="${m.lida_em ? 'Lida' : 'Enviada'}">${m.lida_em ? '✓✓' : '✓'}</span>`
            : '';
        return `
            <div class="msg ${eh ? 'minha' : 'outra'} ${ext ? 'externa' : ''}" data-msg="${esc(m.id)}">
                <div class="msg-balao">${esc(m.texto)}</div>
                <div class="msg-meta">${ticks}<span>${hhmm(dataLocal(m.criado_em))}</span></div>
            </div>`;
    }

    function acrescentarMensagem(m) {
        if (state.mensagens.some(x => x.id === m.id)) return;
        const anterior = state.mensagens[state.mensagens.length - 1];
        state.mensagens.push(m);
        const box = document.getElementById('chat-msgs');
        if (!box) return;
        const vazio = box.querySelector('.chat-msgs-vazio');
        if (vazio) vazio.remove();
        const d = dataLocal(m.criado_em);
        if (!anterior || !mesmoDia(d, dataLocal(anterior.criado_em))) {
            box.insertAdjacentHTML('beforeend', `<div class="chat-dia">${esc(rotuloDia(d))}</div>`);
        }
        box.insertAdjacentHTML('beforeend', renderMensagem(m));
        rolarFim();
    }

    function atualizarTicks(m) {
        const i = state.mensagens.findIndex(x => x.id === m.id);
        if (i < 0) return;
        state.mensagens[i] = Object.assign(state.mensagens[i], m);
        const el = document.querySelector(`[data-msg="${CSS.escape(m.id)}"] .msg-tick`);
        if (el && m.lida_em) { el.classList.add('lida'); el.textContent = '✓✓'; el.title = 'Lida'; }
    }

    function rolarFim() {
        const box = document.getElementById('chat-msgs');
        if (box) box.scrollTop = box.scrollHeight;
    }

    function autoAltura(ta) {
        ta.style.height = 'auto';
        ta.style.height = Math.min(160, ta.scrollHeight) + 'px';
    }

    function dica(ta) {
        const el = document.getElementById('chat-dica');
        if (!el) return;
        const n = ta.value.length;
        el.innerHTML = n > MAX_TEXTO - 500 ? `<b>${n}</b> / ${MAX_TEXTO} caracteres` : '';
    }

    // ── Enviar ─────────────────────────────────────────────────────────────

    async function enviar() {
        const conv = state.ativa;
        const ta = document.getElementById('chat-texto');
        const btn = document.getElementById('chat-enviar');
        if (!conv || !ta || state.enviando) return;
        const texto = ta.value.trim();
        if (!texto) return;
        if (texto.length > MAX_TEXTO) { toast('Mensagem longa demais.', 'warning'); return; }

        state.enviando = true;
        btn.disabled = true;
        try {
            const { data, error } = await c().rpc('chat_enviar', { p_conversa: conv.id, p_texto: texto });
            if (error) throw error;
            if (!data || !data.ok) {
                const msgs = { sem_acesso: 'Você não participa desta conversa.',
                               texto_vazio: 'Escreva algo antes de enviar.',
                               texto_longo: 'Mensagem longa demais.' };
                toast(msgs[data && data.erro] || 'Não foi possível enviar.', 'danger');
                return;
            }
            ta.value = '';
            autoAltura(ta);
            dica(ta);
            const m = data.mensagem;
            acrescentarMensagem(m);
            atualizarPrevia(conv, m);
            renderLista();
        } catch (err) {
            console.error('[chat] enviar:', err);
            toast('Erro de conexão ao enviar.', 'danger');
        } finally {
            state.enviando = false;
            btn.disabled = false;
            ta.focus();
        }
    }

    function atualizarPrevia(conv, m) {
        conv.ultima_previa = String(m.texto || '').replace(/\s+/g, ' ').slice(0, 120);
        conv.ultima_mensagem_em = m.criado_em;
        // Vai para o topo da lista.
        state.conversas = [conv].concat(state.conversas.filter(x => x.id !== conv.id));
    }

    // ── Realtime ───────────────────────────────────────────────────────────

    function aoChegar(payload) {
        const m = payload.new;
        if (!m || !m.id) return;

        if (payload.eventType === 'UPDATE') {
            if (state.ativa && m.conversa_id === state.ativa.id) atualizarTicks(m);
            return;
        }
        if (payload.eventType !== 'INSERT') return;

        const conv = state.conversas.find(x => x.id === m.conversa_id);
        if (!conv) {
            // Conversa que ainda não estava na lista (ex.: primeiro contato
            // de um profissional externo). Recarrega a lista inteira.
            carregarConversas();
            if (!minha(m)) toast('💬 Nova mensagem', 'info');
            return;
        }

        atualizarPrevia(conv, m);

        if (state.ativa && state.ativa.id === conv.id) {
            acrescentarMensagem(m);
            if (!minha(m)) marcarLida(conv);
        } else if (!minha(m)) {
            conv.nao_lidas = Number(conv.nao_lidas || 0) + 1;
            toast('💬 ' + (conv.outro?.nome || 'Nova mensagem'), 'info');
            if (window.CortexChatBadge) window.CortexChatBadge.atualizar();
        }
        renderLista();
    }

    function assinarRealtime() {
        if (state.canal) return;
        try {
            state.canal = c()
                .channel('cortex-chat-' + state.eu.id)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_mensagens' }, aoChegar)
                .subscribe();
        } catch (err) {
            console.warn('[chat] realtime indisponível:', err);
        }
        // Rede de segurança se o Realtime cair.
        if (!state.pollTimer) {
            state.pollTimer = setInterval(() => {
                if (document.visibilityState !== 'visible') return;
                sincronizar();
            }, POLL_MS);
        }
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') sincronizar();
        });
    }

    // Recarrega a lista e, se houver conversa aberta, o que chegou depois da
    // última mensagem conhecida.
    async function sincronizar() {
        await carregarConversas();
        const conv = state.ativa;
        if (!conv) return;
        try {
            const ultima = state.mensagens[state.mensagens.length - 1];
            let q = c().from('chat_mensagens')
                .select('id, conversa_id, autor_tipo, autor_prof_id, autor_externo_id, texto, criado_em, lida_em')
                .eq('conversa_id', conv.id)
                .order('criado_em', { ascending: true })
                .limit(100);
            if (ultima) q = q.gt('criado_em', ultima.criado_em);
            const { data, error } = await q;
            if (error) throw error;
            let novas = false;
            (data || []).forEach(m => {
                if (!state.mensagens.some(x => x.id === m.id)) { acrescentarMensagem(m); novas = true; }
            });
            if (novas && (data || []).some(m => !minha(m))) marcarLida(conv);
        } catch (err) {
            console.warn('[chat] sincronizar:', err);
        }
    }

    // ── Nova conversa ──────────────────────────────────────────────────────

    async function abrirContatos() {
        let fundo = document.getElementById('chat-modal-fundo');
        if (!fundo) {
            fundo = document.createElement('div');
            fundo.id = 'chat-modal-fundo';
            fundo.className = 'chat-modal-fundo';
            document.body.appendChild(fundo);
        }
        fundo.innerHTML = `
            <div class="chat-modal" role="dialog" aria-label="Nova conversa">
                <div class="chat-modal-cab">
                    <div class="chat-lista-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></div>
                    <h2>Nova conversa</h2>
                    <button class="chat-modal-fechar" id="chat-modal-fechar" aria-label="Fechar">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                </div>
                <div class="chat-busca">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/></svg>
                    <input type="text" id="chat-contatos-busca" placeholder="Buscar na equipe" autocomplete="off">
                </div>
                <div class="chat-contatos" id="chat-contatos">
                    <div class="loading-state"><div class="spinner"></div><p>Carregando a equipe...</p></div>
                </div>
            </div>`;

        const fechar = () => { fundo.remove(); document.removeEventListener('keydown', escTecla); };
        const escTecla = (e) => { if (e.key === 'Escape') fechar(); };
        document.addEventListener('keydown', escTecla);
        document.getElementById('chat-modal-fechar').addEventListener('click', fechar);
        fundo.addEventListener('click', (e) => { if (e.target === fundo) fechar(); });

        if (!state.contatos) {
            try {
                const { data, error } = await c().rpc('chat_contatos');
                if (error) throw error;
                state.contatos = Array.isArray(data) ? data : [];
            } catch (err) {
                console.error('[chat] contatos:', err);
                state.contatos = [];
                toast('Não foi possível carregar a equipe.', 'danger');
            }
        }

        const busca = document.getElementById('chat-contatos-busca');
        const pintar = () => {
            const q = busca.value.trim().toLowerCase();
            const lista = state.contatos.filter(p => !q || String(p.nome || '').toLowerCase().includes(q));
            const alvo = document.getElementById('chat-contatos');
            if (!alvo) return;
            alvo.innerHTML = lista.length ? lista.map(p => `
                <button class="chat-contato" data-prof="${esc(p.id)}">
                    ${avatarHtml({ tipo: 'interna', outro: p })}
                    <div>
                        <div class="chat-contato-nome">${esc(p.nome)}</div>
                        <div class="chat-contato-sub">${esc([perfilLabel(p.perfil), p.especialidade].filter(Boolean).join(' · '))}</div>
                    </div>
                </button>`).join('')
            : `<div class="chat-contatos-vazio">${q ? 'Ninguém com esse nome.' : 'Nenhum outro profissional ativo.'}</div>`;
            alvo.querySelectorAll('[data-prof]').forEach(b => b.addEventListener('click', async () => {
                fechar();
                await conversarCom(b.dataset.prof);
            }));
            pintarFotos();
        };
        busca.addEventListener('input', pintar);
        pintar();
        setTimeout(() => busca.focus(), 50);
    }

    async function conversarCom(profId) {
        try {
            const { data, error } = await c().rpc('chat_abrir_conversa', { p_outro: profId });
            if (error) throw error;
            if (!data || !data.ok) {
                const msgs = { contato_invalido: 'Contato inválido.', contato_inativo: 'Esse profissional está desligado.' };
                toast(msgs[data && data.erro] || 'Não foi possível abrir a conversa.', 'danger');
                return;
            }
            await carregarConversas();
            await abrirConversa(data.conversa_id);
        } catch (err) {
            console.error('[chat] abrir conversa:', err);
            toast('Erro de conexão.', 'danger');
        }
    }

    // ── Montagem ───────────────────────────────────────────────────────────

    function montar() {
        app().innerHTML = `
            <section class="chat-lista">
                <div class="chat-lista-cab">
                    <div class="chat-lista-ico">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                    </div>
                    <div class="chat-lista-tit">
                        <h1>Mensagens</h1>
                        <p>Equipe e profissionais externos</p>
                    </div>
                    <button class="chat-btn-nova" id="chat-nova">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        Nova
                    </button>
                </div>
                <div class="chat-busca">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/></svg>
                    <input type="text" id="chat-busca" placeholder="Buscar conversa" autocomplete="off">
                </div>
                <div class="chat-convs" id="chat-convs"></div>
            </section>
            <section class="chat-thread" id="chat-thread"></section>`;

        document.getElementById('chat-nova').addEventListener('click', abrirContatos);
        document.getElementById('chat-busca').addEventListener('input', (e) => {
            state.busca = e.target.value;
            renderLista();
        });
        renderThread(false);
    }

    async function iniciar() {
        state.eu = window.cortexProfissional;
        if (!state.eu) return;

        await CortexSidebar.render('mensagens');
        montar();
        await carregarConversas();
        assinarRealtime();

        const p = new URLSearchParams(window.location.search);
        const conversa = p.get('conversa');
        const com = p.get('com');
        if (conversa && state.conversas.some(x => x.id === conversa)) {
            abrirConversa(conversa);
        } else if (com) {
            conversarCom(com);
        }
    }

    window.addEventListener('cortex:auth-ready', iniciar, { once: true });
})();

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
        grupo: null,          // info do grupo aberto (participantes, posso_gerenciar)
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

    const GRUPO_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>';

    function subtitulo(conv) {
        const o = conv.outro || {};
        if (conv.tipo === 'grupo') {
            const n = Number(o.membros || (state.grupo && state.grupo.participantes || []).length || 0);
            return n ? `${n} participante${n === 1 ? '' : 's'}${window.innerWidth > 768 ? ' · toque para ver' : ''}` : 'Grupo';
        }
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
        if (conv.tipo === 'grupo') {
            return `<div class="chat-av grupo ${extra || ''}">${GRUPO_SVG}</div>`;
        }
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

    function sistema(m) {
        return m.autor_tipo === 'sistema';
    }

    // Nome de quem mandou, no grupo: vem dos participantes carregados; se a
    // pessoa já saiu do grupo, cai no cadastro da equipe, se estiver em cache.
    function nomeAutor(m) {
        const lista = ((state.grupo && state.grupo.participantes) || []).concat(state.contatos || []);
        const p = lista.find(x => x.id === m.autor_prof_id);
        if (!p) return 'Alguém';
        const partes = String(p.nome || '').trim().split(/\s+/);
        return partes.length > 1 ? partes[0] + ' ' + partes[partes.length - 1] : partes[0];
    }

    // No grupo, a mensagem está "lida" quando todo mundo (menos eu) já leu
    // até depois dela.
    function lidaPorTodos(m) {
        const outros = ((state.grupo && state.grupo.participantes) || []).filter(p => p.id !== state.eu.id);
        if (!outros.length) return false;
        const t = new Date(m.criado_em).getTime();
        return outros.every(p => p.ultima_leitura_em && new Date(p.ultima_leitura_em).getTime() >= t);
    }

    async function carregarGrupo(conversaId) {
        try {
            const { data, error } = await c().rpc('chat_grupo_info', { p_conversa: conversaId });
            if (error) throw error;
            state.grupo = (data && data.ok) ? data : null;
        } catch (err) {
            console.warn('[chat] grupo:', err);
            state.grupo = null;
        }
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
            const classes = ['chat-conv', cv.tipo === 'externa' ? 'externa' : '', cv.tipo === 'grupo' ? 'grupo' : '',
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
        state.grupo = null;
        app().classList.add('aberta');
        renderLista();
        renderThread(true);

        try {
            const pedidos = [carregarMensagens(id)];
            if (conv.tipo === 'grupo') { pedidos.push(carregarGrupo(id)); pedidos.push(garantirContatos()); }
            state.mensagens = (await Promise.all(pedidos))[0];
        } catch (err) {
            console.error('[chat] mensagens:', err);
            toast('Não foi possível abrir a conversa.', 'danger');
        }
        if (!state.ativa || state.ativa.id !== conv.id) return;   // trocou de conversa no meio
        renderThread(false);
        if (Number(conv.nao_lidas || 0) > 0 || conv.tipo === 'grupo'
            || state.mensagens.some(m => !minha(m) && !sistema(m) && !m.lida_em)) {
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
        state.grupo = null;
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
        const grp = conv.tipo === 'grupo';
        const chip = ext ? '<span class="chat-cab-chip externa">Externo</span>'
                   : grp ? '<span class="chat-cab-chip grupo">Grupo</span>'
                   : '<span class="chat-cab-chip">Equipe</span>';
        alvo.innerHTML = `
            <div class="chat-cab ${grp ? 'clicavel' : ''}" ${grp ? 'id="chat-cab-grupo" title="Participantes do grupo"' : ''}>
                <button class="chat-cab-voltar" id="chat-voltar" aria-label="Voltar">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>
                </button>
                ${avatarHtml(conv)}
                <div class="chat-cab-info">
                    <div class="chat-cab-nome" id="chat-cab-nome">${esc(conv.outro?.nome || '—')}</div>
                    <div class="chat-cab-sub" id="chat-cab-sub">${esc(subtitulo(conv))}</div>
                </div>
                ${chip}
                ${grp ? `<button class="chat-cab-btn" id="chat-btn-grupo" title="Participantes" aria-label="Participantes">${GRUPO_SVG}</button>` : ''}
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

        document.getElementById('chat-voltar').addEventListener('click', (e) => { e.stopPropagation(); fecharConversa(); });
        const btnGrupo = document.getElementById('chat-btn-grupo');
        if (btnGrupo) {
            btnGrupo.addEventListener('click', (e) => { e.stopPropagation(); abrirPainelGrupo(); });
            document.getElementById('chat-cab-grupo').addEventListener('click', abrirPainelGrupo);
        }
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
        if (sistema(m)) {
            return `<div class="chat-sistema" data-msg="${esc(m.id)}">${esc(m.texto)} · ${hhmm(dataLocal(m.criado_em))}</div>`;
        }
        const eh = minha(m);
        const ext = m.autor_tipo === 'externo';
        const grp = state.ativa && state.ativa.tipo === 'grupo';
        const lida = grp ? lidaPorTodos(m) : !!m.lida_em;
        const ticks = eh
            ? `<span class="msg-tick ${lida ? 'lida' : ''}" title="${lida ? (grp ? 'Lida por todos' : 'Lida') : 'Enviada'}">${lida ? '✓✓' : '✓'}</span>`
            : '';
        const autor = (grp && !eh)
            ? `<div class="msg-autor tom-${tom(nomeAutor(m))}">${esc(nomeAutor(m))}</div>`
            : '';
        return `
            <div class="msg ${eh ? 'minha' : 'outra'} ${ext ? 'externa' : ''}" data-msg="${esc(m.id)}">
                ${autor}
                <div class="msg-balao">${esc(m.texto)}</div>
                <div class="msg-meta">${ticks}<span>${hhmm(dataLocal(m.criado_em))}</span></div>
            </div>`;
    }

    // No grupo, os tiques das minhas dependem de quem já leu: refaz todos.
    function atualizarTicksGrupo() {
        if (!state.ativa || state.ativa.tipo !== 'grupo') return;
        state.mensagens.filter(minha).forEach(m => {
            const el = document.querySelector(`[data-msg="${CSS.escape(m.id)}"] .msg-tick`);
            if (!el) return;
            const lida = lidaPorTodos(m);
            el.classList.toggle('lida', lida);
            el.textContent = lida ? '✓✓' : '✓';
            el.title = lida ? 'Lida por todos' : 'Enviada';
        });
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
        let texto = String(m.texto || '').replace(/\s+/g, ' ');
        if (conv.tipo === 'grupo' && m.autor_tipo === 'profissional') {
            const nome = minha(m) ? String(state.eu.nome_completo || '').split(/\s+/)[0] : nomeAutor(m).split(' ')[0];
            if (nome && nome !== 'Alguém') texto = nome + ': ' + texto;
        }
        conv.ultima_previa = texto.slice(0, 120);
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
            // de um profissional externo, ou grupo em que acabei de entrar).
            carregarConversas();
            if (!minha(m) && !sistema(m)) toast('💬 Nova mensagem', 'info');
            return;
        }

        atualizarPrevia(conv, m);
        const aberta = state.ativa && state.ativa.id === conv.id;

        if (aberta) {
            acrescentarMensagem(m);
            if (!minha(m) && !sistema(m)) marcarLida(conv);
            // Mensagem de sistema = alguém entrou, saiu ou renomeou: refaz o
            // cabeçalho e os participantes.
            if (sistema(m) && conv.tipo === 'grupo') {
                carregarGrupo(conv.id).then(() => { atualizarCabecalhoGrupo(); atualizarTicksGrupo(); });
                carregarConversas();
            }
        } else if (!minha(m) && !sistema(m)) {
            conv.nao_lidas = Number(conv.nao_lidas || 0) + 1;
            toast('💬 ' + (conv.outro?.nome || 'Nova mensagem'), 'info');
            if (window.CortexChatBadge) window.CortexChatBadge.atualizar();
        } else if (sistema(m) && conv.tipo === 'grupo') {
            carregarConversas();   // nome ou nº de membros pode ter mudado
        }
        renderLista();
    }

    // Participantes: quem leu até quando (tique duplo), entradas e saídas.
    function aoMudarParticipante(payload) {
        const novo = payload.new || {};
        const velho = payload.old || {};
        const eu = state.eu.id;

        if (payload.eventType === 'UPDATE') {
            if (state.ativa && state.ativa.tipo === 'grupo' && novo.conversa_id === state.ativa.id && state.grupo) {
                const p = (state.grupo.participantes || []).find(x => x.id === novo.prof_id);
                if (p) { p.ultima_leitura_em = novo.ultima_leitura_em; atualizarTicksGrupo(); }
            }
            return;
        }
        if (payload.eventType === 'INSERT' && novo.prof_id === eu) {
            carregarConversas();
            toast('👥 Você entrou em um grupo', 'info');
            if (window.CortexChatBadge) window.CortexChatBadge.atualizar();
            return;
        }
        if (payload.eventType === 'DELETE' && velho.prof_id === eu) {
            if (state.ativa && state.ativa.id === velho.conversa_id) {
                fecharConversa();
                toast('Você não está mais neste grupo.', 'info');
            }
            carregarConversas();
            if (window.CortexChatBadge) window.CortexChatBadge.atualizar();
            return;
        }
        // Entrou ou saiu outra pessoa do grupo aberto: a mensagem de sistema
        // que vem junto já recarrega os participantes.
    }

    function atualizarCabecalhoGrupo() {
        if (!state.ativa || state.ativa.tipo !== 'grupo') return;
        const conv = state.conversas.find(x => x.id === state.ativa.id) || state.ativa;
        if (state.grupo && state.grupo.nome) conv.outro = Object.assign({}, conv.outro, { nome: state.grupo.nome, membros: (state.grupo.participantes || []).length });
        const n = document.getElementById('chat-cab-nome');
        const s = document.getElementById('chat-cab-sub');
        if (n) n.textContent = conv.outro?.nome || '—';
        if (s) s.textContent = subtitulo(conv);
    }

    function assinarRealtime() {
        if (state.canal) return;
        try {
            state.canal = c()
                .channel('cortex-chat-' + state.eu.id)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_mensagens' }, aoChegar)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_participantes' }, aoMudarParticipante)
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
            if (novas && (data || []).some(m => !minha(m) && !sistema(m))) marcarLida(conv);
            if (conv.tipo === 'grupo') { await carregarGrupo(conv.id); atualizarCabecalhoGrupo(); atualizarTicksGrupo(); }
        } catch (err) {
            console.warn('[chat] sincronizar:', err);
        }
    }

    // ── Nova conversa / novo grupo ─────────────────────────────────────────

    async function garantirContatos() {
        if (state.contatos) return state.contatos;
        try {
            const { data, error } = await c().rpc('chat_contatos');
            if (error) throw error;
            state.contatos = Array.isArray(data) ? data : [];
        } catch (err) {
            console.error('[chat] contatos:', err);
            state.contatos = [];
            toast('Não foi possível carregar a equipe.', 'danger');
        }
        return state.contatos;
    }

    // Modal genérico: devolve { fundo, fechar }.
    function abrirModal(html, rotulo) {
        let fundo = document.getElementById('chat-modal-fundo');
        if (fundo) fundo.remove();
        fundo = document.createElement('div');
        fundo.id = 'chat-modal-fundo';
        fundo.className = 'chat-modal-fundo';
        fundo.innerHTML = `<div class="chat-modal" role="dialog" aria-label="${esc(rotulo || '')}">${html}</div>`;
        document.body.appendChild(fundo);
        const escTecla = (e) => { if (e.key === 'Escape') fechar(); };
        const fechar = () => { fundo.remove(); document.removeEventListener('keydown', escTecla); };
        document.addEventListener('keydown', escTecla);
        fundo.addEventListener('click', (e) => { if (e.target === fundo) fechar(); });
        fundo.querySelectorAll('[data-fechar]').forEach(b => b.addEventListener('click', fechar));
        return { fundo, fechar };
    }

    const FECHAR_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    const BUSCA_SVG  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/></svg>';

    function linhaContato(p, extra) {
        return `${avatarHtml({ tipo: 'interna', outro: p })}
                <div class="chat-contato-corpo">
                    <div class="chat-contato-nome">${esc(p.nome)}</div>
                    <div class="chat-contato-sub">${esc([perfilLabel(p.perfil), p.especialidade].filter(Boolean).join(' · '))}</div>
                </div>${extra || ''}`;
    }

    async function abrirNova(abaInicial) {
        const { fechar, fundo } = abrirModal(`
            <div class="chat-modal-cab">
                <div class="chat-lista-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></div>
                <h2>Nova conversa</h2>
                <button class="chat-modal-fechar" data-fechar aria-label="Fechar">${FECHAR_SVG}</button>
            </div>
            <div class="chat-abas">
                <button class="chat-aba" data-aba="pessoa">Pessoa</button>
                <button class="chat-aba" data-aba="grupo">${GRUPO_SVG} Grupo</button>
            </div>
            <div class="chat-modal-corpo" id="chat-nova-corpo">
                <div class="loading-state"><div class="spinner"></div><p>Carregando a equipe...</p></div>
            </div>`, 'Nova conversa');

        const contatos = await garantirContatos();
        if (!document.getElementById('chat-nova-corpo')) return;   // fechou enquanto carregava

        const selecionados = new Set();
        let aba = abaInicial || 'pessoa';

        function pintar() {
            fundo.querySelectorAll('.chat-aba').forEach(b => b.classList.toggle('ativa', b.dataset.aba === aba));
            const corpo = document.getElementById('chat-nova-corpo');
            if (!corpo) return;

            if (aba === 'pessoa') {
                corpo.innerHTML = `
                    <div class="chat-busca">${BUSCA_SVG}<input type="text" id="chat-nova-busca" placeholder="Buscar na equipe" autocomplete="off"></div>
                    <div class="chat-contatos" id="chat-nova-lista"></div>`;
                const busca = document.getElementById('chat-nova-busca');
                const lista = () => {
                    const q = busca.value.trim().toLowerCase();
                    const l = contatos.filter(p => !q || String(p.nome || '').toLowerCase().includes(q));
                    const alvo = document.getElementById('chat-nova-lista');
                    alvo.innerHTML = l.length
                        ? l.map(p => `<button class="chat-contato" data-prof="${esc(p.id)}">${linhaContato(p)}</button>`).join('')
                        : `<div class="chat-contatos-vazio">${q ? 'Ninguém com esse nome.' : 'Nenhum outro profissional ativo.'}</div>`;
                    alvo.querySelectorAll('[data-prof]').forEach(b => b.addEventListener('click', async () => {
                        fechar();
                        await conversarCom(b.dataset.prof);
                    }));
                    pintarFotos();
                };
                busca.addEventListener('input', lista);
                lista();
                setTimeout(() => busca.focus(), 50);
                return;
            }

            corpo.innerHTML = `
                <div class="chat-grupo-nome">
                    <input type="text" id="chat-grupo-nome" maxlength="80" placeholder="Nome do grupo (ex.: Equipe EQ2)" autocomplete="off">
                </div>
                <div class="chat-busca">${BUSCA_SVG}<input type="text" id="chat-nova-busca" placeholder="Quem entra?" autocomplete="off"></div>
                <div class="chat-contatos" id="chat-nova-lista"></div>
                <div class="chat-modal-rodape">
                    <span id="chat-grupo-conta">Ninguém escolhido ainda</span>
                    <button class="chat-btn-nova" id="chat-grupo-criar" disabled>Criar grupo</button>
                </div>`;
            const busca = document.getElementById('chat-nova-busca');
            const nomeInp = document.getElementById('chat-grupo-nome');
            const btn = document.getElementById('chat-grupo-criar');
            const conta = () => {
                const n = selecionados.size;
                document.getElementById('chat-grupo-conta').textContent =
                    n ? `${n} pessoa${n > 1 ? 's' : ''} + você` : 'Ninguém escolhido ainda';
                btn.disabled = !(n > 0 && nomeInp.value.trim());
            };
            const lista = () => {
                const q = busca.value.trim().toLowerCase();
                const l = contatos.filter(p => !q || String(p.nome || '').toLowerCase().includes(q));
                const alvo = document.getElementById('chat-nova-lista');
                alvo.innerHTML = l.length
                    ? l.map(p => `<button class="chat-contato chat-check ${selecionados.has(p.id) ? 'marcado' : ''}" data-prof="${esc(p.id)}">
                                    ${linhaContato(p, '<span class="chat-check-caixa"></span>')}
                                  </button>`).join('')
                    : `<div class="chat-contatos-vazio">${q ? 'Ninguém com esse nome.' : 'Nenhum outro profissional ativo.'}</div>`;
                alvo.querySelectorAll('[data-prof]').forEach(b => b.addEventListener('click', () => {
                    const id = b.dataset.prof;
                    if (selecionados.has(id)) selecionados.delete(id); else selecionados.add(id);
                    b.classList.toggle('marcado', selecionados.has(id));
                    conta();
                }));
                pintarFotos();
            };
            busca.addEventListener('input', lista);
            nomeInp.addEventListener('input', conta);
            btn.addEventListener('click', async () => {
                btn.disabled = true;
                const ok = await criarGrupo(nomeInp.value.trim(), Array.from(selecionados));
                if (ok) fechar(); else btn.disabled = false;
            });
            lista();
            conta();
            setTimeout(() => nomeInp.focus(), 50);
        }

        fundo.querySelectorAll('.chat-aba').forEach(b => b.addEventListener('click', () => { aba = b.dataset.aba; pintar(); }));
        pintar();
    }

    async function criarGrupo(nome, membros) {
        try {
            const { data, error } = await c().rpc('chat_criar_grupo', { p_nome: nome, p_membros: membros });
            if (error) throw error;
            if (!data || !data.ok) {
                const msgs = { nome_invalido: 'Dê um nome ao grupo (até 80 letras).', sem_membros: 'Escolha pelo menos uma pessoa.' };
                toast(msgs[data && data.erro] || 'Não foi possível criar o grupo.', 'danger');
                return false;
            }
            await carregarConversas();
            await abrirConversa(data.conversa_id);
            toast('👥 Grupo criado', 'success');
            return true;
        } catch (err) {
            console.error('[chat] criar grupo:', err);
            toast('Erro de conexão.', 'danger');
            return false;
        }
    }

    // ── Painel do grupo: participantes, adicionar, remover, renomear, sair ──

    async function abrirPainelGrupo() {
        const conv = state.ativa;
        if (!conv || conv.tipo !== 'grupo') return;
        await carregarGrupo(conv.id);
        const g = state.grupo;
        if (!g) { toast('Não foi possível abrir o grupo.', 'danger'); return; }

        const { fechar, fundo } = abrirModal('', 'Grupo');

        function pintar() {
            const g = state.grupo;
            const eu = state.eu.id;
            const parts = (g.participantes || []).slice().sort((a, b) => (a.id === eu ? -1 : b.id === eu ? 1 : 0));
            fundo.querySelector('.chat-modal').innerHTML = `
                <div class="chat-modal-cab">
                    <div class="chat-av grupo">${GRUPO_SVG}</div>
                    <div class="chat-grupo-tit">
                        ${g.posso_gerenciar
                            ? `<input type="text" id="chat-grupo-renomear" class="chat-grupo-nome-inp" value="${esc(g.nome)}" maxlength="80" title="Clique para renomear">`
                            : `<h2>${esc(g.nome)}</h2>`}
                        <div class="chat-grupo-sub">${parts.length} participante${parts.length === 1 ? '' : 's'}</div>
                    </div>
                    <button class="chat-modal-fechar" data-fechar aria-label="Fechar">${FECHAR_SVG}</button>
                </div>
                <div class="chat-contatos chat-grupo-lista">
                    ${parts.map(p => `
                        <div class="chat-contato chat-grupo-membro ${p.id === eu ? 'eu' : ''}">
                            ${linhaContato(p)}
                            ${p.id === g.criado_por ? '<span class="chat-tag">criou</span>' : ''}
                            ${p.id === eu ? '<span class="chat-tag eu">você</span>' : ''}
                            ${(g.posso_gerenciar && p.id !== eu) ? `<button class="chat-grupo-remover" data-remover="${esc(p.id)}" title="Remover do grupo">${FECHAR_SVG}</button>` : ''}
                        </div>`).join('')}
                </div>
                <div class="chat-modal-rodape">
                    <button class="btn btn-secondary" id="chat-grupo-sair">Sair do grupo</button>
                    <button class="chat-btn-nova" id="chat-grupo-add">+ Adicionar</button>
                </div>`;

            fundo.querySelectorAll('[data-fechar]').forEach(b => b.addEventListener('click', fechar));
            pintarFotos();

            const ren = document.getElementById('chat-grupo-renomear');
            if (ren) {
                const salvar = async () => {
                    const nome = ren.value.trim();
                    if (!nome || nome === g.nome) { ren.value = g.nome; return; }
                    const { data, error } = await c().rpc('chat_grupo_renomear', { p_conversa: conv.id, p_nome: nome });
                    if (error || !data || !data.ok) { toast('Não foi possível renomear.', 'danger'); ren.value = g.nome; return; }
                    g.nome = data.nome;
                    atualizarCabecalhoGrupo();
                    carregarConversas();
                    toast('Grupo renomeado', 'success');
                };
                ren.addEventListener('change', salvar);
                ren.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); ren.blur(); } });
            }

            fundo.querySelectorAll('[data-remover]').forEach(b => b.addEventListener('click', async () => {
                const id = b.dataset.remover;
                const p = parts.find(x => x.id === id);
                const seguir = async () => {
                    const { data, error } = await c().rpc('chat_grupo_remover', { p_conversa: conv.id, p_prof: id });
                    if (error || !data || !data.ok) { toast('Não foi possível remover.', 'danger'); return; }
                    await carregarGrupo(conv.id);
                    atualizarCabecalhoGrupo();
                    pintar();
                };
                if (window.CortexConfirm) {
                    window.CortexConfirm.mostrar({ icone: '👥', titulo: `Remover ${esc(p ? p.nome.split(' ')[0] : 'esta pessoa')} do grupo?`,
                        texto: 'A pessoa deixa de ver as mensagens a partir de agora.', btnSim: 'Remover', btnSimDanger: true, onSim: seguir });
                } else if (confirm('Remover do grupo?')) { await seguir(); }
            }));

            document.getElementById('chat-grupo-sair').addEventListener('click', async () => {
                const seguir = async () => {
                    const { data, error } = await c().rpc('chat_grupo_remover', { p_conversa: conv.id });
                    if (error || !data || !data.ok) { toast('Não foi possível sair.', 'danger'); return; }
                    fechar();
                    fecharConversa();
                    await carregarConversas();
                    toast('Você saiu do grupo.', 'info');
                };
                if (window.CortexConfirm) {
                    window.CortexConfirm.mostrar({ icone: '🚪', titulo: `Sair de "${esc(g.nome)}"?`,
                        texto: 'Você deixa de receber as mensagens deste grupo. Alguém pode te adicionar de novo.',
                        btnSim: 'Sair', btnSimDanger: true, onSim: seguir });
                } else if (confirm('Sair do grupo?')) { await seguir(); }
            });

            // O seletor de adicionar substitui este modal; ao terminar, reabre o painel.
            document.getElementById('chat-grupo-add').addEventListener('click', () => adicionarPessoas(conv, abrirPainelGrupo));
        }

        pintar();
    }

    async function adicionarPessoas(conv, depois) {
        const contatos = await garantirContatos();
        const dentro = new Set((state.grupo?.participantes || []).map(p => p.id));
        const fora = contatos.filter(p => !dentro.has(p.id));
        const selecionados = new Set();

        const { fechar, fundo } = abrirModal(`
            <div class="chat-modal-cab">
                <div class="chat-lista-ico">${GRUPO_SVG}</div>
                <h2>Adicionar ao grupo</h2>
                <button class="chat-modal-fechar" data-fechar aria-label="Fechar">${FECHAR_SVG}</button>
            </div>
            <div class="chat-busca">${BUSCA_SVG}<input type="text" id="chat-add-busca" placeholder="Buscar na equipe" autocomplete="off"></div>
            <div class="chat-contatos" id="chat-add-lista"></div>
            <div class="chat-modal-rodape">
                <span id="chat-add-conta">Ninguém escolhido ainda</span>
                <button class="chat-btn-nova" id="chat-add-ok" disabled>Adicionar</button>
            </div>`, 'Adicionar ao grupo');

        const busca = document.getElementById('chat-add-busca');
        const btn = document.getElementById('chat-add-ok');
        const conta = () => {
            const n = selecionados.size;
            document.getElementById('chat-add-conta').textContent = n ? `${n} escolhida${n > 1 ? 's' : ''}` : 'Ninguém escolhido ainda';
            btn.disabled = n === 0;
        };
        const lista = () => {
            const q = busca.value.trim().toLowerCase();
            const l = fora.filter(p => !q || String(p.nome || '').toLowerCase().includes(q));
            const alvo = document.getElementById('chat-add-lista');
            alvo.innerHTML = l.length
                ? l.map(p => `<button class="chat-contato chat-check ${selecionados.has(p.id) ? 'marcado' : ''}" data-prof="${esc(p.id)}">
                                ${linhaContato(p, '<span class="chat-check-caixa"></span>')}
                              </button>`).join('')
                : `<div class="chat-contatos-vazio">${q ? 'Ninguém com esse nome.' : 'Todo mundo da equipe já está no grupo.'}</div>`;
            alvo.querySelectorAll('[data-prof]').forEach(b => b.addEventListener('click', () => {
                const id = b.dataset.prof;
                if (selecionados.has(id)) selecionados.delete(id); else selecionados.add(id);
                b.classList.toggle('marcado', selecionados.has(id));
                conta();
            }));
            pintarFotos();
        };
        busca.addEventListener('input', lista);
        btn.addEventListener('click', async () => {
            btn.disabled = true;
            try {
                const { data, error } = await c().rpc('chat_grupo_adicionar', { p_conversa: conv.id, p_membros: Array.from(selecionados) });
                if (error || !data || !data.ok) throw new Error((data && data.erro) || 'falha');
                toast(`${data.adicionados} adicionad${data.adicionados === 1 ? 'a' : 'as'} ao grupo`, 'success');
                fechar();
                await carregarGrupo(conv.id);
                atualizarCabecalhoGrupo();
                carregarConversas();
                if (typeof depois === 'function') depois();
            } catch (err) {
                console.error('[chat] adicionar:', err);
                toast('Não foi possível adicionar.', 'danger');
                btn.disabled = false;
            }
        });
        lista();
        conta();
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

        document.getElementById('chat-nova').addEventListener('click', () => abrirNova('pessoa'));
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

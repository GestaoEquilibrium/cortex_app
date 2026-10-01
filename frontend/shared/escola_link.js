// ============================================================================
// CORTEX_APP — Link da Escola (botão na Bateria)
// ----------------------------------------------------------------------------
// Um botão por paciente que monta o acesso da escola: você marca quais
// aplicações pendentes a escola vai responder e recebe o link e o QR.
//
// Módulo autossuficiente de propósito: ele se pendura sozinho depois do
// #back-link, que está no HTML fixo da bateria. Assim não precisa editar o
// bateria.js, que muda a cada sprint — menos chance de atropelar algo.
//
// API: window.CortexEscolaLink.abrir(pacienteId)
// ============================================================================

window.CortexEscolaLink = (function () {
    'use strict';

    const BASE_PUBLICA = 'https://cortexneuro.com.br';
    const DIAS_PADRAO = 30;

    // Quem o catálogo diz que é da escola. Serve só para pré-marcar: você
    // pode marcar qualquer uma.
    const DA_ESCOLA = ['professor', 'responsavel_ou_professor'];

    const ROTULO_RESP = {
        paciente: 'o próprio paciente',
        responsavel: 'pais ou responsável',
        professor: 'professor',
        paciente_ou_responsavel: 'paciente ou responsável',
        responsavel_ou_professor: 'responsável ou professor'
    };

    const c = () => window.cortexClient;
    const toast = (m, t) => { if (window.CortexUI && window.CortexUI.toast) window.CortexUI.toast(m, t); };

    function esc(t) {
        const d = document.createElement('div');
        d.textContent = (t === null || t === undefined) ? '' : String(t);
        return d.innerHTML;
    }

    function dataBR(iso) {
        if (!iso) return '—';
        const p = String(iso).substring(0, 10).split('-');
        return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : '—';
    }

    const estado = {
        pacienteId: null,
        paciente: null,
        aplicacoes: [],
        acesso: null,
        noLink: {},      // aplicacao_id -> true (está no link atual)
        respondidas: {}, // aplicacao_id -> quem respondeu
        marcadas: {},
        token: null      // só existe logo depois de gerar
    };

    // ── Dados ───────────────────────────────────────────────────────────────

    async function carregar(pacienteId) {
        const { data: pac } = await c()
            .from('pacientes').select('id, nome_completo').eq('id', pacienteId).single();
        estado.paciente = pac;

        const { data: apls, error } = await c()
            .from('aplicacoes_instrumento')
            .select('id, status, instrumento_id, instrumentos_catalogo(sigla, nome_completo, tipo_respondente)')
            .eq('paciente_id', pacienteId)
            .is('finalizada_em', null)
            .order('created_at');
        if (error) throw error;

        estado.aplicacoes = (apls || []).map(a => ({
            id: a.id,
            status: a.status,
            sigla: (a.instrumentos_catalogo || {}).sigla || '—',
            nome: (a.instrumentos_catalogo || {}).nome_completo || '',
            resp: (a.instrumentos_catalogo || {}).tipo_respondente || 'paciente'
        }));

        const { data: ac } = await c()
            .from('escola_acessos').select('*').eq('paciente_id', pacienteId).maybeSingle();
        estado.acesso = ac || null;

        estado.noLink = {};
        estado.respondidas = {};
        if (ac) {
            const { data: itens } = await c()
                .from('escola_acesso_itens').select('aplicacao_id').eq('acesso_id', ac.id);
            (itens || []).forEach(i => { estado.noLink[i.aplicacao_id] = true; });

            const { data: resp } = await c()
                .from('escola_respostas')
                .select('aplicacao_id, respondente_nome, escola_nome, respondido_em')
                .eq('acesso_id', ac.id);
            (resp || []).forEach(r => { estado.respondidas[r.aplicacao_id] = r; });
        }

        // Pré-marca: o que já está no link; se não há link, as de professor.
        estado.marcadas = {};
        estado.aplicacoes.forEach(a => {
            if (estado.respondidas[a.id]) return;
            estado.marcadas[a.id] = ac ? !!estado.noLink[a.id] : DA_ESCOLA.indexOf(a.resp) >= 0;
        });
    }

    // ── Janela ──────────────────────────────────────────────────────────────

    function fechar() {
        const o = document.getElementById('esl-overlay');
        if (o) o.remove();
        document.removeEventListener('keydown', aoEscape);
    }
    function aoEscape(ev) { if (ev.key === 'Escape') fechar(); }

    function abrirJanela() {
        fechar();
        const o = document.createElement('div');
        o.id = 'esl-overlay';
        o.className = 'esl-overlay';
        o.innerHTML = `
            <div class="esl-janela" role="dialog" aria-modal="true">
                <div class="esl-cab">
                    <div>
                        <h2>Link da escola</h2>
                        <p>${esc((estado.paciente || {}).nome_completo || '')}</p>
                    </div>
                    <button class="esl-x" id="esl-fechar" aria-label="Fechar">×</button>
                </div>
                <div class="esl-corpo" id="esl-corpo"></div>
            </div>`;
        o.addEventListener('click', ev => { if (ev.target === o) fechar(); });
        document.body.appendChild(o);
        document.getElementById('esl-fechar').addEventListener('click', fechar);
        document.addEventListener('keydown', aoEscape);
    }

    function renderSelecao() {
        const corpo = document.getElementById('esl-corpo');
        if (!corpo) return;

        const ac = estado.acesso;
        const vivo = ac && ac.ativo && new Date(ac.expira_em) > new Date();

        const linhas = estado.aplicacoes.map(a => {
            const r = estado.respondidas[a.id];
            if (r) {
                return `
                    <div class="esl-item feita">
                        <span class="esl-check">✓</span>
                        <span class="esl-item-mid">
                            <span class="esl-sigla">${esc(a.sigla)}</span>
                            <span class="esl-nome">${esc(a.nome)}</span>
                            <span class="esl-sub">Respondida em ${dataBR(r.respondido_em)}${r.respondente_nome ? ' por ' + esc(r.respondente_nome) : ''}</span>
                        </span>
                    </div>`;
            }
            const daEscola = DA_ESCOLA.indexOf(a.resp) >= 0;
            return `
                <label class="esl-item">
                    <input type="checkbox" data-id="${esc(a.id)}" ${estado.marcadas[a.id] ? 'checked' : ''}>
                    <span class="esl-item-mid">
                        <span class="esl-sigla">${esc(a.sigla)}</span>
                        <span class="esl-nome">${esc(a.nome)}</span>
                        <span class="esl-sub ${daEscola ? 'ok' : 'alerta'}">
                            ${daEscola ? '🏫' : '⚠'} Responde: ${esc(ROTULO_RESP[a.resp] || a.resp)}
                        </span>
                    </span>
                </label>`;
        }).join('');

        corpo.innerHTML = `
            ${vivo ? `<div class="esl-aviso info">
                Já existe um link ativo, válido até <strong>${dataBR(ac.expira_em)}</strong>${ac.respondente_nome
                    ? `, aberto por <strong>${esc(ac.respondente_nome)}</strong> (${esc(ac.escola_nome || '—')})` : ', ainda não aberto'}.
                Gerar de novo <strong>invalida o link anterior</strong> e pede identificação nova.
            </div>` : ''}

            <p class="esl-texto">
                Marque o que a escola vai responder. O que já foi respondido fica
                guardado e não some ao gerar um link novo.
            </p>

            <div class="esl-lista">${linhas || '<div class="esl-aviso info">Este paciente não tem aplicações pendentes na bateria.</div>'}</div>

            <div class="esl-aviso alerta" id="esl-alerta" style="display:none;"></div>

            <div class="esl-acoes">
                <button class="btn btn-primary" id="esl-gerar">
                    ${vivo ? 'Gerar link novo' : 'Gerar link da escola'}
                </button>
                ${vivo ? '<button class="btn btn-secondary" id="esl-ver">Ver link atual</button>' : ''}
            </div>
            ${vivo ? '<button class="esl-link-acao esl-perigo" id="esl-revogar">Encerrar o acesso da escola</button>' : ''}`;

        corpo.querySelectorAll('input[type=checkbox]').forEach(ch => {
            ch.addEventListener('change', () => {
                estado.marcadas[ch.dataset.id] = ch.checked;
                avisarForaDoPerfil();
            });
        });
        avisarForaDoPerfil();

        document.getElementById('esl-gerar').addEventListener('click', gerar);
        const ver = document.getElementById('esl-ver');
        if (ver) ver.addEventListener('click', () => renderLink(null));
        const rev = document.getElementById('esl-revogar');
        if (rev) rev.addEventListener('click', revogar);
    }

    // Avisa quando alguma marcada não é de professor. Não bloqueia: você
    // decide. Mas é melhor ver antes de mandar para a escola uma escala que
    // o catálogo diz ser dos pais.
    function avisarForaDoPerfil() {
        const el = document.getElementById('esl-alerta');
        if (!el) return;
        const fora = estado.aplicacoes.filter(a =>
            estado.marcadas[a.id] && !estado.respondidas[a.id] && DA_ESCOLA.indexOf(a.resp) < 0);
        if (!fora.length) { el.style.display = 'none'; return; }
        el.style.display = 'block';
        el.innerHTML = `<strong>Confira:</strong> ${fora.map(a => esc(a.sigla)).join(', ')}
            ${fora.length === 1 ? 'não é' : 'não são'} de professor no catálogo.
            Pode mandar assim mesmo — só não passe despercebido.`;
    }

    async function gerar() {
        const ids = Object.keys(estado.marcadas).filter(k => estado.marcadas[k]);
        if (!ids.length) { toast('Marque pelo menos uma escala.', 'danger'); return; }

        const btn = document.getElementById('esl-gerar');
        btn.disabled = true;
        const rotulo = btn.textContent;
        btn.textContent = 'Gerando…';

        try {
            const { data, error } = await c().rpc('escola_gerar_link', {
                p_paciente_id: estado.pacienteId,
                p_aplicacao_ids: ids,
                p_dias: DIAS_PADRAO
            });
            if (error) throw error;
            if (!data || data.erro) {
                const m = {
                    sem_profissional: 'Seu usuário não está ligado a um profissional.',
                    nenhuma_escala: 'Marque pelo menos uma escala.',
                    aplicacao_de_outro_paciente: 'Uma das escalas não é deste paciente.'
                };
                toast(m[data && data.erro] || 'Não foi possível gerar o link.', 'danger');
                btn.disabled = false;
                btn.textContent = rotulo;
                return;
            }

            estado.token = data.token;
            if (window.CortexAudit) {
                window.CortexAudit.log('criacao', 'escola_acessos', data.acesso_id, {
                    pacienteId: estado.pacienteId,
                    detalhes: { operacao: 'gerar_link_escola', escalas: ids.length }
                });
            }
            await carregar(estado.pacienteId);
            renderLink(data);
        } catch (err) {
            console.error('[escola_link]', err);
            toast('Erro ao gerar o link: ' + (err.message || 'desconhecido'), 'danger');
            btn.disabled = false;
            btn.textContent = rotulo;
        }
    }

    function urlDoToken(token) {
        return `${BASE_PUBLICA}/escola/?t=${encodeURIComponent(token)}`;
    }

    function renderLink(dados) {
        const corpo = document.getElementById('esl-corpo');
        if (!corpo) return;

        // O token em claro só existe no retorno do gerar: no banco fica o
        // hash. Reabrir a janela depois não traz o link de volta.
        const temToken = !!estado.token;
        const url = temToken ? urlDoToken(estado.token) : null;
        const ac = estado.acesso || {};
        const quantas = dados ? dados.escalas : Object.keys(estado.noLink).length;
        const primeiro = ((estado.paciente || {}).nome_completo || '').split(' ')[0];

        const msg = `Olá! Sou da equipe do Grupo Equilibrium. Estamos realizando a avaliação neuropsicológica do(a) aluno(a) ${primeiro} e a contribuição da escola é muito importante. Neste link vocês podem responder o questionário e anexar o relatório escolar, leva poucos minutos: ${url || ''}`;

        corpo.innerHTML = `
            <div class="esl-aviso bom">
                <strong>Link criado.</strong> ${quantas} escala${quantas === 1 ? '' : 's'} liberada${quantas === 1 ? '' : 's'},
                válido até <strong>${dataBR(ac.expira_em)}</strong>.
            </div>

            ${temToken ? `
                <div class="esl-qr-area">
                    <canvas id="esl-qr" class="esl-qr"></canvas>
                    <p class="esl-qr-txt">A escola pode escanear ou abrir o link.</p>
                </div>

                <div class="esl-url"><span id="esl-url-txt">${esc(url)}</span></div>

                <div class="esl-acoes">
                    <button class="btn btn-primary" id="esl-whats">Enviar no WhatsApp</button>
                    <button class="btn btn-secondary" id="esl-copiar">Copiar link</button>
                </div>
                <p class="esl-dica">
                    Guarde ou envie agora: por segurança o link não fica salvo no
                    sistema, só o seu resumo. Se perder, é só gerar outro.
                </p>
            ` : `
                <div class="esl-aviso alerta">
                    O link não pode ser mostrado de novo — no banco fica só o
                    resumo dele, nunca o endereço. Para enviar à escola outra vez,
                    gere um link novo (o anterior deixa de valer).
                </div>
                <div class="esl-acoes">
                    <button class="btn btn-secondary" id="esl-voltar">Voltar</button>
                </div>
            `}`;

        if (temToken) {
            desenharQr(url);
            document.getElementById('esl-copiar').addEventListener('click', async () => {
                try {
                    await navigator.clipboard.writeText(url);
                    toast('Link copiado.', 'success');
                } catch (e) {
                    const r = document.createRange();
                    r.selectNode(document.getElementById('esl-url-txt'));
                    window.getSelection().removeAllRanges();
                    window.getSelection().addRange(r);
                    toast('Selecionei o link — copie com Ctrl+C.', 'info');
                }
            });
            document.getElementById('esl-whats').addEventListener('click', () => {
                window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank');
            });
        } else {
            document.getElementById('esl-voltar').addEventListener('click', renderSelecao);
        }
    }

    // Carrega o gerador de QR sob demanda: a bateria não precisa dele no
    // carregamento da página só por causa deste botão.
    function carregarQrLib() {
        if (typeof window.qrcode === 'function') return Promise.resolve(true);
        return new Promise(resolve => {
            const s = document.createElement('script');
            s.src = '../shared/vendor/qrcode.js';
            s.onload = () => resolve(typeof window.qrcode === 'function');
            s.onerror = () => resolve(false);
            document.head.appendChild(s);
        });
    }

    async function desenharQr(url) {
        const cv = document.getElementById('esl-qr');
        if (!cv) return;
        const ok = await carregarQrLib();
        if (!ok) { cv.style.display = 'none'; return; }

        let qr = null;
        for (let t = 4; t <= 20 && !qr; t++) {
            try { const q = window.qrcode(t, 'M'); q.addData(url); q.make(); qr = q; } catch (e) { /* tenta o próximo */ }
        }
        if (!qr) { cv.style.display = 'none'; return; }

        const MARGEM = 4;                      // a norma pede 4 módulos de borda
        const n = qr.getModuleCount();
        const total = n + MARGEM * 2;
        const passo = Math.max(1, Math.floor(420 / total));   // inteiro: QR não pode borrar
        const px = passo * total;
        cv.width = px; cv.height = px;
        cv.style.width = '190px'; cv.style.height = '190px';
        const ctx = cv.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, px, px);
        ctx.fillStyle = '#000';
        for (let r = 0; r < n; r++) {
            for (let col = 0; col < n; col++) {
                if (qr.isDark(r, col)) ctx.fillRect((col + MARGEM) * passo, (r + MARGEM) * passo, passo, passo);
            }
        }
    }

    async function revogar() {
        const pergunta = 'Encerrar o acesso da escola?\n\nO link para de funcionar na hora. ' +
                         'As respostas já enviadas continuam guardadas.';
        let ok;
        if (window.CortexConfirm && window.CortexConfirm.mostrar) {
            ok = await window.CortexConfirm.mostrar({
                titulo: 'Encerrar o acesso da escola',
                mensagem: 'O link para de funcionar na hora. As respostas já enviadas continuam guardadas.',
                confirmar: 'Encerrar acesso',
                perigo: true
            });
        } else {
            ok = window.confirm(pergunta);
        }
        if (!ok) return;

        try {
            const { data, error } = await c().rpc('escola_revogar', { p_paciente_id: estado.pacienteId });
            if (error) throw error;
            if (!data || data.erro) { toast('Não foi possível encerrar.', 'danger'); return; }
            if (window.CortexAudit) {
                window.CortexAudit.log('edicao', 'escola_acessos', (estado.acesso || {}).id, {
                    pacienteId: estado.pacienteId, detalhes: { operacao: 'revogar_link_escola' }
                });
            }
            estado.token = null;
            toast('Acesso da escola encerrado.', 'success');
            await carregar(estado.pacienteId);
            renderSelecao();
        } catch (err) {
            console.error('[escola_link]', err);
            toast('Erro ao encerrar: ' + (err.message || 'desconhecido'), 'danger');
        }
    }

    // ── Entrada ─────────────────────────────────────────────────────────────

    async function abrir(pacienteId) {
        if (!pacienteId) return;
        estado.pacienteId = pacienteId;
        estado.token = null;
        abrirJanela();
        const corpo = document.getElementById('esl-corpo');
        corpo.innerHTML = '<div class="esl-carregando"><div class="esl-spinner"></div><p>Carregando a bateria…</p></div>';
        try {
            await carregar(pacienteId);
            renderSelecao();
        } catch (err) {
            console.error('[escola_link]', err);
            corpo.innerHTML = `<div class="esl-aviso ruim">Não foi possível carregar: ${esc(err.message || 'erro')}</div>`;
        }
    }

    // ── Botão ───────────────────────────────────────────────────────────────

    // Pendura o botão depois do #back-link, que mora no HTML fixo da bateria.
    // Se um dia esse elemento sair, cai para um botão flutuante em vez de
    // sumir sem avisar.
    function instalarBotao() {
        if (document.getElementById('esl-botao')) return;

        const params = new URLSearchParams(window.location.search);
        const pacienteId = params.get('paciente') || params.get('paciente_id') || params.get('id');
        if (!pacienteId) return;

        const b = document.createElement('button');
        b.id = 'esl-botao';
        b.className = 'esl-botao';
        b.type = 'button';
        b.innerHTML = '<span>🏫</span> Link da escola';
        b.addEventListener('click', () => abrir(pacienteId));

        const ancora = document.getElementById('back-link');
        if (ancora && ancora.parentNode) {
            b.classList.add('junto');
            ancora.parentNode.insertBefore(b, ancora.nextSibling);
        } else {
            b.classList.add('flutuante');
            document.body.appendChild(b);
        }
    }

    window.addEventListener('cortex:auth-ready', () => {
        // Espera o bateria.js montar a tela antes de pendurar o botão.
        setTimeout(instalarBotao, 0);
    });
    document.addEventListener('DOMContentLoaded', instalarBotao);

    return { abrir, instalarBotao };
})();

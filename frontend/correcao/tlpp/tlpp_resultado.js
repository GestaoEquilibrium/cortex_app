// ============================================================================
// CORTEX_APP — Correção TLPP (ANELE-4 · Tarefa de Leitura de Palavras e
// Pseudopalavras)
// ----------------------------------------------------------------------------
// URL: /correcao/tlpp/tlpp_resultado.html?aplicacao_id=<uuid>
//
// FLUXO (mesmo padrão do FDT / BPA-2):
//   1. Carrega aplicação + paciente + estímulos + normas + respostas + resultado
//   2. Sem tlpp_resultados → MODO EDIÇÃO (marcação dos 72 estímulos)
//      Com tlpp_resultados → MODO LAUDO (A4, PDF)
//   3. Edição: [💾 Salvar parcial] upsert em tlpp_respostas
//              [📊 Calcular e gerar laudo] motor local (tlpp_engine.js) →
//              upsert em tlpp_resultados + status 'corrigido'
//   4. Laudo:  [✏️ Editar marcação] [📄 Gerar PDF]
// ============================================================================

(function () {
    'use strict';

    const SIGLA = 'TLPP';
    const NOME  = 'Tarefa de Leitura de Palavras e Pseudopalavras';
    const E = window.TLPP_ENGINE;

    const CHIPS_OBS = [
        { label: 'Boa colaboração',      texto: 'Boa colaboração e engajamento na tarefa' },
        { label: 'Leitura silabada',     texto: 'Leitura silabada em vários estímulos, com produto final correto' },
        { label: 'Autocorreções',        texto: 'Realizou autocorreções espontâneas' },
        { label: 'Lentificação',         texto: 'Leitura lentificada, com latência aumentada nos estímulos longos' },
        { label: 'Ansiedade',            texto: 'Demonstrou ansiedade diante dos estímulos' },
        { label: 'Recusa parcial',       texto: 'Recusou-se a tentar a leitura de alguns estímulos' },
        { label: 'Dificuldade visual',   texto: 'Verificar acuidade visual (aproximou o rosto da folha / pediu para repetir)' },
        { label: 'Óculos',               texto: 'Utilizou óculos durante a aplicação' }
    ];

    // Estimativa de anos completos de estudo a partir do cadastro (confirmar na tela)
    const ANOS_POR_ESCOLARIDADE = [
        ['doutorado', 20], ['mestrado', 18], ['pós', 17], ['pos-grad', 17], ['pos grad', 17],
        ['superior completo', 16], ['superior incompleto', 14],
        ['médio completo', 12], ['medio completo', 12], ['médio incompleto', 10], ['medio incompleto', 10],
        ['fundamental ii completo', 9], ['fundamental ii incompleto', 7],
        ['fundamental i completo', 5], ['fundamental i incompleto', 3],
        ['fundamental completo', 9], ['fundamental incompleto', 5],
        ['educação infantil', 0], ['educacao infantil', 0], ['não alfabetizado', 0], ['nao alfabetizado', 0]
    ];

    const state = {
        aplicacaoId: null, aplicacao: null, paciente: null,
        estimulos: [], normas: [],
        itens: {}, grupo: null, anosEstudo: null, observacoes: '',
        resultado: null, modo: 'edicao', abertos: new Set(), sujo: false
    };

    // ────────────────────────────────────────────────────────────────────
    // Bootstrap
    // ────────────────────────────────────────────────────────────────────
    window.addEventListener('cortex:auth-ready', async () => {
        try {
            await CortexSidebar.render('pacientes');
            const params = new URLSearchParams(window.location.search);
            state.aplicacaoId = params.get('aplicacao_id');
            if (!state.aplicacaoId) throw new Error('Parâmetro aplicacao_id ausente na URL.');
            await carregarTudo();
            configurarBackLink();
            decidirModoERenderizar();
        } catch (err) {
            console.error('[tlpp] erro ao carregar:', err);
            document.getElementById('laudo-conteudo').innerHTML =
                `<div class="laudo-erro">Erro ao carregar: ${esc(err.message || String(err))}</div>`;
        }
    });

    window.addEventListener('beforeunload', (ev) => {
        if (state.modo === 'edicao' && state.sujo) { ev.preventDefault(); ev.returnValue = ''; }
    });

    function configurarBackLink() {
        const link = document.getElementById('back-link');
        if (link && state.paciente) link.href = `../../pacientes/pasta.html?id=${state.paciente.id}#bateria`;
    }

    // ────────────────────────────────────────────────────────────────────
    // Carga
    // ────────────────────────────────────────────────────────────────────
    async function carregarTudo() {
        const sb = window.cortexClient;

        const { data: aplicacao, error: errAp } = await sb
            .from('aplicacoes_instrumento')
            .select('id, paciente_id, data_aplicacao, data_conclusao, status, created_at, instrumentos_catalogo!inner(id, sigla, nome_completo)')
            .eq('id', state.aplicacaoId).single();
        if (errAp) throw errAp;
        if (aplicacao.instrumentos_catalogo.sigla !== SIGLA) throw new Error(`Aplicação não é ${SIGLA}.`);
        state.aplicacao = aplicacao;

        const { data: paciente, error: errPac } = await sb
            .from('pacientes')
            .select('id, nome_completo, data_nascimento, sexo, escolaridade, escolaridade_serie')
            .eq('id', aplicacao.paciente_id).single();
        if (errPac) throw errPac;
        state.paciente = paciente;

        const { data: estimulos, error: errEst } = await sb
            .from('tlpp_estimulos').select('*').order('tipo', { ascending: false }).order('numero');
        if (errEst) throw errEst;
        if (!estimulos || estimulos.length !== 72) throw new Error('Estímulos da TLPP não encontrados no banco (rode o SQL do sprint).');
        state.estimulos = estimulos.filter(e => e.tipo === 'palavra').concat(estimulos.filter(e => e.tipo === 'pseudo'));

        const { data: normas, error: errNor } = await sb.from('tlpp_normas').select('*');
        if (errNor) throw errNor;
        state.normas = normas || [];

        const { data: resp } = await sb.from('tlpp_respostas').select('*').eq('aplicacao_id', state.aplicacaoId).maybeSingle();
        state.itens = (resp && resp.itens) || {};
        state.grupo = (resp && resp.grupo_norma) || null;
        state.anosEstudo = (resp && resp.anos_estudo != null) ? resp.anos_estudo : null;
        state.observacoes = (resp && resp.observacoes) || '';

        const { data: resultado } = await sb.from('tlpp_resultados').select('*').eq('aplicacao_id', state.aplicacaoId).maybeSingle();
        state.resultado = resultado || null;
        state.sujo = false;

        // CRP de quem está logado (auth_guard não traz)
        const prof = window.cortexProfissional;
        if (prof && prof.id && prof.crp === undefined) {
            try {
                const { data } = await sb.from('profissionais').select('crp').eq('id', prof.id).maybeSingle();
                prof.crp = (data && data.crp) || '';
            } catch (e) { prof.crp = ''; }
        }
    }

    function decidirModoERenderizar() {
        if (state.resultado) { state.modo = 'laudo'; renderLaudo(); }
        else { state.modo = 'edicao'; renderEdicao(); }
        window.scrollTo(0, 0);
    }

    // ────────────────────────────────────────────────────────────────────
    // Datas / idade / grupo
    // ────────────────────────────────────────────────────────────────────
    function partesISO(iso) {
        const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
        return m ? { y: +m[1], m: +m[2], d: +m[3] } : null;
    }
    function idadeEm(nascISO, aplISO) {
        const n = partesISO(nascISO), a = partesISO(aplISO);
        if (!n || !a) return null;
        let anos = a.y - n.y, meses = a.m - n.m;
        if (a.d < n.d) meses--;
        if (meses < 0) { anos--; meses += 12; }
        if (anos < 0) return null;
        return { anos, meses };
    }
    function hoje() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    function fmtData(iso) {
        const p = partesISO(iso);
        return p ? `${String(p.d).padStart(2, '0')}/${String(p.m).padStart(2, '0')}/${p.y}` : '—';
    }
    function estimarAnosEstudo(escolaridade) {
        const e = String(escolaridade || '').toLowerCase();
        if (!e) return null;
        for (const [chave, anos] of ANOS_POR_ESCOLARIDADE) if (e.includes(chave)) return anos;
        return null;
    }
    function grupoPorAnos(anos) {
        if (anos == null) return null;
        return anos <= 5 ? 'adu_ate5' : anos <= 10 ? 'adu_6_10' : 'adu_11mais';
    }
    function sugerirGrupo(idadeAnos, anos) {
        if (idadeAnos == null) return null;
        if (idadeAnos >= 10 && idadeAnos <= 13) return 'cri_10_13';
        if (idadeAnos >= 18) return grupoPorAnos(anos);
        return null;
    }
    function avisoIdade(idadeAnos) {
        if (idadeAnos == null) return 'Preencha a data de aplicação para calcular a idade.';
        if (idadeAnos < 10) return `⚠ ${idadeAnos} anos: abaixo da faixa normativa da TLPP (a partir de 10 anos). Para crianças menores o manual indica a LPI (ANELE 1).`;
        if (idadeAnos >= 14 && idadeAnos <= 17) return `⚠ ${idadeAnos} anos: o manual não traz grupo normativo para 14–17 anos. Escolha o grupo mais próximo e registre a decisão no laudo.`;
        if (idadeAnos > 85) return `⚠ ${idadeAnos} anos: acima da faixa da amostra normativa.`;
        return '';
    }

    // ────────────────────────────────────────────────────────────────────
    // MODO EDIÇÃO
    // ────────────────────────────────────────────────────────────────────
    function renderEdicao() {
        const acoes = document.getElementById('acoes-topo');
        acoes.style.display = 'flex';
        acoes.innerHTML = `
            <button class="btn btn-secondary" id="btn-salvar-parcial">💾 Salvar parcial</button>
            <button class="btn btn-primary" id="btn-calcular">📊 Calcular e gerar laudo</button>
        `;
        const laudo = document.getElementById('laudo-conteudo');
        laudo.classList.remove('modo-laudo', 'laudo-body');
        laudo.classList.add('modo-edicao');

        const dataApl = state.aplicacao.data_aplicacao || hoje();
        if (state.anosEstudo == null) state.anosEstudo = estimarAnosEstudo(state.paciente.escolaridade);
        const idade = idadeEm(state.paciente.data_nascimento, dataApl);
        if (!state.grupo) state.grupo = sugerirGrupo(idade && idade.anos, state.anosEstudo);

        const prof = window.cortexProfissional || {};
        const profNome = state.resultado?.profissional_nome || prof.nome_completo || '';
        const profCrp  = state.resultado?.profissional_crp || prof.crp || '';

        laudo.innerHTML = `
            <div class="tlpp-edicao-header">
                <div class="tlpp-breadcrumb">Correção de Testes → ${SIGLA}</div>
                <h1 class="tlpp-titulo">ANELE-4 · TLPP — ${esc(NOME)}</h1>
                <p class="tlpp-sub">${esc(state.paciente.nome_completo)} · ${idade ? idade.anos + ' anos e ' + idade.meses + ' meses' : 'idade —'}</p>
            </div>

            <div class="tlpp-card">
                <div class="tlpp-card-head"><span class="tlpp-num">1</span>
                    <div><div class="tlpp-card-title">Profissional e aplicação</div>
                         <div class="tlpp-card-desc">Quem aplicou, data e grupo normativo</div></div>
                </div>
                <div class="tlpp-grid-3">
                    <div class="tlpp-field"><label>Nome do profissional</label>
                        <input type="text" id="prof-nome" value="${esc(profNome)}" placeholder="Nome completo"></div>
                    <div class="tlpp-field"><label>CRP</label>
                        <input type="text" id="prof-crp" value="${esc(profCrp)}" placeholder="04/00000"></div>
                    <div class="tlpp-field"><label>Data de aplicação</label>
                        <input type="date" id="data-aplicacao" value="${esc(dataApl)}"></div>
                </div>
                <div class="tlpp-grid-3">
                    <div class="tlpp-field"><label>Paciente</label>
                        <input type="text" value="${esc(state.paciente.nome_completo)}" disabled></div>
                    <div class="tlpp-field"><label>Nascimento</label>
                        <input type="text" value="${fmtData(state.paciente.data_nascimento)}" disabled></div>
                    <div class="tlpp-field"><label>Anos completos de estudo</label>
                        <input type="number" id="anos-estudo" min="0" max="40" value="${state.anosEstudo ?? ''}" placeholder="ex.: 8">
                        <div class="tlpp-hint" id="hint-anos">${state.paciente.escolaridade
                            ? `Cadastro: ${esc(state.paciente.escolaridade)}${state.paciente.escolaridade_serie ? ' · ' + esc(state.paciente.escolaridade_serie) : ''} — confirme os anos completos.`
                            : 'Escolaridade não informada no cadastro.'}</div>
                    </div>
                </div>
                <div class="tlpp-hint" id="hint-idade"></div>
                <div class="tlpp-grupos" id="grupos">
                    ${Object.entries(E.GRUPOS).map(([cod, g]) => `
                        <button type="button" class="tlpp-grupo ${state.grupo === cod ? 'ativo' : ''}" data-grupo="${cod}">
                            <span class="tlpp-grupo-tab">Tabela ${g.tabela}</span>
                            <span class="tlpp-grupo-label">${esc(g.label)}</span>
                        </button>`).join('')}
                </div>
            </div>

            <div class="tlpp-resumo" id="resumo"></div>

            ${renderBloco('palavra', 2, 'Palavras', '48 palavras reais. Leitura exata; sotaque regional é aceito. Autocorreção espontânea e leitura silabada com produto final correto contam como acerto; leitura letra por letra é erro. Marque os tipos de erro inclusive nas primeiras tentativas autocorrigidas.')}
            ${renderBloco('pseudo', 3, 'Pseudopalavras', '24 pseudopalavras. Aceitas as formas de leitura listadas abaixo de cada estímulo (Tabela 5.3).')}

            <div class="tlpp-card">
                <div class="tlpp-card-head"><span class="tlpp-num">4</span>
                    <div><div class="tlpp-card-title">Observações comportamentais</div>
                         <div class="tlpp-card-desc">Opcional — clique nos chips ou digite</div></div>
                </div>
                <div class="tlpp-chips">
                    ${CHIPS_OBS.map(c => `<button type="button" class="tlpp-chip" data-texto="${esc(c.texto)}">${esc(c.label)}</button>`).join('')}
                </div>
                <div class="tlpp-field"><label>Texto livre</label>
                    <textarea id="obs-texto" rows="3" placeholder="Comportamento durante a leitura, estratégias observadas, latência, etc.">${esc(state.observacoes)}</textarea></div>
            </div>
        `;

        bindEdicao();
        atualizarIdade();
        atualizarResumo();
    }

    function tagsEstimulo(est) {
        if (est.tipo !== 'palavra') return `<span class="tlpp-tag ${est.extensao}">${est.extensao === 'curta' ? 'curta' : 'longa'}</span>`;
        return `<span class="tlpp-tag ${est.frequencia === 'frequente' ? 'freq' : 'nfreq'}">${est.frequencia === 'frequente' ? 'freq' : 'não freq'}</span>` +
               `<span class="tlpp-tag ${est.regularidade === 'regular' ? 'reg' : 'irreg'}">${est.regularidade === 'regular' ? 'regular' : 'irregular'}</span>` +
               `<span class="tlpp-tag ${est.extensao}">${est.extensao}</span>`;
    }

    function renderBloco(tipo, num, titulo, desc) {
        const lista = state.estimulos.filter(e => e.tipo === tipo);
        return `
            <div class="tlpp-card" data-bloco="${tipo}">
                <div class="tlpp-card-head"><span class="tlpp-num">${num}</span>
                    <div><div class="tlpp-card-title">${titulo} <span class="tlpp-card-cont" id="cont-${tipo}"></span></div>
                         <div class="tlpp-card-desc">${desc}</div></div>
                    <div class="tlpp-card-acoes">
                        <button type="button" class="btn btn-sm btn-secondary" data-acao="restantes-acerto" data-tipo="${tipo}">✓ Restantes como acerto</button>
                        <button type="button" class="btn btn-sm btn-ghost" data-acao="limpar" data-tipo="${tipo}">Limpar</button>
                    </div>
                </div>
                <div class="tlpp-lista">
                    ${lista.map(est => renderLinha(est)).join('')}
                </div>
            </div>`;
    }

    function renderLinha(est) {
        const k = E.chave(est);
        const it = E.itemDe(state.itens, k);
        const aberto = state.abertos.has(k) || it.e.length > 0;
        return `
            <div class="tlpp-item ${it.a === true ? 'acerto' : it.a === false ? 'erro' : ''}" data-k="${k}">
                <div class="tlpp-item-linha">
                    <div class="tlpp-item-num">${est.numero}</div>
                    <div class="tlpp-item-est">
                        <div class="tlpp-item-palavra">${esc(est.estimulo)}</div>
                        <div class="tlpp-item-tags">${tagsEstimulo(est)}${est.leituras_aceitas ? `<span class="tlpp-aceitas" title="Formas aceitas">${esc(est.leituras_aceitas)}</span>` : ''}</div>
                    </div>
                    <div class="tlpp-item-marcar">
                        <button type="button" class="tlpp-btn-ac ${it.a === true ? 'on' : ''}" data-marca="1" data-k="${k}" title="Acerto">✓</button>
                        <button type="button" class="tlpp-btn-er ${it.a === false ? 'on' : ''}" data-marca="0" data-k="${k}" title="Erro">✗</button>
                    </div>
                    <input type="text" class="tlpp-item-leitura" data-leitura="${k}" value="${esc(it.l)}" placeholder="leitura realizada" maxlength="120">
                    <button type="button" class="tlpp-btn-tipos ${it.e.length ? 'tem' : ''}" data-tipos="${k}" title="Tipos de erro">
                        ${it.e.length ? `${it.e.length} tipo${it.e.length > 1 ? 's' : ''}` : '+ tipo de erro'}
                    </button>
                </div>
                <div class="tlpp-item-tipos ${aberto ? 'aberto' : ''}" data-painel="${k}">
                    ${E.TIPOS_ERRO.map(t => `
                        <button type="button" class="tlpp-tipo ${it.e.includes(t.cod) ? 'on' : ''}" data-k="${k}" data-cod="${t.cod}"
                                title="${esc(t.desc)} Ex.: ${esc(t.ex)}">${esc(t.curto)}</button>`).join('')}
                </div>
            </div>`;
    }

    function bindEdicao() {
        const laudo = document.getElementById('laudo-conteudo');

        document.getElementById('btn-salvar-parcial').addEventListener('click', () => salvar(false));
        document.getElementById('btn-calcular').addEventListener('click', () => salvar(true));

        document.getElementById('data-aplicacao').addEventListener('change', () => { state.sujo = true; atualizarIdade(); });
        document.getElementById('anos-estudo').addEventListener('input', (ev) => {
            state.sujo = true;
            const v = ev.target.value === '' ? null : parseInt(ev.target.value, 10);
            state.anosEstudo = Number.isFinite(v) ? v : null;
            const idade = idadeEm(state.paciente.data_nascimento, document.getElementById('data-aplicacao').value);
            if (idade && idade.anos >= 18) { const g = grupoPorAnos(state.anosEstudo); if (g) setGrupo(g); }
            atualizarIdade();
        });
        document.querySelectorAll('.tlpp-grupo').forEach(b => b.addEventListener('click', () => { state.sujo = true; setGrupo(b.dataset.grupo); }));

        document.querySelectorAll('.tlpp-chip').forEach(btn => btn.addEventListener('click', () => {
            const ta = document.getElementById('obs-texto');
            ta.value = ta.value.trim() ? ta.value.trim() + '. ' + btn.dataset.texto : btn.dataset.texto;
            state.observacoes = ta.value; state.sujo = true; ta.focus();
        }));
        document.getElementById('obs-texto').addEventListener('input', (ev) => { state.observacoes = ev.target.value; state.sujo = true; });

        // delegação: marcação, tipos, leitura
        laudo.addEventListener('click', (ev) => {
            const marca = ev.target.closest('[data-marca]');
            if (marca) { setMarca(marca.dataset.k, marca.dataset.marca === '1'); return; }
            const tipos = ev.target.closest('[data-tipos]');
            if (tipos) { togglePainel(tipos.dataset.tipos); return; }
            const tipo = ev.target.closest('.tlpp-tipo');
            if (tipo) { toggleTipo(tipo.dataset.k, tipo.dataset.cod); return; }
            const acao = ev.target.closest('[data-acao]');
            if (acao) {
                const lista = state.estimulos.filter(e => e.tipo === acao.dataset.tipo);
                if (acao.dataset.acao === 'restantes-acerto') {
                    lista.forEach(e => { const k = E.chave(e); if (E.itemDe(state.itens, k).a === null) setMarca(k, true, true); });
                } else {
                    lista.forEach(e => { const k = E.chave(e); state.itens[k] = { a: null, l: '', e: [] }; state.abertos.delete(k); redesenharLinha(k); });
                }
                state.sujo = true; atualizarResumo();
            }
        });
        laudo.addEventListener('input', (ev) => {
            const inp = ev.target.closest('[data-leitura]');
            if (!inp) return;
            const k = inp.dataset.leitura;
            const it = E.itemDe(state.itens, k);
            state.itens[k] = { a: it.a, l: inp.value, e: it.e };
            state.sujo = true;
        });
        laudo.addEventListener('keydown', (ev) => {
            const inp = ev.target.closest('[data-leitura]');
            if (!inp || ev.key !== 'Enter') return;
            ev.preventDefault();
            const k = inp.dataset.leitura;
            if (E.itemDe(state.itens, k).a === null) setMarca(k, false);
            togglePainel(k, true);
        });
    }

    function setGrupo(cod) {
        state.grupo = cod;
        document.querySelectorAll('.tlpp-grupo').forEach(b => b.classList.toggle('ativo', b.dataset.grupo === cod));
        atualizarResumo();
    }

    function setMarca(k, acerto, silencioso) {
        const it = E.itemDe(state.itens, k);
        state.itens[k] = { a: (it.a === acerto ? null : acerto), l: it.l, e: it.e };
        state.sujo = true;
        redesenharLinha(k);
        if (!silencioso) atualizarResumo();
    }

    function toggleTipo(k, cod) {
        const it = E.itemDe(state.itens, k);
        const e = it.e.includes(cod) ? it.e.filter(c => c !== cod) : it.e.concat(cod);
        state.itens[k] = { a: it.a, l: it.l, e };
        state.abertos.add(k);
        state.sujo = true;
        redesenharLinha(k);
    }

    function togglePainel(k, abrir) {
        const painel = document.querySelector(`[data-painel="${k}"]`);
        if (!painel) return;
        const aberto = abrir === true ? true : !painel.classList.contains('aberto');
        painel.classList.toggle('aberto', aberto);
        if (aberto) state.abertos.add(k); else state.abertos.delete(k);
    }

    function redesenharLinha(k) {
        const atual = document.querySelector(`.tlpp-item[data-k="${k}"]`);
        if (!atual) return;
        const est = state.estimulos.find(e => E.chave(e) === k);
        const foco = document.activeElement && document.activeElement.dataset && document.activeElement.dataset.leitura === k;
        const tmp = document.createElement('div');
        tmp.innerHTML = renderLinha(est);
        atual.replaceWith(tmp.firstElementChild);
        if (foco) { const inp = document.querySelector(`[data-leitura="${k}"]`); if (inp) { inp.focus(); inp.selectionStart = inp.selectionEnd = inp.value.length; } }
    }

    function atualizarIdade() {
        const dataApl = document.getElementById('data-aplicacao').value;
        const idade = idadeEm(state.paciente.data_nascimento, dataApl);
        const hint = document.getElementById('hint-idade');
        const aviso = avisoIdade(idade && idade.anos);
        const sug = sugerirGrupo(idade && idade.anos, state.anosEstudo);
        hint.classList.toggle('warn', !!aviso && !!idade);
        hint.innerHTML = (idade ? `Idade na aplicação: <strong>${idade.anos} anos e ${idade.meses} meses</strong>. ` : '') +
            (aviso ? `<span>${esc(aviso)}</span>` : (sug ? `Grupo sugerido: <strong>${esc(E.GRUPOS[sug].label)}</strong>.` : 'Informe os anos de estudo para sugerir o grupo normativo.'));
        if (sug && !state.grupo) setGrupo(sug);
    }

    function atualizarResumo() {
        const c = E.contar(state.itens, state.estimulos);
        const box = document.getElementById('resumo');
        if (!box) return;
        const g = state.grupo ? E.GRUPOS[state.grupo] : null;
        const chip = (label, v, max, cls) => `<div class="tlpp-res-chip ${cls || ''}"><span>${label}</span><strong>${v}${max != null ? '<small>/' + max + '</small>' : ''}</strong></div>`;
        box.innerHTML = `
            ${chip('Palavras', c.palavras, 48)}
            ${chip('Regulares', c.regulares, 24, 'sub')}${chip('Irregulares', c.irregulares, 24, 'sub')}
            ${chip('Curtas', c.curtas, 24, 'sub')}${chip('Longas', c.longas, 24, 'sub')}
            ${chip('Frequentes', c.frequentes, 24, 'sub')}${chip('Não freq.', c.nao_frequentes, 24, 'sub')}
            ${chip('Pseudo', c.pseudo, 24)}${chip('Curtas', c.pseudo_curtas, 12, 'sub')}${chip('Longas', c.pseudo_longas, 12, 'sub')}
            ${chip('Total', c.total, 72, 'total')}
            ${chip('Não marcados', c.nao_marcados, null, c.nao_marcados ? 'pend' : 'okk')}
            <div class="tlpp-res-grupo">${g ? `Grupo: <strong>${esc(g.curto)}</strong> (Tabela ${g.tabela})` : '<strong class="warn">Escolha o grupo normativo</strong>'}</div>
        `;
        const cp = document.getElementById('cont-palavra'), cn = document.getElementById('cont-pseudo');
        const lp = state.estimulos.filter(e => e.tipo === 'palavra'), ln = state.estimulos.filter(e => e.tipo === 'pseudo');
        const marc = (l) => l.filter(e => E.itemDe(state.itens, E.chave(e)).a !== null).length;
        if (cp) cp.textContent = `${c.palavras} acertos · ${marc(lp)}/48 marcadas`;
        if (cn) cn.textContent = `${c.pseudo} acertos · ${marc(ln)}/24 marcadas`;
    }

    // ────────────────────────────────────────────────────────────────────
    // Salvar / Calcular
    // ────────────────────────────────────────────────────────────────────
    function toast(m, t) { if (window.CortexUI?.toast) window.CortexUI.toast(m, t); }

    function itensLimpos() {
        const out = {};
        for (const est of state.estimulos) {
            const k = E.chave(est);
            const it = E.itemDe(state.itens, k);
            if (it.a === null && !it.l && !it.e.length) continue;
            out[k] = { a: it.a, l: it.l.trim(), e: it.e };
        }
        return out;
    }

    async function salvar(eCalcular) {
        const btn = document.getElementById(eCalcular ? 'btn-calcular' : 'btn-salvar-parcial');
        const orig = btn.textContent;
        btn.disabled = true; btn.textContent = '⏳ Salvando…';
        try {
            const sb = window.cortexClient;
            const dataApl = document.getElementById('data-aplicacao').value;
            if (!dataApl) { toast('Preencha a data de aplicação.', 'danger'); return; }
            const idade = idadeEm(state.paciente.data_nascimento, dataApl);
            const itens = itensLimpos();

            if (eCalcular) {
                const c = E.contar(itens, state.estimulos);
                if (c.nao_marcados) { toast(`Faltam ${c.nao_marcados} estímulo(s) sem marcação (acerto ou erro).`, 'danger'); return; }
                if (!state.grupo) { toast('Escolha o grupo normativo.', 'danger'); return; }
                if (!state.normas.some(n => n.grupo === state.grupo)) { toast('Normas do grupo não encontradas no banco.', 'danger'); return; }
            }

            const { error: errAp } = await sb.from('aplicacoes_instrumento')
                .update({ data_aplicacao: dataApl }).eq('id', state.aplicacaoId);
            if (errAp) throw errAp;

            const { error: errR } = await sb.from('tlpp_respostas').upsert({
                aplicacao_id: state.aplicacaoId, itens, grupo_norma: state.grupo,
                anos_estudo: state.anosEstudo, observacoes: state.observacoes.trim() || null
            }, { onConflict: 'aplicacao_id' });
            if (errR) throw errR;
            state.aplicacao.data_aplicacao = dataApl;
            state.sujo = false;

            if (!eCalcular) { toast('Salvo.', 'success'); return; }

            const res = E.calcular(itens, state.estimulos, state.normas, state.grupo);
            const profNome = document.getElementById('prof-nome').value.trim() || null;
            const profCrp  = document.getElementById('prof-crp').value.trim() || null;
            const interpretacao = E.interpretar(res, { nome: state.paciente.nome_completo });

            const { error: errRes } = await sb.from('tlpp_resultados').upsert({
                aplicacao_id: state.aplicacaoId,
                grupo_norma: state.grupo, anos_estudo: state.anosEstudo,
                idade_anos: idade ? idade.anos : null, idade_meses: idade ? idade.meses : null,
                escores: res.escores, efeitos: res.efeitos, erros: res.erros,
                interpretacao, profissional_nome: profNome, profissional_crp: profCrp,
                observacoes: state.observacoes.trim() || null,
                engine_versao: 'tlpp_v1', calculado_em: new Date().toISOString()
            }, { onConflict: 'aplicacao_id' });
            if (errRes) throw errRes;

            const { error: errSt } = await sb.from('aplicacoes_instrumento')
                .update({ status: 'corrigido', data_conclusao: state.aplicacao.data_conclusao || new Date().toISOString() })
                .eq('id', state.aplicacaoId);
            if (errSt) throw errSt;

            try {
                await CortexAudit.log('edicao', 'tlpp_resultados', state.aplicacaoId, {
                    pacienteId: state.paciente.id, detalhes: { operacao: 'tlpp_corrigido', grupo: state.grupo, total: res.contagem.total }
                });
            } catch (e) { /* silencioso */ }

            await carregarTudo();
            decidirModoERenderizar();
            toast('Laudo gerado.', 'success');
        } catch (err) {
            console.error('[tlpp salvar]', err);
            toast('Erro: ' + (err.message || err), 'danger');
        } finally {
            btn.disabled = false; btn.textContent = orig;
        }
    }

    // ────────────────────────────────────────────────────────────────────
    // MODO LAUDO
    // ────────────────────────────────────────────────────────────────────
    function renderLaudo() {
        const acoes = document.getElementById('acoes-topo');
        acoes.style.display = 'flex';
        acoes.innerHTML = `
            <button class="btn btn-secondary" id="btn-editar">✏️ Editar marcação</button>
            <button class="btn btn-primary" id="btn-gerar-pdf">📄 Gerar PDF do relatório</button>
        `;
        document.getElementById('btn-editar').addEventListener('click', () => { state.resultado = null; decidirModoERenderizar(); });
        document.getElementById('btn-gerar-pdf').addEventListener('click', gerarPDF);

        const laudo = document.getElementById('laudo-conteudo');
        laudo.classList.remove('modo-edicao');
        laudo.classList.add('modo-laudo', 'laudo-body');

        const r = state.resultado;
        const g = E.GRUPOS[r.grupo_norma] || { label: r.grupo_norma, tabela: '—', curto: r.grupo_norma };
        const S = {}; for (const s of r.escores) S[s.key] = s;

        laudo.innerHTML = `
            <div class="laudo-header">
                <div class="laudo-header-esq">
                    <div class="laudo-header-logo">E</div>
                    <div class="laudo-header-textos">
                        <div class="laudo-header-supratitulo">Relatório Neuropsicológico</div>
                        <h1 class="laudo-header-titulo">TLPP · ANELE-4</h1>
                        <div class="laudo-header-subtitulo">${esc(NOME)}<br>Leitura de palavras isoladas e pseudopalavras · rotas lexical e fonológica</div>
                    </div>
                </div>
                <div class="laudo-header-pontuacao">
                    <div class="laudo-header-pontuacao-label">Total TLPP</div>
                    <div class="laudo-header-pontuacao-valor">${S.total.bruto}<span class="laudo-header-pontuacao-max">/72</span></div>
                    <div class="laudo-header-pontuacao-max" style="font-size:11px;">Percentil ${esc(S.total.percentil || '—')}</div>
                </div>
            </div>

            ${secao(1, 'Identificação', '', `
                <table class="tlpp-tab-identif">
                    <tr><td class="lbl">Paciente</td><td class="val"><strong>${esc(state.paciente.nome_completo)}</strong></td></tr>
                    <tr><td class="lbl">Data de nascimento</td><td class="val">${fmtData(state.paciente.data_nascimento)}</td></tr>
                    <tr><td class="lbl">Idade na aplicação</td><td class="val">${r.idade_anos != null ? `${r.idade_anos} anos e ${r.idade_meses ?? 0} meses` : '—'}</td></tr>
                    <tr><td class="lbl">Data de aplicação</td><td class="val">${fmtData(state.aplicacao.data_aplicacao)}</td></tr>
                    <tr><td class="lbl">Escolaridade</td><td class="val">${r.anos_estudo != null ? `${r.anos_estudo} anos completos de estudo` : '—'}${state.paciente.escolaridade ? ` (${esc(state.paciente.escolaridade)})` : ''}</td></tr>
                    <tr><td class="lbl">Grupo normativo</td><td class="val"><strong>${esc(g.label)}</strong> — Tabela ${g.tabela} do manual</td></tr>
                    ${r.profissional_nome ? `<tr class="sep"><td class="lbl">Profissional</td><td class="val">${esc(r.profissional_nome)}${r.profissional_crp ? ` — CRP ${esc(r.profissional_crp)}` : ''}</td></tr>` : ''}
                </table>`)}

            ${secao(2, 'Escores de acertos', `Percentis das Tabelas 6.5–6.8 e interpretação pela Tabela 6.2 (grupo ${esc(g.curto)})`, renderTabelaEscores(r))}

            ${secao(3, 'Efeitos psicolinguísticos', 'Diferença de porcentagem de acertos entre categorias (sem padrão normativo — leitura qualitativa)', renderEfeitos(r))}

            ${secao(4, 'Tipos de erro', 'Levantamento de todas as produções, inclusive primeiras tentativas autocorrigidas', renderErros(r))}

            ${secao(5, 'Interpretação', '', `
                <div class="tlpp-interp">${(r.interpretacao || '').split(/\n\n+/).map(p => `<p>${esc(p)}</p>`).join('') || '<p>—</p>'}</div>
                ${r.observacoes ? `<div class="tlpp-obs"><strong>Observações comportamentais:</strong> ${esc(r.observacoes)}</div>` : ''}`)}

            <div class="tlpp-rodape">
                <div class="tlpp-rodape-prof">
                    ${r.profissional_nome ? `<div class="prof-nome">${esc(r.profissional_nome)}</div>` : ''}
                    ${r.profissional_crp ? `<div class="prof-crp">CRP ${esc(r.profissional_crp)}</div>` : ''}
                    <div class="prof-assinatura">Assinatura do Profissional</div>
                </div>
                <div class="tlpp-rodape-data">
                    <div>${fmtData(state.aplicacao.data_aplicacao)}</div>
                    <div class="conf">ANELE-4 · Rodrigues, Nobre, Miná &amp; Salles. Uso clínico sob licença; material do teste não reproduzido. Este documento é confidencial e destinado ao profissional responsável e ao paciente.</div>
                </div>
            </div>
        `;
    }

    function secao(num, titulo, desc, corpo) {
        return `
            <div class="tlpp-secao">
                <div class="tlpp-secao-head">
                    <span class="tlpp-secao-num">${num}</span>
                    <div class="tlpp-secao-titulo">${esc(titulo)}</div>
                    ${desc ? `<div class="tlpp-secao-desc">${desc}</div>` : ''}
                </div>
                ${corpo}
            </div>`;
    }

    function badge(cls) {
        if (!cls) return '<span class="muted">—</span>';
        return `<span class="tlpp-badge" style="background:${cls.cor}15;color:${cls.cor};border:1px solid ${cls.cor}30;">${esc(cls.label)}</span>`;
    }
    function num(x) { return x == null ? '—' : String(x).replace('.', ','); }

    function renderTabelaEscores(r) {
        const linhas = r.escores.map(s => `
            <tr class="${s.sub ? 'sub' : 'principal'} ${s.key === 'total' ? 'total' : ''}">
                <td class="medida">${esc(s.label)}</td>
                <td class="ctr">${s.bruto}<small>/${s.max}</small></td>
                <td class="ctr">${num(s.pct)}%</td>
                <td class="ctr">${esc(s.percentil || '—')}</td>
                <td class="ctr">${num(s.z)}</td>
                <td class="ctr">${badge(s.classificacao)}</td>
            </tr>`).join('');
        return `
            <div class="tlpp-tab-wrap">
                <table class="tlpp-tab-escores">
                    <thead><tr>
                        <th class="medida-th">Categoria</th><th class="ctr">Acertos</th><th class="ctr">%</th>
                        <th class="ctr">Percentil</th><th class="ctr">Z</th><th class="ctr">Interpretação</th>
                    </tr></thead>
                    <tbody>${linhas}</tbody>
                </table>
                <p class="tlpp-tab-foot">
                    Percentil: intervalo da tabela normativa em que o escore se situa; interpretação pelo percentil mais alto do intervalo (recomendação do manual, cap. 6).
                    Z = (escore − média do grupo) / DP. Tabela 6.2: ≤ 2,5 déficit de gravidade importante · 3–6 déficit moderado a grave · 7 déficit · 10 e 16 alerta para déficit · ≥ 25 escore esperado para a escolaridade.
                </p>
            </div>`;
    }

    function renderEfeitos(r) {
        const ef = r.efeitos || {};
        const linhas = E.EFEITOS.map(e => {
            const v = Number(ef[e.key] || 0);
            const w = Math.min(50, Math.abs(v) / 2);   // 100 pontos = 50% de largura
            const acent = Math.abs(v) >= 10;
            return `
                <div class="tlpp-ef-row">
                    <div class="tlpp-ef-label"><strong>${esc(e.label)}</strong><small>${esc(e.formula)}</small></div>
                    <div class="tlpp-ef-track">
                        <div class="tlpp-ef-zero"></div>
                        <div class="tlpp-ef-fill ${v >= 0 ? 'pos' : 'neg'}" style="${v >= 0 ? 'left:50%' : 'right:50%'};width:${w}%"></div>
                    </div>
                    <div class="tlpp-ef-val ${acent ? 'acent' : ''}">${v > 0 ? '+' : ''}${num(v)}</div>
                </div>`;
        }).join('');
        return `<div class="tlpp-ef-bloco">${linhas}
            <p class="tlpp-tab-foot">Valor positivo = melhor desempenho na primeira categoria da fórmula. Diferenças ≥ 10 pontos percentuais destacadas como acentuadas (critério descritivo desta correção, não do manual).</p></div>`;
    }

    function renderErros(r) {
        const er = r.erros || { por_tipo: {}, lista: [], total: 0 };
        const tipos = E.TIPOS_ERRO.map(t => ({ ...t, n: er.por_tipo[t.cod] || 0 }));
        const metade = Math.ceil(tipos.length / 2);
        const col = (lista) => `<table class="tlpp-tab-erros"><tbody>${lista.map(t => `
            <tr class="${t.n ? 'tem' : ''}"><td>${esc(t.label)}</td><td class="ctr">${t.n}</td></tr>`).join('')}</tbody></table>`;
        const lista = (er.lista || []).filter(l => l.acerto === false || (l.tipos && l.tipos.length));
        const porEst = lista.length ? `
            <table class="tlpp-tab-lista">
                <thead><tr><th>Estímulo</th><th>Leitura realizada</th><th>Pontuação</th><th>Tipos de erro</th></tr></thead>
                <tbody>${lista.map(l => `
                    <tr>
                        <td><span class="muted">${l.tipo === 'pseudo' ? 'PP' : 'P'}${l.numero}</span> <strong>${esc(l.estimulo)}</strong></td>
                        <td>${l.leitura ? esc(l.leitura) : '<span class="muted">—</span>'}</td>
                        <td>${l.acerto ? '<span class="tlpp-pt ok">acerto</span>' : '<span class="tlpp-pt er">erro</span>'}</td>
                        <td>${(l.tipos || []).map(c => { const t = E.TIPOS_ERRO.find(x => x.cod === c); return `<span class="tlpp-pill">${esc(t ? t.label : c)}</span>`; }).join(' ') || '<span class="muted">—</span>'}</td>
                    </tr>`).join('')}</tbody>
            </table>` : '<p class="muted">Nenhum erro registrado.</p>';
        return `
            <div class="tlpp-erros-cols">${col(tipos.slice(0, metade))}${col(tipos.slice(metade))}</div>
            <div class="tlpp-erros-total">Total de erros classificados: <strong>${er.total || 0}</strong> · Estímulos pontuados como erro: <strong>${er.estimulos_com_erro || 0}</strong></div>
            ${porEst}`;
    }

    // ────────────────────────────────────────────────────────────────────
    // PDF (html2canvas + jsPDF) — padrão dos demais instrumentos
    // ────────────────────────────────────────────────────────────────────
    async function gerarPDF() {
        const btn = document.getElementById('btn-gerar-pdf');
        const orig = btn.textContent;
        btn.disabled = true; btn.textContent = '⏳ Gerando PDF...';
        try {
            document.body.classList.add('exportando');
            await new Promise(r => setTimeout(r, 100));
            const laudo = document.getElementById('laudo-conteudo');
            const canvas = await html2canvas(laudo, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false });
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            const pdfWidth = 210, pdfHeight = 297;
            const imgHeight = (canvas.height * pdfWidth) / canvas.width;
            if (imgHeight <= pdfHeight) {
                pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, pdfWidth, imgHeight);
            } else {
                let posY = 0, restante = imgHeight;
                while (restante > 0) {
                    pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, -posY, pdfWidth, imgHeight);
                    restante -= pdfHeight; posY += pdfHeight;
                    if (restante > 0) pdf.addPage();
                }
            }
            const nome = (state.paciente?.nome_completo || '').toUpperCase().replace(/[^A-Z\s]/g, '').trim().substring(0, 50);
            pdf.save(`TLPP - ${nome}_${hoje()}.pdf`);
            toast('PDF gerado com sucesso', 'success');
        } catch (err) {
            console.error('Erro ao gerar PDF:', err);
            toast('Erro ao gerar PDF: ' + err.message, 'danger');
        } finally {
            document.body.classList.remove('exportando');
            btn.disabled = false; btn.textContent = orig;
        }
    }

    function esc(s) {
        if (s == null) return '';
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
})();

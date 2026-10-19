// ============================================================================
// CORTEX_APP — Laudo das escalas complementares de rastreio
// GDS-15 · PHQ-9 · GAD-7 · ZARIT  (Modelo 2: níveis em etapas + distribuição)
// ============================================================================
// URL: correcao/<slug>/<slug>_resultado.html?aplicacao_id=<uuid>
// Cada página declara window.RASTREIO_SIGLA e carrega este motor.
//
// Fonte dos números: correcoes.escores_brutos.respostas (índice da opção por
// item, gravado pela publico_finalizar_aplicacao). A nota de cada item é
// recalculada aqui do mesmo jeito que o banco faz:
//   item COM opcoes {texto,valor} → nota = opcoes[índice].valor
//   item SEM opcoes               → nota = valor bruto
// Itens cujas opções valem todas 0 (impacto funcional do PHQ-9 / GAD-7) não
// entram no escore — aparecem à parte.
// Faixas: instrumentos_classificacoes da norma (com fallback local igual).
// ============================================================================

(function() {
    'use strict';

    const SIGLA = window.RASTREIO_SIGLA;

    const VERDE = '#16a34a', AMBAR = '#d97706', LARANJA = '#ea580c', CORAL = '#e0532a', VERMELHO = '#dc2626';

    const CFG = {
        'GDS-15': {
            titulo: 'GDS-15',
            subtitulo: 'Escala de Depressão Geriátrica — versão reduzida<br>15 itens · sim/não · escore total (0-15)',
            corPrincipal: '#2F6FED',
            modalidade: 'Autoaplicação',
            janela: 'na última semana',
            corte: 5,
            faixas: [[0, 4, 'Sem indicativo de depressão', VERDE], [5, 8, 'Depressão leve', AMBAR],
                     [9, 11, 'Depressão moderada', LARANJA], [12, 15, 'Depressão grave', VERMELHO]],
            textosNivel: [
                'As respostas não indicam sintomas depressivos relevantes no período avaliado.',
                'As respostas indicam alguns sintomas depressivos, de intensidade leve, que vale a pena acompanhar.',
                'As respostas indicam sintomas depressivos de intensidade moderada; é importante conversar com o profissional sobre os próximos passos.',
                'As respostas indicam muitos sintomas depressivos no período; é importante conversar com o profissional sobre cuidado e acompanhamento.'
            ],
            nota: 'Este questionário é uma medida de <strong>rastreio</strong> de sintomas depressivos na última semana — <strong>não é um diagnóstico</strong>. Ele faz parte de uma avaliação maior, conversada com o profissional.',
            referencia: 'Yesavage et al. (1983); Sheikh &amp; Yesavage (1986). Versão brasileira: Almeida &amp; Almeida (1999) — corte 5/6, sensibilidade ≈ 85%, especificidade ≈ 74%.',
            nomeLaudo: 'Escala de Depressão Geriátrica — versão reduzida (GDS-15)',
            descLaudo: 'instrumento de rastreio de sintomas depressivos em idosos, referente à última semana'
        },
        'PHQ-9': {
            titulo: 'PHQ-9',
            subtitulo: 'Questionário sobre a Saúde do Paciente — Depressão<br>9 itens · escala 0-3 · escore total (0-27)',
            corPrincipal: '#7C4DFF',
            modalidade: 'Autoaplicação',
            janela: 'nas últimas 2 semanas',
            corte: 10,
            corteBR: 9,
            itemRisco: 9,
            faixas: [[0, 4, 'Mínima', VERDE], [5, 9, 'Leve', AMBAR], [10, 14, 'Moderada', LARANJA],
                     [15, 19, 'Moderadamente grave', CORAL], [20, 27, 'Grave', VERMELHO]],
            textosNivel: [
                'As respostas indicam poucos ou nenhum sintoma depressivo no período avaliado.',
                'As respostas indicam alguns sintomas depressivos, de intensidade leve, que vale a pena acompanhar.',
                'As respostas indicam sintomas depressivos de intensidade moderada; vale conversar com o profissional sobre estratégias de cuidado.',
                'As respostas indicam sintomas depressivos importantes; é importante conversar com o profissional sobre os próximos passos.',
                'As respostas indicam muitos sintomas depressivos no período; é importante conversar com o profissional sobre cuidado e acompanhamento.'
            ],
            nota: 'Este questionário é uma medida de <strong>rastreio</strong> de sintomas depressivos nas últimas 2 semanas — <strong>não é um diagnóstico</strong>. Ele faz parte de uma avaliação maior, conversada com o profissional.',
            referencia: 'Kroenke, Spitzer &amp; Williams (2001) — corte ≥ 10: sensibilidade 88%, especificidade 88%. Validação na população geral brasileira: Santos et al. (2013), corte ≥ 9 (sensibilidade 77,5%, especificidade 86,7%).',
            nomeLaudo: 'Questionário sobre a Saúde do Paciente (PHQ-9)',
            artigo: 'No',
            descLaudo: 'instrumento de rastreio de sintomas depressivos referentes às últimas duas semanas',
            sintoma: 'sintomatologia depressiva'
        },
        'GAD-7': {
            titulo: 'GAD-7',
            subtitulo: 'Escala de Ansiedade Generalizada<br>7 itens · escala 0-3 · escore total (0-21)',
            corPrincipal: '#0ea5e9',
            modalidade: 'Autoaplicação',
            janela: 'nas últimas 2 semanas',
            corte: 10,
            faixas: [[0, 4, 'Mínima', VERDE], [5, 9, 'Leve', AMBAR], [10, 14, 'Moderada', LARANJA], [15, 21, 'Grave', VERMELHO]],
            textosNivel: [
                'As respostas indicam poucos ou nenhum sintoma de ansiedade no período avaliado.',
                'As respostas indicam alguns sintomas de ansiedade, de intensidade leve, que vale a pena observar.',
                'As respostas indicam sintomas de ansiedade de intensidade moderada; vale conversar com o profissional sobre estratégias de cuidado.',
                'As respostas indicam muitos sintomas de ansiedade no período; é importante conversar com o profissional sobre os próximos passos.'
            ],
            nota: 'Este questionário é uma medida de <strong>rastreio</strong> de sintomas de ansiedade nas últimas 2 semanas — <strong>não é um diagnóstico</strong>. Ele faz parte de uma avaliação maior, conversada com o profissional.',
            referencia: 'Spitzer, Kroenke, Williams &amp; Löwe (2006) — corte ≥ 10: sensibilidade 89%, especificidade 82%. Versão brasileira: Moreno et al. (2016).',
            nomeLaudo: 'Escala de Transtorno de Ansiedade Generalizada (GAD-7)',
            artigo: 'Na',
            descLaudo: 'instrumento de rastreio de sintomas de ansiedade referentes às últimas duas semanas',
            sintoma: 'sintomatologia ansiosa'
        },
        'ZARIT': {
            titulo: 'ZARIT',
            subtitulo: 'Escala de Sobrecarga do Cuidador (Burden Interview)<br>22 itens · escala 0-4 · escore total (0-88)',
            corPrincipal: '#F59E0B',
            modalidade: 'Respondida pelo(a) cuidador(a)',
            janela: '',
            corte: null,
            faixas: [[0, 20, 'Sobrecarga pouca ou nenhuma', VERDE], [21, 40, 'Sobrecarga leve a moderada', AMBAR],
                     [41, 60, 'Sobrecarga moderada a grave', LARANJA], [61, 88, 'Sobrecarga grave', VERMELHO]],
            textosNivel: [
                'O(a) cuidador(a) relata pouca ou nenhuma sobrecarga ao cuidar do(a) paciente.',
                'O(a) cuidador(a) relata sobrecarga leve a moderada; vale olhar para a rede de apoio e o descanso de quem cuida.',
                'O(a) cuidador(a) relata sobrecarga moderada a grave; é recomendável pensar em ações de suporte ao cuidador.',
                'O(a) cuidador(a) relata sobrecarga grave; é importante oferecer suporte e orientação a quem cuida.'
            ],
            nota: 'Esta escala mede a <strong>sobrecarga percebida por quem cuida</strong> do(a) paciente. Ela não avalia o paciente e <strong>não constitui diagnóstico</strong>; serve para orientar o cuidado com a família.',
            referencia: 'Zarit, Reever &amp; Bach-Peterson (1980). Versão brasileira: Scazufca (2002). A validação brasileira não propôs ponto de corte; as faixas são as de uso corrente na literatura.',
            nomeLaudo: 'Escala de Sobrecarga do Cuidador de Zarit (Burden Interview)',
            descLaudo: 'instrumento que avalia a sobrecarga percebida pelo(a) cuidador(a) principal'
        }
    };

    const cfg = CFG[SIGLA];

    const state = {
        aplicacao: null, paciente: null, instrumento: null, norma: null,
        itens: [], faixas: [], correcao: null, r: null
    };

    window.addEventListener('cortex:auth-ready', async () => {
        await CortexSidebar.render('pacientes');
        const params = new URLSearchParams(window.location.search);
        const aplicacaoId = params.get('aplicacao_id');
        if (!cfg) { mostrarErro('Escala não configurada: ' + SIGLA); return; }
        if (!aplicacaoId) { mostrarErro('aplicacao_id não fornecido na URL'); return; }
        try {
            await carregarTudo(aplicacaoId);
            renderizar();
        } catch (err) {
            console.error('Erro:', err);
            mostrarErro('Erro: ' + (err.message || 'desconhecido'));
        }
    });

    // ── Dados ───────────────────────────────────────────────────────────────
    async function carregarTudo(aplicacaoId) {
        const c = window.cortexClient;
        const { data: aplicacao, error: errA } = await c.from('aplicacoes_instrumento').select('*').eq('id', aplicacaoId).single();
        if (errA) throw new Error('Aplicação: ' + errA.message);
        state.aplicacao = aplicacao;

        const { data: paciente, error: errP } = await c.from('pacientes')
            .select('id, nome_completo, sexo, data_nascimento').eq('id', aplicacao.paciente_id).single();
        if (errP) throw new Error('Paciente: ' + errP.message);
        state.paciente = paciente;

        const { data: instrumento, error: errI } = await c.from('instrumentos_catalogo')
            .select('id, sigla, nome_completo').eq('id', aplicacao.instrumento_id).single();
        if (errI) throw new Error('Instrumento: ' + errI.message);
        if (instrumento.sigla !== SIGLA) throw new Error(`Esperado ${SIGLA}, encontrado ${instrumento.sigla}`);
        state.instrumento = instrumento;

        const { data: correcao, error: errC } = await c.from('correcoes').select('*').eq('aplicacao_id', aplicacaoId)
            .order('created_at', { ascending: false }).limit(1).maybeSingle();
        if (errC) throw new Error('Correção: ' + errC.message);
        if (!correcao) throw new Error('Nenhuma correção encontrada — o questionário ainda não foi respondido.');
        state.correcao = correcao;

        // Norma: a que corrigiu (escores_brutos.norma_id) ou a ativa
        const normaId = correcao.escores_brutos && correcao.escores_brutos.norma_id;
        let norma = null;
        if (normaId) {
            const { data } = await c.from('instrumentos_normas').select('*').eq('id', normaId).maybeSingle();
            norma = data;
        }
        if (!norma) {
            const { data } = await c.from('instrumentos_normas').select('*').eq('instrumento_id', instrumento.id).eq('ativa', true).maybeSingle();
            norma = data;
        }
        if (!norma) throw new Error('Norma não cadastrada para ' + SIGLA);
        state.norma = norma;

        const [{ data: itens }, { data: faixas }] = await Promise.all([
            c.from('instrumentos_itens').select('numero, texto, opcoes').eq('norma_id', norma.id).order('numero'),
            c.from('instrumentos_classificacoes').select('valor_min, valor_max, label, cor_hex, ordem, fator_id, base_valor')
                .eq('norma_id', norma.id).order('ordem')
        ]);
        state.itens = itens || [];
        const doBanco = (faixas || []).filter(f => !f.fator_id && (f.base_valor || 'raw') === 'raw' && f.valor_min != null && f.valor_max != null);
        state.faixas = doBanco.length
            ? doBanco.map(f => ({ min: f.valor_min, max: f.valor_max, label: f.label, cor: f.cor_hex || '#64748b' }))
            : cfg.faixas.map(f => ({ min: f[0], max: f[1], label: f[2], cor: f[3] }));

        state.r = calcular();
        if (window.CortexAudit) {
            try { await CortexAudit.log('leitura', 'correcoes', correcao.id, { detalhes: { aplicacaoId, sigla: SIGLA } }); } catch (_) { /* ignore */ }
        }
    }

    // ── Correção ────────────────────────────────────────────────────────────
    function opcaoTexto(item, idx) {
        if (Array.isArray(item.opcoes) && item.opcoes.length) {
            const op = item.opcoes[idx];
            if (op == null) return null;
            return (typeof op === 'object') ? op.texto : String(op);
        }
        const labels = Array.isArray(state.norma.answer_labels) ? state.norma.answer_labels : [];
        const t = labels[idx - state.norma.escala_min];
        return t !== undefined ? t : (idx != null ? String(idx) : null);
    }
    function opcaoValor(item, idx) {
        if (Array.isArray(item.opcoes) && item.opcoes.length) {
            const op = item.opcoes[idx];
            if (op == null) return null;
            if (typeof op === 'object') return (op.valor != null && !isNaN(op.valor)) ? parseInt(op.valor, 10) : null;
            return idx;
        }
        return idx;
    }
    function ehExtra(item) {
        return Array.isArray(item.opcoes) && item.opcoes.length > 0 &&
            item.opcoes.every(op => op && typeof op === 'object' && Number(op.valor) === 0);
    }

    function calcular() {
        const resp = (state.correcao.escores_brutos || {}).respostas || {};
        const porItem = {};
        const pontuados = [], extras = [];
        let total = 0;
        for (const item of state.itens) {
            let raw = resp[item.numero];
            if (raw == null) raw = resp[String(item.numero)];
            const idx = (raw != null && !isNaN(raw)) ? parseInt(raw, 10) : null;
            const nota = idx != null ? opcaoValor(item, idx) : null;
            porItem[item.numero] = { idx, nota, texto: idx != null ? opcaoTexto(item, idx) : null };
            if (ehExtra(item)) { extras.push(item); continue; }
            pontuados.push(item);
            if (nota != null) total += nota;
        }
        const scoreMax = state.norma.score_max || cfg.faixas[cfg.faixas.length - 1][1];
        let fi = state.faixas.findIndex(f => total >= f.min && total <= f.max);
        if (fi < 0) fi = state.faixas.length - 1;
        return { porItem, pontuados, extras, total, scoreMax, faixaIdx: fi, faixa: state.faixas[fi] };
    }

    // ── Render ──────────────────────────────────────────────────────────────
    function renderizar() {
        document.getElementById('laudo-conteudo').innerHTML = renderLaudo();
        document.getElementById('acoes-topo').style.display = 'flex';
        document.getElementById('back-link').href = `../../bateria/bateria.html?paciente=${state.paciente.id}`;
        document.getElementById('btn-gerar-pdf').addEventListener('click', gerarPDF);
        const btnTxt = document.getElementById('rast-btn-copiar-texto');
        if (btnTxt) btnTxt.addEventListener('click', copiarTexto);
    }

    function renderLaudo() {
        const p = state.paciente, r = state.r;
        const dataAval = state.aplicacao.data_conclusao || state.aplicacao.finalizada_em || state.aplicacao.created_at;
        const idade = calcularIdade(p.data_nascimento, dataAval);
        const sexoStr = p.sexo === 'M' ? 'Masculino' : (p.sexo === 'F' ? 'Feminino' : (p.sexo || '—'));
        const ehZarit = SIGLA === 'ZARIT';
        let secao = 0;
        const tag = () => `<span class="laudo-secao-tag">${++secao}</span>`;

        return `
        <div class="laudo rast-laudo" style="--rast-cor:${cfg.corPrincipal};">
            <div class="laudo-header">
                <div class="laudo-header-esq">
                    <div class="laudo-header-logo">E</div>
                    <div class="laudo-header-textos">
                        <div class="laudo-header-supratitulo">Relatório de Avaliação Neuropsicológica</div>
                        <h1 class="laudo-header-titulo">${escapeHtml(cfg.titulo)}</h1>
                        <div class="laudo-header-subtitulo">${cfg.subtitulo}</div>
                    </div>
                </div>
                <div class="laudo-header-pontuacao">
                    <div class="laudo-header-pontuacao-label">Escore Total</div>
                    <div class="laudo-header-pontuacao-valor">${r.total}<span style="font-size:18px;color:#94a3b8;">/${r.scoreMax}</span></div>
                </div>
            </div>

            <div class="laudo-body">
                <div class="laudo-secao-titulo">${tag()}Identificação</div>
                <div class="laudo-identificacao">
                    <div class="laudo-identif-item"><span class="laudo-identif-label">Paciente:</span><span class="laudo-identif-valor">${escapeHtml(p.nome_completo)}</span></div>
                    <div class="laudo-identif-item"><span class="laudo-identif-label">Idade:</span><span class="laudo-identif-valor">${idade !== null ? idade + ' anos' : '—'}</span></div>
                    <div class="laudo-identif-item"><span class="laudo-identif-label">Sexo:</span><span class="laudo-identif-valor">${escapeHtml(sexoStr)}</span></div>
                    <div class="laudo-identif-item"><span class="laudo-identif-label">Nascimento:</span><span class="laudo-identif-valor">${formatarDataBR(p.data_nascimento)}</span></div>
                    <div class="laudo-identif-item"><span class="laudo-identif-label">Resposta:</span><span class="laudo-identif-valor">${formatarDataBR(dataAval)}</span></div>
                    <div class="laudo-identif-item"><span class="laudo-identif-label">Modalidade:</span><span class="laudo-identif-valor">${escapeHtml(cfg.modalidade)}</span></div>
                </div>

                <div class="laudo-secao-titulo">${tag()}${ehZarit ? 'Resultado do(a) cuidador(a)' : 'Seu resultado'}</div>
                ${renderNiveis()}
                ${renderRegua()}
                ${renderImpacto()}

                <div class="laudo-secao-titulo">${tag()}Como foram as respostas</div>
                ${renderDistribuicao()}

                <div class="rast-nota-tecnica"><strong>Importante:</strong> ${cfg.nota}</div>

                <div class="laudo-secao-titulo laudo-secao-prof">${tag()}Detalhamento técnico <span class="laudo-secao-prof-tag">uso do profissional</span></div>
                ${renderAlertas()}
                ${renderTabelaItens()}
                ${renderTextoLaudo()}
                <div class="rast-referencia">${cfg.referencia}</div>
            </div>

            <div class="laudo-rodape">
                <div class="laudo-rodape-esq">
                    <div class="laudo-rodape-org">Equilibrium Neuropsicologia</div>
                    <div class="laudo-rodape-tipo">Correção automatizada — ${escapeHtml(cfg.titulo)}</div>
                </div>
                <div class="laudo-rodape-dir">
                    <div class="laudo-rodape-data">Documento gerado em ${formatarDataBR(new Date().toISOString())}</div>
                    <div class="laudo-rodape-confidencial">Documento confidencial — uso restrito ao profissional solicitante.</div>
                </div>
            </div>
        </div>`;
    }

    // Modelo 2: níveis em etapas
    function renderNiveis() {
        const r = state.r;
        const cards = state.faixas.map((f, i) => {
            const ativo = i === r.faixaIdx;
            return `
                <div class="rast-nivel-card ${ativo ? 'ativo' : ''}" style="--c:${f.cor};">
                    <div class="rast-nivel-dot"></div>
                    <div class="rast-nivel-nome">${escapeHtml(nomeCurtoFaixa(f.label))}</div>
                    <div class="rast-nivel-faixa">${f.min} – ${f.max}</div>
                    ${ativo ? `<div class="rast-nivel-voce">● resultado: ${r.total}</div>` : ''}
                </div>`;
        }).join('');
        const texto = cfg.textosNivel[r.faixaIdx] || '';
        return `
            <div class="rast-niveis-bloco">
                <div class="rast-niveis-grid" style="grid-template-columns:repeat(${state.faixas.length},1fr);">${cards}</div>
                <div class="rast-nivel-expl" style="border-left-color:${r.faixa.cor};">
                    <strong>Nível: ${escapeHtml(r.faixa.label.toLowerCase())}.</strong>
                    A pontuação foi <strong>${r.total}</strong> de ${r.scoreMax}. ${escapeHtml(texto)}
                </div>
            </div>`;
    }

    function nomeCurtoFaixa(label) {
        return String(label).replace(/^Sobrecarga\s+/i, '').replace(/^Depressão\s+/i, '').replace(/^\w/, ch => ch.toUpperCase());
    }

    function renderRegua() {
        const r = state.r, max = r.scoreMax;
        const zonas = state.faixas.map(f => {
            const w = ((f.max - f.min + 1) / (max + 1)) * 100;
            return `<div class="rast-regua-zona" style="width:${w.toFixed(3)}%;background:${f.cor};"></div>`;
        }).join('');
        const pos = ((r.total + 0.5) / (max + 1)) * 100;
        let corteHtml = '';
        if (cfg.corte != null) {
            const pc = (cfg.corte / (max + 1)) * 100;
            corteHtml = `<div class="rast-regua-corte" style="left:${pc.toFixed(3)}%;"></div>`;
        }
        const ticks = state.faixas.map(f => f.min === cfg.corte
                ? `<span class="corte" style="left:${((f.min / (max + 1)) * 100).toFixed(3)}%;">${f.min} · corte</span>`
                : `<span style="left:${((f.min / (max + 1)) * 100).toFixed(3)}%;">${f.min}</span>`).join('')
            + `<span class="ult" style="left:100%;">${max}</span>`;
        return `
            <div class="rast-regua-bloco">
                <div class="rast-regua-track">
                    ${zonas}
                    ${corteHtml}
                    <div class="rast-regua-marker" style="left:${pos.toFixed(3)}%;"><span>${r.total}</span></div>
                </div>
                <div class="rast-regua-ticks">${ticks}</div>
            </div>`;
    }

    // Pergunta de impacto funcional (PHQ-9 item 10 / GAD-7 item 8)
    function renderImpacto() {
        const r = state.r;
        if (!r.extras.length) return '';
        return r.extras.map(item => {
            const pi = r.porItem[item.numero];
            const n = Array.isArray(item.opcoes) ? item.opcoes.length : 4;
            const passos = Array.from({ length: n }, (_, i) =>
                `<span class="rast-imp-passo ${pi.idx === i ? 'ativo' : ''} ${pi.idx != null && i <= pi.idx ? 'cheio' : ''}" title="${escapeHtml(opcaoTexto(item, i) || '')}"></span>`).join('');
            return `
                <div class="rast-impacto-card">
                    <div class="rast-impacto-icone">⚖️</div>
                    <div class="rast-impacto-txt">
                        <div class="rast-impacto-titulo">Impacto no dia a dia</div>
                        <div class="rast-impacto-resp">${escapeHtml(pi.texto || 'Não respondido')}</div>
                        <div class="rast-impacto-sub">para trabalhar, cuidar da casa ou se relacionar com as pessoas</div>
                    </div>
                    <div class="rast-imp-passos">${passos}</div>
                </div>`;
        }).join('');
    }

    // Opção B: distribuição das respostas
    function renderDistribuicao() {
        const r = state.r;
        let linhas = [], nota = '';
        if (SIGLA === 'GDS-15') {
            const sintoma = r.pontuados.filter(i => r.porItem[i.numero].nota === 1).length;
            const nao = r.pontuados.length - sintoma;
            linhas = [
                { lbl: 'Indicam sintoma', n: sintoma, cor: VERMELHO },
                { lbl: 'Não indicam', n: nao, cor: VERDE }
            ];
            nota = `Cada pergunta respondida na direção depressiva vale 1 ponto. ${sintoma} das ${r.pontuados.length} respostas pontuaram.`;
        } else {
            const min = state.norma.escala_min, max = state.norma.escala_max;
            const paleta = max - min >= 4 ? [VERDE, '#84cc16', AMBAR, LARANJA, VERMELHO] : [VERDE, AMBAR, LARANJA, VERMELHO];
            for (let v = min; v <= max; v++) {
                const n = r.pontuados.filter(i => r.porItem[i.numero].nota === v).length;
                const labels = Array.isArray(state.norma.answer_labels) ? state.norma.answer_labels : [];
                linhas.push({ lbl: labels[v - min] || String(v), n, cor: paleta[v - min] || '#64748b' });
            }
            nota = SIGLA === 'ZARIT'
                ? `Cada uma das ${r.pontuados.length} perguntas entra em um destes níveis, conforme a frequência com que o(a) cuidador(a) se sente assim.`
                : `Cada um dos ${r.pontuados.length} itens entra em um destes níveis, conforme a frequência ${cfg.janela}.`;
        }
        const maxN = Math.max(1, ...linhas.map(l => l.n));
        return `
            <div class="rast-int-bloco">
                ${linhas.map(l => `
                    <div class="rast-int-row">
                        <span class="rast-int-lbl" style="color:${l.cor};">${escapeHtml(l.lbl)}</span>
                        <span class="rast-int-trk"><span class="rast-int-fill" style="width:${Math.round((l.n / maxN) * 100)}%;background:${l.cor};"></span></span>
                        <span class="rast-int-val">${l.n} ${l.n === 1 ? 'item' : 'itens'}</span>
                    </div>`).join('')}
                <div class="rast-int-nota">${escapeHtml(nota)}</div>
            </div>`;
    }

    function renderAlertas() {
        const r = state.r, out = [];
        if (cfg.itemRisco) {
            const pi = r.porItem[cfg.itemRisco];
            if (pi && pi.nota != null && pi.nota > 0) {
                out.push(`<div class="rast-alerta rast-alerta-risco"><strong>⚠ Item ${cfg.itemRisco} positivo</strong> (“${escapeHtml(pi.texto)}”) — pensamentos de morte ou de se ferir. Investigar ideação suicida e autolesão, independentemente do escore total.</div>`);
            }
        }
        if (SIGLA === 'PHQ-9' && r.total === cfg.corteBR) {
            out.push(`<div class="rast-alerta rast-alerta-info"><strong>Escore 9:</strong> abaixo do corte internacional (≥ 10), mas atinge o corte da validação brasileira (≥ 9; Santos et al., 2013).</div>`);
        }
        if (SIGLA === 'ZARIT') {
            const maximos = r.pontuados.filter(i => r.porItem[i.numero].nota === 4).map(i => i.numero);
            if (maximos.length) {
                out.push(`<div class="rast-alerta rast-alerta-info"><strong>Itens com resposta máxima (4):</strong> ${maximos.join(', ')}.</div>`);
            }
        }
        return out.join('');
    }

    function renderTabelaItens() {
        const r = state.r;
        const corNota = (nota, item) => {
            if (nota == null) return '#cbd5e1';
            if (SIGLA === 'GDS-15') return nota === 1 ? VERMELHO : VERDE;
            const span = (state.norma.escala_max - state.norma.escala_min) || 1;
            const t = (nota - state.norma.escala_min) / span;
            return t >= 0.99 ? VERMELHO : t >= 0.66 ? LARANJA : t >= 0.33 ? AMBAR : VERDE;
        };
        const linhas = state.itens.map(item => {
            const pi = r.porItem[item.numero];
            const extra = ehExtra(item);
            const risco = cfg.itemRisco === item.numero && pi.nota > 0;
            return `<tr${risco ? ' class="rast-linha-risco"' : ''}>
                <td class="rast-td-num">${item.numero}${risco ? ' <span title="Item de risco">⚠</span>' : ''}</td>
                <td>${escapeHtml(item.texto)}</td>
                <td>${escapeHtml(pi.texto || '—')}</td>
                <td class="rast-td-nota" style="color:${extra ? '#94a3b8' : corNota(pi.nota, item)};">${extra ? 'n/p' : (pi.nota != null ? pi.nota : '—')}</td>
            </tr>`;
        }).join('');
        return `
            <div class="rast-tabela-itens">
                <table>
                    <thead><tr>
                        <th style="width:42px;text-align:center;">Nº</th>
                        <th>Item</th>
                        <th style="width:170px;">Resposta</th>
                        <th style="width:56px;text-align:center;">Pontos</th>
                    </tr></thead>
                    <tbody>${linhas}</tbody>
                    <tfoot><tr><td></td><td colspan="2" style="text-align:right;font-weight:700;">Escore total</td>
                        <td class="rast-td-nota" style="color:${state.r.faixa.cor};">${state.r.total}</td></tr></tfoot>
                </table>
                ${r.extras.length ? '<div class="rast-tabela-obs">n/p = não pontua (pergunta de impacto funcional).</div>' : ''}
            </div>`;
    }

    // ── Texto pronto para o laudo ───────────────────────────────────────────
    function textoLaudo() {
        const r = state.r;
        const faixa = r.faixa.label.toLowerCase();
        const partes = [];
        if (SIGLA === 'ZARIT') {
            partes.push(`Na ${cfg.nomeLaudo}, ${cfg.descLaudo}, o(a) cuidador(a) obteve escore total de ${r.total} pontos (de ${r.scoreMax}), compatível com ${faixa}.`);
            const maximos = r.pontuados.filter(i => r.porItem[i.numero].nota === 4).map(i => i.numero);
            if (maximos.length) partes.push(`Os itens ${maximos.join(', ')} foram respondidos na frequência máxima.`);
            partes.push('O resultado reflete a sobrecarga percebida por quem cuida e deve orientar ações de suporte à família.');
        } else if (SIGLA === 'GDS-15') {
            partes.push(`Na ${cfg.nomeLaudo}, ${cfg.descLaudo}, o(a) paciente obteve escore total de ${r.total} pontos (de ${r.scoreMax}).`);
            partes.push(r.total >= cfg.corte
                ? `O resultado está acima do ponto de corte (≥ ${cfg.corte}) e é compatível com ${faixa}, indicando rastreio positivo para sintomas depressivos.`
                : `O resultado está abaixo do ponto de corte (≥ ${cfg.corte}), sem indicativo de sintomatologia depressiva no rastreio.`);
        } else {
            partes.push(`${cfg.artigo} ${cfg.nomeLaudo}, ${cfg.descLaudo}, o(a) paciente obteve escore total de ${r.total} pontos (de ${r.scoreMax}), compatível com ${cfg.sintoma} de intensidade ${faixa}.`);
            if (r.total >= cfg.corte) partes.push(`O escore atinge o ponto de corte (≥ ${cfg.corte}), indicando rastreio positivo.`);
            else if (cfg.corteBR && r.total >= cfg.corteBR) partes.push(`O escore fica abaixo do corte internacional (≥ ${cfg.corte}), mas atinge o corte proposto na validação brasileira (≥ ${cfg.corteBR}).`);
            else partes.push(`O escore fica abaixo do ponto de corte (≥ ${cfg.corte}).`);
            r.extras.forEach(item => {
                const t = r.porItem[item.numero].texto;
                if (t) partes.push(`Quanto ao impacto funcional, relatou ${t.toLowerCase()} para realizar o trabalho, cuidar da casa ou se relacionar com as pessoas.`);
            });
            if (cfg.itemRisco) {
                const pi = r.porItem[cfg.itemRisco];
                if (pi && pi.nota > 0) partes.push(`O item ${cfg.itemRisco} (pensamentos de morte ou de se ferir) foi respondido como "${(pi.texto || '').toLowerCase()}", o que requer avaliação de risco.`);
            }
        }
        partes.push(SIGLA === 'ZARIT'
            ? 'Trata-se de medida de autorrelato do cuidador, que não constitui diagnóstico.'
            : 'Trata-se de instrumento de rastreio, que não fecha diagnóstico isoladamente e deve ser integrado aos demais dados da avaliação.');
        return partes.join(' ');
    }

    function renderTextoLaudo() {
        return `
            <div class="rast-texto-laudo">
                <div class="rast-texto-topo">
                    <span>📝 Texto pronto para o laudo</span>
                    <button type="button" class="btn btn-secondary rast-btn-copiar" id="rast-btn-copiar-texto">Copiar texto</button>
                </div>
                <p id="rast-texto-laudo">${escapeHtml(textoLaudo())}</p>
            </div>`;
    }

    async function copiarTexto() {
        const texto = textoLaudo();
        try {
            await navigator.clipboard.writeText(texto);
            window.CortexUI?.toast ? window.CortexUI.toast('Texto copiado — é só colar no laudo', 'success') : null;
        } catch (_) {
            const sel = window.getSelection(), range = document.createRange();
            range.selectNodeContents(document.getElementById('rast-texto-laudo'));
            sel.removeAllRanges(); sel.addRange(range);
            window.CortexUI?.toast ? window.CortexUI.toast('Texto selecionado — use Ctrl+C', 'info') : null;
        }
    }

    // ── PDF ─────────────────────────────────────────────────────────────────
    async function gerarPDF() {
        const btn = document.getElementById('btn-gerar-pdf');
        const orig = btn.textContent;
        btn.disabled = true; btn.textContent = '⏳ Gerando PDF...';
        try {
            document.body.classList.add('exportando');
            await new Promise(r => setTimeout(r, 100));
            const laudo = document.querySelector('.laudo');
            const canvas = await html2canvas(laudo, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false });
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            const pdfW = 210, pdfH = 297;
            const imgH = (canvas.height * pdfW) / canvas.width;
            const img = canvas.toDataURL('image/jpeg', 0.95);
            if (imgH <= pdfH) {
                pdf.addImage(img, 'JPEG', 0, 0, pdfW, imgH);
            } else {
                let posY = 0, restante = imgH;
                while (restante > 0) {
                    pdf.addImage(img, 'JPEG', 0, -posY, pdfW, imgH);
                    restante -= pdfH; posY += pdfH;
                    if (restante > 0) pdf.addPage();
                }
            }
            const nome = state.paciente.nome_completo.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
                .replace(/[^A-Z\s]/g, '').trim().substring(0, 50);
            pdf.save(`${cfg.titulo} - ${nome}_${formatarDataArquivo(new Date())}.pdf`);
            window.CortexUI?.toast && window.CortexUI.toast('PDF gerado com sucesso', 'success');
        } catch (err) {
            console.error('Erro ao gerar PDF:', err);
            window.CortexUI?.toast && window.CortexUI.toast('Erro ao gerar PDF: ' + err.message, 'danger');
        } finally {
            document.body.classList.remove('exportando');
            btn.disabled = false; btn.textContent = orig;
        }
    }

    // ── Utils ───────────────────────────────────────────────────────────────
    // Datas 'YYYY-MM-DD' lidas como data local (evita o -1 dia do fuso de Brasília)
    function parseData(v) {
        if (!v) return null;
        const s = String(v);
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
        if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
        const d = new Date(s);
        return isNaN(d) ? null : d;
    }
    function calcularIdade(nasc, ref) {
        const n = parseData(nasc), r = parseData(ref) || new Date();
        if (!n || r < n) return null;
        let anos = r.getFullYear() - n.getFullYear();
        const m = r.getMonth() - n.getMonth();
        if (m < 0 || (m === 0 && r.getDate() < n.getDate())) anos--;
        return anos;
    }
    function formatarDataBR(v) {
        const d = parseData(v);
        return d ? d.toLocaleDateString('pt-BR') : '—';
    }
    function formatarDataArquivo(d) {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    function mostrarErro(msg) {
        document.getElementById('laudo-conteudo').innerHTML = `<div class="empty-state"><div class="empty-state-title">${escapeHtml(msg)}</div></div>`;
    }
    function escapeHtml(text) {
        if (text === null || text === undefined) return '';
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }

    // Exposto só para teste local da correção
    window.__rastreioTeste = { CFG, calcularCom: (norma, itens, faixas, correcao) => {
        state.norma = norma; state.itens = itens; state.correcao = correcao;
        state.faixas = faixas.map(f => ({ min: f[0], max: f[1], label: f[2], cor: f[3] }));
        state.r = calcular();
        return { total: state.r.total, faixa: state.r.faixa.label, texto: textoLaudo() };
    } };
})();

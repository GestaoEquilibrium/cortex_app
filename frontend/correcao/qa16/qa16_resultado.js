// ============================================================================
// CORTEX_APP — Resultado QA 16+ (laudo)
// ============================================================================
// URL: ?aplicacao_id=<uuid>
//
// AQ-50 — Autism-Spectrum Quotient (Baron-Cohen et al., 2001)
// 50 itens · escala NÃO-Likert (CT/CP/DP/DT) · 5 subescalas · cutoff 32/50
//
// DECISÃO ARQUITETURAL (Saída A registrada):
//   Banco grava índice 0-3 (CT=0, CP=1, DP=2, DT=3) em escores_brutos.respostas.
//   Aqui no JS:
//     1. Lê as respostas (índice 0-3)
//     2. Aplica gabarito A/B:
//        - Grupo A (24 itens): pontua 1 se 0 ou 1 (CT ou CP); senão 0
//        - Grupo B (26 itens): pontua 1 se 2 ou 3 (DP ou DT); senão 0
//     3. Soma TOTAL (50 itens)
//     4. Soma POR SUBESCALA usando ITEM_TO_SUBESCALA (49 itens — exclui #30)
//     5. Classifica TOTAL em 5 faixas
//
//   Item 30: linkado ao TAT no banco (arbitrário) mas SEM mapping aqui no JS.
//   Pontua no total, não pontua em nenhuma subescala (fiel ao AQ-50 original).
// ============================================================================

(function() {
    'use strict';

    const SIGLA_ESPERADA = 'QA 16+';

    // ============================================================================
    // GABARITO DE PONTUAÇÃO A/B (replicado do index.html app legado)
    // ============================================================================
    const GRUPO_A = new Set([2, 4, 5, 6, 7, 9, 12, 13, 16, 18, 19, 20, 21, 22, 23, 26, 33, 35, 39, 41, 42, 43, 45, 46]);  // pontua 1 se CT (0) ou CP (1)
    const GRUPO_B = new Set([1, 3, 8, 10, 11, 14, 15, 17, 24, 25, 27, 28, 29, 30, 31, 32, 34, 36, 37, 38, 40, 44, 47, 48, 49, 50]);  // pontua 1 se DP (2) ou DT (3)

    // ============================================================================
    // SUBESCALAS (do app legado, fonte: Baron-Cohen 2001)
    // Note: IMA tem 9 itens (não 10). Item 30 não está em nenhuma.
    // ============================================================================
    const SUBESCALAS = {
    "HSO": [
        1,
        11,
        13,
        15,
        22,
        36,
        44,
        45,
        47,
        48
    ],
    "TAT": [
        2,
        4,
        10,
        16,
        29,
        32,
        34,
        37,
        46,
        49
    ],
    "DET": [
        5,
        6,
        9,
        12,
        19,
        23,
        28,
        39,
        41,
        43
    ],
    "COM": [
        7,
        17,
        18,
        26,
        27,
        31,
        33,
        35,
        38,
        42
    ],
    "IMA": [
        3,
        8,
        14,
        20,
        21,
        24,
        25,
        40,
        50
    ]
};

    const SUBESCALAS_INFO = {
        'HSO': { label: 'Habilidade Social',     cor: '#7c3aed', max: 10, descricao: 'Capacidade de interagir socialmente, fazer amigos, apreciar eventos sociais, compreender situações de interação.' },
        'TAT': { label: 'Troca de Atenção',       cor: '#3b82f6', max: 10, descricao: 'Flexibilidade cognitiva: capacidade de alternar foco, lidar com interrupções, mudanças de rotina e multitarefa.' },
        'DET': { label: 'Atenção aos Detalhes',   cor: '#10b981', max: 10, descricao: 'Tendência a notar detalhes finos: padrões, números, sons, pequenas mudanças que outros não percebem.' },
        'COM': { label: 'Comunicação',            cor: '#f59e0b', max: 10, descricao: 'Habilidade de manter conversas, "ler nas entrelinhas", entender intenções, perceber emoções pelo rosto.' },
        'IMA': { label: 'Imaginação',             cor: '#ef4444', max:  9, descricao: 'Capacidade imaginativa: criar imagens mentais, faz-de-conta, ficção, perspectiva de outras pessoas. (9 itens)' }
    };

    const SUBESCALAS_ORDEM = ['HSO', 'TAT', 'DET', 'COM', 'IMA'];

    // ============================================================================
    // MAPEAMENTO ITEM → SUBESCALA (49 itens — item 30 não está aqui)
    // ============================================================================
    const ITEM_TO_SUBESCALA = {"1": "HSO", "11": "HSO", "13": "HSO", "15": "HSO", "22": "HSO", "36": "HSO", "44": "HSO", "45": "HSO", "47": "HSO", "48": "HSO", "2": "TAT", "4": "TAT", "10": "TAT", "16": "TAT", "29": "TAT", "32": "TAT", "34": "TAT", "37": "TAT", "46": "TAT", "49": "TAT", "5": "DET", "6": "DET", "9": "DET", "12": "DET", "19": "DET", "23": "DET", "28": "DET", "39": "DET", "41": "DET", "43": "DET", "7": "COM", "17": "COM", "18": "COM", "26": "COM", "27": "COM", "31": "COM", "33": "COM", "35": "COM", "38": "COM", "42": "COM", "3": "IMA", "8": "IMA", "14": "IMA", "20": "IMA", "21": "IMA", "24": "IMA", "25": "IMA", "40": "IMA", "50": "IMA"};

    // ============================================================================
    // CLASSIFICAÇÃO POR TOTAL (5 faixas — do interpretarTotal do app legado)
    // ============================================================================
    function classificarTotal(total) {
        if (total <= 10) return { label: 'Baixa', slug: 'baixa', cor: '#16a34a',
            desc: 'Pontuação baixa — comum na população geral. Não há indicativo de traços do espectro autista neste autorrelato.' };
        if (total <= 21) return { label: 'Média', slug: 'media', cor: '#0891b2',
            desc: 'Pontuação dentro da média da população geral. Não há indicativo de traços clinicamente significativos.' };
        if (total <= 25) return { label: 'Acima da média', slug: 'acima', cor: '#d97706',
            desc: 'Pontuação ligeiramente acima da média. Pode indicar alguns traços do espectro autista, mas abaixo do limite clínico.' };
        if (total <= 31) return { label: 'Limítrofe', slug: 'limitrofe', cor: '#ea580c',
            desc: 'Pontuação limítrofe — pode indicar alguns traços do espectro autista. Investigação clínica complementar é recomendada.' };
        return { label: 'Clinicamente Significativa', slug: 'clinico', cor: '#dc2626',
            desc: 'Pontuação clinicamente significativa (≥ 32). Indica forte presença de traços do espectro autista. Avaliação diagnóstica complementar é fortemente recomendada.' };
    }

    // ============================================================================
    // PONTUAÇÃO BINÁRIA POR ITEM
    // ============================================================================
    function pontuarItem(itemNum, idxResposta) {
        if (idxResposta == null || isNaN(idxResposta)) return 0;
        // CT=0, CP=1 → "concorda"
        // DP=2, DT=3 → "discorda"
        if (GRUPO_A.has(itemNum)) {
            return (idxResposta === 0 || idxResposta === 1) ? 1 : 0;
        }
        if (GRUPO_B.has(itemNum)) {
            return (idxResposta === 2 || idxResposta === 3) ? 1 : 0;
        }
        return 0;  // não deveria acontecer (todos os 50 itens estão em A ou B)
    }

    // ============================================================================
    // STATE
    // ============================================================================
    const state = {
        aplicacaoId: null,
        aplicacao: null,
        paciente: null,
        norma: null,
        itens: [],
        correcao: null,
        scores: null,
        chartInstance: null
    };

    // ============================================================================
    // BOOT
    // ============================================================================
    window.addEventListener('cortex:auth-ready', async () => {
        await CortexSidebar.render('pacientes');

        const params = new URLSearchParams(window.location.search);
        state.aplicacaoId = params.get('aplicacao_id');

        if (!state.aplicacaoId) { mostrarErro('aplicacao_id não fornecido na URL'); return; }

        try {
            await carregarTudo();
            renderizar();
        } catch (err) {
            console.error('Erro ao carregar:', err);
            mostrarErro('Erro: ' + (err.message || 'desconhecido'));
        }
    });

    async function carregarTudo() {
        const { data: aplicacao, error: errA } = await window.cortexClient
            .from('aplicacoes_instrumento').select('*').eq('id', state.aplicacaoId).single();
        if (errA) throw new Error('Aplicação: ' + errA.message);
        state.aplicacao = aplicacao;

        const { data: paciente, error: errP } = await window.cortexClient
            .from('pacientes').select('id, nome_completo, sexo, data_nascimento, cpf, escolaridade')
            .eq('id', aplicacao.paciente_id).single();
        if (errP) throw new Error('Paciente: ' + errP.message);
        state.paciente = paciente;

        const { data: instrumento, error: errI } = await window.cortexClient
            .from('instrumentos_catalogo').select('id, sigla').eq('id', aplicacao.instrumento_id).single();
        if (errI) throw new Error('Instrumento: ' + errI.message);
        if (instrumento.sigla !== SIGLA_ESPERADA) {
            throw new Error(`Esperado ${SIGLA_ESPERADA}, encontrado ${instrumento.sigla}`);
        }

        const { data: norma } = await window.cortexClient
            .from('instrumentos_normas').select('*').eq('instrumento_id', instrumento.id)
            .eq('ativa', true).maybeSingle();
        if (!norma) throw new Error('Norma QA 16+ não cadastrada');
        state.norma = norma;

        const { data: itens } = await window.cortexClient
            .from('instrumentos_itens').select('numero, texto, reverso, fator_id')
            .eq('norma_id', norma.id).order('numero');
        state.itens = itens || [];

        const { data: correcao, error: errC } = await window.cortexClient
            .from('correcoes').select('*').eq('aplicacao_id', state.aplicacaoId)
            .order('created_at', { ascending: false }).limit(1).maybeSingle();
        if (errC) throw new Error('Correção: ' + errC.message);
        if (!correcao) throw new Error('Nenhuma correção encontrada');
        state.correcao = correcao;

        // Recalcula tudo localmente (decisão arquitetural — JS recalcula, banco é storage)
        state.scores = calcularResultados(correcao);

        await CortexAudit.log('leitura', 'correcoes', correcao.id, {
            detalhes: { aplicacaoId: state.aplicacaoId, sigla: SIGLA_ESPERADA }
        });
    }

    function calcularResultados(correcao) {
        const respostas = (correcao?.escores_brutos || {}).respostas || {};

        // Pontua cada item: 0 ou 1
        const pontosItem = {};  // {itemNum: 0|1}
        for (let n = 1; n <= 50; n++) {
            const idxResp = respostas[n];
            pontosItem[n] = pontuarItem(n, idxResp != null ? parseInt(idxResp, 10) : null);
        }

        // Soma TOTAL (50 itens, incluindo #30)
        let total = 0;
        for (let n = 1; n <= 50; n++) total += pontosItem[n];

        // Soma POR SUBESCALA (49 itens — item 30 NÃO entra)
        const subscores = {};
        for (const code of SUBESCALAS_ORDEM) subscores[code] = 0;
        for (const [itemStr, sub] of Object.entries(ITEM_TO_SUBESCALA)) {
            const n = parseInt(itemStr, 10);
            subscores[sub] += pontosItem[n];
        }

        const totalClassif = classificarTotal(total);

        return { pontosItem, total, subscores, totalClassif };
    }

    // ============================================================================
    // RENDERIZAÇÃO
    // ============================================================================
    function renderizar() {
        const cont = document.getElementById('laudo-conteudo');
        cont.innerHTML = renderLaudo();
        document.getElementById('acoes-topo').style.display = 'flex';

        document.getElementById('back-link').href =
            `../../bateria/bateria.html?paciente=${state.paciente.id}`;
        document.getElementById('btn-gerar-pdf').addEventListener('click', gerarPDF);

        setTimeout(renderGrafico, 50);
    }

    function renderLaudo() {
        const idade = calcularIdade(state.paciente.data_nascimento, state.aplicacao.data_aplicacao);
        const dataApl = state.aplicacao.data_aplicacao || state.aplicacao.created_at;
        const nascStr = state.paciente.data_nascimento
            ? formatarDataBR(state.paciente.data_nascimento) : '—';

        const cl = state.scores.totalClassif;
        const total = state.scores.total;
        const pctBarra = (total / 50) * 100;
        const pctCutoff = (32 / 50) * 100;

        return `
        <div class="laudo">
            <div class="laudo-header">
                <div class="laudo-header-esq">
                    <div class="laudo-header-logo">E</div>
                    <div class="laudo-header-textos">
                        <div class="laudo-header-supratitulo">Relatório de Avaliação Neuropsicológica</div>
                        <h1 class="laudo-header-titulo">QA 16+</h1>
                        <div class="laudo-header-subtitulo">Quociente do Espectro do Autismo (AQ-50)<br>Baron-Cohen et al. (2001) · 50 itens · 5 subescalas · cutoff 32</div>
                    </div>
                </div>
                <div class="laudo-header-pontuacao">
                    <div class="laudo-header-pontuacao-label">Score Total</div>
                    <div class="laudo-header-pontuacao-valor">${total}</div>
                    <div class="laudo-header-pontuacao-detalhe">de 50 (cutoff 32)</div>
                </div>
            </div>

            <div class="laudo-body">

                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">1</span>
                    Identificação
                </div>
                <div class="laudo-identificacao">
                    <div class="laudo-identif-item">
                        <span class="laudo-identif-label">Nome:</span>
                        <span class="laudo-identif-valor">${escapeHtml(state.paciente.nome_completo)}</span>
                    </div>
                    <div class="laudo-identif-item">
                        <span class="laudo-identif-label">Idade:</span>
                        <span class="laudo-identif-valor">${idade !== null ? idade + ' anos' : '—'}</span>
                    </div>
                    <div class="laudo-identif-item">
                        <span class="laudo-identif-label">Sexo:</span>
                        <span class="laudo-identif-valor">${escapeHtml(state.paciente.sexo || '—')}</span>
                    </div>
                    <div class="laudo-identif-item">
                        <span class="laudo-identif-label">Nascimento:</span>
                        <span class="laudo-identif-valor">${nascStr}</span>
                    </div>
                    <div class="laudo-identif-item">
                        <span class="laudo-identif-label">Avaliação:</span>
                        <span class="laudo-identif-valor">${formatarDataBR(dataApl)}</span>
                    </div>
                </div>

                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">2</span>
                    Pontuação Total
                </div>
                <div class="qa-total-card" style="border-left-color:${cl.cor};">
                    <div class="qa-total-card-header">
                        <span class="qa-total-card-numero" style="color:${cl.cor};">${total}</span>
                        <span class="qa-total-card-de">/ 50 pontos</span>
                        <span class="qa-total-card-classif qa-badge-${cl.slug}">${cl.label}</span>
                    </div>
                    <p class="qa-total-card-desc">${cl.desc}</p>
                    <div class="qa-total-barra-wrap">
                        <div class="qa-total-barra-bg">
                            <div class="qa-total-barra-fill" style="width:${pctBarra}%;background:${cl.cor};"></div>
                            <div class="qa-total-cutoff-marker" style="left:${pctCutoff}%;"></div>
                        </div>
                        <span class="qa-total-cutoff-label" style="left:${pctCutoff}%;">| 32 (cutoff)</span>
                        <div class="qa-total-barra-escala">
                            <span>0</span>
                            <span>10</span>
                            <span>20</span>
                            <span>30</span>
                            <span>40</span>
                            <span>50</span>
                        </div>
                    </div>
                </div>

                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">3</span>
                    Pontuação por Subescala
                </div>
                ${renderTabelaSubescalas()}

                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">4</span>
                    Perfil Gráfico das Subescalas
                </div>
                <div class="qa-grafico-wrap">
                    <div class="qa-grafico-canvas-container">
                        <canvas id="qa-chart"></canvas>
                    </div>
                    <div class="qa-grafico-legenda">
                        Pontuação binária por subescala (0-10, exceto Imaginação que tem 9 itens).
                    </div>
                </div>

                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">5</span>
                    Detalhamento por Subescala
                </div>
                ${SUBESCALAS_ORDEM.map(renderSubCard).join('')}

                <div class="qa-nota-tecnica">
                    <strong>Nota técnica:</strong> O QA / AQ-50 (Baron-Cohen et al., 2001)
                    é instrumento de autoavaliação dos traços do espectro autista, validado
                    para adultos a partir de 16 anos. Composto por 50 itens distribuídos em 5
                    subescalas: Habilidade Social, Troca de Atenção, Atenção aos Detalhes,
                    Comunicação e Imaginação. A pontuação é <strong>binária</strong> (0 ou 1
                    por item) via gabarito específico — itens do Grupo A pontuam quando há
                    concordância, itens do Grupo B quando há discordância. O score total varia
                    de 0 a 50, com cutoff de <strong>32 pontos</strong> indicando significação
                    clínica para investigação diagnóstica de TEA. O item 30 é contabilizado no
                    total mas não pertence a nenhuma subescala (fiel à versão original
                    Baron-Cohen). Este instrumento é uma ferramenta de rastreio dimensional —
                    os resultados devem ser interpretados em conjunto com entrevista clínica,
                    anamnese desenvolvimentista e outros dados da avaliação neuropsicológica.
                </div>

                ${renderDetalhesItens()}

            </div>

            <div class="laudo-rodape">
                <div class="laudo-rodape-esq">
                    <div class="laudo-rodape-org">Equilibrium Neuropsicologia</div>
                    <div class="laudo-rodape-tipo">Correção automatizada — QA 16+</div>
                </div>
                <div class="laudo-rodape-dir">
                    <div class="laudo-rodape-data">Documento gerado em ${formatarDataBR(new Date().toISOString())}</div>
                    <div class="laudo-rodape-confidencial">Documento confidencial — uso restrito ao profissional solicitante.</div>
                </div>
            </div>
        </div>
        `;
    }

    function renderTabelaSubescalas() {
        const linhas = SUBESCALAS_ORDEM.map(code => {
            const info = SUBESCALAS_INFO[code];
            const score = state.scores.subscores[code];
            const pct = Math.round((score / info.max) * 100);
            return `<tr>
                <td>
                    <span class="nome-sub">
                        <span class="nome-sub-bullet" style="background:${info.cor};"></span>
                        ${info.label}
                    </span>
                </td>
                <td class="ctr">${info.max}</td>
                <td class="ctr"><span class="escore-bruto">${score} / ${info.max}</span></td>
                <td class="ctr">${pct}%</td>
            </tr>`;
        }).join('');

        return `
            <div class="qa-tab-subescalas">
                <table>
                    <thead>
                        <tr>
                            <th>Subescala</th>
                            <th class="ctr">Itens</th>
                            <th class="ctr">Pontuação</th>
                            <th class="ctr">% do máximo</th>
                        </tr>
                    </thead>
                    <tbody>${linhas}</tbody>
                </table>
            </div>
        `;
    }

    function renderSubCard(code) {
        const info = SUBESCALAS_INFO[code];
        const score = state.scores.subscores[code];
        const pct = Math.round((score / info.max) * 100);

        return `
            <div class="qa-sub-card" style="border-left-color:${info.cor};">
                <div class="qa-sub-card-header">
                    <div class="qa-sub-card-titulo">
                        <span class="qa-sub-card-bullet" style="background:${info.cor};"></span>
                        ${info.label}
                    </div>
                    <span class="qa-sub-card-escore">${score} / ${info.max} (${pct}%)</span>
                </div>
                <p class="qa-sub-card-corpo">${escapeHtml(info.descricao)}</p>
            </div>
        `;
    }

    function renderGrafico() {
        const canvas = document.getElementById('qa-chart');
        if (!canvas || typeof Chart === 'undefined') return;

        if (state.chartInstance) state.chartInstance.destroy();

        const labels = SUBESCALAS_ORDEM.map(c => SUBESCALAS_INFO[c].label);
        const cores  = SUBESCALAS_ORDEM.map(c => SUBESCALAS_INFO[c].cor);
        const scores = SUBESCALAS_ORDEM.map(c => state.scores.subscores[c]);

        state.chartInstance = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    data: scores,
                    backgroundColor: cores,
                    borderRadius: 6,
                    barPercentage: 0.65
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => {
                                const code = SUBESCALAS_ORDEM[ctx.dataIndex];
                                const info = SUBESCALAS_INFO[code];
                                return ` ${ctx.parsed.x} / ${info.max} pontos`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        min: 0,
                        max: 10,
                        ticks: { stepSize: 2 },
                        grid: { color: '#f1f5f9' }
                    },
                    y: {
                        grid: { display: false },
                        ticks: { font: { size: 12, weight: '600' } }
                    }
                }
            }
        });
    }

    function renderDetalhesItens() {
        if (!state.itens.length) return '';
        const labels = state.norma?.answer_labels || [];
        const respostas = state.correcao?.escores_brutos?.respostas || {};

        const linhas = state.itens.map(item => {
            const sub = ITEM_TO_SUBESCALA[item.numero];
            const subTxt = sub
                ? `<span style="background:${SUBESCALAS_INFO[sub].cor}22;color:${SUBESCALAS_INFO[sub].cor};padding:2px 8px;border-radius:6px;font-size:10px;font-weight:700;">${sub}</span>`
                : `<span class="qa-item-30-badge">SEM subescala</span>`;
            const idxResp = respostas[item.numero];
            const labelResp = (idxResp !== undefined && labels[idxResp] !== undefined) ? labels[idxResp] : '—';
            const ponto = state.scores.pontosItem[item.numero];
            const grupo = GRUPO_A.has(item.numero) ? 'A' : (GRUPO_B.has(item.numero) ? 'B' : '?');

            return `<tr>
                <td style="text-align:center;font-weight:700;color:#1e40af;">${item.numero}</td>
                <td>${escapeHtml(item.texto)}</td>
                <td>${subTxt}</td>
                <td style="text-align:center;font-size:10px;">Grupo ${grupo}</td>
                <td style="text-align:center;">${labelResp}</td>
                <td style="text-align:center;font-weight:700;color:${ponto ? '#16a34a' : '#94a3b8'};">${ponto}</td>
            </tr>`;
        }).join('');

        return `
            <details class="laudo-detalhes-toggle">
                <summary>▾ Ver respostas item a item (${state.itens.length} itens)</summary>
                <table class="laudo-detalhes-tabela">
                    <thead>
                        <tr>
                            <th style="width:40px;text-align:center;">Nº</th>
                            <th>Item</th>
                            <th>Subescala</th>
                            <th style="text-align:center;width:60px;">Grupo</th>
                            <th style="text-align:center;width:170px;">Resposta</th>
                            <th style="text-align:center;width:50px;">Ponto</th>
                        </tr>
                    </thead>
                    <tbody>${linhas}</tbody>
                </table>
            </details>
        `;
    }

    // ============================================================================
    // PDF
    // ============================================================================
    async function gerarPDF() {
        const btn = document.getElementById('btn-gerar-pdf');
        const orig = btn.textContent;
        btn.disabled = true;
        btn.textContent = '⏳ Gerando PDF...';

        try {
            document.body.classList.add('exportando');
            await new Promise(r => setTimeout(r, 100));
            const laudo = document.querySelector('.laudo');
            if (!laudo) throw new Error('Laudo não encontrado');

            const canvas = await html2canvas(laudo, {
                scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false
            });

            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            const pdfWidth = 210, pdfHeight = 297;
            const imgWidth = pdfWidth;
            const imgHeight = (canvas.height * pdfWidth) / canvas.width;

            if (imgHeight <= pdfHeight) {
                pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, imgWidth, imgHeight);
            } else {
                let posY = 0, restante = imgHeight;
                while (restante > 0) {
                    pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, -posY, imgWidth, imgHeight);
                    restante -= pdfHeight;
                    posY += pdfHeight;
                    if (restante > 0) pdf.addPage();
                }
            }

            const nomeAbreviado = state.paciente.nome_completo.toUpperCase()
                .replace(/[^A-Z\s]/g, '').trim().substring(0, 50);
            const dataStr = formatarDataArquivo(new Date());
            const nomeArquivo = `QA-16+ - ${nomeAbreviado}_${dataStr}.pdf`;

            pdf.save(nomeArquivo);
            window.CortexUI.toast('PDF gerado com sucesso', 'success');
        } catch (err) {
            console.error('Erro ao gerar PDF:', err);
            window.CortexUI.toast('Erro ao gerar PDF: ' + err.message, 'danger');
        } finally {
            document.body.classList.remove('exportando');
            btn.disabled = false;
            btn.textContent = orig;
        }
    }

    // ============================================================================
    // UTILS
    // ============================================================================
    function calcularIdade(nascISO, aplISO) {
        if (!nascISO) return null;
        const ref = aplISO ? new Date(aplISO) : new Date();
        const n = new Date(nascISO);
        if (isNaN(n) || isNaN(ref) || ref < n) return null;
        let anos = ref.getFullYear() - n.getFullYear();
        const m = ref.getMonth() - n.getMonth();
        if (m < 0 || (m === 0 && ref.getDate() < n.getDate())) anos--;
        return anos;
    }

    function formatarDataBR(iso) {
        if (!iso) return '—';
        const d = iso.includes('T') ? new Date(iso) : new Date(iso + 'T00:00:00');
        return d.toLocaleDateString('pt-BR');
    }

    function formatarDataArquivo(d) {
        const ano = d.getFullYear();
        const mes = String(d.getMonth() + 1).padStart(2, '0');
        const dia = String(d.getDate()).padStart(2, '0');
        return `${ano}-${mes}-${dia}`;
    }

    function mostrarErro(msg) {
        document.getElementById('laudo-conteudo').innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="12" y1="8" x2="12" y2="12"/>
                        <line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                </div>
                <div class="empty-state-title">${escapeHtml(msg)}</div>
            </div>
        `;
    }

    function escapeHtml(text) {
        if (text === null || text === undefined) return '';
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }
})();

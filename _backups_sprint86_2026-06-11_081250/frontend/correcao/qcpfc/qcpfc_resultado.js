// ============================================================================
// CORTEX_APP — Resultado QCP-FC (laudo)
// ============================================================================
// URL: ?aplicacao_id=<uuid>
//
// QCP-FC — Questionário de Crenças Pessoais — Forma Clínica (PBQ-SF)
// Beck & Beck (1991); Forma reduzida: Butler, Beck & Cohen (2007)
// 65 itens · escala 0-4 · 10 escalas de transtornos de personalidade DSM
//
// DECISÃO ARQUITETURAL (Saída A registrada na conversa):
//   - 5 itens compartilham mais de uma escala (#31, 44, 45, 49, 56)
//   - No banco, esses itens linkam ao fator BOR (escolha conservadora)
//   - O JS aqui RECALCULA TUDO do zero a partir das respostas brutas:
//     1. Lê escores_brutos.respostas (objeto {numero: valor})
//     2. Aplica o mapping item→escalas[] (replicado do qcpfc_rules.json)
//     3. Soma score por escala (item compartilhado é somado em todas)
//     4. Calcula Z-score: (raw - media) / dp
//     5. Classifica em 4 faixas: Abaixo / Média / Elevado / Clinicamente significativo
//   - Os fatores que a função publico_finalizar gravar em escores_brutos.fatores
//     são IGNORADOS aqui — as somas no banco ficam imprecisas pelos itens
//     compartilhados, mas isso não importa porque ninguém lê.
//
// PDF: html2canvas + jsPDF, mesma técnica dos outros laudos.
// ============================================================================

(function() {
    'use strict';

    const SIGLA_ESPERADA = 'QCP-FC';

    const ESCALAS_ORDEM = ['EVT', 'DEP', 'PAG', 'OBC', 'ANT', 'NAR', 'HIS', 'ESQ', 'PAR', 'BOR'];

    // ============================================================================
    // ESCALAS (literalmente do qcpfc_rules.json)
    //   nome, cor, corLight, descricao, crencaCentral, itens (lista numeros),
    //   media (norma N=683), dp (norma N=683)
    // ============================================================================
    const ESCALAS = {
    "EVT": {
        "nome": "Evitativo",
        "cor": "#6366f1",
        "corLight": "#eef2ff",
        "descricao": "Crencas de vulnerabilidade e inadequacao social. O individuo acredita ser socialmente inepto, incompetente e vulneravel a rejeicao.",
        "crencaCentral": "Sou inaceitavel. Se as pessoas me conhecessem de verdade, me rejeitariam.",
        "itens": [
            1,
            2,
            5,
            31,
            33,
            39,
            43
        ],
        "media": 10.86,
        "dp": 6.46
    },
    "DEP": {
        "nome": "Dependente",
        "cor": "#8b5cf6",
        "corLight": "#f5f3ff",
        "descricao": "Crencas de desamparo e necessidade de apoio. O individuo acredita ser fragil, incapaz e necessitado de ajuda constante.",
        "crencaCentral": "Sou desamparado(a). Preciso dos outros para sobreviver.",
        "itens": [
            15,
            18,
            44,
            45,
            56,
            62,
            63
        ],
        "media": 9.26,
        "dp": 6.12
    },
    "PAG": {
        "nome": "Passivo-Agressivo",
        "cor": "#ec4899",
        "corLight": "#fdf2f8",
        "descricao": "Crencas de resistencia a autoridade e controle externo. O individuo acredita que deve resistir ao dominio dos outros e manter sua autonomia.",
        "crencaCentral": "Ser controlado pelos outros e intoleravel. Devo fazer as coisas do meu jeito.",
        "itens": [
            4,
            7,
            20,
            21,
            41,
            47,
            51
        ],
        "media": 8.09,
        "dp": 5.97
    },
    "OBC": {
        "nome": "Obsessivo-Compulsivo",
        "cor": "#0891b2",
        "corLight": "#ecfeff",
        "descricao": "Crencas de perfeccionismo e necessidade de controle. O individuo acredita que deve manter ordem, sistemas e padroes rigidos.",
        "crencaCentral": "Nao posso falhar. Preciso de sistemas, ordem e regras para funcionar.",
        "itens": [
            6,
            9,
            11,
            19,
            30,
            40,
            57
        ],
        "media": 10.56,
        "dp": 7.2
    },
    "ANT": {
        "nome": "Antissocial",
        "cor": "#dc2626",
        "corLight": "#fef2f2",
        "descricao": "Crencas de direito e justificacao para transgredir regras. O individuo acredita que as regras dos outros nao se aplicam a ele.",
        "crencaCentral": "As pessoas estao ai para serem usadas. Regras sao feitas para os outros.",
        "itens": [
            23,
            32,
            35,
            38,
            42,
            59,
            61
        ],
        "media": 4.25,
        "dp": 4.3
    },
    "NAR": {
        "nome": "Narcisista",
        "cor": "#f59e0b",
        "corLight": "#fffbeb",
        "descricao": "Crencas de superioridade e merecimento especial. O individuo acredita ser superior e merecedor de tratamento privilegiado.",
        "crencaCentral": "Sou especial e superior. Mereco tratamento diferenciado.",
        "itens": [
            10,
            16,
            26,
            27,
            46,
            58,
            60
        ],
        "media": 3.42,
        "dp": 4.23
    },
    "HIS": {
        "nome": "Histrionico",
        "cor": "#e11d48",
        "corLight": "#fff1f2",
        "descricao": "Crencas sobre necessidade de impressionar e entreter os outros para ser valorizado.",
        "crencaCentral": "Preciso impressionar as pessoas. Se nao entreter os outros, eles nao vao gostar de mim.",
        "itens": [
            8,
            22,
            34,
            37,
            52,
            54,
            55
        ],
        "media": 6.47,
        "dp": 6.09
    },
    "ESQ": {
        "nome": "Esquizoide",
        "cor": "#475569",
        "corLight": "#f1f5f9",
        "descricao": "Crencas de autossuficiencia e preferencia pelo isolamento. O individuo acredita que relacionamentos sao problematicos e desnecessarios.",
        "crencaCentral": "Sou basicamente sozinho(a). Relacionamentos sao confusos e indesejaveis.",
        "itens": [
            12,
            25,
            28,
            29,
            36,
            50,
            53
        ],
        "media": 8.99,
        "dp": 5.6
    },
    "PAR": {
        "nome": "Paranoide",
        "cor": "#b91c1c",
        "corLight": "#fef2f2",
        "descricao": "Crencas de desconfianca e suspeita em relacao aos outros. O individuo acredita que as pessoas sao potencialmente perigosas e traicoeiras.",
        "crencaCentral": "As pessoas sao potencialmente perigosas. Devo estar sempre alerta.",
        "itens": [
            3,
            13,
            14,
            17,
            24,
            48,
            49
        ],
        "media": 6.0,
        "dp": 6.0
    },
    "BOR": {
        "nome": "Borderline / Limitrofe",
        "cor": "#7c3aed",
        "corLight": "#f5f3ff",
        "descricao": "Crencas de instabilidade, abandono e vulnerabilidade emocional. Inclui itens compartilhados com as escalas evitativa, dependente e paranoide.",
        "crencaCentral": "Sou vulneravel e posso ser abandonado(a). Nao consigo controlar minhas emocoes.",
        "itens": [
            31,
            44,
            45,
            49,
            56,
            64,
            65
        ],
        "media": 8.0,
        "dp": 6.5
    }
};

    // ============================================================================
    // MAPEAMENTO ITEM → ESCALAS (replicado do qcpfc_rules.json)
    //   {1: ["EVT"], 31: ["EVT", "BOR"], ...}
    // ============================================================================
    const ITEM_TO_ESCALAS = {"1": ["EVT"], "2": ["EVT"], "3": ["PAR"], "4": ["PAG"], "5": ["EVT"], "6": ["OBC"], "7": ["PAG"], "8": ["HIS"], "9": ["OBC"], "10": ["NAR"], "11": ["OBC"], "12": ["ESQ"], "13": ["PAR"], "14": ["PAR"], "15": ["DEP"], "16": ["NAR"], "17": ["PAR"], "18": ["DEP"], "19": ["OBC"], "20": ["PAG"], "21": ["PAG"], "22": ["HIS"], "23": ["ANT"], "24": ["PAR"], "25": ["ESQ"], "26": ["NAR"], "27": ["NAR"], "28": ["ESQ"], "29": ["ESQ"], "30": ["OBC"], "31": ["EVT", "BOR"], "32": ["ANT"], "33": ["EVT"], "34": ["HIS"], "35": ["ANT"], "36": ["ESQ"], "37": ["HIS"], "38": ["ANT"], "39": ["EVT"], "40": ["OBC"], "41": ["PAG"], "42": ["ANT"], "43": ["EVT"], "44": ["DEP", "BOR"], "45": ["DEP", "BOR"], "46": ["NAR"], "47": ["PAG"], "48": ["PAR"], "49": ["PAR", "BOR"], "50": ["ESQ"], "51": ["PAG"], "52": ["HIS"], "53": ["ESQ"], "54": ["HIS"], "55": ["HIS"], "56": ["DEP", "BOR"], "57": ["OBC"], "58": ["NAR"], "59": ["ANT"], "60": ["NAR"], "61": ["ANT"], "62": ["DEP"], "63": ["DEP"], "64": ["BOR"], "65": ["BOR"]};

    // ============================================================================
    // CLASSIFICAÇÃO POR Z-SCORE (4 faixas — do classificarZ do app legado)
    // ============================================================================
    function classificarZ(z) {
        if (z == null || isNaN(z)) return { label: 'Sem dado', slug: 'vazio' };
        if (z < 0)  return { label: 'Abaixo da média',           slug: 'abaixo' };
        if (z <= 1) return { label: 'Média',                     slug: 'media' };
        if (z <= 2) return { label: 'Elevado',                   slug: 'elevado' };
        return            { label: 'Clinicamente significativo', slug: 'significativo' };
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
        if (!norma) throw new Error('Norma QCP-FC não cadastrada');
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

        // Calcula scores localmente (decisão arquitetural — JS recalcula tudo)
        state.scores = calcularResultados(correcao);

        await CortexAudit.log('leitura', 'correcoes', correcao.id, {
            detalhes: { aplicacaoId: state.aplicacaoId, sigla: SIGLA_ESPERADA }
        });
    }

    function calcularResultados(correcao) {
        const respostas = (correcao?.escores_brutos || {}).respostas || {};
        const out = {};

        // Inicializa cada escala com 0
        for (const code of ESCALAS_ORDEM) {
            out[code] = { bruto: 0, z: null, classifLabel: 'Sem dado', classifSlug: 'vazio', respostasContadas: 0 };
        }

        // Para cada item respondido, soma em TODAS as escalas a que pertence
        // (isso resolve o caso dos 5 itens compartilhados corretamente)
        for (const [itemNumStr, valorStr] of Object.entries(respostas)) {
            const itemNum = parseInt(itemNumStr, 10);
            const valor = parseInt(valorStr, 10);
            if (isNaN(itemNum) || isNaN(valor)) continue;

            const escalas = ITEM_TO_ESCALAS[itemNum] || [];
            for (const code of escalas) {
                if (out[code]) {
                    out[code].bruto += valor;
                    out[code].respostasContadas += 1;
                }
            }
        }

        // Calcula Z-score e classificação por escala
        for (const code of ESCALAS_ORDEM) {
            const e = ESCALAS[code];
            const z = (out[code].bruto - e.media) / e.dp;
            const classif = classificarZ(z);
            out[code].z = z;
            out[code].classifLabel = classif.label;
            out[code].classifSlug = classif.slug;
        }

        return out;
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

        // Quantas escalas elevadas (Z > 1)?
        const elevadas = ESCALAS_ORDEM.filter(c =>
            state.scores[c].z > 1
        );
        const sigsElevadas = elevadas.length;

        return `
        <div class="laudo">
            <div class="laudo-header">
                <div class="laudo-header-esq">
                    <div class="laudo-header-logo">E</div>
                    <div class="laudo-header-textos">
                        <div class="laudo-header-supratitulo">Relatório de Avaliação Neuropsicológica</div>
                        <h1 class="laudo-header-titulo">QCP-FC</h1>
                        <div class="laudo-header-subtitulo">Questionário de Crenças Pessoais — Forma Clínica<br>65 itens · 10 escalas · norma N=683 (amostra clínica)</div>
                    </div>
                </div>
                <div class="laudo-header-pontuacao">
                    <div class="laudo-header-pontuacao-label">Escalas Elevadas (Z &gt; 1)</div>
                    <div class="laudo-header-pontuacao-valor" style="font-size:32px;">${sigsElevadas}</div>
                    <div class="laudo-header-pontuacao-detalhe">de 10 escalas</div>
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
                    Escores por Escala
                </div>
                ${renderTabelaEscalas()}

                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">3</span>
                    Perfil Z-Score (Comparação com Norma Clínica N=683)
                </div>
                <div class="qcpfc-grafico-wrap">
                    <div class="qcpfc-grafico-canvas-container">
                        <canvas id="qcpfc-chart"></canvas>
                    </div>
                    <div class="qcpfc-grafico-legenda">
                        Linha laranja em Z=1 indica limite de elevação. Linha vermelha em Z=2 indica limite de significação clínica.
                    </div>
                </div>

                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">4</span>
                    Detalhamento por Escala
                </div>
                ${ESCALAS_ORDEM.map(renderEscalaCard).join('')}

                <div class="qcpfc-nota-tecnica">
                    <strong>Nota técnica:</strong> O QCP-FC (Beck &amp; Beck, 1991; forma reduzida
                    Butler, Beck &amp; Cohen, 2007) é um instrumento de autorrelato baseado na
                    teoria cognitiva dos transtornos de personalidade, com 65 itens em 10 escalas
                    correspondentes aos transtornos de personalidade do DSM. Os escores Z são
                    calculados com base em amostra clínica psiquiátrica ambulatorial brasileira
                    (N=683). Em amostras psiquiátricas mistas, 99% dos escores Z ficam entre -3
                    e +3, com média 0. Não há ponto de corte empiricamente estabelecido —
                    escores Z próximos ou acima do escore Z do grupo critério são clinicamente
                    sugestivos. Cinco itens (#31, 44, 45, 49, 56) compartilham duas escalas e são
                    contabilizados em ambas. Este instrumento deve ser interpretado em conjunto
                    com entrevista clínica e outros dados da avaliação.
                </div>

                ${renderDetalhesItens()}

            </div>

            <div class="laudo-rodape">
                <div class="laudo-rodape-esq">
                    <div class="laudo-rodape-org">Equilibrium Neuropsicologia</div>
                    <div class="laudo-rodape-tipo">Correção automatizada — QCP-FC</div>
                </div>
                <div class="laudo-rodape-dir">
                    <div class="laudo-rodape-data">Documento gerado em ${formatarDataBR(new Date().toISOString())}</div>
                    <div class="laudo-rodape-confidencial">Documento confidencial — uso restrito ao profissional solicitante.</div>
                </div>
            </div>
        </div>
        `;
    }

    function renderTabelaEscalas() {
        const linhas = ESCALAS_ORDEM.map(code => {
            const r = state.scores[code];
            const e = ESCALAS[code];
            const zTxt = r.z != null ? r.z.toFixed(2) : '—';
            const zClass = r.z > 0 ? 'color:#dc2626;' : 'color:#10b981;';
            const badge = `<span class="qcpfc-badge qcpfc-badge-${r.classifSlug}">${r.classifLabel}</span>`;

            return `<tr>
                <td>
                    <span class="nome-escala">
                        <span class="nome-escala-bullet" style="background:${e.cor};"></span>
                        ${code} — ${e.nome}
                    </span>
                </td>
                <td class="ctr">${e.itens.length}</td>
                <td class="ctr"><span class="escore-bruto">${r.bruto} / 28</span></td>
                <td class="ctr"><span class="z-score" style="${zClass}">${zTxt}</span></td>
                <td class="ctr">${badge}</td>
            </tr>`;
        }).join('');

        return `
            <div class="qcpfc-tab-escalas">
                <table>
                    <thead>
                        <tr>
                            <th>Escala</th>
                            <th class="ctr">Itens</th>
                            <th class="ctr">Bruto</th>
                            <th class="ctr">Z-Score</th>
                            <th class="ctr">Classificação</th>
                        </tr>
                    </thead>
                    <tbody>${linhas}</tbody>
                </table>
            </div>
        `;
    }

    function renderEscalaCard(code) {
        const r = state.scores[code];
        const e = ESCALAS[code];
        const badge = `<span class="qcpfc-escala-card-classif-meta qcpfc-badge-${r.classifSlug}">${r.classifLabel} · Z=${r.z != null ? r.z.toFixed(2) : '—'}</span>`;

        return `
            <div class="qcpfc-escala-card" style="border-left-color:${e.cor};color:${e.cor};">
                <div class="qcpfc-escala-card-header">
                    <div class="qcpfc-escala-card-titulo" style="color:#1e293b;">
                        <span class="qcpfc-escala-card-bullet" style="background:${e.cor};"></span>
                        ${code} — ${e.nome}
                    </div>
                    ${badge}
                </div>
                <p class="qcpfc-escala-card-corpo">${escapeHtml(e.descricao)}</p>
                <div class="qcpfc-escala-card-crenca">
                    <strong>Crença central:</strong> &ldquo;${escapeHtml(e.crencaCentral)}&rdquo;
                </div>
            </div>
        `;
    }

    function renderGrafico() {
        const canvas = document.getElementById('qcpfc-chart');
        if (!canvas || typeof Chart === 'undefined') return;

        if (state.chartInstance) state.chartInstance.destroy();

        const labels = ESCALAS_ORDEM.map(c => c + ' — ' + ESCALAS[c].nome);
        const cores  = ESCALAS_ORDEM.map(c => ESCALAS[c].cor);
        const zValues = ESCALAS_ORDEM.map(c => state.scores[c].z ?? 0);

        // Plugin inline: desenha as linhas de corte Z=1 (laranja) e Z=2 (vermelha)
        // sem depender do chartjs-plugin-annotation (que nao esta carregado).
        const linhasCorte = {
            id: 'qcpfcLinhasCorte',
            afterDatasetsDraw(chart) {
                const { ctx, chartArea, scales } = chart;
                if (!chartArea || !scales.x) return;
                const desenha = (valor, cor) => {
                    const x = scales.x.getPixelForValue(valor);
                    if (x < chartArea.left || x > chartArea.right) return;
                    ctx.save();
                    ctx.beginPath();
                    ctx.setLineDash([4, 4]);
                    ctx.lineWidth = 2;
                    ctx.strokeStyle = cor;
                    ctx.moveTo(x, chartArea.top);
                    ctx.lineTo(x, chartArea.bottom);
                    ctx.stroke();
                    ctx.restore();
                };
                desenha(1, '#f59e0b'); // limite de elevação
                desenha(2, '#dc2626'); // limite de significação clínica
            }
        };

        state.chartInstance = new Chart(canvas, {
            type: 'bar',
            plugins: [linhasCorte],
            data: {
                labels: labels,
                datasets: [{
                    label: 'Z-Score',
                    data: zValues,
                    backgroundColor: cores,
                    borderRadius: 6,
                    barPercentage: 0.7
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
                                const code = ESCALAS_ORDEM[ctx.dataIndex];
                                const r = state.scores[code];
                                const zTxt = (r.z != null && !isNaN(r.z)) ? r.z.toFixed(2) : '—';
                                return ` Z=${zTxt} · ${r.classifLabel} · bruto=${r.bruto}/28`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        min: -3,
                        max: 4,
                        title: { display: true, text: 'Z-Score (média populacional clínica = 0)' },
                        grid: {
                            color: (ctx) => ctx.tick.value === 0 ? '#64748b' : '#f1f5f9',
                            lineWidth: (ctx) => ctx.tick.value === 0 ? 2 : 1
                        }
                    },
                    y: {
                        grid: { display: false },
                        ticks: { font: { size: 11, weight: '600' } }
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
            const escalas = ITEM_TO_ESCALAS[item.numero] || [];
            const escalasTxt = escalas.map(c => `<span style="background:${ESCALAS[c].corLight};color:${ESCALAS[c].cor};padding:2px 8px;border-radius:6px;font-size:10px;font-weight:700;margin-right:3px;">${c}</span>`).join('');
            const valor = respostas[item.numero];
            const labelTxt = (valor !== undefined && labels[valor] !== undefined) ? labels[valor] : '—';
            return `<tr>
                <td style="text-align:center;font-weight:700;color:#1e40af;">${item.numero}</td>
                <td>${escapeHtml(item.texto)}</td>
                <td>${escalasTxt}</td>
                <td style="text-align:center;">${labelTxt} (${valor ?? '—'})</td>
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
                            <th>Escala(s)</th>
                            <th style="text-align:center;width:200px;">Resposta</th>
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
            const nomeArquivo = `QCP-FC - ${nomeAbreviado}_${dataStr}.pdf`;

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

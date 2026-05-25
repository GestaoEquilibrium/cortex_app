// ============================================================================
// CORTEX_APP — Resultado YSQ-S3 (Esquemas de Young - laudo)
// ============================================================================
// URL: ?aplicacao_id=<uuid>
//
// Jeffrey Young, Ph.D. | Adapt. BR: GAAPCC/PUCRS (2020)
// 90 itens · escala 1-6 · 18 esquemas × 5 itens · 5 domínios
// Autoaplicado (paciente 18+)
//
// JS recalcula tudo do zero a partir de escores_brutos.respostas (decisão B).
//
// Cálculo:
//   - Média por esquema (soma 5 ÷ 5)
//   - Classificação por faixa: ≤2.0 ausente · 2.1-3.0 leve · 3.1-4.0 moderado
//                              · 4.1-5.0 intenso · 5.1-6.0 muito intenso
//   - Ponto de corte clínico: média ≥ 3.0
//   - Total: soma simples dos 90 itens (90-540)
//   - Média geral: total ÷ 90
//   - Agrupamento por domínio (5 domínios)
// ============================================================================

(function() {
    'use strict';

    const SIGLA_ESPERADA = 'YSQ-S3';
    const CORTE_CLINICO = 3.0;
    const TOTAL_ITENS = 90;
    const ESCALA_MAX = 6;
    const ITENS_POR_ESQUEMA = 5;

    // Mapa de esquemas → itens (códigos das normas)
    // A ORDEM aqui define a ordem visual no laudo (agrupado por domínio).
    const ESQUEMAS = [
        // D1 — Desconexão e Rejeição
        { codigo: 'privacao_emocional',        nome: 'Privação Emocional',                    dominio: 'D1' },
        { codigo: 'abandono_instabilidade',    nome: 'Abandono / Instabilidade',              dominio: 'D1' },
        { codigo: 'desconfianca_abuso',        nome: 'Desconfiança / Abuso',                  dominio: 'D1' },
        { codigo: 'isolamento_social',         nome: 'Isolamento Social / Alienação',         dominio: 'D1' },
        { codigo: 'defectividade_vergonha',    nome: 'Defectividade / Vergonha',              dominio: 'D1' },
        // D2 — Autonomia e Desempenho Prejudicados
        { codigo: 'fracasso',                  nome: 'Fracasso',                              dominio: 'D2' },
        { codigo: 'dependencia_incompetencia', nome: 'Dependência / Incompetência',           dominio: 'D2' },
        { codigo: 'vulnerabilidade_dano',      nome: 'Vulnerabilidade ao Dano / Doença',      dominio: 'D2' },
        { codigo: 'emaranhamento',             nome: 'Emaranhamento / Self Subdesenvolvido',  dominio: 'D2' },
        // D3 — Limites Prejudicados
        { codigo: 'subjugacao',                nome: 'Subjugação',                            dominio: 'D3' },
        { codigo: 'autossacrificio',           nome: 'Autossacrifício',                       dominio: 'D3' },
        { codigo: 'inibicao_emocional',        nome: 'Inibição Emocional',                    dominio: 'D3' },
        // D4 — Orientação para o Outro
        { codigo: 'padroes_inflexiveis',       nome: 'Padrões Inflexíveis / Postura Crítica', dominio: 'D4' },
        { codigo: 'arrogo_grandiosidade',      nome: 'Arrogo / Grandiosidade',                dominio: 'D4' },
        { codigo: 'autocontrole_insuficiente', nome: 'Autocontrole / Autodisciplina Insuf.',  dominio: 'D4' },
        // D5 — Supervigilância e Inibição
        { codigo: 'busca_aprovacao',           nome: 'Busca de Aprovação / Reconhecimento',   dominio: 'D5' },
        { codigo: 'negativismo_pessimismo',    nome: 'Negativismo / Pessimismo',              dominio: 'D5' },
        { codigo: 'postura_punitiva',          nome: 'Postura Punitiva',                      dominio: 'D5' }
    ];

    const DOMINIOS = {
        D1: 'Desconexão e Rejeição',
        D2: 'Autonomia e Desempenho Prejudicados',
        D3: 'Limites Prejudicados',
        D4: 'Orientação para o Outro',
        D5: 'Supervigilância e Inibição'
    };

    // ============================================================================
    // STATE
    // ============================================================================
    const state = {
        aplicacaoId: null,
        aplicacao: null,
        paciente: null,
        norma: null,
        itens: [],           // [{numero, texto, fator_codigo}]
        fatores: [],         // [{fator_codigo, fator_label, ordem}]
        correcao: null,
        scores: null,
        chartPerfil: null
    };

    // ============================================================================
    // BOOT
    // ============================================================================
    window.addEventListener('cortex:auth-ready', async () => {
        await CortexSidebar.render('pacientes');

        const params = new URLSearchParams(window.location.search);
        state.aplicacaoId = params.get('aplicacao_id');

        if (!state.aplicacaoId) {
            mostrarErro('aplicacao_id não fornecido na URL');
            return;
        }

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
            .from('pacientes')
            .select('id, nome_completo, sexo, data_nascimento, cpf, escolaridade, escolaridade_serie, mae_nome, pai_nome, responsavel_nome')
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
        if (!norma) throw new Error('Norma YSQ-S3 não cadastrada');
        state.norma = norma;

        // Itens com seu fator_codigo (necessário pra agrupar por esquema)
        const { data: fatores } = await window.cortexClient
            .from('instrumentos_fatores')
            .select('id, fator_codigo, fator_label, ordem, eh_total')
            .eq('norma_id', norma.id)
            .order('ordem');
        state.fatores = fatores || [];

        const { data: itensRaw } = await window.cortexClient
            .from('instrumentos_itens').select('numero, texto, fator_id')
            .eq('norma_id', norma.id).order('numero');

        // Mapeia fator_id → fator_codigo
        const mapFator = {};
        for (const f of state.fatores) mapFator[f.id] = f.fator_codigo;
        state.itens = (itensRaw || []).map(i => ({
            numero: i.numero,
            texto: i.texto,
            fator_codigo: mapFator[i.fator_id] || 'desconhecido'
        }));

        const { data: correcao, error: errC } = await window.cortexClient
            .from('correcoes').select('*').eq('aplicacao_id', state.aplicacaoId)
            .order('created_at', { ascending: false }).limit(1).maybeSingle();
        if (errC) throw new Error('Correção: ' + errC.message);
        if (!correcao) throw new Error('Nenhuma correção encontrada');
        state.correcao = correcao;

        state.scores = calcularResultados(correcao);

        await CortexAudit.log('leitura', 'correcoes', correcao.id, {
            detalhes: { aplicacaoId: state.aplicacaoId, sigla: SIGLA_ESPERADA }
        });
    }

    // ============================================================================
    // CÁLCULO (decisão arquitetural B — JS recalcula tudo do zero)
    // ============================================================================
    function calcularResultados(correcao) {
        const respostas = (correcao?.escores_brutos || {}).respostas || {};

        // Mapa: numero → valor
        const respostaPorNumero = {};
        for (const [k, v] of Object.entries(respostas)) {
            respostaPorNumero[parseInt(k)] = parseInt(v) || 0;
        }

        // Mapa: fator_codigo → lista de itens (com valor)
        const porEsquema = {};
        for (const esq of ESQUEMAS) {
            porEsquema[esq.codigo] = {
                ...esq,
                itens: [],
                soma: 0,
                media: 0,
                classificacao: 'ausente',
                acimaCorte: false
            };
        }

        for (const item of state.itens) {
            const valor = respostaPorNumero[item.numero] ?? 0;
            const esqCod = item.fator_codigo;
            if (porEsquema[esqCod]) {
                porEsquema[esqCod].itens.push({ numero: item.numero, valor, texto: item.texto });
                porEsquema[esqCod].soma += valor;
            }
        }

        // Calcula média + classificação por esquema
        for (const esq of Object.values(porEsquema)) {
            const n = esq.itens.length;
            esq.media = n > 0 ? esq.soma / n : 0;
            esq.classificacao = classificarMedia(esq.media);
            esq.acimaCorte = esq.media >= CORTE_CLINICO;
        }

        // Lista ordenada por domínio (mantém ordem original)
        const esquemasOrdenados = ESQUEMAS.map(e => porEsquema[e.codigo]);

        // Agrupados por domínio
        const porDominio = {};
        for (const dom of Object.keys(DOMINIOS)) {
            porDominio[dom] = {
                codigo: dom,
                nome: DOMINIOS[dom],
                esquemas: esquemasOrdenados.filter(e => e.dominio === dom),
                somaMedias: 0,
                qtdAcimaCorte: 0
            };
            porDominio[dom].somaMedias = porDominio[dom].esquemas.reduce((a, e) => a + e.media, 0);
            porDominio[dom].qtdAcimaCorte = porDominio[dom].esquemas.filter(e => e.acimaCorte).length;
            porDominio[dom].mediaDominio = porDominio[dom].esquemas.length > 0
                ? porDominio[dom].somaMedias / porDominio[dom].esquemas.length : 0;
        }

        // Totais
        const totalGeral = esquemasOrdenados.reduce((a, e) => a + e.soma, 0);
        const respondidos = Object.keys(respostas).length;
        const mediaGeral = respondidos > 0 ? totalGeral / respondidos : 0;
        const esquemasClinicos = esquemasOrdenados.filter(e => e.acimaCorte);

        return {
            totalGeral,
            mediaGeral,
            respondidos,
            faltam: TOTAL_ITENS - respondidos,
            esquemasOrdenados,
            esquemasClinicos,
            porDominio
        };
    }

    function classificarMedia(media) {
        if (media <= 2.0) return 'ausente';
        if (media <= 3.0) return 'leve';
        if (media <= 4.0) return 'moderado';
        if (media <= 5.0) return 'intenso';
        return 'muito_intenso';
    }

    function labelClassificacao(c) {
        return {
            ausente:        'Ausente / Irrelevante',
            leve:           'Leve',
            moderado:       'Moderado',
            intenso:        'Intenso',
            muito_intenso:  'Muito intenso'
        }[c] || '—';
    }

    function corClassificacao(c) {
        return {
            ausente:        '#94a3b8',
            leve:           '#64748b',
            moderado:       '#eab308',
            intenso:        '#f97316',
            muito_intenso:  '#dc2626'
        }[c] || '#cbd5e1';
    }

    // ============================================================================
    // RENDERIZAÇÃO PRINCIPAL
    // ============================================================================
    function renderizar() {
        const cont = document.getElementById('laudo-conteudo');
        cont.innerHTML = renderLaudo();

        document.getElementById('acoes-topo').style.display = 'flex';
        document.getElementById('back-link').href =
            `../../bateria/bateria.html?paciente=${state.paciente.id}`;
        document.getElementById('btn-gerar-pdf').addEventListener('click', gerarPDF);

        setTimeout(() => {
            renderGraficoPerfil();
        }, 50);
    }

    function renderLaudo() {
        const s = state.scores;
        const p = state.paciente;
        const idade = calcularIdadeAnos(p.data_nascimento, state.aplicacao.created_at);
        const dataAplic = formatarDataBR(state.aplicacao.created_at);
        const nascStr = formatarDataBR(p.data_nascimento);

        const qtdClinicos = s.esquemasClinicos.length;

        return `
        <div class="laudo">
            <div class="laudo-header">
                <div class="laudo-header-esq">
                    <div class="laudo-header-logo">E</div>
                    <div class="laudo-header-textos">
                        <div class="laudo-header-supratitulo">Relatório de Avaliação Neuropsicológica</div>
                        <h1 class="laudo-header-titulo">YSQ-S3</h1>
                        <div class="laudo-header-subtitulo">Questionário de Esquemas de Young (Versão Breve)<br>Young (2014) · Adapt. BR: GAAPCC/PUCRS (2020) · 90 itens · escala 1-6 · corte clínico: média ≥ ${CORTE_CLINICO.toFixed(1)}</div>
                    </div>
                </div>
                <div class="laudo-header-pontuacao">
                    <div class="laudo-header-pontuacao-label">Média geral</div>
                    <div class="laudo-header-pontuacao-valor">${s.mediaGeral.toFixed(2)}</div>
                    <div class="laudo-header-pontuacao-max">de ${ESCALA_MAX.toFixed(1)}</div>
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
                        <span class="laudo-identif-valor">${escapeHtml(p.nome_completo)}</span>
                    </div>
                    <div class="laudo-identif-item">
                        <span class="laudo-identif-label">Idade:</span>
                        <span class="laudo-identif-valor">${idade !== null ? idade + ' anos' : '—'}</span>
                    </div>
                    <div class="laudo-identif-item">
                        <span class="laudo-identif-label">Sexo:</span>
                        <span class="laudo-identif-valor">${escapeHtml(p.sexo || '—')}</span>
                    </div>
                    <div class="laudo-identif-item">
                        <span class="laudo-identif-label">Nascimento:</span>
                        <span class="laudo-identif-valor">${nascStr}</span>
                    </div>
                    <div class="laudo-identif-item">
                        <span class="laudo-identif-label">Aplicação:</span>
                        <span class="laudo-identif-valor">${dataAplic}</span>
                    </div>
                </div>

                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">2</span>
                    Resumo do Perfil
                </div>
                <div class="laudo-cards">
                    <div class="laudo-card ${qtdClinicos > 0 ? 'laudo-card-paciente-positivo' : 'laudo-card-paciente-negativo'}">
                        <div class="laudo-card-label">Esquemas clinicamente relevantes</div>
                        <div class="laudo-card-valor">${qtdClinicos} <span style="font-size:14px;color:#64748b;">de 18</span></div>
                    </div>
                    <div class="laudo-card laudo-card-corte">
                        <div class="laudo-card-label">Ponto de corte</div>
                        <div class="laudo-card-valor">média ≥ ${CORTE_CLINICO.toFixed(1)}</div>
                    </div>
                    <div class="laudo-card laudo-card-max">
                        <div class="laudo-card-label">Total YSQ-S3</div>
                        <div class="laudo-card-valor">${s.totalGeral}</div>
                    </div>
                </div>

                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">3</span>
                    Perfil dos 18 Esquemas
                </div>
                <div class="ysqs3-grafico-wrap">
                    <canvas id="ysqs3-chart-perfil"></canvas>
                </div>
                <p class="ysqs3-grafico-legenda">
                    <span class="ysqs3-leg-item"><span class="ysqs3-leg-bola" style="background:#94a3b8"></span> Ausente (≤ 2,0)</span>
                    <span class="ysqs3-leg-item"><span class="ysqs3-leg-bola" style="background:#64748b"></span> Leve (2,1–3,0)</span>
                    <span class="ysqs3-leg-item"><span class="ysqs3-leg-bola" style="background:#eab308"></span> Moderado (3,1–4,0)</span>
                    <span class="ysqs3-leg-item"><span class="ysqs3-leg-bola" style="background:#f97316"></span> Intenso (4,1–5,0)</span>
                    <span class="ysqs3-leg-item"><span class="ysqs3-leg-bola" style="background:#dc2626"></span> Muito intenso (5,1–6,0)</span>
                </p>

                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">4</span>
                    Médias por Esquema
                </div>
                ${renderTabelaEsquemas()}

                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">5</span>
                    Resumo por Domínio
                </div>
                ${renderTabelaDominios()}

                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">6</span>
                    Interpretação Clínica
                </div>
                <div class="laudo-caixa-descricao">
                    ${renderInterpretacao()}
                </div>

                ${qtdClinicos > 0 ? `
                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">7</span>
                    Esquemas Clinicamente Relevantes
                </div>
                <ul class="ysqs3-itens-criticos">
                    ${s.esquemasClinicos.map(e => `
                        <li>
                            <strong>${escapeHtml(e.nome)}</strong>
                            — média <strong>${e.media.toFixed(2)}</strong>
                            (${labelClassificacao(e.classificacao)})
                            · ${DOMINIOS[e.dominio]}
                        </li>
                    `).join('')}
                </ul>
                ` : ''}

            </div>

            <div class="laudo-rodape">
                <div class="laudo-rodape-esq">
                    <div class="laudo-rodape-org">Equilibrium Neuropsicologia</div>
                    <div class="laudo-rodape-tipo">Correção automatizada — YSQ-S3</div>
                </div>
                <div class="laudo-rodape-dir">
                    <div class="laudo-rodape-data">Documento gerado em ${formatarDataBR(new Date().toISOString())}</div>
                    <div class="laudo-rodape-confidencial">Instrumento de avaliação. O resultado isolado não estabelece diagnóstico.</div>
                </div>
            </div>
        </div>
        `;
    }

    function renderInterpretacao() {
        const s = state.scores;
        const qtdClinicos = s.esquemasClinicos.length;

        if (qtdClinicos === 0) {
            return `
                <p>Nenhum dos 18 esquemas iniciais desadaptativos atingiu o ponto de corte clínico
                (média ≥ ${CORTE_CLINICO.toFixed(1)}). A média geral foi de <strong>${s.mediaGeral.toFixed(2)}</strong>
                em uma escala de 1 a 6.</p>
                <p>Este resultado sugere que, no momento da avaliação, o respondente não apresenta
                esquemas em intensidade clinicamente significativa pelos critérios do YSQ-S3.</p>
            `;
        }

        return `
            <p>Foram identificados <strong>${qtdClinicos} ${qtdClinicos === 1 ? 'esquema' : 'esquemas'}</strong>
            com média ≥ ${CORTE_CLINICO.toFixed(1)}, considerados clinicamente relevantes pelo YSQ-S3.
            A média geral foi de <strong>${s.mediaGeral.toFixed(2)}</strong> em escala 1-6.</p>
            <p>Esses esquemas representam padrões iniciais desadaptativos que merecem atenção
            terapêutica. Recomenda-se aprofundamento clínico para verificar como esses padrões
            se manifestam no funcionamento atual do paciente e quais modos compensatórios estão
            sendo utilizados.</p>
        `;
    }

    function renderTabelaEsquemas() {
        const linhas = state.scores.esquemasOrdenados.map(e => {
            const cor = corClassificacao(e.classificacao);
            return `
                <tr ${e.acimaCorte ? 'class="linha-critica"' : ''}>
                    <td class="td-num">${e.dominio}</td>
                    <td>${escapeHtml(e.nome)}</td>
                    <td class="td-resposta">${e.soma}</td>
                    <td class="td-resposta" style="color:${cor};font-weight:700;">${e.media.toFixed(2)}</td>
                    <td class="td-label" style="color:${cor};">${labelClassificacao(e.classificacao)}</td>
                    <td class="td-resposta">${e.acimaCorte ? '✓' : '—'}</td>
                </tr>
            `;
        }).join('');

        return `
            <table class="ysqs3-tabela-itens">
                <thead>
                    <tr>
                        <th>Domínio</th>
                        <th>Esquema</th>
                        <th>Soma</th>
                        <th>Média</th>
                        <th>Intensidade</th>
                        <th>≥ 3,0</th>
                    </tr>
                </thead>
                <tbody>${linhas}</tbody>
            </table>
        `;
    }

    function renderTabelaDominios() {
        const linhas = Object.values(state.scores.porDominio).map(d => `
            <tr ${d.qtdAcimaCorte > 0 ? 'class="linha-critica"' : ''}>
                <td class="td-num">${d.codigo}</td>
                <td>${escapeHtml(d.nome)}</td>
                <td class="td-resposta">${d.esquemas.length}</td>
                <td class="td-resposta">${d.mediaDominio.toFixed(2)}</td>
                <td class="td-resposta" style="font-weight:700;color:${d.qtdAcimaCorte > 0 ? '#dc2626' : '#16a34a'};">${d.qtdAcimaCorte}</td>
            </tr>
        `).join('');

        return `
            <table class="ysqs3-tabela-itens">
                <thead>
                    <tr>
                        <th>Domínio</th>
                        <th>Nome</th>
                        <th>Esquemas</th>
                        <th>Média</th>
                        <th>Clínicos</th>
                    </tr>
                </thead>
                <tbody>${linhas}</tbody>
            </table>
        `;
    }

    // ============================================================================
    // GRÁFICO PERFIL HORIZONTAL (18 esquemas)
    // ============================================================================
    function renderGraficoPerfil() {
        const canvas = document.getElementById('ysqs3-chart-perfil');
        if (!canvas) return;
        if (state.chartPerfil) state.chartPerfil.destroy();

        const labels = state.scores.esquemasOrdenados.map(e => e.nome);
        const dados = state.scores.esquemasOrdenados.map(e => +e.media.toFixed(2));
        const cores = state.scores.esquemasOrdenados.map(e => corClassificacao(e.classificacao));

        state.chartPerfil = new Chart(canvas, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'Média',
                    data: dados,
                    backgroundColor: cores,
                    borderColor: cores,
                    borderWidth: 1,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'y',
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            title: (ctx) => ctx[0].label,
                            label: (ctx) => {
                                const m = ctx.parsed.x;
                                const e = state.scores.esquemasOrdenados[ctx.dataIndex];
                                return `Média ${m.toFixed(2)} — ${labelClassificacao(e.classificacao)}`;
                            }
                        }
                    },
                    annotation: {}
                },
                scales: {
                    x: {
                        beginAtZero: true,
                        max: 6,
                        ticks: { stepSize: 1 },
                        grid: { color: '#e2e8f0' },
                        title: { display: true, text: 'Média (1-6)', color: '#64748b' }
                    },
                    y: {
                        grid: { display: false },
                        ticks: { font: { size: 11 } }
                    }
                }
            },
            plugins: [{
                id: 'corteVertical',
                afterDraw: (chart) => {
                    const xScale = chart.scales.x;
                    const x = xScale.getPixelForValue(CORTE_CLINICO);
                    const ctx = chart.ctx;
                    const top = chart.chartArea.top;
                    const bottom = chart.chartArea.bottom;
                    ctx.save();
                    ctx.beginPath();
                    ctx.setLineDash([6, 4]);
                    ctx.lineWidth = 2;
                    ctx.strokeStyle = '#dc2626';
                    ctx.moveTo(x, top);
                    ctx.lineTo(x, bottom);
                    ctx.stroke();
                    ctx.setLineDash([]);
                    ctx.fillStyle = '#dc2626';
                    ctx.font = '11px Inter, sans-serif';
                    ctx.fillText('corte 3,0', x + 4, top + 12);
                    ctx.restore();
                }
            }]
        });
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
            pdf.save(`YSQ-S3 - ${nomeAbreviado}_${dataStr}.pdf`);

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
    function calcularIdadeAnos(nascISO, aplISO) {
        if (!nascISO) return null;
        const ref = aplISO ? new Date(aplISO) : new Date();
        const n = new Date(nascISO);
        if (isNaN(n) || isNaN(ref) || ref < n) return null;
        let anos = ref.getFullYear() - n.getFullYear();
        if (ref.getMonth() < n.getMonth() ||
            (ref.getMonth() === n.getMonth() && ref.getDate() < n.getDate())) {
            anos--;
        }
        return anos;
    }

    function formatarDataBR(iso) {
        if (!iso) return '—';
        const s = String(iso).slice(0, 10);
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
        if (m) return `${m[3]}/${m[2]}/${m[1]}`;
        return new Date(iso).toLocaleDateString('pt-BR');
    }

    function formatarDataArquivo(d) {
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    }

    function escapeHtml(text) {
        if (text === null || text === undefined) return '';
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }

    function mostrarErro(msg) {
        document.getElementById('laudo-conteudo').innerHTML = `
            <div class="erro-state">
                <h2>⚠️ Não foi possível carregar o laudo</h2>
                <p>${escapeHtml(msg)}</p>
                <button class="btn btn-primary" onclick="history.back()">Voltar</button>
            </div>
        `;
    }

})();

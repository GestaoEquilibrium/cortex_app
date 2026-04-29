// ============================================================================
// CORTEX_APP — Resultado AQ-ADOLESCENTE (laudo)
// ============================================================================
// URL: ?aplicacao_id=<uuid>
//
// AQ-50 Adolescente — Quociente do Espectro Autista, versão Heteroaplicação
// Baron-Cohen et al. (2006) — adaptação adolescente do AQ adulto
// 50 itens · escala NÃO-Likert (CP/C/D/DT) · 5 facetas · cutoff 26
//
// HETEROAPLICAÇÃO: pai/mãe/cuidador/professor responde sobre o adolescente.
// Itens em 3ª pessoa ("Ele/a prefere...").
//
// DECISÃO ARQUITETURAL (igual QA-16+):
//   Banco grava índice 0-3 (CP=0, C=1, D=2, DT=3) em escores_brutos.respostas.
//   Aqui no JS:
//     1. Lê as respostas
//     2. Aplica gabarito direto/indireto:
//        - DIRETOS (23 itens): pontua 1 se 0 ou 1 (CP ou C)
//        - INDIRETOS (27 itens): pontua 1 se 2 ou 3 (D ou DT)
//     3. Soma TOTAL (50 itens — todos em facetas, sem órfão como QA-50 adulto)
//     4. Soma POR FACETA (5 × 10 itens cada)
//     5. Classifica TOTAL em 5 faixas (proporcionais ao cutoff 26):
//        ≤8 Baixa | 9-17 Média | 18-21 Acima | 22-25 Limítrofe | ≥26 Indicativo
// ============================================================================

(function() {
    'use strict';

    const SIGLA_ESPERADA = 'AQ-Adolescente';

    // ============================================================================
    // GABARITO DE PONTUAÇÃO direto/indireto (replicado do app legado)
    // ============================================================================
    const DIRETOS = new Set([2, 4, 5, 6, 7, 9, 12, 13, 16, 18, 19, 20, 22, 23, 26, 33, 35, 39, 41, 42, 43, 45, 46]);     // pontua 1 se CP (0) ou C (1)
    const INDIRETOS = new Set([1, 3, 8, 10, 11, 14, 15, 17, 21, 24, 25, 27, 28, 29, 30, 31, 32, 34, 36, 37, 38, 40, 44, 47, 48, 49, 50]);  // pontua 1 se D (2) ou DT (3)

    // ============================================================================
    // FACETAS (do app legado — Baron-Cohen 2006)
    // Note: 50 itens, todos em facetas (sem órfão como QA-50 adulto)
    // ============================================================================
    const FACETAS_INFO = {
        'HSO': { label: 'Habilidades Sociais',   cor: '#7c3aed', max: 10, descricao: 'Capacidade de interagir socialmente, fazer amizades, apreciar eventos sociais, compreender situações de interação.' },
        'MUA': { label: 'Mudança de Atenção',     cor: '#3b82f6', max: 10, descricao: 'Flexibilidade cognitiva: capacidade de alternar foco, lidar com interrupções e mudanças de rotina.' },
        'DET': { label: 'Atenção aos Detalhes',   cor: '#10b981', max: 10, descricao: 'Tendência a notar detalhes finos: padrões, números, sons, pequenas mudanças.' },
        'COM': { label: 'Comunicação',            cor: '#f59e0b', max: 10, descricao: 'Habilidade de manter conversas, "ler nas entrelinhas", entender intenções e turnos de fala.' },
        'IMA': { label: 'Imaginação',             cor: '#ef4444', max: 10, descricao: 'Capacidade imaginativa: criar imagens mentais, faz-de-conta, ficção, perspectiva de outras pessoas.' }
    };

    const FACETAS_ORDEM = ['HSO', 'MUA', 'DET', 'COM', 'IMA'];

    // ============================================================================
    // MAPEAMENTO ITEM → FACETA (50 itens — sem órfão)
    // ============================================================================
    const ITEM_TO_FACETA = {"1": "HSO", "11": "HSO", "13": "HSO", "15": "HSO", "22": "HSO", "36": "HSO", "44": "HSO", "45": "HSO", "47": "HSO", "48": "HSO", "2": "MUA", "4": "MUA", "10": "MUA", "16": "MUA", "25": "MUA", "32": "MUA", "34": "MUA", "37": "MUA", "43": "MUA", "46": "MUA", "5": "DET", "6": "DET", "9": "DET", "12": "DET", "19": "DET", "23": "DET", "28": "DET", "29": "DET", "30": "DET", "49": "DET", "7": "COM", "17": "COM", "18": "COM", "26": "COM", "27": "COM", "31": "COM", "33": "COM", "35": "COM", "38": "COM", "39": "COM", "3": "IMA", "8": "IMA", "14": "IMA", "20": "IMA", "21": "IMA", "24": "IMA", "40": "IMA", "41": "IMA", "42": "IMA", "50": "IMA"};

    // ============================================================================
    // CLASSIFICAÇÃO POR TOTAL (5 faixas — proporcionais ao cutoff 26)
    // Mesma estrutura do QA-16+ adulto, comprimidas pra cutoff 26.
    // ============================================================================
    function classificarTotal(total) {
        if (total <= 8)  return { label: 'Baixa', slug: 'baixa', cor: '#16a34a',
            desc: 'Pontuação baixa — perfil típico da população geral. Não há indicativo de traços do espectro autista neste rastreio.' };
        if (total <= 17) return { label: 'Média', slug: 'media', cor: '#0891b2',
            desc: 'Pontuação dentro da faixa esperada da população geral. Sem indicativo de traços clinicamente significativos.' };
        if (total <= 21) return { label: 'Acima da média', slug: 'acima', cor: '#d97706',
            desc: 'Pontuação ligeiramente acima da média. Pode haver alguns traços do espectro autista, mas abaixo do limite clínico.' };
        if (total <= 25) return { label: 'Limítrofe', slug: 'limitrofe', cor: '#ea580c',
            desc: 'Pontuação limítrofe — alguns traços observados. Investigação clínica complementar é recomendada.' };
        return { label: 'Indicativo', slug: 'clinico', cor: '#dc2626',
            desc: 'Pontuação indicativa de perfil autista (≥26). Avaliação diagnóstica complementar é fortemente recomendada para investigação de TEA.' };
    }

    function pontuarItem(itemNum, idxResposta) {
        if (idxResposta == null || isNaN(idxResposta)) return 0;
        // CP=0, C=1 → "concorda"
        // D=2, DT=3 → "discorda"
        if (DIRETOS.has(itemNum)) {
            return (idxResposta === 0 || idxResposta === 1) ? 1 : 0;
        }
        if (INDIRETOS.has(itemNum)) {
            return (idxResposta === 2 || idxResposta === 3) ? 1 : 0;
        }
        return 0;
    }

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
        if (!norma) throw new Error('Norma AQ-ADOLESCENTE não cadastrada');
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

        state.scores = calcularResultados(correcao);

        await CortexAudit.log('leitura', 'correcoes', correcao.id, {
            detalhes: { aplicacaoId: state.aplicacaoId, sigla: SIGLA_ESPERADA }
        });
    }

    function calcularResultados(correcao) {
        const respostas = (correcao?.escores_brutos || {}).respostas || {};
        const pontosItem = {};
        for (let n = 1; n <= 50; n++) {
            const idxResp = respostas[n];
            pontosItem[n] = pontuarItem(n, idxResp != null ? parseInt(idxResp, 10) : null);
        }

        let total = 0;
        for (let n = 1; n <= 50; n++) total += pontosItem[n];

        const subscores = {};
        for (const code of FACETAS_ORDEM) subscores[code] = 0;
        for (const [itemStr, sub] of Object.entries(ITEM_TO_FACETA)) {
            const n = parseInt(itemStr, 10);
            if (subscores[sub] !== undefined) {
                subscores[sub] += pontosItem[n];
            }
        }

        const totalClassif = classificarTotal(total);

        return { pontosItem, total, subscores, totalClassif };
    }

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
        const pctCutoff = (26 / 50) * 100;

        return `
        <div class="laudo">
            <div class="laudo-header">
                <div class="laudo-header-esq">
                    <div class="laudo-header-logo">E</div>
                    <div class="laudo-header-textos">
                        <div class="laudo-header-supratitulo">Relatório de Avaliação Neuropsicológica</div>
                        <h1 class="laudo-header-titulo">AQ-Adolescente</h1>
                        <div class="laudo-header-subtitulo">Quociente do Espectro Autista — Adolescente (Heteroaplicação)<br>Baron-Cohen et al. (2006) · 50 itens · 5 facetas · cutoff 26</div>
                    </div>
                </div>
                <div class="laudo-header-pontuacao">
                    <div class="laudo-header-pontuacao-label">Score Total</div>
                    <div class="laudo-header-pontuacao-valor">${total}</div>
                    <div class="laudo-header-pontuacao-detalhe">de 50 (cutoff 26)</div>
                </div>
            </div>

            <div class="laudo-body">

                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">1</span>
                    Identificação
                </div>
                <div class="laudo-identificacao">
                    <div class="laudo-identif-item">
                        <span class="laudo-identif-label">Adolescente:</span>
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
                    <div class="laudo-identif-item">
                        <span class="laudo-identif-label">Modalidade:</span>
                        <span class="laudo-identif-valor">Heteroaplicação (responsável)</span>
                    </div>
                </div>

                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">2</span>
                    Pontuação Total
                </div>
                <div class="aq-total-card" style="border-left-color:${cl.cor};">
                    <div class="aq-total-card-header">
                        <span class="aq-total-card-numero" style="color:${cl.cor};">${total}</span>
                        <span class="aq-total-card-de">/ 50 pontos</span>
                        <span class="aq-total-card-classif aq-badge-${cl.slug}">${cl.label}</span>
                    </div>
                    <p class="aq-total-card-desc">${cl.desc}</p>
                    <div class="aq-total-barra-wrap">
                        <div class="aq-total-barra-bg">
                            <div class="aq-total-barra-fill" style="width:${pctBarra}%;background:${cl.cor};"></div>
                            <div class="aq-total-cutoff-marker" style="left:${pctCutoff}%;"></div>
                        </div>
                        <span class="aq-total-cutoff-label" style="left:${pctCutoff}%;">| 26 (cutoff)</span>
                        <div class="aq-total-barra-escala">
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
                    Pontuação por Faceta
                </div>
                ${renderTabelaFacetas()}

                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">4</span>
                    Perfil Gráfico das Facetas
                </div>
                <div class="aq-grafico-wrap">
                    <div class="aq-grafico-canvas-container">
                        <canvas id="aq-chart"></canvas>
                    </div>
                    <div class="aq-grafico-legenda">
                        Pontuação binária por faceta (0-10 cada).
                    </div>
                </div>

                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">5</span>
                    Detalhamento por Faceta
                </div>
                ${FACETAS_ORDEM.map(renderFacetaCard).join('')}

                <div class="aq-nota-tecnica">
                    <strong>Nota técnica:</strong> O AQ-Adolescente (Baron-Cohen et al., 2006)
                    é instrumento de rastreio de traços do espectro autista em adolescentes
                    (12-15 anos), aplicado em modalidade <strong>heteroaplicação</strong> —
                    pais, cuidadores ou professores respondem sobre comportamentos observados
                    no adolescente. Composto por 50 itens em 5 facetas: Habilidades Sociais,
                    Mudança de Atenção, Atenção aos Detalhes, Comunicação e Imaginação.
                    A pontuação é <strong>binária</strong> (0 ou 1 por item) via gabarito
                    específico — itens diretos pontuam quando há concordância, itens
                    indiretos quando há discordância. O score total varia de 0 a 50, com
                    cutoff de <strong>26 pontos</strong> indicando perfil autista para
                    investigação diagnóstica. Este instrumento é uma ferramenta de rastreio
                    dimensional — os resultados devem ser interpretados em conjunto com
                    entrevista clínica, observação direta do adolescente, anamnese
                    desenvolvimentista e outros dados da avaliação neuropsicológica.
                </div>

                ${renderDetalhesItens()}

            </div>

            <div class="laudo-rodape">
                <div class="laudo-rodape-esq">
                    <div class="laudo-rodape-org">Equilibrium Neuropsicologia</div>
                    <div class="laudo-rodape-tipo">Correção automatizada — AQ-ADOLESCENTE</div>
                </div>
                <div class="laudo-rodape-dir">
                    <div class="laudo-rodape-data">Documento gerado em ${formatarDataBR(new Date().toISOString())}</div>
                    <div class="laudo-rodape-confidencial">Documento confidencial — uso restrito ao profissional solicitante.</div>
                </div>
            </div>
        </div>
        `;
    }

    function renderTabelaFacetas() {
        const linhas = FACETAS_ORDEM.map(code => {
            const info = FACETAS_INFO[code];
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
            <div class="aq-tab-subescalas">
                <table>
                    <thead>
                        <tr>
                            <th>Faceta</th>
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

    function renderFacetaCard(code) {
        const info = FACETAS_INFO[code];
        const score = state.scores.subscores[code];
        const pct = Math.round((score / info.max) * 100);

        return `
            <div class="aq-sub-card" style="border-left-color:${info.cor};">
                <div class="aq-sub-card-header">
                    <div class="aq-sub-card-titulo">
                        <span class="aq-sub-card-bullet" style="background:${info.cor};"></span>
                        ${info.label}
                    </div>
                    <span class="aq-sub-card-escore">${score} / ${info.max} (${pct}%)</span>
                </div>
                <p class="aq-sub-card-corpo">${escapeHtml(info.descricao)}</p>
            </div>
        `;
    }

    function renderGrafico() {
        const canvas = document.getElementById('aq-chart');
        if (!canvas || typeof Chart === 'undefined') return;

        if (state.chartInstance) state.chartInstance.destroy();

        const labels = FACETAS_ORDEM.map(c => FACETAS_INFO[c].label);
        const cores  = FACETAS_ORDEM.map(c => FACETAS_INFO[c].cor);
        const scores = FACETAS_ORDEM.map(c => state.scores.subscores[c]);

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
                                const code = FACETAS_ORDEM[ctx.dataIndex];
                                const info = FACETAS_INFO[code];
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
            const sub = ITEM_TO_FACETA[item.numero];
            const subTxt = sub
                ? `<span style="background:${FACETAS_INFO[sub].cor}22;color:${FACETAS_INFO[sub].cor};padding:2px 8px;border-radius:6px;font-size:10px;font-weight:700;">${sub}</span>`
                : '—';
            const idxResp = respostas[item.numero];
            const labelResp = (idxResp !== undefined && labels[idxResp] !== undefined) ? labels[idxResp] : '—';
            const ponto = state.scores.pontosItem[item.numero];
            const direcao = DIRETOS.has(item.numero) ? 'Direto' : (INDIRETOS.has(item.numero) ? 'Indireto' : '?');

            return `<tr>
                <td style="text-align:center;font-weight:700;color:#1e40af;">${item.numero}</td>
                <td>${escapeHtml(item.texto)}</td>
                <td>${subTxt}</td>
                <td style="text-align:center;font-size:10px;">${direcao}</td>
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
                            <th>Faceta</th>
                            <th style="text-align:center;width:70px;">Direção</th>
                            <th style="text-align:center;width:170px;">Resposta</th>
                            <th style="text-align:center;width:50px;">Ponto</th>
                        </tr>
                    </thead>
                    <tbody>${linhas}</tbody>
                </table>
            </details>
        `;
    }

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
            const nomeArquivo = `AQ-ADOLESCENTE - ${nomeAbreviado}_${dataStr}.pdf`;

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

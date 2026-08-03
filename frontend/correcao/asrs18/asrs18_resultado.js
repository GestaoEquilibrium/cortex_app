// ============================================================================
// CORTEX_APP — Resultado ASRS-18 (Adult ADHD Self-Report Scale - laudo)
// ============================================================================
// URL: ?aplicacao_id=<uuid>
//
// Adler/OMS · Adapt. BR: Mattos et al. (2006)
// 18 itens · escala 0-4 · autorrelato adulto (18+)
//
// JS recalcula tudo do zero a partir de escores_brutos.respostas (decisão B).
//
// Estrutura: 1 fator único TOTAL no banco; JS divide por número de item:
//   - Parte A — Desatenção: itens 1-9 (subtotal 0-36, informativo)
//   - Parte B — Hiperatividade/Impulsividade: itens 10-18 (subtotal 0-36, informativo)
//   - Total Geral: 0-72 · ponto de corte ≥ 24 (positivo / negativo)
// ============================================================================

(function() {
    'use strict';

    const SIGLA_ESPERADA = 'ASRS-18';
    const CORTE_TOTAL = 24;
    const TOTAL_ITENS = 18;
    const ESCALA_MAX = 4;

    // Divisão por parte (numero do item → parte)
    function parteDoItem(numero) {
        return numero <= 9 ? 'A' : 'B';
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
        fatores: [],
        correcao: null,
        scores: null,
        chartBarras: null
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
        if (!norma) throw new Error('Norma ASRS-18 não cadastrada');
        state.norma = norma;

        const { data: fatores } = await window.cortexClient
            .from('instrumentos_fatores')
            .select('id, fator_codigo, fator_label, ordem, eh_total')
            .eq('norma_id', norma.id)
            .order('ordem');
        state.fatores = fatores || [];

        const { data: itensRaw } = await window.cortexClient
            .from('instrumentos_itens').select('numero, texto, fator_id')
            .eq('norma_id', norma.id).order('numero');
        state.itens = itensRaw || [];

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
    // CÁLCULO
    // ============================================================================
    function calcularResultados(correcao) {
        const respostas = (correcao?.escores_brutos || {}).respostas || {};

        const respostaPorNumero = {};
        for (const [k, v] of Object.entries(respostas)) {
            respostaPorNumero[parseInt(k)] = parseInt(v) || 0;
        }

        // Subtotais por Parte
        let totalParteA = 0, totalParteB = 0;
        const itensParteA = [], itensParteB = [];

        for (const item of state.itens) {
            const valor = respostaPorNumero[item.numero] ?? 0;
            const linha = { numero: item.numero, texto: item.texto, valor };
            if (parteDoItem(item.numero) === 'A') {
                totalParteA += valor;
                itensParteA.push(linha);
            } else {
                totalParteB += valor;
                itensParteB.push(linha);
            }
        }

        const totalGeral = totalParteA + totalParteB;
        const positivoTotal = totalGeral >= CORTE_TOTAL;
        const respondidos = Object.keys(respostas).length;

        return {
            totalParteA,           // 0-36
            totalParteB,           // 0-36
            totalGeral,            // 0-72
            positivoTotal,         // boolean
            corteTotal: CORTE_TOTAL,
            respondidos,
            faltam: TOTAL_ITENS - respondidos,
            itensParteA,
            itensParteB
        };
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

        setTimeout(() => {
            renderGraficoBarras();
        }, 50);
    }

    function renderLaudo() {
        const s = state.scores;
        const p = state.paciente;
        const idade = calcularIdadeAnos(p.data_nascimento, state.aplicacao.created_at);
        const dataAplic = formatarDataBR(state.aplicacao.created_at);
        const nascStr = formatarDataBR(p.data_nascimento);

        return `
        <div class="laudo">
            <div class="laudo-header">
                <div class="laudo-header-esq">
                    <div class="laudo-header-logo">E</div>
                    <div class="laudo-header-textos">
                        <div class="laudo-header-supratitulo">Relatório de Rastreio Neuropsicológico</div>
                        <h1 class="laudo-header-titulo">ASRS-18</h1>
                        <div class="laudo-header-subtitulo">Adult ADHD Self-Report Scale — 18 itens<br>Adler/OMS · Adapt. BR: Mattos et al. (2006) · escala 0-4 · corte ≥ ${CORTE_TOTAL}</div>
                    </div>
                </div>
                <div class="laudo-header-pontuacao">
                    <div class="laudo-header-pontuacao-label">Total Geral</div>
                    <div class="laudo-header-pontuacao-valor">${s.totalGeral}</div>
                    <div class="laudo-header-pontuacao-max">de 72</div>
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
                    Resumo
                </div>
                <div class="laudo-cards">
                    <div class="laudo-card laudo-card-max">
                        <div class="laudo-card-label">Parte A — Desatenção</div>
                        <div class="laudo-card-valor">${s.totalParteA} <span style="font-size:14px;color:#64748b;">de 36</span></div>
                    </div>
                    <div class="laudo-card laudo-card-max">
                        <div class="laudo-card-label">Parte B — Hiper/Impuls.</div>
                        <div class="laudo-card-valor">${s.totalParteB} <span style="font-size:14px;color:#64748b;">de 36</span></div>
                    </div>
                    <div class="laudo-card ${s.positivoTotal ? 'laudo-card-paciente-positivo' : 'laudo-card-paciente-negativo'}">
                        <div class="laudo-card-label">Resultado Geral</div>
                        <div class="laudo-card-valor" style="font-size:18px;">${s.positivoTotal ? 'POSITIVO' : 'Negativo'}</div>
                    </div>
                    <div class="laudo-card laudo-card-corte">
                        <div class="laudo-card-label">Ponto de corte</div>
                        <div class="laudo-card-valor">Total ≥ ${CORTE_TOTAL}</div>
                    </div>
                </div>

                ${renderNiveis()}

                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">3</span>
                    Pontuação por Parte
                </div>
                <div class="asrs18-grafico-wrap">
                    <canvas id="asrs18-chart-barras"></canvas>
                </div>
                <p class="asrs18-grafico-legenda">
                    <span class="asrs18-leg-item"><span class="asrs18-leg-bola" style="background:#3b82f6"></span> Parte A — Desatenção</span>
                    <span class="asrs18-leg-item"><span class="asrs18-leg-bola" style="background:#a855f7"></span> Parte B — Hiper/Impulsiv.</span>
                    <span class="asrs18-leg-item"><span class="asrs18-leg-bola" style="background:${s.positivoTotal ? '#dc2626' : '#16a34a'}"></span> Total Geral</span>
                </p>

                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">4</span>
                    Tabela de Resultados
                </div>
                ${renderTabelaResumo()}

                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">5</span>
                    Detalhamento — Parte A (Desatenção)
                </div>
                ${renderTabelaItens(s.itensParteA, 'a')}

                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">6</span>
                    Detalhamento — Parte B (Hiperatividade/Impulsividade)
                </div>
                ${renderTabelaItens(s.itensParteB, 'b')}

                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">7</span>
                    Interpretação Clínica
                </div>
                <div class="laudo-caixa-descricao">
                    ${renderInterpretacao()}
                </div>

            </div>

            <div class="laudo-rodape">
                <div class="laudo-rodape-esq">
                    <div class="laudo-rodape-org">Equilibrium Neuropsicologia</div>
                    <div class="laudo-rodape-tipo">Correção automatizada — ASRS-18</div>
                </div>
                <div class="laudo-rodape-dir">
                    <div class="laudo-rodape-data">Documento gerado em ${formatarDataBR(new Date().toISOString())}</div>
                    <div class="laudo-rodape-confidencial">Instrumento de rastreio. O diagnóstico de TDAH requer avaliação clínica abrangente conforme DSM-5.</div>
                </div>
            </div>
        </div>
        `;
    }

    // ── Sprint laudos_padrao: veredito colorido + chips ─────────────────────
    function renderNiveis() {
        const s = state.scores;
        const pos = s.positivoTotal;
        return `
            <div class="asrs18-nivel-bloco">
                <div class="asrs18-niveis-grid">
                    <div class="asrs18-nivel-card ${!pos ? 'ativo' : ''}" ${!pos ? 'style="border-color:#16a34a;"' : ''}>
                        <div class="asrs18-nivel-dot" style="background:#16a34a;"></div>
                        <div class="asrs18-nivel-nome">Não sugestivo</div>
                        <div class="asrs18-nivel-faixa">0 – ${CORTE_TOTAL - 1} pontos</div>
                        ${!pos ? `<div class="asrs18-nivel-voce" style="color:#16a34a;">● seu resultado: ${s.totalGeral}</div>` : ''}
                    </div>
                    <div class="asrs18-nivel-card ${pos ? 'ativo' : ''}" ${pos ? 'style="border-color:#dc2626;"' : ''}>
                        <div class="asrs18-nivel-dot" style="background:#dc2626;"></div>
                        <div class="asrs18-nivel-nome">Sugestivo de TDAH</div>
                        <div class="asrs18-nivel-faixa">≥ ${CORTE_TOTAL} pontos</div>
                        ${pos ? `<div class="asrs18-nivel-voce" style="color:#dc2626;">● seu resultado: ${s.totalGeral}</div>` : ''}
                    </div>
                </div>
                <div class="asrs18-nivel-expl" style="border-left-color:${pos ? '#dc2626' : '#16a34a'};">
                    Total geral <strong>${s.totalGeral}</strong> de 72 · Parte A (Desatenção) <strong>${s.totalParteA}</strong>/36 ·
                    Parte B (Hiperatividade/Impulsividade) <strong>${s.totalParteB}</strong>/36 · corte da versão americana ≥ ${CORTE_TOTAL}.
                </div>
            </div>
        `;
    }

    const CHIP_VALOR = [
        { bg: '#e2e8f0', fg: '#475569' },
        { bg: '#dbeafe', fg: '#1e40af' },
        { bg: '#fef3c7', fg: '#92400e' },
        { bg: '#ffedd5', fg: '#c2410c' },
        { bg: '#fee2e2', fg: '#991b1b' }
    ];

    function chipValor(v) {
        const c = CHIP_VALOR[v] || CHIP_VALOR[0];
        return `<span class="asrs18-chip" style="background:${c.bg};color:${c.fg};">${v}</span>`;
    }

    function renderInterpretacao() {
        const s = state.scores;
        if (s.positivoTotal) {
            return `
                <p>A pontuação total no ASRS-18 (${s.totalGeral} pontos) <strong>atinge o ponto de
                corte ≥ ${CORTE_TOTAL}</strong> sugerido pela versão americana, indicando perfil
                <strong>sugestivo de TDAH</strong> em adulto a partir do autorrelato.</p>
                <p>Distribuição por parte: <strong>Parte A — Desatenção: ${s.totalParteA}/36</strong> ·
                <strong>Parte B — Hiperatividade/Impulsividade: ${s.totalParteB}/36</strong>.
                Esses subtotais ajudam a entender qual dimensão é mais expressiva no quadro
                autorrelatado pelo(a) paciente.</p>
                <p>O ASRS-18 é instrumento de <strong>rastreio</strong> e não estabelece
                diagnóstico. <strong>Recomenda-se avaliação clínica detalhada</strong> com
                critérios DSM-5 (entrevista, observação, instrumentos diagnósticos
                complementares e investigação de comorbidades).</p>
            `;
        }
        return `
            <p>A pontuação total no ASRS-18 (${s.totalGeral} pontos) ficou <strong>abaixo do
            ponto de corte de ${CORTE_TOTAL}</strong> sugerido pela versão americana, não
            evidenciando perfil clinicamente significativo de TDAH a partir do autorrelato
            no momento da avaliação.</p>
            <p>Distribuição por parte: <strong>Parte A — Desatenção: ${s.totalParteA}/36</strong> ·
            <strong>Parte B — Hiperatividade/Impulsividade: ${s.totalParteB}/36</strong>.</p>
            <p>O ASRS-18 é instrumento de rastreio. Resultados negativos em escalas de
            autorrelato não excluem diagnóstico — alterações comportamentais ou cognitivas
            podem justificar nova aplicação ou investigação por outros instrumentos.</p>
        `;
    }

    function renderTabelaResumo() {
        const s = state.scores;
        return `
            <table class="asrs18-tabela-itens">
                <thead>
                    <tr>
                        <th>Subescala</th>
                        <th>Itens</th>
                        <th>Pontuação</th>
                        <th>Máximo</th>
                        <th>Corte</th>
                        <th>Resultado</th>
                    </tr>
                </thead>
                <tbody>
                    <tr class="linha-parte-a">
                        <td><span class="asrs18-parte-badge badge-a">A</span> Desatenção</td>
                        <td class="td-resposta">9</td>
                        <td class="td-resposta"><span class="asrs18-num-forte">${s.totalParteA}</span></td>
                        <td class="td-resposta">36</td>
                        <td class="td-resposta">—</td>
                        <td class="td-resposta" style="color:#64748b;">informativo</td>
                    </tr>
                    <tr class="linha-parte-b">
                        <td><span class="asrs18-parte-badge badge-b">B</span> Hiperatividade/Impulsividade</td>
                        <td class="td-resposta">9</td>
                        <td class="td-resposta"><span class="asrs18-num-forte">${s.totalParteB}</span></td>
                        <td class="td-resposta">36</td>
                        <td class="td-resposta">—</td>
                        <td class="td-resposta" style="color:#64748b;">informativo</td>
                    </tr>
                    <tr ${s.positivoTotal ? 'class="linha-critica"' : ''}>
                        <td><strong>Total Geral</strong></td>
                        <td class="td-resposta">18</td>
                        <td class="td-resposta"><span class="asrs18-num-forte">${s.totalGeral}</span></td>
                        <td class="td-resposta">72</td>
                        <td class="td-resposta">≥ ${CORTE_TOTAL}</td>
                        <td class="td-resposta"><span class="asrs18-res-pill ${s.positivoTotal ? 'pos' : 'neg'}">${s.positivoTotal ? 'POSITIVO' : 'Negativo'}</span></td>
                    </tr>
                </tbody>
            </table>
        `;
    }

    function renderTabelaItens(itens, parte) {
        const labels = state.norma.answer_labels || [];
        const linhas = itens.map(it => {
            const labelResp = labels[it.valor] !== undefined ? labels[it.valor] : '—';
            return `
                <tr>
                    <td class="td-num">${it.numero}</td>
                    <td>${escapeHtml(it.texto)}</td>
                    <td class="td-resposta">${chipValor(it.valor)}</td>
                    <td class="td-label"><span class="asrs18-freq-pill">${escapeHtml(labelResp)}</span></td>
                </tr>
            `;
        }).join('');

        return `
            <table class="asrs18-tabela-itens ${parte === 'b' ? 'asrs18-tab-b' : 'asrs18-tab-a'}">
                <thead>
                    <tr>
                        <th>Item</th>
                        <th>Conteúdo</th>
                        <th>Pontos</th>
                        <th>Frequência</th>
                    </tr>
                </thead>
                <tbody>${linhas}</tbody>
            </table>
        `;
    }

    // ============================================================================
    // GRÁFICO DE BARRAS HORIZONTAL
    // ============================================================================
    function renderGraficoBarras() {
        const canvas = document.getElementById('asrs18-chart-barras');
        if (!canvas) return;
        if (state.chartBarras) state.chartBarras.destroy();

        const s = state.scores;

        state.chartBarras = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: ['Parte A — Desatenção', 'Parte B — Hiper/Impuls.', 'Total Geral'],
                datasets: [{
                    label: 'Pontuação',
                    data: [s.totalParteA, s.totalParteB, s.totalGeral],
                    backgroundColor: [
                        '#3b82f6',
                        '#a855f7',
                        s.positivoTotal ? '#dc2626' : '#16a34a'
                    ],
                    borderColor: [
                        '#3b82f6',
                        '#a855f7',
                        s.positivoTotal ? '#dc2626' : '#16a34a'
                    ],
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
                            label: (ctx) => {
                                if (ctx.dataIndex === 2) {
                                    return `${ctx.parsed.x} (corte ≥ ${CORTE_TOTAL}) — ${s.positivoTotal ? 'POSITIVO' : 'Negativo'}`;
                                }
                                return `${ctx.parsed.x} / 36`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        beginAtZero: true,
                        max: 72,
                        ticks: { stepSize: 6 },
                        grid: { color: '#e2e8f0' },
                        title: { display: true, text: 'Pontuação', color: '#64748b' }
                    },
                    y: { grid: { display: false } }
                }
            },
            plugins: [{
                id: 'corteTotal',
                afterDraw: (chart) => {
                    // Linha vertical no corte 24, apenas na barra do Total (índice 2)
                    const xScale = chart.scales.x;
                    const yScale = chart.scales.y;
                    const ctx = chart.ctx;
                    const x = xScale.getPixelForValue(CORTE_TOTAL);
                    const y = yScale.getPixelForValue(2);
                    const halfBar = (yScale.getPixelForValue(0) - yScale.getPixelForValue(1)) / 2;
                    ctx.save();
                    ctx.setLineDash([5, 4]);
                    ctx.lineWidth = 2;
                    ctx.strokeStyle = '#dc2626';
                    ctx.beginPath();
                    ctx.moveTo(x, y - halfBar * 0.7);
                    ctx.lineTo(x, y + halfBar * 0.7);
                    ctx.stroke();
                    ctx.setLineDash([]);
                    ctx.fillStyle = '#dc2626';
                    ctx.font = '11px Inter, sans-serif';
                    ctx.fillText('corte 24', x + 4, y - halfBar * 0.7 - 2);
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

            // Quebra de página inteligente: em vez de fatiar a imagem em alturas
            // fixas de A4 (que cortava gráfico/tabela no meio), cortamos SÓ nos
            // limites entre seções — cada seção fica inteira numa página.
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            const MARGIN_TOP = 8, MARGIN_BOTTOM = 8;              // mm
            const pxPerMm = canvas.width / 210;
            const pageContentPx = (297 - MARGIN_TOP - MARGIN_BOTTOM) * pxPerMm;

            // limites seguros de quebra = topo de cada seção e do rodapé
            const laudoRect = laudo.getBoundingClientRect();
            const ratio = canvas.height / laudoRect.height;
            const boundaries = Array.from(laudo.querySelectorAll('.laudo-secao-titulo, .laudo-rodape'))
                .map(el => (el.getBoundingClientRect().top - laudoRect.top) * ratio)
                .filter(y => y > 1 && y < canvas.height - 1)
                .sort((a, b) => a - b);
            boundaries.push(canvas.height);

            const addSlice = (startPx, endPx) => {
                const sliceH = Math.max(1, Math.round(endPx - startPx));
                const tmp = document.createElement('canvas');
                tmp.width = canvas.width; tmp.height = sliceH;
                const ctx = tmp.getContext('2d');
                ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, tmp.width, tmp.height);
                ctx.drawImage(canvas, 0, startPx, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
                pdf.addImage(tmp.toDataURL('image/jpeg', 0.95), 'JPEG', 0, MARGIN_TOP, 210, sliceH / pxPerMm);
            };

            if (canvas.height <= pageContentPx) {
                addSlice(0, canvas.height);
            } else {
                let start = 0;
                while (start < canvas.height - 1) {
                    const maxEnd = start + pageContentPx;
                    let end;
                    if (maxEnd >= canvas.height) {
                        end = canvas.height;
                    } else {
                        // maior limite de seção que ainda cabe nesta página
                        let corte = -1;
                        for (const b of boundaries) {
                            if (b > start + 1 && b <= maxEnd) corte = b;
                        }
                        // se uma seção sozinha for maior que a página, corte forçado (raro)
                        end = corte > 0 ? corte : maxEnd;
                    }
                    addSlice(start, end);
                    start = end;
                    if (start < canvas.height - 1) pdf.addPage();
                }
            }

            const nomeAbreviado = state.paciente.nome_completo.toUpperCase()
                .replace(/[^A-Z\s]/g, '').trim().substring(0, 50);
            const dataStr = formatarDataArquivo(new Date());
            pdf.save(`ASRS-18 - ${nomeAbreviado}_${dataStr}.pdf`);

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

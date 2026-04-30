// ============================================================================
// CORTEX_APP — Resultado SRS-2-HET
// ============================================================================
// URL: ?aplicacao_id=<uuid>
//
// SRS-2 — Escala de Responsividade Social, 2ª edição (Constantino & Gruber, 2012)
// 65 itens · escala Likert 1-4 · 17 reversos · 7 escalas
//
// FLUXO (Saída A):
//   1. Carrega ../srs2_norms.json (lookup tables T-score, compartilhado)
//   2. Lê respostas brutas de correcoes.escores_brutos
//   3. Inverte reversos (item.reverse=true → pontos = 5 - resposta)
//   4. Converte cada item em pontos 0-3 (depois subtrai 1 de resposta 1-4)
//   5. Soma escore bruto por escala (5 subescalas + 2 compostos derivados)
//   6. Converte cada bruto → T-score via lookup table
//   7. Classifica T: Típico (≤59) / N1 (60-65) / N2 (66-75) / N3 (≥76)
//   8. Renderiza laudo com 5 seções
// ============================================================================

(function() {
    'use strict';

    const SIGLA_ESPERADA = 'SRS-2-HET';
    let SRS2_NORMS = null;

    const state = {
        aplicacaoId: null,
        aplicacao: null,
        paciente: null,
        norma: null,
        instrumento: null,
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
        // Carrega lookup tables compartilhadas
        const resp = await fetch('../srs2_norms.json', { cache: 'force-cache' });
        if (!resp.ok) throw new Error('Não foi possível carregar srs2_norms.json');
        SRS2_NORMS = await resp.json();

        const inst_norms = SRS2_NORMS.instruments[SIGLA_ESPERADA];
        if (!inst_norms) throw new Error(`Lookup table não encontrada para ${SIGLA_ESPERADA}`);

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
            .from('instrumentos_catalogo').select('id, sigla, nome_completo')
            .eq('id', aplicacao.instrumento_id).single();
        if (errI) throw new Error('Instrumento: ' + errI.message);
        if (instrumento.sigla !== SIGLA_ESPERADA) {
            throw new Error(`Esperado ${SIGLA_ESPERADA}, encontrado ${instrumento.sigla}`);
        }
        state.instrumento = instrumento;

        const { data: norma } = await window.cortexClient
            .from('instrumentos_normas').select('*').eq('instrumento_id', instrumento.id)
            .eq('ativa', true).maybeSingle();
        if (!norma) throw new Error(`Norma ${SIGLA_ESPERADA} não cadastrada`);
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

        state.scores = calcularResultados(correcao, inst_norms);

        await CortexAudit.log('leitura', 'correcoes', correcao.id, {
            detalhes: { aplicacaoId: state.aplicacaoId, sigla: SIGLA_ESPERADA }
        });
    }

    // ============================================================================
    // CÁLCULO (Saída A — JS faz tudo)
    // ============================================================================

    function calcularResultados(correcao, inst_norms) {
        const respostas = (correcao?.escores_brutos || {}).respostas || {};
        const item_to_scale = inst_norms.item_to_scale;
        const item_reverse = inst_norms.item_reverse;
        const norms = inst_norms.norms;

        // Pontos por item (1-4 → 0-3, com inversão de reversos)
        const pontosItem = {};
        const itensSemResposta = {};
        for (const slug of SRS2_NORMS.scale_order) itensSemResposta[slug] = 0;

        for (const numStr in item_to_scale) {
            const num = parseInt(numStr);
            const r = respostas[num] != null ? parseInt(respostas[num]) : null;
            const subescala = item_to_scale[numStr];
            if (r === null || isNaN(r)) {
                pontosItem[num] = null;
                if (subescala && itensSemResposta[subescala] !== undefined) {
                    itensSemResposta[subescala]++;
                }
                continue;
            }
            const valor = item_reverse[numStr] ? (5 - r) : r;
            pontosItem[num] = valor - 1;  // 0-3
        }

        // Soma por subescala primária
        const brutoPorEscala = {};
        for (const slug of SRS2_NORMS.scale_order) brutoPorEscala[slug] = 0;

        for (const numStr in item_to_scale) {
            const num = parseInt(numStr);
            const subescala = item_to_scale[numStr];
            const ponto = pontosItem[num];
            if (ponto === null) continue;
            if (brutoPorEscala[subescala] !== undefined) {
                brutoPorEscala[subescala] += ponto;
            }
        }

        // Compostos derivados:
        //   CI  = PS + CGS + CMS + MS (4 subescalas sociais, sem RR)
        //   TOT = CI + RR (todas)
        brutoPorEscala['CI']  = brutoPorEscala['PS'] + brutoPorEscala['CGS'] +
                                brutoPorEscala['CMS'] + brutoPorEscala['MS'];
        brutoPorEscala['TOT'] = brutoPorEscala['CI'] + brutoPorEscala['RR'];

        // Itens sem resposta (compostos = soma dos compostos das subescalas)
        const itensSemRespostaPorEscala = { ...itensSemResposta };
        itensSemRespostaPorEscala['CI']  = itensSemResposta['PS'] + itensSemResposta['CGS'] +
                                           itensSemResposta['CMS'] + itensSemResposta['MS'];
        itensSemRespostaPorEscala['TOT'] = itensSemRespostaPorEscala['CI'] + itensSemResposta['RR'];

        // Conversão bruto → T (clamp se fora da tabela)
        const tPorEscala = {};
        for (const slug of SRS2_NORMS.scale_order) {
            const bruto = brutoPorEscala[slug];
            const tabelaT = norms[slug] || {};
            let t = tabelaT[bruto];
            if (t === undefined) {
                const brutos = Object.keys(tabelaT).map(Number).sort((a, b) => a - b);
                if (brutos.length === 0) { t = null; }
                else if (bruto > brutos[brutos.length - 1]) t = tabelaT[brutos[brutos.length - 1]];
                else if (bruto < brutos[0])                 t = tabelaT[brutos[0]];
                else {
                    let menor = brutos[0];
                    for (const b of brutos) {
                        if (b <= bruto) menor = b; else break;
                    }
                    t = tabelaT[menor];
                }
            }
            tPorEscala[slug] = t;
        }

        // Classificação por T
        const classifPorEscala = {};
        for (const slug of SRS2_NORMS.scale_order) {
            classifPorEscala[slug] = classificarT(tPorEscala[slug]);
        }

        return { brutoPorEscala, tPorEscala, classifPorEscala, pontosItem, itensSemRespostaPorEscala };
    }

    function classificarT(t) {
        if (t === null || t === undefined) {
            return SRS2_NORMS.classifications[0];
        }
        for (const c of SRS2_NORMS.classifications) {
            if (t >= c.min && t <= c.max) return c;
        }
        return SRS2_NORMS.classifications[SRS2_NORMS.classifications.length - 1];
    }

    // ============================================================================
    // RENDER
    // ============================================================================

    function renderizar() {
        const cont = document.getElementById('laudo-conteudo');
        cont.innerHTML = renderLaudo();
        document.getElementById('acoes-topo').style.display = 'flex';
        document.getElementById('back-link').href =
            `../../bateria/bateria.html?paciente=${state.paciente.id}`;
        document.getElementById('btn-gerar-pdf').addEventListener('click', gerarPDF);
        setTimeout(renderPerfilGrafico, 50);
    }

    function renderLaudo() {
        const dataApl = state.aplicacao.data_aplicacao || state.aplicacao.created_at;
        const inst_norms = SRS2_NORMS.instruments[SIGLA_ESPERADA];
        const totalT = state.scores.tPorEscala['TOT'];
        const totalClassif = state.scores.classifPorEscala['TOT'];
        const formLabel = inst_norms.form_label;
        const avaliador = state.aplicacao.aplicador_nome || state.aplicacao.criado_por_nome || '—';
        const idade = calcularIdade(state.paciente.data_nascimento, dataApl);
        const nascStr = state.paciente.data_nascimento
            ? formatarDataBR(state.paciente.data_nascimento) : '—';

        return `
        <div class="laudo">
            <!-- ─── CABEÇALHO AZUL (padrão D3) ─── -->
            <div class="laudo-header">
                <div class="laudo-header-esq">
                    <div class="laudo-header-logo">E</div>
                    <div class="laudo-header-textos">
                        <div class="laudo-header-supratitulo">Relatório Neuropsicológico</div>
                        <h1 class="laudo-header-titulo">SRS-2</h1>
                        <div class="laudo-header-subtitulo">
                            Escala de Responsividade Social — 2ª Edição<br>
                            ${escapeHtml(formLabel)}
                        </div>
                    </div>
                </div>
                <div class="laudo-header-pontuacao">
                    <div class="laudo-header-pontuacao-label">Escore T Total</div>
                    <div class="laudo-header-pontuacao-valor">${totalT}</div>
                    <div class="laudo-header-pontuacao-max">${escapeHtml(totalClassif.label)}</div>
                </div>
            </div>

            <!-- ─── CORPO ─── -->
            <div class="laudo-body">

                <!-- 1. IDENTIFICAÇÃO -->
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
                    <div class="laudo-identif-item">
                        <span class="laudo-identif-label">Formulário:</span>
                        <span class="laudo-identif-valor">${escapeHtml(formLabel)}</span>
                    </div>
                </div>

                <!-- 2. PERFIL DE ESCORES T -->
                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">2</span>
                    Perfil de Escores T
                </div>
                <div class="srs2-perfil-wrap">
                    <div class="srs2-perfil-canvas-container">
                        <canvas id="srs2-perfil-chart"></canvas>
                    </div>
                </div>

                <!-- 3. TABELA DE RESULTADOS -->
                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">3</span>
                    Tabela de Resultados
                </div>
                ${renderTabelaResultados()}

                <!-- 4. DETALHAMENTO POR ESCALA -->
                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">4</span>
                    Detalhamento por Escala
                </div>
                ${SRS2_NORMS.scale_order.map(renderEscalaCard).join('')}

                <!-- 5. INTERPRETAÇÃO CLÍNICA -->
                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">5</span>
                    Interpretação Clínica do Escore T
                </div>
                ${renderInterpretacaoClinica()}

                <!-- NOTA TÉCNICA (caixa amarela padrão D3) -->
                <div class="laudo-caixa-descricao" style="margin-top: 18px;">
                    <p>
                        A <strong>SRS-2</strong> (Constantino &amp; Gruber, 2012) é um instrumento
                        dimensional de rastreio para Transtorno do Espectro Autista (TEA), composto
                        por 65 itens em 5 subescalas (Percepção, Cognição, Comunicação e Motivação
                        Sociais; Padrões Restritivos e Repetitivos) e 2 compostos (Comunicação e
                        Interação; Total). O Escore T tem média 50 e desvio-padrão 10 na população
                        normativa. Pontuações elevadas indicam maior gravidade dos comportamentos
                        associados ao TEA.
                    </p>
                    <p>
                        Este instrumento deve ser interpretado em conjunto com entrevista clínica,
                        observação direta e outros dados da avaliação neuropsicológica.
                    </p>
                </div>

            </div>

            <!-- ─── RODAPÉ (padrão D3) ─── -->
            <div class="laudo-rodape">
                <div class="laudo-rodape-esq">
                    <div class="laudo-rodape-org">Equilibrium Neuropsicologia</div>
                    <div class="laudo-rodape-tipo">Correção automatizada — ${escapeHtml(SIGLA_ESPERADA)}</div>
                </div>
                <div class="laudo-rodape-dir">
                    <div class="laudo-rodape-data">Documento gerado em ${formatarDataBR(new Date().toISOString())}</div>
                    <div class="laudo-rodape-confidencial">Documento confidencial — uso restrito ao profissional solicitante.</div>
                </div>
            </div>
        </div>
        `;
    }

    function renderTabelaResultados() {
        const linhas = SRS2_NORMS.scale_order.map(slug => {
            const isTotal = (slug === 'TOT');
            const cl = state.scores.classifPorEscala[slug];
            const bruto = state.scores.brutoPorEscala[slug];
            const t = state.scores.tPorEscala[slug];
            const nome = SRS2_NORMS.scales[slug];
            return `<tr class="${isTotal ? 'linha-total' : ''}">
                <td><span class="nome-escala">${escapeHtml(nome.toUpperCase())}</span></td>
                <td class="ctr"><span class="num-bruto">${bruto}</span></td>
                <td class="ctr"><span class="num-t">${t}</span></td>
                <td class="ctr"><span class="srs2-badge srs2-badge-${slugClassif(cl.label)}">${escapeHtml(cl.label)}</span></td>
            </tr>`;
        }).join('');

        return `<div class="srs2-tab-resultados"><table>
            <thead><tr><th>Escala</th><th class="ctr">Bruto</th><th class="ctr">Escore T</th><th class="ctr">Classificação</th></tr></thead>
            <tbody>${linhas}</tbody>
        </table></div>`;
    }

    function renderEscalaCard(slug) {
        const nome = SRS2_NORMS.scales[slug];
        const desc = SRS2_NORMS.scale_descriptions[slug];
        const bruto = state.scores.brutoPorEscala[slug];
        const t = state.scores.tPorEscala[slug];
        const cl = state.scores.classifPorEscala[slug];
        const semResp = state.scores.itensSemRespostaPorEscala[slug] || 0;
        const ic_inf = Math.max(0, t - 4);
        const ic_sup = Math.min(99, t + 4);

        return `
            <div class="srs2-detalhe-card">
                <div class="srs2-detalhe-card-header">
                    <span class="srs2-detalhe-card-titulo">${escapeHtml(nome.toUpperCase())}</span>
                    <span class="srs2-badge srs2-badge-${slugClassif(cl.label)}">${escapeHtml(cl.label)}</span>
                </div>
                <div class="srs2-detalhe-card-corpo">
                    <div class="srs2-detalhe-stats">
                        <div class="srs2-detalhe-stat-linha"><span class="srs2-detalhe-stat-label">Pontuação bruta</span><span class="srs2-detalhe-stat-valor">${bruto}</span></div>
                        <div class="srs2-detalhe-stat-linha"><span class="srs2-detalhe-stat-label">Escore T</span><span class="srs2-detalhe-stat-valor">${t}</span></div>
                        <div class="srs2-detalhe-stat-linha"><span class="srs2-detalhe-stat-label">Itens sem resposta</span><span class="srs2-detalhe-stat-valor">${semResp}</span></div>
                        <div class="srs2-detalhe-stat-linha"><span class="srs2-detalhe-stat-label">Intervalo de confiança (±4)</span><span class="srs2-detalhe-stat-valor">[${ic_inf} – ${ic_sup}]</span></div>
                    </div>
                    <div class="srs2-detalhe-curva">${renderCurvaNormalSVG(t, cl.cor)}</div>
                    <div class="srs2-detalhe-descricao">${escapeHtml(desc)}</div>
                </div>
            </div>
        `;
    }

    function renderCurvaNormalSVG(t, corMarcador) {
        const W = 300, H = 110;
        const padX = 20, padY = 10;
        const xMin = 20, xMax = 80;
        function normalPdf(x) {
            const m = 50, sd = 10;
            return Math.exp(-((x - m) ** 2) / (2 * sd * sd)) / (sd * Math.sqrt(2 * Math.PI));
        }
        const xs = []; for (let x = xMin; x <= xMax; x += 0.5) xs.push(x);
        const ys = xs.map(normalPdf);
        const maxY = Math.max(...ys);
        const xToPx = x => padX + ((x - xMin) / (xMax - xMin)) * (W - 2 * padX);
        const yToPx = y => H - padY - (y / maxY) * (H - 2 * padY);

        let path = `M ${xToPx(xs[0])} ${yToPx(ys[0])}`;
        for (let i = 1; i < xs.length; i++) path += ` L ${xToPx(xs[i])} ${yToPx(ys[i])}`;
        path += ` L ${xToPx(xMax)} ${H - padY} L ${xToPx(xMin)} ${H - padY} Z`;

        const tClamp = Math.max(xMin, Math.min(xMax, t));
        const markX = xToPx(tClamp);

        let ticks = '';
        for (let x = xMin; x <= xMax; x += 10) {
            ticks += `<text x="${xToPx(x)}" y="${H - 1}" text-anchor="middle" font-size="9" fill="#94a3b8">${x}</text>`;
        }

        return `
            <svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:300px;">
                <path d="${path}" fill="#dbeafe" stroke="#93c5fd" stroke-width="1"/>
                <line x1="${markX}" y1="${padY}" x2="${markX}" y2="${H - padY}" stroke="${corMarcador}" stroke-width="2"/>
                <circle cx="${markX}" cy="${padY + 6}" r="3" fill="#fff" stroke="${corMarcador}" stroke-width="2"/>
                <text x="${markX}" y="${padY - 1}" text-anchor="middle" font-size="9" fill="${corMarcador}" font-weight="700">T=${t}</text>
                ${ticks}
            </svg>
        `;
    }

    function renderInterpretacaoClinica() {
        return `<div class="srs2-interp-grid">
            <div class="srs2-interp-card srs2-interp-card-tipico">
                <div class="srs2-interp-faixa">T ≤ 59</div>
                <div class="srs2-interp-titulo">Dentro dos limites normais</div>
                <div class="srs2-interp-desc">Pontuações geralmente não associadas ao TEA. Indivíduos com autismo muito leve podem mostrar pontuações na extremidade superior do nível normal quando bem ajustados e com funcionalidade adaptativa relativamente intacta.</div>
            </div>
            <div class="srs2-interp-card srs2-interp-card-n1">
                <div class="srs2-interp-faixa">T 60–65</div>
                <div class="srs2-interp-titulo">Nível leve</div>
                <div class="srs2-interp-desc">Indicam prejuízos clinicamente significativos com interferência leve a moderada nas interações sociais. Comuns em quadros do espectro autista e, ocasionalmente, em TDAH mais severo. Para pré-escolares, considerar Transtorno Específico de Linguagem (TEL) ou deficiência intelectual.</div>
            </div>
            <div class="srs2-interp-card srs2-interp-card-n2">
                <div class="srs2-interp-faixa">T 66–75</div>
                <div class="srs2-interp-titulo">Nível moderado</div>
                <div class="srs2-interp-desc">Indicam prejuízos clinicamente significativos com interferência substancial nas interações. Típicos em TEA de gravidade moderada, incluindo diagnósticos DSM-IV (Autismo, TGD-SOE, Asperger) e DSM-5 (TEA, Transtorno de Comunicação Social).</div>
            </div>
            <div class="srs2-interp-card srs2-interp-card-n3">
                <div class="srs2-interp-faixa">T ≥ 76</div>
                <div class="srs2-interp-titulo">Nível severo</div>
                <div class="srs2-interp-desc">Indicam prejuízos clinicamente severos com interferência marcante nas interações diárias. Fortemente associados a Transtorno do Autismo, Síndrome de Asperger e TGD-SOE mais severos. É comum que pontuações se atenuem entre a idade pré-escolar e escolar.</div>
            </div>
        </div>`;
    }

    function renderPerfilGrafico() {
        const canvas = document.getElementById('srs2-perfil-chart');
        if (!canvas || typeof Chart === 'undefined') return;
        if (state.chartInstance) state.chartInstance.destroy();

        const labels = SRS2_NORMS.scale_order.map(s => SRS2_NORMS.scales[s].toUpperCase());
        const data = SRS2_NORMS.scale_order.map(s => state.scores.tPorEscala[s]);
        const brutos = SRS2_NORMS.scale_order.map(s => state.scores.brutoPorEscala[s]);

        // Plugin: linhas verticais cinza nos cutoffs + zona labels EM CIMA + 50(M) EMBAIXO
        const cutoffsPlugin = {
            id: 'cutoffsCinza',
            afterDraw: (chart) => {
                const { ctx, chartArea, scales } = chart;
                if (!chartArea || !scales.x) return;
                const xs = scales.x;

                // Linhas verticais cinza tracejadas nos cutoffs
                ctx.save();
                ctx.strokeStyle = '#cbd5e1';
                ctx.lineWidth = 1;
                ctx.setLineDash([3, 3]);
                for (const cutoff of [50, 60, 66, 76]) {
                    const x = xs.getPixelForValue(cutoff);
                    ctx.beginPath();
                    ctx.moveTo(x, chartArea.top);
                    ctx.lineTo(x, chartArea.bottom);
                    ctx.stroke();
                }
                ctx.restore();

                // ACIMA do gráfico: TÍPICO / N1 / N2 / N3 (zonas clínicas)
                ctx.save();
                ctx.font = '700 10px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillStyle = '#94a3b8';
                const yTopo = chartArea.top - 10;
                ctx.fillText('TÍPICO', xs.getPixelForValue(40),   yTopo);
                ctx.fillText('N1',     xs.getPixelForValue(62.5), yTopo);
                ctx.fillText('N2',     xs.getPixelForValue(70.5), yTopo);
                ctx.fillText('N3',     xs.getPixelForValue(78),   yTopo);
                ctx.restore();

                // ABAIXO do gráfico: marcador "50 (M)" centralizado na média
                ctx.save();
                ctx.font = '700 9px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillStyle = '#1e40af';
                const yBaixo = chartArea.bottom + 32;
                ctx.fillText('50 (M)', xs.getPixelForValue(50), yBaixo);
                ctx.restore();
            }
        };

        state.chartInstance = new Chart(canvas, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    borderColor: '#1e40af',
                    backgroundColor: 'rgba(30, 64, 175, 0.8)',
                    pointBackgroundColor: '#fff',
                    pointBorderColor: '#1e40af',
                    pointBorderWidth: 2,
                    pointRadius: 6,
                    pointHoverRadius: 8,
                    borderWidth: 2,
                    tension: 0
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                layout: { padding: { top: 22, right: 24, bottom: 36, left: 8 } },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => {
                                const i = ctx.dataIndex;
                                const slug = SRS2_NORMS.scale_order[i];
                                const cl = state.scores.classifPorEscala[slug];
                                return ` Bruto: ${brutos[i]} · T: ${data[i]} · ${cl.label}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        position: 'bottom',
                        min: 20, max: 80,
                        ticks: {
                            stepSize: 10,
                            font: { size: 10 },
                            color: '#94a3b8'
                        },
                        grid: { color: '#f1f5f9' }
                    },
                    y: {
                        ticks: { font: { size: 11, weight: '600' }, color: '#475569' },
                        grid: { display: false }
                    }
                }
            },
            plugins: [cutoffsPlugin]
        });
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
            const imgHeight = (canvas.height * pdfWidth) / canvas.width;

            if (imgHeight <= pdfHeight) {
                pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, pdfWidth, imgHeight);
            } else {
                let posY = 0, restante = imgHeight;
                while (restante > 0) {
                    pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, -posY, pdfWidth, imgHeight);
                    restante -= pdfHeight;
                    posY += pdfHeight;
                    if (restante > 0) pdf.addPage();
                }
            }

            const nomeAbreviado = state.paciente.nome_completo.toUpperCase()
                .replace(/[^A-Z\s]/g, '').trim().substring(0, 50);
            const dataStr = formatarDataArquivo(new Date());
            const nomeArquivo = `${SIGLA_ESPERADA} - ${nomeAbreviado}_${dataStr}.pdf`;
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

    // ─── helpers ───
    function slugClassif(label) {
        if (label === 'Típico') return 'tipico';
        if (label === 'N1') return 'n1';
        if (label === 'N2') return 'n2';
        if (label === 'N3') return 'n3';
        return 'tipico';
    }
    function calcularIdade(nascISO, refISO) {
        if (!nascISO) return null;
        const ref = refISO ? new Date(refISO) : new Date();
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
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
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

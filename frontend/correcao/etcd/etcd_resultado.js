// ============================================================================
// CORTEX_APP — Resultado ETCD (DBD Rating Scale - laudo)
// ============================================================================
// URL: ?aplicacao_id=<uuid>
//
// Pelham, Gnagy, Greenslade & Milich (1992) | DBD Rating Scale
// 44 itens · 4 subescalas · faixa 6-17 anos · heteroaplicado (pais/professor)
//
// JS recalcula tudo do zero a partir de escores_brutos.respostas (decisão B).
//
// Regra: valor ≥ 2 ("Muito" ou "Demais") = positivo
//
// Pontos de corte por subescala (contagem de positivos):
//   TDAH-Desat:           ≥ 6
//   TDAH-Hiper/Impulsiv:  ≥ 6
//   TOD:                  ≥ 4
//   TC:                   ≥ 3
//
// TDAH Combinado: Desat ≥ 6 E Hiper ≥ 6
//
// Subtipos TC (qualitativos, presente se houver QUALQUER item positivo do subgrupo):
//   Agressão a pessoas/animais: 5, 6, 14, 20, 31, 32, 40
//   Destruição de patrimônio:   10, 16, 36, 41
//   Roubo / Furto:              4, 8, 32, 43
//   Violação de regras:         2, 11, 38, 45
// ============================================================================

(function() {
    'use strict';

    const SIGLA_ESPERADA = 'ETCD';
    const LIMITE_POSITIVO = 2;  // valor ≥ 2 conta como positivo

    const SUBESCALAS = [
        { codigo: 'tdah_desatencao',     nome: 'TDAH — Desatenção',                    qtdItens: 9, corte: 6 },
        { codigo: 'tdah_hiperatividade', nome: 'TDAH — Hiperatividade/Impulsividade',  qtdItens: 9, corte: 6 },
        { codigo: 'tod',                 nome: 'TOD — Transtorno Opositivo Desafiador',qtdItens: 8, corte: 4 },
        { codigo: 'tc',                  nome: 'TC — Transtorno de Conduta',           qtdItens: 18, corte: 3 }
    ];

    const SUBTIPOS_TC = [
        { codigo: 'agressao_pessoas_animais',  nome: 'Agressão a pessoas/animais', itens: [5, 6, 14, 20, 31, 32, 40] },
        { codigo: 'destruicao_patrimonio',     nome: 'Destruição de patrimônio',   itens: [10, 16, 36, 41] },
        { codigo: 'roubo_furto',               nome: 'Roubo / Furto',              itens: [4, 8, 32, 43] },
        { codigo: 'violacao_regras',           nome: 'Violação de regras',         itens: [2, 11, 38, 45] }
    ];

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
        if (!norma) throw new Error('Norma ETCD não cadastrada');
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
    // CÁLCULO
    // ============================================================================
    function calcularResultados(correcao) {
        const respostas = (correcao?.escores_brutos || {}).respostas || {};

        const respostaPorNumero = {};
        for (const [k, v] of Object.entries(respostas)) {
            respostaPorNumero[parseInt(k)] = parseInt(v) || 0;
        }

        // Por subescala
        const porSubescala = {};
        for (const sub of SUBESCALAS) {
            porSubescala[sub.codigo] = {
                ...sub,
                qtdPositivos: 0,
                itensPositivos: [],
                somaPontuacao: 0,
                positivoFinal: false
            };
        }

        for (const item of state.itens) {
            const valor = respostaPorNumero[item.numero] ?? 0;
            const s = porSubescala[item.fator_codigo];
            if (!s) continue;
            s.somaPontuacao += valor;
            if (valor >= LIMITE_POSITIVO) {
                s.qtdPositivos++;
                s.itensPositivos.push({ numero: item.numero, texto: item.texto, valor });
            }
        }

        for (const s of Object.values(porSubescala)) {
            s.positivoFinal = s.qtdPositivos >= s.corte;
        }

        const subescalasOrdenadas = SUBESCALAS.map(s => porSubescala[s.codigo]);

        // TDAH Combinado
        const desat = porSubescala['tdah_desatencao'];
        const hiper = porSubescala['tdah_hiperatividade'];
        const tdahCombinado = desat.positivoFinal && hiper.positivoFinal;

        // Subtipos TC (cruzando itens TC positivos com os subgrupos)
        const tcPositivosSet = new Set(porSubescala['tc'].itensPositivos.map(i => i.numero));
        const subtiposTC = SUBTIPOS_TC.map(st => {
            const itensEncontrados = st.itens.filter(n => tcPositivosSet.has(n));
            return {
                ...st,
                presente: itensEncontrados.length > 0,
                itensEncontrados
            };
        });

        // Resumo final
        const positivos = subescalasOrdenadas.filter(s => s.positivoFinal);

        return {
            subescalasOrdenadas,
            positivos,
            tdahCombinado,
            subtiposTC,
            subtiposTCPresentes: subtiposTC.filter(st => st.presente),
            respondidos: Object.keys(respostas).length,
            faltam: state.itens.length - Object.keys(respostas).length
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
        const respondente = p.responsavel_nome || p.mae_nome || p.pai_nome || '—';

        const qtdPositivos = s.positivos.length;

        return `
        <div class="laudo">
            <div class="laudo-header">
                <div class="laudo-header-esq">
                    <div class="laudo-header-logo">E</div>
                    <div class="laudo-header-textos">
                        <div class="laudo-header-supratitulo">Relatório de Triagem Neuropsicológica</div>
                        <h1 class="laudo-header-titulo">ETCD</h1>
                        <div class="laudo-header-subtitulo">Escala de Avaliação de Transtornos de Comportamento Disruptivo (DBD)<br>Pelham, Gnagy, Greenslade & Milich (1992) · 44 itens · 4 subescalas</div>
                    </div>
                </div>
                <div class="laudo-header-pontuacao">
                    <div class="laudo-header-pontuacao-label">Subescalas positivas</div>
                    <div class="laudo-header-pontuacao-valor">${qtdPositivos}</div>
                    <div class="laudo-header-pontuacao-max">de 4</div>
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
                        <span class="laudo-identif-label">Série:</span>
                        <span class="laudo-identif-valor">${escapeHtml(p.escolaridade_serie || p.escolaridade || '—')}</span>
                    </div>
                    <div class="laudo-identif-item">
                        <span class="laudo-identif-label">Aplicação:</span>
                        <span class="laudo-identif-valor">${dataAplic}</span>
                    </div>
                    <div class="laudo-identif-item">
                        <span class="laudo-identif-label">Respondente:</span>
                        <span class="laudo-identif-valor">${escapeHtml(respondente)}</span>
                    </div>
                </div>

                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">2</span>
                    Resumo Diagnóstico
                </div>
                <div class="laudo-cards">
                    <div class="laudo-card ${s.subescalasOrdenadas[0].positivoFinal ? 'laudo-card-paciente-positivo' : 'laudo-card-paciente-negativo'}">
                        <div class="laudo-card-label">TDAH-Desatenção</div>
                        <div class="laudo-card-valor" style="font-size:20px;">${s.subescalasOrdenadas[0].positivoFinal ? 'POSITIVO' : 'Negativo'}</div>
                    </div>
                    <div class="laudo-card ${s.subescalasOrdenadas[1].positivoFinal ? 'laudo-card-paciente-positivo' : 'laudo-card-paciente-negativo'}">
                        <div class="laudo-card-label">TDAH-Hiper/Impuls.</div>
                        <div class="laudo-card-valor" style="font-size:20px;">${s.subescalasOrdenadas[1].positivoFinal ? 'POSITIVO' : 'Negativo'}</div>
                    </div>
                    <div class="laudo-card ${s.tdahCombinado ? 'laudo-card-paciente-positivo' : 'laudo-card-paciente-negativo'}">
                        <div class="laudo-card-label">TDAH Combinado</div>
                        <div class="laudo-card-valor" style="font-size:20px;">${s.tdahCombinado ? 'POSITIVO' : 'Negativo'}</div>
                    </div>
                    <div class="laudo-card ${s.subescalasOrdenadas[2].positivoFinal ? 'laudo-card-paciente-positivo' : 'laudo-card-paciente-negativo'}">
                        <div class="laudo-card-label">TOD</div>
                        <div class="laudo-card-valor" style="font-size:20px;">${s.subescalasOrdenadas[2].positivoFinal ? 'POSITIVO' : 'Negativo'}</div>
                    </div>
                    <div class="laudo-card ${s.subescalasOrdenadas[3].positivoFinal ? 'laudo-card-paciente-positivo' : 'laudo-card-paciente-negativo'}">
                        <div class="laudo-card-label">TC</div>
                        <div class="laudo-card-valor" style="font-size:20px;">${s.subescalasOrdenadas[3].positivoFinal ? 'POSITIVO' : 'Negativo'}</div>
                    </div>
                </div>

                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">3</span>
                    Contagem de Positivos por Subescala
                </div>
                <div class="etcd-grafico-wrap">
                    <canvas id="etcd-chart-barras"></canvas>
                </div>
                <p class="etcd-grafico-legenda">
                    <span class="etcd-leg-item"><span class="etcd-leg-bola" style="background:#dc2626"></span> Positivo (≥ corte)</span>
                    <span class="etcd-leg-item"><span class="etcd-leg-bola" style="background:#94a3b8"></span> Negativo</span>
                    <span class="etcd-leg-item">— — — Linha tracejada: ponto de corte</span>
                </p>

                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">4</span>
                    Tabela de Resultados
                </div>
                ${renderTabelaSubescalas()}

                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">5</span>
                    Interpretação Clínica
                </div>
                <div class="laudo-caixa-descricao">
                    ${renderInterpretacao()}
                </div>

                ${s.subescalasOrdenadas[3].positivoFinal || s.subtiposTCPresentes.length > 0 ? `
                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">6</span>
                    Análise Qualitativa — Subtipos TC
                </div>
                ${renderTabelaSubtiposTC()}
                ` : ''}

                ${qtdPositivos > 0 ? `
                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">${(s.subescalasOrdenadas[3].positivoFinal || s.subtiposTCPresentes.length > 0) ? 7 : 6}</span>
                    Comportamentos Positivos Identificados
                </div>
                ${s.positivos.map(sub => `
                    <h4 style="margin: 16px 0 8px 0; color: #1e293b;">${escapeHtml(sub.nome)} <span style="color:#64748b;font-weight:400;font-size:13px;">(${sub.qtdPositivos} de ${sub.qtdItens} positivos)</span></h4>
                    <ul class="etcd-itens-criticos">
                        ${sub.itensPositivos.map(it => `<li><strong>Item ${it.numero}:</strong> ${escapeHtml(it.texto)}</li>`).join('')}
                    </ul>
                `).join('')}
                ` : ''}

            </div>

            <div class="laudo-rodape">
                <div class="laudo-rodape-esq">
                    <div class="laudo-rodape-org">Equilibrium Neuropsicologia</div>
                    <div class="laudo-rodape-tipo">Correção automatizada — ETCD (DBD)</div>
                </div>
                <div class="laudo-rodape-dir">
                    <div class="laudo-rodape-data">Documento gerado em ${formatarDataBR(new Date().toISOString())}</div>
                    <div class="laudo-rodape-confidencial">Instrumento de triagem. O diagnóstico requer avaliação multimodal conforme DSM-5.</div>
                </div>
            </div>
        </div>
        `;
    }

    function renderInterpretacao() {
        const s = state.scores;
        const positivos = s.positivos;
        if (positivos.length === 0) {
            return `
                <p>Nenhuma das 4 subescalas atingiu o ponto de corte estabelecido pela DBD,
                não evidenciando indicadores clinicamente significativos de TDAH, TOD ou TC
                pela perspectiva do respondente no momento da triagem.</p>
                <p>A ETCD é um instrumento de rastreio. Mudanças no comportamento podem
                justificar nova aplicação.</p>
            `;
        }

        const nomes = positivos.map(p => p.nome.replace(/—.*/, '').trim()).join(', ');
        let txt = `
            <p>Foram identificados resultados <strong>POSITIVOS</strong> em
            <strong>${positivos.length} ${positivos.length === 1 ? 'subescala' : 'subescalas'}</strong>:
            ${escapeHtml(nomes)}.</p>
        `;
        if (s.tdahCombinado) {
            txt += `<p><strong>Indicativo de TDAH Combinado</strong> — critérios atingidos em
                ambas as subescalas (Desatenção e Hiperatividade/Impulsividade).</p>`;
        }
        if (s.subtiposTCPresentes.length > 0) {
            const stNomes = s.subtiposTCPresentes.map(st => st.nome).join(', ');
            txt += `<p>Na análise qualitativa do TC, foram identificados itens positivos em:
                <strong>${escapeHtml(stNomes)}</strong>.</p>`;
        }
        txt += `<p>A ETCD é um instrumento de <strong>triagem</strong> e não estabelece
            diagnóstico. <strong>Recomenda-se avaliação neuropsicológica e clínica
            abrangente</strong> com confirmação por critérios DSM-5 mediante avaliação
            multimodal (entrevistas, observação clínica, instrumentos diagnósticos
            específicos e cotejamento de informações de múltiplos contextos).</p>`;
        return txt;
    }

    function renderTabelaSubescalas() {
        const linhas = state.scores.subescalasOrdenadas.map(s => `
            <tr ${s.positivoFinal ? 'class="linha-critica"' : ''}>
                <td>${escapeHtml(s.nome)}</td>
                <td class="td-resposta">${s.qtdItens}</td>
                <td class="td-resposta" style="font-weight:700;">${s.qtdPositivos}</td>
                <td class="td-resposta">≥ ${s.corte}</td>
                <td class="td-resposta" style="font-weight:700;color:${s.positivoFinal ? '#dc2626' : '#16a34a'};">${s.positivoFinal ? 'POSITIVO' : 'Negativo'}</td>
            </tr>
        `).join('');

        const corCombin = state.scores.tdahCombinado ? '#dc2626' : '#16a34a';
        const labelCombin = state.scores.tdahCombinado ? 'POSITIVO' : 'Negativo';

        return `
            <table class="etcd-tabela-itens">
                <thead>
                    <tr>
                        <th>Subescala</th>
                        <th>Itens</th>
                        <th>Positivos</th>
                        <th>Corte</th>
                        <th>Resultado</th>
                    </tr>
                </thead>
                <tbody>
                    ${linhas}
                    <tr ${state.scores.tdahCombinado ? 'class="linha-critica"' : ''}>
                        <td><strong>TDAH Combinado</strong> <span style="color:#64748b;font-size:11px;">(Desat ≥6 E Hiper ≥6)</span></td>
                        <td class="td-resposta">—</td>
                        <td class="td-resposta">—</td>
                        <td class="td-resposta">—</td>
                        <td class="td-resposta" style="font-weight:700;color:${corCombin};">${labelCombin}</td>
                    </tr>
                </tbody>
            </table>
        `;
    }

    function renderTabelaSubtiposTC() {
        const linhas = state.scores.subtiposTC.map(st => `
            <tr ${st.presente ? 'class="linha-critica"' : ''}>
                <td>${escapeHtml(st.nome)}</td>
                <td class="td-label">${st.itens.join(', ')}</td>
                <td class="td-resposta" style="font-weight:700;">${st.itensEncontrados.length} / ${st.itens.length}</td>
                <td class="td-resposta" style="font-weight:700;color:${st.presente ? '#dc2626' : '#16a34a'};">${st.presente ? 'PRESENTE' : 'Ausente'}</td>
            </tr>
        `).join('');

        return `
            <table class="etcd-tabela-itens">
                <thead>
                    <tr>
                        <th>Subtipo TC</th>
                        <th>Itens DBD</th>
                        <th>Positivos</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>${linhas}</tbody>
            </table>
            <p style="font-size:12px;color:#64748b;margin-top:8px;">
                A presença de <strong>qualquer item positivo</strong> dentro de um subtipo é
                clinicamente relevante e merece atenção na avaliação aprofundada.
            </p>
        `;
    }

    // ============================================================================
    // GRÁFICO DE BARRAS HORIZONTAL
    // ============================================================================
    function renderGraficoBarras() {
        const canvas = document.getElementById('etcd-chart-barras');
        if (!canvas) return;
        if (state.chartBarras) state.chartBarras.destroy();

        const labels = state.scores.subescalasOrdenadas.map(s => s.nome);
        const dados = state.scores.subescalasOrdenadas.map(s => s.qtdPositivos);
        const cores = state.scores.subescalasOrdenadas.map(s => s.positivoFinal ? '#dc2626' : '#94a3b8');
        const maxItens = Math.max(...state.scores.subescalasOrdenadas.map(s => s.qtdItens));

        state.chartBarras = new Chart(canvas, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'Itens positivos',
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
                                const s = state.scores.subescalasOrdenadas[ctx.dataIndex];
                                return `${s.qtdPositivos} positivos (corte ≥ ${s.corte}) — ${s.positivoFinal ? 'POSITIVO' : 'Negativo'}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        beginAtZero: true,
                        max: maxItens,
                        ticks: { stepSize: 1 },
                        grid: { color: '#e2e8f0' },
                        title: { display: true, text: 'Itens positivos (Muito + Demais)', color: '#64748b' }
                    },
                    y: { grid: { display: false } }
                }
            },
            plugins: [{
                id: 'cortePorSubescala',
                afterDraw: (chart) => {
                    const xScale = chart.scales.x;
                    const yScale = chart.scales.y;
                    const ctx = chart.ctx;
                    ctx.save();
                    ctx.setLineDash([5, 4]);
                    ctx.lineWidth = 2;
                    ctx.strokeStyle = '#dc2626';
                    state.scores.subescalasOrdenadas.forEach((s, idx) => {
                        const x = xScale.getPixelForValue(s.corte);
                        const y = yScale.getPixelForValue(idx);
                        const halfBar = (yScale.getPixelForValue(0) - yScale.getPixelForValue(1)) / 2;
                        ctx.beginPath();
                        ctx.moveTo(x, y - halfBar * 0.7);
                        ctx.lineTo(x, y + halfBar * 0.7);
                        ctx.stroke();
                    });
                    ctx.setLineDash([]);
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
            pdf.save(`ETCD - ${nomeAbreviado}_${dataStr}.pdf`);

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

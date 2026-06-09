// ============================================================================
// CORTEX_APP — Resultado SRBCSS (Altas Habilidades/Superdotação — laudo)
// ============================================================================
// URL: ?aplicacao_id=<uuid>
//
// Renzulli et al. | Adapt. Equilibrium · 126 itens · escala 1-6 · 14 subescalas
// Heteroaplicação. Sem normas/pontos de corte publicados → SOMA por subescala.
//
// Laudo (decisão B — JS recalcula do zero a partir de escores_brutos):
//   - Visão geral: radar (% do máximo de cada subescala) + destaques.
//   - Perfil: barras ordenadas (mais expressiva no topo).
//   - Detalhe por subescala: medidor mín→máx (onde caiu) + tira item a item.
//   - Comparativo cognitivo (opcional): índices WISC-IV/WAIS-III do paciente
//     (média 100), em painel SEPARADO — medidas complementares, não equiparáveis.
//   - % do máximo é transformação aritmética (não percentil normativo).
// ============================================================================

(function() {
    'use strict';

    const SIGLA_ESPERADA = 'SRBCSS';
    const TOTAL_ITENS = 126;
    const COR = '#2e74b5';
    const COR_DESTAQUE = '#7c3aed';
    const COR_BAIXA = '#94a3b8';

    // Escala de cor por resposta (1-6) — claro → escuro
    const CORES_RESP = ['#eff6ff', '#dbeafe', '#bfdbfe', '#93c5fd', '#60a5fa', '#2563eb'];
    const TXT_RESP    = ['#1e3a8a', '#1e3a8a', '#1e3a8a', '#1e3a8a', '#ffffff', '#ffffff'];

    const state = {
        aplicacaoId: null,
        aplicacao: null,
        paciente: null,
        norma: null,
        itens: [],
        fatores: [],
        correcao: null,
        scores: null,
        cognitivo: null,   // { wais: compostos|null, wisc: compostos|null }
        chartRadar: null,
        chartBarras: null,
        chartCognitivo: null
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
            .from('pacientes')
            .select('id, nome_completo, sexo, data_nascimento, cpf, escolaridade, escolaridade_serie')
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
        if (!norma) throw new Error('Norma SRBCSS não cadastrada');
        state.norma = norma;

        const { data: fatores } = await window.cortexClient
            .from('instrumentos_fatores')
            .select('id, fator_codigo, fator_label, ordem, min_score, max_score, eh_total')
            .eq('norma_id', norma.id).order('ordem');
        state.fatores = fatores || [];

        const { data: itensRaw } = await window.cortexClient
            .from('instrumentos_itens').select('numero, texto, fator_id')
            .eq('norma_id', norma.id).order('numero');
        const mapFator = {};
        for (const f of state.fatores) mapFator[f.id] = f.fator_codigo;
        state.itens = (itensRaw || []).map(i => ({
            numero: i.numero, texto: i.texto,
            fator_codigo: mapFator[i.fator_id] || 'desconhecido'
        }));

        const { data: correcao, error: errC } = await window.cortexClient
            .from('correcoes').select('*').eq('aplicacao_id', state.aplicacaoId)
            .order('created_at', { ascending: false }).limit(1).maybeSingle();
        if (errC) throw new Error('Correção: ' + errC.message);
        if (!correcao) throw new Error('Nenhuma correção encontrada');
        state.correcao = correcao;

        state.scores = calcularResultados(correcao);
        state.cognitivo = await carregarCognitivo(state.paciente.id).catch(() => null);

        await CortexAudit.log('leitura', 'correcoes', correcao.id, {
            detalhes: { aplicacaoId: state.aplicacaoId, sigla: SIGLA_ESPERADA }
        });
    }

    // Busca o WISC-IV / WAIS-III mais recente do paciente (se houver) p/ comparativo
    async function carregarCognitivo(pacienteId) {
        const { data: cats } = await window.cortexClient
            .from('instrumentos_catalogo').select('id, sigla')
            .in('sigla', ['WAIS-III', 'WISC-IV']);
        if (!cats || !cats.length) return null;
        const idSigla = {};
        cats.forEach(c => { idSigla[c.id] = c.sigla; });

        const { data: aplics } = await window.cortexClient
            .from('aplicacoes_instrumento').select('id, instrumento_id, created_at')
            .eq('paciente_id', pacienteId)
            .in('instrumento_id', cats.map(c => c.id))
            .order('created_at', { ascending: false });

        const recente = {};
        for (const a of (aplics || [])) {
            const sig = idSigla[a.instrumento_id];
            if (sig && !recente[sig]) recente[sig] = a.id;
        }

        const out = { wais: null, wisc: null };
        if (recente['WAIS-III']) {
            const { data } = await window.cortexClient.from('wais_resultados')
                .select('compostos').eq('aplicacao_id', recente['WAIS-III']).maybeSingle();
            if (data?.compostos) out.wais = data.compostos;
        }
        if (recente['WISC-IV']) {
            const { data } = await window.cortexClient.from('wisciv_resultados')
                .select('compostos').eq('aplicacao_id', recente['WISC-IV']).maybeSingle();
            if (data?.compostos) out.wisc = data.compostos;
        }
        return (out.wais || out.wisc) ? out : null;
    }

    // ============================================================================
    // CÁLCULO — soma por subescala, % do máximo
    // ============================================================================
    function calcularResultados(correcao) {
        const respostas = (correcao?.escores_brutos || {}).respostas || {};
        const respPorNum = {};
        for (const [k, v] of Object.entries(respostas)) respPorNum[parseInt(k)] = parseInt(v) || 0;

        const porFator = {};
        for (const f of state.fatores) {
            if (f.eh_total) continue;
            porFator[f.fator_codigo] = {
                codigo: f.fator_codigo, nome: f.fator_label, nomeCurto: f.fator_label.replace(/^[IVX]+\.\s*/, ''),
                ordem: f.ordem, minScore: f.min_score || 0, maxScore: f.max_score || 0,
                itens: [], soma: 0, n: 0, pct: 0
            };
        }
        for (const item of state.itens) {
            const valor = respPorNum[item.numero] ?? 0;
            const fc = item.fator_codigo;
            if (porFator[fc]) {
                porFator[fc].itens.push({ numero: item.numero, valor, texto: item.texto });
                porFator[fc].soma += valor; porFator[fc].n += 1;
            }
        }
        const subescalas = Object.values(porFator).sort((a, b) => a.ordem - b.ordem);
        for (const s of subescalas) s.pct = s.maxScore > 0 ? Math.round((s.soma / s.maxScore) * 100) : 0;

        const porPct = [...subescalas].sort((a, b) => b.pct - a.pct);
        const respondidos = Object.keys(respostas).length;
        return {
            subescalas, porPct,
            destaquesAlto: porPct.slice(0, 3),
            destaquesBaixo: porPct.slice(-3).reverse(),
            respondidos, faltam: TOTAL_ITENS - respondidos
        };
    }

    function labelResposta(valor) {
        const labels = state.norma.answer_labels || [];
        const idx = valor - (state.norma.escala_min || 1);
        return labels[idx] !== undefined ? labels[idx] : String(valor);
    }

    // ============================================================================
    // RENDER
    // ============================================================================
    function renderizar() {
        const cont = document.getElementById('laudo-conteudo');
        cont.innerHTML = renderLaudo();
        document.getElementById('acoes-topo').style.display = 'flex';
        document.getElementById('back-link').href = `../../bateria/bateria.html?paciente=${state.paciente.id}`;
        document.getElementById('btn-gerar-pdf').addEventListener('click', gerarPDF);

        // clicar numa barra rola até o card da subescala
        document.querySelectorAll('[data-goto]').forEach(el => {
            el.addEventListener('click', () => {
                const alvo = document.getElementById('sub-' + el.dataset.goto);
                if (alvo) {
                    alvo.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    alvo.classList.add('srbcss-card-foco');
                    setTimeout(() => alvo.classList.remove('srbcss-card-foco'), 1400);
                }
            });
        });

        setTimeout(() => {
            renderRadar();
            renderBarras();
            renderCognitivo();
        }, 60);
    }

    function renderLaudo() {
        const s = state.scores;
        const p = state.paciente;
        const idade = calcularIdadeAnos(p.data_nascimento, state.aplicacao.created_at);
        const dataAplic = formatarDataBR(state.aplicacao.created_at);
        const nascStr = formatarDataBR(p.data_nascimento);
        const escolaridade = [p.escolaridade, p.escolaridade_serie].filter(Boolean).join(' — ') || '—';

        return `
        <div class="laudo">
            <div class="laudo-header">
                <div class="laudo-header-esq">
                    <div class="laudo-header-logo">E</div>
                    <div class="laudo-header-textos">
                        <div class="laudo-header-supratitulo">Relatório de Avaliação Neuropsicológica</div>
                        <h1 class="laudo-header-titulo">SRBCSS</h1>
                        <div class="laudo-header-subtitulo">Características de Altas Habilidades/Superdotação (Renzulli)<br>Adapt. Grupo Equilibrium · 126 itens · escala 1-6 · 14 subescalas independentes</div>
                    </div>
                </div>
                <div class="laudo-header-pontuacao">
                    <div class="laudo-header-pontuacao-label">Subescalas</div>
                    <div class="laudo-header-pontuacao-valor">${s.subescalas.length}</div>
                    <div class="laudo-header-pontuacao-max">itens 1–6</div>
                </div>
            </div>

            <div class="laudo-body">
                <div class="laudo-secao-titulo"><span class="laudo-secao-tag">1</span> Identificação</div>
                <div class="laudo-identificacao">
                    <div class="laudo-identif-item"><span class="laudo-identif-label">Nome:</span><span class="laudo-identif-valor">${escapeHtml(p.nome_completo)}</span></div>
                    <div class="laudo-identif-item"><span class="laudo-identif-label">Idade:</span><span class="laudo-identif-valor">${idade !== null ? idade + ' anos' : '—'}</span></div>
                    <div class="laudo-identif-item"><span class="laudo-identif-label">Sexo:</span><span class="laudo-identif-valor">${escapeHtml(p.sexo || '—')}</span></div>
                    <div class="laudo-identif-item"><span class="laudo-identif-label">Nascimento:</span><span class="laudo-identif-valor">${nascStr}</span></div>
                    <div class="laudo-identif-item"><span class="laudo-identif-label">Escolaridade:</span><span class="laudo-identif-valor">${escapeHtml(escolaridade)}</span></div>
                    <div class="laudo-identif-item"><span class="laudo-identif-label">Aplicação:</span><span class="laudo-identif-valor">${dataAplic}</span></div>
                </div>

                <div class="laudo-secao-titulo"><span class="laudo-secao-tag">2</span> Como interpretar</div>
                <div class="laudo-caixa-descricao">
                    <p>Escala de <strong>observação comportamental</strong> (informante: professor[a]/responsável). As <strong>14 subescalas são independentes</strong>, <strong>não somadas em total</strong> e <strong>sem classificação normativa</strong> (não há cortes publicados). As medidas em <strong>% do máximo</strong> servem só para comparar subescalas de tamanhos diferentes e apontar as <strong>áreas mais expressivas</strong> — não são percentis. Resultado isolado não estabelece diagnóstico.</p>
                </div>

                <div class="laudo-secao-titulo"><span class="laudo-secao-tag">3</span> Visão geral do perfil</div>
                <div class="srbcss-geral">
                    <div class="srbcss-radar-wrap"><canvas id="srbcss-radar"></canvas></div>
                    <div class="srbcss-destaques-box">
                        <div class="srbcss-dq srbcss-dq-alto">
                            <div class="srbcss-dq-titulo">▲ Mais expressivas</div>
                            ${s.destaquesAlto.map(d => `<div class="srbcss-chip" data-goto="${d.codigo}"><span>${escapeHtml(d.nomeCurto)}</span><strong>${d.pct}%</strong></div>`).join('')}
                        </div>
                        <div class="srbcss-dq srbcss-dq-baixo">
                            <div class="srbcss-dq-titulo">▼ Menos expressivas</div>
                            ${s.destaquesBaixo.map(d => `<div class="srbcss-chip srbcss-chip-baixo" data-goto="${d.codigo}"><span>${escapeHtml(d.nomeCurto)}</span><strong>${d.pct}%</strong></div>`).join('')}
                        </div>
                    </div>
                </div>
                <p class="srbcss-resumo-texto">${renderResumoTexto()}</p>

                <div class="laudo-secao-titulo"><span class="laudo-secao-tag">4</span> Perfil detalhado (ordenado)</div>
                <p class="srbcss-dica">Clique numa barra para ir ao detalhe da subescala.</p>
                <div class="srbcss-barras-wrap"><canvas id="srbcss-barras"></canvas></div>

                <div class="laudo-secao-titulo"><span class="laudo-secao-tag">5</span> Detalhe por subescala</div>
                <div class="srbcss-cards">
                    ${s.subescalas.map(renderCardSubescala).join('')}
                </div>
                <div class="srbcss-resp-legenda">
                    Frequência por item:
                    ${CORES_RESP.map((c, i) => `<span class="srbcss-resp-leg"><span class="srbcss-resp-cell" style="background:${c};color:${TXT_RESP[i]};">${i + 1}</span>${escapeHtml(labelResposta(i + 1))}</span>`).join('')}
                </div>

                <div class="laudo-secao-titulo"><span class="laudo-secao-tag">6</span> Comparativo cognitivo (WISC-IV / WAIS-III)</div>
                ${renderCognitivoBloco()}

            </div>

            <div class="laudo-rodape">
                <div class="laudo-rodape-esq">
                    <div class="laudo-rodape-org">Equilibrium Neuropsicologia</div>
                    <div class="laudo-rodape-tipo">Correção automatizada — SRBCSS</div>
                </div>
                <div class="laudo-rodape-dir">
                    <div class="laudo-rodape-data">Documento gerado em ${formatarDataBR(new Date().toISOString())}</div>
                    <div class="laudo-rodape-confidencial">Instrumento de observação. O resultado isolado não estabelece diagnóstico.</div>
                </div>
            </div>
        </div>
        `;
    }

    function renderResumoTexto() {
        const s = state.scores;
        const alto = s.destaquesAlto.map(d => d.nomeCurto).join(', ');
        const baixo = s.destaquesBaixo.map(d => d.nomeCurto).join(', ');
        return `Pela observação do informante, as áreas de <strong>maior expressão relativa</strong> foram: ${escapeHtml(alto)}. As de <strong>menor expressão</strong>: ${escapeHtml(baixo)}. Os valores são pontuações brutas em relação ao máximo de cada subescala (sem comparação normativa).`;
    }

    function renderCardSubescala(sub) {
        const posMarcador = sub.maxScore > sub.minScore
            ? ((sub.soma - sub.minScore) / (sub.maxScore - sub.minScore)) * 100 : 0;
        const cells = sub.itens.map(it => {
            const v = it.valor;
            const bg = v ? CORES_RESP[v - 1] : '#f1f5f9';
            const fg = v ? TXT_RESP[v - 1] : '#94a3b8';
            const titulo = `Item ${it.numero}: ${it.texto} — ${v ? labelResposta(v) : 'sem resposta'}`;
            return `<span class="srbcss-resp-cell" title="${escapeHtml(titulo)}" style="background:${bg};color:${fg};">${v || '–'}</span>`;
        }).join('');

        return `
            <div class="srbcss-card" id="sub-${sub.codigo}">
                <div class="srbcss-card-topo">
                    <div class="srbcss-card-nome"><span class="srbcss-card-rom">${escapeHtml(romano(sub.ordem))}</span> ${escapeHtml(sub.nomeCurto)}</div>
                    <div class="srbcss-card-pct">${sub.pct}%</div>
                </div>
                <div class="srbcss-gauge">
                    <div class="srbcss-gauge-trilho">
                        <div class="srbcss-gauge-fill" style="width:${posMarcador}%;"></div>
                        <div class="srbcss-gauge-marcador" style="left:${posMarcador}%;"></div>
                    </div>
                    <div class="srbcss-gauge-legenda">
                        <span>mín ${sub.minScore}</span>
                        <span class="srbcss-gauge-valor">${sub.soma} pts</span>
                        <span>máx ${sub.maxScore}</span>
                    </div>
                </div>
                <div class="srbcss-resp-strip">${cells}</div>
            </div>
        `;
    }

    // ── Comparativo cognitivo ───────────────────────────────────────────────
    const COG_LABELS = { ICV: 'ICV', IOP: 'IOP', IRP: 'IRP', IMO: 'IMO', IVP: 'IVP', QI_TOTAL: 'QIT' };
    const COG_ORDEM  = ['ICV', 'IOP', 'IRP', 'IMO', 'IVP', 'QI_TOTAL'];

    function cogSerie(compostos) {
        const pts = [];
        for (const k of COG_ORDEM) {
            const c = compostos?.[k]?.composto;
            if (c != null) pts.push({ sigla: COG_LABELS[k], valor: +c });
        }
        return pts;
    }

    function renderCognitivoBloco() {
        const cog = state.cognitivo;
        if (!cog || (!cog.wais && !cog.wisc)) {
            return `<div class="laudo-caixa-descricao srbcss-cog-vazio">
                <p>Não há WISC-IV ou WAIS-III corrigido para este paciente. Quando houver, os índices aparecerão aqui para leitura conjunta com o perfil comportamental.</p>
            </div>`;
        }
        const qual = cog.wisc ? 'WISC-IV' : 'WAIS-III';
        return `
            <div class="laudo-caixa-descricao">
                <p>O perfil da SRBCSS (observação comportamental, <strong>% do máximo</strong>) e o <strong>${qual}</strong> (desempenho cognitivo padronizado, <strong>média 100</strong>) são <strong>medidas complementares</strong> e <strong>não diretamente equiparáveis</strong>. A leitura conjunta ajuda a contextualizar onde habilidade observada e desempenho medido convergem ou divergem.</p>
            </div>
            <div class="srbcss-cog-wrap"><canvas id="srbcss-cog"></canvas></div>
            <p class="srbcss-grafico-legenda srbcss-cog-leg">
                <span class="srbcss-leg-item"><span class="srbcss-leg-bola" style="background:#cbd5e1"></span> Faixa média (85–115)</span>
                <span class="srbcss-leg-item"><span class="srbcss-leg-bola" style="background:#16a34a"></span> ≥ 130 (muito superior)</span>
            </p>
        `;
    }

    // ============================================================================
    // GRÁFICOS
    // ============================================================================
    function renderRadar() {
        const c = document.getElementById('srbcss-radar');
        if (!c) return;
        if (state.chartRadar) state.chartRadar.destroy();
        const subs = state.scores.subescalas;
        state.chartRadar = new Chart(c, {
            type: 'radar',
            data: {
                labels: subs.map(s => s.nomeCurto),
                datasets: [{
                    label: '% do máximo', data: subs.map(s => s.pct),
                    backgroundColor: 'rgba(46,116,181,0.18)', borderColor: COR,
                    borderWidth: 2, pointBackgroundColor: COR, pointRadius: 3
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false },
                    tooltip: { callbacks: { label: (ctx) => {
                        const sub = state.scores.subescalas[ctx.dataIndex];
                        return `${sub.soma}/${sub.maxScore} (${sub.pct}%)`;
                    } } } },
                scales: { r: { min: 0, max: 100, ticks: { stepSize: 25, callback: v => v + '%', backdropColor: 'transparent', font: { size: 9 } },
                    pointLabels: { font: { size: 10 } }, grid: { color: '#e2e8f0' }, angleLines: { color: '#e2e8f0' } } }
            }
        });
    }

    function renderBarras() {
        const c = document.getElementById('srbcss-barras');
        if (!c) return;
        if (state.chartBarras) state.chartBarras.destroy();
        const ord = state.scores.porPct;
        const maxPct = Math.max(...ord.map(s => s.pct), 0);
        const cores = ord.map(s => s.pct === maxPct && maxPct > 0 ? COR_DESTAQUE : COR);
        state.chartBarras = new Chart(c, {
            type: 'bar',
            data: { labels: ord.map(s => s.nomeCurto),
                datasets: [{ data: ord.map(s => s.pct), backgroundColor: cores, borderRadius: 4 }] },
            options: {
                responsive: true, maintainAspectRatio: false, indexAxis: 'y',
                onClick: (e, els) => { if (els.length) {
                    const sub = ord[els[0].index];
                    const alvo = document.getElementById('sub-' + sub.codigo);
                    if (alvo) { alvo.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        alvo.classList.add('srbcss-card-foco'); setTimeout(() => alvo.classList.remove('srbcss-card-foco'), 1400); }
                } },
                plugins: { legend: { display: false },
                    tooltip: { callbacks: { label: (ctx) => {
                        const sub = state.scores.porPct[ctx.dataIndex];
                        return `${sub.soma}/${sub.maxScore} (${sub.pct}%) — clique p/ detalhe`;
                    } } } },
                scales: { x: { beginAtZero: true, max: 100, ticks: { stepSize: 20, callback: v => v + '%' },
                    grid: { color: '#e2e8f0' }, title: { display: true, text: '% do máximo da subescala', color: '#64748b' } },
                    y: { grid: { display: false }, ticks: { font: { size: 11 } } } }
            }
        });
    }

    function renderCognitivo() {
        const c = document.getElementById('srbcss-cog');
        if (!c || !state.cognitivo) return;
        if (state.chartCognitivo) state.chartCognitivo.destroy();
        const compostos = state.cognitivo.wisc || state.cognitivo.wais;
        const serie = cogSerie(compostos);
        if (!serie.length) return;
        const cores = serie.map(p => p.valor >= 130 ? '#16a34a' : p.valor >= 120 ? '#22c55e'
            : p.valor >= 90 ? COR : p.valor >= 80 ? '#f59e0b' : '#dc2626');
        state.chartCognitivo = new Chart(c, {
            type: 'bar',
            data: { labels: serie.map(p => p.sigla),
                datasets: [{ data: serie.map(p => p.valor), backgroundColor: cores, borderRadius: 4 }] },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false },
                    tooltip: { callbacks: { label: (ctx) => `Composto ${ctx.parsed.y} — ${classWechsler(ctx.parsed.y)}` } } },
                scales: { y: { min: 40, max: 160, ticks: { stepSize: 20 }, grid: { color: '#e2e8f0' },
                    title: { display: true, text: 'Pontuação composta (média 100)', color: '#64748b' } },
                    x: { grid: { display: false } } }
            },
            plugins: [{
                id: 'faixaMedia',
                beforeDraw: (chart) => {
                    const { ctx, chartArea, scales } = chart;
                    if (!chartArea) return;
                    const y115 = scales.y.getPixelForValue(115);
                    const y85 = scales.y.getPixelForValue(85);
                    const y100 = scales.y.getPixelForValue(100);
                    ctx.save();
                    ctx.fillStyle = 'rgba(203,213,225,0.30)';
                    ctx.fillRect(chartArea.left, y115, chartArea.right - chartArea.left, y85 - y115);
                    ctx.strokeStyle = '#94a3b8'; ctx.setLineDash([5, 4]); ctx.lineWidth = 1;
                    ctx.beginPath(); ctx.moveTo(chartArea.left, y100); ctx.lineTo(chartArea.right, y100); ctx.stroke();
                    ctx.setLineDash([]); ctx.restore();
                }
            }]
        });
    }

    function classWechsler(v) {
        if (v >= 130) return 'Muito superior';
        if (v >= 120) return 'Superior';
        if (v >= 110) return 'Médio superior';
        if (v >= 90)  return 'Médio';
        if (v >= 80)  return 'Médio inferior';
        if (v >= 70)  return 'Limítrofe';
        return 'Muito baixo';
    }

    // ============================================================================
    // PDF
    // ============================================================================
    async function gerarPDF() {
        const btn = document.getElementById('btn-gerar-pdf');
        const orig = btn.textContent;
        btn.disabled = true; btn.textContent = '⏳ Gerando PDF...';
        try {
            document.body.classList.add('exportando');
            await new Promise(r => setTimeout(r, 120));
            const laudo = document.querySelector('.laudo');
            if (!laudo) throw new Error('Laudo não encontrado');
            const canvas = await html2canvas(laudo, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false });
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            const pdfWidth = 210, pdfHeight = 297;
            const imgWidth = pdfWidth, imgHeight = (canvas.height * pdfWidth) / canvas.width;
            if (imgHeight <= pdfHeight) {
                pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, imgWidth, imgHeight);
            } else {
                let posY = 0, restante = imgHeight;
                while (restante > 0) {
                    pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, -posY, imgWidth, imgHeight);
                    restante -= pdfHeight; posY += pdfHeight;
                    if (restante > 0) pdf.addPage();
                }
            }
            const nome = state.paciente.nome_completo.toUpperCase().replace(/[^A-Z\s]/g, '').trim().substring(0, 50);
            pdf.save(`SRBCSS - ${nome}_${formatarDataArquivo(new Date())}.pdf`);
            window.CortexUI.toast('PDF gerado com sucesso', 'success');
        } catch (err) {
            console.error('Erro ao gerar PDF:', err);
            window.CortexUI.toast('Erro ao gerar PDF: ' + err.message, 'danger');
        } finally {
            document.body.classList.remove('exportando');
            btn.disabled = false; btn.textContent = orig;
        }
    }

    // ============================================================================
    // UTILS
    // ============================================================================
    function romano(n) {
        const r = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV'];
        return r[n] || String(n);
    }
    function calcularIdadeAnos(nascISO, aplISO) {
        if (!nascISO) return null;
        const ref = aplISO ? new Date(aplISO) : new Date();
        const n = new Date(nascISO);
        if (isNaN(n) || isNaN(ref) || ref < n) return null;
        let anos = ref.getFullYear() - n.getFullYear();
        if (ref.getMonth() < n.getMonth() || (ref.getMonth() === n.getMonth() && ref.getDate() < n.getDate())) anos--;
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
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
            </div>`;
    }
})();

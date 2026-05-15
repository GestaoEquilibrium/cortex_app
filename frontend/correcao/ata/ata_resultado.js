// ============================================================================
// CORTEX_APP — Resultado ATA (laudo)
// ============================================================================
// URL: ?aplicacao_id=<uuid>
//
// Escala ATA — Avaliação de Traços Autísticos (Ballabriga, Escudé, Llaberia)
// 23 itens · escala 0-2 · soma simples 0-46 · ponto de corte ≥15
// Heteroaplicada online — pai/mãe/cuidador responde remotamente
//
// JS recalcula tudo do zero a partir de escores_brutos.respostas
// (decisão arquitetural B do CORTEX).
// ============================================================================

(function() {
    'use strict';

    const SIGLA_ESPERADA = 'ATA';
    const PONTO_CORTE = 15;
    const TOTAL_ITENS = 23;
    const MAX_SCORE = TOTAL_ITENS * 2; // 46

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
        chartBarras: null,
        chartPizza: null
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
        if (!norma) throw new Error('Norma ATA não cadastrada');
        state.norma = norma;

        const { data: itens } = await window.cortexClient
            .from('instrumentos_itens').select('numero, texto')
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

    // ============================================================================
    // CÁLCULO (decisão arquitetural B — JS recalcula tudo do zero)
    // ============================================================================
    function calcularResultados(correcao) {
        const respostas = (correcao?.escores_brutos || {}).respostas || {};

        const total = Object.values(respostas).reduce((a, v) => a + (parseInt(v) || 0), 0);

        const dist = { naoApresenta: 0, algunsTracos: 0, variosTracos: 0 };
        for (const v of Object.values(respostas)) {
            const n = parseInt(v);
            if (n === 0) dist.naoApresenta++;
            else if (n === 1) dist.algunsTracos++;
            else if (n === 2) dist.variosTracos++;
        }

        const itensCriticos = [];
        for (const [num, val] of Object.entries(respostas)) {
            if (parseInt(val) === 2) itensCriticos.push(parseInt(num));
        }
        itensCriticos.sort((a, b) => a - b);

        const classificacao = total >= PONTO_CORTE ? 'sugestivo_tea' : 'nao_sugestivo';
        const respondidos = Object.values(respostas).length;

        return {
            total, maxScore: MAX_SCORE,
            percentual: respondidos > 0 ? Math.round((total / MAX_SCORE) * 100) : 0,
            dist, itensCriticos, classificacao, respondidos,
            faltam: TOTAL_ITENS - respondidos
        };
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
            renderGraficoBarras();
            renderGraficoPizza();
        }, 50);
    }

    function renderLaudo() {
        const s = state.scores;
        const p = state.paciente;
        const idade = calcularIdadeAnos(p.data_nascimento, state.aplicacao.created_at);
        const dataAplic = formatarDataBR(state.aplicacao.created_at);
        const nascStr = formatarDataBR(p.data_nascimento);
        const respondente = p.mae_nome || p.responsavel_nome || '—';

        const corClassif = s.classificacao === 'sugestivo_tea' ? '#dc2626' : '#16a34a';
        const textoClassif = s.classificacao === 'sugestivo_tea'
            ? 'Sugestivo de TEA'
            : 'Sem indicativo de TEA';

        return `
        <div class="laudo">
            <div class="laudo-header">
                <div class="laudo-header-esq">
                    <div class="laudo-header-logo">E</div>
                    <div class="laudo-header-textos">
                        <div class="laudo-header-supratitulo">Relatório de Avaliação Neuropsicológica</div>
                        <h1 class="laudo-header-titulo">Escala ATA</h1>
                        <div class="laudo-header-subtitulo">Avaliação de Traços Autísticos<br>Ballabriga, Escudé, Llaberia · 23 itens · escala 0-2 · ponto de corte ≥${PONTO_CORTE}</div>
                    </div>
                </div>
                <div class="laudo-header-pontuacao">
                    <div class="laudo-header-pontuacao-label">Pontuação total</div>
                    <div class="laudo-header-pontuacao-valor">${s.total}</div>
                    <div class="laudo-header-pontuacao-max">de ${s.maxScore}</div>
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
                    <div class="laudo-identif-item">
                        <span class="laudo-identif-label">Respondente:</span>
                        <span class="laudo-identif-valor">${escapeHtml(respondente)}</span>
                    </div>
                </div>

                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">2</span>
                    Classificação Clínica
                </div>
                <div class="laudo-cards">
                    <div class="laudo-card ${s.classificacao === 'sugestivo_tea' ? 'laudo-card-paciente-positivo' : 'laudo-card-paciente-negativo'}">
                        <div class="laudo-card-label">Resultado</div>
                        <div class="laudo-card-valor" style="font-size: 22px;">${textoClassif}</div>
                    </div>
                    <div class="laudo-card laudo-card-corte">
                        <div class="laudo-card-label">Ponto de corte</div>
                        <div class="laudo-card-valor">≥ ${PONTO_CORTE}</div>
                    </div>
                    <div class="laudo-card laudo-card-max">
                        <div class="laudo-card-label">Itens em destaque</div>
                        <div class="laudo-card-valor">${s.itensCriticos.length}</div>
                    </div>
                </div>

                <div class="laudo-barra-container">
                    <div class="laudo-barra-titulo">Distribuição da pontuação</div>
                    <div class="laudo-barra-fundo">
                        <div class="laudo-barra-cutoff" style="left: ${(PONTO_CORTE / MAX_SCORE) * 100}%;">
                            <span>corte ${PONTO_CORTE}</span>
                        </div>
                        <div class="laudo-barra-marcador" style="left: ${(s.total / MAX_SCORE) * 100}%; background: ${corClassif};">
                            <span>${s.total}</span>
                        </div>
                    </div>
                    <div class="laudo-barra-extremos">
                        <span>0</span>
                        <span>${s.maxScore}</span>
                    </div>
                </div>

                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">3</span>
                    Interpretação Clínica
                </div>
                <div class="laudo-caixa-descricao">
                    ${renderInterpretacao()}
                </div>

                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">4</span>
                    Distribuição das Respostas por Item
                </div>
                <div class="ata-grafico-wrap">
                    <canvas id="ata-chart-barras"></canvas>
                </div>
                <p class="ata-grafico-legenda">
                    <span class="ata-leg-item"><span class="ata-leg-bola" style="background:#dc2626"></span> Apresenta vários traços (2)</span>
                    <span class="ata-leg-item"><span class="ata-leg-bola" style="background:#eab308"></span> Apresenta alguns traços (1)</span>
                    <span class="ata-leg-item"><span class="ata-leg-bola" style="background:#94a3b8"></span> Não apresenta (0)</span>
                </p>

                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">5</span>
                    Distribuição Percentual
                </div>
                <div class="ata-grafico-wrap ata-grafico-pizza">
                    <canvas id="ata-chart-pizza"></canvas>
                </div>

                ${s.itensCriticos.length > 0 ? `
                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">6</span>
                    Destaque de Severidade
                </div>
                <div class="laudo-caixa-descricao">
                    <p>Os itens a seguir receberam pontuação máxima (2 — apresenta vários traços) e merecem atenção clínica especial:</p>
                </div>
                <ul class="ata-itens-criticos">
                    ${s.itensCriticos.map(n => {
                        const item = state.itens.find(i => i.numero === n);
                        return `<li><strong>Item ${n}:</strong> ${escapeHtml(item?.texto || '—')}</li>`;
                    }).join('')}
                </ul>
                ` : ''}

                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">${s.itensCriticos.length > 0 ? 7 : 6}</span>
                    Tabela Completa de Respostas
                </div>
                ${renderTabelaItens()}

            </div>

            <div class="laudo-rodape">
                <div class="laudo-rodape-esq">
                    <div class="laudo-rodape-org">Equilibrium Neuropsicologia</div>
                    <div class="laudo-rodape-tipo">Correção automatizada — ATA</div>
                </div>
                <div class="laudo-rodape-dir">
                    <div class="laudo-rodape-data">Documento gerado em ${formatarDataBR(new Date().toISOString())}</div>
                    <div class="laudo-rodape-confidencial">Instrumento de rastreio. O resultado isolado não estabelece diagnóstico.</div>
                </div>
            </div>
        </div>
        `;
    }

    function renderInterpretacao() {
        const s = state.scores;
        if (s.classificacao === 'sugestivo_tea') {
            return `
                <p>A pontuação total de <strong>${s.total} pontos</strong> está
                <strong>acima do ponto de corte</strong> (≥${PONTO_CORTE}), o que
                <strong>sugere a presença de traços autísticos em intensidade clinicamente relevante</strong>.</p>
                <p>Foram identificados <strong>${s.itensCriticos.length} ${s.itensCriticos.length === 1 ? 'item' : 'itens'} com pontuação máxima (2)</strong>,
                indicando comportamentos que apresentam vários traços do espectro autista.
                Recomenda-se aprofundamento da avaliação com instrumentos diagnósticos específicos
                (ADOS-2, ADI-R ou CARS-2) e investigação clínica complementar.</p>
            `;
        }
        return `
            <p>A pontuação total de <strong>${s.total} pontos</strong> está
            <strong>abaixo do ponto de corte</strong> (≥${PONTO_CORTE}),
            <strong>não sugerindo indicativos clinicamente significativos de TEA</strong>
            pela perspectiva do respondente.</p>
            ${s.itensCriticos.length > 0 ? `
                <p>Apesar disso, ${s.itensCriticos.length} ite${s.itensCriticos.length === 1 ? 'm' : 'ns'}
                ${s.itensCriticos.length === 1 ? 'recebeu' : 'receberam'} pontuação máxima.
                Recomenda-se atenção clínica a esses comportamentos específicos.</p>
            ` : ''}
        `;
    }

    function renderTabelaItens() {
        const respostas = state.correcao?.escores_brutos?.respostas || {};
        const linhas = state.itens.map(item => {
            const val = respostas[item.numero];
            const valNum = val !== undefined ? parseInt(val) : null;
            const label = valNum === 0 ? 'Não apresenta'
                : valNum === 1 ? 'Apresenta alguns traços'
                : valNum === 2 ? 'Apresenta vários traços'
                : '—';
            const cor = valNum === 2 ? '#dc2626'
                : valNum === 1 ? '#eab308'
                : valNum === 0 ? '#94a3b8'
                : '#cbd5e1';
            return `
                <tr ${valNum === 2 ? 'class="linha-critica"' : ''}>
                    <td class="td-num">${item.numero}</td>
                    <td>${escapeHtml(item.texto)}</td>
                    <td class="td-resposta" style="color:${cor};font-weight:600;">${valNum ?? '—'}</td>
                    <td class="td-label">${label}</td>
                </tr>
            `;
        }).join('');

        return `
            <table class="ata-tabela-itens">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Item</th>
                        <th>Pts</th>
                        <th>Resposta</th>
                    </tr>
                </thead>
                <tbody>${linhas}</tbody>
            </table>
        `;
    }

    // ============================================================================
    // GRÁFICOS
    // ============================================================================
    function renderGraficoBarras() {
        const canvas = document.getElementById('ata-chart-barras');
        if (!canvas) return;
        if (state.chartBarras) state.chartBarras.destroy();

        const respostas = state.correcao?.escores_brutos?.respostas || {};
        const labels = state.itens.map(i => i.numero);
        const dados = state.itens.map(i => parseInt(respostas[i.numero]) || 0);
        const cores = dados.map(v =>
            v === 2 ? '#dc2626' : v === 1 ? '#eab308' : '#94a3b8'
        );

        state.chartBarras = new Chart(canvas, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'Pontuação',
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
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            title: (ctx) => `Item ${ctx[0].label}`,
                            label: (ctx) => {
                                const v = ctx.parsed.y;
                                const txt = v === 0 ? 'Não apresenta'
                                    : v === 1 ? 'Alguns traços'
                                    : v === 2 ? 'Vários traços' : '—';
                                return `${v} pontos — ${txt}`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 2,
                        ticks: {
                            stepSize: 1,
                            callback: (v) => v === 0 ? 'Não' : v === 1 ? 'Alguns' : 'Vários'
                        },
                        grid: { color: '#e2e8f0' }
                    },
                    x: {
                        title: { display: true, text: 'Item', color: '#64748b' },
                        grid: { display: false }
                    }
                }
            }
        });
    }

    function renderGraficoPizza() {
        const canvas = document.getElementById('ata-chart-pizza');
        if (!canvas) return;
        if (state.chartPizza) state.chartPizza.destroy();

        const d = state.scores.dist;
        state.chartPizza = new Chart(canvas, {
            type: 'doughnut',
            data: {
                labels: [
                    `Não apresenta (${d.naoApresenta})`,
                    `Apresenta alguns traços (${d.algunsTracos})`,
                    `Apresenta vários traços (${d.variosTracos})`
                ],
                datasets: [{
                    data: [d.naoApresenta, d.algunsTracos, d.variosTracos],
                    backgroundColor: ['#94a3b8', '#eab308', '#dc2626'],
                    borderColor: '#ffffff',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: { color: '#1e293b', padding: 12, font: { size: 12 } }
                    },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => {
                                const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                                const pct = total > 0 ? Math.round((ctx.parsed / total) * 100) : 0;
                                return `${ctx.parsed} itens (${pct}%)`;
                            }
                        }
                    }
                },
                cutout: '50%'
            }
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
            pdf.save(`ATA - ${nomeAbreviado}_${dataStr}.pdf`);

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

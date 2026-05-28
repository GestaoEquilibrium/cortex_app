// ============================================================================
// CORTEX_APP — Resultado ASQ (laudo)
// ============================================================================
// URL: ?aplicacao_id=<uuid>
//
// ASQ — Questionário de Avaliação de Autismo (base SCQ; Rutter, Bailey & Lord 2003)
// 40 itens · Sim/Não · heteroaplicado online (cuidador responde)
//
// COTAÇÃO (validada contra exemplo oficial WPS):
//   - Item 1 é FILTRO, não pontua. Se Sim → soma itens 2-40; se Não → soma 8-40.
//   - Itens que pontuam SIM=1: 3,4,5,6,7,8,10,11,12,13,14,15,16,17,18
//   - Itens que pontuam NÃO=1: 2,9,19,20,21,22,23,24,25,26,27,28,29,30,31,32,
//                              33,34,35,36,37,38,39,40
//   - Cutoff ≥15 = triagem positiva para TEA.
//
// JS recalcula tudo do zero a partir de escores_brutos.respostas (0=Não, 1=Sim)
// (decisão arquitetural B do CORTEX).
// ============================================================================

(function() {
    'use strict';

    const SIGLA_ESPERADA = 'ASQ';
    const PONTO_CORTE = 15;
    const TOTAL_ITENS = 40;

    // Chave de pontuação do SCQ/ASQ. Para cada item, qual resposta vale 1 ponto.
    // (item 1 fica de fora — é filtro)
    const ITENS_SIM_1 = new Set([3,4,5,6,7,8,10,11,12,13,14,15,16,17,18]);
    const ITENS_NAO_1 = new Set([2,9,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40]);

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
        if (!norma) throw new Error('Norma ASQ não cadastrada');
        state.norma = norma;

        const { data: itens } = await window.cortexClient
            .from('instrumentos_itens').select('numero, texto, reverso')
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
    // Respostas cruas: { numero: 0(Não) | 1(Sim) }
    // ============================================================================
    function pontuaItem(numero, valorCru) {
        // valorCru: 0 = Não, 1 = Sim
        const respondeuSim = parseInt(valorCru) === 1;
        if (ITENS_SIM_1.has(numero)) return respondeuSim ? 1 : 0;
        if (ITENS_NAO_1.has(numero)) return respondeuSim ? 0 : 1;
        return 0; // item 1 (filtro) ou fora da chave
    }

    function calcularResultados(correcao) {
        const respostas = (correcao?.escores_brutos || {}).respostas || {};

        // Item 1 decide o range de soma
        const item1Sim = parseInt(respostas[1]) === 1;
        const inicio = item1Sim ? 2 : 8;   // se Não, pula itens 2-7 (linguagem)
        const scoreMax = item1Sim ? 39 : 33;

        let total = 0;
        const itensCriticos = []; // itens que pontuaram (=1)
        for (let n = inicio; n <= TOTAL_ITENS; n++) {
            if (respostas[n] === undefined) continue;
            const p = pontuaItem(n, respostas[n]);
            total += p;
            if (p === 1) itensCriticos.push(n);
        }
        itensCriticos.sort((a, b) => a - b);

        // Distribuição de respostas cruas (pra mostrar Sim/Não)
        const dist = { sim: 0, nao: 0 };
        for (const v of Object.values(respostas)) {
            if (parseInt(v) === 1) dist.sim++;
            else if (parseInt(v) === 0) dist.nao++;
        }

        const classificacao = total >= PONTO_CORTE ? 'sugestivo_tea' : 'nao_sugestivo';
        const respondidos = Object.values(respostas).length;

        return {
            total,
            maxScore: scoreMax,
            item1Sim,
            inicio,
            percentual: scoreMax > 0 ? Math.round((total / scoreMax) * 100) : 0,
            dist,
            itensCriticos,
            classificacao,
            respondidos,
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
                        <h1 class="laudo-header-titulo">Questionário ASQ</h1>
                        <div class="laudo-header-subtitulo">Questionário de Avaliação de Autismo (base SCQ)<br>Rutter, Bailey &amp; Lord · 40 itens · Sim/Não · ponto de corte ≥${PONTO_CORTE}</div>
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
                        <div class="laudo-card-label">Itens que pontuaram</div>
                        <div class="laudo-card-valor">${s.itensCriticos.length}</div>
                    </div>
                </div>

                <div class="laudo-barra-container">
                    <div class="laudo-barra-titulo">Distribuição da pontuação</div>
                    <div class="laudo-barra-fundo">
                        <div class="laudo-barra-cutoff" style="left: ${(PONTO_CORTE / s.maxScore) * 100}%;">
                            <span>corte ${PONTO_CORTE}</span>
                        </div>
                        <div class="laudo-barra-marcador" style="left: ${Math.min((s.total / s.maxScore) * 100, 100)}%; background: ${corClassif};">
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
                    Distribuição das Respostas
                </div>
                <div class="ata-grafico-wrap ata-grafico-pizza">
                    <canvas id="ata-chart-pizza"></canvas>
                </div>

                ${s.itensCriticos.length > 0 ? `
                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">5</span>
                    Itens que Pontuaram
                </div>
                <div class="laudo-caixa-descricao">
                    <p>Os itens a seguir contribuíram para a pontuação total (1 ponto cada), indicando sinais associados ao espectro:</p>
                </div>
                <ul class="ata-itens-criticos">
                    ${s.itensCriticos.map(n => {
                        const item = state.itens.find(i => i.numero === n);
                        return `<li><strong>Item ${n}:</strong> ${escapeHtml(item?.texto || '—')}</li>`;
                    }).join('')}
                </ul>
                ` : ''}

                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">${s.itensCriticos.length > 0 ? 6 : 5}</span>
                    Tabela Completa de Respostas
                </div>
                ${renderTabelaItens()}

            </div>

            <div class="laudo-rodape">
                <div class="laudo-rodape-esq">
                    <div class="laudo-rodape-org">Equilibrium Neuropsicologia</div>
                    <div class="laudo-rodape-tipo">Correção automatizada — ASQ</div>
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
        const obs1 = !s.item1Sim
            ? `<p><em>Observação:</em> como a resposta ao item 1 foi "Não" (criança sem fala em frases), os itens 2 a 7 (referentes à linguagem) não entram na contagem, conforme a regra do instrumento. A soma considerou os itens 8 a 40 (máximo ${s.maxScore}).</p>`
            : '';
        if (s.classificacao === 'sugestivo_tea') {
            return `
                <p>A pontuação total de <strong>${s.total} pontos</strong> está
                <strong>no ou acima do ponto de corte</strong> (≥${PONTO_CORTE}), o que
                <strong>sugere a presença de sinais associados ao Transtorno do Espectro Autista em intensidade que justifica investigação aprofundada</strong>, segundo o relato do cuidador.</p>
                <p>Foram identificados <strong>${s.itensCriticos.length} ${s.itensCriticos.length === 1 ? 'item que pontuou' : 'itens que pontuaram'}</strong>.
                Recomenda-se aprofundamento com instrumentos diagnósticos específicos
                (ADOS-2, ADI-R ou CARS-2) e avaliação clínica complementar. O ASQ é um
                instrumento de triagem e não substitui o diagnóstico clínico.</p>
                ${obs1}
            `;
        }
        return `
            <p>A pontuação total de <strong>${s.total} pontos</strong> está
            <strong>abaixo do ponto de corte</strong> (≥${PONTO_CORTE}),
            <strong>não sugerindo indicativos clinicamente significativos de TEA</strong>
            pela perspectiva do respondente. Um resultado abaixo do corte não exclui
            o diagnóstico — a decisão clínica deve considerar o quadro completo.</p>
            ${obs1}
        `;
    }

    function renderTabelaItens() {
        const respostas = state.correcao?.escores_brutos?.respostas || {};
        const s = state.scores;
        const linhas = state.itens.map(item => {
            const n = item.numero;
            const val = respostas[n];
            const valNum = val !== undefined ? parseInt(val) : null;
            const respLabel = valNum === 1 ? 'Sim' : valNum === 0 ? 'Não' : '—';

            // Item 1 = filtro
            if (n === 1) {
                return `
                    <tr class="linha-filtro">
                        <td class="td-num">${n}</td>
                        <td>${escapeHtml(item.texto)}</td>
                        <td class="td-resposta">${respLabel}</td>
                        <td class="td-label">Filtro (define soma ${s.item1Sim ? '2–40' : '8–40'})</td>
                    </tr>
                `;
            }

            // Itens pulados (2-7 quando item 1 = Não)
            const pulado = n < s.inicio;
            if (pulado) {
                return `
                    <tr class="linha-pulada" style="opacity:0.5;">
                        <td class="td-num">${n}</td>
                        <td>${escapeHtml(item.texto)}</td>
                        <td class="td-resposta">${respLabel}</td>
                        <td class="td-label">Não pontuado (linguagem)</td>
                    </tr>
                `;
            }

            const pontuou = valNum !== null ? pontuaItem(n, valNum) : 0;
            const cor = pontuou === 1 ? '#dc2626' : '#94a3b8';
            return `
                <tr ${pontuou === 1 ? 'class="linha-critica"' : ''}>
                    <td class="td-num">${n}</td>
                    <td>${escapeHtml(item.texto)}</td>
                    <td class="td-resposta" style="color:${cor};font-weight:600;">${respLabel}</td>
                    <td class="td-label" style="color:${cor};font-weight:600;">${pontuou === 1 ? '1 ponto' : '0'}</td>
                </tr>
            `;
        }).join('');

        return `
            <table class="ata-tabela-itens">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Item</th>
                        <th>Resposta</th>
                        <th>Pontuação</th>
                    </tr>
                </thead>
                <tbody>${linhas}</tbody>
            </table>
        `;
    }

    // ============================================================================
    // GRÁFICOS
    // ============================================================================
    function renderGraficoPizza() {
        const canvas = document.getElementById('ata-chart-pizza');
        if (!canvas) return;
        if (state.chartPizza) state.chartPizza.destroy();

        const d = state.scores.dist;
        state.chartPizza = new Chart(canvas, {
            type: 'doughnut',
            data: {
                labels: [
                    `Sim (${d.sim})`,
                    `Não (${d.nao})`
                ],
                datasets: [{
                    data: [d.sim, d.nao],
                    backgroundColor: ['#dc2626', '#94a3b8'],
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
            pdf.save(`ASQ - ${nomeAbreviado}_${dataStr}.pdf`);

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

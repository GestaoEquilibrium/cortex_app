// ============================================================================
// CORTEX_APP — Resultado TIAH/S (Triagem AH/S - laudo)
// ============================================================================
// URL: ?aplicacao_id=<uuid>
//
// Tatiana de Cássia Nakano | Vetor Editora
// 42 itens · 5 áreas · faixa 6-17 anos · heteroaplicado (professor)
//
// JS recalcula tudo do zero a partir de escores_brutos.respostas (decisão B).
//
// Regra de pontuação: apenas valores = 3 ("acima da média") contam.
//   Pontuação bruta por área = contagem(valor=3) × 3
//   Indicativo AH/S por área: bruta ≥ corte da área
//
// Pontos de corte: Intelectual ≥22, Acadêmicas ≥22, Liderança ≥17,
//                  Criatividade ≥19, Talento Artístico ≥17
// ============================================================================

(function() {
    'use strict';

    const SIGLA_ESPERADA = 'TIAH/S';
    const VALOR_ACIMA = 3;  // único valor que pontua

    // Mapa de áreas → metadados, na ordem visual desejada
    const AREAS = [
        { codigo: 'intelectual_geral',      nome: 'Capacidade Intelectual Geral',         qtdItens: 8, corte: 22, maxScore: 24 },
        { codigo: 'academicas_especificas', nome: 'Habilidades Acadêmicas Específicas',   qtdItens: 9, corte: 22, maxScore: 27 },
        { codigo: 'lideranca',              nome: 'Liderança',                            qtdItens: 8, corte: 17, maxScore: 24 },
        { codigo: 'criatividade',           nome: 'Criatividade',                         qtdItens: 8, corte: 19, maxScore: 24 },
        { codigo: 'talento_artistico',      nome: 'Talento Artístico',                    qtdItens: 9, corte: 17, maxScore: 27 }
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
        if (!norma) throw new Error('Norma TIAH/S não cadastrada');
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

        // numero → valor
        const respostaPorNumero = {};
        for (const [k, v] of Object.entries(respostas)) {
            respostaPorNumero[parseInt(k)] = parseInt(v) || 0;
        }

        // Calcula por área
        const porArea = {};
        for (const area of AREAS) {
            porArea[area.codigo] = {
                ...area,
                qtdAcima: 0,
                pontuacaoBruta: 0,
                indicativoAHS: false,
                itensPositivos: []
            };
        }

        for (const item of state.itens) {
            const valor = respostaPorNumero[item.numero] ?? 0;
            const a = porArea[item.fator_codigo];
            if (!a) continue;
            if (valor === VALOR_ACIMA) {
                a.qtdAcima++;
                a.itensPositivos.push({ numero: item.numero, texto: item.texto });
            }
        }

        for (const a of Object.values(porArea)) {
            a.pontuacaoBruta = a.qtdAcima * 3;
            a.indicativoAHS = a.pontuacaoBruta >= a.corte;
        }

        const areasOrdenadas = AREAS.map(a => porArea[a.codigo]);
        const areasComIndicativo = areasOrdenadas.filter(a => a.indicativoAHS);

        let tipoAHS;
        if (areasComIndicativo.length === 0) tipoAHS = 'sem_indicativo';
        else if (areasComIndicativo.length === 1) tipoAHS = 'isolada';
        else tipoAHS = 'combinada';

        const respondidos = Object.keys(respostas).length;

        return {
            areasOrdenadas,
            areasComIndicativo,
            tipoAHS,
            respondidos,
            faltam: state.itens.length - respondidos
        };
    }

    function labelTipoAHS(t) {
        return {
            sem_indicativo: 'Sem indicativo de AH/S',
            isolada:        'AH/S Isolada (1 área)',
            combinada:      'AH/S Combinada (2 ou mais áreas)'
        }[t] || '—';
    }

    function corTipoAHS(t) {
        return t === 'sem_indicativo' ? '#16a34a' : '#dc2626';
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

        const corTipo = corTipoAHS(s.tipoAHS);
        const textoTipo = labelTipoAHS(s.tipoAHS);

        return `
        <div class="laudo">
            <div class="laudo-header">
                <div class="laudo-header-esq">
                    <div class="laudo-header-logo">E</div>
                    <div class="laudo-header-textos">
                        <div class="laudo-header-supratitulo">Relatório de Triagem Educacional</div>
                        <h1 class="laudo-header-titulo">TIAH/S</h1>
                        <div class="laudo-header-subtitulo">Triagem de Indicadores de Altas Habilidades/Superdotação<br>Tatiana de Cássia Nakano · Vetor Editora · 42 itens · 5 áreas</div>
                    </div>
                </div>
                <div class="laudo-header-pontuacao">
                    <div class="laudo-header-pontuacao-label">Áreas com indicativo</div>
                    <div class="laudo-header-pontuacao-valor">${s.areasComIndicativo.length}</div>
                    <div class="laudo-header-pontuacao-max">de 5</div>
                </div>
            </div>

            <div class="laudo-body">

                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">1</span>
                    Identificação
                </div>
                <div class="laudo-identificacao">
                    <div class="laudo-identif-item">
                        <span class="laudo-identif-label">Aluno(a):</span>
                        <span class="laudo-identif-valor">${escapeHtml(p.nome_completo)}</span>
                    </div>
                    <div class="laudo-identif-item">
                        <span class="laudo-identif-label">Idade:</span>
                        <span class="laudo-identif-valor">${idade !== null ? idade + ' anos' : '—'}</span>
                    </div>
                    <div class="laudo-identif-item">
                        <span class="laudo-identif-label">Série:</span>
                        <span class="laudo-identif-valor">${escapeHtml(p.escolaridade_serie || p.escolaridade || '—')}</span>
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
                    Resultado da Triagem
                </div>
                <div class="laudo-cards">
                    <div class="laudo-card ${s.tipoAHS === 'sem_indicativo' ? 'laudo-card-paciente-negativo' : 'laudo-card-paciente-positivo'}">
                        <div class="laudo-card-label">Tipo</div>
                        <div class="laudo-card-valor" style="font-size:18px;">${textoTipo}</div>
                    </div>
                    <div class="laudo-card laudo-card-corte">
                        <div class="laudo-card-label">Áreas com indicativo</div>
                        <div class="laudo-card-valor">${s.areasComIndicativo.length} / 5</div>
                    </div>
                    <div class="laudo-card laudo-card-max">
                        <div class="laudo-card-label">Total de itens "acima"</div>
                        <div class="laudo-card-valor">${s.areasOrdenadas.reduce((a,b) => a + b.qtdAcima, 0)} / 42</div>
                    </div>
                </div>

                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">3</span>
                    Pontuação por Área
                </div>
                <div class="tiahs-grafico-wrap">
                    <canvas id="tiahs-chart-barras"></canvas>
                </div>
                <p class="tiahs-grafico-legenda">
                    <span class="tiahs-leg-item"><span class="tiahs-leg-bola" style="background:#dc2626"></span> Indicativo AH/S</span>
                    <span class="tiahs-leg-item"><span class="tiahs-leg-bola" style="background:#94a3b8"></span> Abaixo do corte</span>
                    <span class="tiahs-leg-item">— — — Linha tracejada: ponto de corte da área</span>
                </p>

                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">4</span>
                    Tabela de Pontuação
                </div>
                ${renderTabelaAreas()}

                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">5</span>
                    Interpretação Clínica
                </div>
                <div class="laudo-caixa-descricao">
                    ${renderInterpretacao()}
                </div>

                ${s.areasComIndicativo.length > 0 ? `
                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">6</span>
                    Comportamentos "Acima da Média" Identificados
                </div>
                ${s.areasComIndicativo.map(a => `
                    <h4 style="margin: 16px 0 8px 0; color: #1e293b;">${escapeHtml(a.nome)} <span style="color:#64748b;font-weight:400;font-size:13px;">(${a.qtdAcima} de ${a.qtdItens} itens)</span></h4>
                    <ul class="tiahs-itens-criticos">
                        ${a.itensPositivos.map(it => `<li><strong>Item ${it.numero}:</strong> ${escapeHtml(it.texto)}</li>`).join('')}
                    </ul>
                `).join('')}
                ` : ''}

            </div>

            <div class="laudo-rodape">
                <div class="laudo-rodape-esq">
                    <div class="laudo-rodape-org">Equilibrium Neuropsicologia</div>
                    <div class="laudo-rodape-tipo">Correção automatizada — TIAH/S</div>
                </div>
                <div class="laudo-rodape-dir">
                    <div class="laudo-rodape-data">Documento gerado em ${formatarDataBR(new Date().toISOString())}</div>
                    <div class="laudo-rodape-confidencial">Instrumento de triagem. O resultado isolado não estabelece diagnóstico.</div>
                </div>
            </div>
        </div>
        `;
    }

    function renderInterpretacao() {
        const s = state.scores;
        if (s.tipoAHS === 'sem_indicativo') {
            return `
                <p>A pontuação obtida em todas as 5 áreas avaliadas ficou <strong>abaixo dos respectivos
                pontos de corte</strong>, não evidenciando indicativos de Altas Habilidades/Superdotação
                pela perspectiva do avaliador educacional no momento da triagem.</p>
                <p>A TIAH/S é uma ferramenta de rastreio inicial e não estabelece diagnóstico.
                Recomenda-se monitoramento contínuo do desempenho do aluno e nova aplicação
                em caso de mudanças significativas.</p>
            `;
        }
        const nomes = s.areasComIndicativo.map(a => a.nome).join(', ');
        return `
            <p>Foram identificados indicativos de AH/S em <strong>${s.areasComIndicativo.length}
            ${s.areasComIndicativo.length === 1 ? 'área' : 'áreas'}</strong>: <strong>${escapeHtml(nomes)}</strong>.</p>
            <p>O tipo de manifestação observado é <strong>${labelTipoAHS(s.tipoAHS)}</strong>.</p>
            <p>A TIAH/S é uma ferramenta de triagem. <strong>Recomenda-se encaminhamento para
            avaliação psicológica abrangente</strong> com instrumentos diagnósticos específicos
            (testes de inteligência, criatividade, motivação) para confirmação dos indicadores
            e elaboração de plano educacional individualizado.</p>
        `;
    }

    function renderTabelaAreas() {
        const linhas = state.scores.areasOrdenadas.map(a => `
            <tr ${a.indicativoAHS ? 'class="linha-critica"' : ''}>
                <td>${escapeHtml(a.nome)}</td>
                <td class="td-resposta">${a.qtdItens}</td>
                <td class="td-resposta">${a.qtdAcima}</td>
                <td class="td-resposta" style="font-weight:700;">${a.pontuacaoBruta}</td>
                <td class="td-resposta">≥ ${a.corte}</td>
                <td class="td-resposta" style="font-weight:700;color:${a.indicativoAHS ? '#dc2626' : '#16a34a'};">${a.indicativoAHS ? 'SIM' : 'NÃO'}</td>
            </tr>
        `).join('');

        return `
            <table class="tiahs-tabela-itens">
                <thead>
                    <tr>
                        <th>Área</th>
                        <th>Itens</th>
                        <th>Acima</th>
                        <th>Bruta (×3)</th>
                        <th>Corte</th>
                        <th>Indicativo</th>
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
        const canvas = document.getElementById('tiahs-chart-barras');
        if (!canvas) return;
        if (state.chartBarras) state.chartBarras.destroy();

        const labels = state.scores.areasOrdenadas.map(a => a.nome);
        const dados = state.scores.areasOrdenadas.map(a => a.pontuacaoBruta);
        const cores = state.scores.areasOrdenadas.map(a => a.indicativoAHS ? '#dc2626' : '#94a3b8');
        const cortes = state.scores.areasOrdenadas.map(a => a.corte);
        const maxScore = Math.max(...state.scores.areasOrdenadas.map(a => a.maxScore));

        state.chartBarras = new Chart(canvas, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'Pontuação bruta',
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
                                const a = state.scores.areasOrdenadas[ctx.dataIndex];
                                return `Bruta ${a.pontuacaoBruta} (corte ≥ ${a.corte}) — ${a.indicativoAHS ? 'INDICATIVO' : 'Abaixo'}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        beginAtZero: true,
                        max: maxScore,
                        ticks: { stepSize: 3 },
                        grid: { color: '#e2e8f0' },
                        title: { display: true, text: 'Pontuação bruta', color: '#64748b' }
                    },
                    y: { grid: { display: false } }
                }
            },
            plugins: [{
                id: 'cortePorArea',
                afterDraw: (chart) => {
                    const xScale = chart.scales.x;
                    const yScale = chart.scales.y;
                    const ctx = chart.ctx;
                    ctx.save();
                    ctx.setLineDash([5, 4]);
                    ctx.lineWidth = 2;
                    ctx.strokeStyle = '#dc2626';
                    state.scores.areasOrdenadas.forEach((a, idx) => {
                        const x = xScale.getPixelForValue(a.corte);
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
            pdf.save(`TIAH-S - ${nomeAbreviado}_${dataStr}.pdf`);

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

// ============================================================================
// CORTEX_APP — Resultado CAT-Q (laudo)
// ============================================================================
// URL: ?aplicacao_id=<uuid>
//
// Reproduz o layout do PDF modelo (Hull et al. 2019, app legado Equilibrium):
//   ① Identificação
//   ② Pontuação Total (banner azul gradiente)
//   ③ Tabela de Resultados (3 subescalas + total com badges)
//   ④ Perfil por Subescalas (gráfico de barras + nome dominante)
//   ⑤ Detalhamento por Subescala (3 cards com barra + descrição)
//   ⑥ Interpretação Clínica (parágrafo automático)
//   ⑦ Considerações Importantes (6 bullets fixos)
//
// Cálculos no banco (publico_finalizar_aplicacao v2):
//   - Aplica reversos (3,12,19,22,24): score = 8 - valor
//   - Soma por subescala e total
//   - Classifica TOTAL em binário (cutoff 100) e cada subescala em 4 faixas
//
// Geração de PDF: html2canvas + jsPDF (mesma técnica do RAADS-R/EQ-15/SCARED).
// ============================================================================

(function() {
    'use strict';

    const SIGLA_ESPERADA = 'CAT-Q';

    const SUBESCALAS_ORDEM = ['COMPENSACAO', 'MASCARAMENTO', 'ASSIMILACAO'];

    const SUB_LABEL = {
        COMPENSACAO:  'Compensação',
        MASCARAMENTO: 'Mascaramento',
        ASSIMILACAO:  'Assimilação',
        TOTAL:        'TOTAL'
    };

    const SUB_MAX = {
        COMPENSACAO: 63, MASCARAMENTO: 49, ASSIMILACAO: 63, TOTAL: 175
    };

    const SUB_MIN = {
        COMPENSACAO: 9, MASCARAMENTO: 7, ASSIMILACAO: 9, TOTAL: 25
    };

    const SUB_ITENS_LISTA = {
        COMPENSACAO:  '1, 4, 5, 8, 11, 14, 17, 20, 23',
        MASCARAMENTO: '2, 6, 7, 10, 15, 18, 21',
        ASSIMILACAO:  '3, 9, 12, 13, 16, 19, 22, 24, 25'
    };

    const SUB_N_ITENS = {
        COMPENSACAO: 9, MASCARAMENTO: 7, ASSIMILACAO: 9
    };

    const SUB_DESC = {
        COMPENSACAO:  'Estratégias aprendidas para compensar dificuldades sociais: copiar comportamentos observados, criar roteiros mentais para interações, estudar regras sociais e preparar tópicos de conversa antecipadamente.',
        MASCARAMENTO: 'Controle ativo e consciente de expressões faciais, linguagem corporal e tom de voz para parecer socialmente "típico", suprimindo comportamentos autênticos.',
        ASSIMILACAO:  'Esforço para se encaixar socialmente, evitar se destacar, necessidade de se misturar ao grupo e sensação de "fingir ser normal" em contextos sociais.'
    };

    const SUB_SLUG_CSS = {
        COMPENSACAO: 'compensacao', MASCARAMENTO: 'mascaramento', ASSIMILACAO: 'assimilacao'
    };

    const state = {
        aplicacaoId: null,
        aplicacao: null,
        paciente: null,
        instrumento: null,
        norma: null,
        itens: [],
        correcao: null,
        scores: null  // {COMPENSACAO, MASCARAMENTO, ASSIMILACAO, TOTAL}
    };

    // ============================================================================
    // INICIALIZAÇÃO
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
            .from('aplicacoes_instrumento')
            .select('*')
            .eq('id', state.aplicacaoId)
            .single();
        if (errA) throw new Error('Aplicação: ' + errA.message);
        state.aplicacao = aplicacao;

        const { data: paciente, error: errP } = await window.cortexClient
            .from('pacientes')
            .select('id, nome_completo, sexo, data_nascimento, cpf')
            .eq('id', aplicacao.paciente_id)
            .single();
        if (errP) throw new Error('Paciente: ' + errP.message);
        state.paciente = paciente;

        const { data: instrumento, error: errI } = await window.cortexClient
            .from('instrumentos_catalogo')
            .select('id, sigla, nome_completo')
            .eq('id', aplicacao.instrumento_id)
            .single();
        if (errI) throw new Error('Instrumento: ' + errI.message);

        if (instrumento.sigla !== SIGLA_ESPERADA) {
            throw new Error(`Esperado ${SIGLA_ESPERADA}, encontrado ${instrumento.sigla}`);
        }
        state.instrumento = instrumento;

        const { data: norma, error: errN } = await window.cortexClient
            .from('instrumentos_normas')
            .select('*')
            .eq('instrumento_id', instrumento.id)
            .eq('ativa', true)
            .maybeSingle();
        if (errN) throw new Error('Norma: ' + errN.message);
        if (!norma) throw new Error('Norma CAT-Q não cadastrada');
        state.norma = norma;

        const { data: itens } = await window.cortexClient
            .from('instrumentos_itens')
            .select('numero, texto, reverso, fator_id')
            .eq('norma_id', norma.id)
            .order('numero');
        state.itens = itens || [];

        const { data: correcao, error: errC } = await window.cortexClient
            .from('correcoes')
            .select('*')
            .eq('aplicacao_id', state.aplicacaoId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        if (errC) throw new Error('Correção: ' + errC.message);
        if (!correcao) throw new Error('Nenhuma correção encontrada');
        state.correcao = correcao;

        state.scores = extrairScores(correcao);

        await CortexAudit.log('leitura', 'correcoes', correcao.id, {
            detalhes: { aplicacaoId: state.aplicacaoId, sigla: SIGLA_ESPERADA }
        });
    }

    function extrairScores(correcao) {
        const escoresBrutos = correcao?.escores_brutos || {};
        const fatores = escoresBrutos.fatores || {};
        const scores = {};
        for (const code of [...SUBESCALAS_ORDEM, 'TOTAL']) {
            const dado = fatores[code];
            if (dado && typeof dado.score === 'number') {
                scores[code] = dado.score;
            } else if (code === 'TOTAL' && typeof escoresBrutos.score_total === 'number') {
                scores[code] = escoresBrutos.score_total;
            } else {
                scores[code] = null;
            }
        }
        return scores;
    }

    // ============================================================================
    // CLASSIFICAÇÃO (replica a lógica do banco em JS pra renderizar badges)
    // ============================================================================

    function classifSubescala(score, fatorCodigo) {
        if (score == null) return null;
        const max = SUB_MAX[fatorCodigo];
        const pct = (score / max) * 100;
        if (pct >= 70) return { label: 'Muito Elevado', slug: 'mt-elevado' };
        if (pct >= 50) return { label: 'Elevado',       slug: 'elevado' };
        if (pct >= 30) return { label: 'Moderado',      slug: 'moderado' };
        return { label: 'Baixo', slug: 'baixo' };
    }

    function classifTotal(score) {
        if (score == null) return null;
        return score > 100
            ? { label: 'Camuflagem Significativa', slug: 'camuflagem' }
            : { label: 'Faixa Típica',             slug: 'tipica' };
    }

    function dominante(scores) {
        let max = -1, code = null;
        for (const c of SUBESCALAS_ORDEM) {
            if (scores[c] == null) continue;
            const pct = (scores[c] / SUB_MAX[c]) * 100;
            if (pct > max) { max = pct; code = c; }
        }
        return code;
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
    }

    function renderLaudo() {
        const idade = calcularIdade(state.paciente.data_nascimento, state.aplicacao.data_aplicacao);
        const dataApl = state.aplicacao.data_aplicacao || state.aplicacao.created_at;
        const dataExtenso = formatarDataExtenso(dataApl);
        const nascStr = state.paciente.data_nascimento
            ? formatarDataBR(state.paciente.data_nascimento) : '—';

        const total = state.scores.TOTAL;
        const totalMax = SUB_MAX.TOTAL;
        const pctTotal = total != null ? (total / totalMax * 100).toFixed(1) : '—';
        const classifTot = classifTotal(total);
        const dominanteCode = dominante(state.scores);

        return `
        <div class="laudo">
            <!-- ─── CABEÇALHO ─── -->
            <div class="laudo-header">
                <div class="laudo-header-esq">
                    <div class="laudo-header-logo">E</div>
                    <div class="laudo-header-textos">
                        <div class="laudo-header-supratitulo">Relatório Neuropsicológico</div>
                        <h1 class="laudo-header-titulo">CAT-Q</h1>
                        <div class="laudo-header-subtitulo">
                            Camouflaging Autistic Traits Questionnaire<br>
                            Hull et al. (2019) — 25 itens, 3 subescalas
                        </div>
                    </div>
                </div>
                <div class="laudo-header-pontuacao">
                    <div class="laudo-header-pontuacao-label">Pontuação Total</div>
                    <div class="laudo-header-pontuacao-valor">${total ?? '—'}/${totalMax}</div>
                    ${classifTot ? `<div class="catq-header-pontuacao-classif">${classifTot.label}</div>` : ''}
                </div>
            </div>

            <div class="laudo-body">

                <!-- ① Identificação -->
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
                        <span class="laudo-identif-label">Nascimento:</span>
                        <span class="laudo-identif-valor">${nascStr}</span>
                    </div>
                    <div class="laudo-identif-item">
                        <span class="laudo-identif-label">Avaliação:</span>
                        <span class="laudo-identif-valor">${dataExtenso}</span>
                    </div>
                </div>

                <!-- ② Pontuação Total -->
                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">2</span>
                    Pontuação Total
                </div>
                ${renderBannerTotal(total, totalMax, pctTotal, classifTot)}

                <!-- ③ Tabela de Resultados -->
                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">3</span>
                    Tabela de Resultados
                </div>
                ${renderTabelaResultados()}

                <!-- ④ Perfil por Subescalas -->
                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">4</span>
                    Perfil por Subescalas
                </div>
                ${renderPerfil(dominanteCode)}

                <!-- ⑤ Detalhamento por Subescala -->
                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">5</span>
                    Detalhamento por Subescala
                </div>
                ${SUBESCALAS_ORDEM.map(renderDetalheCard).join('')}

                <!-- ⑥ Interpretação Clínica -->
                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">6</span>
                    Interpretação Clínica
                </div>
                <div class="laudo-caixa-descricao">
                    ${renderInterpretacao(total)}
                </div>

                <!-- ⑦ Considerações Importantes -->
                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">7</span>
                    Considerações Importantes
                </div>
                <div class="catq-consideracoes">
                    <ul>
                        <li>O CAT-Q <strong>não</strong> é um instrumento diagnóstico de TEA; mede especificamente estratégias de camuflagem/masking.</li>
                        <li>Pontuações elevadas podem ocorrer em outras condições (ansiedade social, TDAH, alta sensibilidade).</li>
                        <li>Camuflagem intensa pode mascarar características autistas, levando a diagnósticos tardios ou incorretos.</li>
                        <li>Masking prolongado está associado a maior risco de ansiedade, depressão, esgotamento e crises autísticas.</li>
                        <li>Intervenções devem focar em bem-estar e qualidade de vida, não em "normalização".</li>
                        <li>Deve ser interpretado no contexto clínico amplo, nunca isoladamente.</li>
                    </ul>
                </div>

                ${renderDetalhes()}

            </div>

            <!-- ─── RODAPÉ ─── -->
            <div class="laudo-rodape">
                <div class="laudo-rodape-esq">
                    <div class="laudo-rodape-org">Equilibrium Neuropsicologia</div>
                    <div class="laudo-rodape-tipo">Correção automatizada — CAT-Q</div>
                </div>
                <div class="laudo-rodape-dir">
                    <div class="laudo-rodape-data">Documento gerado em ${formatarDataBR(new Date().toISOString())}</div>
                    <div class="laudo-rodape-confidencial">Este documento é confidencial e destinado exclusivamente ao profissional solicitante.</div>
                </div>
            </div>
        </div>
        `;
    }

    function renderBannerTotal(total, totalMax, pctTotal, classifTot) {
        return `
            <div class="catq-total-banner">
                <div class="catq-total-banner-esq">
                    <div class="catq-total-banner-label">Pontuação Total</div>
                    <div class="catq-total-banner-valor">
                        ${total ?? '—'}<span class="max"> / ${totalMax}</span>
                    </div>
                    <div class="catq-total-banner-pct">${pctTotal}% da pontuação máxima</div>
                </div>
                <div class="catq-total-banner-dir">
                    ${classifTot ? `<div class="catq-total-banner-classif">${classifTot.label}</div>` : ''}
                    <div class="catq-total-banner-cutoff">Ponto de corte clínico: > 100</div>
                </div>
            </div>
        `;
    }

    function renderTabelaResultados() {
        const linhasSub = SUBESCALAS_ORDEM.map(code => {
            const score = state.scores[code];
            const max = SUB_MAX[code];
            const pct = score != null ? ((score / max) * 100).toFixed(1) + '%' : '—';
            const classif = classifSubescala(score, code);
            const slug = SUB_SLUG_CSS[code];
            const badge = classif
                ? `<span class="catq-badge catq-badge-${classif.slug}">${classif.label}</span>`
                : '—';
            return `<tr>
                <td><span class="nome-sub nome-sub-${slug}">${SUB_LABEL[code]}</span></td>
                <td class="ctr">${score ?? '—'}</td>
                <td class="ctr">${max}</td>
                <td class="ctr">${pct}</td>
                <td class="ctr">${badge}</td>
            </tr>`;
        }).join('');

        const total = state.scores.TOTAL;
        const totalMax = SUB_MAX.TOTAL;
        const pctTotal = total != null ? ((total / totalMax) * 100).toFixed(1) + '%' : '—';
        const classifTot = classifTotal(total);
        const badgeTot = classifTot
            ? `<span class="catq-badge catq-badge-${classifTot.slug}">${classifTot.label}</span>`
            : '—';

        return `
            <div class="catq-tab-resultados">
                <table>
                    <thead>
                        <tr>
                            <th>Subescala</th>
                            <th class="ctr">Bruto</th>
                            <th class="ctr">Máximo</th>
                            <th class="ctr">Percentual</th>
                            <th class="ctr">Classificação</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${linhasSub}
                        <tr class="linha-total">
                            <td>TOTAL</td>
                            <td class="ctr">${total ?? '—'}</td>
                            <td class="ctr">${totalMax}</td>
                            <td class="ctr">${pctTotal}</td>
                            <td class="ctr">${badgeTot}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        `;
    }

    function renderPerfil(dominanteCode) {
        const nomeDominante = dominanteCode ? SUB_LABEL[dominanteCode] : '—';

        const barras = SUBESCALAS_ORDEM.map(code => {
            const score = state.scores[code];
            const max = SUB_MAX[code];
            if (score == null) {
                return `<div class="catq-perfil-barra">
                    <div class="catq-perfil-barra-label">${SUB_LABEL[code]}</div>
                    <div class="catq-perfil-barra-trilho"></div>
                    <div class="catq-perfil-barra-pct">—</div>
                </div>`;
            }
            const pct = (score / max) * 100;
            const slug = SUB_SLUG_CSS[code];
            return `<div class="catq-perfil-barra">
                <div class="catq-perfil-barra-label">${SUB_LABEL[code]}</div>
                <div class="catq-perfil-barra-trilho">
                    <div class="catq-perfil-barra-fill catq-perfil-barra-fill-${slug}"
                         style="width: ${pct.toFixed(1)}%;"></div>
                </div>
                <div class="catq-perfil-barra-pct">${pct.toFixed(0)}%</div>
            </div>`;
        }).join('');

        return `
            <div class="catq-perfil">
                <div class="catq-perfil-dominante">
                    <div class="catq-perfil-dominante-label">Subescala dominante</div>
                    <div class="catq-perfil-dominante-nome">${nomeDominante}</div>
                </div>
                <div class="catq-perfil-grafico">
                    ${barras}
                </div>
            </div>
        `;
    }

    function renderDetalheCard(code) {
        const score = state.scores[code];
        const max = SUB_MAX[code];
        const pct = score != null ? ((score / max) * 100).toFixed(1) : '—';
        const classif = classifSubescala(score, code);
        const slug = SUB_SLUG_CSS[code];
        const badge = classif
            ? `<span class="catq-badge catq-badge-${classif.slug}">${classif.label}</span>`
            : '—';

        return `
            <div class="catq-detalhe-card catq-detalhe-card-${slug}">
                <div class="catq-detalhe-header">
                    <div>
                        <span class="catq-detalhe-titulo catq-detalhe-titulo-${slug}">${SUB_LABEL[code]}</span>
                        <span class="catq-detalhe-itens-meta">(${SUB_N_ITENS[code]} itens: ${SUB_ITENS_LISTA[code]})</span>
                    </div>
                    ${badge}
                </div>
                <div class="catq-detalhe-pontuacao">
                    ${score ?? '—'} / ${max}
                    <span class="pct">(${pct}%)</span>
                </div>
                <div class="catq-detalhe-progresso">
                    <div class="catq-detalhe-progresso-fill catq-perfil-barra-fill-${slug}"
                         style="width: ${score != null ? (score / max * 100).toFixed(1) : 0}%;"></div>
                </div>
                <div class="catq-detalhe-descricao">${SUB_DESC[code]}</div>
            </div>
        `;
    }

    function renderInterpretacao(total) {
        if (total == null) {
            return `<p>Pontuação total não disponível para interpretação.</p>`;
        }
        if (total > 100) {
            return `<p>A pontuação total acima do ponto de corte clínico (>100) sugere presença <strong>significativa</strong> de comportamentos de camuflagem social (masking). Isso indica que o avaliado investe considerável energia cognitiva e emocional em estratégias de adaptação social. A combinação das três dimensões avaliadas aponta para um estilo de funcionamento social caracterizado por esforço consciente, monitoramento constante e possível discrepância entre a experiência interna e a apresentação externa. Este padrão pode estar associado a fadiga social, necessidade de períodos de recuperação após interações e potencial risco de burnout autístico.</p>`;
        }
        return `<p>A pontuação total dentro da faixa típica (≤100) sugere que o avaliado tende a experienciar interações sociais de forma relativamente mais natural, com menor necessidade de estratégias compensatórias intensivas. No entanto, a análise qualitativa das subescalas individuais oferece informações importantes sobre aspectos específicos do funcionamento social que podem beneficiar de suporte ou intervenção direcionada.</p>`;
    }

    function renderDetalhes() {
        if (!state.itens.length) return '';

        const labels = state.norma?.answer_labels || [];
        const respostas = state.correcao?.escores_brutos?.respostas || {};

        // Mapa de fator_id pra código (usando os itens que já vieram com fator_id)
        // Como temos o mapeamento posicional fixo, podemos reconstruir do número:
        const numeroParaCodigo = {};
        const compensacao  = [1, 4, 5, 8, 11, 14, 17, 20, 23];
        const mascaramento = [2, 6, 7, 10, 15, 18, 21];
        const assimilacao  = [3, 9, 12, 13, 16, 19, 22, 24, 25];
        compensacao.forEach(n => numeroParaCodigo[n] = 'COMPENSACAO');
        mascaramento.forEach(n => numeroParaCodigo[n] = 'MASCARAMENTO');
        assimilacao.forEach(n => numeroParaCodigo[n] = 'ASSIMILACAO');

        const linhas = state.itens.map(item => {
            const codigo = numeroParaCodigo[item.numero] || '—';
            const subLabel = SUB_LABEL[codigo] || '';
            const valor = respostas[item.numero];
            const labelTxt = (valor !== undefined && labels[valor - 1] !== undefined)
                ? labels[valor - 1] : '—';
            const reverso = item.reverso ? ' <span style="color:#dc2626;font-size:10px;">⇄ REVERSO</span>' : '';

            return `<tr>
                <td style="text-align:center;font-weight:700;color:#1e40af;">${item.numero}</td>
                <td>${escapeHtml(item.texto)}${reverso}</td>
                <td style="font-size:10px;color:#64748b;">${subLabel}</td>
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
                            <th>Subescala</th>
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
        const textoOriginal = btn.textContent;
        btn.disabled = true;
        btn.textContent = '⏳ Gerando PDF...';

        try {
            document.body.classList.add('exportando');
            await new Promise(r => setTimeout(r, 100));

            const laudo = document.querySelector('.laudo');
            if (!laudo) throw new Error('Laudo não encontrado');

            const canvas = await html2canvas(laudo, {
                scale: 2,
                backgroundColor: '#ffffff',
                useCORS: true,
                logging: false
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
            const total = state.scores.TOTAL ?? 0;
            const dataStr = formatarDataArquivo(new Date());
            const nomeArquivo = `CAT-Q - ${nomeAbreviado}_${dataStr}_${total}pts.pdf`;

            pdf.save(nomeArquivo);
            window.CortexUI.toast('PDF gerado com sucesso', 'success');
        } catch (err) {
            console.error('Erro ao gerar PDF:', err);
            window.CortexUI.toast('Erro ao gerar PDF: ' + err.message, 'danger');
        } finally {
            document.body.classList.remove('exportando');
            btn.disabled = false;
            btn.textContent = textoOriginal;
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

    function formatarDataExtenso(iso) {
        if (!iso) return '—';
        const d = iso.includes('T') ? new Date(iso) : new Date(iso + 'T00:00:00');
        return d.toLocaleDateString('pt-BR');  // PDF mostra DD/MM/YYYY simples
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

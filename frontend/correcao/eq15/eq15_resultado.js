// ============================================================================
// CORTEX_APP — Resultado EQ-15 (visualização + geração de PDF)
// ============================================================================
// URL: ?aplicacao_id=<uuid>
//
// Carrega:
//   - Aplicação + paciente + instrumento (sigla EQ-15)
//   - Norma ativa (versao_codigo eq15_br)
//   - Itens (15) e fatores (EMP_COG, HAB_SOC, REAT_EMO + TOTAL)
//   - Correção: escores_brutos.score_total, escores_brutos.fatores,
//     escores_brutos.respostas, classificacoes.total
//
// Layout (diverge do RAADS-R por ser multifator):
//   1. Identificação
//   2. Sobre o Instrumento
//   3. Resultados:
//      - Card grande do score total (cor da classificação)
//      - 3 cards de fatores compactos
//      - Gráfico de barras horizontais (3 fatores + médias de referência)
//      - Barra horizontal do total (4 faixas coloridas)
//   4. Interpretação (texto adaptado por faixa)
//   5. Detalhamento item-a-item (colapsável)
//
// Médias de referência (Gouveia et al., 2012):
//   EMP_COG  → 13.8
//   HAB_SOC  → 9.8
//   REAT_EMO → 10.5
//
// Geração de PDF: html2canvas + jsPDF (mesma técnica do RAADS-R)
// ============================================================================

(function() {
    'use strict';

    const SIGLA_ESPERADA = 'EQ-15';
    const VERSAO_ESPERADA = 'eq15_br';

    // Médias de referência da população normativa brasileira
    // (Gouveia et al., 2012 — fonte primária do seed)
    const REF_MEAN = {
        EMP_COG:  13.8,
        HAB_SOC:   9.8,
        REAT_EMO: 10.5
    };

    // Cores das classificações (idênticas ao seed/CSS)
    const CLASSIF_CORES = {
        'Baixa':       'baixa',
        'Média':       'media',
        'Alta':        'alta',
        'Muito Alta':  'muito-alta'
    };

    const state = {
        aplicacaoId: null,
        aplicacao: null,
        paciente: null,
        instrumento: null,
        norma: null,
        correcao: null,
        respostas: {},
        itens: [],
        fatores: []  // pra mapear código → label/cor
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
        // 1. Aplicação
        const { data: aplicacao, error: errA } = await window.cortexClient
            .from('aplicacoes_instrumento')
            .select('*')
            .eq('id', state.aplicacaoId)
            .single();
        if (errA) throw new Error('Aplicação: ' + errA.message);
        state.aplicacao = aplicacao;

        // 2. Paciente
        const { data: paciente, error: errP } = await window.cortexClient
            .from('pacientes')
            .select('id, nome_completo, sexo, data_nascimento, cpf')
            .eq('id', aplicacao.paciente_id)
            .single();
        if (errP) throw new Error('Paciente: ' + errP.message);
        state.paciente = paciente;

        // 3. Instrumento
        const { data: instrumento, error: errI } = await window.cortexClient
            .from('instrumentos_catalogo')
            .select('id, sigla, nome_completo')
            .eq('id', aplicacao.instrumento_id)
            .single();
        if (errI) throw new Error('Instrumento: ' + errI.message);
        state.instrumento = instrumento;

        if (instrumento.sigla !== SIGLA_ESPERADA) {
            throw new Error(`Esperado ${SIGLA_ESPERADA}, encontrado ${instrumento.sigla}`);
        }

        // 4. Norma
        const { data: norma, error: errN } = await window.cortexClient
            .from('instrumentos_normas')
            .select('*')
            .eq('versao_codigo', VERSAO_ESPERADA)
            .eq('instrumento_id', instrumento.id)
            .eq('ativa', true)
            .maybeSingle();
        if (errN) throw new Error('Norma: ' + errN.message);
        if (!norma) throw new Error('Norma EQ-15 não cadastrada');
        state.norma = norma;

        // 5. Itens (pra detalhamento)
        const { data: itens } = await window.cortexClient
            .from('instrumentos_itens')
            .select('numero, texto, reverso')
            .eq('norma_id', norma.id)
            .order('numero');
        state.itens = itens || [];

        // 6. Fatores (pra label/cor — mesmo a função do banco já tendo enviado)
        const { data: fatores } = await window.cortexClient
            .from('instrumentos_fatores')
            .select('fator_codigo, fator_label, ordem, max_score, eh_total')
            .eq('norma_id', norma.id)
            .eq('eh_total', false)
            .order('ordem');
        state.fatores = fatores || [];

        // 7. Correção
        const { data: correcao, error: errC } = await window.cortexClient
            .from('correcoes')
            .select('*')
            .eq('aplicacao_id', state.aplicacaoId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        if (errC) throw new Error('Correção: ' + errC.message);
        if (!correcao) {
            throw new Error('Nenhuma correção encontrada para esta aplicação');
        }
        state.correcao = correcao;

        // Extrai respostas
        const escoresBrutos = correcao.escores_brutos || {};
        state.respostas = escoresBrutos.respostas || {};

        await CortexAudit.log('leitura', 'correcoes', correcao.id, {
            detalhes: { aplicacaoId: state.aplicacaoId }
        });
    }

    // ============================================================================
    // RENDERIZAÇÃO DO LAUDO
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
        const escoresBrutos = state.correcao.escores_brutos || {};
        const score = parseInt(escoresBrutos.score_total || 0);
        const max = parseInt(escoresBrutos.score_max || state.norma.score_max || 60);
        const classifLabel = state.correcao.classificacoes?.total || '—';
        const classifSlug = CLASSIF_CORES[classifLabel] || 'baixa';

        // fatores: { EMP_COG: {codigo, label, score}, HAB_SOC: {...}, REAT_EMO: {...} }
        const fatoresGravados = escoresBrutos.fatores || {};

        // Identificação
        const idade = calcularIdade(state.paciente.data_nascimento);
        const dataAplStr = state.aplicacao.data_aplicacao
            ? formatarDataExtenso(state.aplicacao.data_aplicacao)
            : '—';
        const nascStr = state.paciente.data_nascimento
            ? formatarDataBR(state.paciente.data_nascimento)
            : '—';

        // Posição do marcador na barra do total (0..60 → 0..100%)
        const pctTotalMarcador = Math.max(0, Math.min(100, (score / 60) * 100));

        // Texto interpretativo conforme faixa
        const interpretacao = montarInterpretacao(score, classifLabel, fatoresGravados);

        return `
        <div class="laudo">

            <!-- ─── CABEÇALHO AZUL ─── -->
            <div class="laudo-header">
                <div class="laudo-header-esq">
                    <div class="laudo-header-logo">E</div>
                    <div class="laudo-header-textos">
                        <div class="laudo-header-supratitulo">Relatório Neuropsicológico</div>
                        <h1 class="laudo-header-titulo">EQ-15 (Esc. Cambridge)</h1>
                        <div class="laudo-header-subtitulo">
                            Escala de Empatia de Cambridge — versão brasileira reduzida<br>
                            Gouveia et al. (2012)
                        </div>
                    </div>
                </div>
                <div class="laudo-header-pontuacao">
                    <div class="laudo-header-pontuacao-label">Empatia Total</div>
                    <div class="laudo-header-pontuacao-valor">${score}</div>
                    <div class="laudo-header-pontuacao-max">de ${max} pontos</div>
                </div>
            </div>

            <!-- ─── CORPO ─── -->
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
                        <span class="laudo-identif-label">CPF:</span>
                        <span class="laudo-identif-valor">${escapeHtml(state.paciente.cpf || '—')}</span>
                    </div>
                    <div class="laudo-identif-item">
                        <span class="laudo-identif-label">Nascimento:</span>
                        <span class="laudo-identif-valor">${nascStr}${idade !== null ? ` (${idade} anos)` : ''}</span>
                    </div>
                    <div class="laudo-identif-item">
                        <span class="laudo-identif-label">Avaliação:</span>
                        <span class="laudo-identif-valor">${dataAplStr}</span>
                    </div>
                    <div class="laudo-identif-item">
                        <span class="laudo-identif-label">Respondente:</span>
                        <span class="laudo-identif-valor">A própria</span>
                    </div>
                    <div class="laudo-identif-item">
                        <span class="laudo-identif-label">Modalidade:</span>
                        <span class="laudo-identif-valor">${state.aplicacao.modalidade === 'online' ? 'Online (link)' : 'Presencial'}</span>
                    </div>
                </div>

                <!-- ② Sobre o Instrumento -->
                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">2</span>
                    Sobre o Instrumento
                </div>
                <div class="laudo-caixa-descricao">
                    <p>A <strong>Escala de Empatia de Cambridge — EQ-15</strong> é a versão brasileira reduzida da Cambridge Behavior Scale, validada por Gouveia e colaboradores (2012). Avalia a empatia disposicional em adultos a partir de 15 itens distribuídos em três fatores: <strong>Empatia Cognitiva</strong> (capacidade de identificar e compreender estados mentais alheios), <strong>Habilidades Sociais</strong> (desenvoltura em situações interpessoais) e <strong>Reatividade Emocional</strong> (sintonia afetiva diante das experiências do outro).</p>
                    <p>O escore total varia de 0 a 60 pontos. Pontuações mais altas indicam maior empatia disposicional. O instrumento é frequentemente utilizado como medida complementar em avaliações que investigam características do espectro autista, mas não constitui ferramenta diagnóstica isolada.</p>
                </div>

                <!-- ③ Resultados Obtidos -->
                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">3</span>
                    Resultados Obtidos
                </div>

                <!-- Card grande do total (cor pela classificação) -->
                <div class="laudo-card-total laudo-card-total-classif-${classifSlug}">
                    <div class="laudo-card-total-grid">
                        <div class="laudo-card-total-bloco">
                            <div class="laudo-card-total-label">Score Total</div>
                            <div class="laudo-card-total-valor laudo-card-total-valor-grande">${score}</div>
                            <div class="laudo-card-total-label" style="margin-top:6px;">de ${max}</div>
                        </div>
                        <div class="laudo-card-total-bloco">
                            <div class="laudo-card-total-label">Classificação</div>
                            <div class="laudo-card-total-classificacao">${escapeHtml(classifLabel)}</div>
                        </div>
                        <div class="laudo-card-total-bloco">
                            <div class="laudo-card-total-label">Ponto de Corte Clínico</div>
                            <div class="laudo-card-total-valor">30</div>
                            <div class="laudo-card-total-label" style="margin-top:6px;">
                                ${score >= 30 ? '✓ Acima do corte' : '↓ Abaixo do corte'}
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Barra horizontal do total com 4 faixas coloridas -->
                <div class="laudo-barra-container">
                    <div class="laudo-barra-titulo">Pontuação total nas 4 faixas de classificação</div>
                    <div class="laudo-barra-total-fundo">
                        <div class="laudo-barra-total-marcador" style="left: ${pctTotalMarcador}%;">
                            ${score}
                        </div>
                    </div>
                    <div class="laudo-barra-total-faixas">
                        <span>Baixa<br>0–25</span>
                        <span>Média<br>26–39</span>
                        <span>Alta<br>40–50</span>
                        <span>Muito Alta<br>51–60</span>
                    </div>
                </div>

                <!-- 3 cards compactos de fatores -->
                <div class="laudo-fatores-cards" style="margin-top:18px;">
                    ${renderCardsFatores(fatoresGravados)}
                </div>

                <!-- Gráfico de barras horizontais dos 3 fatores -->
                <div class="laudo-grafico-fatores">
                    <div class="laudo-grafico-titulo">Pontuação por fator (paciente vs média de referência)</div>
                    ${renderGraficoFatores(fatoresGravados)}
                    <div class="laudo-grafico-legenda">
                        <div class="laudo-grafico-legenda-item">
                            <span class="laudo-grafico-legenda-marker"></span>
                            Média de referência (Gouveia et al., 2012)
                        </div>
                    </div>
                </div>

                <!-- ④ Interpretação -->
                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">4</span>
                    Classificação: ${escapeHtml(classifLabel)}
                </div>
                <div class="laudo-caixa-descricao">
                    ${interpretacao}
                </div>

                ${renderDetalhes()}

            </div>

            <!-- ─── RODAPÉ ─── -->
            <div class="laudo-rodape">
                <div class="laudo-rodape-esq">
                    <div class="laudo-rodape-org">Equilibrium Neuropsicologia</div>
                    <div class="laudo-rodape-tipo">Correção automatizada — EQ-15 (Escala de Empatia de Cambridge)</div>
                </div>
                <div class="laudo-rodape-dir">
                    <div class="laudo-rodape-data">Documento gerado em ${formatarDataBR(new Date().toISOString())}</div>
                    <div class="laudo-rodape-confidencial">Este documento é confidencial e destinado exclusivamente ao profissional solicitante.</div>
                </div>
            </div>

        </div>
        `;
    }

    function renderCardsFatores(fatoresGravados) {
        if (!state.fatores.length) return '';

        return state.fatores.map(f => {
            const dadosFator = fatoresGravados[f.fator_codigo] || {};
            const score = parseInt(dadosFator.score || 0);
            const maxFator = parseInt(f.max_score || 20);
            const ref = REF_MEAN[f.fator_codigo];
            const slug = f.fator_codigo.toLowerCase();

            return `
                <div class="laudo-fator-card laudo-fator-card-${slug}">
                    <div class="laudo-fator-card-titulo">${escapeHtml(f.fator_label)}</div>
                    <div class="laudo-fator-card-score">${score}</div>
                    <div class="laudo-fator-card-max">de ${maxFator}</div>
                    ${ref !== undefined ? `
                        <div class="laudo-fator-card-ref">
                            Média de referência: <strong>${ref.toFixed(1)}</strong>
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');
    }

    function renderGraficoFatores(fatoresGravados) {
        if (!state.fatores.length) return '';

        return state.fatores.map(f => {
            const dadosFator = fatoresGravados[f.fator_codigo] || {};
            const score = parseInt(dadosFator.score || 0);
            const maxFator = parseInt(f.max_score || 20);
            const ref = REF_MEAN[f.fator_codigo];

            // Barra do paciente: % do max do fator (cap em 5..100 pra ser sempre visível)
            const pctScore = Math.max(2, Math.min(100, (score / maxFator) * 100));

            // Marcador da média de referência: % do max do fator
            const pctRef = ref !== undefined
                ? Math.max(0, Math.min(100, (ref / maxFator) * 100))
                : null;

            const slug = f.fator_codigo.toLowerCase();

            return `
                <div class="laudo-grafico-linha">
                    <div class="laudo-grafico-label">${escapeHtml(f.fator_label)}</div>
                    <div class="laudo-grafico-trilho">
                        <div class="laudo-grafico-fill laudo-grafico-fill-${slug}"
                             style="width: ${pctScore}%;"></div>
                        ${pctRef !== null ? `
                            <div class="laudo-grafico-ref-label" style="left: ${pctRef}%;">
                                ref ${ref.toFixed(1)}
                            </div>
                            <div class="laudo-grafico-ref-marker" style="left: ${pctRef}%;"></div>
                        ` : ''}
                    </div>
                    <div class="laudo-grafico-valor">
                        ${score}<span class="laudo-grafico-valor-max"> /${maxFator}</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    function montarInterpretacao(score, classifLabel, fatoresGravados) {
        // Texto interpretativo baseado na faixa de classificação
        let textoBase;
        switch (classifLabel) {
            case 'Baixa':
                textoBase = `<p>A pontuação de <strong>${score} pontos</strong> situa-se na faixa <strong>Baixa</strong> de empatia disposicional (0–25). Este resultado está abaixo do ponto de corte clínico de 30 pontos e indica que a respondente reporta menor frequência de comportamentos e experiências empáticos em relação à média da população normativa brasileira (Gouveia et al., 2012). Pontuações nesta faixa podem ser observadas em perfis com características do Espectro Autista, mas não constituem critério diagnóstico isolado.</p>`;
                break;
            case 'Média':
                textoBase = `<p>A pontuação de <strong>${score} pontos</strong> situa-se na faixa <strong>Média</strong> de empatia disposicional (26–39). O resultado é compatível com a média da população normativa brasileira (Gouveia et al., 2012) e não sugere alterações clinicamente significativas no construto de empatia.</p>`;
                break;
            case 'Alta':
                textoBase = `<p>A pontuação de <strong>${score} pontos</strong> situa-se na faixa <strong>Alta</strong> de empatia disposicional (40–50). Indica que a respondente reporta maior frequência de comportamentos e experiências empáticos em relação à média da população normativa brasileira (Gouveia et al., 2012).</p>`;
                break;
            case 'Muito Alta':
                textoBase = `<p>A pontuação de <strong>${score} pontos</strong> situa-se na faixa <strong>Muito Alta</strong> de empatia disposicional (51–60). Indica que a respondente reporta frequência substancialmente acima da média de comportamentos e experiências empáticos em relação à população normativa brasileira (Gouveia et al., 2012).</p>`;
                break;
            default:
                textoBase = `<p>A pontuação de <strong>${score} pontos</strong> foi obtida no instrumento EQ-15.</p>`;
        }

        // Análise por fator (compara com média de referência)
        const linhasFatores = state.fatores.map(f => {
            const dadosFator = fatoresGravados[f.fator_codigo] || {};
            const scoreFat = parseInt(dadosFator.score || 0);
            const ref = REF_MEAN[f.fator_codigo];
            if (ref === undefined) return null;

            const diff = scoreFat - ref;
            let qualif;
            if (Math.abs(diff) < 1.5) {
                qualif = 'compatível com a média';
            } else if (diff < 0) {
                qualif = `<strong>abaixo</strong> da média (Δ ${diff.toFixed(1)})`;
            } else {
                qualif = `<strong>acima</strong> da média (Δ +${diff.toFixed(1)})`;
            }
            return `<li><strong>${escapeHtml(f.fator_label)}</strong>: ${scoreFat} pts — ${qualif} (referência: ${ref.toFixed(1)}).</li>`;
        }).filter(Boolean).join('');

        const blocoFatores = linhasFatores
            ? `<p style="margin-top:8px;"><strong>Análise por fator:</strong></p>
               <ul style="margin:6px 0 0 18px;padding:0;list-style:disc;">${linhasFatores}</ul>`
            : '';

        return textoBase + blocoFatores;
    }

    function renderDetalhes() {
        if (!state.itens || state.itens.length === 0) return '';

        let linhas = '';
        for (const item of state.itens) {
            const valor = state.respostas[item.numero];
            const labels = state.norma.answer_labels;
            const labelResposta = (valor !== undefined && labels[valor - 1])
                ? labels[valor - 1]
                : '—';

            const tagReverso = item.reverso
                ? '<span class="laudo-detalhes-tag-reversa">↩ invertido</span>'
                : '';

            // Pontuação aplicando inversão (escala 1-4)
            let pontos = '—';
            if (valor !== undefined) {
                pontos = item.reverso ? (5 - valor) : valor;
            }

            linhas += `
                <tr>
                    <td style="text-align:center;font-weight:700;color:#1e40af;">${item.numero}</td>
                    <td>${escapeHtml(item.texto)} ${tagReverso}</td>
                    <td style="text-align:center;">${escapeHtml(labelResposta)} (${valor || '—'})</td>
                    <td style="text-align:center;font-weight:700;">${pontos}</td>
                </tr>
            `;
        }

        return `
        <details class="laudo-detalhes-toggle">
            <summary>▾ Ver respostas item a item (${state.itens.length} itens)</summary>
            <table class="laudo-detalhes-tabela">
                <thead>
                    <tr>
                        <th style="width:40px;text-align:center;">Nº</th>
                        <th>Item</th>
                        <th style="text-align:center;width:160px;">Resposta</th>
                        <th style="text-align:center;width:60px;">Pontos</th>
                    </tr>
                </thead>
                <tbody>
                    ${linhas}
                </tbody>
            </table>
        </details>
        `;
    }

    // ============================================================================
    // GERAÇÃO DE PDF (mesma técnica do RAADS-R)
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
            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4'
            });

            const pdfWidth = 210;
            const pdfHeight = 297;
            const imgWidth = pdfWidth;
            const imgHeight = (canvas.height * pdfWidth) / canvas.width;

            if (imgHeight <= pdfHeight) {
                pdf.addImage(
                    canvas.toDataURL('image/jpeg', 0.95),
                    'JPEG',
                    0, 0, imgWidth, imgHeight
                );
            } else {
                let posY = 0;
                let restante = imgHeight;
                while (restante > 0) {
                    pdf.addImage(
                        canvas.toDataURL('image/jpeg', 0.95),
                        'JPEG',
                        0, -posY, imgWidth, imgHeight
                    );
                    restante -= pdfHeight;
                    posY += pdfHeight;
                    if (restante > 0) pdf.addPage();
                }
            }

            const nomeAbreviado = state.paciente.nome_completo.toUpperCase()
                .replace(/[^A-Z\s]/g, '')
                .trim()
                .substring(0, 50);
            const score = state.correcao.escores_brutos?.score_total || 0;
            const dataStr = formatarDataArquivo(new Date());
            const nomeArquivo = `EQ-15 - ${nomeAbreviado}_${dataStr}_${score}pts.pdf`;

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

    function calcularIdade(dataNascISO) {
        if (!dataNascISO) return null;
        const hoje = new Date();
        const nasc = new Date(dataNascISO);
        let anos = hoje.getFullYear() - nasc.getFullYear();
        const m = hoje.getMonth() - nasc.getMonth();
        if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) anos--;
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
        const meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
                       'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
        return `${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;
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

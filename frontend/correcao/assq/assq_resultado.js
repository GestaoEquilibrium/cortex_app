// ============================================================================
// CORTEX_APP — Resultado ASSQ (laudo)
// ============================================================================
// URL: ?aplicacao_id=<uuid>
//
// ASSQ — Autism Spectrum Screening Questionnaire
// Ehlers, Gillberg & Wing (1999); Validação BR: Restrepo (2018) — UFRGS
// 27 itens · escala Likert 0-2 · 5 grupos · cutoff 19/54
//
// HETEROAPLICAÇÃO: pai/mãe/responsável responde sobre criança/adolescente.
//
// DECISÃO ARQUITETURAL:
//   Banco grava índice 0-2 (Não=0, Um pouco=1, Sim=2) em escores_brutos.respostas.
//   JS no laudo:
//     1. Lê as respostas (escala direta, sem reversos)
//     2. Soma TOTAL (27 itens, max 54)
//     3. Soma POR GRUPO (5 grupos)
//     4. Classifica BINÁRIO:
//        - <19: Dentro do Esperado
//        - ≥19: Rastreio POSITIVO
// ============================================================================

(function() {
    'use strict';

    const SIGLA_ESPERADA = 'ASSQ';
    const CUTOFF = 19;
    const SCORE_MAX = 54;

    // ============================================================================
    // GRUPOS (Ehlers/Gillberg/Wing 1999 + app legado)
    // 27 itens, todos em algum grupo (sem órfão)
    // ============================================================================
    const GRUPOS_INFO = {
    "COL": {
        "label": "Comunicação e Linguagem",
        "cor": "#7c3aed",
        "max": 8,
        "descricao": "Particularidades na comunicação verbal e não-verbal: compreensão literal, fala formal/pedante, voz/prosódia atípica, desenvolvimento de linguagem incomum."
    },
    "INS": {
        "label": "Interação Social",
        "cor": "#3b82f6",
        "max": 16,
        "descricao": "Dificuldades em normas sociais implícitas, brincadeira recíproca, manutenção de amizades, empatia intuitiva e situações de bullying/provocação."
    },
    "INR": {
        "label": "Interesses Restritos",
        "cor": "#f59e0b",
        "max": 14,
        "descricao": "Interesses intensos, idiossincráticos ou impróprios para a idade; acúmulo de fatos sobre temas específicos; apego excessivo a objetos."
    },
    "COR": {
        "label": "Comportamento Repetitivo / Rigidez",
        "cor": "#dc2626",
        "max": 8,
        "descricao": "Necessidade de rotinas/rituais, dificuldade em mudanças, persistência em objetivos, olhar fixo durante concentração."
    },
    "SEM": {
        "label": "Sensorial / Motor",
        "cor": "#0d9488",
        "max": 8,
        "descricao": "Movimentos desajeitados, expressões involuntárias (tiques), evitação de contato visual, hipersensibilidade sensorial (sons, luzes, texturas)."
    }
};

    const GRUPOS_ORDEM = ['COL', 'INS', 'INR', 'COR', 'SEM'];

    const ITEM_TO_GRUPO = {"5": "COL", "6": "COL", "15": "COL", "22": "COL", "8": "INS", "9": "INS", "10": "INS", "11": "INS", "12": "INS", "18": "INS", "23": "INS", "24": "INS", "1": "INR", "2": "INR", "3": "INR", "4": "INR", "7": "INR", "17": "INR", "27": "INR", "19": "COR", "20": "COR", "25": "COR", "26": "COR", "13": "SEM", "14": "SEM", "16": "SEM", "21": "SEM"};

    // ============================================================================
    // CLASSIFICAÇÃO BINÁRIA (Restrepo 2018)
    // ============================================================================
    function classificarTotal(total) {
        if (total < CUTOFF) {
            return {
                label: 'Dentro do Esperado',
                slug: 'baixa',
                cor: '#16a34a',
                positivo: false,
                desc: `A pontuação total (${total}/${SCORE_MAX}) está abaixo do ponto de corte de ${CUTOFF} pontos. Este resultado não sugere, com base neste instrumento de rastreio, presença de traços do espectro autista em nível clinicamente significativo, sendo consistente com o perfil esperado para a faixa etária.`
            };
        }
        return {
            label: 'Rastreio POSITIVO',
            slug: 'clinico',
            cor: '#dc2626',
            positivo: true,
            desc: `A pontuação total (${total}/${SCORE_MAX}) está ACIMA do ponto de corte de ${CUTOFF} pontos para rastreio positivo quando respondido por pais/responsáveis. De acordo com o estudo de validação brasileiro (Restrepo, 2018/UFRGS), pontuações acima deste limiar indicam a necessidade de avaliação diagnóstica formal para investigação de TEA.`
        };
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
        if (!norma) throw new Error('Norma ASSQ não cadastrada');
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

        // Pontua direto: índice 0-2 = pontos 0-2 (escala direta, sem reversos)
        const pontosItem = {};
        for (let n = 1; n <= 27; n++) {
            const idxResp = respostas[n];
            pontosItem[n] = (idxResp != null && !isNaN(idxResp)) ? parseInt(idxResp, 10) : 0;
        }

        let total = 0;
        for (let n = 1; n <= 27; n++) total += pontosItem[n];

        const subscores = {};
        for (const code of GRUPOS_ORDEM) subscores[code] = 0;
        for (const [itemStr, grupo] of Object.entries(ITEM_TO_GRUPO)) {
            const n = parseInt(itemStr, 10);
            if (subscores[grupo] !== undefined) {
                subscores[grupo] += pontosItem[n];
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
        const pctBarra = (total / SCORE_MAX) * 100;
        const pctCutoff = (CUTOFF / SCORE_MAX) * 100;

        return `
        <div class="laudo">
            <div class="laudo-header">
                <div class="laudo-header-esq">
                    <div class="laudo-header-logo">E</div>
                    <div class="laudo-header-textos">
                        <div class="laudo-header-supratitulo">Relatório de Avaliação Neuropsicológica</div>
                        <h1 class="laudo-header-titulo">ASSQ</h1>
                        <div class="laudo-header-subtitulo">Questionário de Rastreamento do Espectro Autista (Heteroaplicação)<br>Ehlers, Gillberg &amp; Wing (1999) · Validação BR: Restrepo (2018) · 27 itens · cutoff 19/54</div>
                    </div>
                </div>
                <div class="laudo-header-pontuacao">
                    <div class="laudo-header-pontuacao-label">Score Total</div>
                    <div class="laudo-header-pontuacao-valor">${total}</div>
                    <div class="laudo-header-pontuacao-detalhe">de ${SCORE_MAX} (cutoff ${CUTOFF})</div>
                </div>
            </div>

            <div class="laudo-body">

                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">1</span>
                    Identificação
                </div>
                <div class="laudo-identificacao">
                    <div class="laudo-identif-item">
                        <span class="laudo-identif-label">Criança/Adolescente:</span>
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
                        <span class="laudo-identif-valor">Heteroaplicação (pais/responsáveis)</span>
                    </div>
                </div>

                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">2</span>
                    Resultado do Rastreio
                </div>
                <div class="assq-total-card" style="border-left-color:${cl.cor};">
                    <div class="assq-total-card-header">
                        <span class="assq-total-card-numero" style="color:${cl.cor};">${total}</span>
                        <span class="assq-total-card-de">/ ${SCORE_MAX} pontos</span>
                        <span class="assq-total-card-classif assq-badge-${cl.slug}">${cl.label}</span>
                    </div>
                    <p class="assq-total-card-desc">${cl.desc}</p>
                    <div class="assq-total-barra-wrap">
                        <div class="assq-total-barra-bg">
                            <div class="assq-total-barra-fill" style="width:${pctBarra}%;background:${cl.cor};"></div>
                            <div class="assq-total-cutoff-marker" style="left:${pctCutoff}%;"></div>
                        </div>
                        <span class="assq-total-cutoff-label" style="left:${pctCutoff}%;">| ${CUTOFF} (cutoff)</span>
                        <div class="assq-total-barra-escala">
                            <span>0</span>
                            <span>10</span>
                            <span>20</span>
                            <span>30</span>
                            <span>40</span>
                            <span>${SCORE_MAX}</span>
                        </div>
                    </div>
                </div>

                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">3</span>
                    Pontuação por Grupo de Sintomas
                </div>
                ${renderTabelaGrupos()}

                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">4</span>
                    Perfil Gráfico dos Grupos
                </div>
                <div class="assq-grafico-wrap">
                    <div class="assq-grafico-canvas-container">
                        <canvas id="assq-chart"></canvas>
                    </div>
                    <div class="assq-grafico-legenda">
                        Pontuação por grupo de sintomas (escala 0-2 por item).
                    </div>
                </div>

                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">5</span>
                    Detalhamento por Grupo
                </div>
                ${GRUPOS_ORDEM.map(renderGrupoCard).join('')}

                <div class="assq-nota-tecnica">
                    <strong>Nota técnica:</strong> O ASSQ (Ehlers, Gillberg &amp; Wing, 1999)
                    é instrumento de rastreio do espectro autista de alto funcionamento /
                    Síndrome de Asperger em crianças e adolescentes em idade escolar (7-16
                    anos), aplicado em modalidade <strong>heteroaplicação</strong> — pais ou
                    responsáveis respondem sobre comportamentos observados na criança. São
                    27 itens em escala 0-2 (Não / Um pouco / Sim), distribuídos em 5 grupos
                    de sintomas. O escore total varia de 0 a 54, com cutoff de
                    <strong>${CUTOFF} pontos</strong> (Restrepo, 2018 — validação brasileira
                    UFRGS) indicando rastreio positivo para investigação diagnóstica formal.
                    Este é um instrumento de rastreio dimensional — os resultados devem ser
                    interpretados em conjunto com entrevista clínica, observação direta da
                    criança, anamnese desenvolvimentista e outros dados da avaliação
                    neuropsicológica.
                </div>

                ${renderDetalhesItens()}

            </div>

            <div class="laudo-rodape">
                <div class="laudo-rodape-esq">
                    <div class="laudo-rodape-org">Equilibrium Neuropsicologia</div>
                    <div class="laudo-rodape-tipo">Correção automatizada — ASSQ</div>
                </div>
                <div class="laudo-rodape-dir">
                    <div class="laudo-rodape-data">Documento gerado em ${formatarDataBR(new Date().toISOString())}</div>
                    <div class="laudo-rodape-confidencial">Documento confidencial — uso restrito ao profissional solicitante.</div>
                </div>
            </div>
        </div>
        `;
    }

    function renderTabelaGrupos() {
        const linhas = GRUPOS_ORDEM.map(code => {
            const info = GRUPOS_INFO[code];
            const score = state.scores.subscores[code];
            const pct = Math.round((score / info.max) * 100);
            const itensCount = info.max / 2;  // max = itens × 2
            return `<tr>
                <td>
                    <span class="nome-sub">
                        <span class="nome-sub-bullet" style="background:${info.cor};"></span>
                        ${info.label}
                    </span>
                </td>
                <td class="ctr">${itensCount}</td>
                <td class="ctr"><span class="escore-bruto">${score} / ${info.max}</span></td>
                <td class="ctr">${pct}%</td>
            </tr>`;
        }).join('');

        return `
            <div class="assq-tab-subescalas">
                <table>
                    <thead>
                        <tr>
                            <th>Grupo</th>
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

    function renderGrupoCard(code) {
        const info = GRUPOS_INFO[code];
        const score = state.scores.subscores[code];
        const pct = Math.round((score / info.max) * 100);

        return `
            <div class="assq-sub-card" style="border-left-color:${info.cor};">
                <div class="assq-sub-card-header">
                    <div class="assq-sub-card-titulo">
                        <span class="assq-sub-card-bullet" style="background:${info.cor};"></span>
                        ${info.label}
                    </div>
                    <span class="assq-sub-card-escore">${score} / ${info.max} (${pct}%)</span>
                </div>
                <p class="assq-sub-card-corpo">${escapeHtml(info.descricao)}</p>
            </div>
        `;
    }

    function renderGrafico() {
        const canvas = document.getElementById('assq-chart');
        if (!canvas || typeof Chart === 'undefined') return;

        if (state.chartInstance) state.chartInstance.destroy();

        const labels = GRUPOS_ORDEM.map(c => GRUPOS_INFO[c].label);
        const cores  = GRUPOS_ORDEM.map(c => GRUPOS_INFO[c].cor);
        const scores = GRUPOS_ORDEM.map(c => state.scores.subscores[c]);
        const maxes  = GRUPOS_ORDEM.map(c => GRUPOS_INFO[c].max);
        const pcts   = scores.map((s, i) => Math.round((s / maxes[i]) * 100));

        // Como cada grupo tem max diferente, mostrar em % faz mais sentido visualmente
        state.chartInstance = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    data: pcts,
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
                                const code = GRUPOS_ORDEM[ctx.dataIndex];
                                const info = GRUPOS_INFO[code];
                                const sc = state.scores.subscores[code];
                                return ` ${sc} / ${info.max} pontos (${ctx.parsed.x}%)`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        min: 0,
                        max: 100,
                        ticks: { stepSize: 25, callback: (v) => v + '%' },
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
            const grupo = ITEM_TO_GRUPO[item.numero];
            const grupoTxt = grupo
                ? `<span style="background:${GRUPOS_INFO[grupo].cor}22;color:${GRUPOS_INFO[grupo].cor};padding:2px 8px;border-radius:6px;font-size:10px;font-weight:700;">${grupo}</span>`
                : '—';
            const idxResp = respostas[item.numero];
            const labelResp = (idxResp !== undefined && labels[idxResp] !== undefined) ? labels[idxResp] : '—';
            const ponto = state.scores.pontosItem[item.numero];

            return `<tr>
                <td style="text-align:center;font-weight:700;color:#1e40af;">${item.numero}</td>
                <td>${escapeHtml(item.texto)}</td>
                <td>${grupoTxt}</td>
                <td style="text-align:center;">${labelResp}</td>
                <td style="text-align:center;font-weight:700;color:${ponto > 0 ? '#dc2626' : '#94a3b8'};">${ponto}</td>
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
                            <th>Grupo</th>
                            <th style="text-align:center;width:120px;">Resposta</th>
                            <th style="text-align:center;width:60px;">Pontos</th>
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
            const nomeArquivo = `ASSQ - ${nomeAbreviado}_${dataStr}.pdf`;

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

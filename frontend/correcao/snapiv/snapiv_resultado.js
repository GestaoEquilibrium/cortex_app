// ============================================================================
// CORTEX_APP — Resultado SNAP-IV (laudo) — padrão visual ICA/ASSQ
// ============================================================================
// URL: ?aplicacao_id=<uuid>
//
// MTA-SNAP-IV (Mattos, Serra-Pinheiro, Rohde & Pinto, 2006)
// 26 itens · escala 0-3 · 3 subescalas somadas SEPARADAMENTE (sem total único)
// Heteroaplicação (pais/responsável ou professor).
//
//   Desatenção (DES, itens 1-9, máx 27)
//   Hiperatividade/Impulsividade (HIP, itens 10-18, máx 27)
//   Oposição/Desafio (OPO, itens 19-26, máx 24)
//
// Cada subescala classificada em 4 faixas de gravidade (cortes no JS):
//   DES/HIP (9 itens): <13 não signif. / 13-17 leve / 18-22 moderado / 23-27 grave
//   OPO     (8 itens): <8  não signif. / 8-13  leve / 14-18 moderado / 19-24 grave
//
// Banco grava 0-3 em escores_brutos.respostas. Área de cada item vem do fator (DB).
// ============================================================================

(function() {
    'use strict';

    const SIGLA_ESPERADA = 'SNAP-IV';

    // Subescalas: rótulo, cor, faixa de itens, máx, cortes [c1,c2,c3], descrição
    const SUBS_INFO = {
        DES: { label: 'Desatenção', cor: '#6366f1', itens: '1–9', max: 27, cortes: [13, 18, 23],
               descricao: 'Sintomas de desatenção: dificuldade de sustentar atenção, seguir instruções, organizar-se, evitar distrações e lembrar de tarefas do dia a dia.' },
        HIP: { label: 'Hiperatividade/Impulsividade', cor: '#8b5cf6', itens: '10–18', max: 27, cortes: [13, 18, 23],
               descricao: 'Sintomas de hiperatividade e impulsividade: inquietação motora, dificuldade de permanecer sentado/calmo, falar em excesso, agir/responder de forma precipitada e dificuldade de esperar a vez.' },
        OPO: { label: 'Oposição/Desafio', cor: '#ec4899', itens: '19–26', max: 24, cortes: [8, 14, 19],
               descricao: 'Sintomas de oposição e desafio: descontrole, discussões com adultos, desafio a regras, irritabilidade, rancor e comportamentos provocativos.' }
    };
    const SUBS_ORDEM = ['DES', 'HIP', 'OPO'];

    // 4 faixas de gravidade (índice 0..3)
    const FAIXAS = [
        { slug: 'naosig', label: 'Não significativo', cor: '#16a34a' },
        { slug: 'leve',   label: 'Leve',              cor: '#d97706' },
        { slug: 'mod',    label: 'Moderado',          cor: '#ea580c' },
        { slug: 'grave',  label: 'Grave',             cor: '#dc2626' }
    ];

    function classificar(code, score) {
        const [c1, c2, c3] = SUBS_INFO[code].cortes;
        let i = 0;
        if (score >= c3) i = 3; else if (score >= c2) i = 2; else if (score >= c1) i = 1; else i = 0;
        return { ...FAIXAS[i], idx: i };
    }

    const state = {
        aplicacaoId: null, aplicacao: null, paciente: null,
        norma: null, itens: [], correcao: null, scores: null, chartInstance: null
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
        if (!norma) throw new Error('Norma SNAP-IV não cadastrada');
        state.norma = norma;

        const { data: fatores } = await window.cortexClient
            .from('instrumentos_fatores').select('id, fator_codigo').eq('norma_id', norma.id);
        const mapFator = {};
        for (const f of (fatores || [])) mapFator[f.id] = f.fator_codigo;

        const { data: itens } = await window.cortexClient
            .from('instrumentos_itens').select('numero, texto, fator_id')
            .eq('norma_id', norma.id).order('numero');
        state.itens = (itens || []).map(i => ({
            numero: i.numero, texto: i.texto, sub: mapFator[i.fator_id] || null
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

    function calcularResultados(correcao) {
        const respostas = (correcao?.escores_brutos || {}).respostas || {};
        const respItem = {};
        const subscores = {}; for (const c of SUBS_ORDEM) subscores[c] = 0;
        for (const item of state.itens) {
            const r = respostas[item.numero];
            const resp = (r != null && !isNaN(r)) ? parseInt(r, 10) : null;
            respItem[item.numero] = resp;
            if (resp != null && subscores[item.sub] !== undefined) subscores[item.sub] += resp;
        }
        const classif = {};
        for (const c of SUBS_ORDEM) classif[c] = classificar(c, subscores[c]);
        const respondidos = Object.keys(respostas).length;
        return { respItem, subscores, classif, respondidos };
    }

    function labelResposta(v) {
        const labels = state.norma.answer_labels || [];
        return (v != null && labels[v] !== undefined) ? labels[v] : (v != null ? String(v) : '—');
    }

    function renderizar() {
        const cont = document.getElementById('laudo-conteudo');
        cont.innerHTML = renderLaudo();
        document.getElementById('acoes-topo').style.display = 'flex';
        document.getElementById('back-link').href = `../../bateria/bateria.html?paciente=${state.paciente.id}`;
        document.getElementById('btn-gerar-pdf').addEventListener('click', gerarPDF);
        setTimeout(renderGrafico, 60);
    }

    function renderLaudo() {
        const p = state.paciente;
        const idade = calcularIdade(p.data_nascimento, state.aplicacao.created_at);
        const nascStr = formatarDataBR(p.data_nascimento);
        const dataApl = state.aplicacao.created_at;
        const sexoStr = p.sexo === 'M' ? 'Masculino' : (p.sexo === 'F' ? 'Feminino' : (p.sexo || '—'));

        return `
        <div class="laudo">
            <div class="laudo-header">
                <div class="laudo-header-esq">
                    <div class="laudo-header-logo">E</div>
                    <div class="laudo-header-textos">
                        <div class="laudo-header-supratitulo">Relatório de Avaliação Neuropsicológica</div>
                        <h1 class="laudo-header-titulo">SNAP-IV</h1>
                        <div class="laudo-header-subtitulo">MTA-SNAP-IV — Sintomas de TDAH e Transtorno Opositor-Desafiador (Heteroaplicação)<br>26 itens · escala 0-3 · 3 subescalas (somadas separadamente)</div>
                    </div>
                </div>
                <div class="laudo-header-pontuacao">
                    <div class="laudo-header-pontuacao-label">Respondente</div>
                    <div class="laudo-header-pontuacao-valor" style="font-size:16px;">Pais / responsável / professor</div>
                </div>
            </div>

            <div class="laudo-body">
                <div class="laudo-secao-titulo"><span class="laudo-secao-tag">1</span>Identificação</div>
                <div class="laudo-identificacao">
                    <div class="laudo-identif-item"><span class="laudo-identif-label">Criança/Adolescente:</span><span class="laudo-identif-valor">${escapeHtml(p.nome_completo)}</span></div>
                    <div class="laudo-identif-item"><span class="laudo-identif-label">Idade:</span><span class="laudo-identif-valor">${idade !== null ? idade + ' anos' : '—'}</span></div>
                    <div class="laudo-identif-item"><span class="laudo-identif-label">Sexo:</span><span class="laudo-identif-valor">${escapeHtml(sexoStr)}</span></div>
                    <div class="laudo-identif-item"><span class="laudo-identif-label">Nascimento:</span><span class="laudo-identif-valor">${nascStr}</span></div>
                    <div class="laudo-identif-item"><span class="laudo-identif-label">Avaliação:</span><span class="laudo-identif-valor">${formatarDataBR(dataApl)}</span></div>
                    <div class="laudo-identif-item"><span class="laudo-identif-label">Modalidade:</span><span class="laudo-identif-valor">Heteroaplicação</span></div>
                </div>

                <div class="laudo-secao-titulo"><span class="laudo-secao-tag">2</span>Resultados por Subescala</div>
                ${renderTabela()}

                <div class="laudo-secao-titulo"><span class="laudo-secao-tag">3</span>Perfil de Gravidade por Subescala</div>
                ${renderReguas()}

                <div class="laudo-secao-titulo"><span class="laudo-secao-tag">4</span>Comparação entre Subescalas</div>
                <div class="snap-grafico-wrap">
                    <div class="snap-grafico-canvas-container"><canvas id="snap-chart"></canvas></div>
                    <div class="snap-grafico-legenda">Pontuação bruta de cada subescala em % do seu máximo. Cores indicam a faixa de gravidade.</div>
                </div>

                <div class="laudo-secao-titulo"><span class="laudo-secao-tag">5</span>Detalhamento por Subescala</div>
                ${SUBS_ORDEM.map(renderSubCard).join('')}

                <div class="snap-nota-tecnica">
                    <strong>Nota técnica:</strong> O MTA-SNAP-IV (Mattos, Serra-Pinheiro, Rohde &amp; Pinto, 2006)
                    é instrumento de <strong>rastreio</strong> de sintomas de TDAH (desatenção e
                    hiperatividade/impulsividade) e do Transtorno Opositor-Desafiador, respondido por
                    <strong>heteroaplicação</strong> (pais/responsável ou professor). São 26 itens (escala 0-3),
                    e as três subescalas são <strong>somadas separadamente</strong> — não há escore total. A
                    classificação de cada subescala em <strong>Não significativo / Leve / Moderado / Grave</strong>
                    segue os pontos de corte sugeridos. Trata-se de instrumento dimensional de triagem; os
                    resultados devem ser integrados à entrevista clínica, observação e demais dados da avaliação,
                    não constituindo diagnóstico isolado.
                </div>

                ${renderDetalhesItens()}
            </div>

            <div class="laudo-rodape">
                <div class="laudo-rodape-esq">
                    <div class="laudo-rodape-org">Equilibrium Neuropsicologia</div>
                    <div class="laudo-rodape-tipo">Correção automatizada — SNAP-IV</div>
                </div>
                <div class="laudo-rodape-dir">
                    <div class="laudo-rodape-data">Documento gerado em ${formatarDataBR(new Date().toISOString())}</div>
                    <div class="laudo-rodape-confidencial">Documento confidencial — uso restrito ao profissional solicitante.</div>
                </div>
            </div>
        </div>`;
    }

    function renderTabela() {
        const linhas = SUBS_ORDEM.map(code => {
            const info = SUBS_INFO[code];
            const score = state.scores.subscores[code];
            const cl = state.scores.classif[code];
            const nItens = state.itens.filter(i => i.sub === code).length;
            return `<tr>
                <td><span class="nome-sub"><span class="nome-sub-bullet" style="background:${info.cor};"></span>${info.label}</span></td>
                <td class="ctr">${info.itens} (${nItens})</td>
                <td class="ctr"><span class="escore-bruto">${score}</span></td>
                <td class="ctr">${info.max}</td>
                <td class="ctr"><span class="snap-badge snap-badge-${cl.slug}">${cl.label}</span></td>
            </tr>`;
        }).join('');
        return `
            <div class="snap-tab-subescalas">
                <table>
                    <thead><tr><th>Subescala</th><th class="ctr">Itens</th><th class="ctr">Escore bruto</th><th class="ctr">Máx</th><th class="ctr">Classificação</th></tr></thead>
                    <tbody>${linhas}</tbody>
                </table>
            </div>`;
    }

    // Régua de gravidade: 4 zonas coloridas (proporcionais aos cortes) + marcador no escore
    function renderReguas() {
        const reguas = SUBS_ORDEM.map(code => {
            const info = SUBS_INFO[code];
            const score = state.scores.subscores[code];
            const cl = state.scores.classif[code];
            const max = info.max;
            const [c1, c2, c3] = info.cortes;
            // larguras das 4 zonas em % do máximo
            const zonas = [
                { w: (c1 / max) * 100,        cor: FAIXAS[0].cor },
                { w: ((c2 - c1) / max) * 100, cor: FAIXAS[1].cor },
                { w: ((c3 - c2) / max) * 100, cor: FAIXAS[2].cor },
                { w: ((max - c3 + 1) / max) * 100, cor: FAIXAS[3].cor }
            ];
            const markerPct = Math.min(100, Math.max(0, (score / max) * 100));
            return `
            <div class="snap-regua-row">
                <div class="snap-regua-head">
                    <span class="snap-regua-nome"><span class="nome-sub-bullet" style="background:${info.cor};"></span>${info.label}</span>
                    <span class="snap-regua-score">${score} / ${max} · <span class="snap-badge snap-badge-${cl.slug}">${cl.label}</span></span>
                </div>
                <div class="snap-regua-track">
                    ${zonas.map(z => `<div class="snap-regua-zona" style="width:${z.w}%;background:${z.cor};"></div>`).join('')}
                    <div class="snap-regua-marker" style="left:${markerPct}%;" title="${score}"></div>
                </div>
                <div class="snap-regua-escala">
                    <span>0</span><span>${c1}</span><span>${c2}</span><span>${c3}</span><span>${max}</span>
                </div>
            </div>`;
        }).join('');
        const legenda = FAIXAS.map(f => `<span class="snap-leg-item"><span class="snap-leg-dot" style="background:${f.cor};"></span>${f.label}</span>`).join('');
        return `<div class="snap-reguas">${reguas}<div class="snap-reguas-legenda">${legenda}</div></div>`;
    }

    function renderSubCard(code) {
        const info = SUBS_INFO[code];
        const score = state.scores.subscores[code];
        const cl = state.scores.classif[code];
        const pct = Math.round((score / info.max) * 100);
        return `
            <div class="snap-sub-card" style="border-left-color:${info.cor};">
                <div class="snap-sub-card-header">
                    <div class="snap-sub-card-titulo"><span class="snap-sub-card-bullet" style="background:${info.cor};"></span>${info.label} <span class="snap-sub-card-itens">(itens ${info.itens})</span></div>
                    <span class="snap-sub-card-escore">${score} / ${info.max} (${pct}%) · <span class="snap-badge snap-badge-${cl.slug}">${cl.label}</span></span>
                </div>
                <p class="snap-sub-card-corpo">${escapeHtml(info.descricao)}</p>
            </div>`;
    }

    function renderGrafico() {
        const canvas = document.getElementById('snap-chart');
        if (!canvas || typeof Chart === 'undefined') return;
        if (state.chartInstance) state.chartInstance.destroy();
        const labels = SUBS_ORDEM.map(c => SUBS_INFO[c].label);
        const cores  = SUBS_ORDEM.map(c => state.scores.classif[c].cor);
        const pcts   = SUBS_ORDEM.map(c => Math.round((state.scores.subscores[c] / SUBS_INFO[c].max) * 100));
        state.chartInstance = new Chart(canvas, {
            type: 'bar',
            data: { labels, datasets: [{ data: pcts, backgroundColor: cores, borderRadius: 6, barPercentage: 0.6 }] },
            options: {
                indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: (ctx) => {
                        const code = SUBS_ORDEM[ctx.dataIndex];
                        const sc = state.scores.subscores[code]; const cl = state.scores.classif[code];
                        return ` ${sc} / ${SUBS_INFO[code].max} (${ctx.parsed.x}%) · ${cl.label}`;
                    } } }
                },
                scales: {
                    x: { min: 0, max: 100, ticks: { stepSize: 25, callback: (v) => v + '%' }, grid: { color: '#f1f5f9' } },
                    y: { grid: { display: false }, ticks: { font: { size: 12, weight: '600' } } }
                }
            }
        });
    }

    function renderDetalhesItens() {
        if (!state.itens.length) return '';
        const linhas = state.itens.map(item => {
            const sub = item.sub;
            const subTxt = sub && SUBS_INFO[sub]
                ? `<span style="background:${SUBS_INFO[sub].cor}22;color:${SUBS_INFO[sub].cor};padding:2px 8px;border-radius:6px;font-size:10px;font-weight:700;">${sub}</span>`
                : '—';
            const resp = state.scores.respItem[item.numero];
            return `<tr>
                <td style="text-align:center;font-weight:700;color:#1e40af;">${item.numero}</td>
                <td>${escapeHtml(item.texto)}</td>
                <td style="text-align:center;">${subTxt}</td>
                <td style="text-align:center;font-weight:700;">${resp != null ? resp : '—'}</td>
                <td>${escapeHtml(labelResposta(resp))}</td>
            </tr>`;
        }).join('');
        return `
            <details class="laudo-detalhes-toggle">
                <summary>▾ Ver respostas item a item (${state.itens.length} itens)</summary>
                <table class="laudo-detalhes-tabela">
                    <thead><tr>
                        <th style="width:40px;text-align:center;">Nº</th><th>Item</th>
                        <th style="text-align:center;width:60px;">Subesc.</th>
                        <th style="text-align:center;width:50px;">Resp.</th>
                        <th style="width:130px;">Significado</th>
                    </tr></thead>
                    <tbody>${linhas}</tbody>
                </table>
            </details>`;
    }

    async function gerarPDF() {
        const btn = document.getElementById('btn-gerar-pdf');
        const orig = btn.textContent;
        btn.disabled = true; btn.textContent = '⏳ Gerando PDF...';
        try {
            document.body.classList.add('exportando');
            await new Promise(r => setTimeout(r, 100));
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
            pdf.save(`SNAP-IV - ${nome}_${formatarDataArquivo(new Date())}.pdf`);
            window.CortexUI.toast('PDF gerado com sucesso', 'success');
        } catch (err) {
            console.error('Erro ao gerar PDF:', err);
            window.CortexUI.toast('Erro ao gerar PDF: ' + err.message, 'danger');
        } finally {
            document.body.classList.remove('exportando');
            btn.disabled = false; btn.textContent = orig;
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
        const ano = d.getFullYear(), mes = String(d.getMonth() + 1).padStart(2, '0'), dia = String(d.getDate()).padStart(2, '0');
        return `${ano}-${mes}-${dia}`;
    }
    function mostrarErro(msg) {
        document.getElementById('laudo-conteudo').innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div>
                <div class="empty-state-title">${escapeHtml(msg)}</div>
            </div>`;
    }
    function escapeHtml(text) {
        if (text === null || text === undefined) return '';
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }
})();

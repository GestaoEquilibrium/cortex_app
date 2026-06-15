// ============================================================================
// CORTEX_APP — Resultado ICA (laudo) — mesmo padrão visual do ASSQ
// ============================================================================
// URL: ?aplicacao_id=<uuid>
//
// ICA — Inventário de Comportamentos Autísticos (Autism Behavior Checklist)
// Krug (ABC); trad. BR Pedromônico & Marteletto (2005)
// 57 itens binários (Sim/Não) · peso 1-4 por item · 5 áreas · heteroaplicação
//
// DECISÃO ARQUITETURAL:
//   Banco grava 0/1 (Não=0, Sim=1) em escores_brutos.respostas. A ÁREA de cada
//   item vem do fator (DB). O PESO vive no JS (banco não tem coluna de peso).
//   JS no laudo:
//     1. Lê respostas (0/1)
//     2. "Sim" soma o PESO do item; "Não" soma 0 (sem reversos)
//     3. Soma TOTAL ponderado (0-158) e POR ÁREA (5)
//     4. Classifica por corte: >=68 Alta | 54-67 Moderada | 47-53 Duvidosa | <47 Tipico
// ============================================================================

(function() {
    'use strict';

    const SIGLA_ESPERADA = 'ICA';
    const SCORE_MAX = 158;

    // Peso por item (1-4) — protocolo oficial. Vive aqui (banco não tem peso).
    const PESOS = {
        1:4,2:2,3:4,4:1,5:2,6:2,7:2,8:3,9:3,10:3,11:4,12:4,13:2,14:3,15:2,16:4,17:3,18:2,19:4,20:1,
        21:3,22:4,23:3,24:4,25:4,26:3,27:3,28:2,29:2,30:2,31:2,32:3,33:3,34:1,35:2,36:2,37:1,38:4,39:4,40:4,
        41:1,42:2,43:3,44:3,45:1,46:3,47:4,48:4,49:2,50:4,51:3,52:3,53:4,54:2,55:1,56:3,57:4
    };

    // Áreas (5) — rótulo, cor, máx ponderado, descrição (código do fator no DB)
    const AREAS_INFO = {
        ES: { label: 'Estímulo Sensorial', cor: '#0d9488', max: 26,
              descricao: 'Respostas atípicas a estímulos visuais, auditivos, táteis e dolorosos; padrões sensoriais incomuns.' },
        RE: { label: 'Relacionamento', cor: '#3b82f6', max: 38,
              descricao: 'Reciprocidade social, contato visual, vínculo afetivo, resposta a expressões e a outras pessoas.' },
        CO: { label: 'Uso do Corpo e Objetos', cor: '#7c3aed', max: 38,
              descricao: 'Estereotipias motoras, balanceios, manuseio atípico de objetos e brinquedos, autoagressão.' },
        LG: { label: 'Linguagem', cor: '#f59e0b', max: 31,
              descricao: 'Comunicação verbal e não-verbal, ecolalia, uso de pronomes, repetição de frases, gestos.' },
        PS: { label: 'Desenvolvimento Pessoal e Social', cor: '#dc2626', max: 25,
              descricao: 'Autonomia em atividades diárias, autocuidado, regulação, marcos de desenvolvimento.' }
    };
    const AREAS_ORDEM = ['ES', 'RE', 'CO', 'LG', 'PS'];

    // Cortes do escore total ponderado (régua: 47 / 54 / 68)
    const CORTES = [47, 54, 68];

    function classificarTotal(total) {
        if (total >= 68) return {
            label: 'Alta probabilidade', slug: 'alta', cor: '#dc2626',
            desc: `A pontuação total ponderada (${total}/${SCORE_MAX}) está no nível de <strong>alta probabilidade</strong> de comportamentos do espectro autista (≥ 68 pontos). Indica forte recomendação de avaliação diagnóstica formal.`
        };
        if (total >= 54) return {
            label: 'Probabilidade moderada', slug: 'moderada', cor: '#ea580c',
            desc: `A pontuação total ponderada (${total}/${SCORE_MAX}) está na faixa de <strong>probabilidade moderada</strong> (54–67 pontos). Recomenda-se aprofundar a investigação clínica.`
        };
        if (total >= 47) return {
            label: 'Avaliação duvidosa', slug: 'duvidosa', cor: '#d97706',
            desc: `A pontuação total ponderada (${total}/${SCORE_MAX}) está na faixa <strong>duvidosa/limítrofe</strong> (47–53 pontos). O resultado é inconclusivo e pede reavaliação e observação complementar.`
        };
        return {
            label: 'Desenvolvimento típico', slug: 'tipico', cor: '#16a34a',
            desc: `A pontuação total ponderada (${total}/${SCORE_MAX}) está <strong>abaixo do ponto de corte</strong> (< 47 pontos). Este resultado de triagem não sugere comportamentos do espectro autista em nível clinicamente significativo.`
        };
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
        if (!norma) throw new Error('Norma ICA não cadastrada');
        state.norma = norma;

        const { data: fatores } = await window.cortexClient
            .from('instrumentos_fatores').select('id, fator_codigo')
            .eq('norma_id', norma.id);
        const mapFator = {};
        for (const f of (fatores || [])) mapFator[f.id] = f.fator_codigo;

        const { data: itens } = await window.cortexClient
            .from('instrumentos_itens').select('numero, texto, fator_id')
            .eq('norma_id', norma.id).order('numero');
        state.itens = (itens || []).map(i => ({
            numero: i.numero, texto: i.texto, area: mapFator[i.fator_id] || null
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
        // contribuição por item: Sim(1) -> peso; Não(0) -> 0
        const pontosItem = {}, respItem = {};
        for (const item of state.itens) {
            const r = respostas[item.numero];
            const resp = (r != null && !isNaN(r)) ? parseInt(r, 10) : 0;
            respItem[item.numero] = resp;
            pontosItem[item.numero] = resp === 1 ? (PESOS[item.numero] || 0) : 0;
        }
        let total = 0;
        const subscores = {}; for (const c of AREAS_ORDEM) subscores[c] = 0;
        const simPorArea = {}; for (const c of AREAS_ORDEM) simPorArea[c] = 0;
        for (const item of state.itens) {
            total += pontosItem[item.numero];
            if (subscores[item.area] !== undefined) {
                subscores[item.area] += pontosItem[item.numero];
                if (respItem[item.numero] === 1) simPorArea[item.area] += 1;
            }
        }
        const respondidos = Object.keys(respostas).length;
        return { pontosItem, respItem, total, subscores, simPorArea,
                 totalClassif: classificarTotal(total), respondidos };
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
        const total = state.scores.total;
        const cl = state.scores.totalClassif;
        const idade = calcularIdade(state.paciente.data_nascimento, state.aplicacao.created_at);
        const nascStr = formatarDataBR(state.paciente.data_nascimento);
        const dataApl = state.aplicacao.created_at;
        const pctBarra = Math.min(100, Math.round((total / SCORE_MAX) * 100));

        return `
        <div class="laudo">
            <div class="laudo-header">
                <div class="laudo-header-esq">
                    <div class="laudo-header-logo">E</div>
                    <div class="laudo-header-textos">
                        <div class="laudo-header-supratitulo">Relatório de Avaliação Neuropsicológica</div>
                        <h1 class="laudo-header-titulo">ICA</h1>
                        <div class="laudo-header-subtitulo">Inventário de Comportamentos Autísticos / Autism Behavior Checklist (Heteroaplicação)<br>Krug (ABC) · trad. BR Pedromônico &amp; Marteletto (2005) · 57 itens · peso 1-4 · 5 áreas</div>
                    </div>
                </div>
                <div class="laudo-header-pontuacao">
                    <div class="laudo-header-pontuacao-label">Escore Total</div>
                    <div class="laudo-header-pontuacao-valor">${total}</div>
                    <div class="laudo-header-pontuacao-detalhe">de ${SCORE_MAX} (ponderado)</div>
                </div>
            </div>

            <div class="laudo-body">
                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">1</span>
                    Identificação
                </div>
                <div class="laudo-identificacao">
                    <div class="laudo-identif-item"><span class="laudo-identif-label">Criança/Adolescente:</span><span class="laudo-identif-valor">${escapeHtml(state.paciente.nome_completo)}</span></div>
                    <div class="laudo-identif-item"><span class="laudo-identif-label">Idade:</span><span class="laudo-identif-valor">${idade !== null ? idade + ' anos' : '—'}</span></div>
                    <div class="laudo-identif-item"><span class="laudo-identif-label">Sexo:</span><span class="laudo-identif-valor">${escapeHtml(state.paciente.sexo || '—')}</span></div>
                    <div class="laudo-identif-item"><span class="laudo-identif-label">Nascimento:</span><span class="laudo-identif-valor">${nascStr}</span></div>
                    <div class="laudo-identif-item"><span class="laudo-identif-label">Avaliação:</span><span class="laudo-identif-valor">${formatarDataBR(dataApl)}</span></div>
                    <div class="laudo-identif-item"><span class="laudo-identif-label">Modalidade:</span><span class="laudo-identif-valor">Heteroaplicação (responsável)</span></div>
                </div>

                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">2</span>
                    Escore Total e Classificação
                </div>
                <div class="ica-total-card" style="border-left-color:${cl.cor};">
                    <div class="ica-total-card-header">
                        <span class="ica-total-card-numero" style="color:${cl.cor};">${total}</span>
                        <span class="ica-total-card-de">/ ${SCORE_MAX} pontos</span>
                        <span class="ica-total-card-classif ica-badge-${cl.slug}">${cl.label}</span>
                    </div>
                    <p class="ica-total-card-desc">${cl.desc}</p>
                    <div class="ica-total-barra-wrap">
                        <div class="ica-total-barra-bg">
                            <div class="ica-total-barra-fill" style="width:${pctBarra}%;background:${cl.cor};"></div>
                            ${CORTES.map(c => {
                                const left = (c / SCORE_MAX) * 100;
                                return `<div class="ica-total-cutoff-tic" style="left:${left}%;"></div><div class="ica-total-cutoff-cap" style="left:${left}%;">${c}</div>`;
                            }).join('')}
                        </div>
                        <div class="ica-total-barra-escala">
                            <span>0</span><span>47</span><span>54</span><span>68</span><span>${SCORE_MAX}</span>
                        </div>
                    </div>
                </div>

                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">3</span>
                    Pontuação por Área
                </div>
                ${renderTabelaAreas()}

                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">4</span>
                    Perfil Gráfico das Áreas
                </div>
                <div class="ica-grafico-wrap">
                    <div class="ica-grafico-canvas-container">
                        <canvas id="ica-chart"></canvas>
                    </div>
                    <div class="ica-grafico-legenda">
                        Pontuação ponderada de cada área em % do seu máximo.
                    </div>
                </div>

                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">5</span>
                    Detalhamento por Área
                </div>
                ${AREAS_ORDEM.map(renderAreaCard).join('')}

                <div class="ica-nota-tecnica">
                    <strong>Nota técnica:</strong> O ICA / ABC (Krug; tradução brasileira de
                    Pedromônico &amp; Marteletto, 2005) é instrumento de <strong>rastreio</strong>
                    de comportamentos do espectro autista, aplicado por <strong>heteroaplicação</strong>
                    (responsável/cuidador). São 57 comportamentos binários (Sim/Não), cada um com
                    peso de 1 a 4, distribuídos em 5 áreas. O escore total ponderado varia de 0 a 158:
                    <strong>≥ 68</strong> alta probabilidade, <strong>54–67</strong> moderada,
                    <strong>47–53</strong> duvidosa e <strong>&lt; 47</strong> desenvolvimento típico.
                    Trata-se de instrumento dimensional de triagem — os resultados devem ser
                    interpretados em conjunto com entrevista clínica, observação direta, anamnese e
                    demais dados da avaliação neuropsicológica, não constituindo diagnóstico isolado.
                </div>

                ${renderDetalhesItens()}
            </div>

            <div class="laudo-rodape">
                <div class="laudo-rodape-esq">
                    <div class="laudo-rodape-org">Equilibrium Neuropsicologia</div>
                    <div class="laudo-rodape-tipo">Correção automatizada — ICA</div>
                </div>
                <div class="laudo-rodape-dir">
                    <div class="laudo-rodape-data">Documento gerado em ${formatarDataBR(new Date().toISOString())}</div>
                    <div class="laudo-rodape-confidencial">Documento confidencial — uso restrito ao profissional solicitante.</div>
                </div>
            </div>
        </div>`;
    }

    function renderTabelaAreas() {
        const linhas = AREAS_ORDEM.map(code => {
            const info = AREAS_INFO[code];
            const score = state.scores.subscores[code];
            const pct = Math.round((score / info.max) * 100);
            const itensCount = state.itens.filter(i => i.area === code).length;
            return `<tr>
                <td><span class="nome-sub"><span class="nome-sub-bullet" style="background:${info.cor};"></span>${info.label}</span></td>
                <td class="ctr">${itensCount}</td>
                <td class="ctr"><span class="escore-bruto">${score} / ${info.max}</span></td>
                <td class="ctr">${pct}%</td>
            </tr>`;
        }).join('');
        return `
            <div class="ica-tab-subescalas">
                <table>
                    <thead><tr><th>Área</th><th class="ctr">Itens</th><th class="ctr">Pontuação</th><th class="ctr">% do máximo</th></tr></thead>
                    <tbody>${linhas}</tbody>
                </table>
            </div>`;
    }

    function renderAreaCard(code) {
        const info = AREAS_INFO[code];
        const score = state.scores.subscores[code];
        const pct = Math.round((score / info.max) * 100);
        const sims = state.scores.simPorArea[code];
        const itensCount = state.itens.filter(i => i.area === code).length;
        return `
            <div class="ica-sub-card" style="border-left-color:${info.cor};">
                <div class="ica-sub-card-header">
                    <div class="ica-sub-card-titulo"><span class="ica-sub-card-bullet" style="background:${info.cor};"></span>${info.label}</div>
                    <span class="ica-sub-card-escore">${score} / ${info.max} (${pct}%) · ${sims}/${itensCount} “Sim”</span>
                </div>
                <p class="ica-sub-card-corpo">${escapeHtml(info.descricao)}</p>
            </div>`;
    }

    function renderGrafico() {
        const canvas = document.getElementById('ica-chart');
        if (!canvas || typeof Chart === 'undefined') return;
        if (state.chartInstance) state.chartInstance.destroy();

        const labels = AREAS_ORDEM.map(c => AREAS_INFO[c].label);
        const cores  = AREAS_ORDEM.map(c => AREAS_INFO[c].cor);
        const scores = AREAS_ORDEM.map(c => state.scores.subscores[c]);
        const maxes  = AREAS_ORDEM.map(c => AREAS_INFO[c].max);
        const pcts   = scores.map((s, i) => Math.round((s / maxes[i]) * 100));

        state.chartInstance = new Chart(canvas, {
            type: 'bar',
            data: { labels, datasets: [{ data: pcts, backgroundColor: cores, borderRadius: 6, barPercentage: 0.65 }] },
            options: {
                indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: (ctx) => {
                        const code = AREAS_ORDEM[ctx.dataIndex]; const info = AREAS_INFO[code];
                        const sc = state.scores.subscores[code];
                        return ` ${sc} / ${info.max} pontos (${ctx.parsed.x}%)`;
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
        const respostas = state.correcao?.escores_brutos?.respostas || {};
        const linhas = state.itens.map(item => {
            const area = item.area;
            const areaTxt = area && AREAS_INFO[area]
                ? `<span style="background:${AREAS_INFO[area].cor}22;color:${AREAS_INFO[area].cor};padding:2px 8px;border-radius:6px;font-size:10px;font-weight:700;">${area}</span>`
                : '—';
            const resp = state.scores.respItem[item.numero];
            const respTxt = resp === 1 ? 'Sim' : (resp === 0 ? 'Não' : '—');
            const ponto = state.scores.pontosItem[item.numero];
            return `<tr>
                <td style="text-align:center;font-weight:700;color:#1e40af;">${item.numero}</td>
                <td>${escapeHtml(item.texto)}</td>
                <td>${areaTxt}</td>
                <td style="text-align:center;color:#64748b;">×${PESOS[item.numero] || 0}</td>
                <td style="text-align:center;">${respTxt}</td>
                <td style="text-align:center;font-weight:700;color:${ponto > 0 ? '#dc2626' : '#94a3b8'};">${ponto}</td>
            </tr>`;
        }).join('');
        return `
            <details class="laudo-detalhes-toggle">
                <summary>▾ Ver respostas item a item (${state.itens.length} itens)</summary>
                <table class="laudo-detalhes-tabela">
                    <thead><tr>
                        <th style="width:40px;text-align:center;">Nº</th>
                        <th>Item</th>
                        <th>Área</th>
                        <th style="text-align:center;width:50px;">Peso</th>
                        <th style="text-align:center;width:80px;">Resposta</th>
                        <th style="text-align:center;width:60px;">Pontos</th>
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
            const nomeAbreviado = state.paciente.nome_completo.toUpperCase().replace(/[^A-Z\s]/g, '').trim().substring(0, 50);
            pdf.save(`ICA - ${nomeAbreviado}_${formatarDataArquivo(new Date())}.pdf`);
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

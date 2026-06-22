// ============================================================================
// CORTEX_APP — Resultado BDI-II (laudo) — padrão visual ICA/ASSQ
// ============================================================================
// URL: ?aplicacao_id=<uuid>
//
// BDI-II (Inventário de Depressão de Beck II) — autoaplicação, 21 grupos.
// Cada grupo tem 4 afirmações próprias (item.opcoes); grava o índice escolhido (0-3).
// Escore total = soma dos 21 (0-63). Faixas: 0-11 Mínima / 12-19 Leve / 20-35 Moderada / 36-63 Severa.
// ATENÇÃO: item 9 = ideação suicida -> alerta clínico ao profissional.
// ============================================================================

(function() {
    'use strict';

    const SIGLA_ESPERADA = 'BDI-II';
    const SCORE_MAX = 63;

    // 4 faixas de gravidade [limite inferior, rótulo, cor]
    const FAIXAS = [
        { min: 0,  max: 11, slug: 'minima', label: 'Depressão mínima',   cor: '#16a34a' },
        { min: 12, max: 19, slug: 'leve',   label: 'Depressão leve',     cor: '#d97706' },
        { min: 20, max: 35, slug: 'mod',    label: 'Depressão moderada', cor: '#ea580c' },
        { min: 36, max: 63, slug: 'severa', label: 'Depressão severa',   cor: '#dc2626' }
    ];
    const ITEM_IDEACAO = 9; // grupo de ideação suicida
    const COR_INSTR = '#6366f1';

    function classificar(total) {
        for (const f of FAIXAS) if (total >= f.min && total <= f.max) return f;
        return FAIXAS[FAIXAS.length - 1];
    }

    const state = {
        aplicacaoId: null, aplicacao: null, paciente: null,
        norma: null, itens: [], correcao: null, scores: null
    };

    window.addEventListener('cortex:auth-ready', async () => {
        await CortexSidebar.render('pacientes');
        const params = new URLSearchParams(window.location.search);
        state.aplicacaoId = params.get('aplicacao_id');
        if (!state.aplicacaoId) { mostrarErro('aplicacao_id não fornecido na URL'); return; }
        try { await carregarTudo(); renderizar(); }
        catch (err) { console.error('Erro:', err); mostrarErro('Erro: ' + (err.message || 'desconhecido')); }
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
        if (instrumento.sigla !== SIGLA_ESPERADA) throw new Error(`Esperado ${SIGLA_ESPERADA}, encontrado ${instrumento.sigla}`);

        const { data: norma } = await window.cortexClient
            .from('instrumentos_normas').select('*').eq('instrumento_id', instrumento.id).eq('ativa', true).maybeSingle();
        if (!norma) throw new Error('Norma BAI não cadastrada');
        state.norma = norma;

        const { data: itens } = await window.cortexClient
            .from('instrumentos_itens').select('numero, texto, opcoes').eq('norma_id', norma.id).order('numero');
        state.itens = itens || [];

        const { data: correcao, error: errC } = await window.cortexClient
            .from('correcoes').select('*').eq('aplicacao_id', state.aplicacaoId)
            .order('created_at', { ascending: false }).limit(1).maybeSingle();
        if (errC) throw new Error('Correção: ' + errC.message);
        if (!correcao) throw new Error('Nenhuma correção encontrada');
        state.correcao = correcao;

        state.scores = calcularResultados(correcao);
        await CortexAudit.log('leitura', 'correcoes', correcao.id, { detalhes: { aplicacaoId: state.aplicacaoId, sigla: SIGLA_ESPERADA } });
    }

    function calcularResultados(correcao) {
        const respostas = (correcao?.escores_brutos || {}).respostas || {};
        const respItem = {};
        let total = 0;
        for (const item of state.itens) {
            let r = respostas[item.numero]; if (r == null) r = respostas[String(item.numero)];
            const resp = (r != null && !isNaN(r)) ? parseInt(r, 10) : null;
            respItem[item.numero] = resp;
            if (resp != null) total += resp;
        }
        const respondidos = Object.keys(respostas).length;
        return { respItem, total, classif: classificar(total), respondidos };
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
    }

    function renderLaudo() {
        const p = state.paciente;
        const idade = calcularIdade(p.data_nascimento, state.aplicacao.created_at);
        const sexoStr = p.sexo === 'M' ? 'Masculino' : (p.sexo === 'F' ? 'Feminino' : (p.sexo || '—'));
        const cl = state.scores.classif;
        const total = state.scores.total;
        const markerPct = Math.min(100, Math.max(0, (total / SCORE_MAX) * 100));

        // zonas da régua proporcionais aos cortes
        const zonas = FAIXAS.map(f => ({ w: ((f.max - f.min + 1) / (SCORE_MAX + 1)) * 100, cor: f.cor }));

        return `
        <div class="laudo">
            <div class="laudo-header">
                <div class="laudo-header-esq">
                    <div class="laudo-header-logo">E</div>
                    <div class="laudo-header-textos">
                        <div class="laudo-header-supratitulo">Relatório de Avaliação Neuropsicológica</div>
                        <h1 class="laudo-header-titulo">BDI-II</h1>
                        <div class="laudo-header-subtitulo">Inventário de Depressão de Beck II — Autoaplicação<br>21 grupos · escore 0-3 por grupo · total (0-63)</div>
                    </div>
                </div>
                <div class="laudo-header-pontuacao">
                    <div class="laudo-header-pontuacao-label">Escore Total</div>
                    <div class="laudo-header-pontuacao-valor">${total}<span style="font-size:18px;color:#94a3b8;">/${SCORE_MAX}</span></div>
                </div>
            </div>

            <div class="laudo-body">
                <div class="laudo-secao-titulo"><span class="laudo-secao-tag">1</span>Identificação</div>
                <div class="laudo-identificacao">
                    <div class="laudo-identif-item"><span class="laudo-identif-label">Paciente:</span><span class="laudo-identif-valor">${escapeHtml(p.nome_completo)}</span></div>
                    <div class="laudo-identif-item"><span class="laudo-identif-label">Idade:</span><span class="laudo-identif-valor">${idade !== null ? idade + ' anos' : '—'}</span></div>
                    <div class="laudo-identif-item"><span class="laudo-identif-label">Sexo:</span><span class="laudo-identif-valor">${escapeHtml(sexoStr)}</span></div>
                    <div class="laudo-identif-item"><span class="laudo-identif-label">Nascimento:</span><span class="laudo-identif-valor">${formatarDataBR(p.data_nascimento)}</span></div>
                    <div class="laudo-identif-item"><span class="laudo-identif-label">Avaliação:</span><span class="laudo-identif-valor">${formatarDataBR(state.aplicacao.created_at)}</span></div>
                    <div class="laudo-identif-item"><span class="laudo-identif-label">Modalidade:</span><span class="laudo-identif-valor">Autoaplicação</span></div>
                </div>

                <div class="laudo-secao-titulo"><span class="laudo-secao-tag">2</span>Escore Total e Classificação</div>
                <div class="bai-resultado-card" style="border-color:${cl.cor};">
                    <div class="bai-resultado-topo">
                        <div>
                            <div class="bai-resultado-num" style="color:${cl.cor};">${total}<span class="bai-resultado-max">/${SCORE_MAX}</span></div>
                            <div class="bai-resultado-resp">${state.scores.respondidos} de ${state.itens.length} itens respondidos</div>
                        </div>
                        <span class="bai-badge bai-badge-${cl.slug}">${cl.label}</span>
                    </div>
                    <div class="bai-regua-track">
                        ${zonas.map(z => `<div class="bai-regua-zona" style="width:${z.w}%;background:${z.cor};"></div>`).join('')}
                        <div class="bai-regua-marker" style="left:${markerPct}%;" title="${total}"></div>
                    </div>
                    <div class="bai-regua-escala"><span>0</span><span>11</span><span>19</span><span>35</span><span>63</span></div>
                    <div class="bai-faixas-legenda">
                        ${FAIXAS.map(f => `<span class="bai-leg-item"><span class="bai-leg-dot" style="background:${f.cor};"></span>${f.label} (${f.min}–${f.max})</span>`).join('')}
                    </div>
                </div>

                ${renderAlertaIdeacao()}

                <div class="bai-nota-tecnica">
                    <strong>Nota técnica:</strong> O BDI-II (Inventário de Depressão de Beck II) é um instrumento de
                    <strong>autorrelato</strong> com 21 grupos de afirmações que avaliam a intensidade de sintomas
                    depressivos na última semana. O escore total (0-63) classifica a intensidade em <strong>mínima,
                    leve, moderada ou severa</strong>. Trata-se de medida dimensional de rastreio; os resultados devem
                    ser integrados à entrevista clínica e aos demais dados da avaliação, não constituindo diagnóstico
                    isolado.
                </div>

                <div class="laudo-secao-titulo"><span class="laudo-secao-tag">3</span>Respostas por Grupo</div>
                ${renderDetalhesItens()}
            </div>

            <div class="laudo-rodape">
                <div class="laudo-rodape-esq">
                    <div class="laudo-rodape-org">Equilibrium Neuropsicologia</div>
                    <div class="laudo-rodape-tipo">Correção automatizada — BDI-II</div>
                </div>
                <div class="laudo-rodape-dir">
                    <div class="laudo-rodape-data">Documento gerado em ${formatarDataBR(new Date().toISOString())}</div>
                    <div class="laudo-rodape-confidencial">Documento confidencial — uso restrito ao profissional solicitante.</div>
                </div>
            </div>
        </div>`;
    }

    function renderDetalhesItens() {
        if (!state.itens.length) return '';
        const linhas = state.itens.map(item => {
            const resp = state.scores.respItem[item.numero];
            const opcoes = Array.isArray(item.opcoes) ? item.opcoes : [];
            const fraseEscolhida = (resp != null && opcoes[resp] !== undefined) ? opcoes[resp] : '—';
            const corResp = resp === 3 ? '#dc2626' : resp === 2 ? '#ea580c' : resp === 1 ? '#d97706' : '#16a34a';
            const ideacao = (item.numero === ITEM_IDEACAO && resp != null && resp > 0);
            return `<tr${ideacao ? ' style="background:#fef2f2;"' : ''}>
                <td style="text-align:center;font-weight:700;color:#4f46e5;">${item.numero}${ideacao ? ' <span title="Item de ideação suicida" style="color:#dc2626;">⚠</span>' : ''}</td>
                <td>${escapeHtml(fraseEscolhida)}</td>
                <td style="text-align:center;font-weight:700;color:${resp!=null?corResp:'#cbd5e1'};">${resp != null ? resp : '—'}</td>
            </tr>`;
        }).join('');
        return `
            <div class="bai-tab-itens">
                <table>
                    <thead><tr>
                        <th style="width:52px;text-align:center;">Grupo</th>
                        <th>Afirmação escolhida</th>
                        <th style="text-align:center;width:64px;">Escore</th>
                    </tr></thead>
                    <tbody>${linhas}</tbody>
                </table>
            </div>`;
    }

    // Alerta clínico: item 9 (ideação suicida) pontuado (> 0)
    function renderAlertaIdeacao() {
        const resp = state.scores.respItem[ITEM_IDEACAO];
        if (resp == null || resp <= 0) return '';
        const item = state.itens.find(i => i.numero === ITEM_IDEACAO);
        const opcoes = item && Array.isArray(item.opcoes) ? item.opcoes : [];
        const frase = opcoes[resp] !== undefined ? opcoes[resp] : '';
        return `
            <div class="bdi-alerta-ideacao">
                <div class="bdi-alerta-titulo">⚠ Atenção clínica — item de ideação suicida pontuado</div>
                <div class="bdi-alerta-corpo">
                    O grupo ${ITEM_IDEACAO} (ideação suicida) foi pontuado com escore <strong>${resp}</strong>${frase ? ' — “' + escapeHtml(frase) + '”' : ''}.
                    Recomenda-se avaliação clínica detalhada do risco e, conforme o protocolo, considerar a aplicação
                    da escala de ideação suicida (BSI) e as condutas de segurança cabíveis.
                </div>
            </div>`;
    }

    async function gerarPDF() {
        const btn = document.getElementById('btn-gerar-pdf');
        const orig = btn.textContent;
        btn.disabled = true; btn.textContent = '⏳ Gerando PDF...';
        try {
            document.body.classList.add('exportando');
            await new Promise(r => setTimeout(r, 100));
            const laudo = document.querySelector('.laudo');
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
            pdf.save(`BDI-II - ${nome}_${formatarDataArquivo(new Date())}.pdf`);
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
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    }
    function mostrarErro(msg) {
        document.getElementById('laudo-conteudo').innerHTML = `
            <div class="empty-state"><div class="empty-state-title">${escapeHtml(msg)}</div></div>`;
    }
    function escapeHtml(text) {
        if (text === null || text === undefined) return '';
        const div = document.createElement('div'); div.textContent = String(text); return div.innerHTML;
    }
})();

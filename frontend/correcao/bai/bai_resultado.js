// ============================================================================
// CORTEX_APP — Resultado BAI (laudo) — padrão visual ICA/ASSQ
// ============================================================================
// URL: ?aplicacao_id=<uuid>
//
// BAI (Inventário de Ansiedade de Beck) — autoaplicação, 21 itens, escala 0-3.
// Escore total = soma dos 21 (0-63). Sem subescalas, sem invertidos.
// Faixas (cortes no JS): 0-10 Mínima / 11-19 Leve / 20-30 Moderada / 31-63 Severa.
// Banco grava 0-3 em escores_brutos.respostas.
// ============================================================================

(function() {
    'use strict';

    const SIGLA_ESPERADA = 'BAI';
    const SCORE_MAX = 63;

    // 4 faixas de gravidade [limite inferior, rótulo, cor]
    const FAIXAS = [
        { min: 0,  max: 10, slug: 'minima', label: 'Ansiedade mínima',   cor: '#16a34a' },
        { min: 11, max: 19, slug: 'leve',   label: 'Ansiedade leve',     cor: '#d97706' },
        { min: 20, max: 30, slug: 'mod',    label: 'Ansiedade moderada', cor: '#ea580c' },
        { min: 31, max: 63, slug: 'severa', label: 'Ansiedade severa',   cor: '#dc2626' }
    ];
    const COR_INSTR = '#0ea5e9';

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
            .from('instrumentos_itens').select('numero, texto').eq('norma_id', norma.id).order('numero');
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

        return `
        <div class="laudo">
            <div class="laudo-header">
                <div class="laudo-header-esq">
                    <div class="laudo-header-logo">E</div>
                    <div class="laudo-header-textos">
                        <div class="laudo-header-supratitulo">Relatório de Avaliação Neuropsicológica</div>
                        <h1 class="laudo-header-titulo">BAI</h1>
                        <div class="laudo-header-subtitulo">Inventário de Ansiedade de Beck — Autoaplicação<br>21 itens · escala 0-3 · escore total (0-63)</div>
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

                <div class="laudo-secao-titulo"><span class="laudo-secao-tag">2</span>Seu resultado</div>
                ${renderNiveis()}

                <div class="laudo-secao-titulo"><span class="laudo-secao-tag">3</span>Como foram suas respostas</div>
                ${renderIntensidade()}

                <div class="bai-nota-tecnica">
                    <strong>Importante:</strong> este questionário é uma medida de rastreio dos sintomas de ansiedade
                    na última semana — <strong>não é um diagnóstico</strong>. Ele é uma fotografia de um momento e faz
                    parte de uma avaliação maior, conversada com seu profissional.
                </div>

                <div class="laudo-secao-titulo laudo-secao-prof"><span class="laudo-secao-tag">4</span>Detalhamento técnico <span class="laudo-secao-prof-tag">uso do profissional</span></div>
                ${renderDetalhesItens()}
            </div>

            <div class="laudo-rodape">
                <div class="laudo-rodape-esq">
                    <div class="laudo-rodape-org">Equilibrium Neuropsicologia</div>
                    <div class="laudo-rodape-tipo">Correção automatizada — BAI</div>
                </div>
                <div class="laudo-rodape-dir">
                    <div class="laudo-rodape-data">Documento gerado em ${formatarDataBR(new Date().toISOString())}</div>
                    <div class="laudo-rodape-confidencial">Documento confidencial — uso restrito ao profissional solicitante.</div>
                </div>
            </div>
        </div>`;
    }

    // Modelo 2: níveis em etapas (didático, pro paciente)
    function renderNiveis() {
        const total = state.scores.total;
        const cl = state.scores.classif;
        const cards = FAIXAS.map(f => {
            const ativo = f.slug === cl.slug;
            return `
                <div class="bai-nivel-card ${ativo ? 'ativo' : ''}" ${ativo ? `style="border-color:${f.cor};"` : ''}>
                    <div class="bai-nivel-dot" style="background:${f.cor};"></div>
                    <div class="bai-nivel-nome">${f.label.replace('Ansiedade ', '')}</div>
                    <div class="bai-nivel-faixa">${f.min} – ${f.max}</div>
                    ${ativo ? `<div class="bai-nivel-voce" style="color:${f.cor};">● seu resultado: ${total}</div>` : ''}
                </div>`;
        }).join('');
        return `
            <div class="bai-niveis-grid">${cards}</div>
            <div class="bai-nivel-expl" style="border-left-color:${cl.cor};">
                <strong>Seu nível: ${cl.label.toLowerCase()}.</strong> Sua pontuação foi <strong>${total}</strong> de ${SCORE_MAX}.
                ${textoNivel(cl.slug)}
            </div>`;
    }

    function textoNivel(slug) {
        switch (slug) {
            case 'minima': return 'Isso indica poucos sintomas de ansiedade no período avaliado.';
            case 'leve':   return 'Isso indica alguns sintomas de ansiedade que vale a pena observar.';
            case 'mod':    return 'Isso indica uma quantidade considerável de sintomas de ansiedade; vale conversar com seu profissional sobre estratégias de cuidado.';
            case 'severa': return 'Isso indica muitos sintomas de ansiedade no período; é importante conversar com seu profissional sobre os próximos passos.';
            default: return '';
        }
    }

    // Opção B: distribuição das respostas por intensidade (direto dos dados)
    function renderIntensidade() {
        const cont = [0, 0, 0, 0]; // índices 0..3
        let respondidos = 0;
        for (const item of state.itens) {
            const r = state.scores.respItem[item.numero];
            if (r != null && r >= 0 && r <= 3) { cont[r]++; respondidos++; }
        }
        const rotulos = [
            { lbl: labelResposta(0) || 'Ausente', cor: '#16a34a' },
            { lbl: labelResposta(1) || 'Leve',    cor: '#d97706' },
            { lbl: labelResposta(2) || 'Moderado',cor: '#ea580c' },
            { lbl: labelResposta(3) || 'Grave',   cor: '#dc2626' }
        ];
        const maxC = Math.max(1, ...cont);
        const linhas = rotulos.map((r, i) => {
            const w = Math.round((cont[i] / maxC) * 100);
            return `
                <div class="bai-int-row">
                    <span class="bai-int-lbl" style="color:${r.cor};">${escapeHtml(r.lbl)}</span>
                    <span class="bai-int-trk"><span class="bai-int-fill" style="width:${w}%;background:${r.cor};"></span></span>
                    <span class="bai-int-val">${cont[i]} ${cont[i] === 1 ? 'item' : 'itens'}</span>
                </div>`;
        }).join('');
        return `
            <div class="bai-intensidade">
                ${linhas}
                <div class="bai-int-nota">Cada um dos ${respondidos} itens respondidos entra em um destes níveis, conforme o quanto incomodou na última semana.</div>
            </div>`;
    }

    function renderDetalhesItens() {
        if (!state.itens.length) return '';
        const linhas = state.itens.map(item => {
            const resp = state.scores.respItem[item.numero];
            const cor = resp != null ? (FAIXAS.find(f => resp >= 0)?.cor || '#64748b') : '#cbd5e1';
            const corResp = resp === 3 ? '#dc2626' : resp === 2 ? '#ea580c' : resp === 1 ? '#d97706' : '#16a34a';
            return `<tr>
                <td style="text-align:center;font-weight:700;color:#0369a1;">${item.numero}</td>
                <td>${escapeHtml(item.texto)}</td>
                <td style="text-align:center;font-weight:700;color:${resp!=null?corResp:'#cbd5e1'};">${resp != null ? resp : '—'}</td>
                <td>${escapeHtml(labelResposta(resp))}</td>
            </tr>`;
        }).join('');
        return `
            <div class="bai-tab-itens">
                <table>
                    <thead><tr>
                        <th style="width:42px;text-align:center;">Nº</th><th>Sintoma</th>
                        <th style="text-align:center;width:56px;">Resp.</th>
                        <th style="width:150px;">Intensidade</th>
                    </tr></thead>
                    <tbody>${linhas}</tbody>
                </table>
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
            pdf.save(`BAI - ${nome}_${formatarDataArquivo(new Date())}.pdf`);
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

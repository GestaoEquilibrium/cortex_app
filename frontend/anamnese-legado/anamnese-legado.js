// ============================================================================
// CORTEX_APP — Sprint 60 — anamnese-legado.js
// Visualizador READ-ONLY das anamneses antigas (tabela anamneses_remotas).
// ============================================================================
// URL: /frontend/anamnese-legado/index.html?id=<anamnese_remota_id>
//   1. Carrega a anamneses_remotas + dados do paciente
//   2. Usa CortexAnamneseRemotaPerguntas pra traduzir os IDs salvos em rótulos
//   3. Renderiza na tela + permite baixar PDF
//
// É somente leitura — não edita, não reenvia. Serve pra recuperar anamneses
// preenchidas antes da migração para o sistema novo (Sprint 55+).
// ============================================================================

(function() {
    'use strict';

    const state = {
        id: null,
        registro: null,
        paciente: null,
        secoes: null
    };

    window.addEventListener('cortex:auth-ready', init);

    async function init() {
        await CortexSidebar.render('pacientes');

        const params = new URLSearchParams(window.location.search);
        state.id = params.get('id');
        if (!state.id) {
            return erro('Anamnese não identificada (falta o parâmetro id).');
        }

        try {
            // 1) Carrega a anamnese remota
            const { data: reg, error: errReg } = await window.cortexClient
                .from('anamneses_remotas')
                .select('id, paciente_id, status, respostas, quem_respondeu, nome_respondente, data_envio, data_resposta')
                .eq('id', state.id)
                .single();
            if (errReg) throw errReg;
            if (!reg) return erro('Anamnese não encontrada.');
            state.registro = reg;

            // 2) Carrega o paciente
            const { data: pac, error: errPac } = await window.cortexClient
                .from('vw_pacientes_lista')
                .select('id, nome_completo, data_nascimento, idade_anos, sexo')
                .eq('id', reg.paciente_id)
                .single();
            if (errPac) throw errPac;
            state.paciente = pac || {};

            // Ajusta link de voltar
            document.getElementById('link-voltar').href =
                `../pacientes/pasta.html?id=${reg.paciente_id}`;

            // 3) Monta o formulário da faixa correta pra traduzir IDs
            const idadeMeses = calcularIdadeMeses(pac?.data_nascimento);
            const faixa = window.CortexAnamneseRemotaPerguntas.detectarFaixa(idadeMeses);
            state.secoes = window.CortexAnamneseRemotaPerguntas.montarFormulario(faixa);

            render();
        } catch (e) {
            console.error('[anamnese-legado]', e);
            erro('Erro ao carregar: ' + (e.message || e));
        }
    }

    function calcularIdadeMeses(dataNasc) {
        if (!dataNasc) return null;
        const nasc = new Date(dataNasc);
        const hoje = new Date();
        return (hoje.getFullYear() - nasc.getFullYear()) * 12 + (hoje.getMonth() - nasc.getMonth());
    }

    // ─── Render ─────────────────────────────────────────────────────────────
    function render() {
        const p = state.paciente;
        const r = state.registro;
        const dn = p.data_nascimento ? new Date(p.data_nascimento).toLocaleDateString('pt-BR') : '—';
        const idade = (p.idade_anos != null) ? `${p.idade_anos} anos` : '';
        const dataResp = r.data_resposta ? new Date(r.data_resposta).toLocaleDateString('pt-BR') : '—';
        const respondente = r.nome_respondente || r.quem_respondeu || '—';

        const seccoesHtml = state.secoes.map(renderSecao).filter(Boolean).join('');

        document.getElementById('alg-conteudo').innerHTML = `
            <div class="page-header">
                <div class="page-title">
                    <h1>Anamnese anterior</h1>
                    <p>Formulário remoto preenchido antes da migração — somente leitura.</p>
                </div>
                <div class="page-actions">
                    <button id="btn-pdf" class="btn btn-primary">📄 Baixar PDF</button>
                </div>
            </div>

            <div class="alg-cartao-paciente">
                <div class="alg-cp-item"><span>Paciente</span><strong>${escapeHtml(p.nome_completo || '—')}</strong></div>
                <div class="alg-cp-item"><span>Nascimento</span><strong>${escapeHtml(dn)}${idade ? ' ('+escapeHtml(idade)+')' : ''}</strong></div>
                <div class="alg-cp-item"><span>Respondido por</span><strong>${escapeHtml(respondente)}</strong></div>
                <div class="alg-cp-item"><span>Data da resposta</span><strong>${escapeHtml(dataResp)}</strong></div>
            </div>

            <div class="alg-secoes">
                ${seccoesHtml || '<p class="alg-vazio">Esta anamnese não possui respostas registradas.</p>'}
            </div>
        `;

        document.getElementById('btn-pdf').addEventListener('click', baixarPDF);
    }

    function renderSecao(sec) {
        const respostas = state.registro.respostas || {};
        // monta lista de campos respondidos nesta seção
        const itens = (sec.campos || []).map(campo => {
            const valor = respostas[campo.id];
            if (valor === undefined || valor === null || valor === '' ||
                (Array.isArray(valor) && valor.length === 0)) {
                return null;  // não exibe campo sem resposta
            }
            return { label: campo.label, valor: formatarValor(valor) };
        }).filter(Boolean);

        if (itens.length === 0) return '';  // seção inteira vazia: pula

        const linhas = itens.map(it => `
            <div class="alg-campo">
                <div class="alg-campo-label">${escapeHtml(it.label)}</div>
                <div class="alg-campo-valor">${it.valor}</div>
            </div>
        `).join('');

        return `
            <div class="alg-secao">
                <h2 class="alg-secao-titulo">${escapeHtml(sec.titulo)}</h2>
                ${linhas}
            </div>
        `;
    }

    function formatarValor(v) {
        if (Array.isArray(v)) {
            return v.map(x => `<span class="alg-tag">${escapeHtml(x)}</span>`).join(' ');
        }
        // texto livre: preserva quebras de linha
        return escapeHtml(String(v)).replace(/\n/g, '<br>');
    }

    // ─── PDF ─────────────────────────────────────────────────────────────────
    function baixarPDF() {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ unit: 'mm', format: 'a4' });

        const NAVY = '#0c1f3f';
        const AZUL_CLARO = '#e8eef7';
        const MG = 15;
        const LARG = 180;
        const PAGE_H = 297;
        let y = 15;

        const p = state.paciente;
        const r = state.registro;

        function checkQuebra(alturaNecessaria) {
            if (y + alturaNecessaria > PAGE_H - 15) {
                doc.addPage();
                y = 15;
            }
        }

        // Cabeçalho
        doc.setFillColor(NAVY);
        doc.rect(0, 0, 210, 10, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('CORTEX  Equilibrium Med Center', MG, 6.8);
        y = 18;

        doc.setTextColor(NAVY);
        doc.setFontSize(15);
        doc.setFont('helvetica', 'bold');
        doc.text('Anamnese anterior (formulário remoto)', MG, y);
        y += 9;

        // Bloco identificação
        const dn = p.data_nascimento ? new Date(p.data_nascimento).toLocaleDateString('pt-BR') : '—';
        const idade = (p.idade_anos != null) ? ` (${p.idade_anos} anos)` : '';
        const dataResp = r.data_resposta ? new Date(r.data_resposta).toLocaleDateString('pt-BR') : '—';
        const respondente = r.nome_respondente || r.quem_respondeu || '—';

        doc.setFillColor(AZUL_CLARO);
        doc.rect(MG, y, LARG, 26, 'F');
        doc.setTextColor(NAVY);
        doc.setFontSize(10);

        doc.setFont('helvetica', 'bold'); doc.text('Paciente:', MG + 3, y + 6);
        doc.setFont('helvetica', 'normal'); doc.text(String(p.nome_completo || '—'), MG + 22, y + 6);

        doc.setFont('helvetica', 'bold'); doc.text('Nascimento:', MG + 3, y + 12);
        doc.setFont('helvetica', 'normal'); doc.text(dn + idade, MG + 28, y + 12);

        doc.setFont('helvetica', 'bold'); doc.text('Respondido por:', MG + 3, y + 18);
        doc.setFont('helvetica', 'normal'); doc.text(String(respondente), MG + 34, y + 18);

        doc.setFont('helvetica', 'bold'); doc.text('Data da resposta:', MG + 3, y + 24);
        doc.setFont('helvetica', 'normal'); doc.text(String(dataResp), MG + 36, y + 24);

        y += 32;

        const respostas = r.respostas || {};

        state.secoes.forEach(sec => {
            const itens = (sec.campos || []).map(campo => {
                const valor = respostas[campo.id];
                if (valor === undefined || valor === null || valor === '' ||
                    (Array.isArray(valor) && valor.length === 0)) return null;
                const valorStr = Array.isArray(valor) ? valor.join(', ') : String(valor);
                return { label: campo.label, valor: valorStr };
            }).filter(Boolean);

            if (itens.length === 0) return;

            // título da seção
            checkQuebra(12);
            doc.setFillColor(NAVY);
            doc.rect(MG, y, LARG, 6.5, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.text(sec.titulo, MG + 2, y + 4.5);
            y += 9;

            itens.forEach(it => {
                doc.setTextColor(NAVY);
                doc.setFontSize(9.5);
                doc.setFont('helvetica', 'bold');
                const labelLines = doc.splitTextToSize(it.label, LARG);
                checkQuebra(labelLines.length * 4.5 + 4);
                doc.text(labelLines, MG, y);
                y += labelLines.length * 4.5 + 1;

                doc.setTextColor(60, 60, 60);
                doc.setFont('helvetica', 'normal');
                const valorLines = doc.splitTextToSize(it.valor, LARG);
                checkQuebra(valorLines.length * 4.5 + 4);
                doc.text(valorLines, MG, y);
                y += valorLines.length * 4.5 + 4;
            });

            y += 2;
        });

        // Rodapé com numeração
        const totalPaginas = doc.internal.getNumberOfPages();
        for (let i = 1; i <= totalPaginas; i++) {
            doc.setPage(i);
            doc.setTextColor(150, 150, 150);
            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.text(
                `Anamnese anterior — ${p.nome_completo || ''} — Página ${i} de ${totalPaginas}`,
                MG, PAGE_H - 8
            );
        }

        const nomeArq = `Anamnese_anterior_${(p.nome_completo || 'paciente').replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
        doc.save(nomeArq);
    }

    // ─── Util ─────────────────────────────────────────────────────────────────
    function erro(msg) {
        document.getElementById('alg-conteudo').innerHTML = `
            <div class="alg-erro">
                <div class="alg-erro-icone">⚠️</div>
                <h1>Não foi possível abrir</h1>
                <p>${escapeHtml(msg)}</p>
            </div>
        `;
    }

    function escapeHtml(t) {
        if (t == null) return '';
        const div = document.createElement('div');
        div.textContent = String(t);
        return div.innerHTML;
    }
})();

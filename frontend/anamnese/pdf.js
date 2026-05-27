// ============================================================================
// CORTEX_APP — Sprint 18 — pdf.js
// Gerador de PDF da anamnese (paleta navy CORTEX, estilo Sprint 16).
//
// Uso:
//   await window.CortexAnamnesePDF.gerar(anamneseId);
//
// Requer jsPDF carregado via CDN (já incluído no anamnese.html).
// ============================================================================

(function() {
    'use strict';

    const NAVY = '#0c1f3f';
    const AZUL_CLARO = '#d6eaf8';
    const CINZA = '#6c757d';

    // -------------------------------------------------------------------
    // Carregar a anamnese
    // -------------------------------------------------------------------
    async function carregarAnamnese(anamneseId) {
        const cols = window.CortexAnamneseForms.colunasJsonb();
        const select = ['id', 'paciente_id', 'faixa_etaria', 'status',
                       'created_at', 'updated_at', 'preenchido_por',
                       ...cols].join(',');

        const { data, error } = await window.cortexClient
            .from('anamneses')
            .select(select)
            .eq('id', anamneseId)
            .single();
        if (error || !data) throw new Error('Anamnese não encontrada');

        // Busca paciente
        const { data: pac } = await window.cortexClient
            .from('vw_pacientes_lista')
            .select('*')
            .eq('id', data.paciente_id)
            .single();
        data._paciente = pac;

        // Busca profissional (quem preencheu/criou)
        if (data.preenchido_por) {
            const { data: prof } = await window.cortexClient
                .from('profissionais')
                .select('nome_completo, crp')
                .eq('id', data.preenchido_por)
                .maybeSingle();
            data._profissional = prof;
        }

        return data;
    }

    // -------------------------------------------------------------------
    // Formatador de valor por tipo
    // -------------------------------------------------------------------
    function formatarValor(f, valor, detalhe, other) {
        if (valor === null || valor === undefined || valor === '') {
            if (f.tp === 'cks' && (!valor || valor.length === 0)) return '— (não respondido)';
            return '— (não respondido)';
        }

        switch (f.tp) {
            case 'date':
                try { return new Date(valor).toLocaleDateString('pt-BR'); }
                catch (e) { return String(valor); }

            case 'num':
                return String(valor);

            case 'cks':
                if (Array.isArray(valor)) return valor.length ? valor.join(', ') : '— (não respondido)';
                return String(valor);

            case 'sn':
                return String(valor);

            case 'sn_ta':
                if (valor === 'Sim' && detalhe) return 'Sim — ' + detalhe;
                return String(valor);

            case 'sel_other':
                if (valor === 'Outro' && other) return 'Outro — ' + other;
                return String(valor);

            default:
                return String(valor);
        }
    }

    // -------------------------------------------------------------------
    // Geração
    // -------------------------------------------------------------------
    async function gerar(anamneseId) {
        if (!window.jspdf || !window.jspdf.jsPDF) {
            throw new Error('jsPDF não carregado');
        }

        const anam = await carregarAnamnese(anamneseId);
        const form = window.CortexAnamneseForms.getForm(anam.faixa_etaria);
        if (!form) throw new Error('Faixa etária inválida: ' + anam.faixa_etaria);

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'a4');

        const W = doc.internal.pageSize.getWidth();
        const H = doc.internal.pageSize.getHeight();
        const MG = 15;
        const LARG = W - 2 * MG;

        let y = MG;
        let pagina = 1;

        function headerTopo() {
            doc.setFillColor(NAVY);
            doc.rect(0, 0, W, 14, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            doc.text('CORTEX', MG, 9);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.text('Equilibrium Med Center', W - MG, 9, { align: 'right' });
        }

        function footerRodape() {
            doc.setFontSize(8);
            doc.setTextColor(120);
            const p = anam._paciente || {};
            doc.text(
                'Anamnese — ' + (p.nome_completo || 'paciente') + ' — Página ' + pagina,
                W / 2, H - 7, { align: 'center' }
            );
        }

        function novaPagina() {
            footerRodape();
            doc.addPage();
            pagina++;
            headerTopo();
            y = 20;
        }

        function checkQuebra(altura) {
            if (y + altura > H - 14) novaPagina();
        }

        // ---- CAPA ----
        headerTopo();
        y = 22;

        doc.setTextColor(NAVY);
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text('Anamnese Neuropsicológica', MG, y);
        y += 7;

        doc.setFontSize(12);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(80);
        doc.text(form.tt + ' — ' + form.rg, MG, y);
        y += 9;

        // Bloco azul claro com identificação
        const pac = anam._paciente || {};
        const dn = pac.data_nascimento ? new Date(pac.data_nascimento).toLocaleDateString('pt-BR') : '—';
        const idade = pac.idade_anos !== null && pac.idade_anos !== undefined ? pac.idade_anos + ' anos' : '';

        // Sprint 55: bloco mais alto pra acomodar dados do médico solicitante
        doc.setFillColor(AZUL_CLARO);
        doc.rect(MG, y, LARG, 40, 'F');

        doc.setTextColor(NAVY);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('Paciente:', MG + 3, y + 6);
        doc.setFont('helvetica', 'normal');
        doc.text(pac.nome_completo || '—', MG + 22, y + 6);

        doc.setFont('helvetica', 'bold');
        doc.text('Nascimento:', MG + 3, y + 12);
        doc.setFont('helvetica', 'normal');
        doc.text(dn + (idade ? ' (' + idade + ')' : ''), MG + 28, y + 12);

        // Sprint 55: médico solicitante (puxado do cadastro)
        const medicoLinha = pac.medico_referencia
            ? 'Dr(a). ' + pac.medico_referencia + (pac.medico_crm ? ' — CRM ' + pac.medico_crm : '')
            : '—';
        doc.setFont('helvetica', 'bold');
        doc.text('Médico solicitante:', MG + 3, y + 18);
        doc.setFont('helvetica', 'normal');
        doc.text(medicoLinha, MG + 38, y + 18);

        const clinicaLinha = [pac.medico_clinica, pac.medico_telefone].filter(Boolean).join(' · ') || '—';
        doc.setFont('helvetica', 'bold');
        doc.text('Clínica / Telefone:', MG + 3, y + 24);
        doc.setFont('helvetica', 'normal');
        doc.text(clinicaLinha, MG + 38, y + 24);

        const statusLabel = anam.status === 'concluida' ? 'Concluída' : 'Em andamento';
        doc.setFont('helvetica', 'bold');
        doc.text('Status:', MG + 3, y + 30);
        doc.setFont('helvetica', 'normal');
        doc.text(statusLabel, MG + 17, y + 30);

        doc.setFont('helvetica', 'bold');
        doc.text('Gerado em:', MG + 3, y + 36);
        doc.setFont('helvetica', 'normal');
        const hoje = new Date();
        doc.text(hoje.toLocaleDateString('pt-BR') + ' às ' + hoje.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'}), MG + 26, y + 36);

        y += 46;

        // ---- SEÇÕES ----
        form.sects.forEach((sec) => {
            // Sprint 55: pula seções puramente informativas (boas-vindas)
            if (!sec.col) return;

            const dadosCol = anam[sec.col] || {};
            checkQuebra(12);

            // Faixa navy com título da seção
            doc.setFillColor(NAVY);
            doc.rect(MG, y, LARG, 6.5, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.text((sec.ic || '') + ' ' + sec.tt, MG + 2, y + 4.5);
            y += 9;

            (sec.g2 || sec.g3 || []).forEach((f) => {
                // Sprint 55: pula campos tipo 'info' (texto estático sem resposta)
                if (f.tp === 'info') return;

                const valor = dadosCol[f.id];
                const detalhe = dadosCol[f.id + '_det'];
                const other = dadosCol[f.id + '_other'];

                // Label
                doc.setTextColor(NAVY);
                doc.setFontSize(9);
                doc.setFont('helvetica', 'bold');
                const labelLines = doc.splitTextToSize(f.lb, LARG);
                checkQuebra(labelLines.length * 3.6 + 5);
                doc.text(labelLines, MG, y);
                y += labelLines.length * 3.6 + 0.8;

                // Valor
                doc.setTextColor(40);
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(9.5);
                const txt = formatarValor(f, valor, detalhe, other);
                const txtLines = doc.splitTextToSize(txt, LARG - 4);
                checkQuebra(txtLines.length * 4 + 2);

                // Tarja lateral azul claro
                doc.setDrawColor(AZUL_CLARO);
                doc.setLineWidth(0.8);
                doc.line(MG, y, MG, y + txtLines.length * 4);
                doc.text(txtLines, MG + 3, y + 3);
                y += txtLines.length * 4 + 2.5;
            });

            y += 3;
        });

        // ---- ASSINATURA ----
        checkQuebra(28);
        y += 6;
        doc.setDrawColor(180);
        doc.setLineWidth(0.3);
        doc.line(MG + 30, y, W - MG - 30, y);
        y += 5;
        doc.setFontSize(9);
        doc.setTextColor(80);
        doc.setFont('helvetica', 'normal');
        const prof = anam._profissional || {};
        doc.text(prof.nome_completo || 'Profissional responsável', W/2, y, { align: 'center' });
        y += 4;
        if (prof.crp) {
            doc.text('CRP ' + prof.crp, W/2, y, { align: 'center' });
        }

        // ---- Rodapé última página ----
        footerRodape();

        // ---- Download ----
        const nomeArquivo = 'Anamnese_' + (pac.nome_completo || 'paciente').replace(/\W+/g, '_') +
            '_' + new Date().toISOString().slice(0, 10) + '.pdf';
        doc.save(nomeArquivo);

        return { ok: true, nome: nomeArquivo };
    }

    window.CortexAnamnesePDF = { gerar };
})();

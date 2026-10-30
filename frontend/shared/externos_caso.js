// ============================================================================
// CORTEX_APP — Profissionais externos do paciente
// ----------------------------------------------------------------------------
// Profissional externo = alguém de fora da clínica (médico, coordenação da
// escola, psicólogo...) que acompanha ou pediu a avaliação. Tem login próprio,
// vê só os pacientes atribuídos a ele e, em cada um, só as abas liberadas.
// Quem decide o que ele vê é o banco (vinculos_paciente_externo + travas de
// RLS); aqui é só a tela.
//
// API: window.CortexExternosCaso
//   .ABAS, .PADRAO
//   .ehExterno()
//   .minhasAbas(pacienteId)            -> ['correcao','laudo'] | null
//   .listar(pacienteId)                -> vínculos do paciente (admin)
//   .gerenciar(pacienteId, nome, aoMudar)
//   .discutir(pacienteId)              -> abre a conversa do caso no chat
// ============================================================================

window.CortexExternosCaso = (function () {
    'use strict';

    const ABAS = [
        ['visao_geral', 'Visão geral (dados de contato)'],
        ['evolucao',    'Evolução'],
        ['anamnese',    'Anamnese'],
        ['hipoteses',   'Hipóteses'],
        ['checklist',   'Checklist'],
        ['bateria',     'Bateria'],
        ['correcao',    'Correção (resultados dos testes)'],
        ['laudo',       'Laudo'],
        ['documentos',  'Documentos'],
        ['devolutiva',  'Devolutiva']
    ];
    const PADRAO = ['correcao', 'laudo'];

    const c = () => window.cortexClient;
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, ch =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    const toast = (m, t) => window.CortexUI && window.CortexUI.toast(m, t || 'info');
    const audit = (acao, id, pacienteId, detalhes) => {
        try { window.CortexAudit && window.CortexAudit.log(acao, 'vinculos_paciente_externo', id, { pacienteId, detalhes }); } catch (e) {}
    };

    function raizApp() {
        const p = window.location.pathname, i = p.indexOf('/frontend/');
        return i >= 0 ? p.substring(0, i + '/frontend/'.length) : '/';
    }

    function ehExterno() {
        return (window.cortexProfissional && window.cortexProfissional.perfil) === 'profissional_externo';
    }

    // ── estilos (uma vez) ─────────────────────────────────────────────────
    function estilos() {
        if (document.getElementById('cx-extcaso-css')) return;
        const st = document.createElement('style');
        st.id = 'cx-extcaso-css';
        st.textContent = `
            .xc-aviso{background:#EEF4FF;border:1px solid #D6E2FF;color:#1E3A8A;border-radius:12px;padding:11px 14px;font-size:13px;line-height:1.55;margin-bottom:16px}
            .xc-tit{font-size:11px;font-weight:750;letter-spacing:.06em;text-transform:uppercase;color:#64748b;margin:4px 0 8px}
            .xc-item{border:1px solid #e2e8f0;border-radius:14px;padding:12px 14px;margin-bottom:10px;background:#fff}
            .xc-item-topo{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:8px}
            .xc-nome{font-weight:700;font-size:14px;color:#14213A}
            .xc-sub{font-size:12px;color:#94a3b8}
            .xc-abas{display:flex;flex-wrap:wrap;gap:6px}
            .xc-aba{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border:1px solid #e2e8f0;border-radius:99px;font-size:12.5px;cursor:pointer;background:#f8fafc;color:#475569;user-select:none}
            .xc-aba input{width:auto;margin:0}
            .xc-aba.on{background:#E6F7F8;border-color:#9EDDE2;color:#0E6E75;font-weight:650}
            .xc-mini{border:1px solid #e2e8f0;background:#f8fafc;color:#475569;border-radius:9px;padding:5px 10px;font-size:12px;font-weight:650;cursor:pointer;white-space:nowrap}
            .xc-mini.perigo:hover{background:#fee2e2;color:#dc2626;border-color:#fecaca}
            .xc-campo{margin:14px 0 10px}
            .xc-campo label.xc-l{display:block;font-size:12px;font-weight:700;color:#475569;margin-bottom:6px}
            .xc-campo select{width:100%;padding:9px 11px;border:1px solid #e2e8f0;border-radius:10px;font-size:14px;background:#fff}
            .xc-vazio{padding:14px;border:1px dashed #cbd5e1;border-radius:12px;color:#64748b;font-size:13px;line-height:1.55;text-align:center}
            .xc-caso{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border-radius:14px;margin-bottom:16px;
                     background:linear-gradient(135deg,#14254A 0%,#22346B 55%,#2E3F86 100%);color:#fff}
            .xc-caso small{display:block;color:#8FE3E8;font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase}
            .xc-caso button{border:none;background:#fff;color:#14254A;font-weight:750;border-radius:10px;padding:8px 12px;cursor:pointer;white-space:nowrap}
        `;
        document.head.appendChild(st);
    }

    function chipsAbas(marcadas, nome) {
        const set = new Set(marcadas || []);
        return `<div class="xc-abas">${ABAS.map(([v, l]) => `
            <label class="xc-aba ${set.has(v) ? 'on' : ''}">
                <input type="checkbox" name="${esc(nome)}" value="${v}" ${set.has(v) ? 'checked' : ''}> ${esc(l)}
            </label>`).join('')}</div>`;
    }
    function lerAbas(raiz, nome) {
        return [...raiz.querySelectorAll(`input[name="${nome}"]:checked`)].map(i => i.value);
    }
    function ligarChips(raiz) {
        raiz.querySelectorAll('.xc-aba input').forEach(i => i.addEventListener('change', () =>
            i.closest('.xc-aba').classList.toggle('on', i.checked)));
    }

    // ── dados ────────────────────────────────────────────────────────────
    async function minhasAbas(pacienteId) {
        const eu = window.cortexProfissional && window.cortexProfissional.id;
        if (!eu) return null;
        const { data, error } = await c().from('vinculos_paciente_externo')
            .select('abas').eq('paciente_id', pacienteId).eq('profissional_id', eu).eq('ativo', true).maybeSingle();
        if (error) { console.warn('[externos] minhasAbas:', error.message); return null; }
        return data ? (data.abas || []) : null;
    }

    async function listar(pacienteId) {
        const { data, error } = await c().from('vinculos_paciente_externo')
            .select('id, abas, ativo, criado_em, profissional:profissionais!vinculos_paciente_externo_profissional_id_fkey(id, nome_completo, email, crp, especialidade, ativo)')
            .eq('paciente_id', pacienteId).order('criado_em');
        if (error) { console.warn('[externos] listar:', error.message); return []; }
        return data || [];
    }

    async function cadastrados() {
        const { data, error } = await c().from('profissionais')
            .select('id, nome_completo, email, crp, especialidade')
            .eq('perfil', 'profissional_externo').eq('ativo', true).order('nome_completo');
        if (error) throw error;
        return data || [];
    }

    // ── janela de gerenciar (admin) ──────────────────────────────────────
    async function gerenciar(pacienteId, nomePaciente, aoMudar) {
        if (!window.CortexPop) { toast('Recarregue a página.', 'danger'); return; }
        estilos();
        let vinculos, todos;
        try {
            [vinculos, todos] = await Promise.all([listar(pacienteId), cadastrados()]);
        } catch (err) {
            toast('Erro ao abrir: ' + (err.message || ''), 'danger');
            return;
        }
        const ja = new Set(vinculos.map(v => v.profissional && v.profissional.id));
        const disponiveis = todos.filter(p => !ja.has(p.id));

        const atuais = vinculos.length ? `
            <div class="xc-tit">Quem já acompanha este paciente</div>
            ${vinculos.map(v => {
                const p = v.profissional || {};
                const sub = [p.especialidade, p.crp, p.email].filter(Boolean).join(' · ');
                return `
                <div class="xc-item" data-vinc="${v.id}">
                    <div class="xc-item-topo">
                        <div>
                            <div class="xc-nome">${esc(p.nome_completo || '—')}${p.ativo === false ? ' <span class="xc-sub">(inativo)</span>' : ''}</div>
                            ${sub ? `<div class="xc-sub">${esc(sub)}</div>` : ''}
                        </div>
                        <button class="xc-mini perigo" data-remover="${v.id}">Remover</button>
                    </div>
                    ${chipsAbas(v.abas, 'abas-' + v.id)}
                </div>`;
            }).join('')}` : '';

        const novo = disponiveis.length ? `
            <div class="xc-campo">
                <label class="xc-l">Atribuir a</label>
                <select id="xc-prof">
                    ${disponiveis.map(p => `<option value="${p.id}">${esc(p.nome_completo)}${p.especialidade ? ' — ' + esc(p.especialidade) : ''}</option>`).join('')}
                </select>
            </div>
            <div class="xc-campo">
                <label class="xc-l">Abas que ele poderá ver</label>
                ${chipsAbas(PADRAO, 'xc-novo')}
            </div>`
            : `<div class="xc-vazio">${todos.length
                ? 'Todos os profissionais externos cadastrados já acompanham este paciente.'
                : 'Nenhum profissional externo cadastrado ainda.<br>Cadastre em <strong>Configurações → Profissionais → + Profissional externo</strong>.'}</div>`;

        const janela = window.CortexPop.abrir({
            titulo: 'Profissionais externos',
            subtitulo: nomePaciente || '',
            tone: 'blue',
            tamanho: 'md',
            persistente: true,
            html: `
                <div class="xc-aviso">
                    Quem é de fora da clínica (médico, escola, psicólogo...) entra no CORTEX com o próprio login,
                    vê só os pacientes atribuídos a ele e só as abas marcadas. Não altera nada.
                    O padrão é ver a <strong>Correção</strong> e o <strong>Laudo</strong>.
                    <a href="../ajuda/ajuda.html?guia=externos-clinica" style="font-weight:700; color:#2F6FED;">Ver instruções</a>
                </div>
                ${vinculos.length ? `
                <div class="xc-caso">
                    <div><small>Conversa do caso</small>Externos deste paciente + Wessilon</div>
                    <button id="xc-discutir">💬 Vamos discutir o caso!</button>
                </div>` : ''}
                ${atuais}
                ${novo}`,
            rodape: disponiveis.length
                ? [{ label: 'Fechar', classe: 'btn-secondary' },
                   { label: 'Atribuir paciente', classe: 'btn-primary', fechar: false, onClick: (j) => atribuir(j) }]
                : [{ label: 'Fechar', classe: 'btn-secondary' }]
        });
        const corpo = janela.corpo;
        ligarChips(corpo);

        const refazer = () => { janela.fecharJanela(); if (aoMudar) aoMudar(); gerenciar(pacienteId, nomePaciente, aoMudar); };

        async function atribuir(j) {
            const prof = corpo.querySelector('#xc-prof')?.value;
            const abas = lerAbas(corpo, 'xc-novo');
            if (!prof) return false;
            if (!abas.length) { toast('Marque pelo menos uma aba.', 'danger'); return false; }
            const { data, error } = await c().from('vinculos_paciente_externo').insert({
                paciente_id: pacienteId, profissional_id: prof, abas,
                criado_por: (window.cortexProfissional || {}).id || null
            }).select('id').single();
            if (error) { toast('Erro ao atribuir: ' + (error.message || ''), 'danger'); return false; }
            audit('criacao', data.id, pacienteId, { operacao: 'atribuir_externo', profissional_id: prof, abas });
            toast('Paciente atribuído.', 'success');
            refazer();
            return false;
        }

        // trocar abas de quem já está
        corpo.querySelectorAll('[data-vinc]').forEach(box => {
            const id = box.dataset.vinc;
            box.querySelectorAll('input[type=checkbox]').forEach(inp => inp.addEventListener('change', async () => {
                const abas = lerAbas(box, 'abas-' + id);
                if (!abas.length) {
                    inp.checked = true; inp.closest('.xc-aba').classList.add('on');
                    toast('Deixe pelo menos uma aba. Para tirar o acesso, use Remover.', 'info');
                    return;
                }
                const { error } = await c().from('vinculos_paciente_externo').update({ abas }).eq('id', id);
                if (error) { toast('Erro ao salvar: ' + (error.message || ''), 'danger'); return; }
                audit('edicao', id, pacienteId, { operacao: 'abas_externo', abas });
                toast('Abas salvas.', 'success');
                if (aoMudar) aoMudar();
            }));
        });

        corpo.querySelectorAll('[data-remover]').forEach(b => b.addEventListener('click', async () => {
            const ok = window.CortexPop.confirmar
                ? await window.CortexPop.confirmar({ titulo: 'Remover acesso?', texto: 'Ele deixa de ver este paciente na hora e sai da conversa do caso.', tone: 'red', labelOk: 'Remover' })
                : confirm('Remover o acesso deste profissional a este paciente?');
            if (!ok) return;
            const { error } = await c().from('vinculos_paciente_externo').delete().eq('id', b.dataset.remover);
            if (error) { toast('Erro ao remover: ' + (error.message || ''), 'danger'); return; }
            audit('delecao', b.dataset.remover, pacienteId, { operacao: 'remover_externo' });
            toast('Acesso removido.', 'success');
            refazer();
        }));

        const bd = corpo.querySelector('#xc-discutir');
        if (bd) bd.addEventListener('click', () => discutir(pacienteId));
    }

    // ── "Vamos discutir o caso!" ─────────────────────────────────────────
    async function discutir(pacienteId) {
        if (window.cortexVerComo) { toast('No "ver como" o chat fica fechado.', 'info'); return; }
        try {
            const { data, error } = await c().rpc('caso_discutir', { p_paciente: pacienteId });
            if (error) throw error;
            if (!data || !data.ok) {
                const msg = {
                    sem_externos: 'Este paciente ainda não tem profissional externo atribuído.',
                    sem_acesso: 'Você não tem acesso à conversa deste caso.'
                }[data && data.erro] || 'Não deu para abrir a conversa.';
                toast(msg, 'danger');
                return;
            }
            window.location.href = raizApp() + 'chat/chat.html?conversa=' + encodeURIComponent(data.conversa_id);
        } catch (err) {
            console.error('[externos] discutir:', err);
            toast('Erro ao abrir a conversa: ' + (err.message || ''), 'danger');
        }
    }

    return { ABAS, PADRAO, ehExterno, minhasAbas, listar, gerenciar, discutir };
})();

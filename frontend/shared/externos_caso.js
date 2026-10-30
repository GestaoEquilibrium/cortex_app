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
            .xc-pedido{border:1px solid #FED7AA;background:#FFF7ED;border-radius:14px;padding:12px 14px;margin-bottom:10px}
            .xc-pedido .xc-msg{font-size:13px;color:#7C2D12;background:#fff;border-radius:10px;padding:8px 10px;margin:8px 0;border:1px solid #FDE2C4}
            .xc-pedido-acoes{display:flex;gap:8px;justify-content:flex-end;margin-top:10px;flex-wrap:wrap}
            .xc-ok{border:none;background:#16A34A;color:#fff;border-radius:9px;padding:7px 12px;font-weight:700;font-size:12.5px;cursor:pointer}
            .xc-ok:hover{filter:brightness(1.07)}
            .xc-link{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
            .xc-link input{flex:1;min-width:220px;padding:9px 11px;border:1px solid #e2e8f0;border-radius:10px;font-size:13px;background:#f8fafc;color:#334155}
            .xc-outros{margin-top:26px}
            .xc-outros-tit{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:12px}
            .xc-outros-tit h3{margin:0;font-size:16px;font-weight:750}
            .xc-outros-tit span{font-size:13px;color:#64748b}
            .xc-grade{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px}
            .xc-pac{position:relative;display:flex;flex-direction:column;gap:12px;padding:16px;border-radius:16px;background:#fff;border:1px dashed #CBD5E1}
            .xc-pac-topo{display:flex;align-items:center;gap:12px}
            .xc-pac-av{width:44px;height:44px;border-radius:50%;display:grid;place-items:center;font-weight:800;color:#475569;background:#F1F5F9;flex-shrink:0}
            .xc-pac-nome{font-weight:700;color:#14213A;font-size:14.5px;line-height:1.3}
            .xc-pac-sub{font-size:12.5px;color:#64748b}
            .xc-cad{position:absolute;top:12px;right:12px;font-size:15px;opacity:.55}
            .xc-pedir{border:none;border-radius:10px;padding:9px 12px;font-weight:700;font-size:13px;cursor:pointer;color:#fff;background:linear-gradient(135deg,#0E9AA7,#2F6FED)}
            .xc-pedir:hover{filter:brightness(1.06)}
            .xc-estado{font-size:12.5px;font-weight:700;padding:8px 10px;border-radius:10px;text-align:center}
            .xc-estado.pend{background:#FEF3C7;color:#92400E}
            .xc-estado.rec{background:#FEE2E2;color:#991B1B}
            .xc-boas{display:flex;gap:16px;align-items:center;padding:18px 20px;border-radius:18px;margin-bottom:18px;color:#fff;
                     background:radial-gradient(circle at 92% 0%,rgba(14,154,167,.45),transparent 50%),linear-gradient(135deg,#14254A,#22346B 55%,#2E3F86)}
            .xc-boas-ic{width:46px;height:46px;border-radius:14px;display:grid;place-items:center;font-size:24px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.18);flex-shrink:0}
            .xc-boas strong{display:block;font-size:16px}
            .xc-boas span{display:block;font-size:13.5px;color:#C9D6F2;line-height:1.5}
            .xc-boas a{color:#8FE3E8;font-weight:700}
            .xc-pend-lista{display:grid;gap:10px}
            .xc-pend-pac{font-size:13px;color:#475569;margin-top:2px}
            .xc-pend-pac a{color:#2F6FED;font-weight:700}
            @media (max-width:560px){.xc-boas{flex-direction:column;align-items:flex-start}}
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
        let vinculos, todos, pedidos;
        try {
            [vinculos, todos, pedidos] = await Promise.all([listar(pacienteId), cadastrados(), pedidosPendentes(pacienteId)]);
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
                ${pedidos.length ? `
                <div class="xc-tit">Pedidos de acesso</div>
                ${pedidos.map(htmlPedido).join('')}` : ''}
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

        ligarPedidos(corpo, () => refazer());

        const bd = corpo.querySelector('#xc-discutir');
        if (bd) bd.addEventListener('click', () => discutir(pacienteId));
    }

    // ── pedidos de acesso (admin) ────────────────────────────────────────
    async function pedidosPendentes(pacienteId) {
        let q = c().from('solicitacoes_paciente_externo')
            .select('id, criado_em, mensagem, paciente_id, ' +
                'profissional:profissionais!solicitacoes_paciente_externo_profissional_id_fkey(id, nome_completo, email, crp, especialidade), ' +
                'paciente:pacientes!solicitacoes_paciente_externo_paciente_id_fkey(id, nome_completo)')
            .eq('status', 'pendente').order('criado_em');
        if (pacienteId) q = q.eq('paciente_id', pacienteId);
        const { data, error } = await q;
        if (error) { console.warn('[externos] pedidos:', error.message); return []; }
        return data || [];
    }

    function htmlPedido(s, comPaciente) {
        const p = s.profissional || {};
        const sub = [p.especialidade, p.crp, p.email].filter(Boolean).join(' · ');
        const quando = s.criado_em ? new Date(s.criado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '';
        return `
            <div class="xc-pedido" data-pedido="${s.id}">
                <div class="xc-nome">${esc(p.nome_completo || '—')}</div>
                ${sub ? `<div class="xc-sub">${esc(sub)}</div>` : ''}
                ${comPaciente ? `<div class="xc-pend-pac">pediu acesso a <a href="${raizApp()}pacientes/pasta.html?id=${s.paciente_id}&externos=1">${esc((s.paciente || {}).nome_completo || 'paciente')}</a> · ${esc(quando)}</div>`
                              : `<div class="xc-sub">Pedido em ${esc(quando)}</div>`}
                ${s.mensagem ? `<div class="xc-msg">“${esc(s.mensagem)}”</div>` : ''}
                <div class="xc-tit" style="margin-top:8px">Se aprovar, ele verá:</div>
                ${chipsAbas(PADRAO, 'ped-' + s.id)}
                <div class="xc-pedido-acoes">
                    <button class="xc-mini perigo" data-recusar="${s.id}">Recusar</button>
                    <button class="xc-ok" data-aprovar="${s.id}">Aprovar acesso</button>
                </div>
            </div>`;
    }

    function ligarPedidos(raiz, depois) {
        ligarChips(raiz);
        raiz.querySelectorAll('[data-aprovar]').forEach(b => b.addEventListener('click', async () => {
            const id = b.dataset.aprovar;
            const abas = lerAbas(raiz, 'ped-' + id);
            if (!abas.length) { toast('Marque pelo menos uma aba.', 'danger'); return; }
            b.disabled = true;
            const ok = await responder(id, true, abas);
            b.disabled = false;
            if (ok && depois) depois();
        }));
        raiz.querySelectorAll('[data-recusar]').forEach(b => b.addEventListener('click', async () => {
            const sim = window.CortexPop && window.CortexPop.confirmar
                ? await window.CortexPop.confirmar({ titulo: 'Recusar o pedido?', texto: 'O profissional recebe um aviso de que o acesso não foi liberado.', tone: 'red', labelOk: 'Recusar' })
                : confirm('Recusar este pedido de acesso?');
            if (!sim) return;
            const ok = await responder(b.dataset.recusar, false);
            if (ok && depois) depois();
        }));
    }

    async function responder(id, aprovar, abas) {
        const { data, error } = await c().rpc('externo_responder_pedido', { p_id: id, p_aprovar: !!aprovar, p_abas: abas || null });
        if (error || !data || !data.ok) {
            toast('Não deu para responder: ' + ((error && error.message) || (data && data.erro) || ''), 'danger');
            return false;
        }
        audit(aprovar ? 'criacao' : 'edicao', id, null, { operacao: aprovar ? 'aprovar_pedido_externo' : 'recusar_pedido_externo', abas: abas || null });
        toast(aprovar ? 'Acesso liberado. Ele já recebeu o aviso.' : 'Pedido recusado.', 'success');
        return true;
    }

    // ── link de cadastro + pedidos (Configurações) ───────────────────────
    function linkDe(token) {
        return new URL(raizApp() + 'cadastro-externo/cadastro.html?c=' + encodeURIComponent(token), window.location.origin).href;
    }

    async function painelConfig(el) {
        if (!el) return;
        estilos();
        const pedidos = await pedidosPendentes(null);
        el.innerHTML = `
            <div class="xc-campo" style="margin-top:4px">
                <label class="xc-l">Link de cadastro para profissionais externos</label>
                <div class="xc-link">
                    <input id="xc-link" readonly value="Clique em Mostrar link">
                    <button class="btn btn-secondary btn-sm" id="xc-link-ver">Mostrar link</button>
                    <button class="btn btn-primary btn-sm" id="xc-link-copiar" disabled>Copiar</button>
                    <button class="btn btn-ghost btn-sm" id="xc-link-novo" title="O link antigo para de funcionar">Gerar novo link</button>
                </div>
                <div class="xc-sub" style="margin-top:6px" id="xc-link-info">Quem se cadastra por ele entra como profissional externo, sem nenhum paciente. Depois pede acesso aos pacientes, e vocês aprovam aqui.</div>
            </div>
            <div class="xc-tit" style="margin-top:16px">Pedidos de acesso pendentes (${pedidos.length})</div>
            ${pedidos.length ? `<div class="xc-pend-lista">${pedidos.map(s => htmlPedido(s, true)).join('')}</div>`
                             : '<div class="xc-vazio">Nenhum pedido esperando resposta.</div>'}`;
        const inp = el.querySelector('#xc-link'), cop = el.querySelector('#xc-link-copiar'), info = el.querySelector('#xc-link-info');
        async function carregar(novo) {
            const { data, error } = await c().rpc('externo_convite', { p_novo: !!novo });
            if (error || !data || !data.ok) { toast('Não deu para gerar o link: ' + ((error && error.message) || (data && data.erro) || ''), 'danger'); return; }
            inp.value = linkDe(data.token);
            cop.disabled = false;
            info.textContent = `Já usado em ${data.usos || 0} cadastro(s). Quem se cadastra por ele entra como profissional externo, sem nenhum paciente; depois pede acesso e vocês aprovam aqui.`;
        }
        el.querySelector('#xc-link-ver').addEventListener('click', () => carregar(false));
        el.querySelector('#xc-link-novo').addEventListener('click', async () => {
            const sim = window.CortexPop && window.CortexPop.confirmar
                ? await window.CortexPop.confirmar({ titulo: 'Gerar um novo link?', texto: 'O link atual para de funcionar. Quem já se cadastrou continua com acesso.', labelOk: 'Gerar novo' })
                : confirm('Gerar um novo link? O atual para de funcionar.');
            if (sim) { await carregar(true); toast('Novo link gerado.', 'success'); }
        });
        cop.addEventListener('click', async () => {
            try { await navigator.clipboard.writeText(inp.value); toast('Link copiado.', 'success'); }
            catch (e) { inp.select(); toast('Selecionei o link. Use Ctrl+C.', 'info'); }
        });
        ligarPedidos(el, () => painelConfig(el));
    }

    // ── do lado do externo: buscar e pedir acesso ────────────────────────
    async function buscarOutros(texto) {
        const t = String(texto || '').trim();
        if (t.length < 3) return [];
        const { data, error } = await c().rpc('externo_buscar_pacientes', { p_texto: t });
        if (error) { console.warn('[externos] busca:', error.message); return []; }
        return Array.isArray(data) ? data : [];
    }

    function iniciais(nome) {
        const p = String(nome || '').trim().split(/\s+/);
        return ((p[0] || '')[0] || '').toUpperCase() + ((p.length > 1 ? p[p.length - 1][0] : '') || '').toUpperCase();
    }

    function htmlOutros(lista, texto) {
        estilos();
        if (!lista.length) {
            return `<div class="xc-outros"><div class="xc-outros-tit"><h3>Outros pacientes da clínica</h3>
                <span>Nenhum outro paciente com “${esc(texto)}”. Confira o nome completo.</span></div></div>`;
        }
        return `
            <div class="xc-outros">
                <div class="xc-outros-tit"><h3>Outros pacientes da clínica</h3><span>Você vê só o nome. Peça acesso e a clínica decide o que liberar.</span></div>
                <div class="xc-grade">
                    ${lista.map(p => `
                    <div class="xc-pac" data-pac="${p.id}">
                        <span class="xc-cad" title="Sem acesso">🔒</span>
                        <div class="xc-pac-topo">
                            <div class="xc-pac-av">${esc(iniciais(p.nome))}</div>
                            <div>
                                <div class="xc-pac-nome">${esc(p.nome)}</div>
                                <div class="xc-pac-sub">${[p.idade != null ? p.idade + ' anos' : '', p.sexo || ''].filter(Boolean).map(esc).join(' · ')}</div>
                            </div>
                        </div>
                        ${p.pedido === 'pendente'
                            ? '<div class="xc-estado pend">⏳ Pedido enviado · aguardando a clínica</div>'
                            : `${p.pedido === 'recusada' ? '<div class="xc-estado rec">Pedido anterior não aprovado</div>' : ''}
                               <button class="xc-pedir" data-pedir="${p.id}" data-nome="${esc(p.nome)}">Solicitar acesso</button>`}
                    </div>`).join('')}
                </div>
            </div>`;
    }

    function ligarOutros(el, aoPedir) {
        el.querySelectorAll('[data-pedir]').forEach(b => b.addEventListener('click', () =>
            solicitar(b.dataset.pedir, b.dataset.nome, aoPedir)));
    }

    function solicitar(pacienteId, nome, aoFim) {
        if (!window.CortexPop) return;
        estilos();
        window.CortexPop.abrir({
            titulo: 'Solicitar acesso',
            subtitulo: nome || '',
            tone: 'blue',
            tamanho: 'sm',
            html: `
                <div class="xc-aviso">A clínica recebe o seu pedido e decide o que liberar. Você recebe um aviso no sino quando ela responder.</div>
                <div class="xc-campo">
                    <label class="xc-l" for="xc-msg">Mensagem para a clínica (opcional)</label>
                    <textarea id="xc-msg" rows="3" maxlength="600" style="width:100%;padding:9px 11px;border:1px solid #e2e8f0;border-radius:10px;font:inherit;font-size:14px"
                        placeholder="Ex.: sou o neuropediatra que encaminhou o paciente."></textarea>
                </div>`,
            rodape: [{ label: 'Cancelar', classe: 'btn-secondary' },
                     { label: 'Enviar pedido', classe: 'btn-primary', fechar: false, onClick: async (j) => {
                         const msg = (j.corpo.querySelector('#xc-msg') || {}).value || '';
                         const { data, error } = await c().rpc('externo_solicitar_acesso', { p_paciente: pacienteId, p_mensagem: msg || null });
                         if (error || !data || !data.ok) {
                             const m = { ja_tem_acesso: 'Você já tem acesso a este paciente.' }[data && data.erro];
                             toast(m || ('Não deu para enviar: ' + ((error && error.message) || (data && data.erro) || '')), 'danger');
                             return false;
                         }
                         toast(data.ja_pedido ? 'Você já tinha pedido. A clínica vai responder.' : 'Pedido enviado. A clínica vai responder.', 'success');
                         j.fecharJanela();
                         if (aoFim) aoFim();
                         return false;
                     } }]
        });
    }

    function htmlBoasVindas(semPacientes) {
        estilos();
        return `
            <div class="xc-boas">
                <div class="xc-boas-ic">👋</div>
                <div>
                    <strong>${semPacientes ? 'Bem-vindo ao CORTEX' : 'Pacientes que você acompanha'}</strong>
                    <span>${semPacientes ? 'Você ainda não tem pacientes liberados. ' : ''}Digite o nome do paciente na busca (pelo menos 3 letras) e clique em <b>Solicitar acesso</b>. A clínica decide o que liberar.
                    <a href="../ajuda/ajuda.html?guia=externo-uso">Ver instruções</a></span>
                </div>
            </div>`;
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

    return { ABAS, PADRAO, ehExterno, minhasAbas, listar, gerenciar, discutir,
             pedidosPendentes, painelConfig, buscarOutros, htmlOutros, ligarOutros, solicitar, htmlBoasVindas };
})();

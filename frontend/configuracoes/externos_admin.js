// ============================================================================
// CORTEX_APP — externos_admin.js
// ----------------------------------------------------------------------------
// Aba "Acesso externo" em Configurações. Só admin.
//
// Cadastra as clínicas parceiras e os profissionais delas, e mostra os
// acessos concedidos a pacientes, com prazo e escopo.
//
// A liberação de um paciente específico NÃO acontece aqui: ela fica na pasta
// do paciente, que é onde a equipe está quando decide compartilhar. Aqui é o
// cadastro e a visão geral de quem tem acesso a quê.
//
// Esses profissionais não entram em `profissionais`, então não conseguem
// entrar no CORTEX: o auth_guard exige uma linha naquela tabela e desconecta
// quem não tiver. Eles usarão uma área separada (etapa 2).
// ============================================================================

window.CortexExternosAdmin = (function () {
    'use strict';

    const CONSELHOS = ['CRM', 'CRP', 'CRO', 'CREFITO', 'CRFa', 'OUTRO'];

    const ESCOPO_LABEL = {
        resultados: 'Resultados dos testes',
        evolucoes:  'Evoluções',
        laudos:     'Laudos'
    };

    const state = { clinicas: [], profs: [], acessos: [], aba: 'clinicas' };

    const c = () => window.cortexClient;
    const esc = (t) => { const d = document.createElement('div'); d.textContent = t ?? ''; return d.innerHTML; };
    const toast = (m, t) => { if (window.CortexUI?.toast) window.CortexUI.toast(m, t); };

    function data(iso) {
        if (!iso) return '—';
        const d = new Date(iso);
        return isNaN(d) ? '—' : d.toLocaleDateString('pt-BR');
    }

    function diasRestantes(iso) {
        if (!iso) return null;
        return Math.ceil((new Date(iso) - new Date()) / 86400000);
    }

    // ── Carga ───────────────────────────────────────────────────────────────

    async function carregar() {
        try {
            const [cl, pr, ac] = await Promise.all([
                c().from('clinicas_externas').select('*').order('nome'),
                c().from('usuarios_externos')
                   .select('*, clinica:clinica_externa_id(nome)').order('nome_completo'),
                c().from('acessos_externos')
                   .select('*, externo:usuario_externo_id(nome_completo, conselho, registro), paciente:paciente_id(nome_completo)')
                   .eq('ativo', true).order('concedido_em', { ascending: false })
            ]);
            if (cl.error) throw cl.error;
            state.clinicas = cl.data || [];
            state.profs = pr.data || [];
            state.acessos = ac.data || [];
        } catch (err) {
            console.error('[externos] carregar:', err);
            toast('Erro ao carregar: ' + (err.message || ''), 'danger');
        }
    }

    // ── Render ──────────────────────────────────────────────────────────────

    function render() {
        const ativos = state.acessos.filter(a => diasRestantes(a.expira_em) > 0).length;
        const vencidos = state.acessos.length - ativos;

        return `
            <div class="ext-intro">
                <h3>Acesso externo</h3>
                <p>
                    Clínicas e profissionais parceiros que acompanham os mesmos pacientes.
                    Eles veem apenas os pacientes liberados por vocês, pelo prazo definido,
                    e não têm acesso ao CORTEX.
                </p>
            </div>

            <div class="ext-resumo">
                <div class="ext-num"><strong>${state.clinicas.filter(x => x.ativo).length}</strong> clínicas</div>
                <div class="ext-num"><strong>${state.profs.filter(x => x.ativo).length}</strong> profissionais</div>
                <div class="ext-num"><strong>${ativos}</strong> acessos ativos</div>
                ${vencidos ? `<div class="ext-num alerta"><strong>${vencidos}</strong> vencidos</div>` : ''}
            </div>

            <div class="ext-abas">
                <button class="ext-aba ${state.aba === 'clinicas' ? 'ativa' : ''}" data-eaba="clinicas">Clínicas</button>
                <button class="ext-aba ${state.aba === 'profs' ? 'ativa' : ''}" data-eaba="profs">Profissionais</button>
                <button class="ext-aba ${state.aba === 'acessos' ? 'ativa' : ''}" data-eaba="acessos">Pacientes liberados</button>
            </div>

            <div id="ext-painel">${painel()}</div>`;
    }

    function painel() {
        if (state.aba === 'clinicas') return painelClinicas();
        if (state.aba === 'profs')    return painelProfs();
        return painelAcessos();
    }

    function painelClinicas() {
        return `
            <div class="ext-acoes-topo">
                <button class="btn btn-primary btn-sm" id="ext-nova-clinica">+ Nova clínica</button>
            </div>
            ${!state.clinicas.length ? vazio('Nenhuma clínica cadastrada ainda.') : `
            <div class="ext-tabela-wrap">
                <table class="ext-tabela">
                    <thead><tr><th>Clínica</th><th>Cidade</th><th>Responsável</th>
                               <th>Contato</th><th style="width:90px">Situação</th><th style="width:80px"></th></tr></thead>
                    <tbody>
                        ${state.clinicas.map(cl => `
                            <tr class="${cl.ativo ? '' : 'inativo'}">
                                <td><strong>${esc(cl.nome)}</strong>${cl.cnpj ? `<br><span class="ext-sub">${esc(cl.cnpj)}</span>` : ''}</td>
                                <td>${esc(cl.cidade || '—')}</td>
                                <td>${esc(cl.responsavel || '—')}</td>
                                <td>${esc(cl.email || cl.telefone || '—')}</td>
                                <td>${cl.ativo ? '<span class="ext-selo ok">Ativa</span>' : '<span class="ext-selo off">Inativa</span>'}</td>
                                <td><button class="ext-mini" data-edit-clinica="${cl.id}">Editar</button></td>
                            </tr>`).join('')}
                    </tbody>
                </table>
            </div>`}`;
    }

    function painelProfs() {
        return `
            <div class="ext-acoes-topo">
                <button class="btn btn-primary btn-sm" id="ext-novo-prof"
                        ${state.clinicas.filter(x => x.ativo).length ? '' : 'disabled title="Cadastre uma clínica primeiro"'}>
                    + Novo profissional
                </button>
            </div>
            ${!state.profs.length ? vazio('Nenhum profissional externo cadastrado ainda.') : `
            <div class="ext-tabela-wrap">
                <table class="ext-tabela">
                    <thead><tr><th>Profissional</th><th>Registro</th><th>Clínica</th>
                               <th>E-mail</th><th style="width:110px">Acessos</th>
                               <th style="width:90px">Situação</th><th style="width:80px"></th></tr></thead>
                    <tbody>
                        ${state.profs.map(p => {
                            const n = state.acessos.filter(a => a.usuario_externo_id === p.id).length;
                            return `
                            <tr class="${p.ativo ? '' : 'inativo'}">
                                <td><strong>${esc(p.nome_completo)}</strong>${p.especialidade ? `<br><span class="ext-sub">${esc(p.especialidade)}</span>` : ''}</td>
                                <td>${esc([p.conselho, p.registro].filter(Boolean).join(' ') || '—')}</td>
                                <td>${esc(p.clinica?.nome || '—')}</td>
                                <td>${esc(p.email)}</td>
                                <td>${n ? `${n} paciente(s)` : '—'}</td>
                                <td>${p.ativo ? '<span class="ext-selo ok">Ativo</span>' : '<span class="ext-selo off">Inativo</span>'}</td>
                                <td><button class="ext-mini" data-edit-prof="${p.id}">Editar</button></td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>`}`;
    }

    function painelAcessos() {
        if (!state.acessos.length) {
            return vazio('Nenhum paciente liberado ainda. A liberação é feita na pasta do paciente, no botão “Acesso externo”.');
        }
        return `
            <p class="ext-dica">
                A liberação de um paciente é feita na pasta dele, no botão “Acesso externo”.
                Aqui você acompanha e revoga.
            </p>
            <div class="ext-tabela-wrap">
                <table class="ext-tabela">
                    <thead><tr><th>Paciente</th><th>Profissional</th><th>Vê</th>
                               <th style="width:130px">Prazo</th><th style="width:90px"></th></tr></thead>
                    <tbody>
                        ${state.acessos.map(a => {
                            const d = diasRestantes(a.expira_em);
                            const venceu = d <= 0;
                            return `
                            <tr class="${venceu ? 'inativo' : ''}">
                                <td><strong>${esc(a.paciente?.nome_completo || '—')}</strong></td>
                                <td>${esc(a.externo?.nome_completo || '—')}
                                    <br><span class="ext-sub">${esc([a.externo?.conselho, a.externo?.registro].filter(Boolean).join(' '))}</span></td>
                                <td>${(a.escopo || []).map(e => `<span class="ext-tag">${esc(ESCOPO_LABEL[e] || e)}</span>`).join(' ')}</td>
                                <td>${venceu
                                        ? `<span class="ext-selo off">Vencido em ${data(a.expira_em)}</span>`
                                        : `${d} dia(s)<br><span class="ext-sub">até ${data(a.expira_em)}</span>`}</td>
                                <td><button class="ext-mini perigo" data-revogar="${a.id}">Revogar</button></td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>`;
    }

    function vazio(txt) {
        return `<div class="ext-vazio">${esc(txt)}</div>`;
    }

    // ── Eventos ─────────────────────────────────────────────────────────────

    function bind() {
        document.querySelectorAll('[data-eaba]').forEach(b =>
            b.addEventListener('click', () => { state.aba = b.dataset.eaba; repintar(); }));

        const nc = document.getElementById('ext-nova-clinica');
        if (nc) nc.addEventListener('click', () => fichaClinica(null));
        const np = document.getElementById('ext-novo-prof');
        if (np) np.addEventListener('click', () => fichaProf(null));

        document.querySelectorAll('[data-edit-clinica]').forEach(b =>
            b.addEventListener('click', () => fichaClinica(state.clinicas.find(x => x.id === b.dataset.editClinica))));
        document.querySelectorAll('[data-edit-prof]').forEach(b =>
            b.addEventListener('click', () => fichaProf(state.profs.find(x => x.id === b.dataset.editProf))));
        document.querySelectorAll('[data-revogar]').forEach(b =>
            b.addEventListener('click', () => revogar(b.dataset.revogar)));
    }

    function repintar() {
        const cont = document.getElementById('cfg-conteudo');
        if (!cont) return;
        cont.innerHTML = render();
        bind();
    }

    // ── Fichas ──────────────────────────────────────────────────────────────

    function campo(rot, id, valor, tipo, ph) {
        return `<div class="ext-campo">
            <label>${esc(rot)}</label>
            <input id="${id}" type="${tipo || 'text'}" value="${esc(valor || '')}" placeholder="${esc(ph || '')}">
        </div>`;
    }

    function fichaClinica(cl) {
        const novo = !cl;
        const j = window.CortexPop.abrir({
            titulo: novo ? 'Nova clínica parceira' : 'Editar clínica',
            tone: 'blue', tamanho: 'md', persistente: true,
            html: `
                <div class="ext-grid">
                    ${campo('Nome *', 'cl-nome', cl?.nome)}
                    ${campo('CNPJ', 'cl-cnpj', cl?.cnpj)}
                    ${campo('Cidade', 'cl-cidade', cl?.cidade)}
                    ${campo('Responsável', 'cl-resp', cl?.responsavel)}
                    ${campo('E-mail', 'cl-email', cl?.email, 'email')}
                    ${campo('Telefone', 'cl-tel', cl?.telefone)}
                </div>
                ${!novo ? `
                <div class="ext-campo">
                    <label>Situação</label>
                    <select id="cl-ativo">
                        <option value="true"  ${cl.ativo ? 'selected' : ''}>Ativa</option>
                        <option value="false" ${cl.ativo ? '' : 'selected'}>Inativa</option>
                    </select>
                </div>` : ''}`,
            rodape: [
                { label: 'Cancelar', classe: 'btn-secondary' },
                { label: novo ? 'Cadastrar' : 'Salvar', classe: 'btn-primary', fechar: false,
                  onClick: async (jj) => {
                    const nome = jj.corpo.querySelector('#cl-nome').value.trim();
                    if (!nome) { toast('Informe o nome da clínica.', 'danger'); return false; }
                    const row = {
                        nome,
                        cnpj: jj.corpo.querySelector('#cl-cnpj').value.trim() || null,
                        cidade: jj.corpo.querySelector('#cl-cidade').value.trim() || null,
                        responsavel: jj.corpo.querySelector('#cl-resp').value.trim() || null,
                        email: jj.corpo.querySelector('#cl-email').value.trim() || null,
                        telefone: jj.corpo.querySelector('#cl-tel').value.trim() || null
                    };
                    if (!novo) row.ativo = jj.corpo.querySelector('#cl-ativo').value === 'true';
                    else row.created_by = window.cortexProfissional?.id || null;
                    return salvar('clinicas_externas', cl?.id, row, jj, novo ? 'Clínica cadastrada.' : 'Clínica atualizada.');
                  }}
            ]
        });
        setTimeout(() => j.corpo.querySelector('#cl-nome')?.focus(), 250);
    }

    function fichaProf(p) {
        const novo = !p;
        const clinicasAtivas = state.clinicas.filter(x => x.ativo || x.id === p?.clinica_externa_id);
        const j = window.CortexPop.abrir({
            titulo: novo ? 'Novo profissional externo' : 'Editar profissional',
            subtitulo: 'Ele verá apenas os pacientes que vocês liberarem',
            tone: 'purple', tamanho: 'md', persistente: true,
            html: `
                <div class="ext-campo">
                    <label>Clínica *</label>
                    <select id="pr-clinica">
                        ${clinicasAtivas.map(cl =>
                            `<option value="${cl.id}" ${p?.clinica_externa_id === cl.id ? 'selected' : ''}>${esc(cl.nome)}</option>`).join('')}
                    </select>
                </div>
                ${campo('Nome completo *', 'pr-nome', p?.nome_completo)}
                <div class="ext-grid">
                    <div class="ext-campo">
                        <label>Conselho</label>
                        <select id="pr-conselho">
                            ${CONSELHOS.map(x => `<option value="${x}" ${p?.conselho === x ? 'selected' : ''}>${x}</option>`).join('')}
                        </select>
                    </div>
                    ${campo('Registro', 'pr-registro', p?.registro, 'text', 'ex.: 12345/MG')}
                </div>
                ${campo('Especialidade', 'pr-esp', p?.especialidade)}
                <div class="ext-grid">
                    ${campo('E-mail *', 'pr-email', p?.email, 'email')}
                    ${campo('Telefone', 'pr-tel', p?.telefone)}
                </div>
                <div class="ext-aviso">
                    O e-mail será o login dele na área externa. Ele não terá acesso ao CORTEX.
                </div>
                ${!novo ? `
                <div class="ext-campo">
                    <label>Situação</label>
                    <select id="pr-ativo">
                        <option value="true"  ${p.ativo ? 'selected' : ''}>Ativo</option>
                        <option value="false" ${p.ativo ? '' : 'selected'}>Inativo (perde o acesso)</option>
                    </select>
                </div>` : ''}`,
            rodape: [
                { label: 'Cancelar', classe: 'btn-secondary' },
                { label: novo ? 'Cadastrar' : 'Salvar', classe: 'btn-primary', fechar: false,
                  onClick: async (jj) => {
                    const nome = jj.corpo.querySelector('#pr-nome').value.trim();
                    const email = jj.corpo.querySelector('#pr-email').value.trim();
                    if (!nome)  { toast('Informe o nome.', 'danger'); return false; }
                    if (!email) { toast('Informe o e-mail.', 'danger'); return false; }
                    const row = {
                        clinica_externa_id: jj.corpo.querySelector('#pr-clinica').value || null,
                        nome_completo: nome,
                        conselho: jj.corpo.querySelector('#pr-conselho').value,
                        registro: jj.corpo.querySelector('#pr-registro').value.trim() || null,
                        especialidade: jj.corpo.querySelector('#pr-esp').value.trim() || null,
                        email,
                        telefone: jj.corpo.querySelector('#pr-tel').value.trim() || null
                    };
                    if (!novo) row.ativo = jj.corpo.querySelector('#pr-ativo').value === 'true';
                    else row.created_by = window.cortexProfissional?.id || null;
                    return salvar('usuarios_externos', p?.id, row, jj,
                                  novo ? 'Profissional cadastrado.' : 'Profissional atualizado.');
                  }}
            ]
        });
        setTimeout(() => j.corpo.querySelector('#pr-nome')?.focus(), 250);
    }

    async function salvar(tabela, id, row, janela, msg) {
        try {
            const q = id ? c().from(tabela).update(row).eq('id', id)
                         : c().from(tabela).insert(row);
            const { error } = await q;
            if (error) throw error;

            if (window.CortexAudit) {
                window.CortexAudit.log(id ? 'edicao' : 'criacao', tabela, id || null, {
                    detalhes: { operacao: id ? 'editar_externo' : 'cadastrar_externo',
                                nome: row.nome || row.nome_completo }
                });
            }
            janela.fecharJanela();
            toast(msg, 'success');
            await carregar();
            repintar();
            return true;
        } catch (err) {
            console.error('[externos] salvar:', err);
            const dup = String(err.message || '').includes('duplicate');
            toast(dup ? 'Já existe um profissional com esse e-mail.' : 'Erro ao salvar: ' + (err.message || ''), 'danger');
            return false;
        }
    }

    function revogar(id) {
        const a = state.acessos.find(x => x.id === id);
        if (!a) return;
        window.CortexConfirm.mostrar({
            icone: '🚫',
            titulo: 'Revogar este acesso?',
            texto: `${a.externo?.nome_completo || 'O profissional'} deixa de ver ${a.paciente?.nome_completo || 'o paciente'} imediatamente. O que ele já baixou não volta.`,
            btnSim: 'Sim, revogar', btnNao: 'Cancelar', btnSimDanger: true,
            onSim: async () => {
                try {
                    const { error } = await c().from('acessos_externos').update({
                        ativo: false,
                        revogado_em: new Date().toISOString(),
                        revogado_por: window.cortexProfissional?.id || null
                    }).eq('id', id);
                    if (error) throw error;

                    if (window.CortexAudit) {
                        window.CortexAudit.log('edicao', 'acessos_externos', id, {
                            pacienteId: a.paciente_id,
                            detalhes: { operacao: 'revogar_acesso_externo',
                                        profissional: a.externo?.nome_completo }
                        });
                    }
                    toast('Acesso revogado.', 'success');
                    await carregar();
                    repintar();
                } catch (err) {
                    console.error('[externos] revogar:', err);
                    toast('Erro ao revogar: ' + (err.message || ''), 'danger');
                }
            }
        });
    }

    return { carregar, render, bind, ESCOPO_LABEL };
})();

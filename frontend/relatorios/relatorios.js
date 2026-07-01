// ============================================================================
// CORTEX_APP — relatorios.js (redesenho: 3 abas de gestão)
//   1) Entregas por psicólogo  — pacientes finalizados / corrigidos / sessões (mês)
//   2) Pacientes               — controle por aplicador (finalizados vs andamento)
//   3) Atividades              — quem fez o quê (auditoria_acessos)
// Acesso restrito a admin (clínico ou gestor).
// "Paciente finalizado" = bateria 100% concluída (todas as aplicações em
//   concluido_aplicacao / corrigido / integrado_laudo). Vínculo: 1 aplicador
//   ativo por paciente (vinculos_paciente_aplicador).
// ============================================================================

(function() {
    'use strict';

    const CONCLUIDOS = new Set(['concluido_aplicacao', 'corrigido', 'integrado_laudo']);
    const CORRIGIDOS = new Set(['corrigido', 'integrado_laudo']);

    const ICONES = {
        entregas:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>',
        pacientes:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
        atividades:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',
        check:       '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
        calendar:    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
        package:     '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>',
        users:       '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>',
        hourglass:   '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 22h14M5 2h14M17 22v-4.17a2 2 0 0 0-.59-1.42L12 12l-4.41 4.41A2 2 0 0 0 7 17.83V22M7 2v4.17a2 2 0 0 0 .59 1.42L12 12l4.41-4.41A2 2 0 0 0 17 6.17V2"/></svg>',
        edit:        '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
        trash:       '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
        lock:        '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
        ranking:     '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>',
        list:        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>'
    };

    const TAB_LABELS = {
        entregas:   'Entregas por psicólogo',
        pacientes:  'Pacientes',
        atividades: 'Atividades'
    };
    const TAB_ICON = { entregas: ICONES.entregas, pacientes: ICONES.pacientes, atividades: ICONES.atividades };

    const ACAO_LABEL = { criacao: 'criou', edicao: 'editou', delecao: 'removeu', leitura: 'visualizou', login: 'entrou', logout: 'saiu' };
    const ACAO_COR   = { criacao: '#16a34a', edicao: '#2563eb', delecao: '#dc2626', leitura: '#64748b', login: '#0ea5e9', logout: '#94a3b8' };
    const TABELA_LABEL = {
        pacientes: 'paciente', aplicacoes_instrumento: 'aplicação', correcoes: 'correção',
        laudos_paciente: 'laudo', sessoes: 'sessão', vinculos_paciente_aplicador: 'vínculo',
        hipoteses: 'hipótese', anamneses: 'anamnese', devolutivas: 'devolutiva', profissionais: 'profissional'
    };

    const state = {
        abaAtiva: 'entregas',
        ehAdmin: false,
        profissionais: [],
        abas: {
            entregas:   { mes: new Date(), filtroProfissional: '', dados: null },
            pacientes:  {                  filtroProfissional: '', dados: null },
            atividades: { mes: new Date(), filtroProfissional: '', incluirRuido: false, dados: null }
        }
    };

    window.addEventListener('cortex:auth-ready', async () => {
        await CortexSidebar.render('relatorios');

        const perfil = window.cortexProfissional?.perfil;
        state.ehAdmin = (perfil === 'admin_clinico' || perfil === 'admin_gestor');
        if (!state.ehAdmin) { renderSemPermissao(); return; }

        try {
            const { data } = await window.cortexClient
                .from('profissionais').select('id, nome_completo, perfil')
                .eq('ativo', true).order('nome_completo');
            state.profissionais = data || [];
        } catch (e) { console.warn('[relatorios] profissionais:', e); state.profissionais = []; }

        for (const k of Object.keys(state.abas)) {
            const m = state.abas[k].mes;
            if (m) state.abas[k].mes = new Date(m.getFullYear(), m.getMonth(), 1);
        }

        renderEsqueleto();
        await trocarAba('entregas');
    });

    function renderEsqueleto() {
        document.getElementById('rel-conteudo').innerHTML = `
            <div class="rel-tabs">
                ${Object.keys(TAB_LABELS).map(k => `
                    <button class="rel-tab" data-aba="${k}">
                        <span class="rel-tab-ico">${TAB_ICON[k]}</span>
                        <span>${TAB_LABELS[k]}</span>
                    </button>
                `).join('')}
            </div>
            <div id="rel-painel" class="rel-painel" data-aba="entregas"></div>
        `;
        document.querySelectorAll('.rel-tab').forEach(btn => {
            btn.addEventListener('click', () => trocarAba(btn.dataset.aba));
        });
    }

    function renderSemPermissao() {
        document.getElementById('rel-conteudo').innerHTML = `
            <div class="rel-restrito">
                <div class="rel-restrito-ico">${ICONES.lock}</div>
                <h2>Acesso restrito</h2>
                <p>Apenas administradores podem acessar a página de relatórios.</p>
            </div>
        `;
    }

    async function trocarAba(aba) {
        state.abaAtiva = aba;
        document.querySelectorAll('.rel-tab').forEach(b => b.classList.toggle('ativa', b.dataset.aba === aba));
        const painel = document.getElementById('rel-painel');
        painel.setAttribute('data-aba', aba);
        painel.style.animation = 'none'; void painel.offsetWidth; painel.style.animation = '';
        await renderAba();
    }

    async function renderAba() {
        const painel = document.getElementById('rel-painel');
        const aba = state.abaAtiva;
        painel.innerHTML = renderFiltrosHTML(aba) + `<div id="rel-aba-corpo"></div>`;
        bindFiltros(aba);
        const corpo = document.getElementById('rel-aba-corpo');
        corpo.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>Carregando dados...</p></div>`;
        try {
            if (aba === 'entregas')        await carregarEntregas();
            else if (aba === 'pacientes')  await carregarPacientes();
            else if (aba === 'atividades') await carregarAtividades();
        } catch (err) {
            console.error('[relatorios]', aba, err);
            corpo.innerHTML = vazio('⚠️', 'Erro ao carregar', err.message || 'Tente novamente em instantes.');
            return;
        }
        if (aba === 'entregas')        corpo.innerHTML = renderEntregas();
        else if (aba === 'pacientes')  corpo.innerHTML = renderPacientes();
        else if (aba === 'atividades') corpo.innerHTML = renderAtividades();
    }

    // ─── Filtros ─────────────────────────────────────────────────────────────
    function renderFiltrosHTML(aba) {
        const st = state.abas[aba];
        const temMes = aba === 'entregas' || aba === 'atividades';

        let navMes = '';
        if (temMes) {
            const mesLabel = st.mes.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
            const ehMesAtual = mesIgualHoje(st.mes);
            navMes = `
                <div class="rel-nav-mes">
                    <button class="rel-nav-btn" data-nav="ant" title="Mês anterior">‹</button>
                    <span class="rel-nav-mes-label">${escapeHtml(mesLabel)}</span>
                    <button class="rel-nav-btn" data-nav="prox" title="Mês seguinte" ${ehMesAtual ? 'disabled' : ''}>›</button>
                    ${!ehMesAtual ? `<button class="rel-nav-btn rel-nav-btn-texto" data-nav="hoje" title="Voltar ao mês atual">Hoje</button>` : ''}
                </div>`;
        }

        const opcoes = state.profissionais.map(p =>
            `<option value="${escapeHtml(p.id)}" ${p.id === st.filtroProfissional ? 'selected' : ''}>${escapeHtml(p.nome_completo)}</option>`
        ).join('');
        const label = aba === 'atividades' ? 'Profissional' : 'Aplicador';
        const filtroProf = `
            <div class="rel-filtro-extra">
                <label>${label}:</label>
                <select data-filtro-prof>
                    <option value="">Todos</option>
                    ${opcoes}
                </select>
            </div>`;

        const toggleRuido = aba === 'atividades' ? `
            <div class="rel-filtro-extra">
                <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
                    <input type="checkbox" data-filtro-ruido ${st.incluirRuido ? 'checked' : ''}>
                    Incluir leituras e logins
                </label>
            </div>` : '';

        return `<div class="rel-filtros">${navMes}${filtroProf}${toggleRuido}</div>`;
    }

    function bindFiltros(aba) {
        const st = state.abas[aba];
        const root = document.getElementById('rel-painel');
        root.querySelector('[data-nav="ant"]')?.addEventListener('click', () => {
            st.mes = new Date(st.mes.getFullYear(), st.mes.getMonth() - 1, 1); st.dados = null; renderAba();
        });
        root.querySelector('[data-nav="prox"]')?.addEventListener('click', () => {
            if (mesIgualHoje(st.mes)) return;
            st.mes = new Date(st.mes.getFullYear(), st.mes.getMonth() + 1, 1); st.dados = null; renderAba();
        });
        root.querySelector('[data-nav="hoje"]')?.addEventListener('click', () => {
            const h = new Date(); st.mes = new Date(h.getFullYear(), h.getMonth(), 1); st.dados = null; renderAba();
        });
        const selProf = root.querySelector('[data-filtro-prof]');
        selProf?.addEventListener('change', () => { st.filtroProfissional = selProf.value; st.dados = null; renderAba(); });
        const chk = root.querySelector('[data-filtro-ruido]');
        chk?.addEventListener('change', () => { st.incluirRuido = chk.checked; st.dados = null; renderAba(); });
    }

    // ═══ ABA 1: Entregas por psicólogo ═══════════════════════════════════════
    async function carregarEntregas() {
        const st = state.abas.entregas;
        const { inicio, fim } = mesIntervalo(st.mes);

        const { data: vinc } = await window.cortexClient
            .from('vinculos_paciente_aplicador').select('paciente_id, aplicador_id').eq('ativo', true);
        const aplicadorDoPaciente = new Map((vinc || []).map(v => [v.paciente_id, v.aplicador_id]));

        const { data: apps, error: errA } = await window.cortexClient
            .from('aplicacoes_instrumento').select('paciente_id, status, updated_at, aplicador_id');
        if (errA) throw errA;

        // Completude por paciente
        const porPac = new Map();
        for (const a of (apps || [])) {
            if (!a.paciente_id) continue;
            const r = porPac.get(a.paciente_id) || { total: 0, concl: 0, maxUp: null };
            r.total++;
            if (CONCLUIDOS.has(a.status)) r.concl++;
            const t = a.updated_at ? new Date(a.updated_at) : null;
            if (t && (!r.maxUp || t > r.maxUp)) r.maxUp = t;
            porPac.set(a.paciente_id, r);
        }

        const map = new Map();
        const ensure = (id) => {
            const k = id || '__sem__';
            if (!map.has(k)) map.set(k, { aplicador_id: id, finalizados: 0, corrigidos: 0, realizadas: 0 });
            return map.get(k);
        };

        // Pacientes finalizados no mês (bateria 100%, data = última aplicação a fechar)
        for (const [pac, r] of porPac) {
            if (r.total > 0 && r.total === r.concl && r.maxUp && r.maxUp >= inicio && r.maxUp < fim) {
                ensure(aplicadorDoPaciente.get(pac) || null).finalizados++;
            }
        }
        // Testes corrigidos no mês, por aplicador
        for (const a of (apps || [])) {
            if (!a.aplicador_id || !CORRIGIDOS.has(a.status)) continue;
            const t = a.updated_at ? new Date(a.updated_at) : null;
            if (t && t >= inicio && t < fim) ensure(a.aplicador_id).corrigidos++;
        }
        // Sessões realizadas no mês
        const { data: sess } = await window.cortexClient
            .from('sessoes').select('profissional_id, status, data_hora_inicio')
            .gte('data_hora_inicio', inicio.toISOString()).lt('data_hora_inicio', fim.toISOString());
        for (const s of (sess || [])) {
            if (s.status === 'realizada' && s.profissional_id) ensure(s.profissional_id).realizadas++;
        }

        let lista = Array.from(map.values())
            .map(r => ({ ...r, nome: nomeProf(r.aplicador_id) || '— Sem aplicador —' }))
            .filter(r => r.finalizados || r.corrigidos || r.realizadas)
            .sort((a, b) => b.finalizados - a.finalizados || b.corrigidos - a.corrigidos);

        if (st.filtroProfissional) lista = lista.filter(r => r.aplicador_id === st.filtroProfissional);
        st.dados = lista;
    }

    function renderEntregas() {
        const lista = state.abas.entregas.dados || [];
        const totFin = lista.reduce((a, r) => a + r.finalizados, 0);
        const totCor = lista.reduce((a, r) => a + r.corrigidos, 0);
        const totSes = lista.reduce((a, r) => a + r.realizadas, 0);

        const cards = `
            <div class="rel-cards">
                ${renderCard(ICONES.package, 'Pacientes finalizados', totFin, 'bateria 100% concluída')}
                ${renderCard(ICONES.check, 'Testes corrigidos', totCor)}
                ${renderCard(ICONES.calendar, 'Sessões realizadas', totSes)}
            </div>`;

        if (lista.length === 0)
            return cards + vazio('📦', 'Nenhuma entrega neste período', 'Quando um aplicador finalizar a bateria de um paciente, aparece aqui.');

        const rank = lista.map(r => [r.nome, r.finalizados]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);

        return cards + `
            ${rank.length ? renderBarras('Pacientes finalizados por aplicador', ICONES.ranking, rank) : ''}
            <div class="rel-secao">
                <h2 class="rel-secao-titulo"><span class="rel-secao-ico">${ICONES.list}</span> Detalhamento por aplicador</h2>
                <div class="rel-tabela-wrap">
                    <table class="rel-tabela">
                        <thead><tr>
                            <th>Aplicador</th>
                            <th class="col-num">Pacientes finalizados</th>
                            <th class="col-num">Testes corrigidos</th>
                            <th class="col-num">Sessões realizadas</th>
                        </tr></thead>
                        <tbody>
                            ${lista.map(r => `
                                <tr>
                                    <td>${escapeHtml(r.nome)}</td>
                                    <td class="col-num">${r.finalizados}</td>
                                    <td class="col-num">${r.corrigidos}</td>
                                    <td class="col-num">${r.realizadas}</td>
                                </tr>`).join('')}
                            <tr class="col-total">
                                <td>Total</td>
                                <td class="col-num">${totFin}</td>
                                <td class="col-num">${totCor}</td>
                                <td class="col-num">${totSes}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>`;
    }

    // ═══ ABA 2: Pacientes (controle por aplicador) ═══════════════════════════
    async function carregarPacientes() {
        const st = state.abas.pacientes;

        const { data: vinc } = await window.cortexClient
            .from('vinculos_paciente_aplicador').select('paciente_id, aplicador_id').eq('ativo', true);
        const aplicadorDoPaciente = new Map((vinc || []).map(v => [v.paciente_id, v.aplicador_id]));

        const { data: pacs, error: errP } = await window.cortexClient
            .from('pacientes').select('id, nome_completo, status').neq('status', 'arquivado');
        if (errP) throw errP;

        const { data: apps } = await window.cortexClient
            .from('aplicacoes_instrumento').select('paciente_id, status');
        const porPac = new Map();
        for (const a of (apps || [])) {
            if (!a.paciente_id) continue;
            const r = porPac.get(a.paciente_id) || { total: 0, concl: 0 };
            r.total++; if (CONCLUIDOS.has(a.status)) r.concl++;
            porPac.set(a.paciente_id, r);
        }

        const estados = (pacs || []).map(p => {
            const r = porPac.get(p.id);
            let estado = 'sem_bateria';
            if (r && r.total > 0) estado = (r.total === r.concl) ? 'finalizado' : 'andamento';
            return { id: p.id, nome: p.nome_completo, aplicador_id: aplicadorDoPaciente.get(p.id) || null, estado };
        });

        const map = new Map();
        const ensure = (id) => {
            const k = id || '__sem__';
            if (!map.has(k)) map.set(k, { aplicador_id: id, vinculados: 0, finalizados: 0, andamento: 0, sem: 0 });
            return map.get(k);
        };
        for (const e of estados) {
            const r = ensure(e.aplicador_id);
            r.vinculados++;
            if (e.estado === 'finalizado') r.finalizados++;
            else if (e.estado === 'andamento') r.andamento++;
            else r.sem++;
        }

        let porAplicador = Array.from(map.values())
            .map(r => ({ ...r, nome: nomeProf(r.aplicador_id) || '— Sem aplicador —' }))
            .sort((a, b) => b.finalizados - a.finalizados || b.vinculados - a.vinculados);

        let pacientes = estados;
        if (st.filtroProfissional) {
            porAplicador = porAplicador.filter(r => r.aplicador_id === st.filtroProfissional);
            pacientes = pacientes.filter(p => p.aplicador_id === st.filtroProfissional);
        }
        st.dados = { porAplicador, pacientes };
    }

    function renderPacientes() {
        const d = state.abas.pacientes.dados || { porAplicador: [], pacientes: [] };
        const totV = d.porAplicador.reduce((a, r) => a + r.vinculados, 0);
        const totF = d.porAplicador.reduce((a, r) => a + r.finalizados, 0);
        const totA = d.porAplicador.reduce((a, r) => a + r.andamento, 0);

        const cards = `
            <div class="rel-cards">
                ${renderCard(ICONES.users, 'Pacientes ativos', totV)}
                ${renderCard(ICONES.package, 'Finalizados', totF, 'bateria 100%')}
                ${renderCard(ICONES.hourglass, 'Em andamento', totA)}
            </div>`;

        if (d.porAplicador.length === 0)
            return cards + vazio('👥', 'Nenhum paciente', 'Nenhum paciente vinculado para este filtro.');

        const ESTADO_BADGE = {
            finalizado: '<span class="rel-badge" style="background:#dcfce7;color:#166534;">Finalizado</span>',
            andamento:  '<span class="rel-badge" style="background:#fef9c3;color:#854d0e;">Em andamento</span>',
            sem_bateria:'<span class="rel-badge" style="background:#f1f5f9;color:#475569;">Sem bateria</span>'
        };

        return cards + `
            <div class="rel-secao">
                <h2 class="rel-secao-titulo"><span class="rel-secao-ico">${ICONES.ranking}</span> Por aplicador</h2>
                <div class="rel-tabela-wrap">
                    <table class="rel-tabela">
                        <thead><tr>
                            <th>Aplicador</th>
                            <th class="col-num">Vinculados</th>
                            <th class="col-num">Finalizados</th>
                            <th class="col-num">Em andamento</th>
                            <th class="col-num">Sem bateria</th>
                        </tr></thead>
                        <tbody>
                            ${d.porAplicador.map(r => `
                                <tr>
                                    <td>${escapeHtml(r.nome)}</td>
                                    <td class="col-num">${r.vinculados}</td>
                                    <td class="col-num">${r.finalizados}</td>
                                    <td class="col-num">${r.andamento}</td>
                                    <td class="col-num">${r.sem}</td>
                                </tr>`).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
            <div class="rel-secao">
                <h2 class="rel-secao-titulo"><span class="rel-secao-ico">${ICONES.list}</span> Pacientes (${d.pacientes.length})</h2>
                <div class="rel-tabela-wrap">
                    <table class="rel-tabela">
                        <thead><tr><th>Paciente</th><th>Aplicador</th><th>Situação da bateria</th></tr></thead>
                        <tbody>
                            ${d.pacientes
                                .sort((a, b) => a.nome.localeCompare(b.nome))
                                .map(p => `
                                <tr>
                                    <td>${escapeHtml(p.nome)}</td>
                                    <td>${escapeHtml(nomeProf(p.aplicador_id) || '—')}</td>
                                    <td>${ESTADO_BADGE[p.estado] || ''}</td>
                                </tr>`).join('')}
                        </tbody>
                    </table>
                </div>
            </div>`;
    }

    // ═══ ABA 3: Atividades (quem fez o quê) ══════════════════════════════════
    async function carregarAtividades() {
        const st = state.abas.atividades;
        const { inicio, fim } = mesIntervalo(st.mes);

        let q = window.cortexClient
            .from('auditoria_acessos')
            .select('timestamp, profissional_id, acao, tabela, registro_id, paciente_id, detalhes')
            .gte('timestamp', inicio.toISOString()).lt('timestamp', fim.toISOString())
            .order('timestamp', { ascending: false })
            .limit(500);
        if (st.filtroProfissional) q = q.eq('profissional_id', st.filtroProfissional);

        const { data, error } = await q;
        if (error) throw error;

        let rows = data || [];
        if (!st.incluirRuido) rows = rows.filter(r => !['leitura', 'login', 'logout'].includes(r.acao));

        // Nomes de pacientes referenciados
        const pacIds = [...new Set(rows.map(r => r.paciente_id).filter(Boolean))];
        let nomePac = new Map();
        if (pacIds.length) {
            const { data: pacs } = await window.cortexClient
                .from('pacientes').select('id, nome_completo').in('id', pacIds);
            nomePac = new Map((pacs || []).map(p => [p.id, p.nome_completo]));
        }
        st.dados = { rows, nomePac };
    }

    function renderAtividades() {
        const d = state.abas.atividades.dados || { rows: [], nomePac: new Map() };
        const rows = d.rows;
        const nCri = rows.filter(r => r.acao === 'criacao').length;
        const nEdi = rows.filter(r => r.acao === 'edicao').length;
        const nDel = rows.filter(r => r.acao === 'delecao').length;

        const cards = `
            <div class="rel-cards">
                ${renderCard(ICONES.list, 'Ações no período', rows.length)}
                ${renderCard(ICONES.check, 'Criações', nCri)}
                ${renderCard(ICONES.edit, 'Edições', nEdi)}
                ${renderCard(ICONES.trash, 'Remoções', nDel)}
            </div>`;

        if (rows.length === 0)
            return cards + vazio('🗂️', 'Nenhuma atividade', 'Sem registros para este filtro. Marque "Incluir leituras e logins" para ver tudo.');

        const linhas = rows.map(r => {
            const cor = ACAO_COR[r.acao] || '#64748b';
            const verbo = ACAO_LABEL[r.acao] || r.acao;
            const alvo = TABELA_LABEL[r.tabela] || r.tabela || '';
            const pac = r.paciente_id ? d.nomePac.get(r.paciente_id) : null;
            return `
                <div class="rel-atv-row">
                    <div class="rel-atv-dot" style="background:${cor};"></div>
                    <div class="rel-atv-body">
                        <div class="rel-atv-linha">
                            <strong>${escapeHtml(nomeProf(r.profissional_id) || 'Profissional')}</strong>
                            <span style="color:${cor};font-weight:600;">${escapeHtml(verbo)}</span>
                            ${alvo ? `<span class="rel-atv-alvo">${escapeHtml(alvo)}</span>` : ''}
                            ${pac ? `<span class="rel-atv-pac">· ${escapeHtml(pac)}</span>` : ''}
                        </div>
                        <div class="rel-atv-tempo">${formatDataHora(r.timestamp)}</div>
                    </div>
                </div>`;
        }).join('');

        return cards + `
            <div class="rel-secao">
                <h2 class="rel-secao-titulo"><span class="rel-secao-ico">${ICONES.list}</span> Linha do tempo${rows.length >= 500 ? ' (500 mais recentes)' : ''}</h2>
                <div class="rel-atv">${linhas}</div>
            </div>`;
    }

    // ─── Componentes ─────────────────────────────────────────────────────────
    function renderCard(icone, label, valor, sub) {
        return `
            <div class="rel-card">
                <div class="rel-card-ico">${icone}</div>
                <div class="rel-card-label">${escapeHtml(label)}</div>
                <div class="rel-card-valor">${escapeHtml(String(valor))}</div>
                ${sub ? `<div class="rel-card-sub">${escapeHtml(sub)}</div>` : ''}
            </div>`;
    }

    function renderBarras(titulo, icone, ranking) {
        if (!ranking || ranking.length === 0) return '';
        const maxVal = Math.max(...ranking.map(([, v]) => v), 1);
        return `
            <div class="rel-secao">
                <h2 class="rel-secao-titulo"><span class="rel-secao-ico">${icone}</span> ${escapeHtml(titulo)}</h2>
                <div class="rel-bars">
                    ${ranking.map(([nome, qtd]) => {
                        const pct = (qtd / maxVal) * 100;
                        return `
                            <div class="rel-bar-row">
                                <div class="rel-bar-label" title="${escapeHtml(nome)}">${escapeHtml(nome)}</div>
                                <div class="rel-bar-track"><div class="rel-bar-fill" style="width: ${pct}%;"></div></div>
                                <div class="rel-bar-val">${qtd}</div>
                            </div>`;
                    }).join('')}
                </div>
            </div>`;
    }

    function vazio(emoji, titulo, msg) {
        return `<div class="rel-vazio"><div class="rel-vazio-ic">${emoji}</div><h3>${escapeHtml(titulo)}</h3><p>${escapeHtml(msg)}</p></div>`;
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────
    function mesIntervalo(d) {
        return { inicio: new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0),
                 fim:    new Date(d.getFullYear(), d.getMonth() + 1, 1, 0, 0, 0) };
    }
    function mesIgualHoje(d) {
        const h = new Date();
        return d.getFullYear() === h.getFullYear() && d.getMonth() === h.getMonth();
    }
    function nomeProf(id) {
        if (!id) return null;
        return state.profissionais.find(p => p.id === id)?.nome_completo || null;
    }
    function formatDataHora(iso) {
        if (!iso) return '—';
        const d = new Date(iso);
        return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
             + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }
    function escapeHtml(t) {
        if (t == null) return '';
        const d = document.createElement('div'); d.textContent = String(t); return d.innerHTML;
    }
})();

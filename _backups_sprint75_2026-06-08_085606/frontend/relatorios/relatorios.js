// ============================================================================
// CORTEX_APP — Sprint 75 — relatorios.js
// Página de relatórios com 4 abas, visual interativo e colorido.
// Acesso restrito a admin (clínico ou gestor).
// ============================================================================

(function() {
    'use strict';

    const ICONES = {
        cadastros:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>',
        corrigidos:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
        baterias:       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
        produtividade:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
        users:          '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>',
        userPlus:       '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>',
        check:          '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
        chart:          '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
        calendar:       '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
        award:          '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>',
        xCircle:        '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
        target:         '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
        package:        '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>',
        lock:           '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
        ranking:        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>',
        list:           '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>'
    };

    const TAB_LABELS = {
        cadastros: 'Cadastros',
        corrigidos: 'Testes corrigidos',
        baterias: 'Conclusões de bateria',
        produtividade: 'Produtividade'
    };

    const state = {
        abaAtiva: 'cadastros',
        ehAdmin: false,
        profissionais: [],
        abas: {
            cadastros:     { mes: new Date(), filtroProfissional: '', dados: null },
            corrigidos:    { mes: new Date(), filtroProfissional: '', dados: null },
            baterias:      { mes: new Date(),                          dados: null },
            produtividade: { mes: new Date(),                          dados: null }
        }
    };

    window.addEventListener('cortex:auth-ready', async () => {
        await CortexSidebar.render('relatorios');

        const perfil = window.cortexProfissional?.perfil;
        state.ehAdmin = (perfil === 'admin_clinico' || perfil === 'admin_gestor');
        if (!state.ehAdmin) {
            renderSemPermissao();
            return;
        }

        try {
            const { data } = await window.cortexClient
                .from('profissionais')
                .select('id, nome_completo, perfil')
                .eq('ativo', true)
                .order('nome_completo');
            state.profissionais = data || [];
        } catch (e) {
            console.warn('[relatorios] profissionais:', e);
            state.profissionais = [];
        }

        for (const k of Object.keys(state.abas)) {
            const m = state.abas[k].mes;
            state.abas[k].mes = new Date(m.getFullYear(), m.getMonth(), 1);
        }

        renderEsqueleto();
        await trocarAba('cadastros');
    });

    function renderEsqueleto() {
        document.getElementById('rel-conteudo').innerHTML = `
            <div class="rel-tabs">
                ${Object.keys(TAB_LABELS).map(k => `
                    <button class="rel-tab" data-aba="${k}">
                        <span class="rel-tab-ico">${ICONES[k]}</span>
                        <span>${TAB_LABELS[k]}</span>
                    </button>
                `).join('')}
            </div>
            <div id="rel-painel" class="rel-painel" data-aba="cadastros"></div>
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
        document.querySelectorAll('.rel-tab').forEach(b => {
            b.classList.toggle('ativa', b.dataset.aba === aba);
        });
        const painel = document.getElementById('rel-painel');
        painel.setAttribute('data-aba', aba);
        painel.style.animation = 'none';
        void painel.offsetWidth;
        painel.style.animation = '';
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
            if (aba === 'cadastros')          await carregarCadastros();
            else if (aba === 'corrigidos')    await carregarCorrigidos();
            else if (aba === 'baterias')      await carregarBaterias();
            else if (aba === 'produtividade') await carregarProdutividade();
        } catch (err) {
            console.error('[relatorios]', aba, err);
            corpo.innerHTML = vazio('⚠️', 'Erro ao carregar', err.message || 'Tente novamente em instantes.');
            return;
        }

        if (aba === 'cadastros')          corpo.innerHTML = renderCadastros();
        else if (aba === 'corrigidos')    corpo.innerHTML = renderCorrigidos();
        else if (aba === 'baterias')      corpo.innerHTML = renderBaterias();
        else if (aba === 'produtividade') corpo.innerHTML = renderProdutividade();
    }

    function renderFiltrosHTML(aba) {
        const st = state.abas[aba];
        const mesLabel = st.mes.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
        const ehMesAtual = mesIgualHoje(st.mes);

        let extra = '';
        if (aba === 'cadastros' || aba === 'corrigidos') {
            const opcoes = state.profissionais.map(p =>
                `<option value="${escapeHtml(p.id)}" ${p.id === st.filtroProfissional ? 'selected' : ''}>${escapeHtml(p.nome_completo)}</option>`
            ).join('');
            const label = aba === 'cadastros' ? 'Cadastrado por' : 'Aplicador';
            extra = `
                <div class="rel-filtro-extra">
                    <label>${label}:</label>
                    <select data-filtro-prof>
                        <option value="">Todos</option>
                        ${opcoes}
                    </select>
                </div>
            `;
        }

        return `
            <div class="rel-filtros">
                <div class="rel-nav-mes">
                    <button class="rel-nav-btn" data-nav="ant" title="Mês anterior">‹</button>
                    <span class="rel-nav-mes-label">${escapeHtml(mesLabel)}</span>
                    <button class="rel-nav-btn" data-nav="prox" title="Mês seguinte" ${ehMesAtual ? 'disabled' : ''}>›</button>
                    ${!ehMesAtual ? `<button class="rel-nav-btn rel-nav-btn-texto" data-nav="hoje" title="Voltar ao mês atual">Hoje</button>` : ''}
                </div>
                ${extra}
            </div>
        `;
    }

    function bindFiltros(aba) {
        const st = state.abas[aba];
        const root = document.getElementById('rel-painel');
        root.querySelector('[data-nav="ant"]')?.addEventListener('click', () => {
            st.mes = new Date(st.mes.getFullYear(), st.mes.getMonth() - 1, 1);
            st.dados = null;
            renderAba();
        });
        root.querySelector('[data-nav="prox"]')?.addEventListener('click', () => {
            if (mesIgualHoje(st.mes)) return;
            st.mes = new Date(st.mes.getFullYear(), st.mes.getMonth() + 1, 1);
            st.dados = null;
            renderAba();
        });
        root.querySelector('[data-nav="hoje"]')?.addEventListener('click', () => {
            const hoje = new Date();
            st.mes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
            st.dados = null;
            renderAba();
        });
        const selProf = root.querySelector('[data-filtro-prof]');
        if (selProf) {
            selProf.addEventListener('change', () => {
                st.filtroProfissional = selProf.value;
                st.dados = null;
                renderAba();
            });
        }
    }

    // ─── ABA 1: Cadastros ────────────────────────────────────────────────────
    async function carregarCadastros() {
        const st = state.abas.cadastros;
        const { inicio, fim } = mesIntervalo(st.mes);

        let q = window.cortexClient
            .from('pacientes')
            .select('id, nome_completo, created_at, created_by')
            .gte('created_at', inicio.toISOString())
            .lt('created_at', fim.toISOString())
            .order('created_at', { ascending: false });

        if (st.filtroProfissional) q = q.eq('created_by', st.filtroProfissional);

        const { data, error } = await q;
        if (error) throw error;
        st.dados = data || [];
    }

    function renderCadastros() {
        const st = state.abas.cadastros;
        const lista = st.dados || [];
        const total = lista.length;

        const porProf = new Map();
        for (const p of lista) {
            const nome = nomeProf(p.created_by) || '— Sem profissional —';
            porProf.set(nome, (porProf.get(nome) || 0) + 1);
        }
        const ranking = Array.from(porProf.entries()).sort((a, b) => b[1] - a[1]);

        const cards = `
            <div class="rel-cards">
                ${renderCard(ICONES.userPlus, 'Total no mês', total)}
                ${renderCard(ICONES.users, 'Profissionais ativos', porProf.size, 'cadastraram pelo menos 1')}
                ${renderCard(ICONES.chart, 'Média por dia útil', diasUteisDoMes(st.mes) ? (total / diasUteisDoMes(st.mes)).toFixed(1) : 0)}
            </div>
        `;

        if (total === 0) return cards + vazio('📭', 'Nenhum cadastro neste período', 'Os novos pacientes cadastrados aparecerão aqui.');

        return cards
            + renderBarras('Ranking por profissional', ICONES.ranking, ranking)
            + renderTabelaListaCadastros(lista);
    }

    function renderTabelaListaCadastros(lista) {
        return `
            <div class="rel-secao">
                <h2 class="rel-secao-titulo"><span class="rel-secao-ico">${ICONES.list}</span> Pacientes cadastrados</h2>
                <div class="rel-tabela-wrap">
                    <table class="rel-tabela">
                        <thead><tr><th>Data</th><th>Paciente</th><th>Cadastrado por</th></tr></thead>
                        <tbody>
                            ${lista.map(p => `
                                <tr>
                                    <td>${formatDataHora(p.created_at)}</td>
                                    <td><a href="../pacientes/pasta.html?id=${escapeHtml(p.id)}">${escapeHtml(p.nome_completo)}</a></td>
                                    <td>${escapeHtml(nomeProf(p.created_by) || '—')}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    // ─── ABA 2: Corrigidos ───────────────────────────────────────────────────
    async function carregarCorrigidos() {
        const st = state.abas.corrigidos;
        const { inicio, fim } = mesIntervalo(st.mes);

        let q = window.cortexClient
            .from('aplicacoes_instrumento')
            .select('id, paciente_id, instrumento_id, aplicador_id, updated_at, status')
            .eq('status', 'corrigido')
            .gte('updated_at', inicio.toISOString())
            .lt('updated_at', fim.toISOString())
            .order('updated_at', { ascending: false });

        if (st.filtroProfissional) q = q.eq('aplicador_id', st.filtroProfissional);

        const { data, error } = await q;
        if (error) throw error;
        const apps = data || [];

        const pacIds  = [...new Set(apps.map(a => a.paciente_id).filter(Boolean))];
        const instIds = [...new Set(apps.map(a => a.instrumento_id).filter(Boolean))];

        const [pacRes, instRes] = await Promise.all([
            pacIds.length
                ? window.cortexClient.from('pacientes').select('id, nome_completo').in('id', pacIds)
                : { data: [] },
            instIds.length
                ? window.cortexClient.from('instrumentos_catalogo').select('id, sigla, nome_completo').in('id', instIds)
                : { data: [] }
        ]);
        const pacMap  = new Map((pacRes.data  || []).map(p => [p.id, p.nome_completo]));
        const instMap = new Map((instRes.data || []).map(i => [i.id, i]));

        st.dados = apps.map(a => ({
            ...a,
            pacienteNome:     pacMap.get(a.paciente_id) || '—',
            instrumentoSigla: instMap.get(a.instrumento_id)?.sigla || '—',
            instrumentoNome:  instMap.get(a.instrumento_id)?.nome_completo || '—'
        }));
    }

    function renderCorrigidos() {
        const st = state.abas.corrigidos;
        const lista = st.dados || [];
        const total = lista.length;

        const porAplicador = new Map();
        const porInstrumento = new Map();
        for (const a of lista) {
            const nomeAp = nomeProf(a.aplicador_id) || '— Sem aplicador —';
            porAplicador.set(nomeAp, (porAplicador.get(nomeAp) || 0) + 1);
            porInstrumento.set(a.instrumentoSigla, (porInstrumento.get(a.instrumentoSigla) || 0) + 1);
        }
        const rankAp   = Array.from(porAplicador.entries()).sort((a,b) => b[1]-a[1]);
        const rankInst = Array.from(porInstrumento.entries()).sort((a,b) => b[1]-a[1]);

        const cards = `
            <div class="rel-cards">
                ${renderCard(ICONES.check, 'Total corrigidos', total)}
                ${renderCard(ICONES.users, 'Aplicadores envolvidos', porAplicador.size)}
                ${renderCard(ICONES.package, 'Instrumentos diferentes', porInstrumento.size)}
            </div>
        `;
        if (total === 0) return cards + vazio('🎯', 'Nenhum teste corrigido neste período', 'Quando aplicações forem corrigidas, aparecem aqui.');

        return cards + `
            <div class="rel-grid-2">
                ${renderBarras('Por aplicador', ICONES.ranking, rankAp)}
                ${renderBarras('Por instrumento', ICONES.ranking, rankInst)}
            </div>
            <div class="rel-secao">
                <h2 class="rel-secao-titulo"><span class="rel-secao-ico">${ICONES.list}</span> Lista detalhada</h2>
                <div class="rel-tabela-wrap">
                    <table class="rel-tabela">
                        <thead>
                            <tr><th>Data</th><th>Paciente</th><th>Instrumento</th><th>Aplicador</th></tr>
                        </thead>
                        <tbody>
                            ${lista.map(a => `
                                <tr>
                                    <td>${formatDataHora(a.updated_at)}</td>
                                    <td><a href="../pacientes/pasta.html?id=${escapeHtml(a.paciente_id)}">${escapeHtml(a.pacienteNome)}</a></td>
                                    <td title="${escapeHtml(a.instrumentoNome)}"><span class="rel-pill">${escapeHtml(a.instrumentoSigla)}</span></td>
                                    <td>${escapeHtml(nomeProf(a.aplicador_id) || '—')}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    // ─── ABA 3: Baterias ─────────────────────────────────────────────────────
    async function carregarBaterias() {
        const st = state.abas.baterias;
        const { inicio, fim } = mesIntervalo(st.mes);

        const { data: apps, error } = await window.cortexClient
            .from('aplicacoes_instrumento')
            .select('paciente_id, status, updated_at');
        if (error) throw error;

        const CONCLUIDOS = new Set(['concluido_aplicacao', 'corrigido']);
        const porPac = new Map();
        for (const a of (apps || [])) {
            if (!a.paciente_id) continue;
            const rec = porPac.get(a.paciente_id) || { total: 0, concluidas: 0, ultima: null };
            rec.total++;
            if (CONCLUIDOS.has(a.status)) {
                rec.concluidas++;
                if (!rec.ultima || new Date(a.updated_at) > new Date(rec.ultima)) {
                    rec.ultima = a.updated_at;
                }
            }
            porPac.set(a.paciente_id, rec);
        }

        const candidatos = [];
        for (const [pacId, rec] of porPac) {
            if (rec.total === 0 || rec.total !== rec.concluidas) continue;
            if (!rec.ultima) continue;
            const d = new Date(rec.ultima);
            if (d >= inicio && d < fim) {
                candidatos.push({ pacienteId: pacId, total: rec.total, em: rec.ultima });
            }
        }

        if (candidatos.length === 0) { st.dados = []; return; }

        const pacIds = candidatos.map(c => c.pacienteId);
        const { data: pacs } = await window.cortexClient
            .from('pacientes')
            .select('id, nome_completo, status')
            .in('id', pacIds);
        const pacMap = new Map((pacs || []).map(p => [p.id, p]));

        st.dados = candidatos
            .filter(c => pacMap.has(c.pacienteId))
            .map(c => ({
                ...pacMap.get(c.pacienteId),
                totalAplicacoes: c.total,
                concluidaEm: c.em
            }))
            .sort((a, b) => new Date(b.concluidaEm) - new Date(a.concluidaEm));
    }

    function renderBaterias() {
        const st = state.abas.baterias;
        const lista = st.dados || [];
        const total = lista.length;
        const totalTestes = lista.reduce((acc, p) => acc + (p.totalAplicacoes || 0), 0);

        const cards = `
            <div class="rel-cards">
                ${renderCard(ICONES.award, 'Baterias concluídas', total)}
                ${renderCard(ICONES.package, 'Total de testes', totalTestes, 'soma das aplicações')}
                ${renderCard(ICONES.target, 'Média testes/bateria', total ? (totalTestes/total).toFixed(1) : 0)}
            </div>
        `;
        if (total === 0) return cards + vazio('🏆', 'Nenhuma bateria concluída neste mês', 'Quando todos os testes de um paciente forem concluídos, ele aparece aqui.');

        return cards + `
            <div class="rel-secao">
                <h2 class="rel-secao-titulo"><span class="rel-secao-ico">${ICONES.list}</span> Pacientes com bateria concluída</h2>
                <div class="rel-tabela-wrap">
                    <table class="rel-tabela">
                        <thead>
                            <tr><th>Concluída em</th><th>Paciente</th><th class="col-num">Testes</th><th>Status</th></tr>
                        </thead>
                        <tbody>
                            ${lista.map(p => `
                                <tr>
                                    <td>${formatDataHora(p.concluidaEm)}</td>
                                    <td><a href="../pacientes/pasta.html?id=${escapeHtml(p.id)}">${escapeHtml(p.nome_completo)}</a></td>
                                    <td class="col-num">${p.totalAplicacoes}</td>
                                    <td><span class="rel-pill ${p.status === 'arquivado' ? 'arquivado' : 'ativo'}">${escapeHtml(p.status === 'arquivado' ? 'Arquivado' : 'Ativo')}</span></td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    // ─── ABA 4: Produtividade ────────────────────────────────────────────────
    async function carregarProdutividade() {
        const st = state.abas.produtividade;
        const { inicio, fim } = mesIntervalo(st.mes);

        const { data: sessoes, error: errS } = await window.cortexClient
            .from('sessoes')
            .select('id, profissional_id, paciente_id, status, data_hora_inicio')
            .gte('data_hora_inicio', inicio.toISOString())
            .lt('data_hora_inicio', fim.toISOString());
        if (errS) throw errS;

        const { data: corrigidos, error: errC } = await window.cortexClient
            .from('aplicacoes_instrumento')
            .select('aplicador_id, updated_at')
            .eq('status', 'corrigido')
            .gte('updated_at', inicio.toISOString())
            .lt('updated_at', fim.toISOString());
        if (errC) throw errC;

        const map = new Map();
        const ensure = (id) => {
            if (!map.has(id)) map.set(id, {
                profissional_id: id,
                sessoes: 0, realizadas: 0, faltas: 0, canceladas: 0,
                pacientesAtendidos: new Set(),
                testesCorrigidos: 0
            });
            return map.get(id);
        };

        for (const s of (sessoes || [])) {
            if (!s.profissional_id) continue;
            const r = ensure(s.profissional_id);
            r.sessoes++;
            if (s.status === 'realizada') {
                r.realizadas++;
                if (s.paciente_id) r.pacientesAtendidos.add(s.paciente_id);
            } else if (s.status === 'falta') {
                r.faltas++;
            } else if (s.status === 'cancelada') {
                r.canceladas++;
            }
        }
        for (const c of (corrigidos || [])) {
            if (!c.aplicador_id) continue;
            const r = ensure(c.aplicador_id);
            r.testesCorrigidos++;
        }

        st.dados = Array.from(map.values()).map(r => ({
            ...r,
            nome: nomeProf(r.profissional_id) || '— Sem nome —',
            pacientesAtendidos: r.pacientesAtendidos.size
        })).sort((a, b) => b.sessoes - a.sessoes);
    }

    function renderProdutividade() {
        const st = state.abas.produtividade;
        const lista = st.dados || [];

        const totSessoes = lista.reduce((a,r) => a+r.sessoes, 0);
        const totRealiz  = lista.reduce((a,r) => a+r.realizadas, 0);
        const totFaltas  = lista.reduce((a,r) => a+r.faltas, 0);
        const totCorrig  = lista.reduce((a,r) => a+r.testesCorrigidos, 0);

        const cards = `
            <div class="rel-cards">
                ${renderCard(ICONES.calendar, 'Sessões agendadas', totSessoes)}
                ${renderCard(ICONES.check, 'Realizadas', totRealiz, totSessoes ? `${Math.round(100*totRealiz/totSessoes)}% das agendadas` : '')}
                ${renderCard(ICONES.xCircle, 'Faltas', totFaltas, totSessoes ? `${Math.round(100*totFaltas/totSessoes)}% das agendadas` : '')}
                ${renderCard(ICONES.check, 'Testes corrigidos', totCorrig)}
            </div>
        `;
        if (lista.length === 0) return cards + vazio('📊', 'Nenhuma atividade neste período', 'Quando profissionais agendarem ou aplicarem, aparece aqui.');

        const rankRealiz = lista
            .map(r => [r.nome, r.realizadas])
            .filter(([, v]) => v > 0)
            .sort((a, b) => b[1] - a[1]);

        return cards + `
            ${rankRealiz.length ? renderBarras('Sessões realizadas por aplicador', ICONES.ranking, rankRealiz) : ''}
            <div class="rel-secao">
                <h2 class="rel-secao-titulo"><span class="rel-secao-ico">${ICONES.list}</span> Detalhamento completo</h2>
                <div class="rel-tabela-wrap">
                    <table class="rel-tabela">
                        <thead>
                            <tr>
                                <th>Aplicador</th>
                                <th class="col-num">Agendadas</th>
                                <th class="col-num">Realizadas</th>
                                <th class="col-num">Faltas</th>
                                <th class="col-num">Canceladas</th>
                                <th class="col-num">Pacientes</th>
                                <th class="col-num">Testes corrigidos</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${lista.map(r => `
                                <tr>
                                    <td>${escapeHtml(r.nome)}</td>
                                    <td class="col-num">${r.sessoes}</td>
                                    <td class="col-num">${r.realizadas}</td>
                                    <td class="col-num">${r.faltas}</td>
                                    <td class="col-num">${r.canceladas}</td>
                                    <td class="col-num">${r.pacientesAtendidos}</td>
                                    <td class="col-num">${r.testesCorrigidos}</td>
                                </tr>
                            `).join('')}
                            <tr class="col-total">
                                <td>Total</td>
                                <td class="col-num">${totSessoes}</td>
                                <td class="col-num">${totRealiz}</td>
                                <td class="col-num">${totFaltas}</td>
                                <td class="col-num">${lista.reduce((a,r)=>a+r.canceladas,0)}</td>
                                <td class="col-num">—</td>
                                <td class="col-num">${totCorrig}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    // ─── Componentes ─────────────────────────────────────────────────────────
    function renderCard(icone, label, valor, sub) {
        return `
            <div class="rel-card">
                <div class="rel-card-ico">${icone}</div>
                <div class="rel-card-label">${escapeHtml(label)}</div>
                <div class="rel-card-valor">${escapeHtml(String(valor))}</div>
                ${sub ? `<div class="rel-card-sub">${escapeHtml(sub)}</div>` : ''}
            </div>
        `;
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
                                <div class="rel-bar-track">
                                    <div class="rel-bar-fill" style="width: ${pct}%;"></div>
                                </div>
                                <div class="rel-bar-val">${qtd}</div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }

    function vazio(emoji, titulo, msg) {
        return `
            <div class="rel-vazio">
                <div class="rel-vazio-ic">${emoji}</div>
                <h3>${escapeHtml(titulo)}</h3>
                <p>${escapeHtml(msg)}</p>
            </div>
        `;
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────
    function mesIntervalo(d) {
        const inicio = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0);
        const fim    = new Date(d.getFullYear(), d.getMonth() + 1, 1, 0, 0, 0);
        return { inicio, fim };
    }
    function mesIgualHoje(d) {
        const hoje = new Date();
        return d.getFullYear() === hoje.getFullYear() && d.getMonth() === hoje.getMonth();
    }
    function diasUteisDoMes(d) {
        const hoje = new Date();
        const fim = mesIgualHoje(d) ? hoje : new Date(d.getFullYear(), d.getMonth() + 1, 0);
        const ini = new Date(d.getFullYear(), d.getMonth(), 1);
        let n = 0;
        for (let dt = new Date(ini); dt <= fim; dt.setDate(dt.getDate() + 1)) {
            const dow = dt.getDay();
            if (dow !== 0 && dow !== 6) n++;
        }
        return n;
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

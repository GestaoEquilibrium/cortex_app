// ============================================================================
// CORTEX_APP — Sprint 74 — relatorios.js
// Página de relatórios com 4 abas:
//   1. Cadastros de pacientes
//   2. Testes corrigidos
//   3. Conclusões de bateria
//   4. Produtividade por aplicador
//
// Acesso restrito a admin (clínico ou gestor).
// Cada aba tem filtro próprio de período (mês). Default = mês atual.
// ============================================================================

(function() {
    'use strict';

    // Estado por aba — cada uma cuida do próprio período
    const state = {
        abaAtiva: 'cadastros',
        ehAdmin: false,
        profissionais: [], // lista pra filtros e join
        abas: {
            cadastros:     { mes: new Date(), filtroProfissional: '', dados: null, carregando: false },
            corrigidos:    { mes: new Date(), filtroProfissional: '', dados: null, carregando: false },
            baterias:      { mes: new Date(),                          dados: null, carregando: false },
            produtividade: { mes: new Date(),                          dados: null, carregando: false }
        }
    };

    // ─── Init ────────────────────────────────────────────────────────────────
    window.addEventListener('cortex:auth-ready', async () => {
        await CortexSidebar.render('relatorios');

        // Gate de permissão (admin clínico ou gestor)
        const perfil = window.cortexProfissional?.perfil;
        state.ehAdmin = (perfil === 'admin_clinico' || perfil === 'admin_gestor');
        if (!state.ehAdmin) {
            renderSemPermissao();
            return;
        }

        // Carrega lista de profissionais (pra filtros e nomes)
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

        // Normaliza mes pra dia 1
        for (const k of Object.keys(state.abas)) {
            const m = state.abas[k].mes;
            state.abas[k].mes = new Date(m.getFullYear(), m.getMonth(), 1);
        }

        renderEsqueleto();
        await trocarAba('cadastros');
    });

    // ─── Esqueleto da página (tabs + container) ──────────────────────────────
    function renderEsqueleto() {
        document.getElementById('rel-conteudo').innerHTML = `
            <div class="rel-tabs">
                <button class="rel-tab" data-aba="cadastros">Cadastros</button>
                <button class="rel-tab" data-aba="corrigidos">Testes corrigidos</button>
                <button class="rel-tab" data-aba="baterias">Conclusões de bateria</button>
                <button class="rel-tab" data-aba="produtividade">Produtividade por aplicador</button>
            </div>
            <div id="rel-painel"></div>
        `;
        document.querySelectorAll('.rel-tab').forEach(btn => {
            btn.addEventListener('click', () => trocarAba(btn.dataset.aba));
        });
    }

    function renderSemPermissao() {
        document.getElementById('rel-conteudo').innerHTML = `
            <div class="rel-restrito">
                <div class="rel-vazio-ic">🔒</div>
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
        await renderAba();
    }

    // ─── Roteador da aba ativa ───────────────────────────────────────────────
    async function renderAba() {
        const painel = document.getElementById('rel-painel');
        const aba = state.abaAtiva;
        const st = state.abas[aba];

        // Mostra esqueleto da aba (filtros) imediatamente
        painel.innerHTML = renderFiltrosHTML(aba) + `<div id="rel-aba-corpo"></div>`;
        bindFiltros(aba);

        const corpo = document.getElementById('rel-aba-corpo');
        corpo.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>Carregando...</p></div>`;

        try {
            if (aba === 'cadastros')          await carregarCadastros();
            else if (aba === 'corrigidos')    await carregarCorrigidos();
            else if (aba === 'baterias')      await carregarBaterias();
            else if (aba === 'produtividade') await carregarProdutividade();
        } catch (err) {
            console.error('[relatorios]', aba, err);
            corpo.innerHTML = `<div class="rel-vazio"><div class="rel-vazio-ic">⚠️</div>
                <p>Erro ao carregar: ${escapeHtml(err.message || 'desconhecido')}</p></div>`;
            return;
        }

        if (aba === 'cadastros')          corpo.innerHTML = renderCadastros();
        else if (aba === 'corrigidos')    corpo.innerHTML = renderCorrigidos();
        else if (aba === 'baterias')      corpo.innerHTML = renderBaterias();
        else if (aba === 'produtividade') corpo.innerHTML = renderProdutividade();
    }

    // ─── Filtros (nav de mês + filtros específicos da aba) ───────────────────
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
                    ${!ehMesAtual ? `<button class="rel-nav-btn" data-nav="hoje" title="Voltar ao mês atual" style="width:auto;padding:0 10px;">Hoje</button>` : ''}
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

    // ─── ABA 1: Cadastros de pacientes ───────────────────────────────────────
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

        // Agrupa por profissional
        const porProf = new Map();
        for (const p of lista) {
            const nome = nomeProf(p.created_by) || '— Sem profissional —';
            porProf.set(nome, (porProf.get(nome) || 0) + 1);
        }
        const ranking = Array.from(porProf.entries()).sort((a, b) => b[1] - a[1]);

        const cards = `
            <div class="rel-cards">
                <div class="rel-card">
                    <div class="rel-card-label">Total no mês</div>
                    <div class="rel-card-valor">${total}</div>
                </div>
                <div class="rel-card">
                    <div class="rel-card-label">Profissionais ativos</div>
                    <div class="rel-card-valor">${porProf.size}</div>
                    <div class="rel-card-sub">cadastraram pelo menos 1</div>
                </div>
                <div class="rel-card">
                    <div class="rel-card-label">Média por dia útil</div>
                    <div class="rel-card-valor">${diasUteisDoMes(st.mes) ? (total / diasUteisDoMes(st.mes)).toFixed(1) : 0}</div>
                </div>
            </div>
        `;

        if (total === 0) return cards + vazio('Nenhum cadastro no período.');

        const tabelaRanking = `
            <h2 class="rel-secao-titulo">Ranking por profissional</h2>
            <table class="rel-tabela">
                <thead><tr><th>Profissional</th><th class="col-num">Cadastros</th></tr></thead>
                <tbody>
                    ${ranking.map(([nome, qtd]) => `
                        <tr><td>${escapeHtml(nome)}</td><td class="col-num">${qtd}</td></tr>
                    `).join('')}
                    <tr class="col-total"><td>Total</td><td class="col-num">${total}</td></tr>
                </tbody>
            </table>
        `;

        const tabelaLista = `
            <h2 class="rel-secao-titulo" style="margin-top:22px;">Pacientes cadastrados</h2>
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
        `;

        return cards + tabelaRanking + tabelaLista;
    }

    // ─── ABA 2: Testes corrigidos ────────────────────────────────────────────
    async function carregarCorrigidos() {
        const st = state.abas.corrigidos;
        const { inicio, fim } = mesIntervalo(st.mes);

        // aplicacoes_instrumento em status 'corrigido' no período (usa updated_at como proxy de quando foi corrigido)
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

        // Hidrata nomes de paciente e instrumento (lote)
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
            pacienteNome:    pacMap.get(a.paciente_id) || '—',
            instrumentoSigla: instMap.get(a.instrumento_id)?.sigla || '—',
            instrumentoNome:  instMap.get(a.instrumento_id)?.nome_completo || '—'
        }));
    }

    function renderCorrigidos() {
        const st = state.abas.corrigidos;
        const lista = st.dados || [];
        const total = lista.length;

        // Agrupa por aplicador e por instrumento
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
                <div class="rel-card">
                    <div class="rel-card-label">Total corrigidos</div>
                    <div class="rel-card-valor">${total}</div>
                </div>
                <div class="rel-card">
                    <div class="rel-card-label">Aplicadores envolvidos</div>
                    <div class="rel-card-valor">${porAplicador.size}</div>
                </div>
                <div class="rel-card">
                    <div class="rel-card-label">Instrumentos diferentes</div>
                    <div class="rel-card-valor">${porInstrumento.size}</div>
                </div>
            </div>
        `;
        if (total === 0) return cards + vazio('Nenhum teste corrigido no período.');

        return cards + `
            <h2 class="rel-secao-titulo">Por aplicador</h2>
            <table class="rel-tabela">
                <thead><tr><th>Aplicador</th><th class="col-num">Corrigidos</th></tr></thead>
                <tbody>
                    ${rankAp.map(([n, q]) => `<tr><td>${escapeHtml(n)}</td><td class="col-num">${q}</td></tr>`).join('')}
                    <tr class="col-total"><td>Total</td><td class="col-num">${total}</td></tr>
                </tbody>
            </table>

            <h2 class="rel-secao-titulo" style="margin-top:22px;">Por instrumento</h2>
            <table class="rel-tabela">
                <thead><tr><th>Sigla</th><th class="col-num">Corrigidos</th></tr></thead>
                <tbody>
                    ${rankInst.map(([n, q]) => `<tr><td>${escapeHtml(n)}</td><td class="col-num">${q}</td></tr>`).join('')}
                </tbody>
            </table>

            <h2 class="rel-secao-titulo" style="margin-top:22px;">Lista detalhada</h2>
            <table class="rel-tabela">
                <thead>
                    <tr><th>Data</th><th>Paciente</th><th>Instrumento</th><th>Aplicador</th></tr>
                </thead>
                <tbody>
                    ${lista.map(a => `
                        <tr>
                            <td>${formatDataHora(a.updated_at)}</td>
                            <td><a href="../pacientes/pasta.html?id=${escapeHtml(a.paciente_id)}">${escapeHtml(a.pacienteNome)}</a></td>
                            <td title="${escapeHtml(a.instrumentoNome)}">${escapeHtml(a.instrumentoSigla)}</td>
                            <td>${escapeHtml(nomeProf(a.aplicador_id) || '—')}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    // ─── ABA 3: Conclusões de bateria ────────────────────────────────────────
    // Critério: paciente cuja ÚLTIMA aplicação concluida/corrigida caiu no período
    //           E todas as aplicações dele estão em concluido_aplicacao/corrigido.
    async function carregarBaterias() {
        const st = state.abas.baterias;
        const { inicio, fim } = mesIntervalo(st.mes);

        // Pega todas as aplicações (RLS já filtra)
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

        // Filtra: bateria 100% concluída E última atualização dentro do mês
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
        const arquivados = lista.filter(p => p.status === 'arquivado').length;

        const cards = `
            <div class="rel-cards">
                <div class="rel-card">
                    <div class="rel-card-label">Baterias concluídas</div>
                    <div class="rel-card-valor">${total}</div>
                </div>
                <div class="rel-card">
                    <div class="rel-card-label">Total de testes</div>
                    <div class="rel-card-valor">${totalTestes}</div>
                    <div class="rel-card-sub">soma das aplicações</div>
                </div>
                <div class="rel-card">
                    <div class="rel-card-label">Média de testes/bateria</div>
                    <div class="rel-card-valor">${total ? (totalTestes/total).toFixed(1) : 0}</div>
                </div>
            </div>
        `;
        if (total === 0) return cards + vazio('Nenhuma bateria concluída no período.');

        return cards + `
            <h2 class="rel-secao-titulo">Pacientes</h2>
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
                            <td>${escapeHtml(p.status === 'arquivado' ? 'Arquivado' : 'Ativo')}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    // ─── ABA 4: Produtividade por aplicador ──────────────────────────────────
    async function carregarProdutividade() {
        const st = state.abas.produtividade;
        const { inicio, fim } = mesIntervalo(st.mes);

        // Sessões agendadas no mês
        const { data: sessoes, error: errS } = await window.cortexClient
            .from('sessoes')
            .select('id, profissional_id, paciente_id, status, data_hora_inicio')
            .gte('data_hora_inicio', inicio.toISOString())
            .lt('data_hora_inicio', fim.toISOString());
        if (errS) throw errS;

        // Testes corrigidos no mês
        const { data: corrigidos, error: errC } = await window.cortexClient
            .from('aplicacoes_instrumento')
            .select('aplicador_id, updated_at')
            .eq('status', 'corrigido')
            .gte('updated_at', inicio.toISOString())
            .lt('updated_at', fim.toISOString());
        if (errC) throw errC;

        // Agrupa por profissional
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

        // Converte Set → number e nome
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
                <div class="rel-card">
                    <div class="rel-card-label">Sessões agendadas</div>
                    <div class="rel-card-valor">${totSessoes}</div>
                </div>
                <div class="rel-card">
                    <div class="rel-card-label">Realizadas</div>
                    <div class="rel-card-valor">${totRealiz}</div>
                    <div class="rel-card-sub">${totSessoes ? Math.round(100*totRealiz/totSessoes) : 0}% das agendadas</div>
                </div>
                <div class="rel-card">
                    <div class="rel-card-label">Faltas</div>
                    <div class="rel-card-valor">${totFaltas}</div>
                    <div class="rel-card-sub">${totSessoes ? Math.round(100*totFaltas/totSessoes) : 0}% das agendadas</div>
                </div>
                <div class="rel-card">
                    <div class="rel-card-label">Testes corrigidos</div>
                    <div class="rel-card-valor">${totCorrig}</div>
                </div>
            </div>
        `;
        if (lista.length === 0) return cards + vazio('Nenhuma atividade no período.');

        return cards + `
            <h2 class="rel-secao-titulo">Detalhamento por aplicador</h2>
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
    function vazio(msg) {
        return `<div class="rel-vazio"><div class="rel-vazio-ic">📭</div><p>${escapeHtml(msg)}</p></div>`;
    }
    function escapeHtml(t) {
        if (t == null) return '';
        const d = document.createElement('div'); d.textContent = String(t); return d.innerHTML;
    }
})();

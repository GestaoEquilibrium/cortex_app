// ============================================================================
// CORTEX_APP — Auditoria (somente admin_clínico)
// ----------------------------------------------------------------------------
// Lista auditoria_acessos com paginação server-side (a tabela tem dezenas de
// milhares de linhas), filtros (profissional, ação, tabela, paciente, período,
// busca) e export CSV do recorte filtrado.
// ============================================================================

(function () {
    'use strict';

    const POR_PAGINA = 50;
    const ACOES = ['login','logout','leitura','criacao','edicao','delecao','geracao_pdf','exportacao_dados','tentativa_acesso_negado'];
    const ACAO_LABEL = {
        login:'Login', logout:'Logout', leitura:'Leitura', criacao:'Criação',
        edicao:'Edição', delecao:'Deleção', geracao_pdf:'Geração de PDF',
        exportacao_dados:'Exportação', tentativa_acesso_negado:'Acesso negado'
    };
    const ACAO_COR = {
        login:'#0d9488', logout:'#64748b', leitura:'#2563eb', criacao:'#16a34a',
        edicao:'#d97706', delecao:'#dc2626', geracao_pdf:'#7c3aed',
        exportacao_dados:'#0891b2', tentativa_acesso_negado:'#b91c1c'
    };

    const state = {
        pagina: 0, total: 0,
        profissionais: {},   // id -> nome
        pacientes: {},       // id -> nome (cache sob demanda)
        filtros: { profissional:'', acao:'', tabela:'', busca:'', de:'', ate:'' },
        tabelasVistas: new Set(),
    };

    const c = () => window.cortexClient;
    const esc = (t) => { const d=document.createElement('div'); d.textContent = t==null?'':String(t); return d.innerHTML; };
    const fmtDataHora = (iso) => { if(!iso) return '—'; try { return new Date(iso).toLocaleString('pt-BR'); } catch { return iso; } };

    window.addEventListener('cortex:auth-ready', async () => {
        await CortexSidebar.render('auditoria');

        // Guard: só admin_clínico
        if (!window.CortexPerm || !window.CortexPerm.isAdminClinico || !window.CortexPerm.isAdminClinico()) {
            document.getElementById('aud-conteudo').innerHTML =
                `<div class="aud-negado"><div class="aud-negado-ic">🔒</div>
                 <h2>Acesso restrito</h2>
                 <p>A auditoria do sistema está disponível apenas para o Admin Clínico.</p></div>`;
            return;
        }

        await carregarProfissionais();
        montarUI();
        await carregar();
    });

    async function carregarProfissionais() {
        const { data } = await c().from('profissionais').select('id, nome_completo');
        (data||[]).forEach(p => { state.profissionais[p.id] = p.nome_completo; });
    }

    // resolve nomes de pacientes que aparecem na página atual (em lote)
    async function resolverPacientes(ids) {
        const faltando = [...new Set(ids)].filter(id => id && !(id in state.pacientes));
        if (!faltando.length) return;
        const { data } = await c().from('pacientes').select('id, nome_completo').in('id', faltando);
        (data||[]).forEach(p => { state.pacientes[p.id] = p.nome_completo; });
        faltando.forEach(id => { if(!(id in state.pacientes)) state.pacientes[id] = null; });
    }

    function aplicarFiltros(q) {
        const f = state.filtros;
        if (f.profissional) q = q.eq('profissional_id', f.profissional);
        if (f.acao)         q = q.eq('acao', f.acao);
        if (f.tabela)       q = q.eq('tabela', f.tabela);
        if (f.de)           q = q.gte('timestamp', f.de + 'T00:00:00');
        if (f.ate)          q = q.lte('timestamp', f.ate + 'T23:59:59');
        if (f.busca) {
            const b = f.busca.trim();
            // busca por registro_id/paciente_id exatos, ou por tabela contendo o texto
            q = q.or(`tabela.ilike.%${b}%`);
        }
        return q;
    }

    async function carregar() {
        const cont = document.getElementById('aud-tabela-wrap');
        cont.innerHTML = `<div class="aud-loading"><div class="spinner"></div><p>Carregando registros...</p></div>`;

        let q = c().from('auditoria_acessos')
            .select('id, profissional_id, acao, tabela, registro_id, paciente_id, detalhes, ip_origem, timestamp', { count:'exact' })
            .order('timestamp', { ascending:false })
            .range(state.pagina*POR_PAGINA, state.pagina*POR_PAGINA + POR_PAGINA - 1);
        q = aplicarFiltros(q);

        const { data, count, error } = await q;
        if (error) { cont.innerHTML = `<div class="aud-erro">Erro: ${esc(error.message)}</div>`; return; }
        state.total = count || 0;

        await resolverPacientes((data||[]).map(r => r.paciente_id));
        (data||[]).forEach(r => state.tabelasVistas.add(r.tabela));
        renderTabela(data||[]);
        renderPaginacao();
        atualizarSelectTabelas();
    }

    function renderTabela(linhas) {
        if (!linhas.length) {
            document.getElementById('aud-tabela-wrap').innerHTML =
                `<div class="aud-vazio">Nenhum registro encontrado para os filtros atuais.</div>`;
            return;
        }
        const rows = linhas.map(r => {
            const prof = state.profissionais[r.profissional_id] || '—';
            const pac  = r.paciente_id ? (state.pacientes[r.paciente_id] || '(paciente)') : '';
            const cor  = ACAO_COR[r.acao] || '#64748b';
            const temDet = r.detalhes && Object.keys(r.detalhes).length;
            return `<tr>
                <td class="aud-dh">${esc(fmtDataHora(r.timestamp))}</td>
                <td>${esc(prof)}</td>
                <td><span class="aud-chip" style="background:${cor}1a;color:${cor}">${esc(ACAO_LABEL[r.acao]||r.acao)}</span></td>
                <td class="aud-tabela-col">${esc(r.tabela)}</td>
                <td>${pac ? esc(pac) : '<span class="aud-dim">—</span>'}</td>
                <td class="ctr">${temDet ? `<button class="aud-det-btn" data-det='${esc(JSON.stringify(r.detalhes))}'>ver</button>` : '<span class="aud-dim">—</span>'}</td>
            </tr>`;
        }).join('');

        document.getElementById('aud-tabela-wrap').innerHTML = `
            <table class="aud-tabela">
                <thead><tr><th>Data/hora</th><th>Profissional</th><th>Ação</th><th>Tabela</th><th>Paciente</th><th class="ctr">Detalhes</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>`;

        document.querySelectorAll('.aud-det-btn').forEach(b => {
            b.addEventListener('click', () => {
                let obj; try { obj = JSON.parse(b.getAttribute('data-det')); } catch { obj = {}; }
                abrirDetalhes(obj);
            });
        });
    }

    function abrirDetalhes(obj) {
        const m = document.getElementById('aud-modal');
        document.getElementById('aud-modal-body').textContent = JSON.stringify(obj, null, 2);
        m.style.display = 'flex';
    }

    function renderPaginacao() {
        const paginas = Math.max(1, Math.ceil(state.total / POR_PAGINA));
        const atual = state.pagina + 1;
        const ini = state.total ? state.pagina*POR_PAGINA + 1 : 0;
        const fim = Math.min(state.total, (state.pagina+1)*POR_PAGINA);
        document.getElementById('aud-paginacao').innerHTML = `
            <span class="aud-pag-info">${ini}–${fim} de ${state.total.toLocaleString('pt-BR')}</span>
            <div class="aud-pag-btns">
                <button id="aud-prev" ${state.pagina<=0?'disabled':''}>‹ Anterior</button>
                <span class="aud-pag-atual">Página ${atual} de ${paginas.toLocaleString('pt-BR')}</span>
                <button id="aud-next" ${atual>=paginas?'disabled':''}>Próxima ›</button>
            </div>`;
        const prev = document.getElementById('aud-prev'), next = document.getElementById('aud-next');
        if (prev) prev.addEventListener('click', () => { if(state.pagina>0){ state.pagina--; carregar(); } });
        if (next) next.addEventListener('click', () => { if(atual<paginas){ state.pagina++; carregar(); } });
        const rodape = document.getElementById('aud-paginacao2');
        if (rodape) rodape.innerHTML = document.getElementById('aud-paginacao').innerHTML;
    }

    function atualizarSelectTabelas() {
        const sel = document.getElementById('f-tabela');
        if (!sel) return;
        const atual = sel.value;
        const opts = ['<option value="">Todas as tabelas</option>']
            .concat([...state.tabelasVistas].sort().map(t => `<option value="${esc(t)}">${esc(t)}</option>`));
        sel.innerHTML = opts.join('');
        sel.value = atual;
    }

    function montarUI() {
        const profOpts = ['<option value="">Todos os profissionais</option>']
            .concat(Object.entries(state.profissionais).sort((a,b)=>(a[1]||'').localeCompare(b[1]||''))
                .map(([id,nome]) => `<option value="${esc(id)}">${esc(nome)}</option>`)).join('');
        const acaoOpts = ['<option value="">Todas as ações</option>']
            .concat(ACOES.map(a => `<option value="${a}">${esc(ACAO_LABEL[a])}</option>`)).join('');

        document.getElementById('aud-conteudo').innerHTML = `
            <div class="aud-header">
                <div>
                    <h1 class="aud-titulo">🛡️ Auditoria do sistema</h1>
                    <p class="aud-sub">Registro de acessos e alterações. Visível apenas ao Admin Clínico.</p>
                </div>
                <button id="aud-export" class="btn btn-secondary">⬇️ Exportar CSV</button>
            </div>

            <div class="aud-filtros">
                <select id="f-prof">${profOpts}</select>
                <select id="f-acao">${acaoOpts}</select>
                <select id="f-tabela"><option value="">Todas as tabelas</option></select>
                <input type="date" id="f-de" title="Data inicial">
                <input type="date" id="f-ate" title="Data final">
                <input type="text" id="f-busca" placeholder="Buscar tabela...">
                <button id="f-aplicar" class="btn btn-primary">Filtrar</button>
                <button id="f-limpar" class="btn btn-secondary">Limpar</button>
            </div>

            <div id="aud-paginacao" class="aud-paginacao"></div>
            <div id="aud-tabela-wrap"></div>
            <div id="aud-paginacao2" class="aud-paginacao"></div>

            <div id="aud-modal" class="aud-modal" style="display:none;">
                <div class="aud-modal-card">
                    <div class="aud-modal-head"><b>Detalhes do registro</b><button id="aud-modal-x">✕</button></div>
                    <pre id="aud-modal-body" class="aud-modal-body"></pre>
                </div>
            </div>`;

        document.getElementById('f-aplicar').addEventListener('click', () => {
            state.filtros = {
                profissional: document.getElementById('f-prof').value,
                acao: document.getElementById('f-acao').value,
                tabela: document.getElementById('f-tabela').value,
                busca: document.getElementById('f-busca').value,
                de: document.getElementById('f-de').value,
                ate: document.getElementById('f-ate').value,
            };
            state.pagina = 0;
            carregar();
        });
        document.getElementById('f-limpar').addEventListener('click', () => {
            ['f-prof','f-acao','f-tabela','f-busca','f-de','f-ate'].forEach(id => document.getElementById(id).value='');
            state.filtros = { profissional:'', acao:'', tabela:'', busca:'', de:'', ate:'' };
            state.pagina = 0; carregar();
        });
        document.getElementById('f-busca').addEventListener('keydown', (e)=>{ if(e.key==='Enter') document.getElementById('f-aplicar').click(); });
        document.getElementById('aud-export').addEventListener('click', exportarCSV);
        document.getElementById('aud-modal-x').addEventListener('click', ()=>{ document.getElementById('aud-modal').style.display='none'; });
        document.getElementById('aud-modal').addEventListener('click', (e)=>{ if(e.target.id==='aud-modal') e.target.style.display='none'; });
    }

    async function exportarCSV() {
        const btn = document.getElementById('aud-export'); const orig = btn.textContent;
        btn.disabled = true; btn.textContent = '⏳ Gerando...';
        try {
            // exporta até 5000 linhas do recorte filtrado
            let q = c().from('auditoria_acessos')
                .select('timestamp, profissional_id, acao, tabela, registro_id, paciente_id, ip_origem')
                .order('timestamp', { ascending:false }).limit(5000);
            q = aplicarFiltros(q);
            const { data, error } = await q;
            if (error) throw error;
            await resolverPacientes((data||[]).map(r=>r.paciente_id));
            const linhas = [['Data/hora','Profissional','Acao','Tabela','Registro_id','Paciente','IP']];
            (data||[]).forEach(r => linhas.push([
                fmtDataHora(r.timestamp),
                state.profissionais[r.profissional_id]||r.profissional_id||'',
                ACAO_LABEL[r.acao]||r.acao,
                r.tabela||'', r.registro_id||'',
                r.paciente_id ? (state.pacientes[r.paciente_id]||r.paciente_id) : '',
                r.ip_origem||''
            ]));
            const csv = linhas.map(l => l.map(v => `"${String(v).replace(/"/g,'""')}"`).join(';')).join('\n');
            const blob = new Blob(['\ufeff'+csv], { type:'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob); const a = document.createElement('a');
            a.href = url; a.download = `auditoria_${new Date().toISOString().slice(0,10)}.csv`;
            a.click(); URL.revokeObjectURL(url);
            if (window.CortexAudit) CortexAudit.log('exportacao_dados', 'auditoria_acessos', null, { detalhes:{ filtros: state.filtros, linhas:(data||[]).length } });
        } catch(e) { window.CortexUI?.toast('Erro ao exportar: '+e.message, 'danger'); }
        finally { btn.disabled=false; btn.textContent=orig; }
    }
})();

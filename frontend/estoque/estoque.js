// ============================================================================
// CORTEX_APP — Estoque  ·  v2
// ----------------------------------------------------------------------------
// Controle MANUAL de entradas e saídas. O desconto automático por correção
// foi desligado: contava por evento de status e não refletia o uso real.
// Agora quem controla lança o que entrou e o que saiu, e o saldo é a diferença.
//
//   estoque_compras  → entradas (quantidade, valor, fornecedor, nota)
//   estoque_saidas   → saídas   (quantidade, motivo, paciente opcional)
//   estoque_licencas → saldo consolidado; comprado/consumido são recalculados
//                      por gatilho a partir dos dois livros, nunca na mão.
//
// Duas mudanças de organização nesta versão:
//   1. A categoria vem SÓ de dominio_principal. A coluna `categoria` do
//      catálogo está morta (nenhum SELECT do sistema a lê) e acumulou
//      variantes do mesmo nome — 'TEA/Autismo', 'TEA / Autismo' e
//      'TEA / Espectro Autista' apareciam como três grupos distintos.
//   2. O estoque deixa de espelhar o catálogo inteiro. Antes a página criava
//      uma linha para cada um dos ~90 instrumentos ativos, enchendo a tela de
//      itens que você não estoca. Agora você escolhe o que entra, no botão
//      "Adicionar testes".
// ============================================================================

(function () {
    'use strict';

    // Cor fixa por domínio, alinhada à paleta v2. Substitui o hash de matiz
    // da versão anterior, que gerava cores aleatórias sem relação com o resto.
    const CORES = {
        'TEA / Autismo':                                    '#7C4DFF',
        'TDAH / Comportamento':                             '#F59E0B',
        'Humor / Ansiedade / Depressão':                    '#6366F1',
        'Atenção / Memória':                                '#22C55E',
        'Funções Executivas':                               '#14B8A6',
        'Inteligência / Raciocínio':                        '#2F6FED',
        'Linguagem / Leitura / Escrita / Matemática':       '#06B6D4',
        'Personalidade / Habilidades Sociais / Adaptativo': '#EC4899',
        'Sensorial':                                        '#2BBCD4',
        'Desenvolvimento Infantil':                         '#F472B6',
        'Altas Habilidades/Superdotação':                   '#EAB308',
        'Psicopatologia Geral / ASEBA':                     '#818CF8'
    };
    const COR_PADRAO = '#64748B';
    const cor = (d) => CORES[d] || COR_PADRAO;

    const MOTIVOS = {
        aplicacao: 'Aplicação',
        perda:     'Perda / dano',
        devolucao: 'Devolução',
        ajuste:    'Ajuste de inventário',
        outro:     'Outro'
    };

    const state = {
        aba: 'uso',                 // uso | compras
        itens: [],
        catalogo: [],
        movimentos: [],             // entradas + saídas, unificadas
        filtro: 'todos',            // todos | comprar | zerado | ok
        busca: '',
        categoria: 'todas',
        mostrarRemovidos: false
    };

    const c = () => window.cortexClient;
    const toast = (m, t) => { if (window.CortexUI?.toast) window.CortexUI.toast(m, t); };
    const esc = (t) => { const d = document.createElement('div'); d.textContent = t == null ? '' : String(t); return d.innerHTML; };
    const el = (id) => document.getElementById(id);
    const fmtData = (iso) => {
        if (!iso) return '—';
        const p = String(iso).substring(0, 10).split('-');
        return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : '—';
    };
    const fmtMoeda = (v) => (v === null || v === undefined || v === '')
        ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    // ── Boot ────────────────────────────────────────────────────────────────

    window.addEventListener('cortex:auth-ready', async () => {
        await CortexSidebar.render('estoque');

        const perfil = window.cortexProfissional?.perfil;
        if (perfil !== 'admin_clinico' && perfil !== 'admin_gestor') {
            el('estoque-root').innerHTML =
                `<div class="est-vazio"><div class="est-vazio-ico">🔒</div>
                 <strong>Acesso restrito</strong>Esta área é exclusiva da administração.</div>`;
            return;
        }
        await carregar();
    });

    async function carregar() {
        try {
            const [cat, est, ent, sai] = await Promise.all([
                c().from('instrumentos_catalogo')
                   .select('id, sigla, nome_completo, dominio_principal')
                   .eq('ativo', true).order('sigla'),
                c().from('estoque_licencas').select('*'),
                c().from('estoque_compras').select('*').order('data_compra', { ascending: false }),
                c().from('estoque_saidas').select('*').order('data_saida', { ascending: false })
            ]);
            if (cat.error) throw cat.error;
            if (est.error) throw est.error;

            state.catalogo = cat.data || [];
            const mapCat = new Map(state.catalogo.map(i => [i.id, i]));

            // Sem reconciliação automática: o estoque só tem o que você adicionou.
            state.itens = (est.data || [])
                .filter(e => mapCat.has(e.instrumento_id))
                .map(e => {
                    const i = mapCat.get(e.instrumento_id);
                    return {
                        estoque_id: e.id,
                        instrumento_id: e.instrumento_id,
                        sigla: i.sigla,
                        nome: i.nome_completo,
                        categoria: (i.dominio_principal || 'Sem categoria').trim(),
                        entradas: e.comprado || 0,
                        saidas: e.consumido || 0,
                        minimo: e.estoque_minimo || 0,
                        obs: e.observacao || '',
                        ativo: e.ativo !== false
                    };
                });

            const porInstr = new Map(state.itens.map(i => [i.instrumento_id, i]));
            const movEnt = (ent.data || []).map(m => ({ ...m, tipo: 'entrada', data: m.data_compra }));
            const movSai = (sai.data || []).map(m => ({ ...m, tipo: 'saida',   data: m.data_saida }));
            state.movimentos = [...movEnt, ...movSai]
                .map(m => ({ ...m, item: porInstr.get(m.instrumento_id) || null }))
                .sort((a, b) => String(b.data).localeCompare(String(a.data)));

            render();
        } catch (err) {
            console.error('[estoque] carregar:', err);
            el('estoque-root').innerHTML =
                `<div class="est-vazio"><div class="est-vazio-ico">⚠️</div>
                 <strong>Não foi possível carregar</strong>${esc(err.message || '')}</div>`;
        }
    }

    // ── Derivados ───────────────────────────────────────────────────────────

    const saldo = (it) => it.entradas - it.saidas;
    function statusDe(it) {
        const s = saldo(it);
        if (s <= 0) return 'zero';
        if (it.minimo > 0 && s <= it.minimo) return 'low';
        return 'ok';
    }
    const precisaComprar = (it) => it.minimo > 0 ? saldo(it) <= it.minimo : saldo(it) <= 0;
    function sugestao(it) {
        if (it.minimo <= 0) return Math.max(-saldo(it), 0) || 0;
        return Math.max(it.minimo * 2 - saldo(it), 0);
    }

    // ── Estrutura ───────────────────────────────────────────────────────────

    function render() {
        const ativos = state.itens.filter(i => i.ativo);
        const nComprar = ativos.filter(precisaComprar).length;

        el('estoque-root').innerHTML = `
            <div class="est-head">
                <div class="est-head-tit">
                    <div class="est-head-ico">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                            <polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>
                        </svg>
                    </div>
                    <div>
                        <h1>Estoque</h1>
                        <p>Você lança o que entra e o que sai. O saldo é a diferença.</p>
                    </div>
                </div>
                <div class="est-head-acoes">
                    <button class="btn btn-secondary" id="btn-copiar">Copiar lista de compras</button>
                    <button class="btn btn-primary" id="btn-add-testes">+ Adicionar testes</button>
                </div>
            </div>

            <div class="est-abas">
                <button class="est-aba ${state.aba === 'uso' ? 'ativa' : ''}" data-aba="uso">
                    Em uso <span class="est-aba-pill">${ativos.length}</span>
                </button>
                <button class="est-aba ${state.aba === 'compras' ? 'ativa' : ''}" data-aba="compras">
                    Compras e movimentações <span class="est-aba-pill">${nComprar}</span>
                </button>
            </div>

            <div id="est-painel"></div>`;

        el('estoque-root').querySelectorAll('.est-aba').forEach(b =>
            b.addEventListener('click', () => { state.aba = b.dataset.aba; render(); }));
        el('btn-add-testes').addEventListener('click', abrirSeletorTestes);
        el('btn-copiar').addEventListener('click', copiarLista);

        if (state.aba === 'uso') painelUso();
        else painelCompras();
    }

    // ── Aba: em uso ─────────────────────────────────────────────────────────

    function painelUso() {
        const vis = state.itens.filter(i => i.ativo);
        const totalSaldo = vis.reduce((a, it) => a + Math.max(saldo(it), 0), 0);
        const nComprar = vis.filter(precisaComprar).length;
        const nZerado = vis.filter(it => saldo(it) <= 0).length;
        const nOk = vis.filter(it => statusDe(it) === 'ok').length;

        const cats = ['todas', ...[...new Set(state.itens.map(i => i.categoria))].sort()];

        el('est-painel').innerHTML = `
            <div class="est-stats">
                <button class="est-stat ${state.filtro === 'todos' ? 'ativo' : ''}" data-f="todos" style="--st:#2F6FED">
                    <div class="est-stat-num">${totalSaldo}</div><div class="est-stat-lbl">Unidades em estoque</div>
                </button>
                <button class="est-stat ${state.filtro === 'comprar' ? 'ativo' : ''}" data-f="comprar" style="--st:#F59E0B">
                    <div class="est-stat-num">${nComprar}</div><div class="est-stat-lbl">Precisa comprar</div>
                </button>
                <button class="est-stat ${state.filtro === 'zerado' ? 'ativo' : ''}" data-f="zerado" style="--st:#EF4444">
                    <div class="est-stat-num">${nZerado}</div><div class="est-stat-lbl">Zerados</div>
                </button>
                <button class="est-stat ${state.filtro === 'ok' ? 'ativo' : ''}" data-f="ok" style="--st:#22C55E">
                    <div class="est-stat-num">${nOk}</div><div class="est-stat-lbl">Em dia</div>
                </button>
            </div>

            <div class="est-toolbar">
                <div class="est-busca">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    <input type="text" id="est-busca" placeholder="Buscar por sigla ou nome…" value="${esc(state.busca)}">
                </div>
                <select class="est-select" id="est-cat">
                    ${cats.map(x => `<option value="${esc(x)}" ${state.categoria === x ? 'selected' : ''}>${x === 'todas' ? 'Todas as categorias' : esc(x)}</option>`).join('')}
                </select>
                <label class="est-toggle">
                    <input type="checkbox" id="est-rem" ${state.mostrarRemovidos ? 'checked' : ''}> Mostrar removidos
                </label>
            </div>

            <div class="est-grid" id="est-grid"></div>`;

        el('est-painel').querySelectorAll('.est-stat').forEach(b =>
            b.addEventListener('click', () => { state.filtro = b.dataset.f; painelUso(); }));
        el('est-busca').addEventListener('input', e => { state.busca = e.target.value; renderGrid(); });
        el('est-cat').addEventListener('change', e => { state.categoria = e.target.value; renderGrid(); });
        el('est-rem').addEventListener('change', e => { state.mostrarRemovidos = e.target.checked; renderGrid(); });

        renderGrid();
    }

    function filtrados() {
        const q = state.busca.trim().toLowerCase();
        return state.itens.filter(it => {
            if (!state.mostrarRemovidos && !it.ativo) return false;
            if (state.categoria !== 'todas' && it.categoria !== state.categoria) return false;
            if (q && !`${it.sigla} ${it.nome}`.toLowerCase().includes(q)) return false;
            if (!it.ativo) return state.filtro === 'todos';
            if (state.filtro === 'comprar' && !precisaComprar(it)) return false;
            if (state.filtro === 'zerado' && saldo(it) > 0) return false;
            if (state.filtro === 'ok' && statusDe(it) !== 'ok') return false;
            return true;
        });
    }

    function renderGrid() {
        const grid = el('est-grid');
        if (!grid) return;

        if (!state.itens.length) {
            grid.innerHTML = `<div class="est-vazio"><div class="est-vazio-ico">📦</div>
                <strong>Nenhum teste no estoque ainda</strong>
                Clique em “Adicionar testes” e escolha quais você quer controlar.
                Só o que você adicionar aparece aqui.</div>`;
            return;
        }

        const lista = filtrados().sort((a, b) =>
            a.categoria.localeCompare(b.categoria) || a.sigla.localeCompare(b.sigla));

        if (!lista.length) {
            grid.innerHTML = `<div class="est-vazio"><div class="est-vazio-ico">🔍</div>
                <strong>Nada com esses filtros</strong>Ajuste a busca ou a categoria.</div>`;
            return;
        }

        let html = '';
        let catAtual = null;
        for (const it of lista) {
            if (it.categoria !== catAtual) {
                catAtual = it.categoria;
                html += `<div class="est-cat">
                    <span class="est-cat-dot" style="background:${cor(catAtual)}"></span>${esc(catAtual)}</div>`;
            }
            html += cardHTML(it);
        }
        grid.innerHTML = html;

        grid.querySelectorAll('[data-act]').forEach(btn => {
            btn.addEventListener('click', () => {
                const it = state.itens.find(x => x.estoque_id === btn.closest('.est-card').dataset.id);
                if (!it) return;
                const a = btn.dataset.act;
                if (a === 'entrada')  modalEntrada(it);
                if (a === 'saida')    modalSaida(it);
                if (a === 'editar')   modalEditar(it);
                if (a === 'remover')  removerItem(it);
                if (a === 'restaurar') salvarItem(it, { ativo: true }, `${it.sigla} restaurado`);
            });
        });
    }

    function cardHTML(it) {
        const st = statusDe(it);
        const s = saldo(it);
        const cr = cor(it.categoria);
        const pct = it.entradas > 0 ? Math.min(100, Math.round((it.saidas / it.entradas) * 100)) : 0;
        const badge = st === 'zero' ? 'Zerado' : st === 'low' ? 'Repor' : 'Em dia';

        const acoes = it.ativo ? `
            <button class="est-mini m-in" data-act="entrada" title="Registrar entrada">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Entrada
            </button>
            <button class="est-mini m-out" data-act="saida" title="Registrar saída">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>Saída
            </button>
            <button class="est-mini" data-act="editar" title="Mínimo e observação">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="est-mini m-del" data-act="remover" title="Remover do estoque">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
            </button>` : `
            <button class="est-mini" data-act="restaurar" style="flex:1">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>Restaurar
            </button>`;

        return `
        <div class="est-card st-${st} ${it.ativo ? '' : 'removido'}" data-id="${it.estoque_id}" style="--c:${cr}">
            <div class="est-card-body">
                <div class="est-card-head">
                    <span class="est-sigla">${esc(it.sigla)}</span>
                    <span class="est-nome">${esc(it.nome)}</span>
                </div>
                <div class="est-saldo-row">
                    <span class="est-saldo">${s}</span>
                    <span class="est-saldo-lbl">em estoque</span>
                    <span class="est-badge">${badge}</span>
                </div>
                <div class="est-bar"><span style="width:${pct}%"></span></div>
                <div class="est-meta">
                    <span>Entradas <b>${it.entradas}</b></span>
                    <span>Saídas <b>${it.saidas}</b></span>
                    <span>Mínimo <b>${it.minimo || '—'}</b></span>
                </div>
                ${it.ativo && precisaComprar(it) && sugestao(it) > 0
                    ? `<div class="est-obs">Sugerido comprar: <b>${sugestao(it)}</b></div>` : ''}
                ${it.obs ? `<div class="est-obs">${esc(it.obs)}</div>` : ''}
            </div>
            <div class="est-card-acoes">${acoes}</div>
        </div>`;
    }

    // ── Aba: compras e movimentações ────────────────────────────────────────

    function painelCompras() {
        const comprar = state.itens.filter(i => i.ativo && precisaComprar(i))
            .sort((a, b) => saldo(a) - saldo(b));

        const totalGasto = state.movimentos
            .filter(m => m.tipo === 'entrada' && m.valor_unitario)
            .reduce((a, m) => a + Number(m.valor_unitario) * m.quantidade, 0);

        const nEnt = state.movimentos.filter(m => m.tipo === 'entrada').length;
        const nSai = state.movimentos.filter(m => m.tipo === 'saida').length;

        el('est-painel').innerHTML = `
            <div class="est-stats">
                <div class="est-stat" style="--st:#F59E0B">
                    <div class="est-stat-num">${comprar.length}</div><div class="est-stat-lbl">Itens a repor</div>
                </div>
                <div class="est-stat" style="--st:#22C55E">
                    <div class="est-stat-num">${nEnt}</div><div class="est-stat-lbl">Entradas lançadas</div>
                </div>
                <div class="est-stat" style="--st:#EC4899">
                    <div class="est-stat-num">${nSai}</div><div class="est-stat-lbl">Saídas lançadas</div>
                </div>
                <div class="est-stat" style="--st:#7C4DFF">
                    <div class="est-stat-num" style="font-size:20px">${fmtMoeda(totalGasto)}</div>
                    <div class="est-stat-lbl">Investido (com valor)</div>
                </div>
            </div>

            <div class="est-cat"><span class="est-cat-dot" style="background:#F59E0B"></span>O que precisa comprar</div>
            ${comprar.length ? `
            <div class="est-tabela-wrap" style="margin-bottom:8px">
                <table class="est-tabela">
                    <thead><tr><th>Teste</th><th>Categoria</th><th style="width:90px">Saldo</th>
                               <th style="width:90px">Mínimo</th><th style="width:110px">Sugerido</th><th style="width:110px"></th></tr></thead>
                    <tbody>
                        ${comprar.map(it => `
                            <tr>
                                <td><strong>${esc(it.sigla)}</strong><br><span style="font-size:12px;color:var(--color-text-muted)">${esc(it.nome)}</span></td>
                                <td><span class="est-tag" style="background:${cor(it.categoria)}1f;color:${cor(it.categoria)}">${esc(it.categoria)}</span></td>
                                <td><strong style="color:${saldo(it) <= 0 ? '#B91C1C' : '#B45309'}">${saldo(it)}</strong></td>
                                <td>${it.minimo || '—'}</td>
                                <td><strong>${sugestao(it)}</strong></td>
                                <td><button class="btn btn-secondary" data-comprar="${it.estoque_id}" style="padding:6px 12px;font-size:12.5px">Lançar entrada</button></td>
                            </tr>`).join('')}
                    </tbody>
                </table>
            </div>` : `
            <div class="est-vazio"><div class="est-vazio-ico">✓</div>
                <strong>Nada abaixo do mínimo</strong>Estoque em dia.</div>`}

            <div class="est-cat"><span class="est-cat-dot" style="background:#2F6FED"></span>Movimentações</div>
            ${state.movimentos.length ? `
            <div class="est-tabela-wrap">
                <table class="est-tabela">
                    <thead><tr><th style="width:100px">Data</th><th style="width:100px">Tipo</th><th>Teste</th>
                               <th style="width:80px">Qtd</th><th>Detalhe</th><th style="width:120px">Valor</th><th style="width:50px"></th></tr></thead>
                    <tbody>
                        ${state.movimentos.map(m => `
                            <tr>
                                <td>${fmtData(m.data)}</td>
                                <td><span class="est-tag ${m.tipo}">${m.tipo === 'entrada' ? 'Entrada' : 'Saída'}</span></td>
                                <td>${m.item ? `<strong>${esc(m.item.sigla)}</strong>` : '<span style="color:var(--color-text-soft)">—</span>'}</td>
                                <td><strong>${m.tipo === 'entrada' ? '+' : '−'}${m.quantidade}</strong></td>
                                <td style="font-size:12.5px;color:var(--color-text-muted)">
                                    ${m.tipo === 'entrada'
                                        ? [m.fornecedor, m.nota_fiscal ? 'NF ' + m.nota_fiscal : '', m.observacao].filter(Boolean).map(esc).join(' · ') || '—'
                                        : [MOTIVOS[m.motivo] || m.motivo, m.observacao].filter(Boolean).map(esc).join(' · ')}
                                </td>
                                <td>${m.tipo === 'entrada' ? fmtMoeda(m.valor_unitario ? Number(m.valor_unitario) * m.quantidade : null) : '—'}</td>
                                <td><button class="est-lixo" data-del="${m.id}" data-tipo="${m.tipo}" title="Excluir lançamento">
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
                                </button></td>
                            </tr>`).join('')}
                    </tbody>
                </table>
            </div>` : `
            <div class="est-vazio"><div class="est-vazio-ico">📄</div>
                <strong>Nenhuma movimentação ainda</strong>
                Registre entradas e saídas pelos cards da aba “Em uso”.</div>`}`;

        el('est-painel').querySelectorAll('[data-comprar]').forEach(b =>
            b.addEventListener('click', () => {
                const it = state.itens.find(x => x.estoque_id === b.dataset.comprar);
                if (it) modalEntrada(it);
            }));

        el('est-painel').querySelectorAll('[data-del]').forEach(b =>
            b.addEventListener('click', () => excluirMovimento(b.dataset.del, b.dataset.tipo)));
    }

    // ── Modais ──────────────────────────────────────────────────────────────

    function abrirModal(html, larga) {
        const ov = document.createElement('div');
        ov.className = 'est-modal-ov';
        ov.innerHTML = html.replace('<div class="est-modal"', `<div class="est-modal${larga ? ' larga' : ''}"`);
        document.body.appendChild(ov);
        ov.addEventListener('mousedown', e => { if (e.target === ov) ov.remove(); });
        const escFn = (e) => { if (e.key === 'Escape') { ov.remove(); document.removeEventListener('keydown', escFn); } };
        document.addEventListener('keydown', escFn);
        return ov;
    }

    function stepper(id, val) {
        return `<div class="est-stepper">
            <button type="button" data-step="-1" data-t="${id}">−</button>
            <input type="number" id="${id}" min="1" value="${val}">
            <button type="button" data-step="1" data-t="${id}">+</button>
        </div>`;
    }

    function ligarSteppers(ov) {
        ov.querySelectorAll('[data-step]').forEach(b => b.addEventListener('click', () => {
            const inp = ov.querySelector('#' + b.dataset.t);
            inp.value = Math.max(1, (parseInt(inp.value, 10) || 0) + parseInt(b.dataset.step, 10));
        }));
    }

    const hojeISO = () => new Date().toISOString().substring(0, 10);

    function modalEntrada(it) {
        const ov = abrirModal(`
            <div class="est-modal">
                <div class="est-modal-top" style="background:${cor(it.categoria)}"></div>
                <div class="est-modal-body">
                    <div class="est-modal-sigla">Entrada · ${esc(it.sigla)}</div>
                    <div class="est-modal-nome">${esc(it.nome)}</div>
                    <div class="est-field"><label>Quantidade</label>${stepper('e-qtd', 1)}</div>
                    <div class="est-grid2">
                        <div class="est-field"><label>Data</label><input type="date" id="e-data" value="${hojeISO()}"></div>
                        <div class="est-field"><label>Valor unitário</label><input type="number" id="e-valor" step="0.01" min="0" placeholder="opcional"></div>
                    </div>
                    <div class="est-grid2">
                        <div class="est-field"><label>Fornecedor</label><input id="e-forn" placeholder="opcional"></div>
                        <div class="est-field"><label>Nota fiscal</label><input id="e-nf" placeholder="opcional"></div>
                    </div>
                    <div class="est-field"><label>Observação</label><textarea id="e-obs" placeholder="opcional"></textarea></div>
                    <div class="est-hint">Saldo atual: <b>${saldo(it)}</b></div>
                    <div class="est-modal-acoes">
                        <button class="btn btn-secondary" data-x="nao">Cancelar</button>
                        <button class="btn btn-primary" data-x="sim">Registrar entrada</button>
                    </div>
                </div>
            </div>`);
        ligarSteppers(ov);
        ov.querySelector('[data-x="nao"]').addEventListener('click', () => ov.remove());
        ov.querySelector('[data-x="sim"]').addEventListener('click', async () => {
            const qtd = parseInt(ov.querySelector('#e-qtd').value, 10) || 0;
            if (qtd <= 0) { toast('Informe uma quantidade maior que zero.', 'danger'); return; }
            const valor = ov.querySelector('#e-valor').value;
            try {
                const { error } = await c().from('estoque_compras').insert({
                    instrumento_id: it.instrumento_id,
                    quantidade: qtd,
                    valor_unitario: valor === '' ? null : Number(valor),
                    fornecedor: ov.querySelector('#e-forn').value.trim() || null,
                    nota_fiscal: ov.querySelector('#e-nf').value.trim() || null,
                    data_compra: ov.querySelector('#e-data').value || hojeISO(),
                    observacao: ov.querySelector('#e-obs').value.trim() || null,
                    registrado_por: window.cortexProfissional?.id || null
                });
                if (error) throw error;
                ov.remove();
                toast(`+${qtd} ${it.sigla} registrado`, 'success');
                await carregar();
            } catch (err) {
                console.error(err);
                toast('Erro ao registrar: ' + (err.message || ''), 'danger');
            }
        });
    }

    function modalSaida(it) {
        const s = saldo(it);
        const ov = abrirModal(`
            <div class="est-modal">
                <div class="est-modal-top" style="background:${cor(it.categoria)}"></div>
                <div class="est-modal-body">
                    <div class="est-modal-sigla">Saída · ${esc(it.sigla)}</div>
                    <div class="est-modal-nome">${esc(it.nome)}</div>
                    <div class="est-field"><label>Quantidade</label>${stepper('s-qtd', 1)}</div>
                    <div class="est-grid2">
                        <div class="est-field"><label>Data</label><input type="date" id="s-data" value="${hojeISO()}"></div>
                        <div class="est-field"><label>Motivo</label>
                            <select id="s-motivo">
                                ${Object.entries(MOTIVOS).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}
                            </select>
                        </div>
                    </div>
                    <div class="est-field"><label>Observação</label><textarea id="s-obs" placeholder="Ex.: paciente, sessão, quem retirou"></textarea></div>
                    <div class="est-hint">Saldo atual: <b>${s}</b>${s <= 0 ? ' — o saldo vai ficar negativo.' : ''}</div>
                    <div class="est-modal-acoes">
                        <button class="btn btn-secondary" data-x="nao">Cancelar</button>
                        <button class="btn btn-primary" data-x="sim">Registrar saída</button>
                    </div>
                </div>
            </div>`);
        ligarSteppers(ov);
        ov.querySelector('[data-x="nao"]').addEventListener('click', () => ov.remove());
        ov.querySelector('[data-x="sim"]').addEventListener('click', async () => {
            const qtd = parseInt(ov.querySelector('#s-qtd').value, 10) || 0;
            if (qtd <= 0) { toast('Informe uma quantidade maior que zero.', 'danger'); return; }
            try {
                const { error } = await c().from('estoque_saidas').insert({
                    instrumento_id: it.instrumento_id,
                    quantidade: qtd,
                    motivo: ov.querySelector('#s-motivo').value,
                    data_saida: ov.querySelector('#s-data').value || hojeISO(),
                    observacao: ov.querySelector('#s-obs').value.trim() || null,
                    registrado_por: window.cortexProfissional?.id || null
                });
                if (error) throw error;
                ov.remove();
                toast(`−${qtd} ${it.sigla} registrado`, 'success');
                await carregar();
            } catch (err) {
                console.error(err);
                toast('Erro ao registrar: ' + (err.message || ''), 'danger');
            }
        });
    }

    function modalEditar(it) {
        const ov = abrirModal(`
            <div class="est-modal">
                <div class="est-modal-top" style="background:${cor(it.categoria)}"></div>
                <div class="est-modal-body">
                    <div class="est-modal-sigla">${esc(it.sigla)}</div>
                    <div class="est-modal-nome">${esc(it.nome)}</div>
                    <div class="est-field"><label>Estoque mínimo</label>
                        <input type="number" id="ed-min" min="0" value="${it.minimo}">
                    </div>
                    <div class="est-hint">Abaixo desse nível o item entra na lista de compras. Zero desativa o aviso.</div>
                    <div class="est-field"><label>Observação</label><textarea id="ed-obs">${esc(it.obs)}</textarea></div>
                    <div class="est-hint">Entradas e saídas não são editadas aqui — elas vêm dos lançamentos, na aba Compras.</div>
                    <div class="est-modal-acoes">
                        <button class="btn btn-secondary" data-x="nao">Cancelar</button>
                        <button class="btn btn-primary" data-x="sim">Salvar</button>
                    </div>
                </div>
            </div>`);
        ov.querySelector('[data-x="nao"]').addEventListener('click', () => ov.remove());
        ov.querySelector('[data-x="sim"]').addEventListener('click', async () => {
            const minimo = Math.max(0, parseInt(ov.querySelector('#ed-min').value, 10) || 0);
            const obs = ov.querySelector('#ed-obs').value.trim();
            ov.remove();
            await salvarItem(it, { estoque_minimo: minimo, observacao: obs || null }, `${it.sigla} atualizado`);
        });
    }

    // ── Adicionar testes ao estoque ─────────────────────────────────────────

    function abrirSeletorTestes() {
        const jaTem = new Set(state.itens.map(i => i.instrumento_id));
        const disponiveis = state.catalogo.filter(i => !jaTem.has(i.id));

        if (!disponiveis.length) {
            toast('Todos os testes ativos do catálogo já estão no estoque.', 'info');
            return;
        }

        const ov = abrirModal(`
            <div class="est-modal">
                <div class="est-modal-top" style="background:var(--grad-aurora, linear-gradient(90deg,#2F6FED,#7C4DFF))"></div>
                <div class="est-modal-body">
                    <div class="est-modal-sigla">Adicionar testes ao estoque</div>
                    <div class="est-modal-nome">Escolha quais você quer controlar. Só os marcados passam a aparecer na aba “Em uso”.</div>
                    <div class="est-field">
                        <input id="pick-busca" placeholder="Buscar entre ${disponiveis.length} testes…">
                    </div>
                    <div class="est-pick" id="pick-lista"></div>
                    <div class="est-hint" id="pick-conta" style="margin-top:10px">Nenhum selecionado.</div>
                    <div class="est-modal-acoes">
                        <button class="btn btn-secondary" data-x="nao">Cancelar</button>
                        <button class="btn btn-primary" data-x="sim">Adicionar selecionados</button>
                    </div>
                </div>
            </div>`, true);

        const sel = new Set();

        function pintar() {
            const q = ov.querySelector('#pick-busca').value.trim().toLowerCase();
            const lista = disponiveis
                .filter(i => !q || `${i.sigla} ${i.nome_completo}`.toLowerCase().includes(q))
                .sort((a, b) => (a.dominio_principal || '').localeCompare(b.dominio_principal || '') || a.sigla.localeCompare(b.sigla));

            ov.querySelector('#pick-lista').innerHTML = lista.length ? lista.map(i => `
                <label class="est-pick-item">
                    <input type="checkbox" value="${i.id}" ${sel.has(i.id) ? 'checked' : ''}>
                    <span class="est-pick-sigla" style="background:${cor((i.dominio_principal || '').trim())}">${esc(i.sigla)}</span>
                    <span class="est-pick-nome">${esc(i.nome_completo)}</span>
                </label>`).join('')
                : `<div style="padding:20px;text-align:center;color:var(--color-text-muted);font-size:13px">Nada encontrado.</div>`;

            ov.querySelectorAll('#pick-lista input').forEach(chk => {
                chk.addEventListener('change', () => {
                    if (chk.checked) sel.add(chk.value); else sel.delete(chk.value);
                    ov.querySelector('#pick-conta').textContent =
                        sel.size ? `${sel.size} teste(s) selecionado(s).` : 'Nenhum selecionado.';
                });
            });
        }

        ov.querySelector('#pick-busca').addEventListener('input', pintar);
        pintar();

        ov.querySelector('[data-x="nao"]').addEventListener('click', () => ov.remove());
        ov.querySelector('[data-x="sim"]').addEventListener('click', async () => {
            if (!sel.size) { toast('Selecione pelo menos um teste.', 'info'); return; }
            try {
                const { error } = await c().from('estoque_licencas')
                    .insert([...sel].map(id => ({ instrumento_id: id })));
                if (error) throw error;
                ov.remove();
                toast(`${sel.size} teste(s) adicionado(s) ao estoque.`, 'success');
                await carregar();
            } catch (err) {
                console.error(err);
                toast('Erro ao adicionar: ' + (err.message || ''), 'danger');
            }
        });
    }

    // ── Persistência ────────────────────────────────────────────────────────

    async function salvarItem(it, patch, msg) {
        try {
            const { error } = await c().from('estoque_licencas').update(patch).eq('id', it.estoque_id);
            if (error) throw error;
            if ('estoque_minimo' in patch) it.minimo = patch.estoque_minimo;
            if ('observacao' in patch) it.obs = patch.observacao || '';
            if ('ativo' in patch) it.ativo = patch.ativo;
            if (msg) toast(msg, 'success');
            render();
        } catch (err) {
            console.error('[estoque] salvar:', err);
            toast('Erro ao salvar: ' + (err.message || ''), 'danger');
        }
    }

    function removerItem(it) {
        window.CortexConfirm.mostrar({
            icone: '🗑️',
            titulo: `Remover ${it.sigla} do estoque?`,
            texto: 'Ele sai da lista, mas as movimentações ficam registradas. Dá para restaurar em "Mostrar removidos".',
            btnSim: 'Sim, remover', btnNao: 'Cancelar', btnSimDanger: true,
            onSim: async () => { await salvarItem(it, { ativo: false }, `${it.sigla} removido`); }
        });
    }

    function excluirMovimento(id, tipo) {
        const tabela = tipo === 'entrada' ? 'estoque_compras' : 'estoque_saidas';
        window.CortexConfirm.mostrar({
            icone: '🗑️',
            titulo: 'Excluir este lançamento?',
            texto: 'O saldo é recalculado na hora. Esta ação não pode ser desfeita.',
            btnSim: 'Sim, excluir', btnNao: 'Cancelar', btnSimDanger: true,
            onSim: async () => {
                try {
                    const { error } = await c().from(tabela).delete().eq('id', id);
                    if (error) throw error;
                    toast('Lançamento excluído.', 'success');
                    await carregar();
                } catch (err) {
                    console.error(err);
                    toast('Erro ao excluir: ' + (err.message || ''), 'danger');
                }
            }
        });
    }

    // ── Lista de compras ────────────────────────────────────────────────────

    async function copiarLista() {
        const comprar = state.itens.filter(it => it.ativo && precisaComprar(it))
            .sort((a, b) => a.sigla.localeCompare(b.sigla));
        if (!comprar.length) { toast('Nada abaixo do mínimo. Estoque em dia.', 'success'); return; }

        let txt = `Lista de compras — testes (${new Date().toLocaleDateString('pt-BR')})\n\n`;
        comprar.forEach(it => {
            const sug = sugestao(it);
            txt += `• ${it.sigla} — ${it.nome}\n  saldo: ${saldo(it)} | mínimo: ${it.minimo}${sug > 0 ? ` | comprar: ${sug}` : ''}\n`;
        });
        txt += `\nTotal de itens: ${comprar.length}`;

        try {
            await navigator.clipboard.writeText(txt);
            toast(`Lista de ${comprar.length} itens copiada.`, 'success');
        } catch {
            const ov = abrirModal(`
                <div class="est-modal">
                    <div class="est-modal-top" style="background:var(--grad-aurora, linear-gradient(90deg,#2F6FED,#7C4DFF))"></div>
                    <div class="est-modal-body">
                        <div class="est-modal-sigla">Lista de compras</div>
                        <div class="est-modal-nome">Selecione e copie o texto abaixo.</div>
                        <div class="est-field"><textarea style="min-height:200px">${esc(txt)}</textarea></div>
                        <div class="est-modal-acoes"><button class="btn btn-primary" data-x="ok">Fechar</button></div>
                    </div>
                </div>`);
            ov.querySelector('[data-x="ok"]').addEventListener('click', () => ov.remove());
        }
    }
})();

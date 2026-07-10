// ============================================================================
// CORTEX_APP — Estoque de Licenças
// ----------------------------------------------------------------------------
// Controle CONTÁBIL de licenças de testes. Não bloqueia nem "usa" licença:
// apenas conta. O consumo desconta sozinho — cada correção concluída no
// sistema (status = 'corrigido') dispara o gatilho fn_estoque_consumir() no
// banco, que soma +1 em consumido do instrumento correspondente.
//
// Aqui a página só: mostra saldo (comprado − consumido), deixa você editar
// quanto comprou / o estoque mínimo, adicionar compra, remover/restaurar item
// e copiar a lista do que precisa comprar.
// ============================================================================

(function () {
    'use strict';

    const state = {
        itens: [],            // { estoque_id, instrumento_id, sigla, nome, categoria, comprado, consumido, minimo, obs, ativo }
        filtro: 'todos',      // todos | comprar | zerado | ok
        busca: '',
        categoria: 'todas',
        mostrarRemovidos: false,
    };

    function client() { return window.cortexClient; }
    function toast(m, t) { if (window.CortexUI?.toast) window.CortexUI.toast(m, t); }
    function esc(t) { const d = document.createElement('div'); d.textContent = t == null ? '' : String(t); return d.innerHTML; }

    // Cor determinística por categoria (mesma categoria = mesma cor sempre)
    function corCategoria(txt) {
        const s = txt || 'Geral';
        let h = 0;
        for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
        return { bg: `hsl(${h} 62% 48%)`, top: `linear-gradient(90deg, hsl(${h} 70% 55%), hsl(${(h + 28) % 360} 70% 50%))` };
    }

    // ── Boot ────────────────────────────────────────────────────────────────
    window.addEventListener('cortex:auth-ready', async () => {
        const perfil = window.cortexProfissional?.perfil;
        const ehAdmin = perfil === 'admin_clinico' || perfil === 'admin_gestor';
        if (!ehAdmin) {
            document.getElementById('estoque-root').innerHTML =
                `<div class="estoque-vazio"><div class="estoque-vazio-icone">🔒</div>
                 Esta área é exclusiva da administração.</div>`;
            await CortexSidebar.render('estoque');
            return;
        }
        await CortexSidebar.render('estoque');
        await carregar();
    });

    // ── Carga + reconciliação (garante 1 linha por instrumento ativo) ────────
    async function carregar() {
        const c = client();
        try {
            const [cat, est] = await Promise.all([
                c.from('instrumentos_catalogo')
                    .select('id, sigla, nome_completo, dominio_principal, categoria, ordem_categoria')
                    .eq('ativo', true),
                c.from('estoque_licencas').select('*'),
            ]);
            if (cat.error) throw cat.error;
            if (est.error) throw est.error;

            const catalogo = cat.data || [];
            let estoque = est.data || [];

            // Cria linhas que faltam (instrumentos novos no catálogo)
            const comEstoque = new Set(estoque.map(e => e.instrumento_id));
            const faltando = catalogo.filter(i => !comEstoque.has(i.id));
            if (faltando.length) {
                const ins = await c.from('estoque_licencas')
                    .insert(faltando.map(i => ({ instrumento_id: i.id })))
                    .select('*');
                if (!ins.error && ins.data) estoque = estoque.concat(ins.data);
            }

            const mapCat = new Map(catalogo.map(i => [i.id, i]));
            state.itens = estoque
                .filter(e => mapCat.has(e.instrumento_id))
                .map(e => {
                    const i = mapCat.get(e.instrumento_id);
                    return {
                        estoque_id: e.id,
                        instrumento_id: e.instrumento_id,
                        sigla: i.sigla,
                        nome: i.nome_completo,
                        categoria: i.categoria || i.dominio_principal || 'Geral',
                        ordem: i.ordem_categoria ?? 999,
                        comprado: e.comprado || 0,
                        consumido: e.consumido || 0,
                        minimo: e.estoque_minimo || 0,
                        obs: e.observacao || '',
                        ativo: e.ativo !== false,
                    };
                });

            render();
        } catch (err) {
            console.error('[estoque] carregar:', err);
            document.getElementById('estoque-root').innerHTML =
                `<div class="estoque-vazio"><div class="estoque-vazio-icone">⚠️</div>
                 Não foi possível carregar o estoque.<br><small>${esc(err.message || '')}</small></div>`;
        }
    }

    // ── Derivados ────────────────────────────────────────────────────────────
    function saldo(it) { return it.comprado - it.consumido; }
    function statusDe(it) {
        const s = saldo(it);
        if (s <= 0) return 'zero';
        if (it.minimo > 0 ? s <= it.minimo : false) return 'low';
        return 'ok';
    }
    function precisaComprar(it) { return it.minimo > 0 ? saldo(it) <= it.minimo : saldo(it) <= 0; }
    function sugestao(it) {
        const alvo = it.minimo > 0 ? it.minimo * 2 : 0;
        return Math.max(alvo - saldo(it), it.minimo > 0 ? 0 : Math.max(-saldo(it), 0));
    }

    // ── Render ───────────────────────────────────────────────────────────────
    function render() {
        const visiveis = state.itens.filter(it => state.mostrarRemovidos ? true : it.ativo);
        const totalSaldo = visiveis.filter(it => it.ativo).reduce((a, it) => a + Math.max(saldo(it), 0), 0);
        const nComprar = visiveis.filter(it => it.ativo && precisaComprar(it)).length;
        const nZerado  = visiveis.filter(it => it.ativo && saldo(it) <= 0).length;
        const nOk      = visiveis.filter(it => it.ativo && statusDe(it) === 'ok').length;

        const cats = ['todas', ...Array.from(new Set(state.itens.map(i => i.categoria))).sort()];

        const root = document.getElementById('estoque-root');
        root.innerHTML = `
        <div class="estoque-wrap">
            <div class="estoque-head">
                <div class="estoque-head-titulo">
                    <div class="estoque-head-icone">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                            <polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>
                        </svg>
                    </div>
                    <div>
                        <h1>Estoque de Licenças</h1>
                        <p>Cada correção concluída desconta 1 automaticamente. Aqui você só acompanha e planeja as compras.</p>
                    </div>
                </div>
                <div class="estoque-head-acoes">
                    <button class="btn btn-secondary" id="btn-copiar-lista">📋 Copiar lista de compras</button>
                </div>
            </div>

            <div class="estoque-stats">
                <button class="estoque-stat s-saldo ${state.filtro === 'todos' ? 'ativo' : ''}" data-f="todos">
                    <div class="estoque-stat-num">${totalSaldo}</div>
                    <div class="estoque-stat-lbl">Licenças em estoque</div>
                </button>
                <button class="estoque-stat s-comprar ${state.filtro === 'comprar' ? 'ativo' : ''}" data-f="comprar">
                    <div class="estoque-stat-num">${nComprar}</div>
                    <div class="estoque-stat-lbl">Preciso comprar</div>
                </button>
                <button class="estoque-stat s-zerado ${state.filtro === 'zerado' ? 'ativo' : ''}" data-f="zerado">
                    <div class="estoque-stat-num">${nZerado}</div>
                    <div class="estoque-stat-lbl">Zerados</div>
                </button>
                <button class="estoque-stat s-ok ${state.filtro === 'ok' ? 'ativo' : ''}" data-f="ok">
                    <div class="estoque-stat-num">${nOk}</div>
                    <div class="estoque-stat-lbl">Em estoque</div>
                </button>
            </div>

            <div class="estoque-toolbar">
                <div class="estoque-busca">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    <input type="text" id="estoque-busca-input" placeholder="Buscar teste (sigla ou nome)..." value="${esc(state.busca)}">
                </div>
                <select class="estoque-select" id="estoque-cat-select">
                    ${cats.map(cat => `<option value="${esc(cat)}" ${state.categoria === cat ? 'selected' : ''}>${cat === 'todas' ? 'Todas as categorias' : esc(cat)}</option>`).join('')}
                </select>
                <label class="estoque-toggle-rem">
                    <input type="checkbox" id="estoque-rem-check" ${state.mostrarRemovidos ? 'checked' : ''}>
                    Mostrar removidos
                </label>
            </div>

            <div class="estoque-grid" id="estoque-grid"></div>
        </div>`;

        // eventos toolbar
        root.querySelectorAll('.estoque-stat').forEach(b =>
            b.addEventListener('click', () => { state.filtro = b.dataset.f; render(); }));
        const bi = document.getElementById('estoque-busca-input');
        bi.addEventListener('input', () => { state.busca = bi.value; renderGrid(); });
        document.getElementById('estoque-cat-select').addEventListener('change', e => { state.categoria = e.target.value; renderGrid(); });
        document.getElementById('estoque-rem-check').addEventListener('change', e => { state.mostrarRemovidos = e.target.checked; render(); });
        document.getElementById('btn-copiar-lista').addEventListener('click', copiarLista);

        renderGrid();
    }

    function itensFiltrados() {
        const q = state.busca.trim().toLowerCase();
        return state.itens.filter(it => {
            if (!state.mostrarRemovidos && !it.ativo) return false;
            if (state.categoria !== 'todas' && it.categoria !== state.categoria) return false;
            if (q && !(`${it.sigla} ${it.nome}`.toLowerCase().includes(q))) return false;
            if (it.ativo) {
                if (state.filtro === 'comprar' && !precisaComprar(it)) return false;
                if (state.filtro === 'zerado' && saldo(it) > 0) return false;
                if (state.filtro === 'ok' && statusDe(it) !== 'ok') return false;
            } else if (state.filtro !== 'todos') {
                return false;
            }
            return true;
        });
    }

    function renderGrid() {
        const grid = document.getElementById('estoque-grid');
        if (!grid) return;
        const lista = itensFiltrados().sort((a, b) =>
            (a.ordem - b.ordem) || a.categoria.localeCompare(b.categoria) || a.sigla.localeCompare(b.sigla));

        if (!lista.length) {
            grid.innerHTML = `<div class="estoque-vazio"><div class="estoque-vazio-icone">🔍</div>Nenhum teste encontrado com esses filtros.</div>`;
            return;
        }

        let html = '';
        let catAtual = null;
        for (const it of lista) {
            if (it.categoria !== catAtual) {
                catAtual = it.categoria;
                html += `<div class="estoque-cat-titulo">${esc(catAtual)}</div>`;
            }
            html += cardHTML(it);
        }
        grid.innerHTML = html;

        grid.querySelectorAll('[data-act]').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.closest('.estoque-card').dataset.id;
                const it = state.itens.find(x => x.estoque_id === id);
                if (!it) return;
                if (btn.dataset.act === 'compra') abrirModalCompra(it);
                if (btn.dataset.act === 'edit')   abrirModalEditar(it);
                if (btn.dataset.act === 'del')    removerItem(it);
                if (btn.dataset.act === 'restore') restaurarItem(it);
            });
        });
    }

    function cardHTML(it) {
        const st = statusDe(it);
        const cor = corCategoria(it.categoria);
        const s = saldo(it);
        const pct = it.comprado > 0 ? Math.min(100, Math.round((it.consumido / it.comprado) * 100)) : 0;
        const badge = st === 'zero' ? 'Zerado' : st === 'low' ? 'Comprar' : 'OK';

        const acoes = it.ativo ? `
            <button class="estoque-mini m-compra" data-act="compra" title="Adicionar compra">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Compra
            </button>
            <button class="estoque-mini m-edit" data-act="edit" title="Editar">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>Editar
            </button>
            <button class="estoque-mini m-del" data-act="del" title="Remover do estoque">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>Remover
            </button>` : `
            <button class="estoque-mini m-edit" data-act="restore" title="Restaurar" style="flex:1">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>Restaurar
            </button>`;

        return `
        <div class="estoque-card st-${st} ${it.ativo ? '' : 'removido'}" data-id="${it.estoque_id}">
            <div class="estoque-card-top" style="background:${cor.top}"></div>
            <div class="estoque-card-body">
                <div class="estoque-card-head">
                    <span class="estoque-sigla" style="background:${cor.bg}">${esc(it.sigla)}</span>
                    <span class="estoque-nome">${esc(it.nome)}</span>
                </div>
                <div class="estoque-saldo-row">
                    <span class="estoque-saldo">${s}</span>
                    <span class="estoque-saldo-lbl">em estoque</span>
                    <span class="estoque-badge">${badge}</span>
                </div>
                <div class="estoque-bar"><span style="width:${pct}%"></span></div>
                <div class="estoque-meta">
                    <span>Comprado: <b>${it.comprado}</b></span>
                    <span>Usado: <b>${it.consumido}</b></span>
                    <span>Mínimo: <b>${it.minimo}</b></span>
                </div>
                ${precisaComprar(it) && it.ativo && sugestao(it) > 0
                    ? `<div class="estoque-obs">💡 Sugerido comprar: <b>${sugestao(it)}</b></div>` : ''}
                ${it.obs ? `<div class="estoque-obs">📝 ${esc(it.obs)}</div>` : ''}
            </div>
            <div class="estoque-card-acoes">${acoes}</div>
        </div>`;
    }

    // ── Modal genérico ───────────────────────────────────────────────────────
    function abrirModal(html) {
        const ov = document.createElement('div');
        ov.className = 'estoque-modal-overlay';
        ov.innerHTML = html;
        document.body.appendChild(ov);
        ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
        return ov;
    }
    function stepper(id, val) {
        return `<div class="estoque-stepper">
            <button type="button" data-step="-1" data-t="${id}">−</button>
            <input type="number" id="${id}" min="0" value="${val}">
            <button type="button" data-step="1" data-t="${id}">+</button>
        </div>`;
    }
    function ligarSteppers(ov) {
        ov.querySelectorAll('[data-step]').forEach(b => b.addEventListener('click', () => {
            const inp = ov.querySelector('#' + b.dataset.t);
            const v = Math.max(0, (parseInt(inp.value, 10) || 0) + parseInt(b.dataset.step, 10));
            inp.value = v;
        }));
    }

    // ── Adicionar compra (soma ao comprado) ──────────────────────────────────
    function abrirModalCompra(it) {
        const cor = corCategoria(it.categoria);
        const ov = abrirModal(`
            <div class="estoque-modal">
                <div class="estoque-modal-top" style="background:${cor.top}"></div>
                <div class="estoque-modal-body">
                    <div class="estoque-modal-sigla">${esc(it.sigla)}</div>
                    <div class="estoque-modal-nome">${esc(it.nome)}</div>
                    <div class="estoque-field">
                        <label>Quantas licenças você comprou agora?</label>
                        ${stepper('inp-compra', 1)}
                        <div class="estoque-hint">Isso soma ao total. Estoque atual: ${saldo(it)} · Comprado: ${it.comprado}</div>
                    </div>
                    <div class="estoque-modal-acoes">
                        <button class="btn btn-secondary" data-x="nao">Cancelar</button>
                        <button class="btn btn-primary" data-x="sim">Adicionar</button>
                    </div>
                </div>
            </div>`);
        ligarSteppers(ov);
        ov.querySelector('[data-x="nao"]').addEventListener('click', () => ov.remove());
        ov.querySelector('[data-x="sim"]').addEventListener('click', async () => {
            const add = parseInt(ov.querySelector('#inp-compra').value, 10) || 0;
            if (add <= 0) { ov.remove(); return; }
            await salvar(it, { comprado: it.comprado + add });
            ov.remove();
            toast(`+${add} ${it.sigla} adicionado ao estoque`, 'success');
        });
    }

    // ── Editar (comprado, mínimo, obs) ───────────────────────────────────────
    function abrirModalEditar(it) {
        const cor = corCategoria(it.categoria);
        const ov = abrirModal(`
            <div class="estoque-modal">
                <div class="estoque-modal-top" style="background:${cor.top}"></div>
                <div class="estoque-modal-body">
                    <div class="estoque-modal-sigla">${esc(it.sigla)}</div>
                    <div class="estoque-modal-nome">${esc(it.nome)}</div>
                    <div class="estoque-field">
                        <label>Total comprado</label>
                        ${stepper('inp-comprado', it.comprado)}
                    </div>
                    <div class="estoque-field">
                        <label>Estoque mínimo (avisa quando chegar nesse nível)</label>
                        ${stepper('inp-minimo', it.minimo)}
                    </div>
                    <div class="estoque-field">
                        <label>Observação (opcional)</label>
                        <textarea id="inp-obs" placeholder="Ex.: fornecedor, nota, validade...">${esc(it.obs)}</textarea>
                    </div>
                    <div class="estoque-hint">Usado (${it.consumido}) é preenchido sozinho pelas correções e não é editado aqui.</div>
                    <div class="estoque-modal-acoes">
                        <button class="btn btn-secondary" data-x="nao">Cancelar</button>
                        <button class="btn btn-primary" data-x="sim">Salvar</button>
                    </div>
                </div>
            </div>`);
        ligarSteppers(ov);
        ov.querySelector('[data-x="nao"]').addEventListener('click', () => ov.remove());
        ov.querySelector('[data-x="sim"]').addEventListener('click', async () => {
            const comprado = Math.max(0, parseInt(ov.querySelector('#inp-comprado').value, 10) || 0);
            const minimo   = Math.max(0, parseInt(ov.querySelector('#inp-minimo').value, 10) || 0);
            const obs      = ov.querySelector('#inp-obs').value.trim();
            await salvar(it, { comprado, estoque_minimo: minimo, observacao: obs || null });
            ov.remove();
            toast(`${it.sigla} atualizado`, 'success');
        });
    }

    // ── Remover / restaurar (soft delete via ativo) ──────────────────────────
    function removerItem(it) {
        window.CortexConfirm.mostrar({
            icone: '🗑️',
            titulo: `Remover ${it.sigla} do estoque?`,
            texto: 'Ele some da lista, mas o histórico é mantido. Você pode restaurar depois em "Mostrar removidos".',
            btnSim: 'Sim, remover',
            btnNao: 'Cancelar',
            btnSimDanger: true,
            onSim: async () => { await salvar(it, { ativo: false }); toast(`${it.sigla} removido do estoque`, 'info'); },
        });
    }
    async function restaurarItem(it) {
        await salvar(it, { ativo: true });
        toast(`${it.sigla} restaurado`, 'success');
    }

    // ── Persistência ─────────────────────────────────────────────────────────
    async function salvar(it, patch) {
        try {
            const { error } = await client()
                .from('estoque_licencas')
                .update(patch)
                .eq('id', it.estoque_id);
            if (error) throw error;
            // atualiza estado local
            if ('comprado' in patch) it.comprado = patch.comprado;
            if ('estoque_minimo' in patch) it.minimo = patch.estoque_minimo;
            if ('observacao' in patch) it.obs = patch.observacao || '';
            if ('ativo' in patch) it.ativo = patch.ativo;
            render();
        } catch (err) {
            console.error('[estoque] salvar:', err);
            toast('Erro ao salvar: ' + (err.message || 'desconhecido'), 'danger');
        }
    }

    // ── Copiar lista de compras ──────────────────────────────────────────────
    async function copiarLista() {
        const comprar = state.itens
            .filter(it => it.ativo && precisaComprar(it))
            .sort((a, b) => a.sigla.localeCompare(b.sigla));
        if (!comprar.length) { toast('Nada abaixo do mínimo. Estoque em dia! ✅', 'success'); return; }

        const hoje = new Date().toLocaleDateString('pt-BR');
        let txt = `Lista de compras — licenças de testes (${hoje})\n\n`;
        comprar.forEach(it => {
            const sug = sugestao(it);
            txt += `• ${it.sigla} — ${it.nome}\n  em estoque: ${saldo(it)} | mínimo: ${it.minimo}${sug > 0 ? ` | comprar: ${sug}` : ''}\n`;
        });
        txt += `\nTotal de itens: ${comprar.length}`;

        try {
            await navigator.clipboard.writeText(txt);
            toast(`Lista de ${comprar.length} itens copiada. Cole onde quiser (Ctrl+V)`, 'success');
        } catch {
            const ov = abrirModal(`
                <div class="estoque-modal"><div class="estoque-modal-top" style="background:linear-gradient(90deg,#6366f1,#8b5cf6)"></div>
                <div class="estoque-modal-body">
                    <div class="estoque-modal-sigla">Lista de compras</div>
                    <div class="estoque-modal-nome">Selecione e copie o texto abaixo</div>
                    <div class="estoque-field"><textarea style="min-height:180px">${esc(txt)}</textarea></div>
                    <div class="estoque-modal-acoes"><button class="btn btn-primary" data-x="ok" style="flex:1">Fechar</button></div>
                </div></div>`);
            ov.querySelector('[data-x="ok"]').addEventListener('click', () => ov.remove());
        }
    }
})();

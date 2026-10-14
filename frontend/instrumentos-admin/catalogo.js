// ============================================================================
// CORTEX_APP — Catálogo de instrumentos para impressão
// ----------------------------------------------------------------------------
// URL: /instrumentos-admin/catalogo.html
// Lista todos os testes de instrumentos_catalogo com descrição, agrupados por
// domínio (mesma ordem da bateria). Na tela: filtros e botão imprimir; no
// papel (window.print / salvar como PDF): só o catálogo, A4, cabeçalho com a
// data. Qualquer usuário logado pode abrir (é leitura do mesmo catálogo que
// a bateria usa).
// ============================================================================

(function () {
    'use strict';

    const ORDEM = [
        'Inteligência / Raciocínio',
        'Linguagem / Leitura / Escrita / Matemática',
        'Atenção / Memória',
        'Funções Executivas',
        'TEA / Autismo',
        'TDAH / Comportamento',
        'Humor / Ansiedade / Depressão',
        'Psicopatologia Geral / ASEBA',
        'Personalidade / Habilidades Sociais / Adaptativo',
        'Desenvolvimento Infantil',
        'Sensorial'
    ];

    const RESPONDENTE = {
        paciente:                 'Paciente',
        responsavel:              'Responsável',
        professor:                'Professor(a)',
        paciente_ou_responsavel:  'Paciente ou responsável',
        responsavel_ou_professor: 'Responsável ou professor(a)'
    };

    const state = { todos: [], inativos: false, emBreve: false, compacto: false };

    function c() { return window.cortexClient; }
    function el(id) { return document.getElementById(id); }
    function esc(t) { const d = document.createElement('div'); d.textContent = t == null ? '' : String(t); return d.innerHTML; }

    // ── Boot ────────────────────────────────────────────────────────────
    window.addEventListener('cortex:auth-ready', async () => {
        try {
            await CortexSidebar.render('instrumentos');
            const { data, error } = await c().from('instrumentos_catalogo').select('*').order('sigla');
            if (error) throw error;
            state.todos = data || [];
            try { state.compacto = localStorage.getItem('cortex_catalogo_compacto') === '1'; } catch (e) { /* sem storage */ }
            render();
        } catch (err) {
            console.error('[catalogo]', err);
            el('cat-conteudo').innerHTML =
                `<div class="cat-erro">⚠️ Erro ao carregar o catálogo: ${esc(err.message || err)}</div>`;
        }
    });

    // ── Dados ───────────────────────────────────────────────────────────
    function visiveis() {
        return state.todos.filter(i => (state.inativos || i.ativo !== false) && (state.emBreve || !i.em_breve));
    }

    function agrupar(lista) {
        const grupos = {};
        for (const i of lista) {
            const d = (i.dominio_principal || 'Outros').trim();
            (grupos[d] = grupos[d] || []).push(i);
        }
        const nomes = ORDEM.filter(d => grupos[d])
            .concat(Object.keys(grupos).filter(d => !ORDEM.includes(d)).sort((a, b) => a.localeCompare(b, 'pt-BR')));
        return nomes.map(nome => ({
            nome,
            itens: grupos[nome].sort((a, b) => String(a.sigla).localeCompare(String(b.sigla), 'pt-BR', { numeric: true }))
        }));
    }

    function faixa(i) {
        if (i.faixa_etaria_label) return i.faixa_etaria_label;
        const mi = i.faixa_etaria_min_meses, ma = i.faixa_etaria_max_meses;
        const fmt = (m) => m % 12 === 0 ? `${m / 12} anos` : `${Math.floor(m / 12)}a${m % 12}m`;
        if (mi != null && ma != null) return `${fmt(mi)} – ${fmt(ma)}`;
        if (mi != null) return `a partir de ${fmt(mi)}`;
        if (ma != null) return `até ${fmt(ma)}`;
        return '';
    }

    function chips(i) {
        const out = [];
        out.push(`<span class="cat-chip ${i.tipo_aplicacao === 'presencial' ? 'pres' : 'onl'}">${i.tipo_aplicacao === 'presencial' ? 'Presencial' : 'Online'}</span>`);
        if (RESPONDENTE[i.tipo_respondente]) out.push(`<span class="cat-chip resp">${esc(RESPONDENTE[i.tipo_respondente])}</span>`);
        if (i.sexo_filtro === 'M' || i.sexo_filtro === 'F') out.push(`<span class="cat-chip sexo">${i.sexo_filtro === 'M' ? 'Masculino' : 'Feminino'}</span>`);
        if (i.permite_correcao_sistema) out.push(`<span class="cat-chip corr">Correção no CORTEX</span>`);
        if (i.em_breve) out.push(`<span class="cat-chip breve">Em breve</span>`);
        if (i.ativo === false) out.push(`<span class="cat-chip inat">Inativo</span>`);
        return out.join('');
    }

    function fonte(i) {
        return [i.autores, i.editora, i.versao].filter(Boolean).map(esc).join(' · ');
    }

    // ── Render ──────────────────────────────────────────────────────────
    function render() {
        const lista = visiveis();
        const grupos = agrupar(lista);
        const hoje = new Date();
        const dataStr = `${String(hoje.getDate()).padStart(2, '0')}/${String(hoje.getMonth() + 1).padStart(2, '0')}/${hoje.getFullYear()}`;

        el('cat-conteudo').innerHTML = `
            <div class="cat-topo no-print">
                <div>
                    <h1>Catálogo de instrumentos</h1>
                    <p>${lista.length} teste${lista.length === 1 ? '' : 's'} em ${grupos.length} categoria${grupos.length === 1 ? '' : 's'}. Imprimir abre a caixa do navegador — escolha a impressora ou "Salvar como PDF".</p>
                </div>
                <div class="cat-acoes">
                    <label class="cat-check"><input type="checkbox" id="chk-inativos" ${state.inativos ? 'checked' : ''}> Incluir inativos</label>
                    <label class="cat-check"><input type="checkbox" id="chk-breve" ${state.emBreve ? 'checked' : ''}> Incluir "em breve"</label>
                    <label class="cat-check"><input type="checkbox" id="chk-compacto" ${state.compacto ? 'checked' : ''}> Compacto (sem descrição longa)</label>
                    <a class="btn btn-secondary" href="instrumentos-admin.html">Cadastro</a>
                    <button class="btn btn-primary" id="btn-imprimir">🖨 Imprimir</button>
                </div>
            </div>

            <div class="cat-folha ${state.compacto ? 'compacto' : ''}" id="cat-folha">
                <div class="cat-cabecalho">
                    <div class="cat-cab-logo">E</div>
                    <div class="cat-cab-textos">
                        <div class="cat-cab-sup">Grupo Equilibrium · CORTEX</div>
                        <h2>Catálogo de instrumentos de avaliação</h2>
                        <div class="cat-cab-sub">${lista.length} instrumentos · ${grupos.length} categorias · emitido em ${dataStr}</div>
                    </div>
                </div>

                <div class="cat-sumario">
                    ${grupos.map(g => `<span class="cat-sum-item"><strong>${g.itens.length}</strong> ${esc(g.nome)}</span>`).join('')}
                </div>

                ${grupos.map((g, idx) => `
                    <section class="cat-grupo">
                        <h3 class="cat-grupo-titulo"><span class="cat-grupo-num">${idx + 1}</span>${esc(g.nome)}<span class="cat-grupo-qtd">${g.itens.length}</span></h3>
                        ${g.itens.map(i => `
                            <article class="cat-item">
                                <div class="cat-item-cab">
                                    <div class="cat-item-sigla">${esc(i.sigla)}</div>
                                    <div class="cat-item-nome">${esc(i.nome_completo || '')}</div>
                                    ${faixa(i) ? `<div class="cat-item-faixa">${esc(faixa(i))}</div>` : ''}
                                </div>
                                <div class="cat-item-chips">${chips(i)}</div>
                                ${i.o_que_avalia ? `<p class="cat-item-avalia">${esc(i.o_que_avalia)}</p>` : ''}
                                ${i.descricao_longa ? `<p class="cat-item-desc">${esc(i.descricao_longa)}</p>` : ''}
                                ${fonte(i) ? `<div class="cat-item-fonte">${fonte(i)}</div>` : ''}
                            </article>`).join('')}
                    </section>`).join('')}

                ${lista.length ? '' : '<p class="cat-vazio">Nenhum instrumento com os filtros atuais.</p>'}

                <div class="cat-rodape">CORTEX · Grupo Equilibrium — uso interno. Catálogo gerado em ${dataStr}.</div>
            </div>
        `;

        el('btn-imprimir').addEventListener('click', () => window.print());
        el('chk-inativos').addEventListener('change', (ev) => { state.inativos = ev.target.checked; render(); });
        el('chk-breve').addEventListener('change', (ev) => { state.emBreve = ev.target.checked; render(); });
        el('chk-compacto').addEventListener('change', (ev) => {
            state.compacto = ev.target.checked;
            try { localStorage.setItem('cortex_catalogo_compacto', state.compacto ? '1' : '0'); } catch (e) { /* sem storage */ }
            render();
        });
    }
})();

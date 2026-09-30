// ============================================================================
// CORTEX_APP — baterias_admin.js
// ----------------------------------------------------------------------------
// Aba "Baterias" em Configurações. Só admin.
//
// Aqui é onde as baterias do checklist são montadas e editadas. Quem aplica
// está na tela do checklist; esta tela é o cadastro.
//
// Dois tipos, e a diferença importa:
//   base    — o núcleo de uma faixa etária. A tela do checklist oferece a da
//             faixa do paciente, já marcada.
//   modulo  — o que se soma conforme a hipótese (TEA, AH/SD, dislexia).
//
// A bateria pode conter alternativas por idade juntas — Raven, Columbia e
// BETA-III na mesma base escolar — porque o checklist filtra por
// faixa_etaria_min/max_meses e por sexo_filtro. Cada paciente recebe só o que
// se aplica a ele. É o que faz UMA base escolar servir de 6 a 17 anos.
// ============================================================================

window.CortexBateriasAdmin = (function () {
    'use strict';

    const FAIXAS = [
        ['adulto',      'Adulto'],
        ['escolar',     'Escolar'],
        ['pre_escolar', 'Pré-escolar'],
        ['qualquer',    'Qualquer faixa']
    ];
    const FAIXA_LABEL = Object.fromEntries(FAIXAS);

    const state = { modelos: [], catalogo: [], busca: '' };

    const c = () => window.cortexClient;
    const toast = (m, t) => { if (window.CortexUI?.toast) window.CortexUI.toast(m, t); };
    const esc = (t) => { const d = document.createElement('div'); d.textContent = t ?? ''; return d.innerHTML; };

    // Meses -> "6a" / "6a 11m", para mostrar a faixa de cada instrumento.
    function idadeCurta(meses) {
        if (meses == null) return null;
        const a = Math.floor(meses / 12), m = meses % 12;
        return m ? `${a}a${m}m` : `${a}a`;
    }
    function faixaInstrumento(i) {
        const min = idadeCurta(i.faixa_etaria_min_meses), max = idadeCurta(i.faixa_etaria_max_meses);
        if (!min && !max) return '';
        if (min && max) return `${min}–${max}`;
        return min ? `${min}+` : `até ${max}`;
    }

    // ── Carga ───────────────────────────────────────────────────────────────

    async function carregar() {
        try {
            const [mod, cat] = await Promise.all([
                c().from('baterias_modelo')
                   .select('*, itens:baterias_modelo_itens(instrumento_id)')
                   .order('ordem'),
                c().from('instrumentos_catalogo')
                   .select('id, sigla, nome_completo, dominio_principal, faixa_etaria_min_meses, faixa_etaria_max_meses, sexo_filtro, ativo')
                   .order('dominio_principal').order('sigla')
            ]);
            if (mod.error) throw mod.error;
            if (cat.error) throw cat.error;

            state.modelos = (mod.data || []).map(m => ({
                ...m, ids: (m.itens || []).map(x => x.instrumento_id)
            }));
            state.catalogo = cat.data || [];
        } catch (err) {
            console.error('[baterias] carregar:', err);
            toast('Erro ao carregar baterias: ' + (err.message || ''), 'danger');
        }
    }

    // ── Render ──────────────────────────────────────────────────────────────

    function render() {
        const bases = state.modelos.filter(m => m.tipo === 'base');
        const mods = state.modelos.filter(m => m.tipo === 'modulo');

        return `
            <div class="ext-intro">
                <h3>Baterias do checklist</h3>
                <p>
                    Listas prontas de instrumentos para o checklist sair em dois cliques.
                    A <strong>base</strong> é o núcleo de uma faixa etária; os
                    <strong>módulos</strong> são o que se soma conforme a hipótese.
                    Depois de aplicada, a lista continua editável item por item na tela
                    do paciente — a bateria é um ponto de partida.
                </p>
            </div>

            <div class="ext-resumo">
                <div class="ext-num"><strong>${bases.length}</strong> bases</div>
                <div class="ext-num"><strong>${mods.length}</strong> módulos</div>
                <div class="ext-num"><strong>${state.modelos.filter(m => !m.ativo).length}</strong> inativas</div>
            </div>

            <div class="ext-acoes-topo">
                <button class="btn btn-primary btn-sm" id="bat-nova">+ Nova bateria</button>
            </div>

            <p class="ext-dica">
                Uma bateria pode trazer alternativas de idade juntas: como o checklist
                filtra por faixa etária e por sexo, cada paciente recebe só o que se
                aplica a ele. É o que permite uma base escolar única de 6 a 17 anos.
            </p>

            ${tabela('Bases', bases)}
            ${tabela('Módulos', mods)}`;
    }

    function tabela(titulo, lista) {
        if (!lista.length) {
            return `<div class="ext-fila">
                        <h4 class="ext-fila-tit">${esc(titulo)}</h4>
                        <div class="ext-vazio">Nenhuma ${titulo === 'Bases' ? 'base' : 'módulo'} cadastrada ainda.</div>
                    </div>`;
        }
        return `
            <div class="ext-fila">
                <h4 class="ext-fila-tit">${esc(titulo)} <span class="ext-badge">${lista.length}</span></h4>
                <div class="ext-tabela-wrap">
                    <table class="ext-tabela">
                        <thead><tr>
                            <th>Bateria</th><th style="width:120px">Faixa</th>
                            <th style="width:110px">Instrumentos</th>
                            <th style="width:90px">Situação</th><th style="width:150px"></th>
                        </tr></thead>
                        <tbody>
                            ${lista.map(m => `
                                <tr class="${m.ativo ? '' : 'inativo'}">
                                    <td><strong>${esc(m.nome)}</strong>
                                        ${m.descricao ? `<br><span class="ext-sub">${esc(m.descricao)}</span>` : ''}</td>
                                    <td>${esc(FAIXA_LABEL[m.faixa] || m.faixa)}</td>
                                    <td>${m.ids.length}</td>
                                    <td>${m.ativo ? '<span class="ext-selo ok">Ativa</span>'
                                                  : '<span class="ext-selo off">Inativa</span>'}</td>
                                    <td>
                                        <button class="ext-mini" data-bat-editar="${m.id}">Editar</button>
                                        <button class="ext-mini" data-bat-duplicar="${m.id}">Duplicar</button>
                                    </td>
                                </tr>`).join('')}
                        </tbody>
                    </table>
                </div>
            </div>`;
    }

    function bind() {
        const nova = document.getElementById('bat-nova');
        if (nova) nova.addEventListener('click', () => ficha(null));

        document.querySelectorAll('[data-bat-editar]').forEach(b =>
            b.addEventListener('click', () => ficha(state.modelos.find(m => m.id === b.dataset.batEditar))));
        document.querySelectorAll('[data-bat-duplicar]').forEach(b =>
            b.addEventListener('click', () => {
                const o = state.modelos.find(m => m.id === b.dataset.batDuplicar);
                if (!o) return;
                ficha({ ...o, id: null, nome: o.nome + ' (cópia)' });
            }));
    }

    function repintar() {
        const cont = document.getElementById('cfg-conteudo');
        if (!cont) return;
        cont.innerHTML = render();
        bind();
    }

    // ── Ficha ───────────────────────────────────────────────────────────────

    function ficha(m) {
        const novo = !m || !m.id;
        const marcados = new Set(m?.ids || []);
        state.busca = '';

        const j = window.CortexPop.abrir({
            titulo: novo ? 'Nova bateria' : 'Editar bateria',
            subtitulo: novo ? '' : m.nome,
            tone: 'blue', tamanho: 'xl', persistente: true,
            html: `
                <div class="bat-grid-topo">
                    <div class="ext-campo bat-col-2">
                        <label>Nome *</label>
                        <input id="bat-nome" value="${esc(m?.nome || '')}" placeholder="ex.: Base — Adulto">
                    </div>
                    <div class="ext-campo">
                        <label>Tipo</label>
                        <select id="bat-tipo">
                            <option value="base"   ${m?.tipo === 'base' ? 'selected' : ''}>Base (núcleo da faixa)</option>
                            <option value="modulo" ${m?.tipo !== 'base' ? 'selected' : ''}>Módulo (soma por hipótese)</option>
                        </select>
                    </div>
                    <div class="ext-campo">
                        <label>Faixa</label>
                        <select id="bat-faixa">
                            ${FAIXAS.map(([v, l]) =>
                                `<option value="${v}" ${(m?.faixa || 'adulto') === v ? 'selected' : ''}>${l}</option>`).join('')}
                        </select>
                    </div>
                </div>
                <div class="ext-campo">
                    <label>Descrição <span class="ext-sub">(aparece na tela do checklist)</span></label>
                    <input id="bat-desc" value="${esc(m?.descricao || '')}"
                           placeholder="Quando usar esta bateria">
                </div>
                ${!novo ? `
                <div class="bat-grid-topo">
                    <div class="ext-campo">
                        <label>Situação</label>
                        <select id="bat-ativo">
                            <option value="true"  ${m.ativo ? 'selected' : ''}>Ativa</option>
                            <option value="false" ${m.ativo ? '' : 'selected'}>Inativa (não aparece no checklist)</option>
                        </select>
                    </div>
                    <div class="ext-campo">
                        <label>Ordem</label>
                        <input id="bat-ordem" type="number" value="${Number(m.ordem) || 0}">
                    </div>
                </div>` : ''}

                <div class="bat-sel-topo">
                    <div>
                        <strong>Instrumentos</strong>
                        <span class="ext-sub" id="bat-contador">${marcados.size} marcados</span>
                    </div>
                    <input id="bat-busca" class="bat-busca" placeholder="Buscar sigla ou nome...">
                </div>
                <div class="bat-lista" id="bat-lista">${listaInstrumentos(marcados, '')}</div>`,
            rodape: [
                { label: 'Cancelar', classe: 'btn-secondary' },
                ...(novo ? [] : [{ label: 'Apagar', classe: 'btn-ghost', fechar: false,
                                   onClick: (jj) => apagar(m, jj) }]),
                { label: novo ? 'Criar bateria' : 'Salvar', classe: 'btn-primary', fechar: false,
                  onClick: (jj) => salvar(m, marcados, jj) }
            ]
        });

        const lista = j.corpo.querySelector('#bat-lista');
        const contador = j.corpo.querySelector('#bat-contador');

        lista.addEventListener('change', (ev) => {
            const cb = ev.target.closest('input[data-instr]');
            if (!cb) return;
            if (cb.checked) marcados.add(cb.dataset.instr); else marcados.delete(cb.dataset.instr);
            contador.textContent = `${marcados.size} marcados`;
        });

        const busca = j.corpo.querySelector('#bat-busca');
        busca.addEventListener('input', () => {
            state.busca = busca.value.trim().toLowerCase();
            lista.innerHTML = listaInstrumentos(marcados, state.busca);
        });

        setTimeout(() => j.corpo.querySelector('#bat-nome')?.focus(), 250);
    }

    function listaInstrumentos(marcados, busca) {
        const grupos = {};
        state.catalogo.forEach(i => {
            if (busca) {
                const alvo = (i.sigla + ' ' + (i.nome_completo || '')).toLowerCase();
                if (!alvo.includes(busca)) return;
            }
            const g = i.dominio_principal || 'Outros';
            (grupos[g] = grupos[g] || []).push(i);
        });

        const nomes = Object.keys(grupos).sort();
        if (!nomes.length) return '<div class="ext-vazio">Nenhum instrumento encontrado.</div>';

        return nomes.map(g => `
            <div class="bat-grupo">
                <div class="bat-grupo-tit">${esc(g)}</div>
                ${grupos[g].map(i => {
                    const fx = faixaInstrumento(i);
                    return `
                    <label class="bat-item ${marcados.has(i.id) ? 'marcado' : ''} ${i.ativo ? '' : 'inativo'}">
                        <input type="checkbox" data-instr="${i.id}" ${marcados.has(i.id) ? 'checked' : ''}>
                        <span class="bat-item-sigla">${esc(i.sigla)}</span>
                        <span class="bat-item-nome">${esc(i.nome_completo || '')}</span>
                        <span class="bat-item-faixa">
                            ${fx ? esc(fx) : ''}
                            ${i.sexo_filtro ? `<span class="bat-sexo">${i.sexo_filtro === 'F' ? '♀ só mulheres' : '♂ só homens'}</span>` : ''}
                            ${i.ativo ? '' : '<span class="bat-sexo">inativo</span>'}
                        </span>
                    </label>`;
                }).join('')}
            </div>`).join('');
    }

    // ── Salvar ──────────────────────────────────────────────────────────────

    async function salvar(original, marcados, janela) {
        const corpo = janela.corpo;
        const nome = corpo.querySelector('#bat-nome').value.trim();
        if (!nome) { toast('Dê um nome à bateria.', 'danger'); return false; }
        if (!marcados.size) { toast('Marque pelo menos um instrumento.', 'danger'); return false; }

        const row = {
            nome,
            descricao: corpo.querySelector('#bat-desc').value.trim() || null,
            tipo: corpo.querySelector('#bat-tipo').value,
            faixa: corpo.querySelector('#bat-faixa').value
        };
        const elAtivo = corpo.querySelector('#bat-ativo');
        const elOrdem = corpo.querySelector('#bat-ordem');
        if (elAtivo) row.ativo = elAtivo.value === 'true';
        if (elOrdem) row.ordem = parseInt(elOrdem.value, 10) || 0;

        const id = original?.id || null;

        try {
            let modeloId = id;
            if (id) {
                row.atualizado_em = new Date().toISOString();
                row.atualizado_por = window.cortexProfissional?.id || null;
                const { error } = await c().from('baterias_modelo').update(row).eq('id', id);
                if (error) throw error;
            } else {
                row.criado_por = window.cortexProfissional?.id || null;
                if (row.ordem == null) row.ordem = (state.modelos.length + 1) * 10;
                const { data, error } = await c().from('baterias_modelo')
                    .insert(row).select('id').single();
                if (error) throw error;
                modeloId = data.id;
            }

            // Itens: só o que mudou. Apagar tudo e reinserir criaria lixo de
            // histórico e um intervalo em que a bateria fica vazia.
            const antes = new Set(id ? (original.ids || []) : []);
            const agora = marcados;
            const inserir = [...agora].filter(x => !antes.has(x));
            const remover = [...antes].filter(x => !agora.has(x));

            if (remover.length) {
                const { error } = await c().from('baterias_modelo_itens')
                    .delete().eq('modelo_id', modeloId).in('instrumento_id', remover);
                if (error) throw error;
            }
            if (inserir.length) {
                const { error } = await c().from('baterias_modelo_itens')
                    .insert(inserir.map(x => ({ modelo_id: modeloId, instrumento_id: x })));
                if (error) throw error;
            }

            if (window.CortexAudit) {
                window.CortexAudit.log(id ? 'edicao' : 'criacao', 'baterias_modelo', modeloId, {
                    detalhes: { operacao: id ? 'editar_bateria' : 'criar_bateria', nome,
                                instrumentos: agora.size, incluidos: inserir.length,
                                removidos: remover.length }
                });
            }

            janela.fecharJanela();
            toast(id ? 'Bateria atualizada.' : 'Bateria criada.', 'success');
            await carregar();
            repintar();
            return true;
        } catch (err) {
            console.error('[baterias] salvar:', err);
            const dup = String(err.message || '').includes('duplicate');
            toast(dup ? 'Já existe uma bateria com esse nome.'
                      : 'Erro ao salvar: ' + (err.message || ''), 'danger');
            return false;
        }
    }

    function apagar(m, janela) {
        window.CortexConfirm.mostrar({
            icone: '🗑',
            titulo: 'Apagar esta bateria?',
            texto: `"${m.nome}" deixa de aparecer no checklist. Os checklists já ` +
                   `montados com ela não mudam — eles guardam os instrumentos, não a bateria.`,
            btnSim: 'Sim, apagar', btnNao: 'Cancelar', btnSimDanger: true,
            onSim: async () => {
                try {
                    const { error } = await c().from('baterias_modelo').delete().eq('id', m.id);
                    if (error) throw error;
                    if (window.CortexAudit) {
                        window.CortexAudit.log('delecao', 'baterias_modelo', m.id, {
                            detalhes: { operacao: 'apagar_bateria', nome: m.nome }
                        });
                    }
                    janela.fecharJanela();
                    toast('Bateria apagada.', 'success');
                    await carregar();
                    repintar();
                } catch (err) {
                    console.error('[baterias] apagar:', err);
                    toast('Erro ao apagar: ' + (err.message || ''), 'danger');
                }
            }
        });
        return false;
    }

    return { carregar, render, bind };
})();

// ============================================================================
// CORTEX_APP — instrumentos-admin.js   (somente admin_clínico / admin_gestor)
// ----------------------------------------------------------------------------
// Cadastro do CONTEÚDO de um instrumento, sem escrever SQL na mão.
//
// O motor de escalas já existe no banco e roda em produção (17 páginas de
// resposta e 33 de correção leem dele). Esta tela só preenche essas tabelas:
//
//   instrumentos_normas          → a versão da norma (1 por instrumento/versão)
//     ├─ instrumentos_fatores    → as escalas que o instrumento calcula
//     ├─ instrumentos_itens      → os itens (numero + texto + reverso)
//     │    └─ instrumentos_itens_fatores → item em MAIS DE UMA escala (N:N)
//     ├─ instrumentos_normas_lookup      → tabela de consulta bruto→T→percentil
//     └─ instrumentos_classificacoes     → faixas de corte
//
// Nada de conteúdo clínico vive neste arquivo: itens, normas e cortes são
// colados/enviados pelo profissional a partir do material que ele licenciou.
// ============================================================================

(function () {
    'use strict';

    const LOTE = 400;   // linhas por INSERT (evita payload gigante)

    const state = {
        instrumentos: [],
        normas: [],
        instrumentoId: '',
        normaId: '',
        norma: null,
        fatores: [],
        itens: [],
        vinculos: [],      // instrumentos_itens_fatores
        lookup: [],        // amostra + contagem
        lookupTotal: 0,
        classificacoes: [],
        aba: 'norma'
    };

    const c = () => window.cortexClient;

    const esc = (t) => {
        const d = document.createElement('div');
        d.textContent = (t === null || t === undefined) ? '' : String(t);
        return d.innerHTML;
    };

    const toast = (msg, tipo) => {
        if (window.CortexUI && window.CortexUI.toast) window.CortexUI.toast(msg, tipo || 'info');
        else alert(msg);
    };

    const el = (id) => document.getElementById(id);
    const val = (id) => { const e = el(id); return e ? e.value.trim() : ''; };
    const num = (id) => { const v = val(id); return v === '' ? null : Number(v); };

    // ════════════════════════════════════════════════════════════════════════
    // BOOT
    // ════════════════════════════════════════════════════════════════════════

    window.addEventListener('cortex:auth-ready', async () => {
        await CortexSidebar.render('instrumentos');

        const podeAdmin = window.CortexPerfil &&
            ((window.CortexPerfil.isAdminClinico && window.CortexPerfil.isAdminClinico()) ||
             (window.CortexPerfil.isAdminGestor && window.CortexPerfil.isAdminGestor()));

        if (!podeAdmin) {
            el('ia-conteudo').innerHTML = `
                <div class="ia-negado">
                    <div class="ia-negado-ic">🔒</div>
                    <h2>Acesso restrito</h2>
                    <p>O cadastro de instrumentos está disponível apenas para administradores.</p>
                </div>`;
            return;
        }

        try {
            await carregarInstrumentos();
            renderEstrutura();
        } catch (err) {
            console.error(err);
            el('ia-conteudo').innerHTML =
                `<div class="ia-aviso erro"><span class="ia-aviso-ic">⚠️</span>
                 <div>Erro ao carregar: ${esc(err.message || err)}</div></div>`;
        }
    });

    async function carregarInstrumentos() {
        const { data, error } = await c()
            .from('instrumentos_catalogo')
            .select('*')
            .order('sigla');
        if (error) throw error;
        state.instrumentos = data || [];
    }

    // ════════════════════════════════════════════════════════════════════════
    // ESTRUTURA DA PÁGINA
    // ════════════════════════════════════════════════════════════════════════

    function renderEstrutura() {
        el('ia-conteudo').innerHTML = `
            <div class="ia-topo">
                <div>
                    <h1>Cadastro de instrumentos</h1>
                    <p>Preencha o conteúdo do instrumento a partir do material que você licenciou.</p>
                </div>
            </div>

            <div class="ia-selecao">
                <div class="ia-campo">
                    <label for="sel-instrumento">Instrumento</label>
                    <select id="sel-instrumento">
                        <option value="">— escolha —</option>
                        ${state.instrumentos.map(i =>
                            `<option value="${i.id}">${esc(i.sigla)} · ${esc(i.nome_completo)}${i.ativo ? '' : '  (inativo)'}</option>`
                        ).join('')}
                    </select>
                </div>
                <div class="ia-campo">
                    <label for="sel-norma">Versão da norma</label>
                    <select id="sel-norma" disabled>
                        <option value="">— escolha o instrumento —</option>
                    </select>
                </div>
                <div style="display:flex;gap:8px;flex-wrap:wrap">
                    <button class="ia-btn ia-btn-secundario" id="btn-nova-norma" disabled>+ Nova versão</button>
                </div>
            </div>

            <div style="display:flex;gap:8px;flex-wrap:wrap;margin:-8px 0 20px">
                <button class="ia-btn ia-btn-secundario" id="btn-novo-instr">+ Cadastrar teste novo</button>
                <button class="ia-btn ia-btn-secundario" id="btn-editar-instr" disabled>Editar dados do teste</button>
            </div>

            <div id="ia-ficha"></div>
            <div id="ia-corpo"></div>
        `;

        el('sel-instrumento').addEventListener('change', async (e) => {
            state.instrumentoId = e.target.value;
            state.normaId = '';
            el('btn-editar-instr').disabled = !state.instrumentoId;
            el('ia-ficha').innerHTML = '';
            await carregarNormas();
        });

        el('sel-norma').addEventListener('change', async (e) => {
            state.normaId = e.target.value;
            if (state.normaId) await carregarTudo();
            else el('ia-corpo').innerHTML = '';
        });

        el('btn-novo-instr').addEventListener('click', () => fichaInstrumento(null));
        el('btn-editar-instr').addEventListener('click', () => {
            const inst = state.instrumentos.find(i => i.id === state.instrumentoId);
            if (inst) fichaInstrumento(inst);
        });

        el('btn-nova-norma').addEventListener('click', () => {
            state.normaId = '';
            state.norma = null;
            state.fatores = []; state.itens = []; state.vinculos = [];
            state.lookup = []; state.lookupTotal = 0; state.classificacoes = [];
            state.aba = 'norma';
            renderAbas();
        });

        el('ia-corpo').innerHTML = `
            <div class="ia-vazio">
                <strong>Escolha um instrumento para começar</strong>
                Você vai declarar as escalas, colar os itens, enviar a tabela normativa e definir os cortes.
            </div>`;
    }

    async function carregarNormas() {
        const sel = el('sel-norma');
        const btn = el('btn-nova-norma');

        if (!state.instrumentoId) {
            sel.disabled = true; btn.disabled = true;
            sel.innerHTML = '<option value="">— escolha o instrumento —</option>';
            return;
        }

        const { data, error } = await c()
            .from('instrumentos_normas')
            .select('*')
            .eq('instrumento_id', state.instrumentoId)
            .order('created_at');

        if (error) { toast('Erro ao buscar normas: ' + error.message, 'danger'); return; }

        state.normas = data || [];
        sel.disabled = false;
        btn.disabled = false;
        sel.innerHTML = '<option value="">— nova versão —</option>' +
            state.normas.map(n =>
                `<option value="${n.id}">${esc(n.versao_codigo)} · ${esc(n.versao_label)}${n.ativa ? '' : ' (inativa)'}</option>`
            ).join('');

        if (state.normas.length === 0) {
            state.norma = null;
            state.aba = 'norma';
            renderAbas();
            toast('Nenhuma norma cadastrada ainda. Comece pela aba Norma.', 'info');
        } else {
            el('ia-corpo').innerHTML = `
                <div class="ia-vazio">
                    <strong>Escolha a versão da norma</strong>
                    Ou clique em “Nova versão” para cadastrar do zero.
                </div>`;
        }
    }

    async function carregarTudo() {
        state.norma = state.normas.find(n => n.id === state.normaId) || null;
        if (!state.norma) return;

        const [fat, itn, cls] = await Promise.all([
            c().from('instrumentos_fatores').select('*').eq('norma_id', state.normaId).order('ordem'),
            c().from('instrumentos_itens').select('*').eq('norma_id', state.normaId).order('numero'),
            c().from('instrumentos_classificacoes').select('*').eq('norma_id', state.normaId).order('ordem')
        ]);

        state.fatores = fat.data || [];
        state.itens = itn.data || [];
        state.classificacoes = cls.data || [];

        // Vínculos N:N e contagem do lookup dependem dos ids já carregados
        const idsItens = state.itens.map(i => i.id);
        const idsFatores = state.fatores.map(f => f.id);

        state.vinculos = [];
        if (idsItens.length) {
            const { data } = await c()
                .from('instrumentos_itens_fatores')
                .select('*')
                .in('item_id', idsItens);
            state.vinculos = data || [];
        }

        state.lookupTotal = 0;
        if (idsFatores.length) {
            const { count } = await c()
                .from('instrumentos_normas_lookup')
                .select('id', { count: 'exact', head: true })
                .eq('norma_id', state.normaId);
            state.lookupTotal = count || 0;
        }

        renderAbas();
    }

    // ════════════════════════════════════════════════════════════════════════
    // 0 · FICHA DO TESTE (instrumentos_catalogo)
    // ════════════════════════════════════════════════════════════════════════
    // Cadastra ou edita o teste no catalogo — o que faz ele aparecer no
    // checklist do paciente e na bateria. E o passo anterior a tudo: sem
    // ficha, nao ha onde pendurar norma, escalas nem itens.
    //
    // Valores validos vem dos CHECKs da tabela:
    //   tipo_aplicacao   : presencial | online
    //   tipo_respondente : paciente | responsavel | professor |
    //                      paciente_ou_responsavel | responsavel_ou_professor
    //   sexo_filtro      : NULL | M | F
    // faixas_aplicaveis usa os tres valores que o checklist.js reconhece:
    //   pre_escolar (ate 6a) | escolar (6-17a) | adulto (18+)

    const FAIXAS = [
        ['pre_escolar', 'Pré-escolar (até 6 anos)'],
        ['escolar',     'Escolar (6 a 17 anos)'],
        ['adulto',      'Adulto (18 anos ou mais)']
    ];

    const RESPONDENTES = [
        ['paciente',                 'O próprio paciente'],
        ['responsavel',              'Pai, mãe ou responsável'],
        ['professor',                'Professor'],
        ['paciente_ou_responsavel',  'Paciente ou responsável'],
        ['responsavel_ou_professor', 'Responsável ou professor']
    ];

    function dominiosExistentes() {
        return [...new Set(state.instrumentos.map(i => i.dominio_principal).filter(Boolean))].sort();
    }

    function fichaInstrumento(inst) {
        const novo = !inst;
        const i = inst || {};
        const faixas = Array.isArray(i.faixas_aplicaveis) ? i.faixas_aplicaveis : [];
        const doms = dominiosExistentes();

        el('ia-ficha').innerHTML = `
            <div class="ia-card" style="border-color:rgba(47,111,237,.35)">
                <h2>${novo ? 'Cadastrar teste novo' : 'Dados do teste'}</h2>
                <p class="ia-card-sub">
                    É o que faz o teste aparecer no checklist do paciente e na bateria.
                    Os filtros de idade, sexo e respondente decidem para quem ele aparece.
                </p>

                <div class="ia-grid">
                    <div class="ia-campo">
                        <label>Sigla *</label>
                        <input id="f-sigla" value="${esc(i.sigla || '')}" placeholder="ex.: BDI-II">
                        <span class="ia-campo-dica">Como aparece nas listas. Diferencia maiúscula de minúscula.</span>
                    </div>
                    <div class="ia-campo ia-full">
                        <label>Nome completo *</label>
                        <input id="f-nome" value="${esc(i.nome_completo || '')}">
                    </div>
                    <div class="ia-campo ia-full">
                        <label>O que avalia *</label>
                        <input id="f-avalia" value="${esc(i.o_que_avalia || '')}" placeholder="Uma linha, aparece embaixo do nome no checklist">
                    </div>
                    <div class="ia-campo ia-full">
                        <label>Categoria *</label>
                        <select id="f-dominio">
                            ${doms.map(d => `<option value="${esc(d)}" ${i.dominio_principal === d ? 'selected' : ''}>${esc(d)}</option>`).join('')}
                            <option value="__nova__">— criar categoria nova —</option>
                        </select>
                        <input id="f-dominio-nova" style="display:none;margin-top:6px" placeholder="Nome da categoria nova">
                        <span class="ia-campo-dica" id="f-dominio-dica"></span>
                    </div>

                    <div class="ia-campo ia-full">
                        <label>Para quem aparece *</label>
                        <div style="display:flex;gap:16px;flex-wrap:wrap;padding:6px 0">
                            ${FAIXAS.map(([v, lbl]) => `
                                <label style="display:flex;align-items:center;gap:7px;font-size:13.5px;font-weight:400;text-transform:none;letter-spacing:0;color:var(--color-text)">
                                    <input type="checkbox" class="f-faixa" value="${v}" ${faixas.includes(v) ? 'checked' : ''} style="width:auto">
                                    ${esc(lbl)}
                                </label>`).join('')}
                        </div>
                        <span class="ia-campo-dica">Marque pelo menos uma. É o filtro grosso; o fino são as idades abaixo.</span>
                    </div>

                    <div class="ia-campo">
                        <label>Idade mínima (meses)</label>
                        <input id="f-idmin" type="number" value="${i.faixa_etaria_min_meses ?? ''}">
                        <span class="ia-campo-dica">6 anos = 72. Vazio = sem limite.</span>
                    </div>
                    <div class="ia-campo">
                        <label>Idade máxima (meses)</label>
                        <input id="f-idmax" type="number" value="${i.faixa_etaria_max_meses ?? ''}">
                    </div>
                    <div class="ia-campo">
                        <label>Faixa escrita</label>
                        <input id="f-idlabel" value="${esc(i.faixa_etaria_label || '')}" placeholder="ex.: 6 – 18 anos">
                        <span class="ia-campo-dica">Só para exibição.</span>
                    </div>

                    <div class="ia-campo">
                        <label>Quem responde *</label>
                        <select id="f-respondente">
                            ${RESPONDENTES.map(([v, lbl]) => `<option value="${v}" ${(i.tipo_respondente || 'paciente') === v ? 'selected' : ''}>${esc(lbl)}</option>`).join('')}
                        </select>
                    </div>
                    <div class="ia-campo">
                        <label>Só para um sexo?</label>
                        <select id="f-sexo">
                            <option value=""  ${!i.sexo_filtro ? 'selected' : ''}>Não, aparece para todos</option>
                            <option value="M" ${i.sexo_filtro === 'M' ? 'selected' : ''}>Só masculino</option>
                            <option value="F" ${i.sexo_filtro === 'F' ? 'selected' : ''}>Só feminino</option>
                        </select>
                        <span class="ia-campo-dica">Use só se houver versão separada por sexo.</span>
                    </div>
                    <div class="ia-campo">
                        <label>Como é aplicado *</label>
                        <select id="f-tipoapl">
                            <option value="online"     ${(i.tipo_aplicacao || 'online') === 'online' ? 'selected' : ''}>Online (link ou portal)</option>
                            <option value="presencial" ${i.tipo_aplicacao === 'presencial' ? 'selected' : ''}>Presencial</option>
                        </select>
                    </div>

                    <div class="ia-campo">
                        <label>Responde dentro do CORTEX?</label>
                        <select id="f-online">
                            <option value="false" ${!i.permite_aplicacao_online ? 'selected' : ''}>Não</option>
                            <option value="true"  ${i.permite_aplicacao_online ? 'selected' : ''}>Sim</option>
                        </select>
                        <span class="ia-campo-dica">Sim exige os itens cadastrados.</span>
                    </div>
                    <div class="ia-campo">
                        <label>CORTEX corrige?</label>
                        <select id="f-correcao">
                            <option value="false" ${!i.permite_correcao_sistema ? 'selected' : ''}>Não, corrijo fora</option>
                            <option value="true"  ${i.permite_correcao_sistema ? 'selected' : ''}>Sim</option>
                        </select>
                        <span class="ia-campo-dica">Sim exige a tabela normativa.</span>
                    </div>
                    <div class="ia-campo">
                        <label>Ativo</label>
                        <select id="f-ativo">
                            <option value="true"  ${i.ativo !== false ? 'selected' : ''}>Sim</option>
                            <option value="false" ${i.ativo === false ? 'selected' : ''}>Não, esconder</option>
                        </select>
                    </div>

                    <div class="ia-campo">
                        <label>Autores</label>
                        <input id="f-autores" value="${esc(i.autores || '')}">
                    </div>
                    <div class="ia-campo">
                        <label>Editora</label>
                        <input id="f-editora" value="${esc(i.editora || '')}">
                    </div>
                    <div class="ia-campo">
                        <label>Versão / edição</label>
                        <input id="f-versao" value="${esc(i.versao || '')}">
                    </div>
                    <div class="ia-campo ia-full">
                        <label>Descrição longa</label>
                        <input id="f-desclonga" value="${esc(i.descricao_longa || '')}">
                    </div>
                </div>

                <div class="ia-acoes">
                    <button class="ia-btn ia-btn-primario" id="btn-salvar-ficha">
                        ${novo ? 'Cadastrar teste' : 'Salvar alterações'}
                    </button>
                    <button class="ia-btn ia-btn-secundario" id="btn-fechar-ficha">Cancelar</button>
                </div>
            </div>`;

        const selDom = el('f-dominio');
        const inpDom = el('f-dominio-nova');
        const dicaDom = el('f-dominio-dica');

        function atualizarDicaDominio() {
            if (selDom.value === '__nova__') {
                inpDom.style.display = 'block';
                dicaDom.innerHTML = '<strong>Atenção:</strong> categoria nova precisa ser adicionada também ao checklist.js e ao bateria.js, senão aparece sem ícone e no fim da lista. Prefira uma das existentes se couber.';
            } else {
                inpDom.style.display = 'none';
                dicaDom.textContent = 'Agrupa o teste no checklist e na bateria.';
            }
        }
        selDom.addEventListener('change', atualizarDicaDominio);
        atualizarDicaDominio();

        el('btn-fechar-ficha').addEventListener('click', () => { el('ia-ficha').innerHTML = ''; });
        el('btn-salvar-ficha').addEventListener('click', () => salvarFicha(i.id || null));

        el('ia-ficha').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    async function salvarFicha(id) {
        const faixas = [...document.querySelectorAll('.f-faixa:checked')].map(c => c.value);
        let dominio = val('f-dominio');
        if (dominio === '__nova__') dominio = val('f-dominio-nova');

        if (!val('f-sigla'))   { toast('A sigla é obrigatória.', 'danger'); return; }
        if (!val('f-nome'))    { toast('O nome completo é obrigatório.', 'danger'); return; }
        if (!val('f-avalia'))  { toast('Preencha "O que avalia".', 'danger'); return; }
        if (!dominio)          { toast('Escolha ou escreva uma categoria.', 'danger'); return; }
        if (!faixas.length)    { toast('Marque pelo menos uma faixa em "Para quem aparece".', 'danger'); return; }

        const idMin = num('f-idmin'), idMax = num('f-idmax');
        if (idMin !== null && idMax !== null && idMin > idMax) {
            toast('A idade mínima está maior que a máxima.', 'danger'); return;
        }

        const row = {
            sigla: val('f-sigla'),
            nome_completo: val('f-nome'),
            o_que_avalia: val('f-avalia'),
            dominio_principal: dominio,
            faixas_aplicaveis: faixas,
            faixa_etaria_min_meses: idMin,
            faixa_etaria_max_meses: idMax,
            faixa_etaria_label: val('f-idlabel') || null,
            tipo_respondente: val('f-respondente'),
            sexo_filtro: val('f-sexo') || null,
            tipo_aplicacao: val('f-tipoapl'),
            permite_aplicacao_online: val('f-online') === 'true',
            permite_correcao_sistema: val('f-correcao') === 'true',
            ativo: val('f-ativo') === 'true',
            autores: val('f-autores') || null,
            editora: val('f-editora') || null,
            versao: val('f-versao') || null,
            descricao_longa: val('f-desclonga') || null,
            updated_at: new Date().toISOString()
        };

        try {
            let novoId = id;
            if (id) {
                const { error } = await c().from('instrumentos_catalogo').update(row).eq('id', id);
                if (error) throw error;
                toast('Teste atualizado.', 'success');
            } else {
                const { data, error } = await c().from('instrumentos_catalogo').insert(row).select('id').single();
                if (error) throw error;
                novoId = data.id;
                toast('Teste cadastrado. Agora crie a versão da norma.', 'success');
            }

            await carregarInstrumentos();
            renderEstrutura();
            el('sel-instrumento').value = novoId;
            state.instrumentoId = novoId;
            el('btn-editar-instr').disabled = false;
            await carregarNormas();
        } catch (err) {
            console.error(err);
            const dup = String(err.message || '').includes('duplicate');
            toast(dup ? 'Já existe um teste com essa sigla.' : 'Erro ao salvar: ' + (err.message || err), 'danger');
        }
    }

    // ════════════════════════════════════════════════════════════════════════
    // ABAS
    // ════════════════════════════════════════════════════════════════════════

    const ABAS = [
        { id: 'norma',   n: 1, label: 'Norma' },
        { id: 'fatores', n: 2, label: 'Escalas' },
        { id: 'itens',   n: 3, label: 'Itens' },
        { id: 'mapa',    n: 4, label: 'Itens × escalas' },
        { id: 'lookup',  n: 5, label: 'Tabela normativa' },
        { id: 'faixas',  n: 6, label: 'Faixas de corte' },
        { id: 'revisao', n: 7, label: 'Revisão' }
    ];

    function abaCompleta(id) {
        switch (id) {
            case 'norma':   return !!state.norma;
            case 'fatores': return state.fatores.length > 0;
            case 'itens':   return state.itens.length > 0;
            case 'mapa':    return state.itens.length > 0 &&
                                   state.itens.every(i => i.fator_id ||
                                       state.vinculos.some(v => v.item_id === i.id));
            case 'lookup':  return state.lookupTotal > 0;
            case 'faixas':  return state.classificacoes.length > 0;
            default:        return false;
        }
    }

    function renderAbas() {
        const travado = !state.norma;
        el('ia-corpo').innerHTML = `
            <div class="ia-abas">
                ${ABAS.map(a => `
                    <button class="ia-aba ${state.aba === a.id ? 'ativa' : ''} ${abaCompleta(a.id) ? 'ok' : ''}"
                            data-aba="${a.id}" ${travado && a.id !== 'norma' ? 'disabled' : ''}>
                        <span class="ia-aba-num">${abaCompleta(a.id) ? '✓' : a.n}</span>
                        ${esc(a.label)}
                    </button>`).join('')}
            </div>
            <div id="ia-painel"></div>`;

        el('ia-corpo').querySelectorAll('.ia-aba').forEach(b => {
            b.addEventListener('click', () => {
                if (b.disabled) return;
                state.aba = b.dataset.aba;
                renderAbas();
            });
        });

        const p = el('ia-painel');
        if (state.aba === 'norma')   painelNorma(p);
        if (state.aba === 'fatores') painelFatores(p);
        if (state.aba === 'itens')   painelItens(p);
        if (state.aba === 'mapa')    painelMapa(p);
        if (state.aba === 'lookup')  painelLookup(p);
        if (state.aba === 'faixas')  painelFaixas(p);
        if (state.aba === 'revisao') painelRevisao(p);
    }

    // ════════════════════════════════════════════════════════════════════════
    // 1 · NORMA
    // ════════════════════════════════════════════════════════════════════════

    function painelNorma(p) {
        const n = state.norma || {};
        const labels = Array.isArray(n.answer_labels) ? n.answer_labels.join('\n') : '';

        p.innerHTML = `
            <div class="ia-painel ativo">
              <div class="ia-card">
                <h2>Versão da norma</h2>
                <p class="ia-card-sub">
                    Um instrumento pode ter mais de uma norma (edições, amostras diferentes).
                    Tudo o mais — escalas, itens, tabela — fica pendurado nesta versão.
                </p>

                <div class="ia-grid">
                    <div class="ia-campo">
                        <label>Código da versão *</label>
                        <input id="n-codigo" value="${esc(n.versao_codigo || '')}" placeholder="ex.: br2013">
                        <span class="ia-campo-dica">Curto, sem espaço. Identifica a versão internamente.</span>
                    </div>
                    <div class="ia-campo">
                        <label>Nome da versão *</label>
                        <input id="n-label" value="${esc(n.versao_label || '')}" placeholder="ex.: Versão brasileira">
                    </div>
                    <div class="ia-campo">
                        <label>Número de itens *</label>
                        <input id="n-numitens" type="number" min="1" value="${n.num_itens ?? ''}">
                        <span class="ia-campo-dica">Usado para conferir se você colou todos.</span>
                    </div>
                    <div class="ia-campo">
                        <label>Valor mínimo da resposta *</label>
                        <input id="n-escmin" type="number" value="${n.escala_min ?? 0}">
                        <span class="ia-campo-dica">Numa Likert 0–2, é 0.</span>
                    </div>
                    <div class="ia-campo">
                        <label>Valor máximo da resposta *</label>
                        <input id="n-escmax" type="number" value="${n.escala_max ?? 2}">
                    </div>
                    <div class="ia-campo">
                        <label>Escore máximo possível</label>
                        <input id="n-scoremax" type="number" value="${n.score_max ?? ''}">
                        <span class="ia-campo-dica">Opcional. Deixe vazio se variar por escala.</span>
                    </div>
                    <div class="ia-campo">
                        <label>Tipo de classificação *</label>
                        <select id="n-tipoclass">
                            <option value="percentilica" ${n.tipo_classificacao === 'percentilica' ? 'selected' : ''}>Percentílica (T e/ou percentil)</option>
                            <option value="faixas"       ${n.tipo_classificacao === 'faixas' ? 'selected' : ''}>Faixas (bruto cai numa faixa)</option>
                            <option value="binario"      ${n.tipo_classificacao === 'binario' ? 'selected' : ''}>Binário (corte único)</option>
                        </select>
                    </div>
                    <div class="ia-campo">
                        <label>Estratificação por idade *</label>
                        <select id="n-estrato">
                            <option value="sem_estratificacao"  ${n.estrato_idade === 'sem_estratificacao' ? 'selected' : ''}>Sem estratificação</option>
                            <option value="anos"                ${n.estrato_idade === 'anos' ? 'selected' : ''}>Por anos</option>
                            <option value="meses"               ${n.estrato_idade === 'meses' ? 'selected' : ''}>Por meses</option>
                            <option value="faixa_etaria_texto"  ${n.estrato_idade === 'faixa_etaria_texto' ? 'selected' : ''}>Faixa em texto</option>
                        </select>
                    </div>
                    <div class="ia-campo">
                        <label>Estratificada por sexo *</label>
                        <select id="n-sexo">
                            <option value="false" ${!n.estratificada_por_sexo ? 'selected' : ''}>Não</option>
                            <option value="true"  ${n.estratificada_por_sexo ? 'selected' : ''}>Sim</option>
                        </select>
                    </div>
                    <div class="ia-campo ia-full">
                        <label>Rótulos das respostas *</label>
                        <textarea id="n-labels" placeholder="Um por linha, do menor valor para o maior.&#10;Ex. numa escala 0–2:&#10;Não é verdadeiro&#10;Às vezes verdadeiro&#10;Frequentemente verdadeiro">${esc(labels)}</textarea>
                        <span class="ia-campo-dica">
                            Um por linha. A quantidade precisa bater com o intervalo mínimo–máximo acima.
                            É o que aparece como opção de resposta para quem responde.
                        </span>
                    </div>
                    <div class="ia-campo">
                        <label>Autores</label>
                        <input id="n-autores" value="${esc(n.autores || '')}">
                    </div>
                    <div class="ia-campo">
                        <label>Ano de publicação</label>
                        <input id="n-ano" type="number" value="${n.ano_publicacao ?? ''}">
                    </div>
                    <div class="ia-campo ia-full">
                        <label>Referência</label>
                        <input id="n-ref" value="${esc(n.referencia || '')}" placeholder="Citação da fonte normativa">
                    </div>
                    <div class="ia-campo ia-full">
                        <label>Descrição</label>
                        <input id="n-desc" value="${esc(n.descricao || '')}">
                    </div>
                </div>

                <div class="ia-acoes">
                    <button class="ia-btn ia-btn-primario" id="btn-salvar-norma">
                        ${state.norma ? 'Salvar alterações' : 'Criar versão'}
                    </button>
                </div>
              </div>
            </div>`;

        el('btn-salvar-norma').addEventListener('click', salvarNorma);
    }

    async function salvarNorma() {
        const escMin = num('n-escmin');
        const escMax = num('n-escmax');
        const labels = val('n-labels').split('\n').map(s => s.trim()).filter(Boolean);

        if (!val('n-codigo') || !val('n-label')) { toast('Código e nome da versão são obrigatórios.', 'danger'); return; }
        if (escMin === null || escMax === null || escMax <= escMin) {
            toast('Valor máximo precisa ser maior que o mínimo.', 'danger'); return;
        }
        const esperado = escMax - escMin + 1;
        if (labels.length !== esperado) {
            toast(`A escala vai de ${escMin} a ${escMax}, então são ${esperado} rótulos — você colou ${labels.length}.`, 'danger');
            return;
        }
        if (!num('n-numitens')) { toast('Informe o número de itens.', 'danger'); return; }

        const payload = {
            instrumento_id: state.instrumentoId,
            versao_codigo: val('n-codigo'),
            versao_label: val('n-label'),
            descricao: val('n-desc') || null,
            num_itens: num('n-numitens'),
            escala_min: escMin,
            escala_max: escMax,
            score_max: num('n-scoremax'),
            tipo_classificacao: val('n-tipoclass'),
            estrato_idade: val('n-estrato'),
            estratificada_por_sexo: val('n-sexo') === 'true',
            answer_labels: labels,
            referencia: val('n-ref') || null,
            autores: val('n-autores') || null,
            ano_publicacao: num('n-ano'),
            fonte_importacao: 'cadastro_manual',
            ativa: true
        };

        try {
            let id = state.normaId;
            if (id) {
                const { error } = await c().from('instrumentos_normas').update(payload).eq('id', id);
                if (error) throw error;
                toast('Versão atualizada.', 'success');
            } else {
                const { data, error } = await c().from('instrumentos_normas').insert(payload).select('id').single();
                if (error) throw error;
                id = data.id;
                toast('Versão criada. Agora declare as escalas.', 'success');
            }
            await carregarNormas();
            el('sel-norma').value = id;
            state.normaId = id;
            await carregarTudo();
            if (!state.fatores.length) { state.aba = 'fatores'; renderAbas(); }
        } catch (err) {
            console.error(err);
            toast('Erro ao salvar: ' + (err.message || err), 'danger');
        }
    }

    // ════════════════════════════════════════════════════════════════════════
    // 2 · FATORES (escalas)
    // ════════════════════════════════════════════════════════════════════════

    function painelFatores(p) {
        p.innerHTML = `
            <div class="ia-painel ativo">
              <div class="ia-card">
                <h2>Escalas do instrumento</h2>
                <p class="ia-card-sub">
                    Uma linha por escala que o instrumento calcula. O <strong>código</strong> é curto e sem
                    espaço — é ele que você vai usar na planilha da tabela normativa.
                    Marque <strong>Total</strong> nas escalas que somam outras (escore total, índices).
                </p>

                <div class="ia-tabela-wrap">
                  <table class="ia-tabela">
                    <thead><tr>
                        <th style="width:60px">Ordem</th>
                        <th style="width:130px">Código *</th>
                        <th>Nome da escala *</th>
                        <th style="width:90px">Mín</th>
                        <th style="width:90px">Máx</th>
                        <th style="width:90px">Corte</th>
                        <th style="width:70px">Cor</th>
                        <th style="width:60px">Total</th>
                        <th style="width:44px"></th>
                    </tr></thead>
                    <tbody id="tb-fatores"></tbody>
                  </table>
                </div>

                <div class="ia-acoes">
                    <button class="ia-btn ia-btn-secundario" id="btn-add-fator">+ Adicionar escala</button>
                    <button class="ia-btn ia-btn-primario" id="btn-salvar-fatores">Salvar escalas</button>
                </div>
              </div>
            </div>`;

        renderLinhasFatores();
        el('btn-add-fator').addEventListener('click', () => {
            state.fatores.push({ id: null, fator_codigo: '', fator_label: '',
                ordem: state.fatores.length + 1, min_score: null, max_score: null,
                cutoff: null, cor_hex: '#2F6FED', eh_total: false });
            renderLinhasFatores();
        });
        el('btn-salvar-fatores').addEventListener('click', salvarFatores);
    }

    function renderLinhasFatores() {
        const tb = el('tb-fatores');
        if (!state.fatores.length) {
            tb.innerHTML = `<tr><td colspan="9">
                <div class="ia-vazio"><strong>Nenhuma escala ainda</strong>
                Clique em “Adicionar escala” para começar.</div></td></tr>`;
            return;
        }
        tb.innerHTML = state.fatores.map((f, i) => `
            <tr>
                <td><input type="number" data-f="${i}" data-k="ordem" value="${f.ordem ?? i + 1}"></td>
                <td><input data-f="${i}" data-k="fator_codigo" value="${esc(f.fator_codigo || '')}" placeholder="ex.: ansdep"></td>
                <td><input data-f="${i}" data-k="fator_label" value="${esc(f.fator_label || '')}" placeholder="nome que aparece no laudo"></td>
                <td><input type="number" data-f="${i}" data-k="min_score" value="${f.min_score ?? ''}"></td>
                <td><input type="number" data-f="${i}" data-k="max_score" value="${f.max_score ?? ''}"></td>
                <td><input type="number" data-f="${i}" data-k="cutoff" value="${f.cutoff ?? ''}"></td>
                <td><input type="color" data-f="${i}" data-k="cor_hex" value="${esc(f.cor_hex || '#2F6FED')}"></td>
                <td style="text-align:center"><input type="checkbox" data-f="${i}" data-k="eh_total" ${f.eh_total ? 'checked' : ''}></td>
                <td><button class="ia-lixo" data-del-f="${i}" title="Remover">🗑</button></td>
            </tr>`).join('');

        tb.querySelectorAll('[data-f]').forEach(inp => {
            inp.addEventListener('change', (e) => {
                const i = Number(e.target.dataset.f), k = e.target.dataset.k;
                let v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
                if (['ordem','min_score','max_score','cutoff'].includes(k)) v = v === '' ? null : Number(v);
                state.fatores[i][k] = v;
            });
        });

        tb.querySelectorAll('[data-del-f]').forEach(b => {
            b.addEventListener('click', async (e) => {
                const i = Number(e.currentTarget.dataset.delF);
                const f = state.fatores[i];
                if (f.id && !confirm(`Remover a escala "${f.fator_label}"? Isso apaga também os itens ligados só a ela, a tabela normativa e as faixas dessa escala.`)) return;
                if (f.id) {
                    const { error } = await c().from('instrumentos_fatores').delete().eq('id', f.id);
                    if (error) { toast('Erro ao remover: ' + error.message, 'danger'); return; }
                }
                state.fatores.splice(i, 1);
                renderLinhasFatores();
            });
        });
    }

    async function salvarFatores() {
        for (const f of state.fatores) {
            if (!f.fator_codigo || !f.fator_label) { toast('Toda escala precisa de código e nome.', 'danger'); return; }
        }
        const codigos = state.fatores.map(f => f.fator_codigo.trim().toLowerCase());
        if (new Set(codigos).size !== codigos.length) { toast('Há códigos de escala repetidos.', 'danger'); return; }

        try {
            for (const f of state.fatores) {
                const row = {
                    norma_id: state.normaId,
                    fator_codigo: f.fator_codigo.trim(),
                    fator_label: f.fator_label.trim(),
                    ordem: f.ordem ?? 1,
                    min_score: f.min_score,
                    max_score: f.max_score,
                    cutoff: f.cutoff,
                    cor_hex: f.cor_hex || null,
                    eh_total: !!f.eh_total
                };
                if (f.id) {
                    const { error } = await c().from('instrumentos_fatores').update(row).eq('id', f.id);
                    if (error) throw error;
                } else {
                    const { data, error } = await c().from('instrumentos_fatores').insert(row).select('id').single();
                    if (error) throw error;
                    f.id = data.id;
                }
            }
            toast('Escalas salvas.', 'success');
            await carregarTudo();
        } catch (err) {
            console.error(err);
            toast('Erro ao salvar escalas: ' + (err.message || err), 'danger');
        }
    }

    // ════════════════════════════════════════════════════════════════════════
    // 3 · ITENS
    // ════════════════════════════════════════════════════════════════════════

    function painelItens(p) {
        p.innerHTML = `
            <div class="ia-painel ativo">
              <div class="ia-card">
                <h2>Itens</h2>
                <p class="ia-card-sub">
                    Cole os itens do manual, <strong>um por linha</strong>. A numeração pode vir junto
                    (“1. Texto”, “1) Texto”, “1 - Texto”) ou não — se não vier, numero na ordem em que aparecem.
                    Para marcar um item de pontuação invertida, comece a linha com <strong>R:</strong>
                </p>

                <div class="ia-campo">
                    <label for="itens-texto">Colar itens</label>
                    <textarea id="itens-texto" style="min-height:200px" placeholder="1. Primeiro item&#10;2. Segundo item&#10;R: 3. Terceiro item, pontuação invertida"></textarea>
                </div>

                <div class="ia-acoes">
                    <button class="ia-btn ia-btn-secundario" id="btn-preview-itens">Conferir antes de salvar</button>
                    <button class="ia-btn ia-btn-primario" id="btn-salvar-itens" disabled>Salvar itens</button>
                    ${state.itens.length ? `<button class="ia-btn ia-btn-perigo" id="btn-limpar-itens">Apagar os ${state.itens.length} itens atuais</button>` : ''}
                </div>

                <div id="itens-preview" style="margin-top:16px"></div>
              </div>

              ${state.itens.length ? `
              <div class="ia-card">
                <h2>Itens já cadastrados (${state.itens.length})</h2>
                <div class="ia-preview">
                    ${state.itens.map(i => `
                        <div class="ia-preview-item">
                            <span class="ia-preview-num">${i.numero}</span>
                            <span>${esc(i.texto)}</span>
                            ${i.reverso ? '<span class="ia-tag-rev">invertido</span>' : ''}
                        </div>`).join('')}
                </div>
              </div>` : ''}
            </div>`;

        let parsed = [];

        el('btn-preview-itens').addEventListener('click', () => {
            parsed = parsearItens(val('itens-texto'));
            const alvo = el('itens-preview');
            if (!parsed.length) {
                alvo.innerHTML = `<div class="ia-aviso alerta"><span class="ia-aviso-ic">⚠️</span>
                    <div>Não encontrei nenhum item no texto colado.</div></div>`;
                el('btn-salvar-itens').disabled = true;
                return;
            }
            const esperado = state.norma.num_itens;
            const bate = parsed.length === esperado;
            alvo.innerHTML = `
                <div class="ia-aviso ${bate ? 'ok' : 'alerta'}">
                    <span class="ia-aviso-ic">${bate ? '✓' : '⚠️'}</span>
                    <div>Encontrei <strong>${parsed.length}</strong> itens.
                    ${bate ? 'Bate com o número declarado na norma.'
                           : `A norma declara <strong>${esperado}</strong>. Confira antes de salvar.`}</div>
                </div>
                <div class="ia-preview">
                    ${parsed.map(i => `
                        <div class="ia-preview-item">
                            <span class="ia-preview-num">${i.numero}</span>
                            <span>${esc(i.texto)}</span>
                            ${i.reverso ? '<span class="ia-tag-rev">invertido</span>' : ''}
                        </div>`).join('')}
                </div>`;
            el('btn-salvar-itens').disabled = false;
        });

        el('btn-salvar-itens').addEventListener('click', async () => {
            if (!parsed.length) return;
            if (state.itens.length && !confirm(`Já existem ${state.itens.length} itens nesta norma. Eles serão substituídos. Continuar?`)) return;
            try {
                if (state.itens.length) {
                    const { error } = await c().from('instrumentos_itens').delete().eq('norma_id', state.normaId);
                    if (error) throw error;
                }
                const linhas = parsed.map(i => ({
                    norma_id: state.normaId,
                    fator_id: null,
                    numero: i.numero,
                    texto: i.texto,
                    reverso: i.reverso,
                    opcoes: null
                }));
                for (let k = 0; k < linhas.length; k += LOTE) {
                    const { error } = await c().from('instrumentos_itens').insert(linhas.slice(k, k + LOTE));
                    if (error) throw error;
                }
                toast(`${linhas.length} itens salvos.`, 'success');
                await carregarTudo();
                state.aba = 'mapa';
                renderAbas();
            } catch (err) {
                console.error(err);
                toast('Erro ao salvar itens: ' + (err.message || err), 'danger');
            }
        });

        const btnLimpar = el('btn-limpar-itens');
        if (btnLimpar) {
            btnLimpar.addEventListener('click', async () => {
                if (!confirm('Apagar todos os itens desta norma?')) return;
                const { error } = await c().from('instrumentos_itens').delete().eq('norma_id', state.normaId);
                if (error) { toast('Erro: ' + error.message, 'danger'); return; }
                toast('Itens apagados.', 'success');
                await carregarTudo();
            });
        }
    }

    function parsearItens(texto) {
        const linhas = (texto || '').split('\n').map(l => l.trim()).filter(Boolean);
        const out = [];
        let auto = 0;
        for (let linha of linhas) {
            let reverso = false;
            const mRev = linha.match(/^R\s*:\s*/i);
            if (mRev) { reverso = true; linha = linha.slice(mRev[0].length).trim(); }

            let numero = null;
            const mNum = linha.match(/^(\d{1,3})\s*[.)\-–]\s*(.+)$/);
            if (mNum) { numero = Number(mNum[1]); linha = mNum[2].trim(); }

            if (!linha) continue;
            auto += 1;
            out.push({ numero: numero !== null ? numero : auto, texto: linha, reverso });
        }
        return out;
    }

    // ════════════════════════════════════════════════════════════════════════
    // 4 · MAPA ITEM × ESCALA
    // ════════════════════════════════════════════════════════════════════════

    function painelMapa(p) {
        if (!state.fatores.length || !state.itens.length) {
            p.innerHTML = `<div class="ia-painel ativo"><div class="ia-vazio">
                <strong>Faltam escalas ou itens</strong>
                Preencha as abas Escalas e Itens antes desta.</div></div>`;
            return;
        }

        const porFator = {};
        state.fatores.forEach(f => {
            const nums = state.itens
                .filter(i => i.fator_id === f.id || state.vinculos.some(v => v.item_id === i.id && v.fator_id === f.id))
                .map(i => i.numero)
                .sort((a, b) => a - b);
            porFator[f.id] = comprimirNumeros(nums);
        });

        p.innerHTML = `
            <div class="ia-painel ativo">
              <div class="ia-card">
                <h2>Quais itens somam em cada escala</h2>
                <p class="ia-card-sub">
                    Para cada escala, escreva os números dos itens. Aceita intervalo e vírgula:
                    <strong>1, 4, 7-12, 20</strong>. Um mesmo item pode entrar em mais de uma escala —
                    é o caso das escalas orientadas por critério diagnóstico, que reaproveitam itens.
                </p>

                <div class="ia-grid-2">
                    ${state.fatores.map(f => `
                        <div class="ia-campo">
                            <label>
                                <span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${esc(f.cor_hex || '#2F6FED')};margin-right:6px"></span>
                                ${esc(f.fator_label)} <span style="opacity:.6">(${esc(f.fator_codigo)})</span>
                            </label>
                            <input data-mapa="${f.id}" value="${esc(porFator[f.id])}" placeholder="ex.: 1, 4, 7-12">
                        </div>`).join('')}
                </div>

                <div class="ia-acoes">
                    <button class="ia-btn ia-btn-primario" id="btn-salvar-mapa">Salvar mapa</button>
                </div>

                <div id="mapa-aviso" style="margin-top:16px"></div>
              </div>
            </div>`;

        el('btn-salvar-mapa').addEventListener('click', salvarMapa);
        avisoCoberturaMapa();
    }

    function avisoCoberturaMapa() {
        const semEscala = state.itens.filter(i =>
            !i.fator_id && !state.vinculos.some(v => v.item_id === i.id));
        const alvo = el('mapa-aviso');
        if (!alvo) return;
        alvo.innerHTML = semEscala.length
            ? `<div class="ia-aviso alerta"><span class="ia-aviso-ic">⚠️</span>
               <div><strong>${semEscala.length} itens não entram em nenhuma escala:</strong>
               ${comprimirNumeros(semEscala.map(i => i.numero))}.
               Isso pode ser proposital (itens de validade, itens abertos), mas confira.</div></div>`
            : `<div class="ia-aviso ok"><span class="ia-aviso-ic">✓</span>
               <div>Todos os itens estão ligados a pelo menos uma escala.</div></div>`;
    }

    async function salvarMapa() {
        const porNumero = {};
        state.itens.forEach(i => { porNumero[i.numero] = i.id; });

        const novos = [];
        let invalido = null;

        el('ia-painel').querySelectorAll('[data-mapa]').forEach(inp => {
            const fatorId = inp.dataset.mapa;
            const nums = expandirNumeros(inp.value);
            nums.forEach(n => {
                if (!porNumero[n]) { invalido = invalido || n; return; }
                novos.push({ item_id: porNumero[n], fator_id: fatorId, peso: 1 });
            });
        });

        if (invalido !== null) {
            toast(`O item ${invalido} não existe nesta norma. Corrija antes de salvar.`, 'danger');
            return;
        }

        try {
            const idsItens = state.itens.map(i => i.id);
            const { error: errDel } = await c()
                .from('instrumentos_itens_fatores').delete().in('item_id', idsItens);
            if (errDel) throw errDel;

            for (let k = 0; k < novos.length; k += LOTE) {
                const { error } = await c().from('instrumentos_itens_fatores').insert(novos.slice(k, k + LOTE));
                if (error) throw error;
            }
            toast(`Mapa salvo: ${novos.length} ligações.`, 'success');
            await carregarTudo();
        } catch (err) {
            console.error(err);
            toast('Erro ao salvar mapa: ' + (err.message || err), 'danger');
        }
    }

    function expandirNumeros(txt) {
        const out = new Set();
        (txt || '').split(',').forEach(parte => {
            parte = parte.trim();
            if (!parte) return;
            const m = parte.match(/^(\d+)\s*[-–]\s*(\d+)$/);
            if (m) {
                const a = Number(m[1]), b = Number(m[2]);
                for (let v = Math.min(a, b); v <= Math.max(a, b); v++) out.add(v);
            } else if (/^\d+$/.test(parte)) {
                out.add(Number(parte));
            }
        });
        return [...out].sort((a, b) => a - b);
    }

    function comprimirNumeros(nums) {
        if (!nums || !nums.length) return '';
        const s = [...nums].sort((a, b) => a - b);
        const partes = [];
        let ini = s[0], ant = s[0];
        for (let k = 1; k <= s.length; k++) {
            const atual = s[k];
            if (atual === ant + 1) { ant = atual; continue; }
            partes.push(ini === ant ? String(ini) : `${ini}-${ant}`);
            ini = atual; ant = atual;
        }
        return partes.join(', ');
    }

    // ════════════════════════════════════════════════════════════════════════
    // 5 · TABELA NORMATIVA (lookup)
    // ════════════════════════════════════════════════════════════════════════

    function painelLookup(p) {
        if (!state.fatores.length) {
            p.innerHTML = `<div class="ia-painel ativo"><div class="ia-vazio">
                <strong>Declare as escalas primeiro</strong>
                A tabela normativa aponta para elas pelo código.</div></div>`;
            return;
        }

        p.innerHTML = `
            <div class="ia-painel ativo">
              <div class="ia-card">
                <h2>Tabela normativa</h2>
                <p class="ia-card-sub">
                    É a tabela de conversão do manual: para cada escore bruto, qual T e qual percentil.
                    Cole como planilha (copiar do Excel funciona) ou CSV, <strong>com esta primeira linha</strong>:
                </p>

                <div class="ia-aviso info">
                    <span class="ia-aviso-ic">📋</span>
                    <div>
                        <code>escala;sexo;idade_min;idade_max;bruto;t;percentil</code><br>
                        <span style="opacity:.85">
                        <strong>escala</strong>: o código que você definiu na aba Escalas.<br>
                        <strong>sexo</strong>: M, F ou vazio (vale para ambos).<br>
                        <strong>idade_min / idade_max</strong>: em anos, ou vazio (vale para todas).<br>
                        <strong>t</strong> e <strong>percentil</strong>: pelo menos um dos dois preenchido.<br>
                        Separador pode ser <strong>;</strong>, <strong>vírgula</strong> ou <strong>tabulação</strong>.
                        </span>
                    </div>
                </div>

                <div class="ia-contadores">
                    <div class="ia-contador">
                        <div class="ia-contador-num">${state.lookupTotal}</div>
                        <div class="ia-contador-lbl">linhas cadastradas</div>
                    </div>
                    <div class="ia-contador">
                        <div class="ia-contador-num">${state.fatores.length}</div>
                        <div class="ia-contador-lbl">escalas</div>
                    </div>
                </div>

                <div class="ia-campo">
                    <label for="lk-texto">Colar tabela</label>
                    <textarea id="lk-texto" style="min-height:200px" placeholder="escala;sexo;idade_min;idade_max;bruto;t;percentil"></textarea>
                </div>

                <div class="ia-acoes">
                    <button class="ia-btn ia-btn-secundario" id="btn-validar-lk">Validar</button>
                    <button class="ia-btn ia-btn-primario" id="btn-salvar-lk" disabled>Enviar tabela</button>
                    ${state.lookupTotal ? `<button class="ia-btn ia-btn-perigo" id="btn-limpar-lk">Apagar tabela atual</button>` : ''}
                </div>

                <div id="lk-resultado" style="margin-top:16px"></div>
              </div>
            </div>`;

        let linhasOk = [];

        el('btn-validar-lk').addEventListener('click', () => {
            const r = parsearLookup(val('lk-texto'));
            linhasOk = r.linhas;
            el('lk-resultado').innerHTML = r.html;
            el('btn-salvar-lk').disabled = r.erros.length > 0 || !r.linhas.length;
        });

        el('btn-salvar-lk').addEventListener('click', async () => {
            if (!linhasOk.length) return;
            if (state.lookupTotal && !confirm(`Já existem ${state.lookupTotal} linhas. Elas serão substituídas. Continuar?`)) return;
            try {
                if (state.lookupTotal) {
                    const { error } = await c().from('instrumentos_normas_lookup').delete().eq('norma_id', state.normaId);
                    if (error) throw error;
                }
                for (let k = 0; k < linhasOk.length; k += LOTE) {
                    const { error } = await c().from('instrumentos_normas_lookup').insert(linhasOk.slice(k, k + LOTE));
                    if (error) throw error;
                }
                toast(`${linhasOk.length} linhas enviadas.`, 'success');
                await carregarTudo();
            } catch (err) {
                console.error(err);
                toast('Erro ao enviar: ' + (err.message || err), 'danger');
            }
        });

        const btnLimparLk = el('btn-limpar-lk');
        if (btnLimparLk) {
            btnLimparLk.addEventListener('click', async () => {
                if (!confirm('Apagar toda a tabela normativa desta norma?')) return;
                const { error } = await c().from('instrumentos_normas_lookup').delete().eq('norma_id', state.normaId);
                if (error) { toast('Erro: ' + error.message, 'danger'); return; }
                toast('Tabela apagada.', 'success');
                await carregarTudo();
            });
        }
    }

    function parsearLookup(texto) {
        const porCodigo = {};
        state.fatores.forEach(f => { porCodigo[f.fator_codigo.trim().toLowerCase()] = f.id; });

        const cruas = (texto || '').split('\n').map(l => l.trim()).filter(Boolean);
        if (!cruas.length) {
            return { linhas: [], erros: ['vazio'],
                html: `<div class="ia-aviso alerta"><span class="ia-aviso-ic">⚠️</span><div>Nada colado.</div></div>` };
        }

        const sep = detectarSeparador(cruas[0]);
        let inicio = 0;
        if (/escala/i.test(cruas[0]) && /bruto/i.test(cruas[0])) inicio = 1;

        const linhas = [];
        const erros = [];
        const escalasVistas = new Set();

        for (let k = inicio; k < cruas.length; k++) {
            const campos = cruas[k].split(sep).map(s => s.trim());
            const nLinha = k + 1;

            if (campos.length < 5) { erros.push(`Linha ${nLinha}: esperava 7 colunas, achei ${campos.length}.`); continue; }

            const [codigo, sexo, idMin, idMax, bruto, t, perc] = campos;
            const fatorId = porCodigo[(codigo || '').toLowerCase()];

            if (!fatorId) { erros.push(`Linha ${nLinha}: escala "${codigo}" não existe. Códigos válidos: ${Object.keys(porCodigo).join(', ')}.`); continue; }
            if (bruto === '' || isNaN(Number(bruto))) { erros.push(`Linha ${nLinha}: bruto inválido ("${bruto}").`); continue; }
            if ((t === '' || t === undefined) && (perc === '' || perc === undefined)) {
                erros.push(`Linha ${nLinha}: precisa de T ou percentil.`); continue;
            }
            const sexoNorm = (sexo || '').toUpperCase();
            if (sexoNorm && !['M','F'].includes(sexoNorm)) { erros.push(`Linha ${nLinha}: sexo "${sexo}" — use M, F ou vazio.`); continue; }

            escalasVistas.add(codigo.toLowerCase());
            linhas.push({
                norma_id: state.normaId,
                fator_id: fatorId,
                sexo: sexoNorm || null,
                idade_min_anos: idMin === '' || idMin === undefined ? null : Number(idMin),
                idade_max_anos: idMax === '' || idMax === undefined ? null : Number(idMax),
                escore_bruto: Number(bruto),
                escore_t: (t === '' || t === undefined) ? null : Number(t),
                percentil: (perc === '' || perc === undefined) ? null : Number(String(perc).replace(',', '.'))
            });

            if (erros.length > 40) { erros.push('… (parei de listar)'); break; }
        }

        const semTabela = state.fatores.filter(f => !escalasVistas.has(f.fator_codigo.toLowerCase()));

        let html = '';
        if (erros.length) {
            html += `<div class="ia-aviso erro"><span class="ia-aviso-ic">⚠️</span>
                <div><strong>${erros.length} problemas — nada foi enviado:</strong>
                <ul style="margin:8px 0 0 18px">${erros.slice(0, 20).map(e => `<li>${esc(e)}</li>`).join('')}</ul></div></div>`;
        } else {
            html += `<div class="ia-aviso ok"><span class="ia-aviso-ic">✓</span>
                <div><strong>${linhas.length} linhas válidas</strong>, cobrindo ${escalasVistas.size} escala(s).</div></div>`;
        }
        if (semTabela.length) {
            html += `<div class="ia-aviso alerta"><span class="ia-aviso-ic">ℹ️</span>
                <div>Sem linha nenhuma nesta tabela:
                <strong>${semTabela.map(f => esc(f.fator_label)).join(', ')}</strong>.
                Se elas usam outra tabela, envie depois — o envio substitui tudo.</div></div>`;
        }
        return { linhas, erros, html };
    }

    function detectarSeparador(linha) {
        if (linha.includes('\t')) return '\t';
        if (linha.includes(';')) return ';';
        return ',';
    }

    // ════════════════════════════════════════════════════════════════════════
    // 6 · FAIXAS DE CORTE
    // ════════════════════════════════════════════════════════════════════════

    function painelFaixas(p) {
        p.innerHTML = `
            <div class="ia-painel ativo">
              <div class="ia-card">
                <h2>Faixas de classificação</h2>
                <p class="ia-card-sub">
                    Onde começa e termina cada rótulo. <strong>Base</strong> diz sobre qual número a faixa
                    incide: o escore T convertido ou o bruto. Deixe <strong>escala</strong> em “todas” quando
                    o mesmo corte vale para o instrumento inteiro.
                </p>

                <div class="ia-tabela-wrap">
                  <table class="ia-tabela">
                    <thead><tr>
                        <th style="width:60px">Ordem</th>
                        <th style="width:170px">Escala</th>
                        <th style="width:110px">Base</th>
                        <th style="width:90px">De</th>
                        <th style="width:90px">Até</th>
                        <th>Rótulo *</th>
                        <th style="width:70px">Cor</th>
                        <th style="width:44px"></th>
                    </tr></thead>
                    <tbody id="tb-faixas"></tbody>
                  </table>
                </div>

                <div class="ia-acoes">
                    <button class="ia-btn ia-btn-secundario" id="btn-add-faixa">+ Adicionar faixa</button>
                    <button class="ia-btn ia-btn-primario" id="btn-salvar-faixas">Salvar faixas</button>
                </div>
              </div>
            </div>`;

        renderLinhasFaixas();
        el('btn-add-faixa').addEventListener('click', () => {
            state.classificacoes.push({ id: null, fator_id: null, base_valor: 't',
                valor_min: null, valor_max: null, label: '', cor_hex: '#22C55E',
                classe_css: null, ordem: state.classificacoes.length + 1 });
            renderLinhasFaixas();
        });
        el('btn-salvar-faixas').addEventListener('click', salvarFaixas);
    }

    function renderLinhasFaixas() {
        const tb = el('tb-faixas');
        if (!state.classificacoes.length) {
            tb.innerHTML = `<tr><td colspan="8">
                <div class="ia-vazio"><strong>Nenhuma faixa ainda</strong>
                Ex.: T até 64 = “Não clínico”, 65 a 69 = “Limítrofe”, 70 ou mais = “Clínico”.</div></td></tr>`;
            return;
        }
        tb.innerHTML = state.classificacoes.map((cl, i) => `
            <tr>
                <td><input type="number" data-c="${i}" data-k="ordem" value="${cl.ordem ?? i + 1}"></td>
                <td>
                    <select data-c="${i}" data-k="fator_id">
                        <option value="">todas</option>
                        ${state.fatores.map(f => `<option value="${f.id}" ${cl.fator_id === f.id ? 'selected' : ''}>${esc(f.fator_label)}</option>`).join('')}
                    </select>
                </td>
                <td>
                    <select data-c="${i}" data-k="base_valor">
                        <option value="t"   ${cl.base_valor === 't' ? 'selected' : ''}>Escore T</option>
                        <option value="raw" ${cl.base_valor === 'raw' ? 'selected' : ''}>Bruto</option>
                    </select>
                </td>
                <td><input type="number" data-c="${i}" data-k="valor_min" value="${cl.valor_min ?? ''}"></td>
                <td><input type="number" data-c="${i}" data-k="valor_max" value="${cl.valor_max ?? ''}"></td>
                <td><input data-c="${i}" data-k="label" value="${esc(cl.label || '')}" placeholder="ex.: Limítrofe"></td>
                <td><input type="color" data-c="${i}" data-k="cor_hex" value="${esc(cl.cor_hex || '#22C55E')}"></td>
                <td><button class="ia-lixo" data-del-c="${i}" title="Remover">🗑</button></td>
            </tr>`).join('');

        tb.querySelectorAll('[data-c]').forEach(inp => {
            inp.addEventListener('change', (e) => {
                const i = Number(e.target.dataset.c), k = e.target.dataset.k;
                let v = e.target.value;
                if (['ordem','valor_min','valor_max'].includes(k)) v = v === '' ? null : Number(v);
                if (k === 'fator_id') v = v || null;
                state.classificacoes[i][k] = v;
            });
        });

        tb.querySelectorAll('[data-del-c]').forEach(b => {
            b.addEventListener('click', async (e) => {
                const i = Number(e.currentTarget.dataset.delC);
                const cl = state.classificacoes[i];
                if (cl.id) {
                    const { error } = await c().from('instrumentos_classificacoes').delete().eq('id', cl.id);
                    if (error) { toast('Erro ao remover: ' + error.message, 'danger'); return; }
                }
                state.classificacoes.splice(i, 1);
                renderLinhasFaixas();
            });
        });
    }

    async function salvarFaixas() {
        for (const cl of state.classificacoes) {
            if (!cl.label) { toast('Toda faixa precisa de rótulo.', 'danger'); return; }
            if (cl.valor_min === null && cl.valor_max === null) {
                toast(`A faixa "${cl.label}" precisa de pelo menos um limite.`, 'danger'); return;
            }
        }
        try {
            for (const cl of state.classificacoes) {
                const row = {
                    norma_id: state.normaId,
                    fator_id: cl.fator_id || null,
                    valor_min: cl.valor_min,
                    valor_max: cl.valor_max,
                    base_valor: cl.base_valor || 't',
                    label: cl.label.trim(),
                    cor_hex: cl.cor_hex || null,
                    classe_css: cl.classe_css || null,
                    ordem: cl.ordem ?? 1
                };
                if (cl.id) {
                    const { error } = await c().from('instrumentos_classificacoes').update(row).eq('id', cl.id);
                    if (error) throw error;
                } else {
                    const { data, error } = await c().from('instrumentos_classificacoes').insert(row).select('id').single();
                    if (error) throw error;
                    cl.id = data.id;
                }
            }
            toast('Faixas salvas.', 'success');
            await carregarTudo();
        } catch (err) {
            console.error(err);
            toast('Erro ao salvar faixas: ' + (err.message || err), 'danger');
        }
    }

    // ════════════════════════════════════════════════════════════════════════
    // 7 · REVISÃO
    // ════════════════════════════════════════════════════════════════════════

    function painelRevisao(p) {
        const checks = [];
        const add = (nivel, titulo, detalhe) => checks.push({ nivel, titulo, detalhe });

        // Itens vs declarado
        if (state.itens.length === 0) add('erro', 'Nenhum item cadastrado', 'Cole os itens na aba Itens.');
        else if (state.itens.length !== state.norma.num_itens)
            add('alerta', `${state.itens.length} itens cadastrados, ${state.norma.num_itens} declarados`,
                'Ou faltou colar item, ou o número na aba Norma está errado.');
        else add('ok', `${state.itens.length} itens`, 'Bate com o declarado na norma.');

        // Numeração
        const nums = state.itens.map(i => i.numero).sort((a, b) => a - b);
        const dup = nums.filter((v, i) => nums[i - 1] === v);
        if (dup.length) add('erro', 'Numeração repetida', `Itens duplicados: ${[...new Set(dup)].join(', ')}.`);

        // Escalas
        if (!state.fatores.length) add('erro', 'Nenhuma escala', 'Declare as escalas na aba Escalas.');
        else add('ok', `${state.fatores.length} escalas`, state.fatores.map(f => f.fator_label).join(' · '));

        // Cobertura do mapa
        const semEscala = state.itens.filter(i => !i.fator_id && !state.vinculos.some(v => v.item_id === i.id));
        if (state.itens.length) {
            if (semEscala.length) add('alerta', `${semEscala.length} itens fora de qualquer escala`,
                `Números: ${comprimirNumeros(semEscala.map(i => i.numero))}.`);
            else add('ok', 'Todos os itens estão em alguma escala', '');
        }

        // Escalas sem item
        const fatoresVazios = state.fatores.filter(f =>
            !state.itens.some(i => i.fator_id === f.id) &&
            !state.vinculos.some(v => v.fator_id === f.id));
        if (fatoresVazios.length)
            add('erro', `${fatoresVazios.length} escalas sem item nenhum`,
                fatoresVazios.map(f => f.fator_label).join(', ') + ' — não vão pontuar.');

        // Tabela normativa
        if (!state.lookupTotal) add('alerta', 'Tabela normativa vazia',
            'Sem ela o sistema entrega o bruto, mas não converte em T nem percentil.');
        else add('ok', `${state.lookupTotal} linhas na tabela normativa`, '');

        // Faixas
        if (!state.classificacoes.length) add('alerta', 'Nenhuma faixa de corte',
            'O resultado sai sem rótulo de classificação.');
        else add('ok', `${state.classificacoes.length} faixas`, state.classificacoes.map(cl => cl.label).join(' · '));

        const erros = checks.filter(k => k.nivel === 'erro').length;
        const alertas = checks.filter(k => k.nivel === 'alerta').length;

        p.innerHTML = `
            <div class="ia-painel ativo">
              <div class="ia-card">
                <h2>Revisão</h2>
                <p class="ia-card-sub">Confira antes de usar o instrumento com paciente de verdade.</p>

                <div class="ia-aviso ${erros ? 'erro' : (alertas ? 'alerta' : 'ok')}">
                    <span class="ia-aviso-ic">${erros ? '⚠️' : (alertas ? 'ℹ️' : '✓')}</span>
                    <div>${erros
                        ? `<strong>${erros} problemas impedem o funcionamento.</strong>`
                        : (alertas
                            ? `<strong>Funciona, com ${alertas} ressalvas.</strong>`
                            : `<strong>Tudo certo.</strong> O instrumento está pronto.`)}</div>
                </div>

                <div class="ia-checklist">
                    ${checks.map(k => `
                        <div class="ia-check ${k.nivel}">
                            <span class="ia-check-ic">${k.nivel === 'ok' ? '✓' : (k.nivel === 'alerta' ? '!' : '×')}</span>
                            <div class="ia-check-txt">
                                <strong>${esc(k.titulo)}</strong>
                                ${k.detalhe ? `<span>${esc(k.detalhe)}</span>` : ''}
                            </div>
                        </div>`).join('')}
                </div>
              </div>
            </div>`;
    }

})();

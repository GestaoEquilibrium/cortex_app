// ============================================================================
// CORTEX_APP — Módulo Checklist de Instrumentos (Sprint D1)
// ============================================================================
// Reaproveita o array `instrumentos_sugeridos` da tabela `hipoteses` como
// "checklist" do paciente.
//
// Funcionalidades:
// - Filtra automaticamente os instrumentos do catalogo pela idade do paciente
//   (faixa_aplicavel: pre_escolar / escolar / adulto)
// - Agrupa por dominio_principal (categoria)
// - Pré-marca os instrumentos sugeridos das hipóteses (B3)
// - Marca/desmarca livremente (admin)
// - Auto-save 3s
// - Botão "Imprimir PDF" → window.print() com layout A4
// ============================================================================

(function() {
    'use strict';

    const state = {
        pacienteId: null,
        paciente: null,
        hipoteseId: null,
        instrumentosSelecionados: [], // array de UUIDs
        catalogo: [],                  // array de { id, sigla, nome_completo, ... }
        catalogoFiltrado: [],          // só os da faixa do paciente
        agrupado: {},                  // { categoria: [instrumentos] }
        faixaPaciente: null,           // pre_escolar / escolar / adulto (apenas rótulo de exibição)
        verTodos: false,               // toggle só-admin: mostra catálogo completo (fora da faixa)
        hipoteseTexto: '',             // texto livre de hipóteses (hipotese_checklist)
        salvando: false,
        editado: false,
        ehAdmin: false,      // só admin: controla a FAIXA do checklist
        podeEditar: false,   // admin + aplicador: controla a MARCAÇÃO (Sprint 78)
        quemAplica: {},      // sprint_modo: { instrumento_id: 'online' | 'presencial' }
        baterias: [],        // sprint_baterias: modelos de bateria (base + módulos)
        bateriasAbertas: false
    };

    let autoSaveTimeout = null;

    // ============================================================================
    // INICIALIZAÇÃO
    // ============================================================================

    window.addEventListener('cortex:auth-ready', async () => {
        await CortexSidebar.render('pacientes');

        const urlParams = new URLSearchParams(window.location.search);
        state.pacienteId = urlParams.get('paciente');

        if (!state.pacienteId) {
            mostrarErro('Paciente não especificado.');
            return;
        }

        document.getElementById('back-link').href = `../pacientes/pasta.html?id=${state.pacienteId}`;

        // Verifica perfil
        const perfil = window.cortexProfissional?.perfil;
        state.ehAdmin = (perfil === 'admin_clinico' || perfil === 'admin_gestor');
        // Sprint 78: aplicador também pode marcar/desmarcar (faixa continua só admin)
        state.podeEditar = window.CortexPerfil ? window.CortexPerfil.podeUsarChecklist() : state.ehAdmin;

        try {
            await Promise.all([
                carregarPaciente(),
                carregarCatalogo(),
                carregarHipotese(),
                carregarBaterias()
            ]);

            state.faixaPaciente = calcularFaixaAuto();
            filtrarECategorizar();
            renderizar();
        } catch (err) {
            console.error('Erro ao carregar:', err);
            mostrarErro('Erro: ' + (err.message || 'desconhecido'));
        }
    });

    async function carregarPaciente() {
        const { data, error } = await window.cortexClient
            .from('vw_pacientes_lista')
            .select('*')
            .eq('id', state.pacienteId)
            .single();

        if (error || !data) throw new Error('Paciente não encontrado');
        state.paciente = data;
    }

    async function carregarCatalogo() {
        const { data, error } = await window.cortexClient
            .from('instrumentos_catalogo')
            .select('id, sigla, nome_completo, o_que_avalia, descricao_longa, dominio_principal, faixa_etaria_min_meses, faixa_etaria_max_meses, faixa_etaria_label, faixas_aplicaveis, sexo_filtro, tipo_respondente, permite_aplicacao_online, ativo')
            .order('dominio_principal')
            .order('sigla');

        if (error) throw new Error('Erro ao carregar catálogo: ' + error.message);
        // Teste inativado em Instrumentos não aparece mais no checklist
        state.catalogo = (data || []).filter(i => i.ativo !== false);
    }

    async function carregarHipotese() {
        const { data, error } = await window.cortexClient
            .from('hipoteses')
            .select('id, instrumentos_sugeridos, hipotese_checklist, checklist_aplicacao')
            .eq('paciente_id', state.pacienteId)
            .maybeSingle();

        if (error && error.code !== 'PGRST116') {
            console.warn('Erro ao buscar hipótese:', error);
            return;
        }

        if (data) {
            state.hipoteseId = data.id;
            state.instrumentosSelecionados = data.instrumentos_sugeridos || [];
            state.hipoteseTexto = data.hipotese_checklist || '';
            state.quemAplica = (data.checklist_aplicacao && typeof data.checklist_aplicacao === 'object') ? data.checklist_aplicacao : {};
        }
    }

    // ════════════════════════════════════════════════════════════════════════
    // ONLINE × PRESENCIAL (sprint_modo)
    // ════════════════════════════════════════════════════════════════════════
    // Para cada teste marcado, quem está no checklist escolhe se ele será
    // respondido ONLINE (link / portal) ou PRESENCIAL (com a aplicadora).
    // Sem escolha, vale o padrão: online quando o teste permite, senão
    // presencial. Teste que não tem versão online é sempre presencial.
    // A escolha vai para hipoteses.checklist_aplicacao, sai no checklist
    // impresso e vira a modalidade da aplicação quando a bateria sincroniza.
    function modoEfetivo(inst) {
        if (!inst) return 'presencial';
        const escolha = state.quemAplica[inst.id];
        if (!inst.permite_aplicacao_online) return 'presencial';
        if (escolha === 'presencial') return 'presencial';
        return 'online';
    }

    function contarModos(lista) {
        const c = { online: 0, presencial: 0 };
        lista.forEach(i => { c[modoEfetivo(i)]++; });
        return c;
    }

    function renderModo(inst) {
        const modo = modoEfetivo(inst);
        const temOnline = !!inst.permite_aplicacao_online;
        if (!state.podeEditar) {
            return `<div class="checklist-modo"><span class="checklist-modo-tag ${modo}">${modo === 'online' ? '📲 Online' : '🧑‍⚕️ Presencial'}</span></div>`;
        }
        return `
            <div class="checklist-modo" role="radiogroup" aria-label="Como será aplicado">
                <button type="button" class="checklist-modo-btn online ${modo === 'online' ? 'ativo' : ''}" ${temOnline ? '' : 'disabled title="Este teste não tem aplicação online"'}
                        onclick="window.CortexChecklist.definirModo(event, '${inst.id}', 'online')">📲 Online</button>
                <button type="button" class="checklist-modo-btn presencial ${modo === 'presencial' ? 'ativo' : ''}"
                        onclick="window.CortexChecklist.definirModo(event, '${inst.id}', 'presencial')">🧑‍⚕️ Presencial</button>
            </div>`;
    }

    // sprint_baterias: modelos prontos. Falha aqui não pode derrubar o
    // checklist — sem bateria ele funciona como sempre funcionou.
    async function carregarBaterias() {
        try {
            const { data, error } = await window.cortexClient
                .from('baterias_modelo')
                .select('id, nome, descricao, tipo, faixa, ordem, itens:baterias_modelo_itens(instrumento_id)')
                .eq('ativo', true)
                .order('ordem');
            if (error) throw error;
            state.baterias = (data || []).map(m => ({
                ...m, ids: (m.itens || []).map(x => x.instrumento_id)
            }));
        } catch (err) {
            console.warn('[checklist] baterias não carregaram:', err);
            state.baterias = [];
        }
    }

    function calcularFaixaAuto() {
        const idadeAnos = state.paciente.idade_anos;
        if (idadeAnos < 6) return 'pre_escolar';
        if (idadeAnos < 18) return 'escolar';
        return 'adulto';
    }

    // Idade do paciente em MESES (a partir de data_nascimento; fallback idade_anos*12)
    function idadePacienteMeses() {
        const dn = state.paciente.data_nascimento;
        if (dn) {
            const nasc = new Date(String(dn).includes('T') ? dn : dn + 'T00:00:00');
            const hoje = new Date();
            if (!isNaN(nasc)) {
                let meses = (hoje.getFullYear() - nasc.getFullYear()) * 12 + (hoje.getMonth() - nasc.getMonth());
                if (hoje.getDate() < nasc.getDate()) meses--;
                return Math.max(0, meses);
            }
        }
        const a = state.paciente.idade_anos;
        return (typeof a === 'number' ? a : 0) * 12;
    }

    function dentroDaFaixa(i, meses) {
        const min = (i.faixa_etaria_min_meses != null) ? i.faixa_etaria_min_meses : 0;
        const max = (i.faixa_etaria_max_meses != null) ? i.faixa_etaria_max_meses : Infinity;
        return meses >= min && meses <= max;
    }

    function filtrarECategorizar() {
        // Sexo do paciente -> CHAR(1) usado em instrumentos_catalogo.sexo_filtro
        let sexoChar = null;
        if (state.paciente.sexo === 'Masculino') sexoChar = 'M';
        else if (state.paciente.sexo === 'Feminino') sexoChar = 'F';
        // 'Outro'/null -> só instrumentos sem filtro de sexo

        const meses = idadePacienteMeses();

        // Teste inativado sai também da seleção deste paciente
        const ativos = new Set(state.catalogo.map(i => i.id));
        state.instrumentosSelecionados = state.instrumentosSelecionados.filter(id => ativos.has(id));

        state.catalogoFiltrado = state.catalogo.filter(i => {
            // Sexo SEMPRE filtra (mesmo no modo "ver todos")
            const sexoOk = (i.sexo_filtro === null || i.sexo_filtro === undefined) || (i.sexo_filtro === sexoChar);
            if (!sexoOk) return false;

            const naFaixa = dentroDaFaixa(i, meses);
            i._foraDaFaixa = !naFaixa;

            // Admin com "ver todos" ligado: catálogo completo (só sexo filtra)
            if (state.verTodos) return true;
            // Padrão: dentro da faixa OU já selecionado (selecionado sempre aparece, com aviso)
            return naFaixa || state.instrumentosSelecionados.includes(i.id);
        });

        // Agrupa por dominio_principal (categoria)
        state.agrupado = {};
        state.catalogoFiltrado.forEach(inst => {
            const cat = inst.dominio_principal || 'Outros';
            if (!state.agrupado[cat]) state.agrupado[cat] = [];
            state.agrupado[cat].push(inst);
        });
    }


    // ════════════════════════════════════════════════════════════════════════
    // BATERIAS (sprint_baterias)
    // ════════════════════════════════════════════════════════════════════════
    // Aplicar uma bateria SOMA instrumentos à seleção; nunca desmarca o que
    // já estava. Desmarcar é sempre decisão de quem está na tela.
    //
    // O que não se aplica ao paciente (idade ou sexo) é contado e dito em voz
    // alta, em vez de sumir silenciosamente: é assim que a base escolar única
    // serve dos 6 aos 17 anos sem ninguém se perguntar onde foi o Raven.

    function bateriasDaFaixa() {
        const f = state.faixaPaciente;
        return state.baterias.filter(b => b.faixa === f || b.faixa === 'qualquer');
    }

    // Um instrumento entra se estiver no catálogo já filtrado por idade e
    // sexo — a mesma regra que a tela usa para listar.
    function aplicaveisDaBateria(b) {
        const permitidos = new Set(state.catalogoFiltrado.filter(i => !i._foraDaFaixa).map(i => i.id));
        const dentro = b.ids.filter(id => permitidos.has(id));
        return { dentro, fora: b.ids.length - dentro.length };
    }

    function renderBaterias() {
        if (!state.podeEditar) return '';
        const lista = bateriasDaFaixa();
        if (!lista.length) return '';

        const bases = lista.filter(b => b.tipo === 'base');
        const mods  = lista.filter(b => b.tipo === 'modulo');

        const cartao = (b) => {
            const { dentro, fora } = aplicaveisDaBateria(b);
            const jaTem = dentro.length > 0 && dentro.every(id => state.instrumentosSelecionados.includes(id));
            return `
                <label class="bat-op ${jaTem ? 'aplicada' : ''}">
                    <input type="checkbox" class="bat-op-check" value="${b.id}" ${jaTem ? 'checked disabled' : ''}>
                    <span class="bat-op-corpo">
                        <span class="bat-op-nome">${escapeHtml(b.nome.replace(/^(Base|Módulo)\s*—\s*/, ''))}</span>
                        <span class="bat-op-conta">
                            ${dentro.length} instrumento${dentro.length === 1 ? '' : 's'}
                            ${fora ? `<span class="bat-op-fora">· ${fora} fora da idade/sexo</span>` : ''}
                            ${jaTem ? '<span class="bat-op-ok">· já aplicada</span>' : ''}
                        </span>
                        ${b.descricao ? `<span class="bat-op-desc">${escapeHtml(b.descricao)}</span>` : ''}
                    </span>
                </label>`;
        };

        return `
            <div class="bat-painel ${state.bateriasAbertas ? 'aberto' : ''}">
                <button type="button" class="bat-painel-topo" id="bat-toggle">
                    <span class="bat-painel-tit">⚡ Baterias prontas</span>
                    <span class="bat-painel-sub">
                        ${lista.length} para a faixa ${escapeHtml(state.faixaPaciente === 'adulto' ? 'Adulto'
                            : state.faixaPaciente === 'escolar' ? 'Escolar' : 'Pré-escolar')}
                    </span>
                    <span class="bat-painel-seta">${state.bateriasAbertas ? '▴' : '▾'}</span>
                </button>
                ${state.bateriasAbertas ? `
                <div class="bat-painel-corpo">
                    ${bases.length ? `<div class="bat-op-grupo"><div class="bat-op-grupo-tit">Base</div>
                        ${bases.map(cartao).join('')}</div>` : ''}
                    ${mods.length ? `<div class="bat-op-grupo"><div class="bat-op-grupo-tit">Módulos por hipótese</div>
                        ${mods.map(cartao).join('')}</div>` : ''}
                    <div class="bat-painel-acoes">
                        <button type="button" class="btn btn-primary btn-sm" id="bat-aplicar">Aplicar às marcações</button>
                        <span class="bat-painel-nota">Soma à seleção atual. Nada é desmarcado.</span>
                    </div>
                </div>` : ''}
            </div>`;
    }

    function bindBaterias() {
        const t = document.getElementById('bat-toggle');
        if (t) t.addEventListener('click', () => {
            state.bateriasAbertas = !state.bateriasAbertas;
            renderizar();
        });

        const ap = document.getElementById('bat-aplicar');
        if (ap) ap.addEventListener('click', aplicarBateriasMarcadas);
    }

    function aplicarBateriasMarcadas() {
        if (!state.podeEditar) return;

        const escolhidas = [...document.querySelectorAll('.bat-op-check:checked:not([disabled])')]
            .map(cb => state.baterias.find(b => b.id === cb.value))
            .filter(Boolean);

        if (!escolhidas.length) {
            window.CortexUI.toast('Marque ao menos uma bateria.', 'info');
            return;
        }

        let novos = 0, fora = 0;
        escolhidas.forEach(b => {
            const r = aplicaveisDaBateria(b);
            fora += r.fora;
            r.dentro.forEach(id => {
                if (!state.instrumentosSelecionados.includes(id)) {
                    state.instrumentosSelecionados.push(id);
                    novos++;
                }
            });
        });

        marcarEditado();
        filtrarECategorizar();
        renderizar();

        if (window.CortexAudit) {
            window.CortexAudit.log('edicao', 'hipoteses', state.hipoteseId || null, {
                pacienteId: state.pacienteId,
                detalhes: { operacao: 'aplicar_bateria',
                            baterias: escolhidas.map(b => b.nome),
                            incluidos: novos, fora_da_faixa: fora }
            });
        }

        const msg = novos
            ? `${novos} instrumento${novos === 1 ? '' : 's'} incluído${novos === 1 ? '' : 's'}`
                + (fora ? ` · ${fora} fora da idade/sexo do paciente` : '')
            : 'Todos os instrumentos dessas baterias já estavam marcados';
        window.CortexUI.toast(msg, novos ? 'success' : 'info');
    }

    // ============================================================================
    // RENDERIZAÇÃO
    // ============================================================================

    function renderizar() {
        const container = document.getElementById('checklist-conteudo');
        const totalSelecionados = state.instrumentosSelecionados.length;

        const FAIXA_LABEL = {
            pre_escolar: 'Pré-Escolar',
            escolar: 'Escolar',
            adulto: 'Adulto'
        };

        const faixaAtual = state.faixaPaciente;

        // Botão só-admin: aplicar teste fora da faixa (mostra catálogo completo)
        const botaoVerTodos = state.ehAdmin
            ? `<button type="button" class="checklist-vertodos-btn ${state.verTodos ? 'ativo' : ''}" id="checklist-vertodos"
                       title="${state.verTodos ? 'Voltar a mostrar só os testes da faixa etária' : 'Mostrar todos os testes (aplicar fora da faixa etária)'}">
                   ${state.verTodos ? '↩ Mostrar só a faixa etária' : '⚙ Aplicar teste fora da faixa'}
               </button>`
            : '';

        const cabecalho = `
            <div class="anamnese-cabecalho">
                <div class="anamnese-cabecalho-titulo">
                    <h1>Checklist de Instrumentos — ${escapeHtml(state.paciente.nome_completo)}</h1>
                    <p class="anamnese-cabecalho-sub">
                        ${state.paciente.idade_humanizada} ·
                        Faixa: <strong>${FAIXA_LABEL[faixaAtual] || '—'}</strong> ·
                        ${state.catalogoFiltrado.length} instrumentos disponíveis
                        ${botaoVerTodos}
                    </p>
                </div>
                <div class="anamnese-cabecalho-acoes">
                    <span class="badge status-info">${totalSelecionados} selecionados</span>
                    <span class="checklist-modo-resumo" id="checklist-modo-resumo">${resumoModosHtml()}</span>
                    <span id="indicador-save" class="indicador-save"></span>
                </div>
            </div>
        `;

        const caixaHipoteses = `
            <div class="checklist-hipoteses">
                <label class="checklist-hipoteses-label" for="checklist-hipotese-texto">Hipóteses diagnósticas</label>
                <textarea id="checklist-hipotese-texto" class="checklist-hipoteses-input"
                          placeholder="Descreva as hipóteses diagnósticas que orientam a escolha dos instrumentos..."
                          rows="3" ${state.podeEditar ? '' : 'readonly'}>${escapeHtml(state.hipoteseTexto)}</textarea>
            </div>
        `;

        const aviso = !state.podeEditar ? `
            <div class="aviso-permissao">
                ⚠️ Você pode visualizar e imprimir o checklist, mas não editá-lo.
            </div>
        ` : '';

        // Lista por categoria (mantém ordem dos PDFs Equilibrium oficiais)
        const ORDEM_CATEGORIAS = [
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

        const categoriasOrdenadas = ORDEM_CATEGORIAS.filter(c => state.agrupado[c]);
        // Adiciona categorias que não estão na ordem fixa (caso futuro)
        Object.keys(state.agrupado).forEach(c => {
            if (!categoriasOrdenadas.includes(c)) categoriasOrdenadas.push(c);
        });

        const lista = categoriasOrdenadas.map(categoria => {
            const instrumentos = state.agrupado[categoria];
            return `
                <div class="checklist-categoria">
                    <h2 class="checklist-categoria-title">${iconeCategoria(categoria)} ${escapeHtml(categoria)}</h2>
                    <div class="checklist-itens">
                        ${instrumentos.map(inst => renderItem(inst)).join('')}
                    </div>
                </div>
            `;
        }).join('');

        const navegacao = `
            <div class="wizard-navegacao">
                <a href="../pacientes/pasta.html?id=${state.pacienteId}" class="btn btn-secondary">
                    ← Voltar para pasta
                </a>
                <div class="wizard-navegacao-direita">
                    <button class="btn btn-ghost" onclick="window.CortexChecklist.imprimirPDF()" ${totalSelecionados === 0 ? 'disabled' : ''}>
                        📄 Imprimir PDF (${totalSelecionados})
                    </button>
                    ${state.podeEditar ? `
                        <button class="btn btn-primary" onclick="window.CortexChecklist.salvarManualmente()">
                            Salvar
                        </button>
                    ` : ''}
                </div>
            </div>
        `;

        container.innerHTML = cabecalho + aviso + caixaHipoteses + renderBaterias() + lista + navegacao;

        bindBaterias();

        // Caixa de hipóteses: atualiza estado e marca como editado
        const txtHip = document.getElementById('checklist-hipotese-texto');
        if (txtHip && state.podeEditar) {
            txtHip.addEventListener('input', () => {
                state.hipoteseTexto = txtHip.value;
                marcarEditado();
            });
        }

        // Botão só-admin: alternar "ver todos os testes" (aplicar fora da faixa)
        if (state.ehAdmin) {
            const btnVerTodos = document.getElementById('checklist-vertodos');
            if (btnVerTodos) btnVerTodos.addEventListener('click', () => {
                state.verTodos = !state.verTodos;
                filtrarECategorizar();
                renderizar();
            });
        }
    }

    function selecionadosVisiveis() {
        return state.catalogo.filter(i => state.instrumentosSelecionados.includes(i.id));
    }

    function resumoModosHtml() {
        const c = contarModos(selecionadosVisiveis());
        if (!c.online && !c.presencial) return '';
        return `<span class="cm-on">📲 ${c.online} online</span><span class="cm-pr">🧑‍⚕️ ${c.presencial} presencial</span>`;
    }

    // Formata a descricao_longa do tooltip de forma SEGURA:
    // escapa todo o texto e só converte: linha "- item" -> <li>; demais linhas -> <div>.
    // "Rótulo:" no início da linha vira destaque.
    function formatarDescricaoLonga(txt) {
        const linhas = String(txt).split(/\r?\n/);
        let html = '';
        let emLista = false;
        for (const raw of linhas) {
            const linha = raw.trim();
            if (!linha) continue;
            if (linha.startsWith('- ')) {
                if (!emLista) { html += '<ul class="checklist-item-tip-lista">'; emLista = true; }
                html += `<li>${escapeHtml(linha.slice(2))}</li>`;
            } else {
                if (emLista) { html += '</ul>'; emLista = false; }
                const m = linha.match(/^([^:]{1,30}:)(.*)$/);
                if (m) {
                    html += `<div class="checklist-item-tip-sec"><span class="checklist-item-tip-lbl">${escapeHtml(m[1])}</span>${escapeHtml(m[2])}</div>`;
                } else {
                    html += `<div class="checklist-item-tip-sec">${escapeHtml(linha)}</div>`;
                }
            }
        }
        if (emLista) html += '</ul>';
        return html;
    }

    function descreverModalidade(inst) {
        const partes = [];
        const tr = inst.tipo_respondente;
        if (tr === 'paciente') partes.push('autoaplicação');
        else if (tr === 'responsavel_ou_professor') partes.push('heteroaplicação (pais/professor)');
        else if (tr === 'responsavel') partes.push('heteroaplicação (responsável)');
        else if (tr === 'professor') partes.push('heteroaplicação (professor)');
        if (inst.permite_aplicacao_online) partes.push('link / portal');
        return partes.join(' · ');
    }

    function renderItem(inst) {
        const selecionado = state.instrumentosSelecionados.includes(inst.id);
        const disabled = !state.podeEditar;

        return `
            <label class="checklist-item ${selecionado ? 'selecionado' : ''} ${disabled ? 'disabled' : ''} ${inst._foraDaFaixa ? 'fora-faixa' : ''}" data-inst="${inst.id}">
                <input type="checkbox"
                       ${selecionado ? 'checked' : ''}
                       ${disabled ? 'disabled' : ''}
                       onchange="window.CortexChecklist.toggle('${inst.id}', this.checked)">
                <div class="checklist-item-info">
                    <div class="checklist-item-titulo">
                        <strong>${escapeHtml(inst.sigla)}</strong>
                        ${inst.faixa_etaria_label ? `<span class="checklist-item-idade">${escapeHtml(inst.faixa_etaria_label)}</span>` : ''}
                        ${inst._foraDaFaixa ? `<span class="checklist-item-fora-tag" title="Este teste está fora da faixa etária do paciente">fora da faixa</span>` : ''}
                    </div>
                    <div class="checklist-item-descricao">${escapeHtml(inst.o_que_avalia)}</div>
                    ${selecionado ? renderModo(inst) : ''}
                </div>
                <div class="checklist-item-tip" role="tooltip">
                    <div class="checklist-item-tip-nome">${escapeHtml(inst.nome_completo || inst.sigla)}</div>
                    <div class="checklist-item-tip-meta">${escapeHtml([inst.dominio_principal, inst.faixa_etaria_label, descreverModalidade(inst)].filter(Boolean).join(' · '))}</div>
                    ${inst.descricao_longa
                        ? `<div class="checklist-item-tip-corpo">${formatarDescricaoLonga(inst.descricao_longa)}</div>`
                        : (inst.o_que_avalia ? `<div class="checklist-item-tip-corpo">${escapeHtml(inst.o_que_avalia)}</div>` : '')}
                </div>
            </label>
        `;
    }

    function iconeCategoria(cat) {
        const icones = {
            'Inteligência / Raciocínio': '🧠',
            'Linguagem / Leitura / Escrita / Matemática': '💬',
            'Atenção / Memória': '🎯',
            'Funções Executivas': '⚙️',
            'TEA / Autismo': '🧩',
            'TDAH / Comportamento': '⚡',
            'Humor / Ansiedade / Depressão': '💭',
            'Psicopatologia Geral / ASEBA': '🩺',
            'Personalidade / Habilidades Sociais / Adaptativo': '🌈',
            'Desenvolvimento Infantil': '🌱',
            'Sensorial': '🎨'
        };
        return icones[cat] || '📋';
    }

    // ============================================================================
    // AÇÕES
    // ============================================================================

    window.CortexChecklist = {
        toggle: function(uuid, checked) {
            if (!state.podeEditar) return;

            if (checked) {
                if (!state.instrumentosSelecionados.includes(uuid)) {
                    state.instrumentosSelecionados.push(uuid);
                }
            } else {
                state.instrumentosSelecionados = state.instrumentosSelecionados.filter(id => id !== uuid);
            }

            marcarEditado();
            atualizarBadgeEItem(uuid, checked);
        },

        definirModo: function(ev, uuid, modo) {
            if (ev) { ev.preventDefault(); ev.stopPropagation(); }
            if (!state.podeEditar) return;
            const inst = state.catalogo.find(i => i.id === uuid);
            if (!inst) return;
            if (modo === 'online' && !inst.permite_aplicacao_online) return;
            state.quemAplica = Object.assign({}, state.quemAplica, { [uuid]: modo });
            marcarEditado();
            redesenharItem(uuid);
        },

        salvarManualmente: async function() {
            state.editado = true;
            await salvarSilencioso();
            window.CortexUI.toast('Checklist salvo', 'success');
        },

        imprimirPDF: function() {
            gerarConteudoImpressao();
            caberNumaFolha();
            window.print();
        }
    };

    // Troca só o card do instrumento (mostra/esconde o seletor online/presencial)
    function redesenharItem(uuid) {
        const el = document.querySelector(`.checklist-item[data-inst="${uuid}"]`);
        const inst = state.catalogoFiltrado.find(i => i.id === uuid) || state.catalogo.find(i => i.id === uuid);
        if (el && inst) el.outerHTML = renderItem(inst);
        const r = document.getElementById('checklist-modo-resumo');
        if (r) r.innerHTML = resumoModosHtml();
    }

    function atualizarBadgeEItem(uuid, checked) {
        // Atualiza só o item específico sem re-render completo (mais fluido)
        const total = state.instrumentosSelecionados.length;

        // Badge no cabeçalho
        const badge = document.querySelector('.anamnese-cabecalho-acoes .badge');
        if (badge) badge.textContent = `${total} selecionados`;

        // Botão imprimir
        const btnImprimir = document.querySelector('.btn-ghost');
        if (btnImprimir) {
            btnImprimir.innerHTML = `📄 Imprimir PDF (${total})`;
            btnImprimir.disabled = total === 0;
        }

        // Redesenha o card (classe visual + seletor online/presencial)
        redesenharItem(uuid);
    }

    function marcarEditado() {
        state.editado = true;
        const ind = document.getElementById('indicador-save');
        if (ind) {
            ind.textContent = '● Edições não salvas';
            ind.className = 'indicador-save indicador-save-pendente';
        }

        clearTimeout(autoSaveTimeout);
        autoSaveTimeout = setTimeout(() => salvarSilencioso(), 3000);
    }

    // ============================================================================
    // SALVAMENTO
    // ============================================================================

    async function salvarSilencioso() {
        if (!state.editado || state.salvando) return;

        state.salvando = true;
        const ind = document.getElementById('indicador-save');
        if (ind) {
            ind.textContent = 'Salvando...';
            ind.className = 'indicador-save indicador-save-salvando';
        }

        try {
            await persistirNoBanco();
            state.editado = false;
            if (ind) {
                ind.textContent = '✓ Salvo';
                ind.className = 'indicador-save indicador-save-salvo';
                setTimeout(() => {
                    if (ind && !state.editado) ind.textContent = '';
                }, 2000);
            }
        } catch (err) {
            console.error('Erro ao salvar:', err);
            if (ind) {
                ind.textContent = '⚠ Erro ao salvar';
                ind.className = 'indicador-save indicador-save-erro';
            }
        } finally {
            state.salvando = false;
        }
    }

    // Guarda a escolha só dos testes marcados (desmarcou, some do mapa)
    function quemAplicaParaSalvar() {
        const out = {};
        state.instrumentosSelecionados.forEach(id => {
            if (state.quemAplica[id] === 'online' || state.quemAplica[id] === 'presencial') out[id] = state.quemAplica[id];
        });
        return out;
    }

    async function persistirNoBanco() {
        if (state.hipoteseId) {
            // Atualiza hipótese existente
            const { error } = await window.cortexClient
                .from('hipoteses')
                .update({ instrumentos_sugeridos: state.instrumentosSelecionados, hipotese_checklist: state.hipoteseTexto, checklist_aplicacao: quemAplicaParaSalvar() })
                .eq('id', state.hipoteseId);
            if (error) throw error;

            await CortexAudit.log('edicao', 'hipoteses', state.hipoteseId, {
                pacienteId: state.pacienteId,
                detalhes: { acao: 'checklist_atualizado', total: state.instrumentosSelecionados.length }
            });
        } else {
            // Cria hipótese (caso não exista) só pra guardar o checklist
            const { data, error } = await window.cortexClient
                .from('hipoteses')
                .insert({
                    paciente_id: state.pacienteId,
                    instrumentos_sugeridos: state.instrumentosSelecionados,
                    hipotese_checklist: state.hipoteseTexto,
                    checklist_aplicacao: quemAplicaParaSalvar(),
                    preenchido_por: window.cortexProfissional.id
                })
                .select()
                .single();
            if (error) throw error;

            state.hipoteseId = data.id;

            await CortexAudit.log('criacao', 'hipoteses', data.id, {
                pacienteId: state.pacienteId,
                detalhes: { acao: 'checklist_criado_via_d1', total: state.instrumentosSelecionados.length }
            });
        }
    }

    // ============================================================================
    // IMPRESSÃO — checklist "padrão ouro" (sprint_checklist_print)
    // ============================================================================
    // A4 com margens reais, cabeçalho institucional, ficha do paciente,
    // hipóteses, resumo (total / online / presencial), tabela por categoria
    // com quem responde e como será aplicado, campos para marcar, datar e
    // vistar, observações e assinatura. Número de página no rodapé.

    const COR_CATEGORIA = {
        'Inteligência / Raciocínio': '#ec4899',
        'Linguagem / Leitura / Escrita / Matemática': '#3b82f6',
        'Atenção / Memória': '#ef4444',
        'Funções Executivas': '#eab308',
        'TEA / Autismo': '#22c55e',
        'TDAH / Comportamento': '#f59e0b',
        'Humor / Ansiedade / Depressão': '#64748b',
        'Psicopatologia Geral / ASEBA': '#6366f1',
        'Personalidade / Habilidades Sociais / Adaptativo': '#a855f7',
        'Desenvolvimento Infantil': '#f97316',
        'Sensorial': '#06b6d4'
    };

    const RESPONDENTE_CURTO = {
        paciente: 'Paciente',
        responsavel: 'Responsável',
        professor: 'Professor(a)',
        paciente_ou_responsavel: 'Paciente / Resp.',
        responsavel_ou_professor: 'Resp. / Prof.'
    };

    function svgCataVento(cor) {
        return `
            <svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
                <path d="M20 4 C13 8 11 14 14 20 C8 17 2 19 4 26 C8 23 14 23 20 28 C17 22 19 16 26 14 C23 20 23 26 28 32 C25 25 25 19 20 14 C22 20 26 22 32 20 C26 17 22 13 20 8 Z" fill="${cor}"/>
                <circle cx="20" cy="20" r="4.5" fill="${cor}"/>
                <circle cx="20" cy="20" r="2" fill="#0a1f3d"/>
            </svg>
        `;
    }

    // Mede o checklist na largura útil da A4 e, se passar de uma folha, encolhe por igual.
    function caberNumaFolha() {
        const doc = document.querySelector('#print-area .pck-doc');
        if (!doc) return;
        doc.style.zoom = '';
        const pxMm = 96 / 25.4, largura = 188 * pxMm, altura = 274 * pxMm;   // A4 menos as margens
        const medidor = doc.cloneNode(true);
        medidor.style.cssText = `position:absolute;left:-10000px;top:0;width:${largura}px;visibility:hidden;`;
        document.body.appendChild(medidor);
        const h = medidor.getBoundingClientRect().height;
        medidor.remove();
        // folga de 4%: com o zoom algumas linhas quebram diferente
        if (h > altura) doc.style.zoom = String(Math.max(0.7, Math.floor((altura * 0.96 / h) * 1000) / 1000));
    }

    function gerarConteudoImpressao() {
        const printArea = document.getElementById('print-area');
        if (!printArea) return;

        const selecionados = state.catalogo.filter(i => state.instrumentosSelecionados.includes(i.id));
        const modos = contarModos(selecionados);

        const agrupado = {};
        selecionados.forEach(inst => {
            const cat = inst.dominio_principal || 'Outros';
            (agrupado[cat] = agrupado[cat] || []).push(inst);
        });
        const ORDEM = Object.keys(COR_CATEGORIA);
        const categorias = ORDEM.filter(c => agrupado[c]);
        Object.keys(agrupado).forEach(c => { if (!categorias.includes(c)) categorias.push(c); });
        categorias.forEach(c => agrupado[c].sort((a, b) => String(a.sigla).localeCompare(String(b.sigla), 'pt-BR')));

        const p = state.paciente;
        const faixaLabel = state.faixaPaciente === 'pre_escolar' ? 'Pré-Escolar'
                         : state.faixaPaciente === 'escolar' ? 'Escolar' : 'Adulto';
        const hoje = new Date();
        const dataHoje = hoje.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
        const nasc = p.data_nascimento ? (window.CortexUI && window.CortexUI.formatarDataBR
            ? window.CortexUI.formatarDataBR(p.data_nascimento)
            : String(p.data_nascimento).split('-').reverse().join('/')) : '—';
        const campo = (rot, val, cls) => `
            <div class="pck-campo ${cls || ''}">
                <div class="pck-rot">${rot}</div>
                <div class="pck-val">${val ? escapeHtml(val) : '<span class="pck-vazio">—</span>'}</div>
            </div>`;

        let linhas = '';
        let n = 0;
        categorias.forEach(cat => {
            const cor = COR_CATEGORIA[cat] || '#64748b';
            linhas += `
                <tr class="pck-cat" style="--cat:${cor};">
                    <td colspan="7"><span class="pck-cat-ponto"></span>${escapeHtml(cat)}<span class="pck-cat-n">${agrupado[cat].length}</span></td>
                </tr>`;
            agrupado[cat].forEach(inst => {
                n++;
                const modo = modoEfetivo(inst);
                linhas += `
                    <tr class="pck-linha" style="--cat:${cor};">
                        <td class="pck-c-num">${n}</td>
                        <td class="pck-c-inst"><div class="pck-sigla">${escapeHtml(inst.sigla)}</div></td>
                        <td class="pck-c-avalia"><div class="pck-uma-linha" title="${escapeHtml(inst.o_que_avalia || '')}">${escapeHtml(inst.o_que_avalia || '')}</div></td>
                        <td class="pck-c-resp">${escapeHtml(RESPONDENTE_CURTO[inst.tipo_respondente] || 'Paciente')}</td>
                        <td class="pck-c-modo"><span class="pck-modo ${modo}">${modo === 'online' ? 'Online' : 'Presencial'}</span></td>
                        <td class="pck-c-data">___/___/______</td>
                        <td class="pck-c-ok"><span class="pck-box"></span></td>
                    </tr>`;
            });
        });

        printArea.innerHTML = `
            <div class="pck-doc">
                <header class="pck-topo">
                    <div class="pck-marca">
                        <div class="pck-logo">${svgCataVento('#ffffff')}</div>
                        <div>
                            <div class="pck-marca-nome">Equilibrium</div>
                            <div class="pck-marca-sub">Neuropsicologia Clínica</div>
                        </div>
                    </div>
                    <div class="pck-titulo">
                        <div class="pck-titulo-sup">Avaliação Neuropsicológica</div>
                        <h1>Checklist de Instrumentos</h1>
                        <div class="pck-titulo-data">Emitido em ${escapeHtml(dataHoje)}</div>
                    </div>
                </header>
                <div class="pck-faixa-cor"></div>

                <section class="pck-ficha">
                    ${campo('Paciente', p.nome_completo, 'pck-span2 pck-destaque')}
                    ${campo('Idade', p.idade_humanizada)}
                    ${campo('Nascimento', nasc)}
                    ${campo('Escolaridade', p.escolaridade_completa || p.escolaridade, 'pck-span2')}
                    ${campo('Aplicador(a)', p.aplicador_nome, 'pck-span2')}
                </section>

                <section class="pck-hipoteses">
                    <div class="pck-rot">Hipóteses diagnósticas</div>
                    <div class="pck-hip-texto">${state.hipoteseTexto ? escapeHtml(state.hipoteseTexto) : '<span class="pck-vazio">Não informadas.</span>'}</div>
                </section>

                <div class="pck-resumo-linha"><b>${selecionados.length}</b> instrumentos · <span class="pck-modo online">${modos.online} online</span> <span class="pck-modo presencial">${modos.presencial} presenciais</span></div>

                <table class="pck-tabela">
                    <colgroup>
                        <col style="width:6mm"><col style="width:30mm"><col><col style="width:21mm">
                        <col style="width:19mm"><col style="width:25mm"><col style="width:10mm">
                    </colgroup>
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Instrumento</th>
                            <th>O que avalia</th>
                            <th>Responde</th>
                            <th>Aplicação</th>
                            <th>Data</th>
                            <th class="pck-th-ok">✓</th>
                        </tr>
                    </thead>
                    <tbody>${linhas}</tbody>
                </table>

                <section class="pck-fecho">
                    <div class="pck-obs">
                        <div class="pck-rot">Observações da aplicação</div>
                        <div class="pck-linha-esc"></div><div class="pck-linha-esc"></div>
                    </div>
                    <div class="pck-assinaturas">
                        <div class="pck-ass"><div class="pck-ass-linha"></div><span>Neuropsicólogo(a) responsável · CRP</span></div>
                        <div class="pck-ass"><div class="pck-ass-linha"></div><span>Aplicador(a)</span></div>
                    </div>
                </section>
            </div>`;
    }

    // ============================================================================
    // UTILS
    // ============================================================================

    function mostrarErro(mensagem) {
        document.getElementById('checklist-conteudo').innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                </div>
                <div class="empty-state-title">${escapeHtml(mensagem)}</div>
                <a href="../pacientes/lista.html" class="btn btn-primary">Voltar à lista de pacientes</a>
            </div>
        `;
    }

    function escapeHtml(text) {
        if (text === null || text === undefined) return '';
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }

    window.addEventListener('beforeunload', (e) => {
        if (state.editado) {
            e.preventDefault();
            e.returnValue = '';
        }
    });
})();
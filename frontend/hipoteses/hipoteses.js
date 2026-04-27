// ============================================================================
// CORTEX_APP — Módulo de Hipóteses Diagnósticas (Sprint B3)
// ============================================================================
// Estrutura: 1 registro por paciente na tabela `hipoteses`.
// Reaproveita 100% da estrutura A1 (4 RLS já existem, sem SQL novo).
//
// Fluxo:
//   1. URL ?paciente=UUID — carrega ou cria registro pra esse paciente
//   2. 5 campos editáveis: hipóteses iniciais, CIDs, justificativa, plano,
//      instrumentos
//   3. Autocomplete de CIDs com agrupamento por título (mostra CID-11+DSM-5-TR
//      juntos quando o mesmo título tem ambos)
//   4. Autocomplete de instrumentos (UUIDs salvos, siglas exibidas)
//   5. Auto-save 3s após edição
//   6. Botão "Aprovar hipóteses" preenche aprovado_por + aprovado_em
//   7. Quando aprovada, fica bloqueada para edição
// ============================================================================

(function() {
    'use strict';

    const state = {
        pacienteId: null,
        paciente: null,
        hipoteseId: null,
        registro: null,
        catalogoCids: [],          // [{id, versao, titulo, capitulo}]
        catalogoCidsAgrupado: [],  // [{titulo, cid11, dsm5tr, capitulo}]
        catalogoInstrumentos: [],  // [{id, sigla, nome_completo}]
        dados: {
            hipoteses_iniciais: '',
            cids_sugeridos: [],       // array de strings (ids dos CIDs)
            justificativa_clinica: '',
            plano_avaliacao: '',
            instrumentos_sugeridos: [] // array de strings (UUIDs dos instrumentos)
        },
        sugestoes: [],            // sugestões automáticas baseadas na anamnese
        salvando: false,
        editado: false
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

        try {
            await Promise.all([
                carregarPaciente(),
                carregarCatalogoCids(),
                carregarCatalogoInstrumentos(),
                carregarHipoteseExistente()
            ]);

            // Sugestões automáticas a partir da anamnese
            await gerarSugestoesAutomaticas();

            renderizar();
        } catch (err) {
            console.error('Erro ao carregar:', err);
            mostrarErro('Erro: ' + (err.message || 'desconhecido'));
        }
    });

    // ============================================================================
    // CARREGAMENTO
    // ============================================================================

    async function carregarPaciente() {
        const { data, error } = await window.cortexClient
            .from('vw_pacientes_lista')
            .select('*')
            .eq('id', state.pacienteId)
            .single();

        if (error || !data) throw new Error('Paciente não encontrado');
        state.paciente = data;
    }

    async function carregarCatalogoCids() {
        const { data, error } = await window.cortexClient
            .from('cids')
            .select('id, versao, titulo, capitulo')
            .eq('ativo', true)
            .order('id');

        if (error) {
            console.warn('Erro ao carregar catálogo CIDs:', error);
            return;
        }

        state.catalogoCids = data || [];
        // Agrupa CID-11 + DSM-5-TR pelo título
        state.catalogoCidsAgrupado = agruparCids(state.catalogoCids);
    }

    /**
     * Agrupa entradas com o mesmo título em um único item com cid11 + dsm5tr.
     * Se um título só tiver uma versão, a outra fica null.
     */
    function agruparCids(cids) {
        const agrupado = {};
        cids.forEach(c => {
            // Normaliza título pra fazer match (case-insensitive, sem acentos)
            const chave = normalizarTexto(c.titulo);
            if (!agrupado[chave]) {
                agrupado[chave] = { titulo: c.titulo, capitulo: c.capitulo, cid11: null, dsm5tr: null };
            }
            if (c.versao === 'CID-11') agrupado[chave].cid11 = c;
            if (c.versao === 'DSM-5-TR') agrupado[chave].dsm5tr = c;
        });
        return Object.values(agrupado).sort((a, b) => a.titulo.localeCompare(b.titulo));
    }

    function normalizarTexto(s) {
        return (s || '').toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]/g, '');
    }

    async function carregarCatalogoInstrumentos() {
        const { data, error } = await window.cortexClient
            .from('instrumentos_catalogo')
            .select('id, sigla, nome_completo, o_que_avalia')
            .order('sigla');

        if (error) {
            console.warn('Erro ao carregar catálogo de instrumentos:', error);
            return;
        }

        state.catalogoInstrumentos = data || [];
    }

    async function carregarHipoteseExistente() {
        const { data, error } = await window.cortexClient
            .from('hipoteses')
            .select('*')
            .eq('paciente_id', state.pacienteId)
            .maybeSingle();

        if (error && error.code !== 'PGRST116') {
            // PGRST116 = nenhum resultado, é OK
            console.warn('Erro ao buscar hipóteses:', error);
        }

        if (data) {
            state.hipoteseId = data.id;
            state.registro = data;
            state.dados = {
                hipoteses_iniciais: data.hipoteses_iniciais || '',
                cids_sugeridos: data.cids_sugeridos || [],
                justificativa_clinica: data.justificativa_clinica || '',
                plano_avaliacao: data.plano_avaliacao || '',
                instrumentos_sugeridos: data.instrumentos_sugeridos || []
            };

            await CortexAudit.log('leitura', 'hipoteses', state.hipoteseId, {
                pacienteId: state.pacienteId
            });
        }
    }

    /**
     * Gera sugestões automáticas baseadas em palavras-chave da anamnese.
     * Sem IA - matching simples por keywords clínicas conhecidas.
     */
    async function gerarSugestoesAutomaticas() {
        // Só sugere se ainda não há hipótese registrada
        if (state.dados.cids_sugeridos.length > 0) return;

        const { data: anamnese } = await window.cortexClient
            .from('anamneses')
            .select('queixa_historico, social_emocional, desenvolvimento')
            .eq('paciente_id', state.pacienteId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (!anamnese) return;

        // Concatena os textos relevantes da anamnese
        const textos = [
            JSON.stringify(anamnese.queixa_historico || {}),
            JSON.stringify(anamnese.social_emocional || {}),
            JSON.stringify(anamnese.desenvolvimento || {})
        ].join(' ').toLowerCase();

        const sugestoes = [];

        // Mapeamento simples palavra-chave → CID
        const regras = [
            { keywords: ['desaten', 'hiperati', 'impulsiv', 'tdah'], cidId: '6A05.2', motivo: 'Sinais de desatenção/hiperatividade na anamnese' },
            { keywords: ['autism', 'tea', 'estereotip', 'ecolal', 'hipersensibilidade'], cidId: '6A02', motivo: 'Sinais sugestivos de TEA na anamnese' },
            { keywords: ['ansiedade', 'ataques de pânico', 'preocupa'], cidId: '6B00', motivo: 'Sintomas de ansiedade relatados' },
            { keywords: ['depressi', 'tristeza', 'humor deprimido'], cidId: '6A70', motivo: 'Sintomas depressivos relatados' },
            { keywords: ['leitura', 'escrita', 'matemática', 'aprendizag'], cidId: '6A03', motivo: 'Dificuldades de aprendizagem na anamnese' }
        ];

        regras.forEach(regra => {
            if (regra.keywords.some(k => textos.includes(k))) {
                const cid = state.catalogoCids.find(c => c.id === regra.cidId);
                if (cid && !state.dados.cids_sugeridos.includes(cid.id)) {
                    sugestoes.push({ cid, motivo: regra.motivo });
                }
            }
        });

        state.sugestoes = sugestoes;
    }

    // ============================================================================
    // RENDERIZAÇÃO
    // ============================================================================

    function renderizar() {
        const container = document.getElementById('hipoteses-conteudo');
        const aprovada = !!(state.registro && state.registro.aprovado_em);

        const cabecalho = `
            <div class="anamnese-cabecalho">
                <div class="anamnese-cabecalho-titulo">
                    <h1>Hipóteses — ${escapeHtml(state.paciente.nome_completo)}</h1>
                    <p class="anamnese-cabecalho-sub">${state.paciente.idade_humanizada}</p>
                </div>
                <div class="anamnese-cabecalho-acoes">
                    ${aprovada ? `
                        <span class="badge status-success">✓ Aprovada</span>
                    ` : ''}
                    <span id="indicador-save" class="indicador-save"></span>
                </div>
            </div>
        `;

        const sugestoesHtml = state.sugestoes.length > 0 && !aprovada ? `
            <div class="hipoteses-sugestoes">
                <div class="hipoteses-sugestoes-header">
                    <span>💡 Sugestões automáticas baseadas na anamnese</span>
                    <small>Clique para adicionar à lista</small>
                </div>
                <div class="hipoteses-sugestoes-grid">
                    ${state.sugestoes.map((s, i) => `
                        <button class="sugestao-chip" onclick="window.CortexHipoteses.aceitarSugestao(${i})">
                            <strong>+ ${escapeHtml(s.cid.titulo)}</strong>
                            <small>${escapeHtml(s.motivo)}</small>
                        </button>
                    `).join('')}
                </div>
            </div>
        ` : '';

        const conteudo = `
            <div class="form-section">
                <h2 class="form-section-title">📝 Hipóteses iniciais</h2>
                <div class="form-group">
                    <textarea class="form-textarea" id="campo-hipoteses-iniciais" rows="4"
                              placeholder="Ex: Considerar TDAH apresentação combinada (CID-11 6A05.2), com investigação de comorbidade ansiosa (6B00). Hipóteses diferenciais incluem TEA leve."
                              ${aprovada ? 'disabled' : ''}>${escapeHtml(state.dados.hipoteses_iniciais)}</textarea>
                </div>
            </div>

            <div class="form-section">
                <h2 class="form-section-title">🏥 CIDs e DSM-5-TR sugeridos</h2>
                ${renderChipsCids(aprovada)}
                ${!aprovada ? `
                    <div class="form-group" style="margin-top: 14px;">
                        <input type="text" class="form-input" id="busca-cid"
                               placeholder="Digite para buscar (ex: TDAH, autismo, ansiedade)..." autocomplete="off">
                        <div id="autocomplete-cids" class="autocomplete-dropdown"></div>
                    </div>
                ` : ''}
            </div>

            <div class="form-section">
                <h2 class="form-section-title">💭 Justificativa clínica</h2>
                <div class="form-group">
                    <textarea class="form-textarea" id="campo-justificativa" rows="4"
                              placeholder="Ex: Anamnese revela início precoce dos sintomas (3 anos), padrão familiar de TDAH (mãe diagnosticada), prejuízo significativo no desempenho escolar..."
                              ${aprovada ? 'disabled' : ''}>${escapeHtml(state.dados.justificativa_clinica)}</textarea>
                </div>
            </div>

            <div class="form-section">
                <h2 class="form-section-title">🔬 Plano de avaliação</h2>
                <div class="form-group">
                    <textarea class="form-textarea" id="campo-plano" rows="4"
                              placeholder="Ex: Bateria proposta — avaliação cognitiva ampla com WAIS-IV, escalas de TDAH para validação dos sintomas, avaliação de ansiedade como diferencial..."
                              ${aprovada ? 'disabled' : ''}>${escapeHtml(state.dados.plano_avaliacao)}</textarea>
                </div>
            </div>

            <div class="form-section">
                <h2 class="form-section-title">⚙️ Instrumentos sugeridos</h2>
                ${renderChipsInstrumentos(aprovada)}
                ${!aprovada ? `
                    <div class="form-group" style="margin-top: 14px;">
                        <input type="text" class="form-input" id="busca-instrumento"
                               placeholder="Digite a sigla ou nome (ex: WAIS, SRS, Vineland)..." autocomplete="off">
                        <div id="autocomplete-instrumentos" class="autocomplete-dropdown"></div>
                    </div>
                ` : ''}
            </div>
        `;

        const navegacao = `
            <div class="wizard-navegacao">
                <a href="../pacientes/pasta.html?id=${state.pacienteId}" class="btn btn-secondary">
                    ← Voltar para pasta
                </a>
                ${!aprovada ? `
                    <div class="wizard-navegacao-direita">
                        <button class="btn btn-ghost" onclick="window.CortexHipoteses.salvarManualmente()">
                            Salvar rascunho
                        </button>
                        <button class="btn btn-primary btn-lg" onclick="window.CortexHipoteses.aprovar()">
                            Aprovar hipóteses
                        </button>
                    </div>
                ` : ''}
            </div>
        `;

        container.innerHTML = cabecalho + sugestoesHtml + conteudo + navegacao;

        if (!aprovada) {
            setupListeners();
        }
    }

    function renderChipsCids(aprovada) {
        if (state.dados.cids_sugeridos.length === 0) {
            return '<div class="chips-vazio">Nenhum CID/DSM adicionado ainda.</div>';
        }

        const chips = state.dados.cids_sugeridos.map(cidId => {
            const cid = state.catalogoCids.find(c => c.id === cidId);
            if (!cid) {
                return `<span class="chip chip-warning">${escapeHtml(cidId)} (não encontrado) ${!aprovada ? `<button onclick="window.CortexHipoteses.removerCid('${cidId}')">×</button>` : ''}</span>`;
            }
            // Procura o par (CID-11 ↔ DSM-5-TR) pra mostrar agrupado
            const par = state.catalogoCidsAgrupado.find(g =>
                g.cid11?.id === cidId || g.dsm5tr?.id === cidId
            );
            const cid11 = par?.cid11?.id || (cid.versao === 'CID-11' ? cid.id : null);
            const dsm = par?.dsm5tr?.id || (cid.versao === 'DSM-5-TR' ? cid.id : null);

            return `
                <span class="chip-cid">
                    <strong>${escapeHtml(par?.titulo || cid.titulo)}</strong>
                    <small>
                        ${cid11 ? `CID-11: ${escapeHtml(cid11)}` : ''}
                        ${cid11 && dsm ? ' · ' : ''}
                        ${dsm ? `DSM-5-TR: ${escapeHtml(dsm)}` : ''}
                    </small>
                    ${!aprovada ? `<button class="chip-remover" onclick="window.CortexHipoteses.removerCid('${cidId}')" title="Remover">×</button>` : ''}
                </span>
            `;
        }).join('');

        return `<div class="chips-container">${chips}</div>`;
    }

    function renderChipsInstrumentos(aprovada) {
        if (state.dados.instrumentos_sugeridos.length === 0) {
            return '<div class="chips-vazio">Nenhum instrumento adicionado ainda.</div>';
        }

        const chips = state.dados.instrumentos_sugeridos.map(instId => {
            const inst = state.catalogoInstrumentos.find(i => i.id === instId);
            if (!inst) {
                return `<span class="chip chip-warning">Instrumento desconhecido ${!aprovada ? `<button onclick="window.CortexHipoteses.removerInstrumento('${instId}')">×</button>` : ''}</span>`;
            }
            return `
                <span class="chip-instrumento">
                    <strong>${escapeHtml(inst.sigla)}</strong>
                    <small>${escapeHtml(inst.nome_completo)}</small>
                    ${!aprovada ? `<button class="chip-remover" onclick="window.CortexHipoteses.removerInstrumento('${instId}')" title="Remover">×</button>` : ''}
                </span>
            `;
        }).join('');

        return `<div class="chips-container">${chips}</div>`;
    }

    // ============================================================================
    // LISTENERS
    // ============================================================================

    function setupListeners() {
        // Textareas
        ['hipoteses-iniciais', 'justificativa', 'plano'].forEach(suffix => {
            const map = {
                'hipoteses-iniciais': 'hipoteses_iniciais',
                'justificativa': 'justificativa_clinica',
                'plano': 'plano_avaliacao'
            };
            const el = document.getElementById(`campo-${suffix}`);
            if (el) {
                el.addEventListener('input', () => {
                    state.dados[map[suffix]] = el.value;
                    marcarEditado();
                });
            }
        });

        // Autocomplete CIDs
        const buscaCid = document.getElementById('busca-cid');
        if (buscaCid) {
            buscaCid.addEventListener('input', () => mostrarAutocompleteCids(buscaCid.value));
            buscaCid.addEventListener('focus', () => mostrarAutocompleteCids(buscaCid.value));
            buscaCid.addEventListener('blur', () => {
                // delay pra permitir clique no item
                setTimeout(() => esconderAutocompleteCids(), 200);
            });
        }

        // Autocomplete instrumentos
        const buscaInst = document.getElementById('busca-instrumento');
        if (buscaInst) {
            buscaInst.addEventListener('input', () => mostrarAutocompleteInstrumentos(buscaInst.value));
            buscaInst.addEventListener('focus', () => mostrarAutocompleteInstrumentos(buscaInst.value));
            buscaInst.addEventListener('blur', () => {
                setTimeout(() => esconderAutocompleteInstrumentos(), 200);
            });
        }
    }

    function mostrarAutocompleteCids(termo) {
        const dropdown = document.getElementById('autocomplete-cids');
        if (!dropdown) return;

        const t = normalizarTexto(termo);
        const limite = 8;

        // Busca em titulos agrupados
        let resultados = state.catalogoCidsAgrupado;
        if (t.length > 0) {
            resultados = state.catalogoCidsAgrupado.filter(g => {
                return normalizarTexto(g.titulo).includes(t)
                    || (g.cid11 && normalizarTexto(g.cid11.id).includes(t))
                    || (g.dsm5tr && normalizarTexto(g.dsm5tr.id).includes(t));
            });
        }

        // Filtra os já selecionados
        resultados = resultados.filter(g => {
            const ids = [g.cid11?.id, g.dsm5tr?.id].filter(Boolean);
            return !ids.every(id => state.dados.cids_sugeridos.includes(id));
        });

        resultados = resultados.slice(0, limite);

        if (resultados.length === 0) {
            dropdown.innerHTML = '<div class="autocomplete-vazio">Nenhum diagnóstico encontrado.</div>';
            dropdown.style.display = 'block';
            return;
        }

        dropdown.innerHTML = resultados.map((g, i) => {
            const codigos = [];
            if (g.cid11) codigos.push(`CID-11: ${g.cid11.id}`);
            if (g.dsm5tr) codigos.push(`DSM-5-TR: ${g.dsm5tr.id}`);
            return `
                <div class="autocomplete-item" onclick="window.CortexHipoteses.adicionarCidGrupo(${state.catalogoCidsAgrupado.indexOf(g)})">
                    <strong>${escapeHtml(g.titulo)}</strong>
                    <small>${codigos.join(' · ')}</small>
                </div>
            `;
        }).join('');
        dropdown.style.display = 'block';
    }

    function esconderAutocompleteCids() {
        const dropdown = document.getElementById('autocomplete-cids');
        if (dropdown) dropdown.style.display = 'none';
    }

    function mostrarAutocompleteInstrumentos(termo) {
        const dropdown = document.getElementById('autocomplete-instrumentos');
        if (!dropdown) return;

        const t = normalizarTexto(termo);
        const limite = 10;

        let resultados = state.catalogoInstrumentos;
        if (t.length > 0) {
            resultados = state.catalogoInstrumentos.filter(i =>
                normalizarTexto(i.sigla).includes(t) ||
                normalizarTexto(i.nome_completo).includes(t) ||
                normalizarTexto(i.o_que_avalia || '').includes(t)
            );
        }

        resultados = resultados.filter(i => !state.dados.instrumentos_sugeridos.includes(i.id));
        resultados = resultados.slice(0, limite);

        if (resultados.length === 0) {
            dropdown.innerHTML = '<div class="autocomplete-vazio">Nenhum instrumento encontrado.</div>';
            dropdown.style.display = 'block';
            return;
        }

        dropdown.innerHTML = resultados.map(i => `
            <div class="autocomplete-item" onclick="window.CortexHipoteses.adicionarInstrumento('${i.id}')">
                <strong>${escapeHtml(i.sigla)}</strong>
                <small>${escapeHtml(i.nome_completo)}</small>
            </div>
        `).join('');
        dropdown.style.display = 'block';
    }

    function esconderAutocompleteInstrumentos() {
        const dropdown = document.getElementById('autocomplete-instrumentos');
        if (dropdown) dropdown.style.display = 'none';
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
        if (state.registro && state.registro.aprovado_em) return; // bloqueada

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

    async function persistirNoBanco() {
        const payload = {
            paciente_id: state.pacienteId,
            hipoteses_iniciais: state.dados.hipoteses_iniciais || null,
            cids_sugeridos: state.dados.cids_sugeridos,
            justificativa_clinica: state.dados.justificativa_clinica || null,
            plano_avaliacao: state.dados.plano_avaliacao || null,
            instrumentos_sugeridos: state.dados.instrumentos_sugeridos
        };

        if (state.hipoteseId) {
            const { error } = await window.cortexClient
                .from('hipoteses')
                .update(payload)
                .eq('id', state.hipoteseId);
            if (error) throw error;

            await CortexAudit.log('edicao', 'hipoteses', state.hipoteseId, {
                pacienteId: state.pacienteId
            });
        } else {
            payload.preenchido_por = window.cortexProfissional.id;
            const { data, error } = await window.cortexClient
                .from('hipoteses')
                .insert(payload)
                .select()
                .single();
            if (error) throw error;

            state.hipoteseId = data.id;
            state.registro = data;

            await CortexAudit.log('criacao', 'hipoteses', data.id, {
                pacienteId: state.pacienteId
            });
        }
    }

    // ============================================================================
    // AÇÕES PÚBLICAS
    // ============================================================================

    window.CortexHipoteses = {
        adicionarCidGrupo: function(idx) {
            const grupo = state.catalogoCidsAgrupado[idx];
            if (!grupo) return;

            // Adiciona ambos os códigos (CID-11 + DSM-5-TR) se existirem
            if (grupo.cid11 && !state.dados.cids_sugeridos.includes(grupo.cid11.id)) {
                state.dados.cids_sugeridos.push(grupo.cid11.id);
            }
            if (grupo.dsm5tr && !state.dados.cids_sugeridos.includes(grupo.dsm5tr.id)) {
                state.dados.cids_sugeridos.push(grupo.dsm5tr.id);
            }

            const busca = document.getElementById('busca-cid');
            if (busca) busca.value = '';
            esconderAutocompleteCids();
            marcarEditado();
            renderizar();
        },

        removerCid: function(cidId) {
            // Remove esse código E o par (se existir)
            const par = state.catalogoCidsAgrupado.find(g =>
                g.cid11?.id === cidId || g.dsm5tr?.id === cidId
            );
            const idsRemover = par
                ? [par.cid11?.id, par.dsm5tr?.id].filter(Boolean)
                : [cidId];
            state.dados.cids_sugeridos = state.dados.cids_sugeridos.filter(id => !idsRemover.includes(id));
            marcarEditado();
            renderizar();
        },

        adicionarInstrumento: function(uuid) {
            if (!state.dados.instrumentos_sugeridos.includes(uuid)) {
                state.dados.instrumentos_sugeridos.push(uuid);
            }
            const busca = document.getElementById('busca-instrumento');
            if (busca) busca.value = '';
            esconderAutocompleteInstrumentos();
            marcarEditado();
            renderizar();
        },

        removerInstrumento: function(uuid) {
            state.dados.instrumentos_sugeridos = state.dados.instrumentos_sugeridos.filter(id => id !== uuid);
            marcarEditado();
            renderizar();
        },

        aceitarSugestao: function(idx) {
            const sug = state.sugestoes[idx];
            if (!sug) return;

            const par = state.catalogoCidsAgrupado.find(g =>
                g.cid11?.id === sug.cid.id || g.dsm5tr?.id === sug.cid.id
            );

            if (par) {
                if (par.cid11 && !state.dados.cids_sugeridos.includes(par.cid11.id)) {
                    state.dados.cids_sugeridos.push(par.cid11.id);
                }
                if (par.dsm5tr && !state.dados.cids_sugeridos.includes(par.dsm5tr.id)) {
                    state.dados.cids_sugeridos.push(par.dsm5tr.id);
                }
            } else if (!state.dados.cids_sugeridos.includes(sug.cid.id)) {
                state.dados.cids_sugeridos.push(sug.cid.id);
            }

            // Remove da lista de sugestões
            state.sugestoes.splice(idx, 1);
            marcarEditado();
            renderizar();
        },

        salvarManualmente: async function() {
            state.editado = true;
            await salvarSilencioso();
            window.CortexUI.toast('Rascunho salvo', 'success');
        },

        aprovar: async function() {
            if (state.editado) await salvarSilencioso();

            if (!state.hipoteseId) {
                window.CortexUI.toast('Salve um rascunho antes de aprovar.', 'warning');
                return;
            }

            const confirmacao = confirm(
                'Aprovar as hipóteses diagnósticas?\n\n' +
                'Após aprovar, este registro ficará bloqueado para edição. ' +
                'Os dados serão referência para a aplicação dos instrumentos e o laudo.'
            );

            if (!confirmacao) return;

            try {
                const { error } = await window.cortexClient
                    .from('hipoteses')
                    .update({
                        aprovado_por: window.cortexProfissional.id,
                        aprovado_em: new Date().toISOString()
                    })
                    .eq('id', state.hipoteseId);

                if (error) throw error;

                await CortexAudit.log('edicao', 'hipoteses', state.hipoteseId, {
                    pacienteId: state.pacienteId,
                    detalhes: { acao: 'aprovacao' }
                });

                window.CortexUI.toast('Hipóteses aprovadas com sucesso!', 'success');

                setTimeout(() => {
                    window.location.href = `../pacientes/pasta.html?id=${state.pacienteId}`;
                }, 800);

            } catch (err) {
                console.error('Erro ao aprovar:', err);
                window.CortexUI.toast('Erro ao aprovar: ' + err.message, 'danger');
            }
        }
    };

    // ============================================================================
    // UTILS
    // ============================================================================

    function mostrarErro(mensagem) {
        document.getElementById('hipoteses-conteudo').innerHTML = `
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

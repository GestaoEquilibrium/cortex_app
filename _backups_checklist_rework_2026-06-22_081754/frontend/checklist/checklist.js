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
        faixaPaciente: null,           // pre_escolar / escolar / adulto (efetiva)
        faixaPacienteAuto: null,       // Sprint 73: faixa calculada pela idade (pra mostrar aviso quando diferente)
        salvando: false,
        editado: false,
        ehAdmin: false,      // só admin: controla a FAIXA do checklist
        podeEditar: false    // admin + aplicador: controla a MARCAÇÃO (Sprint 78)
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
                carregarHipotese()
            ]);

            determinarFaixaPaciente();
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
            .select('id, sigla, nome_completo, o_que_avalia, dominio_principal, faixa_etaria_min_meses, faixa_etaria_max_meses, faixa_etaria_label, faixas_aplicaveis, sexo_filtro, tipo_respondente, permite_aplicacao_online')
            .order('dominio_principal')
            .order('sigla');

        if (error) throw new Error('Erro ao carregar catálogo: ' + error.message);
        state.catalogo = data || [];
    }

    async function carregarHipotese() {
        const { data, error } = await window.cortexClient
            .from('hipoteses')
            .select('id, instrumentos_sugeridos')
            .eq('paciente_id', state.pacienteId)
            .maybeSingle();

        if (error && error.code !== 'PGRST116') {
            console.warn('Erro ao buscar hipótese:', error);
            return;
        }

        if (data) {
            state.hipoteseId = data.id;
            state.instrumentosSelecionados = data.instrumentos_sugeridos || [];
        }
    }

    function determinarFaixaPaciente() {
        // Sprint 73: respeita override manual (se admin tiver definido)
        const manual = state.paciente.faixa_checklist_manual;
        if (manual === 'pre_escolar' || manual === 'escolar' || manual === 'adulto') {
            state.faixaPaciente = manual;
            state.faixaPacienteAuto = calcularFaixaAuto();
            return;
        }
        const auto = calcularFaixaAuto();
        state.faixaPaciente = auto;
        state.faixaPacienteAuto = auto;
    }

    function calcularFaixaAuto() {
        const idadeAnos = state.paciente.idade_anos;
        if (idadeAnos < 6) return 'pre_escolar';
        if (idadeAnos < 18) return 'escolar';
        return 'adulto';
    }

    function filtrarECategorizar() {
        // Converte sexo do paciente ('Masculino'/'Feminino'/'Outro') para CHAR(1)
        // usado no instrumentos_catalogo.sexo_filtro
        let sexoChar = null;
        if (state.paciente.sexo === 'Masculino') sexoChar = 'M';
        else if (state.paciente.sexo === 'Feminino') sexoChar = 'F';
        // 'Outro' ou null → fica null = só instrumentos sem filtro de sexo

        // Filtra: faixa etária + (sexo_filtro NULL OU sexo_filtro = sexoChar)
        state.catalogoFiltrado = state.catalogo.filter(i => {
            const faixaOk = (i.faixas_aplicaveis || []).includes(state.faixaPaciente);
            if (!faixaOk) return false;
            // Sexo: NULL no instrumento = qualquer paciente. Caso contrário, precisa bater.
            if (i.sexo_filtro === null || i.sexo_filtro === undefined) return true;
            return i.sexo_filtro === sexoChar;
        });

        // Agrupa por dominio_principal (categoria)
        state.agrupado = {};
        state.catalogoFiltrado.forEach(inst => {
            const cat = inst.dominio_principal || 'Outros';
            if (!state.agrupado[cat]) state.agrupado[cat] = [];
            state.agrupado[cat].push(inst);
        });
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

        // Sprint 73: select de faixa (só admin pode trocar). Aviso quando manual ≠ auto.
        const ehManual = state.paciente.faixa_checklist_manual != null;
        const faixaAtual = state.faixaPaciente;
        const faixaAuto = state.faixaPacienteAuto;

        const selectFaixa = state.ehAdmin
            ? `<select id="checklist-faixa-select" class="checklist-faixa-select" title="Faixa do checklist">
                   <option value="pre_escolar" ${faixaAtual === 'pre_escolar' ? 'selected' : ''}>Pré-Escolar</option>
                   <option value="escolar" ${faixaAtual === 'escolar' ? 'selected' : ''}>Escolar</option>
                   <option value="adulto" ${faixaAtual === 'adulto' ? 'selected' : ''}>Adulto</option>
               </select>`
            : `<strong>${FAIXA_LABEL[faixaAtual]}</strong>`;

        const avisoManual = (ehManual && faixaAtual !== faixaAuto)
            ? `<span class="checklist-faixa-aviso" title="A faixa foi alterada manualmente. O padrão para esta idade seria ${FAIXA_LABEL[faixaAuto]}.">
                   ⚠️ Faixa alterada manualmente
                   ${state.ehAdmin ? `<button type="button" class="checklist-faixa-reset" id="checklist-faixa-reset" title="Voltar para a faixa automática">restaurar</button>` : ''}
               </span>`
            : '';

        const cabecalho = `
            <div class="anamnese-cabecalho">
                <div class="anamnese-cabecalho-titulo">
                    <h1>Checklist de Instrumentos — ${escapeHtml(state.paciente.nome_completo)}</h1>
                    <p class="anamnese-cabecalho-sub">
                        ${state.paciente.idade_humanizada} ·
                        Faixa: ${selectFaixa} ${avisoManual} ·
                        ${state.catalogoFiltrado.length} instrumentos disponíveis
                    </p>
                </div>
                <div class="anamnese-cabecalho-acoes">
                    <span class="badge status-info">${totalSelecionados} selecionados</span>
                    <span id="indicador-save" class="indicador-save"></span>
                </div>
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

        container.innerHTML = cabecalho + aviso + lista + navegacao;

        // Sprint 73: bindar select de faixa (só admin)
        if (state.ehAdmin) {
            const sel = document.getElementById('checklist-faixa-select');
            if (sel) sel.addEventListener('change', () => alterarFaixaManualmente(sel.value));
            const btnReset = document.getElementById('checklist-faixa-reset');
            if (btnReset) btnReset.addEventListener('click', () => alterarFaixaManualmente(null));
        }
    }

    // Sprint 73: salva a faixa via RPC (só admin) e re-renderiza
    async function alterarFaixaManualmente(novaFaixa) {
        // novaFaixa = 'pre_escolar' | 'escolar' | 'adulto' | null (null = restaurar automático)
        try {
            const { error } = await window.cortexClient.rpc('definir_faixa_checklist', {
                p_paciente_id: state.paciente.id,
                p_faixa: novaFaixa
            });
            if (error) {
                window.CortexUI.toast('Erro: ' + (error.message || 'falha ao salvar'), 'danger');
                return;
            }
            state.paciente.faixa_checklist_manual = novaFaixa;
            determinarFaixaPaciente();
            filtrarECategorizar();
            renderizar();
            window.CortexUI.toast(novaFaixa
                ? 'Faixa do checklist alterada.'
                : 'Faixa restaurada (automática).', 'success');
        } catch (err) {
            console.error('[checklist] alterarFaixa:', err);
            window.CortexUI.toast('Erro de conexão. Tente novamente.', 'danger');
        }
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
            <label class="checklist-item ${selecionado ? 'selecionado' : ''} ${disabled ? 'disabled' : ''}">
                <input type="checkbox"
                       ${selecionado ? 'checked' : ''}
                       ${disabled ? 'disabled' : ''}
                       onchange="window.CortexChecklist.toggle('${inst.id}', this.checked)">
                <div class="checklist-item-info">
                    <div class="checklist-item-titulo">
                        <strong>${escapeHtml(inst.sigla)}</strong>
                        ${inst.faixa_etaria_label ? `<span class="checklist-item-idade">${escapeHtml(inst.faixa_etaria_label)}</span>` : ''}
                    </div>
                    <div class="checklist-item-descricao">${escapeHtml(inst.o_que_avalia)}</div>
                </div>
                <div class="checklist-item-tip" role="tooltip">
                    <div class="checklist-item-tip-nome">${escapeHtml(inst.nome_completo || inst.sigla)}</div>
                    <div class="checklist-item-tip-meta">${escapeHtml([inst.dominio_principal, inst.faixa_etaria_label, descreverModalidade(inst)].filter(Boolean).join(' · '))}</div>
                    ${inst.o_que_avalia ? `<div class="checklist-item-tip-corpo">${escapeHtml(inst.o_que_avalia)}</div>` : ''}
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

        salvarManualmente: async function() {
            state.editado = true;
            await salvarSilencioso();
            window.CortexUI.toast('Checklist salvo', 'success');
        },

        imprimirPDF: function() {
            gerarConteudoImpressao();
            window.print();
        }
    };

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

        // Classe visual do item
        const checkbox = document.querySelector(`input[onchange*="${uuid}"]`);
        if (checkbox) {
            const label = checkbox.closest('.checklist-item');
            if (label) {
                if (checked) label.classList.add('selecionado');
                else label.classList.remove('selecionado');
            }
        }
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

    async function persistirNoBanco() {
        if (state.hipoteseId) {
            // Atualiza hipótese existente
            const { error } = await window.cortexClient
                .from('hipoteses')
                .update({ instrumentos_sugeridos: state.instrumentosSelecionados })
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
    // IMPRESSÃO PDF — fiel aos PDFs originais da Equilibrium
    // ============================================================================

    // Mapeamento de categorias → bullet color class (usado no PDF)
    const BULLET_CATEGORIA = {
        'Inteligência / Raciocínio': 'bullet-inteligencia',
        'Linguagem / Leitura / Escrita / Matemática': 'bullet-linguagem',
        'Atenção / Memória': 'bullet-atencao',
        'Funções Executivas': 'bullet-funcoes-exec',
        'TEA / Autismo': 'bullet-tea',
        'TDAH / Comportamento': 'bullet-tdah',
        'Humor / Ansiedade / Depressão': 'bullet-humor',
        'Personalidade / Habilidades Sociais / Adaptativo': 'bullet-personalidade',
        'Desenvolvimento Infantil': 'bullet-desenvolvimento',
        'Sensorial': 'bullet-sensorial'
    };

    function svgCataVento(cor) {
        // Cata-vento de 4 pétalas (logo Equilibrium) - cor passada via parâmetro
        return `
            <svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
                <path d="M20 4 C13 8 11 14 14 20 C8 17 2 19 4 26 C8 23 14 23 20 28 C17 22 19 16 26 14 C23 20 23 26 28 32 C25 25 25 19 20 14 C22 20 26 22 32 20 C26 17 22 13 20 8 Z" fill="${cor}"/>
                <circle cx="20" cy="20" r="4.5" fill="${cor}"/>
                <circle cx="20" cy="20" r="2" fill="white"/>
            </svg>
        `;
    }

    function gerarConteudoImpressao() {
        const printArea = document.getElementById('print-area');
        if (!printArea) return;

        const selecionados = state.catalogoFiltrado.filter(i =>
            state.instrumentosSelecionados.includes(i.id)
        );

        // Agrupa selecionados por categoria
        const agrupado = {};
        selecionados.forEach(inst => {
            const cat = inst.dominio_principal || 'Outros';
            if (!agrupado[cat]) agrupado[cat] = [];
            agrupado[cat].push(inst);
        });

        const FAIXA_LABEL = {
            pre_escolar: 'Pré-Escolar',
            escolar: 'Adultos',  // ← no PDF original aparece "Adultos" para a faixa adulta
            adulto: 'Adultos'
        };
        // Mais preciso: ajusta com base no contexto
        const faixaLabel = state.faixaPaciente === 'pre_escolar' ? 'Pré-Escolar'
                         : state.faixaPaciente === 'escolar' ? 'Escolar'
                         : 'Adultos';

        const dataHoje = new Date().toLocaleDateString('pt-BR', {
            day: '2-digit', month: 'long', year: 'numeric'
        });

        const pacienteNome = escapeHtml(state.paciente.nome_completo);
        const pacienteCpf = state.paciente.cpf ? escapeHtml(state.paciente.cpf) : '—';
        const pacienteIdade = escapeHtml(state.paciente.idade_humanizada);

        let html = `
            <div class="print-doc">
                <!-- CABEÇALHO -->
                <div class="print-header">
                    <div class="print-header-logo">
                        <div class="print-logo-mark">${svgCataVento('white')}</div>
                        <div class="print-logo-text-block">
                            <div class="print-logo-title">Equilibrium</div>
                            <div class="print-logo-sub">Neuropsicologia Clínica</div>
                            <div class="print-logo-equipe">EQUIPE CLÍNICA</div>
                        </div>
                    </div>
                    <div class="print-header-right">
                        <div class="print-doc-title">Check List de Instrumentos</div>
                        <div class="print-faixa">Faixa: ${faixaLabel}</div>
                        <div class="print-contador-badge">${selecionados.length} instrumentos selecionados</div>
                    </div>
                </div>

                <!-- BLOCO PACIENTE -->
                <div class="print-paciente-info">
                    <div class="print-paciente-bloco">
                        <div class="print-label">PACIENTE</div>
                        <span class="print-valor">${pacienteNome}</span>
                    </div>
                    <div class="print-paciente-bloco">
                        <div class="print-label">CPF</div>
                        <span class="print-valor">${pacienteCpf}</span>
                    </div>
                    <div class="print-paciente-bloco">
                        <div class="print-label">IDADE</div>
                        <span class="print-valor">${pacienteIdade}</span>
                    </div>
                    <div class="print-paciente-bloco">
                        <div class="print-label">DATA</div>
                        <span class="print-valor print-valor-data">${dataHoje}</span>
                    </div>
                </div>

                <!-- TABELA -->
                <div class="print-tabela-container">
                    <table class="print-tabela">
                        <thead>
                            <tr>
                                <th class="col-check">✓</th>
                                <th class="col-instrumento">INSTRUMENTO</th>
                                <th class="col-avalia">O QUE AVALIA</th>
                                <th class="col-faixa">FAIXA ETÁRIA</th>
                                <th class="col-data">DATA</th>
                            </tr>
                        </thead>
                        <tbody>
        `;

        const ORDEM = ['Inteligência / Raciocínio',
                       'Linguagem / Leitura / Escrita / Matemática',
                       'Atenção / Memória',
                       'Funções Executivas',
                       'TEA / Autismo',
                       'TDAH / Comportamento',
                       'Humor / Ansiedade / Depressão',
                       'Personalidade / Habilidades Sociais / Adaptativo',
                       'Desenvolvimento Infantil',
                       'Sensorial'];

        const categorias = ORDEM.filter(c => agrupado[c]);
        Object.keys(agrupado).forEach(c => { if (!categorias.includes(c)) categorias.push(c); });

        categorias.forEach(cat => {
            const bulletClass = BULLET_CATEGORIA[cat] || 'bullet-personalidade';
            html += `
                <tr class="linha-categoria">
                    <td colspan="5">
                        <span class="bullet-cat ${bulletClass}"></span>${escapeHtml(cat).toUpperCase()}
                    </td>
                </tr>
            `;
            agrupado[cat].forEach(inst => {
                html += `
                    <tr class="linha-teste marcado">
                        <td class="col-check"></td>
                        <td class="col-instrumento">${escapeHtml(inst.sigla)}</td>
                        <td class="col-avalia">${escapeHtml(inst.o_que_avalia)}</td>
                        <td class="col-faixa">${escapeHtml(inst.faixa_etaria_label || '—')}</td>
                        <td class="col-data">__/__/____</td>
                    </tr>
                `;
            });
        });

        html += `
                        </tbody>
                    </table>
                </div>

                <!-- RODAPÉ -->
                <div class="print-footer">
                    <div class="print-footer-logo">
                        ${svgCataVento('white')}
                        <span>Equilibrium Neuropsicologia</span>
                    </div>
                    <div class="print-footer-data">${dataHoje}</div>
                    <div class="print-footer-contador">${selecionados.length} instrumentos selecionados</div>
                </div>
            </div>
        `;

        printArea.innerHTML = html;
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
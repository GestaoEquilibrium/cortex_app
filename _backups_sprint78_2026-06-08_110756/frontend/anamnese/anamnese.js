// ============================================================================
// CORTEX_APP — Lógica do Módulo de Anamnese (FIX para estrutura A1)
// ============================================================================
// Diferença para a versão anterior:
//   - Salva nas 8 colunas JSONB existentes (identificacao, queixa_historico,
//     desenvolvimento, contexto_familiar, historico_escolar, saude_medicacoes,
//     social_emocional, outros_profissionais) em vez de dados_jsonb único.
//   - Status: 'em_andamento' (rascunho) → 'concluida' (finalizada).
//     Esses são os valores do ENUM status_anamnese criado no A1.
//   - Quem finaliza: gravado em preenchido_por (não finalizada_por).
//   - Etapa atual do wizard: localStorage por anamneseId (não no banco).
// ============================================================================

(function() {
    'use strict';

    // Estado em memória
    const state = {
        anamneseId: null,
        pacienteId: null,
        paciente: null,
        anamnese: null,
        faixa: null,
        form: null,
        etapaAtual: 0,
        // dados agora é { col1: {campo:valor}, col2: {...}, ... }
        // uma chave por coluna JSONB do banco
        dados: {},
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
        state.anamneseId = urlParams.get('id');
        state.pacienteId = urlParams.get('paciente');

        if (!state.anamneseId && !state.pacienteId) {
            mostrarErro('Anamnese ou paciente não especificado.');
            return;
        }

        try {
            if (state.anamneseId) {
                await carregarAnamneseExistente();
            } else {
                await iniciarNovaAnamnese();
            }

            atualizarLinkVoltar();
            renderizar();

        } catch (err) {
            console.error('Erro ao carregar:', err);
            mostrarErro('Erro: ' + (err.message || 'desconhecido'));
        }
    });

    function atualizarLinkVoltar() {
        const link = document.getElementById('back-link');
        if (state.pacienteId) {
            link.href = `../pacientes/pasta.html?id=${state.pacienteId}`;
        }
    }

    // ============================================================================
    // CARREGAMENTO
    // ============================================================================

    async function carregarAnamneseExistente() {
        // Busca todas as colunas relevantes
        const cols = CortexAnamneseForms.colunasJsonb();
        const select = ['id', 'paciente_id', 'faixa_etaria', 'status',
                       'preenchido_por', 'created_at', 'updated_at',
                       'aprovado_em', 'aprovado_por', ...cols].join(',');

        const { data: anamnese, error } = await window.cortexClient
            .from('anamneses')
            .select(select)
            .eq('id', state.anamneseId)
            .single();

        if (error || !anamnese) throw new Error('Anamnese não encontrada');

        state.anamnese = anamnese;
        state.pacienteId = anamnese.paciente_id;
        state.faixa = anamnese.faixa_etaria;

        // Reconstrói state.dados a partir das 8 colunas JSONB
        state.dados = {};
        cols.forEach(col => {
            state.dados[col] = anamnese[col] || {};
        });

        // Etapa atual: vem do localStorage (não do banco)
        const chaveEtapa = `cortex_anamnese_etapa_${state.anamneseId}`;
        const etapaSalva = localStorage.getItem(chaveEtapa);
        state.etapaAtual = etapaSalva ? parseInt(etapaSalva, 10) : 0;

        // Carrega paciente
        await carregarPaciente();

        // Carrega formulário
        state.form = CortexAnamneseForms.getForm(state.faixa);
        if (!state.form) throw new Error('Formulário inválido para a faixa: ' + state.faixa);

        // Garante que etapaAtual está dentro do range
        if (state.etapaAtual >= state.form.sects.length) state.etapaAtual = 0;

        await CortexAudit.log('leitura', 'anamneses', state.anamneseId, {
            pacienteId: state.pacienteId
        });
    }

    async function iniciarNovaAnamnese() {
        await carregarPaciente();

        const idadeAnos = state.paciente.idade_anos;
        state.faixa = CortexAnamneseForms.detectarFaixa(idadeAnos);
        state.form = CortexAnamneseForms.getForm(state.faixa);

        // Inicia state.dados com 8 colunas vazias
        const cols = CortexAnamneseForms.colunasJsonb();
        state.dados = {};
        cols.forEach(col => { state.dados[col] = {}; });

        // Sprint 55: identificação (nome, DN, sexo, etc.) agora é puxada do
        // cadastro do paciente em tempo de render (bloco no topo do wizard),
        // não duplicada no JSONB. A coluna `identificacao` recebe apenas
        // 'rel' (relação do respondente) e 'ava' (data da entrevista), que
        // são preenchidos pelo usuário na seção "Sobre esta entrevista".

        state.etapaAtual = 0;
    }

    async function carregarPaciente() {
        const { data: paciente, error } = await window.cortexClient
            .from('vw_pacientes_lista')
            .select('*')
            .eq('id', state.pacienteId)
            .single();

        if (error || !paciente) throw new Error('Paciente não encontrado');
        state.paciente = paciente;
    }

    // ============================================================================
    // RENDERIZAÇÃO
    // ============================================================================

    function renderizar() {
        const container = document.getElementById('anamnese-conteudo');
        const sec = state.form.sects[state.etapaAtual];
        const totalEtapas = state.form.sects.length;
        const eUltima = state.etapaAtual === totalEtapas - 1;
        const ePrimeira = state.etapaAtual === 0;
        const finalizada = state.anamnese && state.anamnese.status === 'concluida';

        const cabecalho = `
            <div class="anamnese-cabecalho">
                <div class="anamnese-cabecalho-titulo">
                    <h1>Anamnese — ${escapeHtml(state.paciente.nome_completo)}</h1>
                    <p class="anamnese-cabecalho-sub">${state.form.icon} ${state.form.tt} · ${state.form.rg}</p>
                </div>
                <div class="anamnese-cabecalho-acoes">
                    ${!finalizada ? `
                        <button class="btn btn-secondary btn-sm" onclick="window.CortexAnamnese.trocarFaixa()">
                            Trocar faixa etária
                        </button>
                    ` : `
                        <span class="badge status-success">✓ Finalizada</span>
                        <button class="btn btn-secondary btn-sm" onclick="window.CortexAnamnese.baixarPDF()">
                            📄 Baixar PDF
                        </button>
                    `}
                    <span id="indicador-save" class="indicador-save"></span>
                </div>
            </div>
        `;

        const progressBar = `
            <div class="wizard-progresso">
                <div class="wizard-progresso-barra">
                    <div class="wizard-progresso-preenchido" style="width: ${((state.etapaAtual + 1) / totalEtapas) * 100}%"></div>
                </div>
                <div class="wizard-progresso-texto">
                    Etapa <strong>${state.etapaAtual + 1}</strong> de <strong>${totalEtapas}</strong> · ${escapeHtml(sec.tt)}
                </div>
            </div>
        `;

        const stepperPills = `
            <div class="wizard-stepper">
                ${state.form.sects.map((s, i) => `
                    <button
                        class="stepper-pill ${i === state.etapaAtual ? 'ativa' : ''} ${i < state.etapaAtual ? 'concluida' : ''}"
                        onclick="window.CortexAnamnese.irParaEtapa(${i})"
                        title="${escapeHtml(s.tt)}"
                    >
                        <span class="stepper-pill-num">${i + 1}</span>
                        <span class="stepper-pill-label">${escapeHtml(s.tt)}</span>
                    </button>
                `).join('')}
            </div>
        `;

        const formularioEtapa = renderizarSecao(sec);

        // Sprint 55: bloco "Identificação do paciente" (read-only) injetado
        // apenas na PRIMEIRA etapa, lendo do cadastro
        const blocoIdentif = ePrimeira ? renderizarBlocoIdentificacao() : '';

        const navegacao = `
            <div class="wizard-navegacao">
                <button
                    class="btn btn-secondary"
                    onclick="window.CortexAnamnese.voltarEtapa()"
                    ${ePrimeira ? 'disabled' : ''}
                >
                    ← Anterior
                </button>

                <div class="wizard-navegacao-direita">
                    ${!finalizada ? `
                        <button class="btn btn-ghost" onclick="window.CortexAnamnese.salvarManualmente()">
                            Salvar rascunho
                        </button>
                    ` : ''}

                    ${eUltima ? `
                        ${!finalizada ? `
                            <button class="btn btn-primary btn-lg" onclick="window.CortexAnamnese.finalizar()">
                                Finalizar anamnese
                            </button>
                        ` : ''}
                    ` : `
                        <button class="btn btn-primary" onclick="window.CortexAnamnese.proximaEtapa()">
                            Próximo →
                        </button>
                    `}
                </div>
            </div>
        `;

        container.innerHTML = cabecalho + progressBar + stepperPills + blocoIdentif + formularioEtapa + navegacao;

        aplicarValoresNosCampos(sec);
        setupCampoListeners(sec);

        if (finalizada) {
            container.querySelectorAll('input, select, textarea').forEach(el => {
                el.disabled = true;
            });
        }
    }

    // Sprint 55: cartão de identificação puxado do cadastro do paciente
    function renderizarBlocoIdentificacao() {
        const p = state.paciente || {};
        const item = (lb, vl) => `
            <div class="anamnese-identif-item">
                <span class="anamnese-identif-label">${escapeHtml(lb)}</span>
                <span class="anamnese-identif-valor">${vl ? escapeHtml(vl) : '<em style="color:#999;">—</em>'}</span>
            </div>
        `;
        const idade = (p.idade_anos !== null && p.idade_anos !== undefined) ? `${p.idade_anos} anos` : '';
        const pais = [p.mae_nome, p.pai_nome].filter(Boolean).join(' / ');
        const medicoLinha = p.medico_referencia
            ? `Dr(a). ${p.medico_referencia}${p.medico_crm ? ` — CRM ${p.medico_crm}` : ''}`
            : '';
        const clinicaLinha = [p.medico_clinica, p.medico_telefone].filter(Boolean).join(' · ');

        return `
            <div class="anamnese-identif-bloco">
                <div class="anamnese-identif-titulo">
                    <span>👤</span>
                    <h3>Identificação do paciente</h3>
                    <a class="anamnese-identif-link" href="../pacientes/novo.html?id=${escapeHtml(state.pacienteId)}">Editar cadastro</a>
                </div>
                <div class="anamnese-identif-grid">
                    ${item('Nome completo', p.nome_completo)}
                    ${item('Data de nascimento', p.data_nascimento)}
                    ${item('Idade', idade)}
                    ${item('Sexo', p.sexo)}
                    ${item('Nome dos pais', pais)}
                    ${item('Cidade', p.cidade)}
                </div>
                <div class="anamnese-identif-divider"></div>
                <div class="anamnese-identif-grid">
                    ${item('Médico solicitante', medicoLinha)}
                    ${item('Clínica e telefone', clinicaLinha)}
                    ${item('Encaminhado por', p.encaminhado_por)}
                </div>
                <p class="anamnese-identif-aviso">
                    ℹ️ Dados puxados automaticamente do cadastro. Se algo estiver incorreto ou em branco, edite o cadastro do paciente.
                </p>
            </div>
        `;
    }

    function renderizarSecao(sec) {
        const gridClass = sec.g3 ? 'fg-grid3' : 'fg-grid2';
        const campos = (sec.g2 || sec.g3 || []).map(f => renderizarCampo(f)).join('');

        return `
            <div class="wizard-etapa">
                <div class="wizard-etapa-header">
                    <div class="wizard-etapa-icone">${sec.ic}</div>
                    <h2 class="wizard-etapa-titulo">${escapeHtml(sec.tt)}</h2>
                </div>
                <div class="${gridClass}">
                    ${campos}
                </div>
            </div>
        `;
    }

    function renderizarCampo(f) {
        const fullClass = f.full ? 'fg-full' : '';
        const reqMark = f.req ? '<span class="required">*</span>' : '';
        const ph = f.ph || '';

        // ---- Sprint 55: bloco informativo (texto estático, não gera input) ----
        if (f.tp === 'info') {
            return `
                <div class="form-group fg-full anamnese-info-bloco">
                    ${f.html || `<p>${escapeHtml(f.lb || '')}</p>`}
                </div>
            `;
        }

        // ---- NOVOS TIPOS Sprint 18 ----
        if (f.tp === 'sn') {
            return `
                <div class="form-group ${fullClass}">
                    <label class="form-label">${escapeHtml(f.lb)} ${reqMark}</label>
                    <div class="ck-grupo">
                        <label class="ck-item">
                            <input type="radio" name="rd-${f.id}" data-campo="${f.id}" data-valor="Sim"><span>Sim</span>
                        </label>
                        <label class="ck-item">
                            <input type="radio" name="rd-${f.id}" data-campo="${f.id}" data-valor="Não"><span>Não</span>
                        </label>
                    </div>
                </div>
            `;
        }

        if (f.tp === 'sn_ta') {
            return `
                <div class="form-group ${fullClass}">
                    <label class="form-label">${escapeHtml(f.lb)} ${reqMark}</label>
                    <div class="ck-grupo">
                        <label class="ck-item">
                            <input type="radio" name="rd-${f.id}" data-campo="${f.id}" data-valor="Sim"><span>Sim</span>
                        </label>
                        <label class="ck-item">
                            <input type="radio" name="rd-${f.id}" data-campo="${f.id}" data-valor="Não"><span>Não</span>
                        </label>
                    </div>
                    <textarea class="form-textarea" data-campo="${f.id}_det" placeholder="${escapeHtml(ph || 'Se sim, descreva...')}" style="margin-top:8px; display:none;"></textarea>
                </div>
            `;
        }

        if (f.tp === 'sel_other') {
            const ops = ['<option value="">Selecione...</option>',
                ...(f.op || []).map(o => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`)].join('');
            return `
                <div class="form-group ${fullClass}">
                    <label class="form-label">${escapeHtml(f.lb)} ${reqMark}</label>
                    <select class="form-select" data-campo="${f.id}">${ops}</select>
                    <input type="text" class="form-input" data-campo="${f.id}_other" placeholder="Qual?" style="margin-top:8px; display:none;">
                </div>
            `;
        }

        if (f.tp === 'cks') {
            const itens = (f.its || []).map((it, i) => `
                <label class="ck-item">
                    <input type="checkbox" data-campo="${f.id}" data-valor="${escapeHtml(it)}">
                    <span>${escapeHtml(it)}</span>
                </label>
            `).join('');
            return `
                <div class="form-group ${fullClass}">
                    <label class="form-label">${escapeHtml(f.lb)} ${reqMark}</label>
                    <div class="ck-grupo">${itens}</div>
                </div>
            `;
        }

        if (f.tp === 'ta') {
            return `
                <div class="form-group ${fullClass}">
                    <label class="form-label">${escapeHtml(f.lb)} ${reqMark}</label>
                    <textarea class="form-textarea" data-campo="${f.id}" placeholder="${escapeHtml(ph)}"></textarea>
                </div>
            `;
        }

        if (f.tp === 'sel') {
            const ops = ['<option value="">Selecione...</option>',
                ...(f.op || []).map(o => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`)].join('');
            return `
                <div class="form-group ${fullClass}">
                    <label class="form-label">${escapeHtml(f.lb)} ${reqMark}</label>
                    <select class="form-select" data-campo="${f.id}">${ops}</select>
                </div>
            `;
        }

        if (f.tp === 'num') {
            const minAttr = f.mn !== undefined ? `min="${f.mn}"` : '';
            const maxAttr = f.mx !== undefined ? `max="${f.mx}"` : '';
            return `
                <div class="form-group ${fullClass}">
                    <label class="form-label">${escapeHtml(f.lb)} ${reqMark}</label>
                    <input type="number" class="form-input" data-campo="${f.id}" placeholder="${escapeHtml(ph)}" ${minAttr} ${maxAttr}>
                </div>
            `;
        }

        if (f.tp === 'date') {
            return `
                <div class="form-group ${fullClass}">
                    <label class="form-label">${escapeHtml(f.lb)} ${reqMark}</label>
                    <input type="date" class="form-input" data-campo="${f.id}">
                </div>
            `;
        }

        return `
            <div class="form-group ${fullClass}">
                <label class="form-label">${escapeHtml(f.lb)} ${reqMark}</label>
                <input type="text" class="form-input" data-campo="${f.id}" placeholder="${escapeHtml(ph)}">
            </div>
        `;
    }

    function aplicarValoresNosCampos(sec) {
        const hoje = new Date().toISOString().split('T')[0];
        const col = sec.col;
        // Sprint 55: seções puramente informativas (boas-vindas) não têm col
        if (!col) return;
        // garante que existe o objeto da coluna
        if (!state.dados[col]) state.dados[col] = {};

        (sec.g2 || sec.g3 || []).forEach(f => {
            // Sprint 55: tipo 'info' é apenas conteúdo estático, ignora
            if (f.tp === 'info') return;

            const valorSalvo = state.dados[col][f.id];

            if (f.tp === 'cks') {
                const checkboxes = document.querySelectorAll(`input[type="checkbox"][data-campo="${f.id}"]`);
                const valoresMarcados = Array.isArray(valorSalvo) ? valorSalvo : [];
                checkboxes.forEach(cb => {
                    cb.checked = valoresMarcados.includes(cb.dataset.valor);
                });
                return;
            }

            // ---- NOVO Sprint 18: sn / sn_ta — radio Sim/Não ----
            if (f.tp === 'sn' || f.tp === 'sn_ta') {
                const radios = document.querySelectorAll(`input[type="radio"][data-campo="${f.id}"]`);
                radios.forEach(r => {
                    r.checked = r.dataset.valor === valorSalvo;
                });
                // sn_ta: mostrar campo de detalhe se valor = Sim
                if (f.tp === 'sn_ta') {
                    const det = document.querySelector(`[data-campo="${f.id}_det"]`);
                    if (det) {
                        det.style.display = (valorSalvo === 'Sim') ? '' : 'none';
                        const detVal = state.dados[col][f.id + '_det'];
                        if (detVal) det.value = detVal;
                    }
                }
                return;
            }

            // ---- NOVO Sprint 18: sel_other ----
            if (f.tp === 'sel_other') {
                const sel = document.querySelector(`select[data-campo="${f.id}"]`);
                const inp = document.querySelector(`input[data-campo="${f.id}_other"]`);
                if (sel && valorSalvo !== undefined) sel.value = valorSalvo;
                if (inp) {
                    inp.style.display = (valorSalvo === 'Outro') ? '' : 'none';
                    const otherVal = state.dados[col][f.id + '_other'];
                    if (otherVal) inp.value = otherVal;
                }
                return;
            }

            const el = document.querySelector(`[data-campo="${f.id}"]`);
            if (!el) return;

            if (f.today && !valorSalvo) {
                el.value = hoje;
                state.dados[col][f.id] = hoje;
                return;
            }

            if (valorSalvo !== undefined && valorSalvo !== null && valorSalvo !== '') {
                el.value = valorSalvo;
            }
        });
    }

    function setupCampoListeners(sec) {
        const col = sec.col;
        if (!col) return;  // Sprint 55: seção informativa
        if (!state.dados[col]) state.dados[col] = {};

        (sec.g2 || sec.g3 || []).forEach(f => {
            // Sprint 55: tipo 'info' não tem listeners
            if (f.tp === 'info') return;

            if (f.tp === 'cks') {
                document.querySelectorAll(`input[type="checkbox"][data-campo="${f.id}"]`).forEach(cb => {
                    cb.addEventListener('change', () => {
                        const marcados = Array.from(
                            document.querySelectorAll(`input[type="checkbox"][data-campo="${f.id}"]:checked`)
                        ).map(c => c.dataset.valor);
                        state.dados[col][f.id] = marcados;
                        marcarEditado();
                    });
                });
                return;
            }

            // ---- NOVO Sprint 18: sn / sn_ta ----
            if (f.tp === 'sn' || f.tp === 'sn_ta') {
                document.querySelectorAll(`input[type="radio"][data-campo="${f.id}"]`).forEach(r => {
                    r.addEventListener('change', () => {
                        if (r.checked) {
                            state.dados[col][f.id] = r.dataset.valor;
                            marcarEditado();
                            if (f.tp === 'sn_ta') {
                                const det = document.querySelector(`[data-campo="${f.id}_det"]`);
                                if (det) det.style.display = (r.dataset.valor === 'Sim') ? '' : 'none';
                            }
                        }
                    });
                });
                if (f.tp === 'sn_ta') {
                    const det = document.querySelector(`[data-campo="${f.id}_det"]`);
                    if (det) {
                        det.addEventListener('input', () => {
                            state.dados[col][f.id + '_det'] = det.value.trim();
                            marcarEditado();
                        });
                    }
                }
                return;
            }

            // ---- NOVO Sprint 18: sel_other ----
            if (f.tp === 'sel_other') {
                const sel = document.querySelector(`select[data-campo="${f.id}"]`);
                const inp = document.querySelector(`input[data-campo="${f.id}_other"]`);
                if (sel) {
                    sel.addEventListener('change', () => {
                        state.dados[col][f.id] = sel.value;
                        marcarEditado();
                        if (inp) inp.style.display = (sel.value === 'Outro') ? '' : 'none';
                    });
                }
                if (inp) {
                    inp.addEventListener('input', () => {
                        state.dados[col][f.id + '_other'] = inp.value.trim();
                        marcarEditado();
                    });
                }
                return;
            }

            const el = document.querySelector(`[data-campo="${f.id}"]`);
            if (!el) return;

            const evento = (f.tp === 'ta' || f.tp === 'text' || f.tp === 'num') ? 'input' : 'change';
            el.addEventListener(evento, () => {
                state.dados[col][f.id] = el.value.trim();
                marcarEditado();
            });
        });
    }

    function marcarEditado() {
        state.editado = true;
        const ind = document.getElementById('indicador-save');
        if (ind) {
            ind.textContent = '● Edições não salvas';
            ind.className = 'indicador-save indicador-save-pendente';
        }

        clearTimeout(autoSaveTimeout);
        autoSaveTimeout = setTimeout(() => {
            salvarSilencioso();
        }, 3000);
    }

    // ============================================================================
    // SALVAMENTO — usa as 8 colunas JSONB
    // ============================================================================

    async function salvarSilencioso() {
        if (!state.editado || state.salvando) return;
        if (state.anamnese && state.anamnese.status === 'concluida') return;

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

    /**
     * Persiste no banco — preenche cada uma das 8 colunas JSONB.
     * NÃO usa dados_jsonb, etapa_atual, criada_por (essas colunas existem
     * mas foram adicionadas por engano e ficam NULL — sem impacto).
     */
    async function persistirNoBanco() {
        const cols = CortexAnamneseForms.colunasJsonb();

        const payload = {
            paciente_id: state.pacienteId,
            faixa_etaria: state.faixa,
            status: 'em_andamento'
        };

        // Preenche as 8 colunas JSONB
        cols.forEach(col => {
            payload[col] = state.dados[col] || {};
        });

        if (state.anamneseId) {
            // UPDATE
            const { error } = await window.cortexClient
                .from('anamneses')
                .update(payload)
                .eq('id', state.anamneseId);

            if (error) throw error;

            await CortexAudit.log('edicao', 'anamneses', state.anamneseId, {
                pacienteId: state.pacienteId
            });

        } else {
            // INSERT
            const { data, error } = await window.cortexClient
                .from('anamneses')
                .insert(payload)
                .select()
                .single();

            if (error) throw error;

            state.anamneseId = data.id;
            state.anamnese = data;

            // Atualiza URL pra refletir o novo ID
            const novaUrl = `${window.location.pathname}?id=${data.id}`;
            window.history.replaceState({}, '', novaUrl);

            await CortexAudit.log('criacao', 'anamneses', data.id, {
                pacienteId: state.pacienteId,
                detalhes: { faixa: state.faixa }
            });
        }

        // Salva etapa_atual no localStorage (não no banco)
        if (state.anamneseId) {
            localStorage.setItem(`cortex_anamnese_etapa_${state.anamneseId}`, String(state.etapaAtual));
        }
    }

    // ============================================================================
    // AÇÕES PÚBLICAS
    // ============================================================================

    window.CortexAnamnese = {
        proximaEtapa: async function() {
            if (state.editado) await salvarSilencioso();
            const total = state.form.sects.length;
            if (state.etapaAtual < total - 1) {
                state.etapaAtual++;
                if (state.anamneseId) {
                    localStorage.setItem(`cortex_anamnese_etapa_${state.anamneseId}`, String(state.etapaAtual));
                }
                renderizar();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        },

        voltarEtapa: async function() {
            if (state.editado) await salvarSilencioso();
            if (state.etapaAtual > 0) {
                state.etapaAtual--;
                if (state.anamneseId) {
                    localStorage.setItem(`cortex_anamnese_etapa_${state.anamneseId}`, String(state.etapaAtual));
                }
                renderizar();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        },

        irParaEtapa: async function(idx) {
            if (state.editado) await salvarSilencioso();
            state.etapaAtual = idx;
            if (state.anamneseId) {
                localStorage.setItem(`cortex_anamnese_etapa_${state.anamneseId}`, String(state.etapaAtual));
            }
            renderizar();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        },

        salvarManualmente: async function() {
            // Força edited true para o save acontecer mesmo sem mudança recente
            state.editado = true;
            await salvarSilencioso();
            window.CortexUI.toast('Rascunho salvo', 'success');
        },

        trocarFaixa: function() {
            if (state.anamnese && state.anamnese.status === 'concluida') return;

            const faixas = CortexAnamneseForms.listarFaixas();
            const escolhaIdx = prompt(
                `Escolha a faixa etária:\n\n${faixas.map((f, i) => `${i+1}. ${f.label}`).join('\n')}\n\nDigite o número:`
            );

            const idx = parseInt(escolhaIdx, 10) - 1;
            if (isNaN(idx) || idx < 0 || idx >= faixas.length) return;

            const novaFaixa = faixas[idx].key;
            if (novaFaixa === state.faixa) return;

            if (!confirm(`Trocar para "${faixas[idx].label}"?\n\nOs dados preenchidos serão preservados, mas alguns campos específicos da faixa atual podem não aparecer no novo formulário.`)) {
                return;
            }

            state.faixa = novaFaixa;
            state.form = CortexAnamneseForms.getForm(novaFaixa);
            state.etapaAtual = 0;
            marcarEditado();
            renderizar();
        },

        finalizar: async function() {
            // Aviso especial sobre sobrescrita
            if (state.editado) await salvarSilencioso();

            const confirmacao = confirm(
                'Tem certeza que deseja finalizar esta anamnese?\n\n' +
                'Após finalizar, a anamnese ficará bloqueada para edição. ' +
                'Os dados ficarão disponíveis para o laudo e para a equipe consultar.'
            );

            if (!confirmacao) return;

            try {
                const { error } = await window.cortexClient
                    .from('anamneses')
                    .update({
                        status: 'concluida',
                        preenchido_por: window.cortexProfissional.id
                    })
                    .eq('id', state.anamneseId);

                if (error) throw error;

                await CortexAudit.log('finalizacao', 'anamneses', state.anamneseId, {
                    pacienteId: state.pacienteId
                });

                window.CortexUI.toast('Anamnese finalizada com sucesso!', 'success');

                // Limpa etapa do localStorage
                localStorage.removeItem(`cortex_anamnese_etapa_${state.anamneseId}`);

                setTimeout(() => {
                    window.location.href = `../pacientes/pasta.html?id=${state.pacienteId}`;
                }, 800);

            } catch (err) {
                console.error('Erro ao finalizar:', err);
                window.CortexUI.toast('Erro ao finalizar: ' + err.message, 'danger');
            }
        },

        // ====================================================================
        // SPRINT 56 — Geração de link público movida para a pasta do paciente
        // (botão "📧 Enviar formulário remoto"). Função gerarLinkPublico removida.
        // ====================================================================

        // ====================================================================
        // SPRINT 18 — Baixar PDF da anamnese (delega para pdf.js)
        // ====================================================================
        baixarPDF: async function() {
            if (!state.anamneseId) {
                window.CortexUI.toast('Salve a anamnese antes de gerar o PDF', 'danger');
                return;
            }
            if (!window.CortexAnamnesePDF) {
                window.CortexUI.toast('Módulo de PDF não carregado. Recarregue a página.', 'danger');
                return;
            }
            try {
                window.CortexUI.toast('Gerando PDF...', 'info');
                await window.CortexAnamnesePDF.gerar(state.anamneseId);
                window.CortexUI.toast('PDF gerado com sucesso!', 'success');
            } catch (err) {
                console.error('Erro ao gerar PDF:', err);
                window.CortexUI.toast('Erro ao gerar PDF: ' + (err.message || err), 'danger');
            }
        }
    };

    // ============================================================================
    // UTILS
    // ============================================================================

    function mostrarErro(mensagem) {
        document.getElementById('anamnese-conteudo').innerHTML = `
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

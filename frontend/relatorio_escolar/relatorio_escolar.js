// ============================================================================
// CORTEX_APP — Módulo de Relatório Escolar (Sprint B4)
// ============================================================================
// Versão simplificada: 1 textarea grande mapeada para `observacoes_educadores`.
// Os outros 15 campos opcionais da tabela ficam NULL.
//
// Estrutura: 1 registro por paciente em `relatorios_escolares`.
// Reaproveita 4 RLS policies já existentes.
// Auto-save 3s após edição.
// ============================================================================

(function() {
    'use strict';

    const state = {
        pacienteId: null,
        paciente: null,
        relatorioId: null,
        registro: null,
        conteudo: '',
        salvando: false,
        editado: false
    };

    let autoSaveTimeout = null;

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
                carregarRelatorioExistente()
            ]);

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

    async function carregarRelatorioExistente() {
        const { data, error } = await window.cortexClient
            .from('relatorios_escolares')
            .select('id, observacoes_educadores, preenchido_por, created_at, updated_at')
            .eq('paciente_id', state.pacienteId)
            .maybeSingle();

        if (error && error.code !== 'PGRST116') {
            console.warn('Erro ao buscar relatório escolar:', error);
            return;
        }

        if (data) {
            state.relatorioId = data.id;
            state.registro = data;
            state.conteudo = data.observacoes_educadores || '';

            await CortexAudit.log('leitura', 'relatorios_escolares', state.relatorioId, {
                pacienteId: state.pacienteId
            });
        }
    }

    function renderizar() {
        const container = document.getElementById('relatorio-conteudo');

        const cabecalho = `
            <div class="anamnese-cabecalho">
                <div class="anamnese-cabecalho-titulo">
                    <h1>Relatório Escolar — ${escapeHtml(state.paciente.nome_completo)}</h1>
                    <p class="anamnese-cabecalho-sub">${state.paciente.idade_humanizada}</p>
                </div>
                <div class="anamnese-cabecalho-acoes">
                    <span id="indicador-save" class="indicador-save"></span>
                </div>
            </div>
        `;

        const conteudo = `
            <div class="form-section">
                <h2 class="form-section-title">📚 Conteúdo do relatório</h2>
                <p class="form-help" style="margin-bottom: 12px;">
                    Cole aqui o conteúdo do relatório que a escola enviou (texto da professora, coordenação pedagógica, etc.).
                </p>
                <div class="form-group">
                    <textarea
                        class="form-textarea relatorio-textarea"
                        id="campo-conteudo"
                        rows="20"
                        placeholder="Cole o conteúdo do relatório escolar aqui..."
                    >${escapeHtml(state.conteudo)}</textarea>
                </div>
            </div>
        `;

        const navegacao = `
            <div class="wizard-navegacao">
                <a href="../pacientes/pasta.html?id=${state.pacienteId}" class="btn btn-secondary">
                    ← Voltar para pasta
                </a>
                <div class="wizard-navegacao-direita">
                    <button class="btn btn-primary" onclick="window.CortexRelatorioEscolar.salvarManualmente()">
                        Salvar
                    </button>
                </div>
            </div>
        `;

        container.innerHTML = cabecalho + conteudo + navegacao;

        setupListeners();
    }

    function setupListeners() {
        const el = document.getElementById('campo-conteudo');
        if (el) {
            el.addEventListener('input', () => {
                state.conteudo = el.value;
                marcarEditado();
            });
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
        const payload = {
            paciente_id: state.pacienteId,
            observacoes_educadores: state.conteudo || null
        };

        if (state.relatorioId) {
            const { error } = await window.cortexClient
                .from('relatorios_escolares')
                .update(payload)
                .eq('id', state.relatorioId);
            if (error) throw error;

            await CortexAudit.log('edicao', 'relatorios_escolares', state.relatorioId, {
                pacienteId: state.pacienteId
            });
        } else {
            payload.preenchido_por = window.cortexProfissional.id;
            const { data, error } = await window.cortexClient
                .from('relatorios_escolares')
                .insert(payload)
                .select()
                .single();
            if (error) throw error;

            state.relatorioId = data.id;
            state.registro = data;

            await CortexAudit.log('criacao', 'relatorios_escolares', data.id, {
                pacienteId: state.pacienteId
            });
        }
    }

    window.CortexRelatorioEscolar = {
        salvarManualmente: async function() {
            state.editado = true;
            await salvarSilencioso();
            window.CortexUI.toast('Relatório salvo', 'success');
        }
    };

    function mostrarErro(mensagem) {
        document.getElementById('relatorio-conteudo').innerHTML = `
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

// ============================================================================
// CORTEX_APP — Módulo Bateria de Aplicação (Sprint D2)
// ============================================================================
// Auto-popula `aplicacoes_instrumento` a partir do checklist
// (instrumentos_sugeridos da tabela hipoteses).
//
// Permissões:
//   - admin_clinico, admin_gestor: criar, editar, deletar
//   - neuropsicologo_aplicador: editar (status, datas, observações)
//   - estagiario, corretor: somente visualizar
//
// Status: aguardando → em_aplicacao → concluido_aplicacao
// (status_aplicacao tem mais valores, mas D2 só usa esses 3 + cancelado*)
// *cancelado não está no enum oficial — usar via observação ou status retorno
// ============================================================================

(function() {
    'use strict';

    const state = {
        pacienteId: null,
        paciente: null,
        hipoteseId: null,
        instrumentosNoChecklist: [],   // UUIDs do checklist
        catalogo: [],                   // catálogo completo
        aplicacoes: [],                 // registros de aplicacoes_instrumento
        profissionais: [],              // dropdown de aplicadores
        agrupado: {},                   // { categoria: [aplicacao + instrumento] }
        filtroStatus: 'todos',          // todos / aguardando / em_aplicacao / concluido_aplicacao
        modalAplicacaoId: null,
        ehAdmin: false,
        ehAplicador: false
    };

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
        state.ehAplicador = (perfil === 'neuropsicologo_aplicador');

        try {
            await Promise.all([
                carregarPaciente(),
                carregarChecklist(),
                carregarCatalogo(),
                carregarProfissionais(),
                carregarAplicacoes()
            ]);

            // Auto-popular: cria registros pra testes do checklist que ainda não têm aplicação
            await sincronizarComChecklist();

            agrupar();
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

    async function carregarChecklist() {
        const { data, error } = await window.cortexClient
            .from('hipoteses')
            .select('id, instrumentos_sugeridos')
            .eq('paciente_id', state.pacienteId)
            .maybeSingle();

        if (error && error.code !== 'PGRST116') {
            console.warn('Erro ao buscar checklist:', error);
            return;
        }

        if (data) {
            state.hipoteseId = data.id;
            state.instrumentosNoChecklist = data.instrumentos_sugeridos || [];
        }
    }

    async function carregarCatalogo() {
        const { data, error } = await window.cortexClient
            .from('instrumentos_catalogo')
            .select('id, sigla, nome_completo, o_que_avalia, dominio_principal, faixa_etaria_label')
            .order('sigla');

        if (error) throw new Error('Erro ao carregar catálogo: ' + error.message);
        state.catalogo = data || [];
    }

    async function carregarProfissionais() {
        const { data, error } = await window.cortexClient
            .from('profissionais')
            .select('id, nome_completo, perfil')
            .eq('ativo', true)
            .in('perfil', ['admin_clinico', 'admin_gestor', 'neuropsicologo_aplicador'])
            .order('nome_completo');

        if (error) {
            console.warn('Erro ao carregar profissionais:', error);
            return;
        }
        state.profissionais = data || [];
    }

    async function carregarAplicacoes() {
        const { data, error } = await window.cortexClient
            .from('aplicacoes_instrumento')
            .select('*')
            .eq('paciente_id', state.pacienteId)
            .order('created_at');

        if (error) throw new Error('Erro ao carregar aplicações: ' + error.message);
        state.aplicacoes = data || [];

        await CortexAudit.log('leitura', 'aplicacoes_instrumento', null, {
            pacienteId: state.pacienteId,
            detalhes: { total: state.aplicacoes.length }
        });
    }

    /**
     * Sincronização adicionar-só:
     * Para cada instrumento no checklist que ainda não tem aplicação criada,
     * cria um registro com status 'aguardando' e modalidade 'presencial'.
     * NUNCA remove registros existentes.
     */
    async function sincronizarComChecklist() {
        if (!state.ehAdmin && !state.ehAplicador) return;
        if (state.instrumentosNoChecklist.length === 0) return;

        const idsComAplicacao = state.aplicacoes.map(a => a.instrumento_id);
        const novos = state.instrumentosNoChecklist.filter(id => !idsComAplicacao.includes(id));

        if (novos.length === 0) return;

        const inserts = novos.map(instId => ({
            paciente_id: state.pacienteId,
            instrumento_id: instId,
            modalidade: 'presencial',  // default
            status: 'aguardando'        // default explícito
        }));

        const { data, error } = await window.cortexClient
            .from('aplicacoes_instrumento')
            .insert(inserts)
            .select();

        if (error) {
            console.error('Erro ao auto-popular bateria:', error);
            return;
        }

        if (data && data.length > 0) {
            state.aplicacoes = [...state.aplicacoes, ...data];
            await CortexAudit.log('criacao', 'aplicacoes_instrumento', null, {
                pacienteId: state.pacienteId,
                detalhes: { acao: 'auto_popular', total: data.length }
            });
            window.CortexUI.toast(`✓ ${data.length} testes carregados do checklist`, 'success');
        }
    }

    function agrupar() {
        state.agrupado = {};
        state.aplicacoes.forEach(apl => {
            const inst = state.catalogo.find(i => i.id === apl.instrumento_id);
            if (!inst) return; // instrumento órfão
            const cat = inst.dominio_principal || 'Outros';
            if (!state.agrupado[cat]) state.agrupado[cat] = [];
            state.agrupado[cat].push({ ...apl, instrumento: inst });
        });
    }

    // ============================================================================
    // RENDERIZAÇÃO
    // ============================================================================

    function renderizar() {
        const container = document.getElementById('bateria-conteudo');

        const stats = calcularStats();

        const cabecalho = `
            <div class="anamnese-cabecalho">
                <div class="anamnese-cabecalho-titulo">
                    <h1>Bateria — ${escapeHtml(state.paciente.nome_completo)}</h1>
                    <p class="anamnese-cabecalho-sub">
                        ${state.paciente.idade_humanizada} ·
                        ${stats.total} ${stats.total === 1 ? 'instrumento' : 'instrumentos'} na bateria
                    </p>
                </div>
                <div class="anamnese-cabecalho-acoes">
                    ${state.ehAdmin || state.ehAplicador ? `
                        <button class="btn btn-ghost btn-sm" onclick="window.CortexBateria.recarregar()">
                            🔄 Sincronizar checklist
                        </button>
                    ` : ''}
                </div>
            </div>
        `;

        if (state.aplicacoes.length === 0) {
            return container.innerHTML = cabecalho + renderEstadoVazio();
        }

        const statsCards = `
            <div class="bateria-stats">
                <button class="bateria-stat ${state.filtroStatus === 'todos' ? 'ativo' : ''}" onclick="window.CortexBateria.filtrar('todos')">
                    <span class="bateria-stat-num">${stats.total}</span>
                    <span class="bateria-stat-label">Todos</span>
                </button>
                <button class="bateria-stat ${state.filtroStatus === 'aguardando' ? 'ativo' : ''}" onclick="window.CortexBateria.filtrar('aguardando')">
                    <span class="bateria-stat-num bateria-stat-aguardando">${stats.aguardando}</span>
                    <span class="bateria-stat-label">Aguardando</span>
                </button>
                <button class="bateria-stat ${state.filtroStatus === 'em_aplicacao' ? 'ativo' : ''}" onclick="window.CortexBateria.filtrar('em_aplicacao')">
                    <span class="bateria-stat-num bateria-stat-aplicando">${stats.em_aplicacao}</span>
                    <span class="bateria-stat-label">Em aplicação</span>
                </button>
                <button class="bateria-stat ${state.filtroStatus === 'concluido_aplicacao' ? 'ativo' : ''}" onclick="window.CortexBateria.filtrar('concluido_aplicacao')">
                    <span class="bateria-stat-num bateria-stat-concluido">${stats.concluido_aplicacao}</span>
                    <span class="bateria-stat-label">Concluídos</span>
                </button>
            </div>
        `;

        const ORDEM = ['Inteligência', 'Desenvolvimento Infantil', 'Atenção/Memória',
                       'Funções Executivas', 'Linguagem', 'TEA/Autismo', 'TDAH',
                       'Humor/Ansiedade', 'Personalidade', 'Sensorial'];

        const categoriasOrdenadas = ORDEM.filter(c => state.agrupado[c]);
        Object.keys(state.agrupado).forEach(c => {
            if (!categoriasOrdenadas.includes(c)) categoriasOrdenadas.push(c);
        });

        const lista = categoriasOrdenadas.map(cat => {
            const filtrados = state.agrupado[cat].filter(a =>
                state.filtroStatus === 'todos' || a.status === state.filtroStatus
            );
            if (filtrados.length === 0) return '';

            return `
                <div class="bateria-categoria">
                    <h2 class="bateria-categoria-title">${escapeHtml(cat)}</h2>
                    <div class="bateria-itens">
                        ${filtrados.map(a => renderItem(a)).join('')}
                    </div>
                </div>
            `;
        }).filter(s => s).join('');

        const navegacao = `
            <div class="wizard-navegacao">
                <a href="../pacientes/pasta.html?id=${state.pacienteId}" class="btn btn-secondary">
                    ← Voltar para pasta
                </a>
            </div>
        `;

        container.innerHTML = cabecalho + statsCards + (lista || renderFiltroVazio()) + navegacao;
    }

    function calcularStats() {
        const stats = { total: state.aplicacoes.length, aguardando: 0, em_aplicacao: 0, concluido_aplicacao: 0 };
        state.aplicacoes.forEach(a => {
            if (stats[a.status] !== undefined) stats[a.status]++;
        });
        return stats;
    }

    function renderEstadoVazio() {
        const totalChecklist = state.instrumentosNoChecklist.length;
        if (totalChecklist === 0) {
            return `
                <div class="etapa-placeholder">
                    <div class="etapa-placeholder-icon">📋</div>
                    <h3>Bateria sem instrumentos</h3>
                    <p style="margin-bottom: 18px;">É necessário primeiro selecionar testes no Checklist (etapa anterior).</p>
                    <a href="../checklist/checklist.html?paciente=${state.pacienteId}" class="btn btn-primary btn-lg">
                        Ir para Checklist
                    </a>
                </div>
            `;
        }
        return `
            <div class="etapa-placeholder">
                <div class="etapa-placeholder-icon">🎯</div>
                <h3>Bateria pronta para iniciar</h3>
                <p style="margin-bottom: 18px;">${totalChecklist} testes selecionados no checklist.<br>Recarregue a página para carregar os testes.</p>
                <button class="btn btn-primary btn-lg" onclick="window.location.reload()">Recarregar</button>
            </div>
        `;
    }

    function renderFiltroVazio() {
        const labels = {
            aguardando: 'aguardando',
            em_aplicacao: 'em aplicação',
            concluido_aplicacao: 'concluídos'
        };
        return `
            <div class="bateria-filtro-vazio">
                Nenhum instrumento ${labels[state.filtroStatus] || ''} no momento.
            </div>
        `;
    }

    function renderItem(apl) {
        const inst = apl.instrumento;
        const podeEditar = state.ehAdmin || state.ehAplicador;
        const aplicador = apl.aplicador_id
            ? state.profissionais.find(p => p.id === apl.aplicador_id)?.nome_completo || '—'
            : null;

        const statusInfo = {
            aguardando: { label: 'Aguardando', class: 'bateria-tag-aguardando', icone: '⏸' },
            em_aplicacao: { label: 'Em aplicação', class: 'bateria-tag-aplicando', icone: '▶' },
            concluido_aplicacao: { label: 'Concluído', class: 'bateria-tag-concluido', icone: '✓' },
            em_correcao: { label: 'Em correção', class: 'bateria-tag-correcao', icone: '🔍' },
            corrigido: { label: 'Corrigido', class: 'bateria-tag-concluido', icone: '✓' },
            integrado_laudo: { label: 'No laudo', class: 'bateria-tag-laudo', icone: '📄' }
        };
        const st = statusInfo[apl.status] || { label: apl.status, class: '', icone: '' };

        return `
            <div class="bateria-item">
                <div class="bateria-item-header">
                    <div class="bateria-item-titulo">
                        <span class="bateria-item-status-icone">${st.icone}</span>
                        <strong>${escapeHtml(inst.sigla)}</strong>
                        <span class="bateria-item-faixa">${escapeHtml(inst.faixa_etaria_label || '—')}</span>
                    </div>
                    <span class="bateria-tag ${st.class}">${st.label}</span>
                </div>
                <div class="bateria-item-descricao">
                    ${escapeHtml(inst.nome_completo)} · <em>${escapeHtml(inst.o_que_avalia)}</em>
                </div>
                <div class="bateria-item-detalhes">
                    <div class="bateria-item-campo">
                        <span class="bateria-item-label">Aplicador:</span>
                        <span class="bateria-item-valor">${aplicador || '—'}</span>
                    </div>
                    <div class="bateria-item-campo">
                        <span class="bateria-item-label">Data prevista:</span>
                        <span class="bateria-item-valor">${formatarData(apl.data_aplicacao)}</span>
                    </div>
                    <div class="bateria-item-campo">
                        <span class="bateria-item-label">Concluído em:</span>
                        <span class="bateria-item-valor">${formatarDataHora(apl.data_conclusao)}</span>
                    </div>
                    <div class="bateria-item-campo">
                        <span class="bateria-item-label">Modalidade:</span>
                        <span class="bateria-item-valor">${apl.modalidade === 'online' ? 'Online' : 'Presencial'}</span>
                    </div>
                </div>
                ${apl.observacoes_aplicacao ? `
                    <div class="bateria-item-obs">
                        <span class="bateria-item-label">Observações:</span> ${escapeHtml(apl.observacoes_aplicacao)}
                    </div>
                ` : ''}
                ${podeEditar ? `
                    <div class="bateria-item-acoes">
                        ${apl.status === 'aguardando' ? `
                            <button class="btn btn-primary btn-sm" onclick="window.CortexBateria.iniciar('${apl.id}')">
                                ▶ Iniciar aplicação
                            </button>
                        ` : ''}
                        ${apl.status === 'em_aplicacao' ? `
                            <button class="btn btn-success btn-sm" onclick="window.CortexBateria.concluir('${apl.id}')">
                                ✓ Concluir
                            </button>
                        ` : ''}
                        <button class="btn btn-ghost btn-sm" onclick="window.CortexBateria.abrirModal('${apl.id}')">
                            ✎ Editar
                        </button>
                        ${state.ehAdmin && (apl.status === 'aguardando' || apl.status === 'em_aplicacao') ? `
                            <button class="btn btn-ghost btn-sm" style="color: var(--color-danger-text);" onclick="window.CortexBateria.deletar('${apl.id}')">
                                🗑 Remover
                            </button>
                        ` : ''}
                    </div>
                ` : ''}
            </div>
        `;
    }

    // ============================================================================
    // AÇÕES
    // ============================================================================

    window.CortexBateria = {
        filtrar: function(status) {
            state.filtroStatus = status;
            renderizar();
        },

        recarregar: async function() {
            try {
                await Promise.all([carregarChecklist(), carregarAplicacoes()]);
                await sincronizarComChecklist();
                agrupar();
                renderizar();
            } catch (err) {
                window.CortexUI.toast('Erro ao sincronizar: ' + err.message, 'danger');
            }
        },

        iniciar: async function(aplicacaoId) {
            const apl = state.aplicacoes.find(a => a.id === aplicacaoId);
            if (!apl) return;

            const updates = {
                status: 'em_aplicacao',
                data_aplicacao: apl.data_aplicacao || new Date().toISOString().split('T')[0],
                aplicador_id: apl.aplicador_id || window.cortexProfissional.id
            };

            await atualizarAplicacao(aplicacaoId, updates);
        },

        concluir: async function(aplicacaoId) {
            if (!confirm('Confirmar conclusão da aplicação?')) return;
            await atualizarAplicacao(aplicacaoId, {
                status: 'concluido_aplicacao',
                data_conclusao: new Date().toISOString()
            });
        },

        deletar: async function(aplicacaoId) {
            const apl = state.aplicacoes.find(a => a.id === aplicacaoId);
            if (!apl) return;
            const inst = state.catalogo.find(i => i.id === apl.instrumento_id);

            if (!confirm(`Remover ${inst?.sigla || 'este teste'} da bateria?\n\nEsta ação não pode ser desfeita.`)) return;

            try {
                const { error } = await window.cortexClient
                    .from('aplicacoes_instrumento')
                    .delete()
                    .eq('id', aplicacaoId);

                if (error) throw error;

                await CortexAudit.log('delecao', 'aplicacoes_instrumento', aplicacaoId, {
                    pacienteId: state.pacienteId,
                    detalhes: { sigla: inst?.sigla }
                });

                state.aplicacoes = state.aplicacoes.filter(a => a.id !== aplicacaoId);
                agrupar();
                renderizar();
                window.CortexUI.toast('Aplicação removida', 'success');
            } catch (err) {
                console.error('Erro ao deletar:', err);
                window.CortexUI.toast('Erro: ' + err.message, 'danger');
            }
        },

        abrirModal: function(aplicacaoId) {
            const apl = state.aplicacoes.find(a => a.id === aplicacaoId);
            if (!apl) return;
            const inst = state.catalogo.find(i => i.id === apl.instrumento_id);

            state.modalAplicacaoId = aplicacaoId;

            const optionsAplicador = ['<option value="">— Não atribuído —</option>']
                .concat(state.profissionais.map(p =>
                    `<option value="${p.id}" ${p.id === apl.aplicador_id ? 'selected' : ''}>
                        ${escapeHtml(p.nome_completo)}
                    </option>`
                )).join('');

            const STATUS_OPTIONS = [
                { v: 'aguardando', l: 'Aguardando' },
                { v: 'em_aplicacao', l: 'Em aplicação' },
                { v: 'concluido_aplicacao', l: 'Concluído' }
            ];
            const optionsStatus = STATUS_OPTIONS.map(s =>
                `<option value="${s.v}" ${s.v === apl.status ? 'selected' : ''}>${s.l}</option>`
            ).join('');

            const optionsModalidade = ['presencial', 'online'].map(m =>
                `<option value="${m}" ${m === apl.modalidade ? 'selected' : ''}>${m === 'presencial' ? 'Presencial' : 'Online'}</option>`
            ).join('');

            document.getElementById('modal-titulo').textContent = `Editar ${inst?.sigla || 'aplicação'}`;
            document.getElementById('modal-body').innerHTML = `
                <div class="form-group">
                    <label>Status</label>
                    <select id="modal-status" class="form-input">${optionsStatus}</select>
                </div>
                <div class="form-group">
                    <label>Aplicador</label>
                    <select id="modal-aplicador" class="form-input">${optionsAplicador}</select>
                </div>
                <div class="form-group">
                    <label>Modalidade</label>
                    <select id="modal-modalidade" class="form-input">${optionsModalidade}</select>
                </div>
                <div class="form-group">
                    <label>Data prevista</label>
                    <input type="date" id="modal-data-aplicacao" class="form-input" value="${apl.data_aplicacao || ''}">
                </div>
                <div class="form-group">
                    <label>Observações</label>
                    <textarea id="modal-observacoes" class="form-textarea" rows="3" placeholder="Observações sobre a aplicação...">${escapeHtml(apl.observacoes_aplicacao || '')}</textarea>
                </div>
                <div class="modal-acoes">
                    <button class="btn btn-secondary" onclick="window.CortexBateria.fecharModal()">Cancelar</button>
                    <button class="btn btn-primary" onclick="window.CortexBateria.salvarModal()">Salvar</button>
                </div>
            `;

            document.getElementById('modal-aplicacao').style.display = 'flex';
        },

        fecharModal: function() {
            document.getElementById('modal-aplicacao').style.display = 'none';
            state.modalAplicacaoId = null;
        },

        salvarModal: async function() {
            const id = state.modalAplicacaoId;
            if (!id) return;

            const novoStatus = document.getElementById('modal-status').value;
            const aplicadorId = document.getElementById('modal-aplicador').value || null;
            const modalidade = document.getElementById('modal-modalidade').value;
            const dataAplicacao = document.getElementById('modal-data-aplicacao').value || null;
            const observacoes = document.getElementById('modal-observacoes').value || null;

            const apl = state.aplicacoes.find(a => a.id === id);
            const updates = {
                status: novoStatus,
                aplicador_id: aplicadorId,
                modalidade: modalidade,
                data_aplicacao: dataAplicacao,
                observacoes_aplicacao: observacoes
            };

            // Se transicionou pra concluido, registra timestamp
            if (novoStatus === 'concluido_aplicacao' && apl.status !== 'concluido_aplicacao') {
                updates.data_conclusao = new Date().toISOString();
            }
            // Se voltou de concluído pra outro, limpa data_conclusao
            if (novoStatus !== 'concluido_aplicacao' && apl.status === 'concluido_aplicacao') {
                updates.data_conclusao = null;
            }

            await atualizarAplicacao(id, updates);
            this.fecharModal();
        }
    };

    async function atualizarAplicacao(aplicacaoId, updates) {
        try {
            const { error } = await window.cortexClient
                .from('aplicacoes_instrumento')
                .update(updates)
                .eq('id', aplicacaoId);

            if (error) throw error;

            await CortexAudit.log('edicao', 'aplicacoes_instrumento', aplicacaoId, {
                pacienteId: state.pacienteId,
                detalhes: { campos: Object.keys(updates) }
            });

            // Atualiza estado local
            const idx = state.aplicacoes.findIndex(a => a.id === aplicacaoId);
            if (idx >= 0) {
                state.aplicacoes[idx] = { ...state.aplicacoes[idx], ...updates };
            }

            agrupar();
            renderizar();
            window.CortexUI.toast('Aplicação atualizada', 'success');
        } catch (err) {
            console.error('Erro ao atualizar:', err);
            window.CortexUI.toast('Erro: ' + err.message, 'danger');
        }
    }

    // ============================================================================
    // UTILS
    // ============================================================================

    function formatarData(iso) {
        if (!iso) return '—';
        const [yyyy, mm, dd] = iso.split('-');
        return `${dd}/${mm}/${yyyy}`;
    }

    function formatarDataHora(iso) {
        if (!iso) return '—';
        const d = new Date(iso);
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yyyy = d.getFullYear();
        const hh = String(d.getHours()).padStart(2, '0');
        const mi = String(d.getMinutes()).padStart(2, '0');
        return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
    }

    function mostrarErro(mensagem) {
        document.getElementById('bateria-conteudo').innerHTML = `
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
})();

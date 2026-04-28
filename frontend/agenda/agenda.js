// ============================================================================
// CORTEX_APP — Módulo Agenda (Sprint C1)
// ============================================================================
// Calendário mensal estilo Google Calendar.
// CRUD de sessões + vinculação automática com aplicações da Bateria.
//
// Permissões:
//   - admin_clinico, admin_gestor, neuropsicologo_aplicador: criar, editar, cancelar
//   - estagiario, corretor: somente visualizar
//
// Tipos de sessão: avaliacao_inicial, aplicacao_testes, devolutiva,
//                  retorno, orientacao_familiar, outros
// Status: agendada, realizada, cancelada, remarcada, falta
// ============================================================================

(function() {
    'use strict';

    const TIPO_LABEL = {
        avaliacao_inicial: 'Avaliação inicial',
        aplicacao_testes: 'Aplicação de testes',
        devolutiva: 'Devolutiva',
        retorno: 'Retorno',
        orientacao_familiar: 'Orientação familiar',
        outros: 'Outros'
    };

    const STATUS_LABEL = {
        agendada: 'Agendada',
        realizada: 'Realizada',
        cancelada: 'Cancelada',
        remarcada: 'Remarcada',
        falta: 'Falta'
    };

    const STATUS_CLASS = {
        agendada: 'sessao-agendada',
        realizada: 'sessao-realizada',
        cancelada: 'sessao-cancelada',
        remarcada: 'sessao-remarcada',
        falta: 'sessao-falta'
    };

    const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                   'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    const DIAS_SEMANA = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

    const state = {
        mesAtual: new Date(),     // primeiro dia do mês visualizado
        sessoes: [],              // sessões do mês
        pacientes: [],            // dropdown
        profissionais: [],        // dropdown
        filtroProfissional: 'todos',
        modalSessaoId: null,      // id quando editando
        ehAdmin: false,
        ehAplicador: false,
        podeEditar: false,
        // Cache pra modal de aplicacao_testes
        aplicacoesPaciente: [],
        // Catálogo pra mostrar nomes dos testes
        catalogo: []
    };

    // ============================================================================
    // INICIALIZAÇÃO
    // ============================================================================

    window.addEventListener('cortex:auth-ready', async () => {
        await CortexSidebar.render('agenda');

        const perfil = window.cortexProfissional?.perfil;
        state.ehAdmin = (perfil === 'admin_clinico' || perfil === 'admin_gestor');
        state.ehAplicador = (perfil === 'neuropsicologo_aplicador');
        state.podeEditar = state.ehAdmin || state.ehAplicador;

        // Mês atual: primeiro dia
        const hoje = new Date();
        state.mesAtual = new Date(hoje.getFullYear(), hoje.getMonth(), 1);

        renderActions();

        try {
            await Promise.all([
                carregarPacientes(),
                carregarProfissionais(),
                carregarCatalogo()
            ]);
            await carregarSessoes();
            renderizar();
        } catch (err) {
            console.error('Erro ao carregar:', err);
            mostrarErro('Erro: ' + (err.message || 'desconhecido'));
        }
    });

    function renderActions() {
        const container = document.getElementById('agenda-actions');
        if (state.podeEditar) {
            container.innerHTML = `
                <button class="btn btn-primary" onclick="window.CortexAgenda.novaSessao()">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="12" y1="5" x2="12" y2="19"/>
                        <line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                    Nova sessão
                </button>
            `;
        }
    }

    async function carregarPacientes() {
        const { data, error } = await window.cortexClient
            .from('vw_pacientes_lista')
            .select('id, nome_completo, idade_humanizada, sexo')
            .order('nome_completo');

        if (error) throw new Error('Erro ao carregar pacientes: ' + error.message);
        state.pacientes = data || [];
    }

    async function carregarProfissionais() {
        const { data, error } = await window.cortexClient
            .from('profissionais')
            .select('id, nome_completo, perfil')
            .eq('ativo', true)
            .in('perfil', ['admin_clinico', 'admin_gestor', 'neuropsicologo_aplicador'])
            .order('nome_completo');

        if (error) throw new Error('Erro ao carregar profissionais: ' + error.message);
        state.profissionais = data || [];
    }

    async function carregarCatalogo() {
        const { data, error } = await window.cortexClient
            .from('instrumentos_catalogo')
            .select('id, sigla, dominio_principal');

        if (error) {
            console.warn('Erro ao carregar catálogo:', error);
            return;
        }
        state.catalogo = data || [];
    }

    async function carregarSessoes() {
        // Busca sessões do mês visualizado (com margem de 1 semana antes/depois pra ver overflow)
        const inicio = new Date(state.mesAtual);
        inicio.setDate(inicio.getDate() - 7);
        const fim = new Date(state.mesAtual);
        fim.setMonth(fim.getMonth() + 1);
        fim.setDate(fim.getDate() + 7);

        let query = window.cortexClient
            .from('sessoes')
            .select('*')
            .gte('data_hora_inicio', inicio.toISOString())
            .lt('data_hora_inicio', fim.toISOString())
            .order('data_hora_inicio');

        if (state.filtroProfissional !== 'todos') {
            query = query.eq('profissional_id', state.filtroProfissional);
        }

        const { data, error } = await query;
        if (error) throw new Error('Erro ao carregar sessões: ' + error.message);
        state.sessoes = data || [];

        await CortexAudit.log('leitura', 'sessoes', null, {
            detalhes: { mes: state.mesAtual.toISOString(), total: state.sessoes.length }
        });
    }

    // ============================================================================
    // RENDERIZAÇÃO DO CALENDÁRIO
    // ============================================================================

    function renderizar() {
        const container = document.getElementById('agenda-conteudo');
        const subtitulo = document.getElementById('agenda-subtitulo');
        subtitulo.textContent = `${state.sessoes.length} ${state.sessoes.length === 1 ? 'sessão' : 'sessões'} no mês visualizado`;

        const ano = state.mesAtual.getFullYear();
        const mes = state.mesAtual.getMonth();

        // Filtros
        const optionsProfissionais = ['<option value="todos">Todos os profissionais</option>']
            .concat(state.profissionais.map(p =>
                `<option value="${p.id}" ${p.id === state.filtroProfissional ? 'selected' : ''}>
                    ${escapeHtml(p.nome_completo)}
                </option>`
            )).join('');

        const filtros = `
            <div class="agenda-controls">
                <div class="agenda-mes-nav">
                    <button class="btn btn-ghost btn-icon" onclick="window.CortexAgenda.mesAnterior()" title="Mês anterior">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
                    </button>
                    <span class="agenda-mes-titulo">${MESES[mes]} ${ano}</span>
                    <button class="btn btn-ghost btn-icon" onclick="window.CortexAgenda.mesPosterior()" title="Próximo mês">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
                    </button>
                    <button class="btn btn-secondary btn-sm" onclick="window.CortexAgenda.irHoje()">Hoje</button>
                </div>
                <div class="agenda-filtros">
                    <select class="form-select" onchange="window.CortexAgenda.filtrarProfissional(this.value)">
                        ${optionsProfissionais}
                    </select>
                </div>
            </div>
        `;

        // Calendário
        const calendario = renderCalendario(ano, mes);

        // Legenda
        const legenda = `
            <div class="agenda-legenda">
                <span class="agenda-legenda-item"><span class="dot sessao-agendada"></span>Agendada</span>
                <span class="agenda-legenda-item"><span class="dot sessao-realizada"></span>Realizada</span>
                <span class="agenda-legenda-item"><span class="dot sessao-cancelada"></span>Cancelada</span>
                <span class="agenda-legenda-item"><span class="dot sessao-remarcada"></span>Remarcada</span>
                <span class="agenda-legenda-item"><span class="dot sessao-falta"></span>Falta</span>
            </div>
        `;

        container.innerHTML = filtros + calendario + legenda;
    }

    function renderCalendario(ano, mes) {
        const primeiroDia = new Date(ano, mes, 1);
        const ultimoDia = new Date(ano, mes + 1, 0);
        const diaSemanaInicial = primeiroDia.getDay(); // 0=domingo
        const totalDias = ultimoDia.getDate();

        // Sessões agrupadas por dia (YYYY-MM-DD)
        const porDia = {};
        state.sessoes.forEach(s => {
            const d = new Date(s.data_hora_inicio);
            const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
            if (!porDia[key]) porDia[key] = [];
            porDia[key].push(s);
        });

        const hoje = new Date();
        const hojeKey = `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}-${String(hoje.getDate()).padStart(2,'0')}`;

        let html = '<div class="agenda-calendario">';

        // Cabeçalho dos dias da semana
        html += '<div class="cal-cabecalho">';
        DIAS_SEMANA.forEach(d => {
            html += `<div class="cal-dia-semana">${d}</div>`;
        });
        html += '</div>';

        // Grid de dias
        html += '<div class="cal-grid">';

        // Dias do mês anterior (preenchimento inicial)
        for (let i = 0; i < diaSemanaInicial; i++) {
            const diaAnterior = new Date(ano, mes, -diaSemanaInicial + i + 1);
            html += `<div class="cal-celula cal-fora-mes">
                <div class="cal-numero">${diaAnterior.getDate()}</div>
            </div>`;
        }

        // Dias do mês atual
        for (let dia = 1; dia <= totalDias; dia++) {
            const dataKey = `${ano}-${String(mes+1).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
            const ehHoje = dataKey === hojeKey;
            const sessoesDoDia = (porDia[dataKey] || []).sort((a, b) =>
                new Date(a.data_hora_inicio) - new Date(b.data_hora_inicio)
            );

            const cliqueVazio = state.podeEditar
                ? `onclick="window.CortexAgenda.novaSessaoNaData('${dataKey}')"`
                : '';

            html += `
                <div class="cal-celula ${ehHoje ? 'cal-hoje' : ''}" data-dia="${dataKey}">
                    <div class="cal-numero" ${sessoesDoDia.length === 0 ? cliqueVazio : ''}>
                        ${dia}
                    </div>
                    <div class="cal-sessoes">
                        ${sessoesDoDia.slice(0, 3).map(s => renderSessaoMini(s)).join('')}
                        ${sessoesDoDia.length > 3 ? `<div class="cal-mais" onclick="window.CortexAgenda.verTodasDoDia('${dataKey}')">+${sessoesDoDia.length - 3} mais</div>` : ''}
                    </div>
                </div>
            `;
        }

        // Dias do próximo mês (completar grid)
        const totalCelulas = diaSemanaInicial + totalDias;
        const restante = (7 - (totalCelulas % 7)) % 7;
        for (let i = 1; i <= restante; i++) {
            html += `<div class="cal-celula cal-fora-mes">
                <div class="cal-numero">${i}</div>
            </div>`;
        }

        html += '</div></div>';
        return html;
    }

    function renderSessaoMini(s) {
        const paciente = state.pacientes.find(p => p.id === s.paciente_id);
        const horario = new Date(s.data_hora_inicio).toLocaleTimeString('pt-BR', {
            hour: '2-digit', minute: '2-digit'
        });
        const cls = STATUS_CLASS[s.status] || '';
        const nome = paciente ? paciente.nome_completo.split(' ')[0] : 'Paciente';

        return `
            <div class="cal-sessao ${cls}" onclick="event.stopPropagation(); window.CortexAgenda.verDetalhes('${s.id}')" title="${horario} · ${escapeHtml(paciente?.nome_completo || '')}">
                <span class="cal-sessao-hora">${horario}</span>
                <span class="cal-sessao-nome">${escapeHtml(nome)}</span>
            </div>
        `;
    }

    // ============================================================================
    // AÇÕES
    // ============================================================================

    window.CortexAgenda = {
        mesAnterior: async function() {
            state.mesAtual = new Date(state.mesAtual.getFullYear(), state.mesAtual.getMonth() - 1, 1);
            await carregarSessoes();
            renderizar();
        },

        mesPosterior: async function() {
            state.mesAtual = new Date(state.mesAtual.getFullYear(), state.mesAtual.getMonth() + 1, 1);
            await carregarSessoes();
            renderizar();
        },

        irHoje: async function() {
            const hoje = new Date();
            state.mesAtual = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
            await carregarSessoes();
            renderizar();
        },

        filtrarProfissional: async function(profId) {
            state.filtroProfissional = profId;
            await carregarSessoes();
            renderizar();
        },

        novaSessao: function() {
            this.abrirModal(null, null);
        },

        novaSessaoNaData: function(dataKey) {
            this.abrirModal(null, dataKey);
        },

        verTodasDoDia: function(dataKey) {
            const sessoesDoDia = state.sessoes
                .filter(s => {
                    const d = new Date(s.data_hora_inicio);
                    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
                    return key === dataKey;
                })
                .sort((a, b) => new Date(a.data_hora_inicio) - new Date(b.data_hora_inicio));

            const [yyyy, mm, dd] = dataKey.split('-');

            const html = sessoesDoDia.map(s => {
                const paciente = state.pacientes.find(p => p.id === s.paciente_id);
                const profissional = state.profissionais.find(p => p.id === s.profissional_id);
                const horarioInicio = new Date(s.data_hora_inicio).toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'});
                const horarioFim = new Date(s.data_hora_fim).toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'});
                return `
                    <div class="lista-sessao-item ${STATUS_CLASS[s.status]}" onclick="window.CortexAgenda.verDetalhes('${s.id}')">
                        <div class="lista-sessao-hora">${horarioInicio}–${horarioFim}</div>
                        <div class="lista-sessao-info">
                            <strong>${escapeHtml(paciente?.nome_completo || 'Paciente')}</strong>
                            <span>${TIPO_LABEL[s.tipo]} · ${escapeHtml(profissional?.nome_completo || '')}</span>
                        </div>
                        <span class="bateria-tag ${STATUS_CLASS[s.status]}">${STATUS_LABEL[s.status]}</span>
                    </div>
                `;
            }).join('');

            document.getElementById('modal-detalhes-titulo').textContent = `Sessões de ${dd}/${mm}/${yyyy}`;
            document.getElementById('modal-detalhes-body').innerHTML = `
                <div class="lista-sessoes">${html}</div>
                <div class="modal-acoes">
                    <button class="btn btn-secondary" onclick="window.CortexAgenda.fecharDetalhes()">Fechar</button>
                </div>
            `;
            document.getElementById('modal-detalhes').style.display = 'flex';
        },

        verDetalhes: function(sessaoId) {
            const s = state.sessoes.find(x => x.id === sessaoId);
            if (!s) return;
            const paciente = state.pacientes.find(p => p.id === s.paciente_id);
            const profissional = state.profissionais.find(p => p.id === s.profissional_id);

            const dataInicio = new Date(s.data_hora_inicio);
            const dataFim = new Date(s.data_hora_fim);
            const dataStr = dataInicio.toLocaleDateString('pt-BR', {weekday:'long',day:'2-digit',month:'long',year:'numeric'});
            const horaInicio = dataInicio.toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'});
            const horaFim = dataFim.toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'});

            document.getElementById('modal-detalhes-titulo').textContent =
                `Sessão · ${TIPO_LABEL[s.tipo]}`;

            document.getElementById('modal-detalhes-body').innerHTML = `
                <div class="detalhes-grid">
                    <div class="detalhes-campo">
                        <span class="detalhes-label">Paciente</span>
                        <span class="detalhes-valor">${escapeHtml(paciente?.nome_completo || '—')}</span>
                    </div>
                    <div class="detalhes-campo">
                        <span class="detalhes-label">Profissional</span>
                        <span class="detalhes-valor">${escapeHtml(profissional?.nome_completo || '—')}</span>
                    </div>
                    <div class="detalhes-campo">
                        <span class="detalhes-label">Data</span>
                        <span class="detalhes-valor">${dataStr}</span>
                    </div>
                    <div class="detalhes-campo">
                        <span class="detalhes-label">Horário</span>
                        <span class="detalhes-valor">${horaInicio} – ${horaFim}</span>
                    </div>
                    <div class="detalhes-campo">
                        <span class="detalhes-label">Tipo</span>
                        <span class="detalhes-valor">${TIPO_LABEL[s.tipo]}</span>
                    </div>
                    <div class="detalhes-campo">
                        <span class="detalhes-label">Status</span>
                        <span class="bateria-tag ${STATUS_CLASS[s.status]}">${STATUS_LABEL[s.status]}</span>
                    </div>
                    ${s.sala ? `<div class="detalhes-campo"><span class="detalhes-label">Sala</span><span class="detalhes-valor">${escapeHtml(s.sala)}</span></div>` : ''}
                    ${s.observacoes ? `<div class="detalhes-campo span-2"><span class="detalhes-label">Observações</span><span class="detalhes-valor">${escapeHtml(s.observacoes)}</span></div>` : ''}
                    ${s.motivo_cancelamento ? `<div class="detalhes-campo span-2"><span class="detalhes-label">Motivo do cancelamento</span><span class="detalhes-valor">${escapeHtml(s.motivo_cancelamento)}</span></div>` : ''}
                </div>
                <div class="modal-acoes">
                    <button class="btn btn-secondary" onclick="window.CortexAgenda.fecharDetalhes()">Fechar</button>
                    ${state.podeEditar && s.status === 'agendada' ? `
                        <button class="btn btn-success btn-sm" onclick="window.CortexAgenda.marcarRealizada('${s.id}')">✓ Marcar realizada</button>
                        <button class="btn btn-ghost btn-sm" onclick="window.CortexAgenda.editarSessao('${s.id}')">✎ Editar</button>
                        <button class="btn btn-danger btn-sm" onclick="window.CortexAgenda.cancelarSessao('${s.id}')">Cancelar</button>
                    ` : ''}
                    ${state.podeEditar && s.status !== 'agendada' && s.status !== 'realizada' ? `
                        <button class="btn btn-ghost btn-sm" onclick="window.CortexAgenda.editarSessao('${s.id}')">✎ Editar</button>
                    ` : ''}
                </div>
            `;
            document.getElementById('modal-detalhes').style.display = 'flex';
        },

        fecharDetalhes: function() {
            document.getElementById('modal-detalhes').style.display = 'none';
        },

        editarSessao: function(sessaoId) {
            this.fecharDetalhes();
            this.abrirModal(sessaoId, null);
        },

        marcarRealizada: async function(sessaoId) {
            if (!confirm('Marcar esta sessão como realizada?')) return;
            try {
                const { error } = await window.cortexClient
                    .from('sessoes')
                    .update({
                        status: 'realizada',
                        realizada_em: new Date().toISOString(),
                        realizada_por: window.cortexProfissional.id
                    })
                    .eq('id', sessaoId);

                if (error) throw error;

                await CortexAudit.log('edicao', 'sessoes', sessaoId, {
                    detalhes: { acao: 'marcar_realizada' }
                });

                this.fecharDetalhes();
                await carregarSessoes();
                renderizar();
                window.CortexUI.toast('Sessão marcada como realizada', 'success');
            } catch (err) {
                window.CortexUI.toast('Erro: ' + err.message, 'danger');
            }
        },

        cancelarSessao: async function(sessaoId) {
            const motivo = prompt('Motivo do cancelamento:');
            if (!motivo) return;

            try {
                const { error } = await window.cortexClient
                    .from('sessoes')
                    .update({
                        status: 'cancelada',
                        motivo_cancelamento: motivo,
                        cancelada_por: window.cortexProfissional.id
                    })
                    .eq('id', sessaoId);

                if (error) throw error;

                await CortexAudit.log('edicao', 'sessoes', sessaoId, {
                    detalhes: { acao: 'cancelar', motivo }
                });

                this.fecharDetalhes();
                await carregarSessoes();
                renderizar();
                window.CortexUI.toast('Sessão cancelada', 'success');
            } catch (err) {
                window.CortexUI.toast('Erro: ' + err.message, 'danger');
            }
        },

        abrirModal: async function(sessaoId, dataKeyDefault) {
            state.modalSessaoId = sessaoId;
            const sessao = sessaoId ? state.sessoes.find(s => s.id === sessaoId) : null;

            const tituloModal = sessao ? 'Editar sessão' : 'Nova sessão';
            document.getElementById('modal-titulo').textContent = tituloModal;

            // Datas default
            let dataDefault, horaInicioDefault, horaFimDefault;
            if (sessao) {
                const di = new Date(sessao.data_hora_inicio);
                const df = new Date(sessao.data_hora_fim);
                dataDefault = `${di.getFullYear()}-${String(di.getMonth()+1).padStart(2,'0')}-${String(di.getDate()).padStart(2,'0')}`;
                horaInicioDefault = `${String(di.getHours()).padStart(2,'0')}:${String(di.getMinutes()).padStart(2,'0')}`;
                horaFimDefault = `${String(df.getHours()).padStart(2,'0')}:${String(df.getMinutes()).padStart(2,'0')}`;
            } else if (dataKeyDefault) {
                dataDefault = dataKeyDefault;
                horaInicioDefault = '14:00';
                horaFimDefault = '15:00';
            } else {
                const hoje = new Date();
                dataDefault = `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}-${String(hoje.getDate()).padStart(2,'0')}`;
                horaInicioDefault = '14:00';
                horaFimDefault = '15:00';
            }

            // Profissional default: se aplicador, trava no próprio
            const profissionalDefault = sessao?.profissional_id
                || (state.ehAplicador ? window.cortexProfissional.id : '');

            const optionsPacientes = ['<option value="">— Selecione —</option>']
                .concat(state.pacientes.map(p =>
                    `<option value="${p.id}" ${p.id === sessao?.paciente_id ? 'selected' : ''}>
                        ${escapeHtml(p.nome_completo)}
                    </option>`
                )).join('');

            const optionsProfissionais = state.ehAplicador
                ? state.profissionais.filter(p => p.id === window.cortexProfissional.id).map(p =>
                    `<option value="${p.id}" selected>${escapeHtml(p.nome_completo)} (você)</option>`
                ).join('')
                : ['<option value="">— Selecione —</option>'].concat(state.profissionais.map(p =>
                    `<option value="${p.id}" ${p.id === profissionalDefault ? 'selected' : ''}>
                        ${escapeHtml(p.nome_completo)}
                    </option>`
                )).join('');

            const optionsTipo = Object.entries(TIPO_LABEL).map(([v, l]) =>
                `<option value="${v}" ${v === sessao?.tipo ? 'selected' : ''}>${l}</option>`
            ).join('');

            const optionsStatus = sessao
                ? Object.entries(STATUS_LABEL).map(([v, l]) =>
                    `<option value="${v}" ${v === sessao.status ? 'selected' : ''}>${l}</option>`
                ).join('')
                : '';

            document.getElementById('modal-body').innerHTML = `
                <div class="form-grid">
                    <div class="form-group span-full">
                        <label class="form-label">Paciente <span class="required">*</span></label>
                        <select id="modal-paciente" class="form-select" onchange="window.CortexAgenda.atualizarVinculacaoTestes()">
                            ${optionsPacientes}
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Profissional <span class="required">*</span></label>
                        <select id="modal-profissional" class="form-select" ${state.ehAplicador ? 'disabled' : ''}>
                            ${optionsProfissionais}
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Tipo de sessão <span class="required">*</span></label>
                        <select id="modal-tipo" class="form-select" onchange="window.CortexAgenda.atualizarVinculacaoTestes()">
                            ${optionsTipo}
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Data <span class="required">*</span></label>
                        <input type="date" id="modal-data" class="form-input" value="${dataDefault}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Horário <span class="required">*</span></label>
                        <div style="display:flex; gap:6px; align-items:center;">
                            <input type="time" id="modal-hora-inicio" class="form-input" value="${horaInicioDefault}">
                            <span style="color:var(--color-text-soft);">até</span>
                            <input type="time" id="modal-hora-fim" class="form-input" value="${horaFimDefault}">
                        </div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Sala</label>
                        <input type="text" id="modal-sala" class="form-input" value="${escapeHtml(sessao?.sala || '')}" placeholder="Ex: Sala 2">
                    </div>
                    ${sessao ? `
                        <div class="form-group">
                            <label class="form-label">Status</label>
                            <select id="modal-status" class="form-select">${optionsStatus}</select>
                        </div>
                    ` : ''}
                    <div class="form-group span-full">
                        <label class="form-label">Observações</label>
                        <textarea id="modal-observacoes" class="form-textarea" rows="2" placeholder="Observações sobre a sessão...">${escapeHtml(sessao?.observacoes || '')}</textarea>
                    </div>
                    <div class="form-group span-full" id="modal-vinculacao-testes" style="display:none;">
                        <label class="form-label">Aplicações da Bateria a vincular</label>
                        <div id="modal-aplicacoes-lista" class="vinculacao-lista">
                            <span class="form-help">Selecione um paciente para ver os testes aguardando.</span>
                        </div>
                    </div>
                </div>
                <div class="modal-acoes">
                    <button class="btn btn-secondary" onclick="window.CortexAgenda.fecharModal()">Cancelar</button>
                    <button class="btn btn-primary" onclick="window.CortexAgenda.salvarModal()">${sessao ? 'Salvar' : 'Criar sessão'}</button>
                </div>
            `;

            document.getElementById('modal-sessao').style.display = 'flex';

            // Atualiza vinculação de testes se já tiver paciente selecionado
            if (sessao?.paciente_id) {
                await this.atualizarVinculacaoTestes();
            }
        },

        atualizarVinculacaoTestes: async function() {
            const pacienteId = document.getElementById('modal-paciente').value;
            const tipo = document.getElementById('modal-tipo').value;
            const containerVinculacao = document.getElementById('modal-vinculacao-testes');
            const lista = document.getElementById('modal-aplicacoes-lista');

            if (!pacienteId || tipo !== 'aplicacao_testes') {
                containerVinculacao.style.display = 'none';
                state.aplicacoesPaciente = [];
                return;
            }

            containerVinculacao.style.display = 'block';
            lista.innerHTML = '<span class="form-help">Carregando testes...</span>';

            // Busca aplicações em status aguardando OU em_aplicacao do paciente
            // Se editando, também inclui as já vinculadas a essa sessão
            const sessaoId = state.modalSessaoId;
            let query = window.cortexClient
                .from('aplicacoes_instrumento')
                .select('id, instrumento_id, status, sessao_id')
                .eq('paciente_id', pacienteId);

            const { data, error } = await query;
            if (error) {
                lista.innerHTML = `<span class="form-error">Erro: ${error.message}</span>`;
                return;
            }

            // Filtra: aguardando + em_aplicacao + já vinculados a essa sessão
            const candidatas = (data || []).filter(a =>
                a.status === 'aguardando' ||
                a.status === 'em_aplicacao' ||
                (sessaoId && a.sessao_id === sessaoId)
            );

            state.aplicacoesPaciente = candidatas;

            if (candidatas.length === 0) {
                lista.innerHTML = '<span class="form-help">Não há testes aguardando aplicação para este paciente. Verifique a Bateria do paciente.</span>';
                return;
            }

            // Renderiza checkboxes (interpretação B: pré-marcados)
            lista.innerHTML = candidatas.map(a => {
                const inst = state.catalogo.find(i => i.id === a.instrumento_id);
                const jaVinculado = a.sessao_id === sessaoId;
                const checked = sessaoId ? (jaVinculado ? 'checked' : '') : 'checked';
                const statusBadge = a.status === 'em_aplicacao' ? ' <span class="vinculacao-badge">em aplicação</span>' : '';
                return `
                    <label class="vinculacao-item">
                        <input type="checkbox" data-aplicacao-id="${a.id}" ${checked}>
                        <span><strong>${escapeHtml(inst?.sigla || '?')}</strong> · ${escapeHtml(inst?.dominio_principal || '')}${statusBadge}</span>
                    </label>
                `;
            }).join('');
        },

        salvarModal: async function() {
            const pacienteId = document.getElementById('modal-paciente').value;
            const profissionalId = document.getElementById('modal-profissional').value;
            const tipo = document.getElementById('modal-tipo').value;
            const data = document.getElementById('modal-data').value;
            const horaInicio = document.getElementById('modal-hora-inicio').value;
            const horaFim = document.getElementById('modal-hora-fim').value;
            const sala = document.getElementById('modal-sala').value || null;
            const observacoes = document.getElementById('modal-observacoes').value || null;
            const statusEl = document.getElementById('modal-status');
            const status = statusEl ? statusEl.value : 'agendada';

            // Validações
            if (!pacienteId) return window.CortexUI.toast('Selecione um paciente', 'danger');
            if (!profissionalId) return window.CortexUI.toast('Selecione um profissional', 'danger');
            if (!data || !horaInicio || !horaFim) return window.CortexUI.toast('Preencha data e horário', 'danger');

            const dataInicio = new Date(`${data}T${horaInicio}:00`);
            const dataFim = new Date(`${data}T${horaFim}:00`);

            if (dataFim <= dataInicio) {
                return window.CortexUI.toast('Hora final deve ser depois da inicial', 'danger');
            }

            // Detecta primeira sessão do paciente
            const ehPrimeira = !state.modalSessaoId &&
                !state.sessoes.some(s => s.paciente_id === pacienteId && s.status !== 'cancelada');

            const dadosSessao = {
                paciente_id: pacienteId,
                profissional_id: profissionalId,
                tipo: tipo,
                data_hora_inicio: dataInicio.toISOString(),
                data_hora_fim: dataFim.toISOString(),
                sala: sala,
                observacoes: observacoes,
                status: status,
                eh_primeira_sessao: ehPrimeira
            };

            // INSERT precisa de agendada_por
            if (!state.modalSessaoId) {
                dadosSessao.agendada_por = window.cortexProfissional.id;
            }

            // Coleta checkboxes da vinculação
            const aplicacoesParaVincular = [];
            const aplicacoesParaDesvincular = [];
            if (tipo === 'aplicacao_testes') {
                const checkboxes = document.querySelectorAll('#modal-aplicacoes-lista input[type="checkbox"]');
                checkboxes.forEach(cb => {
                    const aplicacaoId = cb.dataset.aplicacaoId;
                    const apl = state.aplicacoesPaciente.find(a => a.id === aplicacaoId);
                    if (cb.checked) {
                        aplicacoesParaVincular.push(aplicacaoId);
                    } else if (apl && apl.sessao_id === state.modalSessaoId) {
                        // Desmarcou um que estava vinculado
                        aplicacoesParaDesvincular.push(aplicacaoId);
                    }
                });
            }

            try {
                let sessaoIdFinal = state.modalSessaoId;

                if (state.modalSessaoId) {
                    // UPDATE
                    const { error } = await window.cortexClient
                        .from('sessoes')
                        .update(dadosSessao)
                        .eq('id', state.modalSessaoId);
                    if (error) throw error;

                    await CortexAudit.log('edicao', 'sessoes', state.modalSessaoId, {
                        detalhes: { campos: Object.keys(dadosSessao) }
                    });
                } else {
                    // INSERT
                    const { data: nova, error } = await window.cortexClient
                        .from('sessoes')
                        .insert(dadosSessao)
                        .select()
                        .single();
                    if (error) throw error;

                    sessaoIdFinal = nova.id;
                    await CortexAudit.log('criacao', 'sessoes', nova.id, {
                        pacienteId,
                        detalhes: { tipo, data: dataInicio.toISOString() }
                    });
                }

                // Vincula aplicações selecionadas
                if (aplicacoesParaVincular.length > 0) {
                    const { error: errVinc } = await window.cortexClient
                        .from('aplicacoes_instrumento')
                        .update({
                            sessao_id: sessaoIdFinal,
                            data_aplicacao: data,
                            aplicador_id: profissionalId
                        })
                        .in('id', aplicacoesParaVincular);
                    if (errVinc) console.warn('Erro ao vincular aplicações:', errVinc);
                }

                // Desvincula aplicações desmarcadas (no edit)
                if (aplicacoesParaDesvincular.length > 0) {
                    const { error: errDesv } = await window.cortexClient
                        .from('aplicacoes_instrumento')
                        .update({ sessao_id: null })
                        .in('id', aplicacoesParaDesvincular);
                    if (errDesv) console.warn('Erro ao desvincular:', errDesv);
                }

                this.fecharModal();
                await carregarSessoes();
                renderizar();
                window.CortexUI.toast(state.modalSessaoId ? 'Sessão atualizada' : 'Sessão criada', 'success');
            } catch (err) {
                console.error('Erro ao salvar:', err);
                window.CortexUI.toast('Erro: ' + err.message, 'danger');
            }
        },

        fecharModal: function() {
            document.getElementById('modal-sessao').style.display = 'none';
            state.modalSessaoId = null;
            state.aplicacoesPaciente = [];
        }
    };

    // ============================================================================
    // UTILS
    // ============================================================================

    function mostrarErro(msg) {
        document.getElementById('agenda-conteudo').innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                </div>
                <div class="empty-state-title">${escapeHtml(msg)}</div>
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

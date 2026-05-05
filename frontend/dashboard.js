// ============================================================================
// CORTEX_APP — Dashboard
// ============================================================================
// Tela inicial pós-login. Resumo operacional do dia/semana.
//
// Conteúdo:
//   1. Cards superiores (4): pacientes ativos / sessões hoje / aplicações pendentes / laudos no mês
//   2. Próximas sessões (próximos 7 dias)
//   3. Pacientes em atendimento (com status)
//   4. Atalhos rápidos
// ============================================================================

(function () {
    'use strict';

    const state = {
        profissional: null,
        metricas: null,
        proximasSessoes: [],
        pacientesAtivos: [],
    };

    window.addEventListener('cortex:auth-ready', async () => {
        await CortexSidebar.render('dashboard');

        state.profissional = window.cortexProfissional;
        atualizarSaudacao();

        try {
            await Promise.all([
                carregarMetricas(),
                carregarProximasSessoes(),
                carregarPacientesAtivos(),
            ]);
            renderizar();
        } catch (err) {
            console.error('[dashboard] erro:', err);
            mostrarErro(err.message || 'Erro ao carregar dashboard');
        }
    });

    function atualizarSaudacao() {
        const hora = new Date().getHours();
        let saudacao = 'Bom dia';
        if (hora >= 12 && hora < 18) saudacao = 'Boa tarde';
        else if (hora >= 18) saudacao = 'Boa noite';

        const primeiroNome = (state.profissional?.nome_completo || '').split(' ')[0] || 'profissional';
        document.getElementById('dash-titulo').textContent = `${saudacao}, ${primeiroNome}!`;

        const hoje = new Date().toLocaleDateString('pt-BR', {
            weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
        });
        document.getElementById('dash-subtitulo').textContent =
            hoje.charAt(0).toUpperCase() + hoje.slice(1);
    }

    // ────────────────────────────────────────────────────────────────────────
    // Carregamento
    // ────────────────────────────────────────────────────────────────────────

    async function carregarMetricas() {
        // 1. Pacientes ativos (status != arquivado)
        const { count: totalPacientes } = await window.cortexClient
            .from('pacientes')
            .select('id', { count: 'exact', head: true })
            .neq('status', 'arquivado');

        // 2. Sessões hoje
        const inicioHoje = new Date(); inicioHoje.setHours(0, 0, 0, 0);
        const fimHoje = new Date(); fimHoje.setHours(23, 59, 59, 999);
        const { count: sessoesHoje } = await window.cortexClient
            .from('sessoes')
            .select('id', { count: 'exact', head: true })
            .gte('data_hora_inicio', inicioHoje.toISOString())
            .lte('data_hora_inicio', fimHoje.toISOString());

        // 3. Aplicações pendentes de correção
        // (status nos estados pré-corrigido: aguardando, em_aplicacao, concluido_aplicacao, em_correcao)
        const { count: aplicacoesPendentes } = await window.cortexClient
            .from('aplicacoes_instrumento')
            .select('id', { count: 'exact', head: true })
            .in('status', ['aguardando', 'em_aplicacao', 'concluido_aplicacao', 'em_correcao']);

        // 4. Laudos finalizados este mês
        const inicioMes = new Date(); inicioMes.setDate(1); inicioMes.setHours(0, 0, 0, 0);
        const { count: laudosMes } = await window.cortexClient
            .from('laudos_paciente')
            .select('id', { count: 'exact', head: true })
            .gte('created_at', inicioMes.toISOString());

        state.metricas = {
            pacientesAtivos: totalPacientes || 0,
            sessoesHoje: sessoesHoje || 0,
            aplicacoesPendentes: aplicacoesPendentes || 0,
            laudosMes: laudosMes || 0,
        };
    }

    async function carregarProximasSessoes() {
        const agora = new Date();
        const fim = new Date();
        fim.setDate(fim.getDate() + 7);

        const { data, error } = await window.cortexClient
            .from('sessoes')
            .select('id, data_hora_inicio, data_hora_fim, tipo, status, paciente_id, profissional_id, observacoes')
            .gte('data_hora_inicio', agora.toISOString())
            .lt('data_hora_inicio', fim.toISOString())
            .order('data_hora_inicio')
            .limit(8);

        if (error) {
            console.warn('[dashboard] sessões:', error);
            state.proximasSessoes = [];
            return;
        }

        // Hidrata nomes (paciente e profissional)
        const sessoes = data || [];
        if (sessoes.length === 0) { state.proximasSessoes = []; return; }

        const pacIds = [...new Set(sessoes.map(s => s.paciente_id).filter(Boolean))];
        const profIds = [...new Set(sessoes.map(s => s.profissional_id).filter(Boolean))];

        const [pacRes, profRes] = await Promise.all([
            pacIds.length ? window.cortexClient.from('pacientes').select('id, nome_completo').in('id', pacIds) : { data: [] },
            profIds.length ? window.cortexClient.from('profissionais').select('id, nome_completo').in('id', profIds) : { data: [] },
        ]);

        const pacMap = new Map((pacRes.data || []).map(p => [p.id, p.nome_completo]));
        const profMap = new Map((profRes.data || []).map(p => [p.id, p.nome_completo]));

        state.proximasSessoes = sessoes.map(s => ({
            ...s,
            paciente_nome: pacMap.get(s.paciente_id) || '—',
            profissional_nome: profMap.get(s.profissional_id) || '—',
        }));
    }

    async function carregarPacientesAtivos() {
        // Pacientes em status de avaliação/laudo (não arquivados, não entregues)
        const statusAtivos = [
            'cadastrado', 'em_avaliacao', 'pronto_para_laudo',
            'laudo_pronto', 'devolutiva_agendada'
        ];

        const { data, error } = await window.cortexClient
            .from('vw_pacientes_lista')
            .select('id, nome_completo, idade_humanizada, sexo, status, foto_url, updated_at')
            .in('status', statusAtivos)
            .order('updated_at', { ascending: false })
            .limit(6);

        if (error) {
            console.warn('[dashboard] pacientes ativos:', error);
            state.pacientesAtivos = [];
            return;
        }

        const pacientes = data || [];

        // Busca URLs assinadas pras fotos (em paralelo)
        await Promise.all(pacientes.map(async (p) => {
            if (p.foto_url && window.CortexAvatar) {
                try {
                    p._signedUrl = await window.CortexAvatar.buscarUrlAssinada(p.id, p.foto_url);
                } catch (_) {
                    p._signedUrl = null;
                }
            }
        }));

        state.pacientesAtivos = pacientes;
    }

    // ────────────────────────────────────────────────────────────────────────
    // Render
    // ────────────────────────────────────────────────────────────────────────

    function renderizar() {
        const cont = document.getElementById('dash-conteudo');
        cont.innerHTML = `
            ${renderCards()}
            <div class="dash-grid">
                <div class="dash-col-principal">
                    ${renderProximasSessoes()}
                    ${renderPacientesAtivos()}
                </div>
                <div class="dash-col-lateral">
                    ${renderAtalhos()}
                </div>
            </div>
        `;
    }

    function renderCards() {
        const m = state.metricas;
        return `
            <div class="dash-cards">
                <a href="pacientes/lista.html" class="dash-card dash-card-azul">
                    <div class="dash-card-icone">👥</div>
                    <div class="dash-card-info">
                        <div class="dash-card-num">${m.pacientesAtivos}</div>
                        <div class="dash-card-label">Pacientes ativos</div>
                    </div>
                </a>

                <a href="agenda/agenda.html" class="dash-card dash-card-roxo">
                    <div class="dash-card-icone">📅</div>
                    <div class="dash-card-info">
                        <div class="dash-card-num">${m.sessoesHoje}</div>
                        <div class="dash-card-label">Sessões hoje</div>
                    </div>
                </a>

                <div class="dash-card dash-card-laranja">
                    <div class="dash-card-icone">⏳</div>
                    <div class="dash-card-info">
                        <div class="dash-card-num">${m.aplicacoesPendentes}</div>
                        <div class="dash-card-label">Aplicações pendentes</div>
                    </div>
                </div>

                <div class="dash-card dash-card-verde">
                    <div class="dash-card-icone">📄</div>
                    <div class="dash-card-info">
                        <div class="dash-card-num">${m.laudosMes}</div>
                        <div class="dash-card-label">Laudos este mês</div>
                    </div>
                </div>
            </div>
        `;
    }

    function renderProximasSessoes() {
        const sessoes = state.proximasSessoes;

        if (sessoes.length === 0) {
            return `
                <div class="dash-bloco">
                    <div class="dash-bloco-header">
                        <h3>📅 Próximas sessões</h3>
                        <a href="agenda/agenda.html" class="dash-link">Ver agenda →</a>
                    </div>
                    <div class="dash-empty">
                        <p>Nenhuma sessão agendada nos próximos 7 dias.</p>
                        <a href="agenda/agenda.html" class="btn btn-secondary btn-sm">Abrir agenda</a>
                    </div>
                </div>
            `;
        }

        return `
            <div class="dash-bloco">
                <div class="dash-bloco-header">
                    <h3>📅 Próximas sessões</h3>
                    <a href="agenda/agenda.html" class="dash-link">Ver agenda →</a>
                </div>
                <div class="dash-sessoes-lista">
                    ${sessoes.map(s => renderSessaoLinha(s)).join('')}
                </div>
            </div>
        `;
    }

    function renderSessaoLinha(s) {
        const d = new Date(s.data_hora_inicio);
        const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
        const dataSessao = new Date(d); dataSessao.setHours(0, 0, 0, 0);
        const diffDias = Math.round((dataSessao - hoje) / 86400000);

        let dataLabel;
        if (diffDias === 0) dataLabel = 'Hoje';
        else if (diffDias === 1) dataLabel = 'Amanhã';
        else dataLabel = d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });

        const horaLabel = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

        const tipoLabels = {
            'avaliacao': 'Avaliação',
            'devolutiva': 'Devolutiva',
            'reavaliacao': 'Reavaliação',
            'orientacao': 'Orientação',
            'aplicacao_teste': 'Aplicação de teste',
        };
        const tipoLabel = tipoLabels[s.tipo] || s.tipo || 'Sessão';

        return `
            <a href="pacientes/pasta.html?id=${s.paciente_id}" class="dash-sessao-item">
                <div class="dash-sessao-data">
                    <div class="dash-sessao-dia">${escapeHtml(dataLabel)}</div>
                    <div class="dash-sessao-hora">${escapeHtml(horaLabel)}</div>
                </div>
                <div class="dash-sessao-info">
                    <div class="dash-sessao-paciente">${escapeHtml(s.paciente_nome)}</div>
                    <div class="dash-sessao-meta">${escapeHtml(tipoLabel)} · ${escapeHtml(s.profissional_nome)}</div>
                </div>
            </a>
        `;
    }

    function renderPacientesAtivos() {
        const pacs = state.pacientesAtivos;

        if (pacs.length === 0) {
            return `
                <div class="dash-bloco">
                    <div class="dash-bloco-header">
                        <h3>👥 Pacientes em atendimento</h3>
                        <a href="pacientes/lista.html" class="dash-link">Ver todos →</a>
                    </div>
                    <div class="dash-empty">
                        <p>Nenhum paciente em atendimento ativo.</p>
                        <a href="pacientes/novo.html" class="btn btn-secondary btn-sm">+ Novo paciente</a>
                    </div>
                </div>
            `;
        }

        return `
            <div class="dash-bloco">
                <div class="dash-bloco-header">
                    <h3>👥 Pacientes em atendimento</h3>
                    <a href="pacientes/lista.html" class="dash-link">Ver todos →</a>
                </div>
                <div class="dash-pacientes-grid">
                    ${pacs.map(p => renderPacienteCard(p)).join('')}
                </div>
            </div>
        `;
    }

    function renderPacienteCard(p) {
        const statusLabel = window.CortexUI.STATUS_LABELS[p.status] || p.status;
        const statusClass = window.CortexUI.STATUS_CLASSES[p.status] || 'status-info';

        const avatarHtml = window.CortexAvatar
            ? window.CortexAvatar.render(p, { tamanho: 'md', signedUrl: p._signedUrl || null })
            : `<div class="avatar-fallback">${escapeHtml((p.nome_completo || '?').charAt(0))}</div>`;

        return `
            <a href="pacientes/pasta.html?id=${p.id}" class="dash-paciente-card">
                <div class="dash-paciente-avatar">${avatarHtml}</div>
                <div class="dash-paciente-info">
                    <div class="dash-paciente-nome">${escapeHtml(p.nome_completo)}</div>
                    <div class="dash-paciente-meta">${escapeHtml(p.idade_humanizada || '—')} · ${escapeHtml(p.sexo || '—')}</div>
                    <span class="badge ${statusClass}" style="font-size: 10px;">${escapeHtml(statusLabel)}</span>
                </div>
            </a>
        `;
    }

    function renderAtalhos() {
        return `
            <div class="dash-bloco">
                <div class="dash-bloco-header">
                    <h3>⚡ Atalhos</h3>
                </div>
                <div class="dash-atalhos">
                    <a href="pacientes/novo.html" class="dash-atalho">
                        <span class="dash-atalho-icone">➕</span>
                        <span class="dash-atalho-label">Novo paciente</span>
                    </a>
                    <a href="pacientes/lista.html" class="dash-atalho">
                        <span class="dash-atalho-icone">📋</span>
                        <span class="dash-atalho-label">Lista de pacientes</span>
                    </a>
                    <a href="agenda/agenda.html" class="dash-atalho">
                        <span class="dash-atalho-icone">📅</span>
                        <span class="dash-atalho-label">Agenda</span>
                    </a>
                </div>

                <div class="dash-bloco-header" style="margin-top: 18px;">
                    <h3>👤 Meu perfil</h3>
                </div>
                <div class="dash-perfil-mini">
                    <div class="dash-perfil-nome">${escapeHtml(state.profissional?.nome_completo || '—')}</div>
                    <div class="dash-perfil-meta">${escapeHtml(state.profissional?.email || '')}</div>
                    ${state.profissional?.perfil ? `
                        <span class="badge status-info" style="margin-top: 6px; font-size: 10px;">
                            ${escapeHtml(window.CortexUI.PERFIL_LABELS?.[state.profissional.perfil] || state.profissional.perfil)}
                        </span>
                    ` : ''}
                </div>
            </div>
        `;
    }

    function mostrarErro(msg) {
        document.getElementById('dash-conteudo').innerHTML = `
            <div class="dash-empty" style="padding: 60px 20px; color: var(--color-danger-text);">
                <p style="font-size: 16px;">${escapeHtml(msg)}</p>
            </div>
        `;
    }

    function escapeHtml(text) {
        if (text == null) return '';
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }

})();

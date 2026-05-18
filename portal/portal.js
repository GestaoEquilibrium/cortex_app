// ============================================================================
// PORTAL DO PACIENTE — Dashboard
// ============================================================================
// Tudo é filtrado por auth.uid() no banco. RPCs com SECURITY DEFINER + JOIN em
// pacientes.portal_user_id = auth.uid() garantem isolamento. Frontend não
// consegue ver dados de outro paciente.
// ============================================================================

(function() {
    'use strict';

    const client = window.supabase.createClient(
        SUPABASE_CONFIG.url,
        SUPABASE_CONFIG.anonKey
    );

    const state = {
        abaAtiva: 'inicio',
        instrumentos: null,
        agendamentos: null,
        laudos: null,
        carregado: false
    };

    // ─── BOOT ─────────────────────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', async () => {
        const { data: { session } } = await client.auth.getSession();
        if (!session) {
            window.location.href = './login.html';
            return;
        }

        const meta = session.user?.user_metadata || {};
        const nome = meta.nome || 'Paciente';
        const primeiroNome = nome.split(' ')[0];

        document.getElementById('saudacao-h1').textContent = `Olá, ${primeiroNome}!`;

        bindHeader();
        bindTabBar();
        bindCardsResumo();

        await carregarTudo();
    });

    // ─── BINDINGS ─────────────────────────────────────────────────────────
    function bindHeader() {
        document.getElementById('btn-sair').addEventListener('click', logout);
        document.getElementById('btn-trocar-senha').addEventListener('click', () => {
            window.location.href = './trocar_senha.html';
        });
    }

    function bindTabBar() {
        document.querySelectorAll('.tab-item').forEach(btn => {
            btn.addEventListener('click', () => trocarAba(btn.dataset.tab));
        });
    }

    function bindCardsResumo() {
        document.querySelectorAll('.card-resumo[data-go]').forEach(c => {
            c.addEventListener('click', () => trocarAba(c.dataset.go));
        });
    }

    function trocarAba(tab) {
        if (tab === state.abaAtiva) return;
        state.abaAtiva = tab;

        document.querySelectorAll('.tab-item').forEach(t => {
            t.classList.toggle('is-active', t.dataset.tab === tab);
        });

        document.querySelectorAll('.app-page').forEach(p => {
            p.hidden = p.dataset.page !== tab;
        });

        // Atualiza título do header
        const titulos = {
            inicio: '',
            testes: 'Meus testes',
            agenda: 'Minha agenda',
            laudos: 'Meus laudos'
        };
        const elTitulo = document.getElementById('page-title');
        if (titulos[tab]) {
            elTitulo.textContent = titulos[tab];
            elTitulo.classList.add('visivel');
        } else {
            elTitulo.classList.remove('visivel');
        }

        window.scrollTo({ top: 0, behavior: 'instant' });
    }

    // ─── CARGA INICIAL DOS DADOS ──────────────────────────────────────────
    async function carregarTudo() {
        await Promise.all([
            carregarInstrumentos(),
            carregarAgendamentos(),
            carregarLaudos()
        ]);
        state.carregado = true;
        montarInicio();
    }

    async function carregarInstrumentos() {
        try {
            const { data, error } = await client.rpc('portal_meus_instrumentos');
            if (error) throw error;
            state.instrumentos = data || [];

            const pendentes = state.instrumentos.filter(i => i.status === 'aguardando' || i.status === 'em_aplicacao');
            const concluidos = state.instrumentos.filter(i => i.status === 'corrigido');

            document.getElementById('num-instrumentos').textContent = pendentes.length;
            renderListaTestes(pendentes, concluidos);
        } catch (err) {
            console.error('Erro instrumentos:', err);
            document.getElementById('num-instrumentos').textContent = '–';
        }
    }

    async function carregarAgendamentos() {
        try {
            const { data, error } = await client.rpc('portal_meus_agendamentos');
            if (error) throw error;
            state.agendamentos = data || [];

            document.getElementById('num-agendamentos').textContent = state.agendamentos.length;
            renderListaAgenda(state.agendamentos);
        } catch (err) {
            console.error('Erro agendamentos:', err);
            document.getElementById('num-agendamentos').textContent = '–';
        }
    }

    async function carregarLaudos() {
        try {
            const { data, error } = await client.rpc('portal_meus_laudos');
            if (error) throw error;
            state.laudos = data || [];

            document.getElementById('num-laudos').textContent = state.laudos.length;
            renderListaLaudos(state.laudos);
        } catch (err) {
            console.error('Erro laudos:', err);
            document.getElementById('num-laudos').textContent = '–';
        }
    }

    // ─── ABA INÍCIO ───────────────────────────────────────────────────────
    function montarInicio() {
        const instrumentoBloco = document.getElementById('inicio-instrumento-bloco');
        const agendaBloco = document.getElementById('inicio-agenda-bloco');
        const vazio = document.getElementById('inicio-vazio');

        const pendentes = (state.instrumentos || []).filter(i => i.status === 'aguardando' || i.status === 'em_aplicacao');
        const proxAgendamento = (state.agendamentos || [])[0];

        if (pendentes.length > 0) {
            document.getElementById('inicio-instrumento').innerHTML = renderItemInstrumento(pendentes[0]);
            instrumentoBloco.style.display = 'block';
        } else {
            instrumentoBloco.style.display = 'none';
        }

        if (proxAgendamento) {
            document.getElementById('inicio-agenda').innerHTML = renderItemAgendamento(proxAgendamento);
            agendaBloco.style.display = 'block';
        } else {
            agendaBloco.style.display = 'none';
        }

        vazio.style.display = (pendentes.length === 0 && !proxAgendamento) ? 'block' : 'none';
    }

    // ─── ABA TESTES ───────────────────────────────────────────────────────
    function renderListaTestes(pendentes, concluidos) {
        const blocoPend = document.getElementById('lista-instrumentos-pendentes-bloco');
        const blocoConc = document.getElementById('lista-instrumentos-concluidos-bloco');
        const vazio = document.getElementById('testes-vazio');

        if (pendentes.length > 0) {
            document.getElementById('num-pendentes').textContent = `(${pendentes.length})`;
            document.getElementById('lista-instrumentos-pendentes').innerHTML = pendentes.map(renderItemInstrumento).join('');
            blocoPend.style.display = 'block';
        } else {
            blocoPend.style.display = 'none';
        }

        if (concluidos.length > 0) {
            document.getElementById('num-concluidos').textContent = `(${concluidos.length})`;
            document.getElementById('lista-instrumentos-concluidos').innerHTML = concluidos.map(renderItemInstrumento).join('');
            blocoConc.style.display = 'block';
        } else {
            blocoConc.style.display = 'none';
        }

        vazio.style.display = (pendentes.length + concluidos.length === 0) ? 'block' : 'none';
    }

    function renderItemInstrumento(item) {
        const isConcluido = item.status === 'corrigido';
        const acao = isConcluido
            ? `<span class="app-item-data">${formatarDataCurta(item.created_at)}</span>`
            : `<button class="btn-acao" onclick="window.location.href='${escapeAttr(item.link_unico || '#')}'">
                   <i class="ti ti-pencil"></i> Responder
               </button>`;

        return `
            <div class="app-item">
                <div class="app-item-info">
                    <div class="app-item-titulo">${escapeHtml(item.sigla)} — ${escapeHtml(resumirNome(item.nome_completo))}</div>
                    <div class="app-item-desc">${escapeHtml(item.o_que_avalia || '')}</div>
                    <div class="app-item-meta">
                        <span class="badge badge-${item.status}">${formatStatus(item.status)}</span>
                        ${!isConcluido ? `<span class="app-item-data">Enviado em ${formatarDataCurta(item.created_at)}</span>` : ''}
                    </div>
                </div>
                <div class="app-item-acao">${acao}</div>
            </div>
        `;
    }

    // ─── ABA AGENDA ───────────────────────────────────────────────────────
    function renderListaAgenda(agendamentos) {
        const bloco = document.getElementById('lista-agenda-bloco');
        const vazio = document.getElementById('agenda-vazio');

        if (agendamentos.length > 0) {
            document.getElementById('num-agenda-prox').textContent = `(${agendamentos.length})`;
            document.getElementById('lista-agenda').innerHTML = agendamentos.map(renderItemAgendamento).join('');
            bloco.style.display = 'block';
            vazio.style.display = 'none';
        } else {
            bloco.style.display = 'none';
            vazio.style.display = 'block';
        }
    }

    function renderItemAgendamento(ag) {
        return `
            <div class="app-item">
                <div class="data-block">
                    <div class="data-block-dia">${formatarDia(ag.inicio_em)}</div>
                    <div class="data-block-mes">${formatarMes(ag.inicio_em)}</div>
                </div>
                <div class="app-item-info">
                    <div class="app-item-titulo">${formatTipoSessao(ag.tipo_sessao)}</div>
                    <div class="app-item-desc">${formatarHora(ag.inicio_em)} · ${escapeHtml(ag.profissional_nome || 'A definir')}</div>
                    <div class="app-item-meta">
                        ${formatModalidadeBadge(ag.modalidade)}
                        ${ag.observacoes ? `<span class="app-item-data">${escapeHtml(ag.observacoes)}</span>` : ''}
                    </div>
                </div>
            </div>
        `;
    }

    // ─── ABA LAUDOS ───────────────────────────────────────────────────────
    function renderListaLaudos(laudos) {
        const bloco = document.getElementById('lista-laudos-bloco');
        const vazio = document.getElementById('laudos-vazio');

        if (laudos.length > 0) {
            document.getElementById('num-laudos-disp').textContent = `(${laudos.length})`;
            document.getElementById('lista-laudos').innerHTML = laudos.map(renderItemLaudo).join('');
            bloco.style.display = 'block';
            vazio.style.display = 'none';
        } else {
            bloco.style.display = 'none';
            vazio.style.display = 'block';
        }
    }

    function renderItemLaudo(l) {
        return `
            <div class="app-item">
                <div class="app-item-info">
                    <div class="app-item-titulo">Laudo Neuropsicológico</div>
                    <div class="app-item-desc">Responsável: ${escapeHtml(l.profissional_nome || '—')}</div>
                    <div class="app-item-meta">
                        <span class="app-item-data">Liberado em ${formatarDataCurta(l.liberado_em)}</span>
                    </div>
                </div>
                <div class="app-item-acao">
                    <button class="btn-acao btn-acao-secundario" onclick="window.baixarLaudo('${escapeAttr(l.laudo_id)}')">
                        <i class="ti ti-download"></i> Baixar
                    </button>
                </div>
            </div>
        `;
    }

    // ─── AÇÕES ────────────────────────────────────────────────────────────
    window.baixarLaudo = async function(laudoId) {
        try {
            await client.rpc('portal_log_acesso', {
                p_acao: 'baixou_laudo',
                p_recurso_id: laudoId,
                p_detalhes: {}
            });
        } catch (e) { /* ignore */ }
        alert('Download de laudo em construção. Em breve disponível.');
    };

    async function logout() {
        try {
            await client.rpc('portal_log_acesso', { p_acao: 'logout', p_recurso_id: null, p_detalhes: {} });
        } catch (e) { /* ignore */ }
        await client.auth.signOut();
        window.location.href = './login.html';
    }

    // ─── HELPERS ──────────────────────────────────────────────────────────
    function escapeHtml(t) {
        if (t == null) return '';
        const div = document.createElement('div');
        div.textContent = String(t);
        return div.innerHTML;
    }

    function escapeAttr(t) {
        return String(t == null ? '' : t).replace(/'/g, "%27").replace(/"/g, "%22");
    }

    function resumirNome(nome) {
        if (!nome) return '';
        if (nome.length > 50) return nome.substring(0, 47) + '...';
        return nome;
    }

    function formatarDataCurta(iso) {
        if (!iso) return '—';
        const s = String(iso).slice(0, 10);
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
        if (m) return `${m[3]}/${m[2]}`;
        return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    }

    function formatarHora(iso) {
        if (!iso) return '';
        return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }

    function formatarDia(iso) {
        return String(new Date(iso).getDate()).padStart(2, '0');
    }

    function formatarMes(iso) {
        const meses = ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];
        return meses[new Date(iso).getMonth()];
    }

    function formatStatus(s) {
        const m = {
            aguardando: 'Aguardando',
            em_aplicacao: 'Em andamento',
            corrigido: 'Concluído'
        };
        return m[s] || s;
    }

    function formatTipoSessao(t) {
        const m = {
            avaliacao_inicial: 'Avaliação inicial',
            aplicacao_testes: 'Aplicação de testes',
            devolutiva: 'Devolutiva',
            retorno: 'Retorno',
            orientacao_familiar: 'Orientação familiar',
            outros: 'Sessão clínica'
        };
        return m[t] || t;
    }

    function formatModalidadeBadge(m) {
        const map = {
            presencial: { icon: 'building-hospital', label: 'Presencial' },
            online: { icon: 'device-laptop', label: 'Online' },
            hibrida: { icon: 'arrows-right-left', label: 'Híbrida' }
        };
        const item = map[m] || { icon: 'point', label: m || '—' };
        return `<span class="badge-modalidade"><i class="ti ti-${item.icon}"></i>${item.label}</span>`;
    }

})();

// ============================================================================
// PORTAL DO PACIENTE — Dashboard (Sprint 37 — isolamento de sessão)
// ============================================================================
// Tudo é filtrado por auth.uid() no banco. RPCs com SECURITY DEFINER + JOIN em
// pacientes.portal_user_id = auth.uid() garantem isolamento. Frontend não
// consegue ver dados de outro paciente.
//
// SPRINT 37 — storageKey isolada: usa 'cortex-portal-auth' pra não colidir
// com a sessão do sistema profissional (que usa a chave default do supabase-js).
// ============================================================================

(function() {
    'use strict';

    const client = window.supabase.createClient(
        SUPABASE_CONFIG.url,
        SUPABASE_CONFIG.anonKey,
        {
            auth: {
                storageKey: 'cortex-portal-auth',
                storage: window.localStorage,
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: false
            }
        }
    );

    const state = {
        nomePaciente: '',
        abaAtiva: 'inicio',
        anamneses: null,        // Sprint 57: anamneses pendentes (tokens)
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

        // Busca dados do paciente DIRETO do banco (não confiar no metadata,
        // que pode estar desatualizado se o nome for editado depois)
        let nome = 'Paciente';
        try {
            const { data } = await client.rpc('portal_meus_dados');
            if (data && data.length > 0) {
                nome = data[0].nome_completo || 'Paciente';
            }
        } catch (e) {
            // fallback: usa o metadata se RPC falhar
            const meta = session.user?.user_metadata || {};
            nome = meta.nome || 'Paciente';
        }
        const primeiroNome = nome.split(' ')[0];
        state.nomePaciente = nome;

        document.getElementById('saudacao-h1').textContent = `Olá, ${primeiroNome}!`;

        bindHeader();
        bindTabBar();
        bindAtalhosInicio();

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

    function bindAtalhosInicio() {
        document.querySelectorAll('.atalho-card[data-go]').forEach(c => {
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
            anamnese: 'Minha anamnese',
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
            carregarAnamneses(),
            carregarInstrumentos(),
            carregarAgendamentos(),
            carregarLaudos()
        ]);
        state.carregado = true;
        montarInicio();
    }

    // Sprint 57: anamneses pendentes do paciente (tokens públicos não usados ainda)
    async function carregarAnamneses() {
        try {
            const { data, error } = await client.rpc('portal_minhas_anamneses_pendentes');
            if (error) throw error;
            state.anamneses = data || [];
            renderListaAnamneses(state.anamneses);
        } catch (err) {
            console.error('Erro anamneses:', err);
            state.anamneses = [];
            renderListaAnamneses([]);
        }
    }

    async function carregarInstrumentos() {
        try {
            const { data, error } = await client.rpc('portal_meus_instrumentos');
            if (error) throw error;
            state.instrumentos = data || [];

            const pendentes = state.instrumentos.filter(i => i.status === 'aguardando' || i.status === 'em_aplicacao');
            const concluidos = state.instrumentos.filter(i => i.status === 'corrigido');

            renderListaTestes(pendentes, concluidos);
        } catch (err) {
            console.error('Erro instrumentos:', err);
        }
    }

    async function carregarAgendamentos() {
        try {
            const { data, error } = await client.rpc('portal_meus_agendamentos');
            if (error) throw error;
            state.agendamentos = data || [];

            renderListaAgenda(state.agendamentos);
        } catch (err) {
            console.error('Erro agendamentos:', err);
        }
    }

    async function carregarLaudos() {
        try {
            const { data, error } = await client.rpc('portal_meus_laudos');
            if (error) throw error;
            state.laudos = data || [];

            renderListaLaudos(state.laudos);
        } catch (err) {
            console.error('Erro laudos:', err);
        }
    }

    // ─── ABA INÍCIO ───────────────────────────────────────────────────────
    // Mostra: banner de alerta (se houver pendência) + 3 cards de atalho
    // pras outras abas com resumo de status em cada um.
    function montarInicio() {
        const anamneses = state.anamneses || [];
        const instrumentos = state.instrumentos || [];
        const agendamentos = state.agendamentos || [];
        const laudos = state.laudos || [];

        const pendentes  = instrumentos.filter(i => i.status === 'aguardando' || i.status === 'em_aplicacao');
        const concluidos = instrumentos.filter(i => i.status === 'corrigido');
        const proxAgendamento = agendamentos[0];
        const temAnamnese = anamneses.length > 0;

        // ─── Banner de alerta ────────────────────────────────────────────
        const alerta = document.getElementById('inicio-alerta');
        const alertaTitulo = document.getElementById('inicio-alerta-titulo');
        const alertaDica = document.getElementById('inicio-alerta-dica');

        // Sprint 57: prioriza anamnese pendente sobre testes (chega antes na jornada)
        if (temAnamnese) {
            alertaTitulo.textContent = anamneses.length === 1
                ? 'Você tem 1 anamnese para responder'
                : `Você tem ${anamneses.length} anamneses para responder`;
            if (alertaDica) alertaDica.textContent = 'Toque em "Anamnese" abaixo pra responder';
            alerta.style.display = 'flex';
        } else if (pendentes.length > 0) {
            alertaTitulo.textContent = pendentes.length === 1
                ? 'Você tem 1 teste aguardando'
                : `Você tem ${pendentes.length} testes aguardando`;
            if (alertaDica) alertaDica.textContent = 'Toque em "Testes" abaixo pra responder';
            alerta.style.display = 'flex';
        } else {
            alerta.style.display = 'none';
        }

        // ─── Atalho Anamnese (Sprint 57) ─────────────────────────────────
        const descAnam = document.getElementById('atalho-anamnese-desc');
        if (descAnam) {
            descAnam.textContent = temAnamnese
                ? (anamneses.length === 1 ? '1 para responder' : `${anamneses.length} para responder`)
                : 'Nenhuma anamnese no momento';
        }

        // ─── Atalho Testes ───────────────────────────────────────────────
        const descTestes = document.getElementById('atalho-testes-desc');
        if (instrumentos.length === 0) {
            descTestes.textContent = 'Nenhum teste no momento';
        } else {
            const partes = [];
            if (pendentes.length > 0) {
                partes.push(`${pendentes.length} ${pendentes.length === 1 ? 'aguardando' : 'aguardando'}`);
            }
            if (concluidos.length > 0) {
                partes.push(`${concluidos.length} ${concluidos.length === 1 ? 'concluído' : 'concluídos'}`);
            }
            descTestes.textContent = partes.length > 0
                ? partes.join(' · ')
                : 'Nenhum teste no momento';
        }

        // ─── Atalho Agenda ───────────────────────────────────────────────
        const descAgenda = document.getElementById('atalho-agenda-desc');
        if (!proxAgendamento) {
            descAgenda.textContent = 'Nenhuma consulta agendada';
        } else {
            const data = new Date(proxAgendamento.inicio_em);
            const dia = String(data.getDate()).padStart(2, '0');
            const meses = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
            const mes = meses[data.getMonth()];
            const hora = data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            const profNome = (proxAgendamento.profissional_nome || '').split(' ')[0];
            descAgenda.textContent = `Próxima: ${dia} de ${mes} às ${hora}${profNome ? ' com ' + profNome : ''}`;
        }

        // ─── Atalho Laudos ───────────────────────────────────────────────
        const descLaudos = document.getElementById('atalho-laudos-desc');
        if (laudos.length === 0) {
            descLaudos.textContent = 'Aguardando liberação da equipe';
        } else {
            descLaudos.textContent = laudos.length === 1
                ? '1 laudo disponível pra baixar'
                : `${laudos.length} laudos disponíveis pra baixar`;
        }
    }

    // ─── ABA ANAMNESE (Sprint 57) ─────────────────────────────────────────
    function renderListaAnamneses(anamneses) {
        const bloco = document.getElementById('lista-anamnese-bloco');
        const vazio = document.getElementById('anamnese-vazio');

        if (anamneses.length > 0) {
            document.getElementById('num-anamnese-pend').textContent = `(${anamneses.length})`;
            document.getElementById('lista-anamnese').innerHTML = anamneses.map(renderItemAnamnese).join('');
            bloco.style.display = 'block';
            vazio.style.display = 'none';
        } else {
            bloco.style.display = 'none';
            vazio.style.display = 'block';
        }
    }

    function renderItemAnamnese(t) {
        const dataEnv = formatarDataCurta(t.created_at);
        const dataExp = formatarDataCurta(t.expires_at);

        return `
            <div class="app-item">
                <div class="app-item-info">
                    <div class="app-item-titulo">Anamnese inicial</div>
                    <div class="app-item-desc">Responda com calma — você pode parar e voltar depois.</div>
                    <div class="app-item-meta">
                        <span class="badge badge-aguardando">Aguardando</span>
                        <span class="app-item-data">Disponibilizada em ${dataEnv}</span>
                        <span class="app-item-data"> · válida até ${dataExp}</span>
                    </div>
                </div>
                <div class="app-item-acao">
                    <button class="btn-acao" onclick="window.responderAnamnese('${escapeAttr(t.token)}')">
                        <i class="ti ti-pencil"></i> Responder
                    </button>
                </div>
            </div>
        `;
    }

    // Sprint 57: abre a anamnese pública dentro do portal usando o token
    window.responderAnamnese = async function(token) {
        try {
            await client.rpc('portal_log_acesso', {
                p_acao: 'abriu_anamnese',
                p_recurso_id: null,
                p_detalhes: { token: token }
            });
        } catch (e) { /* ignore */ }
        window.location.href = `../frontend/anamnese-publica/index.html?t=${encodeURIComponent(token)}`;
    };

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
            : `<button class="btn-acao" onclick="window.responderInstrumento('${escapeAttr(item.aplicacao_id)}', '${escapeAttr(item.sigla)}')">
                   <i class="ti ti-pencil"></i> Responder
               </button>`;

        // Tag de respondente (Sprint 53) — só se item.tipo_respondente vier da RPC
        const tagRespondente = (item.tipo_respondente && window.CortexRespondente && !isConcluido)
            ? `<div style="margin-top:8px;">${window.CortexRespondente.gerarTag(item.tipo_respondente)}</div>`
            : '';

        // Heterorrelato (sprint_hetero_cpf): quem responde é outra pessoa, então o
        // paciente pode mandar o link para ela. Quem receber informa o próprio CPF.
        const hetero = !isConcluido && item.tipo_respondente && window.CortexRespondente
            && typeof window.CortexRespondente.exigeCpf === 'function'
            && window.CortexRespondente.exigeCpf(item.tipo_respondente);
        const enviar = hetero
            ? `<button class="btn-acao btn-acao-enviar" onclick="window.enviarInstrumento('${escapeAttr(item.aplicacao_id)}', '${escapeAttr(item.sigla)}')">
                   <i class="ti ti-send"></i> Enviar para outra pessoa
               </button>`
            : '';

        return `
            <div class="app-item">
                <div class="app-item-info">
                    <div class="app-item-titulo">${escapeHtml(item.sigla)} — ${escapeHtml(resumirNome(item.nome_completo))}</div>
                    <div class="app-item-desc">${escapeHtml(item.o_que_avalia || '')}</div>
                    <div class="app-item-meta">
                        <span class="badge badge-${item.status}">${formatStatus(item.status)}</span>
                        ${!isConcluido ? `<span class="app-item-data">Enviado em ${formatarDataCurta(item.created_at)}</span>` : ''}
                    </div>
                    ${tagRespondente}
                </div>
                <div class="app-item-acao">${acao}${enviar}</div>
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
        const tamanhoKB = l.arquivo_tamanho_bytes
            ? Math.round(l.arquivo_tamanho_bytes / 1024)
            : null;
        const tamanhoTxt = tamanhoKB
            ? (tamanhoKB > 1024 ? (tamanhoKB/1024).toFixed(1) + ' MB' : tamanhoKB + ' KB')
            : '';
        const versaoTxt = (l.versao && l.versao > 1) ? ` · v${l.versao}` : '';

        return `
            <div class="app-item">
                <div class="app-item-info">
                    <div class="app-item-titulo">Laudo Neuropsicológico${versaoTxt}</div>
                    <div class="app-item-desc">Responsável: ${escapeHtml(l.profissional_nome || '—')}</div>
                    <div class="app-item-meta">
                        <span class="app-item-data">Liberado em ${formatarDataCurta(l.liberado_em)}</span>
                        ${tamanhoTxt ? `<span class="app-item-data"> · ${tamanhoTxt}</span>` : ''}
                    </div>
                </div>
                <div class="app-item-acao">
                    <button class="btn-acao btn-acao-secundario" onclick="window.baixarLaudo('${escapeAttr(l.laudo_id)}', this)">
                        <i class="ti ti-download"></i> Baixar
                    </button>
                </div>
            </div>
        `;
    }

    // ─── AÇÕES ────────────────────────────────────────────────────────────
    // SPRINT 39: download real do laudo via signed URL do Storage.
    // Fluxo:
    //   1. RPC `portal_baixar_laudo(laudo_id)` valida que o laudo pertence
    //      ao paciente autenticado e retorna { arquivo_path, arquivo_nome }.
    //   2. `storage.createSignedUrl(path, 60, { download: nome })` gera URL
    //      temporária (60s) com header Content-Disposition: attachment.
    //   3. Frontend abre essa URL — o navegador faz o download.
    window.baixarLaudo = async function(laudoId, btnEl) {
        const btn = btnEl || null;
        const txtOriginal = btn ? btn.innerHTML : null;
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="ti ti-loader"></i> Baixando...';
        }

        try {
            // 1) Pede pro banco validar o laudo e devolver o path
            const { data, error } = await client.rpc('portal_baixar_laudo', {
                p_laudo_id: laudoId
            });

            if (error) throw error;
            if (!data || data.length === 0) {
                alert('Laudo não encontrado ou não disponível.');
                return;
            }

            const { arquivo_path, arquivo_nome_original } = data[0];
            const nome = arquivo_nome_original || 'laudo.pdf';

            // 2) Gera signed URL (60s) com header de download
            const { data: signed, error: signedErr } = await client
                .storage
                .from('laudos')
                .createSignedUrl(arquivo_path, 60, { download: nome });

            if (signedErr) throw signedErr;
            if (!signed?.signedUrl) throw new Error('Não foi possível gerar o link de download.');

            // 3) Registra auditoria (não bloqueia o download)
            //    Nota: client.rpc retorna PostgrestBuilder, não Promise pura,
            //    então não suporta .catch() direto. Usamos try/catch.
            try {
                client.rpc('portal_log_acesso', {
                    p_acao: 'baixou_laudo',
                    p_recurso_id: laudoId,
                    p_detalhes: { arquivo: nome }
                });
            } catch (e) { /* ignore */ }

            // 4) Dispara o download. Tentamos primeiro o método "âncora invisível"
            //    porque é o mais compatível com mobile (Safari iOS, Chrome Android).
            const a = document.createElement('a');
            a.href = signed.signedUrl;
            a.download = nome;
            a.rel = 'noopener';
            a.target = '_blank';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);

        } catch (err) {
            console.error('Erro ao baixar laudo:', err);
            alert('Não foi possível baixar o laudo. Tente novamente em alguns segundos.');
        } finally {
            if (btn && txtOriginal !== null) {
                btn.disabled = false;
                btn.innerHTML = txtOriginal;
            }
        }
    };

    async function logout() {
        try {
            await client.rpc('portal_log_acesso', { p_acao: 'logout', p_recurso_id: null, p_detalhes: {} });
        } catch (e) { /* ignore */ }
        await client.auth.signOut();
        window.location.href = './login.html';
    }

    // ─── RESPONDER INSTRUMENTO ────────────────────────────────────────────
    // Gera o link único na hora (se ainda não existir) e redireciona pra
    // página de resposta do instrumento correspondente.
    window.responderInstrumento = async function(aplicacaoId, sigla) {
        try {
            // 1) Pede ao banco pra gerar/recuperar o token único
            const { data: token, error } = await client.rpc(
                'portal_gerar_link_aplicacao',
                { p_aplicacao_id: aplicacaoId }
            );

            if (error) {
                alert('Erro ao abrir o teste: ' + (error.message || 'tente novamente'));
                return;
            }

            if (!token) {
                alert('Não foi possível gerar o link. Procure a clínica.');
                return;
            }

            // 2) Monta a URL da página de resposta
            // Padrão: /responder/<slug>.html?token=<token>
            // Slug = sigla em minúsculas, sem hifens nem caracteres especiais
            const slug = String(sigla || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            if (!slug) {
                alert('Configuração de teste inválida. Procure a clínica.');
                return;
            }
            const url = `../frontend/responder/${slug}.html?token=${encodeURIComponent(token)}`;

            // 3) Loga acesso e redireciona
            try {
                await client.rpc('portal_log_acesso', {
                    p_acao: 'abriu_instrumento',
                    p_recurso_id: aplicacaoId,
                    p_detalhes: { sigla: sigla }
                });
            } catch (e) { /* ignore */ }

            window.location.href = url;
        } catch (err) {
            console.error('Erro responderInstrumento:', err);
            alert('Erro inesperado. Tente novamente.');
        }
    };

    // ─── ENVIAR PARA OUTRA PESSOA (heterorrelato) ─────────────────────────
    // Gera o mesmo link único e abre uma folha com WhatsApp, copiar e
    // compartilhar. Quem abrir o link informa o próprio CPF antes de responder.
    window.enviarInstrumento = async function(aplicacaoId, sigla) {
        try {
            const { data: token, error } = await client.rpc('portal_gerar_link_aplicacao', { p_aplicacao_id: aplicacaoId });
            if (error || !token) {
                alert('Não foi possível gerar o link. Procure a clínica.');
                return;
            }
            const slug = String(sigla || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            if (!slug) { alert('Configuração de teste inválida. Procure a clínica.'); return; }
            const url = new URL(`../frontend/responder/${slug}.html?token=${encodeURIComponent(token)}`, window.location.href).href;
            const primeiro = String(state.nomePaciente || '').trim().split(/\s+/)[0] || 'o(a) paciente';
            const texto =
                `Olá! A Equilibrium Neuropsicologia pediu que você responda o questionário ${sigla} sobre ${primeiro}. ` +
                `Leva poucos minutos e dá para fazer pelo celular:\n\n${url}\n\n` +
                `Antes de começar, você vai informar o seu CPF. O link é pessoal.`;

            try {
                await client.rpc('portal_log_acesso', { p_acao: 'enviou_instrumento', p_recurso_id: aplicacaoId, p_detalhes: { sigla: sigla } });
            } catch (e) { /* ignore */ }

            abrirFolhaEnvio({ sigla, url, texto });
        } catch (err) {
            console.error('Erro enviarInstrumento:', err);
            alert('Erro inesperado. Tente novamente.');
        }
    };

    function abrirFolhaEnvio({ sigla, url, texto }) {
        fecharFolhaEnvio();
        const fundo = document.createElement('div');
        fundo.id = 'folha-envio';
        fundo.className = 'folha-fundo';
        fundo.innerHTML = `
            <div class="folha" role="dialog" aria-label="Enviar para outra pessoa">
                <div class="folha-alca"></div>
                <div class="folha-topo">
                    <div class="folha-icone"><i class="ti ti-send"></i></div>
                    <div>
                        <div class="folha-titulo">Enviar ${escapeHtml(sigla)} para outra pessoa</div>
                        <div class="folha-sub">Este questionário é respondido por quem convive com o(a) paciente. Quem receber o link informa o próprio CPF antes de começar.</div>
                    </div>
                </div>
                <div class="folha-link" id="folha-link">${escapeHtml(url)}</div>
                <div class="folha-botoes">
                    <a class="folha-btn folha-btn-whats" id="folha-whats" href="https://wa.me/?text=${encodeURIComponent(texto)}" target="_blank" rel="noopener">
                        <i class="ti ti-brand-whatsapp"></i> WhatsApp
                    </a>
                    <button class="folha-btn folha-btn-copiar" id="folha-copiar" type="button"><i class="ti ti-copy"></i> Copiar link</button>
                    ${navigator.share ? '<button class="folha-btn folha-btn-share" id="folha-share" type="button"><i class="ti ti-share"></i> Outros apps</button>' : ''}
                </div>
                <button class="folha-fechar" id="folha-fechar" type="button">Fechar</button>
            </div>`;
        document.body.appendChild(fundo);
        requestAnimationFrame(() => fundo.classList.add('aberta'));

        fundo.addEventListener('click', (e) => { if (e.target === fundo) fecharFolhaEnvio(); });
        fundo.querySelector('#folha-fechar').addEventListener('click', fecharFolhaEnvio);
        fundo.querySelector('#folha-copiar').addEventListener('click', async (e) => {
            const btn = e.currentTarget;
            let ok = false;
            try { await navigator.clipboard.writeText(url); ok = true; } catch (_) { ok = copiarFallback(url); }
            btn.innerHTML = ok ? '<i class="ti ti-check"></i> Copiado' : '<i class="ti ti-copy"></i> Não copiou';
            setTimeout(() => { btn.innerHTML = '<i class="ti ti-copy"></i> Copiar link'; }, 2200);
        });
        const share = fundo.querySelector('#folha-share');
        if (share) {
            share.addEventListener('click', async () => {
                try { await navigator.share({ text: texto }); fecharFolhaEnvio(); } catch (_) { /* cancelou */ }
            });
        }
    }

    function fecharFolhaEnvio() {
        const el = document.getElementById('folha-envio');
        if (!el) return;
        el.classList.remove('aberta');
        setTimeout(() => el.remove(), 220);
    }

    function copiarFallback(txt) {
        try {
            const ta = document.createElement('textarea');
            ta.value = txt; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
            document.body.appendChild(ta); ta.select();
            const ok = document.execCommand('copy');
            ta.remove();
            return ok;
        } catch (_) { return false; }
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

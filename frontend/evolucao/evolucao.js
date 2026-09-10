// ============================================================================
// CORTEX_APP — evolucao.js
// ----------------------------------------------------------------------------
// Evolução clínica do prontuário.
//
// A linha do tempo mistura DUAS fontes:
//
//   1. `evolucoes` — o que foi escrito por gente. Registro clínico: uma vez
//      lançado, não se apaga nem se edita (gatilho no banco). Corrigir é
//      lançar uma retificação vinculada; as duas ficam visíveis.
//
//   2. `auditoria_acessos` — o que o sistema registrou sozinho. Não duplicamos
//      nada: a auditoria já grava desde sempre, então o histórico automático
//      vale retroativo e não precisou de gatilho novo.
//
// Só entram da auditoria as ações que ALTERAM: criacao, edicao, delecao.
// Leitura fica de fora — são 25.780 contra 8.361 alterações, e a evolução
// clínica afundaria no meio de "fulano abriu o prontuário".
//
// Supervisão: quando quem lança é estagiário, o banco marca a evolução como
// 'aguardando'. Só o supervisor vinculado (ou admin clínico) valida, e
// ninguém valida a própria — tudo isso é decidido no banco, não aqui.
//
// API: window.CortexEvolucao
//   .render(pacienteId)        -> HTML da aba
//   .carregar(pacienteId)      -> busca e pinta a linha do tempo
//   .abrirLancamento(tipo)     -> janela de lançamento ('sessao' | 'simples')
// ============================================================================

window.CortexEvolucao = (function () {
    'use strict';

    const ACOES_RELEVANTES = ['criacao', 'edicao', 'delecao'];

    const ACAO_TEXTO = {
        criacao:  'criou um registro',
        edicao:   'alterou',
        delecao:  'excluiu um registro'
    };

    const TABELA_TEXTO = {
        pacientes:               'dados do paciente',
        anamneses:               'anamnese',
        hipoteses:               'hipóteses',
        aplicacoes_instrumento:  'aplicação de instrumento',
        correcoes:               'correção',
        laudos_paciente:         'laudo',
        laudos:                  'laudo',
        sessoes:                 'sessão',
        evolucoes:               'evolução',
        estoque_compras:         'entrada de estoque',
        estoque_saidas:          'saída de estoque',
        estoque_licencas:        'estoque',
        relatorios_escolares:    'relatório escolar',
        devolutivas:             'devolutiva'
    };

    let ctx = { pacienteId: null, itens: [], carregando: false };

    const c = () => window.cortexClient;
    const esc = (t) => {
        const d = document.createElement('div');
        d.textContent = (t === null || t === undefined) ? '' : String(t);
        return d.innerHTML;
    };
    const toast = (m, t) => { if (window.CortexUI?.toast) window.CortexUI.toast(m, t); };

    function dataHora(iso) {
        if (!iso) return '—';
        const d = new Date(iso);
        if (isNaN(d)) return '—';
        return d.toLocaleDateString('pt-BR') + ' às ' +
               d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }

    function agrupamentoDia(iso) {
        const d = new Date(iso);
        if (isNaN(d)) return '';
        const hoje = new Date();
        const ontem = new Date(); ontem.setDate(hoje.getDate() - 1);
        const mesmoDia = (a, b) => a.toDateString() === b.toDateString();
        if (mesmoDia(d, hoje))  return 'Hoje';
        if (mesmoDia(d, ontem)) return 'Ontem';
        return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
    }

    /** Datetime-local no fuso do navegador (não UTC, que jogaria pro dia anterior). */
    function agoraLocalInput() {
        const d = new Date();
        const p = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
    }

    // ── Carga ───────────────────────────────────────────────────────────────

    async function carregar(pacienteId) {
        ctx.pacienteId = pacienteId;
        ctx.carregando = true;

        try {
            const [ev, aud, ses] = await Promise.all([
                c().from('evolucoes')
                   .select('*, autor:criado_por(id, nome_completo, perfil, crp), supervisor:supervisionada_por(nome_completo)')
                   .eq('paciente_id', pacienteId)
                   .order('data_evolucao', { ascending: false }),

                // Usa idx_auditoria_paciente (paciente_id, timestamp DESC).
                c().from('auditoria_acessos')
                   .select('id, acao, tabela, detalhes, timestamp, profissional:profissional_id(nome_completo)')
                   .eq('paciente_id', pacienteId)
                   .in('acao', ACOES_RELEVANTES)
                   .order('timestamp', { ascending: false })
                   .limit(300),

                c().from('sessoes')
                   .select('id, data_hora_inicio, tipo, status')
                   .eq('paciente_id', pacienteId)
                   .order('data_hora_inicio', { ascending: false })
                   .limit(60)
            ]);

            if (ev.error) throw ev.error;

            ctx.sessoes = ses.data || [];

            const escritas = (ev.data || []).map(e => ({
                origem: 'evolucao',
                id: e.id,
                quando: e.data_evolucao,
                dados: e
            }));

            // Falha de auditoria não pode derrubar a aba: a evolução escrita
            // é o que importa, o histórico automático é complemento.
            if (aud.error) console.warn('[evolucao] auditoria indisponível:', aud.error);
            const automaticas = (aud.data || []).map(a => ({
                origem: 'sistema',
                id: 'a' + a.id,
                quando: a.timestamp,
                dados: a
            }));

            ctx.itens = [...escritas, ...automaticas]
                .sort((a, b) => String(b.quando).localeCompare(String(a.quando)));

        } catch (err) {
            console.error('[evolucao] carregar:', err);
            ctx.erro = err.message || String(err);
        } finally {
            ctx.carregando = false;
        }

        pintar();
    }

    // ── Render ──────────────────────────────────────────────────────────────

    function render(pacienteId) {
        setTimeout(() => carregar(pacienteId), 0);
        return `
            <div class="etapa-content">
                <div class="evo-topo">
                    <div>
                        <h3 class="evo-titulo">Evolução</h3>
                        <p class="evo-sub">Registro clínico e histórico de alterações do prontuário.</p>
                    </div>
                    <div class="evo-topo-acoes">
                        <button class="btn btn-secondary btn-sm" onclick="window.CortexEvolucao.abrirLancamento('simples')">+ Evolução simples</button>
                        <button class="btn btn-primary btn-sm" onclick="window.CortexEvolucao.abrirLancamento('sessao')">+ Evolução de sessão</button>
                    </div>
                </div>
                <div id="evo-lista">
                    <div class="evo-carregando"><div class="evo-spin"></div> Carregando…</div>
                </div>
            </div>`;
    }

    function pintar() {
        const alvo = document.getElementById('evo-lista');
        if (!alvo) return;

        if (ctx.erro) {
            alvo.innerHTML = `<div class="evo-vazio">
                <div class="evo-vazio-ic">⚠️</div>
                <strong>Não foi possível carregar</strong>${esc(ctx.erro)}</div>`;
            return;
        }

        if (!ctx.itens.length) {
            alvo.innerHTML = `<div class="evo-vazio">
                <div class="evo-vazio-ic">📝</div>
                <strong>Nenhuma evolução ainda</strong>
                Lance a primeira pelos botões acima. Alterações feitas no prontuário
                também aparecem aqui automaticamente.</div>`;
            return;
        }

        const pendentes = ctx.itens.filter(i =>
            i.origem === 'evolucao' && i.dados.status_supervisao === 'aguardando').length;

        const aviso = pendentes ? `
            <div class="evo-aviso-sup">
                <span>⏳</span>
                <div><strong>${pendentes} evolução(ões) aguardando supervisão.</strong>
                Elas já constam no prontuário, mas ainda não foram validadas.</div>
            </div>` : '';

        let html = aviso + '<div class="evo-timeline">';
        let diaAtual = null;

        ctx.itens.forEach(item => {
            const dia = agrupamentoDia(item.quando);
            if (dia !== diaAtual) {
                diaAtual = dia;
                html += `<div class="evo-dia">${esc(dia)}</div>`;
            }
            html += item.origem === 'evolucao' ? cardEvolucao(item.dados) : cardSistema(item.dados);
        });

        alvo.innerHTML = html + '</div>';

        alvo.querySelectorAll('[data-validar]').forEach(b =>
            b.addEventListener('click', () => validar(b.dataset.validar)));
        alvo.querySelectorAll('[data-retificar]').forEach(b =>
            b.addEventListener('click', () => abrirLancamento('simples', b.dataset.retificar)));
    }

    function cardEvolucao(e) {
        const autor = e.autor || {};
        const ehSessao = e.tipo === 'sessao';
        const aguardando = e.status_supervisao === 'aguardando';
        const validada = e.status_supervisao === 'validada';

        const selo = aguardando
            ? '<span class="evo-selo aguardando">Aguardando supervisão</span>'
            : (validada
                ? `<span class="evo-selo validada" title="Validada por ${esc(e.supervisor?.nome_completo || '')} em ${dataHora(e.supervisionada_em)}">Supervisionada</span>`
                : '');

        const retificada = e.retificada_em
            ? '<span class="evo-selo retificada">Retificada</span>' : '';

        const podeValidar = aguardando && window.CortexPerfil &&
            (window.CortexPerfil.isAdminClinico() || window.CortexPerfil.isAplicador());

        return `
            <div class="evo-card ${ehSessao ? 'tipo-sessao' : 'tipo-simples'} ${e.retificada_em ? 'esta-retificada' : ''}">
                <div class="evo-card-head">
                    <span class="evo-tag">${ehSessao ? '🗓 Sessão' : '📝 Evolução'}</span>
                    ${e.titulo ? `<span class="evo-card-titulo">${esc(e.titulo)}</span>` : ''}
                    ${selo}${retificada}
                </div>
                ${e.retifica_id ? `<div class="evo-retifica-nota">Retificação de um registro anterior.</div>` : ''}
                <div class="evo-card-corpo">${esc(e.conteudo).replace(/\n/g, '<br>')}</div>
                ${e.parecer_supervisao ? `
                    <div class="evo-parecer">
                        <strong>Parecer da supervisão:</strong> ${esc(e.parecer_supervisao)}
                    </div>` : ''}
                <div class="evo-card-pe">
                    <span class="evo-autor">${esc(autor.nome_completo || '—')}${autor.crp ? ' · CRP ' + esc(autor.crp) : ''}</span>
                    <span class="evo-quando">${dataHora(e.data_evolucao)}</span>
                    ${e.created_at && e.created_at !== e.data_evolucao
                        ? `<span class="evo-lancado" title="Momento do lançamento no sistema">lançado em ${dataHora(e.created_at)}</span>` : ''}
                    <span class="evo-acoes-card">
                        ${podeValidar ? `<button class="evo-mini" data-validar="${e.id}">✓ Validar</button>` : ''}
                        ${!e.retificada_em ? `<button class="evo-mini" data-retificar="${e.id}">Retificar</button>` : ''}
                    </span>
                </div>
            </div>`;
    }

    function cardSistema(a) {
        const quem = a.profissional?.nome_completo || 'Sistema';
        const oque = TABELA_TEXTO[a.tabela] || a.tabela || 'registro';
        const verbo = ACAO_TEXTO[a.acao] || a.acao;
        const op = a.detalhes?.detalhes?.operacao || a.detalhes?.operacao;

        return `
            <div class="evo-sistema">
                <span class="evo-sistema-pt"></span>
                <span class="evo-sistema-txt">
                    <strong>${esc(quem)}</strong> ${esc(verbo)} ${esc(oque)}${op ? ` · ${esc(String(op).replace(/_/g, ' '))}` : ''}
                </span>
                <span class="evo-sistema-hora">${dataHora(a.timestamp)}</span>
            </div>`;
    }

    // ── Lançamento ──────────────────────────────────────────────────────────

    function abrirLancamento(tipo, retificaId) {
        if (!window.CortexPop) { toast('Sistema de janelas não carregou.', 'danger'); return; }

        const ehSessao = tipo === 'sessao';
        const sessoes = ctx.sessoes || [];

        const html = `
            ${retificaId ? `
            <div class="evo-aviso-ret">
                <strong>Retificação.</strong> O registro original continua no prontuário e
                ficará marcado como retificado. Descreva a correção abaixo.
            </div>` : ''}

            <div class="evo-campo">
                <label>Data e hora ${ehSessao ? 'da sessão' : 'do registro'}</label>
                <input type="datetime-local" id="evo-data" value="${agoraLocalInput()}">
                <span class="evo-dica">Pode ser anterior a hoje, se estiver registrando algo passado.</span>
            </div>

            ${ehSessao && sessoes.length ? `
            <div class="evo-campo">
                <label>Vincular a uma sessão agendada <span style="font-weight:400;text-transform:none">(opcional)</span></label>
                <select id="evo-sessao">
                    <option value="">— não vincular —</option>
                    ${sessoes.map(s => `<option value="${s.id}">${dataHora(s.data_hora_inicio)} · ${esc(s.tipo || '')} ${s.status ? '(' + esc(s.status) + ')' : ''}</option>`).join('')}
                </select>
            </div>` : ''}

            <div class="evo-campo">
                <label>Título <span style="font-weight:400;text-transform:none">(opcional)</span></label>
                <input id="evo-titulo" placeholder="${ehSessao ? 'Ex.: 3ª sessão de avaliação' : 'Ex.: Contato com a escola'}">
            </div>

            <div class="evo-campo">
                <label>Registro *</label>
                <textarea id="evo-conteudo" rows="9" placeholder="${ehSessao
                    ? 'O que foi trabalhado, como o paciente respondeu, observações relevantes e encaminhamentos.'
                    : 'Descreva o fato clínico ou administrativo relevante para o prontuário.'}"></textarea>
                <span class="evo-dica" id="evo-contador">Mínimo de 10 caracteres.</span>
            </div>

            <div class="evo-aviso-imut">
                <strong>Este registro não poderá ser editado nem apagado.</strong>
                É documento clínico: para corrigir, lance uma retificação vinculada.
            </div>`;

        const janela = window.CortexPop.abrir({
            titulo: retificaId ? 'Retificar evolução' : (ehSessao ? 'Evolução de sessão' : 'Evolução simples'),
            subtitulo: 'Fica no prontuário com seu nome, data e hora',
            tone: ehSessao ? 'blue' : 'purple',
            tamanho: 'md',
            persistente: true,
            html: html,
            rodape: [
                { label: 'Cancelar', classe: 'btn-secondary' },
                { label: 'Lançar evolução', classe: 'btn-primary', fechar: false,
                  onClick: (j) => salvar(tipo, retificaId, j) }
            ]
        });

        const ta = janela.corpo.querySelector('#evo-conteudo');
        const ct = janela.corpo.querySelector('#evo-contador');
        if (ta && ct) {
            ta.addEventListener('input', () => {
                const n = ta.value.trim().length;
                ct.textContent = n < 10
                    ? `Mínimo de 10 caracteres — faltam ${10 - n}.`
                    : `${n} caracteres.`;
                ct.style.color = n < 10 ? '#b45309' : '';
            });
            setTimeout(() => ta.focus(), 300);
        }
    }

    async function salvar(tipo, retificaId, janela) {
        const corpo = janela.corpo;
        const conteudo = corpo.querySelector('#evo-conteudo').value.trim();

        if (conteudo.length < 10) {
            toast('O registro precisa de pelo menos 10 caracteres.', 'danger');
            return false;
        }

        const dataInput = corpo.querySelector('#evo-data').value;
        const selSessao = corpo.querySelector('#evo-sessao');

        const linha = {
            paciente_id: ctx.pacienteId,
            tipo: tipo,
            titulo: corpo.querySelector('#evo-titulo').value.trim() || null,
            conteudo: conteudo,
            sessao_id: (selSessao && selSessao.value) ? selSessao.value : null,
            // datetime-local vem sem fuso; new Date() interpreta como LOCAL,
            // que é o correto aqui — o profissional digitou a hora dele.
            data_evolucao: dataInput ? new Date(dataInput).toISOString() : new Date().toISOString(),
            retifica_id: retificaId || null,
            criado_por: window.cortexProfissional?.id
        };

        try {
            const { data, error } = await c().from('evolucoes').insert(linha).select('id, status_supervisao').single();
            if (error) throw error;

            // Marca a original como retificada. O gatilho de imutabilidade
            // libera só estes campos.
            if (retificaId) {
                const { error: errRet } = await c().from('evolucoes')
                    .update({ retificada_em: new Date().toISOString(),
                              retificada_por: window.cortexProfissional?.id })
                    .eq('id', retificaId);
                if (errRet) console.warn('[evolucao] marcar retificada:', errRet);
            }

            if (window.CortexAudit) {
                window.CortexAudit.log('criacao', 'evolucoes', data.id, {
                    pacienteId: ctx.pacienteId,
                    detalhes: { operacao: retificaId ? 'retificacao' : ('evolucao_' + tipo) }
                });
            }

            janela.fecharJanela();
            toast(data.status_supervisao === 'aguardando'
                ? 'Evolução lançada. Aguardando validação da supervisão.'
                : 'Evolução lançada.', 'success');

            await carregar(ctx.pacienteId);
            return true;
        } catch (err) {
            console.error('[evolucao] salvar:', err);
            toast('Erro ao lançar: ' + (err.message || ''), 'danger');
            return false;
        }
    }

    // ── Supervisão ──────────────────────────────────────────────────────────

    function validar(id) {
        if (!window.CortexPop) return;

        window.CortexPop.abrir({
            titulo: 'Validar evolução',
            subtitulo: 'Supervisão do registro',
            tone: 'green',
            tamanho: 'sm',
            html: `
                <p style="font-size:13.5px;line-height:1.6;color:var(--color-text-muted);margin-bottom:14px">
                    Ao validar, você assume a supervisão deste registro. A ação fica gravada
                    com seu nome e a data.
                </p>
                <div class="evo-campo">
                    <label>Parecer <span style="font-weight:400;text-transform:none">(opcional)</span></label>
                    <textarea id="evo-parecer" rows="4" placeholder="Observações da supervisão"></textarea>
                </div>`,
            rodape: [
                { label: 'Cancelar', classe: 'btn-secondary' },
                { label: '✓ Validar', classe: 'btn-primary', fechar: false, onClick: async (j) => {
                    try {
                        const parecer = j.corpo.querySelector('#evo-parecer').value.trim();
                        const { data, error } = await c().rpc('validar_evolucao', {
                            p_evolucao_id: id,
                            p_parecer: parecer || null
                        });
                        if (error) throw error;
                        if (data && data.erro) throw new Error(data.erro);

                        j.fecharJanela();
                        toast('Evolução validada.', 'success');
                        await carregar(ctx.pacienteId);
                        return true;
                    } catch (err) {
                        console.error('[evolucao] validar:', err);
                        // O banco recusa quem não é supervisor vinculado e
                        // quem tenta validar a própria evolução.
                        toast(err.message || 'Erro ao validar.', 'danger');
                        return false;
                    }
                }}
            ]
        });
    }

    return { render, carregar, abrirLancamento };
})();

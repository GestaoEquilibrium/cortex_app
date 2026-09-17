// ============================================================================
// CORTEX_APP — Sprint 18 — publica.js
// Página pública de resposta da anamnese (sem auth, via token na URL).
// Mobile-first. Várias perguntas por tela, agrupadas por seção.
// ============================================================================

(function() {
    'use strict';

    const state = {
        token: null,
        info: null,
        form: null,
        anamnese: null,
        dados: {},
        secaoIdx: 0,
        secaoIdx_max: 0,
        enviando: false,
        enviado: false,
        // Rascunho: 'salvo' | 'salvando' | 'pendente' | 'erro' | null
        rascunho: null,
        rascunhoEm: null,
        salvandoServidor: false
    };

    // Duas camadas de proteção contra perder o que foi digitado:
    //
    //   1. localStorage, a cada tecla (com debounce). Instantâneo e funciona
    //      offline. Cobre o caso mais comum: celular que dorme, aba fechada
    //      sem querer, bateria acabando no meio de uma resposta longa.
    //
    //   2. Servidor, ao virar de etapa. Sobrevive a trocar de aparelho e
    //      permite ao profissional ver no CORTEX que a anamnese está pela
    //      metade. Grava nas mesmas colunas do envio final, sem concluir.
    //
    // A camada 1 é a rede de segurança da 2: se a internet cair na virada de
    // etapa, o texto continua no aparelho e sobe na próxima tentativa.
    const CHAVE_RASCUNHO = 'cortex_anamnese_rascunho_';
    let timerLocal = null;

    let supabase = null;

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------
    // Formata data pura (YYYY-MM-DD) como dd/mm/aaaa sem conversao de fuso.
    // Evita o bug de -1 dia: new Date('YYYY-MM-DD') assume UTC e em UTC-3 volta 1 dia.
    function formatarDataNasc(valor) {
        if (!valor) return '';
        const m = String(valor).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (m) return `${m[3]}/${m[2]}/${m[1]}`;
        // fallback: se vier com hora/ISO completo, usa Date mas fixando meio-dia local
        const d = new Date(String(valor).slice(0, 10) + 'T12:00:00');
        return isNaN(d) ? '' : d.toLocaleDateString('pt-BR');
    }

    function escapeHtml(t) {
        if (t === null || t === undefined) return '';
        const div = document.createElement('div');
        div.textContent = String(t);
        return div.innerHTML;
    }

    function getQS(name) {
        return new URLSearchParams(window.location.search).get(name);
    }

    // -----------------------------------------------------------------------
    // Init
    // -----------------------------------------------------------------------
    async function init() {
        if (typeof SUPABASE_CONFIG === 'undefined') {
            return mostrarErro('Configuração não disponível.');
        }
        supabase = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);

        state.token = getQS('t');
        if (!state.token) return mostrarErro('Link inválido — token ausente.');

        try {
            await carregar();
        } catch (err) {
            console.error('[publica] init:', err);
            mostrarErro('Erro ao carregar: ' + (err.message || err));
        }
    }

    // -----------------------------------------------------------------------
    // Rascunho
    // -----------------------------------------------------------------------

    function chaveLocal() {
        return CHAVE_RASCUNHO + state.token;
    }

    function salvarLocal() {
        try {
            localStorage.setItem(chaveLocal(), JSON.stringify({
                dados: state.dados,
                secaoIdx: state.secaoIdx,
                em: new Date().toISOString()
            }));
        } catch (e) {
            // Modo privativo do Safari, cota cheia: o servidor ainda cobre.
            console.warn('[publica] localStorage indisponível:', e);
        }
    }

    function lerLocal() {
        try {
            const bruto = localStorage.getItem(chaveLocal());
            return bruto ? JSON.parse(bruto) : null;
        } catch (e) { return null; }
    }

    function limparLocal() {
        try { localStorage.removeItem(chaveLocal()); } catch (e) {}
    }

    /** Chamado a cada tecla. Debounce para não gravar a cada caractere. */
    function marcarAlteracao() {
        state.rascunho = 'pendente';
        clearTimeout(timerLocal);
        timerLocal = setTimeout(() => {
            salvarLocal();
            state.rascunho = 'salvo';
            state.rascunhoEm = new Date();
            atualizarIndicador();
        }, 600);
        atualizarIndicador();
    }

    /** Sobe para o servidor. Chamado ao virar de etapa e antes de sair. */
    async function salvarServidor(silencioso) {
        if (state.salvandoServidor || state.enviado) return true;
        state.salvandoServidor = true;
        if (!silencioso) { state.rascunho = 'salvando'; atualizarIndicador(); }

        try {
            const { data, error } = await supabase.rpc('anamnese_publica_salvar_rascunho', {
                p_token:                state.token,
                p_identificacao:        state.dados.identificacao || {},
                p_queixa_historico:     state.dados.queixa_historico || {},
                p_contexto_familiar:    state.dados.contexto_familiar || {},
                p_desenvolvimento:      state.dados.desenvolvimento || {},
                p_social_emocional:     state.dados.social_emocional || {},
                p_historico_escolar:    state.dados.historico_escolar || {},
                p_saude_medicacoes:     state.dados.saude_medicacoes || {},
                p_outros_profissionais: state.dados.outros_profissionais || {},
                p_etapa:                state.secaoIdx
            });
            if (error) throw error;
            if (data && data.erro) throw new Error(data.erro);

            salvarLocal();
            state.rascunho = 'salvo';
            state.rascunhoEm = new Date();
            return true;
        } catch (err) {
            console.warn('[publica] rascunho no servidor falhou:', err);
            // Não bloqueia a navegação: o texto continua salvo no aparelho.
            salvarLocal();
            state.rascunho = 'erro';
            return false;
        } finally {
            state.salvandoServidor = false;
            if (!silencioso) atualizarIndicador();
        }
    }

    function atualizarIndicador() {
        const el = document.getElementById('rascunho-status');
        if (!el) return;

        const mapa = {
            salvando: ['salvando', '<span class="rasc-spin"></span> Salvando…'],
            salvo:    ['salvo',    '✓ Progresso salvo'],
            pendente: ['pendente', '• Alterações não salvas'],
            erro:     ['erro',     '⚠ Salvo neste aparelho']
        };
        const [cls, txt] = mapa[state.rascunho] || ['', ''];
        el.className = 'rascunho-status ' + cls;
        el.innerHTML = txt;
    }

    async function carregar() {
        const { data, error } = await supabase.rpc('anamnese_publica_get', { p_token: state.token });
        if (error) throw error;

        if (data && data.erro) {
            const msgs = {
                token_invalido:       'Link inválido. Confirme com seu psicólogo que copiou o endereço completo.',
                token_expirado:       'Este link expirou. Solicite um novo ao seu psicólogo.',
                token_ja_utilizado:   'Esta anamnese já foi respondida.',
                anamnese_inexistente: 'Anamnese não encontrada no sistema.'
            };
            return mostrarErro(msgs[data.erro] || 'Erro: ' + data.erro);
        }

        state.info = {
            paciente_nome:            data.paciente_nome,
            paciente_data_nascimento: data.paciente_data_nascimento,
            faixa_etaria:             data.faixa_etaria,
            expires_at:               data.expires_at
        };

        const cols = window.CortexAnamneseForms.colunasJsonb();
        state.dados = {};
        cols.forEach(c => { state.dados[c] = data[c] || {}; });

        // Retomada. O servidor é a base; o rascunho do aparelho entra por
        // cima quando é mais novo — cobre o caso de ter digitado e fechado
        // a aba antes de virar a etapa, que nunca chegou a subir.
        let etapaRetomada = Number(data.etapa_atual) || 0;
        const local = lerLocal();
        if (local && local.dados) {
            const localEm = local.em ? new Date(local.em) : null;
            const servEm  = data.atualizado_em ? new Date(data.atualizado_em) : null;
            const localMaisNovo = localEm && (!servEm || localEm > servEm);
            if (localMaisNovo) {
                cols.forEach(c => {
                    state.dados[c] = Object.assign({}, state.dados[c], local.dados[c] || {});
                });
                if (typeof local.secaoIdx === 'number') etapaRetomada = local.secaoIdx;
            }
        }
        state.etapaRetomada = etapaRetomada;

        const temResposta = cols.some(c => Object.keys(state.dados[c] || {}).length > 0);
        state.retomando = temResposta && etapaRetomada > 0;

        // Sprint 55: identificação agora vem do cadastro do paciente
        // (renderizada como cartão read-only no topo do wizard), não é
        // mais duplicada no JSONB. Não pré-preenchemos nada aqui.

        state.form = window.CortexAnamneseForms.getForm(state.info.faixa_etaria);
        if (!state.form) return mostrarErro('Faixa etária inválida.');

        // Sprint 55: o forms.js novo começa com uma seção 'Boas-vindas' (tipo
        // 'info' com texto LGPD/CFP). No fluxo público temos uma tela custom
        // de boas-vindas (renderBoasVindas) que já cumpre esse papel, então
        // filtramos essa seção para não duplicar.
        state.sects = (state.form.sects || []).filter(s => s.tt !== 'Boas-vindas');

        state.secaoIdx = -1;  // -1 = tela custom de boas-vindas
        state.secaoIdx_max = Math.max(state.secaoIdx_max, state.etapaRetomada || 0);
        renderizar();
    }

    // -----------------------------------------------------------------------
    // Render
    // -----------------------------------------------------------------------
    function renderizar() {
        const root = document.getElementById('publica-conteudo');
        if (!root) return;

        if (state.enviado) {
            root.innerHTML = renderEnviado();
            return;
        }

        if (state.secaoIdx === -1) {
            root.innerHTML = renderBoasVindas();
            document.getElementById('btn-comecar').addEventListener('click', () => {
                // Retoma onde parou, se já havia progresso salvo.
                state.secaoIdx = Math.min(state.etapaRetomada || 0,
                                          Math.max(0, state.sects.length - 1));
                renderizar();
                window.scrollTo(0, 0);
            });
            return;
        }

        const sec = state.sects[state.secaoIdx];
        const total = state.sects.length;
        const atual = state.secaoIdx + 1;
        const pct = Math.round((atual / total) * 100);
        const ehUltima = state.secaoIdx === total - 1;
        const ehPrimeira = state.secaoIdx === 0;

        // Sprint 55: mini-cartão de identidade fixo no topo (confirma quem é
        // que está sendo avaliado em todas as telas do questionário)
        const dn = state.info.paciente_data_nascimento
            ? formatarDataNasc(state.info.paciente_data_nascimento)
            : '';
        const miniCartao = `
            <div class="publica-mini-cartao">
                <span class="publica-mini-cartao-ic">👤</span>
                <div class="publica-mini-cartao-info">
                    <div class="publica-mini-cartao-nome">${escapeHtml(state.info.paciente_nome || '—')}</div>
                    ${dn ? `<div class="publica-mini-cartao-sub">Nascimento: ${escapeHtml(dn)}</div>` : ''}
                </div>
            </div>
        `;

        root.innerHTML = `
            ${miniCartao}
            <div class="publica-topo">
                <div class="publica-progresso-texto">
                    Seção <strong>${atual}</strong> de <strong>${total}</strong> · ${escapeHtml(sec.tt)}
                </div>
                <div class="wizard-progresso-barra">
                    <div class="wizard-progresso-preenchido" style="width:${pct}%"></div>
                </div>
            </div>

            <div class="wizard-etapa">
                <div class="wizard-etapa-header">
                    <div class="wizard-etapa-icone">${sec.ic || ''}</div>
                    <h2 class="wizard-etapa-titulo">${escapeHtml(sec.tt)}</h2>
                </div>
                <div class="${sec.g3 ? 'fg-grid3' : 'fg-grid2'}">
                    ${(sec.g2 || sec.g3 || []).map(renderCampo).join('')}
                </div>
            </div>

            <div id="rascunho-status" class="rascunho-status"></div>

            <div class="wizard-navegacao">
                <button class="btn btn-secondary" id="btn-voltar" ${ehPrimeira ? 'disabled' : ''}>← Voltar</button>
                ${ehUltima
                    ? `<button class="btn btn-primary btn-lg" id="btn-enviar" ${state.enviando ? 'disabled' : ''}>${state.enviando ? 'Enviando...' : '✓ Enviar respostas'}</button>`
                    : `<button class="btn btn-primary" id="btn-proxima">Próxima →</button>`
                }
            </div>
        `;

        aplicarValores(sec);
        setupListeners(sec);

        atualizarIndicador();

        const btnVoltar = document.getElementById('btn-voltar');
        if (btnVoltar) btnVoltar.addEventListener('click', async () => {
            if (!ehPrimeira) {
                await salvarServidor();
                state.secaoIdx--;
                renderizar();
                window.scrollTo(0, 0);
            }
        });

        const btnProx = document.getElementById('btn-proxima');
        if (btnProx) btnProx.addEventListener('click', async () => {
            btnProx.disabled = true;
            // Sobe antes de avançar. Se falhar, segue mesmo assim: o
            // localStorage já guardou e a próxima etapa tenta de novo.
            await salvarServidor();
            state.secaoIdx++;
            state.secaoIdx_max = Math.max(state.secaoIdx_max, state.secaoIdx);
            renderizar();
            window.scrollTo(0, 0);
        });

        const btnEnv = document.getElementById('btn-enviar');
        if (btnEnv) btnEnv.addEventListener('click', enviar);
    }

    function renderBoasVindas() {
        const dn = state.info.paciente_data_nascimento
            ? formatarDataNasc(state.info.paciente_data_nascimento)
            : '';
        return `
            <div class="publica-bemvindo">
                <h1>${escapeHtml(state.form.tt)} — Anamnese</h1>
                <p><strong>Olá, seja muito bem-vindo(a)!</strong></p>
                <p>Sabemos que a decisão de buscar uma avaliação é um passo importante, e agradecemos a sua confiança em nosso trabalho.</p>
                <p>Este formulário foi pensado como o nosso primeiro contato para conhecermos, com cuidado e atenção, a história de quem será avaliado. Suas respostas são como um mapa inicial que nos guiará durante nossa conversa, permitindo que nosso encontro seja mais profundo e focado em <strong>acolher suas preocupações e traçar o melhor plano de ação.</strong></p>
                <p>Sinta-se seguro(a) e à vontade ao responder. Todas as informações são protegidas por <strong>sigilo profissional absoluto</strong>, conforme a Lei Geral de Proteção de Dados (LGPD), e nosso trabalho é pautado pelo compromisso ético e técnico com as diretrizes do Conselho Federal de Psicologia.</p>
                <p>Por favor, percorra o questionário até o fim, mas não se preocupe se alguma pergunta não fizer sentido para sua história; basta seguir adiante.</p>

                <div class="publica-info-paciente">
                    <div><span class="publica-info-label">Paciente:</span> ${escapeHtml(state.info.paciente_nome || '—')}</div>
                    ${dn ? `<div><span class="publica-info-label">Nascimento:</span> ${escapeHtml(dn)}</div>` : ''}
                </div>

                ${state.retomando ? `
                <div class="publica-retomada">
                    <span style="font-size:19px;line-height:1">✓</span>
                    <div>
                        <strong>Você já havia começado.</strong>
                        Suas respostas foram guardadas e vamos continuar de onde parou.
                    </div>
                </div>` : `
                <div class="publica-retomada">
                    <span style="font-size:19px;line-height:1">💾</span>
                    <div>
                        <strong>Pode responder com calma.</strong>
                        O progresso é salvo automaticamente. Se precisar parar, é só
                        fechar e abrir este mesmo link depois para continuar.
                    </div>
                </div>`}

                <p class="publica-bv-conv"><em>${state.retomando ? 'Vamos continuar?' : 'Vamos começar esta jornada juntos?'}</em></p>
                <button class="btn btn-primary btn-lg publica-btn-block" id="btn-comecar">${state.retomando ? 'Continuar →' : 'Começar →'}</button>
            </div>
        `;
    }

    function renderEnviado() {
        return `
            <div class="publica-enviado">
                <div class="publica-enviado-icone">✓</div>
                <h1>Respostas enviadas!</h1>
                <p>Obrigado por preencher a anamnese. Seu psicólogo terá acesso às respostas e entrará em contato.</p>
                <p class="publica-aviso">Você pode fechar esta página agora.</p>
            </div>
        `;
    }

    // -----------------------------------------------------------------------
    // Renderizadores de campos — IDÊNTICOS ao anamnese.js (DSL antigo)
    // -----------------------------------------------------------------------
    function renderCampo(f) {
        const fullClass = f.full ? 'fg-full' : '';
        const reqMark = f.req ? '<span class="required">*</span>' : '';
        const ph = f.ph || '';

        // Sprint 55: bloco informativo (texto estático, não gera input)
        if (f.tp === 'info') {
            return `
                <div class="form-group fg-full anamnese-info-bloco">
                    ${f.html || `<p>${escapeHtml(f.lb || '')}</p>`}
                </div>
            `;
        }

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
            const itens = (f.its || []).map(it => `
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

    // -----------------------------------------------------------------------
    function aplicarValores(sec) {
        const col = sec.col;
        // Sprint 55: seções puramente informativas (boas-vindas) não têm col
        if (!col) return;
        if (!state.dados[col]) state.dados[col] = {};

        (sec.g2 || sec.g3 || []).forEach(f => {
            // Sprint 55: tipo 'info' é apenas conteúdo estático, ignora
            if (f.tp === 'info') return;

            const v = state.dados[col][f.id];

            if (f.tp === 'cks') {
                document.querySelectorAll(`input[type="checkbox"][data-campo="${f.id}"]`).forEach(cb => {
                    cb.checked = Array.isArray(v) && v.includes(cb.dataset.valor);
                });
                return;
            }

            if (f.tp === 'sn' || f.tp === 'sn_ta') {
                document.querySelectorAll(`input[type="radio"][data-campo="${f.id}"]`).forEach(r => {
                    r.checked = r.dataset.valor === v;
                });
                if (f.tp === 'sn_ta') {
                    const det = document.querySelector(`[data-campo="${f.id}_det"]`);
                    if (det) {
                        det.style.display = (v === 'Sim') ? '' : 'none';
                        const dv = state.dados[col][f.id + '_det'];
                        if (dv) det.value = dv;
                    }
                }
                return;
            }

            if (f.tp === 'sel_other') {
                const sel = document.querySelector(`select[data-campo="${f.id}"]`);
                const inp = document.querySelector(`input[data-campo="${f.id}_other"]`);
                if (sel && v !== undefined) sel.value = v;
                if (inp) {
                    inp.style.display = (v === 'Outro') ? '' : 'none';
                    const ov = state.dados[col][f.id + '_other'];
                    if (ov) inp.value = ov;
                }
                return;
            }

            const el = document.querySelector(`[data-campo="${f.id}"]`);
            if (!el) return;
            if (v !== undefined && v !== null && v !== '') el.value = v;
        });
    }

    function setupListeners(sec) {
        const col = sec.col;
        if (!col) return;  // Sprint 55: seção informativa não tem listeners

        (sec.g2 || sec.g3 || []).forEach(f => {
            // Sprint 55: tipo 'info' não tem listeners
            if (f.tp === 'info') return;

            if (f.tp === 'cks') {
                document.querySelectorAll(`input[type="checkbox"][data-campo="${f.id}"]`).forEach(cb => {
                    cb.addEventListener('change', () => {
                        state.dados[col][f.id] = Array.from(
                            document.querySelectorAll(`input[type="checkbox"][data-campo="${f.id}"]:checked`)
                        ).map(c => c.dataset.valor);
                        marcarAlteracao();
                    });
                });
                return;
            }

            if (f.tp === 'sn' || f.tp === 'sn_ta') {
                document.querySelectorAll(`input[type="radio"][data-campo="${f.id}"]`).forEach(r => {
                    r.addEventListener('change', () => {
                        if (r.checked) {
                            state.dados[col][f.id] = r.dataset.valor;
                            marcarAlteracao();
                            if (f.tp === 'sn_ta') {
                                const det = document.querySelector(`[data-campo="${f.id}_det"]`);
                                if (det) det.style.display = (r.dataset.valor === 'Sim') ? '' : 'none';
                            }
                        }
                    });
                });
                if (f.tp === 'sn_ta') {
                    const det = document.querySelector(`[data-campo="${f.id}_det"]`);
                    if (det) det.addEventListener('input', () => {
                        state.dados[col][f.id + '_det'] = det.value.trim();
                        marcarAlteracao();
                    });
                }
                return;
            }

            if (f.tp === 'sel_other') {
                const sel = document.querySelector(`select[data-campo="${f.id}"]`);
                const inp = document.querySelector(`input[data-campo="${f.id}_other"]`);
                if (sel) sel.addEventListener('change', () => {
                    state.dados[col][f.id] = sel.value;
                    if (inp) inp.style.display = (sel.value === 'Outro') ? '' : 'none';
                    marcarAlteracao();
                });
                if (inp) inp.addEventListener('input', () => {
                    state.dados[col][f.id + '_other'] = inp.value.trim();
                    marcarAlteracao();
                });
                return;
            }

            const el = document.querySelector(`[data-campo="${f.id}"]`);
            if (!el) return;
            const evento = (f.tp === 'ta' || f.tp === 'text' || f.tp === 'num') ? 'input' : 'change';
            el.addEventListener(evento, () => {
                state.dados[col][f.id] = el.value.trim();
                marcarAlteracao();
            });
        });
    }

    // -----------------------------------------------------------------------
    async function enviar() {
        if (state.enviando) return;
        if (!confirm('Enviar as respostas?\n\nApós o envio você não poderá editar.')) return;
        state.enviando = true;
        renderizar();

        try {
            const { data, error } = await supabase.rpc('anamnese_publica_submit', {
                p_token:                state.token,
                p_identificacao:        state.dados.identificacao || {},
                p_queixa_historico:     state.dados.queixa_historico || {},
                p_contexto_familiar:    state.dados.contexto_familiar || {},
                p_desenvolvimento:      state.dados.desenvolvimento || {},
                p_social_emocional:     state.dados.social_emocional || {},
                p_historico_escolar:    state.dados.historico_escolar || {},
                p_saude_medicacoes:     state.dados.saude_medicacoes || {},
                p_outros_profissionais: state.dados.outros_profissionais || {}
            });
            if (error) throw error;
            if (data && data.erro) throw new Error(data.erro);

            limparLocal();          // enviada: rascunho não serve mais
            state.enviado = true;
            state.enviando = false;
            renderizar();
            window.scrollTo(0, 0);
        } catch (err) {
            console.error('[publica] enviar:', err);
            alert('Erro ao enviar: ' + (err.message || err));
            state.enviando = false;
            renderizar();
        }
    }

    function mostrarErro(msg) {
        document.getElementById('publica-conteudo').innerHTML = `
            <div class="publica-erro">
                <div class="publica-erro-icone">⚠</div>
                <p>${escapeHtml(msg)}</p>
            </div>
        `;
    }

    // Última rede: sair da aba grava o que estiver pendente. O sendBeacon
    // não serve aqui (a RPC precisa do cabeçalho da apikey), então gravamos
    // no aparelho — que é o que sobrevive ao fechamento.
    window.addEventListener('beforeunload', () => {
        if (!state.enviado && state.rascunho === 'pendente') salvarLocal();
    });

    // Celular que vai para segundo plano dispara visibilitychange, não
    // beforeunload. Aqui dá tempo de subir para o servidor.
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden' && !state.enviado) {
            salvarLocal();
            salvarServidor(true);
        }
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

// redeploy 2026-09-17 13:24

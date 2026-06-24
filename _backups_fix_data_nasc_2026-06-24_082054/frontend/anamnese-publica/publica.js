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
        enviado: false
    };

    let supabase = null;

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------
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
                state.secaoIdx = 0;
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
            ? new Date(state.info.paciente_data_nascimento).toLocaleDateString('pt-BR')
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

        const btnVoltar = document.getElementById('btn-voltar');
        if (btnVoltar) btnVoltar.addEventListener('click', () => {
            if (!ehPrimeira) {
                state.secaoIdx--;
                renderizar();
                window.scrollTo(0, 0);
            }
        });

        const btnProx = document.getElementById('btn-proxima');
        if (btnProx) btnProx.addEventListener('click', () => {
            state.secaoIdx++;
            renderizar();
            window.scrollTo(0, 0);
        });

        const btnEnv = document.getElementById('btn-enviar');
        if (btnEnv) btnEnv.addEventListener('click', enviar);
    }

    function renderBoasVindas() {
        const dn = state.info.paciente_data_nascimento
            ? new Date(state.info.paciente_data_nascimento).toLocaleDateString('pt-BR')
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

                <p class="publica-bv-conv"><em>Vamos começar esta jornada juntos?</em></p>
                <button class="btn btn-primary btn-lg publica-btn-block" id="btn-comecar">Começar →</button>
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
                    });
                });
                return;
            }

            if (f.tp === 'sn' || f.tp === 'sn_ta') {
                document.querySelectorAll(`input[type="radio"][data-campo="${f.id}"]`).forEach(r => {
                    r.addEventListener('change', () => {
                        if (r.checked) {
                            state.dados[col][f.id] = r.dataset.valor;
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
                });
                if (inp) inp.addEventListener('input', () => {
                    state.dados[col][f.id + '_other'] = inp.value.trim();
                });
                return;
            }

            const el = document.querySelector(`[data-campo="${f.id}"]`);
            if (!el) return;
            const evento = (f.tp === 'ta' || f.tp === 'text' || f.tp === 'num') ? 'input' : 'change';
            el.addEventListener(evento, () => {
                state.dados[col][f.id] = el.value.trim();
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

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

// ============================================================================
// CORTEX_APP — BFP Resultado (modo edição + modo laudo)
// ============================================================================
// URL: /correcao/bfp/bfp_resultado.html?aplicacao_id=<uuid>
//
// FLUXO (idêntico ao WISC-IV):
//   1. Carrega aplicacao_instrumento + paciente + brutos + (opcional) bfp_resultados
//   2. Decide modo:
//      - Sem bfp_resultados → MODO EDIÇÃO (form com 126 inputs Likert 1-7)
//      - Com bfp_resultados → MODO LAUDO (read-only, mas tem botão "Editar brutos")
//   3. MODO EDIÇÃO:
//      [💾 Salvar parcial]   — só persiste brutos + textos (status fica 'aguardando')
//      [📊 Calcular]         — chama Edge Function bfp-calcular → status='corrigido' → laudo
//   4. MODO LAUDO:
//      [✏️ Editar brutos]   — volta pra modo edição
//      [📄 Gerar PDF]       — html2canvas + jsPDF
// ============================================================================

(function () {
    'use strict';

    // ────────────────────────────────────────────────────────────────────────
    // Constantes BFP
    // ────────────────────────────────────────────────────────────────────────

    const ORDEM = ['N1','N2','N3','N4','N','E1','E2','E3','E4','E','S1','S2','S3','S','R1','R2','R3','R','A1','A2','A3','A'];

    const FATOR_COR = {
        N: '#e74c3c', E: '#f39c12', S: '#27ae60', R: '#2980b9', A: '#8e44ad',
    };
    const FATOR_BG = {
        N: 'linear-gradient(135deg,#e74c3c,#c0392b)',
        E: 'linear-gradient(135deg,#f39c12,#e67e22)',
        S: 'linear-gradient(135deg,#27ae60,#1e8449)',
        R: 'linear-gradient(135deg,#2980b9,#1a5276)',
        A: 'linear-gradient(135deg,#8e44ad,#6c3483)',
    };
    const FAIXA_COR = {
        'Muito Baixo': { fg: '#dc2626', bg: '#fef2f2' },
        'Baixo':       { fg: '#f59e0b', bg: '#fffbeb' },
        'Médio':       { fg: '#3b82f6', bg: '#eff6ff' },
        'Alto':        { fg: '#059669', bg: '#f0fdf4' },
        'Muito Alto':  { fg: '#065f46', bg: '#ecfdf5' },
    };

    const CHIPS_OBSERVACOES = [
        { label: 'Colaborativa',         texto: 'Colaborativa(o) e engajada(o) durante toda a aplicação' },
        { label: 'Compreensão adequada', texto: 'Apresentou boa compreensão das instruções e dos itens' },
        { label: 'Respostas refletidas', texto: 'Respondeu de forma refletida, ponderando antes de marcar' },
        { label: 'Respostas rápidas',    texto: 'Tendência a respostas rápidas, sem aparente reflexão' },
        { label: 'Pediu esclarecimentos',texto: 'Solicitou esclarecimento sobre alguns itens' },
        { label: 'Fadiga',               texto: 'Sinais de fadiga ao longo da aplicação' },
        { label: 'Ansiedade',            texto: 'Ansiedade leve durante a aplicação' },
        { label: 'Boa colaboração',      texto: 'Boa colaboração e engajamento na tarefa' },
    ];

    const state = {
        aplicacaoId: null,
        aplicacao: null,
        paciente: null,
        instrumento: null,
        respostas: {},   // { 1: 5, 2: 3, ... }
        rules: null,     // bfp_rules.json
        resultado: null, // bfp_resultados (null se ainda não calculou)
        modo: 'edicao',  // 'edicao' | 'laudo'
        salvando: false,
    };

    // ────────────────────────────────────────────────────────────────────────
    // Bootstrap
    // ────────────────────────────────────────────────────────────────────────

    window.addEventListener('cortex:auth-ready', async () => {
        await CortexSidebar.render('pacientes');

        const params = new URLSearchParams(window.location.search);
        state.aplicacaoId = params.get('aplicacao_id');

        if (!state.aplicacaoId) {
            mostrarErro('aplicacao_id não fornecido na URL');
            return;
        }

        try {
            state.rules = await fetch('bfp_rules.json').then(r => r.json());
            await carregarTudo();
            decidirModo();
            renderizar();
        } catch (err) {
            console.error('[bfp] erro ao carregar:', err);
            mostrarErro('Erro: ' + (err.message || 'desconhecido'));
        }
    });

    // ────────────────────────────────────────────────────────────────────────
    // Carregamento
    // ────────────────────────────────────────────────────────────────────────

    async function carregarTudo() {
        // 1. Aplicação
        const { data: aplicacao, error: errA } = await window.cortexClient
            .from('aplicacoes_instrumento')
            .select('*')
            .eq('id', state.aplicacaoId)
            .single();
        if (errA) throw new Error('Aplicação não encontrada: ' + errA.message);
        state.aplicacao = aplicacao;

        // 2. Instrumento (sanity check)
        const { data: instrumento, error: errI } = await window.cortexClient
            .from('instrumentos_catalogo')
            .select('id, sigla, nome_completo, tipo_aplicacao')
            .eq('id', aplicacao.instrumento_id)
            .single();
        if (errI) throw new Error('Instrumento: ' + errI.message);
        if (instrumento.sigla !== 'BFP') {
            throw new Error(`Esta página é só pra BFP. Aplicação aponta pra ${instrumento.sigla}.`);
        }
        state.instrumento = instrumento;

        // 3. Paciente
        const { data: paciente, error: errP } = await window.cortexClient
            .from('pacientes')
            .select('id, nome_completo, sexo, data_nascimento, cpf, escolaridade')
            .eq('id', aplicacao.paciente_id)
            .single();
        if (errP) throw new Error('Paciente: ' + errP.message);
        state.paciente = paciente;

        // 4. Brutos (até 126 linhas)
        const { data: brutosRows, error: errB } = await window.cortexClient
            .from('bfp_brutos')
            .select('item_num, valor_resposta')
            .eq('aplicacao_id', state.aplicacaoId);
        if (errB) throw new Error('Brutos: ' + errB.message);
        state.respostas = {};
        for (const r of brutosRows || []) {
            if (r.valor_resposta != null) state.respostas[r.item_num] = r.valor_resposta;
        }

        // 5. Resultado (1 linha, ou null)
        const { data: resultado } = await window.cortexClient
            .from('bfp_resultados')
            .select('*')
            .eq('aplicacao_id', state.aplicacaoId)
            .maybeSingle();
        state.resultado = resultado || null;

        await CortexAudit.log('leitura', 'bfp_resultados', state.aplicacaoId, {
            detalhes: { sigla: 'BFP', tem_resultado: !!(resultado && resultado.eb_fatores) }
        });
    }

    function decidirModo() {
        const params = new URLSearchParams(window.location.search);
        if (params.get('modo') === 'edicao') {
            state.modo = 'edicao';
        } else {
            // Só é laudo se tem cálculo (eb_fatores preenchido)
            state.modo = (state.resultado && state.resultado.eb_fatores) ? 'laudo' : 'edicao';
        }
    }

    function renderizar() {
        document.getElementById('back-link').href =
            `../../bateria/bateria.html?paciente=${state.paciente.id}`;

        if (state.modo === 'edicao') {
            renderModoEdicao();
        } else {
            renderModoLaudo();
        }
    }

    // ════════════════════════════════════════════════════════════════════════
    // MODO EDIÇÃO
    // ════════════════════════════════════════════════════════════════════════

    function renderModoEdicao() {
        const acoes = document.getElementById('acoes-topo');
        acoes.style.display = 'flex';
        acoes.innerHTML = `
            <button class="btn btn-secondary" id="btn-salvar-parcial">
                💾 Salvar parcial
            </button>
            <button class="btn btn-primary" id="btn-calcular">
                📊 Calcular e gerar laudo
            </button>
        `;
        document.getElementById('btn-salvar-parcial').addEventListener('click', () => salvar(false));
        document.getElementById('btn-calcular').addEventListener('click', () => salvar(true));

        const cont = document.getElementById('laudo-conteudo');
        cont.innerHTML = renderFormulario();

        bindCamposForm();

        // Chips
        document.querySelectorAll('.bfp-chip').forEach(btn => {
            btn.addEventListener('click', () => {
                const texto = btn.dataset.texto;
                const ta = document.getElementById('obs-comportamentais');
                ta.value = (ta.value ? ta.value + '. ' : '') + texto;
                ta.focus();
            });
        });

        // Inputs Likert (126 itens)
        cont.querySelectorAll('.bfp-item-input input').forEach(inp => {
            inp.addEventListener('input', onItemInput);
            inp.addEventListener('keydown', onItemKey);
        });

        atualizarProgresso();
    }

    function renderFormulario() {
        const idade = calcularIdadeAnos(state.paciente.data_nascimento, state.aplicacao.data_aplicacao);
        const idadeTxt = idade != null ? `${idade} anos` : '—';
        const dataAplStr = state.aplicacao.data_aplicacao || '';
        const dataNascStr = state.paciente.data_nascimento || '';

        const statusLabel = state.aplicacao.status === 'corrigido' ? '✓ Corrigido' : '⏳ Aguardando cálculo';
        const statusColor = state.aplicacao.status === 'corrigido' ? '#166534' : '#854d0e';
        const statusBg    = state.aplicacao.status === 'corrigido' ? '#dcfce7' : '#fef3c7';

        return `
        <div class="bfp-aplicar-page">

            <div class="bfp-aplicar-header">
                <div>
                    <div class="bfp-aplicar-supratitulo">Aplicação Neuropsicológica · BFP</div>
                    <h1 class="bfp-aplicar-titulo">${escapeHtml(state.paciente.nome_completo)}</h1>
                    <div class="bfp-aplicar-subtitulo">
                        Bateria Fatorial de Personalidade — Modelo Big Five (126 itens)
                    </div>
                </div>
                <div class="bfp-aplicar-status" style="background:${statusBg}; color:${statusColor};">
                    ${statusLabel}
                </div>
            </div>

            <!-- 1. PROFISSIONAL -->
            <div class="bfp-form-card">
                <div class="bfp-form-card-header">
                    <span class="bfp-form-card-num">1</span>
                    <div>
                        <div class="bfp-form-card-title">Dados do Profissional</div>
                        <div class="bfp-form-card-desc">Aplicador responsável pela avaliação</div>
                    </div>
                </div>
                <div class="bfp-form-grid">
                    <div class="bfp-field">
                        <label for="prof-nome">Nome do profissional</label>
                        <input type="text" id="prof-nome" value="${escapeHtml(state.resultado?.profissional_nome || '')}" placeholder="Nome completo">
                    </div>
                    <div class="bfp-field">
                        <label for="prof-crp">CRP</label>
                        <input type="text" id="prof-crp" value="${escapeHtml(state.resultado?.profissional_crp || '')}" placeholder="04/12345">
                    </div>
                    <div class="bfp-field">
                        <label for="prof-esp">Especialidade</label>
                        <input type="text" id="prof-esp" value="${escapeHtml(state.resultado?.profissional_especialidade || '')}" placeholder="Ex: Neuropsicóloga">
                    </div>
                    <div class="bfp-field">
                        <label for="prof-contato">Contato</label>
                        <input type="text" id="prof-contato" value="${escapeHtml(state.resultado?.profissional_contato || '')}" placeholder="E-mail ou telefone">
                    </div>
                </div>
            </div>

            <!-- 2. EXAMINANDO -->
            <div class="bfp-form-card">
                <div class="bfp-form-card-header">
                    <span class="bfp-form-card-num">2</span>
                    <div>
                        <div class="bfp-form-card-title">Dados do Examinando</div>
                        <div class="bfp-form-card-desc">Sexo é obrigatório (norma BFP é específica por sexo)</div>
                    </div>
                </div>
                <div class="bfp-form-grid">
                    <div class="bfp-field">
                        <label>Nome</label>
                        <input type="text" value="${escapeHtml(state.paciente.nome_completo)}" readonly>
                    </div>
                    <div class="bfp-field">
                        <label>Sexo</label>
                        <input type="text" value="${escapeHtml(state.paciente.sexo || '— (cadastre no paciente)')}" readonly>
                    </div>
                    <div class="bfp-field">
                        <label>Data de Nascimento</label>
                        <input type="date" value="${dataNascStr}" readonly>
                    </div>
                    <div class="bfp-field">
                        <label for="data-aplicacao">Data de Aplicação <span style="color:#dc2626">*</span></label>
                        <input type="date" id="data-aplicacao" value="${dataAplStr}" required>
                        <span class="bfp-field-hint" id="hint-idade">Idade na aplicação: ${idadeTxt}</span>
                    </div>
                </div>
                <div class="bfp-field" style="margin-top:14px;">
                    <label for="motivo">Motivo do encaminhamento</label>
                    <textarea id="motivo" rows="2" placeholder="Ex: Avaliação de personalidade no contexto de...">${escapeHtml(state.resultado?.motivo_encaminhamento || '')}</textarea>
                </div>
            </div>

            <!-- 3. ITENS LIKERT 1-7 -->
            <div class="bfp-form-card">
                <div class="bfp-form-card-header">
                    <span class="bfp-form-card-num">3</span>
                    <div>
                        <div class="bfp-form-card-title">Respostas dos 126 Itens (Escala 1 a 7)</div>
                        <div class="bfp-form-card-desc">
                            <strong>1</strong> = Absolutamente não me identifico —
                            <strong>4</strong> = Mais ou menos —
                            <strong>7</strong> = Descreve-me perfeitamente
                        </div>
                    </div>
                </div>

                <div class="bfp-progress-text"><span id="prog-text">0 / 126 respondidos</span></div>
                <div class="bfp-progress"><div id="prog-fill" class="bfp-progress-fill"></div></div>

                ${renderLegenda()}
                ${renderItens()}
            </div>

            <!-- 4. OBSERVAÇÕES COMPORTAMENTAIS -->
            <div class="bfp-form-card">
                <div class="bfp-form-card-header">
                    <span class="bfp-form-card-num">4</span>
                    <div>
                        <div class="bfp-form-card-title">Observações Comportamentais</div>
                        <div class="bfp-form-card-desc">Registros qualitativos durante a aplicação</div>
                    </div>
                </div>
                <div class="bfp-chips">
                    ${CHIPS_OBSERVACOES.map(c => `
                        <button type="button" class="bfp-chip" data-texto="${escapeHtml(c.texto)}">${escapeHtml(c.label)}</button>
                    `).join('')}
                </div>
                <div class="bfp-field">
                    <label for="obs-comportamentais">Observações</label>
                    <textarea id="obs-comportamentais" rows="4" placeholder="Descreva o comportamento do examinando durante a aplicação...">${escapeHtml(state.resultado?.observacoes_comportamentais || '')}</textarea>
                </div>
            </div>

            <!-- 5. RECOMENDAÇÕES -->
            <div class="bfp-form-card">
                <div class="bfp-form-card-header">
                    <span class="bfp-form-card-num">5</span>
                    <div>
                        <div class="bfp-form-card-title">Conclusão e Recomendações</div>
                        <div class="bfp-form-card-desc">Sugestões terapêuticas, educacionais e encaminhamentos</div>
                    </div>
                </div>
                <div class="bfp-field">
                    <label for="recomendacoes">Recomendações</label>
                    <textarea id="recomendacoes" rows="4">${escapeHtml(state.resultado?.recomendacoes || '')}</textarea>
                </div>
            </div>

        </div>
        `;
    }

    function renderLegenda() {
        const html = ['N','E','S','R','A'].map(f => {
            const nome = state.rules.fatores[f].nome;
            return `<span class="bfp-leg-tag" style="color:${FATOR_COR[f]};">
                      <span class="bfp-leg-dot" style="background:${FATOR_BG[f]};"></span>
                      ${f} — ${nome}
                    </span>`;
        }).join('');
        return `<div class="bfp-legend">${html}</div>`;
    }

    function renderItens() {
        const facToFator = {};
        for (const f in state.rules.fatores) {
            for (const fac of state.rules.fatores[f].facetas) facToFator[fac] = f;
        }
        const itens = [...state.rules.itens].sort((a, b) => a.num - b.num);

        const rows = itens.map(it => {
            const fatorKey = facToFator[it.faceta] || '?';
            const cor = FATOR_COR[fatorKey] || '#64748b';
            const bg = FATOR_BG[fatorKey] || '';
            const facetaNome = state.rules.facetas[it.faceta]?.nome || it.faceta;
            const fatorNome = state.rules.fatores[fatorKey]?.nome || fatorKey;
            const valor = state.respostas[it.num] ?? '';
            const filledClass = valor !== '' ? ' filled' : '';
            return `
                <div class="bfp-item-row${filledClass}" id="bfp-item-${it.num}" style="border-left-color:${cor};">
                    <div class="bfp-item-num" style="background:${bg};">${it.num}</div>
                    <div class="bfp-item-body">
                        <div class="bfp-item-text">Item ${it.num}${it.inv ? ' <span class="bfp-inv">(INV)</span>' : ''}</div>
                        <div class="bfp-item-meta">
                            <span style="color:${cor};font-weight:700;">${it.faceta}</span> — ${escapeHtml(facetaNome)}
                            <span class="bfp-item-meta-faint">(${fatorKey} — ${escapeHtml(fatorNome)})</span>
                        </div>
                    </div>
                    <div class="bfp-item-input">
                        <input type="number" min="1" max="7" step="1"
                               data-num="${it.num}" value="${valor}" placeholder="1-7">
                    </div>
                </div>
            `;
        }).join('');

        return `<div class="bfp-itens">${rows}</div>`;
    }

    function bindCamposForm() {
        const dataApl = document.getElementById('data-aplicacao');
        if (dataApl) {
            dataApl.addEventListener('change', () => {
                const idade = calcularIdadeAnos(state.paciente.data_nascimento, dataApl.value);
                const hint = document.getElementById('hint-idade');
                if (idade != null) {
                    if (idade < 18 || idade > 75) {
                        hint.innerHTML = `<span style="color:#dc2626">⚠ Idade ${idade} fora da faixa normativa do BFP (18-75)</span>`;
                        hint.classList.add('warn');
                    } else {
                        hint.textContent = `Idade na aplicação: ${idade} anos`;
                        hint.classList.remove('warn');
                    }
                } else {
                    hint.textContent = 'Idade na aplicação: —';
                }
            });
        }
    }

    function onItemInput(e) {
        const num = parseInt(e.target.dataset.num);
        const val = parseInt(e.target.value);
        const row = document.getElementById(`bfp-item-${num}`);
        if (val >= 1 && val <= 7) {
            state.respostas[num] = val;
            e.target.classList.remove('invalid');
            row.classList.add('filled');
        } else if (e.target.value === '') {
            delete state.respostas[num];
            e.target.classList.remove('invalid');
            row.classList.remove('filled');
        } else {
            e.target.classList.add('invalid');
            delete state.respostas[num];
            row.classList.remove('filled');
        }
        atualizarProgresso();
    }

    function onItemKey(e) {
        if (e.key === 'Enter' || e.key === 'Tab') {
            const inputs = Array.from(document.querySelectorAll('.bfp-item-input input'));
            const idx = inputs.indexOf(e.target);
            if (idx >= 0 && idx < inputs.length - 1) {
                e.preventDefault();
                inputs[idx + 1].focus();
                inputs[idx + 1].select();
            }
        }
    }

    function atualizarProgresso() {
        const n = Object.keys(state.respostas).length;
        const pct = Math.round((n / 126) * 100);
        document.getElementById('prog-fill').style.width = pct + '%';
        document.getElementById('prog-text').textContent = `${n} / 126 respondidos`;
    }

    function coletarFormulario() {
        const dataApl = document.getElementById('data-aplicacao')?.value || null;
        return {
            data_aplicacao: dataApl,
            respostas: { ...state.respostas },
            profissional_nome:           document.getElementById('prof-nome')?.value || '',
            profissional_crp:            document.getElementById('prof-crp')?.value || '',
            profissional_especialidade:  document.getElementById('prof-esp')?.value || '',
            profissional_contato:        document.getElementById('prof-contato')?.value || '',
            motivo_encaminhamento:       document.getElementById('motivo')?.value || '',
            observacoes_comportamentais: document.getElementById('obs-comportamentais')?.value || '',
            recomendacoes:               document.getElementById('recomendacoes')?.value || '',
        };
    }

    // ────────────────────────────────────────────────────────────────────────
    // SALVAR (parcial ou com cálculo) — padrão WISC
    // ────────────────────────────────────────────────────────────────────────

    async function salvar(comCalculo) {
        if (state.salvando) return;
        const dados = coletarFormulario();

        if (comCalculo) {
            if (!dados.data_aplicacao) {
                window.CortexUI.toast('Data de aplicação é obrigatória pra calcular', 'danger');
                return;
            }
            if (!state.paciente.sexo || !['Masculino','Feminino'].includes(state.paciente.sexo)) {
                window.CortexUI.toast('Sexo do paciente é obrigatório (norma BFP é específica por sexo)', 'danger');
                return;
            }
            const idade = calcularIdadeAnos(state.paciente.data_nascimento, dados.data_aplicacao);
            // Aviso (não bloqueia) se idade fora da faixa normativa 18-75.
            // O legado (app.neuroequilibrium) não validava idade, e a decisão
            // clínica aqui foi permitir cálculo fora da norma com aviso visual
            // (Sprint Wess 2026-05-21).
            if (idade == null) {
                window.CortexUI.toast('Não foi possível calcular a idade (verifique data de aplicação e nascimento)', 'danger');
                return;
            }
            if (idade < 18 || idade > 75) {
                window.CortexUI.toast(`⚠ Idade ${idade} fora da faixa normativa BFP (18-75). Cálculo usará a norma adulta padrão.`, 'warning');
            }
            if (Object.keys(dados.respostas).length === 0) {
                window.CortexUI.toast('Insira pelo menos 1 resposta pra calcular', 'danger');
                return;
            }
            if (Object.keys(dados.respostas).length < 126) {
                if (!confirm(`Apenas ${Object.keys(dados.respostas).length} de 126 itens foram respondidos. Itens faltantes serão tratados como ausentes. Continuar?`)) {
                    return;
                }
            }
        }

        state.salvando = true;
        const btnParcial  = document.getElementById('btn-salvar-parcial');
        const btnCalcular = document.getElementById('btn-calcular');
        const origParcial  = btnParcial?.textContent;
        const origCalcular = btnCalcular?.textContent;
        if (btnParcial)  { btnParcial.disabled = true;  btnParcial.textContent = '⏳ Salvando...'; }
        if (btnCalcular) { btnCalcular.disabled = true; btnCalcular.textContent = comCalculo ? '⏳ Calculando...' : '⏳ Aguarde'; }

        try {
            // 1. Atualiza data_aplicacao
            if (dados.data_aplicacao) {
                const { error: errAp } = await window.cortexClient
                    .from('aplicacoes_instrumento')
                    .update({ data_aplicacao: dados.data_aplicacao })
                    .eq('id', state.aplicacaoId);
                if (errAp) throw new Error('Erro ao salvar data de aplicação: ' + errAp.message);
            }

            // 2. DELETE + INSERT brutos (igual WISC)
            const { error: errDel } = await window.cortexClient
                .from('bfp_brutos')
                .delete()
                .eq('aplicacao_id', state.aplicacaoId);
            if (errDel) throw new Error('Erro ao limpar brutos: ' + errDel.message);

            const inserts = Object.entries(dados.respostas).map(([item_num, valor_resposta]) => ({
                aplicacao_id: state.aplicacaoId,
                item_num: Number(item_num),
                valor_resposta: Number(valor_resposta),
            }));
            if (inserts.length > 0) {
                const { error: errIns } = await window.cortexClient
                    .from('bfp_brutos')
                    .insert(inserts);
                if (errIns) throw new Error('Erro ao salvar respostas: ' + errIns.message);
            }

            // 3. Campos qualitativos
            const camposQuali = {
                aplicacao_id: state.aplicacaoId,
                profissional_nome:           dados.profissional_nome,
                profissional_crp:            dados.profissional_crp,
                profissional_especialidade:  dados.profissional_especialidade,
                profissional_contato:        dados.profissional_contato,
                motivo_encaminhamento:       dados.motivo_encaminhamento,
                observacoes_comportamentais: dados.observacoes_comportamentais,
                recomendacoes:               dados.recomendacoes,
            };

            if (comCalculo) {
                // UPDATE quali se já existe (pra preservar antes da Edge Fn)
                if (state.resultado) {
                    const { error: errUp } = await window.cortexClient
                        .from('bfp_resultados')
                        .update(camposQuali)
                        .eq('aplicacao_id', state.aplicacaoId);
                    if (errUp) throw new Error('Erro ao salvar campos qualitativos: ' + errUp.message);
                }

                // Chama Edge Function
                const { data: invokeData, error: errInvoke } =
                    await window.cortexClient.functions.invoke('bfp-calcular', {
                        body: { aplicacao_id: state.aplicacaoId },
                    });
                if (errInvoke) {
                    let msg = errInvoke.message || 'erro desconhecido';
                    if (errInvoke.context?.body) {
                        try {
                            const j = JSON.parse(await errInvoke.context.body.text());
                            if (j.error) msg = j.error;
                        } catch (_) { /* ignora */ }
                    }
                    throw new Error('Edge Function: ' + msg);
                }
                if (invokeData?.ok === false) {
                    throw new Error('Edge Function: ' + (invokeData.error || 'falha desconhecida'));
                }

                // UPDATE dos textos qualitativos pós-Edge
                const { error: errUp2 } = await window.cortexClient
                    .from('bfp_resultados')
                    .update(camposQuali)
                    .eq('aplicacao_id', state.aplicacaoId);
                if (errUp2) throw new Error('Erro ao salvar campos qualitativos: ' + errUp2.message);

                window.CortexUI.toast('✓ Cálculo concluído', 'success');

            } else {
                // Salvar parcial
                if (state.resultado) {
                    const { error: errUp } = await window.cortexClient
                        .from('bfp_resultados')
                        .update(camposQuali)
                        .eq('aplicacao_id', state.aplicacaoId);
                    if (errUp) throw new Error('Erro ao salvar textos: ' + errUp.message);
                } else {
                    // UPSERT inicial — JSONBs ficam NULL (mas isso é OK no schema)
                    const { error: errUp } = await window.cortexClient
                        .from('bfp_resultados')
                        .upsert(camposQuali, { onConflict: 'aplicacao_id' });
                    if (errUp) throw new Error('Erro ao salvar parcial: ' + errUp.message);
                }
                window.CortexUI.toast('💾 Parcial salvo', 'info');
            }

            await CortexAudit.log(comCalculo ? 'calculo' : 'salvamento', 'bfp_resultados', state.aplicacaoId, {
                detalhes: { sigla: 'BFP', qtd_respostas: inserts.length, com_calculo: comCalculo }
            });

            if (comCalculo) {
                const url = new URL(window.location.href);
                url.searchParams.delete('modo');
                window.location.href = url.toString();
            } else {
                await carregarTudo();
                renderizar();
            }

        } catch (err) {
            console.error('[bfp salvar]', err);
            window.CortexUI.toast(err.message || 'Erro ao salvar', 'danger');
        } finally {
            state.salvando = false;
            if (btnParcial)  { btnParcial.disabled = false;  btnParcial.textContent = origParcial; }
            if (btnCalcular) { btnCalcular.disabled = false; btnCalcular.textContent = origCalcular; }
        }
    }

    // ════════════════════════════════════════════════════════════════════════
    // MODO LAUDO
    // ════════════════════════════════════════════════════════════════════════

    function renderModoLaudo() {
        const acoes = document.getElementById('acoes-topo');
        acoes.style.display = 'flex';
        acoes.innerHTML = `
            <button class="btn btn-secondary" id="btn-editar-brutos">✏️ Editar brutos</button>
            <button class="btn btn-primary" id="btn-gerar-pdf">📄 Gerar PDF do relatório</button>
        `;
        document.getElementById('btn-editar-brutos').addEventListener('click', () => {
            const url = new URL(window.location.href);
            url.searchParams.set('modo', 'edicao');
            window.location.href = url.toString();
        });
        document.getElementById('btn-gerar-pdf').addEventListener('click', gerarPDF);

        const cont = document.getElementById('laudo-conteudo');
        cont.innerHTML = renderLaudoCompleto();
    }

    function renderLaudoCompleto() {
        const r = state.resultado;
        const dataApl = state.aplicacao.data_aplicacao;
        const idadeStr = `${r.idade_anos} anos`;
        const normaLabel = r.sexo_norma === 'masculino' ? '♂ Masculino'
                         : r.sexo_norma === 'feminino' ? '♀ Feminino'
                         : 'Geral';

        let secNum = 1;
        const sec = () => secNum++;

        return `
        <div class="laudo">
            <div class="laudo-header">
                <div class="laudo-header-esq">
                    <div class="laudo-header-logo">E</div>
                    <div class="laudo-header-textos">
                        <div class="laudo-header-supratitulo">Relatório Neuropsicológico</div>
                        <h1 class="laudo-header-titulo">BFP</h1>
                        <div class="laudo-header-subtitulo">
                            Bateria Fatorial de Personalidade — Modelo Big Five<br>
                            Nunes, Hutz &amp; Nunes (2010) · 126 itens · 5 fatores e 17 facetas
                        </div>
                    </div>
                </div>
                <div class="laudo-header-pontuacao">
                    <div class="laudo-header-pontuacao-label">Norma</div>
                    <div class="laudo-header-pontuacao-valor">${normaLabel}</div>
                    <div class="laudo-header-pontuacao-max" style="font-size:11px;">${idadeStr}</div>
                </div>
            </div>

            <div class="laudo-body">

                <!-- 1. IDENTIFICAÇÃO -->
                <div class="laudo-secao-titulo"><span class="laudo-secao-tag">${sec()}</span>Identificação</div>
                <div class="laudo-identificacao">
                    <div class="laudo-identif-item"><span class="laudo-identif-label">Nome:</span><span class="laudo-identif-valor">${escapeHtml(state.paciente.nome_completo)}</span></div>
                    <div class="laudo-identif-item"><span class="laudo-identif-label">CPF:</span><span class="laudo-identif-valor">${escapeHtml(state.paciente.cpf || '—')}</span></div>
                    <div class="laudo-identif-item"><span class="laudo-identif-label">Sexo:</span><span class="laudo-identif-valor">${escapeHtml(state.paciente.sexo || '—')}</span></div>
                    <div class="laudo-identif-item"><span class="laudo-identif-label">Escolaridade:</span><span class="laudo-identif-valor">${escapeHtml(state.paciente.escolaridade || '—')}</span></div>
                    <div class="laudo-identif-item"><span class="laudo-identif-label">Nascimento:</span><span class="laudo-identif-valor">${formatarDataBR(state.paciente.data_nascimento)} (${idadeStr})</span></div>
                    <div class="laudo-identif-item"><span class="laudo-identif-label">Aplicação:</span><span class="laudo-identif-valor">${formatarDataBR(dataApl)}</span></div>
                    <div class="laudo-identif-item"><span class="laudo-identif-label">Profissional:</span><span class="laudo-identif-valor">${escapeHtml(r.profissional_nome || '—')}${r.profissional_crp ? ' — ' + escapeHtml(r.profissional_crp) : ''}</span></div>
                    <div class="laudo-identif-item"><span class="laudo-identif-label">Especialidade:</span><span class="laudo-identif-valor">${escapeHtml(r.profissional_especialidade || '—')}</span></div>
                </div>

                <!-- 2. MOTIVO -->
                ${r.motivo_encaminhamento ? `
                    <div class="laudo-secao-titulo"><span class="laudo-secao-tag">${sec()}</span>Motivo do Encaminhamento</div>
                    <div class="bfp-texto-bloco">${escapeHtml(r.motivo_encaminhamento)}</div>
                ` : ''}

                <!-- SOBRE O INSTRUMENTO -->
                <div class="laudo-secao-titulo"><span class="laudo-secao-tag">${sec()}</span>Sobre o Instrumento</div>
                <div class="bfp-texto-bloco">
                    <p>A <strong>BFP (Bateria Fatorial de Personalidade)</strong>, desenvolvida por Nunes, Hutz e Nunes (2010), é um instrumento de avaliação psicológica baseado no modelo dos Cinco Grandes Fatores (Big Five). Composta por <strong>126 itens</strong> respondidos em escala Likert de 1 a 7, avalia cinco dimensões amplas: Neuroticismo, Extroversão, Socialização, Realização e Abertura a experiências.</p>
                    <p>Cada fator é composto por facetas que permitem análise detalhada do perfil. Os escores brutos são convertidos em <strong>escores Z</strong> e <strong>percentis</strong>, com norma específica por sexo.</p>
                </div>

                <!-- PERFIL GRÁFICO -->
                <div class="laudo-secao-titulo"><span class="laudo-secao-tag">${sec()}</span>Perfil Gráfico dos Fatores
                    <span class="laudo-secao-hint">Eixo Z (-3 a +3). Faixa central = Médio (P30-P70).</span>
                </div>
                <div class="bfp-perfil-bloco">${renderGraficoSVG(r)}</div>

                <!-- TABELA -->
                <div class="laudo-secao-titulo"><span class="laudo-secao-tag">${sec()}</span>Tabela de Resultados
                    <span class="laudo-secao-hint">17 facetas + 5 fatores totais.</span>
                </div>
                <div class="bfp-tab-resultados">${renderTabela(r)}</div>

                <!-- INTERPRETAÇÃO POR FATOR -->
                <div class="laudo-secao-titulo"><span class="laudo-secao-tag">${sec()}</span>Interpretação por Fator</div>
                <div class="bfp-interp-bloco">${renderInterpretacao(r)}</div>

                ${r.observacoes_comportamentais ? `
                    <div class="laudo-secao-titulo"><span class="laudo-secao-tag">${sec()}</span>Observações Comportamentais</div>
                    <div class="bfp-texto-bloco">${escapeHtml(r.observacoes_comportamentais)}</div>
                ` : ''}

                ${r.recomendacoes ? `
                    <div class="laudo-secao-titulo"><span class="laudo-secao-tag">${sec()}</span>Conclusão e Recomendações</div>
                    <div class="bfp-texto-bloco">${escapeHtml(r.recomendacoes)}</div>
                ` : ''}

                <!-- CRITÉRIOS -->
                <div class="laudo-secao-titulo"><span class="laudo-secao-tag">${sec()}</span>Critérios e Considerações</div>
                <div class="bfp-texto-bloco bfp-obs-bloco">
                    <p><strong>Critérios de Classificação:</strong> Muito Baixo (P1-14), Baixo (P15-29), Médio (P30-70), Alto (P71-85), Muito Alto (P86-99).</p>
                    <p><strong>Nota:</strong> Os resultados devem ser interpretados em conjunto com a entrevista clínica, a história do paciente e outros dados da avaliação. A BFP é uma ferramenta dimensional e seus resultados não devem ser utilizados isoladamente para fins diagnósticos.</p>
                </div>

            </div>
        </div>
        `;
    }

    function renderGraficoSVG(r) {
        const fatores = ['N','E','S','R','A'];
        const nomes = { N:'Neuroticismo', E:'Extroversão', S:'Socialização', R:'Realização', A:'Abertura' };
        const barW = 80, barGap = 30, padL = 60, top = 40, h = 200;
        const w = padL + fatores.length * (barW + barGap) + 40;
        const totalH = h + 90;

        let grid = '', bars = '', labels = '';
        for (let z = -3; z <= 3; z++) {
            const y = top + h/2 - (z * h/6);
            const dash = z === 0 ? '' : ` stroke-dasharray="4,3"`;
            const col = z === 0 ? '#94a3b8' : '#e2e8f0';
            const sw = z === 0 ? 1.5 : 1;
            grid += `<line x1="${padL}" y1="${y}" x2="${w-20}" y2="${y}" stroke="${col}" stroke-width="${sw}"${dash}/>`;
            grid += `<text x="${padL-8}" y="${y+4}" text-anchor="end" font-size="11" fill="#94a3b8">${z.toFixed(1)}</text>`;
        }
        fatores.forEach((f, i) => {
            const z = (r.z_fatores && r.z_fatores[f]) ?? 0;
            const p = (r.percentil_fatores && r.percentil_fatores[f]) ?? 50;
            const cor = FATOR_COR[f];
            const x = padL + i*(barW+barGap) + barGap/2;
            const midY = top + h/2;
            const barH = Math.abs(z) * (h/6);
            const yStart = z >= 0 ? midY - barH : midY;
            bars += `<rect x="${x}" y="${yStart}" width="${barW}" height="${Math.max(barH,2)}" rx="4" fill="${cor}" opacity="0.85"/>`;
            const labY = z >= 0 ? yStart - 6 : yStart + barH + 14;
            bars += `<text x="${x+barW/2}" y="${labY}" text-anchor="middle" font-size="12" font-weight="700" fill="${cor}">${z.toFixed(1)}</text>`;
            labels += `<text x="${x+barW/2}" y="${top+h+18}" text-anchor="middle" font-size="12" font-weight="600" fill="#334155">${nomes[f]}</text>`;
            labels += `<text x="${x+barW/2}" y="${top+h+32}" text-anchor="middle" font-size="10" fill="#94a3b8">P${pTxt(p)}</text>`;
        });
        return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${totalH}" viewBox="0 0 ${w} ${totalH}" style="max-width:100%;">
            <rect width="${w}" height="${totalH}" fill="#fafcff" rx="8"/>
            ${grid}
            <line x1="${padL}" y1="${top+h/2}" x2="${w-20}" y2="${top+h/2}" stroke="#1e293b" stroke-width="1.5"/>
            ${bars}${labels}
            <text x="${w/2}" y="22" text-anchor="middle" font-size="14" font-weight="700" fill="#1e293b">Perfil de Escores Z — Fatores BFP</text>
        </svg>`;
    }

    function renderTabela(r) {
        const linhas = ORDEM.map(k => {
            const isFator = k.length === 1;
            const eb = isFator ? r.eb_fatores?.[k] : r.eb_facetas?.[k];
            const z  = isFator ? r.z_fatores?.[k]  : r.z_facetas?.[k];
            const p  = isFator ? r.percentil_fatores?.[k] : r.percentil_facetas?.[k];
            const c  = isFator ? r.classificacao_fatores?.[k] : r.classificacao_facetas?.[k];
            const nome = nomeFull(k);
            const corFator = FATOR_COR[isFator ? k : k[0]];
            const cor = FAIXA_COR[c] || { fg:'#6b7280', bg:'#f9fafb' };
            const trClass = isFator ? ' class="bfp-row-fator"' : '';
            return `<tr${trClass}>
                <td style="${isFator ? `font-weight:700;color:${corFator};` : ''}">${escapeHtml(nome)}</td>
                <td class="ctr">${eb != null ? eb.toFixed(2) : '—'}</td>
                <td class="ctr">${z != null ? z.toFixed(1) : '—'}</td>
                <td class="ctr">${pTxt(p)}</td>
                <td class="ctr"><span class="bfp-class-badge" style="color:${cor.fg};background:${cor.bg};border:1px solid ${cor.fg}33;">${escapeHtml(c || '—')}</span></td>
            </tr>`;
        }).join('');

        return `<table>
            <thead><tr>
                <th>Faceta / Fator</th>
                <th class="ctr">Escore Bruto</th>
                <th class="ctr">Escore Z</th>
                <th class="ctr">Percentil</th>
                <th class="ctr">Classificação</th>
            </tr></thead>
            <tbody>${linhas}</tbody>
        </table>`;
    }

    function renderInterpretacao(r) {
        const fatores = ['N','E','S','R','A'];
        return fatores.map(f => {
            const fData = state.rules.fatores[f];
            const cor = FATOR_COR[f];
            const bg = FATOR_BG[f];
            const z = r.z_fatores?.[f];
            const p = r.percentil_fatores?.[f];
            const c = r.classificacao_fatores?.[f];

            const cardsFacetas = fData.facetas.map(facKey => {
                const fac = state.rules.facetas[facKey];
                const ebF = r.eb_facetas?.[facKey];
                const zF  = r.z_facetas?.[facKey];
                const pF  = r.percentil_facetas?.[facKey];
                const cF  = r.classificacao_facetas?.[facKey];
                const interp = fac?.interpretacoes?.[cF] || '';
                const corClass = (FAIXA_COR[cF] || {}).fg || '#6b7280';

                return `
                <div class="bfp-faceta-card" style="border-left-color:${cor};">
                    <div class="bfp-faceta-title" style="color:${cor};">${facKey} — ${escapeHtml(fac.nome)}</div>
                    <div class="bfp-faceta-meta">
                        EB: ${ebF != null ? ebF.toFixed(2) : '—'} |
                        Z: ${zF != null ? zF.toFixed(1) : '—'} |
                        P${pTxt(pF)} |
                        <strong style="color:${corClass};">${escapeHtml(cF || '—')}</strong>
                    </div>
                    ${interp ? `<div class="bfp-faceta-interp">${escapeHtml(interp)}</div>` : ''}
                </div>`;
            }).join('');

            return `
            <div class="bfp-fator-card">
                <div class="bfp-fator-header" style="background:${bg};">
                    <div class="bfp-fator-title">${escapeHtml(fData.nome)} (${f})</div>
                    <div class="bfp-fator-sub">Z = ${z != null ? z.toFixed(1) : '—'} | Percentil: ${pTxt(p)} | ${escapeHtml(c || '—')}</div>
                </div>
                <div class="bfp-fator-body">
                    <p>${escapeHtml(fData.descricaoAlto)}</p>
                    ${cardsFacetas}
                </div>
            </div>`;
        }).join('');
    }

    // ────────────────────────────────────────────────────────────────────────
    // PDF
    // ────────────────────────────────────────────────────────────────────────

    async function gerarPDF() {
        const btn = document.getElementById('btn-gerar-pdf');
        const orig = btn.textContent;
        btn.disabled = true;
        btn.textContent = '⏳ Gerando PDF...';
        try {
            document.body.classList.add('exportando');
            await new Promise(r => setTimeout(r, 100));
            const laudo = document.querySelector('.laudo');
            if (!laudo) throw new Error('Laudo não encontrado');

            const canvas = await html2canvas(laudo, {
                scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false
            });

            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            const pdfWidth = 210, pdfHeight = 297;
            const imgHeight = (canvas.height * pdfWidth) / canvas.width;

            if (imgHeight <= pdfHeight) {
                pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, pdfWidth, imgHeight);
            } else {
                let posY = 0, restante = imgHeight;
                while (restante > 0) {
                    pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, -posY, pdfWidth, imgHeight);
                    restante -= pdfHeight;
                    posY += pdfHeight;
                    if (restante > 0) pdf.addPage();
                }
            }

            const nomeAbreviado = state.paciente.nome_completo.toUpperCase()
                .replace(/[^A-Z\s]/g, '').trim().substring(0, 50);
            const dataStr = formatarDataArquivo(new Date());
            const nomeArquivo = `BFP - ${nomeAbreviado}_${dataStr}.pdf`;
            pdf.save(nomeArquivo);
            window.CortexUI.toast('PDF gerado com sucesso', 'success');
        } catch (err) {
            console.error('Erro ao gerar PDF:', err);
            window.CortexUI.toast('Erro ao gerar PDF: ' + err.message, 'danger');
        } finally {
            document.body.classList.remove('exportando');
            btn.disabled = false;
            btn.textContent = orig;
        }
    }

    // ────────────────────────────────────────────────────────────────────────
    // HELPERS
    // ────────────────────────────────────────────────────────────────────────

    function nomeFull(k) {
        if (k.length === 1) return state.rules.fatores[k].nome + ' (Total)';
        return `${k} — ${state.rules.facetas[k].nome}`;
    }

    function pTxt(p) {
        if (p == null) return '—';
        if (p >= 95) return '> 95';
        if (p <= 5) return '< 5';
        return String(p);
    }

    function calcularIdadeAnos(nascISO, refISO) {
        if (!nascISO) return null;
        const ref = refISO ? new Date(refISO) : new Date();
        const n = new Date(nascISO);
        if (isNaN(n) || isNaN(ref) || ref < n) return null;
        let anos = ref.getFullYear() - n.getFullYear();
        const m = ref.getMonth() - n.getMonth();
        if (m < 0 || (m === 0 && ref.getDate() < n.getDate())) anos--;
        return anos;
    }

    function formatarDataBR(iso) {
        if (!iso) return '—';
        const d = String(iso).includes('T') ? new Date(iso) : new Date(iso + 'T00:00:00');
        return d.toLocaleDateString('pt-BR');
    }

    function formatarDataArquivo(d) {
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    }

    function mostrarErro(msg) {
        document.getElementById('laudo-conteudo').innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="12" y1="8" x2="12" y2="12"/>
                        <line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                </div>
                <div class="empty-state-title">${escapeHtml(msg)}</div>
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

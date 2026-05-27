// ============================================================================
// CORTEX_APP — Correção RAVLT (Teste de Aprendizagem Auditivo-Verbal de Rey)
// ============================================================================
// URL: /correcao/ravlt/ravlt_resultado.html?aplicacao_id=<uuid>
//
// FLUXO:
//   1. Carrega aplicacao_instrumento + paciente + brutos + (opcional) resultados
//   2. Decide modo:
//      - Sem ravlt_resultados → MODO EDIÇÃO (form pra digitar 8 brutos + recon)
//      - Com ravlt_resultados → MODO LAUDO (A4, read-only, com botão Editar)
//   3. Botões de modo edição:
//      [💾 Salvar parcial]    — UPSERT em ravlt_brutos
//      [📊 Calcular]          — chama Edge Function ravlt-calcular → status='corrigido'
//   4. Botões de modo laudo:
//      [✏️ Editar brutos]     — volta pra modo edição (preserva resultados)
//      [📄 Gerar PDF]
//
// PADRÃO VISUAL: clonado de WAIS/WISC, adaptado pro fluxo RAVLT.
// ============================================================================

(function() {
    'use strict';

    const SIGLA = 'RAVLT';
    const NOME_INSTRUMENTO = 'Teste de Aprendizagem Auditivo-Verbal de Rey';

    // Lista de tentativas (na ordem da curva)
    const TENTATIVAS = ['A1','A2','A3','A4','A5','B1','A6','A7'];

    // Chips de observações comuns
    const CHIPS_OBSERVACOES = [
        { label: 'Atenção sustentada',  texto: 'Manteve atenção sustentada durante toda a aplicação' },
        { label: 'Fadiga',              texto: 'Apresentou sinais de fadiga ao longo da aplicação' },
        { label: 'Estratégia ativa',    texto: 'Utilizou estratégia ativa de organização para memorização' },
        { label: 'Repetição',           texto: 'Necessitou de repetição da consigna' },
        { label: 'Ansiedade',           texto: 'Demonstrou ansiedade durante as evocações' },
        { label: 'Confiança',           texto: 'Demonstrou confiança nas respostas' },
        { label: 'Hesitação',           texto: 'Apresentou hesitação nas evocações tardias' },
        { label: 'Boa colaboração',     texto: 'Boa colaboração e engajamento na tarefa' },
    ];

    // ────────────────────────────────────────────────────────────────────────
    // Estado
    // ────────────────────────────────────────────────────────────────────────
    const state = {
        aplicacaoId: null,
        aplicacao:   null,
        paciente:    null,
        brutos:      {},      // { a1, a2, ..., a7, b1, recon_acertos, intrusoes, observacoes }
        resultado:   null,    // ravlt_resultados (null se ainda não calculou)
        modo:        'edicao' // 'edicao' | 'laudo'
    };

    // ────────────────────────────────────────────────────────────────────────
    // Bootstrap
    // ────────────────────────────────────────────────────────────────────────
    window.addEventListener('cortex:auth-ready', async () => {
        try {
            await CortexSidebar.render('pacientes');

            const params = new URLSearchParams(window.location.search);
            state.aplicacaoId = params.get('aplicacao_id');
            if (!state.aplicacaoId) {
                throw new Error('Parâmetro aplicacao_id ausente na URL.');
            }

            await carregarTudo();
            configurarBackLink();
            decidirModoERenderizar();

        } catch (err) {
            console.error('[ravlt] erro ao carregar:', err);
            document.getElementById('laudo-conteudo').innerHTML =
                `<div class="laudo-erro">Erro ao carregar: ${escapeHtml(err.message || String(err))}</div>`;
        }
    });

    function configurarBackLink() {
        const link = document.getElementById('back-link');
        if (!link || !state.paciente) return;
        // Volta pra bateria do paciente
        link.href = `../../pacientes/pasta.html?id=${state.paciente.id}#bateria`;
    }

    // ────────────────────────────────────────────────────────────────────────
    // Carregamento
    // ────────────────────────────────────────────────────────────────────────
    async function carregarTudo() {
        const sb = window.cortexClient;

        // 1. Aplicação + instrumento
        const { data: aplicacao, error: errAp } = await sb
            .from('aplicacoes_instrumento')
            .select(`
                id, paciente_id, data_aplicacao, status, created_at,
                instrumentos_catalogo!inner(id, sigla, nome_completo)
            `)
            .eq('id', state.aplicacaoId)
            .single();
        if (errAp) throw errAp;
        if (aplicacao.instrumentos_catalogo.sigla !== SIGLA) {
            throw new Error(`Aplicação não é ${SIGLA}.`);
        }
        state.aplicacao = aplicacao;

        // 2. Paciente
        const { data: paciente, error: errPac } = await sb
            .from('pacientes')
            .select('id, nome_completo, data_nascimento, sexo, foto_url')
            .eq('id', aplicacao.paciente_id)
            .single();
        if (errPac) throw errPac;
        state.paciente = paciente;

        // 3. Brutos (pode não existir ainda)
        const { data: brutos } = await sb
            .from('ravlt_brutos')
            .select('*')
            .eq('aplicacao_id', state.aplicacaoId)
            .maybeSingle();
        state.brutos = brutos || {};

        // 4. Resultados (pode não existir ainda)
        const { data: resultado } = await sb
            .from('ravlt_resultados')
            .select('*')
            .eq('aplicacao_id', state.aplicacaoId)
            .maybeSingle();
        state.resultado = resultado;
    }

    function decidirModoERenderizar() {
        if (state.resultado) {
            state.modo = 'laudo';
            renderModoLaudo();
        } else {
            state.modo = 'edicao';
            renderModoEdicao();
        }
    }

    // ────────────────────────────────────────────────────────────────────────
    // MODO EDIÇÃO (igual ao print que o user mandou)
    // ────────────────────────────────────────────────────────────────────────
    function renderModoEdicao() {
        const acoes = document.getElementById('acoes-topo');
        acoes.style.display = 'flex';
        acoes.innerHTML = `
            <button class="btn btn-secondary" id="btn-salvar-parcial">💾 Salvar parcial</button>
            <button class="btn btn-primary" id="btn-calcular">📊 Calcular e gerar laudo</button>
        `;

        const laudo = document.getElementById('laudo-conteudo');
        laudo.classList.remove('modo-laudo');
        laudo.classList.add('modo-edicao');

        const idadeAnos = calcularIdadeAnos(state.paciente.data_nascimento, state.aplicacao.data_aplicacao);
        const idadeMeses = calcularIdadeMeses(state.paciente.data_nascimento, state.aplicacao.data_aplicacao);
        const dataApl = state.aplicacao.data_aplicacao || hoje();

        laudo.innerHTML = `
            <div class="ravlt-edicao-header">
                <div class="ravlt-edicao-breadcrumb">
                    Correção de Testes → ${SIGLA}
                </div>
                <h1 class="ravlt-edicao-titulo">${SIGLA} — ${escapeHtml(NOME_INSTRUMENTO)}</h1>
            </div>

            <!-- Seção 1: Dados do Profissional -->
            <div class="ravlt-form-card">
                <div class="ravlt-form-card-head">
                    <span class="ravlt-form-num">1</span>
                    <div>
                        <div class="ravlt-form-card-title">Dados do Profissional</div>
                        <div class="ravlt-form-card-desc">Informações do aplicador</div>
                    </div>
                </div>
                <div class="ravlt-form-grid-2">
                    <div class="ravlt-field">
                        <label>Nome do Profissional</label>
                        <input type="text" id="prof-nome" value="${escapeHtml(state.resultado?.profissional_nome || '')}" placeholder="Ex: Wessilon Marques de Sousa">
                    </div>
                    <div class="ravlt-field">
                        <label>CRP</label>
                        <input type="text" id="prof-crp" value="${escapeHtml(state.resultado?.profissional_crp || '')}" placeholder="Ex: 04/53832">
                    </div>
                </div>
            </div>

            <!-- Seção 2: Dados do Paciente -->
            <div class="ravlt-form-card">
                <div class="ravlt-form-card-head">
                    <span class="ravlt-form-num">2</span>
                    <div>
                        <div class="ravlt-form-card-title">Dados do Paciente</div>
                        <div class="ravlt-form-card-desc">Identificação e datas</div>
                    </div>
                </div>
                <div class="ravlt-form-grid-3">
                    <div class="ravlt-field">
                        <label>Nome do Paciente</label>
                        <input type="text" value="${escapeHtml(state.paciente.nome_completo)}" disabled>
                    </div>
                    <div class="ravlt-field">
                        <label>Data de Nascimento</label>
                        <input type="text" value="${formatarData(state.paciente.data_nascimento)}" disabled>
                    </div>
                    <div class="ravlt-field">
                        <label>Data de Aplicação</label>
                        <input type="date" id="data-aplicacao" value="${dataApl}">
                    </div>
                </div>
                <div id="hint-idade" class="ravlt-hint-idade">
                    ${idadeAnos != null
                      ? `Idade na aplicação: <strong>${idadeAnos} anos e ${idadeMeses ?? 0} meses</strong>${faixaHint(idadeAnos)}`
                      : 'Preencha a data de aplicação para ver a faixa normativa.'}
                </div>
            </div>

            <!-- Seção 3: Escores Brutos -->
            <div class="ravlt-form-card">
                <div class="ravlt-form-card-head">
                    <span class="ravlt-form-num">3</span>
                    <div>
                        <div class="ravlt-form-card-title">Escores Brutos</div>
                        <div class="ravlt-form-card-desc">Número de palavras evocadas corretamente em cada tentativa (0-15)</div>
                    </div>
                </div>

                <div class="ravlt-grupo-titulo">Lista A — Tentativas de Aprendizagem</div>
                <div class="ravlt-inputs-row ravlt-inputs-5">
                    ${renderInputBruto('A1')}
                    ${renderInputBruto('A2')}
                    ${renderInputBruto('A3')}
                    ${renderInputBruto('A4')}
                    ${renderInputBruto('A5')}
                </div>

                <div class="ravlt-grupo-titulo">Lista B — Distrator</div>
                <div class="ravlt-inputs-row ravlt-inputs-1">
                    ${renderInputBruto('B1')}
                </div>

                <div class="ravlt-grupo-titulo">Evocação</div>
                <div class="ravlt-inputs-row ravlt-inputs-2">
                    ${renderInputBruto('A6', 'A6 (Imediata)')}
                    ${renderInputBruto('A7', 'A7 (Tardia)')}
                </div>

                <div class="ravlt-grupo-titulo">Reconhecimento</div>
                <div class="ravlt-inputs-row ravlt-inputs-1">
                    <div class="ravlt-input-block">
                        <label>Acertos (0-50)</label>
                        <input type="number" min="0" max="50" id="bruto-recon"
                               value="${state.brutos.recon_acertos ?? ''}" placeholder="0">
                    </div>
                </div>
                <div class="ravlt-input-hint">Reconhecimento ajustado = Acertos − 35</div>
            </div>

            <!-- Seção 4: Observações Comportamentais -->
            <div class="ravlt-form-card">
                <div class="ravlt-form-card-head">
                    <span class="ravlt-form-num">4</span>
                    <div>
                        <div class="ravlt-form-card-title">Observações Comportamentais</div>
                        <div class="ravlt-form-card-desc">Opcional — clique nos chips ou digite</div>
                    </div>
                </div>
                <div class="ravlt-chips">
                    ${CHIPS_OBSERVACOES.map(c => `
                        <button type="button" class="ravlt-chip" data-texto="${escapeHtml(c.texto)}">${escapeHtml(c.label)}</button>
                    `).join('')}
                </div>
                <div class="ravlt-field">
                    <label>Texto livre</label>
                    <textarea id="obs-texto" rows="3" placeholder="Observações adicionais sobre comportamento, atenção, ansiedade, etc.">${escapeHtml(state.brutos.observacoes || '')}</textarea>
                </div>
                <div class="ravlt-field" style="margin-top:12px;">
                    <label>Intrusões (opcional)</label>
                    <input type="number" min="0" id="obs-intrusoes"
                           value="${state.brutos.intrusoes ?? ''}"
                           placeholder="Número de palavras intrusas (não pertencentes à lista A)"
                           style="max-width:120px;">
                </div>
            </div>
        `;

        bindCamposForm();
        bindBotoes();
        bindChips();
    }

    function renderInputBruto(codigo, customLabel) {
        const valor = state.brutos[codigo.toLowerCase()] ?? '';
        return `
            <div class="ravlt-input-block">
                <label>${customLabel || codigo}</label>
                <input type="number" min="0" max="15" id="bruto-${codigo}"
                       data-codigo="${codigo}" value="${valor}" placeholder="0">
            </div>
        `;
    }

    function bindCamposForm() {
        // Recalcula idade/faixa quando muda data de aplicação
        const dataApl = document.getElementById('data-aplicacao');
        dataApl?.addEventListener('change', () => {
            const idade = calcularIdadeAnos(state.paciente.data_nascimento, dataApl.value);
            const meses = calcularIdadeMeses(state.paciente.data_nascimento, dataApl.value);
            const hint = document.getElementById('hint-idade');
            if (idade == null) {
                hint.textContent = 'Data inválida.';
                hint.classList.add('warn');
                return;
            }
            if (idade < 6) {
                hint.innerHTML = `<span style="color:#dc2626">⚠ Idade ${idade} anos abaixo da faixa normativa do RAVLT (mínimo 6 anos).</span>`;
                hint.classList.add('warn');
                return;
            }
            hint.classList.remove('warn');
            hint.innerHTML = `Idade na aplicação: <strong>${idade} anos e ${meses} meses</strong>${faixaHint(idade)}`;
        });
    }

    function bindBotoes() {
        document.getElementById('btn-salvar-parcial')?.addEventListener('click', () => salvar(false));
        document.getElementById('btn-calcular')?.addEventListener('click', () => salvar(true));
    }

    function bindChips() {
        document.querySelectorAll('.ravlt-chip').forEach(btn => {
            btn.addEventListener('click', () => {
                const txt = btn.dataset.texto;
                const ta = document.getElementById('obs-texto');
                if (!ta) return;
                ta.value = ta.value.trim()
                    ? ta.value.trim() + '. ' + txt
                    : txt;
                ta.focus();
            });
        });
    }

    // ────────────────────────────────────────────────────────────────────────
    // Salvar / Calcular
    // ────────────────────────────────────────────────────────────────────────
    async function salvar(eCalcular) {
        try {
            // Coleta dados do form
            const profNome = document.getElementById('prof-nome')?.value.trim() || null;
            const profCrp = document.getElementById('prof-crp')?.value.trim() || null;
            const dataApl = document.getElementById('data-aplicacao')?.value;
            if (!dataApl) { window.CortexUI.toast('Preencha a data de aplicação.', 'danger'); return; }

            const idade = calcularIdadeAnos(state.paciente.data_nascimento, dataApl);
            if (idade == null || idade < 6) {
                window.CortexUI.toast(`Idade ${idade ?? '?'} fora da faixa normativa (mínimo 6 anos).`, 'danger');
                return;
            }

            const brutos = {};
            for (const cod of TENTATIVAS) {
                const el = document.getElementById(`bruto-${cod}`);
                const v = el?.value;
                if (eCalcular && (v === '' || v == null)) {
                    window.CortexUI.toast(`Preencha o escore ${cod} antes de calcular.`, 'danger');
                    return;
                }
                if (v !== '' && v != null) {
                    const n = parseInt(v, 10);
                    if (isNaN(n) || n < 0 || n > 15) {
                        window.CortexUI.toast(`${cod} = ${v} inválido. Use 0-15.`, 'danger');
                        return;
                    }
                    brutos[cod.toLowerCase()] = n;
                }
            }
            const reconV = document.getElementById('bruto-recon')?.value;
            if (eCalcular && (reconV === '' || reconV == null)) {
                window.CortexUI.toast('Preencha o Reconhecimento.', 'danger');
                return;
            }
            if (reconV !== '' && reconV != null) {
                const n = parseInt(reconV, 10);
                if (isNaN(n) || n < 0 || n > 50) {
                    window.CortexUI.toast(`Reconhecimento = ${reconV} inválido. Use 0-50.`, 'danger');
                    return;
                }
                brutos.recon_acertos = n;
            }
            const intrV = document.getElementById('obs-intrusoes')?.value;
            if (intrV !== '' && intrV != null) {
                brutos.intrusoes = parseInt(intrV, 10);
            }
            brutos.observacoes = document.getElementById('obs-texto')?.value.trim() || null;

            const sb = window.cortexClient;

            // 1. Atualiza data_aplicacao
            const { error: errAp } = await sb
                .from('aplicacoes_instrumento')
                .update({ data_aplicacao: dataApl })
                .eq('id', state.aplicacaoId);
            if (errAp) throw errAp;

            // 2. UPSERT em ravlt_brutos
            const { error: errBr } = await sb
                .from('ravlt_brutos')
                .upsert({ aplicacao_id: state.aplicacaoId, ...brutos }, { onConflict: 'aplicacao_id' });
            if (errBr) throw errBr;

            // 3. UPSERT campos qualitativos (sempre — mesmo no modo parcial)
            //    NOTE: ravlt_resultados pode não existir ainda — só insere se já tiver linha
            //    Se não existir, criar parcial só com os campos qualitativos não faz sentido,
            //    porque resultados é "snapshot do cálculo". Então: se ainda não calculou,
            //    guardamos prof_nome/crp temporariamente em ravlt_brutos? NÃO — vamos no calcular.
            //    Aqui só salvamos brutos + observações.

            if (!eCalcular) {
                window.CortexUI.toast('Salvo.', 'success');
                return;
            }

            // 4. Calcular: chama Edge Function
            window.CortexUI.toast('Calculando…', 'info');
            const r = await sb.functions.invoke('ravlt-calcular', {
                body: { aplicacao_id: state.aplicacaoId }
            });
            if (r.error) {
                let msg = r.error.message || 'Erro no cálculo';
                if (r.error.context) {
                    try {
                        const txt = await r.error.context.text();
                        const j = JSON.parse(txt);
                        msg = j.error || msg;
                    } catch (e) {}
                }
                throw new Error(msg);
            }

            // 5. UPDATE campos qualitativos em ravlt_resultados (já criado pela Edge Function)
            const { error: errResUp } = await sb
                .from('ravlt_resultados')
                .update({
                    profissional_nome: profNome,
                    profissional_crp:  profCrp,
                })
                .eq('aplicacao_id', state.aplicacaoId);
            if (errResUp) console.warn('Erro ao atualizar prof:', errResUp);

            // 6. Recarrega + vai pro modo laudo
            await carregarTudo();
            decidirModoERenderizar();
            window.CortexUI.toast('Laudo gerado.', 'success');

        } catch (err) {
            console.error('[ravlt salvar]', err);
            window.CortexUI.toast(`Erro: ${err.message || err}`, 'danger');
        }
    }

    // ────────────────────────────────────────────────────────────────────────
    // MODO LAUDO (A4)
    // ────────────────────────────────────────────────────────────────────────
    function renderModoLaudo() {
        const acoes = document.getElementById('acoes-topo');
        acoes.style.display = 'flex';
        acoes.innerHTML = `
            <button class="btn btn-secondary" id="btn-editar-brutos">✏️ Editar brutos</button>
            <button class="btn btn-primary" id="btn-gerar-pdf">📄 Gerar PDF do relatório</button>
        `;
        document.getElementById('btn-editar-brutos').addEventListener('click', () => {
            state.resultado = null;
            decidirModoERenderizar();
        });
        document.getElementById('btn-gerar-pdf').addEventListener('click', gerarPDF);

        const laudo = document.getElementById('laudo-conteudo');
        laudo.classList.remove('modo-edicao');
        laudo.classList.add('modo-laudo', 'laudo-body');

        laudo.innerHTML = `
            ${renderHeaderLaudo()}
            ${renderSecaoIdentificacao()}
            ${renderSecaoCurva()}
            ${renderSecaoTabelaResultados()}
            ${renderSecaoInterpretacao()}
            ${renderRodapeLaudo()}
        `;
    }

    function renderHeaderLaudo() {
        const r = state.resultado;
        return `
            <div class="ravlt-header-laudo">
                <div class="ravlt-header-brand">EQUILIBRIUM NEUROPSICOLOGIA</div>
                <div class="ravlt-header-titulo-row">
                    <div>
                        <div class="ravlt-header-sigla">RAVLT</div>
                        <div class="ravlt-header-subtitulo">${escapeHtml(NOME_INSTRUMENTO)}</div>
                        <div class="ravlt-header-en">Rey Auditory Verbal Learning Test</div>
                    </div>
                    <div class="ravlt-header-faixa">
                        <div class="ravlt-header-faixa-label">FAIXA NORMATIVA</div>
                        <div class="ravlt-header-faixa-valor">${escapeHtml(r.faixa_norma)}</div>
                        <div class="ravlt-header-faixa-idade">${r.idade_anos}a ${r.idade_meses}m</div>
                    </div>
                </div>
            </div>
        `;
    }

    function renderSecaoIdentificacao() {
        const p = state.paciente;
        const r = state.resultado;
        return `
            <div class="ravlt-secao">
                <div class="ravlt-secao-head">
                    <span class="ravlt-secao-num">1</span>
                    <div class="ravlt-secao-titulo">Identificação</div>
                </div>
                <div class="ravlt-identif-bloco">
                    <table class="ravlt-tab-identif">
                        <tr>
                            <td class="lbl">Paciente</td>
                            <td class="val"><strong>${escapeHtml(p.nome_completo)}</strong></td>
                        </tr>
                        <tr>
                            <td class="lbl">Data de Nascimento</td>
                            <td class="val">${formatarData(p.data_nascimento)}</td>
                        </tr>
                        <tr>
                            <td class="lbl">Idade na Aplicação</td>
                            <td class="val">${r.idade_anos} anos e ${r.idade_meses} meses</td>
                        </tr>
                        <tr>
                            <td class="lbl">Data de Aplicação</td>
                            <td class="val">${formatarData(state.aplicacao.data_aplicacao)}</td>
                        </tr>
                        <tr>
                            <td class="lbl">Faixa Normativa</td>
                            <td class="val"><strong>${escapeHtml(r.faixa_norma)} anos</strong></td>
                        </tr>
                        ${r.profissional_nome ? `
                        <tr class="sep">
                            <td class="lbl">Profissional</td>
                            <td class="val">${escapeHtml(r.profissional_nome)}${r.profissional_crp ? ` — ${escapeHtml(r.profissional_crp)}` : ''}</td>
                        </tr>
                        ` : ''}
                    </table>
                </div>
            </div>
        `;
    }

    function renderSecaoCurva() {
        return `
            <div class="ravlt-secao">
                <div class="ravlt-secao-head">
                    <span class="ravlt-secao-num">2</span>
                    <div class="ravlt-secao-titulo">Curva de Aprendizagem</div>
                </div>
                <div class="ravlt-curva-bloco">
                    ${buildCurvaSVG()}
                </div>
            </div>
        `;
    }

    function buildCurvaSVG() {
        const r = state.resultado;
        const curva = r.curva || { paciente: [], normaPc50: [] };
        const scores  = curva.paciente  || [];
        const normPc50 = curva.normaPc50 || [];

        // Layout
        const W = 720, H = 280;
        const padL = 50, padR = 24, padT = 30, padB = 56;
        const chartW = W - padL - padR;
        const chartH = H - padT - padB;
        const labels = TENTATIVAS;  // A1..A5, B1, A6, A7
        const maxY = 15;
        const stepX = chartW / (labels.length - 1);
        const xFn = i => padL + i * stepX;
        const yFn = v => padT + chartH - (v / maxY) * chartH;

        let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" class="ravlt-curva-svg">`;

        // Background
        svg += `<rect x="0" y="0" width="${W}" height="${H}" fill="#fff" rx="8"/>`;

        // Grid + Y labels
        for (let v = 0; v <= 15; v += 3) {
            const y = yFn(v);
            svg += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="#e2e8f0" stroke-width="1"/>`;
            svg += `<text x="${padL - 8}" y="${y + 4}" text-anchor="end" fill="#94a3b8" font-size="11">${v}</text>`;
        }

        // Separador entre A5 e B1
        const sepX = (xFn(4) + xFn(5)) / 2;
        svg += `<line x1="${sepX}" y1="${padT}" x2="${sepX}" y2="${padT + chartH}" stroke="#cbd5e1" stroke-width="1" stroke-dasharray="4,4"/>`;

        // Curva normativa (Pc50) — tracejada cinza
        if (normPc50.length === labels.length) {
            let normPath = '';
            for (let i = 0; i < labels.length; i++) {
                normPath += (i === 0 ? 'M' : 'L') + ` ${xFn(i)},${yFn(normPc50[i])}`;
            }
            svg += `<path d="${normPath}" fill="none" stroke="#94a3b8" stroke-width="2" stroke-dasharray="6,4"/>`;
            for (let i = 0; i < labels.length; i++) {
                svg += `<circle cx="${xFn(i)}" cy="${yFn(normPc50[i])}" r="3" fill="#94a3b8"/>`;
            }
        }

        // Curva paciente — sólida azul
        if (scores.length === labels.length) {
            let scorePath = '';
            for (let i = 0; i < labels.length; i++) {
                scorePath += (i === 0 ? 'M' : 'L') + ` ${xFn(i)},${yFn(scores[i])}`;
            }
            svg += `<path d="${scorePath}" fill="none" stroke="#1a56db" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
            for (let i = 0; i < labels.length; i++) {
                svg += `<circle cx="${xFn(i)}" cy="${yFn(scores[i])}" r="5" fill="#1a56db" stroke="#fff" stroke-width="2"/>`;
                svg += `<text x="${xFn(i)}" y="${yFn(scores[i]) - 10}" text-anchor="middle" fill="#1a56db" font-size="11" font-weight="700">${scores[i]}</text>`;
            }
        }

        // Eixo X (labels)
        const xAxisY = padT + chartH + 18;
        for (let i = 0; i < labels.length; i++) {
            svg += `<text x="${xFn(i)}" y="${xAxisY}" text-anchor="middle" fill="#334155" font-size="12" font-weight="600">${labels[i]}</text>`;
        }

        // Legenda
        const legY = H - 14;
        svg += `
            <g>
                <line x1="${padL}" y1="${legY}" x2="${padL + 22}" y2="${legY}" stroke="#1a56db" stroke-width="2.5"/>
                <circle cx="${padL + 11}" cy="${legY}" r="3" fill="#1a56db"/>
                <text x="${padL + 28}" y="${legY + 4}" fill="#334155" font-size="11" font-weight="500">Paciente</text>

                <line x1="${padL + 110}" y1="${legY}" x2="${padL + 132}" y2="${legY}" stroke="#94a3b8" stroke-width="2" stroke-dasharray="6,4"/>
                <text x="${padL + 138}" y="${legY + 4}" fill="#334155" font-size="11" font-weight="500">Pc50 normativo (${escapeHtml(state.resultado.faixa_norma)})</text>
            </g>
        `;

        svg += '</svg>';

        // Hint embaixo
        svg += `<div class="ravlt-curva-hint">Linha azul: desempenho do paciente. Linha tracejada: Pc50 normativo para a faixa ${escapeHtml(state.resultado.faixa_norma)} anos.</div>`;
        return svg;
    }

    function renderSecaoTabelaResultados() {
        const medidas = state.resultado.medidas || [];
        // Agrupa
        const ordemGrupos = [
            'Primeiras etapas da aprendizagem',
            'Distrator',
            'Evocação imediata',
            'Evocação tardia',
            'Reconhecimento',
            'Índices de aprendizagem',
            'Índice de retenção',
            'Índices de interferência',
        ];

        let linhas = '';
        let lastGrupo = '';
        for (const grupo of ordemGrupos) {
            const items = medidas.filter(m => m.grupo === grupo);
            if (items.length === 0) continue;
            linhas += `<tr class="grupo-row"><td colspan="5">${escapeHtml(grupo)}</td></tr>`;
            for (const m of items) {
                const rawFmt = formatarBruto(m.key, m.raw);
                const pcFmt  = formatarBruto(m.key, m.normPc50);
                const pctTxt = m.pct == null ? '—' : `${m.pct}%`;
                const cls    = m.classificacao || { label: '—', cor: '#94a3b8' };
                linhas += `
                    <tr>
                        <td class="medida">${escapeHtml(m.label)}</td>
                        <td class="ctr">${rawFmt}</td>
                        <td class="ctr">${pcFmt}</td>
                        <td class="ctr">${pctTxt}</td>
                        <td class="ctr"><span class="ravlt-badge-cls" style="background:${cls.cor}15;color:${cls.cor};border:1px solid ${cls.cor}30;">${escapeHtml(cls.label)}</span></td>
                    </tr>
                `;
            }
        }

        return `
            <div class="ravlt-secao">
                <div class="ravlt-secao-head">
                    <span class="ravlt-secao-num">3</span>
                    <div class="ravlt-secao-titulo">Resultados Detalhados</div>
                </div>
                <div class="ravlt-tab-resultados">
                    <table>
                        <thead>
                            <tr>
                                <th>Medida</th>
                                <th class="ctr">Bruto</th>
                                <th class="ctr">Pc50 (Ref.)</th>
                                <th class="ctr">Percentil</th>
                                <th class="ctr">Classificação</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${linhas}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    function formatarBruto(key, val) {
        if (val == null) return '—';
        // Esquec, Proat, Retro são índices de razão (decimais)
        if (['Esquec','Proat','Retro'].includes(key)) {
            return Number(val).toFixed(2);
        }
        return String(val);
    }

    function renderSecaoInterpretacao() {
        const r = state.resultado;
        const interpretacao = (r.interpretacao || '').trim();
        const paragrafos = interpretacao
            ? interpretacao.split(/\n\n+/).map(p => `<p>${escapeHtml(p)}</p>`).join('')
            : '<p>Interpretação não disponível.</p>';

        return `
            <div class="ravlt-secao">
                <div class="ravlt-secao-head">
                    <span class="ravlt-secao-num">4</span>
                    <div class="ravlt-secao-titulo">Interpretação Clínica</div>
                </div>
                <div class="ravlt-interp-bloco">
                    ${paragrafos}
                </div>
            </div>
        `;
    }

    function renderRodapeLaudo() {
        const r = state.resultado;
        return `
            <div class="ravlt-rodape">
                <div class="ravlt-rodape-prof">
                    ${r.profissional_nome ? `<div class="prof-nome">${escapeHtml(r.profissional_nome)}</div>` : ''}
                    ${r.profissional_crp ? `<div class="prof-crp">${escapeHtml(r.profissional_crp)}</div>` : ''}
                    <div class="prof-assinatura">Assinatura do Profissional</div>
                </div>
                <div class="ravlt-rodape-data">
                    <div>${formatarData(state.aplicacao.data_aplicacao)}</div>
                    <div class="conf">Este documento é confidencial e destinado exclusivamente ao profissional responsável e ao paciente. A reprodução ou divulgação sem autorização é proibida.</div>
                </div>
            </div>
        `;
    }

    // ────────────────────────────────────────────────────────────────────────
    // GERAR PDF (html2canvas + jsPDF) — padrão dos demais instrumentos
    // ────────────────────────────────────────────────────────────────────────
    async function gerarPDF() {
        const btn = document.getElementById('btn-gerar-pdf');
        const orig = btn.textContent;
        btn.disabled = true;
        btn.textContent = '⏳ Gerando PDF...';
        try {
            document.body.classList.add('exportando');
            await new Promise(r => setTimeout(r, 100));
            const laudo = document.getElementById('laudo-conteudo');
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

            const nomeAbreviado = (state.paciente?.nome_completo || '').toUpperCase()
                .replace(/[^A-Z\s]/g, '').trim().substring(0, 50);
            const dataStr = formatarDataArquivo(new Date());
            const nomeArquivo = `RAVLT - ${nomeAbreviado}_${dataStr}.pdf`;
            pdf.save(nomeArquivo);
            if (window.CortexUI?.toast) window.CortexUI.toast('PDF gerado com sucesso', 'success');
        } catch (err) {
            console.error('Erro ao gerar PDF:', err);
            if (window.CortexUI?.toast) window.CortexUI.toast('Erro ao gerar PDF: ' + err.message, 'danger');
        } finally {
            document.body.classList.remove('exportando');
            btn.disabled = false;
            btn.textContent = orig;
        }
    }

    function formatarDataArquivo(d) {
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    }

    // ────────────────────────────────────────────────────────────────────────
    // Helpers
    // ────────────────────────────────────────────────────────────────────────
    function calcularIdadeAnos(nascISO, aplISO) {
        if (!nascISO || !aplISO) return null;
        const n = new Date(nascISO);
        const a = new Date(aplISO);
        if (isNaN(n.getTime()) || isNaN(a.getTime()) || a < n) return null;
        let anos = a.getFullYear() - n.getFullYear();
        const mDiff = a.getMonth() - n.getMonth();
        if (mDiff < 0 || (mDiff === 0 && a.getDate() < n.getDate())) anos--;
        return anos;
    }

    function calcularIdadeMeses(nascISO, aplISO) {
        if (!nascISO || !aplISO) return null;
        const n = new Date(nascISO);
        const a = new Date(aplISO);
        if (isNaN(n.getTime()) || isNaN(a.getTime()) || a < n) return null;
        let m = a.getMonth() - n.getMonth();
        if (a.getDate() < n.getDate()) m--;
        if (m < 0) m += 12;
        return m;
    }

    function faixaHint(idadeAnos) {
        if (idadeAnos == null) return '';
        const faixas = [
            [6, 8, '6-8'], [9, 11, '9-11'], [12, 14, '12-14'], [15, 17, '15-17'],
            [18, 20, '18-20'], [21, 30, '21-30'], [31, 40, '31-40'], [41, 50, '41-50'],
            [51, 60, '51-60'], [61, 70, '61-70'], [71, 79, '71-79'], [80, 999, '80+']
        ];
        for (const [lo, hi, label] of faixas) {
            if (idadeAnos >= lo && idadeAnos <= hi) {
                return ` — Faixa normativa: <strong style="color:#1a56db;">${label}</strong>`;
            }
        }
        return '';
    }

    function hoje() {
        const d = new Date();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${dd}`;
    }

    function formatarData(iso) {
        if (!iso) return '—';
        const [y, m, d] = String(iso).split('-');
        return `${d}/${m}/${y}`;
    }

    function escapeHtml(s) {
        if (s == null) return '';
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
})();

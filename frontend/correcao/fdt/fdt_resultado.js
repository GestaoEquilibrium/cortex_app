// ============================================================================
// CORTEX_APP — Correção FDT (Teste dos Cinco Dígitos)
// ============================================================================
// URL: /correcao/fdt/fdt_resultado.html?aplicacao_id=<uuid>
//
// FLUXO:
//   1. Carrega aplicacao_instrumento + paciente + brutos + (opcional) resultados
//   2. Decide modo:
//      - Sem fdt_resultados → MODO EDIÇÃO (form com tabela L/C/E/A)
//      - Com fdt_resultados → MODO LAUDO (A4 igual PDF)
//   3. Botões edição:
//      [💾 Salvar parcial]    — UPSERT em fdt_brutos
//      [📊 Calcular]          — chama Edge Function fdt-calcular
//   4. Botões laudo:
//      [✏️ Editar brutos]     — volta pra edição
//      [📄 Gerar PDF]         — window.print()
//
// VISUAL DO LAUDO (3 seções igual PDF):
//   Seção 1: Identificação
//   Seção 2: Resultados por Parte (tabela)
//   Seção 3: Perfil Percentílico dos Tempos (barras)
//   Seção 4: Comparação com a Norma (gauge horizontal por parte)
//   Seção 5: Interpretação Clínica
// ============================================================================

(function() {
    'use strict';

    const SIGLA = 'FDT';
    const NOME_INSTRUMENTO = 'Teste dos Cinco Dígitos';

    const CHIPS_OBSERVACOES = [
        { label: 'Atenção sustentada',  texto: 'Manteve atenção sustentada durante toda a aplicação' },
        { label: 'Fadiga',              texto: 'Apresentou sinais de fadiga ao longo da aplicação' },
        { label: 'Lentificação',        texto: 'Apresentou lentificação progressiva nas tarefas' },
        { label: 'Impulsividade',       texto: 'Demonstrou respostas impulsivas nas partes Escolha e Alternância' },
        { label: 'Ansiedade',           texto: 'Demonstrou ansiedade durante a aplicação' },
        { label: 'Boa colaboração',     texto: 'Boa colaboração e engajamento na tarefa' },
        { label: 'Auto-correção',       texto: 'Realizou auto-correções espontâneas durante a tarefa' },
        { label: 'Dificuldade na consigna', texto: 'Necessitou de repetição da consigna' },
    ];

    const state = {
        aplicacaoId: null,
        aplicacao:   null,
        paciente:    null,
        brutos:      {},
        resultado:   null,
        modo:        'edicao'
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
            console.error('[fdt] erro ao carregar:', err);
            document.getElementById('laudo-conteudo').innerHTML =
                `<div class="laudo-erro">Erro ao carregar: ${escapeHtml(err.message || String(err))}</div>`;
        }
    });

    function configurarBackLink() {
        const link = document.getElementById('back-link');
        if (!link || !state.paciente) return;
        link.href = `../../pacientes/pasta.html?id=${state.paciente.id}#bateria`;
    }

    // ────────────────────────────────────────────────────────────────────────
    // Carregamento
    // ────────────────────────────────────────────────────────────────────────
    async function carregarTudo() {
        const sb = window.cortexClient;

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

        const { data: paciente, error: errPac } = await sb
            .from('pacientes')
            .select('id, nome_completo, data_nascimento, sexo, foto_url')
            .eq('id', aplicacao.paciente_id)
            .single();
        if (errPac) throw errPac;
        state.paciente = paciente;

        const { data: brutos } = await sb
            .from('fdt_brutos')
            .select('*')
            .eq('aplicacao_id', state.aplicacaoId)
            .maybeSingle();
        state.brutos = brutos || {};

        const { data: resultado } = await sb
            .from('fdt_resultados')
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
    // MODO EDIÇÃO
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
            <div class="fdt-edicao-header">
                <div class="fdt-edicao-breadcrumb">Correção de Testes → ${SIGLA}</div>
                <h1 class="fdt-edicao-titulo">${SIGLA} — ${escapeHtml(NOME_INSTRUMENTO)}</h1>
            </div>

            <!-- Seção 1: Profissional -->
            <div class="fdt-form-card">
                <div class="fdt-form-card-head">
                    <span class="fdt-form-num">1</span>
                    <div>
                        <div class="fdt-form-card-title">Dados do Profissional</div>
                        <div class="fdt-form-card-desc">Informações do aplicador</div>
                    </div>
                </div>
                <div class="fdt-form-grid-2">
                    <div class="fdt-field">
                        <label>Nome do Profissional</label>
                        <input type="text" id="prof-nome" value="${escapeHtml(state.resultado?.profissional_nome || '')}" placeholder="Ex: Wessilon Marques de Sousa">
                    </div>
                    <div class="fdt-field">
                        <label>CRP</label>
                        <input type="text" id="prof-crp" value="${escapeHtml(state.resultado?.profissional_crp || '')}" placeholder="Ex: 04/53832">
                    </div>
                </div>
            </div>

            <!-- Seção 2: Paciente -->
            <div class="fdt-form-card">
                <div class="fdt-form-card-head">
                    <span class="fdt-form-num">2</span>
                    <div>
                        <div class="fdt-form-card-title">Dados do Paciente</div>
                        <div class="fdt-form-card-desc">Identificação e datas</div>
                    </div>
                </div>
                <div class="fdt-form-grid-3">
                    <div class="fdt-field">
                        <label>Nome do Paciente</label>
                        <input type="text" value="${escapeHtml(state.paciente.nome_completo)}" disabled>
                    </div>
                    <div class="fdt-field">
                        <label>Data de Nascimento</label>
                        <input type="text" value="${formatarData(state.paciente.data_nascimento)}" disabled>
                    </div>
                    <div class="fdt-field">
                        <label>Data de Aplicação</label>
                        <input type="date" id="data-aplicacao" value="${dataApl}">
                    </div>
                </div>
                <div id="hint-idade" class="fdt-hint-idade">
                    ${idadeAnos != null
                        ? `Idade na aplicação: <strong>${idadeAnos} anos e ${idadeMeses ?? 0} meses</strong>${faixaHint(idadeAnos)}`
                        : 'Preencha a data de aplicação para ver a faixa normativa.'}
                </div>
            </div>

            <!-- Seção 3: Tempos e Erros (tabela L/C/E/A com CI/FC ao vivo) -->
            <div class="fdt-form-card">
                <div class="fdt-form-card-head">
                    <span class="fdt-form-num">3</span>
                    <div>
                        <div class="fdt-form-card-title">Tempos e Erros das Partes</div>
                        <div class="fdt-form-card-desc">Tempo em segundos e número de erros para cada parte. Controle Inibitório e Flexibilidade Cognitiva são calculados automaticamente.</div>
                    </div>
                </div>
                <div class="fdt-tab-edicao">
                    <table>
                        <thead>
                            <tr>
                                <th>Parte</th>
                                <th class="ctr">Tempo (seg)</th>
                                <th class="ctr">Erros</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${renderLinhaParte('L', 'Leitura',     true)}
                            ${renderLinhaParte('C', 'Contagem',    true)}
                            ${renderLinhaParte('E', 'Escolha',     true)}
                            ${renderLinhaParte('A', 'Alternância', true)}
                            <tr class="fdt-tab-derivado">
                                <td><strong>Controle Inibitório</strong> <span class="muted">(E − L)</span></td>
                                <td class="ctr fdt-tab-derivado-val" id="ci-tempo">—</td>
                                <td class="ctr muted">n/a</td>
                            </tr>
                            <tr class="fdt-tab-derivado">
                                <td><strong>Flexibilidade Cognitiva</strong> <span class="muted">(A − L)</span></td>
                                <td class="ctr fdt-tab-derivado-val" id="fc-tempo">—</td>
                                <td class="ctr muted">n/a</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Seção 4: Observações -->
            <div class="fdt-form-card">
                <div class="fdt-form-card-head">
                    <span class="fdt-form-num">4</span>
                    <div>
                        <div class="fdt-form-card-title">Observações Comportamentais</div>
                        <div class="fdt-form-card-desc">Opcional — clique nos chips ou digite</div>
                    </div>
                </div>
                <div class="fdt-chips">
                    ${CHIPS_OBSERVACOES.map(c => `
                        <button type="button" class="fdt-chip" data-texto="${escapeHtml(c.texto)}">${escapeHtml(c.label)}</button>
                    `).join('')}
                </div>
                <div class="fdt-field">
                    <label>Texto livre</label>
                    <textarea id="obs-texto" rows="3" placeholder="Observações adicionais sobre comportamento, atenção, ansiedade, etc.">${escapeHtml(state.brutos.observacoes || '')}</textarea>
                </div>
            </div>
        `;

        bindCamposForm();
        bindBotoes();
        bindChips();
        atualizarDerivados();
    }

    function renderLinhaParte(codigo, nome, comErros) {
        const t = state.brutos[`t_${codigo.toLowerCase()}`] ?? '';
        const e = state.brutos[`e_${codigo.toLowerCase()}`] ?? '';
        return `
            <tr>
                <td><strong>${nome}</strong> <span class="muted">(${codigo})</span></td>
                <td class="ctr">
                    <input type="number" min="0" max="600" id="t-${codigo}" data-tempo="${codigo}"
                           value="${t}" placeholder="seg" class="fdt-input-num">
                </td>
                <td class="ctr">
                    ${comErros
                        ? `<input type="number" min="0" id="e-${codigo}" value="${e}" placeholder="0" class="fdt-input-num">`
                        : '<span class="muted">—</span>'
                    }
                </td>
            </tr>
        `;
    }

    function bindCamposForm() {
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
            if (idade < 6 || idade > 75) {
                hint.innerHTML = `<span style="color:#dc2626">⚠ Idade ${idade} anos fora da faixa normativa do FDT (6-75 anos).</span>`;
                hint.classList.add('warn');
                return;
            }
            hint.classList.remove('warn');
            hint.innerHTML = `Idade na aplicação: <strong>${idade} anos e ${meses} meses</strong>${faixaHint(idade)}`;
        });

        // Atualiza CI e FC ao vivo
        ['L','C','E','A'].forEach(cod => {
            document.getElementById(`t-${cod}`)?.addEventListener('input', atualizarDerivados);
        });
    }

    function atualizarDerivados() {
        const tL = parseInt(document.getElementById('t-L')?.value, 10);
        const tE = parseInt(document.getElementById('t-E')?.value, 10);
        const tA = parseInt(document.getElementById('t-A')?.value, 10);

        const ci = (Number.isFinite(tL) && Number.isFinite(tE)) ? tE - tL : null;
        const fc = (Number.isFinite(tL) && Number.isFinite(tA)) ? tA - tL : null;

        const ciEl = document.getElementById('ci-tempo');
        const fcEl = document.getElementById('fc-tempo');
        if (ciEl) ciEl.textContent = ci != null ? `${ci} seg` : '—';
        if (fcEl) fcEl.textContent = fc != null ? `${fc} seg` : '—';
    }

    function bindBotoes() {
        document.getElementById('btn-salvar-parcial')?.addEventListener('click', () => salvar(false));
        document.getElementById('btn-calcular')?.addEventListener('click', () => salvar(true));
    }

    function bindChips() {
        document.querySelectorAll('.fdt-chip').forEach(btn => {
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
            const profNome = document.getElementById('prof-nome')?.value.trim() || null;
            const profCrp = document.getElementById('prof-crp')?.value.trim() || null;
            const dataApl = document.getElementById('data-aplicacao')?.value;
            if (!dataApl) { window.CortexUI.toast('Preencha a data de aplicação.', 'danger'); return; }

            const idade = calcularIdadeAnos(state.paciente.data_nascimento, dataApl);
            if (idade == null || idade < 6 || idade > 75) {
                window.CortexUI.toast(`Idade ${idade ?? '?'} fora da faixa normativa (6-75 anos).`, 'danger');
                return;
            }

            const brutos = {};
            const obrigatorios = ['L', 'C', 'E', 'A'];

            for (const cod of obrigatorios) {
                const v = document.getElementById(`t-${cod}`)?.value;
                if (eCalcular && (v === '' || v == null)) {
                    window.CortexUI.toast(`Preencha o tempo de ${cod} antes de calcular.`, 'danger');
                    return;
                }
                if (v !== '' && v != null) {
                    const n = parseInt(v, 10);
                    if (isNaN(n) || n < 0 || n > 600) {
                        window.CortexUI.toast(`Tempo ${cod} = ${v} inválido. Use 0-600.`, 'danger');
                        return;
                    }
                    brutos[`t_${cod.toLowerCase()}`] = n;
                }

                // Erros (Leitura é opcional na norma, mas registramos)
                const ev = document.getElementById(`e-${cod}`)?.value;
                if (eCalcular && cod !== 'L' && (ev === '' || ev == null)) {
                    window.CortexUI.toast(`Preencha os erros de ${cod} antes de calcular.`, 'danger');
                    return;
                }
                if (ev !== '' && ev != null) {
                    const n = parseInt(ev, 10);
                    if (isNaN(n) || n < 0) {
                        window.CortexUI.toast(`Erros ${cod} = ${ev} inválido.`, 'danger');
                        return;
                    }
                    brutos[`e_${cod.toLowerCase()}`] = n;
                }
            }

            brutos.observacoes = document.getElementById('obs-texto')?.value.trim() || null;

            const sb = window.cortexClient;

            const { error: errAp } = await sb
                .from('aplicacoes_instrumento')
                .update({ data_aplicacao: dataApl })
                .eq('id', state.aplicacaoId);
            if (errAp) throw errAp;

            const { error: errBr } = await sb
                .from('fdt_brutos')
                .upsert({ aplicacao_id: state.aplicacaoId, ...brutos }, { onConflict: 'aplicacao_id' });
            if (errBr) throw errBr;

            if (!eCalcular) {
                window.CortexUI.toast('Salvo.', 'success');
                return;
            }

            window.CortexUI.toast('Calculando…', 'info');
            const r = await sb.functions.invoke('fdt-calcular', {
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

            // Atualiza dados do profissional
            const { error: errResUp } = await sb
                .from('fdt_resultados')
                .update({
                    profissional_nome: profNome,
                    profissional_crp:  profCrp,
                })
                .eq('aplicacao_id', state.aplicacaoId);
            if (errResUp) console.warn('Erro ao atualizar prof:', errResUp);

            await carregarTudo();
            decidirModoERenderizar();
            window.CortexUI.toast('Laudo gerado.', 'success');

        } catch (err) {
            console.error('[fdt salvar]', err);
            window.CortexUI.toast(`Erro: ${err.message || err}`, 'danger');
        }
    }

    // ────────────────────────────────────────────────────────────────────────
    // MODO LAUDO
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
            ${renderSecaoTabelaResultados()}
            ${renderSecaoPerfilBarras()}
            ${renderSecaoGauges()}
            ${renderSecaoInterpretacao()}
            ${renderRodapeLaudo()}
        `;
    }

    function renderHeaderLaudo() {
        const r = state.resultado;
        const idadeStr = `${r.idade_anos}a${r.idade_meses ? ' ' + r.idade_meses + 'm' : ''}`;
        return `
            <div class="laudo-header">
                <div class="laudo-header-esq">
                    <div class="laudo-header-logo">E</div>
                    <div class="laudo-header-textos">
                        <div class="laudo-header-supratitulo">Relatório Neuropsicológico</div>
                        <h1 class="laudo-header-titulo">FDT</h1>
                        <div class="laudo-header-subtitulo">
                            ${escapeHtml(NOME_INSTRUMENTO)}<br>
                            Five Digit Test · Atenção, Controle Inibitório e Flexibilidade Cognitiva
                        </div>
                    </div>
                </div>
                <div class="laudo-header-pontuacao">
                    <div class="laudo-header-pontuacao-label">Faixa Normativa</div>
                    <div class="laudo-header-pontuacao-valor">${escapeHtml(r.faixa_norma)}</div>
                    <div class="laudo-header-pontuacao-max" style="font-size:11px;">Idade: ${idadeStr}</div>
                </div>
            </div>
        `;
    }

    function renderSecaoIdentificacao() {
        const p = state.paciente;
        const r = state.resultado;
        return `
            <div class="fdt-secao">
                <div class="fdt-secao-head">
                    <span class="fdt-secao-num">1</span>
                    <div class="fdt-secao-titulo">Identificação</div>
                </div>
                <div class="fdt-identif-bloco">
                    <table class="fdt-tab-identif">
                        <tr><td class="lbl">Paciente</td><td class="val"><strong>${escapeHtml(p.nome_completo)}</strong></td></tr>
                        <tr><td class="lbl">Data de Nascimento</td><td class="val">${formatarData(p.data_nascimento)}</td></tr>
                        <tr><td class="lbl">Idade na Aplicação</td><td class="val">${r.idade_anos} anos e ${r.idade_meses} meses</td></tr>
                        <tr><td class="lbl">Data de Aplicação</td><td class="val">${formatarData(state.aplicacao.data_aplicacao)}</td></tr>
                        <tr><td class="lbl">Faixa Normativa</td><td class="val"><strong>${escapeHtml(r.faixa_norma)} anos</strong></td></tr>
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

    // Tabela de resultados (tempo + erros) — Seção 2
    function renderSecaoTabelaResultados() {
        const medidas = state.resultado.medidas || [];
        const m = {};
        for (const med of medidas) m[med.key] = med;

        const partes = ['L','C','E','A','CI','FC'];
        const nomes  = { L:'Leitura', C:'Contagem', E:'Escolha', A:'Alternância', CI:'Controle Inibitório (E−L)', FC:'Flexibilidade Cognitiva (A−L)' };

        let linhas = '';
        for (const cod of partes) {
            const tempo = m[cod];
            if (!tempo) continue;
            const erroKey = `e${cod}`;
            const erro = m[erroKey] || null;
            const isDerivado = (cod === 'CI' || cod === 'FC');

            linhas += `
                <tr ${isDerivado ? 'class="fdt-row-derivado"' : ''}>
                    <td class="medida">${escapeHtml(nomes[cod])}</td>
                    <td class="ctr">${tempo.raw}${isDerivado ? '' : 's'}</td>
                    <td class="ctr">${escapeHtml(tempo.pctLabel || '—')}</td>
                    <td class="ctr">${badgeCls(tempo.classificacao)}</td>
                    <td class="ctr">${erro ? erro.raw : (cod === 'L' ? '—' : '—')}</td>
                    <td class="ctr">${erro ? escapeHtml(erro.pctLabel || '—') : '—'}</td>
                    <td class="ctr">${erro ? badgeCls(erro.classificacao) : '<span class="muted">n/a</span>'}</td>
                </tr>
            `;
        }

        return `
            <div class="fdt-secao">
                <div class="fdt-secao-head">
                    <span class="fdt-secao-num">2</span>
                    <div class="fdt-secao-titulo">Resultados por Parte</div>
                    <div class="fdt-secao-desc">Tempos em segundos e erros, com percentis normativos e classificações por faixa etária (${escapeHtml(state.resultado.faixa_norma)} anos)</div>
                </div>
                <div class="fdt-tab-resultados">
                    <table>
                        <thead>
                            <tr>
                                <th rowspan="2" class="medida-th">Parte</th>
                                <th colspan="3" class="ctr">Tempo (segundos)</th>
                                <th colspan="3" class="ctr">Erros</th>
                            </tr>
                            <tr>
                                <th class="ctr small">Tempo</th>
                                <th class="ctr small">Percentil</th>
                                <th class="ctr small">Classificação</th>
                                <th class="ctr small">Erros</th>
                                <th class="ctr small">Percentil</th>
                                <th class="ctr small">Classificação</th>
                            </tr>
                        </thead>
                        <tbody>${linhas}</tbody>
                    </table>
                    <p class="fdt-tab-foot">
                        Percentis por pontos de corte (Sedó, 2007). CI = Escolha − Leitura · FC = Alternância − Leitura.
                        Classificação: ≥ 95 / &gt; 75 = Superior · &gt; 50 / &gt; 25 = Média · &gt; 5 = Média Inferior · &lt; 5 = Dificuldade Acentuada.
                    </p>
                </div>
            </div>
        `;
    }

    // Perfil Percentílico em barras — Seção 3
    function renderSecaoPerfilBarras() {
        const gauges = state.resultado.gauges || [];
        const partes = gauges.map(g => ({
            label: g.label,
            paciente: g.paciente,
            pctLabel: medidaPctLabel(g.key),
            pctNum:   medidaPctNum(g.key),
            classificacao: medidaCls(g.key),
        }));

        const linhas = partes.map(p => {
            const cor = p.classificacao?.cor || '#94a3b8';
            const widthPct = Math.max(2, Math.min(100, p.pctNum || 1));
            return `
                <div class="fdt-perfil-row">
                    <div class="fdt-perfil-label">${escapeHtml(p.label)}</div>
                    <div class="fdt-perfil-track">
                        <div class="fdt-perfil-fill" style="width: ${widthPct}%; background: ${cor};"></div>
                    </div>
                    <div class="fdt-perfil-pct">${escapeHtml(p.pctLabel)}</div>
                    <div class="fdt-perfil-cls">${badgeCls(p.classificacao)}</div>
                </div>
            `;
        }).join('');

        return `
            <div class="fdt-secao">
                <div class="fdt-secao-head">
                    <span class="fdt-secao-num">3</span>
                    <div class="fdt-secao-titulo">Perfil Percentílico dos Tempos</div>
                    <div class="fdt-secao-desc">Barras indicam o percentil normativo obtido. Faixa azul = desempenho médio (P25–P75).</div>
                </div>
                <div class="fdt-perfil-bloco">
                    <div class="fdt-perfil-eixo">Eixo = percentil estimado (1–99) · Faixa azul = faixa média (P25–P75) · Baseado nos tempos</div>
                    ${linhas}
                </div>
            </div>
        `;
    }

    function medidaPctLabel(key) {
        const m = (state.resultado.medidas || []).find(x => x.key === key);
        return m?.pctLabel || '—';
    }
    function medidaPctNum(key) {
        const m = (state.resultado.medidas || []).find(x => x.key === key);
        return m?.pctNum;
    }
    function medidaCls(key) {
        const m = (state.resultado.medidas || []).find(x => x.key === key);
        return m?.classificacao;
    }

    // Comparação com a Norma (gauge horizontal) — Seção 4
    function renderSecaoGauges() {
        const gauges = state.resultado.gauges || [];

        // Escala global: pega o maior p5 entre todas as partes pra escalar o eixo
        const maxX = Math.max(75, ...gauges.map(g => Math.ceil((g.p5 || 60) * 1.1 / 5) * 5));

        const linhas = gauges.map(g => {
            const cls = medidaCls(g.key);
            const cor = cls?.cor || '#94a3b8';
            const xP25 = (g.p25 / maxX) * 100;
            const xP75 = (g.p75 / maxX) * 100;
            const widthFaixa = Math.max(0.5, xP75 - xP25);
            const xP50 = (g.p50 / maxX) * 100;
            const xP95 = (g.p95 / maxX) * 100;
            const xP5  = (g.p5  / maxX) * 100;
            const xPac = Math.min(100, Math.max(0, (g.paciente / maxX) * 100));

            return `
                <div class="fdt-gauge-row">
                    <div class="fdt-gauge-label">${escapeHtml(g.label)}</div>
                    <div class="fdt-gauge-track">
                        <div class="fdt-gauge-faixa-media" style="left: ${xP25}%; width: ${widthFaixa}%;"></div>
                        <div class="fdt-gauge-tick fdt-gauge-tick-p95" style="left: ${xP95}%;"></div>
                        <div class="fdt-gauge-tick fdt-gauge-tick-p5"  style="left: ${xP5}%;"></div>
                        <div class="fdt-gauge-tick fdt-gauge-tick-p50" style="left: ${xP50}%;"></div>
                        <div class="fdt-gauge-paciente" style="left: ${xPac}%; background: ${cor};">
                            ${g.paciente}
                        </div>
                    </div>
                    <div class="fdt-gauge-cls">${badgeCls(cls)}</div>
                </div>
            `;
        }).join('');

        // Eixo X com marcações
        const ticks = [0, 15, 30, 45, 60, 75].filter(t => t <= maxX);
        const eixo = ticks.map(t => `<span style="left: ${(t/maxX)*100}%;">${t}</span>`).join('');

        return `
            <div class="fdt-secao">
                <div class="fdt-secao-head">
                    <span class="fdt-secao-num">4</span>
                    <div class="fdt-secao-titulo">Comparação com a Norma (${escapeHtml(state.resultado.faixa_norma)} anos)</div>
                    <div class="fdt-secao-desc">Círculo = tempo do paciente · Faixa azul = P25–P75 normativo · Linhas = P5/P50/P95</div>
                </div>
                <div class="fdt-gauge-bloco">
                    <div class="fdt-gauge-eixo-x">
                        <div class="fdt-gauge-eixo-x-track">${eixo}</div>
                    </div>
                    ${linhas}
                </div>
            </div>
        `;
    }

    function renderSecaoInterpretacao() {
        const r = state.resultado;
        const interpretacao = (r.interpretacao || '').trim();
        const paragrafos = interpretacao
            ? interpretacao.split(/\n\n+/).map(p => `<p>${escapeHtml(p)}</p>`).join('')
            : '<p>Interpretação não disponível.</p>';

        return `
            <div class="fdt-secao">
                <div class="fdt-secao-head">
                    <span class="fdt-secao-num">5</span>
                    <div class="fdt-secao-titulo">Interpretação Clínica</div>
                </div>
                <div class="fdt-interp-bloco">${paragrafos}</div>
            </div>
        `;
    }

    function renderRodapeLaudo() {
        const r = state.resultado;
        return `
            <div class="fdt-rodape">
                <div class="fdt-rodape-prof">
                    ${r.profissional_nome ? `<div class="prof-nome">${escapeHtml(r.profissional_nome)}</div>` : ''}
                    ${r.profissional_crp ? `<div class="prof-crp">${escapeHtml(r.profissional_crp)}</div>` : ''}
                    <div class="prof-assinatura">Assinatura do Profissional</div>
                </div>
                <div class="fdt-rodape-data">
                    <div>${formatarData(state.aplicacao.data_aplicacao)}</div>
                    <div class="conf">Este documento é confidencial e destinado exclusivamente ao profissional responsável e ao paciente. A reprodução ou divulgação sem autorização é proibida.</div>
                </div>
            </div>
        `;
    }

    function badgeCls(cls) {
        if (!cls || !cls.label || cls.label === '—') return '<span class="muted">—</span>';
        return `<span class="fdt-badge-cls" style="background:${cls.cor}15;color:${cls.cor};border:1px solid ${cls.cor}30;">${escapeHtml(cls.label)}</span>`;
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
            const nomeArquivo = `FDT - ${nomeAbreviado}_${dataStr}.pdf`;
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
            [6, 8, '6-8'], [9, 10, '9-10'], [11, 12, '11-12'],
            [13, 15, '13-15'], [16, 18, '16-18'], [19, 34, '19-34'],
            [35, 59, '35-59'], [60, 75, '60-75']
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

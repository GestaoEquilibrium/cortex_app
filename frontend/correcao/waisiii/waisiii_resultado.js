// ============================================================================
// CORTEX_APP — WAIS-III Resultado (modo edição + modo laudo)
// ============================================================================
// URL: /correcao/wais/wais_resultado.html?aplicacao_id=<uuid>
//
// FLUXO:
//   1. Carrega aplicacao_instrumento + paciente + brutos + (opcional) wais_resultados
//   2. Decide modo:
//      - Sem wais_resultados → MODO EDIÇÃO (form pra digitar 14 brutos)
//      - Com wais_resultados → MODO LAUDO (read-only, mas tem botão "Editar brutos")
//   3. MODO EDIÇÃO:
//      [💾 Salvar parcial]  — só persiste brutos + textos (status fica 'aguardando')
//      [📊 Calcular]         — chama Edge Function wais-calcular → status='corrigido' → modo laudo
//   4. MODO LAUDO:
//      [✏️ Editar brutos]    — volta pra modo edição (preserva wais_resultados, mas dá pra recalcular)
//      [📄 Gerar PDF]        — html2canvas + jsPDF
//
// PADRÃO VISUAL: usa raadsr_resultado.css (base D3) + wais_resultado.css (overrides)
// ============================================================================

(function () {
    'use strict';

    const SUBTESTES = [
        { codigo: 'CF',  nome: 'Completar Figuras',                grupo: 'Execução',  ordem: 1  },
        { codigo: 'VC',  nome: 'Vocabulário',                      grupo: 'Verbal',    ordem: 2  },
        { codigo: 'CD',  nome: 'Códigos',                          grupo: 'Execução',  ordem: 3  },
        { codigo: 'SM',  nome: 'Semelhanças',                      grupo: 'Verbal',    ordem: 4  },
        { codigo: 'CB',  nome: 'Cubos',                            grupo: 'Execução',  ordem: 5  },
        { codigo: 'AR',  nome: 'Aritmética',                       grupo: 'Verbal',    ordem: 6  },
        { codigo: 'RM',  nome: 'Raciocínio Matricial',             grupo: 'Execução',  ordem: 7  },
        { codigo: 'DG',  nome: 'Dígitos',                          grupo: 'Verbal',    ordem: 8  },
        { codigo: 'IN',  nome: 'Informação',                       grupo: 'Verbal',    ordem: 9  },
        { codigo: 'AF',  nome: 'Arranjo de Figuras',               grupo: 'Execução',  ordem: 10 },
        { codigo: 'CO',  nome: 'Compreensão',                      grupo: 'Verbal',    ordem: 11 },
        { codigo: 'PS',  nome: 'Procurar Símbolos',                grupo: 'Execução',  ordem: 12 },
        { codigo: 'SNL', nome: 'Sequência de Números e Letras',    grupo: 'Verbal',    ordem: 13 },
        { codigo: 'AO',  nome: 'Armar Objetos',                    grupo: 'Execução',  ordem: 14 },
    ];

    const ESCALAS_LABEL = {
        ICV:         'Índice de Compreensão Verbal',
        IOP:         'Índice de Organização Perceptual',
        IMO:         'Índice de Memória Operacional',
        IVP:         'Índice de Velocidade de Processamento',
        QI_VERBAL:   'QI Verbal',
        QI_EXECUCAO: 'QI de Execução',
        QI_TOTAL:    'QI Total',
    };

    const ESCALAS_SIGLA = {
        ICV: 'ICV', IOP: 'IOP', IMO: 'IMO', IVP: 'IVP',
        QI_VERBAL: 'QIV', QI_EXECUCAO: 'QIE', QI_TOTAL: 'QIT',
    };

    const ORDEM_ESCALAS = ['ICV', 'IOP', 'IMO', 'IVP', 'QI_VERBAL', 'QI_EXECUCAO', 'QI_TOTAL'];

    const CHIPS_OBSERVACOES = [
        { label: 'Colaborativo',           texto: 'Colaborativo(a) e engajado(a) durante toda a sessão' },
        { label: 'Fadiga',                 texto: 'Sinais de fadiga a partir do 5º subteste' },
        { label: 'Impulsividade',          texto: 'Impulsividade nas respostas verbais' },
        { label: 'Ansiedade',              texto: 'Ansiedade durante a aplicação' },
        { label: 'Repetição instruções',   texto: 'Necessitou de repetição frequente de instruções' },
        { label: 'Boa compreensão',        texto: 'Boa compreensão das instruções' },
        { label: 'Desatenção',             texto: 'Desatenção intermitente' },
        { label: 'Estratégias',            texto: 'Estratégias organizadas de resolução' },
        { label: 'Contato visual ok',      texto: 'Manteve contato visual adequado' },
    ];

    const state = {
        aplicacaoId: null,
        aplicacao: null,
        paciente: null,
        instrumento: null,
        brutos: {},      // { CF: 18, VC: 38, ... }
        resultado: null, // wais_resultados (null se ainda não calculou)
        modo: 'edicao',  // 'edicao' | 'laudo'
        chartInstance: null,
        salvando: false,
    };

    window.addEventListener('cortex:auth-ready', async () => {
        await CortexSidebar.render('pacientes');

        const params = new URLSearchParams(window.location.search);
        state.aplicacaoId = params.get('aplicacao_id');

        if (!state.aplicacaoId) {
            mostrarErro('aplicacao_id não fornecido na URL');
            return;
        }

        try {
            await carregarTudo();
            decidirModo();
            renderizar();
        } catch (err) {
            console.error('[wais] erro ao carregar:', err);
            mostrarErro('Erro: ' + (err.message || 'desconhecido'));
        }
    });

    // ============================================================================
    // CARREGAMENTO
    // ============================================================================

    async function carregarTudo() {
        // 1. Aplicação (incluindo paciente_id, instrumento_id, status, data_aplicacao)
        const { data: aplicacao, error: errA } = await window.cortexClient
            .from('aplicacoes_instrumento')
            .select('*')
            .eq('id', state.aplicacaoId)
            .single();
        if (errA) throw new Error('Aplicação não encontrada: ' + errA.message);
        state.aplicacao = aplicacao;

        // 2. Instrumento (sanity check — confirma que é WAIS-III)
        const { data: instrumento, error: errI } = await window.cortexClient
            .from('instrumentos_catalogo')
            .select('id, sigla, nome_completo, tipo_aplicacao')
            .eq('id', aplicacao.instrumento_id)
            .single();
        if (errI) throw new Error('Instrumento: ' + errI.message);
        if (instrumento.sigla !== 'WAIS-III') {
            throw new Error(`Esta página é só pra WAIS-III. Aplicação aponta pra ${instrumento.sigla}.`);
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

        // 4. Brutos (até 14 linhas)
        const { data: brutosRows, error: errB } = await window.cortexClient
            .from('wais_brutos')
            .select('codigo, valor_bruto')
            .eq('aplicacao_id', state.aplicacaoId);
        if (errB) throw new Error('Brutos: ' + errB.message);
        state.brutos = {};
        for (const r of brutosRows || []) {
            if (r.valor_bruto != null) state.brutos[r.codigo] = r.valor_bruto;
        }

        // 5. Resultado (1 linha, ou null)
        const { data: resultado } = await window.cortexClient
            .from('wais_resultados')
            .select('*')
            .eq('aplicacao_id', state.aplicacaoId)
            .maybeSingle();
        state.resultado = resultado || null;

        await CortexAudit.log('leitura', 'wais_resultados', state.aplicacaoId, {
            detalhes: { sigla: 'WAIS-III', tem_resultado: !!resultado }
        });
    }

    function decidirModo() {
        // Modo padrão: laudo se já calculou, senão edição
        const params = new URLSearchParams(window.location.search);
        if (params.get('modo') === 'edicao') {
            state.modo = 'edicao';  // forçado via URL (botão "Editar brutos")
        } else {
            state.modo = state.resultado ? 'laudo' : 'edicao';
        }
    }

    // ============================================================================
    // RENDER PRINCIPAL
    // ============================================================================

    function renderizar() {
        document.getElementById('back-link').href =
            `../../bateria/bateria.html?paciente=${state.paciente.id}`;

        if (state.modo === 'edicao') {
            renderModoEdicao();
        } else {
            renderModoLaudo();
        }
    }

    // ============================================================================
    // MODO EDIÇÃO
    // ============================================================================

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

        // Bind campos
        bindCamposForm();

        // Bind chips de observações
        document.querySelectorAll('.wais-chip').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const texto = btn.dataset.texto;
                const ta = document.getElementById('obs-comportamentais');
                ta.value = (ta.value ? ta.value + '. ' : '') + texto;
                ta.focus();
            });
        });
    }

    function renderFormulario() {
        const idade = calcularIdadeAnos(state.paciente.data_nascimento, state.aplicacao.data_aplicacao);
        const idadeTxt = idade != null ? `${idade} anos` : '—';
        const dataAplStr = state.aplicacao.data_aplicacao || '';
        const dataNascStr = state.paciente.data_nascimento || '';

        // Profissional: pega defaults do user logado se disponível, senão vazio
        const profNome = '';
        const profCRP = '';

        const statusLabel = state.aplicacao.status === 'corrigido' ? '✓ Corrigido' : '⏳ Aguardando cálculo';
        const statusColor = state.aplicacao.status === 'corrigido' ? '#166534' : '#854d0e';
        const statusBg    = state.aplicacao.status === 'corrigido' ? '#dcfce7' : '#fef3c7';

        return `
        <div class="wais-aplicar-page">

            <div class="wais-aplicar-header">
                <div>
                    <div class="wais-aplicar-supratitulo">Aplicação Neuropsicológica · WAIS-III</div>
                    <h1 class="wais-aplicar-titulo">${escapeHtml(state.paciente.nome_completo)}</h1>
                    <div class="wais-aplicar-subtitulo">
                        Escala de Inteligência Wechsler para Adultos — 3ª Edição
                    </div>
                </div>
                <div class="wais-aplicar-status" style="background:${statusBg}; color:${statusColor};">
                    ${statusLabel}
                </div>
            </div>

            <!-- 1. PROFISSIONAL -->
            <div class="wais-form-card">
                <div class="wais-form-card-header">
                    <span class="wais-form-card-num">1</span>
                    <div>
                        <div class="wais-form-card-title">Dados do Profissional</div>
                        <div class="wais-form-card-desc">Aplicador responsável pela avaliação</div>
                    </div>
                </div>
                <div class="wais-form-grid">
                    <div class="wais-field">
                        <label for="prof-nome">Nome do profissional</label>
                        <input type="text" id="prof-nome" value="${escapeHtml(state.resultado?.profissional_nome || profNome)}" placeholder="Nome completo">
                    </div>
                    <div class="wais-field">
                        <label for="prof-crp">CRP</label>
                        <input type="text" id="prof-crp" value="${escapeHtml(state.resultado?.profissional_crp || profCRP)}" placeholder="04/12345">
                    </div>
                    <div class="wais-field">
                        <label for="prof-esp">Especialidade</label>
                        <input type="text" id="prof-esp" value="${escapeHtml(state.resultado?.profissional_especialidade || '')}" placeholder="Ex: Neuropsicóloga">
                    </div>
                    <div class="wais-field">
                        <label for="prof-contato">Contato</label>
                        <input type="text" id="prof-contato" value="${escapeHtml(state.resultado?.profissional_contato || '')}" placeholder="E-mail ou telefone">
                    </div>
                </div>
            </div>

            <!-- 2. EXAMINANDO -->
            <div class="wais-form-card">
                <div class="wais-form-card-header">
                    <span class="wais-form-card-num">2</span>
                    <div>
                        <div class="wais-form-card-title">Dados do Examinando</div>
                        <div class="wais-form-card-desc">Informações do paciente avaliado</div>
                    </div>
                </div>
                <div class="wais-form-grid">
                    <div class="wais-field">
                        <label>Nome</label>
                        <input type="text" value="${escapeHtml(state.paciente.nome_completo)}" readonly>
                    </div>
                    <div class="wais-field">
                        <label>Sexo</label>
                        <input type="text" value="${escapeHtml(state.paciente.sexo || '—')}" readonly>
                    </div>
                    <div class="wais-field">
                        <label for="data-nasc-readonly">Data de Nascimento</label>
                        <input type="date" id="data-nasc-readonly" value="${dataNascStr}" readonly>
                    </div>
                    <div class="wais-field">
                        <label for="data-aplicacao">Data de Aplicação <span style="color:#dc2626">*</span></label>
                        <input type="date" id="data-aplicacao" value="${dataAplStr}" required>
                        <span class="wais-field-hint" id="hint-idade">Idade na aplicação: ${idadeTxt}</span>
                    </div>
                </div>
                <div class="wais-field" style="margin-top:14px;">
                    <label for="motivo">Motivo do encaminhamento</label>
                    <textarea id="motivo" rows="2" placeholder="Ex: Avaliação cognitiva para investigação de queixas de memória">${escapeHtml(state.resultado?.motivo_encaminhamento || '')}</textarea>
                </div>
            </div>

            <!-- 3. BRUTOS -->
            <div class="wais-form-card">
                <div class="wais-form-card-header">
                    <span class="wais-form-card-num">3</span>
                    <div>
                        <div class="wais-form-card-title">Pontos Brutos dos Subtestes</div>
                        <div class="wais-form-card-desc">Insira os valores obtidos nos 14 subtestes</div>
                    </div>
                </div>
                <div class="wais-tab-brutos">
                    <table>
                        <thead>
                            <tr>
                                <th>Subteste</th>
                                <th class="col-pb">Ponto Bruto</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${SUBTESTES.map(s => `
                                <tr>
                                    <td>
                                        <span class="wais-subnome">${escapeHtml(s.nome)}</span>
                                        <span class="wais-subcodigo">(${s.codigo})</span>
                                    </td>
                                    <td class="col-pb">
                                        <input type="number"
                                               id="bruto-${s.codigo}"
                                               data-codigo="${s.codigo}"
                                               value="${state.brutos[s.codigo] ?? ''}"
                                               min="0"
                                               placeholder="—">
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- 4. OBSERVAÇÕES COMPORTAMENTAIS -->
            <div class="wais-form-card">
                <div class="wais-form-card-header">
                    <span class="wais-form-card-num">4</span>
                    <div>
                        <div class="wais-form-card-title">Observações Comportamentais</div>
                        <div class="wais-form-card-desc">Registros qualitativos durante a aplicação</div>
                    </div>
                </div>
                <div class="wais-chips">
                    ${CHIPS_OBSERVACOES.map(c => `
                        <button type="button" class="wais-chip" data-texto="${escapeHtml(c.texto)}">${escapeHtml(c.label)}</button>
                    `).join('')}
                </div>
                <div class="wais-field">
                    <label for="obs-comportamentais">Observações</label>
                    <textarea id="obs-comportamentais" rows="4" placeholder="Descreva o comportamento do examinando durante a aplicação...">${escapeHtml(state.resultado?.observacoes_comportamentais || '')}</textarea>
                </div>
            </div>

            <!-- 5. RECOMENDAÇÕES -->
            <div class="wais-form-card">
                <div class="wais-form-card-header">
                    <span class="wais-form-card-num">5</span>
                    <div>
                        <div class="wais-form-card-title">Conclusão e Recomendações</div>
                        <div class="wais-form-card-desc">Sugestões terapêuticas, educacionais e encaminhamentos</div>
                    </div>
                </div>
                <div class="wais-field">
                    <label for="recomendacoes">Recomendações</label>
                    <textarea id="recomendacoes" rows="4" placeholder="Recomendações para o paciente, família ou equipe multidisciplinar...">${escapeHtml(state.resultado?.recomendacoes || '')}</textarea>
                </div>
            </div>

        </div>
        `;
    }

    function bindCamposForm() {
        // Recalcula idade quando muda data de aplicação
        const dataApl = document.getElementById('data-aplicacao');
        if (dataApl) {
            dataApl.addEventListener('change', () => {
                const idade = calcularIdadeAnos(state.paciente.data_nascimento, dataApl.value);
                const hint = document.getElementById('hint-idade');
                if (idade != null) {
                    if (idade < 16 || idade > 89) {
                        hint.innerHTML = `<span style="color:#dc2626">⚠ Idade ${idade} anos fora da faixa normativa do WAIS-III (16-89)</span>`;
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

    // Coleta valores do form em formato pronto pra persistir
    function coletarFormulario() {
        const dataApl = document.getElementById('data-aplicacao')?.value || null;

        const brutos = {};
        for (const s of SUBTESTES) {
            const inp = document.getElementById(`bruto-${s.codigo}`);
            const v = inp?.value;
            if (v !== '' && v != null && !isNaN(Number(v))) {
                brutos[s.codigo] = Number(v);
            }
        }

        return {
            data_aplicacao: dataApl,
            brutos,
            profissional_nome:           document.getElementById('prof-nome')?.value || '',
            profissional_crp:            document.getElementById('prof-crp')?.value || '',
            profissional_especialidade:  document.getElementById('prof-esp')?.value || '',
            profissional_contato:        document.getElementById('prof-contato')?.value || '',
            motivo_encaminhamento:       document.getElementById('motivo')?.value || '',
            observacoes_comportamentais: document.getElementById('obs-comportamentais')?.value || '',
            recomendacoes:               document.getElementById('recomendacoes')?.value || '',
        };
    }

    // ============================================================================
    // SALVAR (parcial ou com cálculo)
    // ============================================================================

    async function salvar(comCalculo) {
        if (state.salvando) return;
        const dados = coletarFormulario();

        // Validações pra cálculo
        if (comCalculo) {
            if (!dados.data_aplicacao) {
                window.CortexUI.toast('Data de aplicação é obrigatória pra calcular', 'danger');
                return;
            }
            if (Object.keys(dados.brutos).length === 0) {
                window.CortexUI.toast('Insira pelo menos 1 ponto bruto pra calcular', 'danger');
                return;
            }
            const idade = calcularIdadeAnos(state.paciente.data_nascimento, dados.data_aplicacao);
            if (idade == null || idade < 16 || idade > 89) {
                window.CortexUI.toast(`Idade ${idade ?? '?'} fora da faixa normativa (16-89 anos)`, 'danger');
                return;
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
            // 1. Atualiza data_aplicacao em aplicacoes_instrumento
            if (dados.data_aplicacao) {
                const { error: errAp } = await window.cortexClient
                    .from('aplicacoes_instrumento')
                    .update({ data_aplicacao: dados.data_aplicacao })
                    .eq('id', state.aplicacaoId);
                if (errAp) throw new Error('Erro ao salvar data de aplicação: ' + errAp.message);
            }

            // 2. UPSERT brutos (1 linha por subteste com valor preenchido)
            //    Apaga primeiro pra eliminar brutos que foram zerados no form
            const { error: errDel } = await window.cortexClient
                .from('wais_brutos')
                .delete()
                .eq('aplicacao_id', state.aplicacaoId);
            if (errDel) throw new Error('Erro ao limpar brutos: ' + errDel.message);

            const inserts = Object.entries(dados.brutos).map(([codigo, valor_bruto]) => ({
                aplicacao_id: state.aplicacaoId,
                codigo,
                valor_bruto,
            }));
            if (inserts.length > 0) {
                const { error: errIns } = await window.cortexClient
                    .from('wais_brutos')
                    .insert(inserts);
                if (errIns) throw new Error('Erro ao salvar brutos: ' + errIns.message);
            }

            // 3. UPSERT campos qualitativos em wais_resultados
            //    Se ainda não tem cálculo, cria linha placeholder com jsonbs vazios
            //    (pra poder gravar os textos qualitativos antes de calcular)
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

            // 4. Se for "calcular", chama Edge Function
            if (comCalculo) {
                // Antes de chamar, persiste os campos qualitativos:
                //   - Se já existe wais_resultados (recálculo) → UPDATE só os textos
                //   - Se não existe → a Edge Function vai fazer o INSERT inicial; os textos
                //     vão num UPDATE depois
                if (state.resultado) {
                    const { error: errUp } = await window.cortexClient
                        .from('wais_resultados')
                        .update(camposQuali)
                        .eq('aplicacao_id', state.aplicacaoId);
                    if (errUp) throw new Error('Erro ao salvar campos qualitativos: ' + errUp.message);
                }

                // Chama Edge Function
                const { data: invokeData, error: errInvoke } =
                    await window.cortexClient.functions.invoke('wais-calcular', {
                        body: { aplicacao_id: state.aplicacaoId },
                    });
                if (errInvoke) {
                    // Tenta extrair mensagem do response body
                    let msg = errInvoke.message || 'erro desconhecido';
                    // errInvoke.context é a Response da função: lê a mensagem real do erro
                    if (errInvoke.context && typeof errInvoke.context.text === 'function') {
                        try {
                            const j = JSON.parse(await errInvoke.context.text());
                            if (j.error) msg = j.error;
                        } catch (_) { /* ignora */ }
                    }
                    throw new Error('Edge Function: ' + msg);
                }
                if (invokeData?.ok === false) {
                    throw new Error('Edge Function: ' + (invokeData.error || 'falha desconhecida'));
                }

                // Após Edge Function, faz UPDATE dos textos qualitativos
                // (que ela não toca — só preenche os campos do cálculo)
                const { error: errUp2 } = await window.cortexClient
                    .from('wais_resultados')
                    .update(camposQuali)
                    .eq('aplicacao_id', state.aplicacaoId);
                if (errUp2) throw new Error('Erro ao salvar campos qualitativos: ' + errUp2.message);

                window.CortexUI.toast('✓ Cálculo concluído', 'success');

            } else {
                // Salvar parcial: só persiste textos, não chama Edge Function
                if (state.resultado) {
                    // Já tem cálculo: UPDATE dos textos
                    const { error: errUp } = await window.cortexClient
                        .from('wais_resultados')
                        .update(camposQuali)
                        .eq('aplicacao_id', state.aplicacaoId);
                    if (errUp) throw new Error('Erro ao salvar textos: ' + errUp.message);
                } else {
                    // Não tem cálculo ainda: salva textos via UPSERT
                    // (preenche jsonbs com null pra contornar NOT NULL)
                    const { error: errUp } = await window.cortexClient
                        .from('wais_resultados')
                        .upsert({
                            ...camposQuali,
                            ponderados: {},
                            somas: {},
                            compostos: {},
                        }, { onConflict: 'aplicacao_id' });
                    if (errUp) throw new Error('Erro ao salvar parcial: ' + errUp.message);
                }
                window.CortexUI.toast('💾 Parcial salvo', 'info');
            }

            await CortexAudit.log(comCalculo ? 'calculo' : 'salvamento', 'wais_resultados', state.aplicacaoId, {
                detalhes: {
                    sigla: 'WAIS-III',
                    qtd_brutos: inserts.length,
                    com_calculo: comCalculo,
                }
            });

            // Recarrega + redireciona pro modo laudo se calculou
            if (comCalculo) {
                // Limpa parâmetro modo=edicao da URL e recarrega
                const url = new URL(window.location.href);
                url.searchParams.delete('modo');
                window.location.href = url.toString();
            } else {
                // Apenas atualiza state e re-renderiza no mesmo modo
                await carregarTudo();
                renderizar();
            }

        } catch (err) {
            console.error('[wais salvar]', err);
            window.CortexUI.toast(err.message || 'Erro ao salvar', 'danger');
        } finally {
            state.salvando = false;
            if (btnParcial)  { btnParcial.disabled = false;  btnParcial.textContent = origParcial; }
            if (btnCalcular) { btnCalcular.disabled = false; btnCalcular.textContent = origCalcular; }
        }
    }


    // ============================================================================
    // MODO LAUDO — painel moderno (peças em shared/wechsler_painel.js)
    // ============================================================================

    // Helpers de classificação visual (cores)
    function clBadgeClass(cl) {
        const m = {
            "Muito Superior":     "cl-vs",
            "Superior":           "cl-s",
            "Médio Superior":     "cl-ms",
            "Médio":              "cl-m",
            "Médio Inferior":     "cl-mi",
            "Limítrofe":          "cl-l",
            "Extremamente Baixo": "cl-eb",
            "Inferior":           "cl-inf",
        };
        return m[cl] || "cl-m";
    }


    // Cor de barra (índices/QIs — pontuação composta)
    function icColor(comp) {
        if (comp >= 110) return '#059669';  // verde
        if (comp >= 90)  return '#1a56db';  // azul forte
        if (comp >= 80)  return '#f59e0b';  // amarelo
        return '#dc2626';                   // vermelho
    }


    // Verbo de abertura por classificação (usado na interpretação textual)
    function introVerbByClass(cls) {
        const m = {
            "Muito Superior":     "situa-se muito acima da média",
            "Superior":           "situa-se acima da média",
            "Médio Superior":     "situa-se acima da média",
            "Médio":              "situa-se na faixa média",
            "Médio Inferior":     "situa-se ligeiramente abaixo da média",
            "Limítrofe":          "situa-se na faixa limítrofe",
            "Extremamente Baixo": "situa-se muito abaixo da média",
            "Inferior":           "situa-se abaixo da média",
        };
        return m[cls] || "situa-se";
    }

    // Descrição da habilidade por escala (texto formal)
    function abilityDescription(key) {
        const m = {
            QI_TOTAL:    "funcionamento intelectual global",
            QI_VERBAL:   "conhecimento adquirido, raciocínio verbal e atenção a materiais verbais",
            QI_EXECUCAO: "raciocínio fluido, processamento espacial, atenção a detalhes e integração visomotora",
            ICV:         "raciocínio verbal e formação de conceitos",
            IOP:         "raciocínio não verbal, atenção a detalhes e integração visomotora",
            IMO:         "atenção, concentração e controle mental para manipular informações",
            IVP:         "rapidez e eficiência para processar informações visuais simples",
        };
        return m[key] || "habilidades cognitivas avaliadas";
    }

    // Grupos cognitivos (perfil de subtestes)
    const GRUPOS_WAIS = [
        { titulo: "Compreensão Verbal",          codes: ["SM", "VC", "IN", "CO"] },
        { titulo: "Organização Perceptual",      codes: ["CB", "CF", "RM", "AF"] },
        { titulo: "Memória Operacional",         codes: ["AR", "DG", "SNL"] },
        { titulo: "Velocidade de Processamento", codes: ["CD", "PS"] },
    ];

    function renderModoLaudo() {
        const acoes = document.getElementById('acoes-topo');
        acoes.style.display = 'flex';
        acoes.innerHTML = `
            <button class="btn btn-secondary" id="btn-editar-brutos">
                ✏️ Editar brutos
            </button>
            <button class="btn btn-primary" id="btn-gerar-pdf">
                📄 Gerar PDF do relatório
            </button>
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

    // Dados para o painel moderno (shared/wechsler_painel.js). Só organiza o que o
    // cálculo já gravou: nenhum número é recalculado aqui.
    function painelCfg() {
        const r = state.resultado;
        const ponds = r.ponderados || {};
        let icg = null;
        if (window.CortexICG) {
            const g = window.CortexICG.calcularICG('WAIS', ponds);
            if (g && !g.incompleto && !g.foraDaTabela) icg = g;
        }
        return {
            subtestes: SUBTESTES,
            // Armar Objetos (AO) só conta na Execução: entra junto da Organização Perceptual
            grupos: GRUPOS_WAIS.map(g => g.titulo === 'Organização Perceptual' ? { titulo: g.titulo, codes: g.codes.concat(['AO']) } : g),
            ponds, brutos: state.brutos || {}, somas: r.somas || {}, compostos: r.compostos || {}, icg,
            media: r.fortes_fracos?.media,
            rotuloQI: 'Escalas de QI',
            escalasQI: [['QIV', 'QI_VERBAL', 'QI Verbal'], ['QIE', 'QI_EXECUCAO', 'QI de Execução']],
            colunas: [
                { k: 'ICV', soma: 'ICV',         nome: 'Comp. Verbal',     cor: '#4338CA', poss: ['SM', 'VC', 'IN', 'CO'] },
                { k: 'IOP', soma: 'IOP',         nome: 'Org. Perceptual',  cor: '#9333EA', poss: ['CB', 'CF', 'RM', 'AF'] },
                { k: 'IMO', soma: 'IMO',         nome: 'Mem. Operacional', cor: '#DB2777', poss: ['AR', 'DG', 'SNL'] },
                { k: 'IVP', soma: 'IVP',         nome: 'Velocidade',       cor: '#0D9488', poss: ['CD', 'PS'] },
                { k: 'QIV', soma: 'QI_VERBAL',   nome: 'QI Verbal',        cor: '#1F3864', poss: ['VC', 'SM', 'AR', 'DG', 'IN', 'CO', 'SNL'], qi: true },
                { k: 'QIE', soma: 'QI_EXECUCAO', nome: 'QI Execução',      cor: '#475569', poss: ['CF', 'CD', 'CB', 'RM', 'AF', 'PS', 'AO'], qi: true },
            ],
        };
    }

    // Título de seção dentro de um cartão (o .laudo-secao-titulo continua sendo a
    // referência do 📋 e das figuras do Laudo Online para dar nome a cada bloco).
    function tituloSecao(txt, dica, oculto) {
        return `<div class="laudo-secao-titulo${oculto ? ' cxp-oculto' : ''}"><span class="cxp-tt">${txt}</span>${dica ? `<span class="laudo-secao-hint">${dica}</span>` : ''}</div>`;
    }

    function renderLaudoCompleto() {
        const r = state.resultado;
        const compostoQIT = r.compostos?.QI_TOTAL?.composto;
        const classifQIT = compostoQIT != null ? classByComposite(compostoQIT) : '—';
        const dataApl = state.aplicacao.data_aplicacao;
        const idadeStr = `${r.idade_anos}a${r.idade_meses ? ' ' + r.idade_meses + 'm' : ''}`;
        const P = window.WechslerPainel;
        const cfg = painelCfg();
        const ident = (rot, val) => `<div class="laudo-identif-item"><span class="laudo-identif-label">${rot}</span><span class="laudo-identif-valor">${val}</span></div>`;
        const media = r.fortes_fracos?.media;

        return `
        <div class="laudo cxp">
            <div class="laudo-header">
                <div class="laudo-header-esq">
                    <div class="laudo-header-logo">E</div>
                    <div class="laudo-header-textos">
                        <div class="laudo-header-supratitulo">Relatório Neuropsicológico</div>
                        <h1 class="laudo-header-titulo">WAIS-III</h1>
                        <div class="laudo-header-subtitulo">
                            Escala Wechsler de Inteligência para Adultos — 3ª Edição<br>
                            Conversão PB → Ponderado e somatórios por índice
                        </div>
                    </div>
                </div>
                <div class="laudo-header-pontuacao">
                    <div class="laudo-header-pontuacao-label">Faixa Normativa</div>
                    <div class="laudo-header-pontuacao-valor">${escapeHtml(r.faixa_norma || '—')}</div>
                    <div class="laudo-header-pontuacao-max" style="font-size:11px;">Idade: ${idadeStr}</div>
                </div>
            </div>

            <div class="laudo-body">

                <section class="cxp-card">
                    ${tituloSecao('Identificação')}
                    <div class="laudo-identificacao">
                        ${ident('Nome', escapeHtml(state.paciente.nome_completo))}
                        ${ident('CPF', escapeHtml(state.paciente.cpf || '—'))}
                        ${ident('Sexo', escapeHtml(state.paciente.sexo || '—'))}
                        ${ident('Escolaridade', escapeHtml(state.paciente.escolaridade || '—'))}
                        ${ident('Nascimento', `${formatarDataBR(state.paciente.data_nascimento)} (${idadeStr})`)}
                        ${ident('Aplicação', formatarDataBR(dataApl))}
                        ${ident('Profissional', `${escapeHtml(r.profissional_nome || '—')}${r.profissional_crp ? ' — ' + escapeHtml(r.profissional_crp) : ''}`)}
                        ${ident('Especialidade', escapeHtml(r.profissional_especialidade || '—'))}
                    </div>
                </section>

                <section class="cxp-sec">
                    ${tituloSecao('Resumo dos índices', '', true)}
                    ${P.cartoes(cfg)}
                </section>

                ${r.motivo_encaminhamento ? `
                <section class="cxp-card">
                    ${tituloSecao('Motivo do Encaminhamento')}
                    <div class="wais-texto-bloco">${escapeHtml(r.motivo_encaminhamento)}</div>
                </section>` : ''}

                <section class="cxp-card">
                    ${tituloSecao('Conversão PB → Ponderado', 'e contribuição nos índices')}
                    ${P.conversao(cfg)}
                </section>

                <section class="cxp-card">
                    ${tituloSecao('Perfil dos Pontos Ponderados dos Subtestes', 'barras por domínio · média 10')}
                    ${P.barras(cfg)}
                </section>

                <section class="cxp-card">
                    ${tituloSecao('Índices e QI', 'ICV · IOP · IMO · IVP → QIV · QIE → QIT · ICG')}
                    ${P.indices(cfg)}
                    ${P.tabelaIndices(cfg)}
                    ${renderICG()}
                    ${renderTabelasPorIndice()}
                    ${renderAlertaQIT(classifQIT)}
                </section>

                <section class="cxp-card">
                    ${tituloSecao('Perfil dos Subtestes', 'ponderados · faixa Média 9 a 11')}
                    ${P.linha(cfg)}
                </section>

                <div class="cxp-duas">
                    ${r.discrepancias && r.discrepancias.length > 0 ? `
                    <section class="cxp-card">
                        ${tituloSecao('Discrepâncias entre Índices', 'p &lt; 0,05')}
                        ${P.discrepancias(r.discrepancias)}
                    </section>` : ''}
                    <section class="cxp-card">
                        ${tituloSecao('Pontos Fortes e Fracos', `média pessoal ${media != null ? String(media).replace('.', ',') : '—'}`)}
                        ${P.fortesFracos(r.fortes_fracos)}
                    </section>
                </div>

                <section class="cxp-card">
                    ${tituloSecao('Subtestes — Detalhamento')}
                    ${P.detalhe(cfg)}
                </section>

                <section class="cxp-card">
                    ${tituloSecao('Interpretação Clínica')}
                    ${renderInterpretacaoClinica()}
                </section>

                ${r.observacoes_comportamentais ? `
                <section class="cxp-card">
                    ${tituloSecao('Observações Comportamentais')}
                    <div class="wais-texto-bloco">${escapeHtml(r.observacoes_comportamentais)}</div>
                </section>` : ''}

                ${r.recomendacoes ? `
                <section class="cxp-card">
                    ${tituloSecao('Conclusão e Recomendações')}
                    <div class="wais-texto-bloco">${escapeHtml(r.recomendacoes)}</div>
                </section>` : ''}

            </div>

            <!-- ─── RODAPÉ COM ASSINATURA ─── -->
            <div class="laudo-rodape">
                <div class="laudo-rodape-esq">
                    <div class="laudo-rodape-org">${escapeHtml(r.profissional_nome || 'Profissional')}</div>
                    <div class="laudo-rodape-tipo">${escapeHtml(r.profissional_crp || '—')}${r.profissional_especialidade ? ' · ' + escapeHtml(r.profissional_especialidade) : ''}</div>
                    <div class="wais-assinatura-linha">Assinatura do profissional</div>
                </div>
                <div class="laudo-rodape-dir">
                    <div class="laudo-rodape-data">Documento gerado em ${formatarDataBR(new Date().toISOString())}</div>
                    <div class="laudo-rodape-confidencial">
                        Este documento é confidencial e destinado<br>
                        exclusivamente ao profissional solicitante. Válido<br>
                        apenas com assinatura.
                    </div>
                </div>
            </div>
        </div>
        `;
    }

    // ────────────────────────────────────────────────────────────────────────
    // TABELAS INDIVIDUAIS POR ÍNDICE (para colar no laudo)
    // ────────────────────────────────────────────────────────────────────────
    // A tabela consolidada acima serve para leitura do caso inteiro. No laudo
    // escrito, porém, cada índice ganha sua própria seção com o parágrafo
    // interpretativo logo abaixo — e colar a tabela inteira ali repetiria seis
    // linhas irrelevantes para aquele trecho.
    //
    // Aqui sai uma tabela por índice, no formato enxuto que vai para o
    // documento: sigla, QI, percentil e classificação. Cada uma ganha o botão
    // de copiar sozinha, porque o copy_to_clipboard.js varre por
    // [class*="-tab-"] — daí o nome da classe.


    // ────────────────────────────────────────────────────────────────────────
    // ICG — ÍNDICE DE CAPACIDADE GERAL
    // ────────────────────────────────────────────────────────────────────────
    // Conversão fechada por tabela oficial (window.CortexICG), não estimativa.
    // Some os 6 ponderados core e leia composto, percentil e IC 95%.
    //
    // O ICG existe para os casos em que o QIT não pode ser interpretado: quando
    // a amplitude entre os índices chega a 23 pontos, o escore global deixa de
    // representar o desempenho e a leitura se ancora aqui.

    function renderICG() {
        if (!window.CortexICG) return '';

        const r = state.resultado;
        const ponds = r.ponderados || {};
        const icg = window.CortexICG.calcularICG('WAIS', ponds);
        if (!icg) return '';

        const compostos = {};
        ['ICV', 'IOP', 'IMO', 'IVP'].forEach(k => {
            const c = r.compostos?.[k]?.composto;
            if (c != null) compostos[ESCALAS_SIGLA[k] || k] = c;
        });
        const interp = window.CortexICG.avaliarInterpretabilidade(compostos, 'IOP');

        // Sem os 6 core não há ICG. Dizer o que falta é mais útil que sumir.
        if (icg.incompleto) {
            const nomes = icg.faltando
                .map(c => (SUBTESTES.find(s => s.codigo === c)?.nome) || c)
                .join(', ');
            return `
                <div class="wais-icg-aviso">
                    <strong>ICG não calculado.</strong>
                    Faltam ponderados dos subtestes core: ${escapeHtml(nomes)}.
                    Subtestes suplementares não substituem os core neste cálculo.
                </div>`;
        }
        if (icg.foraDaTabela) {
            return `<div class="wais-icg-aviso"><strong>ICG não calculado.</strong>
                    Soma EP ${icg.somaEP} fora do intervalo da tabela oficial.</div>`;
        }

        const col = icColor(icg.composto);
        const cl  = icg.classificacao;

        const alerta = (interp && interp.icgValido === false)
            ? `<div class="wais-icg-alerta">
                   <strong>Leia com ressalva.</strong>
                   A diferença entre ${escapeHtml(icg.rotuloVerbal)} e ${escapeHtml(icg.rotuloPerceptual)}
                   é de ${interp.difVerbalPerceptual} pontos (limiar ${interp.limiar}).
                   Acima desse limiar o ICG deixa de representar bem a capacidade geral —
                   descreva o desempenho por índices, subtestes ou clusters.
               </div>`
            : (interp && interp.qitInterpretavel === false
                ? `<div class="wais-icg-nota-uso">
                       A amplitude entre os índices é de ${interp.amplitude} pontos
                       (limiar ${interp.limiar}), então o QIT não é interpretável como
                       escore global — ancore a leitura no ICG.
                   </div>`
                : '');

        return `
            ${alerta}
            <div class="wais-tab-icg">
                <table>
                    <thead><tr>
                        <th>Índice de Capacidade Geral</th>
                        <th class="ctr">SOMA EP</th>
                        <th class="ctr">ICG</th>
                        <th class="ctr">PERCENTIL</th>
                        <th class="ctr">IC 95%</th>
                        <th>CLASSIFICAÇÃO</th>
                    </tr></thead>
                    <tbody><tr>
                        <td class="wais-icg-sigla">ICG</td>
                        <td class="ctr">${icg.somaEP}</td>
                        <td class="ctr" style="color:${col};font-weight:700;">${icg.composto}</td>
                        <td class="ctr">P${escapeHtml(icg.percentil)}</td>
                        <td class="ctr">${icg.ic95[0]}–${icg.ic95[1]}</td>
                        <td class="wais-icg-cl ${clBadgeClass(cl)}">${escapeHtml(cl)}</td>
                    </tr></tbody>
                </table>
            </div>
            <div class="wais-icg-comp">
                <span><b>${escapeHtml(icg.rotuloVerbal)}</b> ${icg.somaVerbal}
                      <i>(${icg.codigosVerbal.join(' + ')})</i></span>
                <span><b>${escapeHtml(icg.rotuloPerceptual)}</b> ${icg.somaPerceptual}
                      <i>(${icg.codigosPerceptual.join(' + ')})</i></span>
                <span><b>Soma EP</b> ${icg.somaEP}</span>
            </div>
            <div class="wais-icg-fonte">${escapeHtml(window.CortexICG.NOTA_NORMA)}</div>
            `;
    }

    function renderTabelasPorIndice() {
        const r = state.resultado;
        const compostos = r.compostos || {};

        const blocos = ['ICV', 'IOP', 'IMO', 'IVP', 'QI_VERBAL', 'QI_EXECUCAO', 'QI_TOTAL'].map(key => {
            const c = compostos[key];
            if (!c?.composto) return '';

            const sigla = ESCALAS_SIGLA[key] || key;
            const nome  = ESCALAS_LABEL[key] || key;
            const cl    = classByComposite(c.composto);
            const col   = icColor(c.composto);
            const perc  = c.percentil ?? null;

            return `
            <div class="wais-indice-bloco">
                <div class="wais-tab-indice">
                    <table>
                        <thead><tr>
                            <th>${escapeHtml(nome)}</th>
                            <th class="ctr">Q.I</th>
                            <th class="ctr">PERCENTIL</th>
                            <th>CLASSIFICAÇÃO</th>
                        </tr></thead>
                        <tbody><tr>
                            <td class="wais-ind-sigla">${escapeHtml(sigla)}</td>
                            <td class="ctr" style="color:${col};">${c.composto}</td>
                            <td class="ctr">${perc != null ? 'P' + perc : '—'}</td>
                            <td class="wais-ind-cl ${clBadgeClass(cl)}">${escapeHtml(cl)}</td>
                        </tr></tbody>
                    </table>
                </div>
            </div>`;
        }).join('');

        if (!blocos.trim()) return '';

        return `
            <div class="wais-indices-nota">
                Uma tabela por índice, no formato que vai para o laudo escrito.
                Passe o mouse sobre a tabela e use o botão para copiar como imagem.
            </div>
            <div class="wais-indices-lista">${blocos}</div>`;
    }

    // ────────────────────────────────────────────────────────────────────────
    // INTERPRETAÇÃO CLÍNICA (parágrafos por escala)
    // ────────────────────────────────────────────────────────────────────────

    function renderInterpretacaoClinica() {
        const r = state.resultado;
        const compostos = r.compostos || {};

        const ordem = ['QI_TOTAL', 'QI_VERBAL', 'QI_EXECUCAO', 'ICV', 'IOP', 'IMO', 'IVP'];
        const aberturas = [
            'Em relação ao', 'Quanto ao', 'Em relação ao',
            'Quanto ao', 'Em relação ao', 'Quanto ao', 'Em relação ao',
        ];
        const labels = {
            QI_TOTAL:    'QI Total (QIT)',
            QI_VERBAL:   'QI Verbal (QIV)',
            QI_EXECUCAO: 'QI de Execução (QIE)',
            ICV:         'Índice de Compreensão Verbal (ICV)',
            IOP:         'Índice de Organização Perceptual (IOP)',
            IMO:         'Índice de Memória Operacional (IMO)',
            IVP:         'Índice de Velocidade de Processamento (IVP)',
        };

        const paragrafos = ordem.map((key, i) => {
            const c = compostos[key];
            if (!c?.composto) return '';
            const cls = classByComposite(c.composto);
            const verb = introVerbByClass(cls);
            const abil = abilityDescription(key);
            const ic95 = c.ic95 ? `${c.ic95[0]}–${c.ic95[1]}` : '—';

            return `<p class="wais-interp-par">${aberturas[i]} <strong>${escapeHtml(labels[key])}</strong>, as habilidades relacionadas a ${escapeHtml(abil)} ${escapeHtml(verb)} em comparação a pessoas de mesma faixa etária (pontuação composta = ${c.composto}; percentil ≈ ${c.percentil}; IC 95% = ${ic95}; classificação: ${escapeHtml(cls)}).</p>`;
        }).filter(Boolean).join('');

        return `<div class="wais-interp-bloco">${paragrafos}</div>`;
    }

    // ────────────────────────────────────────────────────────────────────────
    // CLASSIFICAÇÕES
    // ────────────────────────────────────────────────────────────────────────

    function classByPonderado(p) {
        const s = +p;
        if (Number.isNaN(s)) return '—';
        if (s >= 16) return 'Muito Superior';
        if (s >= 14) return 'Superior';
        if (s >= 12) return 'Médio Superior';
        if (s >= 9)  return 'Médio';
        if (s >= 7)  return 'Médio Inferior';
        if (s >= 4)  return 'Limítrofe';
        return 'Extremamente Baixo';
    }

    // ============================================================================
    // PDF
    // ============================================================================

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
            const nomeArquivo = `WAIS-III - ${nomeAbreviado}_${dataStr}.pdf`;
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

    // ============================================================================
    // HELPERS
    // ============================================================================

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

    // Alerta automatico conforme a classificacao do QIT (usa a classificacao ja calculada).
    function renderAlertaQIT(classif) {
        const alto  = (classif === 'Superior' || classif === 'Muito Superior');
        const baixo = (classif === 'Limítrofe' || classif === 'Extremamente Baixo');
        if (!alto && !baixo) return '';
        if (alto) {
            return `
                <div class="qit-alerta qit-alerta-alto">
                    <div class="qit-alerta-icone">▲</div>
                    <div class="qit-alerta-texto">
                        <strong>QI Total na faixa ${escapeHtml(classif)}.</strong>
                        Resultado compatível com desempenho intelectual acima da média. Recomenda-se considerar a
                        aplicação de instrumentos específicos para investigação de <strong>Altas Habilidades / Superdotação</strong>,
                        integrando este achado aos demais dados da avaliação.
                    </div>
                </div>`;
        }
        return `
            <div class="qit-alerta qit-alerta-baixo">
                <div class="qit-alerta-icone">▼</div>
                <div class="qit-alerta-texto">
                    <strong>QI Total na faixa ${escapeHtml(classif)}.</strong>
                    Resultado significativamente abaixo da média esperada. Recomenda-se atenção clínica: investigar
                    fatores que possam ter influenciado o desempenho e considerar avaliação complementar do
                    funcionamento adaptativo, integrando este achado aos demais dados da avaliação.
                </div>
            </div>`;
    }

    function classByComposite(score) {
        const s = Number(score);
        if (Number.isNaN(s)) return '—';
        if (s >= 130) return 'Muito Superior';
        if (s >= 120) return 'Superior';
        if (s >= 110) return 'Médio Superior';
        if (s >= 90)  return 'Médio';
        if (s >= 80)  return 'Médio Inferior';
        if (s >= 70)  return 'Limítrofe';
        return 'Extremamente Baixo';
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

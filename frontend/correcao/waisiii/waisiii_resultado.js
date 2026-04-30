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
    // MODO LAUDO — padrão visual do sistema antigo (mais gráficos + interpretação)
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
    function clBadge(cl) {
        return `<span class="cl-badge ${clBadgeClass(cl)}">${escapeHtml(cl)}</span>`;
    }

    // Cor de barra (subtestes — pontos ponderados)
    function barColor(p) {
        if (p >= 12) return '#1a56db';   // azul forte (médio sup+)
        if (p >= 9)  return '#3b82f6';   // azul (médio)
        if (p >= 7)  return '#f59e0b';   // amarelo (médio inferior)
        return '#dc2626';                // vermelho (limítrofe ou abaixo)
    }

    // Cor de barra (índices/QIs — pontuação composta)
    function icColor(comp) {
        if (comp >= 110) return '#059669';  // verde
        if (comp >= 90)  return '#1a56db';  // azul forte
        if (comp >= 80)  return '#f59e0b';  // amarelo
        return '#dc2626';                   // vermelho
    }

    // Escala IC (40-170 mapeado pra 0-100%)
    function icScale(v) {
        return ((v - 40) / 130) * 100;
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

    function renderLaudoCompleto() {
        const r = state.resultado;
        const compostoQIT = r.compostos?.QI_TOTAL?.composto;
        const classifQIT = compostoQIT != null ? classByComposite(compostoQIT) : '—';
        const dataApl = state.aplicacao.data_aplicacao;
        const idadeStr = `${r.idade_anos}a${r.idade_meses ? ' ' + r.idade_meses + 'm' : ''}`;

        return `
        <div class="laudo">
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

                <!-- ─── 1. IDENTIFICAÇÃO ─── -->
                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">1</span>
                    Identificação
                </div>
                <div class="laudo-identificacao">
                    <div class="laudo-identif-item">
                        <span class="laudo-identif-label">Nome:</span>
                        <span class="laudo-identif-valor">${escapeHtml(state.paciente.nome_completo)}</span>
                    </div>
                    <div class="laudo-identif-item">
                        <span class="laudo-identif-label">CPF:</span>
                        <span class="laudo-identif-valor">${escapeHtml(state.paciente.cpf || '—')}</span>
                    </div>
                    <div class="laudo-identif-item">
                        <span class="laudo-identif-label">Sexo:</span>
                        <span class="laudo-identif-valor">${escapeHtml(state.paciente.sexo || '—')}</span>
                    </div>
                    <div class="laudo-identif-item">
                        <span class="laudo-identif-label">Escolaridade:</span>
                        <span class="laudo-identif-valor">${escapeHtml(state.paciente.escolaridade || '—')}</span>
                    </div>
                    <div class="laudo-identif-item">
                        <span class="laudo-identif-label">Nascimento:</span>
                        <span class="laudo-identif-valor">${formatarDataBR(state.paciente.data_nascimento)} (${idadeStr})</span>
                    </div>
                    <div class="laudo-identif-item">
                        <span class="laudo-identif-label">Aplicação:</span>
                        <span class="laudo-identif-valor">${formatarDataBR(dataApl)}</span>
                    </div>
                    <div class="laudo-identif-item">
                        <span class="laudo-identif-label">Profissional:</span>
                        <span class="laudo-identif-valor">${escapeHtml(r.profissional_nome || '—')}${r.profissional_crp ? ' — ' + escapeHtml(r.profissional_crp) : ''}</span>
                    </div>
                    <div class="laudo-identif-item">
                        <span class="laudo-identif-label">Especialidade:</span>
                        <span class="laudo-identif-valor">${escapeHtml(r.profissional_especialidade || '—')}</span>
                    </div>
                </div>

                <!-- ─── 2. MOTIVO ─── -->
                ${r.motivo_encaminhamento ? `
                    <div class="laudo-secao-titulo">
                        <span class="laudo-secao-tag">2</span>
                        Motivo do Encaminhamento
                    </div>
                    <div class="wais-texto-bloco">${escapeHtml(r.motivo_encaminhamento)}</div>
                ` : ''}

                <!-- ─── 3. MATRIZ DE CONVERSÃO ─── -->
                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">${r.motivo_encaminhamento ? 3 : 2}</span>
                    Conversão PB → Ponderado e Contribuição nos Índices
                    <span class="laudo-secao-hint">Células azuis = subtestes usados. Parênteses = suplementares.</span>
                </div>
                ${renderMatrizConversao()}

                <!-- ─── 4. PERFIL DE SUBTESTES (4 grupos) ─── -->
                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">${r.motivo_encaminhamento ? 4 : 3}</span>
                    Perfil dos Pontos Ponderados dos Subtestes
                    <span class="laudo-secao-hint">Barras por domínio cognitivo. Faixa azul = média (9–11).</span>
                </div>
                ${renderPerfilSubtestesHTML()}

                <!-- ─── 5. ÍNDICES E QI TOTAL (gráfico IC95 + tabela) ─── -->
                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">${r.motivo_encaminhamento ? 5 : 4}</span>
                    Índices e QI Total
                    <span class="laudo-secao-hint">Gráfico com intervalos de confiança (95%) e tabela completa.</span>
                </div>
                ${renderICChart()}
                ${renderTabelaIndices()}

                <!-- ─── 6. SUBTESTES — DETALHAMENTO ─── -->
                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">${r.motivo_encaminhamento ? 6 : 5}</span>
                    Subtestes — Detalhamento
                </div>
                ${renderTabelaDetalheSubtestes()}

                <!-- ─── 7. ANÁLISE DE DISCREPÂNCIAS ─── -->
                ${r.discrepancias && r.discrepancias.length > 0 ? `
                    <div class="laudo-secao-titulo">
                        <span class="laudo-secao-tag">${r.motivo_encaminhamento ? 7 : 6}</span>
                        Análise de Discrepâncias entre Índices
                        <span class="laudo-secao-hint">Comparações pareadas com valores críticos (p &lt; .05).</span>
                    </div>
                    ${renderTabelaDiscrepancias()}
                ` : ''}

                <!-- ─── 8. PONTOS FORTES E FRACOS ─── -->
                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">${r.motivo_encaminhamento ? 8 : 7}</span>
                    Pontos Fortes e Fracos Pessoais
                    <span class="laudo-secao-hint">Média pessoal: ${r.fortes_fracos?.media ?? '—'} · Desvio ≥ 3 pontos = significativo</span>
                </div>
                ${renderFortesFracos()}

                <!-- ─── 9. INTERPRETAÇÃO CLÍNICA ─── -->
                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">${r.motivo_encaminhamento ? 9 : 8}</span>
                    Interpretação Clínica
                </div>
                ${renderInterpretacaoClinica()}

                <!-- ─── 10. OBSERVAÇÕES ─── -->
                ${r.observacoes_comportamentais ? `
                    <div class="laudo-secao-titulo">
                        <span class="laudo-secao-tag">${r.motivo_encaminhamento ? 10 : 9}</span>
                        Observações Comportamentais
                    </div>
                    <div class="wais-texto-bloco">${escapeHtml(r.observacoes_comportamentais)}</div>
                ` : ''}

                <!-- ─── 11. RECOMENDAÇÕES ─── -->
                ${r.recomendacoes ? `
                    <div class="laudo-secao-titulo">
                        <span class="laudo-secao-tag">${r.motivo_encaminhamento ? 11 : 10}</span>
                        Conclusão e Recomendações
                    </div>
                    <div class="wais-texto-bloco">${escapeHtml(r.recomendacoes)}</div>
                ` : ''}

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
    // MATRIZ DE CONVERSÃO (PB → Pond + Contribuição em cada índice)
    // ────────────────────────────────────────────────────────────────────────

    function renderMatrizConversao() {
        const r = state.resultado;
        const ponds = r.ponderados || {};
        const somas = r.somas || {};

        const usadosICV    = new Set(somas.ICV?.usados        || []);
        const usadosIOP    = new Set(somas.IOP?.usados        || []);
        const usadosIMO    = new Set(somas.IMO?.usados        || []);
        const usadosIVP    = new Set(somas.IVP?.usados        || []);
        const usadosVERBAL = new Set(somas.QI_VERBAL?.usados  || []);
        const usadosEXEC   = new Set(somas.QI_EXECUCAO?.usados|| []);

        const possiveis = {
            VERBAL: new Set(['VC','SM','AR','DG','IN','CO','SNL']),
            EXEC:   new Set(['CF','CD','CB','RM','AF','PS','AO']),
            ICV:    new Set(['SM','VC','IN','CO']),
            IOP:    new Set(['CB','CF','RM','AF']),
            IMO:    new Set(['AR','DG','SNL']),
            IVP:    new Set(['CD','PS']),
        };

        function celula(codigo, usadosSet, possiveisSet) {
            if (!possiveisSet.has(codigo)) return `<td></td>`;
            const v = ponds[codigo];
            if (v == null) return `<td></td>`;
            const usado = usadosSet.has(codigo);
            return `<td><span class="wais-pill${usado ? '' : ' sup'}">${usado ? v : '(' + v + ')'}</span></td>`;
        }

        const linhas = SUBTESTES.slice().sort((a, b) => a.ordem - b.ordem).map(s => {
            const b = state.brutos[s.codigo] ?? '—';
            const p = ponds[s.codigo] ?? '—';
            return `<tr>
                <td class="col-sub">${escapeHtml(s.nome)} <span class="wais-escala-sigla">(${s.codigo})</span></td>
                <td class="col-pb">${b}</td>
                <td class="col-pp">${p}</td>
                ${celula(s.codigo, usadosVERBAL, possiveis.VERBAL)}
                ${celula(s.codigo, usadosEXEC,   possiveis.EXEC)}
                ${celula(s.codigo, usadosICV,    possiveis.ICV)}
                ${celula(s.codigo, usadosIOP,    possiveis.IOP)}
                ${celula(s.codigo, usadosIMO,    possiveis.IMO)}
                ${celula(s.codigo, usadosIVP,    possiveis.IVP)}
            </tr>`;
        }).join('');

        return `<div class="wais-matriz"><table>
            <thead>
                <tr>
                    <th class="col-sub" rowspan="2">SUBTESTES</th>
                    <th class="col-pb"  rowspan="2">PB</th>
                    <th class="col-pp"  rowspan="2">POND.</th>
                    <th colspan="6">CONTRIBUIÇÃO (PONTOS PONDERADOS)</th>
                </tr>
                <tr>
                    <th>VERBAL</th><th>EXEC.</th>
                    <th>ICV</th><th>IOP</th><th>IMO</th><th>IVP</th>
                </tr>
            </thead>
            <tbody>${linhas}</tbody>
            <tfoot>
                <tr>
                    <td class="sum-label" colspan="3">SOMA DOS PONTOS PONDERADOS</td>
                    <td>${somas.QI_VERBAL?.soma   ?? '—'}</td>
                    <td>${somas.QI_EXECUCAO?.soma ?? '—'}</td>
                    <td>${somas.ICV?.soma         ?? '—'}</td>
                    <td>${somas.IOP?.soma         ?? '—'}</td>
                    <td>${somas.IMO?.soma         ?? '—'}</td>
                    <td>${somas.IVP?.soma         ?? '—'}</td>
                </tr>
            </tfoot>
        </table></div>`;
    }

    // ────────────────────────────────────────────────────────────────────────
    // PERFIL DE SUBTESTES (4 grupos com barras horizontais)
    // ────────────────────────────────────────────────────────────────────────

    function renderPerfilSubtestesHTML() {
        const r = state.resultado;
        const ponds = r.ponderados || {};

        const blocos = GRUPOS_WAIS.map(g => {
            const linhas = g.codes.map(code => {
                const p = ponds[code];
                if (p == null) return '';
                const cl = classByPonderado(p);
                const col = barColor(p);
                // Faixa de média (9-11) — área cinza ao fundo
                const avgL = ((9 / 19) * 100).toFixed(1);
                const avgW = ((2 / 19) * 100).toFixed(1);
                const fillW = ((p / 19) * 100).toFixed(1);

                return `<div class="wais-bar-row">
                    <div class="wais-bar-code">${code}</div>
                    <div class="wais-bar-track">
                        <div class="wais-bar-avg-zone" style="left:${avgL}%; width:${avgW}%;"></div>
                        <div class="wais-bar-fill" style="width:${fillW}%; background:${col};"></div>
                    </div>
                    <div class="wais-bar-val">${p}</div>
                    <div class="wais-bar-badge">${clBadge(cl)}</div>
                </div>`;
            }).join('');

            return `<div class="wais-bar-group">
                <div class="wais-bar-group-titulo">${escapeHtml(g.titulo).toUpperCase()}</div>
                ${linhas}
            </div>`;
        }).join('');

        return `<div class="wais-perfil-bloco">${blocos}</div>`;
    }

    // ────────────────────────────────────────────────────────────────────────
    // GRÁFICO DE IC (Índices e QIs com intervalos de confiança)
    // ────────────────────────────────────────────────────────────────────────

    function renderICChart() {
        const r = state.resultado;
        const compostos = r.compostos || {};

        const items = [
            { sigla: 'QIV', key: 'QI_VERBAL'   },
            { sigla: 'QIE', key: 'QI_EXECUCAO' },
            { sigla: 'QIT', key: 'QI_TOTAL'    },
            { sigla: 'ICV', key: 'ICV' },
            { sigla: 'IOP', key: 'IOP' },
            { sigla: 'IMO', key: 'IMO' },
            { sigla: 'IVP', key: 'IVP' },
        ];

        const linhas = items.map(it => {
            const c = compostos[it.key];
            if (!c?.composto) return '';
            const comp = +c.composto;
            const cl = classByComposite(comp);
            const col = icColor(comp);
            const ic = c.ic95 || [comp - 5, comp + 5];

            // Linhas de grade verticais em valores específicos
            const grid = [60, 80, 100, 120, 140].map(v => {
                const isMain = (v === 100);
                return `<div class="wais-ic-gridline" style="left:${icScale(v)}%; ${isMain ? 'width:2px; background:rgba(100,116,139,.3);' : 'width:1px; background:rgba(203,213,225,.3);'}"></div>`;
            }).join('');

            return `<div class="wais-ic-row">
                <div class="wais-ic-label" style="color:${col};">${it.sigla}</div>
                <div class="wais-ic-track">
                    ${grid}
                    <div class="wais-ic-bar" style="left:${icScale(ic[0])}%; width:${(icScale(ic[1]) - icScale(ic[0])).toFixed(2)}%; background:${col}30; border:1px solid ${col}80;"></div>
                    <div class="wais-ic-whisker" style="left:${icScale(ic[0])}%; background:${col}80;"></div>
                    <div class="wais-ic-whisker" style="left:${icScale(ic[1])}%; background:${col}80;"></div>
                    <div class="wais-ic-dot" style="left:${icScale(comp)}%; background:${col}; box-shadow:0 2px 6px ${col}50;">${comp}</div>
                </div>
                <div class="wais-ic-badge">${clBadge(cl)}</div>
            </div>`;
        }).join('');

        return `<div class="wais-ic-chart">
            <div class="wais-ic-scale">
                <span>40</span><span>60</span><span>80</span>
                <span style="font-weight:800; color:#475569;">100</span>
                <span>120</span><span>140</span><span>160</span>
            </div>
            ${linhas}
            <div class="wais-ic-legenda">Linha escura = média normativa (100) · Faixa colorida = IC 95% · Círculo = composto obtido</div>
        </div>`;
    }

    // ────────────────────────────────────────────────────────────────────────
    // TABELA DE ÍNDICES (resumo numérico)
    // ────────────────────────────────────────────────────────────────────────

    function renderTabelaIndices() {
        const r = state.resultado;
        const compostos = r.compostos || {};
        const somas = r.somas || {};

        const items = [
            { sigla: 'QIV', key: 'QI_VERBAL'   },
            { sigla: 'QIE', key: 'QI_EXECUCAO' },
            { sigla: 'QIT', key: 'QI_TOTAL'    },
            { sigla: 'ICV', key: 'ICV' },
            { sigla: 'IOP', key: 'IOP' },
            { sigla: 'IMO', key: 'IMO' },
            { sigla: 'IVP', key: 'IVP' },
        ];

        const linhas = items.map(it => {
            const c = compostos[it.key];
            const s = somas[it.key];
            if (!c?.composto) return '';
            const cl = classByComposite(c.composto);
            const col = icColor(c.composto);
            return `<tr>
                <td class="wais-ind-sigla">${it.sigla}</td>
                <td class="ctr">${s?.soma ?? '—'}</td>
                <td class="ctr" style="font-weight:800; font-size:14px; color:${col};">${c.composto}</td>
                <td class="ctr">${c.percentil ?? '—'}</td>
                <td class="ctr"><span class="wais-ic">${c.ic90?.[0]}–${c.ic90?.[1]}</span></td>
                <td class="ctr"><span class="wais-ic">${c.ic95?.[0]}–${c.ic95?.[1]}</span></td>
                <td>${clBadge(cl)}</td>
            </tr>`;
        }).join('');

        return `<div class="wais-tab-qis"><table>
            <thead><tr>
                <th>ESCALA</th>
                <th class="ctr">SOMA POND.</th>
                <th class="ctr">QI / ÍNDICE</th>
                <th class="ctr">RANK PERCENTIL</th>
                <th class="ctr">IC 90%</th>
                <th class="ctr">IC 95%</th>
                <th>CLASSIFICAÇÃO</th>
            </tr></thead>
            <tbody>${linhas}</tbody>
        </table></div>`;
    }

    // ────────────────────────────────────────────────────────────────────────
    // TABELA DETALHADA DE SUBTESTES (PB / Pond / Classif / Desvio MP)
    // ────────────────────────────────────────────────────────────────────────

    function renderTabelaDetalheSubtestes() {
        const r = state.resultado;
        const ponds = r.ponderados || {};
        const media = r.fortes_fracos?.media || 10;

        const linhas = SUBTESTES.slice().sort((a, b) => a.ordem - b.ordem).map(s => {
            const p = ponds[s.codigo];
            if (p == null) return '';
            const dev = p - media;
            const devCol = dev >= 3 ? '#059669' : dev <= -3 ? '#dc2626' : '#94a3b8';
            const cl = classByPonderado(p);
            const bruto = state.brutos[s.codigo] ?? '—';

            return `<tr>
                <td class="wais-detalhe-sub">${escapeHtml(s.nome)} <span class="wais-escala-sigla">(${s.codigo})</span></td>
                <td class="ctr">${bruto}</td>
                <td class="ctr" style="font-weight:700; font-size:14px;">${p}</td>
                <td>${clBadge(cl)}</td>
                <td class="ctr" style="font-weight:700; color:${devCol};">${dev >= 0 ? '+' : ''}${dev.toFixed(1)}</td>
            </tr>`;
        }).join('');

        return `<div class="wais-tab-detalhe"><table>
            <thead><tr>
                <th>SUBTESTE</th>
                <th class="ctr">PB</th>
                <th class="ctr">PONDERADO</th>
                <th>CLASSIFICAÇÃO</th>
                <th class="ctr">DESVIO MP</th>
            </tr></thead>
            <tbody>${linhas}</tbody>
            <tfoot>
                <tr>
                    <td colspan="4" class="wais-detalhe-mp-label">MÉDIA PESSOAL DOS PONDERADOS</td>
                    <td class="ctr" style="font-weight:800;">${media}</td>
                </tr>
            </tfoot>
        </table></div>`;
    }

    // ────────────────────────────────────────────────────────────────────────
    // TABELA DE DISCREPÂNCIAS (com badges + legenda)
    // ────────────────────────────────────────────────────────────────────────

    function renderTabelaDiscrepancias() {
        const r = state.resultado;
        const linhas = r.discrepancias.map(d => {
            // 3 níveis: Significativa (sig=true), Notável (8+), Não significativa
            let badge, sigCol, icone = '';
            if (d.sig) {
                badge = '<span class="wais-disc-badge sig">SIM</span>';
                sigCol = '#dc2626';
            } else if (Math.abs(d.diff) >= 8) {
                badge = '<span class="wais-disc-badge notavel">NÃO</span>';
                sigCol = '#f59e0b';
                icone = ' ⚠';
            } else {
                badge = '<span class="wais-disc-badge nao">NÃO</span>';
                sigCol = '#94a3b8';
            }

            return `<tr>
                <td class="wais-disc-par">${escapeHtml(d.par)}</td>
                <td class="ctr">${d.va}</td>
                <td class="ctr">${d.vb}</td>
                <td class="ctr" style="font-weight:700; color:${sigCol};">${d.diff >= 0 ? '+' : ''}${d.diff}${icone}</td>
                <td class="ctr">${d.vc}</td>
                <td class="ctr">${badge}</td>
            </tr>`;
        }).join('');

        return `<div class="wais-tab-discrep"><table>
            <thead><tr>
                <th>COMPARAÇÃO</th>
                <th class="ctr">ÍNDICE 1</th>
                <th class="ctr">ÍNDICE 2</th>
                <th class="ctr">DIFERENÇA</th>
                <th class="ctr">VAL. CRÍTICO (.05)</th>
                <th class="ctr">SIGNIFICATIVO?</th>
            </tr></thead>
            <tbody>${linhas}</tbody>
        </table>
        <div class="wais-disc-legenda">
            <span><span class="wais-disc-dot nao"></span> Não significativo</span>
            <span><span class="wais-disc-dot notavel"></span> Notável (≥8)</span>
            <span><span class="wais-disc-dot sig"></span> Significativo (p &lt; .05)</span>
        </div>
        </div>`;
    }

    // ────────────────────────────────────────────────────────────────────────
    // PONTOS FORTES E FRACOS
    // ────────────────────────────────────────────────────────────────────────

    function renderFortesFracos() {
        const ff = state.resultado.fortes_fracos;
        if (!ff) return '';

        const renderLista = (items, vazioMsg, sinal) => {
            if (!items || items.length === 0) {
                return `<div class="wais-ff-vazio">${escapeHtml(vazioMsg)}</div>`;
            }
            return items.map(it => `
                <div class="wais-ff-item">
                    <div class="wais-ff-item-titulo">${escapeHtml(it.nome)} <span class="wais-escala-sigla">(${it.cod})</span></div>
                    <div class="wais-ff-item-detalhe">Ponderado: <strong>${it.p}</strong> · Desvio: <strong>${sinal}${Math.abs(it.desvio).toFixed(1)}</strong> ${sinal === '+' ? 'acima' : 'abaixo'} da média pessoal</div>
                </div>
            `).join('');
        };

        return `<div class="wais-ff-grid">
            <div class="wais-ff-card wais-ff-card-fortes">
                <div class="wais-ff-titulo">▲ Pontos Fortes</div>
                ${renderLista(ff.fortes, 'Nenhum desvio ≥3 positivo encontrado.', '+')}
            </div>
            <div class="wais-ff-card wais-ff-card-fracos">
                <div class="wais-ff-titulo">▼ Pontos Fracos</div>
                ${renderLista(ff.fracos, 'Nenhum desvio ≥3 negativo encontrado.', '-')}
            </div>
        </div>`;
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

// ============================================================================
// CORTEX_APP — Resultado SCARED (unificado: Auto + Hetero)
// ============================================================================
// URL: ?aplicacao_id=<uuid>
//
// O aplicacao_id na URL pode ser de SCARED-A ou SCARED-H. Esta tela:
//   1. Carrega a aplicação principal e identifica se é Auto ou Hetero
//   2. Procura a contraparte (a outra versão) do MESMO paciente, dentro de
//      uma janela de ±30 dias da data_aplicacao da principal
//   3. Se achar contraparte → laudo unificado com comparativo
//      Se não achar     → laudo parcial só com a parte respondida
//
// Cálculos no JS (não no banco — decisão Q3 da especificação):
//   - Z-score: (valor - média) / DP, usando normas de Birmaher et al. 1999
//     estratificadas por faixa etária (7-12, 13-18) × sexo (M, F)
//   - Percentil: CDF normal padrão (Abramowitz & Stegun)
//
// Médias/DPs por subescala (estratificadas) ficam hardcoded aqui — mesmo
// contrato do app legado SCARED/script.js, que é nossa fonte primária.
//
// Geração de PDF: html2canvas + jsPDF (mesma técnica do RAADS-R/EQ-15).
// ============================================================================

(function() {
    'use strict';

    const SIGLAS_VALIDAS = ['SCARED-A', 'SCARED-H'];
    const JANELA_DIAS = 30;

    // ────────────────────────────────────────────────────────────────────
    // NORMAS POR SUBESCALA (Birmaher et al. 1999 / adaptação brasileira)
    // {faixa: {sexo: {fator_codigo: {m, dp}}}}
    // O total já está no banco em instrumentos_normas_estratificadas, mas
    // o JS não precisa consultar lá pois replica os mesmos números aqui.
    // ────────────────────────────────────────────────────────────────────
    const NORMAS = {
        '7-12': {
            'Masculino': {
                TOTAL:     { m: 22.60, dp: 10.45 },
                PANICO:    { m:  4.16, dp:  3.80 },
                GENERALIZ: { m:  7.24, dp:  3.57 },
                SEPARACAO: { m:  4.98, dp:  2.65 },
                SOCIAL:    { m:  4.98, dp:  2.83 },
                ESCOLAR:   { m:  1.24, dp:  1.19 }
            },
            'Feminino': {
                TOTAL:     { m: 26.55, dp: 12.21 },
                PANICO:    { m:  5.36, dp:  4.69 },
                GENERALIZ: { m:  8.03, dp:  3.70 },
                SEPARACAO: { m:  6.03, dp:  3.22 },
                SOCIAL:    { m:  5.74, dp:  2.92 },
                ESCOLAR:   { m:  1.39, dp:  1.30 }
            }
        },
        '13-18': {
            'Masculino': {
                TOTAL:     { m: 19.73, dp: 10.41 },
                PANICO:    { m:  3.29, dp:  3.40 },
                GENERALIZ: { m:  7.51, dp:  3.73 },
                SEPARACAO: { m:  3.55, dp:  2.36 },
                SOCIAL:    { m:  4.43, dp:  2.95 },
                ESCOLAR:   { m:  0.94, dp:  1.14 }
            },
            'Feminino': {
                TOTAL:     { m: 25.69, dp: 12.17 },
                PANICO:    { m:  5.34, dp:  4.58 },
                GENERALIZ: { m:  8.87, dp:  3.78 },
                SEPARACAO: { m:  4.78, dp:  2.86 },
                SOCIAL:    { m:  5.46, dp:  3.20 },
                ESCOLAR:   { m:  1.24, dp:  1.21 }
            }
        }
    };

    // Ordem canônica das subescalas (pra renderização consistente)
    const SUBESCALAS_ORDEM = ['PANICO', 'GENERALIZ', 'SEPARACAO', 'SOCIAL', 'ESCOLAR'];

    const SUB_LABEL = {
        PANICO:    'Pânico / Somático',
        GENERALIZ: 'Ansiedade Generalizada',
        SEPARACAO: 'Ansiedade de Separação',
        SOCIAL:    'Fobia Social',
        ESCOLAR:   'Fobia Escolar',
        TOTAL:     'Score Total'
    };
    const SUB_MAX = {
        PANICO: 26, GENERALIZ: 18, SEPARACAO: 16, SOCIAL: 14, ESCOLAR: 8, TOTAL: 82
    };
    const SUB_CORTE = {
        PANICO: 7, GENERALIZ: 9, SEPARACAO: 5, SOCIAL: 8, ESCOLAR: 3, TOTAL: 25
    };
    const SUB_COR_CSS = {
        PANICO: 'panico', GENERALIZ: 'generaliz', SEPARACAO: 'separacao',
        SOCIAL: 'social', ESCOLAR: 'escolar', TOTAL: 'total'
    };

    const state = {
        aplicacaoId: null,       // o ID que veio na URL
        principal: null,         // dados completos da aplicação principal
        contraparte: null,       // dados da contraparte (se achou) ou null
        paciente: null,
        norma: null,             // norma da principal (suficiente: itens A=H)
        itens: [],               // itens da principal (mesmo conteúdo em A e H)
        faixa: null,             // '7-12' | '13-18' | null se fora
        sexo: null,
        // Layout uniforme: sempre temos auto e hetero no mesmo formato:
        // { sigla, aplicacao, correcao, scores: {PANICO:N, ..., TOTAL:N} }
        autoData: null,
        heteroData: null
    };

    // ============================================================================
    // INICIALIZAÇÃO
    // ============================================================================

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
            renderizar();
        } catch (err) {
            console.error('Erro ao carregar:', err);
            mostrarErro('Erro: ' + (err.message || 'desconhecido'));
        }
    });

    async function carregarTudo() {
        // 1. Aplicação principal (a do aplicacao_id da URL)
        const { data: aplicacao, error: errA } = await window.cortexClient
            .from('aplicacoes_instrumento')
            .select('*')
            .eq('id', state.aplicacaoId)
            .single();
        if (errA) throw new Error('Aplicação: ' + errA.message);

        // 2. Paciente
        const { data: paciente, error: errP } = await window.cortexClient
            .from('pacientes')
            .select('id, nome_completo, sexo, data_nascimento, cpf')
            .eq('id', aplicacao.paciente_id)
            .single();
        if (errP) throw new Error('Paciente: ' + errP.message);
        state.paciente = paciente;
        state.sexo = paciente.sexo;

        // 3. Instrumento principal (descobrir se é Auto ou Hetero)
        const { data: instrumento, error: errI } = await window.cortexClient
            .from('instrumentos_catalogo')
            .select('id, sigla, nome_completo')
            .eq('id', aplicacao.instrumento_id)
            .single();
        if (errI) throw new Error('Instrumento: ' + errI.message);

        if (!SIGLAS_VALIDAS.includes(instrumento.sigla)) {
            throw new Error(`Esperado SCARED-A ou SCARED-H, encontrado ${instrumento.sigla}`);
        }

        const principalSigla = instrumento.sigla;
        const contraparteSigla = principalSigla === 'SCARED-A' ? 'SCARED-H' : 'SCARED-A';

        // 4. Faixa etária a partir da data de aplicação ou nascimento
        const idade = calcularIdade(paciente.data_nascimento, aplicacao.data_aplicacao);
        state.faixa = faixaEtaria(idade);

        // 5. Norma da principal (suficiente: itens são iguais em A e H)
        const { data: norma, error: errN } = await window.cortexClient
            .from('instrumentos_normas')
            .select('*')
            .eq('instrumento_id', instrumento.id)
            .eq('ativa', true)
            .maybeSingle();
        if (errN) throw new Error('Norma: ' + errN.message);
        if (!norma) throw new Error(`Norma ${principalSigla} não cadastrada`);
        state.norma = norma;

        // 6. Itens (pra detalhamento)
        const { data: itens } = await window.cortexClient
            .from('instrumentos_itens')
            .select('numero, texto, reverso, fator_id')
            .eq('norma_id', norma.id)
            .order('numero');
        state.itens = itens || [];

        // 7. Correção da principal
        const correcaoPrincipal = await carregarCorrecao(state.aplicacaoId);

        // 8. Procura contraparte: mesma data_aplicacao ± JANELA_DIAS, mesmo paciente,
        //    sigla oposta, status corrigido.
        const contrapartePack = await procurarContraparte({
            pacienteId: paciente.id,
            instrumentoIdEvitar: instrumento.id,
            siglaProcurar: contraparteSigla,
            dataReferencia: aplicacao.data_aplicacao || aplicacao.created_at,
            janelaDias: JANELA_DIAS
        });

        // 9. Monta autoData e heteroData uniformizados
        const principalPack = {
            sigla: principalSigla,
            aplicacao: aplicacao,
            correcao: correcaoPrincipal,
            scores: extrairScores(correcaoPrincipal)
        };

        if (principalSigla === 'SCARED-A') {
            state.autoData    = principalPack;
            state.heteroData  = contrapartePack;
        } else {
            state.heteroData  = principalPack;
            state.autoData    = contrapartePack;
        }

        await CortexAudit.log('leitura', 'correcoes', correcaoPrincipal.id, {
            detalhes: { aplicacaoId: state.aplicacaoId, sigla: principalSigla }
        });
    }

    async function carregarCorrecao(aplicacaoId) {
        const { data, error } = await window.cortexClient
            .from('correcoes')
            .select('*')
            .eq('aplicacao_id', aplicacaoId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        if (error) throw new Error('Correção: ' + error.message);
        if (!data) throw new Error('Nenhuma correção encontrada para a aplicação ' + aplicacaoId);
        return data;
    }

    async function procurarContraparte({
        pacienteId, instrumentoIdEvitar, siglaProcurar, dataReferencia, janelaDias
    }) {
        // Resolve o ID do instrumento da contraparte
        const { data: instContrap } = await window.cortexClient
            .from('instrumentos_catalogo')
            .select('id, sigla')
            .eq('sigla', siglaProcurar)
            .maybeSingle();
        if (!instContrap) return null;

        // Janela ±janelaDias
        const dataRef = new Date(dataReferencia);
        const dataMin = new Date(dataRef.getTime() - janelaDias * 24 * 60 * 60 * 1000);
        const dataMax = new Date(dataRef.getTime() + janelaDias * 24 * 60 * 60 * 1000);

        const { data: candidatos } = await window.cortexClient
            .from('aplicacoes_instrumento')
            .select('*')
            .eq('paciente_id', pacienteId)
            .eq('instrumento_id', instContrap.id)
            .gte('created_at', dataMin.toISOString())
            .lte('created_at', dataMax.toISOString())
            .order('created_at', { ascending: false });

        if (!candidatos || candidatos.length === 0) return null;

        // Pega a primeira que tem correção corrigida
        for (const cand of candidatos) {
            try {
                const corr = await carregarCorrecao(cand.id);
                if (corr.status === 'corrigido') {
                    return {
                        sigla: siglaProcurar,
                        aplicacao: cand,
                        correcao: corr,
                        scores: extrairScores(corr)
                    };
                }
            } catch (e) {
                continue;
            }
        }

        return null;
    }

    // Extrai um objeto plano { PANICO: 4, GENERALIZ: 7, ..., TOTAL: 22 }
    // a partir do escores_brutos.fatores que a função publico_finalizar grava.
    function extrairScores(correcao) {
        const escoresBrutos = correcao?.escores_brutos || {};
        const fatores = escoresBrutos.fatores || {};
        const scores = {};
        for (const code of [...SUBESCALAS_ORDEM, 'TOTAL']) {
            const dado = fatores[code];
            if (dado && typeof dado.score === 'number') {
                scores[code] = dado.score;
            } else if (code === 'TOTAL' && typeof escoresBrutos.score_total === 'number') {
                scores[code] = escoresBrutos.score_total;
            } else {
                scores[code] = null;
            }
        }
        return scores;
    }

    // ============================================================================
    // FUNÇÕES CLÍNICAS — Z-SCORE / PERCENTIL / CLASSIFICAÇÃO
    // ============================================================================

    function calcularIdade(nascISO, aplISO) {
        if (!nascISO) return null;
        const ref = aplISO ? new Date(aplISO) : new Date();
        const n = new Date(nascISO);
        if (isNaN(n) || isNaN(ref) || ref < n) return null;
        let anos = ref.getFullYear() - n.getFullYear();
        const m = ref.getMonth() - n.getMonth();
        if (m < 0 || (m === 0 && ref.getDate() < n.getDate())) anos--;
        return anos;
    }

    function faixaEtaria(anos) {
        if (anos == null) return null;
        if (anos >= 7 && anos <= 12) return '7-12';
        if (anos >= 13 && anos <= 18) return '13-18';
        return null;
    }

    function calcZScore(valor, media, dp) {
        if (valor == null || dp == null || dp === 0) return null;
        return (valor - media) / dp;
    }

    // CDF normal padrão — Abramowitz & Stegun (mesma usada no app legado)
    function normCDF(z) {
        const t = 1 / (1 + 0.2316419 * Math.abs(z));
        const poly = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
        const pdf = Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
        const p = 1 - pdf * poly;
        return z >= 0 ? p : 1 - p;
    }

    function calcPercentil(z) {
        if (z == null) return null;
        return Math.round(normCDF(z) * 100);
    }

    function getNorma(fatorCodigo) {
        if (!state.faixa || !state.sexo) return null;
        return NORMAS[state.faixa]?.[state.sexo]?.[fatorCodigo] || null;
    }

    function classifica(score, fatorCodigo) {
        if (score == null) return null;
        return score >= SUB_CORTE[fatorCodigo] ? 'Risco Clínico' : 'Não Clínico';
    }

    // ============================================================================
    // RENDERIZAÇÃO
    // ============================================================================

    function renderizar() {
        const cont = document.getElementById('laudo-conteudo');
        cont.innerHTML = renderLaudo();
        document.getElementById('acoes-topo').style.display = 'flex';

        document.getElementById('back-link').href =
            `../../bateria/bateria.html?paciente=${state.paciente.id}`;

        document.getElementById('btn-gerar-pdf').addEventListener('click', gerarPDF);
    }

    function renderLaudo() {
        const idade = calcularIdade(state.paciente.data_nascimento,
                                    state.autoData?.aplicacao?.data_aplicacao
                                    || state.heteroData?.aplicacao?.data_aplicacao);
        const dataAplStr = (state.autoData?.aplicacao?.data_aplicacao
                            || state.heteroData?.aplicacao?.data_aplicacao);
        const dataExtenso = dataAplStr ? formatarDataExtenso(dataAplStr) : '—';
        const nascStr = state.paciente.data_nascimento
            ? formatarDataBR(state.paciente.data_nascimento) : '—';

        const auto = state.autoData;
        const hetero = state.heteroData;
        const temAuto = !!auto;
        const temHetero = !!hetero;
        const temAmbos = temAuto && temHetero;

        const faixaInfo = state.faixa
            ? `${state.faixa} anos${state.sexo ? ' / ' + state.sexo : ''}`
            : '⚠️ Fora da faixa normativa (7–18 anos)';

        // Score total pra mostrar no header (prioriza auto)
        const totalHeader = auto?.scores?.TOTAL ?? hetero?.scores?.TOTAL ?? 0;

        return `
        <div class="laudo">
            <!-- ─── CABEÇALHO ─── -->
            <div class="laudo-header">
                <div class="laudo-header-esq">
                    <div class="laudo-header-logo">E</div>
                    <div class="laudo-header-textos">
                        <div class="laudo-header-supratitulo">Relatório Neuropsicológico</div>
                        <h1 class="laudo-header-titulo">SCARED — Rastreio de Ansiedade</h1>
                        <div class="laudo-header-subtitulo">
                            Screen for Child Anxiety Related Emotional Disorders<br>
                            Birmaher et al. (1999) — adaptação brasileira
                        </div>
                    </div>
                </div>
                <div class="laudo-header-pontuacao">
                    <div class="laudo-header-pontuacao-label">Total (auto)</div>
                    <div class="laudo-header-pontuacao-valor">${auto?.scores?.TOTAL ?? '—'}</div>
                    <div class="laudo-header-pontuacao-max">de 82 pontos</div>
                </div>
            </div>

            <div class="laudo-body">

                <!-- ① Identificação -->
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
                        <span class="laudo-identif-label">Sexo:</span>
                        <span class="laudo-identif-valor">${escapeHtml(state.paciente.sexo || '—')}</span>
                    </div>
                    <div class="laudo-identif-item">
                        <span class="laudo-identif-label">Nascimento:</span>
                        <span class="laudo-identif-valor">${nascStr}${idade !== null ? ` (${idade} anos)` : ''}</span>
                    </div>
                    <div class="laudo-identif-item">
                        <span class="laudo-identif-label">Avaliação:</span>
                        <span class="laudo-identif-valor">${dataExtenso}</span>
                    </div>
                    <div class="laudo-identif-item">
                        <span class="laudo-identif-label">Faixa normativa:</span>
                        <span class="laudo-identif-valor">${faixaInfo}</span>
                    </div>
                    <div class="laudo-identif-item">
                        <span class="laudo-identif-label">Modalidade:</span>
                        <span class="laudo-identif-valor">Online (link)</span>
                    </div>
                </div>

                <!-- ② Sobre o Instrumento -->
                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">2</span>
                    Sobre o Instrumento
                </div>
                <div class="laudo-caixa-descricao">
                    <p>O <strong>SCARED</strong> (Screen for Child Anxiety Related Emotional Disorders) é uma escala de rastreio de sintomas ansiosos em crianças e adolescentes (7–18 anos), desenvolvida por Birmaher et al. (1999) e validada para o contexto brasileiro. Possui 41 itens organizados em 5 subescalas: <strong>Pânico/Somático</strong>, <strong>Ansiedade Generalizada</strong>, <strong>Ansiedade de Separação</strong>, <strong>Fobia Social</strong> e <strong>Fobia Escolar</strong>.</p>
                    <p>Cada item é respondido em escala de 0 a 2 (0=Nunca/quase nunca, 1=Às vezes, 2=Frequentemente/quase sempre). Existem duas versões com mesmo conteúdo: <strong>autorrelato</strong> (a própria criança/adolescente responde) e <strong>heteroaplicação</strong> (pais ou responsáveis respondem). O instrumento possui função exclusivamente de rastreio e não substitui avaliação diagnóstica.</p>
                </div>

                ${temAmbos ? '' : renderAvisoContraparte(temAuto, temHetero)}

                <!-- ③ Resultados Obtidos -->
                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">3</span>
                    Resultados Obtidos
                </div>

                <!-- Cards de TOTAL -->
                ${renderCardsTotais(auto, hetero)}

                <!-- Barras das subescalas (auto + hetero lado a lado) -->
                ${renderSubescalas(auto, hetero)}

                <!-- Tabela de z-scores (auto) -->
                ${temAuto ? renderTabelaZ(auto, '👦 Autorrelato (criança/adolescente)') : ''}

                <!-- Tabela de z-scores (hetero) -->
                ${temHetero ? renderTabelaZ(hetero, '👨‍👩 Heterorelato (pais/responsável)') : ''}

                <!-- Comparativo auto × hetero -->
                ${temAmbos ? renderComparativo(auto, hetero) : ''}

                <!-- ④ Interpretação -->
                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">4</span>
                    Interpretação
                </div>
                <div class="laudo-caixa-descricao">
                    ${montarInterpretacao(auto, hetero)}
                </div>

                ${renderDetalhes(auto, hetero)}

            </div>

            <!-- ─── RODAPÉ ─── -->
            <div class="laudo-rodape">
                <div class="laudo-rodape-esq">
                    <div class="laudo-rodape-org">Equilibrium Neuropsicologia</div>
                    <div class="laudo-rodape-tipo">Correção automatizada — SCARED (Auto + Hetero)</div>
                </div>
                <div class="laudo-rodape-dir">
                    <div class="laudo-rodape-data">Documento gerado em ${formatarDataBR(new Date().toISOString())}</div>
                    <div class="laudo-rodape-confidencial">Este documento é confidencial e destinado exclusivamente ao profissional solicitante.</div>
                </div>
            </div>
        </div>
        `;
    }

    function renderAvisoContraparte(temAuto, temHetero) {
        const presente = temAuto ? 'autorrelato' : 'heterorelato';
        const ausente  = temAuto ? 'heterorelato (pais/responsável)' : 'autorrelato (criança/adolescente)';
        return `
            <div class="scared-aviso-contraparte">
                <strong>⚠ Laudo parcial:</strong> apenas o ${presente} foi respondido até o momento.
                Quando o ${ausente} também for finalizado (em até ${JANELA_DIAS} dias da
                aplicação atual), esta tela passará a exibir o comparativo completo automaticamente.
            </div>
        `;
    }

    function renderCardsTotais(auto, hetero) {
        const card = (data, titulo) => {
            if (!data) {
                return `
                    <div class="scared-card-total scared-card-total-vazio">
                        <div class="scared-card-total-titulo">${titulo}</div>
                        <div style="font-size:13px">Não respondido</div>
                    </div>`;
            }
            const total = data.scores.TOTAL;
            const rc = total != null && total >= 25;
            const klass = rc ? 'scared-card-total-clin' : 'scared-card-total-naoClin';
            const status = rc ? '🔴 Risco Clínico' : '✅ Não Clínico';

            // Z-score do total
            const norma = getNorma('TOTAL');
            const z = norma ? calcZScore(total, norma.m, norma.dp) : null;
            const pct = calcPercentil(z);
            const zStr = (z != null && pct != null)
                ? `Z = ${z.toFixed(2)} · percentil ${pct}` : '';

            return `
                <div class="scared-card-total ${klass}">
                    <div class="scared-card-total-titulo">${titulo}</div>
                    <div class="scared-card-total-corpo">
                        <span class="scared-card-total-valor">${total ?? '—'}</span>
                        <span class="scared-card-total-max">de 82 (corte ≥25)</span>
                    </div>
                    <div class="scared-card-total-status">${status}</div>
                    ${zStr ? `<div class="scared-card-total-zinfo">${zStr}</div>` : ''}
                </div>
            `;
        };

        const temAmbos = !!auto && !!hetero;
        const klassWrap = temAmbos ? '' : 'solo';
        return `
            <div class="scared-totais ${klassWrap}">
                ${auto    ? card(auto,   'Autorrelato (criança)')   : (hetero ? '' : card(null, 'Autorrelato (criança)'))}
                ${hetero  ? card(hetero, 'Heterorelato (pais)')      : (auto   ? '' : card(null, 'Heterorelato (pais)'))}
            </div>
        `;
    }

    function renderSubescalas(auto, hetero) {
        const linhasSub = SUBESCALAS_ORDEM.map(code => {
            const max = SUB_MAX[code];
            const corte = SUB_CORTE[code];
            const slug = SUB_COR_CSS[code];
            const pctCorte = (corte / max) * 100;

            const linha = (data, letra) => {
                if (!data) return '';
                const val = data.scores[code];
                if (val == null) {
                    return `<div class="scared-sub-linha">
                        <span class="scared-sub-letra">${letra}</span>
                        <div class="scared-sub-trilho">
                            <div class="scared-sub-fill scared-sub-fill-vazio"></div>
                            <div class="scared-sub-cutoff" style="left: ${pctCorte}%;"></div>
                        </div>
                        <span class="scared-sub-valor">—</span>
                        <span class="scared-sub-status"></span>
                    </div>`;
                }
                const pct = Math.min((val / max) * 100, 100);
                const rc = val >= corte;
                const fillClass = rc ? 'scared-sub-fill-clin' : `scared-sub-fill-${slug}`;
                return `<div class="scared-sub-linha">
                    <span class="scared-sub-letra">${letra}</span>
                    <div class="scared-sub-trilho">
                        <div class="scared-sub-fill ${fillClass}" style="width: ${pct}%;"></div>
                        <div class="scared-sub-cutoff" style="left: ${pctCorte}%;"></div>
                    </div>
                    <span class="scared-sub-valor">${val}</span>
                    <span class="scared-sub-status">${rc ? '🔴' : '✅'}</span>
                </div>`;
            };

            return `
                <div class="scared-sub-bloco">
                    <div class="scared-sub-header">
                        ${SUB_LABEL[code]}
                        <span class="scared-sub-header-ref">(corte ≥${corte}, max ${max})</span>
                    </div>
                    ${linha(auto,   'C')}
                    ${linha(hetero, 'P')}
                </div>
            `;
        }).join('');

        // Bloco TOTAL
        const corteT = SUB_CORTE.TOTAL, maxT = SUB_MAX.TOTAL;
        const pctCorteT = (corteT / maxT) * 100;
        const linhaTotal = (data, letra) => {
            if (!data) return '';
            const val = data.scores.TOTAL;
            if (val == null) return '';
            const pct = Math.min((val / maxT) * 100, 100);
            const rc = val >= corteT;
            const fillClass = rc ? 'scared-sub-fill-clin' : 'scared-sub-fill-total';
            return `<div class="scared-sub-linha">
                <span class="scared-sub-letra" style="color:#1e40af">${letra}</span>
                <div class="scared-sub-trilho" style="height:22px">
                    <div class="scared-sub-fill ${fillClass}" style="width: ${pct}%;"></div>
                    <div class="scared-sub-cutoff" style="left: ${pctCorteT}%;"></div>
                </div>
                <span class="scared-sub-valor" style="font-size:14px">${val}</span>
                <span class="scared-sub-status">${rc ? '🔴' : '✅'}</span>
            </div>`;
        };

        return `
            <div class="scared-subs">
                <div class="scared-subs-titulo">Pontuação por subescala (C = autorrelato · P = heterorelato)</div>
                ${linhasSub}
                <div class="scared-sub-bloco" style="border-top:1px solid #e2e8f0;padding-top:10px;margin-top:10px">
                    <div class="scared-sub-header" style="color:#1e40af">
                        PONTUAÇÃO TOTAL
                        <span class="scared-sub-header-ref">(corte ≥${corteT}, max ${maxT})</span>
                    </div>
                    ${linhaTotal(auto,   'C')}
                    ${linhaTotal(hetero, 'P')}
                </div>
            </div>
        `;
    }

    function renderTabelaZ(data, titulo) {
        if (!data) return '';

        const linhaSub = (code) => {
            const score = data.scores[code];
            const norma = getNorma(code);
            const z = norma ? calcZScore(score, norma.m, norma.dp) : null;
            const pct = calcPercentil(z);
            const classif = classifica(score, code);
            const badgeClass = classif === 'Risco Clínico' ? 'scared-badge-clin' : 'scared-badge-naoclin';
            const badgeIcon = classif === 'Risco Clínico' ? '🔴' : '✅';

            return `<tr>
                <td><strong>${SUB_LABEL[code]}</strong></td>
                <td class="ctr"><strong>${score ?? '—'}</strong></td>
                <td class="ctr">${z != null ? z.toFixed(2) : '—'}</td>
                <td class="ctr">${pct != null ? pct + '%' : '—'}</td>
                <td>${score != null ? `<span class="scared-badge ${badgeClass}">${badgeIcon} ${classif}</span>` : '—'}</td>
            </tr>`;
        };

        const linhaTotal = () => {
            const score = data.scores.TOTAL;
            const norma = getNorma('TOTAL');
            const z = norma ? calcZScore(score, norma.m, norma.dp) : null;
            const pct = calcPercentil(z);
            const classif = classifica(score, 'TOTAL');
            const badgeClass = classif === 'Risco Clínico' ? 'scared-badge-clin' : 'scared-badge-naoclin';
            const badgeIcon = classif === 'Risco Clínico' ? '🔴' : '✅';

            return `<tr class="linha-total">
                <td>SCORE TOTAL</td>
                <td class="ctr">${score ?? '—'}</td>
                <td class="ctr">${z != null ? z.toFixed(2) : '—'}</td>
                <td class="ctr">${pct != null ? pct + '%' : '—'}</td>
                <td>${score != null ? `<span class="scared-badge ${badgeClass}">${badgeIcon} ${classif}</span>` : '—'}</td>
            </tr>`;
        };

        return `
            <div class="scared-tab-z">
                <div class="scared-tab-z-titulo">${titulo}</div>
                <table>
                    <thead>
                        <tr>
                            <th>Subescala</th>
                            <th class="ctr">Pontos</th>
                            <th class="ctr">Z-Score</th>
                            <th class="ctr">Percentil</th>
                            <th>Classificação</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${SUBESCALAS_ORDEM.map(linhaSub).join('')}
                        ${linhaTotal()}
                    </tbody>
                </table>
            </div>
        `;
    }

    function renderComparativo(auto, hetero) {
        const linha = (code) => {
            const a = auto.scores[code];
            const h = hetero.scores[code];
            if (a == null || h == null) return '';
            const diff = Math.abs(a - h);
            let klass, descr;
            if (diff <= 1)        { klass = 'diff-concordante'; descr = 'Concordante'; }
            else if (diff <= 3)   { klass = 'diff-moderada';    descr = 'Discrepância moderada'; }
            else                   { klass = 'diff-importante';  descr = 'Discrepância importante'; }
            return `<tr>
                <td><strong>${SUB_LABEL[code]}</strong></td>
                <td class="ctr">${a}</td>
                <td class="ctr">${h}</td>
                <td class="ctr"><span class="${klass}">${diff}</span></td>
                <td><span class="${klass}">${descr}</span></td>
            </tr>`;
        };

        return `
            <div class="scared-comp">
                <div class="scared-comp-titulo">📊 Comparativo Auto × Hetero</div>
                <table>
                    <thead>
                        <tr>
                            <th>Subescala</th>
                            <th class="ctr">Auto</th>
                            <th class="ctr">Hetero</th>
                            <th class="ctr">Δ</th>
                            <th>Concordância</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${[...SUBESCALAS_ORDEM, 'TOTAL'].map(linha).join('')}
                    </tbody>
                </table>
                <div class="scared-comp-legenda">
                    <span class="diff-concordante">● Δ ≤ 1: concordância</span>
                    <span class="diff-moderada">● Δ 2–3: discrepância moderada</span>
                    <span class="diff-importante">● Δ ≥ 4: discrepância importante</span>
                </div>
            </div>
        `;
    }

    function montarInterpretacao(auto, hetero) {
        const primeiro = state.paciente.nome_completo.split(' ')[0] || state.paciente.nome_completo;

        let txt = `<p>O SCARED foi aplicado como instrumento de rastreio de sintomas ansiosos. `;

        if (auto && auto.scores.TOTAL != null) {
            const total = auto.scores.TOTAL;
            const rc = total >= 25;
            const norma = getNorma('TOTAL');
            const z = norma ? calcZScore(total, norma.m, norma.dp) : null;
            const pct = calcPercentil(z);
            const zStr = z != null ? ` (Z = ${z.toFixed(2)}; percentil ${pct}, norma ${state.faixa} anos, ${state.sexo})` : '';

            txt += `No autorrelato, ${primeiro} obteve pontuação total de <strong>${total}</strong> pontos${zStr}. `;
            txt += rc
                ? `Esse escore <strong>supera o ponto de corte clínico (≥25)</strong>, indicando rastreio positivo para transtorno de ansiedade, o que requer investigação diagnóstica complementar. `
                : `Esse escore está <strong>abaixo do ponto de corte clínico (≥25)</strong>, não configurando rastreio positivo no autorrelato. `;

            const subRC = SUBESCALAS_ORDEM.filter(c => auto.scores[c] != null && auto.scores[c] >= SUB_CORTE[c]);
            if (subRC.length > 0) {
                txt += `As subescalas com pontuação acima do corte foram: ${subRC.map(c => `${SUB_LABEL[c]} (${auto.scores[c]} pts; corte ≥${SUB_CORTE[c]})`).join(', ')}. `;
            } else {
                txt += `Nenhuma subescala atingiu o ponto de corte no autorrelato. `;
            }
        }

        txt += `</p>`;

        if (hetero && hetero.scores.TOTAL != null) {
            const total = hetero.scores.TOTAL;
            const rc = total >= 25;
            txt += `<p>No heterorelato (pais/responsável), a pontuação total foi de <strong>${total}</strong> pontos. `;
            txt += rc
                ? `Esse escore supera o ponto de corte (≥25)${auto ? ', convergindo com os dados do autorrelato' : ''}. `
                : `Esse escore está abaixo do ponto de corte (≥25). `;

            const subRC = SUBESCALAS_ORDEM.filter(c => hetero.scores[c] != null && hetero.scores[c] >= SUB_CORTE[c]);
            if (subRC.length > 0) {
                txt += `Subescalas no risco clínico: ${subRC.map(c => `${SUB_LABEL[c]} (${hetero.scores[c]} pts)`).join(', ')}. `;
            }
            txt += `</p>`;

            // Divergências
            if (auto) {
                const divs = SUBESCALAS_ORDEM.filter(c =>
                    auto.scores[c] != null && hetero.scores[c] != null
                    && Math.abs(auto.scores[c] - hetero.scores[c]) >= 4
                );
                if (divs.length > 0) {
                    txt += `<p><strong>Atenção:</strong> divergência expressiva (≥4 pontos) entre auto e heterorelato nas subescalas: ${divs.map(c => SUB_LABEL[c]).join(', ')}, o que pode refletir diferenças de percepção entre o avaliado e seus responsáveis, merecendo investigação clínica aprofundada.</p>`;
                }
            }
        }

        txt += `<p>Os resultados do SCARED devem ser interpretados de forma integrada com os demais dados clínicos, histórico de desenvolvimento, observações comportamentais e outros instrumentos aplicados. O instrumento possui função exclusivamente de rastreio, não sendo suficiente para estabelecer diagnóstico por si só.</p>`;

        return txt;
    }

    function renderDetalhes(auto, hetero) {
        if (!state.itens.length) return '';

        const subDoFator = {};  // fator_id → codigo (PANICO, GENERALIZ, etc)
        // Como o item tem fator_id mas o JS não tem o map fator_id→codigo carregado,
        // identifico o código pelo número do item usando os mesmos mapeamentos do app legado:
        const numeroParaCodigo = {
            1:'PANICO',2:'ESCOLAR',3:'SOCIAL',4:'SEPARACAO',5:'GENERALIZ',6:'PANICO',7:'GENERALIZ',
            8:'SEPARACAO',9:'SOCIAL',10:'PANICO',11:'SOCIAL',12:'ESCOLAR',13:'PANICO',14:'SEPARACAO',
            15:'GENERALIZ',16:'PANICO',17:'SEPARACAO',18:'ESCOLAR',19:'PANICO',20:'PANICO',
            21:'SEPARACAO',22:'GENERALIZ',23:'PANICO',24:'GENERALIZ',25:'PANICO',26:'SEPARACAO',
            27:'SOCIAL',28:'GENERALIZ',29:'SEPARACAO',30:'PANICO',31:'PANICO',32:'SEPARACAO',
            33:'SOCIAL',34:'GENERALIZ',35:'PANICO',36:'GENERALIZ',37:'ESCOLAR',38:'GENERALIZ',
            39:'PANICO',40:'SOCIAL',41:'SOCIAL'
        };

        const labels = state.norma?.answer_labels || ["Nunca/quase nunca","Às vezes","Frequentemente"];

        const respostasAuto = auto?.correcao?.escores_brutos?.respostas || {};
        const respostasHetero = hetero?.correcao?.escores_brutos?.respostas || {};

        const linhas = state.itens.map(item => {
            const codigo = numeroParaCodigo[item.numero] || '—';
            const subLabel = SUB_LABEL[codigo] || '';
            const va = respostasAuto[item.numero];
            const vh = respostasHetero[item.numero];
            const labelA = (va !== undefined && labels[va] !== undefined) ? labels[va] : '—';
            const labelH = (vh !== undefined && labels[vh] !== undefined) ? labels[vh] : '—';

            return `<tr>
                <td style="text-align:center;font-weight:700;color:#1e40af;">${item.numero}</td>
                <td>${escapeHtml(item.texto)}</td>
                <td style="font-size:10px;color:#64748b;">${subLabel}</td>
                <td style="text-align:center;">${auto ? `${labelA} (${va ?? '—'})` : '—'}</td>
                <td style="text-align:center;">${hetero ? `${labelH} (${vh ?? '—'})` : '—'}</td>
            </tr>`;
        }).join('');

        return `
            <details class="laudo-detalhes-toggle">
                <summary>▾ Ver respostas item a item (${state.itens.length} itens)</summary>
                <table class="laudo-detalhes-tabela">
                    <thead>
                        <tr>
                            <th style="width:40px;text-align:center;">Nº</th>
                            <th>Item</th>
                            <th>Subescala</th>
                            <th style="text-align:center;width:160px;">Auto (C)</th>
                            <th style="text-align:center;width:160px;">Hetero (P)</th>
                        </tr>
                    </thead>
                    <tbody>${linhas}</tbody>
                </table>
            </details>
        `;
    }

    // ============================================================================
    // PDF (mesma técnica do RAADS-R/EQ-15)
    // ============================================================================

    async function gerarPDF() {
        const btn = document.getElementById('btn-gerar-pdf');
        const textoOriginal = btn.textContent;
        btn.disabled = true;
        btn.textContent = '⏳ Gerando PDF...';

        try {
            document.body.classList.add('exportando');
            await new Promise(r => setTimeout(r, 100));

            const laudo = document.querySelector('.laudo');
            if (!laudo) throw new Error('Laudo não encontrado');

            const canvas = await html2canvas(laudo, {
                scale: 2,
                backgroundColor: '#ffffff',
                useCORS: true,
                logging: false
            });

            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

            const pdfWidth = 210, pdfHeight = 297;
            const imgWidth = pdfWidth;
            const imgHeight = (canvas.height * pdfWidth) / canvas.width;

            if (imgHeight <= pdfHeight) {
                pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, imgWidth, imgHeight);
            } else {
                let posY = 0, restante = imgHeight;
                while (restante > 0) {
                    pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, -posY, imgWidth, imgHeight);
                    restante -= pdfHeight;
                    posY += pdfHeight;
                    if (restante > 0) pdf.addPage();
                }
            }

            const nomeAbreviado = state.paciente.nome_completo.toUpperCase()
                .replace(/[^A-Z\s]/g, '').trim().substring(0, 50);
            const totalAuto = state.autoData?.scores?.TOTAL ?? '0';
            const dataStr = formatarDataArquivo(new Date());
            const nomeArquivo = `SCARED - ${nomeAbreviado}_${dataStr}_${totalAuto}pts.pdf`;

            pdf.save(nomeArquivo);
            window.CortexUI.toast('PDF gerado com sucesso', 'success');
        } catch (err) {
            console.error('Erro ao gerar PDF:', err);
            window.CortexUI.toast('Erro ao gerar PDF: ' + err.message, 'danger');
        } finally {
            document.body.classList.remove('exportando');
            btn.disabled = false;
            btn.textContent = textoOriginal;
        }
    }

    // ============================================================================
    // UTILS
    // ============================================================================

    function formatarDataBR(iso) {
        if (!iso) return '—';
        const d = iso.includes('T') ? new Date(iso) : new Date(iso + 'T00:00:00');
        return d.toLocaleDateString('pt-BR');
    }

    function formatarDataExtenso(iso) {
        if (!iso) return '—';
        const d = iso.includes('T') ? new Date(iso) : new Date(iso + 'T00:00:00');
        const meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
                       'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
        return `${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;
    }

    function formatarDataArquivo(d) {
        const ano = d.getFullYear();
        const mes = String(d.getMonth() + 1).padStart(2, '0');
        const dia = String(d.getDate()).padStart(2, '0');
        return `${ano}-${mes}-${dia}`;
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
        if (text === null || text === undefined) return '';
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }
})();

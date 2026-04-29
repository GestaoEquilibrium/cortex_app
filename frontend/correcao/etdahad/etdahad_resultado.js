// ============================================================================
// CORTEX_APP — Resultado ETDAH-AD (laudo)
// ============================================================================
// URL: ?aplicacao_id=<uuid>
//
// Reproduz o layout do PDF modelo (versão brasileira validada, app legado):
//   ① Identificação (com Sexo + Escolaridade)
//   ② Escores por Fator (tabela)
//   ③ Perfil Gráfico dos Fatores (barras horizontais Chart.js)
//   ④ Resultados e Análise (5 cards com texto clínico automático)
//   ⑤ Nota Técnica
//
// DECISÃO ARQUITETURAL B (registrada na conversa):
// O banco grava só os escores BRUTOS por fator. Aqui no JS:
//   - Faz lookup de percentil a partir das tabelas NORMAS hardcoded
//     (replicadas literalmente do etdah_rules.json — fonte primária)
//   - Estratifica por escolaridade (3 estratos: Fundamental/Médio/Superior)
//   - Classifica em 5 faixas: Inferior/Médio Inferior/Médio/Médio Superior/Superior
//   - Renderiza textos clínicos automáticos por fator + classificação (15 textos)
//
// AAMA é renderizado com mesmo esquema visual dos demais (sua decisão Q3).
// A nota técnica final explica que AAMA tem interpretação INVERSA:
//   percentil alto AAMA = melhor autocontrole (oposto dos outros 4 fatores).
//
// PDF: html2canvas + jsPDF, mesma técnica dos outros laudos.
// ============================================================================

(function() {
    'use strict';

    const SIGLA_ESPERADA = 'ETDAH-AD';

    const FATORES_ORDEM = ['DESATENCAO', 'HIPERATI', 'IMPULSIV', 'ASPECTOS', 'AAMA'];

    // Mapeamento código_banco → label legível e nome usado nas NORMAS do JSON
    const FATOR_INFO = {
        DESATENCAO: { label: 'Desatenção',          chave_norma: 'Desatenção',          slug: 'desatencao', cor: '#2563eb' },
        HIPERATI:   { label: 'Hiperatividade',       chave_norma: 'Hiperatividade',      slug: 'hiperati',   cor: '#dc2626' },
        IMPULSIV:   { label: 'Impulsividade',        chave_norma: 'Impulsividade',       slug: 'impulsiv',   cor: '#d97706' },
        ASPECTOS:   { label: 'Aspectos Emocionais',  chave_norma: 'Aspectos Emocionais', slug: 'aspectos',   cor: '#7c3aed' },
        AAMA:       { label: 'AAMA',                 chave_norma: 'AAMA',                slug: 'aama',       cor: '#059669' }
    };

    // Total de itens por fator (do questionario.html)
    const N_ITENS_FATOR = {
        DESATENCAO: 23, HIPERATI: 7, IMPULSIV: 23, ASPECTOS: 4, AAMA: 12
    };

    // ============================================================================
    // NORMAS POR ESCOLARIDADE (literalmente copiado do etdah_rules.json)
    // Estrutura: NORMAS[escolaridade][fator] = [[percentil, escore_bruto_minimo], ...]
    // ============================================================================
    const NORMAS = {
    "Ensino Fundamental": {
        "Desatenção": [
            [
                1,
                6
            ],
            [
                5,
                16
            ],
            [
                10,
                21
            ],
            [
                15,
                23
            ],
            [
                20,
                26
            ],
            [
                25,
                30
            ],
            [
                30,
                32
            ],
            [
                35,
                34
            ],
            [
                40,
                37
            ],
            [
                45,
                39
            ],
            [
                50,
                42
            ],
            [
                55,
                43
            ],
            [
                60,
                45
            ],
            [
                65,
                47
            ],
            [
                70,
                49
            ],
            [
                75,
                54
            ],
            [
                80,
                59
            ],
            [
                85,
                63
            ],
            [
                90,
                68
            ],
            [
                95,
                70
            ]
        ],
        "Impulsividade": [
            [
                1,
                8
            ],
            [
                5,
                15
            ],
            [
                10,
                21
            ],
            [
                15,
                26
            ],
            [
                20,
                28
            ],
            [
                25,
                31
            ],
            [
                30,
                33
            ],
            [
                35,
                35
            ],
            [
                40,
                37
            ],
            [
                45,
                39
            ],
            [
                50,
                42
            ],
            [
                55,
                44
            ],
            [
                60,
                49
            ],
            [
                65,
                51
            ],
            [
                70,
                52
            ],
            [
                75,
                54
            ],
            [
                80,
                58
            ],
            [
                85,
                64
            ],
            [
                90,
                71
            ],
            [
                95,
                82
            ]
        ],
        "Hiperatividade": [
            [
                1,
                2
            ],
            [
                5,
                6
            ],
            [
                10,
                null
            ],
            [
                15,
                8
            ],
            [
                20,
                10
            ],
            [
                25,
                12
            ],
            [
                30,
                13
            ],
            [
                35,
                14
            ],
            [
                40,
                15
            ],
            [
                45,
                16
            ],
            [
                50,
                17
            ],
            [
                55,
                18
            ],
            [
                60,
                null
            ],
            [
                65,
                null
            ],
            [
                70,
                null
            ],
            [
                75,
                18
            ],
            [
                80,
                null
            ],
            [
                85,
                20
            ],
            [
                90,
                21
            ],
            [
                95,
                22
            ]
        ],
        "Aspectos Emocionais": [
            [
                1,
                null
            ],
            [
                5,
                null
            ],
            [
                10,
                null
            ],
            [
                15,
                null
            ],
            [
                20,
                2
            ],
            [
                25,
                null
            ],
            [
                30,
                3
            ],
            [
                35,
                null
            ],
            [
                40,
                4
            ],
            [
                45,
                null
            ],
            [
                50,
                5
            ],
            [
                55,
                6
            ],
            [
                60,
                null
            ],
            [
                65,
                6
            ],
            [
                70,
                null
            ],
            [
                75,
                7
            ],
            [
                80,
                8
            ],
            [
                85,
                10
            ],
            [
                90,
                12
            ],
            [
                95,
                15
            ]
        ],
        "AAMA": [
            [
                1,
                2
            ],
            [
                5,
                8
            ],
            [
                10,
                12
            ],
            [
                15,
                13
            ],
            [
                20,
                14
            ],
            [
                25,
                16
            ],
            [
                30,
                17
            ],
            [
                35,
                18
            ],
            [
                40,
                19
            ],
            [
                45,
                21
            ],
            [
                50,
                22
            ],
            [
                55,
                23
            ],
            [
                60,
                23
            ],
            [
                65,
                24
            ],
            [
                70,
                25
            ],
            [
                75,
                25
            ],
            [
                80,
                27
            ],
            [
                85,
                28
            ],
            [
                90,
                31
            ],
            [
                95,
                36
            ]
        ]
    },
    "Ensino Médio": {
        "Desatenção": [
            [
                1,
                6
            ],
            [
                5,
                13
            ],
            [
                10,
                17
            ],
            [
                15,
                19
            ],
            [
                20,
                22
            ],
            [
                25,
                24
            ],
            [
                30,
                27
            ],
            [
                35,
                29
            ],
            [
                40,
                31
            ],
            [
                45,
                34
            ],
            [
                50,
                37
            ],
            [
                55,
                39
            ],
            [
                60,
                41
            ],
            [
                65,
                43
            ],
            [
                70,
                44
            ],
            [
                75,
                46
            ],
            [
                80,
                49
            ],
            [
                85,
                54
            ],
            [
                90,
                57
            ],
            [
                95,
                67
            ],
            [
                99,
                79
            ]
        ],
        "Impulsividade": [
            [
                1,
                8
            ],
            [
                5,
                16
            ],
            [
                10,
                19
            ],
            [
                15,
                23
            ],
            [
                20,
                25
            ],
            [
                25,
                27
            ],
            [
                30,
                29
            ],
            [
                35,
                32
            ],
            [
                40,
                34
            ],
            [
                45,
                36
            ],
            [
                50,
                40
            ],
            [
                55,
                42
            ],
            [
                60,
                45
            ],
            [
                65,
                47
            ],
            [
                70,
                51
            ],
            [
                75,
                52
            ],
            [
                80,
                54
            ],
            [
                85,
                57
            ],
            [
                90,
                61
            ],
            [
                95,
                70
            ],
            [
                99,
                91
            ]
        ],
        "Hiperatividade": [
            [
                1,
                3
            ],
            [
                5,
                6
            ],
            [
                10,
                8
            ],
            [
                15,
                9
            ],
            [
                20,
                null
            ],
            [
                25,
                10
            ],
            [
                30,
                11
            ],
            [
                35,
                12
            ],
            [
                40,
                13
            ],
            [
                45,
                14
            ],
            [
                50,
                15
            ],
            [
                55,
                16
            ],
            [
                60,
                17
            ],
            [
                65,
                null
            ],
            [
                70,
                null
            ],
            [
                75,
                18
            ],
            [
                80,
                18
            ],
            [
                85,
                19
            ],
            [
                90,
                21
            ],
            [
                95,
                23
            ],
            [
                99,
                29
            ]
        ],
        "Aspectos Emocionais": [
            [
                1,
                null
            ],
            [
                5,
                1
            ],
            [
                10,
                2
            ],
            [
                15,
                null
            ],
            [
                20,
                null
            ],
            [
                25,
                3
            ],
            [
                30,
                null
            ],
            [
                35,
                4
            ],
            [
                40,
                null
            ],
            [
                45,
                4
            ],
            [
                50,
                5
            ],
            [
                55,
                6
            ],
            [
                60,
                6
            ],
            [
                65,
                7
            ],
            [
                70,
                7
            ],
            [
                75,
                8
            ],
            [
                80,
                9
            ],
            [
                85,
                10
            ],
            [
                90,
                11
            ],
            [
                95,
                13
            ],
            [
                99,
                16
            ]
        ],
        "AAMA": [
            [
                1,
                4
            ],
            [
                5,
                7
            ],
            [
                10,
                9
            ],
            [
                15,
                11
            ],
            [
                20,
                13
            ],
            [
                25,
                14
            ],
            [
                30,
                15
            ],
            [
                35,
                16
            ],
            [
                40,
                17
            ],
            [
                45,
                18
            ],
            [
                50,
                19
            ],
            [
                55,
                20
            ],
            [
                60,
                21
            ],
            [
                65,
                22
            ],
            [
                70,
                23
            ],
            [
                75,
                24
            ],
            [
                80,
                24
            ],
            [
                85,
                26
            ],
            [
                90,
                28
            ],
            [
                95,
                32
            ],
            [
                99,
                43
            ]
        ]
    },
    "Ensino Superior": {
        "Desatenção": [
            [
                1,
                7
            ],
            [
                5,
                11
            ],
            [
                10,
                16
            ],
            [
                15,
                19
            ],
            [
                20,
                21
            ],
            [
                25,
                23
            ],
            [
                30,
                25
            ],
            [
                35,
                27
            ],
            [
                40,
                29
            ],
            [
                45,
                31
            ],
            [
                50,
                34
            ],
            [
                55,
                36
            ],
            [
                60,
                38
            ],
            [
                65,
                40
            ],
            [
                70,
                42
            ],
            [
                75,
                44
            ],
            [
                80,
                46
            ],
            [
                85,
                50
            ],
            [
                90,
                54
            ],
            [
                95,
                62
            ],
            [
                99,
                72
            ]
        ],
        "Impulsividade": [
            [
                1,
                10
            ],
            [
                5,
                15
            ],
            [
                10,
                19
            ],
            [
                15,
                21
            ],
            [
                20,
                24
            ],
            [
                25,
                26
            ],
            [
                30,
                27
            ],
            [
                35,
                29
            ],
            [
                40,
                31
            ],
            [
                45,
                34
            ],
            [
                50,
                36
            ],
            [
                55,
                39
            ],
            [
                60,
                41
            ],
            [
                65,
                43
            ],
            [
                70,
                45
            ],
            [
                75,
                47
            ],
            [
                80,
                48
            ],
            [
                85,
                52
            ],
            [
                90,
                56
            ],
            [
                95,
                60
            ],
            [
                99,
                78
            ]
        ],
        "Hiperatividade": [
            [
                1,
                4
            ],
            [
                5,
                6
            ],
            [
                10,
                7
            ],
            [
                15,
                9
            ],
            [
                20,
                null
            ],
            [
                25,
                10
            ],
            [
                30,
                11
            ],
            [
                35,
                12
            ],
            [
                40,
                13
            ],
            [
                45,
                14
            ],
            [
                50,
                15
            ],
            [
                55,
                16
            ],
            [
                60,
                17
            ],
            [
                65,
                null
            ],
            [
                70,
                null
            ],
            [
                75,
                18
            ],
            [
                80,
                18
            ],
            [
                85,
                19
            ],
            [
                90,
                21
            ],
            [
                95,
                23
            ],
            [
                99,
                29
            ]
        ],
        "Aspectos Emocionais": [
            [
                1,
                null
            ],
            [
                5,
                null
            ],
            [
                10,
                2
            ],
            [
                15,
                null
            ],
            [
                20,
                null
            ],
            [
                25,
                3
            ],
            [
                30,
                null
            ],
            [
                35,
                3
            ],
            [
                40,
                null
            ],
            [
                45,
                4
            ],
            [
                50,
                5
            ],
            [
                55,
                5
            ],
            [
                60,
                6
            ],
            [
                65,
                6
            ],
            [
                70,
                7
            ],
            [
                75,
                7
            ],
            [
                80,
                null
            ],
            [
                85,
                9
            ],
            [
                90,
                11
            ],
            [
                95,
                13
            ],
            [
                99,
                17
            ]
        ],
        "AAMA": [
            [
                1,
                4
            ],
            [
                5,
                8
            ],
            [
                10,
                11
            ],
            [
                15,
                12
            ],
            [
                20,
                14
            ],
            [
                25,
                15
            ],
            [
                30,
                16
            ],
            [
                35,
                17
            ],
            [
                40,
                18
            ],
            [
                45,
                19
            ],
            [
                50,
                20
            ],
            [
                55,
                21
            ],
            [
                60,
                22
            ],
            [
                65,
                23
            ],
            [
                70,
                23
            ],
            [
                75,
                24
            ],
            [
                80,
                24
            ],
            [
                85,
                26
            ],
            [
                90,
                27
            ],
            [
                95,
                31
            ],
            [
                99,
                37
            ]
        ]
    }
};

    // ============================================================================
    // CLASSIFICAÇÃO POR PERCENTIL (5 faixas — do classificacao_percentil do JSON)
    // ============================================================================
    function classificarPercentil(p) {
        if (p == null) return { label: 'Sem dado', slug: 'vazio' };
        if (p >= 85) return { label: 'Superior',       slug: 'superior' };
        if (p >= 65) return { label: 'Médio Superior', slug: 'medio-superior' };
        if (p >= 45) return { label: 'Médio',          slug: 'medio' };
        if (p >= 25) return { label: 'Médio Inferior', slug: 'medio-inferior' };
        return            { label: 'Inferior',       slug: 'inferior' };
    }

    // ============================================================================
    // BUSCAR PERCENTIL (replica fielmente buscarPercentil do script.js legado)
    // Retorna o maior percentil cuja âncora bruto ≤ score informado.
    // ============================================================================
    function buscarPercentil(tabela, bruto) {
        const validas = tabela.filter(([p, b]) => b !== null && b !== undefined && !isNaN(b));
        if (validas.length === 0) return null;
        if (bruto < validas[0][1]) return 1;

        let percentilAchado = null;
        for (const [p, b] of validas) {
            if (bruto >= b) percentilAchado = p;
        }
        const maiorEntrada = validas[validas.length - 1];
        if (bruto > maiorEntrada[1]) return maiorEntrada[0];
        return percentilAchado != null ? percentilAchado : 1;
    }

    // ============================================================================
    // MAPEAMENTO escolaridade do paciente → estrato normativo
    // O paciente.escolaridade pode vir com vários valores.
    // Mapeamos para 1 dos 3 estratos do ETDAH-AD.
    // ============================================================================
    function resolverEstrato(escolaridade) {
        if (!escolaridade) return null;
        const e = String(escolaridade).toLowerCase();
        if (e.includes('fundamental')) return 'Ensino Fundamental';
        if (e.includes('médio') || e.includes('medio')) return 'Ensino Médio';
        if (e.includes('superior') || e.includes('pós') || e.includes('pos')
            || e.includes('mestrado') || e.includes('doutorado') || e.includes('graduação')
            || e.includes('graduacao')) return 'Ensino Superior';
        return null;
    }

    // ============================================================================
    // TEXTOS INTERPRETATIVOS (5 fatores × 3 faixas = 15 — replicados do script.js legado)
    // ============================================================================
    function gerarInterpretacao(fatorCodigo, classifLabel, bruto, percentil, nomePrim) {
        const pTxt = percentil != null ? `${percentil}º percentil` : 'percentil não disponível';
        const sup = (classifLabel === 'Superior' || classifLabel === 'Médio Superior');
        const med = (classifLabel === 'Médio');

        if (fatorCodigo === 'DESATENCAO') {
            if (sup) return `O escore obtido (bruto = ${bruto}) situa ${nomePrim} no ${pTxt} para Desatenção, indicando frequência elevada de comportamentos desatentos em comparação ao grupo normativo. São esperados padrões como distratibilidade, dificuldade em concluir tarefas, sonhar acordado e desorganização no trabalho — com impacto funcional relevante nos contextos acadêmico, profissional e cotidiano.`;
            if (med) return `O escore de Desatenção (bruto = ${bruto}; ${pTxt}) situa-se na faixa Média, indicando frequência de comportamentos desatentos compatível com a maioria da população normativa para a escolaridade avaliada. Não há indicativo de comprometimento significativo neste domínio isoladamente.`;
            return `O escore de Desatenção (bruto = ${bruto}; ${pTxt}) encontra-se abaixo da média normativa, sugerindo baixa frequência de comportamentos desatentos no autorrelato. Este dado deve ser interpretado considerando o padrão global da avaliação.`;
        }
        if (fatorCodigo === 'HIPERATI') {
            if (sup) return `O escore de Hiperatividade (bruto = ${bruto}; ${pTxt}) indica frequência elevada de comportamentos hiperativos. ${nomePrim} relata padrões como agitação motora, inquietação, sono agitado e ritmo de trabalho acelerado em grau acima do esperado para o grupo normativo. Esses comportamentos podem comprometer a qualidade das execuções e a adaptação em ambientes que exigem controle postural e regulação do ritmo.`;
            if (med) return `O escore de Hiperatividade (bruto = ${bruto}; ${pTxt}) encontra-se na faixa Média, sem indicativo de comprometimento clinicamente relevante neste domínio por este instrumento.`;
            return `O escore de Hiperatividade (bruto = ${bruto}; ${pTxt}) está abaixo da média normativa. A frequência de comportamentos hiperativos relatada é baixa em relação ao grupo de referência.`;
        }
        if (fatorCodigo === 'IMPULSIV') {
            if (sup) return `O escore de Impulsividade (bruto = ${bruto}; ${pTxt}) evidencia frequência elevada de comportamentos impulsivos no autorrelato, como dificuldade em controlar reações emocionais, tendência a agir antes de pensar, baixa tolerância à frustração e comportamentos de risco. Esses padrões, quando persistentes, têm repercussão nos relacionamentos interpessoais e no gerenciamento de situações adversas.`;
            if (med) return `O escore de Impulsividade (bruto = ${bruto}; ${pTxt}) situa-se na faixa Média, indicando frequência de comportamentos impulsivos compatível com a norma para a escolaridade avaliada.`;
            return `O escore de Impulsividade (bruto = ${bruto}; ${pTxt}) está abaixo da média normativa, sugerindo boa capacidade de controle comportamental neste domínio conforme o autorrelato.`;
        }
        if (fatorCodigo === 'ASPECTOS') {
            if (sup) return `O escore de Aspectos Emocionais (bruto = ${bruto}; ${pTxt}) indica frequência elevada de vivências emocionais negativas, como humor rebaixado, isolamento social, labilidade emocional e dificuldades de adaptação a mudanças. Esses dados reforçam a importância de investigação complementar para avaliar a presença de comorbidades afetivas associadas ao quadro clínico.`;
            if (med) return `O escore de Aspectos Emocionais (bruto = ${bruto}; ${pTxt}) situa-se na faixa Média, sem indicativo de sofrimento emocional de intensidade elevada neste instrumento. Avaliação complementar pode esclarecer a dimensão afetiva do quadro.`;
            return `O escore de Aspectos Emocionais (bruto = ${bruto}; ${pTxt}) está abaixo da média normativa, não sugerindo frequência elevada de sintomatologia emocional negativa neste autorrelato.`;
        }
        if (fatorCodigo === 'AAMA') {
            if (sup) return `O escore de AAMA (Auto-Avaliação e Monitoramento do Autocontrole; bruto = ${bruto}; ${pTxt}) é elevado — neste fator, escores altos refletem positivamente, indicando que ${nomePrim} avalia a si mesmo(a) como atento(a), organizado(a) e com bom autocontrole comportamental. Este dado deve ser interpretado em contraste com os demais fatores para avaliar coerência interna do perfil.`;
            if (med) return `O escore de AAMA (bruto = ${bruto}; ${pTxt}) situa-se na faixa Média. O fator AAMA avalia autocontrole e monitoramento do próprio comportamento — escores médios indicam percepção autorreferida de autocontrole dentro do esperado para o grupo normativo.`;
            return `O escore de AAMA (bruto = ${bruto}; ${pTxt}) está abaixo da média normativa. Como este fator é de interpretação positiva (escores altos = melhor autocontrole), o resultado indica que ${nomePrim} percebe déficits no próprio autocontrole, organização e monitoramento comportamental — dado clinicamente relevante no contexto da investigação de TDAH.`;
        }
        return '';
    }

    // ============================================================================
    // STATE
    // ============================================================================
    const state = {
        aplicacaoId: null,
        aplicacao: null,
        paciente: null,
        norma: null,
        itens: [],
        correcao: null,
        scores: null,        // { DESATENCAO: {bruto, percentil, classif}, ... }
        estrato: null,       // 'Ensino Fundamental' | 'Ensino Médio' | 'Ensino Superior' | null
        chartInstance: null
    };

    // ============================================================================
    // BOOT
    // ============================================================================
    window.addEventListener('cortex:auth-ready', async () => {
        await CortexSidebar.render('pacientes');

        const params = new URLSearchParams(window.location.search);
        state.aplicacaoId = params.get('aplicacao_id');

        if (!state.aplicacaoId) { mostrarErro('aplicacao_id não fornecido na URL'); return; }

        try {
            await carregarTudo();
            renderizar();
        } catch (err) {
            console.error('Erro ao carregar:', err);
            mostrarErro('Erro: ' + (err.message || 'desconhecido'));
        }
    });

    async function carregarTudo() {
        const { data: aplicacao, error: errA } = await window.cortexClient
            .from('aplicacoes_instrumento').select('*').eq('id', state.aplicacaoId).single();
        if (errA) throw new Error('Aplicação: ' + errA.message);
        state.aplicacao = aplicacao;

        const { data: paciente, error: errP } = await window.cortexClient
            .from('pacientes').select('id, nome_completo, sexo, data_nascimento, cpf, escolaridade')
            .eq('id', aplicacao.paciente_id).single();
        if (errP) throw new Error('Paciente: ' + errP.message);
        state.paciente = paciente;
        state.estrato = resolverEstrato(paciente.escolaridade);

        const { data: instrumento, error: errI } = await window.cortexClient
            .from('instrumentos_catalogo').select('id, sigla').eq('id', aplicacao.instrumento_id).single();
        if (errI) throw new Error('Instrumento: ' + errI.message);
        if (instrumento.sigla !== SIGLA_ESPERADA) {
            throw new Error(`Esperado ${SIGLA_ESPERADA}, encontrado ${instrumento.sigla}`);
        }

        const { data: norma } = await window.cortexClient
            .from('instrumentos_normas').select('*').eq('instrumento_id', instrumento.id)
            .eq('ativa', true).maybeSingle();
        if (!norma) throw new Error('Norma ETDAH-AD não cadastrada');
        state.norma = norma;

        const { data: itens } = await window.cortexClient
            .from('instrumentos_itens').select('numero, texto, reverso, fator_id')
            .eq('norma_id', norma.id).order('numero');
        state.itens = itens || [];

        const { data: correcao, error: errC } = await window.cortexClient
            .from('correcoes').select('*').eq('aplicacao_id', state.aplicacaoId)
            .order('created_at', { ascending: false }).limit(1).maybeSingle();
        if (errC) throw new Error('Correção: ' + errC.message);
        if (!correcao) throw new Error('Nenhuma correção encontrada');
        state.correcao = correcao;

        // Calcula percentil + classif por fator localmente (decisão arquitetural B)
        state.scores = calcularResultados(correcao, state.estrato);

        await CortexAudit.log('leitura', 'correcoes', correcao.id, {
            detalhes: { aplicacaoId: state.aplicacaoId, sigla: SIGLA_ESPERADA }
        });
    }

    function calcularResultados(correcao, estrato) {
        const escoresBrutos = correcao?.escores_brutos || {};
        const fatores = escoresBrutos.fatores || {};
        const tabelaNorma = estrato ? NORMAS[estrato] : null;
        const out = {};

        for (const code of FATORES_ORDEM) {
            const dado = fatores[code];
            const bruto = (dado && typeof dado.score === 'number') ? dado.score : null;

            let percentil = null;
            if (bruto != null && tabelaNorma) {
                const tabela = tabelaNorma[FATOR_INFO[code].chave_norma];
                if (tabela) percentil = buscarPercentil(tabela, bruto);
            }

            const classif = classificarPercentil(percentil);

            out[code] = {
                bruto: bruto,
                percentil: percentil,
                classifLabel: classif.label,
                classifSlug: classif.slug
            };
        }
        return out;
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

        // Renderiza gráfico DEPOIS do innerHTML estar no DOM
        setTimeout(renderGrafico, 50);
    }

    function renderLaudo() {
        const idade = calcularIdade(state.paciente.data_nascimento, state.aplicacao.data_aplicacao);
        const dataApl = state.aplicacao.data_aplicacao || state.aplicacao.created_at;
        const nascStr = state.paciente.data_nascimento
            ? formatarDataBR(state.paciente.data_nascimento) : '—';

        const semNorma = !state.estrato;
        const avisoEstrato = semNorma
            ? `<div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:12px 16px;margin-bottom:18px;color:#78350f;font-size:13px;">
                <strong>⚠ Escolaridade não classificada:</strong>
                o paciente está cadastrado com escolaridade <em>"${escapeHtml(state.paciente.escolaridade || '— não informada')}"</em>,
                que não foi mapeada para nenhum dos 3 estratos normativos do ETDAH-AD
                (Fundamental / Médio / Superior). Sem o estrato, os percentis não podem
                ser calculados. Atualize a escolaridade do paciente e recarregue esta tela.
              </div>`
            : '';

        return `
        <div class="laudo">
            <div class="laudo-header">
                <div class="laudo-header-esq">
                    <div class="laudo-header-logo">E</div>
                    <div class="laudo-header-textos">
                        <div class="laudo-header-supratitulo">Relatório de Avaliação Neuropsicológica</div>
                        <h1 class="laudo-header-titulo">ETDAH-AD</h1>
                        <div class="laudo-header-subtitulo">Escala de TDAH para Adultos — Autoavaliação<br>69 itens · 5 fatores · normas por escolaridade</div>
                    </div>
                </div>
                <div class="laudo-header-pontuacao">
                    <div class="laudo-header-pontuacao-label">Estrato Normativo</div>
                    <div class="laudo-header-pontuacao-valor" style="font-size:18px;">${state.estrato || '—'}</div>
                </div>
            </div>

            <div class="laudo-body">

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
                        <span class="laudo-identif-label">Idade:</span>
                        <span class="laudo-identif-valor">${idade !== null ? idade + ' anos' : '—'}</span>
                    </div>
                    <div class="laudo-identif-item">
                        <span class="laudo-identif-label">Sexo:</span>
                        <span class="laudo-identif-valor">${escapeHtml(state.paciente.sexo || '—')}</span>
                    </div>
                    <div class="laudo-identif-item">
                        <span class="laudo-identif-label">Nascimento:</span>
                        <span class="laudo-identif-valor">${nascStr}</span>
                    </div>
                    <div class="laudo-identif-item">
                        <span class="laudo-identif-label">Escolaridade:</span>
                        <span class="laudo-identif-valor">${escapeHtml(state.paciente.escolaridade || '—')}</span>
                    </div>
                    <div class="laudo-identif-item">
                        <span class="laudo-identif-label">Avaliação:</span>
                        <span class="laudo-identif-valor">${formatarDataBR(dataApl)}</span>
                    </div>
                </div>

                ${avisoEstrato}

                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">2</span>
                    Escores por Fator
                </div>
                ${renderTabelaFatores()}

                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">3</span>
                    Perfil Gráfico dos Fatores (Percentil)
                </div>
                <div class="etdah-grafico-wrap">
                    <div class="etdah-grafico-canvas-container">
                        <canvas id="etdah-chart"></canvas>
                    </div>
                    <div class="etdah-grafico-legenda">
                        Normas por escolaridade${state.estrato ? ' (' + state.estrato + ')' : ''}.
                        Linha tracejada = percentil 50.
                    </div>
                </div>

                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">4</span>
                    Resultados e Análise
                </div>
                ${FATORES_ORDEM.map(renderFatorCard).join('')}

                <div class="etdah-nota-tecnica">
                    <strong>Nota técnica:</strong> O ETDAH-AD é um instrumento de autoavaliação de
                    sintomas de TDAH para adolescentes e adultos (12-87 anos), composto por 69 itens
                    com escala de resposta de 0 (Nunca) a 5 (Sempre - intensamente). Os escores
                    refletem a frequência autopercebida de comportamentos em cada domínio clínico.
                    Percentis elevados em <strong>Desatenção, Hiperatividade e Impulsividade</strong>
                    indicam frequência sintomática acima da média normativa para a escolaridade.
                    O fator <strong>AAMA</strong> (Auto-Avaliação e Monitoramento do Autocontrole)
                    é de <strong>interpretação inversa</strong> — escores mais altos indicam melhor
                    autocontrole. Este instrumento deve ser interpretado em conjunto com outros
                    dados da avaliação.
                </div>

                ${renderDetalhesItens()}

            </div>

            <div class="laudo-rodape">
                <div class="laudo-rodape-esq">
                    <div class="laudo-rodape-org">Equilibrium Neuropsicologia</div>
                    <div class="laudo-rodape-tipo">Correção automatizada — ETDAH-AD</div>
                </div>
                <div class="laudo-rodape-dir">
                    <div class="laudo-rodape-data">Documento gerado em ${formatarDataBR(new Date().toISOString())}</div>
                    <div class="laudo-rodape-confidencial">Documento confidencial — uso restrito ao profissional solicitante.</div>
                </div>
            </div>
        </div>
        `;
    }

    function renderTabelaFatores() {
        const linhas = FATORES_ORDEM.map(code => {
            const r = state.scores[code];
            const info = FATOR_INFO[code];
            const pctTxt = r.percentil != null ? `${r.percentil}%` : '—';
            const badge = r.percentil != null
                ? `<span class="etdah-badge etdah-badge-${r.classifSlug}">${r.classifLabel}</span>`
                : `<span class="etdah-badge etdah-badge-vazio">—</span>`;
            return `<tr>
                <td>
                    <span class="nome-fator">
                        <span class="nome-fator-bullet" style="background:${info.cor};"></span>
                        ${info.label}
                    </span>
                </td>
                <td class="ctr">${N_ITENS_FATOR[code]}</td>
                <td class="ctr"><span class="escore-bruto">${r.bruto != null ? r.bruto : '—'}</span></td>
                <td class="ctr"><span class="percentil">${pctTxt}</span></td>
                <td class="ctr">${badge}</td>
            </tr>`;
        }).join('');

        return `
            <div class="etdah-tab-fatores">
                <table>
                    <thead>
                        <tr>
                            <th>Fator</th>
                            <th class="ctr">Itens</th>
                            <th class="ctr">Escore Bruto</th>
                            <th class="ctr">Percentil</th>
                            <th class="ctr">Classificação</th>
                        </tr>
                    </thead>
                    <tbody>${linhas}</tbody>
                </table>
            </div>
        `;
    }

    function renderFatorCard(code) {
        const r = state.scores[code];
        const info = FATOR_INFO[code];
        const nomePrim = state.paciente.nome_completo.split(' ')[0] || state.paciente.nome_completo;
        const interpretacao = r.percentil != null
            ? gerarInterpretacao(code, r.classifLabel, r.bruto, r.percentil, nomePrim)
            : `Não foi possível calcular o percentil deste fator — verifique se a escolaridade do paciente está cadastrada e mapeada para um dos 3 estratos (Fundamental / Médio / Superior).`;

        const badge = r.percentil != null
            ? `<span class="etdah-fator-card-classif-meta etdah-badge-${r.classifSlug}">${r.classifLabel} · ${r.percentil}º percentil</span>`
            : `<span class="etdah-fator-card-classif-meta etdah-badge-vazio">— sem percentil</span>`;

        return `
            <div class="etdah-fator-card etdah-fator-card-${info.slug}">
                <div class="etdah-fator-card-header">
                    <div class="etdah-fator-card-titulo">
                        <span class="etdah-fator-card-bullet" style="background:${info.cor};"></span>
                        ${info.label}
                    </div>
                    ${badge}
                </div>
                <p class="etdah-fator-card-corpo">${interpretacao}</p>
            </div>
        `;
    }

    function renderGrafico() {
        const canvas = document.getElementById('etdah-chart');
        if (!canvas || typeof Chart === 'undefined') return;

        if (state.chartInstance) state.chartInstance.destroy();

        const labels = FATORES_ORDEM.map(c => FATOR_INFO[c].label);
        const cores  = FATORES_ORDEM.map(c => FATOR_INFO[c].cor);
        const percentis = FATORES_ORDEM.map(c => state.scores[c].percentil ?? 0);

        state.chartInstance = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    data: percentis,
                    backgroundColor: cores,
                    borderRadius: 6,
                    barPercentage: 0.65
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => {
                                const code = FATORES_ORDEM[ctx.dataIndex];
                                const r = state.scores[code];
                                return ` ${r.percentil != null ? r.percentil + 'º percentil' : 'sem percentil'} · ${r.classifLabel}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        min: 0,
                        max: 100,
                        ticks: { callback: (v) => v + '%' },
                        grid: { color: '#f1f5f9' }
                    },
                    y: {
                        grid: { display: false },
                        ticks: { font: { size: 12, weight: '600' } }
                    }
                }
            }
        });
    }

    function renderDetalhesItens() {
        if (!state.itens.length) return '';
        const labels = state.norma?.answer_labels || [];
        const respostas = state.correcao?.escores_brutos?.respostas || {};

        // Mapa fator_id → fator_codigo (precisamos do banco)
        // Usamos numero do item pra inferir, com base na lista do questionário
        const NUM_TO_FATOR = {};
        // 23 Desatenção
        [6,19,20,22,23,24,28,30,32,33,34,36,37,44,49,50,51,54,56,57,64,67,69].forEach(n => NUM_TO_FATOR[n] = 'DESATENCAO');
        // 7 Hiperatividade
        [2,3,13,17,31,35,43].forEach(n => NUM_TO_FATOR[n] = 'HIPERATI');
        // 23 Impulsividade
        [9,11,12,15,18,25,26,38,39,40,41,45,46,47,48,52,53,60,61,62,63,66,68].forEach(n => NUM_TO_FATOR[n] = 'IMPULSIV');
        // 4 Aspectos Emocionais
        [4,7,21,55].forEach(n => NUM_TO_FATOR[n] = 'ASPECTOS');
        // 12 AAMA (também os reversos)
        [1,5,8,10,14,16,27,29,42,58,59,65].forEach(n => NUM_TO_FATOR[n] = 'AAMA');

        const linhas = state.itens.map(item => {
            const code = NUM_TO_FATOR[item.numero];
            const fLabel = code ? FATOR_INFO[code].label : '—';
            const valor = respostas[item.numero];
            const labelTxt = (valor !== undefined && labels[valor] !== undefined) ? labels[valor] : '—';
            const reverso = item.reverso ? ' <span style="color:#dc2626;font-size:10px;">⇄ INV</span>' : '';
            return `<tr>
                <td style="text-align:center;font-weight:700;color:#1e40af;">${item.numero}</td>
                <td>${escapeHtml(item.texto)}${reverso}</td>
                <td style="font-size:10px;color:#64748b;">${fLabel}</td>
                <td style="text-align:center;">${labelTxt} (${valor ?? '—'})</td>
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
                            <th>Fator</th>
                            <th style="text-align:center;width:200px;">Resposta</th>
                        </tr>
                    </thead>
                    <tbody>${linhas}</tbody>
                </table>
            </details>
        `;
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
            const dataStr = formatarDataArquivo(new Date());
            const nomeArquivo = `ETDAH-AD - ${nomeAbreviado}_${dataStr}.pdf`;

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
    // UTILS
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

    function formatarDataBR(iso) {
        if (!iso) return '—';
        const d = iso.includes('T') ? new Date(iso) : new Date(iso + 'T00:00:00');
        return d.toLocaleDateString('pt-BR');
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

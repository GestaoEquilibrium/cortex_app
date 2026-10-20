/* ============================================================================
   CORTEX · Laudo Online — leitor AQ-Adolescente · QA 16+ (AQ-50)
   (frontend/shared/laudo/escalas/aq_qa16.js) · sprint LO-6
   ----------------------------------------------------------------------------
   Mesma conta de
     frontend/correcao/aqadolescente/aqadolescente_resultado.js
     frontend/correcao/qa16/qa16_resultado.js
   (pontuarItem + calcularResultados + classificarTotal), sem tocar nas telas.

   Ambas: 50 itens, banco grava o índice 0-3 da resposta em escores_brutos.respostas.
   Pontuação binária por gabarito:
     itens "diretos" (Grupo A) pontuam 1 se índice 0 ou 1;
     itens "indiretos" (Grupo B) pontuam 1 se índice 2 ou 3.
   Item sem resposta (ou não numérico) vale 0 (igual às telas).
   Total = 50 itens. Subescalas = soma dos itens de cada uma.

   AQ-Adolescente (Baron-Cohen et al., 2006 · heteroaplicação · corte 26)
     facetas HSO, MUA, DET, COM, IMA (10 itens cada, todos os 50 itens)
     ≤8 Baixa · ≤17 Média · ≤21 Acima da média · ≤25 Limítrofe · ≥26 Indicativo
   QA 16+ (AQ-50, Baron-Cohen et al., 2001 · autorrelato · corte 32)
     subescalas HSO, TAT, DET, COM (10) e IMA (9); item 30 só entra no total
     ≤10 Baixa · ≤21 Média · ≤25 Acima da média · ≤31 Limítrofe · ≥32 Clinicamente Significativa
   As telas não classificam as subescalas (só pontos e % do máximo).
   Diferença: a tela aceita uma correção sem nenhuma resposta (mostra 0 / Baixa);
   aqui isso é tratado como dado faltando (lança Error).
   ============================================================================ */
(function () {
    'use strict';
    if (!window.LaudoEscalas) { console.warn('[aq_qa16] escalas_base.js não carregado'); return; }
    const LE = window.LaudoEscalas;
    const U = LE.util;

    // ---- copiado de aqadolescente_resultado.js -------------------------------
    const AQ = {
        DIRETOS: new Set([2, 4, 5, 6, 7, 9, 12, 13, 16, 18, 19, 20, 22, 23, 26, 33, 35, 39, 41, 42, 43, 45, 46]),
        INDIRETOS: new Set([1, 3, 8, 10, 11, 14, 15, 17, 21, 24, 25, 27, 28, 29, 30, 31, 32, 34, 36, 37, 38, 40, 44, 47, 48, 49, 50]),
        INFO: {
            'HSO': { label: 'Habilidades Sociais', max: 10 },
            'MUA': { label: 'Mudança de Atenção', max: 10 },
            'DET': { label: 'Atenção aos Detalhes', max: 10 },
            'COM': { label: 'Comunicação', max: 10 },
            'IMA': { label: 'Imaginação', max: 10 }
        },
        ORDEM: ['HSO', 'MUA', 'DET', 'COM', 'IMA'],
        ITEM_SUB: {"1": "HSO", "11": "HSO", "13": "HSO", "15": "HSO", "22": "HSO", "36": "HSO", "44": "HSO", "45": "HSO", "47": "HSO", "48": "HSO", "2": "MUA", "4": "MUA", "10": "MUA", "16": "MUA", "25": "MUA", "32": "MUA", "34": "MUA", "37": "MUA", "43": "MUA", "46": "MUA", "5": "DET", "6": "DET", "9": "DET", "12": "DET", "19": "DET", "23": "DET", "28": "DET", "29": "DET", "30": "DET", "49": "DET", "7": "COM", "17": "COM", "18": "COM", "26": "COM", "27": "COM", "31": "COM", "33": "COM", "35": "COM", "38": "COM", "39": "COM", "3": "IMA", "8": "IMA", "14": "IMA", "20": "IMA", "21": "IMA", "24": "IMA", "40": "IMA", "41": "IMA", "42": "IMA", "50": "IMA"},
        classificarTotal(total) {
            if (total <= 8)  return { label: 'Baixa', slug: 'baixa',
                desc: 'Pontuação baixa — perfil típico da população geral. Não há indicativo de traços do espectro autista neste rastreio.' };
            if (total <= 17) return { label: 'Média', slug: 'media',
                desc: 'Pontuação dentro da faixa esperada da população geral. Sem indicativo de traços clinicamente significativos.' };
            if (total <= 21) return { label: 'Acima da média', slug: 'acima',
                desc: 'Pontuação ligeiramente acima da média. Pode haver alguns traços do espectro autista, mas abaixo do limite clínico.' };
            if (total <= 25) return { label: 'Limítrofe', slug: 'limitrofe',
                desc: 'Pontuação limítrofe — alguns traços observados. Investigação clínica complementar é recomendada.' };
            return { label: 'Indicativo', slug: 'clinico',
                desc: 'Pontuação indicativa de perfil autista (≥26). Avaliação diagnóstica complementar é fortemente recomendada para investigação de TEA.' };
        },
        cortes: [8, 17, 21, 25, 50],
        corte: 26
    };

    // ---- copiado de qa16_resultado.js ----------------------------------------
    const QA = {
        DIRETOS: new Set([2, 4, 5, 6, 7, 9, 12, 13, 16, 18, 19, 20, 21, 22, 23, 26, 33, 35, 39, 41, 42, 43, 45, 46]),
        INDIRETOS: new Set([1, 3, 8, 10, 11, 14, 15, 17, 24, 25, 27, 28, 29, 30, 31, 32, 34, 36, 37, 38, 40, 44, 47, 48, 49, 50]),
        INFO: {
            'HSO': { label: 'Habilidade Social', max: 10 },
            'TAT': { label: 'Troca de Atenção', max: 10 },
            'DET': { label: 'Atenção aos Detalhes', max: 10 },
            'COM': { label: 'Comunicação', max: 10 },
            'IMA': { label: 'Imaginação', max: 9 }
        },
        ORDEM: ['HSO', 'TAT', 'DET', 'COM', 'IMA'],
        ITEM_SUB: {"1": "HSO", "11": "HSO", "13": "HSO", "15": "HSO", "22": "HSO", "36": "HSO", "44": "HSO", "45": "HSO", "47": "HSO", "48": "HSO", "2": "TAT", "4": "TAT", "10": "TAT", "16": "TAT", "29": "TAT", "32": "TAT", "34": "TAT", "37": "TAT", "46": "TAT", "49": "TAT", "5": "DET", "6": "DET", "9": "DET", "12": "DET", "19": "DET", "23": "DET", "28": "DET", "39": "DET", "41": "DET", "43": "DET", "7": "COM", "17": "COM", "18": "COM", "26": "COM", "27": "COM", "31": "COM", "33": "COM", "35": "COM", "38": "COM", "42": "COM", "3": "IMA", "8": "IMA", "14": "IMA", "20": "IMA", "21": "IMA", "24": "IMA", "25": "IMA", "40": "IMA", "50": "IMA"},
        classificarTotal(total) {
            if (total <= 10) return { label: 'Baixa', slug: 'baixa',
                desc: 'Pontuação baixa — comum na população geral. Não há indicativo de traços do espectro autista neste autorrelato.' };
            if (total <= 21) return { label: 'Média', slug: 'media',
                desc: 'Pontuação dentro da média da população geral. Não há indicativo de traços clinicamente significativos.' };
            if (total <= 25) return { label: 'Acima da média', slug: 'acima',
                desc: 'Pontuação ligeiramente acima da média. Pode indicar alguns traços do espectro autista, mas abaixo do limite clínico.' };
            if (total <= 31) return { label: 'Limítrofe', slug: 'limitrofe',
                desc: 'Pontuação limítrofe — pode indicar alguns traços do espectro autista. Investigação clínica complementar é recomendada.' };
            return { label: 'Clinicamente Significativa', slug: 'clinico',
                desc: 'Pontuação clinicamente significativa (≥ 32). Indica forte presença de traços do espectro autista. Avaliação diagnóstica complementar é fortemente recomendada.' };
        },
        cortes: [10, 21, 25, 31, 50],
        corte: 32
    };

    // pontuarItem / calcularResultados das telas (idênticos nas duas, só mudam as tabelas)
    function pontuarItem(T, itemNum, idxResposta) {
        if (idxResposta == null || isNaN(idxResposta)) return 0;
        if (T.DIRETOS.has(itemNum)) return (idxResposta === 0 || idxResposta === 1) ? 1 : 0;
        if (T.INDIRETOS.has(itemNum)) return (idxResposta === 2 || idxResposta === 3) ? 1 : 0;
        return 0;
    }
    function calcularResultados(T, respostas) {
        const pontosItem = {};
        for (let n = 1; n <= 50; n++) {
            const idxResp = respostas[n];
            pontosItem[n] = pontuarItem(T, n, idxResp != null ? parseInt(idxResp, 10) : null);
        }
        let total = 0;
        for (let n = 1; n <= 50; n++) total += pontosItem[n];
        const subscores = {};
        for (const code of T.ORDEM) subscores[code] = 0;
        for (const [itemStr, sub] of Object.entries(T.ITEM_SUB)) {
            const n = parseInt(itemStr, 10);
            if (subscores[sub] !== undefined) subscores[sub] += pontosItem[n];
        }
        return { total, subscores, totalClassif: T.classificarTotal(total) };
    }
    // --------------------------------------------------------------------------

    const TOM = { baixa: 'ok', media: 'ok', acima: 'leve', limitrofe: 'mod', clinico: 'grave' };

    function zonasTotal(T) {
        return T.cortes.map(ate => {
            const cl = T.classificarTotal(ate);
            return { ate, rotulo: cl.label, tom: TOM[cl.slug] };
        });
    }

    // Nomes que o Gerador pode escrever (as duas versões usam rótulos diferentes)
    const APELIDOS_CONF = {
        HSO: ['habilidade_social', 'habilidades_sociais'],
        MUA: ['mudanca_de_atencao', 'troca_de_atencao'],
        TAT: ['troca_de_atencao', 'mudanca_de_atencao'],
        DET: ['atencao_aos_detalhes', 'detalhes'],
        COM: ['comunicacao'],
        IMA: ['imaginacao']
    };

    const CFG = {
        'AQ-Adolescente': {
            T: AQ, nome: 'AQ-Adolescente', respondente: 'Pais/responsável',
            norma: 'Baron-Cohen et al. (2006) · heteroaplicação · ponto de corte 26'
        },
        'QA 16+': {
            T: QA, nome: 'QA 16+ (AQ-50)', respondente: 'Autorrelato',
            norma: 'Baron-Cohen et al. (2001) · AQ-50 · ponto de corte 32'
        }
    };

    function calcularCom(siglaBase) {
        const cfg = CFG[siglaBase];
        const T = cfg.T;
        return function (ctx) {
            const respostas = ctx.respostas || {};
            if (!Object.keys(respostas).length) throw new Error(siglaBase + ': correção sem respostas');
            const s = calcularResultados(T, respostas);
            const cl = s.totalClassif;

            const conferencia = { total: s.total };
            const subescalas = T.ORDEM.map(code => {
                const info = T.INFO[code];
                const valor = s.subscores[code];
                const pct = Math.round((valor / info.max) * 100);
                [code, U.chave(info.label)].concat(APELIDOS_CONF[code] || []).forEach(k => {
                    if (conferencia[k] == null) conferencia[k] = valor;
                });
                return {
                    codigo: code, nome: info.label, valor, max: info.max,
                    classificacao: null, tom: 'neutro',   // a tela não classifica subescala
                    zonas: null,
                    extra: `${pct}% do máximo`
                };
            });

            const linhas = [['Ponto de corte', '≥ ' + T.corte]];
            if (T === QA) linhas.push(['Item 30', 'Conta no total, sem subescala']);

            return {
                sigla: ctx.sigla || siglaBase,
                nome: cfg.nome,
                respondente: cfg.respondente,
                norma: cfg.norma,
                principal: {
                    rotulo: 'Score Total', valor: s.total, max: 50, sufixo: '',
                    classificacao: cl.label, tom: TOM[cl.slug]
                },
                regua: { min: 0, max: 50, valor: s.total, zonas: zonasTotal(T), rotulo: 'Score Total' },
                subescalas,
                linhas,
                indicacao: cl.desc,
                conferencia
            };
        };
    }

    LE.registrar({
        siglas: ['AQ-Adolescente'],
        carregar: { fatores: false, itens: false, classificacoes: false, json: null },
        calcular: calcularCom('AQ-Adolescente')
    });
    LE.registrar({
        siglas: ['QA 16+'],
        carregar: { fatores: false, itens: false, classificacoes: false, json: null },
        calcular: calcularCom('QA 16+')
    });
})();

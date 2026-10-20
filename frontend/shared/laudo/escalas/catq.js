/* ============================================================================
   CORTEX · Laudo Online — leitor CAT-Q
   (frontend/shared/laudo/escalas/catq.js) · sprint LO-6
   ----------------------------------------------------------------------------
   Mesma leitura de frontend/correcao/catq/catq_resultado.js:
     - a tela NÃO soma os itens: lê escores_brutos.fatores[COD].score (gravado
       pela função publico_finalizar_aplicacao) e, para o total, cai em
       escores_brutos.score_total se fatores.TOTAL faltar (extrairScores)
     - subescala: % do máximo ≥70 Muito Elevado · ≥50 Elevado · ≥30 Moderado · senão Baixo
     - total: > 100 'Camuflagem Significativa' · senão 'Faixa Típica'
     - subescala dominante = maior % do máximo (empate: a primeira na ordem)
   Hull et al. (2019) · 25 itens 1–7 · Compensação (9 itens, 9–63),
   Mascaramento (7, 7–49), Assimilação (9, 9–63), Total 25–175.
   ============================================================================ */
(function () {
    'use strict';
    if (!window.LaudoEscalas) { console.warn('[catq] escalas_base.js não carregado'); return; }
    const LE = window.LaudoEscalas;
    const U = LE.util;

    // ---- copiado de catq_resultado.js -----------------------------------------
    const SUBESCALAS_ORDEM = ['COMPENSACAO', 'MASCARAMENTO', 'ASSIMILACAO'];
    const SUB_LABEL = {
        COMPENSACAO:  'Compensação',
        MASCARAMENTO: 'Mascaramento',
        ASSIMILACAO:  'Assimilação',
        TOTAL:        'TOTAL'
    };
    const SUB_MAX = { COMPENSACAO: 63, MASCARAMENTO: 49, ASSIMILACAO: 63, TOTAL: 175 };
    const SUB_MIN = { COMPENSACAO: 9, MASCARAMENTO: 7, ASSIMILACAO: 9, TOTAL: 25 };
    const SUB_ITENS_LISTA = {
        COMPENSACAO:  '1, 4, 5, 8, 11, 14, 17, 20, 23',
        MASCARAMENTO: '2, 6, 7, 10, 15, 18, 21',
        ASSIMILACAO:  '3, 9, 12, 13, 16, 19, 22, 24, 25'
    };
    const SUB_N_ITENS = { COMPENSACAO: 9, MASCARAMENTO: 7, ASSIMILACAO: 9 };

    function extrairScores(escoresBrutos) {
        escoresBrutos = escoresBrutos || {};
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
    function classifSubescala(score, fatorCodigo) {
        if (score == null) return null;
        const max = SUB_MAX[fatorCodigo];
        const pct = (score / max) * 100;
        if (pct >= 70) return { label: 'Muito Elevado', slug: 'mt-elevado' };
        if (pct >= 50) return { label: 'Elevado',       slug: 'elevado' };
        if (pct >= 30) return { label: 'Moderado',      slug: 'moderado' };
        return { label: 'Baixo', slug: 'baixo' };
    }
    function classifTotal(score) {
        if (score == null) return null;
        return score > 100
            ? { label: 'Camuflagem Significativa', slug: 'camuflagem' }
            : { label: 'Faixa Típica',             slug: 'tipica' };
    }
    function dominante(scores) {
        let max = -1, code = null;
        for (const c of SUBESCALAS_ORDEM) {
            if (scores[c] == null) continue;
            const pct = (scores[c] / SUB_MAX[c]) * 100;
            if (pct > max) { max = pct; code = c; }
        }
        return code;
    }
    // ---------------------------------------------------------------------------

    const TOM = { 'baixo': 'ok', 'moderado': 'mod', 'elevado': 'grave', 'mt-elevado': 'grave',
                  'tipica': 'ok', 'camuflagem': 'grave' };

    // Zonas: limite superior inteiro de cada faixa, achado com a própria função da tela
    function zonasSub(code) {
        const zonas = [];
        for (let s = SUB_MIN[code]; s <= SUB_MAX[code]; s++) {
            const cl = classifSubescala(s, code);
            const prox = s < SUB_MAX[code] ? classifSubescala(s + 1, code) : null;
            if (!prox || prox.slug !== cl.slug) zonas.push({ ate: s, rotulo: cl.label, tom: TOM[cl.slug] });
        }
        return zonas;
    }
    const ZONAS_TOTAL = [
        { ate: 100, rotulo: 'Faixa Típica', tom: 'ok' },
        { ate: SUB_MAX.TOTAL, rotulo: 'Camuflagem Significativa', tom: 'grave' }
    ];
    function pct1(score, max) { return Number(((score / max) * 100).toFixed(1)); }

    LE.registrar({
        siglas: ['CAT-Q'],
        carregar: { fatores: false, itens: false, classificacoes: false, json: null },
        calcular(ctx) {
            const brutos = (ctx.correcao && ctx.correcao.escores_brutos) || ctx.brutos || {};
            const scores = extrairScores(brutos);
            if ([...SUBESCALAS_ORDEM, 'TOTAL'].every(c => scores[c] == null)) {
                throw new Error('CAT-Q: correção sem escores por subescala (escores_brutos.fatores / score_total)');
            }
            const total = scores.TOTAL;
            const clTot = classifTotal(total);
            const dom = dominante(scores);

            const conferencia = {};
            if (total != null) {
                conferencia.total = total;
                conferencia.TOTAL = total;
                conferencia.total_pct = pct1(total, SUB_MAX.TOTAL);
            }
            const subescalas = SUBESCALAS_ORDEM.map(code => {
                const score = scores[code];
                const cl = classifSubescala(score, code);
                if (score != null) {
                    [code, U.chave(SUB_LABEL[code])].forEach(k => {
                        conferencia[k] = score;
                        conferencia[k + '_pct'] = pct1(score, SUB_MAX[code]);
                    });
                }
                return {
                    codigo: code, nome: SUB_LABEL[code], valor: score, max: SUB_MAX[code],
                    classificacao: cl ? cl.label : null, tom: cl ? TOM[cl.slug] : 'neutro',
                    zonas: zonasSub(code),
                    extra: `${SUB_N_ITENS[code]} itens: ${SUB_ITENS_LISTA[code]}` +
                        (score != null ? ` · ${((score / SUB_MAX[code]) * 100).toFixed(1)}% do máximo` : '')
                };
            });

            const linhas = [['Ponto de corte clínico', '> 100']];
            if (total != null) linhas.push(['Total (% da pontuação máxima)', `${(total / SUB_MAX.TOTAL * 100).toFixed(1)}%`]);
            linhas.push(['Subescala dominante', dom ? SUB_LABEL[dom] : '—']);

            let indicacao;
            if (total == null) indicacao = 'Pontuação total não disponível para interpretação.';
            else if (total > 100) indicacao = 'A pontuação total acima do ponto de corte clínico (>100) sugere presença significativa de comportamentos de camuflagem social (masking).';
            else indicacao = 'A pontuação total dentro da faixa típica (≤100) sugere que o avaliado tende a experienciar interações sociais de forma relativamente mais natural, com menor necessidade de estratégias compensatórias intensivas.';

            return {
                sigla: ctx.sigla || 'CAT-Q',
                nome: 'CAT-Q',
                respondente: 'Autorrelato',
                norma: 'Hull et al. (2019) · ponto de corte clínico > 100',
                principal: total == null ? null : {
                    rotulo: 'Pontuação Total', valor: total, max: SUB_MAX.TOTAL, sufixo: '',
                    classificacao: clTot.label, tom: TOM[clTot.slug]
                },
                regua: total == null ? null : {
                    min: SUB_MIN.TOTAL, max: SUB_MAX.TOTAL, valor: total, zonas: ZONAS_TOTAL, rotulo: 'Pontuação Total'
                },
                subescalas,
                linhas,
                indicacao,
                conferencia
            };
        }
    });
})();

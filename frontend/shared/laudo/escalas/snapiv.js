/* ============================================================================
   CORTEX · Laudo Online — leitor SNAP-IV
   (frontend/shared/laudo/escalas/snapiv.js) · sprint LO-6
   ----------------------------------------------------------------------------
   Mesma conta de frontend/correcao/snapiv/snapiv_resultado.js
   (calcularResultados + classificar), sem tocar na tela.

   MTA-SNAP-IV (Mattos, Serra-Pinheiro, Rohde & Pinto, 2006) · 26 itens 0-3.
   Três subescalas somadas SEPARADAMENTE (não há escore total):
     DES Desatenção (1-9, máx 27) · HIP Hiperatividade/Impulsividade (10-18, máx 27)
     OPO Oposição/Desafio (19-26, máx 24)
   Faixas (cortes da tela): DES/HIP 13/18/23 · OPO 8/14/19
     < c1 Não significativo · ≥ c1 Leve · ≥ c2 Moderado · ≥ c3 Grave
   A subescala de cada item vem do fator do banco (itens[].fator_codigo).
   Item sem resposta não soma (igual à tela).
   ============================================================================ */
(function () {
    'use strict';
    if (!window.LaudoEscalas) { console.warn('[snapiv] escalas_base.js não carregado'); return; }
    const U = window.LaudoEscalas.util;

    // ---- copiado de snapiv_resultado.js -------------------------------------
    const SUBS_INFO = {
        DES: { label: 'Desatenção', itens: '1–9', max: 27, cortes: [13, 18, 23] },
        HIP: { label: 'Hiperatividade/Impulsividade', itens: '10–18', max: 27, cortes: [13, 18, 23] },
        OPO: { label: 'Oposição/Desafio', itens: '19–26', max: 24, cortes: [8, 14, 19] }
    };
    const SUBS_ORDEM = ['DES', 'HIP', 'OPO'];
    const FAIXAS = [
        { slug: 'naosig', label: 'Não significativo' },
        { slug: 'leve',   label: 'Leve' },
        { slug: 'mod',    label: 'Moderado' },
        { slug: 'grave',  label: 'Grave' }
    ];
    function classificar(code, score) {
        const [c1, c2, c3] = SUBS_INFO[code].cortes;
        let i = 0;
        if (score >= c3) i = 3; else if (score >= c2) i = 2; else if (score >= c1) i = 1; else i = 0;
        return { ...FAIXAS[i], idx: i };
    }
    // itens: [{ numero, sub }]
    function calcularResultados(respostas, itens) {
        const subscores = {}; for (const c of SUBS_ORDEM) subscores[c] = 0;
        for (const item of itens) {
            const r = respostas[item.numero];
            const resp = (r != null && !isNaN(r)) ? parseInt(r, 10) : null;
            if (resp != null && subscores[item.sub] !== undefined) subscores[item.sub] += resp;
        }
        const classif = {};
        for (const c of SUBS_ORDEM) classif[c] = classificar(c, subscores[c]);
        const respondidos = Object.keys(respostas).length;
        return { subscores, classif, respondidos };
    }
    // -------------------------------------------------------------------------

    const TOM = ['ok', 'leve', 'mod', 'grave'];   // índice da faixa → tom do laudo

    // Zonas da régua: limite superior inteiro de cada faixa (escores são inteiros)
    function zonas(code) {
        const { max, cortes: [c1, c2, c3] } = SUBS_INFO[code];
        return [
            { ate: c1 - 1, rotulo: FAIXAS[0].label, tom: TOM[0] },
            { ate: c2 - 1, rotulo: FAIXAS[1].label, tom: TOM[1] },
            { ate: c3 - 1, rotulo: FAIXAS[2].label, tom: TOM[2] },
            { ate: max,    rotulo: FAIXAS[3].label, tom: TOM[3] }
        ];
    }

    // Apelidos curtos que o Gerador costuma escrever
    const APELIDOS_CONF = { HIP: ['hiperatividade'], OPO: ['oposicao'] };

    window.LaudoEscalas.registrar({
        siglas: ['SNAP-IV'],
        carregar: { fatores: true, itens: true, classificacoes: false, json: null },
        calcular(ctx) {
            const itens = (ctx.itens || []).map(i => ({ numero: i.numero, sub: i.fator_codigo || null }));
            if (!itens.length) throw new Error('SNAP-IV: itens da norma não carregados');
            const respostas = ctx.respostas || {};
            const s = calcularResultados(respostas, itens);

            const conferencia = {};
            const subescalas = SUBS_ORDEM.map(code => {
                const info = SUBS_INFO[code];
                const valor = s.subscores[code];
                const cl = s.classif[code];
                const pct = Math.round((valor / info.max) * 100);
                [code, U.chave(info.label)].concat(APELIDOS_CONF[code] || []).forEach(k => { conferencia[k] = valor; });
                return {
                    codigo: code, nome: info.label, valor, max: info.max,
                    classificacao: cl.label, tom: TOM[cl.idx],
                    zonas: zonas(code),
                    extra: `Itens ${info.itens} · ${pct}% do máximo`
                };
            });

            return {
                sigla: ctx.sigla || 'SNAP-IV',
                nome: 'SNAP-IV',
                respondente: null,   // a tela não distingue pais/responsável de professor
                norma: 'Pontos de corte do MTA-SNAP-IV (Mattos et al., 2006)',
                principal: null,     // sem escore total: três subescalas independentes
                regua: null,
                subescalas,
                linhas: null,
                indicacao: null,     // a tela não emite frase-resumo
                conferencia
            };
        }
    });
})();

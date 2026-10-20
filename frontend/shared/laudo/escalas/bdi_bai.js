/* ============================================================================
   CORTEX · Laudo Online — LEITORES: BDI-II e BAI
   (frontend/shared/laudo/escalas/bdi_bai.js) · sprint LO-6
   ----------------------------------------------------------------------------
   Mesma conta das telas de correção:
     BDI-II → frontend/correcao/bdiii/bdiii_resultado.js  (rota da sigla 'BDI-II'
              pela convenção slug 'bdiii'; a antiga correcao/bdi/bdi_resultado.js
              também espera 'BDI-II', não é roteada e não tem sigla própria)
     BAI    → frontend/correcao/bai/bai_resultado.js
   Escore total = soma das notas dos itens cadastrados na norma (instrumentos_itens);
   resposta ausente/não numérica não soma. Faixas fixas no JS das telas.
   Dados esperados: ctx.norma (linha ativa), ctx.itens com `numero` e, no BDI-II,
   `opcoes` (["frase",...] → nota = índice  |  [{texto,valor},...] → nota = valor).
   ============================================================================ */
(function () {
    'use strict';
    const E = window.LaudoEscalas;
    const U = E.util;

    // ── Constantes copiadas das telas ───────────────────────────────────────
    const BDI = {
        SCORE_MAX: 63,
        ITEM_IDEACAO: 9,
        FAIXAS: [
            { min: 0,  max: 11, slug: 'minima', label: 'Depressão mínima' },
            { min: 12, max: 19, slug: 'leve',   label: 'Depressão leve' },
            { min: 20, max: 35, slug: 'mod',    label: 'Depressão moderada' },
            { min: 36, max: 63, slug: 'severa', label: 'Depressão severa' }
        ]
    };
    const BAI = {
        SCORE_MAX: 63,
        FAIXAS: [
            { min: 0,  max: 10, slug: 'minima', label: 'Ansiedade mínima' },
            { min: 11, max: 19, slug: 'leve',   label: 'Ansiedade leve' },
            { min: 20, max: 30, slug: 'mod',    label: 'Ansiedade moderada' },
            { min: 31, max: 63, slug: 'severa', label: 'Ansiedade severa' }
        ]
    };
    const TOM = { minima: 'ok', leve: 'leve', mod: 'mod', severa: 'grave' };

    function classificar(faixas, total) {
        for (const f of faixas) if (total >= f.min && total <= f.max) return f;
        return faixas[faixas.length - 1];
    }
    function zonas(faixas) { return faixas.map(f => ({ ate: f.max, rotulo: f.label, tom: TOM[f.slug] })); }

    // BDI-II: nota da opção escolhida (bdiii_resultado.js · opcaoValor)
    function opcaoValor(item, idx) {
        const ops = Array.isArray(item.opcoes) ? item.opcoes : [];
        const op = ops[idx];
        if (op == null) return null;
        if (typeof op === 'object') return (op.valor != null && !isNaN(op.valor)) ? parseInt(op.valor, 10) : null;
        return idx;
    }

    function exigirBase(ctx, sigla) {
        if (!ctx || !ctx.norma) throw new Error(`Norma ${sigla} não cadastrada`);
        if (!Array.isArray(ctx.itens) || !ctx.itens.length) throw new Error(`Itens do ${sigla} não carregados`);
    }
    function itensOrdenados(itens) { return itens.slice().sort((a, b) => a.numero - b.numero); }

    // ── BDI-II ──────────────────────────────────────────────────────────────
    function calcularBDI(ctx) {
        exigirBase(ctx, 'BDI-II');
        const respostas = ctx.respostas || {};
        const notaItem = {};
        let total = 0;
        for (const item of itensOrdenados(ctx.itens)) {
            let r = respostas[item.numero]; if (r == null) r = respostas[String(item.numero)];
            const idx = (r != null && !isNaN(r)) ? parseInt(r, 10) : null;
            const nota = (idx != null) ? opcaoValor(item, idx) : null;
            notaItem[item.numero] = nota;
            if (nota != null) total += nota;
        }
        const cl = classificar(BDI.FAIXAS, total);
        const temItem9 = ctx.itens.some(i => i.numero === BDI.ITEM_IDEACAO);
        const n9 = notaItem[BDI.ITEM_IDEACAO];
        const ideacao = temItem9 && n9 != null && n9 > 0;
        const linhas = ideacao ? [['Grupo 9 (ideação suicida)', 'Pontuado — avaliar risco clínico']] : null;
        return {
            sigla: ctx.sigla || 'BDI-II',
            nome: 'Inventário de Depressão de Beck II',
            respondente: 'Autorrelato',
            norma: null,
            principal: { rotulo: 'Escore total', valor: total, max: BDI.SCORE_MAX, sufixo: '', classificacao: cl.label, tom: TOM[cl.slug] },
            regua: { min: 0, max: BDI.SCORE_MAX, valor: total, zonas: zonas(BDI.FAIXAS), rotulo: 'Escore total' },
            subescalas: [],
            linhas,
            indicacao: cl.label + ' (escore ' + total + ' de ' + BDI.SCORE_MAX + ')' +
                (ideacao ? ' · grupo 9 (ideação suicida) pontuado — recomenda-se avaliação clínica detalhada do risco' : ''),
            conferencia: { total }
        };
    }

    // ── BAI ─────────────────────────────────────────────────────────────────
    function calcularBAI(ctx) {
        exigirBase(ctx, 'BAI');
        const respostas = ctx.respostas || {};
        let total = 0;
        for (const item of ctx.itens) {
            let r = respostas[item.numero]; if (r == null) r = respostas[String(item.numero)];
            const resp = (r != null && !isNaN(r)) ? parseInt(r, 10) : null;
            if (resp != null) total += resp;
        }
        const cl = classificar(BAI.FAIXAS, total);
        return {
            sigla: ctx.sigla || 'BAI',
            nome: 'Inventário de Ansiedade de Beck',
            respondente: 'Autorrelato',
            norma: null,
            principal: { rotulo: 'Escore total', valor: total, max: BAI.SCORE_MAX, sufixo: '', classificacao: cl.label, tom: TOM[cl.slug] },
            regua: { min: 0, max: BAI.SCORE_MAX, valor: total, zonas: zonas(BAI.FAIXAS), rotulo: 'Escore total' },
            subescalas: [],
            linhas: null,
            indicacao: cl.label + ' (escore ' + total + ' de ' + BAI.SCORE_MAX + ')',
            conferencia: { total }
        };
    }

    E.registrar({ siglas: ['BDI-II'], carregar: { itens: true }, calcular: calcularBDI });
    E.registrar({ siglas: ['BAI'], carregar: { itens: true }, calcular: calcularBAI });
})();

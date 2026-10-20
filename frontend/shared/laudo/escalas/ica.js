/* ============================================================================
   CORTEX · Laudo Online — LEITOR ICA (Inventário de Comportamentos Autísticos / ABC)
   (frontend/shared/laudo/escalas/ica.js) · sprint LO-6
   ----------------------------------------------------------------------------
   Mesma conta de frontend/correcao/ica/ica_resultado.js:
     - respostas 0/1 (Não/Sim) em correcoes.escores_brutos.respostas
     - a ÁREA de cada item vem do fator do item (instrumentos_itens.fator_id →
       instrumentos_fatores.fator_codigo: ES, RE, CO, LG, PS)
     - o PESO (1-4) vive no JS; "Sim" soma o peso, "Não" soma 0
     - total ponderado 0-158: ≥68 Alta · 54-67 Moderada · 47-53 Duvidosa · <47 Típico
   Como a tela, só itens cadastrados em instrumentos_itens entram na soma.
   ============================================================================ */
(function () {
    'use strict';
    const E = window.LaudoEscalas;
    if (!E) return;
    const chave = E.util.chave;

    // ── constantes copiadas de ica_resultado.js ──────────────────────────────
    const SCORE_MAX = 158;
    const PESOS = {
        1:4,2:2,3:4,4:1,5:2,6:2,7:2,8:3,9:3,10:3,11:4,12:4,13:2,14:3,15:2,16:4,17:3,18:2,19:4,20:1,
        21:3,22:4,23:3,24:4,25:4,26:3,27:3,28:2,29:2,30:2,31:2,32:3,33:3,34:1,35:2,36:2,37:1,38:4,39:4,40:4,
        41:1,42:2,43:3,44:3,45:1,46:3,47:4,48:4,49:2,50:4,51:3,52:3,53:4,54:2,55:1,56:3,57:4
    };
    const AREAS_INFO = {
        ES: { label: 'Estímulo Sensorial', max: 26 },
        RE: { label: 'Relacionamento', max: 38 },
        CO: { label: 'Uso do Corpo e Objetos', max: 38 },
        LG: { label: 'Linguagem', max: 31 },
        PS: { label: 'Desenvolvimento Pessoal e Social', max: 25 }
    };
    const AREAS_ORDEM = ['ES', 'RE', 'CO', 'LG', 'PS'];
    const TOM_SLUG = { tipico: 'ok', duvidosa: 'leve', moderada: 'mod', alta: 'grave' };

    function classificarTotal(total) {
        if (total >= 68) return {
            label: 'Alta probabilidade', slug: 'alta',
            desc: `A pontuação total ponderada (${total}/${SCORE_MAX}) está no nível de alta probabilidade de comportamentos do espectro autista (≥ 68 pontos). Indica forte recomendação de avaliação diagnóstica formal.`
        };
        if (total >= 54) return {
            label: 'Probabilidade moderada', slug: 'moderada',
            desc: `A pontuação total ponderada (${total}/${SCORE_MAX}) está na faixa de probabilidade moderada (54–67 pontos). Recomenda-se aprofundar a investigação clínica.`
        };
        if (total >= 47) return {
            label: 'Avaliação duvidosa', slug: 'duvidosa',
            desc: `A pontuação total ponderada (${total}/${SCORE_MAX}) está na faixa duvidosa/limítrofe (47–53 pontos). O resultado é inconclusivo e pede reavaliação e observação complementar.`
        };
        return {
            label: 'Desenvolvimento típico', slug: 'tipico',
            desc: `A pontuação total ponderada (${total}/${SCORE_MAX}) está abaixo do ponto de corte (< 47 pontos). Este resultado de triagem não sugere comportamentos do espectro autista em nível clinicamente significativo.`
        };
    }

    // itens: [{ numero, area }] — mesma forma que state.itens da tela
    function calcularResultados(correcao, itens) {
        const respostas = (correcao?.escores_brutos || {}).respostas || {};
        const pontosItem = {}, respItem = {};
        for (const item of itens) {
            const r = respostas[item.numero];
            const resp = (r != null && !isNaN(r)) ? parseInt(r, 10) : 0;
            respItem[item.numero] = resp;
            pontosItem[item.numero] = resp === 1 ? (PESOS[item.numero] || 0) : 0;
        }
        let total = 0;
        const subscores = {}; for (const c of AREAS_ORDEM) subscores[c] = 0;
        const simPorArea = {}; for (const c of AREAS_ORDEM) simPorArea[c] = 0;
        for (const item of itens) {
            total += pontosItem[item.numero];
            if (subscores[item.area] !== undefined) {
                subscores[item.area] += pontosItem[item.numero];
                if (respItem[item.numero] === 1) simPorArea[item.area] += 1;
            }
        }
        const respondidos = Object.keys(respostas).length;
        return { total, subscores, simPorArea, totalClassif: classificarTotal(total), respondidos };
    }

    E.registrar({
        siglas: ['ICA'],
        carregar: { fatores: false, itens: true, classificacoes: false, json: null },
        calcular(ctx) {
            if (!ctx.correcao) throw new Error('Nenhuma correção encontrada');
            if (!Array.isArray(ctx.itens) || !ctx.itens.length) throw new Error('Itens do ICA não cadastrados (instrumentos_itens)');
            // Área do item = fator_codigo (já resolvido pelo LaudoDados); fallback pelos fatores, como a tela
            const mapFator = {};
            (ctx.fatores || []).forEach(f => { mapFator[f.id] = f.fator_codigo; });
            const itens = ctx.itens.slice()
                .sort((a, b) => a.numero - b.numero)
                .map(i => ({ numero: i.numero, area: i.fator_codigo != null ? i.fator_codigo : (mapFator[i.fator_id] || null) }));

            const s = calcularResultados(ctx.correcao, itens);
            const cl = s.totalClassif;
            const conferencia = { total: s.total, escore_total: s.total };
            const subescalas = AREAS_ORDEM.map(code => {
                const info = AREAS_INFO[code];
                const score = s.subscores[code];
                const pct = Math.round((score / info.max) * 100);
                const sims = s.simPorArea[code];
                const itensCount = itens.filter(i => i.area === code).length;
                conferencia[code] = score;
                conferencia[chave(info.label)] = score;
                conferencia[code + '_pct'] = pct;
                return {
                    codigo: code, nome: info.label, valor: score, max: info.max,
                    classificacao: null, tom: 'neutro', zonas: null,
                    extra: `${pct}% · ${sims}/${itensCount} “Sim”`
                };
            });
            return {
                sigla: ctx.sigla || 'ICA',
                nome: 'ICA',
                respondente: 'Pais/responsável',
                norma: 'Krug (ABC) · Pedromônico & Marteletto (2005)',
                principal: {
                    rotulo: 'Escore Total', valor: s.total, max: SCORE_MAX, sufixo: '',
                    classificacao: cl.label, tom: TOM_SLUG[cl.slug]
                },
                regua: {
                    min: 0, max: SCORE_MAX, valor: s.total, rotulo: 'Escore Total',
                    zonas: [
                        { ate: 46, rotulo: 'Desenvolvimento típico', tom: 'ok' },
                        { ate: 53, rotulo: 'Avaliação duvidosa', tom: 'leve' },
                        { ate: 67, rotulo: 'Probabilidade moderada', tom: 'mod' },
                        { ate: SCORE_MAX, rotulo: 'Alta probabilidade', tom: 'grave' }
                    ]
                },
                subescalas,
                linhas: null,
                indicacao: cl.desc,
                conferencia
            };
        }
    });
})();

/* CORTEX · CPM-Raven — resultados lançados (modelo próprio) · sprint LO-7 */
(function () {
    'use strict';
    const SERIES = [['a', 'Série A', '#2F6FED'], ['ab', 'Série Ab', '#7C4DFF'], ['b', 'Série B', '#0EA5E9']];
    window.LancTeste.iniciar({
        titulo: 'CPM-RAVEN',
        nome: 'Matrizes Progressivas Coloridas de Raven',
        subtitulo: 'Raciocínio não verbal · séries A, Ab e B',
        sobre: 'As Matrizes Progressivas Coloridas de Raven avaliam o raciocínio não verbal (inteligência fluida) em crianças, por meio de três séries de problemas de complexidade crescente.',
        classificacoes: ['Intelectualmente superior', 'Acima da média', 'Intelectualmente médio', 'Abaixo da média', 'Intelectualmente deficiente'],
        contexto: [{ c: 'norma', r: 'Norma usada', tipo: 'texto', ph: 'idade/tipo de escola do relatório' }],
        grupos: [
            { cod: 'series', nome: 'Pontos por série', cor: '#2F6FED', medidas: SERIES.map(([c, n]) => ({ cod: c, nome: n, campos: ['bruto'], max: 12 })) },
            { cod: 'total', nome: 'Resultado geral', cor: '#141F3C', medidas: [{ cod: 'total', nome: 'Total', campos: ['bruto', 'percentil', 'classificacao'], max: 36 }] }
        ],
        principal(x) { const t = x.m.total; return { rotulo: 'Total', valor: t.bruto == null || t.bruto === '' ? '—' : String(t.bruto), nota: 'de 36 pontos' }; },
        laudo(x, H) {
            const t = x.m.total;
            const temSeries = SERIES.some(([c]) => !H.vazio(x.m[c].bruto));
            return [
                { titulo: 'Resultado', html: H.cards([{ rot: 'Pontos totais', valor: H.num(t.bruto), pe: 'de 36', escuro: true }, { rot: 'Percentil', valor: H.percentilTxt(t.percentil), pe: t.classificacao, classif: t.classificacao }]) },
                { titulo: 'Onde o resultado cai', html: H.reguas('Percentil do total', [{ rot: 'Total', percentil: t.percentil, classif: t.classificacao }]) },
                temSeries ? { titulo: 'Pontos por série', html: H.barrasValor({ tit: 'Acertos em cada série (máximo 12)', itens: SERIES.map(([c, n, cor]) => ({ rot: n, valor: x.m[c].bruto, max: 12, cor })) }) } : null,
                { titulo: 'Tabela de resultados', html: H.tabela({ cols: [{ k: 'rot', r: 'Medida' }, { k: 'bruto', r: 'Pontos', ctr: true }, { k: 'percentil', r: 'Percentil', ctr: true }, { k: 'classificacao', r: 'Classificação', ctr: true }],
                    linhas: SERIES.map(([c, n]) => ({ rot: n, bruto: x.m[c].bruto })).concat([{ rot: 'Total', bruto: t.bruto, percentil: t.percentil, classificacao: t.classificacao, destaque: true }]) }) }
            ];
        }
    });
})();

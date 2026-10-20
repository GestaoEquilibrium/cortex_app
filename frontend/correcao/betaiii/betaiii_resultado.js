/* CORTEX · BETA-III — resultados lançados (modelo próprio) · sprint LO-7 */
(function () {
    'use strict';
    const SUBS = [['rm', 'Raciocínio Matricial', '#2F6FED'], ['cod', 'Códigos', '#7C4DFF']];
    window.LancTeste.iniciar({
        titulo: 'BETA-III',
        nome: 'Teste Não Verbal de Inteligência Geral — BETA-III',
        subtitulo: 'Raciocínio Matricial e Códigos · QI estimado',
        sobre: 'O BETA-III é um teste não verbal de inteligência geral composto pelos subtestes Raciocínio Matricial e Códigos; os escores ponderados dos subtestes compõem a estimativa de QI.',
        contexto: [{ c: 'norma', r: 'Norma usada', tipo: 'texto', ph: 'idade/escolaridade do relatório' }],
        grupos: [
            { cod: 'subtestes', nome: 'Subtestes', cor: '#2F6FED', medidas: SUBS.map(([c, n]) => ({ cod: c, nome: n, campos: ['bruto', 'ponderado', 'percentil', 'classificacao'] })) },
            { cod: 'qi', nome: 'QI', cor: '#141F3C', medidas: [{ cod: 'qi', nome: 'QI', campos: ['escore', 'intervalo', 'percentil', 'classificacao'], rotulos: { escore: 'QI' } }] }
        ],
        principal(x) { const q = x.m.qi; return { rotulo: 'QI', valor: q.escore == null || q.escore === '' ? '—' : String(q.escore), nota: q.classificacao || '' }; },
        laudo(x, H) {
            const q = x.m.qi, s = SUBS.map(([c]) => x.m[c]);
            return [
                { titulo: 'Resultado', html: H.cards([{ rot: 'QI', valor: H.num(q.escore), pe: H.vazio(q.intervalo) ? '' : 'IC 95% ' + q.intervalo, escuro: true }, { rot: 'Percentil', valor: H.percentilTxt(q.percentil), pe: q.classificacao, classif: q.classificacao }]) },
                H.vazio(q.escore) ? null : { titulo: 'Posição na curva normal', html: H.curva({ tit: 'QI na distribuição da população (média 100, DP 15)', valor: q.escore, classif: q.classificacao, rotValor: 'QI', nota: H.vazio(q.intervalo) ? '' : 'IC 95%: ' + q.intervalo }) },
                s.some(m => !H.vazio(m.ponderado)) ? { titulo: 'Perfil dos subtestes', html: H.ponderados({ tit: 'Escores ponderados (média 10, DP 3)', itens: s.map(m => ({ rot: m.nome, valor: m.ponderado, classif: m.classificacao })) }) } : null,
                { titulo: 'Tabela de resultados', html: H.tabela({ cols: [{ k: 'rot', r: 'Subteste / índice' }, { k: 'bruto', r: 'Bruto', ctr: true }, { k: 'ponderado', r: 'Ponderado / QI', ctr: true }, { k: 'percentil', r: 'Percentil', ctr: true }, { k: 'classificacao', r: 'Classificação', ctr: true }],
                    linhas: s.map(m => ({ rot: m.nome, bruto: m.bruto, ponderado: m.ponderado, percentil: m.percentil, classificacao: m.classificacao })).concat([{ rot: 'QI' + (H.vazio(q.intervalo) ? '' : ' (IC 95% ' + q.intervalo + ')'), ponderado: q.escore, percentil: q.percentil, classificacao: q.classificacao, destaque: true }]) }) }
            ];
        }
    });
})();

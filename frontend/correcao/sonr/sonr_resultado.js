/* CORTEX · SON-R (2½-7 e 6-40) — resultados (modelo próprio) · sprint LO-7
   Subtestes em escore padronizado (média 10, DP 3); escalas e QI (média 100, DP 15).
   Os nomes podem ser ajustados na entrada; medida sem número não aparece no laudo. */
(function () {
    'use strict';
    const SUBS = [
        ['categorias', 'Categorias', '#2F6FED'], ['mosaicos', 'Mosaicos', '#7C4DFF'], ['analogias', 'Analogias', '#0EA5E9'],
        ['padroes', 'Padrões', '#0D9488'], ['situacoes', 'Situações', '#EA580C']
    ];
    const ESCALAS = [['raciocinio', 'Escala de Raciocínio'], ['execucao', 'Escala de Execução / Espacial']];
    window.LancTeste.iniciar({
        titulo: 'SON-R',
        nome: 'Teste Não Verbal de Inteligência SON-R',
        subtitulo: 'Raciocínio e habilidades espaciais sem uso da linguagem',
        sobre: 'O SON-R é um teste não verbal de inteligência aplicado com instruções por gestos e demonstração; os subtestes compõem escalas de raciocínio e de execução e a estimativa de QI.',
        contexto: [
            { c: 'forma', r: 'Forma', tipo: 'select', opcoes: ['SON-R 2½-7', 'SON-R 6-40'] },
            { c: 'norma', r: 'Norma usada', tipo: 'texto', ph: 'idade de referência do relatório' }
        ],
        grupos: [
            { cod: 'subtestes', nome: 'Subtestes (preencha os da forma aplicada)', cor: '#2F6FED', medidas: SUBS.map(([c, n]) => ({ cod: c, nome: n, campos: ['bruto', 'ponderado', 'classificacao'], rotulos: { ponderado: 'Padronizado' } })) },
            { cod: 'escalas', nome: 'Escalas e QI', cor: '#141F3C', medidas: ESCALAS.map(([c, n]) => ({ cod: c, nome: n, campos: ['escore', 'intervalo', 'percentil', 'classificacao'] })).concat([{ cod: 'qi', nome: 'QI Total', campos: ['escore', 'intervalo', 'percentil', 'classificacao'], rotulos: { escore: 'QI' } }]) }
        ],
        principal(x) { const q = x.m.qi; return { rotulo: 'QI', valor: q.escore == null || q.escore === '' ? '—' : String(q.escore), nota: q.classificacao || (x.contexto.forma || '') }; },
        laudo(x, H) {
            const q = x.m.qi;
            const s = SUBS.map(([c, , cor]) => Object.assign({ cor }, x.m[c])).filter(m => !H.vazio(m.ponderado) || !H.vazio(m.bruto));
            const e = ESCALAS.map(([c]) => x.m[c]).filter(m => !H.vazio(m.escore));
            const comp = e.concat(H.vazio(q.escore) ? [] : [q]);
            return [
                H.vazio(q.escore) && H.vazio(q.percentil) ? null : { titulo: 'Resultado', html: H.cards([{ rot: 'QI Total', valor: H.num(q.escore), pe: H.vazio(q.intervalo) ? (x.contexto.forma || '') : 'IC ' + q.intervalo, escuro: true }, { rot: 'Percentil', valor: H.percentilTxt(q.percentil), pe: q.classificacao, classif: q.classificacao }]) },
                H.vazio(q.escore) ? null : { titulo: 'Posição na curva normal', html: H.curva({ tit: 'QI na distribuição da população (média 100, DP 15)', valor: q.escore, classif: q.classificacao, rotValor: 'QI', nota: H.vazio(q.intervalo) ? '' : 'IC: ' + q.intervalo }) },
                comp.length > 1 ? { titulo: 'Escalas', html: H.padronizados({ tit: 'Escalas e QI (média 100, DP 15)', itens: comp.map(m => ({ rot: m.nome, valor: m.escore, classif: m.classificacao })) }) } : null,
                s.some(m => !H.vazio(m.ponderado)) ? { titulo: 'Perfil dos subtestes', html: H.ponderados({ tit: 'Escores padronizados dos subtestes (média 10, DP 3)', chips: s.some(m => !H.vazio(m.classificacao)), itens: s.map(m => ({ rot: m.nome, valor: m.ponderado, classif: m.classificacao, cor: m.cor })) }) } : null,
                { titulo: 'Tabela de resultados', html: H.tabela({ cols: [{ k: 'rot', r: 'Subteste / escala' }, { k: 'bruto', r: 'Bruto', ctr: true }, { k: 'ponderado', r: 'Padronizado', ctr: true }, { k: 'escore', r: 'Escore / QI', ctr: true }, { k: 'intervalo', r: 'IC', ctr: true }, { k: 'percentil', r: 'Percentil', ctr: true }, { k: 'classificacao', r: 'Classificação', ctr: true }],
                    linhas: s.map(m => ({ rot: m.nome, bruto: m.bruto, ponderado: m.ponderado, classificacao: m.classificacao })).concat(e.map(m => ({ rot: m.nome, escore: m.escore, intervalo: m.intervalo, percentil: m.percentil, classificacao: m.classificacao, destaque: true })), H.vazio(q.escore) && H.vazio(q.percentil) ? [] : [{ rot: 'QI Total', escore: q.escore, intervalo: q.intervalo, percentil: q.percentil, classificacao: q.classificacao, destaque: true }]) }) }
            ];
        }
    });
})();

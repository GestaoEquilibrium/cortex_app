/* CORTEX · IHS-2 — resultados lançados (modelo próprio) · sprint LO-7
   Só escores do relatório de correção (nenhum item do inventário). */
(function () {
    'use strict';
    const FAT = [
        ['f1', 'F1 · Conversação assertiva', '#2F6FED'],
        ['f2', 'F2 · Abordagem afetivo-sexual', '#DB2777'],
        ['f3', 'F3 · Expressão de sentimento positivo', '#16A34A'],
        ['f4', 'F4 · Autocontrole / enfrentamento', '#EA580C'],
        ['f5', 'F5 · Desenvoltura social', '#7C4DFF']
    ];
    window.LancTeste.iniciar({
        titulo: 'IHS-2',
        nome: 'Inventário de Habilidades Sociais 2 (Del-Prette)',
        subtitulo: 'Repertório de habilidades sociais · escore geral e fatores',
        sobre: 'O IHS-2 avalia o repertório de habilidades sociais em diferentes situações do cotidiano, com escore geral e escores por fator, interpretados por percentil.',
        classificacoes: ['Repertório altamente elaborado', 'Repertório elaborado', 'Bom repertório', 'Repertório abaixo da média', 'Repertório deficitário'],
        contexto: [{ c: 'norma', r: 'Norma usada', tipo: 'texto', ph: 'sexo/idade do relatório' }],
        grupos: [
            { cod: 'geral', nome: 'Escore geral', cor: '#141F3C', medidas: [{ cod: 'total', nome: 'Escore geral', campos: ['bruto', 'percentil', 'classificacao'] }] },
            { cod: 'fatores', nome: 'Fatores', cor: '#2F6FED', medidas: FAT.map(([c, n]) => ({ cod: c, nome: n, campos: ['bruto', 'percentil', 'classificacao'] })) }
        ],
        principal(x) { const t = x.m.total; return { rotulo: 'Escore geral', valor: t.percentil == null || t.percentil === '' ? '—' : 'P' + String(t.percentil).replace(/^P/i, ''), nota: t.classificacao || '' }; },
        laudo(x, H) {
            const t = x.m.total, f = FAT.map(([c, , cor]) => Object.assign({ cor }, x.m[c]));
            return [
                { titulo: 'Escore geral', html: H.cards([{ rot: 'Escore bruto', valor: H.num(t.bruto), escuro: true }, { rot: 'Percentil', valor: H.percentilTxt(t.percentil), pe: t.classificacao, classif: t.classificacao }]) },
                { titulo: 'Perfil dos fatores', html: H.barrasPercentil({ tit: 'Percentil por fator', itens: [{ rot: 'Escore geral', percentil: t.percentil, classif: t.classificacao, cor: '#141F3C' }].concat(f.map(m => ({ rot: m.nome, percentil: m.percentil, classif: m.classificacao, cor: m.cor }))) }) },
                { titulo: 'Tabela de resultados', html: H.tabela({ cols: [{ k: 'rot', r: 'Fator' }, { k: 'bruto', r: 'Bruto', ctr: true }, { k: 'percentil', r: 'Percentil', ctr: true }, { k: 'classificacao', r: 'Interpretação', ctr: true }],
                    linhas: f.map(m => ({ rot: m.nome, bruto: m.bruto, percentil: m.percentil, classificacao: m.classificacao })).concat([{ rot: 'Escore geral', bruto: t.bruto, percentil: t.percentil, classificacao: t.classificacao, destaque: true }]) }) }
            ];
        }
    });
})();

/* CORTEX · Torre de Londres — resultados lançados (modelo próprio) · sprint LO-7
   Os nomes das medidas podem ser ajustados na entrada para ficarem iguais aos do relatório. */
(function () {
    'use strict';
    const MED = [
        ['acertos', 'Escore total (acertos)', '#2F6FED'],
        ['movimentos', 'Movimentos adicionais', '#7C4DFF'],
        ['t_inicio', 'Tempo de início', '#0EA5E9'],
        ['t_execucao', 'Tempo de execução', '#0D9488'],
        ['violacoes', 'Violações de regra', '#EA580C']
    ];
    window.LancTeste.iniciar({
        titulo: 'TORRE DE LONDRES',
        nome: 'Teste Torre de Londres',
        subtitulo: 'Planejamento e resolução de problemas',
        sobre: 'A Torre de Londres avalia o planejamento e a resolução de problemas: a pessoa reproduz configurações-modelo movendo peças com o menor número de movimentos e respeitando regras.',
        contexto: [{ c: 'norma', r: 'Norma usada', tipo: 'texto', ph: 'idade/escolaridade do relatório' }],
        grupos: [{ cod: 'medidas', nome: 'Medidas', cor: '#2F6FED', medidas: MED.map(([c, n]) => ({ cod: c, nome: n, campos: ['valor', 'percentil', 'classificacao'] })) }],
        principal(x) { const a = x.m.acertos; return { rotulo: 'Escore total', valor: a.valor == null || a.valor === '' ? '—' : String(a.valor), nota: a.classificacao || '' }; },
        laudo(x, H) {
            const ms = MED.map(([c, , cor]) => Object.assign({ cor }, x.m[c])).filter(m => ['valor', 'percentil', 'classificacao'].some(k => !H.vazio(m[k])));
            const a = x.m.acertos;
            return [
                { titulo: 'Resultado', html: H.cards([{ rot: a.nome, valor: H.num(a.valor), escuro: true }, { rot: 'Percentil', valor: H.percentilTxt(a.percentil), pe: a.classificacao, classif: a.classificacao }]) },
                { titulo: 'Perfil das medidas', html: H.barrasPercentil({ tit: 'Percentil de cada medida', itens: ms.map(m => ({ rot: m.nome, percentil: m.percentil, classif: m.classificacao, cor: m.cor })) }) },
                { titulo: 'Tabela de resultados', html: H.tabela({ cols: [{ k: 'rot', r: 'Medida' }, { k: 'valor', r: 'Resultado', ctr: true }, { k: 'percentil', r: 'Percentil', ctr: true }, { k: 'classificacao', r: 'Classificação', ctr: true }], linhas: ms.map(m => ({ rot: m.nome, valor: m.valor, percentil: m.percentil, classificacao: m.classificacao })) }) }
            ];
        }
    });
})();

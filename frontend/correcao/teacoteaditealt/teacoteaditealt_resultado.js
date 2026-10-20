/* CORTEX · TEACO-FF / TEADI / TEALT — resultados lançados (modelo próprio) · sprint LO-7 */
(function () {
    'use strict';
    const TESTES = [
        ['teaco', 'TEACO-FF — Atenção concentrada', '#2F6FED'],
        ['teadi', 'TEADI — Atenção dividida', '#7C4DFF'],
        ['tealt', 'TEALT — Atenção alternada', '#0EA5E9']
    ];
    window.LancTeste.iniciar({
        titulo: 'TEACO · TEADI · TEALT',
        nome: 'Testes de Atenção Concentrada, Dividida e Alternada',
        subtitulo: 'Acertos, erros e omissões · pontos e percentil',
        sobre: 'O TEACO-FF, o TEADI e o TEALT avaliam, respectivamente, a atenção concentrada, dividida e alternada por meio de tarefas de cancelamento com tempo limitado.',
        contexto: [{ c: 'norma', r: 'Norma usada', tipo: 'texto', ph: 'idade/escolaridade do relatório' }],
        grupos: TESTES.map(([c, n, cor]) => ({ cod: c, nome: n, cor, medidas: [{ cod: c, nome: n.split(' — ')[0], campos: ['acertos', 'erros', 'omissoes', 'pontos', 'percentil', 'classificacao'] }] })),
        laudo(x, H) {
            const ms = TESTES.map(([c, n, cor]) => Object.assign({ cor, area: n.split(' — ')[1] }, x.m[c]));
            const feitos = ms.filter(m => ['acertos', 'pontos', 'percentil', 'classificacao'].some(k => !H.vazio(m[k])));
            return [
                { titulo: 'Resultado por tipo de atenção', html: H.cards(feitos.map(m => ({ rot: m.nome + ' · ' + m.area, valor: H.percentilTxt(m.percentil), pe: m.classificacao || (H.vazio(m.pontos) ? '' : H.num(m.pontos) + ' pontos'), classif: m.classificacao }))) },
                { titulo: 'Comparação entre os testes', html: H.barrasPercentil({ tit: 'Percentil de cada teste', itens: feitos.map(m => ({ rot: m.nome, percentil: m.percentil, classif: m.classificacao, cor: m.cor })) }) },
                { titulo: 'Acertos, erros e omissões', html: H.composicao({ tit: 'Composição das respostas', itens: feitos.map(m => ({ rot: m.nome, acertos: m.acertos, erros: m.erros, omissoes: m.omissoes })) }) },
                { titulo: 'Tabela de resultados', html: H.tabela({ cols: [{ k: 'rot', r: 'Teste' }, { k: 'acertos', r: 'Acertos', ctr: true }, { k: 'erros', r: 'Erros', ctr: true }, { k: 'omissoes', r: 'Omissões', ctr: true }, { k: 'pontos', r: 'Pontos', ctr: true }, { k: 'percentil', r: 'Percentil', ctr: true }, { k: 'classificacao', r: 'Classificação', ctr: true }],
                    linhas: feitos.map(m => ({ rot: m.nome, acertos: m.acertos, erros: m.erros, omissoes: m.omissoes, pontos: m.pontos, percentil: m.percentil, classificacao: m.classificacao })) }) }
            ];
        }
    });
})();

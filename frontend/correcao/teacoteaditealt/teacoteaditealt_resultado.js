/* CORTEX · TEACO-2 / TEADI-2 / TEALT-2 — resultados lançados (modelo próprio) · sprint LO-7
   Cada teste tem a sua seção (título com o nome do teste): o Laudo Online usa
   essas partes quando o Gerador escreve TEACO-2, TEADI-2 ou TEALT-2 separados. */
(function () {
    'use strict';
    const TESTES = [
        ['teaco', 'TEACO-2', 'Atenção concentrada', '#2F6FED'],
        ['teadi', 'TEADI-2', 'Atenção dividida', '#7C4DFF'],
        ['tealt', 'TEALT-2', 'Atenção alternada', '#0EA5E9']
    ];
    window.LancTeste.iniciar({
        titulo: 'TEACO-2 · TEADI-2 · TEALT-2',
        nome: 'Testes de Atenção Concentrada, Dividida e Alternada',
        subtitulo: 'Acertos, erros e omissões · pontos e percentil',
        sobre: 'O TEACO, o TEADI e o TEALT avaliam, respectivamente, a atenção concentrada, dividida e alternada por meio de tarefas de cancelamento com tempo limitado.',
        contexto: [{ c: 'norma', r: 'Norma usada', tipo: 'texto', ph: 'região/idade/escolaridade do relatório' }],
        grupos: TESTES.map(([c, n, area, cor]) => ({ cod: c, nome: `${n} — ${area}`, cor, medidas: [{ cod: c, nome: n, campos: ['acertos', 'erros', 'omissoes', 'pontos', 'percentil', 'classificacao'] }] })),
        laudo(x, H) {
            const ms = TESTES.map(([c, , area, cor]) => Object.assign({ cor, area }, x.m[c]));
            const feitos = ms.filter(m => ['acertos', 'pontos', 'percentil', 'classificacao'].some(k => !H.vazio(m[k])));
            const porTeste = feitos.map(m => ({
                titulo: `${m.nome} — ${m.area}`,
                html: H.cards([{ rot: 'Pontos', valor: H.num(m.pontos), escuro: true }, { rot: 'Percentil', valor: H.percentilTxt(m.percentil), pe: m.classificacao, classif: m.classificacao }])
                    + H.composicao({ tit: `${m.nome} · composição das respostas`, itens: [{ rot: m.nome, acertos: m.acertos, erros: m.erros, omissoes: m.omissoes }] })
            }));
            return [
                feitos.length > 1 ? { titulo: 'Resultado por tipo de atenção', html: H.cards(feitos.map(m => ({ rot: m.nome + ' · ' + m.area, valor: H.percentilTxt(m.percentil), pe: m.classificacao || (H.vazio(m.pontos) ? '' : H.num(m.pontos) + ' pontos'), classif: m.classificacao }))) } : null,
                feitos.length > 1 ? { titulo: 'Comparação entre os testes', html: H.barrasPercentil({ tit: 'Percentil de cada teste', itens: feitos.map(m => ({ rot: m.nome, percentil: m.percentil, classif: m.classificacao, cor: m.cor })) }) } : null
            ].concat(porTeste, [
                { titulo: 'Tabela de resultados', html: H.tabela({ cols: [{ k: 'rot', r: 'Teste' }, { k: 'acertos', r: 'Acertos', ctr: true }, { k: 'erros', r: 'Erros', ctr: true }, { k: 'omissoes', r: 'Omissões', ctr: true }, { k: 'pontos', r: 'Pontos', ctr: true }, { k: 'percentil', r: 'Percentil', ctr: true }, { k: 'classificacao', r: 'Classificação', ctr: true }],
                    linhas: feitos.map(m => ({ rot: m.nome, acertos: m.acertos, erros: m.erros, omissoes: m.omissoes, pontos: m.pontos, percentil: m.percentil, classificacao: m.classificacao })) }) }
            ]);
        }
    });
})();

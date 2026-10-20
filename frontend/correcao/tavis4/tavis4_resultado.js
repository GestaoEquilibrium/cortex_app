/* CORTEX · TAVIS-4 — resultados lançados (modelo próprio) · sprint LO-7 */
(function () {
    'use strict';
    const TAREFAS = [
        ['t1', 'Tarefa 1 — Atenção seletiva', '#2F6FED'],
        ['t2', 'Tarefa 2 — Atenção alternada', '#7C4DFF'],
        ['t3', 'Tarefa 3 — Atenção sustentada', '#0EA5E9']
    ];
    const MEDIDAS = [['acertos', 'Acertos'], ['omissoes', 'Erros por omissão'], ['acao', 'Erros por ação'], ['tr', 'Tempo médio de reação']];
    window.LancTeste.iniciar({
        titulo: 'TAVIS-4',
        nome: 'Teste de Atenção Visual — 4ª edição',
        subtitulo: 'Atenção seletiva, alternada e sustentada · aplicação computadorizada',
        sobre: 'O TAVIS-4 avalia a atenção visual em três tarefas computadorizadas (seletiva, alternada e sustentada), com resultados em erros e tempo de reação comparados à faixa etária.',
        contexto: [{ c: 'norma', r: 'Norma usada', tipo: 'texto', ph: 'faixa etária/série do relatório' }],
        grupos: TAREFAS.map(([t, nome, cor]) => ({
            cod: t, nome, cor,
            medidas: MEDIDAS.map(([m, n]) => ({ cod: `${t}_${m}`, nome: n, campos: ['valor', 'percentil', 'classificacao'], rotulos: m === 'tr' ? { valor: 'Tempo' } : m === 'acertos' ? { valor: 'Acertos' } : { valor: 'Erros' } }))
        })),
        laudo(x, H) {
            const porTarefa = TAREFAS.map(([t, nome, cor]) => ({ t, nome, cor, ms: MEDIDAS.map(([m]) => x.m[`${t}_${m}`]) }));
            const itens = [];
            porTarefa.forEach(g => { itens.push({ grupo: g.nome }); g.ms.filter(m => !H.vazio(m.percentil) || !H.vazio(m.classificacao)).forEach(m => itens.push({ rot: m.nome, percentil: m.percentil, classif: m.classificacao, cor: g.cor })); });
            const linhas = [];
            porTarefa.forEach(g => { linhas.push({ grupo: g.nome, cor: g.cor }); g.ms.forEach(m => linhas.push({ rot: m.nome, valor: m.valor, percentil: m.percentil, classificacao: m.classificacao })); });
            const resumo = porTarefa.map(g => {
                const tr = g.ms[3];
                return { rot: g.nome.replace(/^Tarefa \d — /, ''), valor: H.percentilTxt(tr.percentil) === '—' ? H.num(tr.valor) : H.percentilTxt(tr.percentil), pe: tr.classificacao ? 'Tempo de reação · ' + tr.classificacao : 'Tempo de reação', classif: tr.classificacao };
            });
            return [
                { titulo: 'Visão geral das três tarefas', html: H.cards(resumo) },
                { titulo: 'Perfil por tarefa', html: H.barrasPercentil({ tit: 'Percentil de cada medida', itens }) },
                { titulo: 'Tabela de resultados', html: H.tabela({ cols: [{ k: 'rot', r: 'Medida' }, { k: 'valor', r: 'Resultado', ctr: true }, { k: 'percentil', r: 'Percentil', ctr: true }, { k: 'classificacao', r: 'Classificação', ctr: true }], linhas }) }
            ];
        }
    });
})();

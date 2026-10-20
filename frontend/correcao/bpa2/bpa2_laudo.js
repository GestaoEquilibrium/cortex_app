/* CORTEX · BPA-2 — laudo (modelo próprio) · sprint LO-7
   Acertos, erros e omissões vêm da correção pelo crivo (bpa2_respostas, tela
   bpa2_resultado.html). Pontos, percentil e classificação são lançados a partir
   da tabela normativa do manual / relatório — o CORTEX não tem a norma do BPA-2. */
(function () {
    'use strict';
    const SUBS = [['AC', 'Atenção Concentrada', '#2F6FED'], ['AD', 'Atenção Dividida', '#7C4DFF'], ['AA', 'Atenção Alternada', '#0EA5E9']];
    window.LancTeste.iniciar({
        titulo: 'BPA-2',
        nome: 'Bateria Psicológica para Avaliação da Atenção — 2ª edição',
        subtitulo: 'Atenção concentrada, dividida e alternada · atenção geral',
        sobre: 'A BPA-2 avalia a atenção concentrada, dividida e alternada por tarefas de cancelamento; a atenção geral reúne os três subtestes. Acertos, erros e omissões vêm da correção pelo crivo no CORTEX.',
        contexto: [{ c: 'norma', r: 'Norma usada', tipo: 'texto', ph: 'idade/escolaridade da tabela' }],
        grupos: [
            { cod: 'subtestes', nome: 'Subtestes (acertos, erros e omissões vêm do crivo)', cor: '#2F6FED', medidas: SUBS.map(([c, n]) => ({ cod: c, nome: n, campos: ['acertos', 'erros', 'omissoes', 'pontos', 'percentil', 'classificacao'] })) },
            { cod: 'geral', nome: 'Atenção Geral', cor: '#141F3C', medidas: [{ cod: 'AG', nome: 'Atenção Geral', campos: ['pontos', 'percentil', 'classificacao'] }] }
        ],
        async extra(client, aplicacao) {
            const { data, error } = await client.from('bpa2_respostas').select('subteste, acertos, erros, omissoes').eq('aplicacao_id', aplicacao.id);
            if (error) throw error;
            const medidas = {};
            (data || []).forEach(r => { medidas[r.subteste] = { acertos: r.acertos, erros: r.erros, omissoes: r.omissoes }; });
            return { medidas };
        },
        principal(x) { const g = x.m.AG; return { rotulo: 'Atenção Geral', valor: g.percentil == null || g.percentil === '' ? (g.pontos == null ? '—' : String(g.pontos)) : 'P' + String(g.percentil).replace(/^P/i, ''), nota: g.classificacao || '' }; },
        laudo(x, H) {
            const s = SUBS.map(([c, n, cor]) => Object.assign({ cor }, x.m[c])), g = x.m.AG;
            return [
                { titulo: 'Resultado', html: H.cards(s.concat([Object.assign({ cor: '#141F3C' }, g)]).map(m => ({ rot: m.nome, valor: H.percentilTxt(m.percentil), pe: m.classificacao || (H.vazio(m.pontos) ? '' : H.num(m.pontos) + ' pontos'), classif: m.classificacao }))) },
                { titulo: 'Comparação entre os tipos de atenção', html: H.barrasPercentil({ tit: 'Percentil de cada subteste', itens: s.map(m => ({ rot: m.nome, percentil: m.percentil, classif: m.classificacao, cor: m.cor })).concat([{ rot: 'Atenção Geral', percentil: g.percentil, classif: g.classificacao, cor: '#141F3C' }]) }) },
                { titulo: 'Acertos, erros e omissões', hint: 'contados pelo crivo no CORTEX', html: H.composicao({ tit: 'Composição das respostas', itens: s.map(m => ({ rot: m.nome, acertos: m.acertos, erros: m.erros, omissoes: m.omissoes })) }) },
                { titulo: 'Tabela de resultados', html: H.tabela({ cols: [{ k: 'rot', r: 'Subteste' }, { k: 'acertos', r: 'Acertos', ctr: true }, { k: 'erros', r: 'Erros', ctr: true }, { k: 'omissoes', r: 'Omissões', ctr: true }, { k: 'pontos', r: 'Pontos', ctr: true }, { k: 'percentil', r: 'Percentil', ctr: true }, { k: 'classificacao', r: 'Classificação', ctr: true }],
                    linhas: s.map(m => ({ rot: m.nome, acertos: m.acertos, erros: m.erros, omissoes: m.omissoes, pontos: m.pontos, percentil: m.percentil, classificacao: m.classificacao })).concat([{ rot: 'Atenção Geral', pontos: g.pontos, percentil: g.percentil, classificacao: g.classificacao, destaque: true }]) }) }
            ];
        }
    });
})();

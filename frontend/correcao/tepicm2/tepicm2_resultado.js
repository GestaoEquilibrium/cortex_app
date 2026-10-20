/* CORTEX · TEPIC-M-2 — resultados lançados (modelo próprio) · sprint LO-7 */
(function () {
    'use strict';
    window.LancTeste.iniciar({
        titulo: 'TEPIC-M-2',
        nome: 'Teste Pictórico de Memória — 2ª edição',
        subtitulo: 'Memória visual de curto prazo',
        sobre: 'O TEPIC-M-2 avalia a memória visual a partir da evocação de figuras apresentadas em uma prancha, com normas por idade e escolaridade.',
        contexto: [{ c: 'norma', r: 'Norma usada', tipo: 'texto', ph: 'idade/escolaridade do relatório' }],
        grupos: [{ cod: 'memoria', nome: 'Memória visual', cor: '#8B5CF6', medidas: [{ cod: 'total', nome: 'Memória visual de curto prazo', campos: ['bruto', 'percentil', 'classificacao'], rotulos: { bruto: 'Pontos' } }] }],
        principal(x) { const m = x.m.total; return { rotulo: 'Pontos', valor: H(m.bruto), nota: H(m.percentil) === '—' ? '' : 'P' + String(m.percentil).replace(/^P/i, '') }; function H(v) { return v == null || v === '' ? '—' : String(v); } },
        laudo(x, H) {
            const m = x.m.total;
            return [
                { titulo: 'Resultado', html: H.cards([{ rot: 'Pontos', valor: H.num(m.bruto), pe: m.nome, escuro: true }, { rot: 'Percentil', valor: H.percentilTxt(m.percentil), pe: m.classificacao, classif: m.classificacao }]) },
                { titulo: 'Onde o resultado cai', html: H.reguas('Percentil da memória visual', [{ rot: 'Memória visual', percentil: m.percentil, classif: m.classificacao }]) },
                { titulo: 'Tabela de resultados', html: H.tabela({ cols: [{ k: 'rot', r: 'Medida' }, { k: 'bruto', r: 'Pontos', ctr: true }, { k: 'percentil', r: 'Percentil', ctr: true }, { k: 'classificacao', r: 'Classificação', ctr: true }], linhas: [{ rot: m.nome, bruto: m.bruto, percentil: m.percentil, classificacao: m.classificacao }] }) }
            ];
        }
    });
})();

/* CORTEX · TDE-II — resultados lançados (modelo próprio) · sprint LO-7 */
(function () {
    'use strict';
    const COR = { escrita: '#7C4DFF', aritmetica: '#F59E0B', leitura: '#2F6FED' };
    const SUBS = [['escrita', 'Escrita'], ['aritmetica', 'Aritmética'], ['leitura', 'Leitura']];
    window.LancTeste.iniciar({
        titulo: 'TDE-II',
        nome: 'Teste de Desempenho Escolar — 2ª edição',
        subtitulo: 'Desempenho escolar · escrita, aritmética e leitura',
        sobre: 'O TDE-II avalia o desempenho em habilidades escolares básicas (escrita, aritmética e leitura), com normas por ano escolar.',
        contexto: [
            { c: 'ano_escolar', r: 'Ano escolar', tipo: 'select', opcoes: ['1º ano', '2º ano', '3º ano', '4º ano', '5º ano', '6º ano', '7º ano', '8º ano', '9º ano'] },
            { c: 'versao', r: 'Versão aplicada', tipo: 'texto', ph: 'ex.: 1º ao 4º ano' },
            { c: 'norma', r: 'Norma usada', tipo: 'texto', ph: 'como consta no relatório' }
        ],
        grupos: [{ cod: 'subtestes', nome: 'Subtestes', cor: '#2F6FED', medidas: SUBS.map(([cod, nome]) => ({ cod, nome, campos: ['bruto', 'percentil', 'classificacao'] })) }],
        principal(x) {
            const piores = x.medidas.filter(m => m.percentil != null && m.percentil !== '');
            return piores.length ? { rotulo: 'Subtestes', valor: piores.length + '/3', nota: 'com resultado' } : null;
        },
        laudo(x, H) {
            const ms = x.medidas;
            return [
                { titulo: 'Resultado por subteste', html: H.cards(ms.map(m => ({ rot: m.nome, valor: H.percentilTxt(m.percentil), pe: m.classificacao || (H.vazio(m.bruto) ? '' : 'bruto ' + H.num(m.bruto)), classif: m.classificacao }))) },
                { titulo: 'Desempenho comparado ao ano escolar', html: H.barrasPercentil({ tit: 'Percentil de cada subteste', itens: ms.map(m => ({ rot: m.nome, percentil: m.percentil, classif: m.classificacao, cor: COR[m.cod] })), nota: x.contexto.ano_escolar ? 'Norma do ' + x.contexto.ano_escolar + '.' : '' }) },
                { titulo: 'Tabela de resultados', html: H.tabela({ cols: [{ k: 'rot', r: 'Subteste' }, { k: 'bruto', r: 'Bruto', ctr: true }, { k: 'percentil', r: 'Percentil', ctr: true }, { k: 'classificacao', r: 'Classificação', ctr: true }], linhas: ms.map(m => ({ rot: m.nome, bruto: m.bruto, percentil: m.percentil, classificacao: m.classificacao })) }) }
            ];
        }
    });
})();

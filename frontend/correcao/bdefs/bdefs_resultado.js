/* CORTEX · BDEFS — resultados lançados (modelo próprio) · sprint LO-7
   Percentil mais alto = mais dificuldade. As linhas tracejadas marcam P84 e P93
   (cortes usados nos relatórios do BDEFS); confira no relatório da sua versão. */
(function () {
    'use strict';
    const DOM = [
        ['tempo', 'Autogerenciamento do tempo', '#2F6FED'],
        ['organizacao', 'Auto-organização / resolução de problemas', '#7C4DFF'],
        ['autocontrole', 'Autocontrole / inibição', '#EA580C'],
        ['motivacao', 'Automotivação', '#0D9488'],
        ['emocoes', 'Autorregulação das emoções', '#DB2777']
    ];
    const RESUMOS = [['total', 'Escore total de funções executivas'], ['sintomas', 'Contagem de sintomas de FE'], ['tdah', 'Índice TDAH-FE']];
    const CORTES = [{ p: 84, rot: 'P84' }, { p: 93, rot: 'P93' }];
    window.LancTeste.iniciar({
        titulo: 'BDEFS',
        nome: 'Escala de Déficits nas Funções Executivas de Barkley',
        subtitulo: 'Funções executivas no dia a dia · percentil maior = mais dificuldade',
        sobre: 'A BDEFS avalia dificuldades de funções executivas na vida diária em cinco domínios. Na BDEFS, percentis mais altos indicam mais dificuldade.',
        contexto: [
            { c: 'forma', r: 'Forma', tipo: 'select', opcoes: ['Autorrelato', 'Relato de outra pessoa'] },
            { c: 'versao', r: 'Versão', tipo: 'select', opcoes: ['Longa', 'Curta'] },
            { c: 'norma', r: 'Norma usada', tipo: 'texto' }
        ],
        grupos: [
            { cod: 'dominios', nome: 'Domínios', cor: '#2F6FED', medidas: DOM.map(([cod, nome]) => ({ cod, nome, campos: ['bruto', 'percentil', 'classificacao'] })) },
            { cod: 'resumos', nome: 'Escores-resumo', cor: '#141F3C', medidas: RESUMOS.map(([cod, nome]) => ({ cod, nome, campos: ['bruto', 'percentil', 'classificacao'] })) }
        ],
        principal(x) { const t = x.m.total; return t && (t.percentil != null || t.bruto != null) ? { rotulo: 'Total FE', valor: H(t.percentil), nota: t.classificacao || '' } : null; function H(v) { return v == null || v === '' ? '—' : 'P' + String(v).replace(/^P/i, ''); } },
        laudo(x, H) {
            const d = DOM.map(([c, , cor]) => Object.assign({ cor }, x.m[c]));
            const r = RESUMOS.map(([c]) => x.m[c]).filter(m => !H.vazio(m.percentil) || !H.vazio(m.bruto));
            return [
                r.length ? { titulo: 'Escores-resumo', html: H.cards(r.map(m => ({ rot: m.nome, valor: H.vazio(m.percentil) ? H.num(m.bruto) : H.percentilTxt(m.percentil), pe: m.classificacao || (H.vazio(m.bruto) ? '' : 'bruto ' + H.num(m.bruto)), classif: m.classificacao }))) } : null,
                { titulo: 'Perfil dos domínios', hint: 'quanto mais à direita, mais dificuldade', html: H.barrasPercentil({ tit: 'Percentil por domínio', itens: d.map(m => ({ rot: m.nome, percentil: m.percentil, classif: m.classificacao, cor: m.cor })), cortes: CORTES, nota: 'Linhas tracejadas: P84 e P93. Na BDEFS, percentil alto indica mais dificuldade.' }) },
                { titulo: 'Tabela de resultados', html: H.tabela({ cols: [{ k: 'rot', r: 'Domínio / escore' }, { k: 'bruto', r: 'Bruto', ctr: true }, { k: 'percentil', r: 'Percentil', ctr: true }, { k: 'classificacao', r: 'Classificação', ctr: true }],
                    linhas: d.map(m => ({ rot: m.nome, bruto: m.bruto, percentil: m.percentil, classificacao: m.classificacao })).concat(RESUMOS.map(([c]) => x.m[c]).map(m => ({ rot: m.nome, bruto: m.bruto, percentil: m.percentil, classificacao: m.classificacao, destaque: true }))) }) }
            ];
        }
    });
})();

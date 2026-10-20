/* CORTEX · IDADI — resultados (modelo próprio) · sprint LO-7
   Escores padronizados (média 100, DP 15) e escore Z por domínio, como nos laudos da clínica. */
(function () {
    'use strict';
    const DOM = [
        ['cognitivo', 'Cognitivo', '#2F6FED'],
        ['socioemocional', 'Socioemocional', '#DB2777'],
        ['receptiva', 'Comunicação e Linguagem Receptiva', '#7C4DFF'],
        ['expressiva', 'Comunicação e Linguagem Expressiva', '#8B5CF6'],
        ['motora_ampla', 'Motricidade Ampla', '#0D9488'],
        ['motora_fina', 'Motricidade Fina', '#0EA5E9'],
        ['adaptativo', 'Comportamento Adaptativo', '#EA580C']
    ];
    window.LancTeste.iniciar({
        titulo: 'IDADI',
        nome: 'Inventário Dimensional de Avaliação do Desenvolvimento Infantil',
        subtitulo: 'Sete domínios do desenvolvimento · escores padronizados',
        sobre: 'O IDADI avalia o desenvolvimento infantil em sete domínios a partir do relato do cuidador, com escores padronizados por faixa etária.',
        contexto: [
            { c: 'respondente', r: 'Respondente', tipo: 'texto', ph: 'ex.: mãe' },
            { c: 'norma', r: 'Norma', tipo: 'texto', ph: 'faixa em meses do relatório' }
        ],
        grupos: [{ cod: 'dominios', nome: 'Domínios', cor: '#2F6FED', medidas: DOM.map(([c, n]) => ({ cod: c, nome: n, campos: ['bruto', 'padronizado', 'z', 'classificacao'] })) }],
        laudo(x, H) {
            const ms = DOM.map(([c, , cor]) => Object.assign({ cor }, x.m[c])).filter(m => ['bruto', 'padronizado', 'z', 'classificacao'].some(k => !H.vazio(m[k])));
            return [
                { titulo: 'Perfil do desenvolvimento', html: H.padronizados({ tit: 'Escore padronizado por domínio (média 100, DP 15)', itens: ms.map(m => ({ rot: m.nome, valor: m.padronizado, classif: m.classificacao, cor: m.cor })) }) },
                { titulo: 'Tabela de resultados', html: H.tabela({ cols: [{ k: 'rot', r: 'Domínio' }, { k: 'bruto', r: 'Pontuação bruta', ctr: true }, { k: 'padronizado', r: 'Escore padronizado', ctr: true }, { k: 'z', r: 'Escore Z', ctr: true, dec: 2 }, { k: 'classificacao', r: 'Classificação', ctr: true }],
                    linhas: ms.map(m => ({ rot: m.nome, bruto: m.bruto, padronizado: m.padronizado, z: m.z, classificacao: m.classificacao })) }) }
            ];
        }
    });
})();

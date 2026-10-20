/* CORTEX · PROTEA-R-NV — observação estruturada (modelo próprio) · sprint LO-7
   Protocolo qualitativo: um achado por eixo observado. */
(function () {
    'use strict';
    const EIXOS = [
        ['interesse', 'Interesse e atenção'], ['respostas', 'Respostas às interações'], ['interacao', 'Interação social'],
        ['brincadeira', 'Qualidade da brincadeira'], ['motora', 'Habilidade motora'], ['repetitivos', 'Movimentos repetitivos']
    ];
    window.LancTeste.iniciar({
        titulo: 'PROTEA-R-NV',
        nome: 'Protocolo de Avaliação Comportamental para Crianças com Suspeita de TEA',
        subtitulo: 'Observação estruturada pela equipe de avaliação',
        sobre: 'O PROTEA-R-NV organiza a observação estruturada do comportamento de crianças com suspeita de TEA em eixos de interação, comunicação, brincadeira e comportamento.',
        contexto: [{ c: 'sessoes', r: 'Observação', tipo: 'texto', ph: 'ex.: equipe de avaliação, em sessões' }],
        grupos: [{ cod: 'eixos', nome: 'Eixos observados', cor: '#2F6FED', medidas: EIXOS.map(([c, n]) => ({ cod: c, nome: n, campos: ['achado'] })) }],
        laudo(x, H) {
            const ms = EIXOS.map(([c]) => x.m[c]).filter(m => !H.vazio(m.achado));
            return [{ titulo: 'Achados da observação', html: H.tabela({ cols: [{ k: 'rot', r: 'Eixo observado' }, { k: 'achado', r: 'Achado', texto: true }], linhas: ms.map(m => ({ rot: m.nome, achado: m.achado })) }) }];
        }
    });
})();

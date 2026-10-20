/* CORTEX · TOL-BR (Torre de Londres) — resultados (modelo próprio) · sprint LO-7
   Nos laudos da clínica o resultado é a Capacidade de planejamento (escore total). */
(function () {
    'use strict';
    window.LancTeste.iniciar({
        titulo: 'TOL-BR',
        nome: 'Torre de Londres',
        subtitulo: 'Planejamento e resolução de problemas',
        sobre: 'A Torre de Londres avalia o planejamento e a resolução de problemas: a pessoa reproduz configurações-modelo movendo peças com o menor número de movimentos e respeitando regras.',
        contexto: [{ c: 'norma', r: 'Tabela normativa', tipo: 'texto', ph: 'faixa etária/ano do relatório' }],
        grupos: [{ cod: 'medidas', nome: 'Resultado', cor: '#0D9488', medidas: [{ cod: 'planejamento', nome: 'Capacidade de planejamento', campos: ['valor', 'percentil', 'classificacao'], rotulos: { valor: 'Escore total' } }] }],
        principal(x) { const a = x.m.planejamento; return { rotulo: 'Escore total', valor: a.valor == null || a.valor === '' ? '—' : String(a.valor), nota: a.classificacao || '' }; },
        laudo(x, H) {
            const a = x.m.planejamento;
            return [
                { titulo: 'Resultado', html: H.cards([{ rot: 'Escore total', valor: H.num(a.valor), pe: a.nome, escuro: true }, { rot: 'Percentil', valor: H.percentilTxt(a.percentil), pe: a.classificacao, classif: a.classificacao }]) },
                { titulo: 'Onde o resultado cai', html: H.reguas('Percentil da capacidade de planejamento', [{ rot: a.nome, percentil: a.percentil, classif: a.classificacao }]) },
                { titulo: 'Tabela de resultados', html: H.tabela({ cols: [{ k: 'rot', r: 'Medida' }, { k: 'valor', r: 'Escore total', ctr: true }, { k: 'percentil', r: 'Percentil', ctr: true }, { k: 'classificacao', r: 'Classificação', ctr: true }], linhas: [{ rot: a.nome, valor: a.valor, percentil: a.percentil, classificacao: a.classificacao }] }) }
            ];
        }
    });
})();

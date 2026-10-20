/* ============================================================================
   CORTEX · Laudo Online — leitor RAADS-R (RAADS-R-BR Screen)
   (frontend/shared/laudo/escalas/raadsr.js) · sprint LO-6
   ----------------------------------------------------------------------------
   Mesma leitura de frontend/correcao/raadsr/raadsr_resultado.js (renderLaudo):
     - a tela NÃO soma os itens: lê escores_brutos.score_total (gravado pela
       função publico_finalizar_aplicacao do banco) com parseInt(score_total || 0)
     - classificação exibida = correcoes.classificacoes.total (texto do banco) || '—'
     - positivo = score ≥ 46 (ponto de corte) · escala 20–80 · 20 itens 1–4
     - frase: "A pontuação de N pontos encontra-se ACIMA/ABAIXO do ponto de corte
       estabelecido (46) pelos estudos de validação."
   Diferença: sem score_total gravado a tela mostraria 0; aqui é dado faltando
   (lança Error). Sem subescalas na tela.
   ============================================================================ */
(function () {
    'use strict';
    if (!window.LaudoEscalas) { console.warn('[raadsr] escalas_base.js não carregado'); return; }
    const LE = window.LaudoEscalas;

    // ---- copiado de raadsr_resultado.js (renderLaudo) -------------------------
    const CUTOFF = 46;
    const MAX = 80;
    const MIN = 20;
    // ---------------------------------------------------------------------------

    const ZONAS = [
        { ate: CUTOFF - 1, rotulo: 'Abaixo do ponto de corte', tom: 'ok' },
        { ate: MAX, rotulo: 'Acima do ponto de corte', tom: 'grave' }
    ];

    LE.registrar({
        siglas: ['RAADS-R'],
        carregar: { fatores: false, itens: false, classificacoes: false, json: null },
        calcular(ctx) {
            const correcao = ctx.correcao || {};
            const brutos = correcao.escores_brutos || ctx.brutos || {};
            if (brutos.score_total == null || brutos.score_total === '') {
                throw new Error('RAADS-R: correção sem escores_brutos.score_total');
            }
            const score = parseInt(brutos.score_total || 0);
            const positivo = score >= CUTOFF;
            const classifLabel = (correcao.classificacoes && correcao.classificacoes.total) || '—';

            const indicacao = positivo
                ? `A pontuação de ${score} pontos encontra-se ACIMA do ponto de corte estabelecido (${CUTOFF}) pelos estudos de validação.`
                : `A pontuação de ${score} pontos encontra-se ABAIXO do ponto de corte estabelecido (${CUTOFF}) pelos estudos de validação.`;

            return {
                sigla: ctx.sigla || 'RAADS-R',
                nome: 'RAADS-R-BR Screen',
                respondente: 'Autorrelato',
                norma: 'Versão brasileira reduzida · ponto de corte 46 (sensibilidade 90,1%, especificidade 87,9%)',
                principal: {
                    rotulo: 'Pontuação', valor: score, max: MAX, sufixo: '',
                    classificacao: classifLabel, tom: positivo ? 'grave' : 'ok'
                },
                regua: { min: MIN, max: MAX, valor: score, zonas: ZONAS, rotulo: 'Pontuação' },
                subescalas: [],
                linhas: [['Ponto de corte', '≥ ' + CUTOFF], ['Faixa da escala', MIN + '–' + MAX]],
                indicacao,
                conferencia: { total: score, pontuacao: score, ponto_de_corte: CUTOFF }
            };
        }
    });
})();

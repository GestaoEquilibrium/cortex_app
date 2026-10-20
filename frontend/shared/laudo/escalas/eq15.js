/* ============================================================================
   CORTEX · Laudo Online — leitor EQ-15 (Escala de Empatia de Cambridge)
   (frontend/shared/laudo/escalas/eq15.js) · sprint LO-6
   ----------------------------------------------------------------------------
   Mesma leitura de frontend/correcao/eq15/eq15_resultado.js:
     - a tela NÃO soma os itens: lê escores_brutos.score_total e
       escores_brutos.fatores[COD].score (gravados por publico_finalizar_aplicacao)
       com parseInt(x || 0)
     - máximo do total: parseInt(escores_brutos.score_max || norma.score_max || 60)
     - classificação = correcoes.classificacoes.total (texto do banco) || '—'
       (faixas da tela: Baixa 0–25 · Média 26–39 · Alta 40–50 · Muito Alta 51–60)
     - ponto de corte clínico 30: score ≥ 30 'Acima do corte' · senão 'Abaixo do corte'
     - fatores = instrumentos_fatores da norma (eh_total = false, por ordem),
       máximo parseInt(max_score || 20); comparação com a média de referência
       (Gouveia et al., 2012): |Δ| < 1.5 compatível · Δ < 0 abaixo · senão acima
   Diferenças: a tela usa a norma ativa de versao_codigo 'eq15_br'; aqui vale
   ctx.norma (a da correção ou a ativa). Sem score_total gravado a tela mostraria
   0; aqui é dado faltando (lança Error).
   ============================================================================ */
(function () {
    'use strict';
    if (!window.LaudoEscalas) { console.warn('[eq15] escalas_base.js não carregado'); return; }
    const LE = window.LaudoEscalas;
    const U = LE.util;

    // ---- copiado de eq15_resultado.js -----------------------------------------
    const REF_MEAN = { EMP_COG: 13.8, HAB_SOC: 9.8, REAT_EMO: 10.5 };
    const CORTE = 30;
    // ---------------------------------------------------------------------------

    const TOM_CLASSIF = { 'Baixa': 'mod', 'Média': 'ok', 'Alta': 'ok', 'Muito Alta': 'ok' };
    const ZONAS_TOTAL = [
        { ate: 25, rotulo: 'Baixa', tom: 'mod' },
        { ate: 39, rotulo: 'Média', tom: 'ok' },
        { ate: 50, rotulo: 'Alta', tom: 'ok' },
        { ate: 60, rotulo: 'Muito Alta', tom: 'ok' }
    ];
    // Nomes dos fatores no texto "Sobre o Instrumento" da tela
    const APELIDOS_CONF = {
        EMP_COG: ['empatia_cognitiva'],
        HAB_SOC: ['habilidades_sociais'],
        REAT_EMO: ['reatividade_emocional']
    };

    function fatoresDaNorma(ctx) {
        const normaId = ctx.norma && ctx.norma.id;
        return (ctx.fatores || [])
            .filter(f => !(f.norma_id && normaId && f.norma_id !== normaId))
            .filter(f => f.eh_total === false)
            .map((f, i) => ({ f, i }))
            .sort((a, b) => {   // ORDER BY ordem (ASC, NULLS LAST)
                const oa = a.f.ordem, ob = b.f.ordem;
                if (oa == null && ob == null) return a.i - b.i;
                if (oa == null) return 1;
                if (ob == null) return -1;
                return (oa - ob) || (a.i - b.i);
            })
            .map(x => x.f);
    }

    LE.registrar({
        siglas: ['EQ-15'],
        carregar: { fatores: true, itens: false, classificacoes: false, json: null },
        calcular(ctx) {
            const correcao = ctx.correcao || {};
            const escoresBrutos = correcao.escores_brutos || ctx.brutos || {};
            if (escoresBrutos.score_total == null || escoresBrutos.score_total === '') {
                throw new Error('EQ-15: correção sem escores_brutos.score_total');
            }
            const norma = ctx.norma || {};
            const score = parseInt(escoresBrutos.score_total || 0);
            const max = parseInt(escoresBrutos.score_max || norma.score_max || 60);
            const classifLabel = (correcao.classificacoes && correcao.classificacoes.total) || '—';
            const fatoresGravados = escoresBrutos.fatores || {};
            const acima = score >= CORTE;

            const conferencia = { total: score, empatia_total: score };
            const subescalas = fatoresDaNorma(ctx).map(f => {
                const dadosFator = fatoresGravados[f.fator_codigo] || {};
                const scoreFat = parseInt(dadosFator.score || 0);
                const maxFator = parseInt(f.max_score || 20);
                const ref = REF_MEAN[f.fator_codigo];
                let classificacao = null, tom = 'neutro', extra = null;
                if (ref !== undefined) {
                    const diff = scoreFat - ref;
                    if (Math.abs(diff) < 1.5) { classificacao = 'Compatível com a média'; tom = 'ok'; extra = `média de referência ${ref.toFixed(1)}`; }
                    else if (diff < 0) { classificacao = 'Abaixo da média'; tom = 'leve'; extra = `média de referência ${ref.toFixed(1)} · Δ ${diff.toFixed(1)}`; }
                    else { classificacao = 'Acima da média'; tom = 'ok'; extra = `média de referência ${ref.toFixed(1)} · Δ +${diff.toFixed(1)}`; }
                }
                [f.fator_codigo, U.chave(f.fator_label)].concat(APELIDOS_CONF[f.fator_codigo] || []).forEach(k => {
                    if (k && conferencia[k] == null) conferencia[k] = scoreFat;
                });
                return {
                    codigo: f.fator_codigo, nome: f.fator_label, valor: scoreFat, max: maxFator,
                    classificacao, tom, zonas: null, extra
                };
            });

            let indicacao;
            switch (classifLabel) {
                case 'Baixa':
                    indicacao = `A pontuação de ${score} pontos situa-se na faixa Baixa de empatia disposicional (0–25). Este resultado está abaixo do ponto de corte clínico de 30 pontos.`;
                    break;
                case 'Média':
                    indicacao = `A pontuação de ${score} pontos situa-se na faixa Média de empatia disposicional (26–39). O resultado é compatível com a média da população normativa brasileira (Gouveia et al., 2012) e não sugere alterações clinicamente significativas no construto de empatia.`;
                    break;
                case 'Alta':
                    indicacao = `A pontuação de ${score} pontos situa-se na faixa Alta de empatia disposicional (40–50).`;
                    break;
                case 'Muito Alta':
                    indicacao = `A pontuação de ${score} pontos situa-se na faixa Muito Alta de empatia disposicional (51–60).`;
                    break;
                default:
                    indicacao = `A pontuação de ${score} pontos foi obtida no instrumento EQ-15.`;
            }

            return {
                sigla: ctx.sigla || 'EQ-15',
                nome: 'EQ-15 (Escala de Empatia de Cambridge)',
                respondente: 'Autorrelato',
                norma: 'Versão brasileira reduzida · Gouveia et al. (2012) · ponto de corte clínico 30',
                principal: {
                    rotulo: 'Empatia Total', valor: score, max, sufixo: '',
                    classificacao: classifLabel, tom: TOM_CLASSIF[classifLabel] || 'neutro'
                },
                regua: { min: 0, max: 60, valor: score, zonas: ZONAS_TOTAL, rotulo: 'Empatia Total' },
                subescalas,
                linhas: [['Ponto de corte clínico', `${CORTE} — ${acima ? 'Acima do corte' : 'Abaixo do corte'}`]],
                indicacao,
                conferencia
            };
        }
    });
})();

/* ============================================================================
   CORTEX · Laudo Online — leitor SCARED (SCARED-A autorrelato, SCARED-H hetero)
   (frontend/shared/laudo/escalas/scared.js) · sprint LO-6
   ----------------------------------------------------------------------------
   Mesma conta de frontend/correcao/scared/scared_resultado.js:
     - os pontos NÃO são somados aqui: a tela lê escores_brutos.fatores[COD].score
       (gravado pela função publico_finalizar_aplicacao do banco) e, para o total,
       cai em escores_brutos.score_total se fatores.TOTAL faltar (extrairScores)
     - classificação: pontos ≥ corte → 'Risco Clínico', senão 'Não Clínico'
     - Z = (pontos - m) / dp com normas Birmaher et al. (1999) por faixa
       (7-12 | 13-18, idade na data_aplicacao) × sexo ('Masculino' | 'Feminino');
       percentil = round(normCDF(Z) × 100) (Abramowitz & Stegun)
   Cada sigla é lida sozinha: o comparativo Auto × Hetero da tela (que busca a
   contraparte ±30 dias) não entra no resumo de uma forma só.
   ============================================================================ */
(function () {
    'use strict';
    const LE = window.LaudoEscalas;

    // ─── constantes copiadas da tela ───
    const NORMAS = {
        '7-12': {
            'Masculino': {
                TOTAL:     { m: 22.60, dp: 10.45 },
                PANICO:    { m:  4.16, dp:  3.80 },
                GENERALIZ: { m:  7.24, dp:  3.57 },
                SEPARACAO: { m:  4.98, dp:  2.65 },
                SOCIAL:    { m:  4.98, dp:  2.83 },
                ESCOLAR:   { m:  1.24, dp:  1.19 }
            },
            'Feminino': {
                TOTAL:     { m: 26.55, dp: 12.21 },
                PANICO:    { m:  5.36, dp:  4.69 },
                GENERALIZ: { m:  8.03, dp:  3.70 },
                SEPARACAO: { m:  6.03, dp:  3.22 },
                SOCIAL:    { m:  5.74, dp:  2.92 },
                ESCOLAR:   { m:  1.39, dp:  1.30 }
            }
        },
        '13-18': {
            'Masculino': {
                TOTAL:     { m: 19.73, dp: 10.41 },
                PANICO:    { m:  3.29, dp:  3.40 },
                GENERALIZ: { m:  7.51, dp:  3.73 },
                SEPARACAO: { m:  3.55, dp:  2.36 },
                SOCIAL:    { m:  4.43, dp:  2.95 },
                ESCOLAR:   { m:  0.94, dp:  1.14 }
            },
            'Feminino': {
                TOTAL:     { m: 25.69, dp: 12.17 },
                PANICO:    { m:  5.34, dp:  4.58 },
                GENERALIZ: { m:  8.87, dp:  3.78 },
                SEPARACAO: { m:  4.78, dp:  2.86 },
                SOCIAL:    { m:  5.46, dp:  3.20 },
                ESCOLAR:   { m:  1.24, dp:  1.21 }
            }
        }
    };
    const SUBESCALAS_ORDEM = ['PANICO', 'GENERALIZ', 'SEPARACAO', 'SOCIAL', 'ESCOLAR'];
    const SUB_LABEL = {
        PANICO:    'Pânico / Somático',
        GENERALIZ: 'Ansiedade Generalizada',
        SEPARACAO: 'Ansiedade de Separação',
        SOCIAL:    'Fobia Social',
        ESCOLAR:   'Fobia Escolar',
        TOTAL:     'Score Total'
    };
    const SUB_MAX = {
        PANICO: 26, GENERALIZ: 18, SEPARACAO: 16, SOCIAL: 14, ESCOLAR: 8, TOTAL: 82
    };
    const SUB_CORTE = {
        PANICO: 7, GENERALIZ: 9, SEPARACAO: 5, SOCIAL: 8, ESCOLAR: 3, TOTAL: 25
    };

    // ─── funções copiadas da tela ───
    function extrairScores(escoresBrutos) {
        escoresBrutos = escoresBrutos || {};
        const fatores = escoresBrutos.fatores || {};
        const scores = {};
        for (const code of [...SUBESCALAS_ORDEM, 'TOTAL']) {
            const dado = fatores[code];
            if (dado && typeof dado.score === 'number') {
                scores[code] = dado.score;
            } else if (code === 'TOTAL' && typeof escoresBrutos.score_total === 'number') {
                scores[code] = escoresBrutos.score_total;
            } else {
                scores[code] = null;
            }
        }
        return scores;
    }
    function calcularIdade(nascISO, aplISO) {
        if (!nascISO) return null;
        const ref = aplISO ? new Date(aplISO) : new Date();
        const n = new Date(nascISO);
        if (isNaN(n) || isNaN(ref) || ref < n) return null;
        let anos = ref.getFullYear() - n.getFullYear();
        const m = ref.getMonth() - n.getMonth();
        if (m < 0 || (m === 0 && ref.getDate() < n.getDate())) anos--;
        return anos;
    }
    function faixaEtaria(anos) {
        if (anos == null) return null;
        if (anos >= 7 && anos <= 12) return '7-12';
        if (anos >= 13 && anos <= 18) return '13-18';
        return null;
    }
    function calcZScore(valor, media, dp) {
        if (valor == null || dp == null || dp === 0) return null;
        return (valor - media) / dp;
    }
    function normCDF(z) {
        const t = 1 / (1 + 0.2316419 * Math.abs(z));
        const poly = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
        const pdf = Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
        const p = 1 - pdf * poly;
        return z >= 0 ? p : 1 - p;
    }
    function calcPercentil(z) {
        if (z == null) return null;
        return Math.round(normCDF(z) * 100);
    }
    function getNorma(faixa, sexo, fatorCodigo) {
        if (!faixa || !sexo) return null;
        return NORMAS[faixa]?.[sexo]?.[fatorCodigo] || null;
    }
    function classifica(score, fatorCodigo) {
        if (score == null) return null;
        return score >= SUB_CORTE[fatorCodigo] ? 'Risco Clínico' : 'Não Clínico';
    }

    // ─── resumo ───
    function tomDe(classif) {
        if (classif === 'Risco Clínico') return 'grave';
        if (classif === 'Não Clínico') return 'ok';
        return 'neutro';
    }
    function zonasDe(code) {
        return [
            { ate: SUB_CORTE[code] - 1, rotulo: 'Não Clínico', tom: 'ok' },
            { ate: SUB_MAX[code], rotulo: 'Risco Clínico', tom: 'grave' }
        ];
    }
    function arred2(z) { return z == null ? null : Number(z.toFixed(2)); }

    function calcular(ctx) {
        const ehAuto = ctx.sigla === 'SCARED-A';
        const sufixo = ehAuto ? '_auto' : '_hetero';
        const escoresBrutos = (ctx.correcao && ctx.correcao.escores_brutos) || ctx.brutos || {};
        const scores = extrairScores(escoresBrutos);
        if ([...SUBESCALAS_ORDEM, 'TOTAL'].every(c => scores[c] == null)) {
            throw new Error('SCARED: correção sem escores por fator (escores_brutos.fatores / score_total)');
        }

        const pac = ctx.paciente || {};
        const apl = ctx.aplicacao || {};
        const sexo = pac.sexo;
        // Tela: calcularIdade(paciente.data_nascimento, aplicacao.data_aplicacao)
        const idade = calcularIdade(pac.data_nascimento, apl.data_aplicacao);
        const faixa = faixaEtaria(idade);
        const faixaInfo = faixa
            ? `${faixa} anos${sexo ? ' / ' + sexo : ''}`
            : 'Fora da faixa normativa (7–18 anos)';

        const chave = LE.util.chave;
        const conferencia = {};
        const linhaDe = code => {
            const score = scores[code];
            const norma = getNorma(faixa, sexo, code);
            const z = norma ? calcZScore(score, norma.m, norma.dp) : null;
            const pct = calcPercentil(z);
            const classif = classifica(score, code);
            return { score, z, pct, classif };
        };
        const registrar = (codigos, r) => {
            codigos.forEach(k => {
                conferencia[k] = r.score;
                conferencia[k + sufixo] = r.score;
                if (r.z != null) {
                    conferencia[k + '_z'] = arred2(r.z);
                    conferencia[k + '_percentil'] = r.pct;
                }
            });
        };

        const tot = linhaDe('TOTAL');
        registrar(['total', 'TOTAL'], tot);
        conferencia.total_max = SUB_MAX.TOTAL;
        conferencia.total_corte = SUB_CORTE.TOTAL;

        const subescalas = SUBESCALAS_ORDEM.map(code => {
            const r = linhaDe(code);
            registrar([code, chave(SUB_LABEL[code])], r);
            conferencia[code + '_corte'] = SUB_CORTE[code];
            return {
                codigo: code,
                nome: SUB_LABEL[code],
                valor: r.score,
                max: SUB_MAX[code],
                classificacao: r.classif,
                tom: tomDe(r.classif),
                zonas: zonasDe(code),
                extra: `corte ≥${SUB_CORTE[code]}` +
                    (r.z != null && r.pct != null ? ` · Z = ${r.z.toFixed(2)} · percentil ${r.pct}` : '')
            };
        });

        // Frase-resumo (montarInterpretacao da tela, só a parte desta forma)
        let indicacao = null;
        if (tot.score != null) {
            const rc = tot.score >= 25;
            if (ehAuto) {
                indicacao = rc
                    ? 'Escore supera o ponto de corte clínico (≥25), indicando rastreio positivo para transtorno de ansiedade.'
                    : 'Escore abaixo do ponto de corte clínico (≥25), não configurando rastreio positivo no autorrelato.';
                const subRC = SUBESCALAS_ORDEM.filter(c => scores[c] != null && scores[c] >= SUB_CORTE[c]);
                indicacao += subRC.length > 0
                    ? ` Subescalas acima do corte: ${subRC.map(c => `${SUB_LABEL[c]} (${scores[c]} pts; corte ≥${SUB_CORTE[c]})`).join(', ')}.`
                    : ' Nenhuma subescala atingiu o ponto de corte no autorrelato.';
            } else {
                indicacao = rc
                    ? 'Escore supera o ponto de corte (≥25) no heterorrelato (pais/responsável).'
                    : 'Escore abaixo do ponto de corte (≥25) no heterorrelato (pais/responsável).';
                const subRC = SUBESCALAS_ORDEM.filter(c => scores[c] != null && scores[c] >= SUB_CORTE[c]);
                if (subRC.length > 0) {
                    indicacao += ` Subescalas no risco clínico: ${subRC.map(c => `${SUB_LABEL[c]} (${scores[c]} pts)`).join(', ')}.`;
                }
            }
        }

        const linhas = [['Faixa normativa', faixaInfo]];
        if (tot.z != null && tot.pct != null) {
            linhas.push(['Total (Z · percentil)', `Z = ${tot.z.toFixed(2)} · percentil ${tot.pct}`]);
        }

        return {
            sigla: ctx.sigla,
            nome: 'SCARED',
            respondente: ehAuto ? 'Autorrelato' : 'Pais/responsável',
            norma: faixa ? `Birmaher et al. (1999) · ${faixaInfo}` : faixaInfo,
            principal: {
                rotulo: ehAuto ? 'Total — Autorrelato' : 'Total — Heteroaplicação',
                valor: tot.score, max: SUB_MAX.TOTAL, sufixo: '',
                classificacao: tot.classif,
                tom: tomDe(tot.classif)
            },
            regua: tot.score == null ? null : {
                min: 0, max: SUB_MAX.TOTAL, valor: tot.score,
                zonas: zonasDe('TOTAL'), rotulo: 'Score Total'
            },
            subescalas: subescalas,
            linhas: linhas,
            indicacao: indicacao,
            conferencia: conferencia
        };
    }

    LE.registrar({
        siglas: ['SCARED-A', 'SCARED-H'],
        carregar: { fatores: false, itens: false, classificacoes: false, json: null },
        calcular: calcular
    });
})();

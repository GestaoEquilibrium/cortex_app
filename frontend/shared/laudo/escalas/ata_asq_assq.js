/* ============================================================================
   CORTEX · Laudo Online — LEITORES ATA · ASQ · ASSQ
   (frontend/shared/laudo/escalas/ata_asq_assq.js) · sprint LO-6
   ----------------------------------------------------------------------------
   Mesma conta das telas de correção:
     ATA  → frontend/correcao/ata/ata_resultado.js   (calcularResultados)
     ASQ  → frontend/correcao/asq/asq_resultado.js   (pontuaItem + calcularResultados)
     ASSQ → frontend/correcao/assq/assq_resultado.js (calcularResultados + classificarTotal)
   As três só usam correcoes.escores_brutos.respostas + constantes do JS
   (nenhuma lê norma, fator ou item para calcular). Contrato: escalas_base.js.
   ============================================================================ */
(function () {
    'use strict';
    const E = window.LaudoEscalas;
    if (!E) return;
    const chave = E.util.chave;

    // ── ATA ──────────────────────────────────────────────────────────────────
    // (constantes e cálculo copiados de ata_resultado.js)
    const ATA = (function () {
        const PONTO_CORTE = 15;
        const TOTAL_ITENS = 23;
        const MAX_SCORE = TOTAL_ITENS * 2; // 46

        function calcularResultados(correcao) {
            const respostas = (correcao?.escores_brutos || {}).respostas || {};

            const total = Object.values(respostas).reduce((a, v) => a + (parseInt(v) || 0), 0);

            const dist = { naoApresenta: 0, algunsTracos: 0, variosTracos: 0 };
            for (const v of Object.values(respostas)) {
                const n = parseInt(v);
                if (n === 0) dist.naoApresenta++;
                else if (n === 1) dist.algunsTracos++;
                else if (n === 2) dist.variosTracos++;
            }

            const itensCriticos = [];
            for (const [num, val] of Object.entries(respostas)) {
                if (parseInt(val) === 2) itensCriticos.push(parseInt(num));
            }
            itensCriticos.sort((a, b) => a - b);

            const classificacao = total >= PONTO_CORTE ? 'sugestivo_tea' : 'nao_sugestivo';
            const respondidos = Object.values(respostas).length;

            return {
                total, maxScore: MAX_SCORE,
                percentual: respondidos > 0 ? Math.round((total / MAX_SCORE) * 100) : 0,
                dist, itensCriticos, classificacao, respondidos,
                faltam: TOTAL_ITENS - respondidos
            };
        }
        return { PONTO_CORTE, TOTAL_ITENS, MAX_SCORE, calcularResultados };
    })();

    E.registrar({
        siglas: ['ATA'],
        carregar: { fatores: false, itens: false, classificacoes: false, json: null },
        calcular(ctx) {
            if (!ctx.correcao) throw new Error('Nenhuma correção encontrada');
            const s = ATA.calcularResultados(ctx.correcao);
            const positivo = s.classificacao === 'sugestivo_tea';
            const textoClassif = positivo ? 'Sugestivo de TEA' : 'Sem indicativo de TEA';
            const tom = positivo ? 'mod' : 'ok';
            const zonas = [
                { ate: ATA.PONTO_CORTE - 1, rotulo: 'Sem indicativo de TEA', tom: 'ok' },
                { ate: ATA.MAX_SCORE, rotulo: 'Sugestivo de TEA', tom: 'mod' }
            ];
            const nCrit = s.itensCriticos.length;
            const indicacao = positivo
                ? `A pontuação total de ${s.total} pontos está acima do ponto de corte (≥${ATA.PONTO_CORTE}), o que sugere a presença de traços autísticos em intensidade clinicamente relevante.`
                : `A pontuação total de ${s.total} pontos está abaixo do ponto de corte (≥${ATA.PONTO_CORTE}), não sugerindo indicativos clinicamente significativos de TEA pela perspectiva do respondente.`;
            return {
                sigla: ctx.sigla || 'ATA',
                nome: 'Escala ATA',
                respondente: 'Pais/responsável',
                norma: `Ponto de corte ≥ ${ATA.PONTO_CORTE}`,
                principal: {
                    rotulo: 'Pontuação total', valor: s.total, max: s.maxScore, sufixo: '',
                    classificacao: textoClassif, tom
                },
                regua: { min: 0, max: ATA.MAX_SCORE, valor: s.total, zonas, rotulo: 'Pontuação total' },
                subescalas: [],
                linhas: [
                    ['Ponto de corte', `≥ ${ATA.PONTO_CORTE}`],
                    ['Itens em destaque', String(nCrit)],
                    ['Não apresenta (0)', String(s.dist.naoApresenta)],
                    ['Apresenta alguns traços (1)', String(s.dist.algunsTracos)],
                    ['Apresenta vários traços (2)', String(s.dist.variosTracos)]
                ],
                indicacao,
                conferencia: {
                    total: s.total,
                    pontuacao_total: s.total,
                    percentual: s.percentual,
                    itens_em_destaque: nCrit,
                    nao_apresenta: s.dist.naoApresenta,
                    apresenta_alguns_tracos: s.dist.algunsTracos,
                    apresenta_varios_tracos: s.dist.variosTracos,
                    respondidos: s.respondidos
                }
            };
        }
    });

    // ── ASQ ──────────────────────────────────────────────────────────────────
    // (constantes e cálculo copiados de asq_resultado.js)
    const ASQ = (function () {
        const PONTO_CORTE = 15;
        const TOTAL_ITENS = 40;
        const ITENS_SIM_1 = new Set([3,4,5,6,7,8,10,11,12,13,14,15,16,17,18]);
        const ITENS_NAO_1 = new Set([2,9,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40]);

        function pontuaItem(numero, valorCru) {
            const respondeuSim = parseInt(valorCru) === 1;
            if (ITENS_SIM_1.has(numero)) return respondeuSim ? 1 : 0;
            if (ITENS_NAO_1.has(numero)) return respondeuSim ? 0 : 1;
            return 0; // item 1 (filtro) ou fora da chave
        }

        function calcularResultados(correcao) {
            const respostas = (correcao?.escores_brutos || {}).respostas || {};

            const item1Sim = parseInt(respostas[1]) === 1;
            const inicio = item1Sim ? 2 : 8;
            const scoreMax = item1Sim ? 39 : 33;

            let total = 0;
            const itensCriticos = [];
            for (let n = inicio; n <= TOTAL_ITENS; n++) {
                if (respostas[n] === undefined) continue;
                const p = pontuaItem(n, respostas[n]);
                total += p;
                if (p === 1) itensCriticos.push(n);
            }
            itensCriticos.sort((a, b) => a - b);

            const dist = { sim: 0, nao: 0 };
            for (const v of Object.values(respostas)) {
                if (parseInt(v) === 1) dist.sim++;
                else if (parseInt(v) === 0) dist.nao++;
            }

            const classificacao = total >= PONTO_CORTE ? 'sugestivo_tea' : 'nao_sugestivo';
            const respondidos = Object.values(respostas).length;

            return {
                total, maxScore: scoreMax, item1Sim, inicio,
                percentual: scoreMax > 0 ? Math.round((total / scoreMax) * 100) : 0,
                dist, itensCriticos, classificacao, respondidos,
                faltam: TOTAL_ITENS - respondidos
            };
        }
        return { PONTO_CORTE, TOTAL_ITENS, pontuaItem, calcularResultados };
    })();

    E.registrar({
        siglas: ['ASQ'],
        carregar: { fatores: false, itens: false, classificacoes: false, json: null },
        calcular(ctx) {
            if (!ctx.correcao) throw new Error('Nenhuma correção encontrada');
            const s = ASQ.calcularResultados(ctx.correcao);
            const positivo = s.classificacao === 'sugestivo_tea';
            const textoClassif = positivo ? 'Sugestivo de TEA' : 'Sem indicativo de TEA';
            const tom = positivo ? 'mod' : 'ok';
            const zonas = [
                { ate: ASQ.PONTO_CORTE - 1, rotulo: 'Sem indicativo de TEA', tom: 'ok' },
                { ate: s.maxScore, rotulo: 'Sugestivo de TEA', tom: 'mod' }
            ];
            const nCrit = s.itensCriticos.length;
            let indicacao = positivo
                ? `A pontuação total de ${s.total} pontos está no ou acima do ponto de corte (≥${ASQ.PONTO_CORTE}), o que sugere a presença de sinais associados ao Transtorno do Espectro Autista em intensidade que justifica investigação aprofundada, segundo o relato do cuidador.`
                : `A pontuação total de ${s.total} pontos está abaixo do ponto de corte (≥${ASQ.PONTO_CORTE}), não sugerindo indicativos clinicamente significativos de TEA pela perspectiva do respondente.`;
            if (!s.item1Sim) {
                indicacao += ` Como a resposta ao item 1 foi "Não" (criança sem fala em frases), os itens 2 a 7 (referentes à linguagem) não entram na contagem, conforme a regra do instrumento. A soma considerou os itens 8 a 40 (máximo ${s.maxScore}).`;
            }
            return {
                sigla: ctx.sigla || 'ASQ',
                nome: 'Questionário ASQ',
                respondente: 'Pais/responsável',
                norma: `Ponto de corte ≥ ${ASQ.PONTO_CORTE}`,
                principal: {
                    rotulo: 'Pontuação total', valor: s.total, max: s.maxScore, sufixo: '',
                    classificacao: textoClassif, tom
                },
                regua: { min: 0, max: s.maxScore, valor: s.total, zonas, rotulo: 'Pontuação total' },
                subescalas: [],
                linhas: [
                    ['Ponto de corte', `≥ ${ASQ.PONTO_CORTE}`],
                    ['Itens que pontuaram', String(nCrit)],
                    ['Itens somados', s.item1Sim ? '2–40' : '8–40'],
                    ['Sim', String(s.dist.sim)],
                    ['Não', String(s.dist.nao)]
                ],
                indicacao,
                conferencia: {
                    total: s.total,
                    pontuacao_total: s.total,
                    maximo: s.maxScore,
                    percentual: s.percentual,
                    itens_que_pontuaram: nCrit,
                    respondidos: s.respondidos
                }
            };
        }
    });

    // ── ASSQ ─────────────────────────────────────────────────────────────────
    // (constantes e cálculo copiados de assq_resultado.js)
    const ASSQ = (function () {
        const CUTOFF = 19;
        const SCORE_MAX = 54;
        const GRUPOS_INFO = {
            COL: { label: 'Comunicação e Linguagem', max: 8 },
            INS: { label: 'Interação Social', max: 16 },
            INR: { label: 'Interesses Restritos', max: 14 },
            COR: { label: 'Comportamento Repetitivo / Rigidez', max: 8 },
            SEM: { label: 'Sensorial / Motor', max: 8 }
        };
        const GRUPOS_ORDEM = ['COL', 'INS', 'INR', 'COR', 'SEM'];
        const ITEM_TO_GRUPO = {"5": "COL", "6": "COL", "15": "COL", "22": "COL", "8": "INS", "9": "INS", "10": "INS", "11": "INS", "12": "INS", "18": "INS", "23": "INS", "24": "INS", "1": "INR", "2": "INR", "3": "INR", "4": "INR", "7": "INR", "17": "INR", "27": "INR", "19": "COR", "20": "COR", "25": "COR", "26": "COR", "13": "SEM", "14": "SEM", "16": "SEM", "21": "SEM"};

        function classificarTotal(total) {
            if (total < CUTOFF) {
                return {
                    label: 'Dentro do Esperado', slug: 'baixa', positivo: false,
                    desc: `A pontuação total (${total}/${SCORE_MAX}) está abaixo do ponto de corte de ${CUTOFF} pontos. Este resultado não sugere, com base neste instrumento de rastreio, presença de traços do espectro autista em nível clinicamente significativo, sendo consistente com o perfil esperado para a faixa etária.`
                };
            }
            return {
                label: 'Rastreio POSITIVO', slug: 'clinico', positivo: true,
                desc: `A pontuação total (${total}/${SCORE_MAX}) está ACIMA do ponto de corte de ${CUTOFF} pontos para rastreio positivo quando respondido por pais/responsáveis. De acordo com o estudo de validação brasileiro (Restrepo, 2018/UFRGS), pontuações acima deste limiar indicam a necessidade de avaliação diagnóstica formal para investigação de TEA.`
            };
        }

        function calcularResultados(correcao) {
            const respostas = (correcao?.escores_brutos || {}).respostas || {};
            const pontosItem = {};
            for (let n = 1; n <= 27; n++) {
                const idxResp = respostas[n];
                pontosItem[n] = (idxResp != null && !isNaN(idxResp)) ? parseInt(idxResp, 10) : 0;
            }
            let total = 0;
            for (let n = 1; n <= 27; n++) total += pontosItem[n];

            const subscores = {};
            for (const code of GRUPOS_ORDEM) subscores[code] = 0;
            for (const [itemStr, grupo] of Object.entries(ITEM_TO_GRUPO)) {
                const n = parseInt(itemStr, 10);
                if (subscores[grupo] !== undefined) subscores[grupo] += pontosItem[n];
            }
            const totalClassif = classificarTotal(total);
            return { total, subscores, totalClassif };
        }
        return { CUTOFF, SCORE_MAX, GRUPOS_INFO, GRUPOS_ORDEM, calcularResultados };
    })();

    E.registrar({
        siglas: ['ASSQ'],
        carregar: { fatores: false, itens: false, classificacoes: false, json: null },
        calcular(ctx) {
            if (!ctx.correcao) throw new Error('Nenhuma correção encontrada');
            const s = ASSQ.calcularResultados(ctx.correcao);
            const cl = s.totalClassif;
            const tom = cl.positivo ? 'mod' : 'ok';
            const zonas = [
                { ate: ASSQ.CUTOFF - 1, rotulo: 'Dentro do Esperado', tom: 'ok' },
                { ate: ASSQ.SCORE_MAX, rotulo: 'Rastreio POSITIVO', tom: 'mod' }
            ];
            const conferencia = { total: s.total, score_total: s.total };
            const subescalas = ASSQ.GRUPOS_ORDEM.map(code => {
                const info = ASSQ.GRUPOS_INFO[code];
                const score = s.subscores[code];
                const pct = Math.round((score / info.max) * 100);
                conferencia[code] = score;
                conferencia[chave(info.label)] = score;
                conferencia[code + '_pct'] = pct;
                return {
                    codigo: code, nome: info.label, valor: score, max: info.max,
                    classificacao: null, tom: 'neutro', zonas: null,
                    extra: `${pct}% do máximo`
                };
            });
            return {
                sigla: ctx.sigla || 'ASSQ',
                nome: 'ASSQ',
                respondente: 'Pais/responsável',
                norma: `Restrepo (2018) · cutoff ${ASSQ.CUTOFF}/${ASSQ.SCORE_MAX}`,
                principal: {
                    rotulo: 'Score Total', valor: s.total, max: ASSQ.SCORE_MAX, sufixo: '',
                    classificacao: cl.label, tom
                },
                regua: { min: 0, max: ASSQ.SCORE_MAX, valor: s.total, zonas, rotulo: 'Score Total' },
                subescalas,
                linhas: null,
                indicacao: cl.desc,
                conferencia
            };
        }
    });
})();

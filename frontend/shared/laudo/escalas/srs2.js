/* ============================================================================
   CORTEX · Laudo Online — leitor SRS-2 (5 formas)
   (frontend/shared/laudo/escalas/srs2.js) · sprint LO-6
   ----------------------------------------------------------------------------
   Mesma conta das telas frontend/correcao/srs2{auto,het,pre,escf,escm}/
   *_resultado.js (as 5 telas são idênticas, só muda SIGLA_ESPERADA):
     - norma local srs2_norms.json (ctx.json) → instruments[sigla]
     - item 1-4, reverso → 5 - r; pontos = valor - 1 (0-3); sem resposta = ignorado
     - bruto por subescala (PS, CGS, CMS, MS, RR); CI = PS+CGS+CMS+MS; TOT = CI+RR
     - bruto → T por lookup (clamp nas pontas; sem chave exata → maior bruto ≤)
     - classificação por T em json.classifications (Típico / N1 / N2 / N3)
   A norma do SRS-2 é por forma (sigla); não depende de sexo/idade no cálculo.
   ============================================================================ */
(function () {
    'use strict';
    const LE = window.LaudoEscalas;
    const SIGLAS = ['SRS-2-AUTO', 'SRS-2-HET', 'SRS-2-PRE', 'SRS-2-ESC-F', 'SRS-2-ESC-M'];

    // Tom por rótulo de classificação da tela (slugClassif)
    const TOM = { 'Típico': 'ok', 'N1': 'leve', 'N2': 'mod', 'N3': 'grave' };
    // Títulos das faixas na seção "Interpretação Clínica do Escore T" da tela
    const TITULO_FAIXA = {
        'Típico': 'Dentro dos limites normais',
        'N1': 'Nível leve',
        'N2': 'Nível moderado',
        'N3': 'Nível severo'
    };
    // Eixo do perfil de escores T da tela (Chart.js: x min 20, max 80)
    const T_MIN = 20, T_MAX = 80;

    // ─── cópia de calcularResultados() da tela (SRS2_NORMS → norms global) ───
    function calcularResultados(SRS2_NORMS, respostas, inst_norms) {
        const item_to_scale = inst_norms.item_to_scale;
        const item_reverse = inst_norms.item_reverse;
        const norms = inst_norms.norms;

        const pontosItem = {};
        const itensSemResposta = {};
        for (const slug of SRS2_NORMS.scale_order) itensSemResposta[slug] = 0;

        for (const numStr in item_to_scale) {
            const num = parseInt(numStr);
            const r = respostas[num] != null ? parseInt(respostas[num]) : null;
            const subescala = item_to_scale[numStr];
            if (r === null || isNaN(r)) {
                pontosItem[num] = null;
                if (subescala && itensSemResposta[subescala] !== undefined) {
                    itensSemResposta[subescala]++;
                }
                continue;
            }
            const valor = item_reverse[numStr] ? (5 - r) : r;
            pontosItem[num] = valor - 1;  // 0-3
        }

        const brutoPorEscala = {};
        for (const slug of SRS2_NORMS.scale_order) brutoPorEscala[slug] = 0;

        for (const numStr in item_to_scale) {
            const num = parseInt(numStr);
            const subescala = item_to_scale[numStr];
            const ponto = pontosItem[num];
            if (ponto === null) continue;
            if (brutoPorEscala[subescala] !== undefined) {
                brutoPorEscala[subescala] += ponto;
            }
        }

        brutoPorEscala['CI']  = brutoPorEscala['PS'] + brutoPorEscala['CGS'] +
                                brutoPorEscala['CMS'] + brutoPorEscala['MS'];
        brutoPorEscala['TOT'] = brutoPorEscala['CI'] + brutoPorEscala['RR'];

        const itensSemRespostaPorEscala = { ...itensSemResposta };
        itensSemRespostaPorEscala['CI']  = itensSemResposta['PS'] + itensSemResposta['CGS'] +
                                           itensSemResposta['CMS'] + itensSemResposta['MS'];
        itensSemRespostaPorEscala['TOT'] = itensSemRespostaPorEscala['CI'] + itensSemResposta['RR'];

        const tPorEscala = {};
        for (const slug of SRS2_NORMS.scale_order) {
            const bruto = brutoPorEscala[slug];
            const tabelaT = norms[slug] || {};
            let t = tabelaT[bruto];
            if (t === undefined) {
                const brutos = Object.keys(tabelaT).map(Number).sort((a, b) => a - b);
                if (brutos.length === 0) { t = null; }
                else if (bruto > brutos[brutos.length - 1]) t = tabelaT[brutos[brutos.length - 1]];
                else if (bruto < brutos[0])                 t = tabelaT[brutos[0]];
                else {
                    let menor = brutos[0];
                    for (const b of brutos) {
                        if (b <= bruto) menor = b; else break;
                    }
                    t = tabelaT[menor];
                }
            }
            tPorEscala[slug] = t;
        }

        const classifPorEscala = {};
        for (const slug of SRS2_NORMS.scale_order) {
            classifPorEscala[slug] = classificarT(SRS2_NORMS, tPorEscala[slug]);
        }

        return { brutoPorEscala, tPorEscala, classifPorEscala, itensSemRespostaPorEscala };
    }

    function classificarT(SRS2_NORMS, t) {
        if (t === null || t === undefined) {
            return SRS2_NORMS.classifications[0];
        }
        for (const c of SRS2_NORMS.classifications) {
            if (t >= c.min && t <= c.max) return c;
        }
        return SRS2_NORMS.classifications[SRS2_NORMS.classifications.length - 1];
    }

    // Zonas da régua de T a partir de json.classifications (último limite = eixo da tela)
    function zonasT(SRS2_NORMS, maxEixo) {
        const cls = SRS2_NORMS.classifications;
        return cls.map((c, i) => ({
            ate: i === cls.length - 1 ? maxEixo : c.max,
            rotulo: c.label,
            tom: TOM[c.label] || 'neutro'
        }));
    }

    function calcular(ctx) {
        const SRS2_NORMS = ctx.json;
        if (!SRS2_NORMS || !SRS2_NORMS.instruments) throw new Error('SRS-2: srs2_norms.json não carregado');
        const inst_norms = SRS2_NORMS.instruments[ctx.sigla];
        if (!inst_norms) throw new Error(`Lookup table não encontrada para ${ctx.sigla}`);

        const respostas = ((ctx.correcao && ctx.correcao.escores_brutos) || ctx.brutos || {}).respostas || ctx.respostas || {};
        const s = calcularResultados(SRS2_NORMS, respostas, inst_norms);
        const chave = LE.util.chave;

        const tTot = s.tPorEscala['TOT'];
        const clTot = s.classifPorEscala['TOT'];
        const maxEixo = Math.max(T_MAX, ...SRS2_NORMS.scale_order.map(k => s.tPorEscala[k] || 0));
        const zonas = zonasT(SRS2_NORMS, maxEixo);

        const subescalas = SRS2_NORMS.scale_order.filter(k => k !== 'TOT').map(slug => {
            const t = s.tPorEscala[slug];
            const cl = s.classifPorEscala[slug];
            const semResp = s.itensSemRespostaPorEscala[slug] || 0;
            return {
                codigo: slug,
                nome: SRS2_NORMS.scales[slug],
                valor: t,
                max: null,
                classificacao: cl.label,
                tom: TOM[cl.label] || 'neutro',
                zonas: zonas,
                extra: `T ${t} · bruto ${s.brutoPorEscala[slug]}` + (semResp ? ` · ${semResp} sem resposta` : '')
            };
        });

        const linhas = SRS2_NORMS.scale_order.map(slug => [
            SRS2_NORMS.scales[slug],
            `Bruto ${s.brutoPorEscala[slug]} · T ${s.tPorEscala[slug]} · ${s.classifPorEscala[slug].label}`
        ]);
        const semTot = s.itensSemRespostaPorEscala['TOT'] || 0;
        if (semTot) linhas.push(['Itens sem resposta', String(semTot)]);

        const conferencia = {
            total: s.brutoPorEscala['TOT'],
            total_bruto: s.brutoPorEscala['TOT'],
            total_t: tTot,
            TOT: s.brutoPorEscala['TOT'],
            TOT_t: tTot,
            itens_sem_resposta: semTot
        };
        SRS2_NORMS.scale_order.filter(k => k !== 'TOT').forEach(slug => {
            const k2 = chave(SRS2_NORMS.scales[slug]);
            conferencia[slug] = s.brutoPorEscala[slug];
            conferencia[slug + '_t'] = s.tPorEscala[slug];
            conferencia[k2] = s.brutoPorEscala[slug];
            conferencia[k2 + '_t'] = s.tPorEscala[slug];
        });

        return {
            sigla: ctx.sigla,
            nome: 'SRS-2',
            respondente: inst_norms.modalidade === 'auto' ? 'Autorrelato' : null,
            norma: `SRS-2 · ${inst_norms.form_label}`,
            principal: {
                rotulo: 'Escore T Total',
                valor: tTot, max: null, sufixo: 'T',
                classificacao: clTot.label,
                tom: TOM[clTot.label] || 'neutro'
            },
            regua: { min: T_MIN, max: maxEixo, valor: tTot, zonas: zonas, rotulo: 'Escore T Total' },
            subescalas: subescalas,
            linhas: linhas,
            indicacao: `Escore T total ${tTot} (${clTot.label}): ${(TITULO_FAIXA[clTot.label] || clTot.label).toLowerCase()}`,
            conferencia: conferencia
        };
    }

    LE.registrar({
        siglas: SIGLAS,
        carregar: { fatores: false, itens: false, classificacoes: false, json: 'srs2_norms.json' },
        calcular: calcular
    });
})();

/* ============================================================================
   CORTEX · Laudo Online — leitores QCP-FC e SRBCSS
   (frontend/shared/laudo/escalas/qcpfc_srbcss.js) · sprint LO-6
   ----------------------------------------------------------------------------
   QCP-FC — mesma conta de frontend/correcao/qcpfc/qcpfc_resultado.js
   (calcularResultados + classificarZ), sem tocar na tela.
     Questionário de Crenças Pessoais — Forma Clínica (PBQ-SF) · 65 itens 0-4
     10 escalas × 7 itens (máx. 28). Mapa item → escala(s) fixo da tela: os itens
     31, 44, 45, 49 e 56 somam em DUAS escalas. Item sem resposta não soma.
     Z = (bruto − média) / DP (norma clínica N=683, constantes da tela).
     Faixas: Z < 0 Abaixo da média · ≤ 1 Média · ≤ 2 Elevado · > 2 Clinicamente
     significativo. Não há escore total; o cabeçalho da tela mostra quantas
     escalas ficaram com Z > 1 ("Escalas Elevadas (Z > 1)") — é o número principal.
     A tela não depende da norma do banco para a conta (só para textos dos itens).

   SRBCSS — mesma conta de frontend/correcao/srbcss/srbcss_resultado.js
   (calcularResultados), sem tocar na tela.
     Renzulli · 126 itens 1-6 · 14 subescalas independentes (fatores do banco,
     eh_total ignorado). Soma por subescala; item sem resposta vale 0 (como na
     tela). % do máximo = round(soma / max_score × 100). Sem norma, sem total,
     sem classificação: a tela só destaca as 3 mais e as 3 menos expressivas
     (ordem por %, empate mantém a ordem dos fatores) e escreve uma frase-resumo.
     O comparativo WISC/WAIS da tela é de outro teste e não entra aqui.
   ============================================================================ */
(function () {
    'use strict';
    if (!window.LaudoEscalas) { console.warn('[qcpfc_srbcss] escalas_base.js não carregado'); return; }
    const U = window.LaudoEscalas.util;

    // =========================================================================
    // QCP-FC
    // =========================================================================
    // ---- copiado de qcpfc_resultado.js (só o que entra na conta) -----------
    const QCP_ORDEM = ['EVT', 'DEP', 'PAG', 'OBC', 'ANT', 'NAR', 'HIS', 'ESQ', 'PAR', 'BOR'];
    const QCP_ESCALAS = {
        EVT: { nome: 'Evitativo',              media: 10.86, dp: 6.46 },
        DEP: { nome: 'Dependente',             media: 9.26,  dp: 6.12 },
        PAG: { nome: 'Passivo-Agressivo',      media: 8.09,  dp: 5.97 },
        OBC: { nome: 'Obsessivo-Compulsivo',   media: 10.56, dp: 7.2 },
        ANT: { nome: 'Antissocial',            media: 4.25,  dp: 4.3 },
        NAR: { nome: 'Narcisista',             media: 3.42,  dp: 4.23 },
        HIS: { nome: 'Histrionico',            media: 6.47,  dp: 6.09 },
        ESQ: { nome: 'Esquizoide',             media: 8.99,  dp: 5.6 },
        PAR: { nome: 'Paranoide',              media: 6.0,   dp: 6.0 },
        BOR: { nome: 'Borderline / Limitrofe', media: 8.0,   dp: 6.5 }
    };
    const ITEM_TO_ESCALAS = {"1": ["EVT"], "2": ["EVT"], "3": ["PAR"], "4": ["PAG"], "5": ["EVT"], "6": ["OBC"], "7": ["PAG"], "8": ["HIS"], "9": ["OBC"], "10": ["NAR"], "11": ["OBC"], "12": ["ESQ"], "13": ["PAR"], "14": ["PAR"], "15": ["DEP"], "16": ["NAR"], "17": ["PAR"], "18": ["DEP"], "19": ["OBC"], "20": ["PAG"], "21": ["PAG"], "22": ["HIS"], "23": ["ANT"], "24": ["PAR"], "25": ["ESQ"], "26": ["NAR"], "27": ["NAR"], "28": ["ESQ"], "29": ["ESQ"], "30": ["OBC"], "31": ["EVT", "BOR"], "32": ["ANT"], "33": ["EVT"], "34": ["HIS"], "35": ["ANT"], "36": ["ESQ"], "37": ["HIS"], "38": ["ANT"], "39": ["EVT"], "40": ["OBC"], "41": ["PAG"], "42": ["ANT"], "43": ["EVT"], "44": ["DEP", "BOR"], "45": ["DEP", "BOR"], "46": ["NAR"], "47": ["PAG"], "48": ["PAR"], "49": ["PAR", "BOR"], "50": ["ESQ"], "51": ["PAG"], "52": ["HIS"], "53": ["ESQ"], "54": ["HIS"], "55": ["HIS"], "56": ["DEP", "BOR"], "57": ["OBC"], "58": ["NAR"], "59": ["ANT"], "60": ["NAR"], "61": ["ANT"], "62": ["DEP"], "63": ["DEP"], "64": ["BOR"], "65": ["BOR"]};

    function classificarZ(z) {
        if (z == null || isNaN(z)) return { label: 'Sem dado', slug: 'vazio' };
        if (z < 0)  return { label: 'Abaixo da média',           slug: 'abaixo' };
        if (z <= 1) return { label: 'Média',                     slug: 'media' };
        if (z <= 2) return { label: 'Elevado',                   slug: 'elevado' };
        return            { label: 'Clinicamente significativo', slug: 'significativo' };
    }

    function qcpCalcular(respostas) {
        const out = {};
        for (const code of QCP_ORDEM) {
            out[code] = { bruto: 0, z: null, classifLabel: 'Sem dado', classifSlug: 'vazio', respostasContadas: 0 };
        }
        for (const [itemNumStr, valorStr] of Object.entries(respostas)) {
            const itemNum = parseInt(itemNumStr, 10);
            const valor = parseInt(valorStr, 10);
            if (isNaN(itemNum) || isNaN(valor)) continue;
            const escalas = ITEM_TO_ESCALAS[itemNum] || [];
            for (const code of escalas) {
                if (out[code]) {
                    out[code].bruto += valor;
                    out[code].respostasContadas += 1;
                }
            }
        }
        for (const code of QCP_ORDEM) {
            const e = QCP_ESCALAS[code];
            const z = (out[code].bruto - e.media) / e.dp;
            const classif = classificarZ(z);
            out[code].z = z;
            out[code].classifLabel = classif.label;
            out[code].classifSlug = classif.slug;
        }
        return out;
    }
    // -------------------------------------------------------------------------

    const QCP_MAX = 28;   // 7 itens × 4 ("Bruto (máx. 28)" na tabela da tela)
    const QCP_TOM = { abaixo: 'ok', media: 'ok', elevado: 'mod', significativo: 'grave', vazio: 'neutro' };
    const QCP_APELIDOS = { BOR: ['borderline', 'limitrofe'], PAG: ['passivo_agressiva'], OBC: ['obsessivo'] };

    // Zonas da régua em escore bruto: a mesma classificarZ aplicada a cada bruto 0..28
    // (evita erro de arredondamento nas fronteiras Z = 0, 1, 2).
    function qcpZonas(code) {
        const e = QCP_ESCALAS[code];
        const zonas = [];
        for (let b = 0; b <= QCP_MAX; b++) {
            const cl = classificarZ((b - e.media) / e.dp);
            const ult = zonas[zonas.length - 1];
            if (ult && ult.rotulo === cl.label) ult.ate = b;
            else zonas.push({ ate: b, rotulo: cl.label, tom: QCP_TOM[cl.slug] });
        }
        return zonas;
    }
    const z2 = z => Number(z.toFixed(2));

    window.LaudoEscalas.registrar({
        siglas: ['QCP-FC'],
        carregar: { fatores: false, itens: false, classificacoes: false, json: null },
        calcular(ctx) {
            const s = qcpCalcular(ctx.respostas || {});
            const elevadas = QCP_ORDEM.filter(c => s[c].z > 1).length;
            const conferencia = { escalas_elevadas: elevadas };
            const subescalas = QCP_ORDEM.map(code => {
                const e = QCP_ESCALAS[code], r = s[code];
                const k = U.chave(e.nome);
                [code, k].concat(QCP_APELIDOS[code] || []).forEach(x => {
                    conferencia[x] = r.bruto;
                    conferencia[x + '_z'] = z2(r.z);
                });
                return {
                    codigo: code, nome: e.nome, valor: r.bruto, max: QCP_MAX,
                    classificacao: r.classifLabel, tom: QCP_TOM[r.classifSlug] || 'neutro',
                    zonas: qcpZonas(code),
                    extra: `Z=${r.z != null ? r.z.toFixed(2) : '—'}`
                };
            });
            return {
                sigla: ctx.sigla || 'QCP-FC',
                nome: 'Questionário de Crenças Pessoais — Forma Clínica',
                respondente: 'Autorrelato',
                norma: 'Escores Z — norma clínica N=683',
                principal: {
                    rotulo: 'Escalas Elevadas (Z > 1)', valor: elevadas, max: QCP_ORDEM.length, sufixo: '',
                    classificacao: null, tom: 'neutro'    // a tela só conta; não classifica o número
                },
                regua: null,          // sem escore total; cada escala tem a sua régua
                subescalas,
                linhas: null,
                indicacao: null,      // a tela não emite frase-resumo
                conferencia
            };
        }
    });

    // =========================================================================
    // SRBCSS
    // =========================================================================
    // ---- copiado de srbcss_resultado.js (calcularResultados) ---------------
    // fatores: linhas de instrumentos_fatores (ordenadas por ordem, como na tela)
    // itens:   [{ numero, texto, fator_codigo }] já mapeados como na tela
    function srbCalcular(respostas, fatores, itens) {
        const respPorNum = {};
        for (const [k, v] of Object.entries(respostas)) respPorNum[parseInt(k)] = parseInt(v) || 0;

        const porFator = {};
        for (const f of fatores) {
            if (f.eh_total) continue;
            porFator[f.fator_codigo] = {
                codigo: f.fator_codigo, nome: f.fator_label, nomeCurto: f.fator_label.replace(/^[IVX]+\.\s*/, ''),
                ordem: f.ordem, minScore: f.min_score || 0, maxScore: f.max_score || 0,
                itens: [], soma: 0, n: 0, pct: 0
            };
        }
        for (const item of itens) {
            const valor = respPorNum[item.numero] ?? 0;
            const fc = item.fator_codigo;
            if (porFator[fc]) {
                porFator[fc].itens.push({ numero: item.numero, valor });
                porFator[fc].soma += valor; porFator[fc].n += 1;
            }
        }
        const subescalas = Object.values(porFator).sort((a, b) => a.ordem - b.ordem);
        for (const s of subescalas) {
            s.pct = s.maxScore > 0 ? Math.round((s.soma / s.maxScore) * 100) : 0;
        }
        const porPct = [...subescalas].sort((a, b) => b.pct - a.pct);
        return {
            subescalas, porPct,
            destaquesAlto: porPct.slice(0, 3),
            destaquesBaixo: porPct.slice(-3).reverse()
        };
    }
    // -------------------------------------------------------------------------

    window.LaudoEscalas.registrar({
        siglas: ['SRBCSS'],
        carregar: { fatores: true, itens: true, classificacoes: false, json: null },
        calcular(ctx) {
            // A tela lê os fatores com .order('ordem') e mapeia item.fator_id → fator_codigo
            // (sem fator conhecido → 'desconhecido', que não soma em nada).
            const fatores = (ctx.fatores || []).slice().sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
            if (!fatores.length) throw new Error('SRBCSS: fatores da norma não carregados');
            const mapFator = {};
            for (const f of fatores) mapFator[f.id] = f.fator_codigo;
            const itens = (ctx.itens || []).slice().sort((a, b) => a.numero - b.numero)
                .map(i => ({ numero: i.numero, fator_codigo: mapFator[i.fator_id] || 'desconhecido' }));
            if (!itens.length) throw new Error('SRBCSS: itens da norma não carregados');

            const s = srbCalcular(ctx.respostas || {}, fatores, itens);
            const alto = new Set(s.destaquesAlto.map(d => d.codigo));
            const baixo = new Set(s.destaquesBaixo.map(d => d.codigo));

            const conferencia = {};
            const subescalas = s.subescalas.map(sub => {
                const k = U.chave(sub.nomeCurto);
                conferencia[sub.codigo] = sub.soma; conferencia[k] = sub.soma;
                conferencia[sub.codigo + '_pct'] = sub.pct; conferencia[k + '_pct'] = sub.pct;
                return {
                    codigo: sub.codigo, nome: sub.nomeCurto, valor: sub.soma, max: sub.maxScore,
                    classificacao: alto.has(sub.codigo) ? 'Mais expressiva' : baixo.has(sub.codigo) ? 'Menos expressiva' : null,
                    tom: 'neutro',    // sem norma nem pontos de corte publicados
                    zonas: null,
                    extra: `${sub.pct}% do máximo`
                };
            });

            const nomesAlto = s.destaquesAlto.map(d => d.nomeCurto).join(', ');
            const nomesBaixo = s.destaquesBaixo.map(d => d.nomeCurto).join(', ');
            return {
                sigla: ctx.sigla || 'SRBCSS',
                nome: 'Características de Altas Habilidades/Superdotação (Renzulli)',
                respondente: null,    // a tela diz "professor[a]/responsável", sem distinguir
                norma: 'Sem norma publicada — % do máximo de cada subescala',
                principal: null,      // 14 subescalas independentes, não somadas em total
                regua: null,
                subescalas,
                linhas: [
                    ['Mais expressivas', s.destaquesAlto.map(d => `${d.nomeCurto} (${d.pct}%)`).join(', ')],
                    ['Menos expressivas', s.destaquesBaixo.map(d => `${d.nomeCurto} (${d.pct}%)`).join(', ')]
                ],
                indicacao: `Pela observação do informante, as áreas de maior expressão relativa foram: ${nomesAlto}. As de menor expressão: ${nomesBaixo}. Os valores são pontuações brutas em relação ao máximo de cada subescala (sem comparação normativa).`,
                conferencia
            };
        }
    });
})();

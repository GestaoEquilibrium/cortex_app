/* ============================================================================
   CORTEX · Laudo Online — leitores ETCD e ERA-F
   (frontend/shared/laudo/escalas/etcd_eraf.js) · sprint LO-6
   ----------------------------------------------------------------------------
   ETCD — mesma conta de frontend/correcao/etcd/etcd_resultado.js
     (calcularResultados). DBD Rating Scale (Pelham et al., 1992) · 4 subescalas.
     Resposta ausente/não numérica vale 0; valor ≥ 2 = item positivo.
     Subescala do item vem do fator do banco (itens[].fator_codigo).
     Cortes (nº de positivos): Desatenção ≥6 · Hiper/Impulsividade ≥6 · TOD ≥4 · TC ≥3.
     TDAH Combinado = Desatenção E Hiper positivos.
     Subtipos TC (qualitativos): presente se QUALQUER item TC positivo do grupo
     (listas de itens copiadas da tela, inclusive o 45 de "Violação de regras").
     Destaque: nº de subescalas positivas (de 4). tom: POSITIVO → mod.

   ERA-F — mesma conta de frontend/correcao/eraf/eraf_resultado.js (calcular).
     34 itens 1–5; branco/não numérico → 3 (Neutro). 4 fatores (CCA, ADG, CM, SS)
     + Escore Geral. Percentil pela regra de degraus da tela (buscarPercentil).
     Corte P ≥ 60 → "Alta presença de sintomas" (tom grave) · senão "Baixa
     presença de sintomas" (tom ok). Destaque: percentil do Escore Geral.
   ============================================================================ */
(function () {
    'use strict';
    if (!window.LaudoEscalas) { console.warn('[etcd_eraf] escalas_base.js não carregado'); return; }
    const U = window.LaudoEscalas.util;

    // =========================================================================
    // ETCD — copiado de etcd_resultado.js
    // =========================================================================
    const LIMITE_POSITIVO = 2;
    const SUBESCALAS = [
        { codigo: 'tdah_desatencao',     nome: 'TDAH — Desatenção',                    qtdItens: 9, corte: 6 },
        { codigo: 'tdah_hiperatividade', nome: 'TDAH — Hiperatividade/Impulsividade',  qtdItens: 9, corte: 6 },
        { codigo: 'tod',                 nome: 'TOD — Transtorno Opositivo Desafiador',qtdItens: 8, corte: 4 },
        { codigo: 'tc',                  nome: 'TC — Transtorno de Conduta',           qtdItens: 18, corte: 3 }
    ];
    const SUBTIPOS_TC = [
        { codigo: 'agressao_pessoas_animais',  nome: 'Agressão a pessoas/animais', itens: [5, 6, 14, 20, 31, 32, 40] },
        { codigo: 'destruicao_patrimonio',     nome: 'Destruição de patrimônio',   itens: [10, 16, 36, 41] },
        { codigo: 'roubo_furto',               nome: 'Roubo / Furto',              itens: [4, 8, 32, 43] },
        { codigo: 'violacao_regras',           nome: 'Violação de regras',         itens: [2, 11, 38, 45] }
    ];

    // itens: [{ numero, fator_codigo }]
    function calcularEtcd(respostas, itens) {
        const respostaPorNumero = {};
        for (const [k, v] of Object.entries(respostas)) respostaPorNumero[parseInt(k)] = parseInt(v) || 0;

        const porSubescala = {};
        for (const sub of SUBESCALAS) porSubescala[sub.codigo] = { ...sub, qtdPositivos: 0, itensPositivos: [], somaPontuacao: 0, positivoFinal: false };

        for (const item of itens) {
            const valor = respostaPorNumero[item.numero] ?? 0;
            const s = porSubescala[item.fator_codigo];
            if (!s) continue;
            s.somaPontuacao += valor;
            if (valor >= LIMITE_POSITIVO) { s.qtdPositivos++; s.itensPositivos.push(item.numero); }
        }
        for (const s of Object.values(porSubescala)) s.positivoFinal = s.qtdPositivos >= s.corte;

        const subescalasOrdenadas = SUBESCALAS.map(s => porSubescala[s.codigo]);
        const tdahCombinado = porSubescala.tdah_desatencao.positivoFinal && porSubescala.tdah_hiperatividade.positivoFinal;
        const tcPositivosSet = new Set(porSubescala.tc.itensPositivos);
        const subtiposTC = SUBTIPOS_TC.map(st => {
            const itensEncontrados = st.itens.filter(n => tcPositivosSet.has(n));
            return { ...st, presente: itensEncontrados.length > 0, itensEncontrados };
        });
        const positivos = subescalasOrdenadas.filter(s => s.positivoFinal);
        return { subescalasOrdenadas, positivos, tdahCombinado, subtiposTC, subtiposTCPresentes: subtiposTC.filter(st => st.presente) };
    }

    const APELIDOS_ETCD = {
        tdah_desatencao: ['desatencao'],
        tdah_hiperatividade: ['hiperatividade', 'hiperatividade_impulsividade'],
        tod: ['opositivo_desafiador'],
        tc: ['conduta', 'transtorno_de_conduta']
    };

    window.LaudoEscalas.registrar({
        siglas: ['ETCD'],
        carregar: { fatores: true, itens: true, classificacoes: false, json: null },
        calcular(ctx) {
            if (!ctx.correcao) throw new Error('Nenhuma correção encontrada');
            if (!ctx.norma) throw new Error('Norma ETCD não cadastrada');
            const itens = (ctx.itens || []).map(i => ({ numero: i.numero, fator_codigo: i.fator_codigo || 'desconhecido' }));
            if (!itens.length) throw new Error('Itens da ETCD não carregados');
            const s = calcularEtcd(ctx.respostas || {}, itens);
            const n = s.positivos.length;
            const rot = p => p ? 'POSITIVO' : 'Negativo';

            const conferencia = { total: n, subescalas_positivas: n };
            const subescalas = s.subescalasOrdenadas.map(sub => {
                [sub.codigo, U.chave(sub.nome)].concat(APELIDOS_ETCD[sub.codigo] || []).forEach(k => { conferencia[k] = sub.qtdPositivos; });
                return {
                    codigo: sub.codigo, nome: sub.nome, valor: sub.qtdPositivos, max: sub.qtdItens,
                    classificacao: rot(sub.positivoFinal), tom: sub.positivoFinal ? 'mod' : 'ok',
                    zonas: [
                        { ate: sub.corte - 1, rotulo: 'Negativo', tom: 'ok' },
                        { ate: sub.qtdItens, rotulo: 'POSITIVO', tom: 'mod' }
                    ],
                    extra: `Itens positivos (resposta ≥ 2) · corte ≥ ${sub.corte}`
                };
            });

            const linhas = [['TDAH Combinado (Desat ≥6 E Hiper ≥6)', rot(s.tdahCombinado)]];
            // a tela só mostra a análise dos subtipos quando TC é positivo ou há subtipo presente
            if (s.subescalasOrdenadas[3].positivoFinal || s.subtiposTCPresentes.length > 0) {
                s.subtiposTC.forEach(st => linhas.push([`Subtipo TC · ${st.nome}`, `${st.itensEncontrados.length} / ${st.itens.length} · ${st.presente ? 'PRESENTE' : 'Ausente'}`]));
            }

            let indicacao;
            if (n === 0) {
                indicacao = 'Nenhuma das 4 subescalas atingiu o ponto de corte estabelecido pela DBD: sem indicadores clinicamente significativos de TDAH, TOD ou TC na triagem';
            } else {
                const nomes = s.positivos.map(p => p.nome.replace(/—.*/, '').trim()).join(', ');
                indicacao = `Resultados POSITIVOS em ${n} ${n === 1 ? 'subescala' : 'subescalas'}: ${nomes}`;
                if (s.tdahCombinado) indicacao += ' · indicativo de TDAH Combinado';
                if (s.subtiposTCPresentes.length) indicacao += ` · subtipos TC com itens positivos: ${s.subtiposTCPresentes.map(st => st.nome).join(', ')}`;
            }

            return {
                sigla: ctx.sigla || 'ETCD',
                nome: 'Escala de Avaliação de Transtornos de Comportamento Disruptivo (ETCD/DBD)',
                respondente: null,   // a tela não distingue pais/responsável de professor
                norma: 'Pontos de corte da DBD (Pelham et al., 1992)',
                principal: {
                    rotulo: 'Subescalas positivas', valor: n, max: 4, sufixo: '',
                    classificacao: rot(n > 0), tom: n > 0 ? 'mod' : 'ok'
                },
                regua: {
                    min: 0, max: 4, valor: n, rotulo: 'Subescalas positivas',
                    zonas: [{ ate: 0, rotulo: 'Negativo', tom: 'ok' }, { ate: 4, rotulo: 'POSITIVO', tom: 'mod' }]
                },
                subescalas,
                linhas,
                indicacao,
                conferencia
            };
        }
    });

    // =========================================================================
    // ERA-F — copiado de eraf_resultado.js
    // =========================================================================
    const CORTE = 60;
    const ITEM_FATOR = {
        1:'CCA',2:'CCA',3:'ADG',4:'ADG',5:'ADG',6:'CCA',7:'CM',8:'CM',9:'CCA',10:'CCA',
        11:'CCA',12:'CCA',13:'CCA',14:'CM',15:'CM',16:'CM',17:'CM',18:'CCA',19:'CCA',20:'SS',
        21:'CM',22:'CM',23:'CM',24:'CM',25:'ADG',26:'CM',27:'CM',28:'SS',29:'CM',30:'CM',
        31:'SS',32:'SS',33:'CM',34:'CM'
    };
    const FATORES = [
        { cod:'CCA', label:'Camuflagem: Compensação e Assimilação' },
        { cod:'ADG', label:'Autopercepção de Gênero' },
        { cod:'CM',  label:'Camuflagem: Mascaramento' },
        { cod:'SS',  label:'Sensibilidade Sensorial' }
    ];
    const PERCENTIS = [1,5,10,15,20,25,30,35,40,45,50,55,60,65,70,75,80,85,90,95,99];
    const NORMA_GERAL = [[1,34],[5,62],[10,77],[15,87],[20,95],[25,102],[30,107],[35,112],[40,117],[45,121],[50,125],[55,128],[60,132],[65,135],[70,139],[75,142],[80,146],[85,149],[90,153],[95,159],[99,170]];
    const NORMA_FATOR = {
        CCA:[10,14,18,20,23,25,27,29,31,32,34,35,37,38,39,41,42,44,46,48,50],
        ADG:[4,4,6,7,7,8,9,9,10,11,11,12,13,13,14,15,16,16,17,19,20],
        CM: [16,33,41,47,51,55,57,60,61,63,65,66,68,69,71,72,74,75,77,78,80],
        SS: [4,6,8,10,11,11,12,13,14,15,15,15,16,17,17,18,18,19,19,20,20]
    };
    const MEDIA = { GERAL:119.6, CCA:32.7, ADG:11.4, CM:61.7, SS:14.4 };
    const DP    = { GERAL:29.1,  CCA:10.3, ADG:4.3,  CM:13.7, SS:4.2 };

    function tabelaFator(cod) { return PERCENTIS.map((p, i) => [p, NORMA_FATOR[cod][i]]); }
    function buscarPercentil(tabela, bruto) {
        const v = tabela.filter(([p, b]) => b != null && !isNaN(b));
        if (!v.length) return null;
        if (bruto < v[0][1]) return 1;
        let achado = 1;
        for (const [p, b] of v) if (bruto >= b) achado = p;
        return achado;
    }
    const classificar = (pct) => pct >= CORTE ? 'Alta presença de sintomas' : 'Baixa presença de sintomas';

    function calcularEraf(respostas) {
        const somaFator = { CCA:0, ADG:0, CM:0, SS:0 };
        let geral = 0, respondidos = 0;
        for (let n = 1; n <= 34; n++) {
            let v = parseInt(respostas[n], 10);
            if (isNaN(v)) v = 3;
            else respondidos++;
            somaFator[ITEM_FATOR[n]] += v;
            geral += v;
        }
        const res = { fatores: {}, geral: {}, respondidos };
        for (const f of FATORES) {
            const bruto = somaFator[f.cod];
            const pct = buscarPercentil(tabelaFator(f.cod), bruto);
            res.fatores[f.cod] = { bruto, pct, classif: classificar(pct) };
        }
        const pctG = buscarPercentil(NORMA_GERAL, geral);
        res.geral = { bruto: geral, pct: pctG, classif: classificar(pctG) };
        return res;
    }
    // -------------------------------------------------------------------------

    const tomEraf = pct => pct >= CORTE ? 'grave' : 'ok';
    const ZONAS_ERAF = [
        { ate: CORTE - 1, rotulo: 'Baixa presença de sintomas', tom: 'ok' },
        { ate: 99, rotulo: 'Alta presença de sintomas', tom: 'grave' }
    ];

    window.LaudoEscalas.registrar({
        siglas: ['ERA-F'],
        carregar: { fatores: false, itens: false, classificacoes: false, json: null },
        calcular(ctx) {
            if (!ctx.correcao) throw new Error('Nenhuma correção encontrada');
            const r = calcularEraf(ctx.respostas || {});
            const g = r.geral;

            const conferencia = {
                total: g.bruto, total_percentil: g.pct,
                geral: g.bruto, geral_percentil: g.pct,
                escore_geral: g.bruto, escore_geral_percentil: g.pct,
                percentil: g.pct
            };
            const subescalas = FATORES.map(f => {
                const d = r.fatores[f.cod];
                [f.cod, U.chave(f.label)].forEach(k => { conferencia[k] = d.bruto; conferencia[k + '_percentil'] = d.pct; });
                return {
                    codigo: f.cod, nome: f.label, valor: d.pct, max: null,
                    classificacao: d.classif, tom: tomEraf(d.pct),
                    zonas: ZONAS_ERAF,
                    extra: `Percentil · bruto ${d.bruto} · Média ${MEDIA[f.cod]} (DP ${DP[f.cod]})`
                };
            });

            const linhas = [['Escore bruto geral', `${g.bruto} / 170 · Média ${MEDIA.GERAL} (DP ${DP.GERAL})`]];
            if (r.respondidos < 34) linhas.push(['Itens sem resposta (pontuados como 3)', String(34 - r.respondidos)]);

            return {
                sigla: ctx.sigla || 'ERA-F',
                nome: 'Escala de Rastreio de Autismo Feminino (ERA-F)',
                respondente: 'Autorrelato',
                norma: 'Normas percentílicas (N=7.738) · corte P≥60',
                principal: {
                    rotulo: 'Escore geral (percentil)', valor: g.pct, max: null, sufixo: 'P',
                    classificacao: g.classif, tom: tomEraf(g.pct)
                },
                regua: { min: 1, max: 99, valor: g.pct, rotulo: 'Escore geral · percentil', zonas: ZONAS_ERAF },
                subescalas,
                linhas,
                indicacao: g.pct >= CORTE
                    ? `Escore geral no percentil ${g.pct} (≥ ${CORTE}): alta presença de sintomas consistentes com TEA; sugere avaliação diagnóstica completa e multidisciplinar`
                    : `Escore geral no percentil ${g.pct} (< ${CORTE}): baixa relação com TEA pela autopercepção`,
                conferencia
            };
        }
    });
})();

/* ============================================================================
   CORTEX · Laudo Online — leitores ETDAH-PAIS e ETDAH-AD
   (frontend/shared/laudo/escalas/etdah.js) · sprint LO-6
   ----------------------------------------------------------------------------
   Mesma conta das telas de correção, sem tocar nelas:
     ETDAH-PAIS → frontend/correcao/etdahpais/etdahpais_resultado.js
     ETDAH-AD   → frontend/correcao/etdahad/etdahad_resultado.js
   Tabelas NORMAS copiadas das telas (mesmos valores, só a formatação mudou).

   ETDAH-PAIS (Benczik; Memnon) · 58 itens 1-6 · heteroaplicação (pais).
     Fatores RE (19) · HI (13) · CA (14) · A (12) + Escore Geral = soma dos 4.
     Itens reverso=true entram como eMin+eMax-resp (eMin/eMax = norma.escala_min/max,
     padrão 1/6). Resposta ausente ou fora de [eMin, eMax] vale 0.
     Percentil por sexo + faixa etária (2-5 / 6-9 / 10-13 / 14-17), idade na data
     da aplicação (data_aplicacao || created_at), regra de degraus.
   ETDAH-AD · autoavaliação adulto · 5 fatores, SEM total.
     Os escores brutos por fator vêm calculados do banco
     (correcoes.escores_brutos.fatores[CODIGO].score); percentil por escolaridade
     (Fundamental / Médio / Superior), regra de degraus.
   Classificação (as duas): ≥85 Superior · ≥65 Médio Superior · ≥45 Médio ·
     ≥25 Médio Inferior · <25 Inferior · sem percentil → 'Sem dado'.

   Tom no laudo (a tela pinta a tabela: Superior vermelho, Médio Superior amarelo,
   demais azul): Superior → grave, Médio Superior → leve, demais → ok, Sem dado → neutro.
   AAMA (ETDAH-AD) é de interpretação INVERSA (nota técnica e textos da tela:
   abaixo da média = déficit de autocontrole): Inferior → grave,
   Médio Inferior → leve, demais → ok.

   Valores do resumo: com percentil, cada fator é desenhado na régua de percentil
   (0-100, zonas = faixas de classificação) e o bruto vai em `extra`; sem estrato
   normativo o valor é o bruto, sem zonas, classificação 'Sem dado'.
   ============================================================================ */
(function () {
    'use strict';
    if (!window.LaudoEscalas) { console.warn('[etdah] escalas_base.js não carregado'); return; }
    const U = window.LaudoEscalas.util;

    // ======================= comum (idêntico nas duas telas) ===================
    function classificarPercentil(p) {
        if (p == null) return { label: 'Sem dado', slug: 'vazio' };
        if (p >= 85) return { label: 'Superior',       slug: 'superior' };
        if (p >= 65) return { label: 'Médio Superior', slug: 'medio-superior' };
        if (p >= 45) return { label: 'Médio',          slug: 'medio' };
        if (p >= 25) return { label: 'Médio Inferior', slug: 'medio-inferior' };
        return            { label: 'Inferior',       slug: 'inferior' };
    }
    // Regra de degraus (versão da ETDAH-PAIS; a da ETDAH-AD é a mesma sem o
    // guarda `!tabela`, que lá nunca é atingido)
    function buscarPercentil(tabela, bruto) {
        if (!tabela) return null;
        const validas = tabela.filter(([p, b]) => b !== null && b !== undefined && !isNaN(b));
        if (validas.length === 0) return null;
        if (bruto < validas[0][1]) return 1;
        let percentilAchado = null;
        for (const [p, b] of validas) { if (bruto >= b) percentilAchado = p; }
        const maiorEntrada = validas[validas.length - 1];
        if (bruto > maiorEntrada[1]) return maiorEntrada[0];
        return percentilAchado != null ? percentilAchado : 1;
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

    // ----- tom / régua de percentil -------------------------------------------
    const TOM_DIRETO = { 'Superior': 'grave', 'Médio Superior': 'leve', 'Médio': 'ok', 'Médio Inferior': 'ok', 'Inferior': 'ok' };
    const TOM_INVERSO = { 'Superior': 'ok', 'Médio Superior': 'ok', 'Médio': 'ok', 'Médio Inferior': 'leve', 'Inferior': 'grave' };
    function tomDe(label, inverso) {
        const t = (inverso ? TOM_INVERSO : TOM_DIRETO)[label];
        return t || 'neutro';
    }
    // Percentis das tabelas são inteiros: 'ate' = maior percentil da faixa
    function zonasPercentil(inverso) {
        return [
            { ate: 24,  rotulo: 'Inferior' }, { ate: 44, rotulo: 'Médio Inferior' }, { ate: 64, rotulo: 'Médio' },
            { ate: 84,  rotulo: 'Médio Superior' }, { ate: 100, rotulo: 'Superior' }
        ].map(z => Object.assign(z, { tom: tomDe(z.rotulo, inverso) }));
    }
    function fatorParaResumo(codigo, nome, r, inverso, maxBruto) {
        const temP = r.percentil != null;
        return {
            codigo, nome,
            valor: temP ? r.percentil : r.bruto,
            max: temP ? 100 : maxBruto,
            classificacao: r.classifLabel,
            tom: temP ? tomDe(r.classifLabel, inverso) : 'neutro',
            zonas: temP ? zonasPercentil(inverso) : null,
            extra: r.bruto == null ? 'Sem escore bruto' : (temP ? `Percentil ${r.percentil} · bruto ${r.bruto}` : `Bruto ${r.bruto} · sem percentil`)
        };
    }
    // Grava o bruto e o percentil sob todas as chaves pedidas
    function conferir(conf, chaves, r) {
        chaves.forEach(k => {
            if (r.bruto != null) conf[k] = r.bruto;
            if (r.percentil != null) conf[k + '_percentil'] = r.percentil;
        });
    }

    // ================================ ETDAH-PAIS ================================
    // ---- copiado de etdahpais_resultado.js ----
    const PAIS_ORDEM = ['GERAL', 'RE', 'HI', 'CA', 'A'];
    const PAIS_INFO = {
        GERAL: { label: 'Escore Geral',                           chave_norma: 'GERAL' },
        RE:    { label: 'Fator 1 — Regulação Emocional',          chave_norma: 'RE' },
        HI:    { label: 'Fator 2 — Hiperatividade/Impulsividade', chave_norma: 'HI' },
        CA:    { label: 'Fator 3 — Comportamento Adaptativo',     chave_norma: 'CA' },
        A:     { label: 'Fator 4 — Atenção',                      chave_norma: 'A' }
    };
    const PAIS_N_ITENS = { GERAL: 58, RE: 19, HI: 13, CA: 14, A: 12 };
    const NORMAS_PAIS = {
        "F_2a5": {
            "GERAL": [[1,106],[5,107],[10,116],[15,119.3],[20,127.4],[25,130.5],[30,133.6],[35,136.8],[40,139.6],[45,151.7],[50,155],[55,160.4],[60,173.8],[65,180.3],[70,191.2],[75,196.5],[80,209],[85,217],[90,244.2],[95,252.8]],
            "RE": [[1,23],[5,23.9],[10,32.6],[15,35.3],[20,36],[25,36.5],[30,38.8],[35,40.7],[40,41.8],[45,44.7],[50,47],[55,49.4],[60,53],[65,53],[70,53],[75,53.5],[80,57.6],[85,62.1],[90,65.4],[95,76.8]],
            "HI": [[1,21],[5,21],[10,21.6],[15,24.3],[20,25.4],[25,27.5],[30,29],[35,29.7],[40,30.8],[45,32.8],[50,34],[55,34.1],[60,35.2],[65,37.8],[70,42],[75,53.5],[80,67.4],[85,72.5],[90,74],[95,74]],
            "CA": [[1,20],[5,20.7],[10,29],[15,37],[20,37],[25,38],[30,40.2],[35,44.5],[40,46],[45,46],[50,47],[55,48.1],[60,51],[65,59],[70,59.8],[75,61],[80,63.4],[85,66.4],[90,71.8],[95,78.4]],
            "A": [[1,13],[5,13],[10,13.4],[15,15.9],[20,18.8],[25,20],[30,20.6],[35,21],[40,23.4],[45,24],[50,25],[55,26.2],[60,28.2],[65,29.3],[70,30],[75,31],[80,35.6],[85,48.5],[90,53],[95,53]]
        },
        "F_6a9": {
            "GERAL": [[1,88],[5,95.65],[10,107.7],[15,112.8],[20,124.4],[25,128],[30,134.5],[35,137.2],[40,144],[45,145.55],[50,162],[55,169.9],[60,176],[65,185],[70,187],[75,190.75],[80,192.8],[85,196],[90,210.6],[95,227.55]],
            "RE": [[1,23],[5,24.8],[10,29.7],[15,32.05],[20,34.8],[25,36.75],[30,42.5],[35,44.15],[40,45],[45,45],[50,45.5],[55,46.95],[60,49.4],[65,54.7],[70,55],[75,57.25],[80,61],[85,65],[90,65.6],[95,77.05]],
            "HI": [[1,18],[5,18.45],[10,19.9],[15,23.7],[20,25],[25,27],[30,27],[35,27.15],[40,29.2],[45,30],[50,30.5],[55,32.9],[60,34],[65,34],[70,43],[75,46.75],[80,50.6],[85,53],[90,53.3],[95,58.75]],
            "CA": [[1,21],[5,22.35],[10,26.7],[15,28.35],[20,29],[25,34.5],[30,40.2],[35,43.45],[40,47.2],[45,49],[50,50.5],[55,54.85],[60,55.8],[65,57],[70,57],[75,58.5],[80,60.2],[85,61],[90,65.3],[95,71.3]],
            "A": [[1,15],[5,16.35],[10,18],[15,22],[20,22.8],[25,24],[30,24],[35,26],[40,26],[45,26.05],[50,27],[55,27],[60,29.6],[65,32],[70,32.3],[75,33],[80,35],[85,35],[90,37.2],[95,43.4]]
        },
        "F_10a13": {
            "GERAL": [[1,80],[5,86.6],[10,97.4],[15,101],[20,106],[25,116.5],[30,122.8],[35,128.7],[40,134.8],[45,139],[50,142.5],[55,145.4],[60,156],[65,159.45],[70,176],[75,190],[80,194.6],[85,198.75],[90,208.3],[95,238.65]],
            "RE": [[1,20],[5,22.2],[10,27.2],[15,29],[20,30],[25,30],[30,36.3],[35,38.7],[40,39],[45,40.9],[50,41],[55,43.2],[60,48.2],[65,49],[70,51.1],[75,52.75],[80,55.8],[85,65.5],[90,76.5],[95,83.7]],
            "HI": [[1,14],[5,16.2],[10,18.2],[15,20],[20,20.2],[25,21.75],[30,22.6],[35,24.85],[40,25],[45,25],[50,26],[55,27.05],[60,28.6],[65,29.15],[70,30],[75,32],[80,38.2],[85,44.05],[90,46.9],[95,57.7]],
            "CA": [[1,15],[5,16.65],[10,26.1],[15,30.25],[20,33.2],[25,35.5],[30,38.9],[35,42.7],[40,43.4],[45,44],[50,46.5],[55,49],[60,49.6],[65,53],[70,53.7],[75,55.5],[80,57],[85,58.7],[90,60],[95,70.35]],
            "A": [[1,12],[5,12],[10,13.2],[15,16.95],[20,19.4],[25,21],[30,21],[35,21.85],[40,23.4],[45,24.95],[50,25],[55,26.2],[60,32.4],[65,34.15],[70,35],[75,37],[80,38.6],[85,46.4],[90,52.6],[95,59.6]]
        },
        "F_14a17": {
            "GERAL": [[1,72],[5,72],[10,78.3],[15,87.05],[20,95.2],[25,102.25],[30,109.2],[35,110.9],[40,111.8],[45,115.25],[50,117],[55,118.05],[60,122],[65,130.8],[70,144.4],[75,147.5],[80,149.2],[85,157.2],[90,169.6]],
            "RE": [[1,25],[5,25],[10,25],[15,25.55],[20,26.4],[25,27.5],[30,29.4],[35,32.8],[40,33],[45,33.65],[50,35],[55,36],[60,36.2],[65,37],[70,37],[75,37.75],[80,39.2],[85,40],[90,46.3]],
            "HI": [[1,16],[5,16],[10,16],[15,16.55],[20,18.6],[25,21],[30,21.1],[35,21.95],[40,23.6],[45,24],[50,24],[55,25.75],[60,29],[65,29.1],[70,30.8],[75,32.5],[80,33.6],[85,35.35],[90,37.9]],
            "CA": [[1,18],[5,18],[10,18.7],[15,21.75],[20,24.4],[25,27.5],[30,35.1],[35,35.95],[40,36],[45,36.65],[50,37.5],[55,38.7],[60,40.2],[65,41.05],[70,41.9],[75,45],[80,46.6],[85,49.25],[90,54.7]],
            "A": [[1,12],[5,12],[10,12],[15,13.1],[20,14],[25,14.75],[30,17],[35,17],[40,21],[45,22],[50,23],[55,24],[60,24.4],[65,26.15],[70,28.7],[75,30.5],[80,33.4],[85,35.9],[90,38.2]]
        },
        "M_2a5": {
            "GERAL": [[1,115],[5,115],[10,115],[15,136.7],[20,151.4],[25,156.5],[30,159.2],[35,161.3],[40,162.6],[45,165.1],[50,166],[55,167.8],[60,168],[65,169.4],[70,171.2],[75,174.5],[80,183],[85,196.5],[90,211.2]],
            "RE": [[1,30],[5,30],[10,30.8],[15,31],[20,33.4],[25,37],[30,39],[35,39.3],[40,40],[45,40.3],[50,43],[55,46.6],[60,47],[65,48.4],[70,49.6],[75,50.5],[80,52.6],[85,55.6],[90,57.2]],
            "HI": [[1,23],[5,23],[10,24.6],[15,25],[20,25.6],[25,26],[30,28],[35,32.5],[40,36.6],[45,39.1],[50,40],[55,40.9],[60,45],[65,46.7],[70,47.6],[75,50],[80,52.8],[85,54.6],[90,58.6]],
            "CA": [[1,38],[5,38],[10,38],[15,44.3],[20,47],[25,47.5],[30,48.8],[35,50.6],[40,52.4],[45,54.1],[50,55],[55,55],[60,55.8],[65,56.7],[70,57.6],[75,59],[80,61.6],[85,64.9],[90,67.4]],
            "A": [[1,19],[5,19],[10,20.6],[15,21],[20,21],[25,22.5],[30,24.4],[35,25],[40,25.2],[45,26.1],[50,27],[55,29.7],[60,31.6],[65,32.7],[70,33.6],[75,34.5],[80,35.4],[85,36.3],[90,37.2]]
        },
        "M_6a9": {
            "GERAL": [[1,102],[5,106.2],[10,114.7],[15,117.6],[20,129],[25,132.75],[30,136.7],[35,143],[40,145.4],[45,151.15],[50,152.5],[55,153.85],[60,165.2],[65,172.05],[70,178.8],[75,203.25],[80,214.8],[85,218.85],[90,219.9],[95,253.85]],
            "RE": [[1,22],[5,23.75],[10,28.4],[15,30],[20,30],[25,30.75],[30,33.3],[35,36.45],[40,37],[45,37],[50,41],[55,45],[60,45],[65,47.75],[70,50.9],[75,54],[80,61.8],[85,64.9],[90,69],[95,85.9]],
            "HI": [[1,21],[5,21.7],[10,23],[15,24.1],[20,26],[25,28.25],[30,29.1],[35,30],[40,30],[45,32.3],[50,34],[55,34],[60,35.4],[65,37.55],[70,42.5],[75,44.25],[80,46.8],[85,50.85],[90,61],[95,62.95]],
            "CA": [[1,34],[5,34.35],[10,35],[15,37],[20,38.6],[25,41.75],[30,44.1],[35,46.35],[40,48],[45,48.15],[50,49],[55,49],[60,51],[65,52.65],[70,54],[75,57],[80,60],[85,66.75],[90,67.3],[95,71.25]],
            "A": [[1,15],[5,15.7],[10,17],[15,18.1],[20,20],[25,21.5],[30,23.7],[35,30.45],[40,31],[45,31.3],[50,33.5],[55,34],[60,34.4],[65,37.65],[70,39.9],[75,41],[80,44],[85,45.9],[90,46.6],[95,48]]
        },
        "M_10a13": {
            "GERAL": [[1,104],[5,104.9],[10,120.6],[15,127.3],[20,134.2],[25,148],[30,149.8],[35,153.1],[40,155.6],[45,163.1],[50,165],[55,168.5],[60,175.6],[65,186.3],[70,195],[75,207],[80,222.8],[85,235],[90,247.8],[95,258.1]],
            "RE": [[1,25],[5,25],[10,26.3],[15,29.2],[20,30.9],[25,32.2],[30,34],[35,34.8],[40,36.1],[45,39.2],[50,42],[55,43],[60,47.6],[65,50],[70,51],[75,55.2],[80,60],[85,61],[90,69],[95,78],[99,86.1]],
            "HI": [[1,15],[5,21],[10,24.8],[15,26.9],[20,28],[25,28.5],[30,30],[35,32],[40,35],[45,35],[50,36],[55,39.3],[60,40],[65,41],[70,41.2],[75,43.5],[80,51.2],[85,56.3],[90,66.4],[95,68.4]],
            "CA": [[1,27],[5,32],[10,37.8],[15,41],[20,44.4],[25,46],[30,49],[35,51],[40,51.4],[45,52.7],[50,53],[55,54],[60,54.6],[65,57.7],[70,59.2],[75,60],[80,60],[85,64],[90,65.4],[95,70]],
            "A": [[1,15],[5,16.3],[10,19.6],[15,21],[20,22.6],[25,27.5],[30,28],[35,29.1],[40,30],[45,31],[50,36],[55,36],[60,37.2],[65,39.9],[70,42],[75,42.5],[80,43],[85,49],[90,50.4],[95,62.2]]
        },
        "M_14a17": {
            "GERAL": [[1,84],[5,84.45],[10,94.6],[15,109.15],[20,112.4],[25,124],[30,130.3],[35,131],[40,132.2],[45,136.7],[50,141.5],[55,143],[60,143],[65,145.6],[70,162.4],[75,173.5],[80,188.6],[85,192],[90,192],[95,235.7]],
            "RE": [[1,20],[5,20],[10,20.5],[15,25],[20,25.8],[25,29.25],[30,30.3],[35,31.35],[40,32.4],[45,33],[50,33],[55,36.3],[60,39.6],[65,44.55],[70,49.8],[75,52.5],[80,55.4],[85,56],[90,71.3],[95,108.15]],
            "HI": [[1,16],[5,16.1],[10,18.2],[15,20.15],[20,21.2],[25,23],[30,26.3],[35,27.35],[40,28],[45,28],[50,29.5],[55,32.65],[60,35.2],[65,36],[70,36.7],[75,37],[80,38.6],[85,39.85],[90,41.8],[95,42]],
            "CA": [[1,20],[5,20.6],[10,32.2],[15,34],[20,34],[25,35.25],[30,39.3],[35,41.05],[40,43],[45,43],[50,46.5],[55,51.1],[60,52.6],[65,53],[70,53],[75,53],[80,53.8],[85,59.1],[90,60.9],[95,65.75]],
            "A": [[1,15],[5,15.05],[10,16.1],[15,17],[20,17.4],[25,19.75],[30,22],[35,23.4],[40,26],[45,26],[50,27],[55,29.1],[60,31.8],[65,33.65],[70,34],[75,34],[80,36.4],[85,38.7],[90,40.8],[95,41]]
        }
    };
    function faixaIdade(anos) {
        if (anos == null) return null;
        if (anos >= 2 && anos <= 5) return '2a5';
        if (anos >= 6 && anos <= 9) return '6a9';
        if (anos >= 10 && anos <= 13) return '10a13';
        if (anos >= 14 && anos <= 17) return '14a17';
        return null;
    }
    function detectarEstrato(sexo, anos) {
        const f = faixaIdade(anos); if (!f) return null;
        const s = String(sexo || '').trim().toUpperCase();
        const sx = (s === 'F' || s.startsWith('FEM')) ? 'F'
                 : (s === 'M' || s.startsWith('MASC')) ? 'M' : null;
        if (!sx) return null;
        return sx + '_' + f;
    }
    function estratoLabel(est) {
        if (!est) return '—';
        const [sx, fx] = est.split('_');
        const sexo = sx === 'F' ? 'sexo feminino' : 'sexo masculino';
        const faixa = { '2a5': '2 a 5 anos', '6a9': '6 a 9 anos', '10a13': '10 a 13 anos', '14a17': '14 a 17 anos' }[fx] || fx;
        return `${sexo}, ${faixa}`;
    }
    // itens: [{ numero, reverso, fator_codigo }] · norma: { escala_min, escala_max }
    function calcularPais(respostas, itens, norma, estrato) {
        const respPorNum = {};
        for (const [k, v] of Object.entries(respostas)) respPorNum[parseInt(k)] = parseInt(v) || 0;
        const eMin = norma.escala_min || 1;
        const eMax = norma.escala_max || 6;
        const brutoFator = { RE: 0, HI: 0, CA: 0, A: 0 };
        for (const item of itens) {
            const valor = respPorNum[item.numero] ?? 0;
            const valido = valor >= eMin && valor <= eMax;
            const ajustado = valido ? (item.reverso ? (eMin + eMax - valor) : valor) : 0;
            const fc = item.fator_codigo;
            if (brutoFator[fc] !== undefined) brutoFator[fc] += ajustado;
        }
        const geral = brutoFator.RE + brutoFator.HI + brutoFator.CA + brutoFator.A;
        const tabelaNorma = estrato ? NORMAS_PAIS[estrato] : null;
        const out = {};
        for (const code of PAIS_ORDEM) {
            const bruto = code === 'GERAL' ? geral : brutoFator[code];
            let percentil = null;
            if (tabelaNorma) {
                const tabela = tabelaNorma[PAIS_INFO[code].chave_norma];
                if (tabela) percentil = buscarPercentil(tabela, bruto);
            }
            const classif = classificarPercentil(percentil);
            out[code] = { bruto, percentil, classifLabel: classif.label, classifSlug: classif.slug };
        }
        return out;
    }
    // ---- fim da cópia ----

    // Chaves extras da conferência (nome curto do fator e apelidos do Gerador)
    const PAIS_CHAVES = {
        GERAL: ['total', 'GERAL', 'geral', 'escore_geral'],
        RE: ['RE', 'regulacao_emocional', 'regulacao'],
        HI: ['HI', 'hiperatividade_impulsividade', 'hiperatividade'],
        CA: ['CA', 'comportamento_adaptativo', 'adaptativo'],
        A:  ['A', 'atencao']
    };

    window.LaudoEscalas.registrar({
        siglas: ['ETDAH-PAIS'],
        carregar: { fatores: true, itens: true, classificacoes: false, json: null },
        calcular(ctx) {
            if (!ctx.norma) throw new Error('ETDAH-PAIS: norma não carregada');
            const itens = (ctx.itens || []).map(i => ({ numero: i.numero, reverso: !!i.reverso, fator_codigo: i.fator_codigo || null }));
            if (!itens.length) throw new Error('ETDAH-PAIS: itens da norma não carregados');
            const pac = ctx.paciente || {};
            const apl = ctx.aplicacao || null;
            // Igual à tela: idade em anos na data_aplicacao (ou created_at)
            const idade = apl ? calcularIdade(pac.data_nascimento, apl.data_aplicacao || apl.created_at)
                              : (ctx.idade && ctx.idade.anos != null ? ctx.idade.anos : null);
            const estrato = detectarEstrato(pac.sexo, idade);
            const s = calcularPais(ctx.respostas || {}, itens, ctx.norma, estrato);
            const eMax = ctx.norma.escala_max || 6;

            const g = s.GERAL;
            const principal = g.percentil != null
                ? { rotulo: 'Escore Geral (percentil)', valor: g.percentil, max: 100, sufixo: 'P', classificacao: g.classifLabel, tom: tomDe(g.classifLabel, false) }
                : { rotulo: 'Escore Geral (bruto)', valor: g.bruto, max: PAIS_N_ITENS.GERAL * eMax, sufixo: '', classificacao: g.classifLabel, tom: 'neutro' };
            const regua = g.percentil != null
                ? { min: 0, max: 100, valor: g.percentil, zonas: zonasPercentil(false), rotulo: 'Escore Geral (percentil)' }
                : null;

            const conferencia = {};
            PAIS_ORDEM.forEach(code => conferir(conferencia, PAIS_CHAVES[code].concat(U.chave(PAIS_INFO[code].label)), s[code]));
            const subescalas = ['RE', 'HI', 'CA', 'A'].map(code =>
                fatorParaResumo(code, PAIS_INFO[code].label, s[code], false, PAIS_N_ITENS[code] * eMax));

            return {
                sigla: ctx.sigla || 'ETDAH-PAIS',
                nome: 'ETDAH-PAIS',
                respondente: 'Pais/responsável',
                norma: estrato ? `Normas por sexo e idade (${estratoLabel(estrato)})` : null,
                principal, regua, subescalas,
                linhas: estrato ? null : [['Estrato normativo', 'não identificado (sexo/idade fora das faixas 2-17 anos) — sem percentil']],
                indicacao: null,   // a tela não emite frase-resumo
                conferencia
            };
        }
    });

    // ================================= ETDAH-AD =================================
    // ---- copiado de etdahad_resultado.js ----
    const AD_ORDEM = ['DESATENCAO', 'HIPERATI', 'IMPULSIV', 'ASPECTOS', 'AAMA'];
    const AD_INFO = {
        DESATENCAO: { label: 'Desatenção',          chave_norma: 'Desatenção' },
        HIPERATI:   { label: 'Hiperatividade',      chave_norma: 'Hiperatividade' },
        IMPULSIV:   { label: 'Impulsividade',       chave_norma: 'Impulsividade' },
        ASPECTOS:   { label: 'Aspectos Emocionais', chave_norma: 'Aspectos Emocionais' },
        AAMA:       { label: 'AAMA',                chave_norma: 'AAMA' }
    };
    const NORMAS_AD = {
        "Ensino Fundamental": {
            "Desatenção": [[1,6],[5,16],[10,21],[15,23],[20,26],[25,30],[30,32],[35,34],[40,37],[45,39],[50,42],[55,43],[60,45],[65,47],[70,49],[75,54],[80,59],[85,63],[90,68],[95,70]],
            "Impulsividade": [[1,8],[5,15],[10,21],[15,26],[20,28],[25,31],[30,33],[35,35],[40,37],[45,39],[50,42],[55,44],[60,49],[65,51],[70,52],[75,54],[80,58],[85,64],[90,71],[95,82]],
            "Hiperatividade": [[1,2],[5,6],[10,null],[15,8],[20,10],[25,12],[30,13],[35,14],[40,15],[45,16],[50,17],[55,18],[60,null],[65,null],[70,null],[75,18],[80,null],[85,20],[90,21],[95,22]],
            "Aspectos Emocionais": [[1,null],[5,null],[10,null],[15,null],[20,2],[25,null],[30,3],[35,null],[40,4],[45,null],[50,5],[55,6],[60,null],[65,6],[70,null],[75,7],[80,8],[85,10],[90,12],[95,15]],
            "AAMA": [[1,2],[5,8],[10,12],[15,13],[20,14],[25,16],[30,17],[35,18],[40,19],[45,21],[50,22],[55,23],[60,23],[65,24],[70,25],[75,25],[80,27],[85,28],[90,31],[95,36]]
        },
        "Ensino Médio": {
            "Desatenção": [[1,6],[5,13],[10,17],[15,19],[20,22],[25,24],[30,27],[35,29],[40,31],[45,34],[50,37],[55,39],[60,41],[65,43],[70,44],[75,46],[80,49],[85,54],[90,57],[95,67],[99,79]],
            "Impulsividade": [[1,8],[5,16],[10,19],[15,23],[20,25],[25,27],[30,29],[35,32],[40,34],[45,36],[50,40],[55,42],[60,45],[65,47],[70,51],[75,52],[80,54],[85,57],[90,61],[95,70],[99,91]],
            "Hiperatividade": [[1,3],[5,6],[10,8],[15,9],[20,null],[25,10],[30,11],[35,12],[40,13],[45,14],[50,15],[55,16],[60,17],[65,null],[70,null],[75,18],[80,18],[85,19],[90,21],[95,23],[99,29]],
            "Aspectos Emocionais": [[1,null],[5,1],[10,2],[15,null],[20,null],[25,3],[30,null],[35,4],[40,null],[45,4],[50,5],[55,6],[60,6],[65,7],[70,7],[75,8],[80,9],[85,10],[90,11],[95,13],[99,16]],
            "AAMA": [[1,4],[5,7],[10,9],[15,11],[20,13],[25,14],[30,15],[35,16],[40,17],[45,18],[50,19],[55,20],[60,21],[65,22],[70,23],[75,24],[80,24],[85,26],[90,28],[95,32],[99,43]]
        },
        "Ensino Superior": {
            "Desatenção": [[1,7],[5,11],[10,16],[15,19],[20,21],[25,23],[30,25],[35,27],[40,29],[45,31],[50,34],[55,36],[60,38],[65,40],[70,42],[75,44],[80,46],[85,50],[90,54],[95,62],[99,72]],
            "Impulsividade": [[1,10],[5,15],[10,19],[15,21],[20,24],[25,26],[30,27],[35,29],[40,31],[45,34],[50,36],[55,39],[60,41],[65,43],[70,45],[75,47],[80,48],[85,52],[90,56],[95,60],[99,78]],
            "Hiperatividade": [[1,4],[5,6],[10,7],[15,9],[20,null],[25,10],[30,11],[35,12],[40,13],[45,14],[50,15],[55,16],[60,17],[65,null],[70,null],[75,18],[80,18],[85,19],[90,21],[95,23],[99,29]],
            "Aspectos Emocionais": [[1,null],[5,null],[10,2],[15,null],[20,null],[25,3],[30,null],[35,3],[40,null],[45,4],[50,5],[55,5],[60,6],[65,6],[70,7],[75,7],[80,null],[85,9],[90,11],[95,13],[99,17]],
            "AAMA": [[1,4],[5,8],[10,11],[15,12],[20,14],[25,15],[30,16],[35,17],[40,18],[45,19],[50,20],[55,21],[60,22],[65,23],[70,23],[75,24],[80,24],[85,26],[90,27],[95,31],[99,37]]
        }
    };
    function resolverEstrato(escolaridade) {
        if (!escolaridade) return null;
        const e = String(escolaridade).toLowerCase();
        if (e.includes('fundamental')) return 'Ensino Fundamental';
        if (e.includes('médio') || e.includes('medio')) return 'Ensino Médio';
        if (e.includes('superior') || e.includes('pós') || e.includes('pos')
            || e.includes('mestrado') || e.includes('doutorado') || e.includes('graduação')
            || e.includes('graduacao')) return 'Ensino Superior';
        return null;
    }
    function calcularAd(escoresBrutos, estrato) {
        const fatores = (escoresBrutos || {}).fatores || {};
        const tabelaNorma = estrato ? NORMAS_AD[estrato] : null;
        const out = {};
        for (const code of AD_ORDEM) {
            const dado = fatores[code];
            const bruto = (dado && typeof dado.score === 'number') ? dado.score : null;
            let percentil = null;
            if (bruto != null && tabelaNorma) {
                const tabela = tabelaNorma[AD_INFO[code].chave_norma];
                if (tabela) percentil = buscarPercentil(tabela, bruto);
            }
            const classif = classificarPercentil(percentil);
            out[code] = { bruto, percentil, classifLabel: classif.label, classifSlug: classif.slug };
        }
        return out;
    }
    // ---- fim da cópia ----

    const AD_CHAVES = {
        DESATENCAO: ['DESATENCAO', 'desatencao'],
        HIPERATI: ['HIPERATI', 'hiperatividade'],
        IMPULSIV: ['IMPULSIV', 'impulsividade'],
        ASPECTOS: ['ASPECTOS', 'aspectos_emocionais', 'aspectos'],
        AAMA: ['AAMA', 'aama']
    };

    window.LaudoEscalas.registrar({
        siglas: ['ETDAH-AD'],
        carregar: { fatores: false, itens: false, classificacoes: false, json: null },
        calcular(ctx) {
            const pac = ctx.paciente || {};
            const estrato = resolverEstrato(pac.escolaridade);
            const s = calcularAd(ctx.brutos || {}, estrato);
            if (AD_ORDEM.every(c => s[c].bruto == null))
                throw new Error('ETDAH-AD: escores por fator ausentes na correção (escores_brutos.fatores)');

            const conferencia = {};
            AD_ORDEM.forEach(code => conferir(conferencia, AD_CHAVES[code].concat(U.chave(AD_INFO[code].label)), s[code]));
            const subescalas = AD_ORDEM.map(code =>
                fatorParaResumo(code, AD_INFO[code].label, s[code], code === 'AAMA', null));

            return {
                sigla: ctx.sigla || 'ETDAH-AD',
                nome: 'ETDAH-AD',
                respondente: 'Autorrelato',
                norma: estrato ? `Normas por escolaridade (${estrato})` : null,
                principal: null,   // 5 fatores, sem escore total
                regua: null,
                subescalas,
                linhas: estrato ? null : [['Estrato normativo', 'escolaridade não mapeada (Fundamental / Médio / Superior) — sem percentil']],
                indicacao: null,   // a tela não emite frase-resumo
                conferencia
            };
        }
    });
})();

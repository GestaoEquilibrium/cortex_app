// ============================================================================
// CORTEX_APP — Resultado ETDAH-PAIS (laudo) — mesmo padrão visual do ETDAH-AD
// ============================================================================
// URL: ?aplicacao_id=<uuid>
//
// ETDAH-PAIS — Escala de Avaliação de TDAH Infantojuvenil (versão para PAIS)
// Benczik; Memnon. 58 itens · escala 1-6 · 4 fatores + Escore Geral · 2-17 anos.
//   Fator 1 RE (Regulação Emocional, 19) · Fator 2 HI (Hiperatividade/Impulsividade, 13)
//   Fator 3 CA (Comportamento Adaptativo, 14 — invertido) · Fator 4 A (Atenção, 12)
// HETEROAPLICAÇÃO: pai/mãe/responsável responde sobre a criança/adolescente.
//
// DECISÃO ARQUITETURAL:
//   O engine etdahpais_v1 não calcula fatores no banco; o laudo recalcula a partir
//   de escores_brutos.respostas = {numero: 1..6}, aplicando a INVERSÃO (eMin+eMax-resp)
//   nos itens reverso=true (todos do Fator 3 CA + item 1 do Fator 4 A). Escore Geral =
//   soma dos 4 fatores brutos. Percentil por NORMAS (sexo+faixa etária), regra de
//   degraus (maior percentil cujo corte <= bruto). Classificação em 5 faixas.
// ============================================================================

(function() {
    'use strict';

    const SIGLA_ESPERADA = 'ETDAH-PAIS';

    // Ordem inclui Escore Geral primeiro (tabela/gráfico/cards)
    const FATORES_ORDEM = ['GERAL', 'RE', 'HI', 'CA', 'A'];

    const FATOR_INFO = {
        GERAL: { label: 'Escore Geral',                chave_norma: 'GERAL', slug: 'geral',  cor: '#4338ca' },
        RE:    { label: 'Fator 1 — Regulação Emocional', chave_norma: 'RE',    slug: 're',     cor: '#6366f1' },
        HI:    { label: 'Fator 2 — Hiperatividade/Impulsividade', chave_norma: 'HI', slug: 'hi', cor: '#8b5cf6' },
        CA:    { label: 'Fator 3 — Comportamento Adaptativo', chave_norma: 'CA', slug: 'ca',   cor: '#0ea5e9' },
        A:     { label: 'Fator 4 — Atenção',           chave_norma: 'A',     slug: 'a',      cor: '#ec4899' }
    };

    const N_ITENS_FATOR = { GERAL: 58, RE: 19, HI: 13, CA: 14, A: 12 };

    // ============================================================================
    // NORMAS — percentis por sexo + faixa etária (manual Memnon/Benczik)
    // Formato [percentil, escore_bruto]. Colunas: GERAL/RE/HI/CA/A.
    // ============================================================================
    const NORMAS = {
        "F_2a5": {
            "GERAL": [[1,106], [5,107], [10,116], [15,119.3], [20,127.4], [25,130.5], [30,133.6], [35,136.8], [40,139.6], [45,151.7], [50,155], [55,160.4], [60,173.8], [65,180.3], [70,191.2], [75,196.5], [80,209], [85,217], [90,244.2], [95,252.8]],
            "RE": [[1,23], [5,23.9], [10,32.6], [15,35.3], [20,36], [25,36.5], [30,38.8], [35,40.7], [40,41.8], [45,44.7], [50,47], [55,49.4], [60,53], [65,53], [70,53], [75,53.5], [80,57.6], [85,62.1], [90,65.4], [95,76.8]],
            "HI": [[1,21], [5,21], [10,21.6], [15,24.3], [20,25.4], [25,27.5], [30,29], [35,29.7], [40,30.8], [45,32.8], [50,34], [55,34.1], [60,35.2], [65,37.8], [70,42], [75,53.5], [80,67.4], [85,72.5], [90,74], [95,74]],
            "CA": [[1,20], [5,20.7], [10,29], [15,37], [20,37], [25,38], [30,40.2], [35,44.5], [40,46], [45,46], [50,47], [55,48.1], [60,51], [65,59], [70,59.8], [75,61], [80,63.4], [85,66.4], [90,71.8], [95,78.4]],
            "A": [[1,13], [5,13], [10,13.4], [15,15.9], [20,18.8], [25,20], [30,20.6], [35,21], [40,23.4], [45,24], [50,25], [55,26.2], [60,28.2], [65,29.3], [70,30], [75,31], [80,35.6], [85,48.5], [90,53], [95,53]],
        },
        "F_6a9": {
            "GERAL": [[1,88], [5,95.65], [10,107.7], [15,112.8], [20,124.4], [25,128], [30,134.5], [35,137.2], [40,144], [45,145.55], [50,162], [55,169.9], [60,176], [65,185], [70,187], [75,190.75], [80,192.8], [85,196], [90,210.6], [95,227.55]],
            "RE": [[1,23], [5,24.8], [10,29.7], [15,32.05], [20,34.8], [25,36.75], [30,42.5], [35,44.15], [40,45], [45,45], [50,45.5], [55,46.95], [60,49.4], [65,54.7], [70,55], [75,57.25], [80,61], [85,65], [90,65.6], [95,77.05]],
            "HI": [[1,18], [5,18.45], [10,19.9], [15,23.7], [20,25], [25,27], [30,27], [35,27.15], [40,29.2], [45,30], [50,30.5], [55,32.9], [60,34], [65,34], [70,43], [75,46.75], [80,50.6], [85,53], [90,53.3], [95,58.75]],
            "CA": [[1,21], [5,22.35], [10,26.7], [15,28.35], [20,29], [25,34.5], [30,40.2], [35,43.45], [40,47.2], [45,49], [50,50.5], [55,54.85], [60,55.8], [65,57], [70,57], [75,58.5], [80,60.2], [85,61], [90,65.3], [95,71.3]],
            "A": [[1,15], [5,16.35], [10,18], [15,22], [20,22.8], [25,24], [30,24], [35,26], [40,26], [45,26.05], [50,27], [55,27], [60,29.6], [65,32], [70,32.3], [75,33], [80,35], [85,35], [90,37.2], [95,43.4]],
        },
        "F_10a13": {
            "GERAL": [[1,80], [5,86.6], [10,97.4], [15,101], [20,106], [25,116.5], [30,122.8], [35,128.7], [40,134.8], [45,139], [50,142.5], [55,145.4], [60,156], [65,159.45], [70,176], [75,190], [80,194.6], [85,198.75], [90,208.3], [95,238.65]],
            "RE": [[1,20], [5,22.2], [10,27.2], [15,29], [20,30], [25,30], [30,36.3], [35,38.7], [40,39], [45,40.9], [50,41], [55,43.2], [60,48.2], [65,49], [70,51.1], [75,52.75], [80,55.8], [85,65.5], [90,76.5], [95,83.7]],
            "HI": [[1,14], [5,16.2], [10,18.2], [15,20], [20,20.2], [25,21.75], [30,22.6], [35,24.85], [40,25], [45,25], [50,26], [55,27.05], [60,28.6], [65,29.15], [70,30], [75,32], [80,38.2], [85,44.05], [90,46.9], [95,57.7]],
            "CA": [[1,15], [5,16.65], [10,26.1], [15,30.25], [20,33.2], [25,35.5], [30,38.9], [35,42.7], [40,43.4], [45,44], [50,46.5], [55,49], [60,49.6], [65,53], [70,53.7], [75,55.5], [80,57], [85,58.7], [90,60], [95,70.35]],
            "A": [[1,12], [5,12], [10,13.2], [15,16.95], [20,19.4], [25,21], [30,21], [35,21.85], [40,23.4], [45,24.95], [50,25], [55,26.2], [60,32.4], [65,34.15], [70,35], [75,37], [80,38.6], [85,46.4], [90,52.6], [95,59.6]],
        },
        "F_14a17": {
            "GERAL": [[1,72], [5,72], [10,78.3], [15,87.05], [20,95.2], [25,102.25], [30,109.2], [35,110.9], [40,111.8], [45,115.25], [50,117], [55,118.05], [60,122], [65,130.8], [70,144.4], [75,147.5], [80,149.2], [85,157.2], [90,169.6]],
            "RE": [[1,25], [5,25], [10,25], [15,25.55], [20,26.4], [25,27.5], [30,29.4], [35,32.8], [40,33], [45,33.65], [50,35], [55,36], [60,36.2], [65,37], [70,37], [75,37.75], [80,39.2], [85,40], [90,46.3]],
            "HI": [[1,16], [5,16], [10,16], [15,16.55], [20,18.6], [25,21], [30,21.1], [35,21.95], [40,23.6], [45,24], [50,24], [55,25.75], [60,29], [65,29.1], [70,30.8], [75,32.5], [80,33.6], [85,35.35], [90,37.9]],
            "CA": [[1,18], [5,18], [10,18.7], [15,21.75], [20,24.4], [25,27.5], [30,35.1], [35,35.95], [40,36], [45,36.65], [50,37.5], [55,38.7], [60,40.2], [65,41.05], [70,41.9], [75,45], [80,46.6], [85,49.25], [90,54.7]],
            "A": [[1,12], [5,12], [10,12], [15,13.1], [20,14], [25,14.75], [30,17], [35,17], [40,21], [45,22], [50,23], [55,24], [60,24.4], [65,26.15], [70,28.7], [75,30.5], [80,33.4], [85,35.9], [90,38.2]],
        },
        "M_2a5": {
            "GERAL": [[1,115], [5,115], [10,115], [15,136.7], [20,151.4], [25,156.5], [30,159.2], [35,161.3], [40,162.6], [45,165.1], [50,166], [55,167.8], [60,168], [65,169.4], [70,171.2], [75,174.5], [80,183], [85,196.5], [90,211.2]],
            "RE": [[1,30], [5,30], [10,30.8], [15,31], [20,33.4], [25,37], [30,39], [35,39.3], [40,40], [45,40.3], [50,43], [55,46.6], [60,47], [65,48.4], [70,49.6], [75,50.5], [80,52.6], [85,55.6], [90,57.2]],
            "HI": [[1,23], [5,23], [10,24.6], [15,25], [20,25.6], [25,26], [30,28], [35,32.5], [40,36.6], [45,39.1], [50,40], [55,40.9], [60,45], [65,46.7], [70,47.6], [75,50], [80,52.8], [85,54.6], [90,58.6]],
            "CA": [[1,38], [5,38], [10,38], [15,44.3], [20,47], [25,47.5], [30,48.8], [35,50.6], [40,52.4], [45,54.1], [50,55], [55,55], [60,55.8], [65,56.7], [70,57.6], [75,59], [80,61.6], [85,64.9], [90,67.4]],
            "A": [[1,19], [5,19], [10,20.6], [15,21], [20,21], [25,22.5], [30,24.4], [35,25], [40,25.2], [45,26.1], [50,27], [55,29.7], [60,31.6], [65,32.7], [70,33.6], [75,34.5], [80,35.4], [85,36.3], [90,37.2]],
        },
        "M_6a9": {
            "GERAL": [[1,102], [5,106.2], [10,114.7], [15,117.6], [20,129], [25,132.75], [30,136.7], [35,143], [40,145.4], [45,151.15], [50,152.5], [55,153.85], [60,165.2], [65,172.05], [70,178.8], [75,203.25], [80,214.8], [85,218.85], [90,219.9], [95,253.85]],
            "RE": [[1,22], [5,23.75], [10,28.4], [15,30], [20,30], [25,30.75], [30,33.3], [35,36.45], [40,37], [45,37], [50,41], [55,45], [60,45], [65,47.75], [70,50.9], [75,54], [80,61.8], [85,64.9], [90,69], [95,85.9]],
            "HI": [[1,21], [5,21.7], [10,23], [15,24.1], [20,26], [25,28.25], [30,29.1], [35,30], [40,30], [45,32.3], [50,34], [55,34], [60,35.4], [65,37.55], [70,42.5], [75,44.25], [80,46.8], [85,50.85], [90,61], [95,62.95]],
            "CA": [[1,34], [5,34.35], [10,35], [15,37], [20,38.6], [25,41.75], [30,44.1], [35,46.35], [40,48], [45,48.15], [50,49], [55,49], [60,51], [65,52.65], [70,54], [75,57], [80,60], [85,66.75], [90,67.3], [95,71.25]],
            "A": [[1,15], [5,15.7], [10,17], [15,18.1], [20,20], [25,21.5], [30,23.7], [35,30.45], [40,31], [45,31.3], [50,33.5], [55,34], [60,34.4], [65,37.65], [70,39.9], [75,41], [80,44], [85,45.9], [90,46.6], [95,48]],
        },
        "M_10a13": {
            "GERAL": [[1,104], [5,104.9], [10,120.6], [15,127.3], [20,134.2], [25,148], [30,149.8], [35,153.1], [40,155.6], [45,163.1], [50,165], [55,168.5], [60,175.6], [65,186.3], [70,195], [75,207], [80,222.8], [85,235], [90,247.8], [95,258.1]],
            "RE": [[1,25], [5,25], [10,26.3], [15,29.2], [20,30.9], [25,32.2], [30,34], [35,34.8], [40,36.1], [45,39.2], [50,42], [55,43], [60,47.6], [65,50], [70,51], [75,55.2], [80,60], [85,61], [90,69], [95,78], [99,86.1]],
            "HI": [[1,15], [5,21], [10,24.8], [15,26.9], [20,28], [25,28.5], [30,30], [35,32], [40,35], [45,35], [50,36], [55,39.3], [60,40], [65,41], [70,41.2], [75,43.5], [80,51.2], [85,56.3], [90,66.4], [95,68.4]],
            "CA": [[1,27], [5,32], [10,37.8], [15,41], [20,44.4], [25,46], [30,49], [35,51], [40,51.4], [45,52.7], [50,53], [55,54], [60,54.6], [65,57.7], [70,59.2], [75,60], [80,60], [85,64], [90,65.4], [95,70]],
            "A": [[1,15], [5,16.3], [10,19.6], [15,21], [20,22.6], [25,27.5], [30,28], [35,29.1], [40,30], [45,31], [50,36], [55,36], [60,37.2], [65,39.9], [70,42], [75,42.5], [80,43], [85,49], [90,50.4], [95,62.2]],
        },
        "M_14a17": {
            "GERAL": [[1,84], [5,84.45], [10,94.6], [15,109.15], [20,112.4], [25,124], [30,130.3], [35,131], [40,132.2], [45,136.7], [50,141.5], [55,143], [60,143], [65,145.6], [70,162.4], [75,173.5], [80,188.6], [85,192], [90,192], [95,235.7]],
            "RE": [[1,20], [5,20], [10,20.5], [15,25], [20,25.8], [25,29.25], [30,30.3], [35,31.35], [40,32.4], [45,33], [50,33], [55,36.3], [60,39.6], [65,44.55], [70,49.8], [75,52.5], [80,55.4], [85,56], [90,71.3], [95,108.15]],
            "HI": [[1,16], [5,16.1], [10,18.2], [15,20.15], [20,21.2], [25,23], [30,26.3], [35,27.35], [40,28], [45,28], [50,29.5], [55,32.65], [60,35.2], [65,36], [70,36.7], [75,37], [80,38.6], [85,39.85], [90,41.8], [95,42]],
            "CA": [[1,20], [5,20.6], [10,32.2], [15,34], [20,34], [25,35.25], [30,39.3], [35,41.05], [40,43], [45,43], [50,46.5], [55,51.1], [60,52.6], [65,53], [70,53], [75,53], [80,53.8], [85,59.1], [90,60.9], [95,65.75]],
            "A": [[1,15], [5,15.05], [10,16.1], [15,17], [20,17.4], [25,19.75], [30,22], [35,23.4], [40,26], [45,26], [50,27], [55,29.1], [60,31.8], [65,33.65], [70,34], [75,34], [80,36.4], [85,38.7], [90,40.8], [95,41]],
        },
    };

    // CLASSIFICAÇÃO POR PERCENTIL (5 faixas — idêntico ao ETDAH-AD)
    function classificarPercentil(p) {
        if (p == null) return { label: 'Sem dado', slug: 'vazio' };
        if (p >= 85) return { label: 'Superior',       slug: 'superior' };
        if (p >= 65) return { label: 'Médio Superior', slug: 'medio-superior' };
        if (p >= 45) return { label: 'Médio',          slug: 'medio' };
        if (p >= 25) return { label: 'Médio Inferior', slug: 'medio-inferior' };
        return            { label: 'Inferior',       slug: 'inferior' };
    }

    // BUSCAR PERCENTIL (regra de degraus — idêntico ao ETDAH-AD)
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

    // ESTRATO = sexo + faixa etária (2-5 / 6-9 / 10-13 / 14-17)
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

    const state = {
        aplicacaoId: null, aplicacao: null, paciente: null,
        norma: null, itens: [], fatores: [], correcao: null,
        scores: null, estrato: null, chartInstance: null
    };

    window.addEventListener('cortex:auth-ready', async () => {
        await CortexSidebar.render('pacientes');
        const params = new URLSearchParams(window.location.search);
        state.aplicacaoId = params.get('aplicacao_id');
        if (!state.aplicacaoId) { mostrarErro('aplicacao_id não fornecido na URL'); return; }
        try {
            await carregarTudo();
            renderizar();
        } catch (err) {
            console.error('Erro ao carregar:', err);
            mostrarErro('Erro: ' + (err.message || 'desconhecido'));
        }
    });

    async function carregarTudo() {
        const { data: aplicacao, error: errA } = await window.cortexClient
            .from('aplicacoes_instrumento').select('*').eq('id', state.aplicacaoId).single();
        if (errA) throw new Error('Aplicação: ' + errA.message);
        state.aplicacao = aplicacao;

        const { data: paciente, error: errP } = await window.cortexClient
            .from('pacientes').select('id, nome_completo, sexo, data_nascimento, cpf, escolaridade')
            .eq('id', aplicacao.paciente_id).single();
        if (errP) throw new Error('Paciente: ' + errP.message);
        state.paciente = paciente;

        const { data: instrumento, error: errI } = await window.cortexClient
            .from('instrumentos_catalogo').select('id, sigla').eq('id', aplicacao.instrumento_id).single();
        if (errI) throw new Error('Instrumento: ' + errI.message);
        if (instrumento.sigla !== SIGLA_ESPERADA) {
            throw new Error(`Esperado ${SIGLA_ESPERADA}, encontrado ${instrumento.sigla}`);
        }

        const { data: norma } = await window.cortexClient
            .from('instrumentos_normas').select('*').eq('instrumento_id', instrumento.id)
            .eq('ativa', true).maybeSingle();
        if (!norma) throw new Error('Norma ETDAH-PAIS não cadastrada');
        state.norma = norma;

        const { data: fatores } = await window.cortexClient
            .from('instrumentos_fatores').select('id, fator_codigo').eq('norma_id', norma.id);
        const mapFator = {};
        for (const f of (fatores || [])) mapFator[f.id] = f.fator_codigo;

        const { data: itens } = await window.cortexClient
            .from('instrumentos_itens').select('numero, texto, reverso, fator_id')
            .eq('norma_id', norma.id).order('numero');
        state.itens = (itens || []).map(i => ({
            numero: i.numero, texto: i.texto, reverso: !!i.reverso,
            fator_codigo: mapFator[i.fator_id] || null
        }));

        const { data: correcao, error: errC } = await window.cortexClient
            .from('correcoes').select('*').eq('aplicacao_id', state.aplicacaoId)
            .order('created_at', { ascending: false }).limit(1).maybeSingle();
        if (errC) throw new Error('Correção: ' + errC.message);
        if (!correcao) throw new Error('Nenhuma correção encontrada');
        state.correcao = correcao;

        const idade = calcularIdade(paciente.data_nascimento, aplicacao.data_aplicacao || aplicacao.created_at);
        state.estrato = detectarEstrato(paciente.sexo, idade);
        state.scores = calcularResultados(correcao, state.estrato);

        await CortexAudit.log('leitura', 'correcoes', correcao.id, {
            detalhes: { aplicacaoId: state.aplicacaoId, sigla: SIGLA_ESPERADA }
        });
    }

    // ============================================================================
    // CÁLCULO — soma bruta por fator (com inversão) + Escore Geral + percentil
    // ============================================================================
    function calcularResultados(correcao, estrato) {
        const respostas = (correcao?.escores_brutos || {}).respostas || {};
        const respPorNum = {};
        for (const [k, v] of Object.entries(respostas)) respPorNum[parseInt(k)] = parseInt(v) || 0;

        const eMin = state.norma.escala_min || 1;
        const eMax = state.norma.escala_max || 6;

        const brutoFator = { RE: 0, HI: 0, CA: 0, A: 0 };
        const itensFator = { RE: [], HI: [], CA: [], A: [] };
        for (const item of state.itens) {
            const valor = respPorNum[item.numero] ?? 0;
            const valido = valor >= eMin && valor <= eMax;
            const ajustado = valido ? (item.reverso ? (eMin + eMax - valor) : valor) : 0;
            const fc = item.fator_codigo;
            if (brutoFator[fc] !== undefined) {
                brutoFator[fc] += ajustado;
                itensFator[fc].push({ numero: item.numero, valor, ajustado, reverso: item.reverso, texto: item.texto });
            }
        }
        const geral = brutoFator.RE + brutoFator.HI + brutoFator.CA + brutoFator.A;
        const tabelaNorma = estrato ? NORMAS[estrato] : null;

        const out = {};
        for (const code of FATORES_ORDEM) {
            const bruto = code === 'GERAL' ? geral : brutoFator[code];
            let percentil = null;
            if (tabelaNorma) {
                const tabela = tabelaNorma[FATOR_INFO[code].chave_norma];
                if (tabela) percentil = buscarPercentil(tabela, bruto);
            }
            const classif = classificarPercentil(percentil);
            out[code] = { bruto, percentil, classifLabel: classif.label, classifSlug: classif.slug };
        }
        out._itensFator = itensFator;
        out._respondidos = Object.keys(respostas).length;
        return out;
    }

    // ============================================================================
    // RENDER
    // ============================================================================
    function renderizar() {
        const cont = document.getElementById('laudo-conteudo');
        cont.innerHTML = renderLaudo();
        document.getElementById('acoes-topo').style.display = 'flex';
        document.getElementById('back-link').href = `../../bateria/bateria.html?paciente=${state.paciente.id}`;
        document.getElementById('btn-gerar-pdf').addEventListener('click', gerarPDF);
        setTimeout(renderGrafico, 60);
    }

    function renderLaudo() {
        const idade = calcularIdade(state.paciente.data_nascimento, state.aplicacao.data_aplicacao || state.aplicacao.created_at);
        const dataApl = state.aplicacao.data_aplicacao || state.aplicacao.created_at;
        const nascStr = state.paciente.data_nascimento ? formatarDataBR(state.paciente.data_nascimento) : '—';
        const sexoStr = state.paciente.sexo === 'M' ? 'Masculino' : (state.paciente.sexo === 'F' ? 'Feminino' : (state.paciente.sexo || '—'));

        const semNorma = !state.estrato;
        const avisoEstrato = semNorma
            ? `<div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:12px 16px;margin-bottom:18px;color:#78350f;font-size:13px;">
                <strong>⚠ Estrato normativo não identificado:</strong>
                as normas do ETDAH-PAIS dependem de <em>sexo</em> e <em>idade</em> (faixas 2-5, 6-9, 10-13 e 14-17 anos).
                O cadastro atual (sexo "${escapeHtml(sexoStr)}", idade ${idade !== null ? idade + ' anos' : '— não calculável'})
                não se encaixa em nenhuma faixa. Os escores brutos são exibidos, mas sem percentil/classificação.
                Verifique data de nascimento e sexo do paciente e recarregue.
              </div>`
            : '';

        return `
        <div class="laudo">
            <div class="laudo-header">
                <div class="laudo-header-esq">
                    <div class="laudo-header-logo">E</div>
                    <div class="laudo-header-textos">
                        <div class="laudo-header-supratitulo">Relatório de Avaliação Neuropsicológica</div>
                        <h1 class="laudo-header-titulo">ETDAH-PAIS</h1>
                        <div class="laudo-header-subtitulo">Escala de TDAH Infantojuvenil — Versão para Pais (Heteroaplicação)<br>58 itens · 4 fatores + Escore Geral · normas por sexo e idade</div>
                    </div>
                </div>
                <div class="laudo-header-pontuacao">
                    <div class="laudo-header-pontuacao-label">Estrato Normativo</div>
                    <div class="laudo-header-pontuacao-valor" style="font-size:16px;">${estratoLabel(state.estrato)}</div>
                </div>
            </div>

            <div class="laudo-body">
                <div class="laudo-secao-titulo"><span class="laudo-secao-tag">1</span>Identificação</div>
                <div class="laudo-identificacao">
                    <div class="laudo-identif-item"><span class="laudo-identif-label">Criança/Adolescente:</span><span class="laudo-identif-valor">${escapeHtml(state.paciente.nome_completo)}</span></div>
                    <div class="laudo-identif-item"><span class="laudo-identif-label">Idade:</span><span class="laudo-identif-valor">${idade !== null ? idade + ' anos' : '—'}</span></div>
                    <div class="laudo-identif-item"><span class="laudo-identif-label">Sexo:</span><span class="laudo-identif-valor">${escapeHtml(sexoStr)}</span></div>
                    <div class="laudo-identif-item"><span class="laudo-identif-label">Nascimento:</span><span class="laudo-identif-valor">${nascStr}</span></div>
                    <div class="laudo-identif-item"><span class="laudo-identif-label">Avaliação:</span><span class="laudo-identif-valor">${formatarDataBR(dataApl)}</span></div>
                    <div class="laudo-identif-item"><span class="laudo-identif-label">Modalidade:</span><span class="laudo-identif-valor">Heteroaplicação (pais/responsável)</span></div>
                </div>

                ${avisoEstrato}

                <div class="laudo-secao-titulo"><span class="laudo-secao-tag">2</span>Escores por Fator</div>
                ${renderTabelaFatores()}

                <div class="laudo-secao-titulo"><span class="laudo-secao-tag">3</span>Perfil Gráfico dos Fatores (Percentil)</div>
                <div class="etdah-grafico-wrap">
                    <div class="etdah-grafico-canvas-container"><canvas id="etdah-chart"></canvas></div>
                    <div class="etdah-grafico-legenda">Normas por sexo e idade${state.estrato ? ' (' + estratoLabel(state.estrato) + ')' : ''}. Percentil 0-100.</div>
                </div>

                <div class="laudo-secao-titulo"><span class="laudo-secao-tag">4</span>Resultados e Análise</div>
                ${FATORES_ORDEM.map(renderFatorCard).join('')}

                <div class="etdah-nota-tecnica">
                    <strong>Nota técnica:</strong> A ETDAH-PAIS é instrumento de <strong>triagem</strong>
                    respondido pelos pais/responsável sobre comportamentos da criança/adolescente (2-17 anos)
                    nos últimos 6 meses, em 58 itens (escala 1-6). O Fator 3 (Comportamento Adaptativo) e o
                    item 1 do Fator 4 são de <strong>pontuação invertida</strong> e já entram invertidos nas
                    somas. As pontuações brutas são convertidas em percentil pelas normas de <strong>sexo e
                    faixa etária</strong> e classificadas em Inferior, Médio Inferior, Médio, Médio Superior
                    ou Superior. Percentis mais altos refletem maior frequência relatada de comportamentos
                    avaliados. Instrumento de triagem — não estabelece diagnóstico; deve compor avaliação
                    multiprofissional. (Benczik, E. B. P.; Memnon Edições Científicas.)
                </div>

                ${renderDetalhesItens()}
            </div>

            <div class="laudo-rodape">
                <div class="laudo-rodape-esq">
                    <div class="laudo-rodape-org">Equilibrium Neuropsicologia</div>
                    <div class="laudo-rodape-tipo">Correção automatizada — ETDAH-PAIS</div>
                </div>
                <div class="laudo-rodape-dir">
                    <div class="laudo-rodape-data">Documento gerado em ${formatarDataBR(new Date().toISOString())}</div>
                    <div class="laudo-rodape-confidencial">Documento confidencial — uso restrito ao profissional solicitante.</div>
                </div>
            </div>
        </div>`;
    }

    function renderTabelaFatores() {
        const linhas = FATORES_ORDEM.map(code => {
            const r = state.scores[code];
            const info = FATOR_INFO[code];
            const pctTxt = r.percentil != null ? `${r.percentil}` : '—';
            const badge = r.percentil != null
                ? `<span class="etdah-badge etdah-badge-${r.classifSlug}">${r.classifLabel}</span>`
                : `<span class="etdah-badge etdah-badge-vazio">—</span>`;
            const isGeral = code === 'GERAL';
            return `<tr${isGeral ? ' style="background:#f5f3ff;font-weight:600;"' : ''}>
                <td><span class="nome-fator"><span class="nome-fator-bullet" style="background:${info.cor};"></span>${info.label}</span></td>
                <td class="ctr">${N_ITENS_FATOR[code]}</td>
                <td class="ctr"><span class="escore-bruto">${r.bruto != null ? r.bruto : '—'}</span></td>
                <td class="ctr"><span class="percentil">${pctTxt}</span></td>
                <td class="ctr">${badge}</td>
            </tr>`;
        }).join('');
        return `
            <div class="etdah-tab-fatores">
                <table>
                    <thead><tr>
                        <th>Fator</th><th class="ctr">Itens</th><th class="ctr">Escore Bruto</th>
                        <th class="ctr">Percentil</th><th class="ctr">Classificação</th>
                    </tr></thead>
                    <tbody>${linhas}</tbody>
                </table>
            </div>`;
    }

    function renderFatorCard(code) {
        const r = state.scores[code];
        const info = FATOR_INFO[code];
        const interpretacao = r.percentil != null
            ? gerarInterpretacao(code, r.classifLabel, r.bruto, r.percentil)
            : `Escore bruto = ${r.bruto}. Percentil não calculado (estrato normativo de sexo+idade não identificado).`;
        const badge = r.percentil != null
            ? `<span class="etdah-fator-card-classif-meta etdah-badge-${r.classifSlug}">${r.classifLabel} · percentil ${r.percentil}</span>`
            : `<span class="etdah-fator-card-classif-meta etdah-badge-vazio">— sem percentil</span>`;
        return `
            <div class="etdah-fator-card etdah-fator-card-${info.slug}">
                <div class="etdah-fator-card-header">
                    <div class="etdah-fator-card-titulo">
                        <span class="etdah-fator-card-bullet" style="background:${info.cor};"></span>${info.label}
                    </div>
                    ${badge}
                </div>
                <p class="etdah-fator-card-corpo">${interpretacao}</p>
            </div>`;
    }

    function gerarInterpretacao(code, label, bruto, percentil) {
        const dom = {
            GERAL: 'o conjunto dos comportamentos avaliados pela escala',
            RE: 'a regulação emocional',
            HI: 'comportamentos de hiperatividade e impulsividade',
            CA: 'o comportamento adaptativo (itens de pontuação invertida)',
            A: 'comportamentos relacionados à atenção'
        }[code] || 'o domínio avaliado';
        return `O escore bruto de <strong>${label0(code)}</strong> foi <strong>${bruto}</strong>, correspondente ao <strong>percentil ${percentil}</strong> `
            + `(faixa <strong>${label}</strong>) nas normas para ${estratoLabel(state.estrato)}, considerando ${dom}. `
            + `Percentis mais elevados indicam maior frequência relatada pelos responsáveis. Resultado de triagem, a ser integrado aos demais dados da avaliação.`;
    }
    function label0(code) { return FATOR_INFO[code].label; }

    function renderGrafico() {
        const canvas = document.getElementById('etdah-chart');
        if (!canvas || typeof Chart === 'undefined') return;
        if (state.chartInstance) state.chartInstance.destroy();
        const labels = FATORES_ORDEM.map(c => FATOR_INFO[c].label);
        const cores  = FATORES_ORDEM.map(c => FATOR_INFO[c].cor);
        const percentis = FATORES_ORDEM.map(c => state.scores[c].percentil ?? 0);
        state.chartInstance = new Chart(canvas, {
            type: 'bar',
            data: { labels, datasets: [{ data: percentis, backgroundColor: cores, borderRadius: 6, barPercentage: 0.65 }] },
            options: {
                indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: (ctx) => {
                        const code = FATORES_ORDEM[ctx.dataIndex]; const r = state.scores[code];
                        return ` ${r.percentil != null ? 'percentil ' + r.percentil : 'sem percentil'} · ${r.classifLabel}`;
                    } } }
                },
                scales: {
                    x: { min: 0, max: 100, ticks: { callback: (v) => v + '%' }, grid: { color: '#f1f5f9' } },
                    y: { grid: { display: false }, ticks: { font: { size: 12, weight: '600' } } }
                }
            }
        });
    }

    function renderDetalhesItens() {
        if (!state.itens.length) return '';
        const respostas = state.correcao?.escores_brutos?.respostas || {};
        const ORDEM_FC = ['RE', 'HI', 'CA', 'A'];
        const eMin = state.norma.escala_min || 1, eMax = state.norma.escala_max || 6;
        const linhas = [];
        for (const fc of ORDEM_FC) {
            for (const it of (state.scores._itensFator[fc] || [])) {
                const respTxt = it.valor >= eMin && it.valor <= eMax ? it.valor : '—';
                const ajuste = it.reverso
                    ? `<span style="color:#a21caf;font-weight:700;">⇄ ${it.valor}→${it.ajustado}</span>`
                    : `<span style="font-weight:700;">${it.ajustado || '—'}</span>`;
                linhas.push(`<tr>
                    <td style="text-align:center;font-weight:700;color:#1e40af;">${it.numero}</td>
                    <td>${escapeHtml(it.texto)}</td>
                    <td style="text-align:center;"><span style="background:${FATOR_INFO[fc].cor}22;color:${FATOR_INFO[fc].cor};padding:2px 8px;border-radius:6px;font-size:10px;font-weight:700;">${fc}</span></td>
                    <td style="text-align:center;">${respTxt}</td>
                    <td style="text-align:center;">${ajuste}</td>
                </tr>`);
            }
        }
        return `
            <details class="laudo-detalhes-toggle">
                <summary>▾ Ver respostas item a item (${state.itens.length} itens · ⇄ = invertido)</summary>
                <table class="laudo-detalhes-tabela">
                    <thead><tr>
                        <th style="width:40px;text-align:center;">Nº</th><th>Item</th>
                        <th style="text-align:center;width:60px;">Fator</th>
                        <th style="text-align:center;width:80px;">Resposta</th>
                        <th style="text-align:center;width:90px;">Pontos</th>
                    </tr></thead>
                    <tbody>${linhas.join('')}</tbody>
                </table>
            </details>`;
    }

    async function gerarPDF() {
        const btn = document.getElementById('btn-gerar-pdf');
        const orig = btn.textContent;
        btn.disabled = true; btn.textContent = '⏳ Gerando PDF...';
        try {
            document.body.classList.add('exportando');
            await new Promise(r => setTimeout(r, 100));
            const laudo = document.querySelector('.laudo');
            if (!laudo) throw new Error('Laudo não encontrado');
            const canvas = await html2canvas(laudo, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false });
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            const pdfWidth = 210, pdfHeight = 297;
            const imgWidth = pdfWidth, imgHeight = (canvas.height * pdfWidth) / canvas.width;
            if (imgHeight <= pdfHeight) {
                pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, imgWidth, imgHeight);
            } else {
                let posY = 0, restante = imgHeight;
                while (restante > 0) {
                    pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, -posY, imgWidth, imgHeight);
                    restante -= pdfHeight; posY += pdfHeight;
                    if (restante > 0) pdf.addPage();
                }
            }
            const nomeAbreviado = state.paciente.nome_completo.toUpperCase().replace(/[^A-Z\s]/g, '').trim().substring(0, 50);
            pdf.save(`ETDAH-PAIS - ${nomeAbreviado}_${formatarDataArquivo(new Date())}.pdf`);
            window.CortexUI.toast('PDF gerado com sucesso', 'success');
        } catch (err) {
            console.error('Erro ao gerar PDF:', err);
            window.CortexUI.toast('Erro ao gerar PDF: ' + err.message, 'danger');
        } finally {
            document.body.classList.remove('exportando');
            btn.disabled = false; btn.textContent = orig;
        }
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
    function formatarDataBR(iso) {
        if (!iso) return '—';
        const d = iso.includes('T') ? new Date(iso) : new Date(iso + 'T00:00:00');
        return d.toLocaleDateString('pt-BR');
    }
    function formatarDataArquivo(d) {
        const ano = d.getFullYear(), mes = String(d.getMonth() + 1).padStart(2, '0'), dia = String(d.getDate()).padStart(2, '0');
        return `${ano}-${mes}-${dia}`;
    }
    function mostrarErro(msg) {
        document.getElementById('laudo-conteudo').innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div>
                <div class="empty-state-title">${escapeHtml(msg)}</div>
            </div>`;
    }
    function escapeHtml(text) {
        if (text === null || text === undefined) return '';
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }
})();

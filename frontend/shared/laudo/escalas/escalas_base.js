/* ============================================================================
   CORTEX · Laudo Online — ESCALAS ONLINE: contrato comum
   (frontend/shared/laudo/escalas/escalas_base.js) · sprint LO-6
   ----------------------------------------------------------------------------
   As escalas do CORTEX guardam no banco só as respostas (correcoes.escores_brutos)
   e cada tela de correção faz a conta. O Laudo Online não abre essas telas:
   cada escala tem aqui um LEITOR que faz a MESMA conta da tela de correção e
   devolve um RESUMO padronizado. O desenho (cartão, régua, subescalas, tabela)
   é um só para todas (laudo_graficos.js).

   Registro de um leitor:
     LaudoEscalas.registrar({
       siglas: ['SNAP-IV'],                 // siglas do instrumentos_catalogo
       carregar: { fatores: true, itens: true, classificacoes: false, json: null },
                                            // json: caminho de norma local, relativo a frontend/correcao/
                                            //       (ex.: 'srs2_norms.json'); vem em ctx.json
       calcular(ctx) { return resumo; }     // síncrono; lança Error se faltar dado
     });

   ctx (montado por LaudoDados):
     sigla, respostas (= escores_brutos.respostas || {}), brutos (escores_brutos inteiro),
     correcao (linha de correcoes), aplicacao (linha de aplicacoes_instrumento),
     norma (linha ativa de instrumentos_normas), fatores [linhas], itens [linhas com
     fator_codigo já resolvido], classificacoes [linhas], json (norma local),
     paciente { sexo, data_nascimento, escolaridade }, idade { anos, meses } na data da aplicação.

   RESUMO (o que o laudo guarda e desenha; nunca as respostas):
   {
     sigla, nome,                           // nome curto da escala
     respondente: 'Autorrelato' | 'Pais/responsável' | 'Professor' | null,
     norma: 'texto curto da norma usada' | null,
     principal: {                           // número em destaque (null se a escala não tem total)
       rotulo: 'Escore total' | 'Escore T total' | ...,
       valor: 42, max: 63 | null, sufixo: '' | 'T' | 'P',
       classificacao: 'Moderado', tom: 'ok'|'leve'|'mod'|'grave'|'neutro'
     },
     regua: {                               // régua do número principal (ou null)
       min: 0, max: 63, valor: 42,
       zonas: [{ ate: 13, rotulo: 'Mínimo', tom: 'ok' }, ...],   // ate = limite superior da zona
       rotulo: 'Escore total'
     } | null,
     subescalas: [{
       codigo: 'DES', nome: 'Desatenção', valor: 18, max: 27,
       classificacao: 'Moderado', tom: 'mod',
       zonas: [{ ate, rotulo, tom }] | null,   // para desenhar a régua desta subescala
       extra: 'T 65 · P 92' | null              // texto complementar curto
     }],
     linhas: [['Rótulo', 'valor'], ...] | null,   // tabela extra (ex.: itens críticos), opcional
     indicacao: 'Rastreio positivo para desatenção' | null,   // frase-resumo da tela de correção
     conferencia: { total: 42, DES: 18, desatencao: 18, ... }  // números que o texto pode citar
   }
   tom: ok = dentro do esperado/sem indicativo · leve · mod · grave · neutro (sem juízo)
   ============================================================================ */
(function () {
    'use strict';
    const leitores = {};

    function registrar(def) {
        if (!def || !Array.isArray(def.siglas) || typeof def.calcular !== 'function') throw new Error('Leitor de escala inválido');
        def.carregar = Object.assign({ fatores: false, itens: false, classificacoes: false, json: null }, def.carregar || {});
        def.siglas.forEach(s => { leitores[s] = def; });
    }
    function leitor(sigla) { return leitores[sigla] || null; }
    function siglas() { return Object.keys(leitores); }

    // Siglas do Gerador (pacote) → siglas do CORTEX. O laudo escreve "SRS-2";
    // o CORTEX tem uma forma por respondente.
    const APELIDOS = {
        'SRS-2': ['SRS-2-HET', 'SRS-2-AUTO', 'SRS-2-PRE', 'SRS-2-ESC-F', 'SRS-2-ESC-M'],
        'SCARED': ['SCARED-A', 'SCARED-H'],
        'CARS-2': ['CARS2-ST', 'CARS2-HF'], 'CARS2': ['CARS2-ST', 'CARS2-HF'],
        'CARS-2-ST': ['CARS2-ST'], 'CARS-2-HF': ['CARS2-HF'],
        'ETDAH-AD': ['ETDAH-AD'], 'QA16+': ['QA 16+'], 'QA-16+': ['QA 16+'],
        'RAADS-R-BR': ['RAADS-R'], 'RAADS-R BR': ['RAADS-R'],
        'QIIAHSD': ['QIIAHSD-AD', 'QIIAHSD-AD-2F'], 'VINELAND-3': ['VINELAND-3-P'], 'VINELAND': ['VINELAND-3-P'], 'QIIAHSD-2F': ['QIIAHSD-AD-2F'],
        'BAARS IV': ['BAARS-IV'], 'BAARS': ['BAARS-IV'], 'CAT Q': ['CAT-Q'], 'EQ15': ['EQ-15'], 'ASRS': ['ASRS-18']
    };

    // Utilidades para os leitores
    function num(v) { const n = parseInt(v, 10); return isNaN(n) ? null : n; }
    function resposta(respostas, numero) {
        let r = respostas[numero];
        if (r == null) r = respostas[String(numero)];
        return num(r);
    }
    function soma(respostas, numeros) {
        let t = 0, n = 0;
        numeros.forEach(k => { const v = resposta(respostas, k); if (v != null) { t += v; n++; } });
        return { total: t, respondidos: n };
    }
    // zona da régua em que o valor cai
    function zonaDe(zonas, valor) {
        if (!Array.isArray(zonas) || valor == null) return null;
        return zonas.find(z => valor <= z.ate) || zonas[zonas.length - 1];
    }
    function chave(s) {
        return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    }

    window.LaudoEscalas = { registrar, leitor, siglas, APELIDOS, util: { num, resposta, soma, zonaDe, chave } };
})();

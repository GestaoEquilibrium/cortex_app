/* ============================================================================
   CORTEX · Laudo Online — LEITOR: ASRS-18
   (frontend/shared/laudo/escalas/asrs18.js) · sprint LO-6
   ----------------------------------------------------------------------------
   Mesma conta de frontend/correcao/asrs18/asrs18_resultado.js:
     - percorre os itens da norma (instrumentos_itens); nota = parseInt(resposta) || 0
       (resposta ausente ou não numérica vale 0)
     - Parte A — Desatenção: itens 1-9 (0-36, informativo)
     - Parte B — Hiperatividade/Impulsividade: itens 10-18 (0-36, informativo)
     - Total Geral 0-72 · ponto de corte ≥ 24 → "Sugestivo de TDAH" (POSITIVO)
   A tela não aplica o critério de triagem da Parte A (4 de 6); só o corte do total.
   ============================================================================ */
(function () {
    'use strict';
    const E = window.LaudoEscalas;
    const U = E.util;

    const CORTE_TOTAL = 24;
    const MAX_TOTAL = 72, MAX_PARTE = 36;
    function parteDoItem(numero) { return numero <= 9 ? 'A' : 'B'; }

    function calcular(ctx) {
        if (!ctx || !ctx.norma) throw new Error('Norma ASRS-18 não cadastrada');
        if (!Array.isArray(ctx.itens) || !ctx.itens.length) throw new Error('Itens do ASRS-18 não carregados');
        const respostas = ctx.respostas || {};

        const respostaPorNumero = {};
        for (const [k, v] of Object.entries(respostas)) respostaPorNumero[parseInt(k)] = parseInt(v) || 0;

        let totalParteA = 0, totalParteB = 0;
        for (const item of ctx.itens) {
            const valor = respostaPorNumero[item.numero] ?? 0;
            if (parteDoItem(item.numero) === 'A') totalParteA += valor; else totalParteB += valor;
        }
        const totalGeral = totalParteA + totalParteB;
        const positivo = totalGeral >= CORTE_TOTAL;

        const subescalas = [
            { codigo: 'A', nome: 'Desatenção', valor: totalParteA, max: MAX_PARTE, classificacao: null, tom: 'neutro', zonas: null, extra: 'Parte A · itens 1-9 · informativo' },
            { codigo: 'B', nome: 'Hiperatividade/Impulsividade', valor: totalParteB, max: MAX_PARTE, classificacao: null, tom: 'neutro', zonas: null, extra: 'Parte B · itens 10-18 · informativo' }
        ];
        const conferencia = { total: totalGeral, parte_a: totalParteA, parte_b: totalParteB };
        subescalas.forEach(s => { conferencia[s.codigo] = s.valor; conferencia[U.chave(s.nome)] = s.valor; });

        return {
            sigla: ctx.sigla || 'ASRS-18',
            nome: 'Adult ADHD Self-Report Scale (ASRS-18)',
            respondente: 'Autorrelato',
            norma: 'Adler/OMS · Adapt. BR: Mattos et al. (2006) · corte ≥ ' + CORTE_TOTAL,
            principal: {
                rotulo: 'Total geral', valor: totalGeral, max: MAX_TOTAL, sufixo: '',
                classificacao: positivo ? 'Sugestivo de TDAH' : 'Não sugestivo', tom: positivo ? 'mod' : 'ok'
            },
            regua: {
                min: 0, max: MAX_TOTAL, valor: totalGeral, rotulo: 'Total geral',
                zonas: [{ ate: CORTE_TOTAL - 1, rotulo: 'Não sugestivo', tom: 'ok' }, { ate: MAX_TOTAL, rotulo: 'Sugestivo de TDAH', tom: 'mod' }]
            },
            subescalas,
            linhas: [['Ponto de corte', 'Total ≥ ' + CORTE_TOTAL], ['Resultado geral', positivo ? 'POSITIVO' : 'Negativo']],
            indicacao: positivo
                ? 'Total ' + totalGeral + ' atinge o ponto de corte (≥ ' + CORTE_TOTAL + '): perfil sugestivo de TDAH no autorrelato'
                : 'Total ' + totalGeral + ' abaixo do ponto de corte (≥ ' + CORTE_TOTAL + '): não sugestivo de TDAH no autorrelato',
            conferencia
        };
    }

    E.registrar({ siglas: ['ASRS-18'], carregar: { itens: true }, calcular });
})();

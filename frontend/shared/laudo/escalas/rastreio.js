/* ============================================================================
   CORTEX · Laudo Online — LEITOR: escalas de rastreio GDS-15 · PHQ-9 · GAD-7 · ZARIT
   (frontend/shared/laudo/escalas/rastreio.js) · sprint LO-6
   ----------------------------------------------------------------------------
   Mesma conta do motor frontend/correcao/rastreio/rastreio_resultado.js:
     - nota do item: item COM opcoes {texto,valor} → opcoes[índice].valor;
       opcoes em texto → índice; item SEM opcoes → valor bruto
     - itens cujas opções valem todas 0 (impacto funcional PHQ-9/GAD-7) não pontuam
     - faixas: instrumentos_classificacoes da norma (sem fator, base 'raw', com
       min/max, por ordem); sem linhas → faixas fixas do CFG (iguais às da tela)
     - escore máximo: norma.score_max || limite da última faixa do CFG
   Norma: igual à tela — a gravada em escores_brutos.norma_id quando existe,
   senão a ativa (normaDaCorrecao no carregar).
   ============================================================================ */
(function () {
    'use strict';
    const E = window.LaudoEscalas;
    const U = E.util;

    // Recorte do CFG da tela (só o que entra na conta e nos rótulos)
    const CFG = {
        'GDS-15': {
            nome: 'Escala de Depressão Geriátrica — versão reduzida', respondente: 'Autorrelato',
            norma: 'Versão brasileira: Almeida & Almeida (1999) — corte 5/6',
            corte: 5,
            faixas: [[0, 4, 'Sem indicativo de depressão'], [5, 8, 'Depressão leve'],
                     [9, 11, 'Depressão moderada'], [12, 15, 'Depressão grave']]
        },
        'PHQ-9': {
            nome: 'Questionário sobre a Saúde do Paciente (PHQ-9)', respondente: 'Autorrelato',
            norma: 'Kroenke et al. (2001), corte ≥ 10 · validação brasileira: Santos et al. (2013), corte ≥ 9',
            corte: 10, corteBR: 9, itemRisco: 9, sintoma: 'sintomatologia depressiva',
            faixas: [[0, 4, 'Mínima'], [5, 9, 'Leve'], [10, 14, 'Moderada'],
                     [15, 19, 'Moderadamente grave'], [20, 27, 'Grave']]
        },
        'GAD-7': {
            nome: 'Escala de Transtorno de Ansiedade Generalizada (GAD-7)', respondente: 'Autorrelato',
            norma: 'Spitzer et al. (2006), corte ≥ 10 · versão brasileira: Moreno et al. (2016)',
            corte: 10, sintoma: 'sintomatologia ansiosa',
            faixas: [[0, 4, 'Mínima'], [5, 9, 'Leve'], [10, 14, 'Moderada'], [15, 21, 'Grave']]
        },
        'ZARIT': {
            nome: 'Escala de Sobrecarga do Cuidador de Zarit', respondente: 'Cuidador(a)',
            norma: 'Versão brasileira: Scazufca (2002) · faixas de uso corrente na literatura',
            corte: null,
            faixas: [[0, 20, 'Sobrecarga pouca ou nenhuma'], [21, 40, 'Sobrecarga leve a moderada'],
                     [41, 60, 'Sobrecarga moderada a grave'], [61, 88, 'Sobrecarga grave']]
        }
    };

    // ── Funções copiadas do motor ───────────────────────────────────────────
    function opcaoTexto(norma, item, idx) {
        if (Array.isArray(item.opcoes) && item.opcoes.length) {
            const op = item.opcoes[idx];
            if (op == null) return null;
            return (typeof op === 'object') ? op.texto : String(op);
        }
        const labels = Array.isArray(norma.answer_labels) ? norma.answer_labels : [];
        const t = labels[idx - norma.escala_min];
        return t !== undefined ? t : (idx != null ? String(idx) : null);
    }
    function opcaoValor(item, idx) {
        if (Array.isArray(item.opcoes) && item.opcoes.length) {
            const op = item.opcoes[idx];
            if (op == null) return null;
            if (typeof op === 'object') return (op.valor != null && !isNaN(op.valor)) ? parseInt(op.valor, 10) : null;
            return idx;
        }
        return idx;
    }
    function ehExtra(item) {
        return Array.isArray(item.opcoes) && item.opcoes.length > 0 &&
            item.opcoes.every(op => op && typeof op === 'object' && Number(op.valor) === 0);
    }

    // Faixas: classificações da norma (como a tela filtra) ou CFG
    function faixasDe(ctx, cfg) {
        const normaId = ctx.norma && ctx.norma.id;
        const linhas = (ctx.classificacoes || [])
            .filter(f => !(f.norma_id && normaId && f.norma_id !== normaId))
            .map((f, i) => ({ f, i }))
            .sort((a, b) => {   // ORDER BY ordem (ASC, NULLS LAST)
                const oa = a.f.ordem, ob = b.f.ordem;
                if (oa == null && ob == null) return a.i - b.i;
                if (oa == null) return 1;
                if (ob == null) return -1;
                return (oa - ob) || (a.i - b.i);
            })
            .map(x => x.f);
        const doBanco = linhas.filter(f => !f.fator_id && (f.base_valor || 'raw') === 'raw' && f.valor_min != null && f.valor_max != null);
        return doBanco.length
            ? doBanco.map(f => ({ min: f.valor_min, max: f.valor_max, label: f.label }))
            : cfg.faixas.map(f => ({ min: f[0], max: f[1], label: f[2] }));
    }

    // Tom pelo rótulo da faixa (com posição como reserva)
    function tomDaFaixa(label, idx, n) {
        const k = U.chave(label);
        if (/sem_indicativo|minim|pouca_ou_nenhuma|nenhum/.test(k)) return 'ok';
        if (/moderadamente_grave/.test(k)) return 'grave';
        if (/moderada_a_grave/.test(k)) return 'mod';
        if (/leve_a_moderad/.test(k)) return 'leve';
        if (/grave|sever/.test(k)) return 'grave';
        if (/moderad/.test(k)) return 'mod';
        if (/leve/.test(k)) return 'leve';
        if (idx === 0) return 'ok';
        if (idx === n - 1) return 'grave';
        return 'neutro';
    }

    function calcularCom(sigla) {
        const cfg = CFG[sigla];
        return function (ctx) {
            if (!ctx || !ctx.norma) throw new Error('Norma não cadastrada para ' + sigla);
            const norma = ctx.norma;
            const itens = (ctx.itens || []).slice().sort((a, b) => a.numero - b.numero);
            if (!itens.length) throw new Error('Itens do ' + sigla + ' não carregados');
            const faixas = faixasDe(ctx, cfg);
            const resp = ctx.respostas || {};

            const porItem = {};
            const extras = [];
            let total = 0;
            for (const item of itens) {
                let raw = resp[item.numero];
                if (raw == null) raw = resp[String(item.numero)];
                const idx = (raw != null && !isNaN(raw)) ? parseInt(raw, 10) : null;
                const nota = idx != null ? opcaoValor(item, idx) : null;
                porItem[item.numero] = { idx, nota, texto: idx != null ? opcaoTexto(norma, item, idx) : null };
                if (ehExtra(item)) { extras.push(item); continue; }
                if (nota != null) total += nota;
            }
            const scoreMax = norma.score_max || cfg.faixas[cfg.faixas.length - 1][1];
            let fi = faixas.findIndex(f => total >= f.min && total <= f.max);
            if (fi < 0) fi = faixas.length - 1;
            const faixa = faixas[fi];
            const tom = tomDaFaixa(faixa.label, fi, faixas.length);

            // Frase-resumo (mesma lógica do "texto pronto para o laudo" da tela)
            let indicacao;
            const linhas = [];
            if (sigla === 'ZARIT') {
                indicacao = 'Compatível com ' + faixa.label.toLowerCase();
            } else if (sigla === 'GDS-15') {
                indicacao = total >= cfg.corte
                    ? 'Acima do ponto de corte (≥ ' + cfg.corte + '): compatível com ' + faixa.label.toLowerCase() + ', rastreio positivo para sintomas depressivos'
                    : 'Abaixo do ponto de corte (≥ ' + cfg.corte + '): sem indicativo de sintomatologia depressiva no rastreio';
            } else {
                if (total >= cfg.corte) indicacao = 'Atinge o ponto de corte (≥ ' + cfg.corte + '): rastreio positivo para ' + cfg.sintoma;
                else if (cfg.corteBR && total >= cfg.corteBR) indicacao = 'Abaixo do corte internacional (≥ ' + cfg.corte + '), mas atinge o corte da validação brasileira (≥ ' + cfg.corteBR + ')';
                else indicacao = 'Abaixo do ponto de corte (≥ ' + cfg.corte + ')';
                extras.forEach(item => {
                    const t = porItem[item.numero].texto;
                    linhas.push(['Impacto no dia a dia', t || 'Não respondido']);
                });
                if (cfg.itemRisco) {
                    const pi = porItem[cfg.itemRisco];
                    if (pi && pi.nota != null && pi.nota > 0) {
                        linhas.push(['Item ' + cfg.itemRisco + ' (pensamentos de morte ou de se ferir)', 'Positivo — investigar ideação suicida e autolesão']);
                        indicacao += ' · item ' + cfg.itemRisco + ' positivo: requer avaliação de risco';
                    }
                }
            }
            if (cfg.corte != null) linhas.unshift(['Ponto de corte', '≥ ' + cfg.corte + (cfg.corteBR ? ' (validação brasileira ≥ ' + cfg.corteBR + ')' : '')]);

            return {
                sigla: ctx.sigla || sigla,
                nome: cfg.nome,
                respondente: cfg.respondente,
                norma: cfg.norma,
                principal: { rotulo: 'Escore total', valor: total, max: scoreMax, sufixo: '', classificacao: faixa.label, tom },
                regua: {
                    min: Number(faixas[0].min) < 0 ? Number(faixas[0].min) : 0, max: scoreMax, valor: total, rotulo: 'Escore total',
                    zonas: faixas.map((f, i) => ({ ate: Number(f.max), rotulo: f.label, tom: tomDaFaixa(f.label, i, faixas.length) }))
                },
                subescalas: [],
                linhas: linhas.length ? linhas : null,
                indicacao,
                conferencia: { total }
            };
        };
    }

    Object.keys(CFG).forEach(sigla => {
        E.registrar({ siglas: [sigla], carregar: { itens: true, classificacoes: true, normaDaCorrecao: true }, calcular: calcularCom(sigla) });
    });
})();

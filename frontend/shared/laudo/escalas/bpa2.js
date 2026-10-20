/* ============================================================================
   CORTEX · Laudo Online — leitor da BPA-2 (Bateria Psicológica para Avaliação da Atenção)
   (frontend/shared/laudo/escalas/bpa2.js) · sprint LO-6
   ----------------------------------------------------------------------------
   A BPA-2 NÃO usa a tabela `correcoes`. A tela de correção
   (correcao/bpa2/bpa2_resultado.js) grava, por subteste, as posições que o
   paciente marcou em `bpa2_respostas` (aplicacao_id, subteste 'AC'|'AD'|'AA',
   respostas int[] = índices 0..399 da grade 20x20, acertos, erros, omissoes,
   ultima_marca) e confere com o crivo fixo de correcao/bpa2/bpa2_crivos.js.

   Depende de: window.BPA2_CRIVOS (carregar ../../correcao/bpa2/bpa2_crivos.js
   antes deste arquivo).

   Contagem (idêntica a contar() da tela):
     ultima   = maior índice marcado (−1 se nada)
     Erros    = marcações fora do crivo
     Acertos  = TODOS os alvos do crivo com índice <= ultima (mesmo os não marcados)
     Omissões = alvos com índice <= ultima que não foram marcados
   A tela mostra só Acertos / Erros / Omissões por subteste. Ela NÃO calcula
   pontuação, Atenção Geral, percentil nem classificação (não há norma da BPA-2
   no CORTEX). O laudo mostra exatamente isso, sem classificação (tom 'neutro').
   ============================================================================ */
(function () {
    'use strict';
    if (!window.LaudoEscalas) return;
    const U = window.LaudoEscalas.util;

    const SUBTESTES = ['AC', 'AD', 'AA'];
    const NOMES = { AC: 'Atenção Concentrada', AD: 'Atenção Dividida', AA: 'Atenção Alternada', AG: 'Atenção Geral' };

    // Cópia fiel de contar(sub) da tela (bpa2_resultado.js), com o Set de marcações como parâmetro.
    function contar(cr, marc) {
        if (!cr) return { acertos: 0, erros: 0, omissoes: 0, ultima: -1, total: 0 };
        const ultima = marc.size ? Math.max(...marc) : -1;
        let acertos = 0, erros = 0, omissoes = 0;
        for (const i of marc) {
            if (!cr.alvos.has(i)) erros++;
        }
        for (const alvo of cr.alvos) {
            if (alvo <= ultima) {
                acertos++;
                if (!marc.has(alvo)) omissoes++;
            }
        }
        return { acertos, erros, omissoes, ultima, total: cr.alvos.size };
    }

    window.LaudoEscalas.registrar({
        siglas: ['BPA-2', 'BPA2'],           // a tela é aberta pelo slug 'bpa2'
        semCorrecao: true,                   // não há linha em `correcoes`
        carregar: { fatores: false, itens: false, classificacoes: false, json: null },

        // Busca as marcações gravadas pela tela (mesma consulta de carregar() da tela).
        async extra(client, ctx) {
            const id = ctx.aplicacao && ctx.aplicacao.id;
            if (!id) return { bpa2_respostas: null };
            const { data, error } = await client
                .from('bpa2_respostas').select('subteste, respostas')
                .eq('aplicacao_id', id);
            if (error) throw new Error('bpa2_respostas: ' + error.message);
            return { bpa2_respostas: data || [] };
        },

        calcular(ctx) {
            const crivos = window.BPA2_CRIVOS;
            if (!crivos) throw new Error('Crivos da BPA-2 não carregados (bpa2_crivos.js)');
            const linhasBanco = ctx.bpa2_respostas;
            if (!Array.isArray(linhasBanco)) throw new Error('Marcações da BPA-2 não carregadas');
            if (!linhasBanco.length) return null;   // ainda não corrigida

            // Mesmo preenchimento de state.respostas da tela.
            const respostas = { AC: new Set(), AD: new Set(), AA: new Set() };
            for (const r of linhasBanco) {
                if (respostas[r.subteste]) {
                    respostas[r.subteste] = new Set(Array.isArray(r.respostas) ? r.respostas : []);
                }
            }

            const conf = {};
            const subescalas = [];
            const linhas = [];
            SUBTESTES.forEach(sub => {
                const cr = crivos[sub];
                const c = contar(cr, respostas[sub]);
                const feito = !!cr && c.ultima >= 0;
                subescalas.push({
                    codigo: sub, nome: NOMES[sub], valor: feito ? c.acertos : null, max: cr ? cr.alvos.size : null,
                    classificacao: 'Sem norma no CORTEX', tom: 'neutro', zonas: null,
                    extra: feito ? `Erros ${c.erros} · Omissões ${c.omissoes}` : 'sem marcações'
                });
                linhas.push([`${NOMES[sub]} — Acertos / Erros / Omissões`, feito ? `${c.acertos} / ${c.erros} / ${c.omissoes}` : '—']);
                if (!feito) return;
                const k = U.chave(NOMES[sub]);
                [['acertos', c.acertos], ['erros', c.erros], ['omissoes', c.omissoes]].forEach(([n, v]) => {
                    conf[sub + '_' + n] = v; conf[k + '_' + n] = v;
                });
            });

            return {
                sigla: ctx.sigla || 'BPA-2', nome: 'Bateria Psicológica para Avaliação da Atenção',
                respondente: null, norma: null,
                principal: null, regua: null,
                subescalas, linhas,
                indicacao: 'Acertos, erros e omissões contados pelo CORTEX; percentis e classificação ainda não têm norma no sistema.',
                conferencia: conf
            };
        }
    });
})();

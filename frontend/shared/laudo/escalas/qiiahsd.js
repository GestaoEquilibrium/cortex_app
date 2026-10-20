/* ============================================================================
   CORTEX · Laudo Online — leitor QIIAHSD-Adulto (autorrelato e 2ª fonte)
   (frontend/shared/laudo/escalas/qiiahsd.js) · sprint LO-6
   ----------------------------------------------------------------------------
   Mesma conta de frontend/correcao/qiiahsd_resultado.js (perfilPorArea +
   mediaIrmaPorCodigo), usada pelas telas qiiahsdad/ e qiiahsdad2f/.
   Siglas: QIIAHSD-AD (autorrelato) · QIIAHSD-AD-2F (2ª fonte).

   Instrumento QUALITATIVO: sem ponto de corte, sem classificação, sem total.
   Por área (fatores da norma, exceto eh_total, na ordem de `ordem`):
     soma e n das respostas válidas 1..5 (fora disso não conta) → média = soma/n.
   A tela mostra a média com 2 casas (fmt); o leitor guarda o mesmo arredondamento.
   Versão-irmã (como a tela): a aplicação 'corrigido' mais recente da outra forma,
   do mesmo paciente, entra só como comparação (média por área no `extra`).
   tom: sempre 'neutro'.
   ============================================================================ */
(function () {
    'use strict';
    if (!window.LaudoEscalas) { console.warn('[qiiahsd] escalas_base.js não carregado'); return; }
    const U = window.LaudoEscalas.util;

    // ---- copiado de qiiahsd_resultado.js ------------------------------------
    const NIVEL_LABELS = ['Nunca', 'Raramente', 'Às vezes', 'Frequentemente', 'Sempre'];
    const fmt = (n) => (n == null || isNaN(n)) ? '—' : (Math.round(n * 100) / 100).toString().replace('.', ',');

    function perfilPorArea(respostas, itens, fatoresById) {
        const acc = {};
        for (const it of itens) {
            const cod = fatoresById[it.fator_id];
            if (!cod) continue;
            const v = parseInt(respostas[it.numero], 10);
            if (!acc[cod]) acc[cod] = { soma: 0, n: 0, dist: [0, 0, 0, 0, 0] };
            if (v >= 1 && v <= 5) { acc[cod].soma += v; acc[cod].n++; acc[cod].dist[v - 1]++; }
        }
        for (const k in acc) acc[k].media = acc[k].n ? acc[k].soma / acc[k].n : null;
        return acc;
    }

    function mediaIrmaPorCodigo(irma) {
        if (!irma) return null;
        const acc = {};
        for (const [numero, cod] of Object.entries(irma.fatorCodePorItem)) {
            const v = parseInt(irma.respostas[numero], 10);
            if (!cod) continue;
            if (!acc[cod]) acc[cod] = { soma: 0, n: 0 };
            if (v >= 1 && v <= 5) { acc[cod].soma += v; acc[cod].n++; }
        }
        const out = {};
        for (const k in acc) out[k] = acc[k].n ? acc[k].soma / acc[k].n : null;
        return out;
    }

    // carregarIrma da tela, com o client do laudo
    async function carregarIrma(cli, sigla, pacienteId) {
        const siglaIrma = sigla.endsWith('-2F') ? sigla.slice(0, -3) : sigla + '-2F';
        const { data: instIrma } = await cli
            .from('instrumentos_catalogo').select('id, sigla').eq('sigla', siglaIrma).maybeSingle();
        if (!instIrma) return null;
        const { data: apl } = await cli
            .from('aplicacoes_instrumento').select('id')
            .eq('paciente_id', pacienteId).eq('instrumento_id', instIrma.id)
            .eq('status', 'corrigido').order('data_conclusao', { ascending: false }).limit(1).maybeSingle();
        if (!apl) return null;
        const { data: normaIrma } = await cli
            .from('instrumentos_normas').select('id').eq('instrumento_id', instIrma.id).eq('ativa', true).limit(1).maybeSingle();
        if (!normaIrma) return null;
        const { data: itensIrma } = await cli
            .from('instrumentos_itens').select('numero, fator_id').eq('norma_id', normaIrma.id);
        const { data: fatIrma } = await cli
            .from('instrumentos_fatores').select('id, fator_codigo').eq('norma_id', normaIrma.id);
        const { data: corrIrma } = await cli
            .from('correcoes').select('escores_brutos').eq('aplicacao_id', apl.id).maybeSingle();
        const codePorFator = {};
        (fatIrma || []).forEach(f => codePorFator[f.id] = f.fator_codigo);
        return {
            sigla: siglaIrma,
            respostas: (corrIrma?.escores_brutos?.respostas) || {},
            fatorCodePorItem: Object.fromEntries((itensIrma || []).map(i => [i.numero, codePorFator[i.fator_id]]))
        };
    }
    // -------------------------------------------------------------------------

    const r2 = (n) => (n == null || isNaN(n)) ? null : Math.round(n * 100) / 100;

    // instrumentos_fatores da tela vem com .order('ordem'); o loader não ordena
    function ordenarFatores(fatores) {
        return fatores.map((f, i) => ({ f, i })).sort((a, b) => {
            const oa = a.f.ordem, ob = b.f.ordem;
            if (oa == null && ob == null) return a.i - b.i;
            if (oa == null) return 1;
            if (ob == null) return -1;
            return (oa - ob) || (a.i - b.i);
        }).map(x => x.f);
    }

    window.LaudoEscalas.registrar({
        siglas: ['QIIAHSD-AD', 'QIIAHSD-AD-2F'],
        carregar: { fatores: true, itens: true, classificacoes: false, json: null },
        async extra(client, ctx) {
            try {
                const pac = ctx.aplicacao && ctx.aplicacao.paciente_id;
                if (!pac || !ctx.sigla) return { qiiahsd_irma: null };
                return { qiiahsd_irma: await carregarIrma(client, ctx.sigla, pac) };
            } catch (e) {
                console.warn('[qiiahsd] versão-irmã não carregada:', e);
                return { qiiahsd_irma: null };
            }
        },
        calcular(ctx) {
            if (!ctx.norma) throw new Error('Norma do QIIAHSD não cadastrada');
            const sigla = ctx.sigla || 'QIIAHSD-AD';
            const fatores = ordenarFatores((ctx.fatores || []).filter(f => !f.eh_total));
            if (!fatores.length) throw new Error('Áreas (fatores) do QIIAHSD não carregadas');
            const itens = (ctx.itens || []).map(i => ({ numero: i.numero, fator_id: i.fator_id }));
            const fatoresById = Object.fromEntries(fatores.map(f => [f.id, f.fator_codigo]));
            const perfil = perfilPorArea(ctx.respostas || {}, itens, fatoresById);
            const irma = mediaIrmaPorCodigo(ctx.qiiahsd_irma || null);
            const ehAuto = !sigla.endsWith('-2F');
            const rotuloEste = ehAuto ? 'Autorrelato' : '2ª fonte';
            const rotuloIrma = ehAuto ? '2ª fonte' : 'Autorrelato';
            const sufIrma = ehAuto ? '2f' : 'autorrelato';

            const conferencia = {};
            const subescalas = fatores.map(f => {
                const d = perfil[f.fator_codigo] || { media: null, n: 0, soma: 0 };
                const media = r2(d.media);
                const mi = irma ? irma[f.fator_codigo] : undefined;
                const chaves = [f.fator_codigo, U.chave(f.fator_label)];
                if (media != null) chaves.forEach(k => { conferencia[k] = media; });
                if (irma && mi != null) chaves.forEach(k => { conferencia[k + '_' + sufIrma] = r2(mi); });
                let extra = `${d.n} itens respondidos · soma ${d.soma || '—'}`;
                if (irma) extra += ` · ${rotuloIrma}: ${mi === undefined ? '—' : fmt(mi)}`;
                return {
                    codigo: f.fator_codigo, nome: f.fator_label, valor: media, max: 5,
                    classificacao: null, tom: 'neutro', zonas: null, extra
                };
            });

            const linhas = fatores.map(f => {
                const d = perfil[f.fator_codigo] || { dist: [0, 0, 0, 0, 0] };
                return [`${f.fator_label} — distribuição`, NIVEL_LABELS.map((l, i) => `${l} ${d.dist[i] || '—'}`).join(' · ')];
            });

            return {
                sigla,
                nome: 'QIIAHSD-Adulto · ' + rotuloEste,
                respondente: rotuloEste,
                norma: 'Instrumento qualitativo — sem ponto de corte (perfil por área, média 1–5)',
                principal: null,
                regua: null,
                subescalas,
                linhas,
                indicacao: 'Instrumento qualitativo: perfil de indicadores de AH/SD por área (média das respostas 1–5, Nunca→Sempre), sem ponto de corte nem classificação; a leitura é clínica'
                    + (irma ? `, cruzando com a ${rotuloIrma} do mesmo paciente.` : '.'),
                conferencia
            };
        }
    });
})();

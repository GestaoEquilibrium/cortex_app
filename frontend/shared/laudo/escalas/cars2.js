/* ============================================================================
   CORTEX · Laudo Online — LEITOR CARS2 (CARS2-ST e CARS2-HF)
   (frontend/shared/laudo/escalas/cars2.js) · sprint LO-6
   ----------------------------------------------------------------------------
   Mesma conta de frontend/correcao/cars2st/cars2st_resultado.js e
   cars2hf/cars2hf_resultado.js (as duas telas são idênticas, só muda a sigla):
     - respostas = ÍNDICE da opção marcada em cada item (escores_brutos.respostas)
     - a nota DOBRADA vem de instrumentos_itens.opcoes[idx].valor (1=2 … 4=8;
       opção string → valor = idx); nota real = dobrado / 2 (meios-pontos)
     - total bruto = soma das notas reais (15–60)
     - gravidade por faixa etária: cars2_norms.json → instruments[SIGLA].severity
       (idade = calcularIdade(data_nascimento, aplicacao.created_at), como a tela)
     - Escore-T: tabela privada cars2_normas_tscore (Supabase, leitura autenticada),
       expandida em passos de 0,5 por faixa de bruto (all / 2_12 / 13_mais);
       carregada aqui pelo gancho `extra` do LaudoDados. Sem linhas → T null
       ("não configurado"), igual à tela.
   ============================================================================ */
(function () {
    'use strict';
    const E = window.LaudoEscalas;
    if (!E) return;

    const RAW_MIN = 15, RAW_MAX = 60;
    const TOM_SLUG = { minimo: 'ok', leve_mod: 'mod', grave: 'grave' };
    const NOMES = {
        'CARS2-ST': 'CARS2-ST',
        'CARS2-HF': 'CARS2-HF'
    };

    // ── funções copiadas da tela (dependências de state viram parâmetros) ────
    function opcaoValorDobrado(item, idx) {
        const ops = Array.isArray(item.opcoes) ? item.opcoes : []; const op = ops[idx];
        if (op == null) return null;
        if (typeof op === 'object') return (op.valor != null && !isNaN(op.valor)) ? parseFloat(op.valor) : null;
        return idx;
    }
    function calcularIdade(nascISO, aplISO) {
        if (!nascISO) return null;
        const ref = aplISO ? new Date(aplISO) : new Date(); const n = new Date(nascISO);
        if (isNaN(n) || isNaN(ref) || ref < n) return null;
        let anos = ref.getFullYear() - n.getFullYear(); const m = ref.getMonth() - n.getMonth();
        if (m < 0 || (m === 0 && ref.getDate() < n.getDate())) anos--;
        return anos;
    }
    function pickGrupoIdade(normSet, idadeAnos) {
        const grupos = normSet?.severity?.age_groups || [];
        if (!grupos.length || idadeAnos == null) return null;
        return grupos.find(g => idadeAnos >= (g.age_min_years ?? 0) && idadeAnos <= (g.age_max_years ?? 200)) || null;
    }
    function classificarGravidade(totalReal, grupo) {
        if (!grupo) return null;
        for (const b of (grupo.bands || [])) if (totalReal >= b.min && totalReal <= b.max) return b;
        const bands = grupo.bands || []; return bands.length ? bands[bands.length - 1] : null;
    }
    function lookupTscore(byRaw, totalReal, grupo) {
        const by = byRaw;
        if (!by || !Object.keys(by).length) return null;
        const row = by[String(totalReal)] != null ? by[String(totalReal)] : by[String(parseFloat(totalReal))];
        if (row == null) return null;
        if (typeof row === 'number') return row;
        const gid = grupo?.id;
        if (gid && row[gid] != null) return row[gid];
        if (row.all != null) return row.all;
        return null;
    }
    // Expansão das linhas de cars2_normas_tscore (mesma de carregarTudo da tela)
    function expandirTabelaT(linhasT) {
        const byRaw = {};
        const marcar = (min, max, grupo, t) => {
            if (min == null || max == null) return;
            for (let b = Math.round(Number(min) * 2); b <= Math.round(Number(max) * 2); b++) {
                const chave = String(b / 2);
                if (!byRaw[chave]) byRaw[chave] = {};
                byRaw[chave][grupo] = t;
            }
        };
        for (const l of linhasT) {
            marcar(l.bruto_all_min,  l.bruto_all_max,  'all',     l.tscore);
            marcar(l.bruto_2_12_min, l.bruto_2_12_max, '2_12',    l.tscore);
            marcar(l.bruto_13_min,   l.bruto_13_max,   '13_mais', l.tscore);
        }
        return byRaw;
    }

    function calcularResultados(correcao, itens, normSet, byRaw, idade) {
        const respostas = (correcao?.escores_brutos || {}).respostas || {};
        const notaRealItem = {}; let totalDobrado = 0;
        for (const item of itens) {
            let r = respostas[item.numero]; if (r == null) r = respostas[String(item.numero)];
            const idx = (r != null && !isNaN(r)) ? parseInt(r, 10) : null;
            const dobrado = (idx != null) ? opcaoValorDobrado(item, idx) : null;
            notaRealItem[item.numero] = (dobrado != null) ? (dobrado / 2) : null;
            if (dobrado != null) totalDobrado += dobrado;
        }
        const totalReal = totalDobrado / 2;
        const grupoIdade = pickGrupoIdade(normSet, idade);
        const classif = classificarGravidade(totalReal, grupoIdade);
        const tscore = lookupTscore(byRaw, totalReal, grupoIdade);
        return { notaRealItem, totalReal, idade, grupoIdade, classif, tscore };
    }

    function fmtNum(n) { if (n == null) return '—'; return Number.isInteger(n) ? String(n) : String(n).replace('.', ','); }

    E.registrar({
        siglas: ['CARS2-ST', 'CARS2-HF'],
        carregar: { fatores: false, itens: true, classificacoes: false, json: 'cars2_norms.json' },
        // Escore-T: tabela privada, mesma consulta da tela (ordem por id: em bruto repetido vence o id maior)
        async extra(client, ctx) {
            try {
                const { data } = await client.from('cars2_normas_tscore')
                    .select('tscore, bruto_all_min, bruto_all_max, bruto_2_12_min, bruto_2_12_max, bruto_13_min, bruto_13_max')
                    .eq('instrumento', ctx.sigla)
                    .order('id', { ascending: true });
                return { tscore_linhas: data || [] };
            } catch (e) {
                console.warn('normas T CARS2 não carregadas:', e);
                return { tscore_linhas: [] };
            }
        },
        calcular(ctx) {
            const sigla = ctx.sigla;
            if (!ctx.correcao) throw new Error('Nenhuma correção encontrada');
            if (!Array.isArray(ctx.itens) || !ctx.itens.length) throw new Error(`Itens do ${sigla} não cadastrados (instrumentos_itens)`);
            const normSet = ctx.json?.instruments?.[sigla] || null;
            if (!normSet) throw new Error('Norma local cars2_norms.json sem ' + sigla);

            // by_raw: tabela privada (se houver linhas) substitui o by_raw do JSON — como a tela
            const linhasT = Array.isArray(ctx.tscore_linhas) ? ctx.tscore_linhas : [];
            const byRaw = linhasT.length ? expandirTabelaT(linhasT) : (normSet.tscore && normSet.tscore.by_raw);

            const itens = ctx.itens.slice().sort((a, b) => a.numero - b.numero);
            const idade = ctx.aplicacao
                ? calcularIdade(ctx.paciente?.data_nascimento, ctx.aplicacao.created_at)
                : (ctx.idade ? ctx.idade.anos : null);
            const s = calcularResultados(ctx.correcao, itens, normSet, byRaw, idade);
            const total = s.totalReal, grupo = s.grupoIdade, cl = s.classif;

            // distribuição por âncora (renderIntensidade da tela)
            const buckets = [
                { lbl: 'Adequado / típico (≈1)', n: 0 },
                { lbl: 'Levemente atípico (≈2)', n: 0 },
                { lbl: 'Moderadamente atípico (≈3)', n: 0 },
                { lbl: 'Gravemente atípico (≈4)', n: 0 }
            ];
            let respondidos = 0;
            for (const item of itens) {
                const v = s.notaRealItem[item.numero]; if (v == null) continue;
                respondidos++; const idxB = Math.min(3, Math.max(0, Math.round(v) - 1)); buckets[idxB].n++;
            }

            const zonas = grupo
                ? (grupo.bands || []).map(b => ({ ate: b.max, rotulo: b.label, tom: TOM_SLUG[b.slug] || 'neutro' }))
                : [{ ate: RAW_MAX, rotulo: 'Classificação indisponível', tom: 'neutro' }];

            const indicacao = !grupo
                ? `Escore bruto total: ${fmtNum(total)} de ${RAW_MAX}. Não foi possível determinar o grupo etário (idade ausente) — a classificação do ${sigla} é estratificada por idade.`
                : `${cl ? cl.label + '.' : 'Classificação indisponível.'} Escore bruto total ${fmtNum(total)} de ${RAW_MAX} (faixa etária de referência: ${grupo.label}).`;

            // Sem grupo etário a tela não mostra o Escore-T (só o bruto) — idem aqui
            const tMostrado = grupo ? s.tscore : null;
            const linhas = (grupo ? [
                ['Escore-T', tMostrado != null ? fmtNum(tMostrado) : 'não configurado'],
                ['Faixa etária de referência', grupo.label]
            ] : []).concat(buckets.map(b => [b.lbl, `${b.n} ${b.n === 1 ? 'item' : 'itens'}`]));

            const conferencia = { total, escore_bruto_total: total, itens_pontuados: respondidos };
            if (tMostrado != null) { conferencia.total_t = tMostrado; conferencia.escore_t = tMostrado; }

            return {
                sigla,
                nome: NOMES[sigla] || sigla,
                respondente: null,
                norma: grupo ? grupo.label : null,
                principal: {
                    rotulo: 'Escore Bruto Total', valor: total, max: RAW_MAX, sufixo: '',
                    classificacao: cl ? cl.label : null,
                    tom: cl ? (TOM_SLUG[cl.slug] || 'neutro') : 'neutro'
                },
                regua: { min: RAW_MIN, max: RAW_MAX, valor: total, zonas, rotulo: 'Escore Bruto Total' },
                subescalas: [],
                linhas,
                indicacao,
                conferencia
            };
        }
    });
})();

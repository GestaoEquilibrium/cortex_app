/* ============================================================================
   CORTEX · Laudo Online — leitor TLPP (ANELE-4)
   (frontend/shared/laudo/escalas/tlpp.js) · sprint LO-6
   ----------------------------------------------------------------------------
   A TLPP NÃO usa a tabela `correcoes`. A tela (correcao/tlpp/tlpp_resultado.js)
   marca os 72 estímulos em `tlpp_respostas`, calcula com tlpp_engine.js e grava
   o resultado em `tlpp_resultados` (aplicacao_id, grupo_norma, escores[],
   efeitos{}, erros{}, interpretacao, ...). No modo laudo a tela NÃO recalcula:
   mostra o que está em `tlpp_resultados`. Este leitor faz o mesmo:
     - escores[]: { key, label, bruto, max, pct, percentil (texto do intervalo),
       p_baixo, p_alto, z, classificacao { cod, nivel, label } } — Tabela 6.2
     - efeitos{}: diferença de % de acertos (sem norma)
     - erros{}: por_tipo, total, estimulos_com_erro (a lista com as leituras do
       paciente fica de fora: é resposta bruta)
   Sem linha em tlpp_resultados → aplicação ainda não corrigida (null).

   Régua: a classificação é por percentil, então as zonas em acertos vêm da
   linha de `tlpp_normas` do grupo, aplicando percentil()+classificar() do motor
   (cópia literal) a cada escore inteiro 0..máx. Se a norma atual não reproduz a
   classificação gravada (norma alterada depois), a régua é omitida.
   ============================================================================ */
(function () {
    'use strict';
    if (!window.LaudoEscalas) { console.warn('[tlpp] escalas_base.js não carregado'); return; }
    const U = window.LaudoEscalas.util;

    // ---- copiado de tlpp_engine.js ------------------------------------------
    const REGRA_PERCENTIL = 'alto';
    const PCTS = [2.5, 7, 10, 16, 20, 30, 40, 50, 60, 70, 80, 90];
    const COL  = { 2.5: 'p2_5', 7: 'p7', 10: 'p10', 16: 'p16', 20: 'p20', 30: 'p30',
                   40: 'p40', 50: 'p50', 60: 'p60', 70: 'p70', 80: 'p80', 90: 'p90' };
    const GRUPOS = {
        cri_10_13:  { label: 'Crianças e adolescentes · 10 a 13 anos', curto: '10–13 anos',           tabela: '6.5', n: 35 },
        adu_ate5:   { label: 'Adultos · até 5 anos de estudo',          curto: 'Adultos, até 5 anos',  tabela: '6.6', n: 52 },
        adu_6_10:   { label: 'Adultos · 6 a 10 anos de estudo',         curto: 'Adultos, 6–10 anos',   tabela: '6.7', n: 58 },
        adu_11mais: { label: 'Adultos · 11 ou mais anos de estudo',     curto: 'Adultos, 11+ anos',    tabela: '6.8', n: 69 }
    };
    const CLASSES = {
        grav:   { cod: 'grav',   nivel: 0, label: 'Déficit de gravidade importante' },
        mod:    { cod: 'mod',    nivel: 1, label: 'Déficit moderado a grave' },
        def:    { cod: 'def',    nivel: 2, label: 'Déficit' },
        alerta: { cod: 'alerta', nivel: 3, label: 'Alerta para déficit' },
        esp:    { cod: 'esp',    nivel: 4, label: 'Escore esperado para a escolaridade' }
    };
    const TIPOS_ERRO = [
        { cod: 'paralexia_fonologica', label: 'Paralexia fonológica' },
        { cod: 'paralexia_semantica', label: 'Paralexia semântica' },
        { cod: 'paralexia_semantico_fonologica', label: 'Paralexia semântico-fonológica' },
        { cod: 'paralexia_morfemica', label: 'Paralexia morfêmica' },
        { cod: 'paralexia_verbal', label: 'Paralexia verbal' },
        { cod: 'desconhecimento_regra', label: 'Desconhecimento de regra' },
        { cod: 'regularizacao', label: 'Regularização' },
        { cod: 'acentuacao', label: 'Erro na pronúncia da acentuação' },
        { cod: 'lexicalizacao', label: 'Lexicalização' },
        { cod: 'neologismo', label: 'Neologismo' },
        { cod: 'substituicao', label: 'Substituição' },
        { cod: 'omissao', label: 'Omissão' },
        { cod: 'acrescimo', label: 'Acréscimo' },
        { cod: 'inversao', label: 'Inversão' },
        { cod: 'perseveracao', label: 'Perseveração' },
        { cod: 'nao_resposta', label: 'Não resposta' }
    ];
    const EFEITOS = [
        { key: 'regularidade',      label: 'Regularidade',             formula: '% regulares − % irregulares' },
        { key: 'frequencia',        label: 'Frequência',               formula: '% frequentes − % não frequentes' },
        { key: 'lexicalidade',      label: 'Lexicalidade',             formula: '% palavras − % pseudopalavras' },
        { key: 'extensao_palavras', label: 'Extensão (palavras)',      formula: '% curtas − % longas' },
        { key: 'extensao_pseudo',   label: 'Extensão (pseudopalavras)', formula: '% pseudo curtas − % pseudo longas' }
    ];
    function fmtP(p) { return p === 2.5 ? '2,5' : String(p); }
    function percentil(norma, x) {
        const vals = PCTS.map(p => Number(norma[COL[p]]));
        if (x < vals[0]) return { label: '< 2,5', baixo: 2.5, alto: 2.5, abaixo: true };
        const iguais = PCTS.filter((p, i) => vals[i] === x);
        if (iguais.length) {
            const lo = iguais[0], hi = iguais[iguais.length - 1];
            return { label: lo === hi ? fmtP(lo) : fmtP(lo) + ' - ' + fmtP(hi), baixo: lo, alto: hi };
        }
        if (x > vals[vals.length - 1]) return { label: '> 90', baixo: 90, alto: 90, acima: true };
        let i = 0;
        while (i + 1 < vals.length && vals[i + 1] < x) i++;
        return { label: fmtP(PCTS[i]) + ' - ' + fmtP(PCTS[i + 1]), baixo: PCTS[i], alto: PCTS[i + 1] };
    }
    function classificar(p) {
        if (p == null) return null;
        if (p <= 2.5) return CLASSES.grav;
        if (p < 7)    return CLASSES.mod;
        if (p < 10)   return CLASSES.def;
        if (p < 25)   return CLASSES.alerta;
        return CLASSES.esp;
    }
    // ---- num() da tela de laudo (vírgula decimal, '—' para nulo) -------------
    function num(x) { return x == null ? '—' : String(x).replace('.', ','); }
    // -------------------------------------------------------------------------

    const TOM = { grav: 'grave', mod: 'grave', def: 'mod', alerta: 'leve', esp: 'ok' };
    const tomDe = cl => (cl && TOM[cl.cod]) || 'neutro';

    // Zonas em acertos (0..max) a partir da linha de norma, mesma regra do motor.
    function zonasDe(norma, max) {
        if (!norma) return null;
        const zonas = [];
        for (let x = 0; x <= max; x++) {
            const p = percentil(norma, x);
            const cl = classificar(REGRA_PERCENTIL === 'alto' ? p.alto : p.baixo);
            const ult = zonas[zonas.length - 1];
            if (ult && ult.cod === cl.cod) ult.ate = x;
            else zonas.push({ ate: x, rotulo: cl.label, tom: tomDe(cl), cod: cl.cod });
        }
        return zonas.map(z => ({ ate: z.ate, rotulo: z.rotulo, tom: z.tom }));
    }
    // Só usa a régua se ela reproduz a classificação gravada
    function zonasConferidas(norma, s) {
        const zonas = zonasDe(norma, s.max);
        if (!zonas || !s.classificacao) return null;
        const z = U.zonaDe(zonas, s.bruto);
        return z && z.rotulo === s.classificacao.label ? zonas : null;
    }

    window.LaudoEscalas.registrar({
        siglas: ['TLPP'],
        semCorrecao: true,                   // resultado em tlpp_resultados, não em `correcoes`
        carregar: { fatores: false, itens: false, classificacoes: false, json: null },

        async extra(client, ctx) {
            const id = ctx.aplicacao && ctx.aplicacao.id;
            if (!id) return { tlpp: null, tlpp_normas: [] };
            const { data: r, error } = await client.from('tlpp_resultados')
                .select('grupo_norma, anos_estudo, idade_anos, idade_meses, escores, efeitos, erros, interpretacao')
                .eq('aplicacao_id', id).maybeSingle();
            if (error) throw new Error('tlpp_resultados: ' + error.message);
            if (!r) return { tlpp: null, tlpp_normas: [] };
            let normas = [];
            if (r.grupo_norma) {
                const n = await client.from('tlpp_normas').select('*').eq('grupo', r.grupo_norma);
                normas = (n && n.data) || [];   // só para desenhar a régua; sem ela o resumo sai igual
            }
            return { tlpp: r, tlpp_normas: normas };
        },

        calcular(ctx) {
            const r = ctx.tlpp;
            if (!r) return null;                         // ainda não corrigida (tela em modo edição)
            if (!Array.isArray(r.escores) || !r.escores.length) throw new Error('TLPP: escores não gravados');
            const S = {}; for (const s of r.escores) S[s.key] = s;
            if (!S.total) throw new Error('TLPP: escore total ausente');
            const g = GRUPOS[r.grupo_norma] || { label: r.grupo_norma, tabela: '—', curto: r.grupo_norma };
            const normaDe = {}; (ctx.tlpp_normas || []).forEach(n => { if (n.grupo === r.grupo_norma) normaDe[n.medida] = n; });

            const conferencia = {};
            const conf = (s) => {
                [s.key, U.chave(s.label)].forEach(k => {
                    conferencia[k] = s.bruto;
                    if (s.pct != null) conferencia[k + '_pct'] = s.pct;
                    if (s.z != null) conferencia[k + '_z'] = s.z;
                    if (s.percentil) conferencia[k + '_percentil'] = s.percentil;
                });
            };
            r.escores.forEach(conf);

            const subescalas = r.escores.filter(s => s.key !== 'total').map(s => ({
                codigo: s.key, nome: s.label, valor: s.bruto, max: s.max,
                classificacao: s.classificacao ? s.classificacao.label : null,
                tom: tomDe(s.classificacao),
                zonas: zonasConferidas(normaDe[s.key], s),
                extra: `${num(s.pct)}% · percentil ${s.percentil || '—'} · Z ${num(s.z)}`
            }));

            const T = S.total;
            const zonasTotal = zonasConferidas(normaDe.total, T);

            const ef = r.efeitos || {};
            const er = r.erros || { por_tipo: {}, total: 0, estimulos_com_erro: 0 };
            const linhas = EFEITOS.map(e => {
                const v = Number(ef[e.key] || 0);
                conferencia['efeito_' + e.key] = v; conferencia[e.key] = v;
                return [`Efeito de ${e.label.toLowerCase()} (${e.formula})`, `${v > 0 ? '+' : ''}${num(v)}`];
            });
            linhas.push(['Total de erros classificados', String(er.total || 0)]);
            linhas.push(['Estímulos pontuados como erro', String(er.estimulos_com_erro || 0)]);
            TIPOS_ERRO.forEach(t => {
                const n = (er.por_tipo || {})[t.cod] || 0;
                if (n) linhas.push([t.label, String(n)]);
            });
            conferencia.erros_total = er.total || 0;
            conferencia.estimulos_com_erro = er.estimulos_com_erro || 0;

            const paragrafos = String(r.interpretacao || '').split(/\n\n+/).filter(Boolean);
            return {
                sigla: ctx.sigla || 'TLPP',
                nome: 'Tarefa de Leitura de Palavras e Pseudopalavras (ANELE-4)',
                respondente: null,
                norma: `${g.label} — Tabela ${g.tabela} do manual`,
                principal: {
                    rotulo: 'Total TLPP', valor: T.bruto, max: T.max, sufixo: '',
                    classificacao: T.classificacao ? T.classificacao.label : null, tom: tomDe(T.classificacao)
                },
                regua: zonasTotal ? { min: 0, max: T.max, valor: T.bruto, zonas: zonasTotal, rotulo: `Total TLPP · percentil ${T.percentil || '—'}` } : null,
                subescalas,
                linhas,
                indicacao: paragrafos[0] || null,       // 1º parágrafo da interpretação gravada pela tela
                conferencia
            };
        }
    });
})();

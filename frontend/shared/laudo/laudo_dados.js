/* ============================================================================
   CORTEX · Laudo Online — LEITURA DOS RESULTADOS  (frontend/shared/laudo/laudo_dados.js)
   ----------------------------------------------------------------------------
   Documento 3, §4. Lê do Supabase tudo o que o laudo mostra:
     LaudoDados.carregar(pacienteId) → { paciente, aplicacoes[], resultados{ SIGLA: objeto } }
     LaudoDados.valor(sigla, chave, banco) → número usado nas conferências
   O número sempre vem do banco; o documento só diz qual mostrar.
   Expõe: window.LaudoDados
   ============================================================================ */
(function () {
    'use strict';

    const c = () => window.cortexClient;
    const TABELAS = {
        'WAIS-III': 'wais_resultados',
        'WISC-IV': 'wisciv_resultados',
        'RAVLT': 'ravlt_resultados',
        'FDT': 'fdt_resultados',
        'BFP': 'bfp_resultados'
    };
    const STATUS_CORRIGIDO = ['corrigido', 'integrado_laudo'];

    function vazio(o) { return !o || (typeof o === 'object' && Object.keys(o).length === 0); }

    /** Um resultado está calculado? Mesma regra das telas de correção. */
    function calculado(sigla, r) {
        if (!r) return false;
        if (sigla === 'WAIS-III' || sigla === 'WISC-IV') return !vazio(r.compostos) && !vazio(r.ponderados);
        if (sigla === 'RAVLT' || sigla === 'FDT') return Array.isArray(r.medidas) && r.medidas.length > 0;
        if (sigla === 'BFP') return !vazio(r.eb_fatores);
        return true;
    }

    /** ICG/ICC e regra dos 23, calculados na tela como nas correções (shared/icg.js). */
    function completarWechsler(sigla, r) {
        const out = Object.assign({}, r);
        const I = window.CortexICG;
        if (!I) { out._icg = null; out._interpretacao = null; return out; }
        const ponds = r.ponderados || {};
        const icg = I.calcularICG(sigla === 'WAIS-III' ? 'WAIS' : 'WISC', ponds);
        out._icg = icg && !icg.incompleto && !icg.foraDaTabela ? icg : (icg || null);
        if (sigla === 'WISC-IV' && I.calcularICC) out._icc = I.calcularICC(ponds);
        const compostos = {};
        ['ICV', 'IOP', 'IMO', 'IVP'].forEach(k => {
            const v = r.compostos && r.compostos[k] && r.compostos[k].composto;
            if (v != null) compostos[k] = v;
        });
        out._interpretacao = I.avaliarInterpretabilidade(compostos, 'IOP');
        return out;
    }

    async function fotoAssinada(caminho) {
        if (!caminho) return null;
        if (/^https?:/i.test(caminho)) return caminho;
        try {
            const { data } = await c().storage.from('pacientes-fotos').createSignedUrl(caminho, 600);
            return (data && data.signedUrl) || null;
        } catch (e) { return null; }
    }

    async function carregarPaciente(pacienteId) {
        const campos = 'id, codigo, nome_completo, data_nascimento, sexo, escolaridade, foto_url, cpf, medico_referencia, medico_crm, data_inicio_avaliacao';
        let r = await c().from('pacientes').select(campos).eq('id', pacienteId).maybeSingle();
        if (r.error && /data_inicio_avaliacao/.test(r.error.message || '')) {
            r = await c().from('pacientes').select(campos.replace(', data_inicio_avaliacao', '')).eq('id', pacienteId).maybeSingle();
        }
        if (r.error) throw r.error;
        if (!r.data) throw new Error('Paciente não encontrado.');
        const p = r.data;
        p.foto_assinada = await fotoAssinada(p.foto_url);
        return p;
    }

    async function carregarAplicacoes(pacienteId) {
        const { data, error } = await c().from('aplicacoes_instrumento')
            .select('id, instrumento_id, status, data_aplicacao, data_conclusao, created_at, instrumentos_catalogo!inner(sigla, nome_completo)')
            .eq('paciente_id', pacienteId)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return (data || []).map(a => ({
            id: a.id,
            instrumento_id: a.instrumento_id,
            sigla: (a.instrumentos_catalogo || {}).sigla || '',
            nome: (a.instrumentos_catalogo || {}).nome_completo || '',
            status: a.status,
            data_aplicacao: a.data_aplicacao,
            created_at: a.created_at,
            corrigida: STATUS_CORRIGIDO.includes(a.status)
        }));
    }

    /**
     * Carrega paciente, aplicações e o resultado mais recente de cada teste.
     * Para os testes calculados pelo CORTEX, "corrigida" = há resultado calculado.
     */
    async function carregar(pacienteId) {
        const [paciente, aplicacoes] = await Promise.all([carregarPaciente(pacienteId), carregarAplicacoes(pacienteId)]);
        const resultados = {};
        const porSigla = {};
        aplicacoes.forEach(a => { (porSigla[a.sigla] = porSigla[a.sigla] || []).push(a); });

        await Promise.all(Object.keys(TABELAS).filter(s => porSigla[s]).map(async sigla => {
            const ids = porSigla[sigla].map(a => a.id);
            const { data, error } = await c().from(TABELAS[sigla]).select('*').in('aplicacao_id', ids);
            if (error) { console.warn('[LaudoDados]', sigla, error.message); return; }
            const porAplic = {};
            (data || []).forEach(r => { porAplic[r.aplicacao_id] = r; });
            // a mais recente que tenha resultado calculado
            let escolhida = null;
            porSigla[sigla].forEach(a => {
                const r = porAplic[a.id];
                a.corrigida = calculado(sigla, r);
                if (!escolhida && a.corrigida) escolhida = { a, r };
            });
            if (escolhida) {
                let r = Object.assign({ _aplicacao: escolhida.a }, escolhida.r);
                if (sigla === 'WAIS-III' || sigla === 'WISC-IV') r = completarWechsler(sigla, r);
                resultados[sigla] = r;
            }
        }));

        // Escalas online (LO-6): só o resumo de cada uma, calculado pelo leitor da escala.
        await carregarEscalas(paciente, aplicacoes, porSigla, resultados);

        return { paciente, aplicacoes, resultados, carregado_em: new Date().toISOString() };
    }

    // ── Escalas online (LO-6) ─────────────────────────────────────────────────
    const BASE_CORRECAO = (function () {
        const s = document.currentScript && document.currentScript.src;
        return s ? s.replace(/shared\/laudo\/[^/]*$/, 'correcao/') : '../correcao/';
    })();
    const jsonCache = {};
    function lerJson(nome) {
        if (!jsonCache[nome]) {
            jsonCache[nome] = fetch(BASE_CORRECAO + nome, { cache: 'force-cache' })
                .then(r => { if (!r.ok) throw new Error('norma ' + nome + ' não carregou'); return r.json(); })
                .catch(e => { delete jsonCache[nome]; throw e; });
        }
        return jsonCache[nome];
    }
    function idadeEm(nasc, ref) {
        if (!nasc) return null;
        const [y, m, d] = String(nasc).slice(0, 10).split('-').map(Number);
        const r = ref ? new Date(String(ref).slice(0, 10) + 'T12:00:00') : new Date();
        let anos = r.getFullYear() - y, meses = r.getMonth() + 1 - m;
        if (r.getDate() < d) meses--;
        if (meses < 0) { anos--; meses += 12; }
        return { anos, meses };
    }

    async function lerEscala(a, def, paciente) {
        const q = await c().from('correcoes').select('*').eq('aplicacao_id', a.id).order('created_at', { ascending: false }).limit(1);
        if (q.error) throw q.error;
        const correcao = (q.data || [])[0] || null;
        if (!correcao && !def.semCorrecao) return null;
        let norma = null;
        // só as telas que usam a norma gravada na correção (ex.: rastreios) pedem normaDaCorrecao
        const normaUsada = (def.carregar || {}).normaDaCorrecao && correcao && correcao.escores_brutos && correcao.escores_brutos.norma_id;
        if (normaUsada) {          // a norma gravada na correção vence a ativa (mesma regra das telas)
            const n = await c().from('instrumentos_normas').select('*').eq('id', normaUsada).limit(1);
            norma = (n.data || [])[0] || null;
        }
        if (!norma && a.instrumento_id) {
            const n = await c().from('instrumentos_normas').select('*').eq('instrumento_id', a.instrumento_id).eq('ativa', true).limit(1);
            norma = (n.data || [])[0] || null;
        }
        const ctx = {
            sigla: a.sigla, aplicacao: a, correcao, norma,
            brutos: (correcao && correcao.escores_brutos) || {},
            respostas: ((correcao && correcao.escores_brutos) || {}).respostas || {},
            fatores: [], itens: [], classificacoes: [], json: null,
            paciente: { sexo: paciente.sexo, data_nascimento: paciente.data_nascimento, escolaridade: paciente.escolaridade },
            idade: idadeEm(paciente.data_nascimento, a.data_aplicacao || a.created_at)
        };
        const car = def.carregar || {};
        const tarefas = [];
        if (norma && (car.fatores || car.itens)) tarefas.push(c().from('instrumentos_fatores').select('*').eq('norma_id', norma.id).then(r => { ctx.fatores = r.data || []; }));
        if (norma && car.classificacoes) tarefas.push(c().from('instrumentos_classificacoes').select('*').eq('norma_id', norma.id).order('ordem').then(r => { ctx.classificacoes = r.data || []; }));
        if (norma && car.itens) tarefas.push(c().from('instrumentos_itens').select('*').eq('norma_id', norma.id).order('numero').then(r => { ctx.itens = r.data || []; }));
        if (car.json) tarefas.push(lerJson(car.json).then(j => { ctx.json = j; }));
        await Promise.all(tarefas);
        if (ctx.itens.length) {
            const cod = {}; ctx.fatores.forEach(f => { cod[f.id] = f.fator_codigo; });
            ctx.itens.forEach(i => { if (i.fator_codigo == null) i.fator_codigo = cod[i.fator_id] || null; });
        }
        if (typeof def.extra === 'function') Object.assign(ctx, (await def.extra(c(), ctx)) || {});
        return def.calcular(ctx);
    }

    async function carregarEscalas(paciente, aplicacoes, porSigla, resultados) {
        const E = window.LaudoEscalas;
        if (!E) return;
        await Promise.all(Object.keys(porSigla).filter(s => !TABELAS[s] && E.leitor(s)).map(async sigla => {
            const def = E.leitor(sigla);
            const lista = porSigla[sigla].filter(a => a.corrigida || def.semCorrecao);
            for (const a of lista) {              // a mais recente com correção
                try {
                    const resumo = await lerEscala(a, def, paciente);
                    if (!resumo) { a.corrigida = false; continue; }
                    resumo.sigla = resumo.sigla || sigla;
                    resultados[sigla] = { tipo: 'escala', resumo, aplicacao_id: a.id, _aplicacao: a };
                    a.corrigida = true;
                    return;
                } catch (e) {
                    console.warn('[LaudoDados] escala', sigla, e);
                    resultados[sigla] = { tipo: 'escala', erro: `não consegui ler a correção (${e.message || e})`, aplicacao_id: a.id };
                    return;
                }
            }
        }));
        // Apelidos do Gerador: "SRS-2" → a forma corrigida (SRS-2-HET, SRS-2-AUTO…)
        Object.keys(E.APELIDOS).forEach(ap => {
            if (resultados[ap]) return;
            const achou = E.APELIDOS[ap].filter(s => resultados[s] && !resultados[s].erro);
            if (achou.length) resultados[ap] = Object.assign({}, resultados[achou[0]], { apelido_de: achou[0], formas: achou });
        });
    }

    /** Valor da conferência de uma escala: chave exata, sem acento, ou começo do nome. */
    function valorEscala(r, chave) {
        const conf = (r && r.resumo && r.resumo.conferencia) || {};
        if (conf[chave] != null) return conf[chave];
        const k = window.LaudoEscalas ? window.LaudoEscalas.util.chave(chave) : String(chave).toLowerCase();
        const norm = {};
        Object.keys(conf).forEach(x => { norm[window.LaudoEscalas ? window.LaudoEscalas.util.chave(x) : x.toLowerCase()] = conf[x]; });
        if (norm[k] != null) return norm[k];
        const cand = Object.keys(norm).filter(x => x.startsWith(k + '_') && !/_(t|percentil|p)$/.test(x) === !/_(t|percentil|p)$/.test(k));
        return cand.length === 1 ? norm[cand[0]] : undefined;
    }

    /** Valor do banco para uma chave da `conferencia` (Documento 1, §10). */
    const FORMAS = { hetero: ['-HET', '-H'], het: ['-HET', '-H'], auto: ['-AUTO', '-A'], pre: ['-PRE'], escf: ['-ESC-F'], escm: ['-ESC-M'] };
    function valor(sigla, chave, banco) {
        const res = (banco || {}).resultados || {};
        const r = res[sigla];
        if (!r) return undefined;
        // "SRS-2 total_hetero" → SRS-2-HET; "SRS-2 total" → autorrelato quando houver as duas formas
        const AP = window.LaudoEscalas && window.LaudoEscalas.APELIDOS[sigla];
        if (r.apelido_de && AP && AP.length > 1) {
            const m = /^(.*?)[_-](hetero|het|auto|pre|esc_?f|esc_?m)$/i.exec(chave);
            const ok = s => res[s] && !res[s].erro;
            let alvo = null, base = chave;
            if (m) { base = m[1]; const suf = FORMAS[m[2].toLowerCase().replace('_', '')] || []; alvo = AP.find(s => ok(s) && suf.some(x => s.endsWith(x))); }
            else alvo = AP.find(s => ok(s) && /-(AUTO|A)$/.test(s)) || r.apelido_de;
            if (alvo && ok(alvo)) return valorEscala(res[alvo], base);
            if (m) return undefined;
        }
        if (sigla === 'WAIS-III' || sigla === 'WISC-IV') {
            if (chave === 'ICG') return r._icg && r._icg.composto != null ? r._icg.composto : undefined;
            if (chave === 'ICC') return r._icc && r._icc.composto != null ? r._icc.composto : undefined;
            const k = chave === 'QIT' ? 'QI_TOTAL' : chave;
            const comp = (r.compostos || {})[k];
            if (comp && comp.composto != null) return comp.composto;
            const pond = (r.ponderados || {})[chave];
            return pond != null ? pond : undefined;
        }
        if (sigla === 'RAVLT' || sigla === 'FDT') {
            const m = (r.medidas || []).find(x => x.key === chave);
            return m ? m.raw : undefined;
        }
        if (sigla === 'BFP') {
            const v = (r.percentil_fatores || {})[chave];
            return v != null ? v : undefined;
        }
        if (r.tipo === 'escala') return valorEscala(r, chave);
        return undefined;
    }

    /** Resumo de uma linha (vista `resumo`) para qualquer teste calculado. */
    function resumo(sigla, banco) {
        const r = ((banco || {}).resultados || {})[sigla];
        if (!r) return null;
        if (sigla === 'WAIS-III' || sigla === 'WISC-IV') {
            const q = (r.compostos || {}).QI_TOTAL;
            const interp = r._interpretacao;
            if (interp && interp.qitInterpretavel === false && r._icg && r._icg.composto != null)
                return { principal: 'ICG', valor: r._icg.composto, classificacao: r._icg.classificacao || '' };
            return q ? { principal: 'QIT', valor: q.composto, classificacao: q.classificacao || '' } : null;
        }
        if (sigla === 'RAVLT') {
            const m = (r.medidas || []).find(x => x.key === 'Total');
            return m ? { principal: 'Escore Total', valor: m.raw, classificacao: (m.classificacao || {}).label || '' } : null;
        }
        if (sigla === 'FDT') {
            const m = (r.medidas || []).find(x => x.key === 'CI');
            return m ? { principal: 'Controle Inibitório', valor: m.raw, classificacao: (m.classificacao || {}).label || '' } : null;
        }
        if (r.tipo === 'escala') {
            const R = r.resumo || {};
            if (R.principal) return { principal: R.principal.rotulo || 'Escore', valor: R.principal.valor, classificacao: R.principal.classificacao || '' };
            const s0 = (R.subescalas || [])[0];
            return s0 ? { principal: s0.nome, valor: s0.valor, classificacao: s0.classificacao || '' } : null;
        }
        if (sigla === 'BFP') {
            const pf = r.percentil_fatores || {}, cf = r.classificacao_fatores || {};
            const k = Object.keys(pf).sort((a, b) => Math.abs((pf[b] || 50) - 50) - Math.abs((pf[a] || 50) - 50))[0];
            return k ? { principal: (window.LaudoCore.FATORES_BFP[k] || k), valor: 'P' + pf[k], classificacao: cf[k] || '' } : null;
        }
        return null;
    }

    window.LaudoDados = { TABELAS, carregar, valor, resumo, calculado, fotoAssinada, valorEscala };
})();

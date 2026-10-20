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
            .select('id, status, data_aplicacao, data_conclusao, created_at, instrumentos_catalogo!inner(sigla, nome_completo)')
            .eq('paciente_id', pacienteId)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return (data || []).map(a => ({
            id: a.id,
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

        return { paciente, aplicacoes, resultados, carregado_em: new Date().toISOString() };
    }

    /** Valor do banco para uma chave da `conferencia` (Documento 1, §10). */
    function valor(sigla, chave, banco) {
        const r = ((banco || {}).resultados || {})[sigla];
        if (!r) return undefined;
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
        if (sigla === 'BFP') {
            const pf = r.percentil_fatores || {}, cf = r.classificacao_fatores || {};
            const k = Object.keys(pf).sort((a, b) => Math.abs((pf[b] || 50) - 50) - Math.abs((pf[a] || 50) - 50))[0];
            return k ? { principal: (window.LaudoCore.FATORES_BFP[k] || k), valor: 'P' + pf[k], classificacao: cf[k] || '' } : null;
        }
        return null;
    }

    window.LaudoDados = { TABELAS, carregar, valor, resumo, calculado, fotoAssinada };
})();

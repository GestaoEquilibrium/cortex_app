/* ============================================================================
   CORTEX · Laudo Online — SNAPSHOT DA FINALIZAÇÃO  (frontend/shared/laudo/laudo_snapshot.js)
   ----------------------------------------------------------------------------
   Documento 1, §11 e Documento 3, §7 (sprint LO-4).
   Ao finalizar, o navegador do admin clínico monta o snapshot com o mesmo
   código que desenha a tela:
     - o documento resolvido (marcadores {nome}, {o|a}… já trocados; sem lixeira
       e sem marcas de conflito);
     - os dados usados (paciente, aplicações e resultados, com o ICG calculado);
     - os termos do glossário que o texto usa.
   Depois de finalizado, impressão e online leem só daqui: recorrigir um teste
   não muda o laudo.
     LaudoSnapshot.montar({ doc, banco, glossario, modelo, validacao }) → snapshot
     LaudoSnapshot.bancoDe(snapshot)                → banco no formato de LaudoDados
     LaudoSnapshot.comparar(bancoCongelado, bancoAtual) → [{ sigla, tipo, texto }]
   Expõe: window.LaudoSnapshot
   ============================================================================ */
(function () {
    'use strict';

    const C = () => window.LaudoCore;
    const FORMATO = 'cortex-laudo-snapshot';
    const VERSAO = 1;
    // Campos do paciente que o laudo usa. CPF e foto assinada (link temporário) não entram.
    const CAMPOS_PACIENTE = ['id', 'codigo', 'nome_completo', 'data_nascimento', 'sexo', 'escolaridade', 'foto_url',
        'medico_referencia', 'medico_crm', 'data_inicio_avaliacao'];
    // Campos que identificam o bloco e não são texto: não passam pela troca de marcadores.
    const NAO_TEXTO = new Set(['id', 'tipo', 'origem', 'sigla', 'vista', 'exibir', 'arquivo', 'chave', 'estilo', 'nivel',
        'rotulo', 'status', 'altura', 'formato', 'versao_formato', 'paciente_ref']);

    function clonar(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }

    /** Troca os marcadores em todos os textos do objeto (mantém {{balões}}, [[pendências]] e **negrito**). */
    function resolverTextos(o, ctx, chave) {
        if (typeof o === 'string') return NAO_TEXTO.has(chave) ? o : C().variaveis(o, ctx);
        if (Array.isArray(o)) return o.map(x => resolverTextos(x, ctx, chave));
        if (o && typeof o === 'object') {
            const out = {};
            Object.keys(o).forEach(k => { out[k] = resolverTextos(o[k], ctx, k); });
            return out;
        }
        return o;
    }

    /** Documento pronto para congelar: sem lixeira, sem marcas do editor, marcadores resolvidos. */
    function resolverDocumento(doc, banco) {
        const d = clonar(doc) || {};
        delete d.lixeira;
        d.meta = Object.assign({}, d.meta || {});
        if (!d.meta.data_emissao) d.meta.data_emissao = new Date().toISOString().slice(0, 10);
        C().cadaBloco(d, b => {
            delete b._conflito;
            delete b._fora_do_pacote;
        });
        const ctx = C().contexto(banco, d.meta);
        const r = resolverTextos(d, ctx, null);
        r.resolvido = true;
        return r;
    }

    function pacienteDe(p) {
        const out = {};
        CAMPOS_PACIENTE.forEach(k => { if (p && p[k] !== undefined) out[k] = p[k]; });
        return out;
    }

    /** Termos {{…}} que aparecem no texto, com a explicação do glossário daquele dia. */
    function termosUsados(doc, glossario) {
        const usados = {};
        const visto = s => (String(s).match(/\{\{([^{}|]+?)(?:\|[^{}]+?)?\}\}/g) || []).forEach(m => {
            const t = m.slice(2, -2).split('|')[0].trim().toLowerCase();
            if (glossario && glossario[t]) usados[t] = clonar(glossario[t]);
        });
        C().cadaBloco(doc, b => C().textos(b).forEach(visto));
        return usados;
    }

    /**
     * Monta o snapshot.
     * @param o { doc, banco, glossario, modelo:{id,versao}, validacao, aceites }
     */
    function montar(o) {
        const banco = o.banco || {};
        const documento = resolverDocumento(o.doc, banco);
        const resultados = {};
        Object.keys(banco.resultados || {}).forEach(sig => { resultados[sig] = clonar(banco.resultados[sig]); });
        const aplicacoes = (banco.aplicacoes || []).map(a => ({
            id: a.id, sigla: a.sigla, nome: a.nome, status: a.status, data_aplicacao: a.data_aplicacao, corrigida: !!a.corrigida
        }));
        return {
            formato: FORMATO,
            versao: VERSAO,
            gerado_em: new Date().toISOString(),
            modelo: o.modelo || null,
            documento,
            dados: {
                paciente: pacienteDe(banco.paciente),
                aplicacoes,
                resultados,
                lidos_em: banco.carregado_em || null
            },
            glossario: termosUsados(documento, o.glossario || {}),
            conferencias: ((o.validacao || {}).checks || []).map(c => ({ id: c.id, grupo: c.grupo, titulo: c.titulo, nivel: c.nivel, detalhe: c.detalhe }))
        };
    }

    /** Banco no formato de LaudoDados.carregar, lido do snapshot. */
    function bancoDe(snap) {
        const d = (snap && snap.dados) || {};
        return {
            paciente: clonar(d.paciente) || {},
            aplicacoes: clonar(d.aplicacoes) || [],
            resultados: clonar(d.resultados) || {},
            carregado_em: d.lidos_em || null,
            congelado: true
        };
    }

    /** JSON com chaves em ordem (o jsonb do banco reordena as chaves). */
    function estavel(v) {
        if (Array.isArray(v)) return '[' + v.map(estavel).join(',') + ']';
        if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + estavel(v[k])).join(',') + '}';
        return JSON.stringify(v === undefined ? null : v);
    }
    const IGNORAR = new Set(['created_at', 'updated_at']);
    function assinatura(r) {
        if (!r) return '';
        const o = {};
        Object.keys(r).forEach(k => { if (k.charAt(0) !== '_' && !IGNORAR.has(k)) o[k] = r[k]; });
        return estavel(o);
    }

    /**
     * O que mudou no banco depois da finalização. Só informa: o laudo finalizado não muda.
     * @returns [{ sigla, tipo: 'recorrigido'|'removido'|'novo', texto }]
     */
    function comparar(congelado, atual) {
        const a = ((congelado || {}).resultados) || {};
        const b = ((atual || {}).resultados) || {};
        const out = [];
        Object.keys(a).forEach(sig => {
            if (!b[sig]) { out.push({ sigla: sig, tipo: 'removido', texto: `${sig} não tem mais resultado corrigido no banco.` }); return; }
            const outraAplic = a[sig].aplicacao_id && b[sig].aplicacao_id && a[sig].aplicacao_id !== b[sig].aplicacao_id;
            if (outraAplic) out.push({ sigla: sig, tipo: 'recorrigido', texto: `${sig} tem uma aplicação mais nova corrigida depois da finalização.` });
            else if (assinatura(a[sig]) !== assinatura(b[sig])) out.push({ sigla: sig, tipo: 'recorrigido', texto: `${sig} foi recorrigido depois da finalização.` });
        });
        Object.keys(b).forEach(sig => {
            if (!a[sig]) out.push({ sigla: sig, tipo: 'novo', texto: `${sig} foi corrigido depois da finalização e não está neste laudo.` });
        });
        return out;
    }

    window.LaudoSnapshot = { FORMATO, VERSAO, montar, bancoDe, comparar, resolverDocumento, assinatura };
})();

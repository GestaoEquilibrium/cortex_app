/* ============================================================================
   CORTEX · Laudo Online — MONTAGEM  (frontend/shared/laudo/laudo_mesclar.js)
   ----------------------------------------------------------------------------
   Modelo da clínica + pacote do Gerador = documento do laudo (Documento 1, §2).
   O CORTEX percorre as seções do modelo; onde há `conteudo_gerador`, entram os
   blocos do pacote daquela seção. Depois da montagem o documento não depende
   mais do modelo.
   (A reimportação com conflitos, Documento 1 §8.3, entra no LO-3.)
   Expõe: window.LaudoMesclar
   ============================================================================ */
(function () {
    'use strict';

    const C = () => window.LaudoCore;

    function listaPt(a) { return a.length > 1 ? a.slice(0, -1).join(', ') + ' e ' + a[a.length - 1] : (a[0] || ''); }

    /** Texto da Seção 3 a partir da tabela de instrumentos (texto do motor 5.5). */
    function intro3(tabela) {
        const linhas = (tabela && tabela.linhas) || [];
        const comp = linhas.filter(l => l.status === 'complementar').map(l => l.sigla);
        const semPeso = linhas.filter(l => l.status === 'sem_peso').map(l => l.sigla);
        let t = 'A avaliação neuropsicológica de **{nome}** adotou uma abordagem abrangente e multimétodo, incluindo entrevista de anamnese, observação comportamental durante as sessões e aplicação de bateria neuropsicológica padronizada. Os testes psicológicos empregados possuem parecer favorável no **SATEPSI/CFP** e normas para a população brasileira, em conformidade com as **Resoluções CFP nº 06/2019 e nº 31/2022**.';
        if (comp.length) t += ` ${comp.length > 1 ? 'Os instrumentos' : 'O instrumento'} ${listaPt(comp)} ${comp.length > 1 ? 'foram empregados' : 'foi empregado'} como **fonte complementar** de rastreio (art. 4º, I, da Resolução CFP nº 31/2022), com respaldo em estudos brasileiros, e não ${comp.length > 1 ? 'sustentam' : 'sustenta'} isoladamente nenhuma conclusão deste laudo.`;
        if (semPeso.length) t += ` ${semPeso.length > 1 ? 'Os instrumentos' : 'O instrumento'} ${listaPt(semPeso)} ${semPeso.length > 1 ? 'têm' : 'tem'} o resultado descrito na Seção 5, sem uso como fundamento de hipótese diagnóstica (art. 12 da Resolução CFP nº 31/2022).`;
        const marcas = [];
        if (comp.length) marcas.push('† Fonte complementar de rastreio, sem atribuição de peso diagnóstico isolado (art. 4º, I, Res. CFP nº 31/2022).');
        if (semPeso.length) marcas.push('‡ Aplicado; resultado descrito sem uso como fundamento diagnóstico.');
        return { texto: t, nota: marcas.join('  ') };
    }

    function normativas(textos, meta) {
        const extras = (meta && meta.normas_extras) || [];
        const ano = s => { const m = /de (\d{4})|nº [\d.]+, de (\d{4})|(\d{4})\.\*\*/.exec(s); return Number((m && (m[1] || m[2] || m[3])) || 0); };
        const leis = (textos.normas || []).concat(['ciptea', 'ahsd'].filter(x => extras.includes(x)).map(x => (textos.normas_extra || {})[x]).filter(Boolean));
        const res = (extras.includes('etica') && (textos.normas_extra || {}).etica ? [textos.normas_extra.etica] : []).concat(textos.resolucoes || [])
            .sort((a, b) => ano(a) - ano(b));
        return leis.concat(res);
    }

    function eSoPendencia(v) { return /^\s*\[\[.*\]\]\s*$/.test(String(v || '')) || !String(v || '').trim(); }

    /**
     * @param {{ modelo: {id, versao, esqueleto}, pacote: object, banco: object }} entrada
     * @returns documento 2.0
     */
    function montar(entrada) {
        const core = C();
        const esq = core.clonar(entrada.modelo.esqueleto);
        const pac = core.clonar(entrada.pacote);
        const banco = entrada.banco || {};
        const p = banco.paciente || {};
        const textos = esq.textos || {};

        const doc = {
            formato: core.FORMATO, versao_formato: core.VERSAO_ATUAL, tipo: 'documento',
            origem: Object.assign({}, pac.origem || {}, {
                modelo_id: entrada.modelo.id || null, modelo_versao: entrada.modelo.versao || null, montado_em: new Date().toISOString()
            }),
            paciente_ref: pac.paciente_ref,
            meta: Object.assign({ data_emissao: null, validade: null, normas_extras: [], titulo_capa: null }, pac.meta || {}),
            inventario: pac.inventario || [],
            conferencia: pac.conferencia || {},
            textos: { capa_titulo: textos.capa_titulo, responsavel: textos.responsavel, registro: textos.registro, cidade: textos.cidade, link_convite: textos.link_convite },
            layout: esq.layout || { impressao: {}, online: {} },
            secoes: []
        };

        const doPacote = {};
        (pac.secoes || []).forEach(s => { doPacote[String(s.n)] = s; });
        const usadas = new Set();

        (esq.secoes || []).forEach(ms => {
            const n = String(ms.n);
            const ps = doPacote[n];
            const blocos = [];
            (ms.blocos || []).forEach(b => {
                if (b.tipo === 'conteudo_gerador') {
                    if (ps) { usadas.add(n); (ps.blocos || []).forEach(pb => blocos.push(core.completarBloco(core.clonar(pb), 'gerador'))); }
                    return;
                }
                blocos.push(core.completarBloco(core.clonar(b), b.origem || 'modelo'));
            });
            doc.secoes.push({
                id: ms.id || 's' + n, n, titulo: ms.titulo, oculta: !!ms.oculta, quebra_antes: !!ms.quebra_antes,
                capitulo_online: (ps && ps.capitulo_online) || ms.capitulo_online || null, blocos
            });
        });

        // Seções do pacote que o modelo não tem: entram no fim, na ordem do número.
        Object.keys(doPacote).filter(n => !usadas.has(n) && !doc.secoes.some(s => s.n === n))
            .sort((a, b) => Number(a) - Number(b)).forEach(n => {
                const ps = doPacote[n];
                const def = core.SECOES.find(s => s[0] === n);
                doc.secoes.push({
                    id: ps.id || 's' + n, n, titulo: ps.titulo || (def ? def[1] : 'SEÇÃO ' + n), oculta: false, quebra_antes: false,
                    capitulo_online: ps.capitulo_online || (def ? def[2] : null),
                    blocos: (ps.blocos || []).map(pb => core.completarBloco(core.clonar(pb), 'gerador'))
                });
            });

        const secao = n => doc.secoes.find(s => s.n === String(n));

        // Seção 1 — médico solicitante do cadastro, se o pacote não trouxe.
        const s1 = secao(1);
        if (s1) {
            let campos = s1.blocos.find(b => b.tipo === 'campos');
            if (!campos) {
                campos = core.completarBloco({ id: 's1.abre.x01', tipo: 'campos', linhas: [] }, 'cortex');
                s1.blocos.splice(Math.min(1, s1.blocos.length), 0, campos);
            }
            const medico = [p.medico_referencia, p.medico_crm ? 'CRM ' + p.medico_crm : ''].filter(Boolean).join(' — ');
            const linha = (campos.linhas || []).find(l => /m[ée]dico solicitante/i.test(l.rotulo || ''));
            if (medico) {
                if (!linha) campos.linhas.unshift({ rotulo: 'Médico solicitante', valor: medico, origem: 'cortex' });
                else if (eSoPendencia(linha.valor)) { linha.valor = medico; linha.origem = 'cortex'; }
            }
        }

        // Seção 3 — texto de abertura e marcas † ‡ a partir da tabela de instrumentos.
        const s3 = secao(3);
        if (s3) {
            const tab = s3.blocos.find(b => b.tipo === 'tabela_instrumentos');
            const intro = intro3(tab);
            const bi = s3.blocos.find(b => b.id === 'm.intro_3');
            if (bi && !bi.texto) bi.texto = intro.texto;
            if (intro.nota && tab && !s3.blocos.some(b => b.id === 'm.nota_instrumentos')) {
                s3.blocos.splice(s3.blocos.indexOf(tab) + 1, 0,
                    core.completarBloco({ id: 'm.nota_instrumentos', tipo: 'nota', texto: intro.nota }, 'modelo'));
            }
        }

        // Seção 11 — validade do pacote.
        const bv = (secao(11) || { blocos: [] }).blocos.find(b => b.id === 'm.validade');
        if (bv) bv.texto = String(bv.texto || '').replace('__VALIDADE__', doc.meta.validade ? doc.meta.validade : '[[prazo de validade a definir]]');

        // Seção 13 — referências normativas com os extras do pacote.
        const bn = (secao(13) || { blocos: [] }).blocos.find(b => b.id === 'm.normativas');
        if (bn && (!bn.itens || !bn.itens.length)) bn.itens = normativas(textos, doc.meta);

        core.garantirIds(doc);
        return doc;
    }

    // ── Comparação de conteúdo (sem layout e sem marcas internas) ────────────
    const CHAVES_LAYOUT = ['id', 'origem', 'exibir', 'oculto', 'quebra_antes', 'manter_com_proximo', 'dividir_tabela', 'complementos', 'nota_interna'];
    function conteudo(b) {
        if (!b) return null;
        const o = {};
        Object.keys(b).sort().forEach(k => { if (!CHAVES_LAYOUT.includes(k) && k[0] !== '_') o[k] = b[k]; });
        return JSON.stringify(o);
    }
    function mudou(a, b) { return conteudo(a) !== conteudo(b); }

    function indexar(doc) {
        const m = {};
        (doc.secoes || []).forEach(s => (s.blocos || []).forEach((b, i) => { m[b.id] = { b, sec: s, i }; }));
        return m;
    }

    /**
     * Reimportação de um pacote revisado (Documento 1, §8.3).
     *   atual    → documento com as edições de quem revisa
     *   original → documento_original (baseline da última importação)
     * Devolve { doc, original, resumo } — `original` é a nova baseline.
     */
    function reimportar(entrada) {
        const core = C();
        const doc = core.clonar(entrada.atual);
        const orig = indexar(entrada.original || { secoes: [] });
        const novoDoc = montar({ modelo: entrada.modelo, pacote: entrada.pacote, banco: entrada.banco });
        const novo = indexar(novoDoc);
        const agora = new Date().toISOString();
        const resumo = { substituidos: [], conflitos: [], removidos: [], mantidos_fora: [], novos: [] };
        doc.lixeira = doc.lixeira || [];
        const naLixeira = new Set(doc.lixeira.map(x => x.bloco && x.bloco.id));

        // 1. Blocos do Gerador que já existem no laudo
        (doc.secoes || []).forEach(sec => {
            for (let i = 0; i < (sec.blocos || []).length; i++) {
                const b = sec.blocos[i];
                if (b.origem !== 'gerador') continue;
                const o = orig[b.id] ? orig[b.id].b : null;
                const n = novo[b.id] ? novo[b.id].b : null;
                const editado = o ? mudou(b, o) : true;
                if (n) {
                    const geradorMudou = o ? mudou(n, o) : mudou(n, b);
                    if (!editado) {
                        if (geradorMudou) {
                            const layout = {}; CHAVES_LAYOUT.forEach(k => { if (k in b) layout[k] = b[k]; });
                            sec.blocos[i] = Object.assign(core.clonar(n), layout);
                            resumo.substituidos.push(b.id);
                        }
                    } else if (geradorMudou && mudou(n, b)) {
                        b._conflito = { novo: core.clonar(n), em: agora };
                        resumo.conflitos.push(b.id);
                    }
                } else if (!editado) {
                    doc.lixeira.push({ bloco: b, secao_id: sec.id, posicao: i, apagado_em: agora, motivo: 'saiu_do_pacote' });
                    sec.blocos.splice(i, 1); i--;
                    resumo.removidos.push(b.id);
                } else {
                    b._fora_do_pacote = true;
                    resumo.mantidos_fora.push(b.id);
                }
            }
        });

        // 2. Blocos novos do pacote: entram logo após o bloco que vinha antes deles no pacote
        const atualIdx = () => indexar(doc);
        (novoDoc.secoes || []).forEach(ns => {
            (ns.blocos || []).forEach((nb, k) => {
                if (nb.origem !== 'gerador') return;
                let idx = atualIdx();
                if (idx[nb.id] || naLixeira.has(nb.id)) return;
                let sec = (doc.secoes || []).find(s => s.id === ns.id || s.n === ns.n);
                if (!sec) {
                    sec = { id: ns.id, n: ns.n, titulo: ns.titulo, oculta: false, quebra_antes: false, capitulo_online: ns.capitulo_online, blocos: [] };
                    doc.secoes.push(sec);
                }
                let pos = -1;
                for (let j = k - 1; j >= 0; j--) {
                    const ant = ns.blocos[j];
                    if (idx[ant.id] && idx[ant.id].sec === sec) { pos = idx[ant.id].i + 1; break; }
                }
                if (pos < 0) {
                    const primeiroGerador = sec.blocos.findIndex(b => b.origem === 'gerador');
                    pos = primeiroGerador >= 0 ? primeiroGerador : sec.blocos.length;
                }
                sec.blocos.splice(pos, 0, core.clonar(nb));
                resumo.novos.push(nb.id);
            });
        });

        // 3. Dados gerais do pacote novo
        doc.inventario = novoDoc.inventario;
        doc.conferencia = novoDoc.conferencia;
        doc.meta = Object.assign({}, doc.meta || {}, novoDoc.meta || {});
        doc.origem = Object.assign({}, doc.origem || {}, { motor: (novoDoc.origem || {}).motor, gerado_em: (novoDoc.origem || {}).gerado_em, reimportado_em: agora });
        core.garantirIds(doc);
        return { doc, original: novoDoc, resumo };
    }

    window.LaudoMesclar = { montar, intro3, normativas, reimportar, conteudo, mudou, CHAVES_LAYOUT };
})();

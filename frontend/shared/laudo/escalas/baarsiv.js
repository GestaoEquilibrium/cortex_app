/* ============================================================================
   CORTEX · Laudo Online — leitor BAARS-IV
   (frontend/shared/laudo/escalas/baarsiv.js) · sprint LO-6
   ----------------------------------------------------------------------------
   Mesma conta de frontend/correcao/baarsiv/baarsiv_resultado.js
   (calcularResultados + classificarSubescala + derivarSubtipo), sem tocar na tela.

   BAARS-IV (Barkley, 2011) · autoavaliação adulto · 27 itens 0-3.
   Mapa fixo de itens: DES 1-9 · HIP 10-18 · SCT 19-27.
   Resposta ausente ou não numérica vale 0 (igual à tela).
   Por subescala conta SINTOMAS SIGNIFICATIVOS (resposta ≥ 2), máx 9,
   e soma o escore bruto (máx 27, só informativo).
   Cortes: DES ≥ 5 · HIP ≥ 4 → POSITIVO; SCT ≥ 5 → CLINICAMENTE RELEVANTE (auxiliar).
   Subtipo (só DES e HIP): TDAH-C · TDAH-PI · TDAH-HI · NEGATIVO.
   Não há escore total: o destaque da tela é o código do subtipo (texto).
   tom: POSITIVO → mod (rastreio positivo, como os demais leitores) ·
        CLINICAMENTE RELEVANTE (SCT, auxiliar) → leve · NEGATIVO → ok.
   ============================================================================ */
(function () {
    'use strict';
    if (!window.LaudoEscalas) { console.warn('[baarsiv] escalas_base.js não carregado'); return; }
    const U = window.LaudoEscalas.util;

    // ---- copiado de baarsiv_resultado.js ------------------------------------
    const SUBESCALAS_INFO = {
        'DES': { label: 'Desatenção', cutoff: 5, max_sintomas: 9 },
        'HIP': { label: 'Hiperatividade/Impulsividade', cutoff: 4, max_sintomas: 9 },
        'SCT': { label: 'SCT (Sluggish Cognitive Tempo)', cutoff: 5, max_sintomas: 9 }
    };
    const SUBESCALAS_ORDEM = ['DES', 'HIP', 'SCT'];
    const ITEM_TO_GRUPO = {"1": "DES", "2": "DES", "3": "DES", "4": "DES", "5": "DES", "6": "DES", "7": "DES", "8": "DES", "9": "DES", "10": "HIP", "11": "HIP", "12": "HIP", "13": "HIP", "14": "HIP", "15": "HIP", "16": "HIP", "17": "HIP", "18": "HIP", "19": "SCT", "20": "SCT", "21": "SCT", "22": "SCT", "23": "SCT", "24": "SCT", "25": "SCT", "26": "SCT", "27": "SCT"};

    function classificarSubescala(code, sintomas) {
        const info = SUBESCALAS_INFO[code];
        const positivo = sintomas >= info.cutoff;
        if (code === 'SCT') {
            return positivo
                ? { label: 'CLINICAMENTE RELEVANTE', slug: 'relevante', positivo: true }
                : { label: 'NEGATIVO', slug: 'negativo', positivo: false };
        }
        return positivo
            ? { label: 'POSITIVO', slug: 'positivo', positivo: true }
            : { label: 'NEGATIVO', slug: 'negativo', positivo: false };
    }

    function derivarSubtipo(desPos, hipPos) {
        if (desPos && hipPos) {
            return {
                codigo: 'TDAH-C',
                titulo: 'Apresentação Combinada (TDAH-C)',
                desc: 'Sintomas significativos de Desatenção E de Hiperatividade/Impulsividade ultrapassam os pontos de corte. Configuração típica para investigação diagnóstica de TDAH com apresentação combinada (DSM-5 / CID-11: 6A05).',
                positivo: true
            };
        }
        if (desPos) {
            return {
                codigo: 'TDAH-PI',
                titulo: 'Predominantemente Desatenta (TDAH-PI)',
                desc: 'Sintomas significativos de Desatenção ultrapassam o ponto de corte (≥5), mas Hiperatividade/Impulsividade abaixo do limiar (<4). Compatível com apresentação predominantemente desatenta — investigação diagnóstica recomendada.',
                positivo: true
            };
        }
        if (hipPos) {
            return {
                codigo: 'TDAH-HI',
                titulo: 'Predominantemente Hiperativa/Impulsiva (TDAH-HI)',
                desc: 'Sintomas significativos de Hiperatividade/Impulsividade ultrapassam o ponto de corte (≥4), mas Desatenção abaixo do limiar (<5). Compatível com apresentação predominantemente hiperativa/impulsiva — investigação diagnóstica recomendada.',
                positivo: true
            };
        }
        return {
            codigo: 'NEGATIVO',
            titulo: 'Abaixo dos pontos de corte clínicos',
            desc: 'As contagens de sintomas significativos em ambas as subescalas (Desatenção <5; Hiperatividade <4) ficam abaixo dos pontos de corte clínicos do BAARS-IV (Barkley, 2011) para autoavaliação. Este resultado, isoladamente, não sugere perfil de TDAH em nível clinicamente significativo.',
            positivo: false
        };
    }

    function calcularResultados(respostas) {
        const valores = {};
        for (let n = 1; n <= 27; n++) {
            const r = respostas[n];
            valores[n] = (r != null && !isNaN(r)) ? parseInt(r, 10) : 0;
        }
        const sintomas = { DES: 0, HIP: 0, SCT: 0 };
        const escoreBruto = { DES: 0, HIP: 0, SCT: 0 };
        for (const [itemStr, code] of Object.entries(ITEM_TO_GRUPO)) {
            const n = parseInt(itemStr, 10);
            const v = valores[n];
            escoreBruto[code] += v;
            if (v >= 2) sintomas[code]++;
        }
        const classifs = {};
        for (const code of SUBESCALAS_ORDEM) classifs[code] = classificarSubescala(code, sintomas[code]);
        const subtipo = derivarSubtipo(classifs.DES.positivo, classifs.HIP.positivo);
        return { sintomas, escoreBruto, classifs, subtipo };
    }
    // -------------------------------------------------------------------------

    const TOM_SLUG = { positivo: 'mod', relevante: 'leve', negativo: 'ok' };
    const APELIDOS_CONF = { HIP: ['hiperatividade'], SCT: ['sct', 'sluggish_cognitive_tempo'] };

    function zonas(code) {
        const info = SUBESCALAS_INFO[code];
        const pos = code === 'SCT' ? { rotulo: 'CLINICAMENTE RELEVANTE', tom: 'leve' } : { rotulo: 'POSITIVO', tom: 'mod' };
        return [
            { ate: info.cutoff - 1, rotulo: 'NEGATIVO', tom: 'ok' },
            { ate: info.max_sintomas, rotulo: pos.rotulo, tom: pos.tom }
        ];
    }

    window.LaudoEscalas.registrar({
        siglas: ['BAARS-IV'],
        carregar: { fatores: false, itens: false, classificacoes: false, json: null },
        calcular(ctx) {
            if (!ctx.correcao) throw new Error('Nenhuma correção encontrada');
            if (!ctx.norma) throw new Error('Norma BAARS-IV não cadastrada');   // a tela também exige
            const s = calcularResultados(ctx.respostas || {});

            const conferencia = {};
            const subescalas = SUBESCALAS_ORDEM.map(code => {
                const info = SUBESCALAS_INFO[code];
                const cl = s.classifs[code];
                const valor = s.sintomas[code];
                const bruto = s.escoreBruto[code];
                [code, U.chave(info.label)].concat(APELIDOS_CONF[code] || []).forEach(k => {
                    conferencia[k] = valor;
                    conferencia[k + '_bruto'] = bruto;
                });
                return {
                    codigo: code, nome: info.label, valor, max: info.max_sintomas,
                    classificacao: cl.label, tom: TOM_SLUG[cl.slug],
                    zonas: zonas(code),
                    extra: `Sintomas significativos · corte ≥${info.cutoff} · escore bruto ${bruto} / 27`
                };
            });

            const st = s.subtipo;
            return {
                sigla: ctx.sigla || 'BAARS-IV',
                nome: 'Escala de Avaliação de Barkley para TDAH em Adultos (BAARS-IV)',
                respondente: 'Autorrelato',
                norma: 'Barkley (2011) · cortes DES ≥5, HIP ≥4 sintomas significativos',
                principal: {
                    rotulo: 'Subtipo', valor: st.codigo, max: null, sufixo: '',
                    classificacao: st.titulo, tom: st.positivo ? 'mod' : 'ok'
                },
                regua: null,           // as réguas são por subescala
                subescalas,
                linhas: [
                    ['Subtipo derivado', st.titulo],
                    ['Sintomas significativos (DES · HIP · SCT)', `${s.sintomas.DES} · ${s.sintomas.HIP} · ${s.sintomas.SCT}`]
                ],
                indicacao: st.desc,
                conferencia
            };
        }
    });
})();

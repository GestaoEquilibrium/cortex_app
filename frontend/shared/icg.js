// ============================================================================
// CORTEX_APP — icg.js
// ----------------------------------------------------------------------------
// Cálculo do ICG (Índice de Capacidade Geral / GAI) e do ICC (Índice de
// Competência Cognitiva / CPI), por lookup nas tabelas oficiais.
//
// Como funciona: soma-se os ponderados dos 6 subtestes core (ou 4, no ICC) e
// procura-se essa "Soma EP" na tabela do instrumento, que devolve composto,
// percentil, IC 95% e classificação. Nada é estimado por fórmula — é conversão
// fechada, exatamente como no manual.
//
// Subtestes que entram (suplementares NÃO entram):
//   WISC-IV ICG : ICV = Semelhanças + Vocabulário + Compreensão
//                 IRP = Cubos + Conceitos Figurativos + Raciocínio Matricial
//   WAIS-III ICG: ICV = Vocabulário + Semelhanças + Informação
//                 IOP = Cubos + Raciocínio Matricial + Completar Figuras
//   WISC-IV ICC : IMO = Dígitos + Seq. de Números e Letras
//                 IVP = Código + Procurar Símbolos
//
// Regra dos 23 pontos (interpretabilidade):
//   · QIT interpretável só se (maior índice − menor) < 23; senão, ancore no ICG.
//   · ICG válido como estimativa da capacidade geral só se (ICV − IRP/IOP) < 23;
//     senão, descreva por índices, subtestes ou clusters.
//   O limiar de ~15 pontos é da análise par-a-par e não decide interpretabilidade.
//
// API: window.CortexICG
//   .calcularICG('WISC'|'WAIS', ponderados)  -> objeto ou null
//   .calcularICC(ponderados)                 -> objeto ou null  (só WISC-IV)
//   .NOTA_NORMA                              -> texto obrigatório no laudo
// ============================================================================

window.CortexICG = (function () {
    'use strict';

    const T = () => window.CortexICGTabelas;

    const CORE = {
        WISC: {
            tabela: 'WISC_GAI',
            verbal:     { rotulo: 'ICV', codigos: ['SM', 'VC', 'CO'] },
            perceptual: { rotulo: 'IRP', codigos: ['CB', 'CN', 'RM'] }
        },
        WAIS: {
            tabela: 'WAIS_GAI',
            verbal:     { rotulo: 'ICV', codigos: ['VC', 'SM', 'IN'] },
            perceptual: { rotulo: 'IOP', codigos: ['CB', 'RM', 'CF'] }
        }
    };

    const CORE_ICC = {
        tabela: 'WISC_CPI',
        memoria:    { rotulo: 'IMO', codigos: ['DG', 'SNL'] },
        velocidade: { rotulo: 'IVP', codigos: ['CD', 'PS'] }
    };

    const LIMIAR_23 = 23;

    const NOTA_NORMA =
        'ICG convertido pela tabela oficial (Raiford et al., 2005 para WISC-IV; ' +
        'Tulsky et al., 2001 para WAIS-III); ponderados pela norma brasileira. ' +
        'Não existe tabela ICG normatizada para a população brasileira.';

    /** Soma os ponderados de um conjunto de códigos. Devolve null se faltar algum. */
    function somar(ponderados, codigos) {
        let soma = 0;
        const faltando = [];
        for (const cod of codigos) {
            const v = ponderados?.[cod];
            if (v === null || v === undefined || v === '' || Number.isNaN(Number(v))) {
                faltando.push(cod);
            } else {
                soma += Number(v);
            }
        }
        return faltando.length ? { faltando } : { soma };
    }

    function consultar(nomeTabela, somaEP) {
        const tab = T()?.[nomeTabela];
        if (!tab) return null;
        const linha = tab[somaEP];
        if (!linha) return null;
        return {
            composto: linha[0],
            percentil: linha[1],
            ic95: [linha[2], linha[3]],
            classificacao: linha[4]
        };
    }

    /**
     * ICG. Recebe o mapa de ponderados por código de subteste.
     * Devolve null quando falta subteste core — nunca estima o que falta.
     */
    function calcularICG(instrumento, ponderados) {
        const cfg = CORE[instrumento];
        if (!cfg || !T()) return null;

        const v = somar(ponderados, cfg.verbal.codigos);
        const p = somar(ponderados, cfg.perceptual.codigos);

        if (v.faltando || p.faltando) {
            return {
                incompleto: true,
                faltando: [...(v.faltando || []), ...(p.faltando || [])]
            };
        }

        const somaEP = v.soma + p.soma;
        const r = consultar(cfg.tabela, somaEP);
        if (!r) return { foraDaTabela: true, somaEP };

        // Discrepância verbal × perceptual decide se o ICG pode ser lido
        // como estimativa da capacidade geral.
        const dif = Math.abs(v.soma - p.soma);

        return {
            somaEP,
            somaVerbal: v.soma,
            somaPerceptual: p.soma,
            rotuloVerbal: cfg.verbal.rotulo,
            rotuloPerceptual: cfg.perceptual.rotulo,
            codigosVerbal: cfg.verbal.codigos,
            codigosPerceptual: cfg.perceptual.codigos,
            ...r
        };
    }

    /** ICC — só WISC-IV. Mesma lógica, quatro subtestes. */
    function calcularICC(ponderados) {
        if (!T()) return null;

        const m = somar(ponderados, CORE_ICC.memoria.codigos);
        const v = somar(ponderados, CORE_ICC.velocidade.codigos);

        if (m.faltando || v.faltando) {
            return {
                incompleto: true,
                faltando: [...(m.faltando || []), ...(v.faltando || [])]
            };
        }

        const somaEP = m.soma + v.soma;
        const r = consultar(CORE_ICC.tabela, somaEP);
        if (!r) return { foraDaTabela: true, somaEP };

        return {
            somaEP,
            somaMemoria: m.soma,
            somaVelocidade: v.soma,
            codigosMemoria: CORE_ICC.memoria.codigos,
            codigosVelocidade: CORE_ICC.velocidade.codigos,
            ...r
        };
    }

    /**
     * Regra dos 23 pontos sobre os COMPOSTOS dos índices (não sobre as somas).
     * Recebe { ICV, IOP|IRP, IMO, IVP } já convertidos.
     */
    function avaliarInterpretabilidade(compostos, rotuloPerceptual) {
        const valores = Object.values(compostos || {})
            .map(Number).filter(n => !Number.isNaN(n));
        if (valores.length < 2) return null;

        const amplitude = Math.max(...valores) - Math.min(...valores);
        const icv = Number(compostos.ICV);
        const perc = Number(compostos[rotuloPerceptual]);
        const difVP = (!Number.isNaN(icv) && !Number.isNaN(perc))
            ? Math.abs(icv - perc) : null;

        return {
            amplitude,
            qitInterpretavel: amplitude < LIMIAR_23,
            difVerbalPerceptual: difVP,
            icgValido: difVP === null ? null : difVP < LIMIAR_23,
            limiar: LIMIAR_23
        };
    }

    return { calcularICG, calcularICC, avaliarInterpretabilidade, NOTA_NORMA, LIMIAR_23 };
})();

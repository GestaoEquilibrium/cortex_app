// ============================================================================
// Supabase Edge Function: wisc-iv-calcular
// ============================================================================
// Calcula resultado completo de uma aplicação WISC-IV.
//
// FLUXO (idêntico ao wais-calcular):
//   1. Front chama POST /functions/v1/wisc-iv-calcular { aplicacao_id }
//   2. Função lê paciente (data_nascimento) + brutos (de wisciv_brutos)
//   3. Calcula:
//        - Idade na data da aplicação (anos, meses, total em meses)
//        - Faixa etária normativa (33 faixas: 6:0-6:3 ... 16:8-16:11)
//        - Bruto → Ponderado por subteste (rawNorms)
//        - Soma por escala (4 índices + QI Total)
//        - Composto (compNorms) com IC90 / IC95 / percentil
//        - Discrepâncias significativas entre 6 pares de índices
//        - Pontos fortes / fracos (subtestes ≥3 do média)
//   4. Salva em wisciv_resultados (UPSERT)
//   5. Atualiza aplicacoes_instrumento.status = 'corrigido'
//
// PORTADO DE: equilibrium-api/src/services/wiscService.js
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

import rawNorms from "./normas-wisciv.json" with { type: "json" };
import compNorms from "./compostos-wisciv.json" with { type: "json" };

// ────────────────────────────────────────────────────────────────────────────
// CORS
// ────────────────────────────────────────────────────────────────────────────

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ────────────────────────────────────────────────────────────────────────────
// Constantes do WISC-IV
// ────────────────────────────────────────────────────────────────────────────

interface Subteste {
    nome: string;
    codigo: string;
}

const SUBTESTES: Subteste[] = [
    { nome: "Cubos",                    codigo: "CB"  },
    { nome: "Semelhanças",              codigo: "SM"  },
    { nome: "Dígitos",                  codigo: "DG"  },
    { nome: "Conceitos Figurativos",    codigo: "CN"  },
    { nome: "Código",                   codigo: "CD"  },
    { nome: "Vocabulário",              codigo: "VC"  },
    { nome: "Seq. Núm. e Letras",       codigo: "SNL" },
    { nome: "Raciocínio Matricial",     codigo: "RM"  },
    { nome: "Compreensão",              codigo: "CO"  },
    { nome: "Procurar Símbolos",        codigo: "PS"  },
    { nome: "Completar Figuras",        codigo: "CF"  },
    { nome: "Cancelamento",             codigo: "CA"  },
    { nome: "Informação",               codigo: "IN"  },
    { nome: "Aritmética",               codigo: "AR"  },
    { nome: "Raciocínio com Palavras",  codigo: "RP"  },
];

// Composição das escalas (Manual WISC-IV BR, Wechsler 2013)
const WISC_SCALES: Record<string, string[]> = {
    ICV:      ["SM", "VC", "CO"],                                          // Compreensão Verbal
    IOP:      ["CB", "CN", "RM"],                                          // Organização Perceptual
    IMO:      ["DG", "SNL"],                                               // Memória Operacional
    IVP:      ["CD", "PS"],                                                // Velocidade Proc.
    QI_TOTAL: ["CB", "SM", "DG", "CN", "CD", "VC", "SNL", "RM", "CO", "PS"], // QI Total (10 principais)
};

// Valores críticos para discrepâncias entre índices (p < .05)
// Tabela B.2 — Manual Técnico WISC-IV BR (Wechsler, 2013)
const VALORES_CRITICOS: Record<string, number> = {
    "ICV × IOP": 11.45,
    "ICV × IMO": 12.81,
    "ICV × IVP": 13.27,
    "IOP × IMO": 12.83,
    "IOP × IVP": 13.27,
    "IMO × IVP": 14.06,
};

// ────────────────────────────────────────────────────────────────────────────
// Funções de cálculo (port do wiscService.js)
// ────────────────────────────────────────────────────────────────────────────

interface Idade {
    anos: number;
    meses: number;
    totalMeses: number;
}

function calcularIdade(nascISO: string, aplISO: string): Idade | null {
    if (!nascISO || !aplISO) return null;
    const n = new Date(nascISO);
    const a = new Date(aplISO);
    if (isNaN(n.getTime()) || isNaN(a.getTime()) || a < n) return null;

    let anos = a.getFullYear() - n.getFullYear();
    let meses = a.getMonth() - n.getMonth();
    if (a.getDate() < n.getDate()) meses -= 1;
    if (meses < 0) { anos -= 1; meses += 12; }
    return { anos, meses, totalMeses: anos * 12 + meses };
}

function faixaEtariaWISC(idade: Idade | null): string | null {
    if (!idade) return null;
    const total = idade.totalMeses;
    const norms = rawNorms as Record<string, any>;

    for (const faixa of Object.keys(norms)) {
        // Faixas vêm como "6:0-6:3", "10:4-10:7" etc
        const numeros = faixa.match(/\d+/g);
        if (!numeros || numeros.length < 4) continue;

        const minM = Number(numeros[0]) * 12 + Number(numeros[1]);
        const maxM = Number(numeros[2]) * 12 + Number(numeros[3]);

        if (total >= minM && total <= maxM) {
            return faixa;
        }
    }
    return null;
}

function rawToScaledWISC(faixa: string, codigo: string, bruto: number): number | null {
    const norms = rawNorms as Record<string, any>;
    const faixaData = norms[faixa];
    if (!faixaData?.subtestes) return null;

    const regras = faixaData.subtestes[codigo];
    if (!Array.isArray(regras)) return null;

    for (const r of regras) {
        if (r.min != null && r.max != null && bruto >= r.min && bruto <= r.max) {
            return Number(r.ponderado);
        }
    }
    return null;
}

interface CompostoInfo {
    composto: number;
    percentil: string;
    ic90: [number, number] | null;
    ic95: [number, number] | null;
    classificacao?: string;
}

function parseIC(str: any): [number, number] | null {
    if (!str) return null;
    const parts = String(str).split("-");
    return parts.length === 2 ? [Number(parts[0]), Number(parts[1])] : null;
}

function sumToCompositeWISC(scaleType: string, somaValor: number): CompostoInfo | null {
    const norms = compNorms as Record<string, any[]>;
    const list = norms[scaleType];
    if (!Array.isArray(list)) return null;

    const row = list.find((r: any) => r.soma === somaValor);
    if (!row) return null;

    return {
        composto:  row.composto,
        percentil: String(row.percentil),
        ic90:      parseIC(row.ic90),
        ic95:      parseIC(row.ic95),
    };
}

interface SomaEscala {
    soma: number;
    usados: string[];
    faltando: string[];
    usadosCount: number;
    total: number;
}

function somarEscala(pondByCode: Record<string, number>, codigos: string[]): SomaEscala {
    let soma = 0;
    const usados: string[] = [];
    const faltando: string[] = [];

    for (const c of codigos) {
        const v = pondByCode[c];
        if (typeof v === "number" && !Number.isNaN(v)) {
            soma += v;
            usados.push(c);
        } else {
            faltando.push(c);
        }
    }

    return { soma, usados, faltando, usadosCount: usados.length, total: codigos.length };
}

function classificarPonderado(p: number): string {
    if (p <= 4)  return "Muito Inferior";
    if (p <= 6)  return "Inferior";
    if (p <= 8)  return "Médio Inferior";
    if (p <= 11) return "Médio";
    if (p <= 13) return "Médio Superior";
    if (p <= 15) return "Superior";
    return "Muito Superior";
}

function classByComposite(score: number): string {
    if (score >= 130) return "Muito Superior";
    if (score >= 120) return "Superior";
    if (score >= 110) return "Médio Superior";
    if (score >= 90)  return "Médio";
    if (score >= 80)  return "Médio Inferior";
    if (score >= 70)  return "Limítrofe";
    return "Extremamente Baixo";
}

interface DiscrepanciaPar {
    par: string;
    va: number;
    vb: number;
    diff: number;
    vc: number;
    sig: boolean;
}

function calcularDiscrepancias(compostos: Record<string, CompostoInfo | null>): DiscrepanciaPar[] {
    const pares = [
        { par: "ICV × IOP", a: "ICV", b: "IOP" },
        { par: "ICV × IMO", a: "ICV", b: "IMO" },
        { par: "ICV × IVP", a: "ICV", b: "IVP" },
        { par: "IOP × IMO", a: "IOP", b: "IMO" },
        { par: "IOP × IVP", a: "IOP", b: "IVP" },
        { par: "IMO × IVP", a: "IMO", b: "IVP" },
    ];

    const resultado: DiscrepanciaPar[] = [];
    for (const p of pares) {
        const va = compostos?.[p.a]?.composto;
        const vb = compostos?.[p.b]?.composto;
        if (va == null || vb == null) continue;
        const diff = va - vb;
        const vc = VALORES_CRITICOS[p.par] || 99;
        resultado.push({ par: p.par, va, vb, diff, vc, sig: Math.abs(diff) >= vc });
    }
    return resultado;
}

interface PontoForteFraco {
    cod: string;
    nome: string;
    p: number;
    desvio: number;
}

interface FortesFracos {
    media: number;
    fortes: PontoForteFraco[];
    fracos: PontoForteFraco[];
}

function calcularPontosFortesFracos(resultados: Record<string, any>): FortesFracos {
    const ponderados: { cod: string; nome: string; p: number }[] = [];
    for (const [cod, r] of Object.entries(resultados)) {
        if (r.ponderado != null) {
            ponderados.push({ cod, nome: r.nome, p: r.ponderado });
        }
    }
    if (ponderados.length === 0) return { media: 0, fortes: [], fracos: [] };

    const media = ponderados.reduce((s, x) => s + x.p, 0) / ponderados.length;
    const fortes = ponderados
        .filter(x => x.p - media >= 3)
        .map(x => ({ ...x, desvio: x.p - media }))
        .sort((a, b) => b.p - a.p);
    const fracos = ponderados
        .filter(x => media - x.p >= 3)
        .map(x => ({ ...x, desvio: x.p - media }))
        .sort((a, b) => a.p - b.p);

    return { media: Number(media.toFixed(2)), fortes, fracos };
}

// ────────────────────────────────────────────────────────────────────────────
// Função principal
// ────────────────────────────────────────────────────────────────────────────

interface CalcularInput {
    nasc: string;
    apl: string;
    brutos: Record<string, number>;
}

function calcularWISC(dados: CalcularInput) {
    const { nasc, apl, brutos } = dados;

    const idade = calcularIdade(nasc, apl);
    if (!idade) {
        throw new Error("Datas de nascimento ou aplicação inválidas.");
    }

    const faixa = faixaEtariaWISC(idade);
    if (!faixa) {
        throw new Error(`Idade ${idade.anos}a${idade.meses}m fora da faixa normativa do WISC-IV (6:0 - 16:11).`);
    }

    // 1. Bruto → Ponderado por subteste
    const resultados: Record<string, any> = {};
    const pondByCode: Record<string, number> = {};
    const errosBrutos: string[] = [];

    for (const [codigo, brutoRaw] of Object.entries(brutos)) {
        const bruto = Number(brutoRaw);
        if (Number.isNaN(bruto)) continue;

        const pond = rawToScaledWISC(faixa, codigo, bruto);
        if (pond == null) {
            errosBrutos.push(`${codigo}=${bruto} (fora da norma)`);
            continue;
        }

        const sub = SUBTESTES.find(s => s.codigo === codigo);
        if (!sub) continue;

        resultados[codigo] = {
            nome: sub.nome,
            codigo,
            bruto,
            ponderado: pond,
            classificacao: classificarPonderado(pond),
        };
        pondByCode[codigo] = pond;
    }

    if (errosBrutos.length > 0) {
        throw new Error(`Brutos fora da norma para faixa ${faixa}: ${errosBrutos.join(", ")}`);
    }

    // 2. Soma por escala
    const somas: Record<string, SomaEscala> = {};
    for (const [tipo, codigos] of Object.entries(WISC_SCALES)) {
        somas[tipo] = somarEscala(pondByCode, codigos);
    }

    // 3. Composto (QI / Índice) — só calcula se TODOS os subtestes da escala estão presentes
    //    NOTA: compNorms usa "QIT" como key (não "QI_TOTAL"). Mapeamento abaixo.
    const escalaParaCompKey: Record<string, string> = {
        ICV: "ICV",
        IOP: "IOP",
        IMO: "IMO",
        IVP: "IVP",
        QI_TOTAL: "QIT",
    };

    const compostos: Record<string, CompostoInfo | null> = {};
    for (const [tipo, info] of Object.entries(somas)) {
        if (info.faltando.length === 0 && info.usadosCount > 0) {
            const compKey = escalaParaCompKey[tipo];
            const c = sumToCompositeWISC(compKey, info.soma);
            if (c) {
                c.classificacao = classByComposite(c.composto);
            }
            compostos[tipo] = c;
        } else {
            compostos[tipo] = null;
        }
    }

    // 4. Discrepâncias entre pares de índices (não inclui QI Total)
    const discrepancias = calcularDiscrepancias(compostos);

    // 5. Pontos fortes / fracos
    const fortesFracos = calcularPontosFortesFracos(resultados);

    return {
        idade,
        faixa,
        ponderados: pondByCode,
        resultados,
        somas,
        compostos,
        discrepancias,
        fortesFracos,
        engineVersao: "wisc_iv_br_v1",
    };
}

// ────────────────────────────────────────────────────────────────────────────
// Handler HTTP
// ────────────────────────────────────────────────────────────────────────────

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    if (req.method !== "POST") {
        return new Response(
            JSON.stringify({ error: "Método não permitido. Use POST." }),
            { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    try {
        const authHeader = req.headers.get("Authorization");
        if (!authHeader) {
            return new Response(
                JSON.stringify({ error: "Header Authorization obrigatório." }),
                { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

        const supabase = createClient(supabaseUrl, serviceRoleKey, {
            auth: { autoRefreshToken: false, persistSession: false }
        });

        const body = await req.json();
        const aplicacao_id: string | undefined = body?.aplicacao_id;
        if (!aplicacao_id) {
            return new Response(
                JSON.stringify({ error: "aplicacao_id é obrigatório." }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // 1. Busca aplicação + sanity check de instrumento
        const { data: aplicacao, error: errAp } = await supabase
            .from("aplicacoes_instrumento")
            .select("id, paciente_id, data_aplicacao, instrumento_id")
            .eq("id", aplicacao_id)
            .single();
        if (errAp) throw new Error(`Aplicação não encontrada: ${errAp.message}`);

        const { data: inst } = await supabase
            .from("instrumentos_catalogo")
            .select("sigla")
            .eq("id", aplicacao.instrumento_id)
            .single();
        if (inst?.sigla !== "WISC-IV") {
            throw new Error(`Aplicação não é WISC-IV (sigla=${inst?.sigla}).`);
        }

        // 2. Paciente
        const { data: paciente, error: errPac } = await supabase
            .from("pacientes")
            .select("id, nome_completo, data_nascimento")
            .eq("id", aplicacao.paciente_id)
            .single();
        if (errPac) throw new Error(`Paciente não encontrado: ${errPac.message}`);
        if (!paciente.data_nascimento) {
            throw new Error("Paciente sem data de nascimento cadastrada.");
        }
        if (!aplicacao.data_aplicacao) {
            throw new Error("Aplicação sem data preenchida.");
        }

        // 3. Brutos
        const { data: brutosRows, error: errBr } = await supabase
            .from("wisciv_brutos")
            .select("codigo, valor_bruto")
            .eq("aplicacao_id", aplicacao_id);
        if (errBr) throw new Error(`Erro ao buscar brutos: ${errBr.message}`);

        const brutos: Record<string, number> = {};
        for (const row of brutosRows ?? []) {
            if (row.valor_bruto != null) {
                brutos[row.codigo] = row.valor_bruto;
            }
        }
        if (Object.keys(brutos).length === 0) {
            throw new Error("Nenhum bruto cadastrado para esta aplicação.");
        }

        // 4. Calcula
        const resultado = calcularWISC({
            nasc: paciente.data_nascimento,
            apl: aplicacao.data_aplicacao,
            brutos,
        });

        // 5. Persiste em wisciv_resultados (UPSERT)
        const { error: errUp } = await supabase
            .from("wisciv_resultados")
            .upsert({
                aplicacao_id:   aplicacao_id,
                idade_anos:     resultado.idade.anos,
                idade_meses:    resultado.idade.meses,
                faixa_norma:    resultado.faixa,
                ponderados:     resultado.ponderados,
                somas:          resultado.somas,
                compostos:      resultado.compostos,
                discrepancias:  resultado.discrepancias,
                fortes_fracos:  resultado.fortesFracos,
                engine_versao:  resultado.engineVersao,
                calculado_em:   new Date().toISOString(),
            }, { onConflict: 'aplicacao_id' });
        if (errUp) throw new Error(`Erro ao salvar resultado: ${errUp.message}`);

        // 6. Atualiza status
        const { error: errStat } = await supabase
            .from("aplicacoes_instrumento")
            .update({
                status: "corrigido",
                data_conclusao: new Date().toISOString(),
            })
            .eq("id", aplicacao_id);
        if (errStat) throw new Error(`Erro ao atualizar status: ${errStat.message}`);

        return new Response(
            JSON.stringify({ ok: true, resultado }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

    } catch (err) {
        const msg = (err as Error).message ?? String(err);
        console.error("[wisc-iv-calcular]", msg);
        return new Response(
            JSON.stringify({ ok: false, error: msg }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});

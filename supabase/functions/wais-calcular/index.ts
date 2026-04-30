// ============================================================================
// Supabase Edge Function: wais-calcular
// ============================================================================
// Calcula resultado completo de uma aplicação WAIS-III a partir dos brutos
// digitados pelo aplicador. Roda no Supabase Edge Runtime (Deno).
//
// FLUXO:
//   1. Front chama POST /functions/v1/wais-calcular { aplicacao_id }
//   2. Função lê paciente (data_nascimento) + brutos (de wais_brutos)
//   3. Calcula:
//        - Idade na data da aplicação
//        - Faixa etária normativa (8 faixas: 16-17 ... 65-89)
//        - Bruto → Ponderado por subteste (rawNorms)
//        - Soma por escala (4 índices + 3 QIs)
//        - Composto (compNorms) com IC90 / IC95 / percentil
//        - Discrepâncias significativas entre pares de índices
//        - Pontos fortes / fracos (subtestes ≥3 do média)
//   4. Salva em wais_resultados (UPSERT)
//   5. Retorna o resultado completo
//
// PORTADO DE: equilibrium-api/src/services/waisService.js (mantém compatibilidade)
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

import rawNorms from "./waisiii_raw_to_scaled_br.json" with { type: "json" };
import compNorms from "./waisiii_sum_to_composite_br.json" with { type: "json" };

// ────────────────────────────────────────────────────────────────────────────
// CORS
// ────────────────────────────────────────────────────────────────────────────

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ────────────────────────────────────────────────────────────────────────────
// Constantes do WAIS-III
// ────────────────────────────────────────────────────────────────────────────

interface Subteste {
    nome: string;
    codigo: string;
}

const SUBTESTES: Subteste[] = [
    { nome: "Completar Figuras",                 codigo: "CF" },
    { nome: "Vocabulário",                        codigo: "VC" },
    { nome: "Códigos",                            codigo: "CD" },
    { nome: "Semelhanças",                        codigo: "SM" },
    { nome: "Cubos",                              codigo: "CB" },
    { nome: "Aritmética",                         codigo: "AR" },
    { nome: "Raciocínio Matricial",               codigo: "RM" },
    { nome: "Dígitos",                            codigo: "DG" },
    { nome: "Informação",                         codigo: "IN" },
    { nome: "Arranjo de Figuras",                 codigo: "AF" },
    { nome: "Compreensão",                        codigo: "CO" },
    { nome: "Procurar Símbolos",                  codigo: "PS" },
    { nome: "Sequência de Números e Letras",      codigo: "SNL" },
    { nome: "Armar Objetos",                      codigo: "AO" },
];

// Composição das escalas (idêntica à API antiga e ao Manual WAIS-III BR)
const WAIS_SCALES: Record<string, string[]> = {
    ICV:         ["SM", "VC", "IN"],                              // Índice de Compreensão Verbal
    IOP:         ["CB", "CF", "RM"],                              // Índice de Organização Perceptual
    IMO:         ["AR", "DG", "SNL"],                             // Índice de Memória Operacional
    IVP:         ["CD", "PS"],                                    // Índice de Velocidade de Proc.
    QI_VERBAL:   ["SM", "VC", "AR", "DG", "IN", "CO"],            // QI Verbal
    QI_EXECUCAO: ["CF", "CD", "CB", "RM", "AF"],                  // QI de Execução
    QI_TOTAL:    ["SM", "VC", "AR", "DG", "IN", "CO", "CF", "CD", "CB", "RM", "AF"],  // QI Total = Verbal + Execução
};

// Valores críticos para discrepâncias entre índices (p < .05)
// Tabela B.2 — Manual WAIS-III BR (Nascimento, 2005)
const VALORES_CRITICOS: Record<string, number> = {
    "ICV × IOP": 11.75,
    "ICV × IMO": 12.87,
    "ICV × IVP": 14.21,
    "IOP × IMO": 13.50,
    "IOP × IVP": 15.02,
    "IMO × IVP": 15.67,
    "QIV × QIE":  9.72,
};

// ────────────────────────────────────────────────────────────────────────────
// Funções de cálculo (port direto do waisService.js da API antiga)
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

function faixaEtariaWAISIII(idade: Idade | null): string | null {
    if (!idade) return null;
    const a = idade.anos;
    if (a >= 16 && a <= 17) return "16 - 17";
    if (a >= 18 && a <= 19) return "18 - 19";
    if (a >= 20 && a <= 29) return "20 - 29";
    if (a >= 30 && a <= 39) return "30 - 39";
    if (a >= 40 && a <= 49) return "40 - 49";
    if (a >= 50 && a <= 59) return "50 - 59";
    if (a >= 60 && a <= 64) return "60 - 64";
    if (a >= 65 && a <= 89) return "65 - 89";
    return null;
}

function rawToScaledWAIS(faixa: string, codigo: string, bruto: number): number | null {
    const faixaData = (rawNorms as any)?.raw_to_scaled?.[faixa];
    if (!faixaData) return null;

    const sub = SUBTESTES.find(s => s.codigo === codigo);
    if (!sub) return null;

    const regras = faixaData[sub.nome];
    if (!Array.isArray(regras)) return null;

    for (const r of regras) {
        if (r.rawMin != null && bruto >= r.rawMin && bruto <= r.rawMax) {
            return Number(r.scaled);
        }
    }
    return null;
}

interface CompositoInfo {
    composto: number;
    percentil: string;
    percentil_num: number;
    ic90: [number, number];
    ic95: [number, number];
}

function sumToCompositeWAIS(scaleType: string, soma: number): CompositoInfo | null {
    const list = (compNorms as any)?.sum_to_composite || [];
    const row = list.find((r: any) =>
        r.scale_type === scaleType && soma >= r.sum_min && soma <= r.sum_max
    );
    if (!row) return null;

    return {
        composto:      row.composite_score,
        percentil:     row.percentile,
        percentil_num: row.percentile_num,
        ic90:          [row.ci_90_min, row.ci_90_max],
        ic95:          [row.ci_95_min, row.ci_95_max],
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

function calcularDiscrepancias(compostos: Record<string, CompositoInfo | null>): DiscrepanciaPar[] {
    const pares = [
        { par: "ICV × IOP", a: "ICV",       b: "IOP" },
        { par: "ICV × IMO", a: "ICV",       b: "IMO" },
        { par: "ICV × IVP", a: "ICV",       b: "IVP" },
        { par: "IOP × IMO", a: "IOP",       b: "IMO" },
        { par: "IOP × IVP", a: "IOP",       b: "IVP" },
        { par: "IMO × IVP", a: "IMO",       b: "IVP" },
        { par: "QIV × QIE", a: "QI_VERBAL", b: "QI_EXECUCAO" },
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

interface PontoForteFaca {
    cod: string;
    nome: string;
    p: number;
    desvio: number;
}

interface FortesFracos {
    media: number;
    fortes: PontoForteFaca[];
    fracos: PontoForteFaca[];
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
// Função principal: orquestra cálculo
// ────────────────────────────────────────────────────────────────────────────

interface CalcularInput {
    nasc: string;
    apl: string;
    brutos: Record<string, number>;
}

function calcularWAIS(dados: CalcularInput) {
    const { nasc, apl, brutos } = dados;

    const idade = calcularIdade(nasc, apl);
    if (!idade) {
        throw new Error("Datas de nascimento ou aplicação inválidas.");
    }

    const faixa = faixaEtariaWAISIII(idade);
    if (!faixa) {
        throw new Error(`Idade ${idade.anos} anos fora da faixa normativa do WAIS-III (16-89 anos).`);
    }

    // 1. Bruto → Ponderado por subteste
    const resultados: Record<string, any> = {};
    const pondByCode: Record<string, number> = {};
    const errosBrutos: string[] = [];

    for (const [codigo, brutoRaw] of Object.entries(brutos)) {
        const bruto = Number(brutoRaw);
        if (Number.isNaN(bruto)) continue;

        const pond = rawToScaledWAIS(faixa, codigo, bruto);
        if (pond == null) {
            errosBrutos.push(`${codigo}=${bruto} (fora da norma)`);
            continue;
        }

        const sub = SUBTESTES.find(s => s.codigo === codigo);
        if (!sub) continue;

        resultados[codigo] = {
            nome:          sub.nome,
            codigo,
            bruto,
            ponderado:     pond,
            classificacao: classificarPonderado(pond),
        };
        pondByCode[codigo] = pond;
    }

    if (errosBrutos.length > 0) {
        throw new Error(`Brutos fora da norma para faixa ${faixa}: ${errosBrutos.join(", ")}`);
    }

    // 2. Soma por escala
    const somas: Record<string, SomaEscala> = {};
    for (const [tipo, codigos] of Object.entries(WAIS_SCALES)) {
        somas[tipo] = somarEscala(pondByCode, codigos);
    }

    // 3. Composto (QI / Índice) — só calcula se TODOS os subtestes da escala estão presentes
    const compostos: Record<string, CompositoInfo | null> = {};
    for (const [tipo, info] of Object.entries(somas)) {
        if (info.faltando.length === 0 && info.usadosCount > 0) {
            const c = sumToCompositeWAIS(tipo, info.soma);
            if (c) {
                (c as any).classificacao = classByComposite(c.composto);
            }
            compostos[tipo] = c;
        } else {
            compostos[tipo] = null;
        }
    }

    // 4. Discrepâncias entre pares de índices
    const discrepancias = calcularDiscrepancias(compostos);

    // 5. Pontos fortes / fracos (subtestes ≥3 do média)
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
        engineVersao: "wais_iii_br_v1",
    };
}

// ────────────────────────────────────────────────────────────────────────────
// Handler HTTP
// ────────────────────────────────────────────────────────────────────────────

serve(async (req) => {
    // CORS preflight
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
        // Cliente Supabase usando o JWT do request (RLS-aware)
        const authHeader = req.headers.get("Authorization");
        if (!authHeader) {
            return new Response(
                JSON.stringify({ error: "Header Authorization obrigatório." }),
                { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

        // Cliente com service_role pra escrever em wais_resultados (bypass RLS)
        const supabase = createClient(supabaseUrl, serviceRoleKey, {
            auth: { autoRefreshToken: false, persistSession: false }
        });

        // Parse do body
        const body = await req.json();
        const aplicacao_id: string | undefined = body?.aplicacao_id;
        if (!aplicacao_id) {
            return new Response(
                JSON.stringify({ error: "aplicacao_id é obrigatório." }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // 1. Busca aplicação + paciente (REUSA aplicacoes_instrumento — schema dos D3)
        const { data: aplicacao, error: errAp } = await supabase
            .from("aplicacoes_instrumento")
            .select("id, paciente_id, data_aplicacao, instrumento_id")
            .eq("id", aplicacao_id)
            .single();
        if (errAp) throw new Error(`Aplicação não encontrada: ${errAp.message}`);

        // Sanity: confirma que é mesmo WAIS-III (evita chamar a função pra outro instrumento)
        const { data: inst } = await supabase
            .from("instrumentos_catalogo")
            .select("sigla")
            .eq("id", aplicacao.instrumento_id)
            .single();
        if (inst?.sigla !== "WAIS-III") {
            throw new Error(`Aplicação não é WAIS-III (sigla=${inst?.sigla}).`);
        }

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

        // 2. Busca brutos
        const { data: brutosRows, error: errBr } = await supabase
            .from("wais_brutos")
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

        // 3. Calcula
        const resultado = calcularWAIS({
            nasc: paciente.data_nascimento,
            apl: aplicacao.data_aplicacao,
            brutos,
        });

        // 4. Persiste em wais_resultados (UPSERT)
        const { error: errUp } = await supabase
            .from("wais_resultados")
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
            });
        if (errUp) throw new Error(`Erro ao salvar resultado: ${errUp.message}`);

        // 5. Atualiza status da aplicação (enum status_aplicacao: 'aguardando' → 'corrigido')
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
        console.error("[wais-calcular]", msg);
        return new Response(
            JSON.stringify({ ok: false, error: msg }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});

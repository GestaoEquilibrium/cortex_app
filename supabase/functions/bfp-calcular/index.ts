// ============================================================================
// Supabase Edge Function: bfp-calcular
// ============================================================================
// Calcula resultado completo de uma aplicação BFP (Bateria Fatorial de Personalidade).
//
// FLUXO (idêntico ao wisc-iv-calcular):
//   1. Front chama POST /functions/v1/bfp-calcular { aplicacao_id }
//   2. Função lê paciente (sexo, data_nascimento), aplicação (data_aplicacao),
//      e brutos (de bfp_brutos).
//   3. Calcula:
//        - Idade na data da aplicação
//        - Norma por sexo (masculino/feminino), fallback 'geral' se NULL
//        - EB de cada faceta (média Likert ajustada por inversão)
//        - EB de cada fator (média aritmética dos EBs das suas facetas)
//        - Z = (EB - media) / dp por faceta/fator (norma específica)
//        - Percentil = Φ(Z) × 100, clamp [1,99]
//        - Classificação (MB/B/M/A/MA)
//   4. Salva em bfp_resultados (UPSERT, preservando campos qualitativos).
//   5. Atualiza aplicacoes_instrumento.status = 'corrigido'.
//
// PORTADO DE: app.neuroequilibrium /Aplicacao_testes/BFP (computeScores legacy)
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import RULES from "./bfp_rules.json" with { type: "json" };

// ────────────────────────────────────────────────────────────────────────────
// CORS
// ────────────────────────────────────────────────────────────────────────────

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ENGINE_VERSAO = "bfp_br_v1";

// ────────────────────────────────────────────────────────────────────────────
// Núcleo matemático (porta literal do legacy)
// ────────────────────────────────────────────────────────────────────────────

// Aproximação de Abramowitz & Stegun (5.7.12) — idêntica ao legacy
function normalCDF(z: number): number {
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
    const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
    const sign = z < 0 ? -1 : 1;
    z = Math.abs(z) / Math.sqrt(2);
    const t = 1.0 / (1.0 + p * z);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-z * z);
    return 0.5 * (1.0 + sign * y);
}

function classificar(percentil: number): string {
    if (percentil <= 14) return "Muito Baixo";
    if (percentil <= 29) return "Baixo";
    if (percentil <= 70) return "Médio";
    if (percentil <= 85) return "Alto";
    return "Muito Alto";
}

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
    let dias = a.getDate() - n.getDate();
    if (dias < 0) meses--;
    if (meses < 0) { anos--; meses += 12; }
    return { anos, meses, totalMeses: anos * 12 + meses };
}

// ────────────────────────────────────────────────────────────────────────────
// Cálculo principal (porta de computeScores legacy)
// ────────────────────────────────────────────────────────────────────────────

interface ResultadoBFP {
    sexo_norma: "masculino" | "feminino" | "geral";
    eb_facetas: Record<string, number>;
    eb_fatores: Record<string, number>;
    z_facetas: Record<string, number>;
    z_fatores: Record<string, number>;
    percentil_facetas: Record<string, number>;
    percentil_fatores: Record<string, number>;
    classificacao_facetas: Record<string, string>;
    classificacao_fatores: Record<string, string>;
    resumo: string;
}

function computeScores(respostas: Record<number, number>, sexo: string | null): ResultadoBFP {
    let normKey: "masculino" | "feminino" | "geral" = "geral";
    if (sexo === "Masculino") normKey = "masculino";
    else if (sexo === "Feminino") normKey = "feminino";

    // Agrupar itens por faceta
    const facItens: Record<string, Array<{ num: number; faceta: string; inv: boolean }>> = {};
    for (const it of RULES.itens as any[]) {
        if (!facItens[it.faceta]) facItens[it.faceta] = [];
        facItens[it.faceta].push(it);
    }

    // EB por faceta (média Likert ajustada por inversão)
    const ebF: Record<string, number> = {};
    for (const fac in facItens) {
        const itens = facItens[fac];
        const pos = itens.filter(i => !i.inv);
        const neg = itens.filter(i => i.inv);
        const respondidos = itens.filter(i => respostas[i.num] !== undefined);
        const nt = respondidos.length;
        if (nt === 0) { ebF[fac] = 0; continue; }
        const sP = pos.reduce((s, i) => s + (respostas[i.num] || 0), 0);
        const sN = neg.reduce((s, i) => s + (respostas[i.num] || 0), 0);
        const inr = neg.length * 8;  // inversão: cada item inv soma (8 - x), agrupado: neg.length*8 - sN
        const eb = neg.length > 0 ? (sP + inr - sN) / nt : sP / nt;
        ebF[fac] = Math.round(eb * 100) / 100;
    }

    // EB por fator = média dos EBs das facetas
    const ebFat: Record<string, number> = {};
    const fatores = RULES.fatores as Record<string, any>;
    for (const f in fatores) {
        const ff = fatores[f].facetas.filter((x: string) => ebF[x] !== undefined);
        if (ff.length === 0) { ebFat[f] = 0; continue; }
        const soma = ff.reduce((s: number, x: string) => s + ebF[x], 0);
        ebFat[f] = Math.round((soma / ff.length) * 100) / 100;
    }

    // Z, percentil, classificação para cada chave (17 facetas + 5 fatores)
    const ebAll = { ...ebF, ...ebFat };
    const facetas = RULES.facetas as Record<string, any>;

    const eb_facetas: Record<string, number> = {};
    const eb_fatores: Record<string, number> = {};
    const z_facetas: Record<string, number> = {};
    const z_fatores: Record<string, number> = {};
    const percentil_facetas: Record<string, number> = {};
    const percentil_fatores: Record<string, number> = {};
    const classificacao_facetas: Record<string, string> = {};
    const classificacao_fatores: Record<string, string> = {};

    for (const k in ebAll) {
        const eb = ebAll[k];
        let norm: { media: number; dp: number } | null = null;

        // Prioridade: normasPorSexo[sexo] → norma (geral)
        if (facetas[k]?.normasPorSexo?.[normKey]) norm = facetas[k].normasPorSexo[normKey];
        else if (fatores[k]?.normasPorSexo?.[normKey]) norm = fatores[k].normasPorSexo[normKey];
        else if (facetas[k]?.norma) norm = facetas[k].norma;
        else if (fatores[k]?.norma) norm = fatores[k].norma;

        let z = 0, percentil = 50;
        if (norm && norm.dp > 0) {
            z = Math.round(((eb - norm.media) / norm.dp) * 10) / 10;
            percentil = Math.round(normalCDF(z) * 100);
            if (percentil < 1) percentil = 1;
            if (percentil > 99) percentil = 99;
        }
        const faixa = classificar(percentil);

        const isFator = k.length === 1;
        if (isFator) {
            eb_fatores[k] = eb;
            z_fatores[k] = z;
            percentil_fatores[k] = percentil;
            classificacao_fatores[k] = faixa;
        } else {
            eb_facetas[k] = eb;
            z_facetas[k] = z;
            percentil_facetas[k] = percentil;
            classificacao_facetas[k] = faixa;
        }
    }

    // Resumo textual (5 fatores)
    const fatNomes: Record<string, string> = {
        N: "Neuroticismo", E: "Extroversão", S: "Socialização", R: "Realização", A: "Abertura"
    };
    const partes = ["N", "E", "S", "R", "A"].map(f =>
        `${fatNomes[f]}: P${percentil_fatores[f]} (${classificacao_fatores[f]})`
    );
    const resumo = partes.join(" | ");

    return {
        sexo_norma: normKey,
        eb_facetas, eb_fatores,
        z_facetas, z_fatores,
        percentil_facetas, percentil_fatores,
        classificacao_facetas, classificacao_fatores,
        resumo,
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

        // 1. Aplicação + sanity check
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
        if (inst?.sigla !== "BFP") {
            throw new Error(`Aplicação não é BFP (sigla=${inst?.sigla}).`);
        }

        // 2. Paciente (precisa de sexo + data_nascimento)
        const { data: paciente, error: errPac } = await supabase
            .from("pacientes")
            .select("id, nome_completo, sexo, data_nascimento")
            .eq("id", aplicacao.paciente_id)
            .single();
        if (errPac) throw new Error(`Paciente não encontrado: ${errPac.message}`);
        if (!paciente.data_nascimento) {
            throw new Error("Paciente sem data de nascimento cadastrada.");
        }
        if (!aplicacao.data_aplicacao) {
            throw new Error("Aplicação sem data preenchida.");
        }

        // 3. Idade na data de aplicação
        //    Aviso (não bloqueia) se idade fora 18-75 — decisão clínica:
        //    o legado (app.neuroequilibrium) não validava idade, e a clínica
        //    permite aplicar BFP em 16-17 anos usando a norma adulta.
        //    (Sprint Wess 2026-05-21)
        const idade = calcularIdade(paciente.data_nascimento, aplicacao.data_aplicacao);
        if (!idade) throw new Error("Não foi possível calcular idade.");
        if (idade.anos < 18 || idade.anos > 75) {
            console.warn(`[bfp-calcular] Idade ${idade.anos} fora da faixa normativa 18-75. Calculando com norma adulta padrão.`);
        }

        // 4. Brutos
        const { data: brutosRows, error: errBr } = await supabase
            .from("bfp_brutos")
            .select("item_num, valor_resposta")
            .eq("aplicacao_id", aplicacao_id);
        if (errBr) throw new Error(`Erro ao buscar brutos: ${errBr.message}`);

        const respostas: Record<number, number> = {};
        for (const row of brutosRows ?? []) {
            if (row.valor_resposta != null) {
                respostas[row.item_num] = row.valor_resposta;
            }
        }
        if (Object.keys(respostas).length === 0) {
            throw new Error("Nenhuma resposta cadastrada para esta aplicação.");
        }

        // 5. Calcula
        const r = computeScores(respostas, paciente.sexo);

        // 6. UPSERT em bfp_resultados (preservando campos qualitativos via DEFAULT do banco;
        //    o frontend cuida do UPDATE dos quali separadamente, igual WISC-IV)
        const { error: errUp } = await supabase
            .from("bfp_resultados")
            .upsert({
                aplicacao_id,
                idade_anos: idade.anos,
                sexo_norma: r.sexo_norma,
                eb_facetas: r.eb_facetas,
                eb_fatores: r.eb_fatores,
                z_facetas: r.z_facetas,
                z_fatores: r.z_fatores,
                percentil_facetas: r.percentil_facetas,
                percentil_fatores: r.percentil_fatores,
                classificacao_facetas: r.classificacao_facetas,
                classificacao_fatores: r.classificacao_fatores,
                resumo: r.resumo,
                engine_versao: ENGINE_VERSAO,
                calculado_em: new Date().toISOString(),
            }, { onConflict: 'aplicacao_id' });
        if (errUp) throw new Error(`Erro ao salvar resultado: ${errUp.message}`);

        // 7. Status
        const { error: errStat } = await supabase
            .from("aplicacoes_instrumento")
            .update({
                status: "corrigido",
                data_conclusao: new Date().toISOString(),
            })
            .eq("id", aplicacao_id);
        if (errStat) throw new Error(`Erro ao atualizar status: ${errStat.message}`);

        return new Response(
            JSON.stringify({
                ok: true,
                idade: idade.anos,
                respondidos: Object.keys(respostas).length,
                resumo: r.resumo,
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

    } catch (err) {
        const msg = (err as Error).message ?? String(err);
        console.error("[bfp-calcular]", msg);
        return new Response(
            JSON.stringify({ ok: false, error: msg }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});

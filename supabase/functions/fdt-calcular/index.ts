// ============================================================================
// Supabase Edge Function: fdt-calcular
// ============================================================================
// Calcula resultado completo de uma aplicação FDT.
//
// FLUXO:
//   1. Front chama POST /functions/v1/fdt-calcular { aplicacao_id }
//   2. Função lê paciente (data_nascimento) + brutos (de fdt_brutos)
//   3. Calcula:
//        - Idade na data da aplicação
//        - Faixa etária normativa (8 faixas: 6-8, 9-10, ..., 60-75)
//        - CI = E - L  (Controle Inibitório)
//        - FC = A - L  (Flexibilidade Cognitiva)
//        - Para cada medida: percentil (degrau) + classificação (4 níveis)
//        - Gauges (paciente vs P25-P75 normativo)
//        - Interpretação clínica (3-4 parágrafos)
//   4. Salva em fdt_resultados (UPSERT)
//   5. Atualiza aplicacoes_instrumento.status = 'corrigido'
//
// LÓGICA INVERTIDA: menor valor (tempo/erros) = melhor desempenho.
// CÁLCULO POR DEGRAU (não interpolação) — port direto do legacy.
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

import fdtRules from "./fdt-rules.json" with { type: "json" };

// ────────────────────────────────────────────────────────────────────────────
// CORS
// ────────────────────────────────────────────────────────────────────────────

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ────────────────────────────────────────────────────────────────────────────
// Tipos
// ────────────────────────────────────────────────────────────────────────────

interface Idade {
    anos: number;
    meses: number;
    totalMeses: number;
    totalAnos: number;
}

interface Pontos {
    p95: number; p75: number; p50: number; p25: number; p5: number;
}

interface Norma {
    Leitura: Pontos;
    Contagem: Pontos;
    Escolha: Pontos;
    Alternancia: Pontos;
    CI: Pontos;
    FC: Pontos;
    Erro_Contagem: Pontos;
    Erro_Escolha: Pontos;
    Erro_Alternancia: Pontos;
}

interface Classificacao {
    label: string;
    cor: string;
}

interface Medida {
    key: string;
    label: string;
    grupo: 'tempo' | 'erro' | 'derivado';
    raw: number | null;
    pctLabel: string;        // "≥ 95" | "> 75" | "> 50" | "> 25" | "> 5" | "< 5" | "—"
    pctNum: number | null;   // 97 | 87 | 62 | 37 | 15 | 3 | null  (pra posicionar no gráfico)
    classificacao: Classificacao;
    normaPc50: number | null;
}

interface Brutos {
    t_l: number; t_c: number; t_e: number; t_a: number;
    e_l?: number; e_c: number; e_e: number; e_a: number;
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function calcularIdade(nascISO: string, aplISO: string): Idade | null {
    if (!nascISO || !aplISO) return null;
    const n = new Date(nascISO);
    const a = new Date(aplISO);
    if (isNaN(n.getTime()) || isNaN(a.getTime()) || a < n) return null;

    let anos = a.getFullYear() - n.getFullYear();
    let meses = a.getMonth() - n.getMonth();
    if (a.getDate() < n.getDate()) meses -= 1;
    if (meses < 0) { anos -= 1; meses += 12; }

    return { anos, meses, totalMeses: anos * 12 + meses, totalAnos: anos };
}

function detectarFaixa(idadeAnos: number): string | null {
    if (idadeAnos >= 6  && idadeAnos <= 8)  return "6-8";
    if (idadeAnos >= 9  && idadeAnos <= 10) return "9-10";
    if (idadeAnos >= 11 && idadeAnos <= 12) return "11-12";
    if (idadeAnos >= 13 && idadeAnos <= 15) return "13-15";
    if (idadeAnos >= 16 && idadeAnos <= 18) return "16-18";
    if (idadeAnos >= 19 && idadeAnos <= 34) return "19-34";
    if (idadeAnos >= 35 && idadeAnos <= 59) return "35-59";
    if (idadeAnos >= 60 && idadeAnos <= 75) return "60-75";
    return null;
}

/**
 * Cálculo de percentil por DEGRAU.
 * Lógica invertida: valor menor = melhor.
 * Port direto da função calcularPercentilFix do legacy.
 */
function calcularPercentil(valor: number | null | undefined, norm: Pontos): { label: string; numerico: number | null } {
    if (!norm || valor == null) return { label: "—", numerico: null };
    const v = Number(valor);
    if (isNaN(v)) return { label: "—", numerico: null };

    if (v <= norm.p95) return { label: "≥ 95", numerico: 97 };
    if (v <= norm.p75) return { label: "> 75", numerico: 87 };
    if (v <= norm.p50) return { label: "> 50", numerico: 62 };
    if (v <= norm.p25) return { label: "> 25", numerico: 37 };
    if (v <= norm.p5)  return { label: "> 5",  numerico: 15 };
    return                  { label: "< 5",  numerico: 3  };
}

function classificar(pctLabel: string): Classificacao {
    const fallback = { label: "—", cor: "#94a3b8" };
    if (!pctLabel || pctLabel === "—") return fallback;
    for (const c of fdtRules.classificacao as any[]) {
        if (c.labels_pct.includes(pctLabel)) {
            return { label: c.label, cor: c.cor };
        }
    }
    return fallback;
}

// ────────────────────────────────────────────────────────────────────────────
// Cálculo principal
// ────────────────────────────────────────────────────────────────────────────

interface Resultado {
    idade: Idade;
    faixa: string;
    medidas: Medida[];
    ci_tempo: number;
    fc_tempo: number;
    gauges: any[];
    interpretacao: string;
    engineVersao: string;
}

function calcularFdt(idade: Idade, brutos: Brutos, nomePaciente: string): Resultado {
    const faixa = detectarFaixa(idade.totalAnos);
    if (!faixa) {
        throw new Error(`Idade ${idade.totalAnos} anos fora das faixas normativas FDT (6-75).`);
    }
    const norma: Norma = (fdtRules.normas as any)[faixa];
    if (!norma) throw new Error(`Norma não encontrada para faixa ${faixa}.`);

    const { t_l, t_c, t_e, t_a, e_c, e_e, e_a } = brutos;

    // Validações
    for (const [k, v] of Object.entries({ t_l, t_c, t_e, t_a })) {
        if (v == null || isNaN(Number(v))) {
            throw new Error(`Tempo ${k.toUpperCase()} ausente ou inválido.`);
        }
        if (v < 0) throw new Error(`Tempo ${k.toUpperCase()} = ${v} negativo.`);
    }
    for (const [k, v] of Object.entries({ e_c, e_e, e_a })) {
        if (v == null || isNaN(Number(v))) {
            throw new Error(`Erros ${k.toUpperCase()} ausente ou inválido.`);
        }
        if (v < 0) throw new Error(`Erros ${k.toUpperCase()} = ${v} negativo.`);
    }

    // Índices derivados
    const ci_tempo = t_e - t_l;  // Controle Inibitório
    const fc_tempo = t_a - t_l;  // Flexibilidade Cognitiva

    // Monta as 9 medidas
    const medidas: Medida[] = [];

    function addMedida(
        key: string, label: string, grupo: 'tempo' | 'erro' | 'derivado',
        raw: number, normaKey: keyof Norma
    ) {
        const n = norma[normaKey];
        const pct = calcularPercentil(raw, n);
        const cls = classificar(pct.label);
        medidas.push({
            key, label, grupo, raw,
            pctLabel: pct.label, pctNum: pct.numerico,
            classificacao: cls,
            normaPc50: n?.p50 ?? null,
        });
    }

    // Tempos diretos
    addMedida("L", "Leitura",     "tempo", t_l, "Leitura");
    addMedida("C", "Contagem",    "tempo", t_c, "Contagem");
    addMedida("E", "Escolha",     "tempo", t_e, "Escolha");
    addMedida("A", "Alternância", "tempo", t_a, "Alternancia");

    // Tempos derivados
    addMedida("CI", "Controle Inibitório (E−L)",     "derivado", ci_tempo, "CI");
    addMedida("FC", "Flexibilidade Cognitiva (A−L)", "derivado", fc_tempo, "FC");

    // Erros (Leitura não tem norma — só registramos o valor cru)
    addMedida("eC", "Erros — Contagem",    "erro", e_c, "Erro_Contagem");
    addMedida("eE", "Erros — Escolha",     "erro", e_e, "Erro_Escolha");
    addMedida("eA", "Erros — Alternância", "erro", e_a, "Erro_Alternancia");

    // Gauges (uma entrada por medida de tempo, com pontos da norma)
    const gauges = [
        { key: "L",  label: "Leitura",                paciente: t_l,      ...norma.Leitura,     classificacao: medidas[0].classificacao.label },
        { key: "C",  label: "Contagem",               paciente: t_c,      ...norma.Contagem,    classificacao: medidas[1].classificacao.label },
        { key: "E",  label: "Escolha",                paciente: t_e,      ...norma.Escolha,     classificacao: medidas[2].classificacao.label },
        { key: "A",  label: "Alternância",            paciente: t_a,      ...norma.Alternancia, classificacao: medidas[3].classificacao.label },
        { key: "CI", label: "Controle Inibitório",    paciente: ci_tempo, ...norma.CI,          classificacao: medidas[4].classificacao.label },
        { key: "FC", label: "Flexibilidade",          paciente: fc_tempo, ...norma.FC,          classificacao: medidas[5].classificacao.label },
    ];

    // Interpretação clínica
    const interpretacao = gerarInterpretacao(nomePaciente, faixa, medidas);

    return {
        idade, faixa, medidas, ci_tempo, fc_tempo, gauges,
        interpretacao,
        engineVersao: "fdt_br_v1",
    };
}

// ────────────────────────────────────────────────────────────────────────────
// Interpretação clínica (3-4 parágrafos)
// ────────────────────────────────────────────────────────────────────────────

function gerarInterpretacao(nome: string, faixa: string, medidas: Medida[]): string {
    const m: Record<string, Medida> = {};
    for (const med of medidas) m[med.key] = med;

    const parts: string[] = [];

    parts.push(
        `O desempenho de ${nome} no FDT (Teste dos Cinco Dígitos) foi analisado com base nas normas para a faixa etária ${faixa} anos. As classificações refletem velocidade de processamento (Leitura/Contagem) e funções executivas (Escolha/Alternância e índices derivados Controle Inibitório e Flexibilidade Cognitiva).`
    );

    // Velocidade de processamento (L + C)
    if (m.L && m.C) {
        const lCls = m.L.classificacao.label;
        const cCls = m.C.classificacao.label;
        const ambasOk = ['Superior','Média'].includes(lCls) && ['Superior','Média'].includes(cCls);
        const ambasBaixo = ['Média Inferior','Dificuldade Acentuada'].includes(lCls) && ['Média Inferior','Dificuldade Acentuada'].includes(cCls);

        let descVel = '';
        if (ambasOk) {
            descVel = 'velocidade de processamento dentro do esperado, sem evidência de lentificação';
        } else if (ambasBaixo) {
            descVel = 'lentificação no processamento de informação, sugerindo dificuldades em tarefas básicas de velocidade';
        } else {
            descVel = 'desempenho heterogêneo nas tarefas de velocidade';
        }
        parts.push(
            `Em velocidade de processamento, a Leitura (${m.L.raw}s, classificação: ${lCls}) e a Contagem (${m.C.raw}s, classificação: ${cCls}) indicam ${descVel}.`
        );
    }

    // Controle Inibitório (CI = E - L)
    if (m.E && m.CI) {
        const eCls = m.E.classificacao.label;
        const ciCls = m.CI.classificacao.label;
        const eErrosCls = m.eE?.classificacao.label;
        let descCI = '';
        if (['Superior','Média'].includes(ciCls)) {
            descCI = 'capacidade preservada de inibir respostas automáticas';
        } else if (ciCls === 'Média Inferior') {
            descCI = 'dificuldade leve a moderada na inibição de respostas automáticas';
        } else {
            descCI = 'dificuldade acentuada no controle inibitório, com importante interferência da resposta automatizada';
        }
        const errosTxt = eErrosCls && eErrosCls !== '—'
            ? ` Os erros na Escolha (${m.eE!.raw}; classificação: ${eErrosCls}) corroboram esse padrão.`
            : '';
        parts.push(
            `Em controle inibitório, o tempo na parte de Escolha (${m.E.raw}s) e o índice CI (Escolha−Leitura = ${m.CI.raw}s, classificação: ${ciCls}) indicam ${descCI}.${errosTxt}`
        );
    }

    // Flexibilidade Cognitiva (FC = A - L)
    if (m.A && m.FC) {
        const fcCls = m.FC.classificacao.label;
        const eErrosCls = m.eA?.classificacao.label;
        let descFC = '';
        if (['Superior','Média'].includes(fcCls)) {
            descFC = 'flexibilidade cognitiva preservada para alternar entre regras';
        } else if (fcCls === 'Média Inferior') {
            descFC = 'dificuldade leve a moderada para alternar entre regras de resposta';
        } else {
            descFC = 'dificuldade acentuada de flexibilidade cognitiva, com perdas significativas durante a alternância';
        }
        const errosTxt = eErrosCls && eErrosCls !== '—'
            ? ` Os erros na Alternância (${m.eA!.raw}; classificação: ${eErrosCls}) reforçam esse achado.`
            : '';
        parts.push(
            `Em flexibilidade cognitiva, o tempo na parte de Alternância (${m.A.raw}s) e o índice FC (Alternância−Leitura = ${m.FC.raw}s, classificação: ${fcCls}) indicam ${descFC}.${errosTxt}`
        );
    }

    return parts.join("\n\n");
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

        // 1. Aplicação + sigla
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
        if (inst?.sigla !== "FDT") {
            throw new Error(`Aplicação não é FDT (sigla=${inst?.sigla}).`);
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

        const idade = calcularIdade(paciente.data_nascimento, aplicacao.data_aplicacao);
        if (!idade) throw new Error("Datas de nascimento ou aplicação inválidas.");

        // 3. Brutos
        const { data: brutos, error: errBr } = await supabase
            .from("fdt_brutos")
            .select("*")
            .eq("aplicacao_id", aplicacao_id)
            .single();
        if (errBr) throw new Error(`Erro ao buscar brutos: ${errBr.message}`);
        if (!brutos) throw new Error("Brutos não encontrados pra essa aplicação.");

        // 4. Calcula
        const resultado = calcularFdt(idade, brutos as Brutos, paciente.nome_completo || "Paciente");

        // 5. Persiste em fdt_resultados
        const { error: errUp } = await supabase
            .from("fdt_resultados")
            .upsert({
                aplicacao_id,
                idade_anos:    resultado.idade.anos,
                idade_meses:   resultado.idade.meses,
                faixa_norma:   resultado.faixa,
                medidas:       resultado.medidas,
                ci_tempo:      resultado.ci_tempo,
                fc_tempo:      resultado.fc_tempo,
                gauges:        resultado.gauges,
                interpretacao: resultado.interpretacao,
                engine_versao: resultado.engineVersao,
                calculado_em:  new Date().toISOString(),
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
        console.error("[fdt-calcular]", msg);
        return new Response(
            JSON.stringify({ ok: false, error: msg }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});

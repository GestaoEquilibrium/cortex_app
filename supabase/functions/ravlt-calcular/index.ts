// ============================================================================
// Supabase Edge Function: ravlt-calcular
// ============================================================================
// Calcula resultado completo de uma aplicação RAVLT.
//
// FLUXO:
//   1. Front chama POST /functions/v1/ravlt-calcular { aplicacao_id }
//   2. Função lê paciente (data_nascimento) + brutos (de ravlt_brutos)
//   3. Calcula:
//        - Idade na data da aplicação
//        - Faixa etária normativa (12 faixas: 6-8, 9-11, ..., 80+)
//        - Para cada bruto e índice derivado:
//             percentil (interpolação linear pc5/pc25/pc50/pc75/pc95)
//             classificação (5 níveis)
//        - Curva de aprendizagem (paciente vs Pc50 normativo)
//        - Interpretação clínica (6-7 parágrafos)
//   4. Salva em ravlt_resultados (UPSERT)
//   5. Atualiza aplicacoes_instrumento.status = 'corrigido'
//
// PORTADO DE: index.html original (calcular() + gerarInterpretacao())
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

import ravltRules from "./ravlt-rules.json" with { type: "json" };

// ────────────────────────────────────────────────────────────────────────────
// CORS
// ────────────────────────────────────────────────────────────────────────────

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ────────────────────────────────────────────────────────────────────────────
// Tipos auxiliares
// ────────────────────────────────────────────────────────────────────────────

interface Idade {
    anos: number;
    meses: number;
    totalMeses: number;
    totalAnos: number;
}

interface NormaPercentis {
    pc5: number;
    pc25: number;
    pc50: number;
    pc75: number;
    pc95: number;
}

interface Norma {
    faixa: string;
    idadeMin: number;
    idadeMax: number;
    [key: string]: any;  // A1..A7, B1, Recon, Total, ALT, Esquec, Proat, Retro
}

interface Classificacao {
    label: string;
    cor: string;
}

interface Medida {
    key: string;
    label: string;
    grupo: string;
    raw: number | null;
    pct: number | null;
    classificacao: Classificacao;
    normPc50: number | null;
}

interface Brutos {
    a1: number; a2: number; a3: number; a4: number; a5: number;
    b1: number;
    a6: number; a7: number;
    recon_acertos: number;
    intrusoes?: number;
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

    return {
        anos,
        meses,
        totalMeses: anos * 12 + meses,
        totalAnos: anos,
    };
}

function detectarFaixa(idadeAnos: number): Norma | null {
    const normas = ravltRules.normas as Norma[];
    for (const n of normas) {
        if (idadeAnos >= n.idadeMin && idadeAnos <= n.idadeMax) {
            return n;
        }
    }
    return null;
}

/**
 * Cálculo de percentil por interpolação linear entre os 5 pontos
 * (pc5, pc25, pc50, pc75, pc95).
 *
 * Portado tal qual do JS legacy.
 */
function calcularPercentil(raw: number, n: NormaPercentis): number | null {
    if (!n) return null;
    const pontos = [
        { pc: 5,  val: n.pc5  },
        { pc: 25, val: n.pc25 },
        { pc: 50, val: n.pc50 },
        { pc: 75, val: n.pc75 },
        { pc: 95, val: n.pc95 },
    ];
    if (raw >= n.pc95) return 97;
    if (raw <= n.pc5)  return 3;
    for (let i = 0; i < pontos.length - 1; i++) {
        const lo = pontos[i], hi = pontos[i + 1];
        if (raw >= lo.val && raw <= hi.val) {
            if (hi.val === lo.val) return Math.round((lo.pc + hi.pc) / 2);
            const frac = (raw - lo.val) / (hi.val - lo.val);
            return Math.round(lo.pc + frac * (hi.pc - lo.pc));
        }
    }
    return null;
}

function classificar(pct: number | null): Classificacao {
    const fallback = { label: "—", cor: "#94a3b8" };
    if (pct == null) return fallback;
    for (const c of ravltRules.classificacao as any[]) {
        if (pct >= c.pcMin && pct <= c.pcMax) {
            return { label: c.label, cor: c.cor };
        }
    }
    return fallback;
}

function descNivel(pct: number | null, baixo: string, medio: string, alto: string): string {
    if (pct == null) return medio;
    return pct <= 25 ? baixo : pct >= 75 ? alto : medio;
}

// ────────────────────────────────────────────────────────────────────────────
// Cálculo principal
// ────────────────────────────────────────────────────────────────────────────

interface Resultado {
    idade: Idade;
    faixa: string;
    medidas: Medida[];
    escoreTotal: number;
    alt: number;
    esquecimento: number;
    interfProativa: number;
    interfRetroativa: number;
    reconAjustado: number;
    curva: { paciente: number[]; normaPc50: number[] };
    interpretacao: string;
    engineVersao: string;
}

function calcularRavlt(idade: Idade, brutos: Brutos, nomePaciente: string): Resultado {
    const norma = detectarFaixa(idade.totalAnos);
    if (!norma) {
        throw new Error(`Idade ${idade.totalAnos} anos fora das faixas normativas RAVLT (6-100).`);
    }

    const { a1, a2, a3, a4, a5, b1, a6, a7, recon_acertos } = brutos;

    // Validações de range
    for (const [k, v] of Object.entries({ a1, a2, a3, a4, a5, b1, a6, a7 })) {
        if (v == null || isNaN(v)) throw new Error(`Bruto ${k.toUpperCase()} ausente ou inválido.`);
        if (v < 0 || v > 15) throw new Error(`${k.toUpperCase()} = ${v} fora do range 0-15.`);
    }
    if (recon_acertos == null || isNaN(recon_acertos)) {
        throw new Error("Reconhecimento ausente.");
    }
    if (recon_acertos < 0 || recon_acertos > 50) {
        throw new Error(`Reconhecimento = ${recon_acertos} fora do range 0-50.`);
    }

    // Índices derivados
    const escoreTotal = a1 + a2 + a3 + a4 + a5;
    const alt = escoreTotal - (5 * a1);
    const esquecimento = a6 === 0 ? 0 : a7 / a6;
    const interfProativa = a1 === 0 ? 0 : b1 / a1;
    const interfRetroativa = a5 === 0 ? 0 : a6 / a5;
    const reconAjustado = recon_acertos - 35;

    // Monta as 14 medidas com classificação
    const medidas: Medida[] = [];

    function addMedida(key: string, label: string, grupo: string, rawVal: number) {
        const n = norma[key] as NormaPercentis | undefined;
        if (!n) {
            medidas.push({
                key, label, grupo, raw: rawVal, pct: null,
                classificacao: { label: "—", cor: "#94a3b8" },
                normPc50: null,
            });
            return;
        }
        const pct = calcularPercentil(rawVal, n);
        const cls = classificar(pct);
        medidas.push({
            key, label, grupo, raw: rawVal, pct, classificacao: cls, normPc50: n.pc50,
        });
    }

    // Brutos
    addMedida("A1", "Tentativa A1", "Primeiras etapas da aprendizagem", a1);
    addMedida("A2", "Tentativa A2", "Primeiras etapas da aprendizagem", a2);
    addMedida("A3", "Tentativa A3", "Primeiras etapas da aprendizagem", a3);
    addMedida("A4", "Tentativa A4", "Primeiras etapas da aprendizagem", a4);
    addMedida("A5", "Tentativa A5", "Primeiras etapas da aprendizagem", a5);
    addMedida("B1", "Lista B (Distrator)", "Distrator", b1);
    addMedida("A6", "Evocação Imediata (A6)", "Evocação imediata", a6);
    addMedida("A7", "Evocação Tardia (A7)", "Evocação tardia", a7);

    // Recon usa o ajustado, não o bruto
    addMedida("Recon", "Reconhecimento", "Reconhecimento", reconAjustado);

    // Índices calculados
    addMedida("Total",  "Escore Total (A1-A5)",                "Índices de aprendizagem", escoreTotal);
    addMedida("ALT",    "Aprendizagem (ALT)",                  "Índices de aprendizagem", alt);
    addMedida("Esquec", "Velocidade de Esquecimento (A7/A6)",  "Índice de retenção",      esquecimento);
    addMedida("Proat",  "Interferência Proativa (B1/A1)",      "Índices de interferência", interfProativa);
    addMedida("Retro",  "Interferência Retroativa (A6/A5)",    "Índices de interferência", interfRetroativa);

    // Curva de aprendizagem (paciente vs Pc50 normativo)
    const curva = {
        paciente:  [a1, a2, a3, a4, a5, b1, a6, a7],
        normaPc50: [
            (norma.A1 as NormaPercentis).pc50,
            (norma.A2 as NormaPercentis).pc50,
            (norma.A3 as NormaPercentis).pc50,
            (norma.A4 as NormaPercentis).pc50,
            (norma.A5 as NormaPercentis).pc50,
            (norma.B1 as NormaPercentis).pc50,
            (norma.A6 as NormaPercentis).pc50,
            (norma.A7 as NormaPercentis).pc50,
        ],
    };

    // Interpretação clínica (port da gerarInterpretacao)
    const interpretacao = gerarInterpretacao(
        nomePaciente, norma.faixa, medidas,
        { escoreTotal, alt, esquecimento, interfProativa, interfRetroativa, reconAjustado }
    );

    return {
        idade,
        faixa: norma.faixa,
        medidas,
        escoreTotal,
        alt,
        esquecimento: Math.round(esquecimento * 100) / 100,
        interfProativa: Math.round(interfProativa * 100) / 100,
        interfRetroativa: Math.round(interfRetroativa * 100) / 100,
        reconAjustado,
        curva,
        interpretacao,
        engineVersao: "ravlt_br_v1",
    };
}

// ────────────────────────────────────────────────────────────────────────────
// Geração da interpretação clínica (port direto do legacy)
// ────────────────────────────────────────────────────────────────────────────

function gerarInterpretacao(
    nome: string,
    faixa: string,
    medidas: Medida[],
    derivados: {
        escoreTotal: number;
        alt: number;
        esquecimento: number;
        interfProativa: number;
        interfRetroativa: number;
        reconAjustado: number;
    }
): string {
    // Index para fácil acesso
    const m: Record<string, Medida> = {};
    for (const med of medidas) m[med.key] = med;

    const parts: string[] = [];
    const a1cls = m.A1?.classificacao?.label || "Médio";
    const totalCls = m.Total?.classificacao?.label || "Médio";

    parts.push(
        `O desempenho de ${nome} no RAVLT foi analisado com base nas normas para a faixa etária ${faixa} anos.`
    );

    // Span atencional inicial (A1)
    if (m.A1) {
        const spanDesc = descNivel(
            m.A1.pct,
            "abaixo do esperado",
            "dentro da média esperada",
            "acima do esperado"
        );
        parts.push(
            `O span atencional inicial (A1 = ${m.A1.raw}) encontra-se ${spanDesc} para a faixa etária, indicando capacidade de atenção e registro imediato classificada como ${a1cls}.`
        );
    }

    // Curva de aprendizagem
    if (m.Total && m.ALT) {
        const learningDesc = descNivel(
            m.ALT.pct,
            "um ganho limitado",
            "um ganho adequado",
            "um ganho expressivo"
        );
        parts.push(
            `A curva de aprendizagem ao longo das 5 tentativas (Escore Total = ${derivados.escoreTotal}; classificação: ${totalCls}) revela ${learningDesc} ao longo das repetições (ALT = ${derivados.alt}; classificação: ${m.ALT.classificacao.label}).`
        );
    }

    // Interferência proativa
    if (m.Proat) {
        const proatDesc = descNivel(
            m.Proat.pct,
            "sugere susceptibilidade à interferência proativa",
            "indica adequada resistência à interferência proativa",
            "indica boa resistência à interferência proativa"
        );
        parts.push(
            `O índice de interferência proativa (B1/A1 = ${derivados.interfProativa.toFixed(2)}; classificação: ${m.Proat.classificacao.label}) ${proatDesc}.`
        );
    }

    // Interferência retroativa
    if (m.Retro) {
        const retroDesc = descNivel(
            m.Retro.pct,
            "sugere vulnerabilidade à interferência retroativa",
            "indica adequada resistência à interferência retroativa",
            "indica boa resistência à interferência retroativa"
        );
        parts.push(
            `O índice de interferência retroativa (A6/A5 = ${derivados.interfRetroativa.toFixed(2)}; classificação: ${m.Retro.classificacao.label}) ${retroDesc}.`
        );
    }

    // Evocação tardia + esquecimento
    if (m.A7 && m.Esquec) {
        const retDesc = descNivel(
            m.A7.pct,
            "abaixo do esperado, sugerindo dificuldade na consolidação da memória a longo prazo",
            "dentro da faixa esperada, indicando adequada consolidação da memória",
            "acima do esperado, indicando boa consolidação mnêmica"
        );
        parts.push(
            `A evocação tardia (A7 = ${m.A7.raw}; classificação: ${m.A7.classificacao.label}) encontra-se ${retDesc}. A velocidade de esquecimento (A7/A6 = ${derivados.esquecimento.toFixed(2)}) foi classificada como ${m.Esquec.classificacao.label}.`
        );
    }

    // Reconhecimento
    if (m.Recon) {
        const reconDesc = descNivel(
            m.Recon.pct,
            "abaixo do esperado, sugerindo possível déficit no armazenamento ou na discriminação das informações",
            "dentro do esperado, indicando que a informação foi adequadamente armazenada",
            "acima do esperado, indicando boa capacidade de reconhecimento"
        );
        parts.push(
            `O reconhecimento (escore ajustado = ${derivados.reconAjustado}; classificação: ${m.Recon.classificacao.label}) encontra-se ${reconDesc}.`
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
        if (inst?.sigla !== "RAVLT") {
            throw new Error(`Aplicação não é RAVLT (sigla=${inst?.sigla}).`);
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
            .from("ravlt_brutos")
            .select("*")
            .eq("aplicacao_id", aplicacao_id)
            .single();
        if (errBr) throw new Error(`Erro ao buscar brutos: ${errBr.message}`);
        if (!brutos) throw new Error("Brutos não encontrados pra essa aplicação.");

        // 4. Calcula
        const resultado = calcularRavlt(idade, brutos as Brutos, paciente.nome_completo || "Paciente");

        // 5. Persiste em ravlt_resultados (UPSERT)
        const { error: errUp } = await supabase
            .from("ravlt_resultados")
            .upsert({
                aplicacao_id:     aplicacao_id,
                idade_anos:       resultado.idade.anos,
                idade_meses:      resultado.idade.meses,
                faixa_norma:      resultado.faixa,
                medidas:          resultado.medidas,
                escore_total:     resultado.escoreTotal,
                alt:              resultado.alt,
                esquecimento:     resultado.esquecimento,
                interf_proativa:  resultado.interfProativa,
                interf_retroativa: resultado.interfRetroativa,
                recon_ajustado:   resultado.reconAjustado,
                curva:            resultado.curva,
                interpretacao:    resultado.interpretacao,
                engine_versao:    resultado.engineVersao,
                calculado_em:     new Date().toISOString(),
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
        console.error("[ravlt-calcular]", msg);
        return new Response(
            JSON.stringify({ ok: false, error: msg }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});

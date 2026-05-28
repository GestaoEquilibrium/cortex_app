// ============================================================================
// Supabase Edge Function: pre-cadastro-submit  (Sprint 59)
// ============================================================================
// Finaliza o pré-cadastro de um paciente a partir do token público.
//
// Como esta função é chamada por usuários NÃO AUTENTICADOS (paciente acessou
// pelo link), ela deve ser deployada com:
//
//   supabase functions deploy pre-cadastro-submit --no-verify-jwt
//
// FLUXO:
//   1. POST /functions/v1/pre-cadastro-submit
//      body: { token: UUID, dados: {...campos do paciente}, foto_base64?: string }
//   2. Valida o token (pré_cadastros) — existe, não usado, não expirado
//   3. Valida CPF (obrigatório, 11 dígitos, único no banco)
//   4. Cria auth.user com supabaseAdmin.auth.admin.createUser
//        - email  = "{cpf}@portal.cortex.local"  (Supabase exige email único)
//        - senha  = CPF (paciente troca no 1º login)
//        - email_confirm = true (para login imediato)
//   5. Insere o paciente em `pacientes` com portal_user_id = auth.user.id
//   6. Se houver foto_base64, faz upload em pacientes-fotos/<paciente_id>.jpg
//      e atualiza pacientes.foto_url
//   7. Marca pre_cadastros.usado_em = NOW() e paciente_id = novo paciente
//   8. Retorna { ok: true, paciente_id, cpf, mensagem }
//
// Erros possíveis (status 400):
//   - token_invalido / token_expirado / token_ja_utilizado
//   - cpf_obrigatorio / cpf_invalido / cpf_ja_cadastrado
//   - dados_invalidos
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function jsonResponse(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}

function erroResponse(codigo: string, mensagem: string, status = 400) {
    return jsonResponse({ ok: false, erro: codigo, mensagem }, status);
}

function limparCpf(cpf: string): string {
    return String(cpf || "").replace(/\D/g, "");
}

function validarCpf(cpf: string): boolean {
    const c = limparCpf(cpf);
    if (c.length !== 11) return false;
    if (/^(\d)\1+$/.test(c)) return false;  // 11111111111, 22222222222, ...
    let soma = 0;
    for (let i = 0; i < 9; i++) soma += parseInt(c[i]) * (10 - i);
    let d1 = (soma * 10) % 11;
    if (d1 === 10) d1 = 0;
    if (d1 !== parseInt(c[9])) return false;
    soma = 0;
    for (let i = 0; i < 10; i++) soma += parseInt(c[i]) * (11 - i);
    let d2 = (soma * 10) % 11;
    if (d2 === 10) d2 = 0;
    return d2 === parseInt(c[10]);
}

// Campos do cadastro de paciente que aceitamos no submit (whitelist)
const CAMPOS_PERMITIDOS = [
    "nome_completo", "nome_social", "sexo", "data_nascimento", "cpf", "rg",
    "escolaridade", "escolaridade_serie", "profissao", "estado_civil",
    "convenio_id", "numero_convenio",
    "telefone", "email", "endereco", "cidade", "cep",
    "mae_nome", "mae_telefone",
    "pai_nome", "pai_telefone",
    "responsavel_nome", "responsavel_parentesco", "responsavel_telefone", "responsavel_email",
    "encaminhado_por", "medico_referencia", "medico_crm",
    "medico_clinica", "medico_telefone",
    "observacoes",
];

function sanitizarDados(dados: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const k of CAMPOS_PERMITIDOS) {
        if (k in dados) {
            const v = dados[k];
            if (v === "" || v === undefined) continue;
            out[k] = v;
        }
    }
    return out;
}

// Converte base64 (com ou sem prefixo data:) em Uint8Array
function base64ToBytes(base64: string): Uint8Array {
    const semPrefixo = base64.replace(/^data:[^;]+;base64,/, "");
    const bin = atob(semPrefixo);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
}

// ────────────────────────────────────────────────────────────────────────────
// Handler
// ────────────────────────────────────────────────────────────────────────────

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    if (req.method !== "POST") {
        return erroResponse("metodo_invalido", "Use POST.", 405);
    }

    let body: { token?: string; dados?: Record<string, unknown>; foto_base64?: string };
    try {
        body = await req.json();
    } catch {
        return erroResponse("body_invalido", "Body JSON inválido.");
    }

    const token = body.token;
    const dadosBrutos = body.dados || {};
    const fotoBase64 = body.foto_base64 || null;

    if (!token || typeof token !== "string") {
        return erroResponse("token_invalido", "Token ausente.");
    }

    // Cliente admin (service_role)
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1) Valida token
    const { data: pc, error: errToken } = await supabase
        .from("pre_cadastros")
        .select("token, usado_em, expires_at, created_by")
        .eq("token", token)
        .maybeSingle();

    if (errToken) {
        return erroResponse("erro_interno", `Erro ao buscar token: ${errToken.message}`, 500);
    }
    if (!pc) {
        return erroResponse("token_invalido", "Link inválido. Solicite um novo à clínica.");
    }
    if (pc.usado_em) {
        return erroResponse("token_ja_utilizado", "Este link já foi usado.");
    }
    if (new Date(pc.expires_at) <= new Date()) {
        return erroResponse("token_expirado", "Este link expirou. Solicite um novo à clínica.");
    }

    // 2) Sanitiza e valida dados
    const dados = sanitizarDados(dadosBrutos);

    // Sprint 59.1: campos obrigatórios (espelha a validação do frontend)
    const obrigatorios: [string, string][] = [
        ["nome_completo", "Nome completo"],
        ["sexo", "Sexo"],
        ["data_nascimento", "Data de nascimento"],
        ["cpf", "CPF"],
        ["escolaridade", "Escolaridade"],
        ["profissao", "Profissão"],
        ["estado_civil", "Estado civil"],
        ["telefone", "Telefone"],
        ["email", "E-mail"],
        ["endereco", "Endereço"],
        ["cidade", "Cidade"],
        ["cep", "CEP"],
        ["mae_nome", "Nome da mãe"],
        ["mae_telefone", "Telefone da mãe"],
        ["medico_referencia", "Médico de referência"],
    ];
    const faltando = obrigatorios.filter(([c]) => !dados[c]).map(([, l]) => l);
    if (faltando.length > 0) {
        return erroResponse(
            "campos_obrigatorios",
            `Preencha os campos obrigatórios: ${faltando.join(", ")}.`
        );
    }

    if (!dados.nome_completo || String(dados.nome_completo).trim().length < 3) {
        return erroResponse("nome_obrigatorio", "Nome completo é obrigatório.");
    }
    if (!dados.sexo) {
        return erroResponse("sexo_obrigatorio", "Sexo é obrigatório.");
    }
    if (!dados.data_nascimento) {
        return erroResponse("data_nascimento_obrigatoria", "Data de nascimento é obrigatória.");
    }

    const cpf = limparCpf(String(dados.cpf || ""));
    if (!cpf) {
        return erroResponse("cpf_obrigatorio", "CPF é obrigatório.");
    }
    if (!validarCpf(cpf)) {
        return erroResponse("cpf_invalido", "CPF inválido.");
    }
    dados.cpf = cpf;  // salva limpo

    // 3) Verifica CPF duplicado
    const { data: dupli, error: errDup } = await supabase
        .from("pacientes")
        .select("id")
        .eq("cpf", cpf)
        .maybeSingle();
    if (errDup) {
        return erroResponse("erro_interno", `Erro checando duplicidade: ${errDup.message}`, 500);
    }
    if (dupli) {
        return erroResponse("cpf_ja_cadastrado", "Este CPF já está cadastrado. Entre em contato com a clínica.");
    }

    // 4) Cria auth.user
    // Email sintético para satisfazer o Supabase (que exige email único).
    // Senha = CPF (paciente troca no primeiro login).
    const emailSint = `${cpf}@portal.cortex.local`;

    // Se já existe (por algum motivo), tenta reaproveitar; senão cria.
    let portalUserId: string | null = null;
    {
        const { data: existing } = await supabase.auth.admin.listUsers();
        const ja = existing?.users?.find((u: { email?: string }) => u.email === emailSint);
        if (ja) {
            portalUserId = ja.id;
        }
    }

    if (!portalUserId) {
        const { data: novoUser, error: errAuth } = await supabase.auth.admin.createUser({
            email: emailSint,
            password: cpf,
            email_confirm: true,
            user_metadata: {
                nome: dados.nome_completo,
                cpf: cpf,
                criado_por: "pre_cadastro",
            },
        });
        if (errAuth || !novoUser?.user?.id) {
            return erroResponse(
                "erro_auth",
                `Erro ao criar acesso: ${errAuth?.message || "desconhecido"}`,
                500
            );
        }
        portalUserId = novoUser.user.id;
    }

    // 5) Cria o paciente
    const pacientePayload = {
        ...dados,
        portal_user_id: portalUserId,
    };

    const { data: novoPac, error: errPac } = await supabase
        .from("pacientes")
        .insert(pacientePayload)
        .select("id")
        .single();

    if (errPac || !novoPac?.id) {
        // Rollback do auth user pra não deixar lixo
        if (portalUserId) {
            await supabase.auth.admin.deleteUser(portalUserId).catch(() => {});
        }
        return erroResponse(
            "erro_paciente",
            `Erro ao cadastrar paciente: ${errPac?.message || "desconhecido"}`,
            500
        );
    }

    const pacienteId = novoPac.id;

    // 6) Foto (opcional)
    let fotoUrl: string | null = null;
    if (fotoBase64) {
        try {
            const bytes = base64ToBytes(fotoBase64);

            // Limite defensivo de tamanho (~3MB)
            if (bytes.length > 3 * 1024 * 1024) {
                console.warn("Foto muito grande, ignorando", bytes.length);
            } else {
                // Detecta extensão pelo prefixo
                let ext = "jpg";
                if (fotoBase64.startsWith("data:image/png")) ext = "png";
                else if (fotoBase64.startsWith("data:image/webp")) ext = "webp";

                // Mesmo padrão usado pela pasta.html: <pacienteId>/perfil.<ext>
                const path = `${pacienteId}/perfil.${ext}`;
                const { error: errUp } = await supabase.storage
                    .from("pacientes-fotos")
                    .upload(path, bytes, {
                        contentType: `image/${ext}`,
                        upsert: true,
                    });

                if (!errUp) {
                    fotoUrl = path;  // path relativo no bucket — pasta.html resolve via signed URL
                    await supabase
                        .from("pacientes")
                        .update({ foto_url: fotoUrl })
                        .eq("id", pacienteId);
                }
            }
        } catch (e) {
            console.warn("Falha ao salvar foto:", e);
            // Não falha o cadastro por causa da foto
        }
    }

    // 7) Marca token como usado
    await supabase
        .from("pre_cadastros")
        .update({ usado_em: new Date().toISOString(), paciente_id: pacienteId })
        .eq("token", token);

    // 8) Resposta
    return jsonResponse({
        ok: true,
        paciente_id: pacienteId,
        cpf: cpf,
        url_portal: "https://cortexneuro.com.br/portal/",
        mensagem: "Cadastro concluído com sucesso!",
    });
});

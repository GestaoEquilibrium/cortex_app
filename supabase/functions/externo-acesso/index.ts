// ============================================================================
// CORTEX — Edge Function `externo-acesso`
// ----------------------------------------------------------------------------
// Porta de entrada da área externa (o QR do laudo).
//
// Só esta função fala com as funções externo_* do banco, usando service_role.
// O profissional de fora nunca recebe um token do Supabase Auth, então ele não
// existe para nenhuma policy do CORTEX — não tem como ele consultar tabela.
//
// Ações:
//   resolver     { token }                        → de quem é o QR (rótulo só)
//   cadastrar    { token, nome, email, senha, ...}→ entra como pendente
//   login        { email, senha }                 → devolve sessão opaca
//   painel       { sessao, token? }               → situação + liberados
//   solicitar    { sessao, token, mensagem? }     → pede aquele prontuário
//   prontuario   { sessao, paciente_id }          → evoluções e laudos liberados
//   laudo        { sessao, laudo_id }             → URL assinada de 2 min
//   logout       { sessao }
//
// verify_jwt = false no config.toml: a página é pública.
// ============================================================================

const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...CORS, "Content-Type": "application/json" },
    });
}

// Chama uma função do banco direto pelo PostgREST, com service_role.
async function rpc(nome: string, args: Record<string, unknown>) {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${nome}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            apikey: SERVICE_KEY,
            Authorization: `Bearer ${SERVICE_KEY}`,
        },
        body: JSON.stringify(args),
    });
    const texto = await resp.text();
    if (!resp.ok) {
        console.error(`[externo-acesso] rpc ${nome} ${resp.status}: ${texto}`);
        throw new Error(`rpc_${nome}_${resp.status}`);
    }
    return texto ? JSON.parse(texto) : null;
}

// URL assinada e curta para o PDF do laudo. O externo nunca recebe a anon key
// nem fala com o storage: ele recebe um link que morre em 2 minutos.
async function assinarArquivo(bucket: string, path: string, segundos = 120) {
    const resp = await fetch(
        `${SUPABASE_URL}/storage/v1/object/sign/${bucket}/${path}`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                apikey: SERVICE_KEY,
                Authorization: `Bearer ${SERVICE_KEY}`,
            },
            body: JSON.stringify({ expiresIn: segundos }),
        },
    );
    const texto = await resp.text();
    if (!resp.ok) {
        console.error(`[externo-acesso] sign ${resp.status}: ${texto}`);
        throw new Error("falha_assinar_arquivo");
    }
    const { signedURL } = JSON.parse(texto);
    return `${SUPABASE_URL}/storage/v1${signedURL}`;
}

const str = (v: unknown, max = 200): string | null => {
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    return s ? s.slice(0, max) : null;
};

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
    if (req.method !== "POST") return json({ ok: false, erro: "metodo" }, 405);

    let corpo: Record<string, unknown>;
    try {
        corpo = await req.json();
    } catch {
        return json({ ok: false, erro: "json_invalido" }, 400);
    }

    const acao = String(corpo.acao || "");
    const ip = req.headers.get("cf-connecting-ip") ||
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
    const ua = req.headers.get("user-agent")?.slice(0, 300) || null;

    try {
        switch (acao) {
            case "resolver": {
                const token = str(corpo.token, 64);
                if (!token) return json({ ok: false, erro: "token_ausente" }, 400);
                return json(await rpc("externo_qr_resolver", { p_token: token }));
            }

            case "cadastrar": {
                if (corpo.aceite !== true) {
                    return json({ ok: false, erro: "aceite_obrigatorio" }, 400);
                }
                const r = await rpc("externo_autocadastro", {
                    p_token: str(corpo.token, 64),
                    p_nome: str(corpo.nome, 160),
                    p_email: str(corpo.email, 160),
                    p_senha: typeof corpo.senha === "string" ? corpo.senha : "",
                    p_telefone: str(corpo.telefone, 40),
                    p_conselho: str(corpo.conselho, 20),
                    p_registro: str(corpo.registro, 40),
                    p_especialidade: str(corpo.especialidade, 120),
                    p_clinica_nome: str(corpo.clinica_nome, 160),
                    p_cpf: str(corpo.cpf, 20),
                    p_ip: ip,
                    p_ua: ua,
                });
                return json(r);
            }

            case "login": {
                const r = await rpc("externo_login", {
                    p_email: str(corpo.email, 160),
                    p_senha: typeof corpo.senha === "string" ? corpo.senha : "",
                    p_ip: ip,
                    p_ua: ua,
                });
                return json(r);
            }

            case "painel": {
                const sessao = str(corpo.sessao, 120);
                if (!sessao) return json({ ok: false, erro: "sessao_invalida" });
                return json(await rpc("externo_painel", {
                    p_sessao: sessao,
                    p_token: str(corpo.token, 64),
                }));
            }

            case "solicitar": {
                const sessao = str(corpo.sessao, 120);
                const token = str(corpo.token, 64);
                if (!sessao) return json({ ok: false, erro: "sessao_invalida" });
                if (!token) return json({ ok: false, erro: "token_ausente" }, 400);
                return json(await rpc("externo_solicitar_acesso", {
                    p_sessao: sessao,
                    p_token: token,
                    p_mensagem: str(corpo.mensagem, 500),
                    p_ip: ip,
                    p_ua: ua,
                }));
            }

            case "prontuario": {
                const sessao = str(corpo.sessao, 120);
                const paciente = str(corpo.paciente_id, 64);
                if (!sessao) return json({ ok: false, erro: "sessao_invalida" });
                if (!paciente) return json({ ok: false, erro: "paciente_ausente" }, 400);
                return json(await rpc("externo_prontuario", {
                    p_sessao: sessao,
                    p_paciente_id: paciente,
                }));
            }

            case "laudo": {
                const sessao = str(corpo.sessao, 120);
                const laudo = str(corpo.laudo_id, 64);
                if (!sessao) return json({ ok: false, erro: "sessao_invalida" });
                if (!laudo) return json({ ok: false, erro: "laudo_ausente" }, 400);

                const r = await rpc("externo_laudo_arquivo", {
                    p_sessao: sessao,
                    p_laudo_id: laudo,
                });
                if (!r?.ok) return json(r);
                if (!r.path) return json({ ok: false, erro: "arquivo_ausente" });

                const url = await assinarArquivo(r.bucket, r.path);
                return json({ ok: true, url, nome: r.nome, assinado: r.assinado });
            }

            case "logout": {
                const sessao = str(corpo.sessao, 120);
                if (!sessao) return json({ ok: true });
                return json(await rpc("externo_logout", { p_sessao: sessao }));
            }

            default:
                return json({ ok: false, erro: "acao_desconhecida" }, 400);
        }
    } catch (err) {
        console.error("[externo-acesso]", acao, err);
        return json({ ok: false, erro: "falha_interna" }, 500);
    }
});

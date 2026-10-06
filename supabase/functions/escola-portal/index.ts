// ============================================================================
// CORTEX — Edge Function `escola-portal`
// ----------------------------------------------------------------------------
// Porta de entrada do portal da escola (o QR/link por paciente).
//
// Só esta função fala com as funções escola_* do banco, usando service_role.
// A escola não recebe token do Supabase Auth: ela não existe para nenhuma
// policy do CORTEX, então não tem como consultar tabela nem bucket.
//
// Ações (JSON):
//   abrir        { token }                            → aluno, escalas, situação
//   identificar  { token, escola, nome, funcao, cpf }  → quem está preenchendo
//   escala       { token, aplicacao_id }               → itens para responder
//   salvar       { token, aplicacao_id, respostas }    → autosave
//   finalizar    { token, aplicacao_id, respostas }    → pontua e marca escola
//
// Anexo (multipart/form-data):
//   campos: token, arquivo, titulo?
//   Só PDF, JPG e PNG, até 10 MB, no máximo 5 por link. Sem esse teto o
//   endpoint viraria depósito aberto, já que não tem login.
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

const BUCKET = "documentos-paciente";
const MAX_BYTES = 10 * 1024 * 1024;
const TIPOS: Record<string, string> = {
    "application/pdf": "pdf",
    "image/jpeg": "jpg",
    "image/png": "png",
};

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...CORS, "Content-Type": "application/json" },
    });
}

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
        console.error(`[escola-portal] rpc ${nome} ${resp.status}: ${texto}`);
        throw new Error(`rpc_${nome}_${resp.status}`);
    }
    return texto ? JSON.parse(texto) : null;
}

// Sobe o arquivo no bucket com service_role. O caminho vem do banco, que
// sabe de qual paciente é — a escola nunca recebe o id do paciente.
async function subirArquivo(path: string, corpo: Blob, contentType: string) {
    const resp = await fetch(
        `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${encodeURI(path)}`,
        {
            method: "POST",
            headers: {
                apikey: SERVICE_KEY,
                Authorization: `Bearer ${SERVICE_KEY}`,
                "Content-Type": contentType,
                "x-upsert": "false",
            },
            body: corpo,
        },
    );
    if (!resp.ok) {
        const t = await resp.text();
        console.error(`[escola-portal] upload ${resp.status}: ${t}`);
        throw new Error("upload_falhou");
    }
}

async function remover(path: string) {
    await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${encodeURI(path)}`, {
        method: "DELETE",
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    }).catch(() => {});
}

// ── Anexo ───────────────────────────────────────────────────────────────────

async function anexar(req: Request) {
    const form = await req.formData();
    const token = String(form.get("token") || "");
    const titulo = String(form.get("titulo") || "");
    const arquivo = form.get("arquivo");

    if (!token) return json({ erro: "token_ausente" }, 400);
    if (!(arquivo instanceof File)) return json({ erro: "arquivo_ausente" }, 400);

    const ext = TIPOS[arquivo.type];
    if (!ext) return json({ erro: "tipo_nao_permitido", tipo: arquivo.type }, 400);
    if (arquivo.size <= 0) return json({ erro: "arquivo_vazio" }, 400);
    if (arquivo.size > MAX_BYTES) return json({ erro: "arquivo_grande", limite_mb: 10 }, 400);

    // O banco valida token, identificação e o teto de 5, e devolve o caminho.
    const prep = await rpc("escola_preparar_anexo", { p_token: token, p_ext: ext });
    if (!prep?.ok) return json(prep ?? { erro: "falha" }, 400);

    // O File vai direto como corpo: não faz sentido copiar 10 MB para um
    // Uint8Array só para repassar.
    await subirArquivo(prep.path, arquivo, arquivo.type);

    // Sem a linha na tabela o bucket não acha o dono e o arquivo fica
    // invisível para todos. Se o registro falhar, tira o arquivo.
    try {
        const reg = await rpc("escola_registrar_anexo", {
            p_token: token,
            p_path: prep.path,
            p_nome: arquivo.name,
            p_bytes: arquivo.size,
            p_titulo: titulo || null,
        });
        if (!reg?.ok) {
            await remover(prep.path);
            return json(reg ?? { erro: "falha" }, 400);
        }
        return json({ ok: true });
    } catch (err) {
        await remover(prep.path);
        throw err;
    }
}

// ── Roteamento ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
    if (req.method !== "POST") return json({ erro: "metodo" }, 405);

    try {
        const tipo = req.headers.get("content-type") || "";
        if (tipo.includes("multipart/form-data")) return await anexar(req);

        const corpo = await req.json().catch(() => ({}));
        const acao = corpo.acao;
        const token = corpo.token;

        if (!acao) return json({ erro: "acao_ausente" }, 400);
        if (!token) return json({ erro: "token_ausente" }, 400);

        switch (acao) {
            case "abrir":
                return json(await rpc("escola_abrir", { p_token: token }));

            case "identificar":
                return json(await rpc("escola_identificar", {
                    p_token: token,
                    p_escola: corpo.escola ?? "",
                    p_nome: corpo.nome ?? "",
                    p_funcao: corpo.funcao ?? "",
                    p_cpf: corpo.cpf ?? "",
                }));

            case "escala":
                return json(await rpc("escola_escala", {
                    p_token: token,
                    p_aplicacao_id: corpo.aplicacao_id,
                }));

            case "salvar":
                return json(await rpc("escola_salvar_parcial", {
                    p_token: token,
                    p_aplicacao_id: corpo.aplicacao_id,
                    p_respostas: corpo.respostas ?? {},
                }));

            case "finalizar":
                return json(await rpc("escola_finalizar", {
                    p_token: token,
                    p_aplicacao_id: corpo.aplicacao_id,
                    p_respostas: corpo.respostas ?? {},
                }));

            default:
                return json({ erro: "acao_desconhecida", acao }, 400);
        }
    } catch (err) {
        console.error("[escola-portal]", err);
        return json({ erro: "falha_interna" }, 500);
    }
});

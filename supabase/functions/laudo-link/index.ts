// ============================================================================
// CORTEX — Edge Function `laudo-link`  (Laudo Online LO-9)
// ----------------------------------------------------------------------------
// O link curto do laudo (cortexneuro.com.br/l/?CODIGO). Quem abre não faz
// login e não recebe nenhuma chave: só a página do laudo finalizado, sem notas
// internas. Imagens e foto saem como links assinados de 10 minutos.
//
// Ação única: POST { codigo } → { ok, versao, errata, snapshot, imagens, foto }
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
        headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
}

async function rpc(nome: string, args: Record<string, unknown>) {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${nome}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
        body: JSON.stringify(args),
    });
    const texto = await resp.text();
    if (!resp.ok) {
        console.error(`[laudo-link] rpc ${nome} ${resp.status}: ${texto}`);
        throw new Error(`rpc_${nome}_${resp.status}`);
    }
    return texto ? JSON.parse(texto) : null;
}

async function assinar(bucket: string, path: string, segundos = 600) {
    const resp = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${bucket}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
        body: JSON.stringify({ expiresIn: segundos }),
    });
    const texto = await resp.text();
    if (!resp.ok) throw new Error(`sign_${resp.status}`);
    const { signedURL } = JSON.parse(texto);
    return `${SUPABASE_URL}/storage/v1${signedURL}`;
}

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
    if (req.method !== "POST") return json({ ok: false, erro: "metodo" }, 405);
    let corpo: Record<string, unknown>;
    try { corpo = await req.json(); } catch { return json({ ok: false, erro: "json_invalido" }, 400); }

    const codigo = typeof corpo.codigo === "string" ? corpo.codigo.trim().slice(0, 32) : "";
    if (!/^[A-Za-z0-9]{6,20}$/.test(codigo)) return json({ ok: false, erro: "invalido" });

    try {
        const r = await rpc("link_laudo_abrir", { p_codigo: codigo });
        if (!r?.ok) return json(r || { ok: false, erro: "invalido" });

        const arquivos: string[] = [];
        for (const s of (r.snapshot?.documento?.secoes || [])) {
            for (const b of (s?.blocos || [])) {
                if (b?.tipo === "imagem" && typeof b.arquivo === "string" && b.arquivo) arquivos.push(b.arquivo);
            }
        }
        const imagens: Record<string, string> = {};
        for (const a of arquivos.slice(0, 60)) {
            try { imagens[a] = await assinar("laudos-midia", a); } catch (_) { /* segue sem */ }
        }
        let foto: string | null = null;
        const fotoPath = r.snapshot?.dados?.paciente?.foto_url;
        if (typeof fotoPath === "string" && fotoPath && !/^https?:/i.test(fotoPath)) {
            try { foto = await assinar("pacientes-fotos", fotoPath); } catch (_) { foto = null; }
        }
        return json({ ...r, imagens, foto });
    } catch (err) {
        console.error("[laudo-link]", err);
        return json({ ok: false, erro: "falha_interna" }, 500);
    }
});

// ============================================================================
// CORTEX neuro â€” Edge Function: assinar-documento
// ----------------------------------------------------------------------------
// Assina, com o certificado A1 ICP-Brasil guardado nos secrets, um PDF do
// prontuÃ¡rio â€” da aba Documentos ou da aba Laudo. O selo visÃ­vel vai
// exatamente onde o profissional escolheu na tela.
//
// Base: a funÃ§Ã£o assinar-pdf do CORTEX aba, com UMA diferenÃ§a deliberada.
// LÃ¡ o PDF nasce no navegador (html2pdf), e o plainAddPlaceholder dÃ¡ conta.
// Aqui o PDF chega de fora â€” Word, Adobe, scanner â€”, quase sempre com a tabela
// de referÃªncias em stream (PDF 1.5+). Testado: o plainAddPlaceholder quebra
// nesses arquivos ("Expected xref at NaN"). Por isso o pdf-lib: ele lÃª
// qualquer PDF e ainda desenha o selo na posiÃ§Ã£o pedida.
//
// Verificado antes de subir: assinatura vÃ¡lida nos dois tipos de PDF, cobrindo
// o arquivo inteiro, e alterar um Ãºnico byte depois invalida.
//
// SEGURANÃ‡A
//   Â· Assinam admin clÃ­nico e admin gestor, pelo certificado do titular â€”
//     mesma regra do CORTEX aba (direÃ§Ã£o e suporte).
//   Â· O selo e a assinatura sempre levam o nome do TITULAR do certificado.
//     Quem de fato clicou fica na auditoria, gravado separado do titular.
//   Â· Verify JWT desligado no config, como no CORTEX aba: a funÃ§Ã£o valida o
//     token sozinha, contra o servidor de autenticaÃ§Ã£o.
//   Â· Assina sempre o ORIGINAL guardado no bucket, nunca um arquivo enviado
//     pelo navegador â€” o que se assina Ã© o que estÃ¡ no prontuÃ¡rio.
//   Â· Cada assinatura Ã© registrada na auditoria pelo servidor.
//
// Secrets: CERT_A1_B64 (o .pfx em base64), CERT_A1_SENHA
// ============================================================================

import { createClient } from "npm:@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";
import { pdflibAddPlaceholder } from "npm:@signpdf/placeholder-pdf-lib@3.2.4";
import { SignPdf } from "npm:@signpdf/signpdf@3.2.4";
import { P12Signer } from "npm:@signpdf/signer-p12@3.2.4";
import forge from "npm:node-forge@1.3.1";
import { Buffer } from "node:buffer";

// Dois tipos de arquivo, com o mesmo nÃºcleo de assinatura.
//
// AtenÃ§Ã£o ao `ativo`, que significa coisas diferentes nas duas tabelas:
//   documentos_paciente â†’ ativo = false quer dizer APAGADO (nÃ£o assina)
//   laudos_paciente     â†’ ativo = false quer dizer VERSÃƒO ANTIGA (assina)
// Reaproveitar a mesma checagem recusaria assinar versÃµes histÃ³ricas do
// laudo achando que tinham sido apagadas.
const TIPOS = {
    documento: { tabela: "documentos_paciente", bucket: "documentos-paciente", ativoEhExistencia: true,  rotulo: "documento" },
    laudo:     { tabela: "laudos_paciente",     bucket: "laudos",              ativoEhExistencia: false, rotulo: "laudo" },
} as const;

const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (o: unknown, status = 200) =>
    new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

/** LÃª titular e CPF do prÃ³prio certificado. ICP-Brasil grava o CN como "NOME:CPF". */
function titularDoCertificado(p12: Buffer, senha: string) {
    const asn1 = forge.asn1.fromDer(forge.util.createBuffer(p12.toString("binary")));
    const pk = forge.pkcs12.pkcs12FromAsn1(asn1, senha);
    const bags = pk.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || [];
    const cert = bags[0]?.cert;
    if (!cert) throw new Error("Certificado sem dados do titular.");
    const cn = String(cert.subject.getField("CN")?.value || "");
    const [nome, cpf = ""] = cn.split(":");
    const cpfMasc = cpf.length === 11 ? `***.***.${cpf.slice(6, 9)}-${cpf.slice(9)}` : "";
    return { nome: nome.trim(), cpfMasc };
}

async function assinar(pdfBytes: Uint8Array, p12: Buffer, senha: string,
                       pos: { pagina: number; x: number; y: number }) {
    const { nome, cpfMasc } = titularDoCertificado(p12, senha);

    const doc = await PDFDocument.load(pdfBytes);
    const paginas = doc.getPages();
    if (pos.pagina < 0 || pos.pagina >= paginas.length) throw new Error("PÃ¡gina invÃ¡lida.");
    const pagina = paginas[pos.pagina];
    const { width: W, height: H } = pagina.getSize();

    const fb = await doc.embedFont(StandardFonts.HelveticaBold);
    const fr = await doc.embedFont(StandardFonts.Helvetica);

    // x e y chegam como FRAÃ‡ÃƒO da pÃ¡gina (0..1), a partir do canto superior
    // esquerdo, e marcam o CENTRO do selo â€” assim o ponto clicado na tela
    // vira o mesmo ponto no PDF, seja qual for o zoom.
    const w = 240, h = 52;
    const x = Math.max(4, Math.min(W - w - 4, pos.x * W - w / 2));
    const y = Math.max(4, Math.min(H - h - 4, H - pos.y * H - h / 2));
    const agora = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

    pagina.drawRectangle({
        x, y, width: w, height: h, color: rgb(0.94, 0.96, 1),
        borderColor: rgb(0.12, 0.30, 0.62), borderWidth: 1.2,
    });
    const linhas: [string, typeof fb, number, ReturnType<typeof rgb>][] = [
        ["Documento assinado digitalmente", fb, 8.5, rgb(0.07, 0.2, 0.36)],
        [`${nome.toUpperCase()}${cpfMasc ? " Â· CPF " + cpfMasc : ""}`, fb, 6.6, rgb(0.07, 0.2, 0.36)],
        [`Certificado ICP-Brasil Â· ${agora}`, fr, 6.4, rgb(0.2, 0.28, 0.4)],
        ["Verifique em validar.iti.gov.br", fr, 6.4, rgb(0.2, 0.28, 0.4)],
    ];
    let ly = y + h - 12;
    for (const [t, f, sz, cor] of linhas) {
        const tw = f.widthOfTextAtSize(t, sz);
        pagina.drawText(t, { x: x + (w - tw) / 2, y: ly, size: sz, font: f, color: cor });
        ly -= 11;
    }

    pdflibAddPlaceholder({
        pdfDoc: doc,
        reason: "Documento clinico - Equilibrium",
        contactInfo: "",
        name: nome,
        location: "Uberlandia/MG",
        signatureLength: 16384,
    });
    const comPlaceholder = Buffer.from(await doc.save({ useObjectStreams: false }));
    const signer = new P12Signer(p12, { passphrase: senha });
    const assinado = await new SignPdf().sign(comPlaceholder, signer);
    return { pdf: assinado, nome, cpfMasc };
}

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

    try {
        // â”€â”€ 1) Quem estÃ¡ pedindo â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
        if (!token) return json({ ok: false, erro: "SessÃ£o ausente." }, 401);

        const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
        const { data: { user } } = await admin.auth.getUser(token);
        if (!user) return json({ ok: false, erro: "SessÃ£o invÃ¡lida. Entre de novo no sistema." }, 401);

        const { data: prof } = await admin.from("profissionais")
            .select("id, nome_completo, perfil").eq("auth_user_id", user.id).eq("ativo", true).maybeSingle();
        if (!prof) return json({ ok: false, erro: "Profissional nÃ£o encontrado ou inativo." }, 403);

        if (!["admin_clinico", "admin_gestor"].includes(prof.perfil)) {
            return json({ ok: false, erro: "Apenas administradores podem assinar com o certificado digital." }, 403);
        }

        // â”€â”€ 2) O que assinar e onde â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const body = await req.json();
        const tipo = (body.tipo || "documento") as keyof typeof TIPOS;
        const cfg = TIPOS[tipo];
        if (!cfg) return json({ ok: false, erro: "Tipo de arquivo invÃ¡lido." }, 400);
        const registroId = body.id || body.documento_id;
        if (!registroId) return json({ ok: false, erro: "Arquivo nÃ£o informado." }, 400);
        const { pagina, x, y } = body;
        const pos = { pagina: Number(pagina), x: Number(x), y: Number(y) };
        if (![pos.pagina, pos.x, pos.y].every(Number.isFinite) || pos.x < 0 || pos.x > 1 || pos.y < 0 || pos.y > 1) {
            return json({ ok: false, erro: "PosiÃ§Ã£o da assinatura invÃ¡lida." }, 400);
        }

        const { data: docRow, error: eDoc } = await admin.from(cfg.tabela)
            .select("*").eq("id", registroId).maybeSingle();
        if (eDoc || !docRow || (cfg.ativoEhExistencia && docRow.ativo === false)) {
            return json({ ok: false, erro: `O ${cfg.rotulo} nÃ£o foi encontrado.` }, 404);
        }
        if (docRow.arquivo_assinado_path) {
            return json({ ok: false, erro: `Este ${cfg.rotulo} jÃ¡ estÃ¡ assinado.` }, 409);
        }
        const tituloArq = docRow.titulo || (docRow.versao ? `Laudo v${docRow.versao}` : cfg.rotulo);

        const certB64 = Deno.env.get("CERT_A1_B64"), senha = Deno.env.get("CERT_A1_SENHA");
        if (!certB64 || !senha) return json({ ok: false, erro: "Certificado nÃ£o configurado nos secrets." }, 500);

        // â”€â”€ 3) Baixa o ORIGINAL do prontuÃ¡rio e assina â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const { data: arq, error: eDown } = await admin.storage.from(cfg.bucket).download(docRow.arquivo_path);
        if (eDown || !arq) return json({ ok: false, erro: "NÃ£o consegui abrir o arquivo original." }, 500);

        let resultado;
        try {
            resultado = await assinar(new Uint8Array(await arq.arrayBuffer()),
                                      Buffer.from(certB64, "base64"), senha, pos);
        } catch (e) {
            const m = (e as Error).message || "";
            // PDF com senha de abertura nÃ£o pode ser modificado para assinar
            if (/encrypt/i.test(m)) return json({ ok: false, erro: "O PDF estÃ¡ protegido por senha e nÃ£o pode ser assinado." }, 422);
            if (/mac|password|invalid/i.test(m)) return json({ ok: false, erro: "Senha do certificado incorreta nos secrets." }, 500);
            throw e;
        }

        // â”€â”€ 4) Guarda a versÃ£o assinada ao lado do original â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const caminho = `${docRow.paciente_id}/assinados/${docRow.id}_${Date.now()}.pdf`;
        const { error: eUp } = await admin.storage.from(cfg.bucket)
            .upload(caminho, resultado.pdf, { contentType: "application/pdf", upsert: false });
        if (eUp) return json({ ok: false, erro: "Assinei, mas nÃ£o consegui guardar: " + eUp.message }, 500);

        const assinadoEm = new Date().toISOString();
        const { error: eUpd } = await admin.from(cfg.tabela).update({
            arquivo_assinado_path: caminho,
            assinado_em: assinadoEm,
            assinado_por: prof.id,
            assinante_nome: resultado.nome,
            assinatura_posicao: pos,
        }).eq("id", docRow.id);
        if (eUpd) {
            await admin.storage.from(cfg.bucket).remove([caminho]).catch(() => {});
            return json({ ok: false, erro: "NÃ£o consegui registrar a assinatura: " + eUpd.message }, 500);
        }

        // â”€â”€ 5) Auditoria pelo servidor â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        await admin.from("auditoria_acessos").insert({
            profissional_id: prof.id,
            acao: "edicao",
            tabela: cfg.tabela,
            registro_id: docRow.id,
            paciente_id: docRow.paciente_id,
            detalhes: {
                operacao: tipo === "laudo" ? "assinar_laudo" : "assinar_documento",
                titulo: tituloArq,
                certificado: "ICP-Brasil A1",
                // O PDF mostra sÃ³ o titular. Quem clicou fica aqui.
                titular_certificado: resultado.nome,
                operador: prof.nome_completo,
                operador_id: prof.id,
                operador_perfil: prof.perfil,
                posicao: pos,
            },
        });

        return json({ ok: true, assinado_em: assinadoEm, assinante: resultado.nome });
    } catch (e) {
        return json({ ok: false, erro: (e as Error).message || "Erro ao assinar." }, 500);
    }
});

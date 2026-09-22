// ============================================================================
// CORTEX neuro — Edge Function: assinar-documento
// ----------------------------------------------------------------------------
// Assina, com o certificado A1 ICP-Brasil guardado nos secrets, um PDF já
// anexado na aba Documentos do prontuário. O selo visível vai exatamente onde
// o profissional escolheu na tela.
//
// Base: a função assinar-pdf do CORTEX aba, com UMA diferença deliberada.
// Lá o PDF nasce no navegador (html2pdf), e o plainAddPlaceholder dá conta.
// Aqui o PDF chega de fora — Word, Adobe, scanner —, quase sempre com a tabela
// de referências em stream (PDF 1.5+). Testado: o plainAddPlaceholder quebra
// nesses arquivos ("Expected xref at NaN"). Por isso o pdf-lib: ele lê
// qualquer PDF e ainda desenha o selo na posição pedida.
//
// Verificado antes de subir: assinatura válida nos dois tipos de PDF, cobrindo
// o arquivo inteiro, e alterar um único byte depois invalida.
//
// SEGURANÇA
//   · O certificado tem o valor legal da assinatura de próprio punho do
//     titular. Só assina quem estiver na lista CERT_A1_ASSINANTES (ids de
//     auth.users separados por vírgula). Lista vazia = ninguém assina.
//   · Verify JWT desligado no config, como no CORTEX aba: a função valida o
//     token sozinha, contra o servidor de autenticação.
//   · Assina sempre o ORIGINAL guardado no bucket, nunca um arquivo enviado
//     pelo navegador — o que se assina é o que está no prontuário.
//   · Cada assinatura é registrada na auditoria pelo servidor.
//
// Secrets: CERT_A1_B64 (o .pfx em base64), CERT_A1_SENHA, CERT_A1_ASSINANTES
// ============================================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";
import { pdflibAddPlaceholder } from "npm:@signpdf/placeholder-pdf-lib@3.2.4";
import { SignPdf } from "npm:@signpdf/signpdf@3.2.4";
import { P12Signer } from "npm:@signpdf/signer-p12@3.2.4";
import forge from "npm:node-forge@1.3.1";
import { Buffer } from "node:buffer";

const BUCKET = "documentos-paciente";

const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (o: unknown, status = 200) =>
    new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

/** Lê titular e CPF do próprio certificado. ICP-Brasil grava o CN como "NOME:CPF". */
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
    if (pos.pagina < 0 || pos.pagina >= paginas.length) throw new Error("Página inválida.");
    const pagina = paginas[pos.pagina];
    const { width: W, height: H } = pagina.getSize();

    const fb = await doc.embedFont(StandardFonts.HelveticaBold);
    const fr = await doc.embedFont(StandardFonts.Helvetica);

    // x e y chegam como FRAÇÃO da página (0..1), a partir do canto superior
    // esquerdo, e marcam o CENTRO do selo — assim o ponto clicado na tela
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
        [`${nome.toUpperCase()}${cpfMasc ? " · CPF " + cpfMasc : ""}`, fb, 6.6, rgb(0.07, 0.2, 0.36)],
        [`Certificado ICP-Brasil · ${agora}`, fr, 6.4, rgb(0.2, 0.28, 0.4)],
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

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

    try {
        // ── 1) Quem está pedindo ───────────────────────────────────────────
        const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
        if (!token) return json({ ok: false, erro: "Sessão ausente." }, 401);

        const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
        const { data: { user } } = await admin.auth.getUser(token);
        if (!user) return json({ ok: false, erro: "Sessão inválida. Entre de novo no sistema." }, 401);

        // Só quem está na lista assina. O certificado é pessoal: ter acesso
        // ao sistema não autoriza ninguém a assinar em nome do titular.
        const permitidos = (Deno.env.get("CERT_A1_ASSINANTES") || "")
            .split(",").map((s) => s.trim()).filter(Boolean);
        if (!permitidos.includes(user.id)) {
            return json({ ok: false, erro: "Você não está autorizado a assinar com este certificado." }, 403);
        }

        const { data: prof } = await admin.from("profissionais")
            .select("id, nome_completo").eq("auth_user_id", user.id).eq("ativo", true).maybeSingle();
        if (!prof) return json({ ok: false, erro: "Profissional não encontrado ou inativo." }, 403);

        // ── 2) O que assinar e onde ────────────────────────────────────────
        const { documento_id, pagina, x, y } = await req.json();
        if (!documento_id) return json({ ok: false, erro: "Documento não informado." }, 400);
        const pos = { pagina: Number(pagina), x: Number(x), y: Number(y) };
        if (![pos.pagina, pos.x, pos.y].every(Number.isFinite) || pos.x < 0 || pos.x > 1 || pos.y < 0 || pos.y > 1) {
            return json({ ok: false, erro: "Posição da assinatura inválida." }, 400);
        }

        const { data: docRow, error: eDoc } = await admin.from("documentos_paciente")
            .select("id, paciente_id, titulo, arquivo_path, arquivo_assinado_path, ativo")
            .eq("id", documento_id).maybeSingle();
        if (eDoc || !docRow || docRow.ativo === false) return json({ ok: false, erro: "Documento não encontrado." }, 404);
        if (docRow.arquivo_assinado_path) {
            return json({ ok: false, erro: "Este documento já está assinado." }, 409);
        }

        const certB64 = Deno.env.get("CERT_A1_B64"), senha = Deno.env.get("CERT_A1_SENHA");
        if (!certB64 || !senha) return json({ ok: false, erro: "Certificado não configurado nos secrets." }, 500);

        // ── 3) Baixa o ORIGINAL do prontuário e assina ─────────────────────
        const { data: arq, error: eDown } = await admin.storage.from(BUCKET).download(docRow.arquivo_path);
        if (eDown || !arq) return json({ ok: false, erro: "Não consegui abrir o arquivo original." }, 500);

        let resultado;
        try {
            resultado = await assinar(new Uint8Array(await arq.arrayBuffer()),
                                      Buffer.from(certB64, "base64"), senha, pos);
        } catch (e) {
            const m = (e as Error).message || "";
            // PDF com senha de abertura não pode ser modificado para assinar
            if (/encrypt/i.test(m)) return json({ ok: false, erro: "O PDF está protegido por senha e não pode ser assinado." }, 422);
            if (/mac|password|invalid/i.test(m)) return json({ ok: false, erro: "Senha do certificado incorreta nos secrets." }, 500);
            throw e;
        }

        // ── 4) Guarda a versão assinada ao lado do original ────────────────
        const caminho = `${docRow.paciente_id}/assinados/${docRow.id}_${Date.now()}.pdf`;
        const { error: eUp } = await admin.storage.from(BUCKET)
            .upload(caminho, resultado.pdf, { contentType: "application/pdf", upsert: false });
        if (eUp) return json({ ok: false, erro: "Assinei, mas não consegui guardar: " + eUp.message }, 500);

        const assinadoEm = new Date().toISOString();
        const { error: eUpd } = await admin.from("documentos_paciente").update({
            arquivo_assinado_path: caminho,
            assinado_em: assinadoEm,
            assinado_por: prof.id,
            assinante_nome: resultado.nome,
            assinatura_posicao: pos,
        }).eq("id", docRow.id);
        if (eUpd) {
            await admin.storage.from(BUCKET).remove([caminho]).catch(() => {});
            return json({ ok: false, erro: "Não consegui registrar a assinatura: " + eUpd.message }, 500);
        }

        // ── 5) Auditoria pelo servidor ─────────────────────────────────────
        await admin.from("auditoria_acessos").insert({
            profissional_id: prof.id,
            acao: "edicao",
            tabela: "documentos_paciente",
            registro_id: docRow.id,
            paciente_id: docRow.paciente_id,
            detalhes: {
                operacao: "assinar_documento",
                titulo: docRow.titulo,
                certificado: "ICP-Brasil A1",
                assinante: resultado.nome,
                posicao: pos,
            },
        });

        return json({ ok: true, assinado_em: assinadoEm, assinante: resultado.nome });
    } catch (e) {
        return json({ ok: false, erro: (e as Error).message || "Erro ao assinar." }, 500);
    }
});

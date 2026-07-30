// ============================================================================
// CORTEX_APP — Sprint 91 — Edge Function `enviar-push`
// ============================================================================
// Recebe do banco (via pg_net) uma lista de IDs de `notificacoes` e envia o
// push para todos os aparelhos inscritos do destinatário.
//
// Criptografia implementada com Web Crypto puro (RFC 8291 aes128gcm +
// RFC 8292 VAPID). Sem dependência npm: roda nativo no Deno.
//
// Secrets necessários (Edge Functions → Secrets):
//   VAPID_PUBLIC_KEY   — chave pública VAPID
//   VAPID_PRIVATE_KEY  — chave privada VAPID
//   VAPID_SUBJECT      — mailto:... ou https://... de contato
//   CORTEX_PUSH_SECRET — mesmo segredo guardado no Vault do banco
//
// Deploy com verify_jwt = FALSE (a autenticação é o header x-cortex-secret).
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const enc = new TextEncoder();

// ─── Helpers binários ───────────────────────────────────────────────────────

function b64urlToBytes(s: string): Uint8Array {
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

function bytesToB64url(b: ArrayBuffer | Uint8Array): string {
    const arr = b instanceof Uint8Array ? b : new Uint8Array(b);
    let bin = '';
    for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function concat(...arrs: Uint8Array[]): Uint8Array {
    const total = arrs.reduce((n, a) => n + a.length, 0);
    const out = new Uint8Array(total);
    let off = 0;
    for (const a of arrs) { out.set(a, off); off += a.length; }
    return out;
}

async function hmacSha256(keyBytes: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
    const k = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}

// HKDF-SHA256 com um único bloco de expand — é tudo que o Web Push precisa.
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
    const prk = await hmacSha256(salt, ikm);
    const okm = await hmacSha256(prk, concat(info, new Uint8Array([1])));
    return okm.slice(0, length);
}

// ─── RFC 8291 — criptografia do payload (aes128gcm) ─────────────────────────

async function encryptPayload(payload: string, uaPublicB64: string, authB64: string): Promise<Uint8Array> {
    const uaPublic = b64urlToBytes(uaPublicB64);
    const authSecret = b64urlToBytes(authB64);

    const asKeys = await crypto.subtle.generateKey(
        { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']
    ) as CryptoKeyPair;
    const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', asKeys.publicKey));

    const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, true, []);
    const ecdhSecret = new Uint8Array(
        await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, asKeys.privateKey, 256)
    );

    const keyInfo = concat(enc.encode('WebPush: info\0'), uaPublic, asPublic);
    const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32);

    const salt = crypto.getRandomValues(new Uint8Array(16));
    const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
    const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);

    // 0x02 marca o último (e único) registro
    const plaintext = concat(enc.encode(payload), new Uint8Array([2]));

    const aesKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
    const ciphertext = new Uint8Array(
        await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, aesKey, plaintext)
    );

    // header: salt(16) || rs(4) || idlen(1) || keyid(65)
    const rs = new Uint8Array(4);
    new DataView(rs.buffer).setUint32(0, 4096, false);
    return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, ciphertext);
}

// ─── RFC 8292 — header Authorization VAPID ──────────────────────────────────

async function vapidHeader(endpoint: string, subject: string, pubB64: string, privB64: string): Promise<string> {
    const aud = new URL(endpoint).origin;
    const exp = Math.floor(Date.now() / 1000) + 12 * 60 * 60;

    const header = bytesToB64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
    const body = bytesToB64url(enc.encode(JSON.stringify({ aud, exp, sub: subject })));

    const pub = b64urlToBytes(pubB64);
    const key = await crypto.subtle.importKey(
        'jwk',
        {
            kty: 'EC', crv: 'P-256', d: privB64,
            x: bytesToB64url(pub.slice(1, 33)),
            y: bytesToB64url(pub.slice(33, 65)),
            ext: true
        },
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['sign']
    );

    const sig = await crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${header}.${body}`)
    );

    return `vapid t=${header}.${body}.${bytesToB64url(sig)}, k=${pubB64}`;
}

// ─── Handler ────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
    if (req.method !== 'POST') {
        return new Response('Method not allowed', { status: 405 });
    }

    const segredo = Deno.env.get('CORTEX_PUSH_SECRET');
    if (!segredo || req.headers.get('x-cortex-secret') !== segredo) {
        return new Response('Unauthorized', { status: 401 });
    }

    const VAPID_PUB = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
    const VAPID_PRIV = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
    const VAPID_SUB = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:contato@cortexneuro.com.br';

    if (!VAPID_PUB || !VAPID_PRIV) {
        return new Response(JSON.stringify({ erro: 'VAPID não configurado' }), {
            status: 500, headers: { 'Content-Type': 'application/json' }
        });
    }

    let ids: string[] = [];
    try {
        const corpo = await req.json();
        ids = Array.isArray(corpo?.ids) ? corpo.ids : (corpo?.notificacao_id ? [corpo.notificacao_id] : []);
    } catch (_) {
        return new Response('Bad request', { status: 400 });
    }
    if (ids.length === 0) {
        return new Response(JSON.stringify({ enviados: 0 }), {
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: notifs, error: errN } = await supabase
        .from('notificacoes')
        .select('id, destinatario_id, tipo, titulo, corpo, url')
        .in('id', ids)
        .is('push_enviado_em', null);

    if (errN) {
        return new Response(JSON.stringify({ erro: errN.message }), {
            status: 500, headers: { 'Content-Type': 'application/json' }
        });
    }
    if (!notifs || notifs.length === 0) {
        return new Response(JSON.stringify({ enviados: 0 }), {
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const destinatarios = [...new Set(notifs.map((n) => n.destinatario_id))];
    const { data: subs } = await supabase
        .from('push_subscriptions')
        .select('id, profissional_id, endpoint, p256dh, auth')
        .in('profissional_id', destinatarios);

    const porProf = new Map<string, typeof subs>();
    for (const s of (subs ?? [])) {
        const arr = porProf.get(s.profissional_id) ?? [];
        arr.push(s);
        porProf.set(s.profissional_id, arr);
    }

    let enviados = 0;
    let removidos = 0;
    const idsEnviados: string[] = [];

    for (const n of notifs) {
        const aparelhos = porProf.get(n.destinatario_id) ?? [];
        if (aparelhos.length === 0) {
            idsEnviados.push(n.id); // sem aparelho: marca para não reprocessar
            continue;
        }

        const payload = JSON.stringify({
            id: n.id,
            tipo: n.tipo,
            titulo: n.titulo,
            corpo: n.corpo ?? '',
            url: n.url ? '/frontend/' + String(n.url).replace(/^\/+/, '') : '/frontend/dashboard.html',
            tag: n.tipo + ':' + n.id
        });

        for (const ap of aparelhos) {
            try {
                const corpoCifrado = await encryptPayload(payload, ap.p256dh, ap.auth);
                const auth = await vapidHeader(ap.endpoint, VAPID_SUB, VAPID_PUB, VAPID_PRIV);

                const resp = await fetch(ap.endpoint, {
                    method: 'POST',
                    headers: {
                        'Authorization': auth,
                        'Content-Encoding': 'aes128gcm',
                        'Content-Type': 'application/octet-stream',
                        'TTL': '86400',
                        'Urgency': 'normal'
                    },
                    body: corpoCifrado
                });

                if (resp.ok) {
                    enviados++;
                    await supabase.from('push_subscriptions')
                        .update({ ultimo_sucesso_em: new Date().toISOString(), falhas: 0 })
                        .eq('id', ap.id);
                } else if (resp.status === 404 || resp.status === 410) {
                    // Inscrição morta: o navegador foi desinstalado / limpou dados.
                    await supabase.from('push_subscriptions').delete().eq('id', ap.id);
                    removidos++;
                } else {
                    console.warn('push falhou', resp.status, await resp.text());
                    await supabase.rpc('push_registrar_falha', { p_subscription_id: ap.id });
                }
            } catch (e) {
                console.error('erro ao enviar push:', e instanceof Error ? e.message : e);
            }
        }

        idsEnviados.push(n.id);
    }

    if (idsEnviados.length > 0) {
        await supabase.from('notificacoes')
            .update({ push_enviado_em: new Date().toISOString() })
            .in('id', idsEnviados);
    }

    return new Response(JSON.stringify({ enviados, removidos, notificacoes: idsEnviados.length }), {
        headers: { 'Content-Type': 'application/json' }
    });
});

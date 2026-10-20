// ============================================================================
// PORTAL DO PACIENTE — Laudo Online (sprint LO-5)
// ----------------------------------------------------------------------------
// A página interativa do laudo, a mesma que a equipe vê no CORTEX.
// Só abre laudo finalizado e liberado pela clínica (portal_meu_laudo_online,
// que confere pacientes.portal_user_id = auth.uid()). O banco entrega o
// snapshot sem notas internas; aqui ainda saem pendências e avisos internos.
// Mesma sessão isolada do portal (storageKey 'cortex-portal-auth').
// URL: laudo-online.html?id=<laudo_online_id>
// ============================================================================
(function () {
    'use strict';

    const client = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey, {
        auth: { storageKey: 'cortex-portal-auth', storage: window.localStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
    });
    const id = new URLSearchParams(location.search).get('id');
    const esc = s => window.LaudoCore.esc(s);

    function estado(titulo, texto) {
        document.getElementById('p-raiz').innerHTML = `<div class="p-estado"><div><h1>${esc(titulo)}</h1><p>${texto}</p><p style="margin-top:16px"><a href="./portal.html">← Voltar ao portal</a></p></div></div>`;
    }

    document.addEventListener('DOMContentLoaded', async () => {
        const { data: { session } } = await client.auth.getSession();
        if (!session) { location.href = './login.html'; return; }
        if (!id) return estado('Laudo não informado', 'Abra o laudo pela aba Laudos do portal.');
        try {
            const { data, error } = await client.rpc('portal_meu_laudo_online', { p_laudo_id: id });
            if (error) throw error;
            if (!data || !data.ok || !data.snapshot) return estado('Laudo indisponível', 'Este laudo ainda não foi liberado pela equipe ou não pertence a esta conta.');
            const snap = data.snapshot;
            const banco = window.LaudoSnapshot.bancoDe(snap);

            // foto do paciente e imagens do laudo: links curtos, quando a regra do banco deixar
            let foto = null;
            if (banco.paciente.foto_url && !/^https?:/i.test(banco.paciente.foto_url)) {
                try { const r = await client.storage.from('pacientes-fotos').createSignedUrl(banco.paciente.foto_url, 600); foto = (r.data && r.data.signedUrl) || null; } catch (e) { foto = null; }
            }
            const imagens = {};
            const arqs = [];
            window.LaudoCore.cadaBloco(snap.documento, b => { if (b.tipo === 'imagem' && b.arquivo) arqs.push(b.arquivo); });
            Object.values(snap.documento.figuras || {}).forEach(f => (f.blocos || []).forEach(b => { if (b.arquivo) arqs.push(b.arquivo); }));
            for (const a of arqs) {
                try { const r = await client.storage.from('laudos-midia').createSignedUrl(a, 600); if (r.data) imagens[a] = r.data.signedUrl; } catch (e) { /* segue sem */ }
            }

            const raiz = document.getElementById('p-raiz');
            raiz.innerHTML = `<div id="p-alvo"></div><div class="p-barra"><a href="./portal.html">← Portal</a>
                <span class="p-barra-info">Laudo neuropsicológico · versão ${esc(data.versao)}${data.errata ? ' (errata)' : ''}</span></div>`;
            window.LaudoPortfolio.desenhar(document.getElementById('p-alvo'), {
                doc: snap.documento, banco, glossario: snap.glossario || {}, publico: true, imagens, fotoUrl: foto
            });
            document.title = 'Meu laudo — ' + ((banco.paciente.nome_completo || '').split(' ')[0] || 'Equilibrium');
            client.rpc('portal_log_acesso', { p_acao: 'abriu_laudo_online', p_recurso_id: id, p_detalhes: { versao: data.versao } }).then(() => {}, () => {});
        } catch (err) {
            console.error('[portal] laudo online:', err);
            estado('Não foi possível abrir o laudo', 'Tente de novo em alguns segundos.');
        }
    });
})();

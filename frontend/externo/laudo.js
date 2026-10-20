// ============================================================================
// CORTEX — Área externa · Laudo Online (sprint LO-5)
// ----------------------------------------------------------------------------
// A página interativa do laudo para o profissional de fora. Como o resto da
// área externa, nada sai daqui direto para o banco: a Edge Function
// `externo-acesso` confere a sessão, o acesso ao paciente com escopo `laudos`
// e se o laudo está finalizado e liberado. O snapshot vem sem notas internas;
// imagens e foto chegam como links assinados de 10 minutos.
// URL: laudo.html?id=<laudo_online_id>
// ============================================================================
(function () {
    'use strict';
    const FN = `${SUPABASE_CONFIG.url}/functions/v1/externo-acesso`;
    const CHAVE_SESSAO = 'cortex_externo_sessao';
    const id = new URLSearchParams(location.search).get('id');
    const esc = s => window.LaudoCore.esc(s);

    function estado(titulo, texto) {
        document.getElementById('p-raiz').innerHTML = `<div class="p-estado"><div><h1>${esc(titulo)}</h1><p>${texto}</p><p style="margin-top:16px"><a href="./">← Voltar aos meus pacientes</a></p></div></div>`;
    }

    async function iniciar() {
        let sessao = null;
        try { sessao = localStorage.getItem(CHAVE_SESSAO); } catch (e) { sessao = null; }
        if (!sessao) return estado('Entre para ver o laudo', 'Sua sessão terminou. Entre de novo pela área profissional.');
        if (!id) return estado('Laudo não informado', 'Abra o laudo pela aba Laudos do prontuário do paciente.');
        try {
            const resp = await fetch(FN, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_CONFIG.anonKey },
                body: JSON.stringify({ acao: 'laudo_online', sessao, laudo_id: id })
            });
            const r = await resp.json().catch(() => ({}));
            if (!r.ok) {
                if (r.erro === 'sessao_invalida') return estado('Entre para ver o laudo', 'Sua sessão terminou. Entre de novo pela área profissional.');
                return estado('Laudo indisponível', 'Este laudo não está liberado para você, ou o seu acesso a este paciente terminou.');
            }
            const snap = r.snapshot;
            const banco = window.LaudoSnapshot.bancoDe(snap);
            const raiz = document.getElementById('p-raiz');
            raiz.innerHTML = `<div id="p-alvo"></div><div class="p-barra"><a href="./" title="Voltar à área profissional">← Meus pacientes</a>
                <span class="p-barra-info">Laudo online · versão ${esc(r.versao)}${r.errata ? ' (errata)' : ''} · acesso registrado</span></div>`;
            window.LaudoPortfolio.desenhar(document.getElementById('p-alvo'), {
                doc: snap.documento, banco, glossario: snap.glossario || {}, publico: true, imagens: r.imagens || {}, fotoUrl: r.foto || null
            });
        } catch (err) {
            console.error('[externo] laudo online:', err);
            estado('Não foi possível abrir o laudo', 'Erro de conexão. Tente de novo em alguns segundos.');
        }
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();

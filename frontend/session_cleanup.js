// ============================================================================
// CORTEX_APP — Limpeza preventiva de sessão zumbi (Sprint 37)
// ============================================================================
// Executa SÍNCRONO no início do carregamento da página, ANTES de qualquer
// outro script de auth. Detecta sessão de paciente no localStorage default
// e a remove, evitando o loop de redirect entre index ↔ dashboard.
//
// Cenário: antes do Sprint 37, o portal e o sistema profissional
// compartilhavam a mesma storageKey ('sb-<projref>-auth-token'). Pacientes
// que logaram antes do fix têm sessão gravada lá. Quando abrirem o sistema
// principal, o auth.js detecta a sessão, manda pra dashboard, o auth_guard
// não encontra `profissionais.auth_user_id`, redireciona de volta → loop.
//
// Este script roda primeiro e remove a sessão zumbi.
// ============================================================================

(function() {
    'use strict';

    // Procura todas as keys do supabase-js no localStorage que tenham
    // o padrão sb-<ref>-auth-token. Tem que ser tolerante a versões.
    try {
        const keysParaRemover = [];

        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key) continue;

            // A storageKey do portal ('cortex-portal-auth') NUNCA é tocada aqui.
            if (key === 'cortex-portal-auth') continue;

            // Padrão Supabase: sb-<projref>-auth-token (+ variações ...-code-verifier)
            if (!key.startsWith('sb-') || !key.includes('-auth-token')) continue;

            try {
                const raw = localStorage.getItem(key);
                if (!raw) continue;
                const parsed = JSON.parse(raw);

                // Supabase v2 grava em currentSession.user.user_metadata
                // ou direto em user.user_metadata, dependendo da versão.
                const meta = parsed?.currentSession?.user?.user_metadata
                    || parsed?.user?.user_metadata
                    || {};

                if (meta.paciente_id) {
                    console.warn('CORTEX_APP: sessão de paciente encontrada na chave default. Removendo:', key);
                    keysParaRemover.push(key);
                }
            } catch (e) {
                // JSON inválido — ignora
            }
        }

        keysParaRemover.forEach(k => {
            try { localStorage.removeItem(k); } catch (e) {}
            // Também tenta variações relacionadas
            try { localStorage.removeItem(k + '-code-verifier'); } catch (e) {}
        });
    } catch (e) {
        // Acesso a localStorage pode falhar em iframes/Safari privado — ignora silenciosamente
        console.warn('Cleanup de sessão falhou:', e);
    }
})();

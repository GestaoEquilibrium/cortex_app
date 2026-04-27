// ============================================================================
// CORTEX_APP — Cliente Supabase compartilhado
// ============================================================================
// Centraliza a inicialização do cliente para evitar múltiplas instâncias.
// Importar como: <script src="../shared/supabase_client.js"></script>
// Depois de config.js e da CDN do supabase-js.
// ============================================================================

(function() {
    'use strict';

    // Verifica que dependências foram carregadas
    if (typeof supabase === 'undefined') {
        console.error('CORTEX_APP: supabase-js não foi carregado. Inclua o CDN antes deste script.');
        return;
    }

    if (typeof SUPABASE_CONFIG === 'undefined') {
        console.error('CORTEX_APP: config.js não foi carregado. Inclua-o antes deste script.');
        return;
    }

    // Cria o cliente uma única vez na window
    if (!window.cortexClient) {
        window.cortexClient = supabase.createClient(
            SUPABASE_CONFIG.url,
            SUPABASE_CONFIG.anonKey,
            SUPABASE_CONFIG.options
        );
    }
})();

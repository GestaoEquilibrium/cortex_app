// ============================================================================
// CORTEX_APP — Configuração Supabase
// ============================================================================
// IMPORTANTE: Este arquivo contém as credenciais públicas do Supabase.
// A "anon key" é segura para o frontend porque o Row Level Security (RLS)
// protege os dados. Mas NUNCA cole aqui a "service_role key", que ignora RLS.
//
// ANTES DE USAR: Substitua os valores abaixo pelos do seu projeto:
//   1. SUPABASE_URL: copie de Project Settings → API → Project URL
//   2. SUPABASE_ANON_KEY: copie de Project Settings → API → anon public
// ============================================================================

const SUPABASE_CONFIG = {
    // 👇 SUBSTITUA pela URL do seu projeto Supabase
    url: 'https://fducqudteuarrmjndzhm.supabase.co',

    // 👇 SUBSTITUA pela anon key (chave pública) do seu projeto
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZkdWNxdWR0ZXVhcnJtam5kemhtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyNDYzMjksImV4cCI6MjA5MjgyMjMyOX0.TTbG_VEH7lOxoCEBG3ovVCyjhLCBvRKfSqtpR4YZnlM',

    // Configurações fixas — não mudar
    options: {
        auth: {
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: true
        }
    }
};

// Validação básica (alerta se o config não foi preenchido)
if (SUPABASE_CONFIG.url.includes('SUBSTITUA-AQUI') ||
    SUPABASE_CONFIG.anonKey.includes('SUBSTITUA-AQUI')) {
    console.error(
        '⚠️ CORTEX_APP: config.js precisa ser preenchido com as credenciais Supabase!\n' +
        'Veja Project Settings → API no painel do Supabase.'
    );
}

// ============================================================================
// CORTEX_APP — Lógica de autenticação (Sprint 37 — anti-loop)
// ============================================================================
// Mudança em relação ao Sprint A2:
//   - Após login, redireciona para dashboard.html
//
// SPRINT 37 — Mudanças anti-loop:
//   - checkExistingSession() agora verifica se a sessão é de paciente
//     (user_metadata.paciente_id presente). Se for, faz signOut em vez
//     de redirecionar pra dashboard — senão entra em loop com auth_guard.
//   - Também faz signOut se a sessão não tem vínculo em `profissionais`.
// ============================================================================

const supabaseClient = supabase.createClient(
    SUPABASE_CONFIG.url,
    SUPABASE_CONFIG.anonKey,
    SUPABASE_CONFIG.options
);

// ============================================================================
// Verifica se já tem sessão ativa
// ============================================================================
async function checkExistingSession() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return;

    // Se a sessão é de paciente (vazou do portal), limpa e fica na tela de login.
    const meta = session.user?.user_metadata || {};
    if (meta.paciente_id) {
        console.warn('CORTEX_APP: sessão de paciente detectada no login profissional. Limpando.');
        await supabaseClient.auth.signOut();
        return;
    }

    // Verifica vínculo em profissionais antes de mandar pro dashboard.
    // Sem essa checagem, uma conta órfã (auth.users sem profissionais)
    // iria pra dashboard, falhar no auth_guard, ser deslogada e voltar
    // pra cá — loop. Aqui já paramos.
    try {
        const { data: prof } = await supabaseClient
            .from('profissionais')
            .select('id')
            .eq('auth_user_id', session.user.id)
            .maybeSingle();

        if (!prof) {
            console.warn('CORTEX_APP: sessão sem vínculo em profissionais. Limpando.');
            await supabaseClient.auth.signOut();
            return;
        }
    } catch (e) {
        console.warn('Falha ao verificar vínculo profissional:', e);
        await supabaseClient.auth.signOut();
        return;
    }

    // OK: profissional autenticado, vai pra dashboard
    window.location.href = 'dashboard.html';
}

// ============================================================================
// Manipulação do formulário de login
// ============================================================================
function setupLoginForm() {
    const form = document.getElementById('login-form');
    if (!form) return;

    const button = document.getElementById('login-button');
    const btnText = button.querySelector('.btn-text');
    const btnLoading = button.querySelector('.btn-loading');
    const errorMessage = document.getElementById('error-message');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        errorMessage.style.display = 'none';
        errorMessage.textContent = '';

        button.disabled = true;
        btnText.style.display = 'none';
        btnLoading.style.display = 'inline';

        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;

        try {
            const { data, error } = await supabaseClient.auth.signInWithPassword({
                email,
                password
            });

            if (error) throw error;

            // Login deu certo — verifica que NÃO é conta de paciente
            // (defesa em profundidade: alguém poderia ter criado um paciente
            // com email não-sintético e tentar logar aqui).
            const meta = data.user?.user_metadata || {};
            if (meta.paciente_id) {
                await supabaseClient.auth.signOut();
                throw new Error('Esta conta é de paciente. Use o portal do paciente em /portal/.');
            }

            // Registra auditoria
            await registerLoginAudit(data.user);

            // Redireciona para a lista de pacientes
            window.location.href = 'dashboard.html';

        } catch (error) {
            let mensagemErro = 'Não foi possível fazer login. ';

            if (error.message?.includes('Invalid login credentials')) {
                mensagemErro = 'E-mail ou senha incorretos. Verifique e tente novamente.';
            } else if (error.message?.includes('Email not confirmed')) {
                mensagemErro = 'E-mail ainda não foi confirmado. Contate o administrador do sistema.';
            } else if (error.message?.includes('portal do paciente')) {
                mensagemErro = error.message;
            } else {
                mensagemErro += error.message || 'Tente novamente em alguns instantes.';
            }

            errorMessage.textContent = mensagemErro;
            errorMessage.style.display = 'block';

            button.disabled = false;
            btnText.style.display = 'inline';
            btnLoading.style.display = 'none';
        }
    });
}

// ============================================================================
// Registra evento de login na auditoria
// ============================================================================
async function registerLoginAudit(user) {
    try {
        const { data: profissional } = await supabaseClient
            .from('profissionais')
            .select('id')
            .eq('auth_user_id', user.id)
            .single();

        if (!profissional) return;

        await supabaseClient
            .from('auditoria_acessos')
            .insert({
                profissional_id: profissional.id,
                acao: 'login',
                tabela: 'auth.users',
                user_agent: navigator.userAgent
            });
    } catch (e) {
        console.warn('Falha ao registrar auditoria de login:', e);
    }
}

// ============================================================================
// Inicialização
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
    checkExistingSession();
    setupLoginForm();
});

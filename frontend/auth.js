// ============================================================================
// CORTEX_APP — Lógica de autenticação (atualizada para Sprint B1)
// ============================================================================
// Mudança em relação ao Sprint A2:
//   - Após login, redireciona para dashboard.html (em vez de dashboard.html)
//   - O dashboard.html continua existindo como fallback, mas a página
//     principal pós-login agora é a lista de pacientes.
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
    if (session) {
        // Já está logado, redireciona pra lista de pacientes
        window.location.href = 'dashboard.html';
    }
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

            // Login deu certo — registra auditoria
            await registerLoginAudit(data.user);

            // Redireciona para a lista de pacientes
            window.location.href = 'dashboard.html';

        } catch (error) {
            let mensagemErro = 'Não foi possível fazer login. ';

            if (error.message?.includes('Invalid login credentials')) {
                mensagemErro = 'E-mail ou senha incorretos. Verifique e tente novamente.';
            } else if (error.message?.includes('Email not confirmed')) {
                mensagemErro = 'E-mail ainda não foi confirmado. Contate o administrador do sistema.';
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

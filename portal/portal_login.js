// ============================================================================
// Portal do Paciente — Login
// ============================================================================
// Fluxo:
//   1. Paciente digita CPF + senha
//   2. Verifica se está bloqueado (5 tentativas erradas nos últimos 15min)
//   3. Converte CPF → email sintético <cpf>@cortex.local
//   4. signInWithPassword
//   5. Loga tentativa (sucesso ou falha) pra anti-bruteforce
//   6. Se sucesso E primeira senha → redireciona pra troca obrigatória
//   7. Se sucesso E senha já trocada → redireciona pro portal
// ============================================================================

(function() {
    'use strict';

    const client = window.supabase.createClient(
        window.SUPABASE_CONFIG.url,
        window.SUPABASE_CONFIG.anonKey
    );

    // ----- Boot -----
    document.addEventListener('DOMContentLoaded', () => {
        // Se já logado, redireciona
        client.auth.getSession().then(({ data: { session } }) => {
            if (session) {
                window.location.href = './portal.html';
            }
        });

        formatCPF();

        // Pré-preencher CPF se vier ?cpf= na URL (link do WhatsApp da clínica)
        const params = new URLSearchParams(window.location.search);
        const cpfParam = params.get('cpf');
        if (cpfParam) {
            const cpfLimpo = cpfParam.replace(/\D/g, '').slice(0, 11);
            if (cpfLimpo.length === 11) {
                const cpfInput = document.getElementById('cpf');
                // Formata visualmente: 000.000.000-00
                cpfInput.value = cpfLimpo.slice(0,3) + '.' + cpfLimpo.slice(3,6) + '.' + cpfLimpo.slice(6,9) + '-' + cpfLimpo.slice(9);
                // Move foco pro campo de senha
                document.getElementById('senha').focus();
            }
        }

        document.getElementById('form-login').addEventListener('submit', handleLogin);
    });

    function formatCPF() {
        const input = document.getElementById('cpf');
        input.addEventListener('input', () => {
            let v = input.value.replace(/\D/g, '').slice(0, 11);
            if (v.length > 9) v = v.slice(0,3) + '.' + v.slice(3,6) + '.' + v.slice(6,9) + '-' + v.slice(9);
            else if (v.length > 6) v = v.slice(0,3) + '.' + v.slice(3,6) + '.' + v.slice(6);
            else if (v.length > 3) v = v.slice(0,3) + '.' + v.slice(3);
            input.value = v;
        });
    }

    async function handleLogin(e) {
        e.preventDefault();
        const btn = document.getElementById('btn-entrar');
        const cpfRaw = document.getElementById('cpf').value.replace(/\D/g, '');
        const senha = document.getElementById('senha').value;

        if (cpfRaw.length !== 11) {
            mostrarAlerta('CPF deve ter 11 dígitos.', 'erro');
            return;
        }

        btn.disabled = true;
        btn.textContent = 'Entrando...';
        ocultarAlerta();

        try {
            // 1. Verifica bloqueio por bruteforce
            const { data: bloqueado } = await client.rpc('paciente_login_bloqueado', { p_cpf: cpfRaw });
            if (bloqueado) {
                mostrarAlerta('Muitas tentativas de login. Aguarde 15 minutos ou entre em contato com a clínica.', 'erro');
                return;
            }

            // 2. Converte CPF → email sintético
            const { data: emailSintetico } = await client.rpc('portal_cpf_para_email', { p_cpf: cpfRaw });
            if (!emailSintetico) {
                await registrarTentativa(cpfRaw, false);
                mostrarAlerta('CPF inválido.', 'erro');
                return;
            }

            // 3. Login
            const { data, error } = await client.auth.signInWithPassword({
                email: emailSintetico,
                password: senha
            });

            if (error) {
                await registrarTentativa(cpfRaw, false);
                mostrarAlerta('CPF ou senha incorretos.', 'erro');
                return;
            }

            // 4. Sucesso
            await registrarTentativa(cpfRaw, true);
            await client.rpc('portal_log_acesso', {
                p_acao: 'login',
                p_recurso_id: null,
                p_detalhes: {}
            });

            // 5. Checa se precisa trocar a senha
            const userMeta = data.user?.user_metadata || {};
            const pacienteId = userMeta.paciente_id;

            if (pacienteId) {
                const { data: pac } = await client
                    .from('pacientes')
                    .select('portal_senha_trocada')
                    .eq('id', pacienteId)
                    .maybeSingle();

                if (pac && !pac.portal_senha_trocada) {
                    window.location.href = './trocar_senha.html?primeiro=1';
                    return;
                }
            }

            window.location.href = './portal.html';

        } catch (err) {
            console.error('Erro no login:', err);
            mostrarAlerta('Erro inesperado. Tente novamente.', 'erro');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Entrar';
        }
    }

    async function registrarTentativa(cpf, sucesso) {
        try {
            await client.rpc('portal_log_tentativa', { p_cpf: cpf, p_sucesso: sucesso });
        } catch (e) {
            console.warn('Falha ao registrar tentativa:', e);
        }
    }

    function mostrarAlerta(msg, tipo = 'erro') {
        const el = document.getElementById('alerta');
        el.textContent = msg;
        el.className = 'portal-alerta portal-alerta-' + tipo;
        el.style.display = 'block';
    }

    function ocultarAlerta() {
        document.getElementById('alerta').style.display = 'none';
    }

})();

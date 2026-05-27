// ============================================================================
// Portal — Troca de senha
// ============================================================================
// Usado em 2 cenários:
//   1. Primeiro acesso (?primeiro=1): obrigatório trocar a senha CPF
//   2. Troca voluntária pelo paciente já autenticado
// ============================================================================

(function() {
    'use strict';

    const client = window.supabase.createClient(
        SUPABASE_CONFIG.url,
        SUPABASE_CONFIG.anonKey
    );

    const params = new URLSearchParams(window.location.search);
    const ehPrimeiro = params.get('primeiro') === '1';

    document.addEventListener('DOMContentLoaded', async () => {
        // Exige autenticação
        const { data: { session } } = await client.auth.getSession();
        if (!session) {
            window.location.href = './login.html';
            return;
        }

        if (!ehPrimeiro) {
            document.getElementById('titulo').textContent = 'Trocar senha';
            document.getElementById('subtitulo').textContent = 'Escolha uma nova senha pessoal.';
        }

        document.getElementById('form-senha').addEventListener('submit', handleTroca);
    });

    async function handleTroca(e) {
        e.preventDefault();
        const btn = document.getElementById('btn-trocar');
        const nova = document.getElementById('nova-senha').value;
        const conf = document.getElementById('confirma-senha').value;

        if (nova.length < 6) {
            mostrarAlerta('A senha deve ter pelo menos 6 caracteres.', 'erro');
            return;
        }

        if (nova !== conf) {
            mostrarAlerta('As senhas não conferem.', 'erro');
            return;
        }

        btn.disabled = true;
        btn.textContent = 'Salvando...';
        ocultarAlerta();

        try {
            const { error } = await client.auth.updateUser({ password: nova });
            if (error) {
                mostrarAlerta('Erro ao trocar senha: ' + error.message, 'erro');
                return;
            }

            await client.rpc('portal_marcar_senha_trocada');
            await client.rpc('portal_log_acesso', {
                p_acao: 'trocou_senha',
                p_recurso_id: null,
                p_detalhes: { primeiro: ehPrimeiro }
            });

            mostrarAlerta('Senha alterada com sucesso! Redirecionando...', 'sucesso');
            setTimeout(() => { window.location.href = './portal.html'; }, 1500);

        } catch (err) {
            console.error(err);
            mostrarAlerta('Erro inesperado.', 'erro');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Salvar nova senha';
        }
    }

    function mostrarAlerta(msg, tipo) {
        const el = document.getElementById('alerta');
        el.textContent = msg;
        el.className = 'portal-alerta portal-alerta-' + tipo;
        el.style.display = 'block';
    }

    function ocultarAlerta() {
        document.getElementById('alerta').style.display = 'none';
    }

})();

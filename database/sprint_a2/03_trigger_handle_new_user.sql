-- ============================================================================
-- CORTEX_APP — Sprint A2 — Arquivo 03 de 12
-- Trigger handle_new_user
-- ============================================================================
-- Quando alguém se cadastra via Supabase Auth (auth.users recebe nova linha),
-- queremos que automaticamente um registro seja criado em "profissionais".
--
-- Lógica:
--   - Primeiro usuário cadastrado: vira admin_clinico (Wessilon)
--   - Demais usuários: ficam com perfil temporário 'estagiario' até o
--     admin_clinico atualizar manualmente para o perfil correto
--
-- Justificativa do default 'estagiario':
--   - É o perfil de menor privilégio
--   - Se o admin esquecer de atualizar, o usuário criado tem acesso restrito
--   - Princípio de "deny by default" — segurança vem antes de conveniência
-- ============================================================================

-- ============================================================================
-- Função do trigger
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_total_existente INT;
    v_perfil perfil_usuario;
BEGIN
    -- Conta quantos profissionais já existem
    SELECT COUNT(*) INTO v_total_existente FROM profissionais;

    -- Se for o primeiro, vira admin_clinico (Wessilon)
    -- Senão, vira estagiário (perfil de menor privilégio, será atualizado pelo admin)
    IF v_total_existente = 0 THEN
        v_perfil := 'admin_clinico'::perfil_usuario;
    ELSE
        v_perfil := 'estagiario'::perfil_usuario;
    END IF;

    -- Cria o registro em profissionais vinculado ao auth.users recém-criado
    INSERT INTO profissionais (
        auth_user_id,
        nome_completo,
        email,
        perfil,
        ativo
    ) VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'nome_completo', NEW.email),
        NEW.email,
        v_perfil,
        true
    );

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION fn_handle_new_user() IS
    'Cria registro em profissionais automaticamente quando novo usuário é cadastrado em auth.users. Primeiro usuário vira admin_clinico; demais viram estagiário (será atualizado pelo admin).';

-- ============================================================================
-- Trigger no auth.users
-- ============================================================================

DROP TRIGGER IF EXISTS trg_on_auth_user_created ON auth.users;

CREATE TRIGGER trg_on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION fn_handle_new_user();

-- ============================================================================
-- Validação: trigger deve aparecer
-- ============================================================================

SELECT
    trigger_name,
    event_manipulation AS evento,
    event_object_schema AS schema_da_tabela,
    event_object_table AS tabela
FROM information_schema.triggers
WHERE trigger_name = 'trg_on_auth_user_created';
-- Esperado: 1 linha apontando para auth.users

-- ============================================================================
-- CORTEX_APP — Sprint A2 — Arquivo 05 de 12
-- RLS para profissionais e vínculos com supervisores
-- ============================================================================
-- Tabelas: profissionais, vinculos_profissional_supervisor
--
-- Lógica:
-- - admin_clinico: vê e gerencia todos os profissionais
-- - admin_gestor: vê apenas info básica dos profissionais (para agendar)
-- - demais perfis: vêem apenas o próprio registro
-- - Estagiários veem o vínculo com seu supervisor
-- ============================================================================

-- ============================================================================
-- PROFISSIONAIS
-- ============================================================================

ALTER TABLE profissionais ENABLE ROW LEVEL SECURITY;

-- SELECT: admin_clinico vê todos; admin_gestor vê todos (para agendar);
-- demais veem apenas o próprio registro
DROP POLICY IF EXISTS p_profissionais_select ON profissionais;
CREATE POLICY p_profissionais_select ON profissionais
    FOR SELECT
    TO authenticated
    USING (
        is_admin_clinico()
        OR current_perfil() = 'admin_gestor'::perfil_usuario
        OR auth_user_id = auth.uid()
        -- Estagiários também precisam ver o supervisor
        OR (
            current_perfil() = 'estagiario'::perfil_usuario
            AND id IN (
                SELECT supervisor_id
                FROM vinculos_profissional_supervisor
                WHERE estagiario_id = current_profissional_id()
                  AND ativo = true
            )
        )
    );

-- INSERT: apenas admin_clinico (mas o trigger handle_new_user já cria,
-- então insert manual é raríssimo)
DROP POLICY IF EXISTS p_profissionais_insert ON profissionais;
CREATE POLICY p_profissionais_insert ON profissionais
    FOR INSERT
    TO authenticated
    WITH CHECK (is_admin_clinico());

-- UPDATE: admin_clinico atualiza qualquer um; profissional atualiza apenas
-- seus dados pessoais (mas NÃO pode mudar o próprio perfil)
DROP POLICY IF EXISTS p_profissionais_update ON profissionais;
CREATE POLICY p_profissionais_update ON profissionais
    FOR UPDATE
    TO authenticated
    USING (
        is_admin_clinico()
        OR auth_user_id = auth.uid()
    )
    WITH CHECK (
        is_admin_clinico()
        OR (
            auth_user_id = auth.uid()
            AND perfil = (SELECT perfil FROM profissionais WHERE auth_user_id = auth.uid())
        )
    );

-- DELETE: apenas admin_clinico (e mesmo assim, prefere-se desativar com
-- ativo = false em vez de deletar de fato)
DROP POLICY IF EXISTS p_profissionais_delete ON profissionais;
CREATE POLICY p_profissionais_delete ON profissionais
    FOR DELETE
    TO authenticated
    USING (is_admin_clinico());

-- ============================================================================
-- VINCULOS_PROFISSIONAL_SUPERVISOR
-- ============================================================================

ALTER TABLE vinculos_profissional_supervisor ENABLE ROW LEVEL SECURITY;

-- SELECT: admin_clinico vê todos; supervisor vê seus estagiários;
-- estagiário vê seus supervisores
DROP POLICY IF EXISTS p_vinc_sup_select ON vinculos_profissional_supervisor;
CREATE POLICY p_vinc_sup_select ON vinculos_profissional_supervisor
    FOR SELECT
    TO authenticated
    USING (
        is_admin_clinico()
        OR supervisor_id = current_profissional_id()
        OR estagiario_id = current_profissional_id()
    );

-- INSERT/UPDATE/DELETE: apenas admin_clinico
DROP POLICY IF EXISTS p_vinc_sup_insert ON vinculos_profissional_supervisor;
CREATE POLICY p_vinc_sup_insert ON vinculos_profissional_supervisor
    FOR INSERT
    TO authenticated
    WITH CHECK (is_admin_clinico());

DROP POLICY IF EXISTS p_vinc_sup_update ON vinculos_profissional_supervisor;
CREATE POLICY p_vinc_sup_update ON vinculos_profissional_supervisor
    FOR UPDATE
    TO authenticated
    USING (is_admin_clinico())
    WITH CHECK (is_admin_clinico());

DROP POLICY IF EXISTS p_vinc_sup_delete ON vinculos_profissional_supervisor;
CREATE POLICY p_vinc_sup_delete ON vinculos_profissional_supervisor
    FOR DELETE
    TO authenticated
    USING (is_admin_clinico());

-- ============================================================================
-- Validação
-- ============================================================================

SELECT
    tablename AS tabela,
    policyname AS politica,
    cmd AS operacao
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('profissionais', 'vinculos_profissional_supervisor')
ORDER BY tablename, cmd;
-- Esperado: 8 linhas

-- ============================================================================
-- CORTEX_APP — Sprint A2 — Arquivo 07 de 12
-- RLS para dados clínicos: anamnese, hipóteses, relatório escolar, sessões
-- ============================================================================
-- Lógica:
-- - admin_clinico: vê tudo
-- - admin_gestor: vê APENAS sessões (para gerenciar agenda); NUNCA dados clínicos
-- - aplicador: vê seus pacientes
-- - estagiario: vê pacientes do supervisor (com restrições)
-- - corretor: NÃO vê anamnese, hipóteses nem relatório escolar (Princípio 8)
--             vê sessões apenas se relacionadas a aplicação de testes
-- ============================================================================

-- ============================================================================
-- ANAMNESES
-- ============================================================================

ALTER TABLE anamneses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_anamneses_select ON anamneses;
CREATE POLICY p_anamneses_select ON anamneses
    FOR SELECT
    TO authenticated
    USING (
        is_admin_clinico()
        OR has_paciente_vinculado(paciente_id)
        OR estagiario_ve_paciente(paciente_id)
        -- Princípio 8: Corretor NÃO vê anamnese
        -- admin_gestor NÃO vê dados clínicos
    );

DROP POLICY IF EXISTS p_anamneses_insert ON anamneses;
CREATE POLICY p_anamneses_insert ON anamneses
    FOR INSERT
    TO authenticated
    WITH CHECK (
        is_admin_clinico()
        OR has_paciente_vinculado(paciente_id)
        OR estagiario_ve_paciente(paciente_id)
    );

DROP POLICY IF EXISTS p_anamneses_update ON anamneses;
CREATE POLICY p_anamneses_update ON anamneses
    FOR UPDATE
    TO authenticated
    USING (
        is_admin_clinico()
        OR has_paciente_vinculado(paciente_id)
        OR estagiario_ve_paciente(paciente_id)
    )
    WITH CHECK (
        is_admin_clinico()
        OR has_paciente_vinculado(paciente_id)
        OR estagiario_ve_paciente(paciente_id)
    );

DROP POLICY IF EXISTS p_anamneses_delete ON anamneses;
CREATE POLICY p_anamneses_delete ON anamneses
    FOR DELETE
    TO authenticated
    USING (is_admin_clinico());

-- ============================================================================
-- HIPOTESES
-- ============================================================================

ALTER TABLE hipoteses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_hipoteses_select ON hipoteses;
CREATE POLICY p_hipoteses_select ON hipoteses
    FOR SELECT
    TO authenticated
    USING (
        is_admin_clinico()
        OR has_paciente_vinculado(paciente_id)
        OR estagiario_ve_paciente(paciente_id)
        -- Corretor NÃO vê hipóteses (Princípio 8)
    );

DROP POLICY IF EXISTS p_hipoteses_insert ON hipoteses;
CREATE POLICY p_hipoteses_insert ON hipoteses
    FOR INSERT
    TO authenticated
    WITH CHECK (
        is_admin_clinico()
        OR has_paciente_vinculado(paciente_id)
        OR estagiario_ve_paciente(paciente_id)
    );

DROP POLICY IF EXISTS p_hipoteses_update ON hipoteses;
CREATE POLICY p_hipoteses_update ON hipoteses
    FOR UPDATE
    TO authenticated
    USING (
        is_admin_clinico()
        OR has_paciente_vinculado(paciente_id)
        OR estagiario_ve_paciente(paciente_id)
    )
    WITH CHECK (
        is_admin_clinico()
        OR has_paciente_vinculado(paciente_id)
        OR estagiario_ve_paciente(paciente_id)
    );

DROP POLICY IF EXISTS p_hipoteses_delete ON hipoteses;
CREATE POLICY p_hipoteses_delete ON hipoteses
    FOR DELETE
    TO authenticated
    USING (is_admin_clinico());

-- ============================================================================
-- RELATORIOS_ESCOLARES
-- ============================================================================

ALTER TABLE relatorios_escolares ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_rel_esc_select ON relatorios_escolares;
CREATE POLICY p_rel_esc_select ON relatorios_escolares
    FOR SELECT
    TO authenticated
    USING (
        is_admin_clinico()
        OR has_paciente_vinculado(paciente_id)
        OR estagiario_ve_paciente(paciente_id)
    );

DROP POLICY IF EXISTS p_rel_esc_insert ON relatorios_escolares;
CREATE POLICY p_rel_esc_insert ON relatorios_escolares
    FOR INSERT
    TO authenticated
    WITH CHECK (
        is_admin_clinico()
        OR has_paciente_vinculado(paciente_id)
        OR estagiario_ve_paciente(paciente_id)
    );

DROP POLICY IF EXISTS p_rel_esc_update ON relatorios_escolares;
CREATE POLICY p_rel_esc_update ON relatorios_escolares
    FOR UPDATE
    TO authenticated
    USING (
        is_admin_clinico()
        OR has_paciente_vinculado(paciente_id)
        OR estagiario_ve_paciente(paciente_id)
    )
    WITH CHECK (
        is_admin_clinico()
        OR has_paciente_vinculado(paciente_id)
        OR estagiario_ve_paciente(paciente_id)
    );

DROP POLICY IF EXISTS p_rel_esc_delete ON relatorios_escolares;
CREATE POLICY p_rel_esc_delete ON relatorios_escolares
    FOR DELETE
    TO authenticated
    USING (is_admin_clinico());

-- ============================================================================
-- SESSOES
-- ============================================================================
-- Diferente das outras: admin_gestor vê (precisa para agendar)

ALTER TABLE sessoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_sessoes_select ON sessoes;
CREATE POLICY p_sessoes_select ON sessoes
    FOR SELECT
    TO authenticated
    USING (
        is_admin_clinico()
        OR current_perfil() = 'admin_gestor'::perfil_usuario
        OR profissional_id = current_profissional_id()
        OR has_paciente_vinculado(paciente_id)
        OR estagiario_ve_paciente(paciente_id)
    );

-- INSERT: admin_clinico, admin_gestor (agenda) ou aplicador (próprias sessões)
DROP POLICY IF EXISTS p_sessoes_insert ON sessoes;
CREATE POLICY p_sessoes_insert ON sessoes
    FOR INSERT
    TO authenticated
    WITH CHECK (
        is_admin_clinico()
        OR current_perfil() = 'admin_gestor'::perfil_usuario
        OR (
            current_perfil() = 'neuropsicologo_aplicador'::perfil_usuario
            AND profissional_id = current_profissional_id()
        )
    );

DROP POLICY IF EXISTS p_sessoes_update ON sessoes;
CREATE POLICY p_sessoes_update ON sessoes
    FOR UPDATE
    TO authenticated
    USING (
        is_admin_clinico()
        OR current_perfil() = 'admin_gestor'::perfil_usuario
        OR profissional_id = current_profissional_id()
    )
    WITH CHECK (
        is_admin_clinico()
        OR current_perfil() = 'admin_gestor'::perfil_usuario
        OR profissional_id = current_profissional_id()
    );

DROP POLICY IF EXISTS p_sessoes_delete ON sessoes;
CREATE POLICY p_sessoes_delete ON sessoes
    FOR DELETE
    TO authenticated
    USING (
        is_admin_clinico()
        OR current_perfil() = 'admin_gestor'::perfil_usuario
    );

-- ============================================================================
-- Validação
-- ============================================================================

SELECT
    tablename AS tabela,
    policyname AS politica,
    cmd AS operacao
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('anamneses', 'hipoteses', 'relatorios_escolares', 'sessoes')
ORDER BY tablename, cmd;
-- Esperado: 16 linhas (4 por tabela × 4 tabelas)

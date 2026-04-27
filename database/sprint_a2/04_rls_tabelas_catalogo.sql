-- ============================================================================
-- CORTEX_APP — Sprint A2 — Arquivo 04 de 12
-- RLS para tabelas de catálogo
-- ============================================================================
-- Tabelas: convenios, cids, instrumentos_catalogo
--
-- Política: leitura para qualquer usuário autenticado.
--           escrita apenas para admin_clinico.
--
-- Justificativa: catálogos são dados de referência. Todos precisam ler
-- (para preencher formulários), mas apenas o admin clínico pode alterar
-- (adicionar instrumentos, novos convênios, novos CIDs).
-- ============================================================================

-- ============================================================================
-- CONVENIOS
-- ============================================================================

ALTER TABLE convenios ENABLE ROW LEVEL SECURITY;

-- Qualquer usuário autenticado pode ler
DROP POLICY IF EXISTS p_convenios_select_autenticados ON convenios;
CREATE POLICY p_convenios_select_autenticados ON convenios
    FOR SELECT
    TO authenticated
    USING (current_profissional_id() IS NOT NULL);

-- Apenas admin_clinico pode inserir/atualizar/deletar
DROP POLICY IF EXISTS p_convenios_insert_admin ON convenios;
CREATE POLICY p_convenios_insert_admin ON convenios
    FOR INSERT
    TO authenticated
    WITH CHECK (is_admin_clinico());

DROP POLICY IF EXISTS p_convenios_update_admin ON convenios;
CREATE POLICY p_convenios_update_admin ON convenios
    FOR UPDATE
    TO authenticated
    USING (is_admin_clinico())
    WITH CHECK (is_admin_clinico());

DROP POLICY IF EXISTS p_convenios_delete_admin ON convenios;
CREATE POLICY p_convenios_delete_admin ON convenios
    FOR DELETE
    TO authenticated
    USING (is_admin_clinico());

-- ============================================================================
-- CIDS
-- ============================================================================

ALTER TABLE cids ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_cids_select_autenticados ON cids;
CREATE POLICY p_cids_select_autenticados ON cids
    FOR SELECT
    TO authenticated
    USING (current_profissional_id() IS NOT NULL);

DROP POLICY IF EXISTS p_cids_insert_admin ON cids;
CREATE POLICY p_cids_insert_admin ON cids
    FOR INSERT
    TO authenticated
    WITH CHECK (is_admin_clinico());

DROP POLICY IF EXISTS p_cids_update_admin ON cids;
CREATE POLICY p_cids_update_admin ON cids
    FOR UPDATE
    TO authenticated
    USING (is_admin_clinico())
    WITH CHECK (is_admin_clinico());

DROP POLICY IF EXISTS p_cids_delete_admin ON cids;
CREATE POLICY p_cids_delete_admin ON cids
    FOR DELETE
    TO authenticated
    USING (is_admin_clinico());

-- ============================================================================
-- INSTRUMENTOS_CATALOGO
-- ============================================================================

ALTER TABLE instrumentos_catalogo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_instrumentos_select_autenticados ON instrumentos_catalogo;
CREATE POLICY p_instrumentos_select_autenticados ON instrumentos_catalogo
    FOR SELECT
    TO authenticated
    USING (current_profissional_id() IS NOT NULL);

DROP POLICY IF EXISTS p_instrumentos_insert_admin ON instrumentos_catalogo;
CREATE POLICY p_instrumentos_insert_admin ON instrumentos_catalogo
    FOR INSERT
    TO authenticated
    WITH CHECK (is_admin_clinico());

DROP POLICY IF EXISTS p_instrumentos_update_admin ON instrumentos_catalogo;
CREATE POLICY p_instrumentos_update_admin ON instrumentos_catalogo
    FOR UPDATE
    TO authenticated
    USING (is_admin_clinico())
    WITH CHECK (is_admin_clinico());

DROP POLICY IF EXISTS p_instrumentos_delete_admin ON instrumentos_catalogo;
CREATE POLICY p_instrumentos_delete_admin ON instrumentos_catalogo
    FOR DELETE
    TO authenticated
    USING (is_admin_clinico());

-- ============================================================================
-- Validação: 12 políticas devem aparecer (4 por tabela × 3 tabelas)
-- ============================================================================

SELECT
    tablename AS tabela,
    policyname AS politica,
    cmd AS operacao
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('convenios', 'cids', 'instrumentos_catalogo')
ORDER BY tablename, cmd;
-- Esperado: 12 linhas (4 por tabela)

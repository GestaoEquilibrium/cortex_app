-- ============================================================================
-- CORTEX_APP — Sprint A2 — Arquivo 09 de 12
-- RLS para auditoria_acessos
-- ============================================================================
-- Lógica:
-- - INSERT é livre para todos os usuários autenticados (logs de qualquer
--   ação devem poder ser registrados)
-- - SELECT apenas admin_clinico (responsabilidade de auditoria interna LGPD)
-- - UPDATE/DELETE/TRUNCATE bloqueados pelos triggers do Sprint A1
--   (imutabilidade)
-- ============================================================================

ALTER TABLE auditoria_acessos ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- INSERT: qualquer usuário autenticado
-- ============================================================================
-- Justificativa: o frontend e os triggers precisam poder logar ações de
-- qualquer perfil. Não tem como auditar se um perfil específico não puder
-- escrever na auditoria.

DROP POLICY IF EXISTS p_auditoria_insert ON auditoria_acessos;
CREATE POLICY p_auditoria_insert ON auditoria_acessos
    FOR INSERT
    TO authenticated
    WITH CHECK (current_profissional_id() IS NOT NULL);

-- ============================================================================
-- SELECT: apenas admin_clinico
-- ============================================================================

DROP POLICY IF EXISTS p_auditoria_select ON auditoria_acessos;
CREATE POLICY p_auditoria_select ON auditoria_acessos
    FOR SELECT
    TO authenticated
    USING (is_admin_clinico());

-- ============================================================================
-- UPDATE: ninguém (já bloqueado por trigger, mas RLS reforça)
-- ============================================================================

DROP POLICY IF EXISTS p_auditoria_update_bloqueado ON auditoria_acessos;
CREATE POLICY p_auditoria_update_bloqueado ON auditoria_acessos
    FOR UPDATE
    TO authenticated
    USING (false)
    WITH CHECK (false);

-- ============================================================================
-- DELETE: ninguém (já bloqueado por trigger, mas RLS reforça)
-- ============================================================================

DROP POLICY IF EXISTS p_auditoria_delete_bloqueado ON auditoria_acessos;
CREATE POLICY p_auditoria_delete_bloqueado ON auditoria_acessos
    FOR DELETE
    TO authenticated
    USING (false);

-- ============================================================================
-- Validação
-- ============================================================================

SELECT
    tablename AS tabela,
    policyname AS politica,
    cmd AS operacao
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'auditoria_acessos'
ORDER BY cmd;
-- Esperado: 4 linhas

-- ============================================================================
-- CORTEX_APP — Sprint A2 — Arquivo 06 de 12
-- RLS para pacientes e vínculos paciente↔aplicador
-- ============================================================================
-- Lógica conforme Princípio 7 (co-responsabilidade Wessilon + aplicador):
--
-- - admin_clinico (Wessilon): vê TODOS os pacientes (responsável universal)
-- - admin_gestor: vê dados administrativos para agendar (mas NÃO clínicos)
-- - neuropsicologo_aplicador: vê apenas pacientes a ele vinculados
-- - estagiario: vê pacientes do supervisor (apenas leitura)
-- - corretor: vê dados básicos apenas se tem teste do paciente para corrigir
-- ============================================================================

-- ============================================================================
-- PACIENTES
-- ============================================================================

ALTER TABLE pacientes ENABLE ROW LEVEL SECURITY;

-- SELECT
DROP POLICY IF EXISTS p_pacientes_select ON pacientes;
CREATE POLICY p_pacientes_select ON pacientes
    FOR SELECT
    TO authenticated
    USING (
        is_admin_clinico()
        -- admin_gestor vê para fins de agendamento
        OR current_perfil() = 'admin_gestor'::perfil_usuario
        -- aplicador vê pacientes vinculados a ele
        OR has_paciente_vinculado(id)
        -- estagiário vê pacientes do supervisor
        OR estagiario_ve_paciente(id)
        -- corretor vê apenas se tem teste do paciente para corrigir
        OR (
            current_perfil() = 'corretor'::perfil_usuario
            AND EXISTS (
                SELECT 1 FROM aplicacoes_instrumento a
                WHERE a.paciente_id = pacientes.id
                  AND a.status IN ('concluido_aplicacao'::status_aplicacao, 'em_correcao'::status_aplicacao)
            )
        )
    );

-- INSERT: admin_clinico, admin_gestor (cadastrar pacientes), aplicador
DROP POLICY IF EXISTS p_pacientes_insert ON pacientes;
CREATE POLICY p_pacientes_insert ON pacientes
    FOR INSERT
    TO authenticated
    WITH CHECK (
        is_admin_clinico()
        OR current_perfil() = 'admin_gestor'::perfil_usuario
        OR current_perfil() = 'neuropsicologo_aplicador'::perfil_usuario
    );

-- UPDATE: admin_clinico, admin_gestor (dados administrativos), aplicador (seus pacientes)
DROP POLICY IF EXISTS p_pacientes_update ON pacientes;
CREATE POLICY p_pacientes_update ON pacientes
    FOR UPDATE
    TO authenticated
    USING (
        is_admin_clinico()
        OR current_perfil() = 'admin_gestor'::perfil_usuario
        OR has_paciente_vinculado(id)
    )
    WITH CHECK (
        is_admin_clinico()
        OR current_perfil() = 'admin_gestor'::perfil_usuario
        OR has_paciente_vinculado(id)
    );

-- DELETE: APENAS admin_clinico (e ainda assim, evitar — preferir arquivar)
DROP POLICY IF EXISTS p_pacientes_delete ON pacientes;
CREATE POLICY p_pacientes_delete ON pacientes
    FOR DELETE
    TO authenticated
    USING (is_admin_clinico());

-- ============================================================================
-- VINCULOS_PACIENTE_APLICADOR
-- ============================================================================

ALTER TABLE vinculos_paciente_aplicador ENABLE ROW LEVEL SECURITY;

-- SELECT: admin_clinico, admin_gestor (gerencia atribuições),
-- aplicador vê seus vínculos, estagiário vê vínculos do supervisor
DROP POLICY IF EXISTS p_vinc_pac_select ON vinculos_paciente_aplicador;
CREATE POLICY p_vinc_pac_select ON vinculos_paciente_aplicador
    FOR SELECT
    TO authenticated
    USING (
        is_admin_clinico()
        OR current_perfil() = 'admin_gestor'::perfil_usuario
        OR aplicador_id = current_profissional_id()
        OR (
            current_perfil() = 'estagiario'::perfil_usuario
            AND aplicador_id IN (
                SELECT supervisor_id
                FROM vinculos_profissional_supervisor
                WHERE estagiario_id = current_profissional_id()
                  AND ativo = true
            )
        )
    );

-- INSERT: admin_clinico, admin_gestor (atribui na primeira sessão)
DROP POLICY IF EXISTS p_vinc_pac_insert ON vinculos_paciente_aplicador;
CREATE POLICY p_vinc_pac_insert ON vinculos_paciente_aplicador
    FOR INSERT
    TO authenticated
    WITH CHECK (
        is_admin_clinico()
        OR current_perfil() = 'admin_gestor'::perfil_usuario
    );

-- UPDATE: admin_clinico, admin_gestor (reatribui)
DROP POLICY IF EXISTS p_vinc_pac_update ON vinculos_paciente_aplicador;
CREATE POLICY p_vinc_pac_update ON vinculos_paciente_aplicador
    FOR UPDATE
    TO authenticated
    USING (
        is_admin_clinico()
        OR current_perfil() = 'admin_gestor'::perfil_usuario
    )
    WITH CHECK (
        is_admin_clinico()
        OR current_perfil() = 'admin_gestor'::perfil_usuario
    );

-- DELETE: apenas admin_clinico
DROP POLICY IF EXISTS p_vinc_pac_delete ON vinculos_paciente_aplicador;
CREATE POLICY p_vinc_pac_delete ON vinculos_paciente_aplicador
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
  AND tablename IN ('pacientes', 'vinculos_paciente_aplicador')
ORDER BY tablename, cmd;
-- Esperado: 8 linhas

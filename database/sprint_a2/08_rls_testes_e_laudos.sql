-- ============================================================================
-- CORTEX_APP — Sprint A2 — Arquivo 08 de 12
-- RLS para testes, correções, laudos e devolutivas
-- ============================================================================
-- Lógica:
-- - admin_clinico: vê tudo
-- - aplicador: vê tudo dos seus pacientes
-- - estagiario: vê o que o supervisor vê (com restrições)
-- - corretor: vê APLICAÇÕES, RESPOSTAS, CORREÇÕES de qualquer paciente
--             (Princípio 8 — fila de produção sem visão de paciente integrado)
--             mas NÃO vê laudo final integrado nem devolutiva
-- - admin_gestor: NÃO vê nada disso (apenas agenda)
-- ============================================================================

-- ============================================================================
-- APLICACOES_INSTRUMENTO
-- ============================================================================
-- Corretor PRECISA ver para corrigir; é o único caso onde corretor tem acesso
-- a dados do paciente (mas só os mínimos necessários)

ALTER TABLE aplicacoes_instrumento ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_aplicacoes_select ON aplicacoes_instrumento;
CREATE POLICY p_aplicacoes_select ON aplicacoes_instrumento
    FOR SELECT
    TO authenticated
    USING (
        is_admin_clinico()
        OR has_paciente_vinculado(paciente_id)
        OR estagiario_ve_paciente(paciente_id)
        -- Corretor vê para corrigir
        OR current_perfil() = 'corretor'::perfil_usuario
    );

DROP POLICY IF EXISTS p_aplicacoes_insert ON aplicacoes_instrumento;
CREATE POLICY p_aplicacoes_insert ON aplicacoes_instrumento
    FOR INSERT
    TO authenticated
    WITH CHECK (
        is_admin_clinico()
        OR has_paciente_vinculado(paciente_id)
        OR estagiario_ve_paciente(paciente_id)
    );

DROP POLICY IF EXISTS p_aplicacoes_update ON aplicacoes_instrumento;
CREATE POLICY p_aplicacoes_update ON aplicacoes_instrumento
    FOR UPDATE
    TO authenticated
    USING (
        is_admin_clinico()
        OR has_paciente_vinculado(paciente_id)
        OR estagiario_ve_paciente(paciente_id)
        -- Corretor pode atualizar status durante correção
        OR (
            current_perfil() = 'corretor'::perfil_usuario
            AND status IN ('concluido_aplicacao'::status_aplicacao, 'em_correcao'::status_aplicacao)
        )
    )
    WITH CHECK (
        is_admin_clinico()
        OR has_paciente_vinculado(paciente_id)
        OR estagiario_ve_paciente(paciente_id)
        OR current_perfil() = 'corretor'::perfil_usuario
    );

DROP POLICY IF EXISTS p_aplicacoes_delete ON aplicacoes_instrumento;
CREATE POLICY p_aplicacoes_delete ON aplicacoes_instrumento
    FOR DELETE
    TO authenticated
    USING (is_admin_clinico());

-- ============================================================================
-- RESPOSTAS_BRUTAS
-- ============================================================================

ALTER TABLE respostas_brutas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_respostas_select ON respostas_brutas;
CREATE POLICY p_respostas_select ON respostas_brutas
    FOR SELECT
    TO authenticated
    USING (
        is_admin_clinico()
        OR EXISTS (
            SELECT 1 FROM aplicacoes_instrumento a
            WHERE a.id = respostas_brutas.aplicacao_id
            AND (
                has_paciente_vinculado(a.paciente_id)
                OR estagiario_ve_paciente(a.paciente_id)
                OR current_perfil() = 'corretor'::perfil_usuario
            )
        )
    );

-- INSERT: aplicador presencial OU paciente respondendo via link único
-- (a inserção via link público é feita com chave anon; aplicador valida depois)
DROP POLICY IF EXISTS p_respostas_insert ON respostas_brutas;
CREATE POLICY p_respostas_insert ON respostas_brutas
    FOR INSERT
    TO authenticated
    WITH CHECK (
        is_admin_clinico()
        OR EXISTS (
            SELECT 1 FROM aplicacoes_instrumento a
            WHERE a.id = respostas_brutas.aplicacao_id
            AND (
                has_paciente_vinculado(a.paciente_id)
                OR estagiario_ve_paciente(a.paciente_id)
            )
        )
    );

DROP POLICY IF EXISTS p_respostas_update ON respostas_brutas;
CREATE POLICY p_respostas_update ON respostas_brutas
    FOR UPDATE
    TO authenticated
    USING (
        is_admin_clinico()
        OR EXISTS (
            SELECT 1 FROM aplicacoes_instrumento a
            WHERE a.id = respostas_brutas.aplicacao_id
            AND has_paciente_vinculado(a.paciente_id)
        )
    )
    WITH CHECK (
        is_admin_clinico()
        OR EXISTS (
            SELECT 1 FROM aplicacoes_instrumento a
            WHERE a.id = respostas_brutas.aplicacao_id
            AND has_paciente_vinculado(a.paciente_id)
        )
    );

DROP POLICY IF EXISTS p_respostas_delete ON respostas_brutas;
CREATE POLICY p_respostas_delete ON respostas_brutas
    FOR DELETE
    TO authenticated
    USING (is_admin_clinico());

-- ============================================================================
-- CORRECOES
-- ============================================================================
-- Corretor vê e edita; aplicador vê dos seus pacientes; estagiário vê do supervisor

ALTER TABLE correcoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_correcoes_select ON correcoes;
CREATE POLICY p_correcoes_select ON correcoes
    FOR SELECT
    TO authenticated
    USING (
        is_admin_clinico()
        OR current_perfil() = 'corretor'::perfil_usuario
        OR EXISTS (
            SELECT 1 FROM aplicacoes_instrumento a
            WHERE a.id = correcoes.aplicacao_id
            AND (
                has_paciente_vinculado(a.paciente_id)
                OR estagiario_ve_paciente(a.paciente_id)
            )
        )
    );

DROP POLICY IF EXISTS p_correcoes_insert ON correcoes;
CREATE POLICY p_correcoes_insert ON correcoes
    FOR INSERT
    TO authenticated
    WITH CHECK (
        is_admin_clinico()
        OR current_perfil() = 'corretor'::perfil_usuario
        OR EXISTS (
            SELECT 1 FROM aplicacoes_instrumento a
            WHERE a.id = correcoes.aplicacao_id
            AND has_paciente_vinculado(a.paciente_id)
        )
    );

DROP POLICY IF EXISTS p_correcoes_update ON correcoes;
CREATE POLICY p_correcoes_update ON correcoes
    FOR UPDATE
    TO authenticated
    USING (
        is_admin_clinico()
        OR current_perfil() = 'corretor'::perfil_usuario
        OR EXISTS (
            SELECT 1 FROM aplicacoes_instrumento a
            WHERE a.id = correcoes.aplicacao_id
            AND has_paciente_vinculado(a.paciente_id)
        )
    )
    WITH CHECK (
        is_admin_clinico()
        OR current_perfil() = 'corretor'::perfil_usuario
        OR EXISTS (
            SELECT 1 FROM aplicacoes_instrumento a
            WHERE a.id = correcoes.aplicacao_id
            AND has_paciente_vinculado(a.paciente_id)
        )
    );

DROP POLICY IF EXISTS p_correcoes_delete ON correcoes;
CREATE POLICY p_correcoes_delete ON correcoes
    FOR DELETE
    TO authenticated
    USING (is_admin_clinico());

-- ============================================================================
-- LAUDOS
-- ============================================================================
-- Princípio 8: Corretor NÃO vê laudo final integrado (essa é a separação ética)

ALTER TABLE laudos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_laudos_select ON laudos;
CREATE POLICY p_laudos_select ON laudos
    FOR SELECT
    TO authenticated
    USING (
        is_admin_clinico()
        OR aplicador_responsavel_id = current_profissional_id()
        OR has_paciente_vinculado(paciente_id)
        OR (
            current_perfil() = 'estagiario'::perfil_usuario
            AND aplicador_responsavel_id IN (
                SELECT supervisor_id
                FROM vinculos_profissional_supervisor
                WHERE estagiario_id = current_profissional_id()
                  AND ativo = true
            )
        )
        -- Corretor NÃO vê laudo final (Princípio 8)
        -- admin_gestor NÃO vê dados clínicos
    );

DROP POLICY IF EXISTS p_laudos_insert ON laudos;
CREATE POLICY p_laudos_insert ON laudos
    FOR INSERT
    TO authenticated
    WITH CHECK (
        is_admin_clinico()
        OR (
            current_perfil() = 'neuropsicologo_aplicador'::perfil_usuario
            AND has_paciente_vinculado(paciente_id)
        )
        OR (
            current_perfil() = 'estagiario'::perfil_usuario
            AND estagiario_ve_paciente(paciente_id)
        )
    );

DROP POLICY IF EXISTS p_laudos_update ON laudos;
CREATE POLICY p_laudos_update ON laudos
    FOR UPDATE
    TO authenticated
    USING (
        is_admin_clinico()
        OR aplicador_responsavel_id = current_profissional_id()
        OR (
            current_perfil() = 'estagiario'::perfil_usuario
            AND aplicador_responsavel_id IN (
                SELECT supervisor_id
                FROM vinculos_profissional_supervisor
                WHERE estagiario_id = current_profissional_id()
                  AND ativo = true
            )
        )
    )
    WITH CHECK (
        is_admin_clinico()
        OR aplicador_responsavel_id = current_profissional_id()
        OR (
            current_perfil() = 'estagiario'::perfil_usuario
            AND aplicador_responsavel_id IN (
                SELECT supervisor_id
                FROM vinculos_profissional_supervisor
                WHERE estagiario_id = current_profissional_id()
                  AND ativo = true
            )
        )
    );

DROP POLICY IF EXISTS p_laudos_delete ON laudos;
CREATE POLICY p_laudos_delete ON laudos
    FOR DELETE
    TO authenticated
    USING (is_admin_clinico());

-- ============================================================================
-- DEVOLUTIVAS
-- ============================================================================
-- Apenas admin_clinico (Wessilon) realiza devolutivas
-- Aplicador vê para acompanhamento dos próprios casos

ALTER TABLE devolutivas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_devolutivas_select ON devolutivas;
CREATE POLICY p_devolutivas_select ON devolutivas
    FOR SELECT
    TO authenticated
    USING (
        is_admin_clinico()
        OR has_paciente_vinculado(paciente_id)
    );

-- Apenas admin_clinico cria devolutivas
DROP POLICY IF EXISTS p_devolutivas_insert ON devolutivas;
CREATE POLICY p_devolutivas_insert ON devolutivas
    FOR INSERT
    TO authenticated
    WITH CHECK (is_admin_clinico());

DROP POLICY IF EXISTS p_devolutivas_update ON devolutivas;
CREATE POLICY p_devolutivas_update ON devolutivas
    FOR UPDATE
    TO authenticated
    USING (is_admin_clinico())
    WITH CHECK (is_admin_clinico());

DROP POLICY IF EXISTS p_devolutivas_delete ON devolutivas;
CREATE POLICY p_devolutivas_delete ON devolutivas
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
  AND tablename IN ('aplicacoes_instrumento', 'respostas_brutas', 'correcoes', 'laudos', 'devolutivas')
ORDER BY tablename, cmd;
-- Esperado: 20 linhas (4 por tabela × 5 tabelas)

-- ============================================================================
-- CORTEX_APP — Sprint A2 — Arquivo 02 de 12
-- Funções auxiliares de RLS
-- ============================================================================
-- Cria as funções que serão usadas dentro de TODAS as políticas de RLS.
--
-- Por que precisamos delas:
-- O Supabase Auth identifica o usuário pelo auth.uid() (UUID do auth.users),
-- mas nossas políticas precisam saber:
--   1) o ID do registro em profissionais (não em auth.users)
--   2) o perfil de acesso (admin_clinico, neuropsicologo_aplicador, etc.)
-- Essas funções fazem essa "tradução" e são chamadas dentro das policies.
--
-- IMPORTANTE: SECURITY DEFINER — as funções rodam com privilégios elevados,
-- pois precisam ler de auth.users (que é uma tabela protegida).
-- ============================================================================

-- ============================================================================
-- current_profissional_id()
-- Retorna o ID do registro do usuário atual em "profissionais"
-- ============================================================================

CREATE OR REPLACE FUNCTION current_profissional_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT id
    FROM profissionais
    WHERE auth_user_id = auth.uid()
      AND ativo = true
    LIMIT 1;
$$;

COMMENT ON FUNCTION current_profissional_id() IS
    'Retorna o ID do profissional logado, ou NULL se não autenticado/inativo';

-- ============================================================================
-- current_perfil()
-- Retorna o perfil (enum) do usuário atual
-- ============================================================================

CREATE OR REPLACE FUNCTION current_perfil()
RETURNS perfil_usuario
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT perfil
    FROM profissionais
    WHERE auth_user_id = auth.uid()
      AND ativo = true
    LIMIT 1;
$$;

COMMENT ON FUNCTION current_perfil() IS
    'Retorna o perfil do profissional logado (admin_clinico, neuropsicologo_aplicador, etc.)';

-- ============================================================================
-- is_admin_clinico()
-- Atalho útil para conferir se o usuário atual é Wessilon (admin_clinico)
-- ============================================================================

CREATE OR REPLACE FUNCTION is_admin_clinico()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT current_perfil() = 'admin_clinico'::perfil_usuario;
$$;

-- ============================================================================
-- has_paciente_vinculado(paciente_id)
-- Retorna TRUE se o profissional logado tem vínculo ativo com o paciente
-- ============================================================================

CREATE OR REPLACE FUNCTION has_paciente_vinculado(p_paciente_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM vinculos_paciente_aplicador
        WHERE paciente_id = p_paciente_id
          AND aplicador_id = current_profissional_id()
          AND ativo = true
    );
$$;

-- ============================================================================
-- estagiario_ve_paciente(paciente_id)
-- Retorna TRUE se o usuário atual é estagiário e o paciente é do supervisor
-- ============================================================================

CREATE OR REPLACE FUNCTION estagiario_ve_paciente(p_paciente_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM vinculos_profissional_supervisor s
        JOIN vinculos_paciente_aplicador v ON v.aplicador_id = s.supervisor_id
        WHERE s.estagiario_id = current_profissional_id()
          AND s.ativo = true
          AND v.paciente_id = p_paciente_id
          AND v.ativo = true
    )
    AND current_perfil() = 'estagiario'::perfil_usuario;
$$;

-- ============================================================================
-- Validação: as 5 funções devem aparecer
-- ============================================================================

SELECT
    routine_name AS funcao,
    data_type AS retorna,
    security_type AS seguranca
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
      'current_profissional_id',
      'current_perfil',
      'is_admin_clinico',
      'has_paciente_vinculado',
      'estagiario_ve_paciente'
  )
ORDER BY routine_name;
-- Esperado: 5 linhas

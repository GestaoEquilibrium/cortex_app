-- ============================================================================
-- CORTEX_APP — Sprint A2 — Arquivo 10 de 12
-- Validação consolidada do RLS
-- ============================================================================
-- Roda este arquivo POR ÚLTIMO entre os SQLs.
-- Verifica se todas as tabelas têm RLS ativado e o número correto de policies.
-- ============================================================================

-- ============================================================================
-- Verificação 1: RLS habilitado em todas as 17 tabelas
-- ============================================================================

SELECT
    'RLS habilitado' AS validacao,
    COUNT(*) FILTER (WHERE relrowsecurity = true) AS tabelas_com_rls,
    COUNT(*) AS total_tabelas,
    CASE
        WHEN COUNT(*) FILTER (WHERE relrowsecurity = true) = 17 THEN 'OK'
        ELSE 'ERRO: alguma tabela sem RLS'
    END AS resultado
FROM pg_class
WHERE relkind = 'r'
  AND relnamespace = 'public'::regnamespace
  AND relname IN (
      'convenios', 'cids', 'instrumentos_catalogo',
      'profissionais', 'vinculos_profissional_supervisor',
      'pacientes', 'vinculos_paciente_aplicador',
      'anamneses', 'hipoteses', 'relatorios_escolares',
      'sessoes', 'aplicacoes_instrumento', 'respostas_brutas',
      'correcoes', 'laudos', 'devolutivas',
      'auditoria_acessos'
  );

-- ============================================================================
-- Verificação 2: contagem de políticas por tabela
-- ============================================================================

SELECT
    tablename AS tabela,
    COUNT(*) AS num_policies
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY tablename;
-- Esperado:
--   anamneses: 4
--   aplicacoes_instrumento: 4
--   auditoria_acessos: 4
--   cids: 4
--   convenios: 4
--   correcoes: 4
--   devolutivas: 4
--   hipoteses: 4
--   instrumentos_catalogo: 4
--   laudos: 4
--   pacientes: 4
--   profissionais: 4
--   relatorios_escolares: 4
--   respostas_brutas: 4
--   sessoes: 4
--   vinculos_paciente_aplicador: 4
--   vinculos_profissional_supervisor: 4
--
-- TOTAL: 68 policies em 17 tabelas

-- ============================================================================
-- Verificação 3: Total de policies
-- ============================================================================

SELECT
    'Total de policies' AS validacao,
    COUNT(*) AS encontradas,
    68 AS esperadas,
    CASE WHEN COUNT(*) = 68 THEN 'OK' ELSE 'ERRO' END AS resultado
FROM pg_policies
WHERE schemaname = 'public';

-- ============================================================================
-- Verificação 4: Funções auxiliares de RLS criadas
-- ============================================================================

SELECT
    'Funções auxiliares' AS validacao,
    COUNT(*) AS encontradas,
    5 AS esperadas,
    CASE WHEN COUNT(*) = 5 THEN 'OK' ELSE 'ERRO' END AS resultado
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
      'current_profissional_id',
      'current_perfil',
      'is_admin_clinico',
      'has_paciente_vinculado',
      'estagiario_ve_paciente'
  );

-- ============================================================================
-- Verificação 5: Trigger handle_new_user
-- ============================================================================

SELECT
    'Trigger handle_new_user' AS validacao,
    COUNT(*) AS encontrados,
    1 AS esperados,
    CASE WHEN COUNT(*) = 1 THEN 'OK' ELSE 'ERRO' END AS resultado
FROM information_schema.triggers
WHERE trigger_name = 'trg_on_auth_user_created';

-- ============================================================================
-- RESUMO FINAL
-- ============================================================================

SELECT '========================================' AS divisor, '' AS info
UNION ALL
SELECT 'CORTEX_APP — Sprint A2: RLS validado', ''
UNION ALL
SELECT '========================================', ''
UNION ALL
SELECT 'Tabelas com RLS',
       (SELECT COUNT(*)::text FROM pg_class
        WHERE relkind = 'r' AND relnamespace = 'public'::regnamespace
          AND relrowsecurity = true)
UNION ALL
SELECT 'Total de policies',
       (SELECT COUNT(*)::text FROM pg_policies WHERE schemaname = 'public')
UNION ALL
SELECT 'Funções auxiliares',
       (SELECT COUNT(*)::text FROM information_schema.routines
        WHERE routine_schema = 'public'
          AND routine_name IN ('current_profissional_id','current_perfil','is_admin_clinico','has_paciente_vinculado','estagiario_ve_paciente'))
UNION ALL
SELECT 'Trigger de signup',
       (SELECT COUNT(*)::text FROM information_schema.triggers
        WHERE trigger_name = 'trg_on_auth_user_created')
UNION ALL
SELECT 'Próximo passo', 'Cadastro do primeiro usuário'
UNION ALL
SELECT '========================================', '';

-- ============================================================================
-- CORTEX_APP — Sprint A1 — Arquivo 08 de 08
-- Validação final do setup
-- ============================================================================
-- Execute este arquivo POR ÚLTIMO. Ele não cria nada.
-- Apenas roda queries para confirmar que tudo foi criado corretamente.
-- ============================================================================

-- ============================================================================
-- Validação 1: TODAS as tabelas do CORTEX devem existir
-- ============================================================================

SELECT
    'TABELAS' AS validacao,
    COUNT(*) AS encontradas,
    14 AS esperadas,
    CASE WHEN COUNT(*) = 14 THEN 'OK' ELSE 'ERRO' END AS resultado
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
      'convenios', 'cids', 'instrumentos_catalogo',
      'profissionais', 'vinculos_profissional_supervisor',
      'pacientes', 'vinculos_paciente_aplicador',
      'anamneses', 'hipoteses', 'relatorios_escolares',
      'sessoes', 'aplicacoes_instrumento', 'respostas_brutas',
      'correcoes', 'laudos', 'devolutivas',
      'auditoria_acessos'
  );

-- ============================================================================
-- Validação 2: Lista detalhada das tabelas criadas
-- ============================================================================

SELECT
    table_name AS tabela,
    (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = t.table_name) AS num_colunas
FROM information_schema.tables t
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- ============================================================================
-- Validação 3: Types ENUM criados
-- ============================================================================

SELECT
    'ENUMs' AS validacao,
    COUNT(*) AS encontrados,
    13 AS esperados,
    CASE WHEN COUNT(*) = 13 THEN 'OK' ELSE 'ERRO' END AS resultado
FROM pg_type
WHERE typtype = 'e'
  AND typname IN (
      'perfil_usuario', 'status_paciente', 'sexo_paciente',
      'faixa_etaria_anamnese', 'status_anamnese', 'tipo_sessao',
      'status_sessao', 'modalidade_aplicacao', 'status_aplicacao',
      'status_correcao', 'status_laudo', 'forma_entrega_laudo',
      'acao_auditoria'
  );

-- ============================================================================
-- Validação 4: Triggers de updated_at
-- ============================================================================

SELECT
    event_object_table AS tabela,
    trigger_name,
    action_timing AS quando,
    event_manipulation AS evento
FROM information_schema.triggers
WHERE trigger_name LIKE '%updated_at%'
  AND event_object_schema = 'public'
ORDER BY event_object_table;
-- Esperado: pelo menos 12 triggers (um por tabela com updated_at)

-- ============================================================================
-- Validação 5: Triggers de proteção da auditoria
-- ============================================================================

SELECT
    'TRIGGERS_AUDITORIA' AS validacao,
    COUNT(*) AS encontrados,
    3 AS esperados,
    CASE WHEN COUNT(*) = 3 THEN 'OK' ELSE 'ERRO' END AS resultado
FROM information_schema.triggers
WHERE event_object_table = 'auditoria_acessos'
  AND event_object_schema = 'public';

-- ============================================================================
-- Validação 6: Convênios cadastrados
-- ============================================================================

SELECT 'Convênios cadastrados' AS info, COUNT(*) AS total FROM convenios;

SELECT
    operadora,
    nome,
    codigo_procedimento,
    tipo_pacote
FROM convenios
ORDER BY operadora NULLS FIRST, nome;

-- ============================================================================
-- Validação 7: Instrumentos cadastrados
-- ============================================================================

SELECT 'Instrumentos no catálogo' AS info, COUNT(*) AS total FROM instrumentos_catalogo;

SELECT
    categoria,
    sigla,
    nome_completo,
    faixa_etaria_label,
    permite_aplicacao_online AS online,
    permite_correcao_sistema AS correcao_sistema
FROM instrumentos_catalogo
ORDER BY categoria, ordem_categoria;

-- ============================================================================
-- Validação 8: CIDs cadastrados
-- ============================================================================

SELECT 'CIDs cadastrados' AS info, COUNT(*) AS total FROM cids;

SELECT
    versao,
    COUNT(*) AS quantidade
FROM cids
GROUP BY versao
ORDER BY versao;

-- ============================================================================
-- Validação 9: TESTE da imutabilidade da auditoria
-- ============================================================================
-- Se este SELECT funcionar, significa que a tabela existe.
-- Você pode testar manualmente depois rodando:
--    UPDATE auditoria_acessos SET acao = 'login' WHERE id = (SELECT id FROM auditoria_acessos LIMIT 1);
-- Se houver registros, deve dar erro: "Logs de auditoria são imutáveis."

SELECT 'auditoria_acessos' AS tabela,
       COUNT(*) AS registros_atuais
FROM auditoria_acessos;
-- Esperado: 0 registros (ainda não há ações)

-- ============================================================================
-- RESUMO FINAL
-- ============================================================================

SELECT
    '===============================' AS divisor,
    '' AS info
UNION ALL
SELECT 'CORTEX_APP — Sprint A1 finalizado', ''
UNION ALL
SELECT '===============================', ''
UNION ALL
SELECT 'Tabelas criadas',
       (SELECT COUNT(*)::text FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE')
UNION ALL
SELECT 'Convênios', (SELECT COUNT(*)::text FROM convenios)
UNION ALL
SELECT 'Instrumentos', (SELECT COUNT(*)::text FROM instrumentos_catalogo)
UNION ALL
SELECT 'CIDs', (SELECT COUNT(*)::text FROM cids)
UNION ALL
SELECT 'Próximo passo', 'Sprint A2 — Auth e RLS'
UNION ALL
SELECT '===============================', '';

-- ============================================================================
-- CORTEX_APP — Sprint A1 — Arquivo 01 de 08
-- Habilitação de extensões PostgreSQL
-- ============================================================================
-- Execute este arquivo PRIMEIRO no SQL Editor do Supabase.
-- ============================================================================

-- Extensão para geração de UUIDs (versão 4, aleatórios)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Extensão para funções criptográficas (gen_random_uuid, hashing)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Extensão para busca full-text otimizada em português
-- (já vem habilitada no Supabase, mas garantimos aqui)
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================================================
-- Verificação: deve retornar 3 linhas
-- ============================================================================

SELECT
    extname AS extensao,
    extversion AS versao
FROM pg_extension
WHERE extname IN ('uuid-ossp', 'pgcrypto', 'pg_trgm')
ORDER BY extname;

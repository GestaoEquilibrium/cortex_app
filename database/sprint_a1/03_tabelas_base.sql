-- ============================================================================
-- CORTEX_APP — Sprint A1 — Arquivo 03 de 08
-- Tabelas base / catálogo
-- ============================================================================
-- Cria as tabelas de referência usadas por todo o sistema.
-- Estas tabelas têm baixo volume (poucas dezenas a poucos milhares de
-- registros) e são populadas com dados estáticos no arquivo 07.
-- ============================================================================

-- ============================================================================
-- CONVÊNIOS
-- ============================================================================

CREATE TABLE IF NOT EXISTS convenios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL UNIQUE,
    operadora TEXT,
    tipo_pacote TEXT,
    codigo_procedimento TEXT,
    ativo BOOLEAN DEFAULT true,
    observacoes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE convenios IS 'Convênios atendidos pela Equilibrium (GNDI, UNIMED, particular)';
COMMENT ON COLUMN convenios.codigo_procedimento IS 'Código do pacote no convênio (ex: 60010126 = GNDI Psico TEA)';

-- ============================================================================
-- CIDs (CID-11 e DSM-5-TR)
-- ============================================================================

CREATE TABLE IF NOT EXISTS cids (
    id TEXT PRIMARY KEY, -- código do CID, ex: '6A02', 'F84.0'
    versao TEXT NOT NULL CHECK (versao IN ('CID-11', 'DSM-5-TR')),
    titulo TEXT NOT NULL,
    descricao TEXT,
    capitulo TEXT,
    ativo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cids_busca
    ON cids USING gin(to_tsvector('portuguese', titulo || ' ' || COALESCE(descricao, '')));

CREATE INDEX IF NOT EXISTS idx_cids_versao
    ON cids(versao) WHERE ativo = true;

COMMENT ON TABLE cids IS 'Catálogo de diagnósticos CID-11 e DSM-5-TR';

-- ============================================================================
-- INSTRUMENTOS DO CATÁLOGO
-- ============================================================================

CREATE TABLE IF NOT EXISTS instrumentos_catalogo (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sigla TEXT NOT NULL UNIQUE,
    nome_completo TEXT NOT NULL,
    o_que_avalia TEXT NOT NULL,

    -- Faixa etária em meses (permite precisão para testes infantis)
    faixa_etaria_min_meses INT,
    faixa_etaria_max_meses INT,
    faixa_etaria_label TEXT, -- ex: "6-16 anos", "4-72 meses"

    dominio_principal TEXT NOT NULL, -- 'inteligencia', 'tea', 'tdah', 'memoria', etc.
    versao TEXT,
    autores TEXT,
    editora TEXT,

    -- Modalidades suportadas pelo CORTEX
    permite_aplicacao_online BOOLEAN DEFAULT false,
    permite_correcao_sistema BOOLEAN DEFAULT false,
    versao_engine TEXT,

    -- URLs dos schemas JSON (preenchidos na Fase D)
    schema_itens_url TEXT,
    schema_correcao_url TEXT,
    schema_normas_url TEXT,
    template_relatorio_url TEXT,

    -- Status
    ativo BOOLEAN DEFAULT true,
    em_breve BOOLEAN DEFAULT false,

    -- Organização visual
    ordem_categoria INT,
    categoria TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_instrumentos_sigla
    ON instrumentos_catalogo(sigla);

CREATE INDEX IF NOT EXISTS idx_instrumentos_dominio
    ON instrumentos_catalogo(dominio_principal);

CREATE INDEX IF NOT EXISTS idx_instrumentos_ativo
    ON instrumentos_catalogo(ativo) WHERE ativo = true;

CREATE TRIGGER trg_instrumentos_updated_at
    BEFORE UPDATE ON instrumentos_catalogo
    FOR EACH ROW EXECUTE FUNCTION fn_atualiza_updated_at();

COMMENT ON TABLE instrumentos_catalogo IS 'Catálogo de testes neuropsicológicos disponíveis no CORTEX';
COMMENT ON COLUMN instrumentos_catalogo.versao_engine IS 'Versão do motor de correção, usada para auditoria de cálculos antigos';

-- ============================================================================
-- Verificação: as 3 tabelas devem aparecer
-- ============================================================================

SELECT
    table_name,
    (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = t.table_name) AS num_colunas
FROM information_schema.tables t
WHERE table_schema = 'public'
  AND table_name IN ('convenios', 'cids', 'instrumentos_catalogo')
ORDER BY table_name;
-- Esperado: 3 linhas

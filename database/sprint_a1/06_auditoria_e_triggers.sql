-- ============================================================================
-- CORTEX_APP — Sprint A1 — Arquivo 06 de 08
-- Tabela de auditoria + triggers de imutabilidade
-- ============================================================================
-- Conforme Princípio 5 (LGPD por padrão) e Documento 1 Seção 6.4:
-- todas as operações de leitura/escrita em dados clínicos serão logadas.
-- A tabela é IMUTÁVEL: apenas INSERT é permitido. UPDATE e DELETE bloqueados.
-- ============================================================================

-- ============================================================================
-- AUDITORIA DE ACESSOS
-- ============================================================================

CREATE TABLE IF NOT EXISTS auditoria_acessos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Quem fez a ação
    profissional_id UUID NOT NULL REFERENCES profissionais(id) ON DELETE RESTRICT,

    -- O que fez
    acao acao_auditoria NOT NULL,
    tabela TEXT NOT NULL,
    registro_id UUID,
    paciente_id UUID,

    -- Detalhes adicionais (estrutura livre)
    detalhes JSONB,

    -- Metadados de origem
    ip_origem INET,
    user_agent TEXT,

    -- Timestamp imutável
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auditoria_profissional
    ON auditoria_acessos(profissional_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_auditoria_paciente
    ON auditoria_acessos(paciente_id, timestamp DESC) WHERE paciente_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_auditoria_timestamp
    ON auditoria_acessos(timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_auditoria_tabela
    ON auditoria_acessos(tabela, acao);

COMMENT ON TABLE auditoria_acessos IS 'Log imutável de todas as operações em dados clínicos. Acessível apenas ao Admin-clínico.';

-- ============================================================================
-- TRIGGERS DE IMUTABILIDADE
-- ============================================================================
-- Bloqueiam UPDATE e DELETE na tabela de auditoria.
-- Apenas INSERT é permitido. Logs são "append-only".

CREATE OR REPLACE FUNCTION fn_bloqueia_alteracao_auditoria()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Logs de auditoria são imutáveis. Operação % bloqueada na tabela auditoria_acessos.', TG_OP
        USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auditoria_bloqueia_update ON auditoria_acessos;
CREATE TRIGGER trg_auditoria_bloqueia_update
    BEFORE UPDATE ON auditoria_acessos
    FOR EACH ROW EXECUTE FUNCTION fn_bloqueia_alteracao_auditoria();

DROP TRIGGER IF EXISTS trg_auditoria_bloqueia_delete ON auditoria_acessos;
CREATE TRIGGER trg_auditoria_bloqueia_delete
    BEFORE DELETE ON auditoria_acessos
    FOR EACH ROW EXECUTE FUNCTION fn_bloqueia_alteracao_auditoria();

-- ============================================================================
-- TRIGGERS DE TRUNCATE também bloqueados
-- ============================================================================

DROP TRIGGER IF EXISTS trg_auditoria_bloqueia_truncate ON auditoria_acessos;
CREATE TRIGGER trg_auditoria_bloqueia_truncate
    BEFORE TRUNCATE ON auditoria_acessos
    EXECUTE FUNCTION fn_bloqueia_alteracao_auditoria();

-- ============================================================================
-- Verificação 1: tabela criada
-- ============================================================================

SELECT
    table_name,
    (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'auditoria_acessos') AS num_colunas
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'auditoria_acessos';
-- Esperado: 1 linha com 9 colunas

-- ============================================================================
-- Verificação 2: triggers de proteção criados
-- ============================================================================

SELECT
    trigger_name,
    event_manipulation AS evento,
    action_timing AS quando
FROM information_schema.triggers
WHERE event_object_table = 'auditoria_acessos'
ORDER BY trigger_name;
-- Esperado: 3 triggers (UPDATE, DELETE, TRUNCATE)

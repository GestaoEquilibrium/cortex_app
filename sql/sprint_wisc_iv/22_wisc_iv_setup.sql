-- ═══════════════════════════════════════════════════════════════════════════
-- 22_wisc_iv_setup.sql — Sprint Fase D Pesada: WISC-IV
-- ═══════════════════════════════════════════════════════════════════════════
-- ARQUITETURA:
--
--   Mesmo padrão do WAIS-III (Sprint anterior):
--     - Reusa aplicacoes_instrumento (não cria tabela própria)
--     - 2 tabelas WISC-específicas: wisciv_brutos + wisciv_resultados
--     - Edge Function wisc-iv-calcular (cálculo presencial)
--     - tipo_aplicacao='presencial' no catálogo
--     - faixas_aplicaveis=['infantil','adolescente']
--     - permite_aplicacao_online=false (não tem /responder/)
--     - Faixa etária: 6:0 a 16:11 (72 a 203 meses)
--
--   STATUS: aguardando → corrigido (mesmo enum status_aplicacao)
--
--   DIFERENÇAS WAIS-III × WISC-IV:
--     - WAIS:  14 subtestes  / 7 escalas (4 índices + QIV/QIE/QIT) / 8 faixas
--     - WISC:  15 subtestes  / 5 escalas (4 índices + QIT)         / 33 faixas
--     - WAIS:  16-89 anos    / faixa 'adulto'
--     - WISC:  6:0-16:11     / faixas 'infantil' (6-11) e 'adolescente' (12-16)
--
--   Bateria.js já suporta tipo_aplicacao='presencial' (patch da Sprint WAIS).
--   Não precisa mexer em bateria.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- PARTE 1 — Tabela wisciv_brutos
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS wisciv_brutos (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    aplicacao_id    uuid NOT NULL REFERENCES aplicacoes_instrumento(id) ON DELETE CASCADE,
    codigo          text NOT NULL CHECK (codigo IN (
        'CB','SM','DG','CN','CD','VC','SNL','RM','CO','PS','CF','CA','IN','AR','RP'
    )),
    valor_bruto     smallint,  -- NULL = subteste não aplicado
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),

    UNIQUE (aplicacao_id, codigo)
);

CREATE INDEX IF NOT EXISTS idx_wisciv_brutos_aplicacao ON wisciv_brutos(aplicacao_id);

COMMENT ON TABLE wisciv_brutos IS
    '15 subtestes do WISC-IV com pontos brutos digitados pelo aplicador.';

-- Trigger updated_at
CREATE OR REPLACE FUNCTION wisciv_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_wisciv_brutos_updated_at ON wisciv_brutos;
CREATE TRIGGER trg_wisciv_brutos_updated_at
    BEFORE UPDATE ON wisciv_brutos
    FOR EACH ROW
    EXECUTE FUNCTION wisciv_set_updated_at();


-- ───────────────────────────────────────────────────────────────────────────
-- PARTE 2 — Tabela wisciv_resultados
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS wisciv_resultados (
    aplicacao_id        uuid PRIMARY KEY REFERENCES aplicacoes_instrumento(id) ON DELETE CASCADE,

    -- Resultado do cálculo (preenchido pela Edge Function)
    idade_anos          smallint,
    idade_meses         smallint,
    faixa_norma         text,           -- '10:0-10:3' etc

    ponderados          jsonb NOT NULL,
        -- { CB: 9, SM: 14, DG: 10, CN: 10, ... }
    somas               jsonb NOT NULL,
        -- { ICV: { soma: 37, usados: ['SM','VC','CO'], ... }, IOP: {...}, ... }
    compostos           jsonb NOT NULL,
        -- { ICV: { composto: 113, percentil: '81', ic90: [106,118], ic95: [104,120] }, ... }
    discrepancias       jsonb,
        -- [ { par: 'ICV × IOP', va: 113, vb: 102, diff: 11, vc: 11.45, sig: false }, ... ]
    fortes_fracos       jsonb,
        -- { media: 11.4, fortes: [...], fracos: [...] }

    -- Campos qualitativos do laudo (preenchidos pelo aplicador)
    profissional_nome           text,
    profissional_crp            text,
    profissional_especialidade  text,
    profissional_contato        text,
    motivo_encaminhamento       text,
    observacoes_comportamentais text,
    recomendacoes               text,

    -- Auditoria
    engine_versao               text NOT NULL DEFAULT 'wisc_iv_br_v1',
    calculado_em                timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE wisciv_resultados IS
    'Snapshot do resultado WISC-IV. 1 linha por aplicação. UPSERT a cada recálculo.';

DROP TRIGGER IF EXISTS trg_wisciv_resultados_updated_at ON wisciv_resultados;
CREATE TRIGGER trg_wisciv_resultados_updated_at
    BEFORE UPDATE ON wisciv_resultados
    FOR EACH ROW
    EXECUTE FUNCTION wisciv_set_updated_at();


-- ───────────────────────────────────────────────────────────────────────────
-- PARTE 3 — Cadastro do WISC-IV no instrumentos_catalogo
-- ───────────────────────────────────────────────────────────────────────────

INSERT INTO instrumentos_catalogo (
    sigla,
    nome_completo,
    o_que_avalia,
    dominio_principal,
    categoria,
    tipo_aplicacao,
    faixas_aplicaveis,
    faixa_etaria_min_meses,
    faixa_etaria_max_meses,
    sexo_filtro,
    permite_aplicacao_online,
    permite_correcao_sistema,
    versao_engine,
    ativo,
    em_breve
) VALUES (
    'WISC-IV',
    'Escala de Inteligência Wechsler para Crianças — 4ª Edição (versão brasileira)',
    'Avaliação cognitiva global em crianças e adolescentes: QI Total e 4 índices fatoriais (ICV, IOP, IMO, IVP) a partir de 10 subtestes principais (+ 5 suplementares).',
    'Inteligência',
    'cognicao',
    'presencial',
    ARRAY['infantil','adolescente']::text[],
    6 * 12,        -- 72 meses (6 anos)
    16 * 12 + 11,  -- 203 meses (16 anos e 11 meses)
    NULL,
    false,
    true,
    'wisc_iv_br_v1',
    true,
    false
)
ON CONFLICT (sigla) DO UPDATE SET
    nome_completo = EXCLUDED.nome_completo,
    o_que_avalia = EXCLUDED.o_que_avalia,
    dominio_principal = EXCLUDED.dominio_principal,
    categoria = EXCLUDED.categoria,
    tipo_aplicacao = EXCLUDED.tipo_aplicacao,
    faixas_aplicaveis = EXCLUDED.faixas_aplicaveis,
    faixa_etaria_min_meses = EXCLUDED.faixa_etaria_min_meses,
    faixa_etaria_max_meses = EXCLUDED.faixa_etaria_max_meses,
    permite_aplicacao_online = EXCLUDED.permite_aplicacao_online,
    permite_correcao_sistema = EXCLUDED.permite_correcao_sistema,
    versao_engine = EXCLUDED.versao_engine,
    ativo = EXCLUDED.ativo;


-- ───────────────────────────────────────────────────────────────────────────
-- PARTE 4 — RLS
-- ───────────────────────────────────────────────────────────────────────────

ALTER TABLE wisciv_brutos     ENABLE ROW LEVEL SECURITY;
ALTER TABLE wisciv_resultados ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='wisciv_brutos' AND policyname='wisciv_brutos_authenticated_all') THEN
        CREATE POLICY wisciv_brutos_authenticated_all ON wisciv_brutos
            FOR ALL USING (auth.role() = 'authenticated')
                    WITH CHECK (auth.role() = 'authenticated');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='wisciv_resultados' AND policyname='wisciv_resultados_authenticated_all') THEN
        CREATE POLICY wisciv_resultados_authenticated_all ON wisciv_resultados
            FOR ALL USING (auth.role() = 'authenticated')
                    WITH CHECK (auth.role() = 'authenticated');
    END IF;
END $$;


COMMIT;


-- ═══════════════════════════════════════════════════════════════════════════
-- VALIDAÇÃO
-- ═══════════════════════════════════════════════════════════════════════════

-- Confirma cadastro
SELECT
    sigla,
    nome_completo,
    tipo_aplicacao,
    faixas_aplicaveis,
    faixa_etaria_min_meses,
    faixa_etaria_max_meses,
    permite_aplicacao_online,
    permite_correcao_sistema,
    ativo
FROM instrumentos_catalogo
WHERE sigla = 'WISC-IV';

-- Confirma 2 tabelas
SELECT tablename, rowsecurity AS rls_ativo
FROM pg_tables
WHERE schemaname = 'public' AND tablename LIKE 'wisciv_%'
ORDER BY tablename;

-- Confirma FKs apontando pra aplicacoes_instrumento
SELECT
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS referencia_tabela
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu
    ON tc.constraint_name = ccu.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
  AND tc.table_name LIKE 'wisciv_%'
ORDER BY tc.table_name;

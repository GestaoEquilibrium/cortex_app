-- ═══════════════════════════════════════════════════════════════════════════
-- 21_wais_iii_ajuste_arquitetural.sql
-- Refatora schema do WAIS-III pra reusar aplicacoes_instrumento
-- ───────────────────────────────────────────────────────────────────────────
-- CONTEXTO:
--   No setup inicial (20_wais_iii_setup.sql) criei wais_aplicacoes própria
--   por achar que WAIS precisava de fluxo separado dos D3. Errei.
--
--   A bateria.js já lê aplicacoes_instrumento e auto-popula com base no
--   checklist. Se WAIS tivesse tabela própria, não apareceria na bateria
--   sem patch. A solução limpa é REUSAR aplicacoes_instrumento (igual aos
--   16 D3) e ter só 2 tabelas WAIS-específicas.
--
--   Ação:
--   1) Drop wais_aplicacoes (sem dados — só foi criada agora)
--   2) Recria wais_brutos apontando pra aplicacoes_instrumento
--   3) Recria wais_resultados apontando pra aplicacoes_instrumento +
--      adiciona campos qualitativos (profissional, motivo, observações,
--      recomendações) que estavam em wais_aplicacoes
--
--   Schema final:
--     aplicacoes_instrumento (já existe — usado pelos 16 D3 + WAIS)
--       └─ wais_brutos          (14 brutos por aplicação)
--       └─ wais_resultados      (1 snapshot de cálculo + campos qualitativos)
--
--   STATUS do WAIS:
--     'aguardando' (digitando brutos / parcial salvo) → 'corrigido' (calculado)
--     Mesmo enum status_aplicacao usado pelos 16 D3.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- PARTE 1 — Limpa schema antigo (sem dados — criado agora mesmo)
-- ───────────────────────────────────────────────────────────────────────────

-- Sanity check: aborta se houver dados clínicos reais
DO $$
DECLARE
    v_count integer;
BEGIN
    SELECT COUNT(*) INTO v_count FROM wais_resultados;
    IF v_count > 0 THEN
        RAISE EXCEPTION 'GUARD: wais_resultados tem % linhas — investigue antes de dropar', v_count;
    END IF;

    SELECT COUNT(*) INTO v_count FROM wais_brutos;
    IF v_count > 0 THEN
        RAISE EXCEPTION 'GUARD: wais_brutos tem % linhas — investigue antes de dropar', v_count;
    END IF;

    SELECT COUNT(*) INTO v_count FROM wais_aplicacoes;
    IF v_count > 0 THEN
        RAISE EXCEPTION 'GUARD: wais_aplicacoes tem % linhas — investigue antes de dropar', v_count;
    END IF;
END $$;

DROP TABLE IF EXISTS wais_resultados CASCADE;
DROP TABLE IF EXISTS wais_brutos     CASCADE;
DROP TABLE IF EXISTS wais_aplicacoes CASCADE;
DROP FUNCTION IF EXISTS wais_aplicacoes_set_updated_at() CASCADE;


-- ───────────────────────────────────────────────────────────────────────────
-- PARTE 2 — wais_brutos (FK aponta pra aplicacoes_instrumento)
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE wais_brutos (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    aplicacao_id    uuid NOT NULL REFERENCES aplicacoes_instrumento(id) ON DELETE CASCADE,
    codigo          text NOT NULL CHECK (codigo IN (
        'CF','VC','CD','SM','CB','AR','RM','DG','IN','AF','CO','PS','SNL','AO'
    )),
    valor_bruto     smallint,  -- NULL = subteste não aplicado
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),

    UNIQUE (aplicacao_id, codigo)
);

CREATE INDEX idx_wais_brutos_aplicacao ON wais_brutos(aplicacao_id);

COMMENT ON TABLE wais_brutos IS
    '14 subtestes do WAIS-III com pontos brutos digitados pelo aplicador.';

-- Trigger updated_at (compartilhada entre as 2 tabelas WAIS)
CREATE OR REPLACE FUNCTION wais_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_wais_brutos_updated_at
    BEFORE UPDATE ON wais_brutos
    FOR EACH ROW
    EXECUTE FUNCTION wais_set_updated_at();


-- ───────────────────────────────────────────────────────────────────────────
-- PARTE 3 — wais_resultados (snapshot do cálculo + campos qualitativos)
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE wais_resultados (
    aplicacao_id        uuid PRIMARY KEY REFERENCES aplicacoes_instrumento(id) ON DELETE CASCADE,

    -- Resultado do cálculo (preenchido pela Edge Function)
    idade_anos          smallint,
    idade_meses         smallint,
    faixa_norma         text,           -- '20 - 29' etc

    ponderados          jsonb NOT NULL,
        -- { CF: 12, VC: 14, ... } (1-19 cada)
    somas               jsonb NOT NULL,
        -- { ICV: { soma: 38, usados: ['SM','VC','IN'], ... }, ... }
    compostos           jsonb NOT NULL,
        -- { ICV: { composto: 110, percentil: '75', ic90: [..], ic95: [..] }, ... }
    discrepancias       jsonb,
        -- [ { par: 'ICV × IOP', va: 110, vb: 95, diff: 15, vc: 11.75, sig: true }, ... ]
    fortes_fracos       jsonb,
        -- { media: 10.2, fortes: [...], fracos: [...] }

    -- Campos qualitativos do laudo (preenchidos pelo aplicador)
    profissional_nome           text,
    profissional_crp            text,
    profissional_especialidade  text,
    profissional_contato        text,
    motivo_encaminhamento       text,
    observacoes_comportamentais text,
    recomendacoes               text,

    -- Auditoria
    engine_versao               text NOT NULL DEFAULT 'wais_iii_br_v1',
    calculado_em                timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE wais_resultados IS
    'Snapshot do resultado WAIS-III (cálculo + campos qualitativos). 1 linha por aplicação. UPSERT a cada recálculo.';

CREATE TRIGGER trg_wais_resultados_updated_at
    BEFORE UPDATE ON wais_resultados
    FOR EACH ROW
    EXECUTE FUNCTION wais_set_updated_at();


-- ───────────────────────────────────────────────────────────────────────────
-- PARTE 4 — RLS (mesmo padrão dos D3)
-- ───────────────────────────────────────────────────────────────────────────

ALTER TABLE wais_brutos     ENABLE ROW LEVEL SECURITY;
ALTER TABLE wais_resultados ENABLE ROW LEVEL SECURITY;

CREATE POLICY wais_brutos_authenticated_all ON wais_brutos
    FOR ALL USING (auth.role() = 'authenticated')
            WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY wais_resultados_authenticated_all ON wais_resultados
    FOR ALL USING (auth.role() = 'authenticated')
            WITH CHECK (auth.role() = 'authenticated');


COMMIT;


-- ═══════════════════════════════════════════════════════════════════════════
-- VALIDAÇÃO
-- ═══════════════════════════════════════════════════════════════════════════

-- Esperado: 2 tabelas (wais_brutos, wais_resultados), nenhuma wais_aplicacoes
SELECT
    tablename,
    rowsecurity AS rls_ativo
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename LIKE 'wais_%'
ORDER BY tablename;

-- Esperado: FKs apontando pra aplicacoes_instrumento
SELECT
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS referencia_tabela,
    ccu.column_name AS referencia_coluna
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu
    ON tc.constraint_name = ccu.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
  AND tc.table_name LIKE 'wais_%'
ORDER BY tc.table_name, kcu.column_name;

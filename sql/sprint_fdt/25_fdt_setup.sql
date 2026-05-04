-- ═══════════════════════════════════════════════════════════════════════════
-- 25_fdt_setup.sql — Sprint Fase D Pesada: FDT (Teste dos Cinco Dígitos)
-- ═══════════════════════════════════════════════════════════════════════════
-- ARQUITETURA (mesmo padrão WAIS-III / WISC-IV / RAVLT):
--
--   - Reusa aplicacoes_instrumento (não cria tabela própria)
--   - 2 tabelas FDT-específicas: fdt_brutos + fdt_resultados
--   - Edge Function fdt-calcular (cálculo de percentis por degrau)
--   - tipo_aplicacao='presencial'
--   - faixas_aplicaveis=['escolar','adolescente','adulto']  (cobre 6-75)
--   - permite_aplicacao_online=false
--   - Faixa etária: 6:0 a 75:11 (72 a 911 meses) — 8 faixas no banco normativo
--
-- ENTRADAS DO PROFISSIONAL (8 valores):
--   t_l, t_c, t_e, t_a       → tempos em segundos
--   e_l, e_c, e_e, e_a       → erros (e_l não usado em norma)
--
-- CÁLCULOS (Edge Function calcula e salva em resultados):
--   - 8 faixas etárias normativas (6-8, 9-10, 11-12, 13-15, 16-18, 19-34,
--                                    35-59, 60-75)
--   - CI = E - L  (Controle Inibitório)
--   - FC = A - L  (Flexibilidade Cognitiva)
--   - 9 medidas com percentil + classificação:
--       6 tempos  (Leitura, Contagem, Escolha, Alternancia, CI, FC)
--       3 erros   (Contagem, Escolha, Alternancia)
--   - LÓGICA INVERTIDA: menor valor = melhor desempenho
--   - Cálculo de percentil por DEGRAU (não interpolação):
--       v ≤ p95 → "≥ 95"   (Superior)
--       v ≤ p75 → "> 75"   (Superior)
--       v ≤ p50 → "> 50"   (Média)
--       v ≤ p25 → "> 25"   (Média)
--       v ≤ p5  → "> 5"    (Média Inferior)
--       v >  p5 → "< 5"    (Dificuldade Acentuada)
--
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- PARTE 1 — Tabela fdt_brutos
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fdt_brutos (
    aplicacao_id    uuid PRIMARY KEY REFERENCES aplicacoes_instrumento(id) ON DELETE CASCADE,

    -- Tempos em segundos (devem ser >= 0)
    t_l             smallint CHECK (t_l IS NULL OR (t_l >= 0 AND t_l <= 600)),  -- Leitura
    t_c             smallint CHECK (t_c IS NULL OR (t_c >= 0 AND t_c <= 600)),  -- Contagem
    t_e             smallint CHECK (t_e IS NULL OR (t_e >= 0 AND t_e <= 600)),  -- Escolha
    t_a             smallint CHECK (t_a IS NULL OR (t_a >= 0 AND t_a <= 600)),  -- Alternância

    -- Erros (>= 0)
    e_l             smallint CHECK (e_l IS NULL OR e_l >= 0),
    e_c             smallint CHECK (e_c IS NULL OR e_c >= 0),
    e_e             smallint CHECK (e_e IS NULL OR e_e >= 0),
    e_a             smallint CHECK (e_a IS NULL OR e_a >= 0),

    -- Comportamentais (opcional)
    observacoes     text,

    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE fdt_brutos IS
    '1 linha por aplicação FDT com 4 tempos (L,C,E,A) + 4 erros (e_L,e_C,e_E,e_A) + observações.';

CREATE OR REPLACE FUNCTION fdt_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_fdt_brutos_updated_at ON fdt_brutos;
CREATE TRIGGER trg_fdt_brutos_updated_at
    BEFORE UPDATE ON fdt_brutos
    FOR EACH ROW
    EXECUTE FUNCTION fdt_set_updated_at();


-- ───────────────────────────────────────────────────────────────────────────
-- PARTE 2 — Tabela fdt_resultados
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fdt_resultados (
    aplicacao_id        uuid PRIMARY KEY REFERENCES aplicacoes_instrumento(id) ON DELETE CASCADE,

    -- Resultado do cálculo
    idade_anos          smallint,
    idade_meses         smallint,
    faixa_norma         text,           -- '19-34', '35-59', etc.

    -- Cada medida: bruto, percentil_label, percentil_num, classificação
    -- jsonb — array de 9 objetos { key, label, grupo, raw, pctLabel, pctNum,
    --                              classificacao: { label, cor }, normaPc50 }
    medidas             jsonb NOT NULL,

    -- Índices derivados (já calculados pra facilitar laudo/BI)
    ci_tempo            smallint,       -- E - L (Controle Inibitório)
    fc_tempo            smallint,       -- A - L (Flexibilidade Cognitiva)

    -- Pra o gauge (P25-P75 normativo + P50)
    -- jsonb — array de 6 objetos { key, label, paciente, p95, p75, p50, p25, p5 }
    gauges              jsonb,

    -- Texto da interpretação clínica (gerado pela Edge Function)
    interpretacao       text,

    -- Campos qualitativos do laudo
    profissional_nome           text,
    profissional_crp            text,
    profissional_especialidade  text,
    profissional_contato        text,
    motivo_encaminhamento       text,
    observacoes_comportamentais text,
    recomendacoes               text,

    -- Auditoria
    engine_versao               text NOT NULL DEFAULT 'fdt_br_v1',
    calculado_em                timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE fdt_resultados IS
    'Snapshot do resultado FDT. 1 linha por aplicação. UPSERT a cada recálculo.';

DROP TRIGGER IF EXISTS trg_fdt_resultados_updated_at ON fdt_resultados;
CREATE TRIGGER trg_fdt_resultados_updated_at
    BEFORE UPDATE ON fdt_resultados
    FOR EACH ROW
    EXECUTE FUNCTION fdt_set_updated_at();


-- ───────────────────────────────────────────────────────────────────────────
-- PARTE 3 — Cadastro do FDT no instrumentos_catalogo
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
    'FDT',
    'Teste dos Cinco Dígitos (Five Digit Test)',
    'Avaliação de atenção, controle inibitório e flexibilidade cognitiva. Mede velocidade de processamento (Leitura/Contagem) e funções executivas (Escolha/Alternância).',
    'Atenção/Funções Executivas',
    'cognicao',
    'presencial',
    ARRAY['escolar','adolescente','adulto']::text[],
    6 * 12,                              -- 72 meses (6 anos)
    75 * 12 + 11,                        -- 911 meses (75:11 anos — limite das normas)
    NULL,
    false,
    true,
    'fdt_br_v1',
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

ALTER TABLE fdt_brutos     ENABLE ROW LEVEL SECURITY;
ALTER TABLE fdt_resultados ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='fdt_brutos' AND policyname='fdt_brutos_authenticated_all') THEN
        CREATE POLICY fdt_brutos_authenticated_all ON fdt_brutos
            FOR ALL USING (auth.role() = 'authenticated')
                    WITH CHECK (auth.role() = 'authenticated');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='fdt_resultados' AND policyname='fdt_resultados_authenticated_all') THEN
        CREATE POLICY fdt_resultados_authenticated_all ON fdt_resultados
            FOR ALL USING (auth.role() = 'authenticated')
                    WITH CHECK (auth.role() = 'authenticated');
    END IF;
END $$;


COMMIT;


-- ═══════════════════════════════════════════════════════════════════════════
-- VALIDAÇÃO
-- ═══════════════════════════════════════════════════════════════════════════

SELECT
    sigla, tipo_aplicacao, faixas_aplicaveis,
    faixa_etaria_min_meses, faixa_etaria_max_meses,
    permite_aplicacao_online, permite_correcao_sistema, ativo
FROM instrumentos_catalogo
WHERE sigla = 'FDT';

SELECT tablename, rowsecurity AS rls_ativo
FROM pg_tables
WHERE schemaname = 'public' AND tablename LIKE 'fdt_%'
ORDER BY tablename;

SELECT
    tc.table_name, kcu.column_name, ccu.table_name AS referencia_tabela
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu
    ON tc.constraint_name = ccu.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
  AND tc.table_name LIKE 'fdt_%'
ORDER BY tc.table_name;

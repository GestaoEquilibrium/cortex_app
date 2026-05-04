-- ═══════════════════════════════════════════════════════════════════════════
-- 24_ravlt_setup.sql — Sprint Fase D Pesada: RAVLT
-- ═══════════════════════════════════════════════════════════════════════════
-- ARQUITETURA (mesmo padrão WAIS-III / WISC-IV):
--
--   - Reusa aplicacoes_instrumento (não cria tabela própria)
--   - 2 tabelas RAVLT-específicas: ravlt_brutos + ravlt_resultados
--   - Edge Function ravlt-calcular (cálculo de percentis empíricos)
--   - tipo_aplicacao='presencial' no catálogo
--   - faixas_aplicaveis=['escolar','adulto']  (cobre 6-80+)
--   - permite_aplicacao_online=false (não tem /responder/)
--   - Faixa etária: 6:0 a 100:0 (72 a 1200 meses) — 12 faixas no JSON
--
--   STATUS: aguardando → corrigido (mesmo enum status_aplicacao)
--
-- ENTRADAS DO PROFISSIONAL (10 valores):
--   A1, A2, A3, A4, A5  (5 tentativas de aprendizagem — 0-15 cada)
--   B1                  (lista distratora — 0-15)
--   A6                  (evocação imediata — 0-15)
--   A7                  (evocação tardia — 0-15)
--   recon_acertos       (reconhecimento bruto 0-50; ajustado = acertos − 35)
--   intrusoes           (opcional)
--
-- CÁLCULOS (Edge Function calcula e salva em resultados):
--   - 12 faixas etárias normativas (6-8, 9-11, ..., 71-79, 80+)
--   - Cada bruto e cada índice derivado vira percentil (interpolação linear)
--   - 14 medidas no total: 8 brutos + Recon + Total + ALT + Esquec + Proat + Retro
--
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- PARTE 1 — Tabela ravlt_brutos
-- ───────────────────────────────────────────────────────────────────────────
-- Diferente do WAIS/WISC (1 linha por subteste), aqui é 1 LINHA POR APLICAÇÃO,
-- com colunas pra cada bruto. Mais simples (são poucos valores) e mais rápido.

CREATE TABLE IF NOT EXISTS ravlt_brutos (
    aplicacao_id    uuid PRIMARY KEY REFERENCES aplicacoes_instrumento(id) ON DELETE CASCADE,

    -- 5 tentativas de aprendizagem (Lista A, lida 5x)
    a1              smallint CHECK (a1 IS NULL OR (a1 >= 0 AND a1 <= 15)),
    a2              smallint CHECK (a2 IS NULL OR (a2 >= 0 AND a2 <= 15)),
    a3              smallint CHECK (a3 IS NULL OR (a3 >= 0 AND a3 <= 15)),
    a4              smallint CHECK (a4 IS NULL OR (a4 >= 0 AND a4 <= 15)),
    a5              smallint CHECK (a5 IS NULL OR (a5 >= 0 AND a5 <= 15)),

    -- Lista B (distratora — lida 1x)
    b1              smallint CHECK (b1 IS NULL OR (b1 >= 0 AND b1 <= 15)),

    -- Evocação
    a6              smallint CHECK (a6 IS NULL OR (a6 >= 0 AND a6 <= 15)),  -- imediata
    a7              smallint CHECK (a7 IS NULL OR (a7 >= 0 AND a7 <= 15)),  -- tardia (~20-30 min depois)

    -- Reconhecimento
    recon_acertos   smallint CHECK (recon_acertos IS NULL OR (recon_acertos >= 0 AND recon_acertos <= 50)),

    -- Comportamentais (opcional)
    intrusoes       smallint CHECK (intrusoes IS NULL OR intrusoes >= 0),
    observacoes     text,

    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE ravlt_brutos IS
    '1 linha por aplicação RAVLT com 8 brutos das tentativas + reconhecimento + intrusões.';

-- Trigger updated_at
CREATE OR REPLACE FUNCTION ravlt_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ravlt_brutos_updated_at ON ravlt_brutos;
CREATE TRIGGER trg_ravlt_brutos_updated_at
    BEFORE UPDATE ON ravlt_brutos
    FOR EACH ROW
    EXECUTE FUNCTION ravlt_set_updated_at();


-- ───────────────────────────────────────────────────────────────────────────
-- PARTE 2 — Tabela ravlt_resultados
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ravlt_resultados (
    aplicacao_id        uuid PRIMARY KEY REFERENCES aplicacoes_instrumento(id) ON DELETE CASCADE,

    -- Resultado do cálculo
    idade_anos          smallint,
    idade_meses         smallint,
    faixa_norma         text,           -- '21-30', '31-40', etc

    -- Cada medida: bruto, percentil, classificação, pc50 normativo
    -- jsonb — array de 14 objetos { key, label, grupo, raw, pct, classificacao, normPc50 }
    medidas             jsonb NOT NULL,

    -- Índices derivados (já calculados pra facilitar laudo/BI)
    escore_total        smallint,       -- A1+A2+A3+A4+A5
    alt                 smallint,       -- Total - 5*A1
    esquecimento        numeric(4,2),   -- A7/A6
    interf_proativa     numeric(4,2),   -- B1/A1
    interf_retroativa   numeric(4,2),   -- A6/A5
    recon_ajustado      smallint,       -- recon_acertos - 35

    -- Para o gráfico de curva (paciente vs pc50 normativo)
    -- jsonb { paciente: [a1,a2,a3,a4,a5,b1,a6,a7], normaPc50: [...] }
    curva               jsonb,

    -- Texto da interpretação clínica (gerado pela Edge Function)
    interpretacao       text,

    -- Campos qualitativos do laudo (preenchidos pelo aplicador)
    profissional_nome           text,
    profissional_crp            text,
    profissional_especialidade  text,
    profissional_contato        text,
    motivo_encaminhamento       text,
    observacoes_comportamentais text,
    recomendacoes               text,

    -- Auditoria
    engine_versao               text NOT NULL DEFAULT 'ravlt_br_v1',
    calculado_em                timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE ravlt_resultados IS
    'Snapshot do resultado RAVLT. 1 linha por aplicação. UPSERT a cada recálculo.';

DROP TRIGGER IF EXISTS trg_ravlt_resultados_updated_at ON ravlt_resultados;
CREATE TRIGGER trg_ravlt_resultados_updated_at
    BEFORE UPDATE ON ravlt_resultados
    FOR EACH ROW
    EXECUTE FUNCTION ravlt_set_updated_at();


-- ───────────────────────────────────────────────────────────────────────────
-- PARTE 3 — Cadastro do RAVLT no instrumentos_catalogo
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
    'RAVLT',
    'Teste de Aprendizagem Auditivo-Verbal de Rey (Rey Auditory Verbal Learning Test)',
    'Avaliação de aprendizagem verbal, memória imediata e tardia, reconhecimento, susceptibilidade à interferência (proativa/retroativa) e velocidade de esquecimento.',
    'Memória',
    'cognicao',
    'presencial',
    ARRAY['escolar','adulto']::text[],   -- 6-15 (escolar) e 16+ (adulto)
    6 * 12,                              -- 72 meses (6 anos)
    100 * 12,                            -- 1200 meses (100 anos — cobre faixa "80+")
    NULL,
    false,
    true,
    'ravlt_br_v1',
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

ALTER TABLE ravlt_brutos     ENABLE ROW LEVEL SECURITY;
ALTER TABLE ravlt_resultados ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='ravlt_brutos' AND policyname='ravlt_brutos_authenticated_all') THEN
        CREATE POLICY ravlt_brutos_authenticated_all ON ravlt_brutos
            FOR ALL USING (auth.role() = 'authenticated')
                    WITH CHECK (auth.role() = 'authenticated');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='ravlt_resultados' AND policyname='ravlt_resultados_authenticated_all') THEN
        CREATE POLICY ravlt_resultados_authenticated_all ON ravlt_resultados
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
    tipo_aplicacao,
    faixas_aplicaveis,
    faixa_etaria_min_meses,
    faixa_etaria_max_meses,
    permite_aplicacao_online,
    permite_correcao_sistema,
    ativo
FROM instrumentos_catalogo
WHERE sigla = 'RAVLT';

-- Confirma 2 tabelas
SELECT tablename, rowsecurity AS rls_ativo
FROM pg_tables
WHERE schemaname = 'public' AND tablename LIKE 'ravlt_%'
ORDER BY tablename;

-- Confirma FKs
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
  AND tc.table_name LIKE 'ravlt_%'
ORDER BY tc.table_name;

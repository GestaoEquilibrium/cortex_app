-- ═══════════════════════════════════════════════════════════════════════════
-- 20_wais_iii_setup.sql — Sprint Fase D Pesada: WAIS-III
-- ═══════════════════════════════════════════════════════════════════════════
-- ARQUITETURA:
--
--   Diferente dos 16 instrumentos D3 (auto-aplicação online via /responder/),
--   o WAIS-III é PRESENCIAL: aplicador insere brutos diretamente. Por isso
--   tem schema próprio (wais_*) em vez de reusar instrumentos_*.
--
--   FLUXO:
--     1. Checklist mostra WAIS-III pra paciente 16+ anos
--     2. Aplicador clica → cria wais_aplicacoes (status=aguardando_correcao)
--     3. Aparece na bateria com botão "Corrigir"
--     4. Aplicador abre /correcao/wais/wais_resultado.html
--        → Card edição: digita 14 brutos + observações + recomendações
--        → Salva parciais em wais_brutos
--        → Clica "Calcular" → chama Edge Function wais-calcular
--        → Edge Function preenche wais_resultados (idade, ponderados, somas,
--          compostos, discrepâncias, fortes/fracos)
--        → Página vira modo laudo (read-only com gráficos)
--
--   TABELAS:
--     wais_aplicacoes   — 1 linha por aplicação (paciente, status, datas, textos qualitativos)
--     wais_brutos       — até 14 linhas por aplicação (1 por subteste)
--     wais_resultados   — 1 linha (snapshot do cálculo, atualizado a cada recálculo)
--
--   CATÁLOGO:
--     WAIS-III cadastrado em instrumentos_catalogo com:
--       - tipo_aplicacao='presencial' (campo NOVO)
--       - faixas_aplicaveis=['adulto']
--       - permite_aplicacao_online=false (não tem /responder/)
--       - permite_correcao_sistema=true (tem /correcao/)
--
--     O checklist e a bateria precisam tratar tipo_aplicacao='presencial' de
--     forma diferente: link "Confirmar aplicação" em vez de "Gerar link".
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- PARTE 1 — Coluna tipo_aplicacao em instrumentos_catalogo (idempotente)
-- ───────────────────────────────────────────────────────────────────────────

ALTER TABLE instrumentos_catalogo
    ADD COLUMN IF NOT EXISTS tipo_aplicacao text DEFAULT 'online';

-- Garante constraint apenas se ainda não existir
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'instrumentos_catalogo_tipo_aplicacao_check'
    ) THEN
        ALTER TABLE instrumentos_catalogo
            ADD CONSTRAINT instrumentos_catalogo_tipo_aplicacao_check
            CHECK (tipo_aplicacao IN ('online', 'presencial'));
    END IF;
END $$;

-- Garante que os 16 D3 existentes ficam com 'online' (default já cobre, mas explícito)
UPDATE instrumentos_catalogo
   SET tipo_aplicacao = 'online'
 WHERE tipo_aplicacao IS NULL;

COMMENT ON COLUMN instrumentos_catalogo.tipo_aplicacao IS
    'online: paciente responde sozinho via /responder/ (D3); presencial: aplicador digita brutos via /correcao/ (D pesada).';


-- ───────────────────────────────────────────────────────────────────────────
-- PARTE 2 — Tabela wais_aplicacoes
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS wais_aplicacoes (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    paciente_id                 uuid NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
    aplicador_id                uuid REFERENCES auth.users(id) ON DELETE SET NULL,

    -- Status do fluxo
    status                      text NOT NULL DEFAULT 'aguardando_correcao'
        CHECK (status IN ('aguardando_correcao', 'em_correcao', 'concluido')),

    -- Dados da aplicação (preenchidos pelo aplicador)
    data_aplicacao              date,
    motivo_encaminhamento       text,
    observacoes_comportamentais text,
    recomendacoes               text,

    -- Dados do profissional aplicador (snapshot — preenchido no form)
    profissional_nome           text,
    profissional_crp            text,
    profissional_especialidade  text,
    profissional_contato        text,

    -- Auditoria
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wais_aplicacoes_paciente
    ON wais_aplicacoes(paciente_id);

CREATE INDEX IF NOT EXISTS idx_wais_aplicacoes_status
    ON wais_aplicacoes(status);

COMMENT ON TABLE wais_aplicacoes IS 'Aplicações da escala WAIS-III (presencial — aplicador digita brutos).';

-- Trigger updated_at
CREATE OR REPLACE FUNCTION wais_aplicacoes_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_wais_aplicacoes_updated_at ON wais_aplicacoes;
CREATE TRIGGER trg_wais_aplicacoes_updated_at
    BEFORE UPDATE ON wais_aplicacoes
    FOR EACH ROW
    EXECUTE FUNCTION wais_aplicacoes_set_updated_at();


-- ───────────────────────────────────────────────────────────────────────────
-- PARTE 3 — Tabela wais_brutos (1 linha por subteste)
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS wais_brutos (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    aplicacao_id    uuid NOT NULL REFERENCES wais_aplicacoes(id) ON DELETE CASCADE,
    codigo          text NOT NULL CHECK (codigo IN (
        'CF','VC','CD','SM','CB','AR','RM','DG','IN','AF','CO','PS','SNL','AO'
    )),
    valor_bruto     smallint,  -- pode ser NULL se subteste não foi aplicado
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),

    -- Apenas 1 linha por (aplicacao, subteste)
    UNIQUE (aplicacao_id, codigo)
);

CREATE INDEX IF NOT EXISTS idx_wais_brutos_aplicacao
    ON wais_brutos(aplicacao_id);

COMMENT ON TABLE wais_brutos IS
    '14 subtestes do WAIS-III com pontos brutos digitados pelo aplicador.';

DROP TRIGGER IF EXISTS trg_wais_brutos_updated_at ON wais_brutos;
CREATE TRIGGER trg_wais_brutos_updated_at
    BEFORE UPDATE ON wais_brutos
    FOR EACH ROW
    EXECUTE FUNCTION wais_aplicacoes_set_updated_at();


-- ───────────────────────────────────────────────────────────────────────────
-- PARTE 4 — Tabela wais_resultados (1 linha = snapshot do cálculo)
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS wais_resultados (
    aplicacao_id        uuid PRIMARY KEY REFERENCES wais_aplicacoes(id) ON DELETE CASCADE,

    -- Dados normativos derivados
    idade_anos          smallint,
    idade_meses         smallint,
    faixa_norma         text,           -- ex.: "20 - 29"

    -- Saída do cálculo (jsonb pra flexibilidade)
    ponderados          jsonb NOT NULL,
        -- { CF: 12, VC: 14, CD: 8, ... } — 14 subtestes mapeados pra 1-19
    somas               jsonb NOT NULL,
        -- { ICV: { soma: 38, usados: ['SM','VC','IN'], faltando: [] }, ... }
    compostos           jsonb NOT NULL,
        -- { ICV: { composto: 110, percentil: 75, ic90: [104,115], ic95: [103,116] }, ... }
    discrepancias       jsonb,
        -- [ { par: 'ICV × IOP', va: 110, vb: 95, diff: 15, vc: 11.75, sig: true }, ... ]
    fortes_fracos       jsonb,
        -- { media: 10.2, fortes: [{cod:'VC', nome:'Vocabulário', p:14}, ...], fracos: [...] }

    engine_versao       text NOT NULL DEFAULT 'wais_iii_br_v1',
    calculado_em        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE wais_resultados IS
    'Resultado calculado de uma aplicação WAIS-III (snapshot — atualiza a cada recálculo).';


-- ───────────────────────────────────────────────────────────────────────────
-- PARTE 5 — Cadastro do WAIS-III no instrumentos_catalogo
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
    'WAIS-III',
    'Escala de Inteligência Wechsler para Adultos — 3ª Edição (versão brasileira)',
    'Avaliação cognitiva global em adultos: QI Total, QI Verbal, QI de Execução e 4 índices fatoriais (ICV, IOP, IMO, IVP) a partir de 14 subtestes.',
    'Inteligência',
    'cognicao',
    'presencial',
    ARRAY['adulto']::text[],
    16 * 12,    -- 16 anos em meses
    89 * 12,    -- 89 anos em meses
    NULL,       -- sem filtro de sexo
    false,      -- não tem /responder/ — é presencial
    true,       -- tem /correcao/
    'wais_iii_br_v1',
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
-- PARTE 6 — RLS (Row Level Security)
-- ───────────────────────────────────────────────────────────────────────────

ALTER TABLE wais_aplicacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE wais_brutos     ENABLE ROW LEVEL SECURITY;
ALTER TABLE wais_resultados ENABLE ROW LEVEL SECURITY;

-- Política: usuários autenticados podem fazer tudo (mesmo padrão dos D3).
-- Refinar permissões por papel (admin/aplicador/secretaria) na próxima sprint.

DO $$
BEGIN
    -- wais_aplicacoes
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'wais_aplicacoes' AND policyname = 'wais_aplicacoes_authenticated_all') THEN
        CREATE POLICY wais_aplicacoes_authenticated_all ON wais_aplicacoes
            FOR ALL USING (auth.role() = 'authenticated')
                    WITH CHECK (auth.role() = 'authenticated');
    END IF;

    -- wais_brutos
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'wais_brutos' AND policyname = 'wais_brutos_authenticated_all') THEN
        CREATE POLICY wais_brutos_authenticated_all ON wais_brutos
            FOR ALL USING (auth.role() = 'authenticated')
                    WITH CHECK (auth.role() = 'authenticated');
    END IF;

    -- wais_resultados (Edge Function escreve via service_role — bypassa RLS)
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'wais_resultados' AND policyname = 'wais_resultados_authenticated_read') THEN
        CREATE POLICY wais_resultados_authenticated_read ON wais_resultados
            FOR SELECT USING (auth.role() = 'authenticated');
    END IF;
END $$;


COMMIT;


-- ═══════════════════════════════════════════════════════════════════════════
-- VALIDAÇÃO
-- ═══════════════════════════════════════════════════════════════════════════

-- Confirma WAIS-III cadastrado
SELECT
    sigla,
    nome_completo,
    tipo_aplicacao,
    faixas_aplicaveis,
    permite_aplicacao_online,
    permite_correcao_sistema,
    ativo
FROM instrumentos_catalogo
WHERE sigla = 'WAIS-III';

-- Confirma 3 tabelas criadas
SELECT
    tablename,
    rowsecurity AS rls_ativo
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename LIKE 'wais_%'
ORDER BY tablename;

-- Confirma colunas
SELECT
    table_name,
    column_name,
    data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('wais_aplicacoes', 'wais_brutos', 'wais_resultados')
ORDER BY table_name, ordinal_position;

-- ============================================================================
-- CORTEX_APP — Sprint A1 — Arquivo 05 de 08
-- Tabelas de testes, laudos e devolutivas
-- ============================================================================
-- Cria as tabelas que armazenam o ciclo completo de aplicação e correção:
-- aplicações de instrumento, respostas brutas, correções, laudos e devolutivas.
-- ============================================================================

-- ============================================================================
-- APLICAÇÕES DE INSTRUMENTO
-- ============================================================================
-- Cada aplicação representa "instrumento X foi aplicado ao paciente Y".
-- A aplicação pode ser presencial (digitada pelo profissional) ou online
-- (link enviado ao paciente).

CREATE TABLE IF NOT EXISTS aplicacoes_instrumento (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    paciente_id UUID NOT NULL REFERENCES pacientes(id) ON DELETE RESTRICT,
    instrumento_id UUID NOT NULL REFERENCES instrumentos_catalogo(id),
    aplicador_id UUID REFERENCES profissionais(id),
    sessao_id UUID REFERENCES sessoes(id),

    modalidade modalidade_aplicacao NOT NULL,

    -- Para modalidade online
    link_unico TEXT UNIQUE,
    link_expira_em TIMESTAMPTZ,
    link_acessado_em TIMESTAMPTZ,

    -- Status
    status status_aplicacao NOT NULL DEFAULT 'aguardando',

    -- Datas relevantes
    data_aplicacao DATE,
    data_conclusao TIMESTAMPTZ,

    -- Observações
    observacoes_aplicacao TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aplicacoes_paciente
    ON aplicacoes_instrumento(paciente_id);

CREATE INDEX IF NOT EXISTS idx_aplicacoes_instrumento
    ON aplicacoes_instrumento(instrumento_id);

CREATE INDEX IF NOT EXISTS idx_aplicacoes_status
    ON aplicacoes_instrumento(status);

CREATE INDEX IF NOT EXISTS idx_aplicacoes_link
    ON aplicacoes_instrumento(link_unico) WHERE link_unico IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_aplicacoes_corretor_fila
    ON aplicacoes_instrumento(status) WHERE status IN ('concluido_aplicacao', 'em_correcao');

CREATE TRIGGER trg_aplicacoes_updated_at
    BEFORE UPDATE ON aplicacoes_instrumento
    FOR EACH ROW EXECUTE FUNCTION fn_atualiza_updated_at();

COMMENT ON TABLE aplicacoes_instrumento IS 'Cada aplicação de um instrumento (teste) a um paciente';

-- ============================================================================
-- RESPOSTAS BRUTAS
-- ============================================================================
-- Princípio: salvar APENAS dados brutos. Nada de cálculos congelados.
-- Os escores são calculados sob demanda no momento da correção.

CREATE TABLE IF NOT EXISTS respostas_brutas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aplicacao_id UUID NOT NULL REFERENCES aplicacoes_instrumento(id) ON DELETE CASCADE,
    item_codigo TEXT NOT NULL,
    valor_resposta JSONB NOT NULL,
    observacao_aplicador TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(aplicacao_id, item_codigo)
);

CREATE INDEX IF NOT EXISTS idx_respostas_aplicacao
    ON respostas_brutas(aplicacao_id);

COMMENT ON TABLE respostas_brutas IS 'Respostas item-a-item dos testes (formato JSONB para suportar diferentes tipos de resposta)';
COMMENT ON COLUMN respostas_brutas.valor_resposta IS 'Ex: {"escala": 2}, {"resposta": "verdadeiro"}, {"texto": "..."}';

-- ============================================================================
-- CORREÇÕES
-- ============================================================================
-- O resultado da correção fica congelado aqui. Pode ser recalculado a qualquer
-- momento alimentando o motor com as respostas_brutas e a versão de schema.

CREATE TABLE IF NOT EXISTS correcoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aplicacao_id UUID NOT NULL UNIQUE REFERENCES aplicacoes_instrumento(id) ON DELETE CASCADE,
    corretor_id UUID NOT NULL REFERENCES profissionais(id),
    versao_engine TEXT NOT NULL,

    -- Resultados estruturados em JSONB (formato definido pelo motor)
    escores_brutos JSONB NOT NULL DEFAULT '{}'::jsonb,
    escores_ponderados JSONB NOT NULL DEFAULT '{}'::jsonb,
    percentis JSONB NOT NULL DEFAULT '{}'::jsonb,
    classificacoes JSONB NOT NULL DEFAULT '{}'::jsonb,
    indices_compostos JSONB DEFAULT '{}'::jsonb,
    interpretacao_automatica JSONB,

    -- Ajustes manuais com justificativa
    ajustes_manuais JSONB,
    justificativa_ajustes TEXT,

    -- Saídas
    pdf_relatorio_url TEXT,
    secao_resultados_texto TEXT,

    -- Status
    status status_correcao NOT NULL DEFAULT 'em_correcao',

    -- Marcos temporais
    corrigido_em TIMESTAMPTZ,
    integrado_em TIMESTAMPTZ,
    integrado_por UUID REFERENCES profissionais(id),

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_correcoes_aplicacao
    ON correcoes(aplicacao_id);

CREATE INDEX IF NOT EXISTS idx_correcoes_corretor
    ON correcoes(corretor_id);

CREATE INDEX IF NOT EXISTS idx_correcoes_status
    ON correcoes(status);

CREATE TRIGGER trg_correcoes_updated_at
    BEFORE UPDATE ON correcoes
    FOR EACH ROW EXECUTE FUNCTION fn_atualiza_updated_at();

COMMENT ON TABLE correcoes IS 'Resultados da correção de cada aplicação (escores, percentis, classificações)';
COMMENT ON COLUMN correcoes.versao_engine IS 'Versão do motor de correção; permite recalcular com versões anteriores se necessário';

-- ============================================================================
-- LAUDOS
-- ============================================================================
-- Laudo final integrado, conforme estrutura CFP 06/2019.

CREATE TABLE IF NOT EXISTS laudos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    paciente_id UUID NOT NULL UNIQUE REFERENCES pacientes(id) ON DELETE RESTRICT,
    aplicador_responsavel_id UUID NOT NULL REFERENCES profissionais(id),

    -- 10 seções da Resolução CFP 06/2019
    secao_identificacao TEXT,
    secao_demanda TEXT,
    secao_procedimentos TEXT,
    secao_resultados TEXT, -- pode ser preenchida pelo Corretor
    secao_analise TEXT,
    secao_conclusao TEXT,
    secao_recomendacoes TEXT,
    secao_encaminhamentos TEXT,
    secao_referencias TEXT,
    -- (10ª seção: identificação profissional, vem do cadastro do aplicador)

    -- Diagnóstico final
    cids_finais TEXT[],
    hipoteses_diagnosticas_finais TEXT,

    -- Status
    status status_laudo NOT NULL DEFAULT 'em_construcao',

    -- Aprovação Wessilon
    aprovado_por_wessilon BOOLEAN DEFAULT false,
    aprovado_em TIMESTAMPTZ,
    aprovado_por UUID REFERENCES profissionais(id),

    -- Saídas geradas
    pdf_url TEXT,
    docx_url TEXT,
    versao INT DEFAULT 1,

    -- Marcos
    finalizado_em TIMESTAMPTZ,
    entregue_em TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_laudos_paciente
    ON laudos(paciente_id);

CREATE INDEX IF NOT EXISTS idx_laudos_status
    ON laudos(status);

CREATE INDEX IF NOT EXISTS idx_laudos_aplicador
    ON laudos(aplicador_responsavel_id);

CREATE INDEX IF NOT EXISTS idx_laudos_pendentes_devolutiva
    ON laudos(status) WHERE status = 'pronto_para_devolutiva';

CREATE TRIGGER trg_laudos_updated_at
    BEFORE UPDATE ON laudos
    FOR EACH ROW EXECUTE FUNCTION fn_atualiza_updated_at();

COMMENT ON TABLE laudos IS 'Laudo final integrado em estrutura CFP 06/2019';

-- ============================================================================
-- DEVOLUTIVAS
-- ============================================================================
-- Apenas Wessilon (admin_clinico) realiza devolutivas.

CREATE TABLE IF NOT EXISTS devolutivas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    laudo_id UUID NOT NULL UNIQUE REFERENCES laudos(id) ON DELETE RESTRICT,
    paciente_id UUID NOT NULL REFERENCES pacientes(id) ON DELETE RESTRICT,
    realizada_por UUID NOT NULL REFERENCES profissionais(id),
    sessao_id UUID REFERENCES sessoes(id),

    -- Conteúdo da devolutiva
    data_realizacao TIMESTAMPTZ NOT NULL,
    presentes TEXT,
    pontos_principais_discutidos TEXT,
    duvidas_apresentadas TEXT,
    encaminhamentos_acordados TEXT,

    -- Entrega do laudo
    laudo_entregue BOOLEAN DEFAULT false,
    forma_entrega forma_entrega_laudo,

    -- Pendências (caso laudo não entregue)
    pendencia BOOLEAN DEFAULT false,
    motivo_pendencia TEXT,
    observacoes_pendencia TEXT,
    prazo_resolucao DATE,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_devolutivas_paciente
    ON devolutivas(paciente_id);

CREATE INDEX IF NOT EXISTS idx_devolutivas_pendencia
    ON devolutivas(pendencia) WHERE pendencia = true;

CREATE INDEX IF NOT EXISTS idx_devolutivas_data
    ON devolutivas(data_realizacao DESC);

CREATE TRIGGER trg_devolutivas_updated_at
    BEFORE UPDATE ON devolutivas
    FOR EACH ROW EXECUTE FUNCTION fn_atualiza_updated_at();

COMMENT ON TABLE devolutivas IS 'Sessões de devolutiva realizadas por Wessilon, com status de entrega do laudo';

-- ============================================================================
-- Verificação: 5 tabelas devem aparecer
-- ============================================================================

SELECT
    table_name,
    (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = t.table_name) AS num_colunas
FROM information_schema.tables t
WHERE table_schema = 'public'
  AND table_name IN (
      'aplicacoes_instrumento',
      'respostas_brutas',
      'correcoes',
      'laudos',
      'devolutivas'
  )
ORDER BY table_name;
-- Esperado: 5 linhas

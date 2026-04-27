-- ============================================================================
-- CORTEX_APP — Sprint A1 — Arquivo 04 de 08
-- Tabelas clínicas core
-- ============================================================================
-- Cria as tabelas que armazenam dados clínicos dos pacientes:
-- profissionais, vínculos, pacientes, anamneses, hipóteses, relatório escolar,
-- sessões.
-- ============================================================================

-- ============================================================================
-- PROFISSIONAIS (usuários do sistema)
-- ============================================================================

CREATE TABLE IF NOT EXISTS profissionais (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Vínculo com Supabase Auth (preenchido pela função handle_new_user no Sprint A2)
    auth_user_id UUID UNIQUE,

    -- Identificação
    nome_completo TEXT NOT NULL,
    crp TEXT,
    cpf TEXT UNIQUE,
    email TEXT NOT NULL UNIQUE,
    telefone TEXT,
    foto_url TEXT,

    -- Perfil de acesso
    perfil perfil_usuario NOT NULL,

    -- Dados profissionais
    formacao TEXT,
    especialidade TEXT,

    -- Status
    ativo BOOLEAN DEFAULT true,

    -- Auditoria
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES profissionais(id)
);

CREATE INDEX IF NOT EXISTS idx_profissionais_perfil
    ON profissionais(perfil) WHERE ativo = true;

CREATE INDEX IF NOT EXISTS idx_profissionais_auth
    ON profissionais(auth_user_id);

CREATE TRIGGER trg_profissionais_updated_at
    BEFORE UPDATE ON profissionais
    FOR EACH ROW EXECUTE FUNCTION fn_atualiza_updated_at();

COMMENT ON TABLE profissionais IS 'Usuários do sistema CORTEX (Wessilon, administradora, neuropsicólogos, estagiários, corretores)';
COMMENT ON COLUMN profissionais.auth_user_id IS 'Vinculado ao auth.users do Supabase Auth';

-- ============================================================================
-- VÍNCULOS PROFISSIONAL ↔ SUPERVISOR (estagiários)
-- ============================================================================

CREATE TABLE IF NOT EXISTS vinculos_profissional_supervisor (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    estagiario_id UUID NOT NULL REFERENCES profissionais(id) ON DELETE CASCADE,
    supervisor_id UUID NOT NULL REFERENCES profissionais(id) ON DELETE RESTRICT,
    data_inicio DATE NOT NULL DEFAULT CURRENT_DATE,
    data_fim DATE,
    ativo BOOLEAN DEFAULT true,
    observacoes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(estagiario_id, supervisor_id, data_inicio)
);

CREATE INDEX IF NOT EXISTS idx_vinculos_supervisor_estagiario
    ON vinculos_profissional_supervisor(estagiario_id) WHERE ativo = true;

CREATE INDEX IF NOT EXISTS idx_vinculos_supervisor_supervisor
    ON vinculos_profissional_supervisor(supervisor_id) WHERE ativo = true;

COMMENT ON TABLE vinculos_profissional_supervisor IS 'Vínculo entre estagiários e seus supervisores neuropsicólogos';

-- ============================================================================
-- PACIENTES
-- ============================================================================

CREATE TABLE IF NOT EXISTS pacientes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identificação básica
    nome_completo TEXT NOT NULL,
    nome_social TEXT,
    data_nascimento DATE NOT NULL,
    sexo sexo_paciente NOT NULL,
    cpf TEXT UNIQUE,
    rg TEXT,
    foto_url TEXT,

    -- Dados sociodemográficos
    escolaridade TEXT,
    profissao TEXT,
    estado_civil TEXT,

    -- Convênio
    convenio_id UUID REFERENCES convenios(id),
    numero_convenio TEXT,

    -- Contatos
    telefone TEXT,
    email TEXT,
    endereco TEXT,
    cidade TEXT DEFAULT 'Uberlândia',
    estado TEXT DEFAULT 'MG',
    cep TEXT,

    -- Responsável (para crianças/adolescentes/idosos com curatela)
    responsavel_nome TEXT,
    responsavel_parentesco TEXT,
    responsavel_telefone TEXT,
    responsavel_email TEXT,
    responsavel_cpf TEXT,

    -- Encaminhamento
    encaminhado_por TEXT,
    medico_referencia TEXT,
    medico_crm TEXT,

    -- Status (workflow)
    status status_paciente NOT NULL DEFAULT 'cadastrado',

    -- Observações administrativas
    observacoes TEXT,

    -- Auditoria
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES profissionais(id),
    arquivado_em TIMESTAMPTZ,
    arquivado_por UUID REFERENCES profissionais(id)
);

CREATE INDEX IF NOT EXISTS idx_pacientes_nome_busca
    ON pacientes USING gin(to_tsvector('portuguese', nome_completo));

CREATE INDEX IF NOT EXISTS idx_pacientes_status
    ON pacientes(status) WHERE status NOT IN ('entregue', 'arquivado');

CREATE INDEX IF NOT EXISTS idx_pacientes_convenio
    ON pacientes(convenio_id);

CREATE INDEX IF NOT EXISTS idx_pacientes_data_nasc
    ON pacientes(data_nascimento);

CREATE TRIGGER trg_pacientes_updated_at
    BEFORE UPDATE ON pacientes
    FOR EACH ROW EXECUTE FUNCTION fn_atualiza_updated_at();

COMMENT ON TABLE pacientes IS 'Pacientes da Equilibrium em avaliação neuropsicológica';

-- ============================================================================
-- VÍNCULOS PACIENTE ↔ APLICADOR
-- ============================================================================
-- Conforme Princípio 7: todo paciente tem Wessilon (admin_clinico) como
-- co-responsável universal + 1 neuropsicólogo aplicador atribuído na primeira
-- sessão. O vínculo com Wessilon é IMPLÍCITO (RLS dá acesso a tudo).
-- Esta tabela registra o vínculo com o aplicador.

CREATE TABLE IF NOT EXISTS vinculos_paciente_aplicador (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    paciente_id UUID NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
    aplicador_id UUID NOT NULL REFERENCES profissionais(id) ON DELETE RESTRICT,

    data_inicio DATE NOT NULL DEFAULT CURRENT_DATE,
    data_fim DATE,
    ativo BOOLEAN DEFAULT true,

    motivo_atribuicao TEXT,
    motivo_encerramento TEXT,
    atribuido_por UUID NOT NULL REFERENCES profissionais(id),

    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(paciente_id, aplicador_id, data_inicio)
);

CREATE INDEX IF NOT EXISTS idx_vinculos_aplicador_aplicador
    ON vinculos_paciente_aplicador(aplicador_id) WHERE ativo = true;

CREATE INDEX IF NOT EXISTS idx_vinculos_aplicador_paciente
    ON vinculos_paciente_aplicador(paciente_id) WHERE ativo = true;

COMMENT ON TABLE vinculos_paciente_aplicador IS 'Atribuição paciente↔aplicador feita pela Admin-gestor na primeira sessão';

-- ============================================================================
-- ANAMNESES
-- ============================================================================
-- Estrutura por blocos em JSONB para flexibilidade entre faixas etárias.

CREATE TABLE IF NOT EXISTS anamneses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    paciente_id UUID NOT NULL UNIQUE REFERENCES pacientes(id) ON DELETE CASCADE,
    faixa_etaria faixa_etaria_anamnese NOT NULL,

    -- Blocos da anamnese (estrutura interna varia por faixa etária)
    identificacao JSONB DEFAULT '{}'::jsonb,
    queixa_historico JSONB DEFAULT '{}'::jsonb,
    desenvolvimento JSONB DEFAULT '{}'::jsonb,
    contexto_familiar JSONB DEFAULT '{}'::jsonb,
    historico_escolar JSONB DEFAULT '{}'::jsonb,
    saude_medicacoes JSONB DEFAULT '{}'::jsonb,
    social_emocional JSONB DEFAULT '{}'::jsonb,
    outros_profissionais JSONB DEFAULT '{}'::jsonb,

    -- Indicador de progresso (calculado pelo frontend)
    completude_percentual INT DEFAULT 0 CHECK (completude_percentual BETWEEN 0 AND 100),

    -- Status
    status status_anamnese DEFAULT 'em_andamento',

    -- Aprovação (estagiários)
    preenchido_por UUID REFERENCES profissionais(id),
    aprovado_por UUID REFERENCES profissionais(id),
    aprovado_em TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_anamneses_paciente
    ON anamneses(paciente_id);

CREATE INDEX IF NOT EXISTS idx_anamneses_status
    ON anamneses(status);

CREATE TRIGGER trg_anamneses_updated_at
    BEFORE UPDATE ON anamneses
    FOR EACH ROW EXECUTE FUNCTION fn_atualiza_updated_at();

COMMENT ON TABLE anamneses IS 'Anamnese clínica do paciente, com 5 formulários por faixa etária';
COMMENT ON COLUMN anamneses.identificacao IS 'JSONB com campos da seção Identificação (varia por faixa etária)';

-- ============================================================================
-- HIPÓTESES DIAGNÓSTICAS
-- ============================================================================

CREATE TABLE IF NOT EXISTS hipoteses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    paciente_id UUID NOT NULL UNIQUE REFERENCES pacientes(id) ON DELETE CASCADE,

    hipoteses_iniciais TEXT,
    cids_sugeridos TEXT[], -- array de códigos CID (ex: ['6A02', 'F84.0'])
    justificativa_clinica TEXT,
    plano_avaliacao TEXT,
    instrumentos_sugeridos TEXT[], -- array de siglas (ex: ['WAIS-III', 'SRS-2'])

    -- Aprovação (estagiários)
    preenchido_por UUID REFERENCES profissionais(id),
    aprovado_por UUID REFERENCES profissionais(id),
    aprovado_em TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hipoteses_paciente
    ON hipoteses(paciente_id);

CREATE TRIGGER trg_hipoteses_updated_at
    BEFORE UPDATE ON hipoteses
    FOR EACH ROW EXECUTE FUNCTION fn_atualiza_updated_at();

COMMENT ON TABLE hipoteses IS 'Hipóteses diagnósticas iniciais e plano de avaliação';

-- ============================================================================
-- RELATÓRIO ESCOLAR
-- ============================================================================

CREATE TABLE IF NOT EXISTS relatorios_escolares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    paciente_id UUID NOT NULL UNIQUE REFERENCES pacientes(id) ON DELETE CASCADE,

    nome_escola TEXT,
    professor_referencia TEXT,
    professor_email TEXT,
    professor_telefone TEXT,
    ano_escolar TEXT,
    turno TEXT,

    desempenho_portugues TEXT,
    desempenho_matematica TEXT,
    desempenho_outras_areas JSONB DEFAULT '{}'::jsonb,

    comportamento_sala TEXT,
    relacionamento_pares TEXT,
    relacionamento_professores TEXT,
    observacoes_educadores TEXT,

    arquivos_anexos TEXT[],

    preenchido_por UUID REFERENCES profissionais(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_relatorios_escolares_paciente
    ON relatorios_escolares(paciente_id);

CREATE TRIGGER trg_relatorios_escolares_updated_at
    BEFORE UPDATE ON relatorios_escolares
    FOR EACH ROW EXECUTE FUNCTION fn_atualiza_updated_at();

COMMENT ON TABLE relatorios_escolares IS 'Informações escolares para crianças e adolescentes em avaliação';

-- ============================================================================
-- SESSÕES (agenda)
-- ============================================================================

CREATE TABLE IF NOT EXISTS sessoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    paciente_id UUID NOT NULL REFERENCES pacientes(id) ON DELETE RESTRICT,
    profissional_id UUID NOT NULL REFERENCES profissionais(id),

    tipo tipo_sessao NOT NULL,
    data_hora_inicio TIMESTAMPTZ NOT NULL,
    data_hora_fim TIMESTAMPTZ NOT NULL,
    sala TEXT,

    status status_sessao NOT NULL DEFAULT 'agendada',

    observacoes TEXT,
    motivo_cancelamento TEXT,

    -- Flags importantes para o workflow
    eh_primeira_sessao BOOLEAN DEFAULT false,
    cria_vinculo_aplicador BOOLEAN DEFAULT false,

    -- Auditoria
    agendada_por UUID NOT NULL REFERENCES profissionais(id),
    cancelada_por UUID REFERENCES profissionais(id),
    realizada_em TIMESTAMPTZ,
    realizada_por UUID REFERENCES profissionais(id),

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    CHECK (data_hora_fim > data_hora_inicio)
);

CREATE INDEX IF NOT EXISTS idx_sessoes_data
    ON sessoes(data_hora_inicio);

CREATE INDEX IF NOT EXISTS idx_sessoes_profissional_data
    ON sessoes(profissional_id, data_hora_inicio);

CREATE INDEX IF NOT EXISTS idx_sessoes_paciente_data
    ON sessoes(paciente_id, data_hora_inicio DESC);

CREATE INDEX IF NOT EXISTS idx_sessoes_agendadas
    ON sessoes(status) WHERE status = 'agendada';

CREATE TRIGGER trg_sessoes_updated_at
    BEFORE UPDATE ON sessoes
    FOR EACH ROW EXECUTE FUNCTION fn_atualiza_updated_at();

COMMENT ON TABLE sessoes IS 'Agenda da clínica: sessões de aplicação, devolutiva, retorno, orientação';

-- ============================================================================
-- Verificação: 7 tabelas devem aparecer
-- ============================================================================

SELECT
    table_name,
    (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = t.table_name) AS num_colunas
FROM information_schema.tables t
WHERE table_schema = 'public'
  AND table_name IN (
      'profissionais',
      'vinculos_profissional_supervisor',
      'pacientes',
      'vinculos_paciente_aplicador',
      'anamneses',
      'hipoteses',
      'relatorios_escolares',
      'sessoes'
  )
ORDER BY table_name;
-- Esperado: 8 linhas

-- ============================================================================
-- CORTEX_APP — Sprint A1 — Arquivo 02 de 08
-- Types ENUM e funções auxiliares
-- ============================================================================
-- Cria os tipos enumerados (ENUM) que são reutilizados em várias tabelas.
-- Usar ENUM em vez de TEXT+CHECK garante consistência e velocidade.
-- ============================================================================

-- Perfis de usuário do CORTEX
DO $$ BEGIN
    CREATE TYPE perfil_usuario AS ENUM (
        'admin_clinico',
        'admin_gestor',
        'neuropsicologo_aplicador',
        'estagiario',
        'corretor'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Status do paciente (workflow)
DO $$ BEGIN
    CREATE TYPE status_paciente AS ENUM (
        'cadastrado',
        'em_avaliacao',
        'pronto_para_laudo',
        'laudo_pronto',
        'devolutiva_agendada',
        'devolutiva_realizada',
        'entregue',
        'pendente',
        'arquivado'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Sexo do paciente
DO $$ BEGIN
    CREATE TYPE sexo_paciente AS ENUM (
        'Masculino',
        'Feminino',
        'Outro'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Faixa etária da anamnese (corresponde aos 5 formulários)
DO $$ BEGIN
    CREATE TYPE faixa_etaria_anamnese AS ENUM (
        'primeira_infancia',
        'segunda_infancia',
        'adolescencia',
        'adulto',
        'idoso'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Status da anamnese
DO $$ BEGIN
    CREATE TYPE status_anamnese AS ENUM (
        'em_andamento',
        'concluida',
        'rascunho_estagiario'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Tipo de sessão na agenda
DO $$ BEGIN
    CREATE TYPE tipo_sessao AS ENUM (
        'avaliacao_inicial',
        'aplicacao_testes',
        'devolutiva',
        'retorno',
        'orientacao_familiar',
        'outros'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Status da sessão
DO $$ BEGIN
    CREATE TYPE status_sessao AS ENUM (
        'agendada',
        'realizada',
        'cancelada',
        'remarcada',
        'falta'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Modalidade de aplicação de teste
DO $$ BEGIN
    CREATE TYPE modalidade_aplicacao AS ENUM (
        'presencial',
        'online'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Status da aplicação de instrumento
DO $$ BEGIN
    CREATE TYPE status_aplicacao AS ENUM (
        'aguardando',
        'em_aplicacao',
        'concluido_aplicacao',
        'em_correcao',
        'corrigido',
        'integrado_laudo'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Status da correção
DO $$ BEGIN
    CREATE TYPE status_correcao AS ENUM (
        'em_correcao',
        'corrigido',
        'aguardando_integracao',
        'integrado'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Status do laudo
DO $$ BEGIN
    CREATE TYPE status_laudo AS ENUM (
        'em_construcao',
        'aguardando_revisao_supervisor',
        'pronto_para_devolutiva',
        'devolutiva_realizada',
        'entregue',
        'errata'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Forma de entrega do laudo na devolutiva
DO $$ BEGIN
    CREATE TYPE forma_entrega_laudo AS ENUM (
        'fisica_presencial',
        'pdf_email',
        'ambos',
        'nao_entregue'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Ações de auditoria
DO $$ BEGIN
    CREATE TYPE acao_auditoria AS ENUM (
        'login',
        'logout',
        'leitura',
        'criacao',
        'edicao',
        'delecao',
        'geracao_pdf',
        'exportacao_dados',
        'tentativa_acesso_negado'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- Função auxiliar: timestamp automático de updated_at
-- Será usada por triggers em todas as tabelas que tem updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_atualiza_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Verificação: lista todos os types criados
-- ============================================================================

SELECT
    typname AS nome_do_tipo,
    typtype AS categoria
FROM pg_type
WHERE typname IN (
    'perfil_usuario', 'status_paciente', 'sexo_paciente',
    'faixa_etaria_anamnese', 'status_anamnese', 'tipo_sessao',
    'status_sessao', 'modalidade_aplicacao', 'status_aplicacao',
    'status_correcao', 'status_laudo', 'forma_entrega_laudo',
    'acao_auditoria'
)
ORDER BY typname;
-- Esperado: 13 linhas, todas com categoria 'e' (enum)

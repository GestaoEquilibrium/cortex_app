# CORTEX — Arquitetura Técnica

**Equilibrium Med Center Ltda · Neuropsicologia Clínica**
**Documento de Fundação 2 de 3**
**Versão 1.0 · 27 de abril de 2026**
**Responsável técnico:** Wessilon Marques de Sousa (CRP 04/53832)

---

## 0. Sumário

Este documento define a arquitetura técnica do CORTEX: stack tecnológico, modelo de dados completo, controle de acesso, engine de testes, integrações e estrutura de código. Complementa o Documento 1 (Especificação Funcional) e antecede o Documento 3 (Roadmap).

---

## 1. Stack tecnológico

### 1.1 Decisões fundamentais

| Camada | Tecnologia | Justificativa |
|---|---|---|
| Banco de dados | Supabase (PostgreSQL 15+) | SQL nativo, RLS robusto, custos previsíveis, já em uso no Infinity |
| Autenticação | Supabase Auth | Integrado ao banco, multi-perfil, e-mail + magic link |
| Storage de arquivos | Supabase Storage | Fotos de pacientes, PDFs gerados, anexos |
| Frontend | HTML + JavaScript (vanilla) + Tailwind CSS | Continuidade da stack do app.neuroequilibrium |
| Hospedagem | GitHub Pages | Continuidade do padrão MarquesAnd |
| Geração de PDF | Mantém solução atual do app.neuroequilibrium | Princípio 1 e 2 (preservação) |
| Geração de DOCX | docx.js (Node.js) ou solução server-side futura | A definir conforme migração |

### 1.2 Por que Supabase e não Firebase

Decisão consolidada com Wessilon em 27/04/2026:
- SQL puro permite qualquer relatório estatístico sem reformulação
- Row Level Security expressivo (políticas por tabela e por operação)
- Custos previsíveis (sem surpresa em volume de leitura)
- Reaproveitamento da experiência do Infinity
- Migração consolida tudo numa stack só

### 1.3 Projeto Supabase dedicado

Decisão consolidada: o CORTEX terá **projeto Supabase próprio**, separado do Infinity.

Justificativa:
- Separação de domínio (clínica × HR/finanças)
- Compliance LGPD facilitado (escopo de tratamento isolado)
- Controle granular de auditoria
- Permite migração independente entre projetos no futuro

**Nome sugerido do projeto:** `cortex-equilibrium`

---

## 2. Modelo de dados

### 2.1 Visão geral das tabelas

| Tabela | Propósito | Volume estimado |
|---|---|---|
| `profissionais` | Cadastro de usuários do sistema com perfil | Baixo (~20-30 registros) |
| `vinculos_profissional_supervisor` | Relação estagiário→supervisor | Baixo (~5-15 registros) |
| `pacientes` | Cadastro de pacientes | Médio (~500-2000 registros/ano) |
| `vinculos_paciente_aplicador` | Relação paciente→aplicador (atribuição) | Médio (1:1 com pacientes) |
| `anamneses` | Anamnese do paciente (estruturada por idade) | Médio (1:1 com pacientes) |
| `hipoteses` | Hipóteses diagnósticas e plano de avaliação | Médio (1:1 com pacientes) |
| `relatorios_escolares` | Dados do contexto escolar | Médio (~30% dos pacientes) |
| `sessoes` | Agenda e histórico de sessões | Alto (~20.000+/ano) |
| `instrumentos_catalogo` | Definições dos testes disponíveis | Baixo (~60 registros estáveis) |
| `aplicacoes_instrumento` | Cada teste aplicado a um paciente | Alto (~10x pacientes/ano) |
| `respostas_brutas` | Respostas item-a-item dos testes | Muito alto (~100x aplicacoes) |
| `correcoes` | Resultado da correção de cada aplicação | Alto (1:1 com aplicações) |
| `laudos` | Laudo final integrado | Médio (1:1 com pacientes) |
| `secoes_resultados` | Seções de resultados escritas pelo Corretor | Médio |
| `devolutivas` | Sessões de devolutiva e status | Médio (1:1 com laudos) |
| `convenios` | Lista de convênios atendidos | Baixo (~20 registros) |
| `cids` | Catálogo CID-11 / DSM-5-TR | Baixo (~5000 registros estáticos) |
| `auditoria_acessos` | Log imutável de acessos | Muito alto (todas as ops logadas) |

### 2.2 Esquema detalhado por tabela

#### `profissionais`

```sql
CREATE TABLE profissionais (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_user_id UUID UNIQUE REFERENCES auth.users(id),
    nome_completo TEXT NOT NULL,
    crp TEXT,
    cpf TEXT UNIQUE,
    email TEXT NOT NULL UNIQUE,
    telefone TEXT,
    foto_url TEXT,
    perfil TEXT NOT NULL CHECK (perfil IN (
        'admin_clinico', 'admin_gestor', 'neuropsicologo_aplicador',
        'estagiario', 'corretor'
    )),
    formacao TEXT,
    especialidade TEXT,
    ativo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES profissionais(id)
);

CREATE INDEX idx_profissionais_perfil ON profissionais(perfil) WHERE ativo = true;
CREATE INDEX idx_profissionais_auth ON profissionais(auth_user_id);
```

#### `vinculos_profissional_supervisor` (estagiários ↔ supervisores)

```sql
CREATE TABLE vinculos_profissional_supervisor (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    estagiario_id UUID NOT NULL REFERENCES profissionais(id),
    supervisor_id UUID NOT NULL REFERENCES profissionais(id),
    data_inicio DATE NOT NULL,
    data_fim DATE,
    ativo BOOLEAN DEFAULT true,
    UNIQUE(estagiario_id, supervisor_id, data_inicio)
);
```

#### `pacientes`

```sql
CREATE TABLE pacientes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome_completo TEXT NOT NULL,
    data_nascimento DATE NOT NULL,
    sexo TEXT NOT NULL CHECK (sexo IN ('Masculino', 'Feminino', 'Outro')),
    cpf TEXT UNIQUE,
    rg TEXT,
    foto_url TEXT,
    escolaridade TEXT,
    profissao TEXT,
    estado_civil TEXT,
    convenio_id UUID REFERENCES convenios(id),
    numero_convenio TEXT,
    telefone TEXT,
    email TEXT,
    endereco TEXT,
    cidade TEXT DEFAULT 'Uberlândia',
    estado TEXT DEFAULT 'MG',
    cep TEXT,

    responsavel_nome TEXT,
    responsavel_parentesco TEXT,
    responsavel_telefone TEXT,
    responsavel_email TEXT,
    responsavel_cpf TEXT,

    encaminhado_por TEXT,
    medico_referencia TEXT,
    medico_crm TEXT,

    status TEXT NOT NULL DEFAULT 'cadastrado' CHECK (status IN (
        'cadastrado', 'em_avaliacao', 'pronto_para_laudo',
        'laudo_pronto', 'devolutiva_agendada', 'devolutiva_realizada',
        'entregue', 'pendente', 'arquivado'
    )),

    observacoes TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES profissionais(id),
    arquivado_em TIMESTAMPTZ
);

CREATE INDEX idx_pacientes_nome ON pacientes USING gin(to_tsvector('portuguese', nome_completo));
CREATE INDEX idx_pacientes_status ON pacientes(status) WHERE status NOT IN ('entregue', 'arquivado');
CREATE INDEX idx_pacientes_convenio ON pacientes(convenio_id);
```

#### `vinculos_paciente_aplicador`

```sql
CREATE TABLE vinculos_paciente_aplicador (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    paciente_id UUID NOT NULL REFERENCES pacientes(id),
    aplicador_id UUID NOT NULL REFERENCES profissionais(id),
    data_inicio DATE NOT NULL DEFAULT CURRENT_DATE,
    data_fim DATE,
    ativo BOOLEAN DEFAULT true,
    motivo_atribuicao TEXT,
    motivo_encerramento TEXT,
    atribuido_por UUID NOT NULL REFERENCES profissionais(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(paciente_id, aplicador_id, data_inicio)
);

CREATE INDEX idx_vinculos_aplicador ON vinculos_paciente_aplicador(aplicador_id) WHERE ativo = true;
CREATE INDEX idx_vinculos_paciente ON vinculos_paciente_aplicador(paciente_id) WHERE ativo = true;
```

#### `anamneses`

```sql
CREATE TABLE anamneses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    paciente_id UUID NOT NULL UNIQUE REFERENCES pacientes(id),
    faixa_etaria TEXT NOT NULL CHECK (faixa_etaria IN (
        'primeira_infancia', 'segunda_infancia', 'adolescencia',
        'adulto', 'idoso'
    )),

    identificacao JSONB DEFAULT '{}'::jsonb,
    queixa_historico JSONB DEFAULT '{}'::jsonb,
    desenvolvimento JSONB DEFAULT '{}'::jsonb,
    contexto_familiar JSONB DEFAULT '{}'::jsonb,
    historico_escolar JSONB DEFAULT '{}'::jsonb,
    saude_medicacoes JSONB DEFAULT '{}'::jsonb,
    social_emocional JSONB DEFAULT '{}'::jsonb,
    outros_profissionais JSONB DEFAULT '{}'::jsonb,

    completude_percentual INT DEFAULT 0,
    status TEXT DEFAULT 'em_andamento' CHECK (status IN (
        'em_andamento', 'concluida', 'rascunho_estagiario'
    )),

    preenchido_por UUID REFERENCES profissionais(id),
    aprovado_por UUID REFERENCES profissionais(id),
    aprovado_em TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Justificativa do uso de JSONB:** os blocos da anamnese (identificação, queixa, etc.) têm muitos campos opcionais que variam por faixa etária. JSONB permite estrutura flexível por idade sem proliferação de colunas, mantendo capacidade de consulta (`anamneses.identificacao->>'nome_pai'`).

#### `hipoteses`

```sql
CREATE TABLE hipoteses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    paciente_id UUID NOT NULL UNIQUE REFERENCES pacientes(id),
    hipoteses_iniciais TEXT,
    cids_sugeridos TEXT[],
    justificativa_clinica TEXT,
    plano_avaliacao TEXT,
    instrumentos_sugeridos TEXT[],

    preenchido_por UUID REFERENCES profissionais(id),
    aprovado_por UUID REFERENCES profissionais(id),
    aprovado_em TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### `relatorios_escolares`

```sql
CREATE TABLE relatorios_escolares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    paciente_id UUID NOT NULL UNIQUE REFERENCES pacientes(id),
    nome_escola TEXT,
    professor_referencia TEXT,
    ano_escolar TEXT,
    desempenho_portugues TEXT,
    desempenho_matematica TEXT,
    desempenho_outras_areas JSONB DEFAULT '{}'::jsonb,
    comportamento_sala TEXT,
    relacionamento_pares TEXT,
    observacoes_educadores TEXT,
    arquivos_anexos TEXT[],

    preenchido_por UUID REFERENCES profissionais(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### `sessoes`

```sql
CREATE TABLE sessoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    paciente_id UUID NOT NULL REFERENCES pacientes(id),
    profissional_id UUID NOT NULL REFERENCES profissionais(id),
    tipo TEXT NOT NULL CHECK (tipo IN (
        'aplicacao_testes', 'devolutiva', 'retorno', 'orientacao_familiar',
        'avaliacao_inicial', 'outros'
    )),
    data_hora_inicio TIMESTAMPTZ NOT NULL,
    data_hora_fim TIMESTAMPTZ NOT NULL,
    sala TEXT,
    status TEXT NOT NULL DEFAULT 'agendada' CHECK (status IN (
        'agendada', 'realizada', 'cancelada', 'remarcada', 'falta'
    )),
    observacoes TEXT,
    motivo_cancelamento TEXT,

    eh_primeira_sessao BOOLEAN DEFAULT false,
    cria_vinculo_aplicador BOOLEAN DEFAULT false,

    agendada_por UUID NOT NULL REFERENCES profissionais(id),
    cancelada_por UUID REFERENCES profissionais(id),
    realizada_em TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sessoes_data ON sessoes(data_hora_inicio);
CREATE INDEX idx_sessoes_profissional ON sessoes(profissional_id, data_hora_inicio);
CREATE INDEX idx_sessoes_paciente ON sessoes(paciente_id, data_hora_inicio DESC);
CREATE INDEX idx_sessoes_status ON sessoes(status) WHERE status = 'agendada';
```

#### `instrumentos_catalogo`

```sql
CREATE TABLE instrumentos_catalogo (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sigla TEXT NOT NULL UNIQUE,
    nome_completo TEXT NOT NULL,
    o_que_avalia TEXT NOT NULL,
    faixa_etaria_min_meses INT,
    faixa_etaria_max_meses INT,
    faixa_etaria_label TEXT,
    dominio_principal TEXT NOT NULL,
    versao TEXT,
    autores TEXT,
    editora TEXT,

    permite_aplicacao_online BOOLEAN DEFAULT false,
    permite_correcao_sistema BOOLEAN DEFAULT false,
    versao_engine TEXT,

    schema_itens_url TEXT,
    schema_correcao_url TEXT,
    schema_normas_url TEXT,
    template_relatorio_url TEXT,

    ativo BOOLEAN DEFAULT true,
    em_breve BOOLEAN DEFAULT false,
    ordem_categoria INT,
    categoria TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_instrumentos_sigla ON instrumentos_catalogo(sigla);
CREATE INDEX idx_instrumentos_dominio ON instrumentos_catalogo(dominio_principal);
CREATE INDEX idx_instrumentos_ativo ON instrumentos_catalogo(ativo) WHERE ativo = true;
```

**Observação crítica:** esta tabela é o coração da engine genérica de testes. Cada instrumento aponta para arquivos de schema (`schema_itens_url`, `schema_correcao_url`, `schema_normas_url`) que descrevem sua estrutura. Detalhes na seção 4 deste documento.

#### `aplicacoes_instrumento`

```sql
CREATE TABLE aplicacoes_instrumento (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    paciente_id UUID NOT NULL REFERENCES pacientes(id),
    instrumento_id UUID NOT NULL REFERENCES instrumentos_catalogo(id),
    aplicador_id UUID REFERENCES profissionais(id),
    sessao_id UUID REFERENCES sessoes(id),

    modalidade TEXT NOT NULL CHECK (modalidade IN ('presencial', 'online')),

    link_unico TEXT UNIQUE,
    link_expira_em TIMESTAMPTZ,
    link_acessado_em TIMESTAMPTZ,

    status TEXT NOT NULL DEFAULT 'aguardando' CHECK (status IN (
        'aguardando', 'em_aplicacao', 'concluido_aplicacao',
        'em_correcao', 'corrigido', 'integrado_laudo'
    )),

    data_aplicacao DATE,
    data_conclusao TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_aplicacoes_paciente ON aplicacoes_instrumento(paciente_id);
CREATE INDEX idx_aplicacoes_status ON aplicacoes_instrumento(status);
CREATE INDEX idx_aplicacoes_link ON aplicacoes_instrumento(link_unico) WHERE link_unico IS NOT NULL;
```

#### `respostas_brutas`

```sql
CREATE TABLE respostas_brutas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aplicacao_id UUID NOT NULL REFERENCES aplicacoes_instrumento(id) ON DELETE CASCADE,
    item_codigo TEXT NOT NULL,
    valor_resposta JSONB NOT NULL,
    observacao_aplicador TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(aplicacao_id, item_codigo)
);

CREATE INDEX idx_respostas_aplicacao ON respostas_brutas(aplicacao_id);
```

**Justificativa de JSONB para `valor_resposta`:** diferentes testes têm diferentes tipos de resposta (Likert 0-3, V/F, número, texto, múltipla escolha). JSONB permite armazenar qualquer estrutura mantendo capacidade de consulta. Ex: `{"escala": 2, "tempo_resposta_ms": 4200}` ou `{"resposta": "verdadeiro"}`.

#### `correcoes`

```sql
CREATE TABLE correcoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aplicacao_id UUID NOT NULL UNIQUE REFERENCES aplicacoes_instrumento(id),
    corretor_id UUID NOT NULL REFERENCES profissionais(id),
    versao_engine TEXT NOT NULL,

    escores_brutos JSONB NOT NULL DEFAULT '{}'::jsonb,
    escores_ponderados JSONB NOT NULL DEFAULT '{}'::jsonb,
    percentis JSONB NOT NULL DEFAULT '{}'::jsonb,
    classificacoes JSONB NOT NULL DEFAULT '{}'::jsonb,
    indices_compostos JSONB DEFAULT '{}'::jsonb,
    interpretacao_automatica JSONB,

    ajustes_manuais JSONB,
    justificativa_ajustes TEXT,

    pdf_relatorio_url TEXT,
    secao_resultados_texto TEXT,

    status TEXT NOT NULL DEFAULT 'em_correcao' CHECK (status IN (
        'em_correcao', 'corrigido', 'aguardando_integracao', 'integrado'
    )),

    corrigido_em TIMESTAMPTZ,
    integrado_em TIMESTAMPTZ,
    integrado_por UUID REFERENCES profissionais(id),

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_correcoes_aplicacao ON correcoes(aplicacao_id);
CREATE INDEX idx_correcoes_corretor ON correcoes(corretor_id);
CREATE INDEX idx_correcoes_status ON correcoes(status);
```

**Para WAIS-III especificamente, exemplo de estrutura JSONB de `escores_ponderados`:**

```json
{
  "vocabulario": 12,
  "semelhancas": 11,
  "informacao": 10,
  "compreensao": 9,
  "aritmetica": 13,
  "digitos": 11,
  "completar_figuras": 10,
  "cubos": 12,
  "raciocinio_matricial": 11,
  "arranjo_figuras": 10
}
```

**E `indices_compostos`:**

```json
{
  "icv": 105,
  "iop": 108,
  "imo": 110,
  "ivp": 100,
  "qit": 106,
  "gai": 107,
  "discrepancia_qit_gai": -1,
  "heterogeneidade_clinicamente_significativa": false
}
```

#### `laudos`

```sql
CREATE TABLE laudos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    paciente_id UUID NOT NULL UNIQUE REFERENCES pacientes(id),
    aplicador_responsavel_id UUID NOT NULL REFERENCES profissionais(id),

    secao_identificacao TEXT,
    secao_demanda TEXT,
    secao_procedimentos TEXT,
    secao_resultados TEXT,
    secao_analise TEXT,
    secao_conclusao TEXT,
    secao_recomendacoes TEXT,
    secao_encaminhamentos TEXT,
    secao_referencias TEXT,

    cids_finais TEXT[],
    hipoteses_diagnosticas_finais TEXT,

    status TEXT NOT NULL DEFAULT 'em_construcao' CHECK (status IN (
        'em_construcao', 'aguardando_revisao_supervisor',
        'pronto_para_devolutiva', 'devolutiva_realizada', 'entregue', 'errata'
    )),

    aprovado_por_wessilon BOOLEAN DEFAULT false,
    aprovado_em TIMESTAMPTZ,

    pdf_url TEXT,
    docx_url TEXT,
    versao INT DEFAULT 1,

    finalizado_em TIMESTAMPTZ,
    entregue_em TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_laudos_paciente ON laudos(paciente_id);
CREATE INDEX idx_laudos_status ON laudos(status);
CREATE INDEX idx_laudos_aplicador ON laudos(aplicador_responsavel_id);
```

#### `devolutivas`

```sql
CREATE TABLE devolutivas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    laudo_id UUID NOT NULL UNIQUE REFERENCES laudos(id),
    paciente_id UUID NOT NULL REFERENCES pacientes(id),
    realizada_por UUID NOT NULL REFERENCES profissionais(id),
    sessao_id UUID REFERENCES sessoes(id),

    data_realizacao TIMESTAMPTZ NOT NULL,
    presentes TEXT,
    pontos_principais_discutidos TEXT,
    duvidas_apresentadas TEXT,
    encaminhamentos_acordados TEXT,

    laudo_entregue BOOLEAN DEFAULT false,
    forma_entrega TEXT CHECK (forma_entrega IN (
        'fisica_presencial', 'pdf_email', 'ambos', 'nao_entregue'
    )),

    pendencia BOOLEAN DEFAULT false,
    motivo_pendencia TEXT,
    observacoes_pendencia TEXT,
    prazo_resolucao DATE,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_devolutivas_paciente ON devolutivas(paciente_id);
CREATE INDEX idx_devolutivas_pendencia ON devolutivas(pendencia) WHERE pendencia = true;
```

#### `convenios`

```sql
CREATE TABLE convenios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL UNIQUE,
    operadora TEXT,
    ativo BOOLEAN DEFAULT true,
    observacoes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Convênios atuais a inserir:**
- GNDI (TEA): Psico TEA 60010126, Fono TEA 61010073, TO TEA 62010123, PSM TEA 60010371, Neuro TEA 60010363, Psicoped TEA 60010150
- UNIMED (ABA individual): 50005103, 50005189, 50005170
- Particular

#### `cids`

```sql
CREATE TABLE cids (
    id TEXT PRIMARY KEY,
    versao TEXT NOT NULL CHECK (versao IN ('CID-11', 'DSM-5-TR')),
    titulo TEXT NOT NULL,
    descricao TEXT,
    capitulo TEXT,
    ativo BOOLEAN DEFAULT true
);

CREATE INDEX idx_cids_busca ON cids USING gin(to_tsvector('portuguese', titulo || ' ' || COALESCE(descricao, '')));
```

#### `auditoria_acessos`

```sql
CREATE TABLE auditoria_acessos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profissional_id UUID NOT NULL REFERENCES profissionais(id),
    acao TEXT NOT NULL CHECK (acao IN (
        'login', 'logout', 'leitura', 'criacao', 'edicao', 'delecao',
        'geracao_pdf', 'exportacao_dados', 'tentativa_acesso_negado'
    )),
    tabela TEXT NOT NULL,
    registro_id UUID,
    paciente_id UUID,
    detalhes JSONB,
    ip_origem INET,
    user_agent TEXT,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_auditoria_profissional ON auditoria_acessos(profissional_id, timestamp DESC);
CREATE INDEX idx_auditoria_paciente ON auditoria_acessos(paciente_id, timestamp DESC) WHERE paciente_id IS NOT NULL;
CREATE INDEX idx_auditoria_timestamp ON auditoria_acessos(timestamp DESC);

ALTER TABLE auditoria_acessos ADD CONSTRAINT auditoria_imutavel CHECK (false) NO INHERIT;
ALTER TABLE auditoria_acessos DROP CONSTRAINT auditoria_imutavel;
```

**Imutabilidade da auditoria:** triggers de prevenção de UPDATE e DELETE serão criados. Apenas INSERT é permitido.

```sql
CREATE OR REPLACE FUNCTION fn_bloqueia_alteracao_auditoria()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Logs de auditoria são imutáveis. Operação % bloqueada.', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_auditoria_bloqueia_update
    BEFORE UPDATE ON auditoria_acessos
    FOR EACH ROW EXECUTE FUNCTION fn_bloqueia_alteracao_auditoria();

CREATE TRIGGER trg_auditoria_bloqueia_delete
    BEFORE DELETE ON auditoria_acessos
    FOR EACH ROW EXECUTE FUNCTION fn_bloqueia_alteracao_auditoria();
```

### 2.3 Diagrama relacional simplificado

```
profissionais ──┬── vinculos_profissional_supervisor
                ├── vinculos_paciente_aplicador ── pacientes
                │                                   ├── anamneses
                │                                   ├── hipoteses
                │                                   ├── relatorios_escolares
                │                                   ├── sessoes ────────┐
                │                                   ├── aplicacoes ─────┤── respostas_brutas
                │                                   │       └── correcoes
                │                                   ├── laudos
                │                                   └── devolutivas
                └── auditoria_acessos

instrumentos_catalogo ── aplicacoes
convenios ── pacientes
cids ── (referenciado em hipoteses, laudos como TEXT[])
```

---

## 3. Row Level Security (RLS) — controle de acesso

### 3.1 Princípio

Cada perfil tem políticas de RLS específicas. As políticas usam a função auxiliar `current_profissional_id()` que retorna o `profissional.id` do usuário autenticado:

```sql
CREATE OR REPLACE FUNCTION current_profissional_id()
RETURNS UUID AS $$
    SELECT id FROM profissionais WHERE auth_user_id = auth.uid();
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION current_perfil()
RETURNS TEXT AS $$
    SELECT perfil FROM profissionais WHERE auth_user_id = auth.uid();
$$ LANGUAGE sql STABLE;
```

### 3.2 Políticas por tabela

#### Pacientes

```sql
ALTER TABLE pacientes ENABLE ROW LEVEL SECURITY;

CREATE POLICY pacientes_admin_clinico_all ON pacientes
    FOR ALL TO authenticated
    USING (current_perfil() = 'admin_clinico');

CREATE POLICY pacientes_admin_gestor_select_basicos ON pacientes
    FOR SELECT TO authenticated
    USING (current_perfil() = 'admin_gestor');

CREATE POLICY pacientes_admin_gestor_insert ON pacientes
    FOR INSERT TO authenticated
    WITH CHECK (current_perfil() = 'admin_gestor');

CREATE POLICY pacientes_aplicador_seus ON pacientes
    FOR ALL TO authenticated
    USING (
        current_perfil() = 'neuropsicologo_aplicador'
        AND EXISTS (
            SELECT 1 FROM vinculos_paciente_aplicador v
            WHERE v.paciente_id = pacientes.id
            AND v.aplicador_id = current_profissional_id()
            AND v.ativo = true
        )
    );

CREATE POLICY pacientes_estagiario_supervisor ON pacientes
    FOR SELECT TO authenticated
    USING (
        current_perfil() = 'estagiario'
        AND EXISTS (
            SELECT 1 FROM vinculos_profissional_supervisor s
            JOIN vinculos_paciente_aplicador v ON v.aplicador_id = s.supervisor_id
            WHERE s.estagiario_id = current_profissional_id()
            AND s.ativo = true
            AND v.paciente_id = pacientes.id
            AND v.ativo = true
        )
    );

CREATE POLICY pacientes_corretor_basicos ON pacientes
    FOR SELECT TO authenticated
    USING (
        current_perfil() = 'corretor'
        AND EXISTS (
            SELECT 1 FROM aplicacoes_instrumento a
            WHERE a.paciente_id = pacientes.id
            AND a.status IN ('concluido_aplicacao', 'em_correcao')
        )
    );
```

#### Anamneses, Hipóteses e Laudos (Corretor não vê)

```sql
ALTER TABLE anamneses ENABLE ROW LEVEL SECURITY;
ALTER TABLE hipoteses ENABLE ROW LEVEL SECURITY;
ALTER TABLE laudos ENABLE ROW LEVEL SECURITY;

CREATE POLICY anamneses_excluir_corretor_admin_gestor ON anamneses
    FOR ALL TO authenticated
    USING (
        current_perfil() NOT IN ('corretor', 'admin_gestor')
        AND (
            current_perfil() = 'admin_clinico'
            OR EXISTS (
                SELECT 1 FROM vinculos_paciente_aplicador v
                WHERE v.paciente_id = anamneses.paciente_id
                AND v.aplicador_id = current_profissional_id()
                AND v.ativo = true
            )
        )
    );

CREATE POLICY hipoteses_excluir_corretor_admin_gestor ON hipoteses
    FOR ALL TO authenticated
    USING (
        current_perfil() NOT IN ('corretor', 'admin_gestor')
        AND (
            current_perfil() = 'admin_clinico'
            OR EXISTS (
                SELECT 1 FROM vinculos_paciente_aplicador v
                WHERE v.paciente_id = hipoteses.paciente_id
                AND v.aplicador_id = current_profissional_id()
                AND v.ativo = true
            )
        )
    );

CREATE POLICY laudos_excluir_corretor_admin_gestor ON laudos
    FOR ALL TO authenticated
    USING (
        current_perfil() NOT IN ('corretor', 'admin_gestor')
        AND (
            current_perfil() = 'admin_clinico'
            OR aplicador_responsavel_id = current_profissional_id()
            OR EXISTS (
                SELECT 1 FROM vinculos_profissional_supervisor s
                WHERE s.estagiario_id = current_profissional_id()
                AND s.ativo = true
                AND s.supervisor_id = laudos.aplicador_responsavel_id
            )
        )
    );
```

#### Aplicações e Correções (Corretor vê todos)

```sql
ALTER TABLE aplicacoes_instrumento ENABLE ROW LEVEL SECURITY;

CREATE POLICY aplicacoes_admin_clinico_all ON aplicacoes_instrumento
    FOR ALL TO authenticated
    USING (current_perfil() = 'admin_clinico');

CREATE POLICY aplicacoes_aplicador_seus ON aplicacoes_instrumento
    FOR ALL TO authenticated
    USING (
        current_perfil() = 'neuropsicologo_aplicador'
        AND EXISTS (
            SELECT 1 FROM vinculos_paciente_aplicador v
            WHERE v.paciente_id = aplicacoes_instrumento.paciente_id
            AND v.aplicador_id = current_profissional_id()
            AND v.ativo = true
        )
    );

CREATE POLICY aplicacoes_corretor_todos ON aplicacoes_instrumento
    FOR SELECT TO authenticated
    USING (current_perfil() = 'corretor');

CREATE POLICY aplicacoes_corretor_correcao ON aplicacoes_instrumento
    FOR UPDATE TO authenticated
    USING (
        current_perfil() = 'corretor'
        AND status IN ('concluido_aplicacao', 'em_correcao')
    );
```

### 3.3 Funções de auditoria automática

Triggers em todas as tabelas críticas para popular `auditoria_acessos` automaticamente em cada operação. Detalhamento implementacional na Fase A do Roadmap.

---

## 4. Engine de testes — arquitetura

### 4.1 Princípio fundamental

Em vez de codificar 60+ testes individualmente (cada um com seu motor de correção), o CORTEX define **um motor genérico** que lê arquivos de configuração de cada teste e aplica suas regras dinamicamente.

**Cada teste é descrito por 3 arquivos JSON:**

1. `schema_itens.json` — quais perguntas existem, tipos de resposta, opções
2. `schema_correcao.json` — regras de cálculo (fórmulas, somatórias, inversões, agrupamentos)
3. `schema_normas.json` — tabelas normativas por idade/sexo/escolaridade

### 4.2 Exemplo: BAARS-IV (versão simplificada)

**`schema_itens.json`:**
```json
{
  "instrumento": "BAARS-IV",
  "versao": "1.0",
  "secoes": [
    {
      "id": "desatencao_atual",
      "nome": "Desatenção (Atual)",
      "itens": [
        {"codigo": "ba_1", "texto": "Falha em prestar atenção...", "tipo": "likert_4", "ordem": 1},
        {"codigo": "ba_2", "texto": "Dificuldade em manter atenção...", "tipo": "likert_4", "ordem": 2}
      ]
    }
  ],
  "tipos_resposta": {
    "likert_4": {
      "0": "Nunca ou raramente",
      "1": "Às vezes",
      "2": "Frequentemente",
      "3": "Muito frequentemente"
    }
  }
}
```

**`schema_correcao.json`:**
```json
{
  "instrumento": "BAARS-IV",
  "subescalas": {
    "desatencao_atual": {
      "itens": ["ba_1", "ba_2", "ba_3", "ba_4", "ba_5", "ba_6", "ba_7", "ba_8", "ba_9"],
      "tipo_calculo": "soma_simples"
    },
    "hiperatividade_atual": {
      "itens": ["ba_10", "ba_11", "ba_12", "ba_13", "ba_14"],
      "tipo_calculo": "soma_simples"
    }
  },
  "indices_compostos": {
    "tdah_atual_total": {
      "tipo": "soma",
      "componentes": ["desatencao_atual", "hiperatividade_atual", "impulsividade_atual"]
    }
  },
  "criterios_diagnosticos": {
    "tdah_provavel": {
      "regra": "desatencao_atual_sintomas_significativos >= 5 OR hiperatividade_atual_sintomas_significativos >= 5",
      "fonte": "DSM-5-TR"
    }
  }
}
```

**`schema_normas.json`:**
```json
{
  "instrumento": "BAARS-IV",
  "fonte": "Barkley, R. A. (2011). Barkley Adult ADHD Rating Scale—IV (BAARS-IV).",
  "tabela_normativa": [
    {
      "subescala": "desatencao_atual",
      "sexo": "M",
      "faixa_etaria": "18-29",
      "media": 11.2,
      "desvio_padrao": 4.1,
      "percentil_93": 18,
      "percentil_98": 22
    }
  ]
}
```

### 4.3 Motor de correção genérico (pseudocódigo)

```javascript
async function corrigirAplicacao(aplicacaoId) {
  const aplicacao = await db.aplicacoes.get(aplicacaoId);
  const instrumento = await db.instrumentos.get(aplicacao.instrumento_id);

  const schemaCorrecao = await fetch(instrumento.schema_correcao_url).then(r => r.json());
  const schemaNormas = await fetch(instrumento.schema_normas_url).then(r => r.json());
  const respostas = await db.respostas_brutas.list({ aplicacao_id: aplicacaoId });

  const escoresBrutos = {};
  for (const [subescala, regra] of Object.entries(schemaCorrecao.subescalas)) {
    if (regra.tipo_calculo === 'soma_simples') {
      escoresBrutos[subescala] = regra.itens
        .map(item => respostas.find(r => r.item_codigo === item)?.valor_resposta?.escala || 0)
        .reduce((a, b) => a + b, 0);
    }
  }

  const sexoIdadePaciente = await getSexoIdadeAtualPaciente(aplicacao.paciente_id);
  const percentis = {};
  const classificacoes = {};

  for (const subescala of Object.keys(escoresBrutos)) {
    const norma = schemaNormas.tabela_normativa.find(n =>
      n.subescala === subescala &&
      n.sexo === sexoIdadePaciente.sexo &&
      n.faixa_etaria === sexoIdadePaciente.faixaEtaria
    );

    percentis[subescala] = calcularPercentil(escoresBrutos[subescala], norma);
    classificacoes[subescala] = classificarPorPercentil(percentis[subescala]);
  }

  const indicesCompostos = calcularIndicesCompostos(escoresBrutos, schemaCorrecao);

  return {
    escores_brutos: escoresBrutos,
    percentis,
    classificacoes,
    indices_compostos: indicesCompostos,
    versao_engine: instrumento.versao_engine
  };
}
```

### 4.4 Migração progressiva

Os 12 testes da Correção e os 11 da Aplicação **já têm motores de correção funcionando** no app.neuroequilibrium. A estratégia é:

1. **Adaptador (não reescrita):** envolver os motores existentes em uma camada que lê dos novos schemas e devolve no formato esperado
2. **Schemas extraídos do código atual:** o conhecimento já está lá, apenas será documentado em JSON
3. **Validação cruzada:** rodar correções em paralelo (motor antigo vs novo) e comparar resultados

Detalhes desse processo no Documento 3 (Roadmap).

### 4.5 Adicionar novo teste no futuro

Adicionar um novo instrumento ao CORTEX vira um trabalho de configuração, não programação:

1. Wessilon (ou neuropsicólogo designado) preenche os 3 arquivos JSON com a estrutura do teste
2. Insere registro em `instrumentos_catalogo` com URLs dos schemas
3. Faz teste de validação com casos conhecidos
4. Sistema passa a aceitar o novo instrumento sem mudança de código

**Esse é o segredo da escalabilidade do CORTEX.**

---

## 5. Estrutura de código (frontend)

### 5.1 Organização de pastas

```
cortex/
├── public/
│   ├── index.html              # Login
│   ├── dashboard/              # Dashboard executivo
│   ├── pacientes/              # Lista e ficha
│   ├── agenda/                 # Calendário
│   ├── anamnese/               # Formulários por idade
│   ├── hipoteses/              # Hipóteses diagnósticas
│   ├── relatorio_escolar/
│   ├── checklist/              # Migrado do app.neuroequilibrium
│   ├── aplicacao_testes/       # Migrado, com Supabase
│   ├── correcao_testes/        # Migrado, com Supabase
│   ├── laudo/                  # Construção do laudo
│   ├── devolutiva/             # Tela exclusiva Wessilon
│   ├── fila_correcao/          # Tela exclusiva Corretor
│   ├── relatorios/             # BI e exportações
│   └── config/
├── shared/
│   ├── supabase_client.js
│   ├── auth.js                 # Login, logout, troca de perfil
│   ├── audit.js                # Wrapper de auditoria
│   ├── correcao_engine.js      # Motor genérico
│   ├── pdf_engine.js           # Geração de PDFs (mantém modelos Wessilon)
│   ├── docx_engine.js
│   ├── ui_components.js        # Componentes reutilizáveis
│   └── routes.js
├── instrumentos_schemas/       # JSONs por teste
│   ├── BAARS-IV/
│   │   ├── itens.json
│   │   ├── correcao.json
│   │   └── normas.json
│   ├── BFP/
│   ├── SRS-2_pre_escolar/
│   ├── SRS-2_escolar/
│   ├── SRS-2_adulto/
│   └── ...
├── modelos_relatorio/          # Templates dos laudos Wessilon
│   ├── laudo_padrao.docx
│   ├── relatorio_wais.docx
│   └── ...
└── docs/
    ├── 01_CORTEX_Especificacao_Funcional.md
    ├── 02_CORTEX_Arquitetura_Tecnica.md
    └── 03_CORTEX_Roadmap_Execucao.md
```

### 5.2 Repositório Git

**Decisão:** continuar com `MarquesAnd/Equilibrium_Neuro` evoluindo gradualmente.

Branches:
- `main` — estável, em produção (app.neuroequilibrium atual continua aqui)
- `cortex-v2` — desenvolvimento do CORTEX
- `cortex-v2-fase-a`, `cortex-v2-fase-b`, etc. — branches por fase

**Quando o CORTEX estiver pronto, o app.neuroequilibrium é desativado e o CORTEX assume o domínio.**

---

## 6. Migração de dados existentes

### 6.1 Inventário a migrar

Conforme respondido por Wessilon: "alguns pacientes e testes (poucas dezenas)".

Volume estimado:
- Pacientes: ~30-100
- Testes aplicados: ~100-300
- Anamneses: ~30-100
- Laudos finalizados: alguns

### 6.2 Estratégia de migração

1. **Auditoria do Firebase** — listar tudo que existe lá, exportar para JSON
2. **Mapeamento campo a campo** — cada campo do Firebase → campo do Supabase
3. **Script de migração** — Node.js que lê JSON e popula o Supabase respeitando integridade
4. **Validação cruzada** — comparar dados antes/depois
5. **Preservação dos dados originais** — backup do Firebase mantido por 12 meses após a virada

### 6.3 Pacientes recém-cadastrados no app.neuroequilibrium durante a transição

Possibilidade de **migração delta** ao final: tudo que entrou no Firebase entre o congelamento da arquitetura e a virada é migrado em lote final.

---

## 7. Storage de arquivos

### 7.1 Buckets

| Bucket | Conteúdo | Acesso |
|---|---|---|
| `pacientes-fotos` | Fotos de perfil dos pacientes | Privado, RLS por vínculo |
| `laudos-pdf` | PDFs de laudos finalizados | Privado, RLS por vínculo |
| `laudos-docx` | DOCX de laudos | Privado, RLS por vínculo |
| `relatorios-testes` | PDFs de relatórios individuais de testes | Privado, RLS por vínculo |
| `checklists` | PDFs do checklist (continuidade do prontuário físico) | Privado |
| `relatorios-escolares-anexos` | Anexos do relatório escolar | Privado |
| `templates` | Templates DOCX dos modelos Wessilon | Restrito ao Admin-clínico |

### 7.2 Política de retenção

- Arquivos de pacientes ativos: indefinido
- Arquivos de pacientes arquivados: 5 anos no bucket "frio" (após esse período, opção de exclusão definitiva mediante decisão clínica)

---

## 8. Conformidade técnica LGPD

### 8.1 Criptografia

- Em trânsito: HTTPS obrigatório (Supabase já garante)
- Em repouso: Supabase criptografa storage e banco automaticamente

### 8.2 Pseudonimização para relatórios

Ao gerar dashboards estatísticos, o sistema pode operar em modo "agregado" que não expõe nome do paciente — apenas idade, sexo, convênio, instrumento, classificação. Isso permite uso de dados para análises sem expor identidade.

### 8.3 Direitos do titular

Implementação:
- Acesso aos próprios dados: paciente pode solicitar exportação (manual via Wessilon nesta primeira fase)
- Retificação: via solicitação formal ao Admin-clínico
- Eliminação: respeita prazo legal de 5 anos do CFP, depois opção de anonimização

---

## 9. Performance e escalabilidade

### 9.1 Estimativas

Para um cenário de 5 anos de uso:
- ~5.000 pacientes cadastrados
- ~50.000 testes aplicados
- ~500.000 respostas brutas
- ~50.000 sessões registradas

Volume totalmente confortável para Supabase no plano Pro.

### 9.2 Otimizações previstas

- Índices nas colunas de busca frequente (já mapeados nas tabelas)
- Views materializadas para dashboards estatísticos pesados
- Particionamento de `auditoria_acessos` por trimestre após volume grande
- Soft delete em vez de DELETE físico (preservar integridade referencial)

---

## 10. Aceitação técnica

Esta arquitetura é aprovada quando:

1. Wessilon revisa e aceita o modelo de dados
2. As políticas de RLS refletem corretamente o controle de acesso desejado
3. A engine de testes permite migrar os 22 testes ativos sem reescrita pesada
4. O plano de migração do Firebase é viável
5. A estrutura LGPD é adequada para auditoria externa

---

## Apêndice A — Comandos SQL completos

Os scripts SQL completos serão entregues separadamente como arquivos `.sql` versionados no repositório, na Fase A do Roadmap. Este documento define a arquitetura; a implementação é entregue como código.

---

## Apêndice B — Histórico de versões

| Versão | Data | Autor | Mudanças |
|---|---|---|---|
| 1.0 | 2026-04-27 | Wessilon Marques + assistente IA | Documento inicial consolidado |

---

**Fim do Documento 2 de 3.**
**Próximo: 03_CORTEX_Roadmap_Execucao.md**

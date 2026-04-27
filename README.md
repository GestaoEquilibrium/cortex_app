# CORTEX_APP

> Sistema unificado de gestão clínica de neuropsicologia da Equilibrium

[![Status](https://img.shields.io/badge/status-em%20desenvolvimento-blue)]()
[![Fase](https://img.shields.io/badge/fase-A%20%E2%80%94%20Funda%C3%A7%C3%A3o-orange)]()
[![Conformidade](https://img.shields.io/badge/CFP-06%2F2019-green)]()

---

## O que é

O **CORTEX_APP** é a plataforma única de gestão clínica da **Equilibrium Med Center** (Uberlândia/MG), unificando:

- Cadastro e acompanhamento de pacientes em avaliação neuropsicológica
- Aplicação e correção de testes psicométricos (22 instrumentos ativos hoje, 60+ no catálogo completo)
- Geração de laudos conforme Resolução CFP 06/2019
- Agenda multi-profissional e workflow clínico completo
- Auditoria imutável de acessos para conformidade LGPD

O sistema sucede o `app.neuroequilibrium.com.br` (em produção desde 2024) e é desenvolvido seguindo **8 princípios inegociáveis** que preservam a referência clínica construída pela equipe.

---

## Stack tecnológica

| Camada | Tecnologia |
|---|---|
| Banco de dados | Supabase (PostgreSQL 15+) |
| Autenticação | Supabase Auth (e-mail + magic link) |
| Storage | Supabase Storage |
| Frontend | HTML + JavaScript (vanilla) + Tailwind CSS |
| Hospedagem | GitHub Pages |
| Geração de PDF | Engine própria (preserva modelos do responsável técnico) |

---

## Estrutura do repositório

```
cortex_app/
├── README.md                       Este arquivo
├── .gitignore                      Arquivos ignorados pelo Git
├── docs/                           Documentos de fundação do projeto
│   ├── 01_CORTEX_Especificacao_Funcional.md
│   ├── 02_CORTEX_Arquitetura_Tecnica.md
│   └── 03_CORTEX_Roadmap_Execucao.md
└── database/                       Scripts SQL versionados
    └── sprint_a1/                  Setup inicial e schema
        ├── 00_README.md
        ├── 01_extensions.sql
        ├── 02_enums_e_funcoes_auxiliares.sql
        ├── 03_tabelas_base.sql
        ├── 04_tabelas_clinicas.sql
        ├── 05_tabelas_testes.sql
        ├── 06_auditoria_e_triggers.sql
        ├── 07_seeds_catalogo.sql
        └── 08_validacao_setup.sql
```

À medida que o projeto avança, novas pastas serão adicionadas:
- `database/sprint_a2/` — Auth e RLS
- `frontend/` — Telas do sistema
- `instrumentos_schemas/` — Schemas JSON dos testes (Fase D)
- `modelos_relatorio/` — Templates de laudo

---

## Roadmap de execução

O projeto segue um plano de **5 fases sequenciais**:

| Fase | Nome | Duração | Status |
|---|---|---|---|
| **A** | Fundação técnica | 2 semanas | ⏳ Em andamento (Sprint A1 concluído) |
| **B** | Workflow textual (pacientes, anamnese, hipóteses) | 3 semanas | ⏸ Aguardando |
| **D** | Engine de testes (22 instrumentos ativos) | 5 semanas | ⏸ Aguardando |
| **C** | Agenda e workflow do paciente | 2 semanas | ⏸ Aguardando |
| **E** | Migração progressiva (50+ instrumentos restantes) | Contínua | ⏸ Aguardando |

Detalhamento completo em [`docs/03_CORTEX_Roadmap_Execucao.md`](docs/03_CORTEX_Roadmap_Execucao.md).

---

## Princípios inegociáveis

O projeto opera sob 8 princípios que precedem qualquer decisão técnica:

1. **Preservação dos modelos de relatório** — referência clínica construída ao longo dos anos
2. **Preservação da engine de correção atual** — lógica psicométrica validada permanece intacta
3. **Continuidade operacional durante a migração** — sistema atual segue em produção até virada final
4. **Zero alucinação clínica** — sistema nunca calcula nem infere dados; apenas armazena e organiza
5. **LGPD por padrão** — auditoria, RLS, retenção e backup como requisitos não negociáveis
6. **Continuidade do checklist em PDF** — prontuário físico permanece coexistindo
7. **Co-responsabilidade clínica Wessilon + aplicador** — todo paciente tem dois responsáveis
8. **Separação ética entre correção e laudo** — Corretor produz seções de testes, sem acesso ao laudo integrado

Detalhamento em [`docs/01_CORTEX_Especificacao_Funcional.md`](docs/01_CORTEX_Especificacao_Funcional.md).

---

## Conformidade

- **Resolução CFP 06/2019** — estrutura mínima do laudo psicológico
- **Resolução CFP 11/2018** — prontuário psicológico
- **Resolução CFP 09/2018** — avaliação psicológica
- **Lei 13.709/2018 (LGPD)** — base legal: prestação de serviço de saúde
- **Retenção mínima:** 5 anos após último atendimento (CFP)

---

## Equipe

**Responsável técnico:**
Wessilon Marques de Sousa
CRP 04/53832
Neuropsicólogo

**Instituição:**
Equilibrium Med Center Ltda
CNPJ 34.032.586/0001-98
Uberlândia/MG, Brasil

---

## Como contribuir

Este é um projeto institucional fechado. Contribuições externas não são aceitas neste momento. Em caso de dúvidas técnicas, entrar em contato pelos canais oficiais da Equilibrium.

---

## Licença

Todos os direitos reservados — Equilibrium Med Center Ltda.

O código fonte deste projeto é propriedade intelectual da Equilibrium e não é licenciado para uso, cópia, modificação ou distribuição sem autorização expressa por escrito.

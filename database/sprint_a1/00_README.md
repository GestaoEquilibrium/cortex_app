# CORTEX_APP — Sprint A1: Setup e Schema do Banco

**Fase A · Sprint 1 · Semana 1**
**Projeto Supabase:** `cortex-app` (URL: `cortex-app.supabase.co`)
**Objetivo:** criar todas as tabelas do CORTEX no Supabase, popular dados de catálogo, validar que o schema funciona.

---

## Pré-requisitos

1. **Projeto Supabase criado** com nome `cortex-app` na região `sa-east-1` (São Paulo)
2. **Senha do banco** salva em local seguro (gerenciador de senhas)
3. **Acesso ao SQL Editor** do Supabase (menu lateral, ícone `</>`)

---

## Como executar

Os arquivos estão **numerados em ordem de execução**. Faça assim:

1. Abra o **SQL Editor** do Supabase
2. Crie uma nova query (botão "New query")
3. Abra o arquivo `01_extensions.sql` no seu editor de texto
4. Copie todo o conteúdo
5. Cole no SQL Editor do Supabase
6. Clique em **RUN**
7. **Confira a saída**: deve aparecer "Success" ou similar
8. Repita para o próximo arquivo (`02_...`, `03_...`, etc.)

---

## Sequência de execução

| Ordem | Arquivo | O que faz | Tempo estimado |
|---|---|---|---|
| 1 | `01_extensions.sql` | Habilita extensões PostgreSQL (uuid-ossp, pgcrypto) | 5s |
| 2 | `02_enums_e_funcoes_auxiliares.sql` | Cria types ENUM e funções auxiliares de RLS | 10s |
| 3 | `03_tabelas_base.sql` | Cria tabelas de catálogo (convenios, cids, instrumentos) | 15s |
| 4 | `04_tabelas_clinicas.sql` | Cria tabelas clínicas (pacientes, anamneses, hipóteses, etc.) | 30s |
| 5 | `05_tabelas_testes.sql` | Cria tabelas de aplicações, respostas, correções, laudos, devolutivas | 30s |
| 6 | `06_auditoria_e_triggers.sql` | Cria tabela de auditoria + triggers de imutabilidade | 15s |
| 7 | `07_seeds_catalogo.sql` | Popula dados iniciais: convênios, instrumentos, alguns CIDs | 20s |
| 8 | `08_validacao_setup.sql` | Queries de validação para confirmar que tudo está ok | 5s |

**Tempo total estimado: 2-3 minutos.**

---

## ⚠️ Importante

- **Execute UM arquivo por vez.** Se algum der erro, PARE e me avise antes de continuar.
- **NÃO execute o `08_validacao_setup.sql` antes dos demais.** Ele assume que tudo já existe.
- **NÃO inclua RLS ainda.** As políticas de segurança vêm no Sprint A2 (próxima semana). Por enquanto, o banco está aberto para o "service role" do Supabase, o que é normal nesta fase.

---

## O que ainda NÃO está neste sprint

- Políticas de Row Level Security (RLS) → Sprint A2
- Autenticação de usuários → Sprint A2
- Tela de login → Sprint A2
- Schemas JSON dos testes (BAARS, WAIS, etc.) → Fase D
- Frontend → Fase B em diante

Este sprint é **só o esqueleto do banco**. Sem dados clínicos reais, sem usuários reais.

---

## Após executar tudo

Quando os 8 arquivos rodarem com sucesso, me avise. Vou:

1. Te pedir um print da tela "Database → Tables" do Supabase
2. Validar visualmente que as 18 tabelas estão lá
3. Iniciar o **Sprint A2** (autenticação + RLS)

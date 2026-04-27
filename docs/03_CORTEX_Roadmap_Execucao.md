# CORTEX — Roadmap de Execução

**Equilibrium Med Center Ltda · Neuropsicologia Clínica**
**Documento de Fundação 3 de 3**
**Versão 1.0 · 27 de abril de 2026**
**Responsável técnico:** Wessilon Marques de Sousa (CRP 04/53832)

---

## 0. Sumário executivo

Este documento define o plano de execução do CORTEX, organizado em 5 fases sequenciais (A → B → D → C → E), com sprints curtos, critérios objetivos de "pronto" e dependências explícitas entre fases. Total estimado: **3 a 4 meses** para sistema em produção com funcionalidades core, com Fase E (migração progressiva dos demais 50+ testes) executada de forma contínua após a virada.

---

## 1. Princípios de execução

**Princípio E1 — Continuidade operacional.** O `app.neuroequilibrium` continua em produção até a virada final. Nunca há janela em que a equipe clínica fique sem sistema.

**Princípio E2 — Fases independentes mas encadeadas.** Cada fase entrega valor próprio e tem critério claro de aceite. Apenas começamos a fase seguinte após o "pronto" da anterior.

**Princípio E3 — Sprints curtos com aprovação explícita.** Sprints de 1 a 2 semanas, com demonstração e aprovação ao fim de cada um. Nada avança sem o aceite do Wessilon.

**Princípio E4 — Ambiente de homologação separado da produção.** Toda nova funcionalidade é testada em ambiente de homologação com dados sintéticos antes de ir para produção.

**Princípio E5 — Migração de dados ao final, não no meio.** Os dados reais do Firebase só migram quando o CORTEX estiver completo e estável. Durante o desenvolvimento, dados de teste fictícios são usados.

**Princípio E6 — Documentação viva.** A cada sprint, os 3 documentos de fundação são atualizados conforme decisões surgem na implementação. O changelog formal registra cada mudança.

---

## 2. Visão geral das fases

| Fase | Nome | Duração estimada | Entrega principal |
|---|---|---|---|
| **Fase A** | Fundação técnica | 2 semanas | Supabase configurado, autenticação multi-perfil, esquema do banco, RLS funcional |
| **Fase B** | Workflow textual | 3 semanas | Pacientes, anamnese, hipóteses, relatório escolar plugados no banco |
| **Fase D** | Engine de testes | 5 semanas | 22 testes ativos migrados para o Supabase, motor genérico funcionando |
| **Fase C** | Agenda e workflow | 2 semanas | Sessões, atribuição clínica, status do paciente, devolutiva |
| **Fase E** | Migração progressiva | Contínua | Outros 50+ instrumentos do catálogo |

**Total Fases A→D→C:** 12 semanas (~3 meses)

---

## 3. Fase A — Fundação técnica

### 3.1 Objetivo

Construir a base técnica do CORTEX. Sem esta fase, nada funciona.

### 3.2 Entregas

1. **Projeto Supabase `cortex-equilibrium` criado**
2. **Esquema completo do banco** (todas as 18 tabelas do Documento 2)
3. **Autenticação Supabase Auth** com cinco perfis funcionando
4. **Políticas RLS** implementadas para cada tabela e perfil
5. **Triggers de auditoria** populando `auditoria_acessos` automaticamente
6. **Função `current_profissional_id()`** e auxiliares operacionais
7. **Tela de login** funcional, redirecionando por perfil
8. **Tela de gerenciamento de usuários** (Admin-clínico)
9. **Backup automático configurado**
10. **Ambiente de homologação separado**

### 3.3 Sprints

#### Sprint A1 — Setup e schema (semana 1)

**Tarefas:**
- Criar projeto Supabase
- Executar SQL de criação de todas as tabelas
- Inserir seed data (convênios, CIDs, instrumentos do catálogo)
- Configurar variáveis de ambiente
- Setup do repositório Git com nova estrutura

**Critério de aceite:** todas as tabelas criadas, dados de catálogo inseridos, queries de teste rodando.

#### Sprint A2 — Autenticação e RLS (semana 2)

**Tarefas:**
- Configurar Supabase Auth (e-mail + magic link)
- Criar primeiros usuários: Wessilon (admin-clínico) + administradora (admin-gestor)
- Implementar todas as políticas RLS
- Implementar triggers de auditoria
- Tela de login funcional (HTML + JS + Supabase Auth)
- Redirecionamento por perfil
- Tela básica de gerenciamento de usuários (CRUD)

**Critério de aceite:**
- Wessilon consegue logar e ver todos os pacientes (mesmo sem dados ainda)
- Admin-gestor consegue logar mas não consegue ver dados clínicos
- Tentativas de acesso indevido aparecem em `auditoria_acessos`
- Backup automático ativo

### 3.4 Riscos da Fase A

- **Complexidade do RLS:** políticas RLS são notoriamente difíceis de depurar. Mitigação: testes automatizados de cada política antes de avançar.
- **Conflito de UUID/auth.users:** o vínculo `profissionais.auth_user_id ↔ auth.users.id` precisa ser bem orquestrado. Mitigação: trigger automatizado de criação de profissional ao novo signup.

---

## 4. Fase B — Workflow textual

### 4.1 Objetivo

Migrar e expandir os módulos que lidam com texto e estrutura clínica básica do paciente: ficha cadastral, anamnese, hipóteses, relatório escolar.

### 4.2 Entregas

1. **Módulo de Pacientes completo** (CRUD + lista + busca + foto)
2. **Pasta do paciente** (tela central com barra de etapas)
3. **5 formulários de Anamnese** por faixa etária, plugados no banco
4. **Módulo de Hipóteses** com busca de CIDs
5. **Módulo de Relatório escolar**
6. **Vínculo paciente↔aplicador** (manual nesta fase, automático na Fase C)
7. **Indicadores de completude** funcionando

### 4.3 Sprints

#### Sprint B1 — Pacientes e pasta (semana 3)

**Tarefas:**
- Tela de cadastro de paciente (CRUD)
- Upload de foto para Supabase Storage
- Lista de pacientes com filtros e busca
- Pasta do paciente (cabeçalho + barra de etapas + painel lateral)
- RLS de pacientes em ação real (cada perfil vê o que deve)

**Critério de aceite:**
- Wessilon vê todos os pacientes
- Admin-gestor consegue cadastrar paciente
- Aplicador vê apenas pacientes vinculados a ele (vínculo criado manualmente nesta fase)
- Foto do paciente exibida no cabeçalho da pasta

#### Sprint B2 — Anamnese (semana 4)

**Tarefas:**
- Implementar 5 formulários por faixa etária
- Salvar progresso parcial em JSONB
- Indicador de completude por bloco
- Estados: rascunho_estagiario / em_andamento / concluida
- Aprovação por supervisor para estagiários

**Critério de aceite:**
- Wessilon ou aplicador consegue iniciar e concluir uma anamnese
- Estagiário consegue preencher em rascunho; supervisor aprova
- Completude calculada e exibida

#### Sprint B3 — Hipóteses, relatório escolar (semana 5)

**Tarefas:**
- Módulo de Hipóteses com busca de CIDs
- Módulo de Relatório escolar
- Importação opcional de PDF do relatório escolar
- Histórico de revisões

**Critério de aceite:**
- Aplicador consegue registrar hipóteses + CIDs sugeridos
- Relatório escolar registrado e visível

### 4.4 Riscos da Fase B

- **Dados sensíveis em JSONB:** consultas para relatórios podem ser mais lentas. Mitigação: índices GIN em campos críticos.
- **Migração das 5 anamneses existentes:** requer estrutura idêntica à do `app.neuroequilibrium`. Mitigação: extrair os 5 formulários atuais e converter para o formato novo, mantendo todos os campos.

---

## 5. Fase D — Engine de testes

### 5.1 Objetivo

Implementar a engine genérica de testes e migrar os 22 testes ativos hoje no `app.neuroequilibrium` (12 da Correção + 11 da Aplicação, descontadas duplicatas).

**Esta é a fase mais delicada do projeto.** Toca o coração do sistema atual e exige preservação rigorosa da lógica psicométrica validada.

### 5.2 Entregas

1. **Catálogo de instrumentos populado** com os 22 testes ativos
2. **Schemas JSON de itens, correção e normas** para cada um dos 22 testes
3. **Motor genérico de correção** validado contra a engine atual
4. **Tela de Aplicação** (modalidades online e presencial)
5. **Geração de link único** para resposta online do paciente
6. **Tela de Correção** com integração ao motor
7. **Geração de PDF de relatório individual** preservando layout Wessilon
8. **Tela de Fila do Corretor**
9. **Bateria de testes na pasta do paciente**
10. **Validação cruzada** (motor antigo × motor novo) com relatório de paridade

### 5.3 Sprints

#### Sprint D1 — Cadastro de instrumentos e schemas dos 3 prioritários (semana 6)

**Tarefas:**
- Inserir os 22 testes em `instrumentos_catalogo`
- Extrair schemas dos **3 prioritários (WAIS-III, WISC-IV, SRS-2)** do código atual
- Documentar cada schema em JSON validado
- Subir schemas para `instrumentos_schemas/` no repositório

**Critério de aceite:**
- 22 instrumentos cadastrados
- 3 schemas completos (itens, correção, normas) para WAIS-III, WISC-IV, SRS-2

#### Sprint D2 — Motor genérico (semana 7)

**Tarefas:**
- Implementar `correcao_engine.js` com leitura de schemas
- Funções: `calcularEscoresBrutos`, `aplicarNormas`, `calcularIndicesCompostos`, `classificarPorPercentil`
- Suporte a tipos de cálculo: soma_simples, soma_ponderada, com_inversoes, escalonado
- Suporte a normas por sexo/idade/escolaridade

**Critério de aceite:**
- Motor processa schema de teste e retorna resultados estruturados
- Testes unitários com casos conhecidos (ex: paciente fictício do WAIS-III com escores conhecidos retorna mesmo QIT/GAI)

#### Sprint D3 — Aplicação e respostas brutas (semana 8)

**Tarefas:**
- Tela de Aplicação na pasta do paciente
- Modalidade presencial: profissional digita respostas
- Modalidade online: gera link único, expira em 7 dias
- Página standalone para o paciente responder (sem login, validação por data de nascimento)
- Notificação ao profissional ao concluir
- Salvar todas as respostas em `respostas_brutas`

**Critério de aceite:**
- Profissional consegue aplicar SRS-2 presencial e dados ficam salvos
- Profissional gera link, paciente acessa, responde, profissional é notificado
- Respostas brutas no banco corretas

#### Sprint D4 — Correção e PDFs (semana 9)

**Tarefas:**
- Tela de Correção (acesso aplicador + corretor)
- Carrega respostas brutas e dispara motor genérico
- Permite ajustes manuais com justificativa
- Gera PDF do relatório individual preservando layout Wessilon (paleta azul, Calibri, tabelas coloridas)
- Salva PDF no Supabase Storage

**Critério de aceite:**
- Correção de WAIS-III retorna mesmo resultado do app.neuroequilibrium atual (validação cruzada)
- PDF gerado tem mesmo visual do PDF atual
- Corretor consegue corrigir teste sem ver anamnese/hipóteses

#### Sprint D5 — Fila do corretor e bateria (semana 10)

**Tarefas:**
- Tela exclusiva da Fila do Corretor (sem visão de pacientes)
- Filtros: instrumento, prazo, prioridade, aplicador solicitante
- Ao abrir teste: dados demográficos básicos + respostas + correção
- Campo de escrita da seção "Resultados" do laudo
- Tela de Bateria de testes na pasta do paciente

**Critério de aceite:**
- Corretor faz login, vê fila de testes, corrige, escreve seção de resultados
- Aplicador vê na pasta do paciente todos os testes corrigidos

### 5.4 Estratégia de validação cruzada

Para cada teste migrado, o protocolo é:

1. **Pegar dados reais de um paciente já avaliado** (com autorização)
2. **Rodar o motor antigo** (app.neuroequilibrium) → obter resultado A
3. **Rodar o motor novo** (CORTEX) → obter resultado B
4. **Comparar A com B**
5. **Diferenças >0.1% indicam bug** que precisa ser corrigido antes de avançar

Sem paridade comprovada, o teste não vai para produção.

### 5.5 Riscos da Fase D

- **Engine atual mal documentada:** o código atual pode ter regras tácitas não escritas em lugar nenhum. Mitigação: extrair schemas em sessões dedicadas com Wessilon revisando cada decisão.
- **Diferenças de arredondamento:** pequenas diferenças de cálculo podem dar números levemente diferentes. Mitigação: padronização explícita de regras de arredondamento.
- **Modelos de PDF complexos:** preservar layout exato com Calibri, paleta de cores e tabelas exige cuidado. Mitigação: usar templates DOCX como source of truth e converter para PDF apenas no final.

---

## 6. Fase C — Agenda e workflow do paciente

### 6.1 Objetivo

Implementar a agenda multi-profissional, automatizar a atribuição clínica na primeira sessão, e fechar o ciclo do workflow do paciente (status, devolutiva, entrega).

### 6.2 Entregas

1. **Módulo de Agenda completo** (semanal e mensal)
2. **Atribuição automática paciente↔aplicador na primeira sessão**
3. **Status do paciente** funcionando ponta a ponta
4. **Tela de Devolutiva** (exclusiva Wessilon)
5. **Marcação de entregue / pendente / observações**
6. **Workflow de transição entre estados** com auditoria
7. **Notificações operacionais básicas** (paciente pronto para devolutiva, etc.)

### 6.3 Sprints

#### Sprint C1 — Agenda (semana 11)

**Tarefas:**
- Visualização semanal e mensal da agenda
- CRUD de sessões
- Filtros por profissional, paciente, tipo
- Quando admin agenda primeira sessão de aplicação_testes, sistema cria automaticamente o vínculo `paciente↔aplicador`
- Marcar sessão como realizada / cancelada / falta

**Critério de aceite:**
- Admin-gestor agenda primeira sessão e vínculo é criado automaticamente
- Aplicador agora vê o paciente em sua lista
- Histórico de sessões aparece na pasta do paciente

#### Sprint C2 — Status e devolutiva (semana 12)

**Tarefas:**
- Lógica de transição de status do paciente (cadastrado → em_avaliacao → pronto_para_laudo → laudo_pronto → devolutiva_agendada → devolutiva_realizada → entregue/pendente)
- Tela de Devolutiva exclusiva Wessilon
- Botões de marcação (entregue / pendente)
- Campo obrigatório de observações em pendência
- Dashboard de Wessilon com lista de pendências e devolutivas marcadas

**Critério de aceite:**
- Aplicador conclui laudo, marca como pronto, aparece na lista de Wessilon
- Wessilon agenda devolutiva, realiza, marca entregue
- Casos pendentes aparecem com observações no dashboard

### 6.4 Riscos da Fase C

- **Conflitos de agenda:** dois profissionais em mesmo horário, mesma sala. Mitigação: validação de conflito antes de salvar sessão.
- **Vínculos ambíguos:** se um paciente tem mais de uma "primeira sessão" registrada, qual conta? Mitigação: regra explícita — o vínculo é criado na PRIMEIRA sessão de tipo `aplicacao_testes` agendada.

---

## 7. Fase E — Migração progressiva dos demais instrumentos

### 7.1 Objetivo

Após o CORTEX estar em produção com os 22 testes ativos, migrar progressivamente os demais ~40 instrumentos do catálogo Equilibrium.

### 7.2 Estratégia

Esta fase é **contínua e paralela à operação normal**. Não tem prazo fixo — depende da prioridade clínica de cada instrumento.

**Para cada novo instrumento:**

1. Wessilon (ou neuropsicólogo designado) preenche os 3 schemas JSON
2. Insere registro em `instrumentos_catalogo` com URLs dos schemas
3. Faz validação cruzada com o material de aplicação tradicional (manual)
4. Aprovação do Wessilon
5. Instrumento fica disponível no sistema

### 7.3 Priorização sugerida

Ordem sugerida baseada em volume de uso e importância clínica:

**Prioridade 1 (próximos 3 meses pós-virada):**
- BAARS-IV (TDAH adultos) — já está na Aplicação
- CAT-Q — já está na Aplicação
- BPA-2 (atenção)
- TEPIC-M-2 (memória visual)
- BDEFS (funções executivas adultos)

**Prioridade 2 (3-6 meses pós-virada):**
- TAVIS-4 (atenção visual infantil)
- TDE-II (desempenho escolar)
- TEACO/TEADI/TEALT (atenção complexa)
- ASRS-18 (TDAH rastreio OMS)
- BAI / BDI-II / EBADEP-A (humor/ansiedade)
- SCARED (já está na Correção, mas pode haver expansão)
- SNAP-IV (TDAH crianças)
- ETDAH-PAIS / ETCD

**Prioridade 3 (6-12 meses pós-virada):**
- Demais instrumentos do checklist (BAYLEY-III, IDADI ampliado, ADOS-2, etc.)

### 7.4 Critério para "instrumento pronto"

Um instrumento só é considerado pronto para uso clínico quando:

1. Schemas JSON completos e validados
2. Validação cruzada manual realizada com casos conhecidos
3. PDF de relatório individual no padrão Wessilon
4. Aprovação explícita do Wessilon
5. Documentação de fonte normativa registrada

---

## 8. Marcos críticos do projeto

### 8.1 Marco 1 — Aprovação dos documentos de fundação

**Quando:** após Wessilon revisar e aceitar os 3 documentos.
**Significado:** projeto sai do papel. Implementação começa.

### 8.2 Marco 2 — Fim da Fase A

**Quando:** semana 2.
**Significado:** infraestrutura técnica pronta. Wessilon faz primeiro login real no CORTEX.

### 8.3 Marco 3 — Fim da Fase B

**Quando:** semana 5.
**Significado:** primeiro paciente fictício cadastrado, anamnese preenchida, hipóteses registradas.

### 8.4 Marco 4 — Fim da Fase D (o mais importante)

**Quando:** semana 10.
**Significado:** os 22 testes ativos rodando no CORTEX com paridade comprovada. **Este é o ponto sem volta** — quando este marco for batido, o CORTEX é tecnicamente capaz de substituir o app.neuroequilibrium.

### 8.5 Marco 5 — Fim da Fase C

**Quando:** semana 12.
**Significado:** workflow completo do paciente operacional. Sistema pronto para receber dados reais.

### 8.6 Marco 6 — Virada (data a definir após Marco 5)

**Quando:** quando Wessilon e equipe declararem confiança total (período de homologação variável).
**Significado:**
- Migração dos dados reais do Firebase
- `app.neuroequilibrium` é congelado (apenas leitura para histórico)
- CORTEX assume domínio
- Equipe clínica começa a operar exclusivamente no CORTEX

### 8.7 Marco 7 — Marco 1 ano

**Quando:** 12 meses após a virada.
**Significado:** retrospectiva formal: o que funcionou, o que precisa evoluir, próximas prioridades.

---

## 9. Plano de homologação antes da virada

Antes do Marco 6 (virada), é mandatória uma fase de homologação:

### 9.1 Período de homologação

Mínimo de 3 semanas. Pode ser estendido conforme necessidade.

### 9.2 Atividades

1. **Operação paralela:** cada paciente cadastrado é registrado simultaneamente no app.neuroequilibrium e no CORTEX
2. **Comparação de resultados:** correções dos mesmos testes são feitas nos dois sistemas; resultados comparados
3. **Equipe clínica testa exaustivamente:** Wessilon, aplicadores, corretor, admin-gestor, estagiários — cada um usa o sistema simulando rotina
4. **Documentação de bugs e melhorias:** lista priorizada
5. **Aprovação formal:** somente Wessilon autoriza a virada

### 9.3 Critérios de saída da homologação

- Zero bugs críticos abertos
- Zero divergências em correções de teste
- Time clínico declara conforto operacional
- Backup do Firebase preservado
- Rollback documentado (procedimento para voltar ao app.neuroequilibrium em caso de emergência)

---

## 10. Equipe e responsabilidades

### 10.1 Responsabilidades clínicas (Wessilon)

- Validação de toda decisão clínica do projeto
- Revisão dos schemas de cada instrumento
- Validação cruzada das correções
- Aprovação dos modelos de relatório
- Aprovação da virada final
- Treinamento da equipe pós-virada

### 10.2 Responsabilidades técnicas

- Implementação do código
- Configuração de infraestrutura (Supabase, GitHub)
- Migração de dados
- Testes automatizados
- Documentação técnica

**Observação importante:** este projeto pode ser executado por uma combinação de Wessilon (decisões clínicas e revisão) + assistente IA (geração de código, schemas, documentação) + eventualmente desenvolvedor terceirizado para acelerar partes específicas.

---

## 11. Comunicação e governança

### 11.1 Cadência

- **Sprint review semanal:** demonstração do que foi feito, decisões pendentes
- **Revisão dos documentos de fundação:** mensal
- **Marcos:** comunicação explícita à equipe da clínica

### 11.2 Decisões fora do escopo

Qualquer mudança que altere:
- Princípios inegociáveis (Documento 1, Seção 0)
- Modelo de dados core (Documento 2, Seção 2)
- Ordem das fases

...exige reunião formal e atualização dos documentos de fundação com versionamento.

---

## 12. Riscos do projeto e mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|---|:---:|:---:|---|
| Wessilon sobrecarregado e atrasos no projeto | Alta | Alto | Sprints curtos com escopo realista; pausar em vez de acelerar |
| Diferenças sutis nas correções migradas | Média | Alto | Validação cruzada obrigatória |
| Modelo de relatório descaracterizado | Baixa | Crítico | Princípio 1 inegociável; Wessilon aprova cada PDF |
| Equipe clínica resiste à mudança | Média | Médio | Treinamento, homologação longa, virada gradual |
| Bug crítico pós-virada | Baixa | Alto | Rollback preparado; backup do Firebase preservado |
| LGPD não conforme | Baixa | Crítico | Auditoria externa antes do Marco 6 |

---

## 13. Próximos passos imediatos (após aceite dos 3 documentos)

1. **Wessilon revisa e aprova formalmente os documentos**
2. **Decisão sobre execução:**
   - Wessilon executa sozinho (com apoio do assistente IA)
   - Wessilon contrata desenvolvedor para acelerar
   - Misto: assistente IA gera código, dev terceirizado integra e testa
3. **Início da Fase A — Sprint A1** (criação do projeto Supabase e schema)
4. **Primeira reunião de sprint review** ao final da semana 1

---

## 14. Aceitação do roadmap

Este roadmap é aprovado quando:

1. Wessilon revisa e aceita as fases e durações
2. Os marcos críticos estão alinhados com a expectativa de prazo
3. A estratégia de homologação e virada é considerada segura
4. As responsabilidades estão claras

---

## Apêndice A — Cronograma visual

```
Semana:  1  2  3  4  5  6  7  8  9  10 11 12  ...  contínuo
Fase A:  ██ ██
Fase B:        ██ ██ ██
Fase D:                 ██ ██ ██ ██ ██
Fase C:                                ██ ██
Homolog:                                       ███
Virada:                                            ▼
Fase E:                                                ████████████████  (contínua)
```

---

## Apêndice B — Checklist de "Pronto para Virada" (Marco 6)

Antes de fazer a virada e migrar dados reais, todos os itens abaixo devem estar verde:

- [ ] Fases A, B, D e C 100% concluídas
- [ ] 22 testes ativos com paridade comprovada vs app.neuroequilibrium
- [ ] PDFs de relatório individual visualmente idênticos aos atuais
- [ ] Modelos de laudo final preservando padrão Wessilon
- [ ] Equipe clínica treinada (todos os 5+ profissionais)
- [ ] 3 semanas mínimas de homologação concluídas
- [ ] Zero bugs críticos abertos
- [ ] Backup do Firebase preservado
- [ ] Procedimento de rollback documentado
- [ ] Termo de consentimento LGPD revisado
- [ ] Wessilon autoriza explicitamente a virada
- [ ] Comunicação formal à equipe sobre data e procedimento
- [ ] Migração de dados reais executada e validada
- [ ] DNS de `app.neuroequilibrium` apontado para o CORTEX
- [ ] Sistema antigo congelado em modo somente-leitura

---

## Apêndice C — Histórico de versões

| Versão | Data | Autor | Mudanças |
|---|---|---|---|
| 1.0 | 2026-04-27 | Wessilon Marques + assistente IA | Documento inicial consolidado |

---

**Fim do Documento 3 de 3.**
**Conjunto de fundação completo: 01 + 02 + 03.**

**Após aceite formal por Wessilon Marques, o projeto CORTEX entra em execução pela Fase A — Sprint A1.**

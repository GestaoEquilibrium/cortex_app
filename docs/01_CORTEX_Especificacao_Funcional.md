# CORTEX — Especificação Funcional

**Equilibrium Med Center Ltda · Neuropsicologia Clínica**
**Documento de Fundação 1 de 3**
**Versão 1.0 · 27 de abril de 2026**
**Responsável técnico:** Wessilon Marques de Sousa (CRP 04/53832)
**CNPJ:** 34.032.586/0001-98

---

## 0. Princípios inegociáveis do projeto

Estes princípios precedem qualquer decisão técnica e não podem ser violados em nenhuma fase de execução.

**Princípio 1 — Preservação dos modelos de relatório.** Os modelos de laudo do Wessilon são referência clínica em Uberlândia e região. A migração para o CORTEX não pode alterar estrutura, formatação visual (Calibri, paleta azul institucional, tabelas coloridas por classificação), conteúdo narrativo padrão, ordem das seções, ou qualquer elemento dos modelos atuais. Qualquer mudança visual será apenas refinamento estético e exige aprovação explícita do Wessilon antes de ser implementada.

**Princípio 2 — Preservação da engine de correção atual.** Os 12 testes da Correção (WAIS-III, WISC-IV, SRS-2, Vineland 3, QCP-FC, RAVLT, BFP, FDT, SCARED, AQ-Adolescente, ETDAH-AD, IDADI) e os 11 testes da Aplicação que estão validados e em uso clínico permanecem com sua lógica de correção intacta. O CORTEX adiciona persistência em banco de dados, mas não reescreve nenhuma regra psicométrica já validada.

**Princípio 3 — Continuidade operacional durante a migração.** O `app.neuroequilibrium` atual continuará operacional até que o CORTEX esteja 100% testado e validado. A virada acontece apenas com confiança total da equipe clínica. Não haverá interrupção do atendimento.

**Princípio 4 — Zero alucinação clínica.** O sistema nunca calcula, infere ou preenche dados clínicos automaticamente. Apenas o profissional preenche resultados; o sistema apenas armazena, organiza e aplica regras de correção previamente validadas pelo Wessilon.

**Princípio 5 — LGPD por padrão.** Todos os dados são tratados como dados sensíveis de saúde. Auditoria de acessos, controle granular de permissões, retenção definida e backup regular são requisitos não negociáveis.

**Princípio 6 — Continuidade do checklist em PDF.** O checklist atual continua sendo gerado em PDF e impresso para o prontuário físico. A migração para o banco não substitui o prontuário físico, complementa-o.

**Princípio 7 — Co-responsabilidade clínica Wessilon + aplicador.** Todo paciente da Equilibrium tem como responsáveis clínicos: (a) Wessilon Marques, na condição de neuropsicólogo supervisor e responsável técnico pela qualidade dos laudos e devolutivas; (b) o neuropsicólogo aplicador atribuído na primeira sessão. Essa estrutura está refletida no modelo de dados e nas permissões: Wessilon vê todos os pacientes; cada aplicador vê apenas os pacientes a ele atribuídos.

**Princípio 8 — Separação ética entre correção e laudo.** O Corretor produz seções de resultados psicométricos, mas não tem acesso ao laudo integrado final. Quem assina o laudo é o neuropsicólogo aplicador (com supervisão técnica de Wessilon). Essa separação protege a responsabilidade ética da assinatura clínica conforme a Resolução CFP 06/2019.

---

## 1. Visão geral do CORTEX

O CORTEX é o sistema unificado de gestão clínica de neuropsicologia da Equilibrium. Resulta da fusão evolutiva entre o `app.neuroequilibrium.com.br` (sistema atual com correção e aplicação de testes) e o `cortex_pacientes` (sistema de ficha clínica do paciente). O nome final é **CORTEX**.

### 1.1 O que o CORTEX é

- Plataforma única de gestão de pacientes da Equilibrium
- Motor de correção e aplicação de testes neuropsicológicos
- Gerador de laudos com modelos preservados do Wessilon
- Sistema de agenda multi-profissional
- Repositório clínico estruturado para fins de relatório estatístico, auditoria e continuidade do cuidado

### 1.2 O que o CORTEX não é

- Não é prontuário eletrônico certificado pelo CFM
- Não é sistema financeiro (essa função é do Mais Equilibrium)
- Não é HRIS (essa função é do Infinity / SHIREQ)
- Não é sistema de telemedicina (não faz videoconferência)
- Não substitui o prontuário físico (continua coexistindo)

### 1.3 Integrações com sistemas existentes da Equilibrium

| Sistema | Tipo de integração | Direção |
|---|---|---|
| Mais Equilibrium | Sem integração inicial; pode evoluir para troca de dados de paciente | Bidirecional futura |
| Infinity / SHIREQ | Sem integração inicial; profissionais cadastrados separadamente em cada sistema | Independente |
| Ponto Digital Equilibrium | Sem integração; sistemas independentes | Independente |
| Claude Project "Gerador de Laudos 2" | Coexiste por período de transição; CORTEX pode exportar dados que alimentam o Project | Unidirecional CORTEX → Claude |

---

## 2. Perfis de usuário e permissões

O CORTEX possui cinco perfis de usuário, organizados em ordem decrescente de privilégio:

### 2.1 Admin-clínico (Wessilon)

Responsável técnico pela clínica e supervisor universal de todos os casos.

**Pode:**
- Ver todos os pacientes da clínica
- Ver todas as anamneses, hipóteses, testes, laudos e devolutivas
- Acessar dashboards estatísticos completos
- Aprovar laudos finalizados antes de liberação
- Realizar devolutivas de qualquer paciente
- Marcar laudo como entregue / não entregue / pendente
- Registrar observações em casos pendentes
- Gerenciar usuários do sistema
- Configurar parâmetros do sistema
- Exportar dados em Excel/CSV
- Auditar acessos e ações

**Quantidade prevista:** 1 (Wessilon)

### 2.2 Admin-gestor (administradora)

Responsável pela operação da agenda e alocação de casos. Não tem acesso clínico.

**Pode:**
- Cadastrar novos pacientes (dados administrativos)
- Ver agenda completa da clínica
- Marcar sessões de aplicação de testes
- Atribuir paciente ao neuropsicólogo aplicador na primeira sessão
- Reagendar e cancelar sessões
- Ver lista de pacientes (nomes e status, sem dados clínicos)
- Marcar sessões como realizadas
- Exportar relatórios de agenda

**Não pode:**
- Acessar anamneses, hipóteses, testes ou laudos
- Ver conteúdo clínico
- Gerar PDFs de laudo
- Gerenciar outros usuários
- Acessar dashboards clínicos

**Quantidade prevista:** 1

### 2.3 Neuropsicólogo aplicador

Profissional clínico que aplica, corrige e produz laudos.

**Pode:**
- Ver apenas pacientes atribuídos a ele
- Realizar anamnese
- Preencher hipóteses diagnósticas
- Preencher relatório escolar
- Aplicar testes (presencial ou online)
- Corrigir testes que ele mesmo aplicou
- Gerar relatórios PDF de testes individuais
- Escrever laudo final integrado
- Marcar paciente como "pronto para devolutiva"

**Não pode:**
- Ver pacientes de outros aplicadores
- Acessar dashboards estatísticos da clínica
- Gerenciar usuários
- Marcar laudos como entregues
- Aprovar laudos de estagiários sem ser supervisor

**Quantidade prevista:** 5 ou mais

### 2.4 Estagiário

Profissional em formação, sob supervisão obrigatória.

**Pode:**
- Ver pacientes do supervisor a quem está vinculado
- Preencher anamneses, hipóteses, dados de teste em modo rascunho
- Aplicar testes sob supervisão presencial

**Não pode:**
- Finalizar nenhum dado sem aprovação
- Gerar PDF final de laudo
- Acessar pacientes de outros supervisores
- Realizar devolutivas
- Modificar dados após aprovação

**Princípio operacional:** toda ação fica marcada como "pendente de aprovação". O supervisor recebe notificação e revisa antes de consolidar.

### 2.5 Corretor

Profissional de apoio técnico para correções e seções de resultados.

**Pode:**
- Ver fila de testes a corrigir (interface por testes, não por pacientes)
- Acessar dados brutos dos testes aplicados
- Executar correção
- Gerar PDF de relatório individual
- Escrever a seção "Resultados dos Testes" do laudo
- Ver dados demográficos básicos do paciente

**Não pode:**
- Ver anamnese
- Ver hipóteses diagnósticas
- Ver laudo final integrado
- Ver conclusão diagnóstica nem CID
- Editar laudo após integração pelo aplicador
- Gerenciar usuários ou sistema

### 2.6 Matriz de permissões resumida

| Recurso | Admin-clínico | Admin-gestor | Neuro-aplicador | Estagiário | Corretor |
|---|:---:|:---:|:---:|:---:|:---:|
| Ver todos os pacientes | Sim | Lista (s/ clínica) | Apenas seus | Apenas do supervisor | Não |
| Cadastrar paciente | Sim | Sim | Sim | Não | Não |
| Atribuir aplicador | Sim | Sim | Não | Não | Não |
| Anamnese | Ver/editar | Não | Ver/editar | Rascunho | Não vê |
| Hipóteses | Ver/editar | Não | Ver/editar | Rascunho | Não vê |
| Aplicar testes | Sim | Não | Sim | Sob supervisão | Não |
| Corrigir testes | Sim | Não | Sim | Sob supervisão | Sim |
| Ver dados brutos de testes | Todos | Não | Apenas seus pacientes | Apenas supervisor | Todos |
| Escrever seção de resultados | Sim | Não | Sim | Rascunho | Sim |
| Escrever laudo integrado | Sim | Não | Sim | Rascunho | Não |
| Ver laudo integrado | Sim | Não | Apenas seus pacientes | Apenas supervisor | Não |
| Marcar pronto para devolutiva | Sim | Não | Sim (seus pacientes) | Não | Não |
| Realizar devolutiva | Sim | Não | Não | Não | Não |
| Marcar entregue | Sim | Não | Não | Não | Não |
| Dashboards estatísticos | Sim | Apenas agenda | Não | Não | Apenas testes |
| Gerenciar usuários | Sim | Não | Não | Não | Não |
| Configurar sistema | Sim | Não | Não | Não | Não |

---

## 3. Modelo de atribuição clínica

### 3.1 Regra fundamental

**Todo paciente tem dois responsáveis clínicos simultâneos:**
1. Wessilon Marques — responsável técnico universal (vínculo automático e permanente)
2. Neuropsicólogo aplicador — atribuído pela Admin-gestor na primeira sessão

### 3.2 Fluxo de atribuição

1. Paciente é cadastrado no CORTEX (Admin-gestor ou Admin-clínico)
2. Admin-gestor abre a agenda e identifica disponibilidade dos neuropsicólogos
3. Admin-gestor agenda a primeira sessão escolhendo o profissional
4. **No momento desse agendamento, o sistema cria automaticamente o vínculo paciente↔aplicador**
5. A partir desse momento, o aplicador passa a ver o paciente em sua lista
6. Wessilon já tinha o paciente em sua lista desde o cadastro

### 3.3 Reatribuição

Pode ser feita pelo Admin-clínico ou Admin-gestor. Preserva todos os dados clínicos. Apenas o vínculo de visibilidade muda. O histórico de quem aplicou cada teste é mantido para auditoria.

### 3.4 Estagiários

Vinculados a um supervisor (sempre um neuropsicólogo aplicador). Veem os pacientes do supervisor com permissões reduzidas. Vinculação feita pelo Admin-clínico.

---

## 4. Estrutura de telas e fluxos

### 4.1 Tela de login

Após autenticação, redireciona conforme o perfil:
- Admin-clínico → Dashboard executivo
- Admin-gestor → Agenda do dia
- Neuropsicólogo aplicador → Lista de seus pacientes
- Estagiário → Lista de pacientes do supervisor (modo leitura)
- Corretor → Fila de testes a corrigir

### 4.2 Dashboard executivo (Admin-clínico)

KPIs no topo: pacientes ativos, avaliações em andamento, laudos prontos para entrega, laudos pendentes, sessões hoje.

Gráficos: volume de avaliações por mês, distribuição por convênio, faixa etária, hipótese diagnóstica.

Listas: pacientes prontos para devolutiva, laudos pendentes, alertas operacionais.

### 4.3 Agenda (Admin-gestor e Admin-clínico)

Visualização semanal e mensal da agenda da clínica. Cada compromisso mostra paciente, profissional, tipo de sessão.

Ações: criar sessão, editar, marcar como realizada, cancelar, reagendar.

### 4.4 Lista de pacientes

Varia por perfil. Cada paciente mostra: foto, nome, idade, status, aplicador responsável, última sessão.

### 4.5 Pasta do paciente

Tela central do CORTEX, inspirada na estrutura visual atual do `cortex_pacientes`.

**Cabeçalho fixo:** foto, nome, idade, data de nascimento, convênio, aplicador responsável, botões rápidos.

**Barra de etapas:** Anamnese · Hipóteses · Checklist · Bateria de testes · Correção · Laudo · Devolutiva. Cada etapa indica seu status.

**Painel lateral esquerdo:** dados administrativos resumidos, datas, próximas sessões.

**Painel central:** abas que mudam conforme a etapa selecionada.

### 4.6 Anamnese

Cinco formulários por faixa etária (já existentes no app.neuroequilibrium):
- Primeira infância (0–6 anos)
- Segunda infância (6–12 anos)
- Adolescência (12–18 anos)
- Adulto (18–50 anos)
- Idoso (50+ anos)

Dividida em blocos: identificação, queixa e histórico, desenvolvimento, contexto familiar, histórico escolar, saúde e medicações, social e emocional, outros profissionais. Indicador de completude no topo.

### 4.7 Hipóteses diagnósticas

Formulário separado da anamnese:
- Hipóteses iniciais (texto livre)
- CIDs sugeridos (busca por código)
- Justificativa clínica
- Plano de avaliação (instrumentos sugeridos)

### 4.8 Relatório escolar

Formulário estruturado com dados da escola, professor, desempenho acadêmico, comportamento, relacionamento, observações.

### 4.9 Checklist

**Mantém o comportamento atual do app.neuroequilibrium:**
- Tabela de instrumentos por faixa etária
- Marcação dos instrumentos a aplicar
- Geração de PDF para impressão e arquivo no prontuário físico

**Novidade:** os instrumentos selecionados ficam registrados no banco e abrem automaticamente uma "pasta" para cada teste na pasta do paciente.

### 4.10 Bateria de testes

Lista dos testes selecionados. Cada teste mostra: nome, status, aplicador, data de aplicação, botões de ação (Aplicar agora, Enviar link, Corrigir, Gerar PDF).

### 4.11 Aplicação de testes

**Modalidade A — Resposta online pelo paciente:**
- Sistema gera link único com expiração configurável (padrão: 7 dias)
- Paciente acessa o link, identifica-se com data de nascimento
- Paciente responde os itens
- Apenas as respostas brutas são salvas no banco
- Nenhum cálculo, nenhum PDF é gerado neste momento
- Profissional é notificado quando o paciente conclui

**Modalidade B — Aplicação presencial pelo profissional:**
- Profissional digita as respostas no sistema
- Apenas dados brutos são salvos
- Nenhum cálculo automático

A regra "salvar apenas dados brutos" resolve o problema atual de erros gerados durante a resposta. As regras de correção são aplicadas apenas no momento de gerar o relatório.

### 4.12 Correção de testes

Acessível pelo neuropsicólogo aplicador e pelo Corretor.

A interface:
- Carrega as respostas brutas do banco
- Aplica as regras de correção do instrumento (preservadas do app.neuroequilibrium)
- Calcula escores ponderados, percentis, classificações
- Permite ajuste manual com registro de justificativa
- Gera o PDF do relatório individual

**O PDF mantém o layout atual do app.neuroequilibrium**, validado pela equipe.

### 4.13 Laudo

Estrutura conforme Resolução CFP 06/2019:

1. Identificação
2. Demanda / Queixa
3. Procedimentos
4. Resultados (pode ser preenchida pelo Corretor)
5. Análise / Discussão
6. Conclusão / Hipótese diagnóstica + CID
7. Recomendações
8. Encaminhamentos
9. Referências
10. Identificação do profissional + assinatura

**O modelo do laudo (Calibri, paleta azul, tabelas coloridas) é preservado integralmente do modelo Wessilon.**

O sistema oferece:
- Importação automática de dados já preenchidos (anamnese, hipóteses, resultados)
- Geração de tabelas de escores formatadas conforme o padrão Wessilon
- Verificação de consistência (checklist CFP)
- Exportação em DOCX e PDF

### 4.14 Devolutiva

Tela exclusiva do Admin-clínico (Wessilon).

Mostra:
- Lista de pacientes prontos para devolutiva
- Acesso completo ao laudo integrado
- Botão "marcar como realizada"
- Botão "marcar laudo como entregue"
- Botão "marcar como pendente" → abre campo de observações obrigatório

### 4.15 Fila de correção (Corretor)

Tela exclusiva do perfil Corretor.

Mostra:
- Lista de testes pendentes (todos os pacientes da clínica)
- Filtros: instrumento, prazo, prioridade, aplicador solicitante
- Ao abrir um teste: dados demográficos básicos, instrumento, respostas brutas
- Ferramenta de correção
- Campo de escrita da seção "Resultados"
- Status: em correção / corrigido / aguardando integração

---

## 5. Workflow do paciente (estados e transições)

```
[Cadastrado]
    ↓ (Admin-gestor agenda primeira sessão e atribui aplicador)
[Em avaliação]
    ↓ (todos os testes da bateria foram corrigidos)
[Pronto para laudo]
    ↓ (aplicador conclui o laudo integrado)
[Laudo pronto]
    ↓ (admin agenda devolutiva)
[Devolutiva agendada]
    ↓ (Wessilon realiza a devolutiva)
[Devolutiva realizada]
    ↓ (Wessilon clica "marcar entregue")
[Entregue] ← caso de sucesso
    OU
[Pendente] ← caso de não entrega, com observação
```

Cada transição registra: quem fez, quando, observações eventuais. Esse log é base para auditoria e dashboards.

---

## 6. Regras de negócio críticas

### 6.1 Persistência de dados de teste

**Regra:** o sistema salva apenas dados brutos no momento da resposta/aplicação.

**Justificativa:** as regras de correção podem mudar (atualizações normativas, correção de bugs, ajustes clínicos). Salvar apenas dados brutos permite recalcular qualquer teste a qualquer momento. Resolve o problema atual de "PDFs com erro" — porque os cálculos são refeitos sob demanda, não congelados em PDF.

### 6.2 Geração de PDF

**Regra:** PDFs são gerados sob demanda, não armazenados como fonte de verdade.

**Exceção:** o PDF do checklist é gerado e arquivado no prontuário físico (continuidade do processo atual).

### 6.3 Imutabilidade pós-entrega

**Regra:** após laudo marcado como "entregue", os dados clínicos ficam congelados. Alteração posterior precisa ser registrada como "errata" com justificativa, sem sobrescrever o original.

### 6.4 Auditoria

**Regra:** todas as operações de leitura e escrita em dados clínicos são logadas com: usuário, timestamp, ação, paciente_id, registro_id. Log imutável, acessível apenas ao Admin-clínico.

### 6.5 Backup

**Regra:** Supabase realiza backup automático no plano pago. Adicionalmente, o Admin-clínico pode exportar backup completo em JSON a qualquer momento.

### 6.6 Retenção

**Regra:** dados clínicos retidos por no mínimo 5 anos após o último atendimento (CFP). Pacientes inativos por 5+ anos podem ser arquivados (movidos para tabela de histórico).

---

## 7. Os 22 testes ativos hoje (escopo da Fase D)

### 7.1 Correção (12 testes — interface profissional)

| Instrumento | Faixa etária | Domínio |
|---|---|---|
| WAIS-III | 16–89 anos | Inteligência |
| WISC-IV | 6–16 anos | Inteligência |
| SRS-2 | 2,5–65 anos | TEA |
| Vineland 3 | 3–90 anos | Comportamento adaptativo |
| QCP-FC | 18+ | Personalidade |
| RAVLT | 10–80+ | Memória auditivo-verbal |
| BFP | Adultos | Personalidade |
| FDT | 6–90 anos | Funções executivas |
| SCARED | 7–18 anos | Ansiedade |
| AQ-Adolescente | 12–15 anos | TEA |
| ETDAH-AD | 12–87 anos | TDAH |
| IDADI | 4–72 meses | Desenvolvimento infantil |

### 7.2 Aplicação (11 testes — interface online ao paciente)

| Instrumento | Faixa etária | Domínio |
|---|---|---|
| SRS-2 | 2,5–65 anos | TEA |
| RAADS-R | 16–90 anos | TEA |
| Vineland 3 | 3–90 anos | Comportamento adaptativo |
| CAT-Q | 16–90 anos | Camuflagem TEA |
| QCP-FC | 18+ | Personalidade |
| QA 16+ | 16+ | TEA |
| EQ-15 | Adultos | Empatia |
| AQ-Adolescente | 12–15 anos | TEA |
| BAARS-IV | 18+ | TDAH |
| ASSQ | 7–16 anos | TEA |
| ETDAH-AD | 12–87 anos | TDAH |

### 7.3 Total do catálogo Equilibrium

- Pré-Escolar: 20 instrumentos
- Escolar: 43 instrumentos
- Adultos: 30 instrumentos
- Total único: aproximadamente 60+ instrumentos

A migração progressiva é responsabilidade da Fase E.

---

## 8. Modelos de relatório (preservação)

### 8.1 Padrão visual Wessilon

**Tipografia:** Calibri 11pt corpo, 14pt títulos, 12pt subtítulos.

**Paleta:**
- Azul institucional: `#1F4E79` (títulos principais)
- Azul claro: `#2E75B6` (subtítulos e tabelas)
- Borda de tabela: `#F3F3F3`

**Sistema de classificação por cor (4 níveis):**
- Superior: fundo `#D5F5E3`, texto `#006100`
- Médio: fundo `#D6EAF8`, texto `#1F3864` (negrito itálico)
- Médio Inferior: fundo `#FFF2CC`, texto `#BF8F00`
- Inferior: fundo `#FFC7CE`, texto `#9C0006`

**Estrutura de seção por índice (WAIS/WISC):**
1. Tabela com escores ponderados, percentil, classificação
2. Parágrafo conciso (~5 linhas):
   - Resultado geral
   - Pontos fortes (com significado clínico)
   - Pontos fracos (com significado clínico)
   - Fechamento integrativo
3. Subtestes na tabela não são repetidos no parágrafo
4. Cada teste analisado isoladamente; integração apenas na síntese final

### 8.2 Regra GAI/ICG (permanente)

Sempre que houver discrepância no WAIS-III ou WISC-IV, calcular GAI usando subtestes nucleares (ICV: Vocabulário + Semelhanças + Informação; IOP: Cubos/Completar Figuras + Raciocínio Matricial), comparar QIT vs GAI e interpretar heterogeneidade considerando ambos.

Fontes: Tulsky, Saklofske, Chelune et al. (2003); Prifitera, Weiss & Saklofske (2005); Flanagan & Kaufman (2009) para WISC-IV.

### 8.3 Conformidade CFP

Os modelos seguem a Resolução CFP 06/2019, com 10 seções obrigatórias. O sistema valida a presença de cada seção antes de permitir finalização.

---

## 9. Conformidade legal e ética

### 9.1 LGPD

- Base legal de tratamento: execução de contrato de prestação de serviço de saúde + consentimento expresso
- Dados pessoais sensíveis: dados de saúde
- Direitos do titular: acesso, retificação, anonimização, portabilidade, eliminação
- Encarregado (DPO): a definir (provavelmente Wessilon)
- Termo de consentimento: revisão obrigatória do termo atual

### 9.2 CFP

- Resolução CFP 06/2019: estrutura mínima do laudo
- Resolução CFP 11/2018: prontuário psicológico
- Resolução CFP 09/2018: avaliação psicológica
- Retenção mínima: 5 anos após último atendimento

### 9.3 Auditoria

Todo acesso e modificação são logados. Logs imutáveis, acessíveis apenas ao Admin-clínico. Comprova cadeia de custódia em caso de processo ético ou judicial.

---

## 10. Aceitação e validação

Esta especificação é aprovada quando:

1. Wessilon Marques revisa e aceita formalmente o documento
2. Os 8 princípios inegociáveis estão alinhados com a prática clínica
3. Os 5 perfis refletem a estrutura real da equipe
4. O fluxo de atribuição reflete a operação atual
5. As 15 telas e seus comportamentos estão claros e completos

**Após aceitação, esta especificação se torna o contrato funcional do projeto. Mudanças posteriores exigem registro formal (changelog) e re-aprovação.**

---

## Apêndice A — Glossário

- **Aplicador:** neuropsicólogo responsável por aplicar e corrigir os testes de um paciente
- **Bateria de testes:** conjunto de instrumentos selecionados no checklist
- **CID:** Classificação Internacional de Doenças (CID-11 e DSM-5-TR aceitos)
- **CFP:** Conselho Federal de Psicologia
- **Corretor:** perfil de apoio técnico para correção de testes
- **Devolutiva:** sessão final em que o resultado é apresentado ao paciente / responsáveis
- **GAI:** General Ability Index (Índice de Capacidade Geral)
- **ICG:** sinônimo de GAI em alguns contextos
- **LGPD:** Lei Geral de Proteção de Dados (Lei 13.709/2018)
- **RLS:** Row Level Security — mecanismo Supabase de controle de linha
- **TEA:** Transtorno do Espectro Autista
- **TDAH:** Transtorno do Déficit de Atenção e Hiperatividade

---

## Apêndice B — Histórico de versões

| Versão | Data | Autor | Mudanças |
|---|---|---|---|
| 1.0 | 2026-04-27 | Wessilon Marques + assistente IA | Documento inicial consolidado |

---

**Fim do Documento 1 de 3.**
**Próximo: 02_CORTEX_Arquitetura_Tecnica.md**

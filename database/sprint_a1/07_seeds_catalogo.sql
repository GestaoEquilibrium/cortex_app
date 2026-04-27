-- ============================================================================
-- CORTEX_APP — Sprint A1 — Arquivo 07 de 08
-- Seeds do catálogo (dados iniciais)
-- ============================================================================
-- Popula as tabelas de referência:
--  - convenios: GNDI (TEA), UNIMED (ABA), Particular
--  - instrumentos_catalogo: 22 testes ativos hoje + 3 prioritários para Fase E
--  - cids: principais CID-11 e DSM-5-TR usados na Equilibrium
-- ============================================================================

-- ============================================================================
-- CONVÊNIOS
-- ============================================================================
-- Particular
INSERT INTO convenios (nome, tipo_pacote, ativo) VALUES
    ('Particular', NULL, true)
ON CONFLICT (nome) DO NOTHING;

-- GNDI (todos pacotes TEA)
INSERT INTO convenios (nome, operadora, tipo_pacote, codigo_procedimento, ativo) VALUES
    ('GNDI - Psico TEA', 'GNDI', 'TEA', '60010126', true),
    ('GNDI - Fono TEA', 'GNDI', 'TEA', '61010073', true),
    ('GNDI - TO TEA', 'GNDI', 'TEA', '62010123', true),
    ('GNDI - PSM TEA', 'GNDI', 'TEA', '60010371', true),
    ('GNDI - Neuro TEA', 'GNDI', 'TEA', '60010363', true),
    ('GNDI - Psicoped TEA', 'GNDI', 'TEA', '60010150', true)
ON CONFLICT (nome) DO NOTHING;

-- UNIMED (ABA individual)
INSERT INTO convenios (nome, operadora, tipo_pacote, codigo_procedimento, ativo) VALUES
    ('UNIMED - ABA 50005103', 'UNIMED', 'ABA', '50005103', true),
    ('UNIMED - ABA 50005189', 'UNIMED', 'ABA', '50005189', true),
    ('UNIMED - ABA 50005170', 'UNIMED', 'ABA', '50005170', true)
ON CONFLICT (nome) DO NOTHING;

-- ============================================================================
-- INSTRUMENTOS DO CATÁLOGO — 12 testes da CORREÇÃO atual
-- ============================================================================

INSERT INTO instrumentos_catalogo (
    sigla, nome_completo, o_que_avalia,
    faixa_etaria_min_meses, faixa_etaria_max_meses, faixa_etaria_label,
    dominio_principal, autores, editora,
    permite_aplicacao_online, permite_correcao_sistema,
    ativo, categoria, ordem_categoria
) VALUES
-- Inteligência
('WAIS-III', 'Wechsler Adult Intelligence Scale - 3rd Edition',
 'Avaliação de inteligência adulta com 11 subtestes',
 192, 1068, '16-89 anos',
 'inteligencia', 'David Wechsler', 'Casa do Psicólogo',
 false, true, true, 'Inteligência', 1),

('WISC-IV', 'Wechsler Intelligence Scale for Children - 4th Edition',
 'Avaliação de inteligência infantil/juvenil',
 72, 192, '6-16 anos',
 'inteligencia', 'David Wechsler', 'Casa do Psicólogo',
 false, true, true, 'Inteligência', 2),

-- TEA
('SRS-2', 'Social Responsiveness Scale - Second Edition',
 'Reciprocidade social e identificação de TEA',
 30, 780, '2,5-65 anos',
 'tea', 'John N. Constantino', 'WPS',
 true, true, true, 'TEA', 1),

('AQ-Adolescente', 'Autism Spectrum Quotient - Adolescent',
 'Rastreio de traços autistas em adolescentes',
 144, 180, '12-15 anos',
 'tea', 'Simon Baron-Cohen', 'ARC',
 true, true, true, 'TEA', 2),

-- Comportamento adaptativo
('Vineland-3', 'Vineland Adaptive Behavior Scales - 3rd Edition',
 'Comportamento adaptativo: comunicação, socialização, AVDs',
 36, 1080, '3-90 anos',
 'comportamento_adaptativo', 'Sparrow, Cicchetti, Saulnier', 'Pearson',
 true, true, true, 'Comportamento adaptativo', 1),

-- Personalidade
('QCP-FC', 'Questionário Clínico de Personalidade - Forma C',
 'Avaliação clínica de traços de personalidade',
 216, NULL, '18+ anos',
 'personalidade', NULL, 'Vetor',
 true, true, true, 'Personalidade', 1),

('BFP', 'Bateria Fatorial de Personalidade',
 'Cinco grandes fatores: Neuroticismo, Extroversão, Socialização, Realização, Abertura',
 216, NULL, 'Adultos',
 'personalidade', 'Nunes, Hutz, Nunes', 'Casa do Psicólogo',
 false, true, true, 'Personalidade', 2),

-- Memória
('RAVLT', 'Rey Auditory Verbal Learning Test',
 'Memória auditivo-verbal: codificação, evocação imediata, retardada e reconhecimento',
 120, NULL, '10-80+ anos',
 'memoria', 'André Rey', NULL,
 false, true, true, 'Memória', 1),

-- Funções executivas
('FDT', 'Five Digit Test (Teste dos Cinco Dígitos)',
 'Funções executivas: atenção, leitura, processamento, flexibilidade',
 72, 1080, '6-90 anos',
 'funcoes_executivas', 'Manuel Sedó', 'Hogrefe',
 false, true, true, 'Funções executivas', 1),

-- Ansiedade
('SCARED', 'Screen for Child Anxiety Related Emotional Disorders',
 'Rastreio de transtornos de ansiedade em crianças e adolescentes',
 84, 216, '7-18 anos',
 'ansiedade', 'Boris Birmaher', 'Domínio público',
 true, true, true, 'Humor e Ansiedade', 1),

-- TDAH
('ETDAH-AD', 'Escala de TDAH para Adolescentes e Adultos',
 'Rastreio e dimensionamento de sintomas de TDAH',
 144, 1044, '12-87 anos',
 'tdah', NULL, 'Vetor',
 true, true, true, 'TDAH', 1),

-- Desenvolvimento infantil
('IDADI', 'Inventário Dimensional de Avaliação do Desenvolvimento Infantil',
 'Rastreio de desenvolvimento em primeira e segunda infância',
 4, 72, '4-72 meses',
 'desenvolvimento_infantil', 'Gomes, Bandeira et al.', 'Hogrefe',
 false, true, true, 'Desenvolvimento Infantil', 1)
ON CONFLICT (sigla) DO NOTHING;

-- ============================================================================
-- INSTRUMENTOS DO CATÁLOGO — Testes da APLICAÇÃO online (que não estavam na lista acima)
-- ============================================================================

INSERT INTO instrumentos_catalogo (
    sigla, nome_completo, o_que_avalia,
    faixa_etaria_min_meses, faixa_etaria_max_meses, faixa_etaria_label,
    dominio_principal, autores,
    permite_aplicacao_online, permite_correcao_sistema,
    ativo, categoria, ordem_categoria
) VALUES
('RAADS-R', 'Ritvo Autism Asperger Diagnostic Scale - Revised',
 'Rastreio de TEA em adultos',
 192, 1080, '16-90 anos',
 'tea', 'Riva Ariella Ritvo',
 true, true, true, 'TEA', 3),

('CAT-Q', 'Camouflaging Autistic Traits Questionnaire',
 'Camuflagem de traços autistas (relevante em adultos, mulheres)',
 192, 1080, '16-90 anos',
 'tea', 'Hull, Petrides, Mandy',
 true, true, true, 'TEA', 4),

('QA 16+', 'Questionário do Adulto - 16+ anos',
 'Inventário sobre comportamento autista em adultos',
 192, NULL, '16+ anos',
 'tea', NULL,
 true, true, true, 'TEA', 5),

('EQ-15', 'Empathy Quotient - 15 itens',
 'Cota de empatia (versão reduzida)',
 216, NULL, 'Adultos',
 'empatia', 'Simon Baron-Cohen',
 true, true, true, 'TEA', 6),

('BAARS-IV', 'Barkley Adult ADHD Rating Scale-IV',
 'TDAH adultos: sintomas atuais e na infância',
 216, NULL, '18+ anos',
 'tdah', 'Russell Barkley',
 true, true, true, 'TDAH', 2),

('ASSQ', 'Autism Spectrum Screening Questionnaire',
 'Rastreio de TEA em crianças e adolescentes',
 84, 192, '7-16 anos',
 'tea', 'Stephan Ehlers, Christopher Gillberg',
 true, true, true, 'TEA', 7)
ON CONFLICT (sigla) DO NOTHING;

-- ============================================================================
-- CIDs MAIS USADOS NA EQUILIBRIUM
-- ============================================================================
-- Lista parcial. CIDs adicionais podem ser inseridos via interface administrativa.

INSERT INTO cids (id, versao, titulo, descricao, capitulo) VALUES
-- TEA
('6A02', 'CID-11', 'Transtorno do Espectro do Autismo',
 'Característica comum: déficits persistentes na comunicação social e interações sociais; padrões restritos e repetitivos de comportamento, interesses ou atividades.',
 'Transtornos do desenvolvimento neurológico'),

('F84.0', 'DSM-5-TR', 'Transtorno do Espectro Autista',
 'Critérios DSM-5-TR para TEA com especificadores de gravidade nos domínios de comunicação social e comportamentos restritos/repetitivos.',
 'Transtornos do neurodesenvolvimento'),

-- TDAH
('6A05.0', 'CID-11', 'Transtorno de Déficit de Atenção e Hiperatividade, apresentação predominantemente desatenta',
 NULL,
 'Transtornos do desenvolvimento neurológico'),

('6A05.1', 'CID-11', 'Transtorno de Déficit de Atenção e Hiperatividade, apresentação predominantemente hiperativa-impulsiva',
 NULL,
 'Transtornos do desenvolvimento neurológico'),

('6A05.2', 'CID-11', 'Transtorno de Déficit de Atenção e Hiperatividade, apresentação combinada',
 NULL,
 'Transtornos do desenvolvimento neurológico'),

('F90.0', 'DSM-5-TR', 'TDAH apresentação predominantemente desatenta',
 NULL,
 'Transtornos do neurodesenvolvimento'),

('F90.1', 'DSM-5-TR', 'TDAH apresentação predominantemente hiperativa/impulsiva',
 NULL,
 'Transtornos do neurodesenvolvimento'),

('F90.2', 'DSM-5-TR', 'TDAH apresentação combinada',
 NULL,
 'Transtornos do neurodesenvolvimento'),

-- Deficiência intelectual
('6A00', 'CID-11', 'Transtornos do Desenvolvimento Intelectual',
 'Grupo de condições caracterizadas por funcionamento intelectual significativamente abaixo da média.',
 'Transtornos do desenvolvimento neurológico'),

('F70', 'DSM-5-TR', 'Deficiência Intelectual Leve',
 NULL,
 'Transtornos do neurodesenvolvimento'),

('F71', 'DSM-5-TR', 'Deficiência Intelectual Moderada',
 NULL,
 'Transtornos do neurodesenvolvimento'),

-- Aprendizagem
('6A03', 'CID-11', 'Transtorno do Desenvolvimento da Aprendizagem',
 'Dificuldades persistentes na aquisição de habilidades acadêmicas (leitura, escrita, matemática).',
 'Transtornos do desenvolvimento neurológico'),

('F81.0', 'DSM-5-TR', 'Transtorno Específico de Aprendizagem com prejuízo na leitura',
 NULL,
 'Transtornos do neurodesenvolvimento'),

('F81.2', 'DSM-5-TR', 'Transtorno Específico de Aprendizagem com prejuízo na matemática',
 NULL,
 'Transtornos do neurodesenvolvimento'),

-- Ansiedade e humor
('6B00', 'CID-11', 'Transtorno de Ansiedade Generalizada', NULL,
 'Transtornos de ansiedade'),

('F41.1', 'DSM-5-TR', 'Transtorno de Ansiedade Generalizada', NULL,
 'Transtornos de ansiedade'),

('6A70', 'CID-11', 'Transtorno Depressivo Maior, Episódio Único', NULL,
 'Transtornos do humor'),

('F32.1', 'DSM-5-TR', 'Transtorno Depressivo Maior, Episódio Único, Moderado', NULL,
 'Transtornos depressivos'),

-- Atraso global
('6A04', 'CID-11', 'Transtorno do Desenvolvimento da Coordenação Motora', NULL,
 'Transtornos do desenvolvimento neurológico')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- Verificação: contagens
-- ============================================================================

SELECT 'convenios' AS tabela, COUNT(*) AS total FROM convenios
UNION ALL
SELECT 'instrumentos_catalogo', COUNT(*) FROM instrumentos_catalogo
UNION ALL
SELECT 'cids', COUNT(*) FROM cids
ORDER BY tabela;
-- Esperado:
--   convenios: 10 (1 Particular + 6 GNDI + 3 UNIMED)
--   instrumentos_catalogo: 18 (12 Correção + 6 Aplicação exclusivos)
--   cids: 19

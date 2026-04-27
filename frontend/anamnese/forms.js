// ============================================================================
// CORTEX_APP — Definição dos Formulários de Anamnese
// ============================================================================
// 5 formulários por faixa etária. Mapeamento de seção → coluna JSONB do banco.
//
// IMPORTANTE: cada seção tem um campo `col` que indica em QUAL coluna JSONB
// da tabela `anamneses` os dados dessa seção são gravados. As 8 colunas
// disponíveis (criadas no Sprint A1):
//   - identificacao
//   - queixa_historico
//   - desenvolvimento
//   - contexto_familiar
//   - historico_escolar
//   - saude_medicacoes
//   - social_emocional
//   - outros_profissionais
// ============================================================================

window.CortexAnamneseForms = (function() {
    'use strict';

    const HF  = ['TDAH','TEA','Dislexia','Depressão','Ansiedade','Bipolaridade','Esquizofrenia','Demência'];
    const HFI = ['Alzheimer/Demência','Parkinson','AVC','Depressão','Bipolaridade','Esquizofrenia','TDAH','TEA'];

    const F = {
        infantil: {
            icon: '🍼', tt: 'Primeira Infância', rg: '0 – 6 anos',
            sects: [
                { ic:'🏥', tt:'Encaminhamento', col:'outros_profissionais', g2:[
                    {id:'med', lb:'Médico solicitante', tp:'text', req:1},
                    {id:'cli', lb:'Clínica / Telefone', tp:'text'}
                ]},
                { ic:'👤', tt:'Identificação', col:'identificacao', g2:[
                    {id:'rel', lb:'Relação com a criança', tp:'sel', op:['Pai/Mãe','Responsável Legal','Outro']},
                    {id:'nom', lb:'Nome da criança', tp:'text', req:1},
                    {id:'nsc', lb:'Data de nascimento', tp:'date'},
                    {id:'sex', lb:'Sexo', tp:'sel', op:['Masculino','Feminino']},
                    {id:'pai', lb:'Nome dos pais', tp:'text', full:1},
                    {id:'cid', lb:'Cidade de nascimento', tp:'text'},
                    {id:'ava', lb:'Data da avaliação', tp:'date', today:1}
                ]},
                { ic:'🎯', tt:'Demanda', col:'queixa_historico', g2:[
                    {id:'mot', lb:'Motivo da avaliação', tp:'ta', req:1, full:1, ph:'Descreva as principais preocupações e dificuldades...'},
                    {id:'imp', lb:'Impacto no cotidiano', tp:'ta', full:1, ph:'Como as dificuldades afetam o dia a dia...'},
                    {id:'tmq', lb:'Duração das queixas', tp:'sel', op:['Desde o nascimento','Menos de 6 meses','6 meses a 1 ano','1 a 2 anos','Mais de 2 anos']}
                ]},
                { ic:'🧬', tt:'Histórico Familiar', col:'contexto_familiar', g2:[
                    {id:'hf', lb:'Transtornos na família', tp:'cks', its:HF, full:1},
                    {id:'hfd', lb:'Detalhes (parentesco)', tp:'ta', full:1, ph:'Ex: pai com TDAH, tio materno com TEA...'}
                ]},
                { ic:'🤰', tt:'Histórico Gestacional e Perinatal', col:'desenvolvimento', g2:[
                    {id:'par', lb:'Tipo de parto', tp:'sel', op:['Vaginal','Cesáriana eletiva','Cesáriana de emergência','Fórceps']},
                    {id:'ris', lb:'Gestação de alto risco?', tp:'sel', op:['Sim','Não','Não sabe']},
                    {id:'sem', lb:'Semanas de gestação', tp:'num', ph:'Ex: 38', mn:20, mx:45},
                    {id:'pes', lb:'Peso ao nascer (g)', tp:'num', ph:'Ex: 3200'},
                    {id:'ap1', lb:'Apgar 1º min', tp:'num', ph:'0–10', mn:0, mx:10},
                    {id:'ap5', lb:'Apgar 5º min', tp:'num', ph:'0–10', mn:0, mx:10},
                    {id:'ico', lb:'Intercorrências gestacionais', tp:'cks', full:1, its:['Hipertensão materna','Diabetes gestacional','Infecções','Prematuridade','Anóxia fetal','Uso de medicamentos','Álcool/substâncias']},
                    {id:'obs', lb:'Outras observações perinatais', tp:'ta', full:1, ph:'UTI neonatal, icterícia, dificuldades de amamentação...'}
                ]},
                { ic:'📈', tt:'Marcos do Neurodesenvolvimento', col:'desenvolvimento', g3:[
                    {id:'mc1', lb:'Sustentação da cabeça (meses)', tp:'num', ph:'~3m', mn:0, mx:24},
                    {id:'mc2', lb:'Sentar sem apoio (meses)', tp:'num', ph:'~6m', mn:0, mx:24},
                    {id:'mc3', lb:'Andar sem apoio (meses)', tp:'num', ph:'~12m', mn:0, mx:30},
                    {id:'mc4', lb:'Primeiras palavras (meses)', tp:'num', ph:'~12m', mn:0, mx:48},
                    {id:'mc5', lb:'Frases com 2+ palavras (meses)', tp:'num', ph:'~24m', mn:0, mx:60},
                    {id:'mc6', lb:'Controle esfincteriano (meses)', tp:'num', ph:'~24–36m', mn:0, mx:72},
                    {id:'reg', lb:'Regressão de habilidades?', tp:'sel', full:1, op:['Não houve regressão','Regressão de linguagem','Regressão motora','Regressão social (contato, interação)','Múltiplas áreas']},
                    {id:'dob', lb:'Observações sobre o desenvolvimento', tp:'ta', full:1, ph:'Sono, alimentação, sensibilidades na primeira infância...'}
                ]},
                { ic:'💬', tt:'Linguagem e Comunicação', col:'desenvolvimento', g2:[
                    {id:'lng', lb:'Nível de linguagem atual', tp:'sel', op:['Pré-verbal (sem palavras)','Palavras isoladas','Frases simples (2–3 palavras)','Frases elaboradas','Comunicação complexa para a idade']},
                    {id:'cvi', lb:'Contato visual', tp:'sel', op:['Adequado','Reduzido','Ausente','Inconsistente']},
                    {id:'clg', lb:'Características de linguagem', tp:'cks', full:1, its:['Ecolalia (repetição de palavras/frases)','Inversão pronominal ("você" por "eu")','Não aponta para pedir ou mostrar','Dificuldade em responder ao próprio nome','Atraso na linguagem expressiva','Dificuldade de compreensão']}
                ]},
                { ic:'🔍', tt:'Comportamento e Perfil Sensorial', col:'social_emocional', g2:[
                    {id:'cmp', lb:'Comportamentos presentes', tp:'cks', full:1, its:['Estereotipias motoras (mão, corpo, voz)','Rituais / rotinas rígidas','Interesses restritos e intensos','Hiperatividade / agitação motora','Impulsividade','Birras intensas / difíceis de controlar','Agressividade ou autoagressão','Ansiedade / medos intensos']},
                    {id:'sen', lb:'Perfil sensorial', tp:'cks', full:1, its:['Hipersensibilidade tátil (rejeita texturas, roupas)','Hipersensibilidade auditiva (ruídos, vozes)','Hipersensibilidade visual (luzes)','Seletividade alimentar intensa','Hipossensibilidade à dor','Busca excessiva por estímulos vestibulares (girar, balançar)']},
                    {id:'cob', lb:'Observações comportamentais e sensoriais', tp:'ta', full:1, ph:'Padrões específicos, frequência, situações gatilho...'}
                ]},
                { ic:'💊', tt:'Saúde e Intervenções', col:'saude_medicacoes', g2:[
                    {id:'med2', lb:'Uso de medicamentos', tp:'sel', op:['Não usa','Sim — psicotrópicos','Sim — outros']},
                    {id:'son', lb:'Padrão de sono', tp:'sel', op:['Adequado para a idade','Dificuldade para adormecer','Despertares frequentes','Insônia significativa']},
                    {id:'mdt', lb:'Medicamentos (nome, dose, tempo)', tp:'ta', full:1, ph:'Ex: Risperidona 0,5mg há 6 meses...'},
                    {id:'int', lb:'Intervenções em andamento', tp:'cks', full:1, its:['Fonoaudiologia','Terapia Ocupacional','Psicologia / ABA','Neuropediatria','Psiquiatria','Fisioterapia']},
                    {id:'dxs', lb:'Diagnósticos anteriores / Exames realizados', tp:'ta', full:1, ph:'Diagnósticos, EEG, neuroimagem, genética...'},
                    {id:'add', lb:'Informações adicionais', tp:'ta', full:1, ph:'Qualquer informação adicional relevante...'}
                ]}
            ]
        },

        escolar: {
            icon: '🎒', tt: 'Segunda Infância', rg: '6 – 12 anos',
            sects: [
                { ic:'🏥', tt:'Encaminhamento', col:'outros_profissionais', g2:[
                    {id:'med', lb:'Médico solicitante', tp:'text', req:1},
                    {id:'cli', lb:'Clínica / Telefone', tp:'text'}
                ]},
                { ic:'👤', tt:'Identificação', col:'identificacao', g2:[
                    {id:'rel', lb:'Relação com a criança', tp:'sel', op:['Pai/Mãe','Responsável Legal','Outro']},
                    {id:'nom', lb:'Nome da criança', tp:'text', req:1},
                    {id:'nsc', lb:'Data de nascimento', tp:'date'},
                    {id:'sex', lb:'Sexo', tp:'sel', op:['Masculino','Feminino']},
                    {id:'pai', lb:'Nome dos pais', tp:'text', full:1},
                    {id:'cid', lb:'Cidade de nascimento', tp:'text'},
                    {id:'ava', lb:'Data da avaliação', tp:'date', today:1},
                    {id:'ser', lb:'Série / Ano escolar', tp:'text', ph:'Ex: 3º ano do Ensino Fundamental'},
                    {id:'esc', lb:'Nome da escola', tp:'text', ph:'Ex: Escola Municipal X'}
                ]},
                { ic:'🎯', tt:'Demanda', col:'queixa_historico', g2:[
                    {id:'mot', lb:'Motivo da avaliação', tp:'ta', req:1, full:1, ph:'Descreva as queixas em detalhes...'},
                    {id:'imp', lb:'Impacto na vida diária (escola, social, autonomia)', tp:'ta', full:1, ph:'Como as dificuldades afetam o desempenho, amizades...'},
                    {id:'tmq', lb:'Início das dificuldades', tp:'sel', op:['Desde o pré-escolar','Início do Ensino Fundamental','Menos de 1 ano','Entre 1 e 2 anos','Mais de 2 anos']}
                ]},
                { ic:'🧬', tt:'Histórico Familiar', col:'contexto_familiar', g2:[
                    {id:'hf', lb:'Transtornos na família', tp:'cks', its:HF, full:1},
                    {id:'hfd', lb:'Detalhes (parentesco)', tp:'ta', full:1, ph:'Ex: mãe com TDAH, tio paterno com TEA...'}
                ]},
                { ic:'🌱', tt:'Desenvolvimento Precoce', col:'desenvolvimento', g2:[
                    {id:'ges', lb:'Intercorrências gestacionais relevantes', tp:'ta', ph:'Prematuridade, complicações, Apgar...'},
                    {id:'dev', lb:'Desenvolvimento neuropsicomotor precoce', tp:'sel', op:['Dentro do esperado','Atraso motor','Atraso de linguagem','Atraso em múltiplas áreas','Regressão de habilidades']},
                    {id:'dob', lb:'Observações sobre a primeira infância', tp:'ta', full:1, ph:'Marcos, particularidades do desenvolvimento...'}
                ]},
                { ic:'📚', tt:'Histórico Escolar e Aprendizagem', col:'historico_escolar', g2:[
                    {id:'des', lb:'Desempenho acadêmico geral', tp:'sel', op:['Acima da média','Na média','Abaixo da média','Muito abaixo — com reprovações']},
                    {id:'rep', lb:'Já foi reprovado?', tp:'sel', op:['Não','Sim — 1 vez','Sim — 2 vezes ou mais']},
                    {id:'ddc', lb:'Disciplinas com maior dificuldade', tp:'text', ph:'Ex: Português, Matemática'},
                    {id:'bdc', lb:'Disciplinas com melhor desempenho', tp:'text', ph:'Ex: Ciências, Artes'},
                    {id:'dap', lb:'Dificuldades específicas de aprendizagem', tp:'cks', full:1, its:['Leitura (decodificação, fluência)','Escrita (ortografia, produção textual)','Matemática (cálculo, raciocínio)','Atenção e concentração','Memória','Organização e planejamento']},
                    {id:'ldo', lb:'Laudos / diagnósticos anteriores', tp:'ta', full:1, ph:'Laudos médicos, psicológicos, escolares...'}
                ]},
                { ic:'👫', tt:'Perfil Social e Comportamental', col:'social_emocional', g2:[
                    {id:'soc', lb:'Relacionamento com colegas', tp:'sel', op:['Boa rede de amigos','Poucos amigos, mas relações estáveis','Dificuldades significativas de socialização','Isolamento social']},
                    {id:'bul', lb:'Histórico de bullying', tp:'sel', op:['Sem histórico','Sim — vítima','Sim — autor','Sim — ambos']},
                    {id:'cmp', lb:'Comportamentos presentes', tp:'cks', full:1, its:['Hiperatividade','Impulsividade','Desatenção frequente','Ansiedade','Instabilidade de humor','Comportamento opositor / desafiador','Perfeccionismo / rigidez','Retraimento social']}
                ]},
                { ic:'💊', tt:'Saúde e Intervenções', col:'saude_medicacoes', g2:[
                    {id:'med2', lb:'Uso de medicamentos', tp:'sel', op:['Não usa','Sim — psicotrópicos','Sim — outros']},
                    {id:'son', lb:'Padrão de sono', tp:'sel', op:['Adequado','Dificuldade para adormecer','Despertares frequentes','Insônia']},
                    {id:'mdt', lb:'Medicamentos (nome, dose)', tp:'ta', full:1, ph:'Ex: Metilfenidato 10mg...'},
                    {id:'int', lb:'Intervenções em andamento', tp:'cks', full:1, its:['Psicologia','Fonoaudiologia','Terapia Ocupacional','Psiquiatria','Neurologia','Reforço escolar']},
                    {id:'add', lb:'Observações adicionais', tp:'ta', full:1, ph:'Qualquer informação adicional...'}
                ]}
            ]
        },

        adolescente: {
            icon: '🧑', tt: 'Adolescência', rg: '12 – 18 anos',
            sects: [
                { ic:'🏥', tt:'Encaminhamento', col:'outros_profissionais', g2:[
                    {id:'med', lb:'Médico solicitante', tp:'text', req:1},
                    {id:'cli', lb:'Clínica / Telefone', tp:'text'}
                ]},
                { ic:'👤', tt:'Identificação', col:'identificacao', g2:[
                    {id:'rel', lb:'Relação com o adolescente', tp:'sel', op:['Pai/Mãe','Responsável Legal','Outro']},
                    {id:'nom', lb:'Nome do adolescente', tp:'text', req:1},
                    {id:'nsc', lb:'Data de nascimento', tp:'date'},
                    {id:'sex', lb:'Sexo / Identidade de gênero', tp:'text', ph:'Ex: Feminino / ela-dela'},
                    {id:'pai', lb:'Nome dos pais', tp:'text', full:1},
                    {id:'cid', lb:'Cidade de nascimento', tp:'text'},
                    {id:'ava', lb:'Data da avaliação', tp:'date', today:1},
                    {id:'ser', lb:'Série / Ano escolar', tp:'text', ph:'Ex: 1º ano do Ensino Médio'}
                ]},
                { ic:'🎯', tt:'Demanda', col:'queixa_historico', g2:[
                    {id:'mot', lb:'Motivo da avaliação', tp:'ta', req:1, full:1, ph:'Descreva as principais preocupações em detalhes...'},
                    {id:'imp', lb:'Impacto na vida diária (escola, social, bem-estar)', tp:'ta', full:1, ph:'Como as dificuldades afetam os diferentes domínios...'}
                ]},
                { ic:'🧬', tt:'Histórico Familiar', col:'contexto_familiar', g2:[
                    {id:'hf', lb:'Transtornos na família', tp:'cks', its:HF, full:1},
                    {id:'hfd', lb:'Detalhes (parentesco)', tp:'ta', full:1, ph:'Ex: pai com TDAH, avó com depressão...'}
                ]},
                { ic:'📚', tt:'Histórico Escolar', col:'historico_escolar', g2:[
                    {id:'des', lb:'Desempenho acadêmico', tp:'sel', op:['Acima da média','Na média','Abaixo da média','Muito abaixo / reprovações']},
                    {id:'rep', lb:'Já foi reprovado?', tp:'sel', op:['Não','Sim — 1 vez','Sim — 2+ vezes']},
                    {id:'ddc', lb:'Disciplinas com maior dificuldade', tp:'text', ph:'Ex: Português, Matemática'},
                    {id:'bdc', lb:'Disciplinas com melhor desempenho', tp:'text', ph:'Ex: Biologia, Filosofia'},
                    {id:'tra', lb:'Trajetória escolar', tp:'ta', full:1, ph:'Quando começaram as dificuldades? Houve mudanças no desempenho?'}
                ]},
                { ic:'🌱', tt:'Desenvolvimento Precoce', col:'desenvolvimento', g2:[
                    {id:'ges', lb:'Intercorrências gestacionais/perinatais', tp:'ta', ph:'Prematuridade, complicações...'},
                    {id:'dev', lb:'Desenvolvimento neuropsicomotor precoce', tp:'sel', op:['Dentro do esperado','Atraso motor','Atraso de linguagem','Atraso em múltiplas áreas','Não sabe informar']}
                ]},
                { ic:'🧠', tt:'Saúde Mental e Comportamento', col:'social_emocional', g2:[
                    {id:'smt', lb:'Sintomas presentes', tp:'cks', full:1, its:['Ansiedade / ataques de pânico','Sintomas depressivos','Automutilação / comportamentos de risco','Transtorno alimentar','Distúrbios do sono','Isolamento social','Instabilidade de humor intensa','Comportamento opositor / desafiador']},
                    {id:'sub', lb:'Uso de substâncias', tp:'sel', op:['Não','Uso experimental / esporádico','Uso regular','Abuso / dependência']},
                    {id:'bul', lb:'Histórico de bullying', tp:'sel', op:['Sem histórico','Vítima de bullying','Cyberbullying','Ambos']},
                    {id:'sob', lb:'Observações sobre saúde mental', tp:'ta', full:1, ph:'Contexto, episódios marcantes, busca anterior por ajuda...'}
                ]},
                { ic:'💊', tt:'Saúde e Intervenções', col:'saude_medicacoes', g2:[
                    {id:'med2', lb:'Uso de medicamentos', tp:'sel', op:['Não usa','Sim — psicotrópicos','Sim — outros']},
                    {id:'psa', lb:'Acompanhamento psicológico', tp:'sel', op:['Nunca','Sim — atualmente','Sim — anteriormente']},
                    {id:'mdt', lb:'Medicamentos (nome, dose, tempo)', tp:'ta', full:1, ph:'Ex: Sertralina 50mg há 8 meses...'},
                    {id:'dxs', lb:'Diagnósticos estabelecidos', tp:'ta', full:1, ph:'Diagnósticos médicos ou psicológicos anteriores...'},
                    {id:'add', lb:'Observações adicionais', tp:'ta', full:1, ph:'Qualquer informação adicional...'}
                ]}
            ]
        },

        adulto: {
            icon: '🧑‍💼', tt: 'Adulto', rg: '18 – 50 anos',
            sects: [
                { ic:'🏥', tt:'Encaminhamento', col:'outros_profissionais', g2:[
                    {id:'med', lb:'Médico solicitante', tp:'text', req:1},
                    {id:'cli', lb:'Clínica / Telefone', tp:'text'}
                ]},
                { ic:'👤', tt:'Identificação', col:'identificacao', g2:[
                    {id:'rel', lb:'Quem está respondendo?', tp:'sel', op:['Sou eu mesmo(a)','Responsável Legal','Cônjuge / Familiar','Outro']},
                    {id:'nom', lb:'Nome do avaliando', tp:'text', req:1},
                    {id:'nsc', lb:'Data de nascimento', tp:'date'},
                    {id:'sex', lb:'Sexo / Identidade de gênero', tp:'text', ph:'Ex: Feminino'},
                    {id:'pai', lb:'Nome dos pais', tp:'text', full:1},
                    {id:'cid', lb:'Cidade de nascimento', tp:'text'},
                    {id:'ava', lb:'Data da avaliação', tp:'date', today:1},
                    {id:'esc', lb:'Escolaridade', tp:'sel', op:['Ensino Fundamental incompleto','Ensino Fundamental completo','Ensino Médio incompleto','Ensino Médio completo','Graduação incompleta','Graduação completa','Pós-graduação']},
                    {id:'ocp', lb:'Profissão / Ocupação', tp:'text', ph:'Área de atuação'},
                    {id:'prf', lb:'Situação profissional', tp:'sel', op:['Empregado(a)','Autônomo(a)','Desempregado(a)','Afastado(a) por doença','Estudante']},
                    {id:'ecv', lb:'Estado civil', tp:'sel', op:['Solteiro(a)','Casado(a)','União estável','Divorciado(a)','Viúvo(a)']}
                ]},
                { ic:'🎯', tt:'Demanda', col:'queixa_historico', g2:[
                    {id:'mot', lb:'Motivo da avaliação', tp:'ta', req:1, full:1, ph:'Descreva em detalhes as principais preocupações e queixas...'},
                    {id:'imp', lb:'Impacto na vida diária (trabalho, social, autonomia)', tp:'ta', full:1, ph:'Como as dificuldades afetam o funcionamento nos diferentes domínios...'},
                    {id:'tmq', lb:'Há quanto tempo as dificuldades estão presentes?', tp:'sel', op:['Desde a infância','Desde a adolescência','Menos de 1 ano','Entre 1 e 3 anos','Entre 3 e 10 anos','Mais de 10 anos']}
                ]},
                { ic:'🧬', tt:'Histórico Familiar', col:'contexto_familiar', g2:[
                    {id:'hf', lb:'Transtornos na família', tp:'cks', its:HF, full:1},
                    {id:'hfd', lb:'Detalhes (parentesco)', tp:'ta', full:1, ph:'Ex: mãe com depressão, irmão com TDAH...'}
                ]},
                { ic:'🌱', tt:'Desenvolvimento e Histórico Pessoal', col:'desenvolvimento', g2:[
                    {id:'ges', lb:'Intercorrências gestacionais / perinatais', tp:'ta', ph:'Prematuridade, complicações, Apgar...'},
                    {id:'dev', lb:'Desenvolvimento neuropsicomotor precoce', tp:'sel', op:['Dentro do esperado','Atraso de linguagem','Atraso motor','Atraso em múltiplas áreas','Não sabe informar']},
                    {id:'trj', lb:'Trajetória escolar', tp:'ta', full:1, ph:'Como foi a vida escolar, dificuldades, desempenho...'}
                ]},
                { ic:'🧠', tt:'Saúde Mental', col:'social_emocional', g2:[
                    {id:'smt', lb:'Sintomas atuais presentes', tp:'cks', full:1, its:['Ansiedade / ataques de pânico','Sintomas depressivos','Instabilidade de humor','Distúrbios do sono','Dificuldades sociais / isolamento','Fadiga social / exaustão após interações','Hipersensibilidade sensorial','Queixas de memória','Dificuldades de atenção / concentração','Dificuldades de organização e planejamento']},
                    {id:'trt', lb:'Tratamentos psicológicos / psiquiátricos anteriores', tp:'ta', full:1, ph:'Tratamentos anteriores, diagnósticos, internações...'},
                    {id:'pfs', lb:'Perfil sensorial — hipersensibilidades presentes', tp:'ta', full:1, ph:'Ex: intolerância a ruídos intensos, defensividade tátil, fotofobia...'},
                    {id:'cmp', lb:'Padrões comportamentais específicos', tp:'ta', full:1, ph:'Estereotipias, rituais, interesses restritos e intensos (hiperfoco), mascaramento social...'}
                ]},
                { ic:'💊', tt:'Saúde Geral e Intervenções', col:'saude_medicacoes', g2:[
                    {id:'med2', lb:'Uso de medicamentos', tp:'sel', op:['Não usa','Sim — psicotrópicos','Sim — outros']},
                    {id:'son', lb:'Padrão de sono', tp:'sel', op:['Adequado','Dificuldade para adormecer','Despertares frequentes','Insônia significativa','Hipersonia']},
                    {id:'mdt', lb:'Medicamentos (nome, dose, tempo de uso)', tp:'ta', full:1, ph:'Ex: Venlafaxina 75mg + Lamotrigina 100mg há 2 anos...'},
                    {id:'clk', lb:'Doenças clínicas / exames realizados', tp:'ta', full:1, ph:'Condições médicas, neuroimagem, genética...'},
                    {id:'add', lb:'Observações adicionais', tp:'ta', full:1, ph:'Qualquer informação adicional...'}
                ]}
            ]
        },

        idoso: {
            icon: '🧓', tt: 'Idoso', rg: '50 anos+',
            sects: [
                { ic:'🏥', tt:'Encaminhamento', col:'outros_profissionais', g2:[
                    {id:'med', lb:'Médico solicitante', tp:'text', req:1},
                    {id:'cli', lb:'Clínica / Telefone', tp:'text'}
                ]},
                { ic:'👤', tt:'Identificação', col:'identificacao', g2:[
                    {id:'rel', lb:'Quem está respondendo?', tp:'sel', op:['Sou eu mesmo(a)','Cônjuge','Filho(a)','Responsável Legal']},
                    {id:'nom', lb:'Nome do avaliando', tp:'text', req:1},
                    {id:'nsc', lb:'Data de nascimento', tp:'date'},
                    {id:'sex', lb:'Sexo biológico', tp:'sel', op:['Masculino','Feminino']},
                    {id:'esc', lb:'Escolaridade', tp:'sel', op:['Sem escolaridade formal','Ensino Fundamental incompleto','Ensino Fundamental completo','Ensino Médio','Graduação','Pós-graduação']},
                    {id:'ano', lb:'Anos de estudo', tp:'num', ph:'Ex: 11', mn:0, mx:30},
                    {id:'ecv', lb:'Estado civil', tp:'sel', op:['Solteiro(a)','Casado(a)','Viúvo(a)','Divorciado(a)']},
                    {id:'sit', lb:'Situação atual', tp:'sel', op:['Aposentado(a)','Ativo(a) profissionalmente','Afastado(a)','Do lar']},
                    {id:'ocp', lb:'Profissão principal da vida', tp:'text', ph:'Ex: Professora aposentada'},
                    {id:'cid', lb:'Cidade de nascimento', tp:'text'},
                    {id:'ava', lb:'Data da avaliação', tp:'date', today:1}
                ]},
                { ic:'🎯', tt:'Demanda', col:'queixa_historico', g2:[
                    {id:'mot', lb:'Motivo da avaliação', tp:'ta', req:1, full:1, ph:'Descreva as principais preocupações em detalhes...'},
                    {id:'imp', lb:'Impacto na vida diária (autonomia, social)', tp:'ta', full:1, ph:'Como as dificuldades afetam a independência e o cotidiano...'},
                    {id:'tmq', lb:'Duração das dificuldades', tp:'sel', op:['Menos de 6 meses','6 meses a 1 ano','1 a 2 anos','2 a 5 anos','Mais de 5 anos']},
                    {id:'qmp', lb:'Quem percebeu primeiro?', tp:'sel', op:['O próprio paciente','Cônjuge / companheiro(a)','Filhos','Médico','Outros familiares']},
                    {id:'prg', lb:'Progressão do quadro', tp:'sel', op:['Piora gradual e contínua','Piora em degraus (súbita → estabiliza)','Estável','Oscila (dias bons e ruins)']}
                ]},
                { ic:'🧠', tt:'Queixas Cognitivas', col:'desenvolvimento', g2:[
                    {id:'qmm', lb:'Memória', tp:'cks', full:1, its:['Esquece eventos / conversas recentes','Dificuldade para lembrar nomes','Perde objetos com frequência','Esquece compromissos / medicamentos','Repete perguntas ou histórias','Dificuldade com memória remota (eventos antigos)']},
                    {id:'qln', lb:'Linguagem', tp:'cks', full:1, its:['Dificuldade para encontrar palavras (anomia)','Dificuldade de compreensão','Discurso desorganizado / vago','Dificuldade de leitura recente']},
                    {id:'qex', lb:'Funções executivas e orientação', tp:'cks', full:1, its:['Dificuldade para planejar e organizar','Desorientação temporal (data, dia da semana)','Desorientação espacial (se perde em lugares conhecidos)','Dificuldade com cálculos simples','Dificuldade para fazer mais de uma tarefa ao mesmo tempo']},
                    {id:'cob', lb:'Descrição adicional das queixas cognitivas', tp:'ta', full:1, ph:'Situações específicas, exemplos concretos...'}
                ]},
                { ic:'🏠', tt:'Autonomia e AVDs', col:'historico_escolar', g2:[
                    {id:'avb', lb:'AVDs básicas independentes', tp:'cks', full:1, its:['Higiene pessoal','Vestir-se','Alimentar-se','Locomoção dentro de casa','Continência esfincteriana']},
                    {id:'avi', lb:'AVDs instrumentais independentes', tp:'cks', full:1, its:['Gerenciar finanças','Tomar medicamentos sozinho','Usar telefone / celular','Fazer compras','Cozinhar / preparar refeições','Usar transporte']},
                    {id:'dep', lb:'Grau de dependência atual', tp:'sel', op:['Totalmente independente','Independente com supervisão ocasional','Necessita de ajuda parcial','Totalmente dependente']},
                    {id:'phb', lb:'Perdas funcionais recentes', tp:'ta', full:1, ph:'Ex: parou de dirigir, não consegue mais usar caixa eletrônico...'}
                ]},
                { ic:'💊', tt:'Saúde Geral', col:'saude_medicacoes', g2:[
                    {id:'dcs', lb:'Doenças clínicas', tp:'cks', full:1, its:['Hipertensão arterial','Diabetes mellitus','Doença cardiovascular (infarto, arritmia)','AVC / AIT prévio','Parkinson / distúrbios do movimento','Doenças da tireoide','Neoplasia / Câncer','Traumatismo cranioencefálico (TCE)','Epilepsia / Convulsões','Infecção do SNC (meningite, encefalite)']},
                    {id:'cdt', lb:'Detalhes clínicos (datas, gravidade)', tp:'ta', full:1, ph:'Ex: HAS há 15 anos em uso de losartana, AVC em 2020...'},
                    {id:'mds', lb:'Medicamentos em uso (nome, dose, indicação)', tp:'ta', full:1, ph:'Ex: Donepezila 10mg, Losartana 50mg, Atorvastatina 20mg...'},
                    {id:'bnz', lb:'Uso de benzodiazepínicos', tp:'sel', op:['Não usa','Uso ocasional','Uso crônico há menos de 1 ano','Uso crônico há mais de 1 ano']},
                    {id:'exc', lb:'Exames neurológicos realizados', tp:'cks', full:1, its:['RM de crânio','TC de crânio','EEG','PET-scan cerebral','SPECT cerebral','Análise de líquor (biomarcadores)']},
                    {id:'exd', lb:'Resultados relevantes dos exames', tp:'ta', full:1, ph:'Ex: RM com atrofia hipocampal bilateral, leucoaraiose...'}
                ]},
                { ic:'🧠', tt:'Sintomas Neuropsiquiátricos', col:'social_emocional', g2:[
                    {id:'nps', lb:'Sintomas presentes', tp:'cks', full:1, its:['Humor deprimido / tristeza persistente','Ansiedade / preocupação excessiva','Apatia / perda de iniciativa e interesse','Agitação / irritabilidade','Desinibição comportamental','Alucinações (ver ou ouvir coisas)','Delírios / ideias fixas sem base real','Alterações importantes do sono','Comportamentos compulsivos ou repetitivos novos']},
                    {id:'pqa', lb:'Histórico psiquiátrico prévio', tp:'ta', full:1, ph:'Depressão anterior, tratamentos, internações...'},
                    {id:'son', lb:'Padrão de sono atual', tp:'sel', op:['Normal para a idade','Insônia de conciliação','Insônia de manutenção (acorda frequentemente)','Hipersonia','Inversão do ciclo sono-vigília','Comportamentos durante o sono (fala, grita, movimenta-se)']}
                ]},
                { ic:'🧬', tt:'Histórico Familiar', col:'contexto_familiar', g2:[
                    {id:'hf', lb:'Doenças neurológicas / psiquiátricas na família', tp:'cks', its:HFI, full:1},
                    {id:'hfd', lb:'Detalhes (parentesco)', tp:'ta', full:1, ph:'Ex: mãe com Alzheimer aos 75 anos, irmão com AVC...'}
                ]},
                { ic:'📖', tt:'Reserva Cognitiva e Estilo de Vida', col:'desenvolvimento', g2:[
                    {id:'atf', lb:'Atividade física', tp:'sel', op:['Regular (3x/semana ou mais)','Ocasional','Não pratica','Praticava antes, parou recentemente']},
                    {id:'atc', lb:'Atividade cognitiva / intelectual', tp:'sel', op:['Leitura frequente','Jogos / palavras cruzadas / xadrez','Atividades artísticas','Pouca estimulação cognitiva']},
                    {id:'vds', lb:'Vida social', tp:'sel', op:['Ativa — muitos contatos sociais','Moderada','Isolamento social significativo','Piorou recentemente']},
                    {id:'alc', lb:'Uso de álcool', tp:'sel', op:['Não usa','Uso leve / social','Uso moderado / frequente','Uso excessivo / abuso']},
                    {id:'tab', lb:'Tabagismo', tp:'sel', op:['Nunca fumou','Ex-fumante','Fumante atual']},
                    {id:'trj', lb:'Trajetória escolar e profissional', tp:'ta', full:1, ph:'Escolaridade, profissão exercida, complexidade das atividades ao longo da vida...'},
                    {id:'evv', lb:'Eventos de vida marcantes recentes', tp:'ta', full:1, ph:'Ex: falecimento do cônjuge, mudança de residência, aposentadoria...'},
                    {id:'dxs', lb:'Diagnósticos neurológicos / psiquiátricos estabelecidos', tp:'ta', full:1, ph:'Ex: CCL amnéstico, Alzheimer fase inicial, Depressão maior...'},
                    {id:'add', lb:'Observações adicionais', tp:'ta', full:1, ph:'Qualquer informação adicional relevante...'}
                ]}
            ]
        }
    };

    /**
     * Detecta a faixa etária com base na idade em anos
     */
    function detectarFaixa(idadeAnos) {
        if (idadeAnos === null || idadeAnos === undefined) return 'adulto';
        if (idadeAnos < 6) return 'infantil';
        if (idadeAnos < 12) return 'escolar';
        if (idadeAnos < 18) return 'adolescente';
        if (idadeAnos < 50) return 'adulto';
        return 'idoso';
    }

    /**
     * Lista todas as faixas disponíveis (para dropdown de troca manual)
     */
    function listarFaixas() {
        return Object.entries(F).map(([key, fx]) => ({
            key: key,
            label: `${fx.icon} ${fx.tt} (${fx.rg})`
        }));
    }

    /**
     * Retorna lista das colunas JSONB usadas no banco
     */
    function colunasJsonb() {
        return [
            'identificacao',
            'queixa_historico',
            'desenvolvimento',
            'contexto_familiar',
            'historico_escolar',
            'saude_medicacoes',
            'social_emocional',
            'outros_profissionais'
        ];
    }

    return {
        getForm: (faixa) => F[faixa] || null,
        detectarFaixa,
        listarFaixas,
        colunasJsonb,
        FORMS: F
    };
})();

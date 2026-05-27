// ============================================================================
// CORTEX_APP — Sprint 18 v2 — forms.js
// Definição dos 5 formulários de anamnese (Estratégia 2 — Google Forms).
// ============================================================================
// Faixas (chaves novas):
//   primeira_infancia  (0–6 anos)
//   segunda_infancia   (6–12 anos)
//   adolescencia       (12–18 anos)
//   jovens_adultos     (18–50 anos)
//   cinquenta_mais     (50+ anos)
//
// DSL (mantém compatibilidade com anamnese.js antigo + extensões Sprint 18):
//   Seção: { ic, tt, col, g2:[...] }  ou g3 para 3 colunas
//   Campo: { id, lb, tp, ... }
//     tp = 'text' | 'ta' | 'date' | 'num' | 'sel' | 'cks'
//          | 'sn' (radio Sim/Não)     ← NOVO
//          | 'sn_ta' (radio + detalhe) ← NOVO
//          | 'sel_other' (sel + "qual?") ← NOVO
//   Outros: req=1 (obrigatório), full=1 (ocupa linha inteira),
//           today=1 (preenche com data de hoje), ph (placeholder),
//           op=[...] (sel), its=[...] (cks), mn/mx (num min/max).
// ============================================================================

window.CortexAnamneseForms = (function() {
    'use strict';

    // -----------------------------------------------------------------------
    // Listas reutilizáveis
    // -----------------------------------------------------------------------
    const HF = ['TDAH','TEA / Autismo','Dislexia','Demência','Alzheimer','Depressão','Ansiedade','Bipolaridade','Esquizofrenia'];
    const SUBST_PAIS = ['Álcool','Cigarro','Maconha','Cocaína','Crack'];
    const SUBST_PAC  = ['Álcool','Cigarro','Maconha','Cocaína','Crack','Outros'];
    const REL_INF    = ['Pai/Mãe','Responsável Legal','Outro'];
    const REL_ADU    = ['Sou eu mesmo','Responsável Legal','Cônjuge','Outro'];
    const TIPO_PARTO = ['Normal vaginal','Cesárea','Fórceps','Outro'];
    const TAM_BEBE   = ['Grande','Normal','Pequeno','Não sei'];
    const COMP_REP   = ['Andar na ponta dos pés','Balançar as mãos','Dar pulinhos','Girar em torno de si'];
    const SELET      = ['Come de tudo','Pouco seletivo(a)','Bastante seletivo(a)','Muito seletivo(a)'];
    const ALIM_QUAL  = ['Excelente','Boa','Regular','Ruim'];
    const PERFIL_SOC = ['Muito tímido(a)','Reservado(a)','Equilibrado(a)','Falante','Muito falante'];
    const TEMPER     = ['Muito calmo(a)','Calmo(a)','Equilibrado(a)','Irritado(a)','Muito irritado(a)'];
    const ADAPT_ESC  = ['Com facilidade','Resistência leve','Resistência intensa','Ainda não frequenta'];
    const ALFAB      = ['Sem dificuldades','Com dificuldades leves','Com dificuldades intensas','Ainda não alfabetizado(a)'];
    const APROVEIT   = ['Notas altas','Notas médias','Notas baixas','Misto'];
    const HABIL_EV   = ['Adora','Vai de boa','Evita','Recusa'];
    const REGRAS_RES = ['Muito bem','Bem','Com dificuldade','Com muita dificuldade'];
    const HIG        = ['Totalmente independente','Com lembretes','Precisa de ajuda'];
    const AUTON      = ['Totalmente independente','Algumas dificuldades','Precisa de ajuda em várias','Muito dependente'];
    const ACOMPS     = ['Psicólogo','Psiquiatra','Neurologista'];
    const OUTROS_PRF = ['Fonoaudiólogo','Terapeuta Ocupacional','Fisioterapeuta','Pediatra'];
    const DIF_BEBE   = ['Sono','Alimentação','Mudanças de rotina'];
    const TRACOS_HUM = ['Sinais de depressão','Sinais de ansiedade'];
    const DESFR      = ['Dia e noite','Só durante o dia','Não foi desfraldado ainda'];
    const ENS_MED    = ['Sim','Não','Em andamento'];
    const SITU_TRAB  = ['Aposentado(a)','Aposentado(a) mas trabalha','Em atividade','Nunca trabalhou'];
    const EST_CIVIL  = ['Casado(a)','Solteiro(a)','Viúvo(a)','Divorciado(a)','União estável','Outro'];
    const SATIS_TRAB = ['Adoro','Gosto','Indiferente','Não gosto','Detesto'];

    // -----------------------------------------------------------------------
    // Seções genéricas (helpers)
    // -----------------------------------------------------------------------
    function secMedico() {
        return { ic:'🏥', tt:'Encaminhamento', col:'outros_profissionais', g2:[
            {id:'med', lb:'Médico solicitante', tp:'text', ph:'Nome do médico'},
            {id:'cli', lb:'Clínica / Telefone', tp:'text', ph:'Clínica e contato'}
        ]};
    }

    function secIdentInf(labelNome) {
        // Versão para crianças / adolescentes (sem estado civil aqui)
        return { ic:'👤', tt:'Identificação', col:'identificacao', g2:[
            {id:'rel', lb:'Relação com a pessoa avaliada', tp:'sel', op:REL_INF},
            {id:'nom', lb:labelNome, tp:'text', req:1, full:1},
            {id:'nsc', lb:'Data de nascimento', tp:'date'},
            {id:'sex', lb:'Sexo', tp:'sel', op:['Masculino','Feminino']},
            {id:'pai', lb:'Nome dos pais', tp:'text', full:1, ph:'Mãe e pai'},
            {id:'cid', lb:'Cidade de nascimento', tp:'text'},
            {id:'ava', lb:'Data da avaliação', tp:'date', today:1}
        ]};
    }

    function secIdentAdu() {
        return { ic:'👤', tt:'Identificação', col:'identificacao', g2:[
            {id:'rel', lb:'Relação com a pessoa avaliada', tp:'sel', op:REL_ADU},
            {id:'nom', lb:'Nome completo do avaliando', tp:'text', req:1, full:1},
            {id:'nsc', lb:'Data de nascimento', tp:'date'},
            {id:'sex', lb:'Sexo', tp:'sel', op:['Masculino','Feminino']},
            {id:'pai', lb:'Nome dos pais', tp:'text', full:1, ph:'Mãe e pai'},
            {id:'cid', lb:'Cidade de nascimento', tp:'text'},
            {id:'ava', lb:'Data da avaliação', tp:'date', today:1}
        ]};
    }

    function secDemanda(comImpacto) {
        const g2 = [
            {id:'mot', lb:'Motivo da avaliação', tp:'ta', req:1, full:1, ph:'Descreva em detalhes as principais preocupações ou dificuldades que motivaram a busca por esta avaliação...'}
        ];
        if (comImpacto) {
            g2.push({id:'imp', lb:'Impacto na vida diária', tp:'ta', full:1, ph:'Como as dificuldades afetam o cotidiano (escola, trabalho, relações sociais, autonomia, bem-estar emocional)...'});
        }
        return { ic:'🎯', tt:'Demanda', col:'queixa_historico', g2: g2 };
    }

    function secHistFamiliar() {
        return { ic:'🧬', tt:'Histórico Familiar', col:'contexto_familiar', g2:[
            {id:'hf',  lb:'Transtornos cognitivos / psiquiátricos na família', tp:'cks', its:HF, full:1},
            {id:'hfd', lb:'Detalhes (quem na família, outros transtornos)', tp:'ta', full:1, ph:'Ex.: mãe com TDAH, tio paterno com TEA, avó com Alzheimer...'}
        ]};
    }

    function secTratamentos(comSubst, comOutrosProf) {
        const g2 = [
            {id:'dgn', lb:'Possui algum tipo de diagnóstico?', tp:'sn_ta', full:1, ph:'Se sim, descreva.'},
            {id:'acm', lb:'Acompanhamentos atuais', tp:'cks', its:ACOMPS, full:1},
            {id:'acd', lb:'Detalhes do acompanhamento (tempo, com quem)', tp:'ta', full:1, ph:'Ex.: psicóloga há 2 anos, psiquiatra desde 2024...'}
        ];
        if (comOutrosProf) {
            g2.push({id:'opf', lb:'Outros profissionais de saúde em acompanhamento', tp:'cks', its:OUTROS_PRF, full:1});
            g2.push({id:'opd', lb:'Detalhes desses acompanhamentos', tp:'ta', full:1});
        }
        g2.push({id:'mdc', lb:'Faz uso de medicação contínua?', tp:'sn_ta', full:1, ph:'Se sim, liste medicação e dosagem.'});
        if (comSubst) {
            g2.push({id:'sbs', lb:'Já fez/faz uso de substâncias?', tp:'cks', its:SUBST_PAC, full:1});
            g2.push({id:'sbd', lb:'Detalhes do uso (frequência, há quanto tempo)', tp:'ta', full:1});
        }
        return { ic:'💊', tt:'Tratamentos e Acompanhamentos', col:'saude_medicacoes', g2: g2 };
    }

    function secObservacoes(comEventoMarcante) {
        const lb = comEventoMarcante
            ? 'Eventos marcantes ou observações finais — algo importante não perguntado?'
            : 'Observações finais — algo importante não perguntado?';
        return { ic:'📝', tt:'Observações', col:'queixa_historico', g2:[
            {id:'obs', lb: lb, tp:'ta', full:1, ph:'Descreva livremente...'}
        ]};
    }

    // =======================================================================
    // FAIXA 1 — PRIMEIRA INFÂNCIA (0–6)
    // =======================================================================
    const F_PRIMEIRA_INFANCIA = {
        icon:'🍼', tt:'Primeira Infância', rg:'0 – 6 anos',
        sects: [
            secMedico(),
            secIdentInf('Nome completo da criança'),
            secDemanda(false),
            secHistFamiliar(),
            { ic:'🤰', tt:'Gestação e Parto', col:'desenvolvimento', g2:[
                {id:'sub', lb:'Antes da gestação, os pais usavam substâncias?', tp:'cks', its:SUBST_PAIS, full:1},
                {id:'sbo', lb:'Outras observações sobre uso de substâncias', tp:'ta', full:1},
                {id:'abo', lb:'A mãe já sofreu algum aborto?', tp:'sn_ta', full:1, ph:'Se sim, descreva quantos e em que circunstâncias.'},
                {id:'pnt', lb:'Intercorrências no pré-natal (infecções, estresse intenso)', tp:'sn_ta', full:1},
                {id:'sem', lb:'Semanas de gestação ao nascer', tp:'num', mn:20, mx:45, ph:'Ex.: 38'},
                {id:'par', lb:'Tipo de parto', tp:'sel_other', op:TIPO_PARTO},
                {id:'dia', lb:'Dias até a alta hospitalar', tp:'num', mn:0, mx:365, ph:'Ex.: 2'},
                {id:'cmp', lb:'Complicações com a mãe no parto', tp:'sn_ta', full:1, ph:'Ex.: pressão alta, pré-eclâmpsia, hemorragia.'},
                {id:'cbb', lb:'Complicações com o bebê no parto', tp:'sn_ta', full:1, ph:'Ex.: falta de oxigênio, UTI neonatal.'}
            ]},
            { ic:'📔', tt:'Caderneta da Criança', col:'desenvolvimento', g3:[
                {id:'ap5', lb:'Apgar 5 min', tp:'num', mn:0, mx:10},
                {id:'apA', lb:'Apgar 10 min', tp:'num', mn:0, mx:10},
                {id:'pes', lb:'Peso ao nascer (g)', tp:'num', mn:500, mx:6000, ph:'Ex.: 3200'},
                {id:'cmp2', lb:'Comprimento (cm)', tp:'num', mn:25, mx:65, ph:'Ex.: 50'},
                {id:'pc', lb:'Perímetro cefálico (cm)', tp:'num', mn:25, mx:45, ph:'Ex.: 34'}
            ]},
            { ic:'📈', tt:'Marcos do Desenvolvimento', col:'desenvolvimento', g3:[
                {id:'mc1', lb:'Firmou pescoço (meses)', tp:'num', mn:0, mx:24, ph:'~3m'},
                {id:'mc2', lb:'Engatinhou (meses)', tp:'num', mn:0, mx:24, ph:'~8m'},
                {id:'mc3', lb:'Andou (meses)', tp:'num', mn:0, mx:36, ph:'~12m'},
                {id:'mc4', lb:'Balbuciou (meses)', tp:'num', mn:0, mx:24, ph:'~6m'},
                {id:'mc5', lb:'Primeiras palavras (meses)', tp:'num', mn:0, mx:36, ph:'~12m'},
                {id:'mc6', lb:'Frases de 3 palavras (meses)', tp:'num', mn:0, mx:60, ph:'~24m'},
                {id:'dfr', lb:'Estado do desfralde', tp:'sel', op:DESFR},
                {id:'xix', lb:'Faz xixi na cama?', tp:'sn_ta'}
            ]},
            { ic:'🔍', tt:'Comportamento e Perfil Sensorial', col:'social_emocional', g2:[
                {id:'tmp', lb:'Temperamento (calma/irritada, sono, alimentação, mudanças de rotina)', tp:'ta', full:1},
                {id:'rcr', lb:'Relação com outras crianças (solitária, retraída...)', tp:'ta', full:1},
                {id:'rep', lb:'Comportamentos repetitivos', tp:'cks', its:COMP_REP, full:1},
                {id:'app', lb:'Anda na ponta dos pés?', tp:'sn'},
                {id:'hpf', lb:'Hiperfocos / interesses muito intensos', tp:'sn_ta', full:1, ph:'Ex.: animais, carros, dinossauros...'},
                {id:'ali', lb:'Como é a alimentação?', tp:'sel', op:SELET},
                {id:'alo', lb:'Observações sobre alimentação', tp:'ta', full:1},
                {id:'etq', lb:'Etiquetas de roupa o incomodam?', tp:'sn'},
                {id:'bar', lb:'Barulho o incomoda? Tapa os ouvidos?', tp:'sn_ta', full:1},
                {id:'fal', lb:'A fala é desenvolvida? Ecolalia?', tp:'ta', full:1},
                {id:'brk', lb:'Brinca normalmente com brinquedos?', tp:'ta', full:1}
            ]},
            { ic:'🏫', tt:'Adaptação Escolar', col:'historico_escolar', g2:[
                {id:'aes', lb:'Adaptação ao ambiente escolar', tp:'sel', op:ADAPT_ESC, full:1},
                {id:'aeo', lb:'Observações sobre adaptação escolar', tp:'ta', full:1}
            ]},
            secTratamentos(false, true),
            secObservacoes(false)
        ]
    };

    // =======================================================================
    // FAIXA 2 — SEGUNDA INFÂNCIA (6–12)
    // =======================================================================
    const F_SEGUNDA_INFANCIA = {
        icon:'🎒', tt:'Segunda Infância', rg:'6 – 12 anos',
        sects: [
            secMedico(),
            secIdentInf('Nome completo da criança'),
            secDemanda(true),
            secHistFamiliar(),
            { ic:'🤰', tt:'Gestação e Parto', col:'desenvolvimento', g2:[
                {id:'sub', lb:'Antes da gestação, os pais usavam substâncias?', tp:'cks', its:SUBST_PAIS, full:1},
                {id:'sbo', lb:'Outras observações sobre uso de substâncias', tp:'ta', full:1},
                {id:'abo', lb:'A mãe já sofreu algum aborto?', tp:'sn_ta', full:1},
                {id:'pnt', lb:'Intercorrências no pré-natal', tp:'sn_ta', full:1},
                {id:'sem', lb:'Semanas de gestação ao nascer', tp:'num', mn:20, mx:45},
                {id:'par', lb:'Tipo de parto', tp:'sel_other', op:TIPO_PARTO},
                {id:'dia', lb:'Dias até a alta hospitalar', tp:'num', mn:0, mx:365},
                {id:'cmp', lb:'Complicações com a mãe no parto', tp:'sn_ta', full:1},
                {id:'cbb', lb:'Complicações com o bebê no parto', tp:'sn_ta', full:1}
            ]},
            { ic:'📔', tt:'Caderneta da Criança', col:'desenvolvimento', g3:[
                {id:'ap5', lb:'Apgar 5 min', tp:'num', mn:0, mx:10},
                {id:'apA', lb:'Apgar 10 min', tp:'num', mn:0, mx:10},
                {id:'pes', lb:'Peso ao nascer (g)', tp:'num', mn:500, mx:6000},
                {id:'cmp2', lb:'Comprimento (cm)', tp:'num', mn:25, mx:65},
                {id:'pc', lb:'Perímetro cefálico (cm)', tp:'num', mn:25, mx:45},
                {id:'tmn', lb:'Caso não tenha caderneta, era um bebê:', tp:'sel', op:TAM_BEBE}
            ]},
            { ic:'📈', tt:'Marcos do Desenvolvimento', col:'desenvolvimento', g3:[
                {id:'mc1', lb:'Firmou pescoço (meses)', tp:'num', mn:0, mx:24},
                {id:'mc2', lb:'Engatinhou (meses)', tp:'num', mn:0, mx:24},
                {id:'mc3', lb:'Andou (meses)', tp:'num', mn:0, mx:36},
                {id:'mc4', lb:'Balbuciou (meses)', tp:'num', mn:0, mx:24},
                {id:'mc5', lb:'Primeiras palavras (meses)', tp:'num', mn:0, mx:36},
                {id:'mc6', lb:'Frases de 3 palavras (meses)', tp:'num', mn:0, mx:60}
            ]},
            { ic:'👶', tt:'Comportamento Inicial', col:'social_emocional', g2:[
                {id:'dfr', lb:'Estado do desfralde', tp:'sel', op:DESFR, full:1},
                {id:'dfm', lb:'Idade do desfralde (observações)', tp:'ta', full:1},
                {id:'xix', lb:'Fez/faz xixi na cama?', tp:'sn_ta', full:1},
                {id:'dif', lb:'Dificuldades iniciais', tp:'cks', its:DIF_BEBE, full:1},
                {id:'rep', lb:'Comportamentos repetitivos', tp:'cks', its:COMP_REP, full:1}
            ]},
            { ic:'🏫', tt:'Histórico Escolar', col:'historico_escolar', g2:[
                {id:'aes', lb:'Adaptação ao ambiente escolar', tp:'sel', op:ADAPT_ESC},
                {id:'aeo', lb:'Observações sobre adaptação', tp:'ta', full:1},
                {id:'alf', lb:'Processo de alfabetização', tp:'sel', op:ALFAB},
                {id:'alo', lb:'Observações sobre alfabetização', tp:'ta', full:1},
                {id:'ser', lb:'Ano escolar / série atual', tp:'text'},
                {id:'apr', lb:'Aproveitamento escolar', tp:'sel', op:APROVEIT},
                {id:'apo', lb:'Observações sobre desempenho', tp:'ta', full:1}
            ]},
            { ic:'🤝', tt:'Comportamento e Perfil Social', col:'social_emocional', g2:[
                {id:'prs', lb:'Perfil social (tímida ou falante)', tp:'sel', op:PERFIL_SOC},
                {id:'tmp', lb:'Temperamento (calma ou irritada)', tp:'sel', op:TEMPER},
                {id:'rpr', lb:'Prefere ficar sozinha? Tem muitos amigos?', tp:'ta', full:1},
                {id:'bul', lb:'Sofre bullying?', tp:'sn_ta', full:1},
                {id:'app', lb:'Anda na ponta dos pés?', tp:'sn'}
            ]},
            { ic:'🌈', tt:'Perfil Sensorial', col:'social_emocional', g2:[
                {id:'etq', lb:'Etiquetas de roupa o incomodam?', tp:'sn'},
                {id:'bar', lb:'Barulho o incomoda? Tapa os ouvidos?', tp:'sn_ta', full:1},
                {id:'ali', lb:'Como é a alimentação?', tp:'sel', op:SELET},
                {id:'alo', lb:'Observações sobre alimentação', tp:'ta', full:1}
            ]},
            { ic:'🎨', tt:'Interesses e Lazer', col:'social_emocional', g2:[
                {id:'hbb', lb:'Hobbies (leitura, jogos, filmes, músicas)', tp:'ta', full:1},
                {id:'hpf', lb:'Hiperfocos / interesses muito intensos', tp:'sn_ta', full:1, ph:'Ex.: animais, geografia, história, carros, medicina, astrologia...'},
                {id:'brk', lb:'Brinca normalmente com brinquedos?', tp:'ta', full:1}
            ]},
            { ic:'💙', tt:'Saúde Mental', col:'social_emocional', g2:[
                {id:'tho', lb:'Traços de humor', tp:'cks', its:TRACOS_HUM, full:1},
                {id:'tho2', lb:'Observações sobre traços de humor', tp:'ta', full:1},
                {id:'cmr', lb:'Comportamento de risco (se cortar, tentativa de autoextermínio)', tp:'sn_ta', full:1}
            ]},
            secTratamentos(false, true),
            { ic:'🧹', tt:'Autocuidado', col:'social_emocional', g2:[
                {id:'rgr', lb:'Como lida com regras e responsabilidades', tp:'sel', op:REGRAS_RES},
                {id:'rgo', lb:'Observações sobre regras', tp:'ta', full:1},
                {id:'hig', lb:'Como lida com a higiene pessoal', tp:'sel', op:HIG},
                {id:'hio', lb:'Observações sobre higiene', tp:'ta', full:1}
            ]},
            secObservacoes(false)
        ]
    };

    // =======================================================================
    // FAIXA 3 — ADOLESCÊNCIA (12–18)
    // =======================================================================
    const F_ADOLESCENCIA = {
        icon:'🧒', tt:'Adolescência', rg:'12 – 18 anos',
        sects: [
            secMedico(),
            secIdentInf('Nome completo do(a) adolescente'),
            secDemanda(true),
            secHistFamiliar(),
            { ic:'🤰', tt:'Gestação e Parto', col:'desenvolvimento', g2:[
                {id:'sub', lb:'Antes da gestação, os pais usavam substâncias?', tp:'cks', its:SUBST_PAIS, full:1},
                {id:'sbo', lb:'Outras observações', tp:'ta', full:1},
                {id:'abo', lb:'A mãe já sofreu algum aborto?', tp:'sn_ta', full:1},
                {id:'pnt', lb:'Intercorrências no pré-natal', tp:'sn_ta', full:1},
                {id:'sem', lb:'Semanas de gestação ao nascer', tp:'num', mn:20, mx:45},
                {id:'par', lb:'Tipo de parto', tp:'sel_other', op:TIPO_PARTO},
                {id:'dia', lb:'Dias até a alta hospitalar', tp:'num', mn:0, mx:365},
                {id:'cmp', lb:'Complicações com a mãe no parto', tp:'sn_ta', full:1},
                {id:'cbb', lb:'Complicações com o bebê no parto', tp:'sn_ta', full:1}
            ]},
            { ic:'🌱', tt:'Desenvolvimento Inicial', col:'desenvolvimento', g2:[
                {id:'tmn', lb:'Era um bebê grande, pequeno ou normal?', tp:'sel', op:TAM_BEBE},
                {id:'tmo', lb:'Dados adicionais da caderneta (peso, APGAR...)', tp:'ta', full:1},
                {id:'d6m', lb:'Nos primeiros 6 meses, desenvolveu-se bem?', tp:'sn_ta', full:1},
                {id:'d1a', lb:'No primeiro ano, andou e falou no tempo certo?', tp:'sn_ta', full:1},
                {id:'d18', lb:'Com 1 ano e 6 meses já estava bem desenvolvido?', tp:'sn_ta', full:1}
            ]},
            { ic:'👶', tt:'Comportamento Inicial', col:'social_emocional', g2:[
                {id:'xix', lb:'Fazia xixi na cama?', tp:'sn_ta', full:1},
                {id:'mns', lb:'Tinha manias e rituais? Apego a brinquedo?', tp:'ta', full:1},
                {id:'rep', lb:'Comportamentos repetitivos', tp:'cks', its:COMP_REP, full:1}
            ]},
            { ic:'🏫', tt:'Histórico Escolar', col:'historico_escolar', g2:[
                {id:'alf', lb:'Processo de alfabetização', tp:'sel', op:ALFAB},
                {id:'alo', lb:'Observações sobre alfabetização', tp:'ta', full:1},
                {id:'fra', lb:'Está em alguma formação atualmente?', tp:'sn_ta', full:1, ph:'Se sim, qual.'},
                {id:'apr', lb:'Aproveitamento escolar', tp:'sel', op:APROVEIT},
                {id:'apo', lb:'Observações sobre desempenho', tp:'ta', full:1}
            ]},
            { ic:'🤝', tt:'Comportamento e Perfil Social', col:'social_emocional', g2:[
                {id:'prs', lb:'Perfil social (tímida ou falante)', tp:'sel', op:PERFIL_SOC},
                {id:'tmp', lb:'Temperamento (calma ou irritada)', tp:'sel', op:TEMPER},
                {id:'rpr', lb:'Prefere ficar sozinha? Tem muitos amigos?', tp:'ta', full:1},
                {id:'bul', lb:'Sofre bullying?', tp:'sn_ta', full:1}
            ]},
            { ic:'🌈', tt:'Perfil Sensorial', col:'social_emocional', g2:[
                {id:'etq', lb:'Etiquetas / peças de alça incomodam?', tp:'sn'},
                {id:'bar', lb:'Barulho o incomoda?', tp:'sn_ta', full:1},
                {id:'ali', lb:'Como é a alimentação?', tp:'sel', op:SELET},
                {id:'alo', lb:'Observações sobre alimentação', tp:'ta', full:1}
            ]},
            { ic:'🎨', tt:'Interesses e Lazer', col:'social_emocional', g2:[
                {id:'hbb', lb:'Hobbies (leitura, jogos, filmes, músicas)', tp:'ta', full:1},
                {id:'hpf', lb:'Hiperfocos / interesses muito intensos', tp:'sn_ta', full:1},
                {id:'evt', lb:'Habilidade social — gosta de festas e eventos?', tp:'sel', op:HABIL_EV},
                {id:'evo', lb:'Observações sobre socialização', tp:'ta', full:1}
            ]},
            { ic:'💙', tt:'Saúde Mental', col:'social_emocional', g2:[
                {id:'tho', lb:'Traços de humor', tp:'cks', its:TRACOS_HUM, full:1},
                {id:'tho2', lb:'Observações', tp:'ta', full:1},
                {id:'cmr', lb:'Comportamento de risco (autoextermínio, se cortar)', tp:'sn_ta', full:1}
            ]},
            secTratamentos(true, false),
            { ic:'🧹', tt:'Autocuidado', col:'social_emocional', g2:[
                {id:'rgr', lb:'Como lida com regras e responsabilidades', tp:'sel', op:REGRAS_RES},
                {id:'rgo', lb:'Observações', tp:'ta', full:1},
                {id:'hig', lb:'Como lida com a higiene pessoal', tp:'sel', op:HIG},
                {id:'hio', lb:'Observações', tp:'ta', full:1}
            ]},
            secObservacoes(false)
        ]
    };

    // =======================================================================
    // FAIXA 4 — JOVENS ADULTOS (18–50)
    // =======================================================================
    const F_JOVENS_ADULTOS = {
        icon:'🧑', tt:'Jovens Adultos', rg:'18 – 50 anos',
        sects: [
            secMedico(),
            secIdentAdu(),
            secDemanda(true),
            secHistFamiliar(),
            { ic:'🌱', tt:'Histórico do Desenvolvimento', col:'desenvolvimento', g2:[
                {id:'sub', lb:'Antes da gestação, os pais usavam substâncias?', tp:'cks', its:SUBST_PAIS, full:1},
                {id:'sbo', lb:'Outras observações', tp:'ta', full:1},
                {id:'ris', lb:'Foi uma gestação de risco?', tp:'sn_ta', full:1},
                {id:'sem', lb:'Meses de gestação ao nascer', tp:'num', mn:5, mx:11, ph:'Ex.: 9'},
                {id:'par', lb:'Tipo de parto', tp:'sel_other', op:TIPO_PARTO},
                {id:'cmp', lb:'Complicações com a mãe no parto', tp:'sn_ta', full:1},
                {id:'cbb', lb:'Complicações com o bebê no parto', tp:'sn_ta', full:1},
                {id:'tmn', lb:'Era um bebê grande, pequeno ou normal?', tp:'sel', op:TAM_BEBE},
                {id:'tmo', lb:'Dados adicionais da caderneta', tp:'ta', full:1},
                {id:'d18', lb:'Nos primeiros 18 anos, desenvolveu-se bem?', tp:'sn_ta', full:1}
            ]},
            { ic:'🤝', tt:'Comportamento ao Longo da Vida', col:'social_emocional', g2:[
                {id:'prs', lb:'Era uma pessoa tímida ou falante?', tp:'sel', op:PERFIL_SOC},
                {id:'pro', lb:'Observações', tp:'ta', full:1},
                {id:'amg', lb:'Possui amigos?', tp:'sn_ta', full:1}
            ]},
            { ic:'🎓', tt:'Histórico Escolar e Formação', col:'historico_escolar', g2:[
                {id:'eme', lb:'Concluiu o ensino médio?', tp:'sel', op:ENS_MED},
                {id:'emo', lb:'Observações', tp:'ta', full:1},
                {id:'sup', lb:'Possui formação superior?', tp:'sn_ta', full:1, ph:'Se sim, descreva (curso, instituição, ano).'}
            ]},
            { ic:'💼', tt:'Desenvolvimento Profissional', col:'historico_escolar', g2:[
                {id:'prf', lb:'Profissão atual e tempo na área', tp:'ta', full:1},
                {id:'amb', lb:'Gosta do ambiente de trabalho?', tp:'sel', op:SATIS_TRAB},
                {id:'amo', lb:'Observações sobre o trabalho', tp:'ta', full:1},
                {id:'amz', lb:'Cultiva amizades no trabalho?', tp:'sn_ta', full:1}
            ]},
            { ic:'👨‍👩‍👧', tt:'Família', col:'identificacao', g2:[
                {id:'ec',  lb:'Estado civil', tp:'sel_other', op:EST_CIVIL},
                {id:'fil', lb:'Possui filhos?', tp:'sn'},
                {id:'fln', lb:'Quantos filhos', tp:'num', mn:0, mx:20},
                {id:'flt', lb:'Algum dos filhos tem transtorno diagnosticado? Descreva.', tp:'ta', full:1}
            ]},
            { ic:'🌈', tt:'Perfil Sensorial', col:'social_emocional', g2:[
                {id:'etq', lb:'Etiquetas / peças de alça incomodam?', tp:'sn'},
                {id:'bar', lb:'Barulho o incomoda?', tp:'sn_ta', full:1},
                {id:'ali', lb:'Como é a alimentação?', tp:'sel', op:SELET},
                {id:'alo', lb:'Observações', tp:'ta', full:1}
            ]},
            { ic:'🎨', tt:'Interesses e Lazer', col:'social_emocional', g2:[
                {id:'hbb', lb:'Hobbies', tp:'ta', full:1},
                {id:'hpf', lb:'Hiperfocos / interesses muito intensos', tp:'sn_ta', full:1},
                {id:'evt', lb:'Habilidade social — gosta de festas e eventos?', tp:'sel', op:HABIL_EV},
                {id:'evo', lb:'Observações', tp:'ta', full:1}
            ]},
            secTratamentos(true, false),
            { ic:'🧹', tt:'Autocuidado e Autonomia', col:'social_emocional', g2:[
                {id:'hig', lb:'Como lida com a higiene pessoal', tp:'sel', op:HIG},
                {id:'hio', lb:'Observações', tp:'ta', full:1},
                {id:'rgr', lb:'Como lida com regras e responsabilidades', tp:'sel', op:REGRAS_RES},
                {id:'rgo', lb:'Observações', tp:'ta', full:1},
                {id:'aut', lb:'Independência para atividades diárias', tp:'sel', op:AUTON},
                {id:'auo', lb:'Observações', tp:'ta', full:1}
            ]},
            { ic:'💙', tt:'Saúde Mental', col:'social_emocional', g2:[
                {id:'iso', lb:'Isolamento social intenso ou mudanças de humor acentuadas?', tp:'sn_ta', full:1},
                {id:'cmr', lb:'Comportamento de risco (autoextermínio, se cortar)', tp:'sn_ta', full:1}
            ]},
            secObservacoes(true)
        ]
    };

    // =======================================================================
    // FAIXA 5 — 50+
    // =======================================================================
    const F_CINQUENTA_MAIS = {
        icon:'🧓', tt:'50+ anos', rg:'50 anos ou mais',
        sects: [
            secMedico(),
            secIdentAdu(),
            secDemanda(true),
            secHistFamiliar(),
            { ic:'🌱', tt:'Histórico do Desenvolvimento', col:'desenvolvimento', g2:[
                {id:'sub', lb:'Antes da gestação, os pais usavam Cigarro ou Álcool?', tp:'cks', its:['Cigarro','Álcool'], full:1},
                {id:'ris', lb:'Foi uma gestação tranquila? Mãe quase perdeu por algum motivo?', tp:'sn_ta', full:1},
                {id:'tmp', lb:'Nasceu no tempo certo?', tp:'sn_ta', full:1},
                {id:'par', lb:'Tipo de parto', tp:'sel_other', op:TIPO_PARTO},
                {id:'cmp', lb:'Complicações com a mãe no parto', tp:'sn_ta', full:1},
                {id:'cbb', lb:'Complicações com o bebê no parto', tp:'sn_ta', full:1},
                {id:'d18', lb:'Nos primeiros 18 anos, desenvolveu-se bem?', tp:'sn_ta', full:1}
            ]},
            { ic:'🤝', tt:'Comportamento ao Longo da Vida', col:'social_emocional', g2:[
                {id:'prs', lb:'Era uma pessoa tímida ou falante?', tp:'sel', op:PERFIL_SOC},
                {id:'pro', lb:'Observações', tp:'ta', full:1},
                {id:'amg', lb:'Possui amigos? Interage bem com familiares?', tp:'sn_ta', full:1}
            ]},
            { ic:'🎓', tt:'Histórico Escolar e Formação', col:'historico_escolar', g2:[
                {id:'eme', lb:'Concluiu o ensino médio?', tp:'sel', op:ENS_MED},
                {id:'emo', lb:'Observações', tp:'ta', full:1},
                {id:'sup', lb:'Possui formação superior?', tp:'sn_ta', full:1}
            ]},
            { ic:'💼', tt:'Desenvolvimento Profissional', col:'historico_escolar', g2:[
                {id:'prv', lb:'Qual segmento trabalhou a vida toda?', tp:'ta', full:1},
                {id:'sit', lb:'Aposentou ou trabalha ainda?', tp:'sel', op:SITU_TRAB},
                {id:'sio', lb:'Observações', tp:'ta', full:1}
            ]},
            { ic:'👨‍👩‍👧', tt:'Família', col:'identificacao', g2:[
                {id:'ec',  lb:'Estado civil', tp:'sel_other', op:EST_CIVIL},
                {id:'fil', lb:'Possui filhos?', tp:'sn'},
                {id:'fln', lb:'Quantos filhos', tp:'num', mn:0, mx:20},
                {id:'flt', lb:'Algum dos filhos tem transtorno diagnosticado?', tp:'ta', full:1}
            ]},
            { ic:'🌈', tt:'Perfil Social', col:'social_emocional', g2:[
                {id:'int', lb:'É uma pessoa intolerante?', tp:'sn_ta', full:1},
                {id:'bar', lb:'Barulho o incomoda?', tp:'sn_ta', full:1},
                {id:'ali', lb:'A alimentação é boa?', tp:'sel', op:ALIM_QUAL},
                {id:'alo', lb:'Observações', tp:'ta', full:1}
            ]},
            { ic:'🎨', tt:'Interesses e Lazer', col:'social_emocional', g2:[
                {id:'hbb', lb:'Atividades de lazer / o que gosta de fazer', tp:'ta', full:1},
                {id:'hpf', lb:'Hiperfocos / interesses muito intensos', tp:'sn_ta', full:1},
                {id:'evt', lb:'Habilidade social — gosta de festas e eventos?', tp:'sel', op:HABIL_EV},
                {id:'evo', lb:'Observações', tp:'ta', full:1}
            ]},
            secTratamentos(true, false),
            { ic:'🧹', tt:'Autocuidado e Autonomia', col:'social_emocional', g2:[
                {id:'hig', lb:'Como lida com a higiene pessoal', tp:'sel', op:HIG},
                {id:'hio', lb:'Observações', tp:'ta', full:1},
                {id:'rgr', lb:'Como lida com regras e responsabilidades', tp:'sel', op:REGRAS_RES},
                {id:'rgo', lb:'Observações', tp:'ta', full:1},
                {id:'aut', lb:'Independência para atividades diárias', tp:'sel', op:AUTON},
                {id:'auo', lb:'Observações', tp:'ta', full:1}
            ]},
            { ic:'💙', tt:'Saúde Mental', col:'social_emocional', g2:[
                {id:'iso', lb:'Isolamento social ou mudanças de humor acentuadas?', tp:'sn_ta', full:1},
                {id:'cmr', lb:'Comportamento de risco (autoextermínio, se cortar)', tp:'sn_ta', full:1}
            ]},
            secObservacoes(true)
        ]
    };

    // -----------------------------------------------------------------------
    // Mapa de faixas — chaves novas
    // -----------------------------------------------------------------------
    const F = {
        'primeira_infancia': F_PRIMEIRA_INFANCIA,
        'segunda_infancia':  F_SEGUNDA_INFANCIA,
        'adolescencia':      F_ADOLESCENCIA,
        'jovens_adultos':    F_JOVENS_ADULTOS,
        'cinquenta_mais':    F_CINQUENTA_MAIS
    };

    /**
     * Detecta a faixa etária com base na idade em anos.
     */
    function detectarFaixa(idadeAnos) {
        if (idadeAnos === null || idadeAnos === undefined) return 'jovens_adultos';
        if (idadeAnos < 6)  return 'primeira_infancia';
        if (idadeAnos < 12) return 'segunda_infancia';
        if (idadeAnos < 18) return 'adolescencia';
        if (idadeAnos < 50) return 'jovens_adultos';
        return 'cinquenta_mais';
    }

    function listarFaixas() {
        return Object.entries(F).map(([key, fx]) => ({
            key: key,
            label: `${fx.icon} ${fx.tt} (${fx.rg})`
        }));
    }

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

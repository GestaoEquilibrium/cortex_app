// ============================================================================
// CORTEX_APP — Sprint 55 — forms.js
// Anamneses 3.0 — texto livre, fiéis aos docx oficiais (Google Forms).
// ============================================================================
// Mudanças em relação à Sprint 18 v2:
//
//   1. Identificação do paciente, médico solicitante, clínica/telefone do
//      médico, pais, cidade — NÃO são mais perguntados na anamnese: vêm do
//      cadastro do paciente (renderizados no topo via bloco read-only no
//      anamnese.js).
//
//   2. Tipos antigos (sn, sn_ta, sel, sel_other, cks, num) foram trocados
//      por 'ta' (textarea), com poucas exceções (date, text curto).
//      Filosofia: respostas mais ricas, sem forçar enquadramento.
//
//   3. Cada formulário começa com uma seção 'Boas-vindas' (tipo 'info',
//      texto LGPD/CFP retirado dos docx) read-only — não salva no banco.
//
//   4. Faixas (chaves mantidas para compatibilidade com o enum):
//        primeira_infancia  (0–6)
//        segunda_infancia   (6–12)
//        adolescencia       (12–18)
//        jovens_adultos     (18–50)
//        cinquenta_mais     (50+)
//
// DSL preservado — anamnese.js / publica.js / pdf.js não precisam mudar
// além do suporte ao novo tipo 'info' (já adicionado nesta sprint).
// ============================================================================

window.CortexAnamneseForms = (function() {
    'use strict';

    // -----------------------------------------------------------------------
    // Texto de boas-vindas (idêntico aos docx oficiais)
    // -----------------------------------------------------------------------
    const HTML_BOAS_VINDAS = `
        <div class="anamnese-bv">
            <p><strong>Olá, seja muito bem-vindo(a)!</strong></p>
            <p>Sabemos que a decisão de buscar uma avaliação é um passo importante, e
            agradecemos a sua confiança em nosso trabalho.</p>
            <p>Este formulário foi pensado como o nosso primeiro contato para
            conhecermos, com cuidado e atenção, a história de quem será avaliado.
            Suas respostas são como um mapa inicial que nos guiará durante nossa
            conversa, permitindo que nosso encontro seja mais profundo e focado em
            <strong>acolher suas preocupações e traçar o melhor plano de ação.</strong></p>
            <p>Sinta-se seguro(a) e à vontade ao responder. Todas as informações são
            protegidas por <strong>sigilo profissional absoluto</strong>, conforme a
            Lei Geral de Proteção de Dados (LGPD), e nosso trabalho é pautado pelo
            compromisso ético e técnico com as diretrizes do Conselho Federal de
            Psicologia.</p>
            <p>Por favor, percorra o questionário até o fim, mas não se preocupe se
            alguma pergunta não fizer sentido para sua história; basta seguir
            adiante.</p>
            <p class="anamnese-bv-conv"><em>Vamos começar esta jornada juntos?</em></p>
        </div>
    `;

    // -----------------------------------------------------------------------
    // Helpers reutilizáveis
    // -----------------------------------------------------------------------
    function secBoasVindas() {
        // Seção informativa: não salva nada no banco (sem col).
        return {
            ic: '👋',
            tt: 'Boas-vindas',
            // sem col → renderiza, não salva
            g2: [
                { tp: 'info', html: HTML_BOAS_VINDAS }
            ]
        };
    }

    function secResumoCadastro() {
        // Pergunta a relação do respondente + data da avaliação.
        // O resto da "identificação" sai do cadastro (renderizado no topo
        // do wizard pelo anamnese.js).
        return {
            ic: '📋',
            tt: 'Sobre esta entrevista',
            col: 'identificacao',
            g2: [
                { id:'rel', lb:'Qual a sua relação com a pessoa avaliada?',
                  tp:'ta', full:1,
                  ph:'Ex.: sou a mãe / sou o próprio avaliando / sou cônjuge / sou cuidador(a) responsável...' },
                { id:'ava', lb:'Data da entrevista', tp:'date', today:1 }
            ]
        };
    }

    function secMotivo() {
        return {
            ic: '🎯',
            tt: 'Motivo da avaliação',
            col: 'queixa_historico',
            g2: [
                { id:'mot', lb:'Descreva em detalhes o motivo, as principais preocupações ou dificuldades que motivaram a busca por esta avaliação',
                  tp:'ta', full:1, req:1,
                  ph:'Descreva com suas palavras, sem se preocupar com termos técnicos.' }
            ]
        };
    }

    function secImpacto() {
        return {
            ic: '🌍',
            tt: 'Impacto na vida diária',
            col: 'queixa_historico',
            g2: [
                { id:'imp', lb:'Qual o impacto dessas dificuldades na vida diária (na escola, no trabalho, nas relações sociais, na autonomia, no bem-estar emocional)?',
                  tp:'ta', full:1,
                  ph:'Conte como o cotidiano é afetado.' }
            ]
        };
    }

    function secHistFamiliar() {
        return {
            ic: '🧬',
            tt: 'Histórico familiar',
            col: 'contexto_familiar',
            g2: [
                { id:'hf', lb:'Na família em geral, existem históricos de transtornos cognitivos? (TDAH, Autismo, Dislexia, Demência, Alzheimer, Depressão, Ansiedade, Bipolaridade, Esquizofrenia...)',
                  tp:'ta', full:1,
                  ph:'Liste quem (mãe, pai, irmão, tio, avó) e o que cada um tem ou já teve.' }
            ]
        };
    }

    function secObservacoesFinais(comEvento) {
        const lb = comEvento
            ? 'Existe algum evento marcante em sua vida? Existe alguma informação que você julga importante e que não foi perguntada? Descreva aqui!'
            : 'Existe alguma informação que você julga importante e que não foi perguntada? Descreva aqui!';
        return {
            ic: '📝',
            tt: 'Observações finais',
            col: 'queixa_historico',
            g2: [
                { id:'obs', lb: lb, tp:'ta', full:1,
                  ph:'Use este espaço para tudo que considerar relevante.' }
            ]
        };
    }

    // =======================================================================
    // FAIXA 1 — PRIMEIRA INFÂNCIA (0–6) — fonte: ANAMNESE_I.docx
    // =======================================================================
    const F_PRIMEIRA_INFANCIA = {
        icon: '🍼', tt: 'Primeira Infância', rg: '0 – 6 anos',
        sects: [
            secBoasVindas(),
            secResumoCadastro(),
            secMotivo(),
            secHistFamiliar(),

            { ic:'🌱', tt:'Gestação e parto', col:'desenvolvimento', g2:[
                { id:'subs', lb:'Antes da gestação, os pais eram dependentes químicos? (Ex.: Maconha, Cocaína, Crack, Álcool)',
                  tp:'ta', full:1 },
                { id:'abo', lb:'A mãe já sofreu algum aborto?',
                  tp:'ta', full:1 },
                { id:'pnt', lb:'Durante o pré-natal, houve alguma intercorrência considerada de risco, infecções, estresse intenso?',
                  tp:'ta', full:1 },
                { id:'sem', lb:'Com quantas semanas/meses de gestação a criança nasceu?',
                  tp:'ta', full:1 },
                { id:'par', lb:'O parto foi normal ou cesárea? A alta foi quantos dias após o parto?',
                  tp:'ta', full:1 },
                { id:'cmp_m', lb:'Houve alguma complicação com a mãe no dia do parto (pressão alta ou pré-eclâmpsia)?',
                  tp:'ta', full:1 },
                { id:'cmp_b', lb:'Houve alguma complicação com o bebê no dia do parto (falta de oxigênio, necessidade de UTI, etc.)?',
                  tp:'ta', full:1 }
            ]},

            { ic:'📔', tt:'Caderneta da criança', col:'desenvolvimento', g2:[
                { id:'cdrn', lb:'Olhe na Caderneta da Criança: pontos do APGAR (5 min e 10 min), peso, comprimento, perímetro cefálico',
                  tp:'ta', full:1,
                  ph:'Se não tiver a caderneta, deixe em branco.' }
            ]},

            { ic:'📈', tt:'Marcos do desenvolvimento', col:'desenvolvimento', g2:[
                { id:'mc1', lb:'Com quantos meses aproximado firmou o pescoço?', tp:'ta', full:1 },
                { id:'mc2', lb:'Com quantos meses aproximado engatinhou?',         tp:'ta', full:1 },
                { id:'mc3', lb:'Com quantos meses aproximado andou?',              tp:'ta', full:1 },
                { id:'mc4', lb:'Com quantos meses aproximado balbuciou (gugu dadá)?', tp:'ta', full:1 },
                { id:'mc5', lb:'Com quantos meses aproximado falou as primeiras palavras?', tp:'ta', full:1 },
                { id:'mc6', lb:'Quando começou a formar frases de três palavras? (Ex.: "Mamãe me dá água!")', tp:'ta', full:1 },
                { id:'dfr', lb:'Já foi desfraldado? Faz xixi na cama?', tp:'ta', full:1 }
            ]},

            { ic:'🧒', tt:'Comportamento', col:'social_emocional', g2:[
                { id:'tmp', lb:'Era uma criança calma ou irritada? Apresentava dificuldades para dormir, se alimentar ou lidar com mudanças de rotina?',
                  tp:'ta', full:1 },
                { id:'soc', lb:'Como é a relação com outras crianças? Preferência por brincadeiras solitárias, é mais retraído?',
                  tp:'ta', full:1 },
                { id:'rep', lb:'Apresenta comportamentos repetitivos (balançar mãos, dar pulinhos, girar em torno de si mesmo)?',
                  tp:'ta', full:1 },
                { id:'pp',  lb:'Em alguns momentos, anda na ponta dos pés?',
                  tp:'ta', full:1 },
                { id:'fal', lb:'A fala é desenvolvida? Repete palavras que ouviu de maneira aleatória?',
                  tp:'ta', full:1 },
                { id:'brk', lb:'Brinca de maneira normal com os brinquedos? Ou prefere objetos aleatórios?',
                  tp:'ta', full:1 }
            ]},

            { ic:'⭐', tt:'Interesses', col:'social_emocional', g2:[
                { id:'hpf', lb:'Possui interesses muito intensos e específicos (hiperfoco em animais, carros, coisas excêntricas, medicina, astronomia, dinossauros, personagens)?',
                  tp:'ta', full:1 }
            ]},

            { ic:'🌈', tt:'Perfil sensorial', col:'social_emocional', g2:[
                { id:'ali', lb:'Como é a alimentação? Come de tudo que lhe é oferecido ou é seletivo? Mistura a comida?',
                  tp:'ta', full:1 },
                { id:'etq', lb:'Etiquetas de roupa o incomodam?',
                  tp:'ta', full:1 },
                { id:'bar', lb:'Barulho o incomoda? Tapa os ouvidos ao ouvir sons estridentes?',
                  tp:'ta', full:1 }
            ]},

            { ic:'🏫', tt:'Adaptação escolar', col:'historico_escolar', g2:[
                { id:'aes', lb:'Como foi o processo de adaptação no ambiente escolar? Ocorreu com facilidade ou houve resistência?',
                  tp:'ta', full:1 }
            ]},

            { ic:'💊', tt:'Tratamentos e acompanhamentos', col:'saude_medicacoes', g2:[
                { id:'dgn', lb:'Possui algum tipo de diagnóstico?',
                  tp:'ta', full:1 },
                { id:'acm', lb:'Faz acompanhamento com Psicólogo, Psiquiatra ou Neurologista? Há quanto tempo?',
                  tp:'ta', full:1 },
                { id:'opf', lb:'Faz acompanhamento com outros profissionais de saúde? (fono, TO, fisio, pediatra...)',
                  tp:'ta', full:1 },
                { id:'mdc', lb:'Faz uso de medicação de uso contínuo? Qual a dosagem?',
                  tp:'ta', full:1 }
            ]},

            secObservacoesFinais(false)
        ]
    };

    // =======================================================================
    // FAIXA 2 — SEGUNDA INFÂNCIA (6–12) — fonte: ANAMNESE_II.docx
    // =======================================================================
    const F_SEGUNDA_INFANCIA = {
        icon: '🎒', tt: 'Segunda Infância', rg: '6 – 12 anos',
        sects: [
            secBoasVindas(),
            secResumoCadastro(),
            secMotivo(),
            secImpacto(),
            secHistFamiliar(),

            { ic:'🌱', tt:'Gestação e parto', col:'desenvolvimento', g2:[
                { id:'subs', lb:'Antes da gestação, os pais eram dependentes químicos? (Ex.: Maconha, Cocaína, Crack, Álcool)',
                  tp:'ta', full:1 },
                { id:'abo',  lb:'A mãe já sofreu algum aborto?',
                  tp:'ta', full:1 },
                { id:'pnt',  lb:'Durante o pré-natal, houve alguma intercorrência considerada de risco, infecções, estresse intenso?',
                  tp:'ta', full:1 },
                { id:'sem',  lb:'Com quantas semanas/meses de gestação a criança nasceu?',
                  tp:'ta', full:1 },
                { id:'par',  lb:'O parto foi normal ou cesárea? A alta foi quantos dias após o parto?',
                  tp:'ta', full:1 },
                { id:'cmp_m', lb:'Houve alguma complicação com a mãe no dia do parto (pressão alta ou pré-eclâmpsia)?',
                  tp:'ta', full:1 },
                { id:'cmp_b', lb:'Houve alguma complicação com o bebê no dia do parto (falta de oxigênio, necessidade de UTI, etc.)?',
                  tp:'ta', full:1 }
            ]},

            { ic:'📔', tt:'Caderneta da criança', col:'desenvolvimento', g2:[
                { id:'cdrn', lb:'Olhe na Caderneta da Criança: pontos do APGAR (5 min e 10 min), peso, comprimento, perímetro cefálico. Caso não possua a caderneta, informe se era um bebê grande, pequeno ou normal.',
                  tp:'ta', full:1 }
            ]},

            { ic:'📈', tt:'Marcos do desenvolvimento', col:'desenvolvimento', g2:[
                { id:'mc1', lb:'Com quantos meses aproximado firmou o pescoço?', tp:'ta', full:1 },
                { id:'mc2', lb:'Com quantos meses aproximado engatinhou?',        tp:'ta', full:1 },
                { id:'mc3', lb:'Com quantos meses aproximado andou?',             tp:'ta', full:1 },
                { id:'mc4', lb:'Com quantos meses aproximado balbuciou (gugu dadá)?', tp:'ta', full:1 },
                { id:'mc5', lb:'Com quantos meses aproximado falou as primeiras palavras?', tp:'ta', full:1 },
                { id:'mc6', lb:'Quando começou a formar frases de três palavras?', tp:'ta', full:1 }
            ]},

            { ic:'👶', tt:'Comportamento inicial', col:'social_emocional', g2:[
                { id:'dfr', lb:'Com quantos meses aproximado foi desfraldado durante o dia e a noite?',
                  tp:'ta', full:1 },
                { id:'xix', lb:'Fez xixi na cama?',
                  tp:'ta', full:1 },
                { id:'dif', lb:'Apresentava dificuldades para dormir, se alimentar ou lidar com mudanças de rotina?',
                  tp:'ta', full:1 },
                { id:'rep', lb:'Apresenta comportamentos repetitivos (andar na ponta dos pés, balançar as mãos, dar pulinhos, girar em torno de si mesmo)?',
                  tp:'ta', full:1 }
            ]},

            { ic:'🏫', tt:'Vida escolar', col:'historico_escolar', g2:[
                { id:'aes', lb:'Como foi o processo de adaptação no ambiente escolar? Ocorreu com facilidade ou houve resistência?',
                  tp:'ta', full:1 },
                { id:'alf', lb:'Como foi o processo de alfabetização?',
                  tp:'ta', full:1 },
                { id:'ser', lb:'Qual ano escolar / série ele está?',
                  tp:'ta', full:1 },
                { id:'apr', lb:'Como está o desempenho escolar? E as notas? Baixas, médias ou altas?',
                  tp:'ta', full:1 }
            ]},

            { ic:'🤝', tt:'Comportamento e perfil social', col:'social_emocional', g2:[
                { id:'prs', lb:'É uma criança tímida ou falante?',
                  tp:'ta', full:1 },
                { id:'tmp', lb:'Era uma criança calma ou irritada?',
                  tp:'ta', full:1 },
                { id:'amg', lb:'Prefere ficar sozinha? Tem muitos amigos?',
                  tp:'ta', full:1 },
                { id:'bul', lb:'Sofre bullying?',
                  tp:'ta', full:1 },
                { id:'pp',  lb:'Em alguns momentos, anda na ponta dos pés?',
                  tp:'ta', full:1 }
            ]},

            { ic:'🌈', tt:'Perfil sensorial', col:'social_emocional', g2:[
                { id:'etq', lb:'Etiquetas de roupa o incomodam?',
                  tp:'ta', full:1 },
                { id:'bar', lb:'Barulho o incomoda? Tapa os ouvidos ao ouvir sons estridentes?',
                  tp:'ta', full:1 },
                { id:'ali', lb:'Como é a alimentação? Come de tudo que lhe é oferecido ou é seletivo? Mistura a comida?',
                  tp:'ta', full:1 }
            ]},

            { ic:'🎨', tt:'Hobbies e interesses', col:'social_emocional', g2:[
                { id:'hbb', lb:'Possui algum hobby? Leitura, jogos, filmes, músicas? Qual faz com mais frequência?',
                  tp:'ta', full:1 },
                { id:'hpf', lb:'Possui interesses muito intensos e específicos (hiperfoco em animais, geografia, história, carros, motores, coisas excêntricas, medicina, astrologia, física)?',
                  tp:'ta', full:1 },
                { id:'brk', lb:'Brinca de maneira normal com os brinquedos? Ou prefere objetos aleatórios?',
                  tp:'ta', full:1 }
            ]},

            { ic:'💙', tt:'Saúde mental', col:'social_emocional', g2:[
                { id:'tho', lb:'Você percebe traços de Depressão ou Ansiedade?',
                  tp:'ta', full:1 },
                { id:'cmr', lb:'Houve algum comportamento de risco, como se cortar, tentativa de autoextermínio?',
                  tp:'ta', full:1 }
            ]},

            { ic:'💊', tt:'Tratamentos e acompanhamentos', col:'saude_medicacoes', g2:[
                { id:'dgn', lb:'Possui algum tipo de diagnóstico?',
                  tp:'ta', full:1 },
                { id:'acm', lb:'Faz acompanhamento com Psicólogo, Psiquiatra ou Neurologista? Há quanto tempo?',
                  tp:'ta', full:1 },
                { id:'opf', lb:'Faz acompanhamento com outros profissionais de saúde?',
                  tp:'ta', full:1 },
                { id:'mdc', lb:'Faz uso de medicação de uso contínuo? Qual a dosagem?',
                  tp:'ta', full:1 }
            ]},

            { ic:'🧹', tt:'Autocuidado', col:'social_emocional', g2:[
                { id:'rgr', lb:'Como lida com regras e responsabilidades?',
                  tp:'ta', full:1 },
                { id:'hig', lb:'Como lida com a higiene pessoal?',
                  tp:'ta', full:1 }
            ]},

            secObservacoesFinais(false)
        ]
    };

    // =======================================================================
    // FAIXA 3 — ADOLESCÊNCIA (12–18) — fonte: ANAMNESE_III.docx
    // =======================================================================
    const F_ADOLESCENCIA = {
        icon: '🧑‍🎓', tt: 'Adolescência', rg: '12 – 18 anos',
        sects: [
            secBoasVindas(),
            secResumoCadastro(),
            secMotivo(),
            secImpacto(),
            secHistFamiliar(),

            { ic:'🌱', tt:'Gestação e parto', col:'desenvolvimento', g2:[
                { id:'subs', lb:'Antes da gestação, os pais eram dependentes químicos? (Ex.: Maconha, Cocaína, Crack, Álcool)',
                  tp:'ta', full:1 },
                { id:'abo',  lb:'A mãe já sofreu algum aborto?',
                  tp:'ta', full:1 },
                { id:'pnt',  lb:'Durante o pré-natal, houve alguma intercorrência considerada de risco, infecções, estresse intenso?',
                  tp:'ta', full:1 },
                { id:'sem',  lb:'Com quantas semanas/meses de gestação a criança nasceu?',
                  tp:'ta', full:1 },
                { id:'par',  lb:'O parto foi normal ou cesárea? A alta foi quantos dias após o parto?',
                  tp:'ta', full:1 },
                { id:'cmp_m', lb:'Houve alguma complicação com a mãe no dia do parto (pressão alta ou pré-eclâmpsia)?',
                  tp:'ta', full:1 },
                { id:'cmp_b', lb:'Houve alguma complicação com o bebê no dia do parto (falta de oxigênio, necessidade de UTI, etc.)?',
                  tp:'ta', full:1 },
                { id:'bbb',  lb:'Era um bebê grande, pequeno ou normal? (Se tiver os dados na caderneta de nascimento pode acrescentar: peso, centímetros, APGAR.)',
                  tp:'ta', full:1 }
            ]},

            { ic:'📈', tt:'Desenvolvimento inicial', col:'desenvolvimento', g2:[
                { id:'d6m', lb:'Nos primeiros 6 meses de vida, desenvolveu-se bem?',
                  tp:'ta', full:1 },
                { id:'d1a', lb:'No primeiro ano, andou e falou no tempo certo?',
                  tp:'ta', full:1 },
                { id:'d18m', lb:'Com 1 ano e 6 meses já estava bem desenvolvido, falante ou ainda não?',
                  tp:'ta', full:1 }
            ]},

            { ic:'👶', tt:'Comportamento inicial', col:'social_emocional', g2:[
                { id:'xix', lb:'Fazia xixi na cama?',
                  tp:'ta', full:1 },
                { id:'mns', lb:'Tinha manias e rituais nas atividades diárias? Gostava muito de determinado brinquedo?',
                  tp:'ta', full:1 },
                { id:'rep', lb:'Apresenta comportamentos repetitivos (andar na ponta dos pés, balançar as mãos, dar pulinhos, girar em torno de si mesmo)?',
                  tp:'ta', full:1 }
            ]},

            { ic:'🏫', tt:'Vida escolar e formação', col:'historico_escolar', g2:[
                { id:'alf', lb:'Como foi o processo de alfabetização?',
                  tp:'ta', full:1 },
                { id:'fra', lb:'Atualmente está em alguma formação?',
                  tp:'ta', full:1 },
                { id:'apr', lb:'Me fale do desempenho escolar, as notas: baixas, médias ou altas?',
                  tp:'ta', full:1 }
            ]},

            { ic:'🤝', tt:'Comportamento e perfil social', col:'social_emocional', g2:[
                { id:'prs', lb:'É uma pessoa tímida ou falante?',
                  tp:'ta', full:1 },
                { id:'tmp', lb:'Foi uma criança calma ou irritada?',
                  tp:'ta', full:1 },
                { id:'amg', lb:'Prefere ficar sozinha? Tem muitos amigos?',
                  tp:'ta', full:1 },
                { id:'bul', lb:'Sofre bullying?',
                  tp:'ta', full:1 },
                { id:'evt', lb:'Como é a habilidade social? Gosta de sair para festas e eventos?',
                  tp:'ta', full:1 }
            ]},

            { ic:'🌈', tt:'Perfil sensorial', col:'social_emocional', g2:[
                { id:'etq', lb:'Etiquetas de roupa, peças de alça a incomodam?',
                  tp:'ta', full:1 },
                { id:'bar', lb:'Barulho o incomoda? Tapa os ouvidos ao ouvir sons estridentes?',
                  tp:'ta', full:1 },
                { id:'ali', lb:'Como é a alimentação? Come de tudo que lhe é oferecido ou é seletivo? Mistura a comida?',
                  tp:'ta', full:1 }
            ]},

            { ic:'🎨', tt:'Hobbies e interesses', col:'social_emocional', g2:[
                { id:'hbb', lb:'Possui algum hobby? Leitura, jogos, filmes, músicas? Qual faz com mais frequência?',
                  tp:'ta', full:1 },
                { id:'hpf', lb:'Possui interesses muito intensos e específicos (hiperfoco em animais, geografia, história, carros, motores, coisas excêntricas, medicina, astrologia, física)?',
                  tp:'ta', full:1 }
            ]},

            { ic:'💙', tt:'Saúde mental', col:'social_emocional', g2:[
                { id:'tho', lb:'Você percebe traços de Depressão ou Ansiedade?',
                  tp:'ta', full:1 },
                { id:'cmr', lb:'Houve algum comportamento de risco, como se cortar, tentativa de autoextermínio?',
                  tp:'ta', full:1 }
            ]},

            { ic:'💊', tt:'Tratamentos e acompanhamentos', col:'saude_medicacoes', g2:[
                { id:'dgn', lb:'Possui algum tipo de diagnóstico, fez algum tratamento médico?',
                  tp:'ta', full:1 },
                { id:'acm', lb:'Faz acompanhamento com Psicólogo, Psiquiatra ou Neurologista? Há quanto tempo?',
                  tp:'ta', full:1 },
                { id:'mdc', lb:'Faz uso de medicação de uso contínuo? Qual a dosagem?',
                  tp:'ta', full:1 },
                { id:'sbs', lb:'Já fez ou faz uso de algum tipo de tóxico (maconha, cocaína, crack ou outros)?',
                  tp:'ta', full:1 }
            ]},

            { ic:'🧹', tt:'Autocuidado', col:'social_emocional', g2:[
                { id:'rgr', lb:'Como lida com regras e responsabilidades?',
                  tp:'ta', full:1 },
                { id:'hig', lb:'Como lida com a higiene pessoal?',
                  tp:'ta', full:1 }
            ]},

            secObservacoesFinais(false)
        ]
    };

    // =======================================================================
    // FAIXA 4 — JOVENS ADULTOS (18–50) — fonte: ANAMNESE_IV.docx
    // =======================================================================
    const F_JOVENS_ADULTOS = {
        icon: '🧑', tt: 'Jovens Adultos', rg: '18 – 50 anos',
        sects: [
            secBoasVindas(),
            secResumoCadastro(),
            secMotivo(),
            secImpacto(),
            secHistFamiliar(),

            { ic:'🌱', tt:'Gestação e parto', col:'desenvolvimento', g2:[
                { id:'subs', lb:'Antes da gestação, os pais eram dependentes químicos? (Ex.: Maconha, Cocaína, Crack, Álcool)',
                  tp:'ta', full:1 },
                { id:'ris',  lb:'Foi uma gestação de risco?',
                  tp:'ta', full:1 },
                { id:'sem',  lb:'Com quantos meses de gestação nasceu?',
                  tp:'ta', full:1 },
                { id:'par',  lb:'O parto foi normal ou cesárea?',
                  tp:'ta', full:1 },
                { id:'cmp_m', lb:'Houve alguma complicação com a mãe no dia do parto (pressão alta ou pré-eclâmpsia)?',
                  tp:'ta', full:1 },
                { id:'cmp_b', lb:'Houve alguma complicação com o bebê no dia do parto (falta de oxigênio, necessidade de UTI, etc.)?',
                  tp:'ta', full:1 },
                { id:'bbb',  lb:'Era um bebê grande, pequeno ou tamanho normal? (Se tiver os dados na caderneta de nascimento pode acrescentar: peso, centímetros, APGAR.)',
                  tp:'ta', full:1 },
                { id:'d18', lb:'Nos primeiros 18 anos de vida, desenvolveu-se bem? Se não, explique.',
                  tp:'ta', full:1 }
            ]},

            { ic:'🤝', tt:'Comportamento ao longo da vida', col:'social_emocional', g2:[
                { id:'prs', lb:'Ao longo da vida, era uma pessoa tímida ou falante? Gostava de interagir com amigos?',
                  tp:'ta', full:1 },
                { id:'amg', lb:'Possui amigos?',
                  tp:'ta', full:1 }
            ]},

            { ic:'🎓', tt:'Escolaridade e formação', col:'historico_escolar', g2:[
                { id:'eme', lb:'Como foi o desenvolvimento escolar? Concluiu o ensino médio?',
                  tp:'ta', full:1 },
                { id:'sup', lb:'Possui alguma formação superior? Descreva.',
                  tp:'ta', full:1 }
            ]},

            { ic:'💼', tt:'Desenvolvimento profissional', col:'historico_escolar', g2:[
                { id:'prf', lb:'Qual a profissão atual? Quanto tempo atua nesse segmento?',
                  tp:'ta', full:1 },
                { id:'amb', lb:'Gosta do ambiente de trabalho?',
                  tp:'ta', full:1 },
                { id:'amz', lb:'Cultiva as amizades no ambiente de trabalho?',
                  tp:'ta', full:1 }
            ]},

            { ic:'👨‍👩‍👧', tt:'Família', col:'identificacao', g2:[
                { id:'ec',  lb:'Estado civil',
                  tp:'ta', full:1 },
                { id:'fil', lb:'Possui filhos? Se sim, quantos? Algum deles possui um transtorno diagnosticado?',
                  tp:'ta', full:1 }
            ]},

            { ic:'🌈', tt:'Perfil sensorial', col:'social_emocional', g2:[
                { id:'etq', lb:'Etiquetas de roupa, peças de alça a incomodam?',
                  tp:'ta', full:1 },
                { id:'bar', lb:'Barulho o incomoda? Tapa os ouvidos ao ouvir sons estridentes?',
                  tp:'ta', full:1 },
                { id:'ali', lb:'Como é a alimentação? Come de tudo ou é seletivo?',
                  tp:'ta', full:1 }
            ]},

            { ic:'🎨', tt:'Hobbies e interesses', col:'social_emocional', g2:[
                { id:'hbb', lb:'Possui algum hobby? Leitura, jogos, filmes, músicas? Qual faz com mais frequência?',
                  tp:'ta', full:1 },
                { id:'hpf', lb:'Possui interesses muito intensos e específicos (hiperfoco em animais, geografia, história, carros, motores, coisas excêntricas, medicina, astrologia, física)?',
                  tp:'ta', full:1 },
                { id:'evt', lb:'Como é a habilidade social? Gosta de sair para festas e eventos?',
                  tp:'ta', full:1 }
            ]},

            { ic:'💊', tt:'Tratamentos e acompanhamentos', col:'saude_medicacoes', g2:[
                { id:'dgn', lb:'Possui algum tipo de diagnóstico?',
                  tp:'ta', full:1 },
                { id:'acm', lb:'Faz acompanhamento com Psicólogo, Psiquiatra ou Neurologista? Há quanto tempo?',
                  tp:'ta', full:1 },
                { id:'mdc', lb:'Faz uso de medicação de uso contínuo? Qual a dosagem?',
                  tp:'ta', full:1 },
                { id:'sbs', lb:'Faz uso de algum tipo de tóxico (maconha, cocaína, crack ou outros)?',
                  tp:'ta', full:1 }
            ]},

            { ic:'🧹', tt:'Autocuidado e autonomia', col:'social_emocional', g2:[
                { id:'hig', lb:'Como lida com a higiene pessoal?',
                  tp:'ta', full:1 },
                { id:'rgr', lb:'Como lida com regras e responsabilidades?',
                  tp:'ta', full:1 },
                { id:'aut', lb:'Como está sua independência para realizar atividades diárias?',
                  tp:'ta', full:1 }
            ]},

            { ic:'💙', tt:'Saúde mental', col:'social_emocional', g2:[
                { id:'iso', lb:'Isolamento social intenso ou mudanças de humor acentuadas?',
                  tp:'ta', full:1 },
                { id:'cmr', lb:'Houve algum comportamento de risco, como se cortar, tentativa de autoextermínio?',
                  tp:'ta', full:1 }
            ]},

            secObservacoesFinais(true)
        ]
    };

    // =======================================================================
    // FAIXA 5 — 50+ — fonte: ANAMNESE_V.docx
    // =======================================================================
    const F_CINQUENTA_MAIS = {
        icon: '🧓', tt: '50+ anos', rg: '50 anos ou mais',
        sects: [
            secBoasVindas(),
            secResumoCadastro(),
            secMotivo(),
            secImpacto(),
            secHistFamiliar(),

            { ic:'🌱', tt:'Gestação e parto', col:'desenvolvimento', g2:[
                { id:'subs', lb:'Antes da gestação, os pais eram dependentes de Cigarro ou Álcool?',
                  tp:'ta', full:1 },
                { id:'ris',  lb:'Foi uma gestação tranquila? Tem relatos de que a mãe quase perdeu por algum motivo?',
                  tp:'ta', full:1 },
                { id:'tmp_g', lb:'Nasceu no tempo certo?',
                  tp:'ta', full:1 },
                { id:'par',  lb:'O parto foi normal, cesárea, usou fórceps?',
                  tp:'ta', full:1 },
                { id:'cmp_m', lb:'Houve alguma complicação com a mãe no dia do parto (pressão alta ou pré-eclâmpsia)?',
                  tp:'ta', full:1 },
                { id:'cmp_b', lb:'Houve alguma complicação com o bebê no dia do parto (falta de oxigênio, necessidade de UTI, etc.)?',
                  tp:'ta', full:1 },
                { id:'d18', lb:'Nos primeiros 18 anos de vida, desenvolveu-se bem? Se não, explique.',
                  tp:'ta', full:1 }
            ]},

            { ic:'🤝', tt:'Comportamento ao longo da vida', col:'social_emocional', g2:[
                { id:'prs', lb:'Ao longo da vida, era uma pessoa tímida ou falante? Gostava de interagir com amigos?',
                  tp:'ta', full:1 },
                { id:'amg', lb:'Possui amigos, interage bem com familiares?',
                  tp:'ta', full:1 }
            ]},

            { ic:'🎓', tt:'Escolaridade e formação', col:'historico_escolar', g2:[
                { id:'eme', lb:'Como foi o desenvolvimento escolar? Concluiu o ensino médio?',
                  tp:'ta', full:1 },
                { id:'sup', lb:'Possui alguma formação superior? Descreva.',
                  tp:'ta', full:1 }
            ]},

            { ic:'💼', tt:'Desenvolvimento profissional', col:'historico_escolar', g2:[
                { id:'prv', lb:'Qual segmento trabalhou a vida toda?',
                  tp:'ta', full:1 },
                { id:'apos', lb:'Aposentou ou trabalha ainda?',
                  tp:'ta', full:1 }
            ]},

            { ic:'👨‍👩‍👧', tt:'Família', col:'identificacao', g2:[
                { id:'ec',  lb:'Estado civil',
                  tp:'ta', full:1 },
                { id:'fil', lb:'Possui filhos? Se sim, quantos? Algum deles possui um transtorno diagnosticado?',
                  tp:'ta', full:1 }
            ]},

            { ic:'🌈', tt:'Perfil social', col:'social_emocional', g2:[
                { id:'int', lb:'É uma pessoa intolerante?',
                  tp:'ta', full:1 },
                { id:'bar', lb:'Barulho o incomoda?',
                  tp:'ta', full:1 },
                { id:'ali', lb:'A alimentação é boa?',
                  tp:'ta', full:1 }
            ]},

            { ic:'🎨', tt:'Lazer e interesses', col:'social_emocional', g2:[
                { id:'hbb', lb:'Possui alguma atividade de lazer? O que gosta de fazer?',
                  tp:'ta', full:1 },
                { id:'hpf', lb:'Possui interesses muito intensos e específicos (hiperfoco em animais, geografia, história, carros, motores, coisas excêntricas, medicina, astrologia, física, marcenaria, mecânica, filmes...)?',
                  tp:'ta', full:1 },
                { id:'evt', lb:'Como é a habilidade social? Gosta de sair para festas e eventos?',
                  tp:'ta', full:1 }
            ]},

            { ic:'💊', tt:'Tratamentos e acompanhamentos', col:'saude_medicacoes', g2:[
                { id:'dgn', lb:'Possui alguma doença diagnosticada?',
                  tp:'ta', full:1 },
                { id:'acm', lb:'Faz acompanhamento com Psicólogo, Psiquiatra ou Neurologista? Há quanto tempo?',
                  tp:'ta', full:1 },
                { id:'mdc', lb:'Faz uso de medicação de uso contínuo? Qual a dosagem?',
                  tp:'ta', full:1 },
                { id:'sbs', lb:'Já fez ou faz uso de algum tipo de tóxico (maconha, cocaína, crack ou outros)?',
                  tp:'ta', full:1 }
            ]},

            { ic:'🧹', tt:'Autocuidado e autonomia', col:'social_emocional', g2:[
                { id:'hig', lb:'Como lida com a higiene pessoal?',
                  tp:'ta', full:1 },
                { id:'rgr', lb:'Como lida com regras e responsabilidades?',
                  tp:'ta', full:1 },
                { id:'aut', lb:'Como está sua independência para realizar atividades diárias?',
                  tp:'ta', full:1 }
            ]},

            { ic:'💙', tt:'Saúde mental', col:'social_emocional', g2:[
                { id:'iso', lb:'Isolamento social intenso ou mudanças de humor acentuadas?',
                  tp:'ta', full:1 },
                { id:'cmr', lb:'Houve algum comportamento de risco, como se cortar, tentativa de autoextermínio?',
                  tp:'ta', full:1 }
            ]},

            secObservacoesFinais(true)
        ]
    };

    // -----------------------------------------------------------------------
    // Mapa de faixas (chaves do enum faixa_etaria_anamnese)
    // -----------------------------------------------------------------------
    const F = {
        'primeira_infancia': F_PRIMEIRA_INFANCIA,
        'segunda_infancia':  F_SEGUNDA_INFANCIA,
        'adolescencia':      F_ADOLESCENCIA,
        'jovens_adultos':    F_JOVENS_ADULTOS,
        'cinquenta_mais':    F_CINQUENTA_MAIS
    };

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

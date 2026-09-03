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
    // =======================================================================
    // FORMULÁRIOS ATIVOS (2026) — fonte: ANAMNESE_1..4.docx
    // -----------------------------------------------------------------------
    // Quatro modelos, com cortes próprios. A seção "1. Identificação" dos
    // docx não entra: esses dados vêm do cadastro do paciente e são
    // renderizados read-only no topo (decisão da Sprint 55, mantida).
    //
    // Cada seção carrega um campo `eixo` — o "eixo clínico (uso interno)" dos
    // documentos. Ele aparece para o profissional (anamnese.js e PDF) e NUNCA
    // no link público: dizer a quem responde que a seção rastreia sinais de
    // autismo enviesa a resposta.
    // =======================================================================

    const F_PRE_ESCOLAR = {
        icon: '🧸', tt: 'Pré-Escolar', rg: '2 – 6 anos',
        sects: [
            secBoasVindas(),
            {
                ic: '🎯',
                tt: "Por que você procurou a avaliação",
                eixo: "demanda e queixa",
                col: 'queixa_historico',
                g2: [
                    { id:'por_que_voce_procu2_1', lb:"Conte, com suas palavras, o que mais te preocupa e motivou a buscar a avaliação.", tp:'ta', full:1 },
                    { id:'por_que_voce_procu2_2', lb:"Desde quando você percebe isso? Acontece mais em casa, na escola, ou nos dois?", tp:'ta', full:1 },
                    { id:'por_que_voce_procu2_3', lb:"Alguém indicou a avaliação (médico, escola, outro profissional)?", tp:'ta', full:1 },
                    { id:'por_que_voce_procu2_4', lb:"O que você espera descobrir ou resolver com a avaliação?", tp:'ta', full:1 }
                ]
            },
            {
                ic: '🤰',
                tt: "Gravidez e nascimento",
                eixo: "fatores de risco no desenvolvimento",
                col: 'desenvolvimento',
                g2: [
                    { id:'gravidez_e_nascime3_1', lb:"Como foi a gravidez? Houve algum problema (pressão alta, infecção, uso de remédios)?", tp:'ta', full:1 },
                    { id:'gravidez_e_nascime3_2', lb:"O parto foi normal ou cesárea? O bebê nasceu no tempo certo?", tp:'ta', full:1 },
                    { id:'gravidez_e_nascime3_3', lb:"Precisou de UTI, oxigênio, ou ficou muito amarelinho (icterícia) ao nascer?", tp:'ta', full:1 }
                ]
            },
            {
                ic: '👣',
                tt: "Quando começou a fazer as coisas",
                eixo: "neurodesenvolvimento — marcos",
                col: 'desenvolvimento',
                g2: [
                    { id:'quando_comecou_a_f4_1', lb:"Com que idade, mais ou menos, sentou sozinho e começou a andar?", tp:'ta', full:1 },
                    { id:'quando_comecou_a_f4_2', lb:"Quando falou as primeiras palavras e as primeiras frasezinhas?", tp:'ta', full:1 },
                    { id:'quando_comecou_a_f4_3', lb:"Ele entende quando você pede algo simples (\"pega a bola\")?", tp:'ta', full:1 },
                    { id:'quando_comecou_a_f4_4', lb:"Já largou a fralda? Com que idade, se já largou?", tp:'ta', full:1 },
                    { id:'quando_comecou_a_f4_5', lb:"Em algum momento ele deixou de fazer algo que já sabia (parou de falar, de olhar nos olhos)?", tp:'ta', full:1 }
                ]
            },
            {
                ic: '💬',
                tt: "Como se comunica e convive",
                eixo: "neurodesenvolvimento — sinais do espectro (TEA)",
                col: 'social_emocional',
                g2: [
                    { id:'como_se_comunica_e5_1', lb:"Ele olha nos seus olhos quando conversam e atende quando o chamam pelo nome?", tp:'ta', full:1 },
                    { id:'como_se_comunica_e5_2', lb:"Aponta para te mostrar coisas que achou interessantes, olhando pra ver se você viu junto?", tp:'ta', full:1 },
                    { id:'como_se_comunica_e5_3', lb:"Tem interesse por outras crianças? Brinca de faz de conta (comidinha, super-herói)?", tp:'ta', full:1 },
                    { id:'como_se_comunica_e5_4', lb:"Usa gestos como dar tchau e mandar beijo? Costuma repetir falas iguais (de desenhos)?", tp:'ta', full:1 },
                    { id:'como_se_comunica_e5_5', lb:"Tem interesses muito fixos, faz movimentos repetidos, ou fica muito bravo quando muda a rotina?", tp:'ta', full:1 }
                ]
            },
            {
                ic: '⚡',
                tt: "Agitação, atenção e comportamento",
                eixo: "comportamento e atenção (cautela para TDAH na idade)",
                col: 'social_emocional',
                g2: [
                    { id:'agitacao_atencao_e6_1', lb:"Ele é muito agitado? Consegue esperar a vez?", tp:'ta', full:1 },
                    { id:'agitacao_atencao_e6_2', lb:"Consegue se concentrar em uma brincadeira por algum tempo?", tp:'ta', full:1 },
                    { id:'agitacao_atencao_e6_3', lb:"Tem birras muito fortes, se machuca ou machuca os outros quando fica bravo?", tp:'ta', full:1 }
                ]
            },
            {
                ic: '🌈',
                tt: "Sentidos, alimentação e sono",
                eixo: "processamento sensorial",
                col: 'social_emocional',
                g2: [
                    { id:'sentidos_alimentac7_1', lb:"Ele se incomoda demais — ou parece nem notar — barulhos, luzes, texturas ou o toque? (tampa o ouvido, não gosta de certas roupas ou etiquetas)", tp:'ta', full:1 },
                    { id:'sentidos_alimentac7_2', lb:"Come de tudo ou é muito seletivo com comida?", tp:'ta', full:1 },
                    { id:'sentidos_alimentac7_3', lb:"Como é o sono dele (pega no sono fácil, acorda à noite)?", tp:'ta', full:1 }
                ]
            },
            {
                ic: '💗',
                tt: "Emoções e humor",
                eixo: "regulação emocional",
                col: 'social_emocional',
                g2: [
                    { id:'emocoes_e_humor8_1', lb:"Como ele costuma estar de humor no dia a dia? Fica muito ansioso, com medos ou triste?", tp:'ta', full:1 },
                    { id:'emocoes_e_humor8_2', lb:"Como ele reage quando algo não sai do jeito que ele queria?", tp:'ta', full:1 }
                ]
            },
            {
                ic: '🏫',
                tt: "Escola ou creche",
                eixo: "adaptação e funcionamento",
                col: 'historico_escolar',
                g2: [
                    { id:'escola_ou_creche9_1', lb:"Frequenta escola ou creche? Como foi a adaptação e a convivência com as outras crianças?", tp:'ta', full:1 },
                    { id:'escola_ou_creche9_2', lb:"Precisa de alguma ajuda especial? O que os professores costumam comentar?", tp:'ta', full:1 }
                ]
            },
            {
                ic: '🩺',
                tt: "Saúde",
                eixo: "histórico médico e intervenções",
                col: 'saude_medicacoes',
                g2: [
                    { id:'saude10_1', lb:"Tem algum diagnóstico, usa algum remédio, ou já fez exames (ouvido, visão, neurológico)?", tp:'ta', full:1 },
                    { id:'saude10_2', lb:"Faz alguma terapia (fono, terapia ocupacional, psicologia)? Está ajudando?", tp:'ta', full:1 }
                ]
            },
            {
                ic: '🧬',
                tt: "Família",
                eixo: "antecedentes familiares",
                col: 'contexto_familiar',
                g2: [
                    { id:'familia11_1', lb:"Na família há casos de autismo, TDAH, dificuldade de aprendizagem, atraso no desenvolvimento, ou questões emocionais/psiquiátricas (depressão, ansiedade, outros)?", tp:'ta', full:1 }
                ]
            },
            {
                ic: '🏠',
                tt: "Vida em casa",
                eixo: "contexto familiar",
                col: 'contexto_familiar',
                g2: [
                    { id:'vida_em_casa12_1', lb:"Com quem a criança mora e quem cuida dela no dia a dia?", tp:'ta', full:1 },
                    { id:'vida_em_casa12_2', lb:"Aconteceu algo importante recentemente (mudança, separação, perda, chegada de irmão)?", tp:'ta', full:1 }
                ]
            }
        ]
    };

    const F_ESCOLAR_ADOLESCENTE = {
        icon: '🎒', tt: 'Escolar e Adolescente', rg: '6 – 16 anos',
        sects: [
            secBoasVindas(),
            {
                ic: '🎯',
                tt: "Por que você procurou a avaliação",
                eixo: "demanda e queixa",
                col: 'queixa_historico',
                g2: [
                    { id:'por_que_voce_procu2_1', lb:"Conte, com suas palavras, o que mais te preocupa e motivou a avaliação.", tp:'ta', full:1 },
                    { id:'por_que_voce_procu2_2', lb:"Acontece mais em casa, na escola, ou nos dois? Desde quando?", tp:'ta', full:1 },
                    { id:'por_que_voce_procu2_3', lb:"Alguém indicou (médico, escola)? O que você espera descobrir ou resolver?", tp:'ta', full:1 }
                ]
            },
            {
                ic: '🤰',
                tt: "Gravidez, nascimento e primeiros anos",
                eixo: "risco no desenvolvimento",
                col: 'desenvolvimento',
                g2: [
                    { id:'gravidez_nasciment3_1', lb:"Houve algum problema na gravidez ou no parto?", tp:'ta', full:1 },
                    { id:'gravidez_nasciment3_2', lb:"O desenvolvimento (andar, falar) foi dentro do esperado? Percebeu algum sinal cedo?", tp:'ta', full:1 }
                ]
            },
            {
                ic: '🏫',
                tt: "Escola e aprendizagem",
                eixo: "neurodesenvolvimento — aprendizagem",
                col: 'historico_escolar',
                g2: [
                    { id:'escola_e_aprendiza4_1', lb:"Como foi para aprender a ler e escrever — com facilidade ou dificuldade?", tp:'ta', full:1 },
                    { id:'escola_e_aprendiza4_2', lb:"Em quê tem mais dificuldade hoje: leitura, escrita ou matemática?", tp:'ta', full:1 },
                    { id:'escola_e_aprendiza4_3', lb:"Já repetiu de ano, faz reforço, ou a escola costuma reclamar de algo?", tp:'ta', full:1 },
                    { id:'escola_e_aprendiza4_4', lb:"Como é a relação com professores e colegas?", tp:'ta', full:1 }
                ]
            },
            {
                ic: '⚡',
                tt: "Atenção, agitação e organização",
                eixo: "neurodesenvolvimento — TDAH e funções executivas",
                col: 'social_emocional',
                g2: [
                    { id:'atencao_agitacao_e5_1', lb:"Se distrai com facilidade, \"viaja\", ou esquece as coisas?", tp:'ta', full:1 },
                    { id:'atencao_agitacao_e5_2', lb:"É agitado ou impulsivo (age sem pensar, interrompe)?", tp:'ta', full:1 },
                    { id:'atencao_agitacao_e5_3', lb:"Tem dificuldade de se organizar, planejar e terminar o que começa?", tp:'ta', full:1 }
                ]
            },
            {
                ic: '💬',
                tt: "Convivência e comunicação",
                eixo: "neurodesenvolvimento — TEA",
                col: 'social_emocional',
                g2: [
                    { id:'convivencia_e_comu6_1', lb:"Faz e mantém amizades com facilidade? As trocas são recíprocas?", tp:'ta', full:1 },
                    { id:'convivencia_e_comu6_2', lb:"Tem interesses muito intensos, gosta muito de rotina e se incomoda com mudanças?", tp:'ta', full:1 },
                    { id:'convivencia_e_comu6_3', lb:"Entende brincadeiras, ironias e o sentido figurado, ou leva tudo ao pé da letra?", tp:'ta', full:1 }
                ]
            },
            {
                ic: '💗',
                tt: "Emoções, humor e ansiedade",
                eixo: "transtorno de humor e ansiedade",
                col: 'social_emocional',
                g2: [
                    { id:'emocoes_humor_e_an7_1', lb:"Como está o humor? Passa por fases de tristeza, irritação ou desânimo?", tp:'ta', full:1 },
                    { id:'emocoes_humor_e_an7_2', lb:"Fica muito ansioso, tem medos, preocupações excessivas ou crises?", tp:'ta', full:1 },
                    { id:'emocoes_humor_e_an7_3', lb:"Como está a autoestima e como lida com a frustração?", tp:'ta', full:1 }
                ]
            },
            {
                ic: '🧩',
                tt: "Comportamento",
                eixo: "comportamento e conduta",
                col: 'social_emocional',
                g2: [
                    { id:'comportamento8_1', lb:"Costuma desafiar regras, ter explosões, ou se opor bastante?", tp:'ta', full:1 },
                    { id:'comportamento8_2', lb:"Já houve comportamentos que te preocuparam de forma mais séria?", tp:'ta', full:1 }
                ]
            },
            {
                ic: '🌈',
                tt: "Sentidos e sono",
                eixo: "sensorial e sono",
                col: 'social_emocional',
                g2: [
                    { id:'sentidos_e_sono9_1', lb:"Se incomoda muito com sons, luzes, texturas ou toque?", tp:'ta', full:1 },
                    { id:'sentidos_e_sono9_2', lb:"Como é a alimentação e o sono?", tp:'ta', full:1 }
                ]
            },
            {
                ic: '🩺',
                tt: "Saúde",
                eixo: "histórico médico e intervenções",
                col: 'saude_medicacoes',
                g2: [
                    { id:'saude10_1', lb:"Tem diagnóstico, usa remédio ou já fez exames?", tp:'ta', full:1 },
                    { id:'saude10_2', lb:"Faz alguma terapia atualmente? Está ajudando?", tp:'ta', full:1 }
                ]
            },
            {
                ic: '🧬',
                tt: "Família",
                eixo: "antecedentes familiares",
                col: 'contexto_familiar',
                g2: [
                    { id:'familia11_1', lb:"Na família há casos de autismo, TDAH, dislexia, depressão, ansiedade, bipolaridade ou outras questões psiquiátricas?", tp:'ta', full:1 }
                ]
            },
            {
                ic: '🏠',
                tt: "Rotina e convívio",
                eixo: "contexto familiar e social",
                col: 'contexto_familiar',
                g2: [
                    { id:'rotina_e_convivio12_1', lb:"Como é a rotina, o uso de telas e as atividades fora da escola?", tp:'ta', full:1 },
                    { id:'rotina_e_convivio12_2', lb:"Aconteceu algo marcante na família recentemente (mudança, separação, perda)?", tp:'ta', full:1 }
                ]
            }
        ]
    };

    const F_ADULTO = {
        icon: '🧑', tt: 'Adulto', rg: '17 – 59 anos',
        sects: [
            secBoasVindas(),
            {
                ic: '🎯',
                tt: "Por que você procurou a avaliação",
                eixo: "demanda e queixa",
                col: 'queixa_historico',
                g2: [
                    { id:'por_que_voce_procu2_1', lb:"Conte, com suas palavras, o que mais te preocupa e motivou a buscar a avaliação.", tp:'ta', full:1 },
                    { id:'por_que_voce_procu2_2', lb:"Desde quando você sente isso? Como afeta seu dia a dia (trabalho, estudos, relações)?", tp:'ta', full:1 },
                    { id:'por_que_voce_procu2_3', lb:"Alguém indicou a avaliação? O que você espera descobrir ou resolver?", tp:'ta', full:1 }
                ]
            },
            {
                ic: '👣',
                tt: "Um pouco da sua história",
                eixo: "desenvolvimento e história pregressa",
                col: 'desenvolvimento',
                g2: [
                    { id:'um_pouco_da_sua_hi3_1', lb:"Você sabe se teve alguma dificuldade quando criança (para falar, andar, na escola)?", tp:'ta', full:1 },
                    { id:'um_pouco_da_sua_hi3_2', lb:"Como foi sua infância e sua vida escolar, de modo geral?", tp:'ta', full:1 }
                ]
            },
            {
                ic: '💼',
                tt: "Estudos e trabalho",
                eixo: "funcional",
                col: 'historico_escolar',
                g2: [
                    { id:'estudos_e_trabalho4_1', lb:"Até que nível você estudou? Teve facilidade ou dificuldade nos estudos?", tp:'ta', full:1 },
                    { id:'estudos_e_trabalho4_2', lb:"Como está sua vida profissional hoje? Tem dificuldades no trabalho? Quais?", tp:'ta', full:1 }
                ]
            },
            {
                ic: '⚡',
                tt: "Atenção, organização e memória no dia a dia",
                eixo: "neurodesenvolvimento/neurocognitivo — TDAH",
                col: 'social_emocional',
                g2: [
                    { id:'atencao_organizaca5_1', lb:"Você se distrai com facilidade, esquece coisas ou perde objetos?", tp:'ta', full:1 },
                    { id:'atencao_organizaca5_2', lb:"Costuma adiar tarefas (procrastinar), deixar coisas pela metade ou ter dificuldade com prazos?", tp:'ta', full:1 },
                    { id:'atencao_organizaca5_3', lb:"Age por impulso às vezes? Sente a cabeça \"acelerada\" ou com dificuldade de \"desligar\"?", tp:'ta', full:1 }
                ]
            },
            {
                ic: '💬',
                tt: "Convivência, comunicação e sentidos",
                eixo: "neurodesenvolvimento — TEA",
                col: 'social_emocional',
                g2: [
                    { id:'convivencia_comuni6_1', lb:"Como é sua convivência com outras pessoas? Fazer e manter amizades é fácil ou custa?", tp:'ta', full:1 },
                    { id:'convivencia_comuni6_2', lb:"Você tem interesses muito intensos, gosta de rotina e se incomoda com mudanças?", tp:'ta', full:1 },
                    { id:'convivencia_comuni6_3', lb:"Certos sons, luzes, texturas ou cheiros te incomodam muito?", tp:'ta', full:1 },
                    { id:'convivencia_comuni6_4', lb:"Você sente que faz esforço para \"se encaixar\" ou disfarçar dificuldades em situações sociais?", tp:'ta', full:1 }
                ]
            },
            {
                ic: '💗',
                tt: "Humor e emoções",
                eixo: "transtorno de humor e ansiedade",
                col: 'social_emocional',
                g2: [
                    { id:'humor_e_emocoes7_1', lb:"Como tem estado seu humor? Passa por fases de tristeza e desânimo, ou por fases muito aceleradas?", tp:'ta', full:1 },
                    { id:'humor_e_emocoes7_2', lb:"Sente ansiedade, preocupação excessiva ou crises? Em quais situações?", tp:'ta', full:1 },
                    { id:'humor_e_emocoes7_3', lb:"Como estão seu sono e sua energia?", tp:'ta', full:1 }
                ]
            },
            {
                ic: '🪞',
                tt: "Seu jeito de ser e de se relacionar",
                eixo: "personalidade",
                col: 'social_emocional',
                g2: [
                    { id:'seu_jeito_de_ser_e8_1', lb:"Como você descreveria o seu jeito de ser?", tp:'ta', full:1 },
                    { id:'seu_jeito_de_ser_e8_2', lb:"Nas relações (amorosas, amizades, trabalho), percebe padrões que se repetem e te incomodam?", tp:'ta', full:1 },
                    { id:'seu_jeito_de_ser_e8_3', lb:"Como costuma lidar com conflitos e frustrações?", tp:'ta', full:1 }
                ]
            },
            {
                ic: '🩺',
                tt: "Saúde e uso de substâncias",
                eixo: "histórico médico",
                col: 'saude_medicacoes',
                g2: [
                    { id:'saude_e_uso_de_sub9_1', lb:"Tem alguma condição de saúde e usa algum remédio? Quais?", tp:'ta', full:1 },
                    { id:'saude_e_uso_de_sub9_2', lb:"Faz uso de álcool ou outras substâncias? Com que frequência?", tp:'ta', full:1 }
                ]
            },
            {
                ic: '🩺',
                tt: "Saúde mental (histórico)",
                eixo: "histórico psiquiátrico",
                col: 'saude_medicacoes',
                g2: [
                    { id:'saude_mental_histo10_1', lb:"Já teve algum diagnóstico psicológico ou psiquiátrico? Já fez terapia, usou medicação ou foi internado?", tp:'ta', full:1 }
                ]
            },
            {
                ic: '🧬',
                tt: "Família",
                eixo: "antecedentes familiares",
                col: 'contexto_familiar',
                g2: [
                    { id:'familia11_1', lb:"Na sua família há casos de autismo, TDAH, depressão, ansiedade, bipolaridade ou outras questões psiquiátricas?", tp:'ta', full:1 }
                ]
            },
            {
                ic: '🏠',
                tt: "Sua vida hoje",
                eixo: "contexto atual",
                col: 'contexto_familiar',
                g2: [
                    { id:'sua_vida_hoje12_1', lb:"Com quem você mora e como é a sua rede de apoio?", tp:'ta', full:1 },
                    { id:'sua_vida_hoje12_2', lb:"Aconteceu algo marcante recentemente que ajude a entender o seu momento atual?", tp:'ta', full:1 }
                ]
            }
        ]
    };

    const F_IDOSO = {
        icon: '🌿', tt: 'Idoso', rg: '60 – 90 anos',
        sects: [
            secBoasVindas(),
            {
                ic: '🎯',
                tt: "Por que procurou a avaliação",
                eixo: "demanda e queixa",
                col: 'queixa_historico',
                g2: [
                    { id:'por_que_procurou_a2_1', lb:"Conte, com suas palavras, o que mais preocupa (memória, esquecimentos, raciocínio, outros).", tp:'ta', full:1 },
                    { id:'por_que_procurou_a2_2', lb:"Quem percebeu primeiro as mudanças — a própria pessoa ou a família?", tp:'ta', full:1 },
                    { id:'por_que_procurou_a2_3', lb:"Começou de repente ou aos poucos? Vem piorando, está estável, ou varia muito de um dia para o outro?", tp:'ta', full:1 }
                ]
            },
            {
                ic: '🧠',
                tt: "Como está a memória e o raciocínio",
                eixo: "neurocognitivo — rastreio de demência",
                col: 'social_emocional',
                g2: [
                    { id:'como_esta_a_memori3_1', lb:"Dê exemplos do dia a dia: esquece compromissos, repete perguntas, se perde em lugares, tem dificuldade com dinheiro?", tp:'ta', full:1 },
                    { id:'como_esta_a_memori3_2', lb:"Isso já atrapalha as atividades do dia a dia? Desde quando?", tp:'ta', full:1 }
                ]
            },
            {
                ic: '🧺',
                tt: "Dia a dia e autonomia",
                eixo: "funcionalidade (AVD/AIVD)",
                col: 'social_emocional',
                g2: [
                    { id:'dia_a_dia_e_autono4_1', lb:"Cuida sozinho da higiene, alimentação e de se vestir?", tp:'ta', full:1 },
                    { id:'dia_a_dia_e_autono4_2', lb:"E das tarefas mais complexas: remédios, dinheiro, transporte, telefone, compras?", tp:'ta', full:1 },
                    { id:'dia_a_dia_e_autono4_3', lb:"Precisa de ajuda ou supervisão para algo? Para quê?", tp:'ta', full:1 }
                ]
            },
            {
                ic: '💗',
                tt: "Humor e comportamento",
                eixo: "transtorno de humor (diferencial com pseudodemência)",
                col: 'social_emocional',
                g2: [
                    { id:'humor_e_comportame5_1', lb:"Anda triste, desanimado, sem vontade das coisas, ou mais isolado?", tp:'ta', full:1 },
                    { id:'humor_e_comportame5_2', lb:"Houve mudança no jeito de ser, no comportamento, ou episódios de ver/ouvir coisas que não estão lá?", tp:'ta', full:1 },
                    { id:'humor_e_comportame5_3', lb:"Como está o sono?", tp:'ta', full:1 }
                ]
            },
            {
                ic: '🩺',
                tt: "Saúde e remédios",
                eixo: "histórico médico e neurológico",
                col: 'saude_medicacoes',
                g2: [
                    { id:'saude_e_remedios6_1', lb:"Tem pressão alta, diabetes, colesterol, já teve AVC (derrame) ou batidas na cabeça, quedas?", tp:'ta', full:1 },
                    { id:'saude_e_remedios6_2', lb:"Quais remédios usa hoje? Faz uso de bebida alcoólica?", tp:'ta', full:1 }
                ]
            },
            {
                ic: '💼',
                tt: "Estudos e trabalho ao longo da vida",
                eixo: "escolaridade (modula a interpretação)",
                col: 'historico_escolar',
                g2: [
                    { id:'estudos_e_trabalho7_1', lb:"Até que série/nível estudou? Qual foi a principal ocupação na vida?", tp:'ta', full:1 },
                    { id:'estudos_e_trabalho7_2', lb:"Hoje mantém atividades como leitura, jogos, convívio social?", tp:'ta', full:1 }
                ]
            },
            {
                ic: '🧬',
                tt: "Família",
                eixo: "antecedentes familiares",
                col: 'contexto_familiar',
                g2: [
                    { id:'familia8_1', lb:"Na família há casos de demência (Alzheimer, outros) ou de questões psiquiátricas?", tp:'ta', full:1 }
                ]
            },
            {
                ic: '🏠',
                tt: "Com quem vive e apoio",
                eixo: "contexto e suporte",
                col: 'contexto_familiar',
                g2: [
                    { id:'com_quem_vive_e_ap9_1', lb:"Com quem mora? Há um cuidador? Como é a rede de apoio da família?", tp:'ta', full:1 }
                ]
            }
        ]
    };

    // Formulários oferecidos para anamnese NOVA.
    const F_ATIVOS = {
        'pre_escolar':         F_PRE_ESCOLAR,
        'escolar_adolescente': F_ESCOLAR_ADOLESCENTE,
        'adulto':              F_ADULTO,
        'idoso':               F_IDOSO
    };

    // LEGADO — 313 anamneses já respondidas usam estas chaves (285 concluídas).
    // Elas não aparecem no seletor, mas precisam continuar existindo: sem o
    // formulário original, abrir esses prontuários daria erro, e as respostas
    // ficariam sob perguntas que não foram as feitas à família.
    const F_LEGADO = {
        'primeira_infancia': F_PRIMEIRA_INFANCIA,
        'segunda_infancia':  F_SEGUNDA_INFANCIA,
        'adolescencia':      F_ADOLESCENCIA,
        'jovens_adultos':    F_JOVENS_ADULTOS,
        'cinquenta_mais':    F_CINQUENTA_MAIS
    };

    const F = { ...F_ATIVOS, ...F_LEGADO };

    function detectarFaixa(idadeAnos) {
        if (idadeAnos === null || idadeAnos === undefined) return 'adulto';
        if (idadeAnos < 6)  return 'pre_escolar';
        if (idadeAnos < 17) return 'escolar_adolescente';
        if (idadeAnos < 60) return 'adulto';
        return 'idoso';
    }

    // Só os ativos: o legado existe para abrir o que já foi respondido,
    // nunca para criar anamnese nova.
    function listarFaixas() {
        return Object.entries(F_ATIVOS).map(([key, fx]) => ({
            key: key,
            label: `${fx.icon} ${fx.tt} (${fx.rg})`
        }));
    }

    function ehLegado(faixa) {
        return Object.prototype.hasOwnProperty.call(F_LEGADO, faixa);
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
        ehLegado,
        colunasJsonb,
        FORMS: F
    };
})();

// ============================================================================
// CORTEX_APP — Anamnese Remota: perguntas (pensadas pra leigo)
// ============================================================================
// Subset enxuto e em linguagem acessível, com base nas anamneses presenciais.
// Inclui apenas perguntas que paciente/responsável consegue responder com
// qualidade. Termos técnicos (Apgar, ecolalia, regressão tipificada) ficam
// pra anamnese presencial com o profissional.
//
// O formulário ADAPTA por idade automaticamente:
//   - Crianças (<12): mostra "marcos do desenvolvimento", "tipo de parto"
//   - Adolescentes (12-17): perguntas escolares
//   - Adultos (18-49): trabalho, situação conjugal
//   - Idosos (50+): autonomia, com quem mora
// ============================================================================

window.CortexAnamneseRemotaPerguntas = (function() {
    'use strict';

    // Helpers
    const SIM_NAO_NS = ['Sim', 'Não', 'Não sei'];
    const HF_BASE = ['TDAH', 'TEA (Autismo)', 'Dislexia', 'Depressão', 'Ansiedade', 'Bipolaridade', 'Esquizofrenia', 'Demência / Alzheimer'];

    // ============================================================================
    // SEÇÕES COMUNS A TODOS (independente de idade)
    // ============================================================================

    // Seção 0 — Quem está respondendo (perguntada no início, sempre)
    const SECAO_QUEM_RESPONDE = {
        id: 'quem',
        titulo: 'Quem está respondendo?',
        subtitulo: 'Estas informações são confidenciais e serão vistas apenas pela equipe da clínica.',
        campos: [
            {
                id: '_quem_responde', label: 'Quem está preenchendo este formulário?', tipo: 'radio', obrigatorio: true,
                opcoes: ['Eu mesmo (o paciente)', 'Pai / Mãe', 'Responsável legal', 'Outro familiar / cuidador']
            },
            {
                id: '_nome_respondente', label: 'Seu nome completo', tipo: 'texto', obrigatorio: true,
                placeholder: 'Como você se chama'
            },
            {
                id: '_relacao_outro', label: 'Qual é sua relação com o paciente?', tipo: 'texto',
                placeholder: 'Ex: tio, avó, irmã...',
                mostrarSe: { campo: '_quem_responde', valor: 'Outro familiar / cuidador' }
            }
        ]
    };

    // Queixa principal (todos)
    const SECAO_QUEIXA = {
        id: 'queixa',
        titulo: 'Motivo da avaliação',
        subtitulo: 'Conte com suas palavras o que está te preocupando.',
        campos: [
            {
                id: 'motivo', label: 'Qual é o principal motivo da avaliação?', tipo: 'textarea', obrigatorio: true,
                placeholder: 'Descreva as principais preocupações e dificuldades...',
                ajuda: 'Quanto mais detalhes você puder dar, melhor.'
            },
            {
                id: 'impacto', label: 'Como essas dificuldades afetam o dia a dia?', tipo: 'textarea',
                placeholder: 'No trabalho, na escola, em casa, nas relações...'
            },
            {
                id: 'tempo_queixa', label: 'Há quanto tempo essas dificuldades existem?', tipo: 'select',
                opcoes: [
                    'Desde sempre / desde criança',
                    'Menos de 6 meses',
                    '6 meses a 1 ano',
                    '1 a 2 anos',
                    'Mais de 2 anos'
                ]
            },
            {
                id: 'encaminhado_por', label: 'Quem indicou a avaliação?', tipo: 'select',
                opcoes: [
                    'Médico (psiquiatra, neurologista, pediatra)',
                    'Psicólogo / Psicoterapeuta',
                    'Escola / professor',
                    'Familiar',
                    'Por conta própria',
                    'Outro'
                ]
            }
        ]
    };

    // Saúde geral (todos)
    const SECAO_SAUDE = {
        id: 'saude',
        titulo: 'Saúde e medicações',
        campos: [
            {
                id: 'medicacoes', label: 'Usa medicamentos atualmente? Quais?', tipo: 'textarea',
                placeholder: 'Liste os medicamentos, doses e há quanto tempo usa. Se não usa, escreva "Não usa".'
            },
            {
                id: 'diagnosticos_anteriores', label: 'Já recebeu algum diagnóstico antes?', tipo: 'textarea',
                placeholder: 'Ex: TDAH (2020), Depressão (2019). Se não houver, escreva "Não".'
            },
            {
                id: 'acompanhamentos', label: 'Faz algum acompanhamento atualmente?', tipo: 'checkboxes',
                opcoes: [
                    'Psicologia / Terapia',
                    'Psiquiatria',
                    'Neurologia / Neuropediatria',
                    'Fonoaudiologia',
                    'Terapia Ocupacional',
                    'Fisioterapia',
                    'Nutrição',
                    'Nenhum'
                ]
            },
            {
                id: 'doencas_cronicas', label: 'Possui alguma doença crônica relevante?', tipo: 'textarea',
                placeholder: 'Ex: hipertensão, diabetes, epilepsia, asma. Se não houver, escreva "Não".'
            },
            {
                id: 'sono', label: 'Como é o seu sono (ou do paciente)?', tipo: 'select',
                opcoes: [
                    'Tranquilo, dorme bem',
                    'Demora pra adormecer',
                    'Acorda várias vezes durante a noite',
                    'Sono muito leve / agitado',
                    'Não consegue dormir / insônia'
                ]
            }
        ]
    };

    // Histórico familiar (todos)
    const SECAO_FAMILIAR = {
        id: 'familiar',
        titulo: 'Histórico na família',
        subtitulo: 'Marque se algum familiar próximo (pais, irmãos, avós, tios) tem ou teve:',
        campos: [
            {
                id: 'hist_familiar', label: 'Casos na família', tipo: 'checkboxes',
                opcoes: HF_BASE.concat(['Nenhum / Não sei'])
            },
            {
                id: 'hist_familiar_detalhes', label: 'Pode dar mais detalhes? (parentesco, idade do diagnóstico)', tipo: 'textarea',
                placeholder: 'Ex: pai com TDAH, tio materno com TEA, avó com Alzheimer aos 70 anos'
            }
        ]
    };

    // Fechamento (todos)
    const SECAO_FINAL = {
        id: 'final',
        titulo: 'Para finalizar',
        campos: [
            {
                id: 'expectativas', label: 'O que você espera dessa avaliação?', tipo: 'textarea',
                placeholder: 'O que gostaria de entender ou resolver com a avaliação?'
            },
            {
                id: 'informacoes_extras', label: 'Algo mais que gostaria de contar?', tipo: 'textarea',
                placeholder: 'Qualquer informação que você acredita ser relevante para o profissional.'
            }
        ]
    };

    // ============================================================================
    // SEÇÕES ESPECÍFICAS POR FAIXA
    // ============================================================================

    // Crianças (< 12 anos): gestação + marcos + escola + comportamento
    const SECOES_INFANTIL_ESCOLAR = [
        {
            id: 'gestacao',
            titulo: 'Gestação e nascimento',
            subtitulo: 'Lembre-se: se você não souber alguma resposta, escreva "Não sei" — está tudo bem.',
            campos: [
                {
                    id: 'tipo_parto', label: 'Tipo de parto', tipo: 'select',
                    opcoes: ['Parto normal (vaginal)', 'Cesariana programada', 'Cesariana de emergência', 'Não sei']
                },
                {
                    id: 'gestacao_risco', label: 'A gestação foi considerada de alto risco?', tipo: 'select',
                    opcoes: SIM_NAO_NS
                },
                {
                    id: 'tempo_gestacao', label: 'A criança nasceu com quantas semanas de gestação?', tipo: 'select',
                    opcoes: ['Menos de 32 semanas (muito prematuro)', '32 a 36 semanas (prematuro)', '37 a 41 semanas (a termo)', 'Mais de 41 semanas', 'Não sei']
                },
                {
                    id: 'peso_nascimento', label: 'Peso aproximado ao nascer', tipo: 'select',
                    opcoes: ['Menos de 1,5 kg', '1,5 a 2,5 kg', '2,5 a 4 kg', 'Mais de 4 kg', 'Não sei']
                },
                {
                    id: 'intercorrencias_gestacao', label: 'Houve alguma intercorrência durante a gestação ou parto?', tipo: 'textarea',
                    placeholder: 'Ex: pressão alta, diabetes gestacional, UTI neonatal. Se não houve, escreva "Não".'
                }
            ]
        },
        {
            id: 'desenvolvimento',
            titulo: 'Desenvolvimento (primeiros anos)',
            subtitulo: 'Lembra com que idade a criança começou cada coisa?',
            campos: [
                {
                    id: 'idade_andou', label: 'Com que idade começou a andar sozinha?', tipo: 'select',
                    opcoes: ['Antes de 10 meses', '10 a 14 meses (idade comum)', '15 a 18 meses', 'Após 18 meses', 'Ainda não anda', 'Não sei']
                },
                {
                    id: 'idade_falou', label: 'Com que idade falou as primeiras palavras?', tipo: 'select',
                    opcoes: ['Antes de 12 meses', '12 a 18 meses (idade comum)', '18 a 24 meses', 'Após 24 meses', 'Ainda não fala', 'Não sei']
                },
                {
                    id: 'controle_esfincter', label: 'Com que idade conseguiu controle do xixi e cocô?', tipo: 'select',
                    opcoes: ['Antes de 2 anos', '2 a 3 anos (idade comum)', '3 a 5 anos', 'Após 5 anos', 'Ainda não tem controle', 'Não se aplica / Não sei']
                },
                {
                    id: 'desenvolvimento_obs', label: 'Houve alguma preocupação com o desenvolvimento?', tipo: 'textarea',
                    placeholder: 'Ex: demorou pra falar, dificuldades motoras, comportamentos diferentes desde cedo...'
                }
            ]
        },
        {
            id: 'escola',
            titulo: 'Escola',
            campos: [
                {
                    id: 'serie_escolar', label: 'Qual série / ano escolar?', tipo: 'texto',
                    placeholder: 'Ex: 3º ano do Ensino Fundamental'
                },
                {
                    id: 'tipo_escola', label: 'Tipo de escola', tipo: 'select',
                    opcoes: ['Pública', 'Particular', 'Educação domiciliar / homeschooling', 'Não está estudando']
                },
                {
                    id: 'desempenho_escolar', label: 'Como descreveria o desempenho escolar?', tipo: 'select',
                    opcoes: [
                        'Acima da média',
                        'Dentro do esperado',
                        'Algumas dificuldades pontuais',
                        'Dificuldades significativas',
                        'Está reprovado / muito atrás'
                    ]
                },
                {
                    id: 'dificuldades_escolares', label: 'Há dificuldades específicas na escola?', tipo: 'checkboxes',
                    opcoes: [
                        'Leitura',
                        'Escrita',
                        'Matemática',
                        'Concentração / atenção',
                        'Memorizar conteúdo',
                        'Organização (tarefas, materiais)',
                        'Comportamento em sala',
                        'Relacionamento com colegas',
                        'Relacionamento com professores',
                        'Nenhuma'
                    ]
                },
                {
                    id: 'queixa_escola', label: 'A escola já apontou alguma preocupação?', tipo: 'textarea',
                    placeholder: 'O que professores ou coordenação já comentaram?'
                }
            ]
        },
        {
            id: 'comportamento_infantil',
            titulo: 'Comportamento e relacionamento',
            campos: [
                {
                    id: 'comportamentos_observados', label: 'Marque o que vocês observam com frequência:', tipo: 'checkboxes',
                    opcoes: [
                        'Muito agitado / não para quieto',
                        'Distraído / "no mundo da lua"',
                        'Impulsivo (fala / age sem pensar)',
                        'Birras intensas e frequentes',
                        'Agressivo com outras crianças',
                        'Tímido / retraído',
                        'Ansioso (muitas preocupações, medos)',
                        'Movimentos repetitivos (mãos, corpo)',
                        'Interesses muito intensos em um tema só',
                        'Dificuldade de mudar rotinas',
                        'Seletividade alimentar acentuada',
                        'Sensibilidade a barulhos, texturas ou luzes'
                    ]
                },
                {
                    id: 'amigos', label: 'Como é o relacionamento com outras crianças?', tipo: 'select',
                    opcoes: [
                        'Tem amigos próximos e brinca bem',
                        'Tem dificuldade em fazer amigos',
                        'Prefere brincar sozinho',
                        'Conflitos frequentes com colegas',
                        'Não sei dizer'
                    ]
                }
            ]
        }
    ];

    // Adolescentes (12-17): foco em escola, comportamento, autoestima
    const SECOES_ADOLESCENTE = [
        {
            id: 'escola_adolescente',
            titulo: 'Escola',
            campos: [
                {
                    id: 'serie_escolar', label: 'Em que série está?', tipo: 'texto',
                    placeholder: 'Ex: 9º ano, 1º ano EM'
                },
                {
                    id: 'desempenho_escolar', label: 'Como avalia seu desempenho na escola?', tipo: 'select',
                    opcoes: ['Muito bom', 'Bom', 'Regular', 'Ruim', 'Muito ruim / com reprovações']
                },
                {
                    id: 'dificuldades_escolares', label: 'Tem dificuldades em alguma matéria/área?', tipo: 'checkboxes',
                    opcoes: [
                        'Leitura', 'Escrita / redação', 'Matemática', 'Ciências exatas',
                        'Concentração nas aulas', 'Estudar em casa',
                        'Provas (apesar de estudar)', 'Organização dos estudos',
                        'Nenhuma'
                    ]
                }
            ]
        },
        {
            id: 'comportamento_adolescente',
            titulo: 'Comportamento e dia a dia',
            campos: [
                {
                    id: 'comportamentos_observados', label: 'Marque o que mais te identifica (ou observam em você):', tipo: 'checkboxes',
                    opcoes: [
                        'Inquieto / não para parado',
                        'Distraído / pensamento "voa"',
                        'Impulsivo / age sem pensar',
                        'Adia tarefas até o último momento (procrastinação)',
                        'Esquece compromissos / tarefas',
                        'Dificuldade de organização',
                        'Ansiedade / preocupações constantes',
                        'Tristeza / desânimo frequentes',
                        'Irritabilidade',
                        'Pouca motivação / vontade de fazer as coisas',
                        'Crises de raiva',
                        'Conflitos com a família',
                        'Dificuldade nos relacionamentos sociais'
                    ]
                },
                {
                    id: 'amigos', label: 'Como é a vida social?', tipo: 'select',
                    opcoes: ['Tem amigos próximos', 'Tem alguns colegas mas não amigos íntimos', 'Prefere ficar sozinho', 'Sente-se isolado', 'Dificuldades nos relacionamentos']
                }
            ]
        }
    ];

    // Adultos (18-49): trabalho, vida pessoal
    const SECOES_ADULTO = [
        {
            id: 'trabalho',
            titulo: 'Trabalho e ocupação',
            campos: [
                {
                    id: 'ocupacao', label: 'Profissão / ocupação atual', tipo: 'texto',
                    placeholder: 'O que você faz hoje'
                },
                {
                    id: 'situacao_trabalho', label: 'Situação atual', tipo: 'select',
                    opcoes: ['Empregado CLT', 'Autônomo / freelancer', 'Empresário / dono de negócio', 'Estudante', 'Desempregado', 'Aposentado', 'Outro']
                },
                {
                    id: 'escolaridade', label: 'Escolaridade', tipo: 'select',
                    opcoes: [
                        'Ensino fundamental incompleto',
                        'Ensino fundamental completo',
                        'Ensino médio incompleto',
                        'Ensino médio completo',
                        'Superior incompleto',
                        'Superior completo',
                        'Pós-graduação / Mestrado / Doutorado'
                    ]
                },
                {
                    id: 'dificuldades_trabalho', label: 'Há dificuldades no trabalho que te preocupam?', tipo: 'textarea',
                    placeholder: 'Ex: dificuldade de manter foco em reuniões, prazos perdidos, conflitos com colegas...'
                }
            ]
        },
        {
            id: 'vida_pessoal',
            titulo: 'Vida pessoal',
            campos: [
                {
                    id: 'estado_civil', label: 'Estado civil', tipo: 'select',
                    opcoes: ['Solteiro(a)', 'Em relacionamento estável (sem casar)', 'Casado(a)', 'Divorciado(a) / Separado(a)', 'Viúvo(a)']
                },
                {
                    id: 'tem_filhos', label: 'Tem filhos?', tipo: 'select',
                    opcoes: ['Não', 'Sim, 1', 'Sim, 2 ou mais']
                },
                {
                    id: 'comportamentos_observados', label: 'O que mais te identifica?', tipo: 'checkboxes',
                    opcoes: [
                        'Dificuldade de concentração',
                        'Esquecimento frequente',
                        'Procrastinação intensa',
                        'Inquietação / não consegue ficar parado',
                        'Impulsividade (decisões rápidas, falar sem pensar)',
                        'Ansiedade / preocupação constante',
                        'Tristeza / desânimo',
                        'Irritabilidade',
                        'Dificuldade pra dormir',
                        'Sensação de cansaço mental constante',
                        'Crises emocionais intensas',
                        'Dificuldade nos relacionamentos',
                        'Sensibilidade a barulhos, texturas, luzes'
                    ]
                }
            ]
        }
    ];

    // Idosos (50+): autonomia, com quem mora, memória
    const SECOES_IDOSO = [
        {
            id: 'vida_idoso',
            titulo: 'Rotina e moradia',
            campos: [
                {
                    id: 'com_quem_mora', label: 'Com quem você mora?', tipo: 'select',
                    opcoes: ['Sozinho(a)', 'Com cônjuge', 'Com filhos', 'Com outros familiares', 'Em instituição (casa de repouso, ILPI)', 'Outro']
                },
                {
                    id: 'autonomia', label: 'Você precisa de ajuda em alguma dessas atividades?', tipo: 'checkboxes',
                    opcoes: [
                        'Banho / vestir-se',
                        'Cuidar das finanças (pagar contas, mexer com dinheiro)',
                        'Tomar medicamentos no horário',
                        'Cozinhar',
                        'Ir ao mercado / supermercado',
                        'Dirigir / pegar transporte',
                        'Cuidar da casa',
                        'Não preciso de ajuda em nada'
                    ]
                },
                {
                    id: 'escolaridade', label: 'Escolaridade', tipo: 'select',
                    opcoes: [
                        'Não estudou / analfabeto',
                        'Ensino fundamental incompleto',
                        'Ensino fundamental completo',
                        'Ensino médio completo',
                        'Superior completo',
                        'Pós-graduação'
                    ]
                }
            ]
        },
        {
            id: 'queixas_idoso',
            titulo: 'Queixas atuais',
            campos: [
                {
                    id: 'comportamentos_observados', label: 'O que tem percebido (ou família apontou)?', tipo: 'checkboxes',
                    opcoes: [
                        'Esquecimento de fatos recentes',
                        'Esquecimento de nomes de pessoas conhecidas',
                        'Perda de objetos com frequência',
                        'Dificuldade pra fazer contas',
                        'Confusão em conversas',
                        'Repetir perguntas várias vezes',
                        'Desorientação em lugares conhecidos',
                        'Dificuldade pra lidar com dinheiro',
                        'Tristeza / desânimo',
                        'Irritabilidade',
                        'Dificuldade pra dormir',
                        'Quedas frequentes',
                        'Mudança de personalidade'
                    ]
                },
                {
                    id: 'inicio_queixas', label: 'Há quanto tempo essas mudanças começaram?', tipo: 'select',
                    opcoes: ['Menos de 6 meses', '6 meses a 1 ano', '1 a 2 anos', 'Mais de 2 anos', 'Não sei precisar']
                },
                {
                    id: 'piora', label: 'As queixas estão piorando?', tipo: 'select',
                    opcoes: ['Sim, rapidamente', 'Sim, devagar', 'Estáveis (sem piora aparente)', 'Não sei dizer']
                }
            ]
        }
    ];

    // ============================================================================
    // MONTAGEM POR FAIXA
    // ============================================================================

    function detectarFaixa(idadeMeses) {
        if (idadeMeses == null) return 'adulto';
        const anos = idadeMeses / 12;
        if (anos < 6)  return 'infantil';
        if (anos < 12) return 'escolar';
        if (anos < 18) return 'adolescente';
        if (anos < 50) return 'adulto';
        return 'idoso';
    }

    function montarFormulario(faixa) {
        const secoes = [SECAO_QUEM_RESPONDE, SECAO_QUEIXA];

        if (faixa === 'infantil' || faixa === 'escolar') {
            secoes.push(...SECOES_INFANTIL_ESCOLAR);
        } else if (faixa === 'adolescente') {
            secoes.push(...SECOES_ADOLESCENTE);
        } else if (faixa === 'idoso') {
            secoes.push(...SECOES_IDOSO);
        } else {
            secoes.push(...SECOES_ADULTO);
        }

        secoes.push(SECAO_SAUDE);
        secoes.push(SECAO_FAMILIAR);
        secoes.push(SECAO_FINAL);

        return secoes;
    }

    return {
        detectarFaixa,
        montarFormulario
    };
})();

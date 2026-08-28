// ============================================================================
// CORTEX_APP — solicitacao_escolar_modelos.js
// ----------------------------------------------------------------------------
// Só conteúdo. Os três modelos da Solicitação de Relatório Escolar, separados
// da renderização para que editar um texto não exija mexer no código do PDF.
//
// Cada modelo tem:
//   rotulo      — nome curto para o seletor da tela
//   titulo      — faixa que aparece na tarja do documento
//   etapa       — como a etapa é descrita no parágrafo de abertura
//   faixaTexto  — faixa etária citada na introdução
//   roteiro     — seções qualitativas (o educador escreve)
//   grade       — domínios e itens da escala de frequência (o educador marca)
//   alerta      — seção de comunicação imediata (só no modelo 11–18)
// ============================================================================

window.CortexSolicitacaoEscolarModelos = (function () {
    'use strict';

    const ESCALA = ['Nunca', 'Às vezes', 'Freq.', 'Sempre', 'NA'];

    const LEGENDA_ESCALA =
        'Nunca (não observado) · Às vezes · Freq. (frequentemente) · ' +
        'Sempre (quase sempre) · NA (não se aplica / sem condições de avaliar). ' +
        'Assinale um X na coluna correspondente para cada item.';

    const ORIENTACOES =
        'Descreva o que observa de forma objetiva, com base no comportamento habitual ' +
        'do(a) estudante no ambiente escolar. Não é necessário conhecimento clínico nem ' +
        'hipótese diagnóstica — a interpretação é responsabilidade do profissional ' +
        'solicitante. Nenhum item isolado, marcado em qualquer coluna, define diagnóstico. ' +
        'Havendo dúvida sobre um item, assinale NA. Este documento é sigiloso e destina-se ' +
        'exclusivamente à avaliação clínica.';

    const LGPD =
        'A coleta pressupõe autorização do(s) responsável(is) legal(is) pelo(a) estudante. ' +
        'O documento é sigiloso, integra o prontuário e destina-se exclusivamente à avaliação ' +
        'clínica, observadas a Lei nº 13.709/2018 (LGPD) e as normas do Conselho Federal de Psicologia.';

    const COMO_UTILIZAR = [
        'Selecione o modelo correspondente à etapa escolar do(a) estudante: Educação Infantil, Ensino Fundamental — Anos Iniciais, ou Anos Finais e Ensino Médio.',
        'Preencha a identificação, entregue à escola e oriente o(a) educador(a) a responder o roteiro qualitativo e a grade de observação.',
        'A grade usa escala de frequência e organiza os itens em domínios do comportamento (atenção, humor, ansiedade, interação, conduta, sensorialidade). Trata-se de observação comportamental — não é instrumento diagnóstico, e a interpretação cabe ao profissional solicitante.',
        'Os títulos dos domínios são descritivos e não indicam hipótese diagnóstica, evitando viés de expectativa no preenchimento.'
    ];

    // ════════════════════════════════════════════════════════════════════════

    const MODELOS = {

        infantil: {
            rotulo: 'Educação infantil · 2 a 5 anos',
            titulo: 'Educação Infantil (pré-escolar)',
            etapa: 'no Ensino Infantil',
            faixaTexto: 'adequados à faixa de 2 a 5 anos',
            roteiro: [
                {
                    titulo: 'Comunicação e linguagem',
                    itens: [
                        'Linguagem expressiva: usa palavras e frases para pedir, nomear e narrar; clareza da fala para a idade.',
                        'Linguagem receptiva: compreende comandos simples e de duas etapas.',
                        'Atenção compartilhada: aponta para mostrar interesse, segue o olhar do adulto, responde ao próprio nome.'
                    ]
                },
                {
                    titulo: 'Interação social e brincar',
                    itens: [
                        'Forma de brincar (paralelo, associativo, cooperativo); busca ou evita os colegas.',
                        'Contato visual, reciprocidade e vínculo com adultos de referência.',
                        'Imitação de gestos e ações; interesse por outras crianças.'
                    ]
                },
                {
                    titulo: 'Comportamento, rotina e sensorialidade',
                    itens: [
                        'Adaptação a transições e mudanças de rotina; adesão a regras simples.',
                        'Reação a frustração e limites (intensidade, frequência e tempo de recuperação em crises).',
                        'Movimentos repetitivos e estereotipias, interesses restritos, apego rígido a rotinas ou objetos.',
                        'Reatividade sensorial (barulhos, texturas, luzes) e seletividade alimentar.'
                    ]
                },
                {
                    titulo: 'Desenvolvimento motor e autonomia (AVDs)',
                    itens: [
                        'Motricidade global (correr, pular, subir, equilíbrio) e fina (lápis, massinha, encaixes).',
                        'Autonomia em alimentação, higiene e uso do banheiro ou desfralde compatível com a idade.'
                    ]
                }
            ],
            grade: [
                {
                    dominio: 'Comunicação e interação social',
                    itens: [
                        'Usa palavras ou frases para comunicar o que quer',
                        'Compreende comandos simples do(a) professor(a)',
                        'Faz contato visual ao interagir',
                        'Responde quando é chamado(a) pelo nome',
                        'Aponta ou mostra objetos para compartilhar interesse',
                        'Procura os colegas para brincar',
                        'Imita gestos e ações de adultos ou colegas'
                    ]
                },
                {
                    dominio: 'Comportamento repetitivo e sensorialidade',
                    itens: [
                        'Apresenta movimentos repetitivos (balançar, girar, agitar as mãos)',
                        'Enfileira ou organiza objetos de forma rígida e repetitiva',
                        'Insiste em rotinas fixas e reage mal a mudanças',
                        'Reage de forma intensa a barulhos, texturas ou luzes',
                        'Apresenta seletividade alimentar acentuada'
                    ]
                },
                {
                    dominio: 'Regulação emocional e comportamento',
                    itens: [
                        'Recupera-se de frustrações em tempo razoável',
                        'Apresenta crises de choro ou birra intensas e prolongadas',
                        'Mostra sofrimento excessivo na separação dos pais ou cuidadores',
                        'Apresenta agressividade (bater, morder, empurrar) com frequência'
                    ]
                },
                {
                    dominio: 'Atenção, atividade e autonomia',
                    itens: [
                        'Permanece em atividades dirigidas por alguns minutos (ex.: rodinha)',
                        'Agita-se de forma excessiva, sem conseguir parar',
                        'Tem autonomia em alimentação e higiene esperada para a idade',
                        'Manuseia lápis, giz e materiais com destreza esperada'
                    ]
                }
            ],
            alerta: null
        },

        fundamental_inicial: {
            rotulo: 'Fundamental — anos iniciais · 6 a 10 anos',
            titulo: 'Ensino Fundamental — Anos Iniciais',
            etapa: 'no Ensino Fundamental — Anos Iniciais',
            faixaTexto: 'adequados à faixa de 6 a 10 anos',
            roteiro: [
                {
                    titulo: 'Desenvolvimento acadêmico e aprendizagem',
                    itens: [
                        'Desempenho por área (pontos fortes e frágeis); ritmo em relação à turma.',
                        'Leitura e escrita: decodificação, fluência, compreensão; trocas, omissões ou inversões de letras e sílabas.',
                        'Matemática: contagem, noção de quantidade e operações; dificuldade desproporcional.',
                        'Organização de materiais, cadernos e tarefas.'
                    ]
                },
                {
                    titulo: 'Atenção, autorregulação e comportamento',
                    itens: [
                        'Sustentação da atenção e conclusão de tarefas; distração e devaneio.',
                        'Inquietação motora, impulsividade, espera da vez, cumprimento de regras de sala.',
                        'Comportamento opositor ou desafiador; explosões de raiva; envolvimento em conflitos.'
                    ]
                },
                {
                    titulo: 'Interação social e adaptação',
                    itens: [
                        'Estabelecimento e manutenção de amizades; aceitação pelos pares.',
                        'Compreensão de regras sociais implícitas; comportamento em grupo.'
                    ]
                },
                {
                    titulo: 'Indicadores emocionais',
                    itens: [
                        'Sinais de tristeza, choro, desânimo; ansiedade diante de provas e avaliações.',
                        'Retração, dificuldade de falar ou participar (possível mutismo seletivo).',
                        'Queixas físicas recorrentes sem causa aparente (dor de cabeça, dor de barriga).'
                    ]
                }
            ],
            grade: [
                {
                    dominio: 'Aprendizagem (leitura, escrita e matemática)',
                    itens: [
                        'Lê no ritmo esperado para o ano escolar',
                        'Compreende o que lê',
                        'Troca, omite ou inverte letras e sílabas na leitura ou escrita',
                        'Apresenta escrita legível e organizada no papel',
                        'Tem dificuldade desproporcional com números e operações'
                    ]
                },
                {
                    dominio: 'Atenção e autorregulação',
                    itens: [
                        'Mantém a atenção nas tarefas até concluí-las',
                        'Distrai-se com facilidade ou parece “no mundo da lua”',
                        'Perde ou esquece materiais e tarefas com frequência',
                        'Levanta-se ou se mexe em excesso, tem dificuldade de ficar sentado(a)',
                        'Age por impulso ou responde antes de a pergunta terminar',
                        'Aguarda a vez e segue as regras da sala'
                    ]
                },
                {
                    dominio: 'Comportamento e conduta',
                    itens: [
                        'Opõe-se ou desafia regras e adultos de forma frequente',
                        'Apresenta explosões de raiva desproporcionais',
                        'Envolve-se em conflitos físicos ou verbais'
                    ]
                },
                {
                    dominio: 'Interação social',
                    itens: [
                        'Estabelece e mantém amizades',
                        'É aceito(a) pelos colegas',
                        'Compreende regras sociais implícitas (vez, limites, contexto)'
                    ]
                },
                {
                    dominio: 'Humor e ansiedade',
                    itens: [
                        'Demonstra tristeza, choro ou desânimo com frequência',
                        'Mostra-se excessivamente preocupado(a) ou ansioso(a)',
                        'Queixa-se de sintomas físicos sem causa aparente',
                        'Evita falar ou participar; mostra-se muito retraído(a)',
                        'Isola-se dos colegas'
                    ]
                }
            ],
            alerta: null
        },

        fundamental_final_medio: {
            rotulo: 'Fundamental II e médio · 11 a 18 anos',
            titulo: 'Ensino Fundamental II e Ensino Médio',
            etapa: 'no Ensino Fundamental II — Anos Finais ou Ensino Médio',
            faixaTexto: 'adequados à faixa etária de 11 a 18 anos',
            roteiro: [
                {
                    titulo: 'Desempenho acadêmico e funções executivas',
                    itens: [
                        'Pontos fortes e frágeis por disciplina; hábitos de estudo e organização.',
                        'Planejamento, cumprimento de prazos e autonomia nas tarefas.',
                        'Alterações recentes de rendimento (queda ou instabilidade abrupta).'
                    ]
                },
                {
                    titulo: 'Atenção e autorregulação',
                    itens: [
                        'Sustentação da atenção em aulas e leituras longas; impulsividade; procrastinação.'
                    ]
                },
                {
                    titulo: 'Humor, ansiedade e sofrimento emocional',
                    itens: [
                        'Sinais de tristeza persistente, irritabilidade, perda de interesse, cansaço ou sonolência.',
                        'Ansiedade, tensão, evitação de avaliações e apresentações; sinais físicos de ansiedade.',
                        'Faltas ou saídas de aula por mal-estar recorrente.'
                    ]
                },
                {
                    titulo: 'Interação social, convivência e conduta',
                    itens: [
                        'Relacionamento com colegas e professores; isolamento; mudança do grupo de convívio.',
                        'Situações de exclusão, provocação ou bullying (como alvo ou autor).',
                        'Transgressões de regras, agressividade e comportamentos de risco.'
                    ]
                },
                {
                    titulo: 'Autoimagem e comportamento alimentar',
                    itens: [
                        'Comentários negativos sobre o próprio corpo ou valor pessoal.',
                        'Mudanças marcantes de apetite, peso ou comportamento alimentar.'
                    ]
                }
            ],
            grade: [
                {
                    dominio: 'Desempenho acadêmico e funções executivas',
                    itens: [
                        'Entrega tarefas e trabalhos nos prazos',
                        'Organiza materiais, agenda e rotina de estudos',
                        'Mantém o foco em aulas e leituras mais longas',
                        'Apresentou queda recente ou abrupta no rendimento'
                    ]
                },
                {
                    dominio: 'Atenção e autorregulação',
                    itens: [
                        'Distrai-se com facilidade durante as aulas',
                        'Age por impulso, sem pensar nas consequências',
                        'Deixa tarefas incompletas ou para a última hora com frequência'
                    ]
                },
                {
                    dominio: 'Humor e energia',
                    itens: [
                        'Demonstra tristeza, choro ou desânimo persistentes',
                        'Mostra-se irritável ou impaciente além do habitual',
                        'Perdeu o interesse por atividades de que antes gostava',
                        'Parece cansado(a), sonolento(a) ou sem energia em aula',
                        'Afastou-se de colegas e das atividades escolares'
                    ]
                },
                {
                    dominio: 'Ansiedade',
                    itens: [
                        'Mostra-se tenso(a), preocupado(a) ou apreensivo(a)',
                        'Evita apresentações, provas ou situações sociais',
                        'Apresenta sinais físicos de ansiedade (tremor, falta de ar, sudorese)',
                        'Falta às aulas ou pede para sair por mal-estar com frequência'
                    ]
                },
                {
                    dominio: 'Convivência, conduta e bullying',
                    itens: [
                        'Relaciona-se bem com colegas e professores',
                        'Aparenta ser alvo de exclusão, provocações ou bullying',
                        'Adota postura de intimidação ou agressão sobre colegas',
                        'Envolve-se em transgressões de regras ou comportamentos de risco',
                        'Mudou de grupo de convívio de forma marcante'
                    ]
                },
                {
                    dominio: 'Autoimagem e comportamento alimentar',
                    itens: [
                        'Faz comentários negativos sobre o próprio corpo ou valor',
                        'Apresenta mudança marcante de apetite, peso ou hábito alimentar'
                    ]
                }
            ],
            alerta: {
                titulo: 'Sinais de alerta — comunicação imediata',
                instrucao: 'Assinale caso observe qualquer um dos indicadores abaixo. ' +
                    'Havendo qualquer marcação nesta seção, comunique imediatamente a coordenação ' +
                    'e a família e acione o protocolo institucional de proteção. Não aborde o(a) ' +
                    'estudante isoladamente sobre o tema e mantenha o registro em sigilo.',
                itens: [
                    'Verbalizações de desesperança, de não ver sentido ou de querer “desaparecer”',
                    'Menção a se machucar ou marcas compatíveis com autolesão',
                    'Mudança de comportamento abrupta e intensa, isolamento súbito ou despedidas atípicas'
                ]
            }
        }
    };

    return { MODELOS, ESCALA, LEGENDA_ESCALA, ORIENTACOES, LGPD, COMO_UTILIZAR };
})();

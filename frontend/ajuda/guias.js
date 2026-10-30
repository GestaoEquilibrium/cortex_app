// ============================================================================
// CORTEX_APP — Instruções: conteúdo dos guias
// ----------------------------------------------------------------------------
// Cada guia tem passos; cada passo pode ter texto (html), uma imagem com
// marcas (x, y, w, h em % da imagem), perguntas frequentes (faq) ou um link
// para um guia antigo. publico: perfis que veem o guia ('*' = todos).
// Para um guia novo, é só acrescentar aqui.
// ============================================================================
window.CORTEX_GUIAS = [
 {
  "id": "externos-clinica",
  "icone": "🩺",
  "cor": "#0E9AA7",
  "titulo": "Liberar acesso a profissional externo",
  "resumo": "Cadastrar médicos, escolas e psicólogos de fora da clínica, atribuir pacientes e escolher o que cada um vê.",
  "publico": [
   "admin_clinico",
   "admin_gestor"
  ],
  "publicoTxt": "Para a coordenação (admins)",
  "passos": [
   {
    "titulo": "Antes de começar",
    "html": "<p>O <strong>profissional externo</strong> é alguém de fora da clínica que acompanha ou pediu a avaliação: médico, coordenação da escola, psicólogo, fonoaudiólogo. Ele entra no CORTEX com login próprio, vê só os pacientes atribuídos a ele e, em cada paciente, só as abas marcadas. <strong>Ele não altera nada.</strong></p>\n<table class=\"aj-tab\"><thead><tr><th>O que fazer</th><th>Onde</th><th>Quem pode</th></tr></thead><tbody>\n<tr><td>Cadastrar o profissional externo</td><td>Configurações → Profissionais, ou ele mesmo pelo link de cadastro</td><td>Admin clínico</td></tr>\n<tr><td>Responder pedidos de acesso</td><td>Configurações → Profissionais, ou na pasta do paciente</td><td>Admin clínico e admin gestor</td></tr>\n<tr><td>Atribuir um paciente e escolher as abas</td><td>Pasta do paciente → Profissionais externos</td><td>Admin clínico e admin gestor</td></tr>\n<tr><td>Abrir a conversa do caso</td><td>Pasta do paciente → Vamos discutir o caso!</td><td>Admins e o próprio externo</td></tr></tbody></table>\n<ul class=\"aj-lista\"><li>O padrão é ver só a <strong>Correção</strong> (resultados dos testes) e o <strong>Laudo</strong>. O resto começa bloqueado.</li>\n<li>Um paciente pode ter vários externos, cada um com abas diferentes.</li>\n<li>O acesso antigo pelo QR do prontuário (botão Acesso externo) continua igual. É outra coisa e não usa este cadastro.</li>\n<li>Laudo Online em construção nunca aparece para o externo.</li></ul>"
   },
   {
    "titulo": "Cadastrar o profissional",
    "html": "<p>O cadastro é feito uma vez por pessoa, em <strong>Configurações → aba Profissionais</strong>. Os externos ficam numa lista separada, abaixo da equipe. Passe o mouse ou toque nos números da imagem.</p>",
    "imagem": {
     "src": "img/a1_config_externos.webp",
     "alt": "Configurações, lista de profissionais externos",
     "proporcao": 0.6296,
     "marcas": [
      {
       "n": 1,
       "x": 22.47,
       "y": 52.73,
       "w": 73.94,
       "h": 11.4,
       "titulo": "Lista separada",
       "texto": "Os profissionais externos ficam aqui, separados da equipe da clínica."
      },
      {
       "n": 2,
       "x": 82.5,
       "y": 53.08,
       "w": 13.69,
       "h": 5.06,
       "titulo": "+ Profissional externo",
       "texto": "Abre o cadastro já com o perfil certo."
      },
      {
       "n": 3,
       "x": 44.77,
       "y": 66.25,
       "w": 6.43,
       "h": 3.55,
       "titulo": "Quantos pacientes",
       "texto": "Mostra quantos pacientes estão atribuídos a cada externo."
      }
     ]
    }
   },
   {
    "titulo": "Preencher o cadastro",
    "html": "<p>Preencha e salve. Depois, mande para o profissional o endereço do CORTEX, o e-mail, a senha provisória e o guia <a href=\"?guia=externo-uso\">Como usar o acesso externo</a>. O e-mail não pode ser trocado depois.</p>",
    "imagem": {
     "src": "img/a2_novo_externo.webp",
     "alt": "Cadastro de novo profissional externo",
     "proporcao": 1.1051,
     "marcas": [
      {
       "n": 1,
       "x": 50.74,
       "y": 28.61,
       "w": 42.94,
       "h": 6.92,
       "titulo": "Perfil",
       "texto": "Já vem como Profissional externo. Não troque."
      },
      {
       "n": 2,
       "x": 6.32,
       "y": 42.32,
       "w": 42.94,
       "h": 6.92,
       "titulo": "Registro",
       "texto": "CRM, CRP ou outro conselho. Para escola, pode deixar em branco."
      },
      {
       "n": 3,
       "x": 6.32,
       "y": 53.29,
       "w": 87.35,
       "h": 6.92,
       "titulo": "Especialidade / instituição",
       "texto": "Ex.: Neuropediatra, ou Coordenação pedagógica · Escola Modelo. Aparece no cadastro e no chat."
      },
      {
       "n": 4,
       "x": 6.32,
       "y": 75.25,
       "w": 87.35,
       "h": 6.92,
       "titulo": "Senha provisória",
       "texto": "Mínimo de 8 caracteres. Anote antes de salvar."
      },
      {
       "n": 5,
       "x": 78.18,
       "y": 89.02,
       "w": 15.49,
       "h": 5.79,
       "titulo": "Salvar",
       "texto": "Cria o login. O profissional já pode entrar."
      }
     ]
    }
   },
   {
    "titulo": "Ou mande o link de cadastro",
    "html": "<p>Em vez de cadastrar você, pode mandar o <strong>link de cadastro</strong>. O profissional preenche os próprios dados, entra direto no CORTEX sem nenhum paciente, busca o paciente pelo nome e pede acesso. O link fica no mesmo cartão de Profissionais externos.</p><p>Quem se cadastra sem esse link (por outro caminho) fica desativado e não entra.</p>",
    "imagem": {
     "src": "img/n4_config_link.webp",
     "alt": "Link de cadastro e pedidos em Configurações",
     "proporcao": 0.6296,
     "marcas": [
      {
       "n": 1,
       "x": 22.69,
       "y": 18.55,
       "w": 51.17,
       "h": 5.35,
       "titulo": "Link de cadastro",
       "texto": "Clique em Mostrar link para ver o endereço. Ele mostra quantas pessoas já se cadastraram por ele."
      },
      {
       "n": 2,
       "x": 81.47,
       "y": 19.1,
       "w": 5.57,
       "h": 4.24,
       "titulo": "Copiar",
       "texto": "Copia o link para mandar por WhatsApp ou e-mail."
      },
      {
       "n": 3,
       "x": 86.89,
       "y": 19.1,
       "w": 9.3,
       "h": 4.24,
       "titulo": "Gerar novo link",
       "texto": "O link atual para de funcionar. Use se ele foi parar com quem não devia. Quem já se cadastrou continua com acesso."
      },
      {
       "n": 4,
       "x": 22.84,
       "y": 30.47,
       "w": 73.21,
       "h": 32.21,
       "titulo": "Pedido de acesso",
       "texto": "Pedidos esperando resposta, com a mensagem do profissional e o paciente pedido."
      },
      {
       "n": 5,
       "x": 85.59,
       "y": 56.86,
       "w": 9.51,
       "h": 4.53,
       "titulo": "Aprovar acesso",
       "texto": "Libera o paciente com as abas marcadas logo acima. Ele recebe um aviso no sino."
      }
     ]
    }
   },
   {
    "titulo": "Responder pedidos de acesso",
    "html": "<p>Quando um externo pede acesso, a coordenação recebe um aviso no sino. O aviso abre a pasta do paciente já com a janela dos externos aberta. Os pedidos também aparecem em Configurações → Profissionais.</p>",
    "imagem": {
     "src": "img/n5_pasta_pedido.webp",
     "alt": "Pedido de acesso na pasta do paciente",
     "proporcao": 0.6296,
     "marcas": [
      {
       "n": 1,
       "x": 30.82,
       "y": 31.46,
       "w": 38.36,
       "h": 42.62,
       "titulo": "Pedido",
       "texto": "Quem pediu, especialidade, registro e a mensagem que ele deixou."
      },
      {
       "n": 2,
       "x": 31.77,
       "y": 50.7,
       "w": 36.46,
       "h": 17.56,
       "titulo": "Abas se aprovar",
       "texto": "Correção e Laudo já vêm marcadas. Ajuste antes de aprovar."
      },
      {
       "n": 3,
       "x": 58.72,
       "y": 68.26,
       "w": 9.51,
       "h": 4.53,
       "titulo": "Aprovar acesso",
       "texto": "Libera na hora. O paciente aparece na lista dele e ele entra na conversa do caso."
      },
      {
       "n": 4,
       "x": 53.01,
       "y": 68.26,
       "w": 5.86,
       "h": 4.53,
       "titulo": "Recusar",
       "texto": "Ele recebe um aviso de que o acesso não foi liberado e pode pedir de novo."
      }
     ]
    }
   },
   {
    "titulo": "Abrir na pasta do paciente",
    "html": "<p>A liberação é feita na pasta de cada paciente. Abra a pasta e clique em <strong>Profissionais externos</strong>.</p>",
    "imagem": {
     "src": "img/a3_pasta_botao.webp",
     "alt": "Pasta do paciente, botão Profissionais externos",
     "proporcao": 0.3807,
     "marcas": [
      {
       "n": 1,
       "x": 43.67,
       "y": 52.46,
       "w": 13.86,
       "h": 7.02,
       "titulo": "Profissionais externos",
       "texto": "Abre a janela para atribuir este paciente e escolher as abas."
      }
     ]
    }
   },
   {
    "titulo": "Atribuir e escolher as abas",
    "html": "<p>Escolha o profissional, confira as abas e clique em <strong>Atribuir paciente</strong>. O paciente aparece na lista dele na hora.</p>",
    "imagem": {
     "src": "img/a4_atribuir.webp",
     "alt": "Janela para atribuir o paciente",
     "proporcao": 0.6296,
     "marcas": [
      {
       "n": 1,
       "x": 30.67,
       "y": 44.18,
       "w": 38.65,
       "h": 5.7,
       "titulo": "Atribuir a",
       "texto": "Só aparecem externos cadastrados, ativos e que ainda não acompanham este paciente."
      },
      {
       "n": 2,
       "x": 30.67,
       "y": 53.13,
       "w": 38.65,
       "h": 17.56,
       "titulo": "Abas que ele poderá ver",
       "texto": "Correção e Laudo já vêm marcadas. Marque outras só se fizer sentido para esse profissional."
      },
      {
       "n": 3,
       "x": 58.28,
       "y": 74.76,
       "w": 11.19,
       "h": 5.06,
       "titulo": "Atribuir paciente",
       "texto": "Salva na hora."
      }
     ]
    },
    "depois": "<details class=\"aj-det\" open><summary>O que cada aba libera</summary><table class=\"aj-tab\"><thead><tr><th>Aba</th><th>O externo passa a ver</th></tr></thead><tbody>\n<tr><td>Correção</td><td>Os testes já corrigidos, com o resultado completo</td></tr>\n<tr><td>Laudo</td><td>O laudo em PDF e o Laudo Online finalizado</td></tr>\n<tr><td>Visão geral</td><td>Telefone, endereço, CPF e dados do responsável</td></tr>\n<tr><td>Evolução</td><td>As evoluções das sessões</td></tr>\n<tr><td>Anamnese</td><td>A anamnese e o relatório escolar</td></tr>\n<tr><td>Hipóteses e Checklist</td><td>As hipóteses e os testes escolhidos</td></tr>\n<tr><td>Bateria</td><td>A lista de testes e o andamento</td></tr>\n<tr><td>Documentos</td><td>Os documentos anexados à pasta</td></tr>\n<tr><td>Devolutiva</td><td>A devolutiva</td></tr></tbody></table></details>"
   },
   {
    "titulo": "Pasta com externos",
    "html": "<p>Para colocar outro profissional no mesmo paciente, repita o passo anterior. A pasta passa a mostrar quantos externos o paciente tem e o botão da conversa do caso.</p>",
    "imagem": {
     "src": "img/a5_pasta_com_externos.webp",
     "alt": "Pasta com externos atribuídos",
     "proporcao": 0.3807,
     "marcas": [
      {
       "n": 1,
       "x": 43.67,
       "y": 52.46,
       "w": 15.35,
       "h": 7.02,
       "titulo": "Profissionais externos (2)",
       "texto": "Quantos externos acompanham este paciente. Clique para mudar abas ou remover."
      },
      {
       "n": 2,
       "x": 58.87,
       "y": 52.65,
       "w": 13.89,
       "h": 6.63,
       "titulo": "Vamos discutir o caso!",
       "texto": "Abre a conversa do caso com os externos e o Wessilon."
      }
     ]
    }
   },
   {
    "titulo": "Mudar abas ou remover",
    "html": "<p>Abra de novo <strong>Profissionais externos</strong>. Cada externo aparece com as abas dele. A troca de aba salva sozinha, sem botão.</p>",
    "imagem": {
     "src": "img/a6_gerenciar.webp",
     "alt": "Externos do paciente com abas e Remover",
     "proporcao": 0.6296,
     "marcas": [
      {
       "n": 1,
       "x": 30.75,
       "y": 28.49,
       "w": 38.51,
       "h": 8.08,
       "titulo": "Conversa do caso",
       "texto": "Atalho para o Vamos discutir o caso!."
      },
      {
       "n": 2,
       "x": 31.77,
       "y": 47.21,
       "w": 36.46,
       "h": 17.56,
       "titulo": "Abas",
       "texto": "Marque ou desmarque. Salva na hora e mostra “Abas salvas”. Pelo menos uma precisa ficar marcada."
      },
      {
       "n": 3,
       "x": 62.08,
       "y": 41.75,
       "w": 6.15,
       "h": 4.3,
       "titulo": "Remover",
       "texto": "Tira o acesso dele a este paciente."
      }
     ]
    }
   },
   {
    "titulo": "Confirmar a remoção",
    "html": "<p>O CORTEX pede confirmação. Depois de confirmar, o paciente some da lista do profissional na hora e ele sai sozinho da conversa do caso. Os outros pacientes dele não mudam.</p>",
    "imagem": {
     "src": "img/a7_remover.webp",
     "alt": "Confirmação para remover o acesso",
     "proporcao": 0.6296,
     "marcas": [
      {
       "n": 1,
       "x": 56.9,
       "y": 56.47,
       "w": 7.45,
       "h": 5.06,
       "titulo": "Remover",
       "texto": "Confirma a retirada do acesso."
      }
     ]
    }
   },
   {
    "titulo": "A conversa do caso",
    "html": "<p>O botão <strong>Vamos discutir o caso!</strong> abre, em Mensagens, um grupo com todos os externos do paciente e o Wessilon. É um grupo por paciente, chamado “Caso · nome do paciente”.</p>\n<ul class=\"aj-lista\"><li>O Wessilon sempre está no grupo.</li><li>Externo atribuído entra sozinho; externo removido sai sozinho. O grupo registra quem entrou e saiu.</li><li>Quem da clínica clicar no botão também entra.</li><li>Cada mensagem gera aviso no sino, como no chat normal.</li></ul>",
    "imagem": {
     "src": "img/a8_chat_caso_admin.webp",
     "alt": "Conversa do caso em Mensagens",
     "proporcao": 0.6296,
     "marcas": [
      {
       "n": 1,
       "x": 21.38,
       "y": 19.05,
       "w": 24.3,
       "h": 8.84,
       "titulo": "Grupo do caso",
       "texto": "O grupo do paciente na lista de conversas."
      }
     ]
    }
   },
   {
    "titulo": "Conferir, desativar e dúvidas",
    "html": "<p><strong>Conferir o que o externo vê:</strong> o acesso de suporte (André) usa o <em>Ver como</em>, no nome da barra lateral, e escolhe o externo. A tela fica igual à dele, só leitura.</p>\n<p><strong>Desativar um externo:</strong> em Configurações → Profissionais, clique em <strong>Desativar</strong>. Ele deixa de ver todos os pacientes de uma vez. Para tirar só um paciente, use Remover na pasta.</p>",
    "faq": [
     {
      "p": "O externo diz que não vê o paciente.",
      "r": "Confira na pasta se ele está atribuído e se o cadastro dele está ativo."
     },
     {
      "p": "Ele vê o paciente, mas não vê um teste.",
      "r": "Na Correção aparecem só os testes já corrigidos."
     },
     {
      "p": "Ele não vê o laudo.",
      "r": "O laudo só aparece depois que a clínica envia o PDF ou finaliza o Laudo Online."
     },
     {
      "p": "Ele esqueceu a senha.",
      "r": "O externo não tem tela para trocar a senha. Fale com o suporte (André)."
     },
     {
      "p": "Alguém se cadastrou e não consegue entrar.",
      "r": "Quem se cadastra sem o link da clínica fica desativado. Ative em Configurações → Profissionais, se for alguém conhecido."
     },
     {
      "p": "Ele tentou abrir outra tela do sistema.",
      "r": "O CORTEX manda ele de volta para a lista de pacientes. O menu dele tem Pacientes, Mensagens e Instruções."
     }
    ]
   }
  ]
 },
 {
  "id": "externo-uso",
  "icone": "👩‍⚕️",
  "cor": "#2F6FED",
  "titulo": "Como usar o acesso externo",
  "resumo": "Para médicos, escolas e psicólogos que acompanham um paciente: entrar, ver resultados e laudo, conversar com a clínica.",
  "publico": [
   "*"
  ],
  "publicoTxt": "Para o profissional externo",
  "passos": [
   {
    "titulo": "Fazer o cadastro pelo link",
    "html": "<p>A clínica envia um <strong>link de cadastro</strong>. Abra, preencha seus dados e clique em <strong>Criar meu acesso e entrar</strong>. Você entra no CORTEX na hora. Se a clínica já fez o seu cadastro e mandou uma senha, pule para o próximo passo.</p><p>Se aparecer “Link vencido”, peça um link novo à clínica.</p>",
    "imagem": {
     "src": "img/n1_cadastro.webp",
     "alt": "Página de cadastro",
     "proporcao": 0.6296,
     "marcas": [
      {
       "n": 1,
       "x": 48.54,
       "y": 16.28,
       "w": 35.13,
       "h": 5.93,
       "titulo": "Nome completo",
       "texto": "Como você quer aparecer para a clínica."
      },
      {
       "n": 2,
       "x": 48.54,
       "y": 24.88,
       "w": 35.13,
       "h": 5.93,
       "titulo": "Especialidade ou instituição",
       "texto": "Ex.: Neuropediatra, ou Coordenação pedagógica da Escola X."
      },
      {
       "n": 3,
       "x": 48.54,
       "y": 44.42,
       "w": 35.13,
       "h": 5.93,
       "titulo": "E-mail",
       "texto": "Você vai usar este e-mail para entrar."
      },
      {
       "n": 4,
       "x": 48.54,
       "y": 55.35,
       "w": 17.42,
       "h": 5.93,
       "titulo": "Senha",
       "texto": "Mínimo de 8 caracteres. A barrinha mostra se a senha está forte."
      },
      {
       "n": 5,
       "x": 48.69,
       "y": 65.7,
       "w": 34.84,
       "h": 10.52,
       "titulo": "Declaração de sigilo",
       "texto": "Obrigatória. O acesso é só para acompanhar os pacientes liberados."
      },
      {
       "n": 6,
       "x": 48.69,
       "y": 77.38,
       "w": 34.84,
       "h": 5.93,
       "titulo": "Criar meu acesso e entrar",
       "texto": "Cria o cadastro e já abre a sua lista de pacientes."
      }
     ]
    }
   },
   {
    "titulo": "Entrar no CORTEX",
    "html": "<p>Nas próximas vezes, abra o endereço do CORTEX que a clínica enviou, no computador ou no celular, e entre com o e-mail e a senha que você recebeu. Para sair, use o ícone ao lado do seu nome, embaixo na barra lateral.</p>",
    "imagem": {
     "src": "img/e1_login.webp",
     "alt": "Tela de entrada",
     "proporcao": 0.6296,
     "marcas": [
      {
       "n": 1,
       "x": 36.24,
       "y": 44.02,
       "w": 27.53,
       "h": 5.93,
       "titulo": "E-mail",
       "texto": "O mesmo que a clínica cadastrou para você."
      },
      {
       "n": 2,
       "x": 36.24,
       "y": 53.29,
       "w": 27.53,
       "h": 5.93,
       "titulo": "Senha",
       "texto": "A senha que a clínica enviou."
      },
      {
       "n": 3,
       "x": 36.24,
       "y": 60.39,
       "w": 27.53,
       "h": 5.93,
       "titulo": "Entrar",
       "texto": "Você vai direto para a sua lista de pacientes."
      }
     ]
    }
   },
   {
    "titulo": "Seus pacientes",
    "html": "<p>A lista mostra só os pacientes que a clínica atribuiu a você. Paciente novo aparece aqui sozinho. Dá para buscar pelo nome e trocar entre Cards e Lista.</p>",
    "imagem": {
     "src": "img/e2_lista.webp",
     "alt": "Lista de pacientes do externo",
     "proporcao": 0.6296,
     "marcas": [
      {
       "n": 1,
       "x": 1.76,
       "y": 11.51,
       "w": 16.25,
       "h": 5.38,
       "titulo": "Pacientes",
       "texto": "A sua lista de pacientes."
      },
      {
       "n": 2,
       "x": 1.76,
       "y": 16.66,
       "w": 16.25,
       "h": 5.38,
       "titulo": "Mensagens",
       "texto": "Conversas com a clínica. O número azul mostra mensagens não lidas."
      },
      {
       "n": 3,
       "x": 20.64,
       "y": 18.31,
       "w": 77.6,
       "h": 22.67,
       "titulo": "Cartões dos pacientes",
       "texto": "Clique em um para abrir a pasta."
      }
     ]
    }
   },
   {
    "titulo": "Pedir acesso a um paciente",
    "html": "<p>Digite o nome do paciente na busca, com pelo menos 3 letras. Abaixo dos seus pacientes aparecem os <strong>outros pacientes da clínica</strong> com esse nome. Deles você vê só o nome, a idade e o sexo, e não abre a pasta.</p>",
    "imagem": {
     "src": "img/n2_lista_busca.webp",
     "alt": "Busca e pedido de acesso",
     "proporcao": 0.6296,
     "marcas": [
      {
       "n": 1,
       "x": 20.86,
       "y": 18.66,
       "w": 77.16,
       "h": 12.38,
       "titulo": "Boas-vindas",
       "texto": "Aparece enquanto você não tem pacientes liberados."
      },
      {
       "n": 2,
       "x": 20.72,
       "y": 12.15,
       "w": 28.91,
       "h": 5.35,
       "titulo": "Busca",
       "texto": "Digite o nome do paciente. A partir de 3 letras aparecem os outros pacientes da clínica."
      },
      {
       "n": 3,
       "x": 21.96,
       "y": 72.27,
       "w": 23.23,
       "h": 5.12,
       "titulo": "Solicitar acesso",
       "texto": "Envia o pedido para a clínica."
      },
      {
       "n": 4,
       "x": 47.97,
       "y": 72.5,
       "w": 22.94,
       "h": 4.74,
       "titulo": "Pedido enviado",
       "texto": "Seu pedido está esperando a resposta da clínica."
      }
     ]
    }
   },
   {
    "titulo": "Enviar o pedido",
    "html": "<p>Se quiser, deixe uma mensagem para a clínica, por exemplo, quem você é para o paciente. Quando a clínica responder, você recebe um aviso no sino. Se aprovar, o paciente aparece na sua lista.</p>",
    "imagem": {
     "src": "img/n3_solicitar.webp",
     "alt": "Janela de solicitar acesso",
     "proporcao": 0.6296,
     "marcas": [
      {
       "n": 1,
       "x": 35.8,
       "y": 50.51,
       "w": 28.4,
       "h": 10.81,
       "titulo": "Mensagem",
       "texto": "Opcional. Ajuda a clínica a entender o pedido."
      },
      {
       "n": 2,
       "x": 54.6,
       "y": 66.09,
       "w": 9.75,
       "h": 5.06,
       "titulo": "Enviar pedido",
       "texto": "Manda o pedido. Não precisa pedir de novo: o cartão mostra que está aguardando."
      }
     ]
    }
   },
   {
    "titulo": "A pasta do paciente",
    "html": "<p>Você vê só as abas liberadas para você, normalmente <strong>Correção</strong> e <strong>Laudo</strong>. Você só lê: nada do que fizer altera a pasta. Para ver outra parte, peça na conversa do caso.</p>",
    "imagem": {
     "src": "img/e3_pasta.webp",
     "alt": "Pasta vista pelo externo",
     "proporcao": 0.6296,
     "marcas": [
      {
       "n": 1,
       "x": 20.79,
       "y": 6.69,
       "w": 77.31,
       "h": 8.99,
       "titulo": "Aviso azul",
       "texto": "Lembra que este é um acesso de profissional externo, só leitura."
      },
      {
       "n": 2,
       "x": 20.79,
       "y": 36.38,
       "w": 77.31,
       "h": 6.4,
       "titulo": "Abas",
       "texto": "Troque entre as partes liberadas para você."
      },
      {
       "n": 3,
       "x": 38.78,
       "y": 28.88,
       "w": 13.89,
       "h": 4.01,
       "titulo": "Vamos discutir o caso!",
       "texto": "Abre a conversa deste paciente com a clínica."
      }
     ]
    }
   },
   {
    "titulo": "Resultados dos testes",
    "html": "<p>A aba <strong>Correção</strong> lista os testes já corrigidos, com a data. Testes em aplicação ou aguardando correção não aparecem.</p>",
    "imagem": {
     "src": "img/e4_correcao.webp",
     "alt": "Aba Correção",
     "proporcao": 0.6296,
     "marcas": [
      {
       "n": 1,
       "x": 83.62,
       "y": 55.51,
       "w": 9.94,
       "h": 4.24,
       "titulo": "Ver resultado",
       "texto": "Abre o resultado completo do teste, com tabelas e gráficos, como a clínica vê. Feche com o X ou a tecla Esc."
      }
     ]
    }
   },
   {
    "titulo": "O laudo",
    "html": "<p>A aba <strong>Laudo</strong> mostra o laudo assim que a clínica o finaliza. O laudo tem dados sensíveis: guarde o PDF em local seguro e não encaminhe a terceiros.</p>",
    "imagem": {
     "src": "img/e5_laudo.webp",
     "alt": "Aba Laudo",
     "proporcao": 0.6296,
     "marcas": [
      {
       "n": 1,
       "x": 38.05,
       "y": 51.52,
       "w": 4.85,
       "h": 4.24,
       "titulo": "Abrir",
       "texto": "Abre o Laudo Online, a versão interativa do laudo na tela."
      },
      {
       "n": 2,
       "x": 80.09,
       "y": 80.24,
       "w": 14.57,
       "h": 4.48,
       "titulo": "Visualizar e Baixar",
       "texto": "Abrem ou salvam o laudo em PDF. Versões antigas ficam no Histórico, mais abaixo."
      }
     ]
    }
   },
   {
    "titulo": "Conversa do caso e Mensagens",
    "html": "<p>O botão <strong>Vamos discutir o caso!</strong> abre um grupo sobre o paciente com todos os profissionais externos que o acompanham e o Wessilon, responsável pela avaliação.</p>\n<ul class=\"aj-lista\"><li>Suas mensagens ficam à direita, em azul.</li><li>Os avisos cinza mostram quem entrou ou saiu do caso.</li><li>Em Mensagens, o botão <strong>+ Nova</strong> abre conversa direta com alguém da clínica.</li><li>Mensagem nova aparece com número em Mensagens e no sino.</li></ul>",
    "imagem": {
     "src": "img/e6_chat_caso.webp",
     "alt": "Conversa do caso",
     "proporcao": 0.6296,
     "marcas": [
      {
       "n": 1,
       "x": 21.38,
       "y": 19.05,
       "w": 24.3,
       "h": 8.84,
       "titulo": "Grupo do caso",
       "texto": "Cada paciente tem o seu grupo. Ele fica na sua lista de Mensagens."
      },
      {
       "n": 2,
       "x": 47.88,
       "y": 86.94,
       "w": 45.1,
       "h": 6.31,
       "titulo": "Escrever",
       "texto": "Digite e aperte Enter para enviar. Shift + Enter quebra a linha."
      }
     ]
    }
   },
   {
    "titulo": "No celular",
    "html": "<p>O CORTEX funciona no navegador do celular, sem instalar nada. A pasta fica em coluna e o menu fica na barra de baixo.</p>",
    "imagens": [
     {
      "src": "img/e7_celular_pasta.webp",
      "alt": "Pasta no celular",
      "proporcao": 2.1641,
      "marcas": [
       {
        "n": 1,
        "x": 2.82,
        "y": 12.14,
        "w": 94.36,
        "h": 13.39,
        "titulo": "Aviso",
        "texto": "Acesso de profissional externo, só leitura."
       },
       {
        "n": 2,
        "x": 7.18,
        "y": 59.48,
        "w": 85.64,
        "h": 5.92,
        "titulo": "Conversa do caso",
        "texto": "O mesmo botão, maior no celular."
       },
       {
        "n": 3,
        "x": 2.82,
        "y": 68.61,
        "w": 94.36,
        "h": 6.04,
        "titulo": "Abas",
        "texto": "As partes liberadas para você."
       },
       {
        "n": 4,
        "x": 0,
        "y": 92.89,
        "w": 100,
        "h": 7.11,
        "titulo": "Menu",
        "texto": "Pacientes e Mensagens ficam aqui embaixo."
       }
      ]
     },
     {
      "src": "img/e8_celular_correcao.webp",
      "alt": "Resultados no celular",
      "proporcao": 2.1641,
      "marcas": [
       {
        "n": 1,
        "x": 16.67,
        "y": 37.92,
        "w": 39.93,
        "h": 6.4,
        "titulo": "Ver resultado",
        "texto": "Abre o resultado completo do teste."
       }
      ]
     }
    ]
   },
   {
    "titulo": "Dúvidas e sigilo",
    "html": "<p><strong>Sigilo:</strong> os dados são de saúde e protegidos pela LGPD. Cada acesso fica registrado. Use o acesso só para acompanhar o paciente, não compartilhe sua senha e saia do sistema em computador de outra pessoa.</p>",
    "faq": [
     {
      "p": "Não vejo um paciente que acompanho.",
      "r": "Busque pelo nome e clique em Solicitar acesso. A clínica responde pelo sino."
     },
     {
      "p": "Meu pedido foi recusado.",
      "r": "Fale com a clínica em Mensagens e, se for o caso, peça de novo."
     },
     {
      "p": "Não vejo um teste na Correção.",
      "r": "Ele ainda não foi corrigido. Aparece sozinho quando a clínica terminar."
     },
     {
      "p": "A aba Laudo está vazia.",
      "r": "O laudo ainda não foi finalizado."
     },
     {
      "p": "Quero ver outra parte da pasta.",
      "r": "Peça na conversa do caso. A clínica decide o que liberar."
     },
     {
      "p": "Esqueci a senha.",
      "r": "Fale com a clínica."
     },
     {
      "p": "Abri outra tela e voltei para a lista.",
      "r": "É normal: seu acesso tem só Pacientes, Mensagens e Instruções."
     }
    ]
   }
  ]
 },
 {
  "id": "pronto-laudo",
  "icone": "📝",
  "cor": "#16A34A",
  "titulo": "Pronto para laudo",
  "resumo": "O aplicador avisa que terminou; a coordenação recebe o aviso e acompanha quem está fazendo cada laudo.",
  "publico": [
   "admin_clinico",
   "admin_gestor",
   "neuropsicologo_aplicador",
   "corretor",
   "estagiario"
  ],
  "publicoTxt": "Para a equipe",
  "passos": [
   {
    "titulo": "Marcar quando terminar",
    "html": "<p>Terminou a aplicação? Na pasta do paciente (ou na Bateria), clique em <strong>Pronto para laudo</strong>. A faixa aparece logo abaixo do nome do paciente.</p>",
    "imagem": {
     "src": "img/p1_pasta_cta.webp",
     "alt": "Pasta com o botão Pronto para laudo",
     "proporcao": 0.4539,
     "marcas": [
      {
       "n": 1,
       "x": 20.86,
       "y": 57.24,
       "w": 77.16,
       "h": 11.54,
       "titulo": "Faixa do laudo",
       "texto": "Mostra se o paciente já foi marcado, por quem e quando."
      },
      {
       "n": 2,
       "x": 84.82,
       "y": 59.34,
       "w": 12.11,
       "h": 7.34,
       "titulo": "Pronto para laudo",
       "texto": "Abre a confirmação para avisar a coordenação."
      }
     ]
    }
   },
   {
    "titulo": "Confirmar e deixar um recado",
    "html": "<p>Se ainda houver teste em aberto na bateria, o CORTEX avisa. Dá para marcar mesmo assim e explicar na observação.</p>",
    "imagem": {
     "src": "img/p2_modal.webp",
     "alt": "Confirmação de pronto para laudo",
     "proporcao": 0.6296,
     "marcas": [
      {
       "n": 1,
       "x": 35.94,
       "y": 36.56,
       "w": 28.11,
       "h": 7.79,
       "titulo": "Testes em aberto",
       "texto": "Quantos testes da bateria ainda não foram encerrados."
      },
      {
       "n": 2,
       "x": 35.8,
       "y": 53.74,
       "w": 28.4,
       "h": 10.81,
       "titulo": "Observação",
       "texto": "Opcional. Ex.: teste que não foi aplicado, escala que a escola ainda não respondeu."
      },
      {
       "n": 3,
       "x": 47.57,
       "y": 68.15,
       "w": 16.77,
       "h": 5.06,
       "titulo": "Marcar pronto para laudo",
       "texto": "Avisa a coordenação na hora: aparece na tela, no sino e no celular de quem ativou o aviso."
      }
     ]
    }
   },
   {
    "titulo": "A coordenação vê no Dashboard",
    "html": "<p>Admin clínico e admin gestor recebem o aviso e veem a lista <strong>Prontos para laudo</strong> no Dashboard, do mais antigo para o mais novo, com quem marcou e quando.</p>",
    "imagem": {
     "src": "img/p4_dashboard.webp",
     "alt": "Dashboard com Prontos para laudo",
     "proporcao": 0.6296,
     "marcas": [
      {
       "n": 1,
       "x": 73.96,
       "y": 29.83,
       "w": 22.6,
       "h": 25.03,
       "titulo": "Prontos para laudo",
       "texto": "A lista de quem está esperando laudo. O número verde é o total."
      },
      {
       "n": 2,
       "x": 92.53,
       "y": 37.97,
       "w": 3.15,
       "h": 4.65,
       "titulo": "Vou fazer o laudo",
       "texto": "Pega o laudo para você. Os outros veem que já tem alguém fazendo."
      }
     ]
    }
   },
   {
    "titulo": "Vou fazer / Laudo feito",
    "html": "<p>Na pasta, a coordenação também pode pegar o laudo, marcar como feito ou desmarcar. Quem marcou pode desmarcar enquanto ninguém pegou.</p>",
    "imagem": {
     "src": "img/p5_pasta_admin.webp",
     "alt": "Pasta com pronto para laudo",
     "proporcao": 0.4539,
     "marcas": [
      {
       "n": 1,
       "x": 20.86,
       "y": 54.89,
       "w": 77.16,
       "h": 15.18,
       "titulo": "Pronto para laudo",
       "texto": "Quem marcou, quando, e o recado deixado."
      },
      {
       "n": 2,
       "x": 68.78,
       "y": 58.64,
       "w": 11.97,
       "h": 7.66,
       "titulo": "Vou fazer o laudo",
       "texto": "O laudo passa a ficar com você."
      },
      {
       "n": 3,
       "x": 80.6,
       "y": 58.64,
       "w": 8.75,
       "h": 7.66,
       "titulo": "Laudo feito",
       "texto": "Tira da lista de pendentes e registra quem fez."
      }
     ]
    }
   },
   {
    "titulo": "Laudo em andamento",
    "html": "<p>Enquanto alguém faz o laudo, a faixa fica azul com o nome dessa pessoa. Ao terminar, clique em <strong>Laudo feito</strong>. Se precisar devolver, use <strong>Voltar para pronto</strong>.</p>",
    "imagem": {
     "src": "img/p6_em_laudo.webp",
     "alt": "Laudo em andamento",
     "proporcao": 0.4539,
     "marcas": [
      {
       "n": 1,
       "x": 20.86,
       "y": 54.89,
       "w": 77.16,
       "h": 15.18,
       "titulo": "Em andamento",
       "texto": "Quem está fazendo o laudo e desde quando."
      }
     ]
    }
   }
  ]
 },
 {
  "id": "fluxo-instrumentos",
  "icone": "🧭",
  "cor": "#1F4E79",
  "titulo": "Fluxo de aplicação de instrumentos",
  "resumo": "Do checklist à correção: caminho presencial e caminho por link.",
  "publico": [
   "admin_clinico",
   "admin_gestor",
   "neuropsicologo_aplicador",
   "corretor",
   "estagiario"
  ],
  "publicoTxt": "Para a equipe",
  "link": "../guia/fluxo-instrumentos.html"
 }
];

// ============================================================================
// CORTEX_APP — VINELAND-3-P Online (heteroaplicação pais/cuidadores)
// ============================================================================
// Página pública SEM autenticação.
// URL: /responder/vineland.html?token=<uuid>
//
// Fluxo (idêntico ao RAADS-R):
//   1. Tela 1: Termo de consentimento
//   2. Tela 2: 180 itens organizados em 7 seções (COM, AVD, SOC, HMOT, INT, EXT, OTR)
//      com cabeçalhos de seção e suporte a itens binários (0/2) e standard (0/1/2)
//   3. Tela 3: Agradecimento ("Resposta enviada. Obrigado.")
//
// Decisão clínica registrada (Sparrow, Cicchetti & Saulnier, 2016):
//   Vineland-3 Pais/Cuidadores. Heteroaplicação para sujeitos de 3-90+ anos.
//   180 itens em 7 fatores: 4 domínios (COM/AVD/SOC/HMOT) + 3 seções
//   comportamentais (INT/EXT/OTR). Escala 0-2 standard ou 0/2 binary.
//
//   IMPORTANTE: HMOT (itens 121-145) só é aplicável até os 9 anos. O JS
//   detecta a idade do paciente via state.aplicacao + state.paciente e
//   esconde a seção HMOT se idade ≥ 10.
//
// Cálculo no banco quando responsável clica "Enviar":
//   1. Soma respostas brutas como índice 0-2 (publico_finalizar v2)
//   2. JS do laudo aplica lookup tables C3/E2 (estratificadas por idade)
//      pra calcular PP, ABC composto, escore-v internalizante/externalizante
//   3. Tudo via publico_finalizar_aplicacao (versao_engine cortex_d3_auto_v2)
// ============================================================================

(function() {
    'use strict';

    // Cliente Supabase ANÔNIMO (sem autenticação)
    // Reusa SUPABASE_CONFIG do config.js já existente do projeto
    const supabase = window.supabase.createClient(
        SUPABASE_CONFIG.url,
        SUPABASE_CONFIG.anonKey
    );

    const SIGLA_ESPERADA = 'VINELAND-3-P';

    // ============================================================================
    // METADATA VINELAND-3 (item → tipo, item → seção, dicas)
    // ============================================================================
    const ITEM_TO_TIPO  = {"1": "standard", "2": "standard", "3": "standard", "4": "standard", "5": "standard", "6": "standard", "7": "standard", "8": "standard", "9": "standard", "10": "standard", "11": "standard", "12": "standard", "13": "standard", "14": "standard", "15": "standard", "16": "standard", "17": "standard", "18": "standard", "19": "standard", "20": "standard", "21": "standard", "22": "standard", "23": "standard", "24": "standard", "25": "standard", "26": "binary", "27": "standard", "28": "standard", "29": "standard", "30": "standard", "31": "standard", "32": "standard", "33": "binary", "34": "standard", "35": "standard", "36": "standard", "37": "standard", "38": "standard", "39": "binary", "40": "standard", "41": "standard", "42": "standard", "43": "standard", "44": "standard", "45": "standard", "46": "standard", "47": "standard", "48": "standard", "49": "standard", "50": "standard", "51": "standard", "52": "standard", "53": "standard", "54": "standard", "55": "standard", "56": "standard", "57": "standard", "58": "standard", "59": "standard", "60": "standard", "61": "standard", "62": "standard", "63": "standard", "64": "standard", "65": "standard", "66": "standard", "67": "standard", "68": "standard", "69": "standard", "70": "standard", "71": "standard", "72": "standard", "73": "standard", "74": "standard", "75": "standard", "76": "standard", "77": "standard", "78": "standard", "79": "standard", "80": "binary", "81": "standard", "82": "standard", "83": "standard", "84": "binary", "85": "standard", "86": "standard", "87": "standard", "88": "standard", "89": "standard", "90": "standard", "91": "standard", "92": "standard", "93": "standard", "94": "standard", "95": "standard", "96": "standard", "97": "standard", "98": "standard", "99": "standard", "100": "standard", "101": "standard", "102": "standard", "103": "standard", "104": "standard", "105": "standard", "106": "standard", "107": "standard", "108": "standard", "109": "standard", "110": "standard", "111": "standard", "112": "standard", "113": "standard", "114": "standard", "115": "standard", "116": "standard", "117": "standard", "118": "standard", "119": "standard", "120": "standard", "121": "standard", "122": "standard", "123": "standard", "124": "standard", "125": "standard", "126": "standard", "127": "standard", "128": "standard", "129": "standard", "130": "standard", "131": "standard", "132": "standard", "133": "standard", "134": "standard", "135": "standard", "136": "standard", "137": "standard", "138": "standard", "139": "standard", "140": "standard", "141": "standard", "142": "standard", "143": "standard", "144": "standard", "145": "standard", "146": "standard", "147": "standard", "148": "standard", "149": "standard", "150": "standard", "151": "standard", "152": "standard", "153": "standard", "154": "standard", "155": "standard", "156": "standard", "157": "standard", "158": "standard", "159": "standard", "160": "standard", "161": "standard", "162": "standard", "163": "standard", "164": "standard", "165": "standard", "166": "standard", "167": "standard", "168": "standard", "169": "standard", "170": "standard", "171": "standard", "172": "standard", "173": "standard", "174": "standard", "175": "standard", "176": "standard", "177": "standard", "178": "standard", "179": "standard", "180": "standard"};
    const ITEM_TO_SECAO = {"1": "COM", "2": "COM", "3": "COM", "4": "COM", "5": "COM", "6": "COM", "7": "COM", "8": "COM", "9": "COM", "10": "COM", "11": "COM", "12": "COM", "13": "COM", "14": "COM", "15": "COM", "16": "COM", "17": "COM", "18": "COM", "19": "COM", "20": "COM", "21": "COM", "22": "COM", "23": "COM", "24": "COM", "25": "COM", "26": "COM", "27": "COM", "28": "COM", "29": "COM", "30": "COM", "31": "COM", "32": "COM", "33": "COM", "34": "COM", "35": "COM", "36": "COM", "37": "COM", "38": "COM", "39": "COM", "40": "COM", "41": "AVD", "42": "AVD", "43": "AVD", "44": "AVD", "45": "AVD", "46": "AVD", "47": "AVD", "48": "AVD", "49": "AVD", "50": "AVD", "51": "AVD", "52": "AVD", "53": "AVD", "54": "AVD", "55": "AVD", "56": "AVD", "57": "AVD", "58": "AVD", "59": "AVD", "60": "AVD", "61": "AVD", "62": "AVD", "63": "AVD", "64": "AVD", "65": "AVD", "66": "AVD", "67": "AVD", "68": "AVD", "69": "AVD", "70": "AVD", "71": "AVD", "72": "AVD", "73": "AVD", "74": "AVD", "75": "AVD", "76": "AVD", "77": "AVD", "78": "AVD", "79": "AVD", "80": "AVD", "81": "SOC", "82": "SOC", "83": "SOC", "84": "SOC", "85": "SOC", "86": "SOC", "87": "SOC", "88": "SOC", "89": "SOC", "90": "SOC", "91": "SOC", "92": "SOC", "93": "SOC", "94": "SOC", "95": "SOC", "96": "SOC", "97": "SOC", "98": "SOC", "99": "SOC", "100": "SOC", "101": "SOC", "102": "SOC", "103": "SOC", "104": "SOC", "105": "SOC", "106": "SOC", "107": "SOC", "108": "SOC", "109": "SOC", "110": "SOC", "111": "SOC", "112": "SOC", "113": "SOC", "114": "SOC", "115": "SOC", "116": "SOC", "117": "SOC", "118": "SOC", "119": "SOC", "120": "SOC", "121": "HMOT", "122": "HMOT", "123": "HMOT", "124": "HMOT", "125": "HMOT", "126": "HMOT", "127": "HMOT", "128": "HMOT", "129": "HMOT", "130": "HMOT", "131": "HMOT", "132": "HMOT", "133": "HMOT", "134": "HMOT", "135": "HMOT", "136": "HMOT", "137": "HMOT", "138": "HMOT", "139": "HMOT", "140": "HMOT", "141": "HMOT", "142": "HMOT", "143": "HMOT", "144": "HMOT", "145": "HMOT", "146": "INT", "147": "INT", "148": "INT", "149": "INT", "150": "INT", "151": "INT", "152": "INT", "153": "INT", "154": "INT", "155": "INT", "156": "INT", "157": "INT", "158": "INT", "159": "EXT", "160": "EXT", "161": "EXT", "162": "EXT", "163": "EXT", "164": "EXT", "165": "EXT", "166": "EXT", "167": "EXT", "168": "EXT", "169": "EXT", "170": "OTR", "171": "OTR", "172": "OTR", "173": "OTR", "174": "OTR", "175": "OTR", "176": "OTR", "177": "OTR", "178": "OTR", "179": "OTR", "180": "OTR"};
    const ITEM_TIPS     = {"8": "Ele(a) não tem que dizer as palavras perfeitamente.", "9": "Ele(a) não tem que dizer os nomes perfeitamente.", "10": "Se ele(a) às vezes faz isso sem lembretes, mas às vezes precisa de lembretes, marque 1.", "11": "Se ele(a) às vezes faz isso sem lembretes, mas às vezes precisa de lembretes, marque 1.", "16": "A história pode ser de um conto de fadas, um livro ou um filme.", "17": "Se ele(a) às vezes faz isso sem lembretes, mas às vezes precisa de lembretes, marque 1.", "19": "Pontue 2 se ele fez quando era mais novo, mas agora já adquiriu a habilidade. Tudo bem se ele(a) escrever algumas letras de trás para frente.", "22": "Exemplos de palestras informativas: palestras na escola e na comunidade, programas de TV educativos e vídeos, sermões religiosos e reuniões.", "23": "Suas frases não precisam ser perfeitas.", "24": "Se ele(a) não escrever letras do alfabeto, pontue 0.", "25": "Se ele(a) às vezes faz isso sem lembretes, mas às vezes precisa de lembretes, marque 1.", "26": "Pontue 2 para Sim ou 0 para Não. Ele(a) pode fazer pequenos erros de ortografia.", "30": "Exemplos de palestras informativas são palestras na escola e na comunidade, programas de TV educativos e vídeos, sermões religiosos e reuniões.", "32": "Se ele(a) às vezes faz isso sem lembretes, mas às vezes precisa de lembretes, marque 1.", "33": "Pontue 2 para Sim ou 0 para Não.", "35": "As instruções devem ser precisas.", "36": "Se às vezes ele(a) faz isso sem ajuda, mas às vezes precisa de ajuda, marque 1.", "37": "Se ele(a) às vezes faz isso sem lembretes, mas às vezes precisa de lembretes, pontue 1.", "38": "Se ele(a) às vezes faz isto sem ajuda mas às vezes precisa de ajuda, marque 1.", "39": "Pontue 2 para Sim ou 0 para Não.", "40": "Pontue 2 se ele/ela fez isso quando mais jovem, mas agora não precisa escrever artigos. Se ele(a) às vezes faz isto sem ajuda mas às vezes precisa de ajuda, marque 1.", "41": "Marque 2 se não tiver acidentes durante o dia. Marque 1 se ele(a) tiver alguns acidentes durante o dia. Marque 0 se ele(a) tiver muitos acidentes durante o dia.", "44": "Se ele(a) às vezes faz isso sem ajuda ou lembretes, mas às vezes precisa de ajuda ou lembretes, marque 1.", "45": "Marque 2 se ele fez isso quando era mais novo. Se ele(a) às vezes faz isso sem lembretes, mas às vezes precisa de lembretes, marque 1.", "46": "Se às vezes ele(a) faz isso sem ajuda, mas às vezes precisa de ajuda, marque 1.", "47": "Se ele(a) tiver que ser lembrado ou sem saber que está sendo queimado/a, marque 0.", "48": "Se ele(a) às vezes faz isso sem ajuda ou lembretes, mas às vezes precisa de ajuda ou lembretes, pontue 1.", "49": "Se ele(a) às vezes faz isso sem lembretes, mas às vezes precisa de lembretes, marque 1.", "50": "Pontuação 2 se não tiver acidentes durante o dia ou à noite. Pontuação 1 se ele(a) tiver alguns acidentes. Pontuação 0 se ele(a) tiver muitos acidentes.", "51": "Se ele(a) às vezes fizer todas as etapas sem ajuda, mas às vezes precisar de ajuda, marque 1.", "52": "Se às vezes ele(a) faz isso sem ajuda, mas às vezes precisa de ajuda, marque 1.", "53": "Se às vezes ele(a) faz isso sem ajuda, mas às vezes precisa de ajuda, marque 1.", "54": "Se ele(a) precisar ser lembrado ou nunca usar objetos pontiagudos, marque 0.", "55": "Ruas do bairro contam. Se ele(a) não cruzar ruas ou estradas sozinho/a, ou se ele(a) tiver que ser lembrado/a de olhar para os dois lados, marque 0.", "56": "Se ele(a) às vezes faz isso sem ajuda ou lembretes, mas às vezes precisa de ajuda ou lembretes, pontue 1.", "59": "Pontuação com base em quantas vezes ele(a) faz isso quando necessário: geralmente (2), às vezes (1) ou nunca (0). Fazer isso com ajuda não conta.", "60": "Se ele(a) às vezes faz isso sem ajuda, mas às vezes precisa de ajuda, pontue 1.", "62": "Se ele(a) às vezes faz isso sem ser lembrado ou solicitado/a, mas às vezes precisa ser lembrado ou solicitado/a, marque 1.", "63": "Se ele(a) às vezes faz isso sem ajuda ou lembretes, mas às vezes precisa de ajuda ou lembretes, pontue 1.", "64": "Se ele(a) fizer às vezes sem ajuda, mas às vezes precisar de ajuda, marque 1.", "65": "Se ele(a) às vezes faz isso sem lembretes, mas às vezes precisa de lembretes, marque 1.", "67": "Se ele(a) às vezes faz isso sem lembretes, mas às vezes precisa de lembretes, marque 1.", "68": "Se às vezes ele(a) faz isso sem ajuda, mas às vezes precisa de ajuda, marque 1.", "69": "Se ele(a) às vezes faz isso sem lembretes, mas às vezes precisa de lembretes, marque 1.", "70": "Pontuação com base em quantas vezes ele(a) faz isso quando necessário: geralmente (2), às vezes (1) ou nunca (0). Se ele(a) precisar de ajuda ou tiver que ser lembrado, isso não conta.", "71": "Pontuação com base em quantas vezes ele(a) faz isso quando necessário: geralmente (2), às vezes (1) ou nunca (0). Se ele(a) precisar de ajuda ou tiver que ser lembrado, isso não conta.", "72": "Se ele(a) precisa ser lembrado/a, não conta. Se não se espera que ele(a) faça isso sozinho/a, marque 0.", "73": "Se ele(a) às vezes faz isto sem ajuda mas às vezes precisa de ajuda, marque 1.", "77": "Pontue com base em quantas vezes ele(a) faz isso quando necessário: geralmente (2), às vezes (1) ou nunca (0). Fazer isso com ajuda não conta.", "78": "Pontuação com base em quantas vezes ele(a) faz isso quando necessário: geralmente (2), às vezes (1) ou nunca (0). Se ele(a) precisar de ajuda ou tiver que ser lembrado, isso não conta.", "79": "Se ele(a) fizer às vezes sem ajuda, mas às vezes precisar de ajuda, marque 1.", "80": "Pontue 2 para Sim ou 0 para Não.", "84": "Pontue 2 para Sim e 0 para Não.", "85": "Se ele(a) às vezes faz isso sem precisar ser pedido, mas às vezes precisa que seja pedido, pontue 1.", "86": "Pontue 2 se ele(a) fez isso quando mais jovem, e agora não precisa de supervisão. Brincar perto de outras crianças, mas não com elas, não conta.", "90": "Se ele(a) às vezes faz isso sem precisar ser pedido, mas às vezes precisa que seja pedido, pontue 1.", "91": "Pontue 2 se ele(a) fez isso quando mais jovem, e agora não brinca mais de faz de conta.", "93": "Se ele(a) às vezes faz isso sem precisar ser pedido mas às vezes precisa que seja pedido, pontue 1.", "95": "Pontue 2 se ele(a) fez isso quando mais jovem, não brinca mais de empilhar.", "99": "Se ele(a) às vezes faz isso sem precisar ser pedido mas às vezes precisa que seja dito, pontue 1.", "100": "Se ele(a) não conversar por pelo menos 2 ou 3 minutos, pontue 0.", "101": "Se ele(a) às vezes faz isso sem precisar ser pedido, mas às vezes precisa que seja dito, pontue 1.", "102": "Pontue 2 se ele(a) fez isso quando mais jovem. Se ele(a) às vezes faz isso sem ser lembrado, mas às vezes precisa ser lembrado, pontue 1.", "103": "Se você não sabe, estime uma pontuação. Marque também a Caixa de Estimativa.", "104": "Precisa brincar com outras pessoas para contar.", "108": "Jogos que ele(a) precisa de ajuda para brincar não contam.", "112": "Se você não souber, estime uma pontuação. Marque também a Caixa de Estimativa.", "115": "Se ele(a) às vezes faz isso sem precisar ser solicitado, mas às vezes precisa que seja solicitado, pontue 1.", "117": "Se ele(a) não conversar por pelo menos 2 ou 3 minutos, pontue 0.", "120": "Se alguém mais velho tiver que insistir para que ele(a) participe, isso não conta.", "121": "Se ele(a) às vezes faz isso sem ajuda, mas às vezes precisa de ajuda, pontue 1.", "128": "O desenho não precisa ser perfeito, mas precisa se parecer com um círculo.", "129": "Pontue 2 se ele(a) fez isso quando mais jovem, e agora já adquiriu a habilidade.", "132": "Pontue 2 se ele(a) fez isso quando mais jovem, e agora não pinta mais.", "133": "Pontue 2 se ele(a) fez isso quando mais jovem, e agora já adquiriu a habilidade.", "134": "Traçado não conta.", "141": "Se ele(a) às vezes faz isso sem ajuda, mas às vezes precisa de ajuda, pontue 1.", "144": "Ele(a) precisa subir na bicicleta e começar a pedalar sem ajuda. Se ele(a) às vezes faz isso sem ajuda, mas às vezes precisa de ajuda, pontue 1.", "145": "Se ele(a) às vezes faz isso sem ajuda, mas às vezes precisa de ajuda, pontue 1.", "147": "Se o único problema é que ele(a) não vai comer alguns alimentos específicos, como brócolis ou espinafre, pontue 0.", "149": "Se ele(a) não frequenta a escola ou não trabalha, pontue 0.", "168": "Se ele(a) não frequenta a escola ou não tem um trabalho, pontue 0.", "171": "Amigo imaginário da infância não conta."};
    const SECTIONS_INFO = {
    "COM": {
        "label": "📝 Comunicação",
        "desc": "40 itens sobre linguagem, compreensão e escrita."
    },
    "AVD": {
        "label": "🏠 Atividade de Vida Diária",
        "desc": "40 itens sobre autocuidado, segurança e tarefas domésticas."
    },
    "SOC": {
        "label": "🤝 Socialização",
        "desc": "40 itens sobre relacionamentos, emoções e interação social."
    },
    "HMOT": {
        "label": "🏃 Habilidades Motoras",
        "desc": "25 itens sobre coordenação motora grossa e fina (apenas crianças até 9 anos)."
    },
    "INT": {
        "label": "😰 Seção A — Internalizante",
        "desc": "13 itens — ansiedade, humor, medos e retraimento."
    },
    "EXT": {
        "label": "😠 Seção B — Externalizante",
        "desc": "11 itens — agressividade, desobediência e impulsividade."
    },
    "OTR": {
        "label": "🔄 Seção C — Outros (Críticos)",
        "desc": "11 itens — comportamentos atípicos e repetitivos."
    }
};
    const SECTIONS_ORDEM = ['COM', 'AVD', 'SOC', 'HMOT', 'INT', 'EXT', 'OTR'];
    const HMOT_IDADE_MAX = 9;  // HMOT só vale até 9 anos
    
    // Calcula idade do paciente em anos (pra decidir se mostra HMOT)
    function calcularIdadeAnos(nascISO, refISO) {
        if (!nascISO) return 99;
        const ref = refISO ? new Date(refISO) : new Date();
        const n = new Date(nascISO);
        if (isNaN(n) || isNaN(ref) || ref < n) return 99;
        let anos = ref.getFullYear() - n.getFullYear();
        const m = ref.getMonth() - n.getMonth();
        if (m < 0 || (m === 0 && ref.getDate() < n.getDate())) anos--;
        return anos;
    }


    const state = {
        token: null,
        aplicacao: null,
        instrumento: null,
        norma: null,
        itens: [],
        respostas: {},  // {numero: 1|2|3|4}
        consentimentoAceito: false,
        tela: 'loading'  // loading | consentimento | perguntas | agradecimento | erro
    };

    // ============================================================================
    // INICIALIZAÇÃO
    // ============================================================================

    document.addEventListener('DOMContentLoaded', async () => {
        const params = new URLSearchParams(window.location.search);
        state.token = params.get('token');

        if (!state.token) {
            mostrarErro('Link inválido', 'Este link não está completo. Verifique se você abriu o link correto.');
            return;
        }

        await carregarAplicacao();
    });

    async function carregarAplicacao() {
        try {
            const { data, error } = await supabase.rpc(
                'publico_carregar_aplicacao',
                { p_token: state.token }
            );

            if (error) {
                console.error('RPC error:', error);
                mostrarErro('Erro ao carregar', 'Não foi possível carregar o teste. Tente novamente em alguns instantes.');
                return;
            }

            // Função pode retornar erro estruturado
            if (data?.erro) {
                let titulo, mensagem;
                switch (data.erro) {
                    case 'token_invalido':
                        titulo = 'Link inválido';
                        mensagem = 'Este link não foi encontrado. Verifique se copiou corretamente.';
                        break;
                    case 'token_expirado':
                        titulo = 'Link expirado';
                        mensagem = data.mensagem || 'Este link já passou da validade. Entre em contato com seu profissional.';
                        break;
                    case 'ja_respondido':
                        titulo = 'Já respondido';
                        mensagem = data.mensagem || 'Este teste já foi respondido. Obrigado!';
                        break;
                    case 'norma_nao_cadastrada':
                        titulo = 'Configuração indisponível';
                        mensagem = data.mensagem || 'Este teste ainda não está configurado. Avise seu profissional.';
                        break;
                    default:
                        titulo = 'Erro';
                        mensagem = data.mensagem || 'Algo deu errado. Tente novamente.';
                }
                mostrarErro(titulo, mensagem);
                return;
            }

            // Validações de segurança: confirma que é o teste certo
            if (data.instrumento.sigla !== SIGLA_ESPERADA) {
                mostrarErro('Teste incorreto',
                    'Este link é de outro instrumento, não pode ser respondido aqui.');
                return;
            }

            // Carrega dados
            state.aplicacao = { id: data.aplicacao_id };
            state.instrumento = data.instrumento;
            state.norma = data.norma;
            state.itens = data.itens || [];
            state.consentimentoAceito = data.consentimento_aceito;

            // Restaura respostas parciais (caso paciente esteja voltando)
            const parciais = data.respostas_parciais || {};
            for (const [k, v] of Object.entries(parciais)) {
                state.respostas[parseInt(k)] = parseInt(v);
            }

            // Decide tela inicial
            if (state.consentimentoAceito) {
                state.tela = 'perguntas';
            } else {
                state.tela = 'consentimento';
            }

            renderizar();
        } catch (err) {
            console.error('Erro inesperado:', err);
            mostrarErro('Erro inesperado',
                'Não foi possível carregar o teste. Tente recarregar a página.');
        }
    }

    function mostrarErro(titulo, mensagem) {
        state.tela = 'erro';
        document.getElementById('responder-conteudo').innerHTML = `
            <div class="tela-erro">
                <div class="tela-erro-icone">
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none"
                         stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="15" y1="9" x2="9" y2="15"/>
                        <line x1="9" y1="9" x2="15" y2="15"/>
                    </svg>
                </div>
                <h1>${escapeHtml(titulo)}</h1>
                <p>${escapeHtml(mensagem)}</p>
            </div>
        `;
        // Esconde header dinâmico em erro
        const headerProgresso = document.getElementById('header-progresso');
        if (headerProgresso) headerProgresso.style.display = 'none';
    }

    // ============================================================================
    // RENDERIZAÇÃO
    // ============================================================================

    function renderizar() {
        atualizarHeader();

        const cont = document.getElementById('responder-conteudo');
        const rodape = document.getElementById('responder-rodape');

        if (state.tela === 'consentimento') {
            cont.innerHTML = renderConsentimento();
            rodape.style.display = 'none';
            attachConsentimento();
        } else if (state.tela === 'perguntas') {
            cont.innerHTML = renderPerguntas();
            rodape.style.display = 'block';
            attachPerguntas();
            atualizarRodape();
        } else if (state.tela === 'agradecimento') {
            cont.innerHTML = renderAgradecimento();
            rodape.style.display = 'none';
            const headerProgresso = document.getElementById('header-progresso');
            if (headerProgresso) headerProgresso.style.display = 'none';
        }
    }

    function atualizarHeader() {
        const progressoEl = document.getElementById('header-progresso');
        if (!progressoEl) return;

        if (state.tela !== 'perguntas') {
            progressoEl.style.display = 'none';
            return;
        }

        progressoEl.style.display = 'flex';
        const respondidos = Object.keys(state.respostas).length;
        const total = state.itens.length;
        const pct = total > 0 ? Math.round((respondidos / total) * 100) : 0;

        document.getElementById('header-progresso-label').textContent =
            `Questão ${Math.min(respondidos + 1, total)} de ${total}`;
        document.getElementById('header-progresso-fill').style.width = pct + '%';
    }

    function renderConsentimento() {
        return `
            <div class="tela-consentimento">
                <h1>Olá!</h1>
                <p class="subtitulo">Você foi convidado(a) a responder o questionário <strong>${escapeHtml(state.norma.versao_label)}</strong>.</p>

                <h2>Antes de começar</h2>
                <p>Este questionário foi solicitado pelo seu profissional como parte da sua avaliação. As respostas serão analisadas exclusivamente por ele(a).</p>

                <h2>Como responder</h2>
                <ul>
                    <li>São <strong>${state.itens.length} questões</strong>. Leia cada afirmação com atenção.</li>
                    <li>Responda com sinceridade — não há respostas certas ou erradas.</li>
                    <li>Você pode pausar e voltar a este link em até 7 dias.</li>
                    <li>Tempo estimado: 5 a 10 minutos.</li>
                </ul>

                <h2>Sobre seus dados</h2>
                <ul>
                    <li>Suas respostas ficam armazenadas com segurança.</li>
                    <li>Apenas seu profissional terá acesso aos resultados.</li>
                    <li>Estes dados serão usados apenas para apoiar sua avaliação clínica.</li>
                </ul>

                <label class="consentimento-aceite">
                    <input type="checkbox" id="check-consentimento">
                    <span class="consentimento-aceite-texto">
                        Li e concordo em prosseguir com o questionário.
                    </span>
                </label>

                <button class="btn-prosseguir" id="btn-prosseguir" disabled>
                    Começar
                </button>
            </div>
        `;
    }

    function attachConsentimento() {
        const check = document.getElementById('check-consentimento');
        const btn = document.getElementById('btn-prosseguir');

        check.addEventListener('change', () => {
            btn.disabled = !check.checked;
        });

        btn.addEventListener('click', async () => {
            btn.disabled = true;
            btn.textContent = 'Aguarde...';

            try {
                const { data, error } = await supabase.rpc(
                    'publico_aceitar_consentimento',
                    { p_token: state.token }
                );

                if (error || data?.erro) {
                    btn.disabled = false;
                    btn.textContent = 'Começar';
                    alert('Não foi possível registrar seu consentimento. Tente novamente.');
                    return;
                }

                state.consentimentoAceito = true;
                state.tela = 'perguntas';
                renderizar();
                window.scrollTo(0, 0);
            } catch (err) {
                console.error(err);
                btn.disabled = false;
                btn.textContent = 'Começar';
                alert('Erro de conexão. Verifique sua internet.');
            }
        });
    }

    function renderPerguntas() {
        const labels = state.norma.answer_labels || ['Nunca', 'Às vezes', 'Usualmente ou Frequentemente'];
        const labelsBinary = ['Não', 'Sim'];

        // NOTA: idade do paciente não está disponível no responder por privacidade.
        // HMOT (Habilidades Motoras) é mostrado sempre — o JS do laudo (que tem
        // acesso à idade) decide se inclui no cálculo final.

        let html = `
            <div class="tela-perguntas-instrucoes">
                <p>Para cada afirmação abaixo, escolha a opção que <strong>melhor descreve a pessoa avaliada</strong>.</p>
                <p style="margin-top:8px;font-size:13px;color:#475569;">
                    O questionário está organizado em <strong>7 seções</strong>.
                    A seção <em>Habilidades Motoras</em> só será considerada no resultado se a pessoa tiver até 9 anos.
                </p>
            </div>
            <div class="tela-perguntas">
        `;

        let secaoAtual = null;

        for (const item of state.itens) {
            const secaoItem = ITEM_TO_SECAO[item.numero];

            // Cabeçalho de seção quando muda
            if (secaoItem !== secaoAtual) {
                const info = SECTIONS_INFO[secaoItem];
                if (info) {
                    html += `
                        <div class="vineland-secao-header sec-${secaoItem}">
                            <h3>${info.label}</h3>
                            <p class="vineland-secao-desc">${escapeHtml(info.desc)}</p>
                        </div>
                    `;
                }
                secaoAtual = secaoItem;
            }

            const tipoItem = ITEM_TO_TIPO[item.numero] || 'standard';
            const isBinary = tipoItem === 'binary';
            const respondido = state.respostas[item.numero] !== undefined;
            const respondidoClass = respondido ? 'respondido' : '';
            const tip = ITEM_TIPS[item.numero] || '';

            // Render das opções: standard 0/1/2 ou binary 0/2
            let opcoes = '';
            const opts = isBinary
                ? [{ v: 0, label: labelsBinary[0] }, { v: 2, label: labelsBinary[1] }]
                : [{ v: 0, label: labels[0] }, { v: 1, label: labels[1] }, { v: 2, label: labels[2] }];

            for (const opt of opts) {
                const ativo = state.respostas[item.numero] === opt.v ? 'ativo' : '';
                opcoes += `
                    <button class="item-opcao ${ativo}" data-numero="${item.numero}" data-valor="${opt.v}" type="button">
                        <span class="item-opcao-bullet"></span>
                        <span class="item-opcao-texto">${escapeHtml(opt.label)}</span>
                    </button>
                `;
            }

            const tipoBadge = isBinary
                ? '<span class="vineland-item-tipo-binary">Sim/Não</span>'
                : '';

            const tipBlock = tip
                ? `<div class="vineland-item-tip"><strong>💡 Dica:</strong> ${escapeHtml(tip)}</div>`
                : '';

            html += `
                <div class="item-pergunta ${respondidoClass}" data-numero="${item.numero}" id="item-${item.numero}">
                    <div class="item-numero-texto">
                        <span class="item-numero">${item.numero}</span>
                        <div class="item-texto">${escapeHtml(item.texto)}${tipoBadge}</div>
                    </div>
                    ${tipBlock}
                    <div class="item-opcoes">
                        ${opcoes}
                    </div>
                </div>
            `;
        }

        html += '</div>';
        return html;
    }


    function attachPerguntas() {
        // Botões de resposta
        document.querySelectorAll('.item-opcao').forEach(btn => {
            btn.addEventListener('click', async () => {
                const numero = parseInt(btn.dataset.numero);
                const valor = parseInt(btn.dataset.valor);

                state.respostas[numero] = valor;

                // Re-renderiza só esse item (mais leve que renderizar tudo)
                renderItemSingle(numero);
                atualizarHeader();
                atualizarRodape();

                // Auto-save em background
                salvarParcial();

                // Scroll suave pro próximo item não respondido
                setTimeout(() => {
                    const proximo = state.itens.find(i =>
                        i.numero > numero && state.respostas[i.numero] === undefined
                    );
                    if (proximo) {
                        const el = document.getElementById('item-' + proximo.numero);
                        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                }, 100);
            });
        });

        // Botão enviar
        const btnEnviar = document.getElementById('btn-enviar');
        if (btnEnviar) {
            btnEnviar.addEventListener('click', enviarRespostas);
        }
    }

    function renderItemSingle(numero) {
        const itemEl = document.getElementById('item-' + numero);
        if (!itemEl) return;

        const respondido = state.respostas[numero] !== undefined;
        if (respondido) {
            itemEl.classList.add('respondido');
        } else {
            itemEl.classList.remove('respondido');
        }

        // Atualiza estado das opções
        itemEl.querySelectorAll('.item-opcao').forEach(btn => {
            const v = parseInt(btn.dataset.valor);
            if (state.respostas[numero] === v) {
                btn.classList.add('ativo');
            } else {
                btn.classList.remove('ativo');
            }
        });
    }

    function atualizarRodape() {
        const respondidos = Object.keys(state.respostas).length;
        const total = state.itens.length;
        const todosRespondidos = respondidos === total;

        const statusEl = document.getElementById('rodape-status');
        const btnEl = document.getElementById('btn-enviar');

        if (todosRespondidos) {
            statusEl.textContent = `✓ Todas as ${total} questões respondidas`;
            btnEl.disabled = false;
        } else {
            const faltam = total - respondidos;
            statusEl.textContent = `Faltam ${faltam} ${faltam === 1 ? 'questão' : 'questões'}`;
            btnEl.disabled = true;
        }
    }

    let salvandoParcial = false;
    async function salvarParcial() {
        if (salvandoParcial) return;
        salvandoParcial = true;

        try {
            await supabase.rpc('publico_salvar_parcial', {
                p_token: state.token,
                p_respostas: state.respostas
            });
        } catch (err) {
            // Falha silenciosa — paciente continua respondendo
            console.warn('Auto-save falhou:', err);
        } finally {
            salvandoParcial = false;
        }
    }

    // ============================================================================
    // ENVIO FINAL
    // ============================================================================
    // Envia APENAS respostas brutas. Banco calcula score, aplica inversão,
    // classifica e cria correção. Garante que paciente não pode manipular
    // o cálculo via JavaScript do navegador.
    // ============================================================================

    async function enviarRespostas() {
        const respondidos = Object.keys(state.respostas).length;
        if (respondidos !== state.itens.length) {
            alert('Por favor, responda todas as questões antes de enviar.');
            return;
        }

        const btn = document.getElementById('btn-enviar');
        btn.disabled = true;
        btn.textContent = 'Enviando...';

        try {
            const { data, error } = await supabase.rpc(
                'publico_finalizar_aplicacao',
                {
                    p_token: state.token,
                    p_respostas_finais: state.respostas
                }
            );

            if (error || data?.erro) {
                console.error('Erro ao finalizar:', error || data);
                btn.disabled = false;
                btn.textContent = 'Enviar respostas';

                let msg = 'Não foi possível enviar suas respostas. Verifique sua conexão e tente novamente.';
                if (data?.erro === 'respostas_incompletas') {
                    msg = 'Algumas respostas não foram registradas. Por favor, revise as questões.';
                }
                alert(msg);
                return;
            }

            // Sucesso — mostra agradecimento
            state.tela = 'agradecimento';
            renderizar();
            window.scrollTo(0, 0);
        } catch (err) {
            console.error('Erro inesperado:', err);
            btn.disabled = false;
            btn.textContent = 'Enviar respostas';
            alert('Erro de conexão. Verifique sua internet e tente novamente.');
        }
    }

    function renderAgradecimento() {
        return `
            <div class="tela-agradecimento">
                <div class="tela-agradecimento-icone">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                         stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                    </svg>
                </div>
                <h1>Resposta enviada!</h1>
                <p>Obrigado por dedicar seu tempo.</p>
                <p>Seu profissional foi notificado e entrará em contato com você na próxima sessão.</p>
                <div class="clinica">
                    Você pode fechar esta página com tranquilidade.<br>
                    <strong>Equilibrium Neuropsicologia</strong>
                </div>
            </div>
        `;
    }

    // ============================================================================
    // UTILS
    // ============================================================================

    function escapeHtml(text) {
        if (text === null || text === undefined) return '';
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }
})();

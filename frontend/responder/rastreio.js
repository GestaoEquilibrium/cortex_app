// ============================================================================
// CORTEX_APP — Escalas complementares de rastreio (página pública de resposta)
// ============================================================================
// Motor único para GDS-15, PHQ-9, GAD-7 e ZARIT. Cada página <slug>.html
// declara a sigla em window.RASTREIO_SIGLA e carrega este arquivo.
// URL: /responder/<slug>.html?token=<uuid>   (sem login)
//
// Fluxo igual ao das demais escalas: consentimento → itens → agradecimento.
// Itens, rótulos e opções vêm do banco (publico_carregar_aplicacao):
//   - item SEM opcoes  → botões da norma (escala_min..escala_max + answer_labels)
//   - item COM opcoes  → botões próprios do item; a resposta gravada é o ÍNDICE
//     da opção e o banco pontua pelo `valor` (GDS-15 sim/não com gabarito,
//     item de impacto funcional do PHQ-9/GAD-7 com valor 0, item 22 do Zarit).
// A página só COLETA respostas; a soma e a faixa são feitas no banco
// (publico_finalizar_aplicacao).
// ============================================================================

(function() {
    'use strict';

    const SIGLA_ESPERADA = window.RASTREIO_SIGLA;

    // Textos de cada escala (o conteúdo clínico — itens e opções — está no banco)
    const CFG = {
        'GDS-15': {
            nomeCurto: 'GDS-15',
            como: [
                'São <strong>15 perguntas</strong> de <strong>sim ou não</strong>.',
                'Responda pensando em <strong>como você se sentiu na última semana</strong>.',
                'Não existe resposta certa ou errada — marque a primeira resposta que vier, com sinceridade.',
                'Tempo estimado: 5 minutos.'
            ],
            instrucao: 'Pensando em <strong>como você se sentiu na última semana</strong>, responda sim ou não:',
            unidade: ['pergunta', 'perguntas']
        },
        'PHQ-9': {
            nomeCurto: 'PHQ-9',
            como: [
                'São <strong>10 perguntas</strong> curtas sobre como você tem se sentido.',
                'Considere <strong>as últimas 2 semanas</strong>: com que frequência cada problema incomodou você?',
                'Responda com sinceridade — não há respostas certas ou erradas.',
                'Tempo estimado: 3 a 5 minutos.'
            ],
            instrucao: 'Durante as <strong>últimas 2 semanas</strong>, com que frequência você foi incomodado(a) por qualquer um dos problemas abaixo?',
            extraTitulo: 'Para terminar',
            unidade: ['pergunta', 'perguntas']
        },
        'GAD-7': {
            nomeCurto: 'GAD-7',
            como: [
                'São <strong>8 perguntas</strong> curtas sobre preocupação e nervosismo.',
                'Considere <strong>as últimas 2 semanas</strong>: com que frequência cada problema incomodou você?',
                'Responda com sinceridade — não há respostas certas ou erradas.',
                'Tempo estimado: 3 minutos.'
            ],
            instrucao: 'Durante as <strong>últimas 2 semanas</strong>, com que frequência você foi incomodado(a) pelos problemas abaixo?',
            extraTitulo: 'Para terminar',
            unidade: ['pergunta', 'perguntas']
        },
        'ZARIT': {
            nomeCurto: 'Escala de Sobrecarga do Cuidador',
            como: [
                'Este questionário é sobre <strong>você, cuidador(a)</strong> — como você se sente ao cuidar do(a) paciente.',
                'Nas perguntas, <strong>“o(a) paciente”</strong> é a pessoa que está em avaliação na clínica e de quem você cuida.',
                'São <strong>22 perguntas</strong>. Escolha a frequência que melhor descreve o que você sente.',
                'Não há respostas certas ou erradas. Tempo estimado: 8 a 10 minutos.'
            ],
            instrucao: 'As perguntas abaixo falam de <strong>como você se sente</strong> ao cuidar do(a) paciente. Com que frequência você se sente assim?',
            unidade: ['pergunta', 'perguntas']
        }
    };

    const cfg = CFG[SIGLA_ESPERADA] || CFG['PHQ-9'];

    // Cliente Supabase ANÔNIMO (sem autenticação)
    const supabase = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);

    const state = {
        token: null,
        instrumento: null,
        norma: null,
        itens: [],
        respostas: {},   // {numero: indice}
        consentimentoAceito: false,
        tela: 'loading'  // loading | consentimento | perguntas | agradecimento | erro
    };

    // ── Inicialização ───────────────────────────────────────────────────────
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
            const { data, error } = await supabase.rpc('publico_carregar_aplicacao', { p_token: state.token });
            if (error) {
                console.error('RPC error:', error);
                mostrarErro('Erro ao carregar', 'Não foi possível carregar o questionário. Tente novamente em alguns instantes.');
                return;
            }
            if (data?.erro) {
                const msgs = {
                    token_invalido:        ['Link inválido', 'Este link não foi encontrado. Verifique se copiou corretamente.'],
                    token_expirado:        ['Link expirado', 'Este link já passou da validade. Entre em contato com seu profissional.'],
                    ja_respondido:         ['Já respondido', 'Este questionário já foi respondido. Obrigado!'],
                    norma_nao_cadastrada:  ['Configuração indisponível', 'Este questionário ainda não está configurado. Avise seu profissional.']
                };
                const m = msgs[data.erro] || ['Erro', 'Algo deu errado. Tente novamente.'];
                mostrarErro(m[0], data.mensagem || m[1]);
                return;
            }
            if (!data.instrumento || data.instrumento.sigla !== SIGLA_ESPERADA) {
                mostrarErro('Questionário incorreto', 'Este link é de outro instrumento e não pode ser respondido aqui.');
                return;
            }

            state.instrumento = data.instrumento;
            state.norma = data.norma;
            state.itens = (data.itens || []).slice().sort((a, b) => a.numero - b.numero);
            state.consentimentoAceito = data.consentimento_aceito;

            const parciais = data.respostas_parciais || {};
            for (const [k, v] of Object.entries(parciais)) {
                const n = parseInt(k, 10), val = parseInt(v, 10);
                if (!isNaN(n) && !isNaN(val)) state.respostas[n] = val;
            }

            state.tela = state.consentimentoAceito ? 'perguntas' : 'consentimento';
            renderizar();
        } catch (err) {
            console.error('Erro inesperado:', err);
            mostrarErro('Erro inesperado', 'Não foi possível carregar o questionário. Tente recarregar a página.');
        }
    }

    function mostrarErro(titulo, mensagem) {
        state.tela = 'erro';
        document.getElementById('responder-conteudo').innerHTML = `
            <div class="tela-erro">
                <div class="tela-erro-icone">
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
                    </svg>
                </div>
                <h1>${escapeHtml(titulo)}</h1>
                <p>${escapeHtml(mensagem)}</p>
            </div>`;
        const hp = document.getElementById('header-progresso');
        if (hp) hp.style.display = 'none';
        const rd = document.getElementById('responder-rodape');
        if (rd) rd.style.display = 'none';
    }

    // ── Opções de cada item ─────────────────────────────────────────────────
    // Devolve [{idx, texto}] — idx é o que vai para o banco.
    function opcoesDoItem(item) {
        if (Array.isArray(item.opcoes) && item.opcoes.length) {
            return item.opcoes.map((op, i) => ({
                idx: i,
                texto: (op && typeof op === 'object') ? (op.texto != null ? op.texto : String(i)) : String(op)
            }));
        }
        const labels = Array.isArray(state.norma.answer_labels) ? state.norma.answer_labels : [];
        const lista = [];
        for (let v = state.norma.escala_min; v <= state.norma.escala_max; v++) {
            const t = labels[v - state.norma.escala_min];
            lista.push({ idx: v, texto: t !== undefined ? t : String(v) });
        }
        return lista;
    }

    // Item "extra" (impacto funcional): opções todas com valor 0 → não pontua
    function ehExtra(item) {
        return Array.isArray(item.opcoes) && item.opcoes.length > 0 &&
            item.opcoes.every(op => op && typeof op === 'object' && Number(op.valor) === 0);
    }

    // ── Renderização ────────────────────────────────────────────────────────
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
        }
    }

    function atualizarHeader() {
        const el = document.getElementById('header-progresso');
        if (!el) return;
        if (state.tela !== 'perguntas') { el.style.display = 'none'; return; }
        el.style.display = 'flex';
        const respondidos = Object.keys(state.respostas).length;
        const total = state.itens.length;
        const pct = total > 0 ? Math.round((respondidos / total) * 100) : 0;
        document.getElementById('header-progresso-label').textContent =
            `Pergunta ${Math.min(respondidos + 1, total)} de ${total}`;
        document.getElementById('header-progresso-fill').style.width = pct + '%';
    }

    function renderConsentimento() {
        let banner = (window.CortexRespondente && state.instrumento && state.instrumento.tipo_respondente)
            ? window.CortexRespondente.gerarBanner(state.instrumento.tipo_respondente) : '';
        // Zarit: quem responde é o cuidador, falando de si — ajusta a frase padrão do banner
        if (SIGLA_ESPERADA === 'ZARIT') {
            banner = banner.replace('sobre a criança / adolescente avaliado(a).',
                'sobre como ele(a) se sente ao cuidar do(a) paciente (criança, adolescente, adulto ou idoso).');
        }
        const nome = (state.norma && state.norma.versao_label) || cfg.nomeCurto;
        return `
            <div class="tela-consentimento">
                ${banner}
                <div class="rast-chip">${escapeHtml(cfg.nomeCurto)}</div>
                <h1>Olá!</h1>
                <p class="subtitulo">Você foi convidado(a) a responder o questionário <strong>${escapeHtml(nome)}</strong>.</p>

                <h2>Antes de começar</h2>
                <p>Este questionário foi solicitado pelo seu profissional como parte da avaliação. As respostas serão analisadas exclusivamente por ele(a).</p>

                <h2>Como responder</h2>
                <ul>
                    ${cfg.como.map(t => `<li>${t}</li>`).join('')}
                    <li>Você pode pausar e voltar a este link depois — as respostas ficam salvas.</li>
                </ul>

                <h2>Sobre seus dados</h2>
                <ul>
                    <li>Suas respostas ficam armazenadas com segurança.</li>
                    <li>Apenas o profissional responsável terá acesso aos resultados.</li>
                    <li>Estes dados serão usados apenas para apoiar a avaliação clínica.</li>
                </ul>

                <label class="consentimento-aceite">
                    <input type="checkbox" id="check-consentimento">
                    <span class="consentimento-aceite-texto">Li e concordo em prosseguir com o questionário.</span>
                </label>

                <button class="btn-prosseguir" id="btn-prosseguir" disabled>Começar</button>
            </div>`;
    }

    function attachConsentimento() {
        const check = document.getElementById('check-consentimento');
        const btn = document.getElementById('btn-prosseguir');
        check.addEventListener('change', () => { btn.disabled = !check.checked; });
        btn.addEventListener('click', async () => {
            btn.disabled = true;
            btn.textContent = 'Aguarde...';
            try {
                const { data, error } = await supabase.rpc('publico_aceitar_consentimento', { p_token: state.token });
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

    function renderItem(item) {
        const ops = opcoesDoItem(item);
        const respondido = state.respostas[item.numero] !== undefined;
        const binario = ops.length === 2;
        const botoes = ops.map((op, k) => {
            const ativo = state.respostas[item.numero] === op.idx ? 'ativo' : '';
            const tom = binario ? (k === 0 ? 'rast-sim' : 'rast-nao') : '';
            return `
                <button class="item-opcao ${tom} ${ativo}" data-numero="${item.numero}" data-valor="${op.idx}" type="button">
                    <span class="item-opcao-bullet"></span>
                    <span class="item-opcao-texto">${escapeHtml(op.texto)}</span>
                </button>`;
        }).join('');
        return `
            <div class="item-pergunta ${respondido ? 'respondido' : ''}" data-numero="${item.numero}" id="item-${item.numero}">
                <div class="item-numero-texto">
                    <span class="item-numero">${item.numero}</span>
                    <div class="item-texto">${escapeHtml(item.texto)}</div>
                </div>
                <div class="item-opcoes ${binario ? 'rast-opcoes-binarias' : ''}">${botoes}</div>
            </div>`;
    }

    function renderPerguntas() {
        const principais = state.itens.filter(i => !ehExtra(i));
        const extras = state.itens.filter(ehExtra);
        let html = `
            <div class="tela-perguntas-instrucoes"><p>${cfg.instrucao}</p></div>
            <div class="tela-perguntas">${principais.map(renderItem).join('')}</div>`;
        if (extras.length) {
            html += `
            <div class="rast-extra-titulo">${escapeHtml(cfg.extraTitulo || 'Para terminar')}</div>
            <div class="tela-perguntas">${extras.map(renderItem).join('')}</div>`;
        }
        return html;
    }

    function attachPerguntas() {
        document.querySelectorAll('.item-opcao').forEach(btn => {
            btn.addEventListener('click', () => {
                const numero = parseInt(btn.dataset.numero, 10);
                const valor = parseInt(btn.dataset.valor, 10);
                state.respostas[numero] = valor;
                renderItemSingle(numero);
                atualizarHeader();
                atualizarRodape();
                salvarParcial();
                setTimeout(() => {
                    const proximo = state.itens.find(i => i.numero > numero && state.respostas[i.numero] === undefined);
                    if (proximo) document.getElementById('item-' + proximo.numero)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 100);
            });
        });
        const btnEnviar = document.getElementById('btn-enviar');
        if (btnEnviar && !btnEnviar.dataset.ligado) {
            btnEnviar.dataset.ligado = '1';
            btnEnviar.addEventListener('click', enviarRespostas);
        }
    }

    function renderItemSingle(numero) {
        const el = document.getElementById('item-' + numero);
        if (!el) return;
        el.classList.toggle('respondido', state.respostas[numero] !== undefined);
        el.querySelectorAll('.item-opcao').forEach(b => {
            b.classList.toggle('ativo', state.respostas[numero] === parseInt(b.dataset.valor, 10));
        });
    }

    function atualizarRodape() {
        const respondidos = Object.keys(state.respostas).length;
        const total = state.itens.length;
        const statusEl = document.getElementById('rodape-status');
        const btnEl = document.getElementById('btn-enviar');
        if (respondidos >= total) {
            statusEl.textContent = `✓ Todas as ${total} ${cfg.unidade[1]} respondidas`;
            btnEl.disabled = false;
        } else {
            const faltam = total - respondidos;
            statusEl.textContent = `Faltam ${faltam} ${faltam === 1 ? cfg.unidade[0] : cfg.unidade[1]}`;
            btnEl.disabled = true;
        }
    }

    let salvandoParcial = false;
    async function salvarParcial() {
        if (salvandoParcial) return;
        salvandoParcial = true;
        try {
            await supabase.rpc('publico_salvar_parcial', { p_token: state.token, p_respostas: state.respostas });
        } catch (err) {
            console.warn('Auto-save falhou:', err);
        } finally {
            salvandoParcial = false;
        }
    }

    // ── Envio final (o banco soma, classifica e cria a correção) ───────────
    async function enviarRespostas() {
        if (Object.keys(state.respostas).length !== state.itens.length) {
            alert('Por favor, responda todas as perguntas antes de enviar.');
            return;
        }
        const btn = document.getElementById('btn-enviar');
        btn.disabled = true;
        btn.textContent = 'Enviando...';
        try {
            const { data, error } = await supabase.rpc('publico_finalizar_aplicacao', {
                p_token: state.token,
                p_respostas_finais: state.respostas
            });
            if (error || data?.erro) {
                console.error('Erro ao finalizar:', error || data);
                btn.disabled = false;
                btn.textContent = 'Enviar respostas';
                alert(data?.erro === 'respostas_incompletas'
                    ? 'Algumas respostas não foram registradas. Por favor, revise as perguntas.'
                    : 'Não foi possível enviar suas respostas. Verifique sua conexão e tente novamente.');
                return;
            }
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
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
                <h1>Resposta enviada!</h1>
                <p>Obrigado por dedicar seu tempo.</p>
                <p>O profissional responsável já recebeu suas respostas e vai conversar sobre elas no atendimento.</p>
                <div class="clinica">
                    Você pode fechar esta página com tranquilidade.<br>
                    <strong>Equilibrium Neuropsicologia</strong>
                </div>
            </div>`;
    }

    function escapeHtml(text) {
        if (text === null || text === undefined) return '';
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }
})();

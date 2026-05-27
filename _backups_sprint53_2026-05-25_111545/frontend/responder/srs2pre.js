// ============================================================================
// CORTEX_APP — SRS-2 Pré-Escolar Online (heterorrelato — cuidador)
// ============================================================================
// Página pública SEM autenticação.
// URL: /responder/srs2pre.html?token=<uuid>
//
// Fluxo (idêntico ao RAADS-R):
//   1. Tela 1: Termo de consentimento
//   2. Tela 2: 65 itens em lista única (escala 1-4: Nunca / Às vezes / Frequentemente / Quase sempre)
//   3. Tela 3: Agradecimento ("Resposta enviada. Obrigado.")
//
// Decisão clínica registrada (Constantino & Gruber, 2012):
//   SRS-2 Pré-Escolar — Heterorrelato (cuidador) sobre criança de 2;6 a 4;5 anos.
//   65 itens em 5 subescalas (Percepção/Cognição/Comunicação/Motivação Social
//   + Padrões Restritivos) + 2 compostos (CI/Total). 17 itens reversos.
//   Classificação: Típico (T≤59) / N1 Leve / N2 Moderado / N3 Severo.
//
// Cálculo no banco quando paciente clica "Enviar":
//   1. Soma respostas brutas (publico_finalizar v2)
//   2. Aplica inversão dos reversos automaticamente (instrumentos_itens.reverso=true)
//   3. JS de correção lê escore bruto por fator e aplica classificação
//   4. Tudo via publico_finalizar_aplicacao (versao_engine cortex_d3_auto_v2)
// ============================================================================

(function() {
    'use strict';

    // Cliente Supabase ANÔNIMO (sem autenticação)
    // Reusa SUPABASE_CONFIG do config.js já existente do projeto
    const supabase = window.supabase.createClient(
        SUPABASE_CONFIG.url,
        SUPABASE_CONFIG.anonKey
    );

    const SIGLA_ESPERADA = 'SRS-2-PRE';

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
        // answer_labels é array do JSON original
        const labels = state.norma.answer_labels;

        let html = `
            <div class="tela-perguntas-instrucoes">
                <p>Para cada afirmação abaixo, escolha a opção que <strong>melhor descreve você</strong>.</p>
            </div>
            <div class="tela-perguntas">
        `;

        for (const item of state.itens) {
            const respondido = state.respostas[item.numero] !== undefined;
            const respondidoClass = respondido ? 'respondido' : '';

            // Opções geradas a partir da norma (escala_min / escala_max + answer_labels).
            // Para SCARED: escala 0–2, 3 labels. Para EQ-15/RAADS-R: escala 1–4, 4 labels.
            const escMin = state.norma.escala_min;
            const escMax = state.norma.escala_max;
            let opcoes = '';
            for (let v = escMin; v <= escMax; v++) {
                const ativo = state.respostas[item.numero] === v ? 'ativo' : '';
                // Mapeia o valor v para o índice do array de labels
                // (labels[0] corresponde a escala_min, não a 1)
                const idx = v - escMin;
                const labelTexto = labels[idx] !== undefined ? labels[idx] : String(v);
                opcoes += `
                    <button class="item-opcao ${ativo}" data-numero="${item.numero}" data-valor="${v}" type="button">
                        <span class="item-opcao-bullet"></span>
                        <span class="item-opcao-texto">${escapeHtml(labelTexto)}</span>
                    </button>
                `;
            }

            html += `
                <div class="item-pergunta ${respondidoClass}" data-numero="${item.numero}" id="item-${item.numero}">
                    <div class="item-numero-texto">
                        <span class="item-numero">${item.numero}</span>
                        <div class="item-texto">${escapeHtml(item.texto)}</div>
                    </div>
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

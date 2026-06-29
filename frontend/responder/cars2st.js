// ============================================================================
// CORTEX_APP — CARS2-ST Online (preenchimento do aplicador/responsável)
// ============================================================================
// Página pública SEM autenticação.
// URL: /responder/cars2st.html?token=<uuid>
//
// CARS2 — Versão Padrão. Instrumento de heteroavaliação: o aplicador (ou o
// responsável, conforme o tipo_respondente do catálogo) classifica cada um dos
// 15 itens na alternativa que melhor descreve a pessoa avaliada.
//
// Cada item traz suas PRÓPRIAS alternativas (item.opcoes, formato {texto,valor}).
// Os meios-pontos do CARS2 (1; 1,5; 2; 2,5; 3; 3,5; 4) entram como VALOR DOBRADO
// (1->2 ... 4->8). Esta página apenas COLETA o índice da opção escolhida; soma e
// classificação ficam no banco (publico_finalizar_aplicacao) e no laudo.
// ============================================================================

(function() {
    'use strict';

    const supabase = window.supabase.createClient(
        SUPABASE_CONFIG.url,
        SUPABASE_CONFIG.anonKey
    );

    const SIGLA_ESPERADA = 'CARS2-ST';

    const state = {
        token: null,
        aplicacao: null,
        instrumento: null,
        norma: null,
        itens: [],
        respostas: {},  // {numero: índice da opção}
        consentimentoAceito: false,
        tela: 'loading'  // loading | consentimento | perguntas | agradecimento | erro
    };

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

            if (data.instrumento.sigla !== SIGLA_ESPERADA) {
                mostrarErro('Teste incorreto',
                    'Este link é de outro instrumento, não pode ser respondido aqui.');
                return;
            }

            state.aplicacao = { id: data.aplicacao_id };
            state.instrumento = data.instrumento;
            state.norma = data.norma;
            state.itens = data.itens || [];
            state.consentimentoAceito = data.consentimento_aceito;

            const parciais = data.respostas_parciais || {};
            for (const [k, v] of Object.entries(parciais)) {
                state.respostas[parseInt(k)] = parseInt(v);
            }

            state.tela = state.consentimentoAceito ? 'perguntas' : 'consentimento';
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
            `Item ${Math.min(respondidos + 1, total)} de ${total}`;
        document.getElementById('header-progresso-fill').style.width = pct + '%';
    }

    function renderConsentimento() {
        return `
            <div class="tela-consentimento">
                ${(window.CortexRespondente && state.instrumento && state.instrumento.tipo_respondente) ? window.CortexRespondente.gerarBanner(state.instrumento.tipo_respondente) : ''}
                <h1>Olá!</h1>
                <p class="subtitulo">Este formulário — <strong>${escapeHtml(state.norma.versao_label)}</strong> — faz parte da avaliação conduzida pelo profissional.</p>

                <h2>Antes de começar</h2>
                <p>Responda com base na sua observação da pessoa avaliada. As respostas serão analisadas exclusivamente pelo profissional responsável.</p>

                <h2>Como responder</h2>
                <ul>
                    <li>São <strong>${state.itens.length} itens</strong>. Em cada item, leia com atenção todas as alternativas.</li>
                    <li>Marque <strong>a alternativa que melhor descreve a pessoa avaliada</strong>. Quando o comportamento ficar entre duas descrições, use a alternativa intermediária.</li>
                    <li>Não deixe nenhum item em branco.</li>
                    <li>Você pode pausar e voltar a este link em até 7 dias.</li>
                </ul>

                <h2>Sobre os dados</h2>
                <ul>
                    <li>As respostas ficam armazenadas com segurança.</li>
                    <li>Apenas o profissional terá acesso aos resultados.</li>
                    <li>Os dados serão usados apenas para apoiar a avaliação clínica.</li>
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
        const labels = state.norma.answer_labels;

        let html = `
            <div class="tela-perguntas-instrucoes">
                <p>Em cada item, marque <strong>a alternativa que melhor descreve a pessoa avaliada</strong>.</p>
            </div>
            <div class="tela-perguntas">
        `;

        for (const item of state.itens) {
            const respondido = state.respostas[item.numero] !== undefined;
            const respondidoClass = respondido ? 'respondido' : '';

            // Cada item tem alternativas PRÓPRIAS (item.opcoes). Suporta:
            //   - antigo: ["frase0", ...]              (índice = nota)
            //   - novo:   [{texto, valor}, ...]         (valor = nota dobrada)
            // data-valor guarda o ÍNDICE da opção escolhida.
            const itemOpcoes = Array.isArray(item.opcoes) && item.opcoes.length
                ? item.opcoes
                : labels;
            let opcoes = '';
            for (let v = 0; v < itemOpcoes.length; v++) {
                const op = itemOpcoes[v];
                const labelTexto = (op && typeof op === 'object') ? (op.texto != null ? op.texto : String(v)) : (op != null ? op : String(v));
                const ativo = state.respostas[item.numero] === v ? 'ativo' : '';
                opcoes += `
                    <button class="item-opcao item-opcao-bdi ${ativo}" data-numero="${item.numero}" data-valor="${v}" type="button">
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
        document.querySelectorAll('.item-opcao').forEach(btn => {
            btn.addEventListener('click', async () => {
                const numero = parseInt(btn.dataset.numero);
                const valor = parseInt(btn.dataset.valor);

                state.respostas[numero] = valor;

                renderItemSingle(numero);
                atualizarHeader();
                atualizarRodape();
                salvarParcial();

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

        const btnEnviar = document.getElementById('btn-enviar');
        if (btnEnviar) {
            btnEnviar.addEventListener('click', enviarRespostas);
        }
    }

    function renderItemSingle(numero) {
        const itemEl = document.getElementById('item-' + numero);
        if (!itemEl) return;

        const respondido = state.respostas[numero] !== undefined;
        if (respondido) itemEl.classList.add('respondido');
        else itemEl.classList.remove('respondido');

        itemEl.querySelectorAll('.item-opcao').forEach(btn => {
            const v = parseInt(btn.dataset.valor);
            if (state.respostas[numero] === v) btn.classList.add('ativo');
            else btn.classList.remove('ativo');
        });
    }

    function atualizarRodape() {
        const respondidos = Object.keys(state.respostas).length;
        const total = state.itens.length;
        const todosRespondidos = respondidos === total;

        const statusEl = document.getElementById('rodape-status');
        const btnEl = document.getElementById('btn-enviar');

        if (todosRespondidos) {
            statusEl.textContent = `✓ Todos os ${total} itens respondidos`;
            btnEl.disabled = false;
        } else {
            const faltam = total - respondidos;
            statusEl.textContent = `Faltam ${faltam} ${faltam === 1 ? 'item' : 'itens'}`;
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
            console.warn('Auto-save falhou:', err);
        } finally {
            salvandoParcial = false;
        }
    }

    async function enviarRespostas() {
        const respondidos = Object.keys(state.respostas).length;
        if (respondidos !== state.itens.length) {
            alert('Por favor, responda todos os itens antes de enviar.');
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
                let msg = 'Não foi possível enviar as respostas. Verifique a conexão e tente novamente.';
                if (data?.erro === 'respostas_incompletas') {
                    msg = 'Algumas respostas não foram registradas. Por favor, revise os itens.';
                }
                alert(msg);
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
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                         stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                    </svg>
                </div>
                <h1>Respostas enviadas!</h1>
                <p>Obrigado por dedicar seu tempo.</p>
                <p>O profissional foi notificado e dará seguimento à avaliação.</p>
                <div class="clinica">
                    Você pode fechar esta página com tranquilidade.<br>
                    <strong>Equilibrium Neuropsicologia</strong>
                </div>
            </div>
        `;
    }

    function escapeHtml(text) {
        if (text === null || text === undefined) return '';
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }
})();

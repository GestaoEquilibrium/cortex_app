// ============================================================================
// CORTEX_APP — Anamnese Remota: lógica do formulário público
// ============================================================================
// Página pública sem login. Paciente/responsável abre via link com token.
//   1. Busca dados do paciente (idade, sexo) pelo token (RPC público)
//   2. Monta formulário adaptado por faixa etária
//   3. Wizard de várias etapas, autosave em localStorage
//   4. No fim, submete via RPC público "submeter_anamnese_remota"
// ============================================================================

(function() {
    'use strict';

    const state = {
        token: null,
        paciente: null,    // { nome, idadeMeses, sexo }
        secoes: [],
        etapaAtual: 0,
        respostas: {},     // { campoId: valor, ... }
        finalizado: false
    };

    const STORAGE_KEY = 'cortex_anamnese_remota_';

    // ============================================================================
    // INIT
    // ============================================================================
    window.addEventListener('DOMContentLoaded', async () => {
        const urlParams = new URLSearchParams(window.location.search);
        state.token = urlParams.get('token');

        if (!state.token) {
            mostrarErroFatal('Link inválido', 'Este link não está completo. Peça ao seu profissional pra enviar novamente.');
            return;
        }

        try {
            const { data, error } = await window.cortexClient
                .rpc('buscar_anamnese_remota_publica', { p_token: state.token });

            if (error) throw error;
            if (!data || data.length === 0) {
                mostrarErroFatal('Link não encontrado', 'Este link não está cadastrado ou foi removido. Verifique com sua clínica.');
                return;
            }

            const info = data[0];

            // Já respondido?
            if (info.status !== 'aguardando_resposta') {
                mostrarTelaJaRespondido(info);
                return;
            }

            state.paciente = {
                nome: info.paciente_nome,
                idadeMeses: info.paciente_idade_meses,
                sexo: info.paciente_sexo
            };

            const faixa = CortexAnamneseRemotaPerguntas.detectarFaixa(info.paciente_idade_meses);
            state.secoes = CortexAnamneseRemotaPerguntas.montarFormulario(faixa);

            // Carrega rascunho salvo
            carregarRascunho();

            mostrarTelaBoasVindas();

        } catch (err) {
            console.error('Erro ao carregar:', err);
            mostrarErroFatal('Erro ao carregar', 'Não conseguimos acessar o formulário no momento. Tente novamente em alguns minutos.');
        }
    });

    // ============================================================================
    // RASCUNHO (localStorage)
    // ============================================================================
    function chaveRascunho() { return STORAGE_KEY + state.token; }

    function carregarRascunho() {
        try {
            const txt = localStorage.getItem(chaveRascunho());
            if (txt) {
                const obj = JSON.parse(txt);
                state.respostas = obj.respostas || {};
                state.etapaAtual = Math.min(obj.etapaAtual || 0, state.secoes.length - 1);
            }
        } catch (_) { /* ignora */ }
    }

    function salvarRascunho() {
        try {
            localStorage.setItem(chaveRascunho(), JSON.stringify({
                respostas: state.respostas,
                etapaAtual: state.etapaAtual,
                timestamp: Date.now()
            }));
        } catch (_) { /* ignora */ }
    }

    function limparRascunho() {
        try { localStorage.removeItem(chaveRascunho()); } catch (_) { /* ignora */ }
    }

    // ============================================================================
    // TELAS
    // ============================================================================

    function mostrarErroFatal(titulo, mensagem) {
        const container = document.getElementById('responder-conteudo');
        container.innerHTML = `
            <div class="tela-mensagem">
                <div class="tela-mensagem-icon">⚠️</div>
                <h1>${escapeHtml(titulo)}</h1>
                <p>${escapeHtml(mensagem)}</p>
            </div>
        `;
    }

    function mostrarTelaJaRespondido(info) {
        const dataResp = info.data_resposta
            ? new Date(info.data_resposta).toLocaleDateString('pt-BR', {
                day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
              })
            : '';
        const container = document.getElementById('responder-conteudo');
        container.innerHTML = `
            <div class="tela-mensagem">
                <div class="tela-mensagem-icon">✅</div>
                <h1>Formulário já respondido</h1>
                <p>Suas respostas foram enviadas com sucesso${dataResp ? ` em <strong>${dataResp}</strong>` : ''}.</p>
                <p>Caso precise corrigir alguma informação, entre em contato com sua clínica.</p>
                <p class="tela-mensagem-rodape">Equilibrium Neuropsicologia</p>
            </div>
        `;
    }

    function mostrarTelaBoasVindas() {
        const container = document.getElementById('responder-conteudo');
        const temRascunho = Object.keys(state.respostas).length > 0;
        const nomePac = escapeHtml(state.paciente.nome);

        container.innerHTML = `
            <div class="tela-boas-vindas">
                <div class="tela-boas-vindas-marca">
                    <div class="tela-boas-vindas-marca-icon">E</div>
                </div>
                <h1>Formulário Pré-Avaliação</h1>
                <p class="tela-boas-vindas-sub">Equilibrium Neuropsicologia</p>

                <div class="tela-boas-vindas-card">
                    <p>Olá! Este formulário foi enviado pra coletar informações sobre <strong>${nomePac}</strong> antes da avaliação neuropsicológica.</p>
                    <p>Suas respostas ajudam a equipe a se preparar melhor pra sessão presencial.</p>
                </div>

                <div class="tela-boas-vindas-orientacoes">
                    <h3>Antes de começar:</h3>
                    <ul>
                        <li>Reserve cerca de <strong>10 a 15 minutos</strong>.</li>
                        <li>Responda com sinceridade — tudo é sigiloso.</li>
                        <li>Se não souber alguma resposta, escreva "Não sei".</li>
                        <li>Você pode voltar e continuar depois — suas respostas ficam salvas.</li>
                    </ul>
                </div>

                <button class="responder-btn responder-btn-primary responder-btn-lg" id="btn-comecar">
                    ${temRascunho ? 'Continuar de onde parei' : 'Começar formulário'}
                </button>
            </div>
        `;

        document.getElementById('btn-comecar').addEventListener('click', () => {
            mostrarEtapa();
        });
    }

    function mostrarEtapa() {
        const sec = state.secoes[state.etapaAtual];
        const total = state.secoes.length;
        const pct = ((state.etapaAtual + 1) / total) * 100;

        // Atualiza progress no header
        const progressEl = document.getElementById('header-progresso');
        progressEl.style.display = 'flex';
        document.getElementById('header-progresso-label').textContent =
            `Etapa ${state.etapaAtual + 1} de ${total}`;
        document.getElementById('header-progresso-fill').style.width = pct + '%';

        const container = document.getElementById('responder-conteudo');
        const camposVisiveis = sec.campos.filter(c => campoVisivel(c));

        container.innerHTML = `
            <div class="anr-etapa">
                <div class="anr-etapa-cabecalho">
                    <h2 class="anr-etapa-titulo">${escapeHtml(sec.titulo)}</h2>
                    ${sec.subtitulo ? `<p class="anr-etapa-subtitulo">${escapeHtml(sec.subtitulo)}</p>` : ''}
                </div>

                <form id="anr-form" class="anr-form" onsubmit="return false;">
                    ${camposVisiveis.map(c => renderCampo(c)).join('')}
                </form>

                <div class="anr-acoes">
                    ${state.etapaAtual > 0 ? `
                        <button class="responder-btn responder-btn-secondary" id="btn-voltar">← Voltar</button>
                    ` : '<div></div>'}
                    <button class="responder-btn responder-btn-primary" id="btn-avancar">
                        ${state.etapaAtual === total - 1 ? '✓ Enviar respostas' : 'Avançar →'}
                    </button>
                </div>
            </div>
        `;

        // Listeners de inputs (autosave + reactividade pra mostrarSe)
        document.querySelectorAll('[data-campo-id]').forEach(el => {
            el.addEventListener('input', onCampoChange);
            el.addEventListener('change', onCampoChange);
        });

        document.getElementById('btn-avancar').addEventListener('click', avancarEtapa);
        const btnV = document.getElementById('btn-voltar');
        if (btnV) btnV.addEventListener('click', voltarEtapa);

        // Scroll pro topo
        window.scrollTo({ top: 0, behavior: 'instant' });
    }

    function mostrarTelaFinal() {
        const container = document.getElementById('responder-conteudo');
        container.innerHTML = `
            <div class="tela-mensagem">
                <div class="tela-mensagem-icon">✅</div>
                <h1>Respostas enviadas com sucesso!</h1>
                <p>Obrigado por preencher o formulário. Suas informações já foram recebidas pela equipe.</p>
                <p>Aguarde o contato pra confirmar os próximos passos.</p>
                <p class="tela-mensagem-rodape">Equilibrium Neuropsicologia</p>
            </div>
        `;
        document.getElementById('header-progresso').style.display = 'none';
    }

    // ============================================================================
    // CAMPOS
    // ============================================================================

    function campoVisivel(campo) {
        if (!campo.mostrarSe) return true;
        const ms = campo.mostrarSe;
        const valor = state.respostas[ms.campo];
        if (Array.isArray(ms.valor)) return ms.valor.includes(valor);
        return valor === ms.valor;
    }

    function renderCampo(campo) {
        const valor = state.respostas[campo.id];
        const obrig = campo.obrigatorio ? '<span class="anr-req">*</span>' : '';
        const ajuda = campo.ajuda ? `<small class="anr-ajuda">${escapeHtml(campo.ajuda)}</small>` : '';

        let inputHtml = '';
        switch (campo.tipo) {
            case 'texto':
                inputHtml = `<input type="text" class="anr-input" data-campo-id="${campo.id}" data-tipo="texto" value="${escapeAttr(valor || '')}" placeholder="${escapeAttr(campo.placeholder || '')}">`;
                break;

            case 'textarea':
                inputHtml = `<textarea class="anr-input anr-textarea" data-campo-id="${campo.id}" data-tipo="texto" rows="4" placeholder="${escapeAttr(campo.placeholder || '')}">${escapeHtml(valor || '')}</textarea>`;
                break;

            case 'select':
                inputHtml = `<select class="anr-input" data-campo-id="${campo.id}" data-tipo="texto">
                    <option value="">Selecione…</option>
                    ${campo.opcoes.map(op => `
                        <option value="${escapeAttr(op)}" ${valor === op ? 'selected' : ''}>${escapeHtml(op)}</option>
                    `).join('')}
                </select>`;
                break;

            case 'radio':
                inputHtml = `<div class="anr-radio-grupo">
                    ${campo.opcoes.map((op, i) => `
                        <label class="anr-radio">
                            <input type="radio" name="r_${campo.id}" data-campo-id="${campo.id}" data-tipo="texto" value="${escapeAttr(op)}" ${valor === op ? 'checked' : ''}>
                            <span>${escapeHtml(op)}</span>
                        </label>
                    `).join('')}
                </div>`;
                break;

            case 'checkboxes':
                const marcados = Array.isArray(valor) ? valor : [];
                inputHtml = `<div class="anr-check-grupo">
                    ${campo.opcoes.map(op => `
                        <label class="anr-check">
                            <input type="checkbox" data-campo-id="${campo.id}" data-tipo="checkbox" value="${escapeAttr(op)}" ${marcados.includes(op) ? 'checked' : ''}>
                            <span>${escapeHtml(op)}</span>
                        </label>
                    `).join('')}
                </div>`;
                break;

            default:
                inputHtml = `<em>Tipo desconhecido: ${campo.tipo}</em>`;
        }

        return `
            <div class="anr-campo" data-campo-wrap="${campo.id}">
                <label class="anr-label">${escapeHtml(campo.label)} ${obrig}</label>
                ${inputHtml}
                ${ajuda}
            </div>
        `;
    }

    function onCampoChange(ev) {
        const el = ev.target;
        const campoId = el.dataset.campoId;
        const tipo = el.dataset.tipo;
        if (!campoId) return;

        if (tipo === 'checkbox') {
            const todos = document.querySelectorAll(`input[type=checkbox][data-campo-id="${campoId}"]`);
            state.respostas[campoId] = Array.from(todos).filter(c => c.checked).map(c => c.value);
        } else {
            state.respostas[campoId] = el.value;
        }

        salvarRascunho();

        // Re-renderiza se algum campo depende de outro (mostrarSe)
        const dependentes = state.secoes[state.etapaAtual].campos.filter(c =>
            c.mostrarSe && c.mostrarSe.campo === campoId
        );
        if (dependentes.length > 0) {
            // Re-renderiza apenas a etapa sem perder o foco (simples: re-renderiza tudo)
            // Aceita perder o foco — é raro essa interação
            mostrarEtapa();
        }
    }

    // ============================================================================
    // NAVEGAÇÃO
    // ============================================================================

    function validarEtapa() {
        const sec = state.secoes[state.etapaAtual];
        const erros = [];

        sec.campos.forEach(c => {
            if (!campoVisivel(c)) return;
            if (!c.obrigatorio) return;
            const val = state.respostas[c.id];
            const vazio = val === undefined || val === null || val === ''
                || (Array.isArray(val) && val.length === 0);
            if (vazio) erros.push(c);
        });

        if (erros.length > 0) {
            // Destaca campos vazios
            document.querySelectorAll('.anr-campo').forEach(el => el.classList.remove('anr-campo-erro'));
            erros.forEach(c => {
                const el = document.querySelector(`[data-campo-wrap="${c.id}"]`);
                if (el) el.classList.add('anr-campo-erro');
            });
            // Scrolla pro primeiro erro
            const primeiro = document.querySelector('.anr-campo-erro');
            if (primeiro) primeiro.scrollIntoView({ behavior: 'smooth', block: 'center' });
            alert(`Por favor, preencha ${erros.length === 1 ? 'o campo obrigatório' : `os ${erros.length} campos obrigatórios`} marcado${erros.length === 1 ? '' : 's'} com *.`);
            return false;
        }
        return true;
    }

    function avancarEtapa() {
        if (!validarEtapa()) return;

        if (state.etapaAtual === state.secoes.length - 1) {
            enviar();
        } else {
            state.etapaAtual++;
            salvarRascunho();
            mostrarEtapa();
        }
    }

    function voltarEtapa() {
        if (state.etapaAtual > 0) {
            state.etapaAtual--;
            salvarRascunho();
            mostrarEtapa();
        }
    }

    // ============================================================================
    // ENVIO
    // ============================================================================

    async function enviar() {
        if (state.finalizado) return;

        // Confirmação
        if (!confirm('Tem certeza que deseja enviar suas respostas? Após o envio, não será possível editar.')) {
            return;
        }

        const btnAvancar = document.getElementById('btn-avancar');
        if (btnAvancar) {
            btnAvancar.disabled = true;
            btnAvancar.textContent = 'Enviando...';
        }

        try {
            const quemRespondeu = state.respostas._quem_responde || '';
            const nomeRespondente = state.respostas._nome_respondente || '';

            // Separa metadata das respostas reais
            const respostasLimpas = { ...state.respostas };
            delete respostasLimpas._quem_responde;
            delete respostasLimpas._nome_respondente;
            delete respostasLimpas._relacao_outro;

            const metadata = {
                quem_responde: quemRespondeu,
                nome_respondente: nomeRespondente,
                relacao_outro: state.respostas._relacao_outro || null
            };

            const { data, error } = await window.cortexClient.rpc('submeter_anamnese_remota', {
                p_token: state.token,
                p_respostas: { ...respostasLimpas, _metadata: metadata },
                p_quem_respondeu: quemRespondeu,
                p_nome_respondente: nomeRespondente
            });

            if (error) throw error;
            if (!data) {
                throw new Error('Este link já foi usado ou expirou. Entre em contato com sua clínica.');
            }

            state.finalizado = true;
            limparRascunho();
            mostrarTelaFinal();

        } catch (err) {
            console.error('Erro ao enviar:', err);
            alert('Não conseguimos enviar suas respostas: ' + (err.message || 'erro desconhecido') + '\n\nSuas respostas continuam salvas. Tente de novo em alguns minutos.');
            if (btnAvancar) {
                btnAvancar.disabled = false;
                btnAvancar.textContent = '✓ Enviar respostas';
            }
        }
    }

    // ============================================================================
    // UTIL
    // ============================================================================
    function escapeHtml(text) {
        if (text == null) return '';
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
    function escapeAttr(text) { return escapeHtml(text); }
})();

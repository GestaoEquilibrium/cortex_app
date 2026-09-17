// ============================================================================
// CORTEX_APP — pre-cadastro-ux.js
// ----------------------------------------------------------------------------
// Camada de experiência do pré-cadastro. Roda POR CIMA do pre-cadastro.js,
// sem tocar na lógica de envio, validação ou máscaras.
//
// Por que separado: o pre-cadastro.js monta o formulário, valida e conversa
// com a Edge Function. Misturar melhorias visuais ali aumentaria o risco de
// quebrar um fluxo que já funciona e que a família usa sem ninguém por perto
// para socorrer.
//
// O que ele faz:
//   · barra de progresso no topo, contando os obrigatórios preenchidos
//   · selo "ok" na seção quando todos os obrigatórios dela estão prontos
//   · marca visual em campo preenchido e em campo com erro
//   · rola até o primeiro campo vazio quando o envio é recusado
//   · barra de envio fixa no rodapé, sempre à mão no celular
//
// Tudo é progressivo: se este arquivo falhar, o formulário continua inteiro.
// ============================================================================

(function () {
    'use strict';

    let observador = null;

    function iniciar() {
        const form = document.getElementById('prc-form');
        if (!form) return false;

        montarProgresso();
        marcarSelos(form);
        ligarCampos(form);
        atualizar(form);
        interceptarErro(form);
        return true;
    }

    // ── Progresso ───────────────────────────────────────────────────────────

    function montarProgresso() {
        if (document.getElementById('prc-progresso')) return;
        const header = document.querySelector('.prc-header-inner');
        if (!header) return;

        const el = document.createElement('div');
        el.className = 'prc-progresso';
        el.id = 'prc-progresso';
        el.innerHTML = `
            <div class="prc-progresso-trilho">
                <div class="prc-progresso-barra" id="prc-progresso-barra"></div>
            </div>
            <div class="prc-progresso-txt">
                <span id="prc-progresso-label">Vamos começar</span>
                <span><strong id="prc-progresso-num">0</strong> de <span id="prc-progresso-tot">0</span></span>
            </div>`;
        header.parentNode.insertBefore(el, header.nextSibling);
    }

    /**
     * Obrigatórios visíveis. Campos escondidos (escola, quando o paciente é
     * adulto) não entram na conta — senão a barra nunca chegaria a 100%.
     */
    function obrigatoriosVisiveis(form) {
        return Array.from(form.querySelectorAll('.form-group')).filter(g => {
            if (g.offsetParent === null) return false;        // escondido
            const marca = g.querySelector('.required');
            if (!marca || marca.offsetParent === null) return false;
            return !!g.querySelector('input, select, textarea');
        }).map(g => g.querySelector('input, select, textarea'));
    }

    function atualizar(form) {
        const campos = obrigatoriosVisiveis(form);
        const preenchidos = campos.filter(c => String(c.value || '').trim() !== '');

        const barra = document.getElementById('prc-progresso-barra');
        const num   = document.getElementById('prc-progresso-num');
        const tot   = document.getElementById('prc-progresso-tot');
        const label = document.getElementById('prc-progresso-label');

        const pct = campos.length ? Math.round(preenchidos.length / campos.length * 100) : 0;
        if (barra) barra.style.width = pct + '%';
        if (num) num.textContent = preenchidos.length;
        if (tot) tot.textContent = campos.length;
        if (label) {
            label.textContent = pct === 0   ? 'Vamos começar'
                              : pct < 40    ? 'Continuando…'
                              : pct < 80    ? 'Mais da metade'
                              : pct < 100   ? 'Quase lá'
                                            : 'Tudo preenchido';
        }

        atualizarSelos(form);
    }

    // ── Selos de seção concluída ────────────────────────────────────────────

    function marcarSelos(form) {
        form.querySelectorAll('.form-section-title').forEach(t => {
            if (t.querySelector('.prc-selo-ok')) return;
            const selo = document.createElement('span');
            selo.className = 'prc-selo-ok';
            selo.textContent = '✓ ok';
            t.appendChild(selo);
        });
    }

    function atualizarSelos(form) {
        form.querySelectorAll('.form-section').forEach(sec => {
            const campos = Array.from(sec.querySelectorAll('.form-group'))
                .filter(g => g.offsetParent !== null)
                .filter(g => {
                    const m = g.querySelector('.required');
                    return m && m.offsetParent !== null;
                })
                .map(g => g.querySelector('input, select, textarea'))
                .filter(Boolean);

            // Seção sem obrigatório não ganha selo: não há o que concluir.
            const completa = campos.length > 0 &&
                campos.every(c => String(c.value || '').trim() !== '');
            sec.classList.toggle('prc-ok', completa);
        });
    }

    // ── Marcação por campo ──────────────────────────────────────────────────

    function ligarCampos(form) {
        form.addEventListener('input', (e) => {
            marcarCampo(e.target);
            atualizar(form);
        });
        form.addEventListener('change', (e) => {
            marcarCampo(e.target);
            atualizar(form);
        });

        // A escola aparece e some conforme a data de nascimento; o observador
        // recalcula o progresso quando isso acontece.
        if (observador) observador.disconnect();
        observador = new MutationObserver(() => atualizar(form));
        observador.observe(form, { attributes: true, subtree: true, attributeFilter: ['style'] });
    }

    function marcarCampo(el) {
        if (!el || !el.classList) return;
        if (!el.matches('.form-input, .form-select, .form-textarea')) return;
        const temValor = String(el.value || '').trim() !== '';
        el.classList.toggle('prc-preenchido', temValor);
        if (temValor) el.classList.remove('prc-erro');
    }

    // A barra de envio NÃO é montada aqui.
    //
    // A primeira versão movia o botão para uma barra criada com
    // document.body.appendChild(). Isso o tirava de dentro do <form>, e um
    // <button type="submit"> fora do formulário não envia nada: ficava
    // clicável e inerte. O container .prc-actions já existe dentro do form,
    // então quem o fixa no rodapé é o CSS — o botão nunca sai do lugar.

    // ── Erro de envio: leva até o campo ─────────────────────────────────────

    function interceptarErro(form) {
        const alvo = document.getElementById('prc-form-erro') ||
                     document.querySelector('.form-erro');
        // O pre-cadastro.js escreve a mensagem e já rola até o campo. Aqui
        // só acrescentamos a marcação vermelha no primeiro vazio, para a
        // pessoa enxergar onde está o problema.
        form.addEventListener('submit', () => {
            setTimeout(() => {
                const vazios = obrigatoriosVisiveis(form)
                    .filter(c => String(c.value || '').trim() === '');
                vazios.forEach(c => c.classList.add('prc-erro'));
            }, 120);
        });
    }

    // ── Boot ────────────────────────────────────────────────────────────────
    // O formulário é montado depois da validação do token, então esperamos
    // ele aparecer em vez de rodar direto no DOMContentLoaded.

    function esperarFormulario() {
        if (iniciar()) return;
        let tentativas = 0;
        const t = setInterval(() => {
            if (iniciar() || ++tentativas > 100) clearInterval(t);
        }, 150);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', esperarFormulario);
    } else {
        esperarFormulario();
    }
})();

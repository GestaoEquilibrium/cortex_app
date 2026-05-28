// ============================================================================
// CORTEX_APP — Sprint 71 — confirm_modal.js
// Modal de confirmação centralizado com fundo borrado.
// Extraído da Sprint 63 (pasta.html) pra uso global.
// ============================================================================
// Uso:
//   await window.CortexConfirm.mostrar({
//       icone: '⚠️',
//       titulo: 'Apagar este item?',
//       texto: 'Esta ação não pode ser desfeita.',
//       btnSim: 'Sim, apagar',
//       btnNao: 'Cancelar',
//       btnSimDanger: true,   // botão Sim vermelho
//       onSim: async () => { ...código a executar... }
//   });
//
// Estilos (.cortex-confirm-*) ficam em shared/confirm_modal.css.
// A página precisa carregar AMBOS os arquivos (JS + CSS).
// ============================================================================

(function() {
    'use strict';

    function escapeHtml(t) {
        if (t == null) return '';
        const div = document.createElement('div');
        div.textContent = String(t);
        return div.innerHTML;
    }

    function mostrar(opts) {
        opts = opts || {};
        const overlay = document.createElement('div');
        overlay.className = 'cortex-confirm-overlay';
        overlay.innerHTML = `
            <div class="cortex-confirm-box">
                <div class="cortex-confirm-icone">${opts.icone || '⚠️'}</div>
                <h2 class="cortex-confirm-titulo">${escapeHtml(opts.titulo || 'Confirmar?')}</h2>
                <p class="cortex-confirm-texto">${escapeHtml(opts.texto || '')}</p>
                <div class="cortex-confirm-acoes">
                    <button class="btn btn-secondary" data-acao="nao">${escapeHtml(opts.btnNao || 'Cancelar')}</button>
                    <button class="btn ${opts.btnSimDanger ? 'btn-danger' : 'btn-primary'}" data-acao="sim">${escapeHtml(opts.btnSim || 'Confirmar')}</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        return new Promise((resolve) => {
            const fechar = (confirmado) => {
                overlay.remove();
                resolve(confirmado);
            };
            overlay.querySelector('[data-acao="nao"]').addEventListener('click', () => fechar(false));
            overlay.addEventListener('click', (e) => { if (e.target === overlay) fechar(false); });

            overlay.querySelector('[data-acao="sim"]').addEventListener('click', async () => {
                const btnSim = overlay.querySelector('[data-acao="sim"]');
                btnSim.disabled = true;
                try {
                    if (typeof opts.onSim === 'function') await opts.onSim();
                    fechar(true);
                } catch (err) {
                    console.error('CortexConfirm.onSim error:', err);
                    btnSim.disabled = false;
                }
            });
        });
    }

    window.CortexConfirm = { mostrar };
})();

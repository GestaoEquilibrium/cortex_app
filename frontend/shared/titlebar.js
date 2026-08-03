// ============================================================================
// CORTEX_APP — Sprint app_titlebar — shared/titlebar.js
// ============================================================================
// Barra de título custom para o app instalado no DESKTOP (Chrome/Edge) com
// Window Controls Overlay: a barra nativa some e esta faixa navy fininha
// assume o lugar — arrastável, com a marca, fundindo com os controles
// nativos (que herdam o theme_color #0c1f3f do manifest).
//
// Comportamento:
//   - Navegador comum, mobile, iOS: NÃO faz nada (sai no primeiro if).
//   - App desktop com overlay ativo: injeta a faixa e marca <html class="wco">
//     (o CSS em components.css cuida do deslocamento do layout).
//   - Se o usuário desligar o overlay pelo menu do app, 'geometrychange'
//     dispara e a faixa é removida — layout volta ao normal sozinho.
// ============================================================================

(function () {
    'use strict';

    if (!('windowControlsOverlay' in navigator)) return;

    var BRAIN_SVG =
        '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
        '<g stroke="currentColor" fill="currentColor" stroke-linecap="round">' +
        '<line x1="16" y1="16" x2="9"  y2="9"  stroke-width="1"/>' +
        '<line x1="16" y1="16" x2="23" y2="9"  stroke-width="1"/>' +
        '<line x1="16" y1="16" x2="9"  y2="23" stroke-width="1"/>' +
        '<line x1="16" y1="16" x2="23" y2="23" stroke-width="1"/>' +
        '<line x1="16" y1="16" x2="16" y2="7"  stroke-width="1"/>' +
        '<line x1="16" y1="16" x2="16" y2="25" stroke-width="1"/>' +
        '<circle cx="16" cy="16" r="2.8"/>' +
        '<circle cx="9"  cy="9"  r="1.6"/><circle cx="23" cy="9"  r="1.6"/>' +
        '<circle cx="9"  cy="23" r="1.6"/><circle cx="23" cy="23" r="1.6"/>' +
        '<circle cx="16" cy="7"  r="1.4"/><circle cx="16" cy="25" r="1.4"/>' +
        '</g></svg>';

    function montar() {
        if (document.getElementById('cortex-wco-bar')) return;
        var bar = document.createElement('div');
        bar.id = 'cortex-wco-bar';
        bar.className = 'cortex-wco-bar';
        bar.innerHTML = BRAIN_SVG + '<span>CORTEX — Equilibrium Med Center</span>';
        document.body.prepend(bar);
        document.documentElement.classList.add('wco');
    }

    function desmontar() {
        var bar = document.getElementById('cortex-wco-bar');
        if (bar) bar.remove();
        document.documentElement.classList.remove('wco');
    }

    function sincronizar() {
        if (navigator.windowControlsOverlay.visible) montar();
        else desmontar();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', sincronizar, { once: true });
    } else {
        sincronizar();
    }

    navigator.windowControlsOverlay.addEventListener('geometrychange', sincronizar);
})();

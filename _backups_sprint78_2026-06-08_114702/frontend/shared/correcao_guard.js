// ============================================================================
// CORTEX_APP — Guard de Correção (Sprint 78)
// ============================================================================
// Bloqueia as páginas de correção (*_resultado.html) para quem NÃO pode
// corrigir — na prática, o estagiário. Corretor, aplicador e admins passam.
//
// Quando bloqueado, sobrepõe uma tela de "sem permissão" (fixed, z-index alto)
// que cobre o conteúdo independentemente do que o JS da página renderizar.
//
// Depende de:
//   - permissoes.js  (window.CortexPerfil)  ← deve ser carregado ANTES deste
//   - auth_guard.js  (window.cortexOnAuthReady / cortex:auth-ready)
//
// ⚠️ UI only. A barreira real de dados é a Sprint 79 (RLS).
// ============================================================================

(function () {
    'use strict';

    function montarTela() {
        if (document.getElementById('cortex-sem-permissao')) return;

        const overlay = document.createElement('div');
        overlay.id = 'cortex-sem-permissao';
        overlay.style.cssText = [
            'position:fixed', 'inset:0', 'z-index:99999',
            'display:flex', 'align-items:center', 'justify-content:center',
            'padding:24px',
            'background:rgba(15,23,42,0.55)',
            'backdrop-filter:blur(6px)',
            '-webkit-backdrop-filter:blur(6px)',
            'font-family:Inter,system-ui,sans-serif'
        ].join(';');

        overlay.innerHTML = `
            <div style="
                max-width:440px; width:100%;
                background:#fff; border-radius:20px;
                box-shadow:0 24px 60px rgba(2,6,23,0.35);
                overflow:hidden; text-align:center;
                animation:cortexSpFade .25s ease;">
                <div style="
                    background:linear-gradient(135deg,#f97316 0%,#ef4444 100%);
                    padding:34px 28px 30px; color:#fff;">
                    <div style="
                        width:66px; height:66px; margin:0 auto 14px;
                        border-radius:50%;
                        background:rgba(255,255,255,0.18);
                        display:flex; align-items:center; justify-content:center;">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none"
                             stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="3" y="11" width="18" height="11" rx="2"/>
                            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                        </svg>
                    </div>
                    <h2 style="margin:0; font-size:21px; font-weight:700;">Acesso restrito</h2>
                </div>
                <div style="padding:26px 30px 30px;">
                    <p style="margin:0 0 22px; color:#475569; font-size:15px; line-height:1.55;">
                        Você não tem permissão para acessar a área de
                        <strong>correção de instrumentos</strong>.
                        Fale com a coordenação clínica se precisar deste acesso.
                    </p>
                    <button id="cortex-sp-voltar" style="
                        display:inline-flex; align-items:center; gap:8px;
                        background:linear-gradient(135deg,#2e74b5 0%,#1e5a92 100%);
                        color:#fff; border:none; cursor:pointer;
                        padding:12px 24px; border-radius:12px;
                        font-size:15px; font-weight:600; font-family:inherit;
                        box-shadow:0 6px 16px rgba(46,116,181,0.32);
                        transition:transform .15s ease, box-shadow .15s ease;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                             stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="15 18 9 12 15 6"/>
                        </svg>
                        Voltar
                    </button>
                </div>
            </div>
            <style>
                @keyframes cortexSpFade {
                    from { opacity:0; transform:translateY(10px) scale(.98); }
                    to   { opacity:1; transform:translateY(0)    scale(1);  }
                }
                #cortex-sp-voltar:hover {
                    transform:translateY(-1px);
                    box-shadow:0 9px 22px rgba(46,116,181,0.42);
                }
            </style>
        `;

        document.body.appendChild(overlay);
        document.body.style.overflow = 'hidden';

        const btn = document.getElementById('cortex-sp-voltar');
        if (btn) {
            btn.addEventListener('click', function () {
                if (window.history.length > 1) {
                    window.history.back();
                } else {
                    window.location.href = '../../pacientes/lista.html';
                }
            });
        }
    }

    function checar() {
        const P = window.CortexPerfil;
        // Sem o módulo de permissões, não bloqueia (fail-open na UI;
        // a barreira real é a RLS da Sprint 79).
        if (P && !P.podeCorrigir()) {
            montarTela();
        }
    }

    if (typeof window.cortexOnAuthReady === 'function') {
        window.cortexOnAuthReady(checar);
    } else {
        window.addEventListener('cortex:auth-ready', checar, { once: true });
    }
})();

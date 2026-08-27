// ============================================================================
// CORTEX_APP — pwa.js  ·  Sprint pwa_v2
// ============================================================================
// Tudo que faz o CORTEX se comportar como app quando adicionado à tela inicial
// no iPhone e no Android.
//
//   1. Garante as meta tags de PWA em qualquer página (mesmo as que não têm
//      o bloco no HTML) — inclusive viewport-fit=cover, sem o qual o iOS
//      devolve 0 em todos os env(safe-area-inset-*).
//   2. Injeta as apple-touch-startup-image (tela de abertura do iOS).
//   3. Marca <body class="is-pwa"> quando está rodando instalado.
//   4. Captura o beforeinstallprompt do Android e oferece instalação.
//      No iOS, que não tem prompt, mostra o passo a passo.
//   5. Registra o sw-assets.js (cache de estáticos, nunca de rota).
//
// API: window.CortexPWA
//   .instalado          -> boolean
//   .plataforma         -> 'ios' | 'android' | 'desktop'
//   .podeInstalar()     -> boolean
//   .instalar()         -> dispara o prompt (Android) ou o passo a passo (iOS)
//   .montarConvite(el)  -> insere o card "instalar" dentro do elemento
//   .limparCache()
// ============================================================================

window.CortexPWA = (function () {
    'use strict';

    // ── Base absoluta de /frontend/ (mesma técnica do sidebar/auth_guard) ────
    function base() {
        const p = window.location.pathname;
        const i = p.indexOf('/frontend/');
        return i >= 0 ? p.substring(0, i + '/frontend/'.length) : '/frontend/';
    }

    const B = base();

    // ── Detecção ─────────────────────────────────────────────────────────────
    const ua = navigator.userAgent || '';
    const ehIOS = /iPad|iPhone|iPod/.test(ua) ||
                  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const ehAndroid = /Android/.test(ua);

    const instalado =
        window.matchMedia('(display-mode: standalone)').matches ||
        window.matchMedia('(display-mode: minimal-ui)').matches ||
        window.navigator.standalone === true;

    const plataforma = ehIOS ? 'ios' : (ehAndroid ? 'android' : 'desktop');

    // ── 1. Meta tags ─────────────────────────────────────────────────────────
    function meta(nome, conteudo) {
        let el = document.querySelector('meta[name="' + nome + '"]');
        if (!el) {
            el = document.createElement('meta');
            el.setAttribute('name', nome);
            document.head.appendChild(el);
        }
        el.setAttribute('content', conteudo);
    }

    function link(rel, href, extras) {
        const seletor = 'link[rel="' + rel + '"]' +
            (extras && extras.sizes ? '[sizes="' + extras.sizes + '"]' : '');
        let el = document.querySelector(seletor);
        if (!el) {
            el = document.createElement('link');
            el.setAttribute('rel', rel);
            document.head.appendChild(el);
        }
        el.setAttribute('href', href);
        if (extras) {
            Object.keys(extras).forEach((k) => el.setAttribute(k, extras[k]));
        }
    }

    function garantirMetas() {
        // viewport-fit=cover é o que destrava env(safe-area-inset-*) no iOS.
        const vp = document.querySelector('meta[name="viewport"]');
        if (vp) {
            const c = vp.getAttribute('content') || '';
            if (c.indexOf('viewport-fit') === -1) {
                vp.setAttribute('content', c.replace(/\s*$/, '') + ', viewport-fit=cover');
            }
        } else {
            meta('viewport', 'width=device-width, initial-scale=1.0, viewport-fit=cover');
        }

        if (!document.querySelector('link[rel="manifest"]')) {
            link('manifest', B + 'site.webmanifest');
        }
        if (!document.querySelector('link[rel="apple-touch-icon"]')) {
            link('apple-touch-icon', B + 'apple-touch-icon.png', { sizes: '180x180' });
        }

        meta('theme-color', '#141F3C');
        meta('mobile-web-app-capable', 'yes');
        meta('apple-mobile-web-app-capable', 'yes');
        meta('apple-mobile-web-app-title', 'CORTEX');
        // black-translucent deixa a topbar navy subir por baixo da status bar.
        // Só faz sentido junto com viewport-fit=cover, que já garantimos acima.
        meta('apple-mobile-web-app-status-bar-style', 'black-translucent');
    }

    // ── 2. Telas de abertura do iOS ──────────────────────────────────────────
    // [largura CSS, altura CSS, densidade]
    const SPLASHES = [
        [430, 932, 3], [393, 852, 3], [428, 926, 3], [390, 844, 3], [375, 812, 3],
        [414, 896, 3], [414, 896, 2], [414, 736, 3], [375, 667, 2], [320, 568, 2],
        [810, 1080, 2], [834, 1194, 2], [1024, 1366, 2], [744, 1133, 2]
    ];

    function injetarSplashes() {
        if (!ehIOS) return;
        if (document.querySelector('link[rel="apple-touch-startup-image"]')) return;

        const frag = document.createDocumentFragment();
        SPLASHES.forEach(([cw, ch, dpr]) => {
            const el = document.createElement('link');
            el.rel = 'apple-touch-startup-image';
            el.media = '(device-width: ' + cw + 'px) and (device-height: ' + ch + 'px)' +
                       ' and (-webkit-device-pixel-ratio: ' + dpr + ')' +
                       ' and (orientation: portrait)';
            el.href = B + 'splash/splash-' + (cw * dpr) + 'x' + (ch * dpr) + '.png';
            frag.appendChild(el);
        });
        document.head.appendChild(frag);
    }

    // ── 3. Modo app ──────────────────────────────────────────────────────────
    function marcarModoApp() {
        const aplicar = () => {
            document.body.classList.toggle('is-pwa', instalado);
            document.body.classList.toggle('plataforma-ios', ehIOS);
            document.body.classList.toggle('plataforma-android', ehAndroid);
        };
        if (document.body) aplicar();
        else document.addEventListener('DOMContentLoaded', aplicar);
    }

    // ── 4. Instalação ────────────────────────────────────────────────────────
    let promptGuardado = null;

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        promptGuardado = e;
        window.dispatchEvent(new CustomEvent('cortex:pode-instalar'));
    });

    window.addEventListener('appinstalled', () => {
        promptGuardado = null;
        try { localStorage.removeItem('cortex_pwa_convite_dispensado'); } catch (_) {}
        document.querySelectorAll('.pwa-instalar-card').forEach((el) => el.remove());
    });

    function podeInstalar() {
        if (instalado) return false;
        if (promptGuardado) return true;
        // iOS nunca dispara o prompt: oferecemos o passo a passo.
        return ehIOS;
    }

    const ICO_COMPARTILHAR =
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
        'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px">' +
        '<path d="M12 16V3"/><polyline points="8 7 12 3 16 7"/>' +
        '<path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>';

    function passoAPassoIOS() {
        const html =
            '<div class="pwa-passos">' +
              '<div class="pwa-passo"><div class="pwa-passo-num">1</div>' +
                '<p>Toque no botão <strong>Compartilhar</strong> ' + ICO_COMPARTILHAR +
                ' na barra do Safari.</p></div>' +
              '<div class="pwa-passo"><div class="pwa-passo-num">2</div>' +
                '<p>Role a lista e escolha <strong>Adicionar à Tela de Início</strong>.</p></div>' +
              '<div class="pwa-passo"><div class="pwa-passo-num">3</div>' +
                '<p>Confirme em <strong>Adicionar</strong>. O CORTEX vai aparecer como ' +
                'aplicativo, em tela cheia e sem a barra do navegador.</p></div>' +
            '</div>' +
            '<p style="font-size:12.5px;color:var(--color-text-muted);margin-top:14px;line-height:1.6">' +
            'Precisa ser pelo <strong>Safari</strong>. Chrome e Firefox no iPhone não ' +
            'conseguem instalar aplicativos web.</p>';

        if (window.CortexPop) {
            window.CortexPop.abrir({
                titulo: 'Instalar o CORTEX',
                subtitulo: 'Três toques e vira app no seu iPhone',
                tone: 'purple',
                tamanho: 'sm',
                html: html,
                rodape: [{ label: 'Entendi', classe: 'btn-primary' }]
            });
        } else {
            alert('Para instalar: toque em Compartilhar no Safari e escolha ' +
                  '"Adicionar à Tela de Início".');
        }
    }

    async function instalar() {
        if (promptGuardado) {
            promptGuardado.prompt();
            try {
                const r = await promptGuardado.userChoice;
                promptGuardado = null;
                return r && r.outcome === 'accepted';
            } catch (_) {
                promptGuardado = null;
                return false;
            }
        }
        if (ehIOS) { passoAPassoIOS(); return false; }
        return false;
    }

    // ── Card de convite ──────────────────────────────────────────────────────
    const CHAVE_DISPENSADO = 'cortex_pwa_convite_dispensado';

    function montarConvite(alvo) {
        if (!alvo || instalado || !podeInstalar()) return;
        try {
            if (localStorage.getItem(CHAVE_DISPENSADO) === '1') return;
        } catch (_) {}
        if (alvo.querySelector('.pwa-instalar-card')) return;

        const card = document.createElement('div');
        card.className = 'pwa-instalar-card';
        card.innerHTML =
            '<div class="pwa-instalar-ico">' +
              '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
              'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
              '<rect x="5" y="2" width="14" height="20" rx="3"/><line x1="12" y1="18" x2="12.01" y2="18"/>' +
              '</svg></div>' +
            '<div class="pwa-instalar-txt">' +
              '<strong>Instale o CORTEX no seu celular</strong>' +
              '<span>Abre em tela cheia, direto da tela inicial.</span>' +
            '</div>' +
            '<button class="btn btn-primary" id="pwa-instalar-btn" style="flex-shrink:0">Instalar</button>' +
            '<button class="pwa-instalar-fechar" title="Agora não" aria-label="Dispensar">' +
              '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
              'stroke-width="2.2" stroke-linecap="round">' +
              '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
            '</button>';

        card.querySelector('#pwa-instalar-btn').addEventListener('click', instalar);
        card.querySelector('.pwa-instalar-fechar').addEventListener('click', () => {
            try { localStorage.setItem(CHAVE_DISPENSADO, '1'); } catch (_) {}
            card.remove();
        });

        alvo.insertBefore(card, alvo.firstChild);
    }

    // ── 5. Service worker de estáticos ───────────────────────────────────────
    function registrarSW() {
        if (!('serviceWorker' in navigator)) return;
        if (window.location.protocol !== 'https:' &&
            window.location.hostname !== 'localhost') return;

        window.addEventListener('load', () => {
            navigator.serviceWorker
                .register(B + 'sw-assets.js', { scope: B })
                .catch((e) => console.warn('[pwa] sw-assets não registrou:', e));
        });
    }

    function limparCache() {
        if (!('serviceWorker' in navigator)) return;
        navigator.serviceWorker.ready.then((reg) => {
            if (reg.active) reg.active.postMessage({ tipo: 'limpar-cache' });
        }).catch(() => {});
    }

    // ── Boot ─────────────────────────────────────────────────────────────────
    garantirMetas();
    injetarSplashes();
    marcarModoApp();
    registrarSW();

    return {
        instalado,
        plataforma,
        podeInstalar,
        instalar,
        montarConvite,
        limparCache
    };
})();

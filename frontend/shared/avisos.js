// ============================================================================
// CORTEX — avisos.js
// ----------------------------------------------------------------------------
// Som e aviso do navegador quando chega mensagem ou notificação.
// Carregado pelo sidebar.js em todas as páginas (antes do sino e do chat).
//
//   · Som curto gerado na hora (sem arquivo de áudio): "plim" para mensagem,
//     dois toques para aviso, três para pedido de acesso externo.
//     Liga/desliga no painel do sino (fica guardado neste aparelho).
//   · Aviso do navegador (o balão do sistema) quando o CORTEX está aberto mas
//     a pessoa está em outra aba ou outro programa. Com o CORTEX na frente,
//     quem avisa é o cartão/aviso dentro da própria página.
//     Usa a mesma etiqueta (tag) do push do servidor: se os dois chegarem,
//     o sistema mostra um só.
//   · Várias abas abertas: só uma toca e avisa.
//   · Aba em segundo plano: o título ganha "(●)" até a pessoa voltar.
// ============================================================================

window.CortexAvisos = (function () {
    'use strict';

    const CHAVE_SOM = 'cortex_avisos_som';      // '0' = desligado
    const JANELA_DEDUP_MS = 20000;

    let ctx = null;
    let tituloOriginal = null;

    // ── Preferência ──────────────────────────────────────────────────────────
    function somLigado() {
        try { return window.localStorage.getItem(CHAVE_SOM) !== '0'; } catch (_) { return true; }
    }
    function ligarSom(sim) {
        try { window.localStorage.setItem(CHAVE_SOM, sim ? '1' : '0'); } catch (_) { /* privado */ }
        if (sim) tocar('aviso', true);
    }

    // ── Som (Web Audio) ──────────────────────────────────────────────────────
    function audio() {
        if (!ctx) {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return null;
            try { ctx = new AC(); } catch (_) { return null; }
        }
        return ctx;
    }
    // O navegador só deixa tocar som depois que a pessoa clica ou digita na página.
    function destravar() {
        const a = audio();
        if (a && a.state === 'suspended') a.resume().catch(() => {});
    }
    ['pointerdown', 'keydown', 'touchstart'].forEach((ev) =>
        document.addEventListener(ev, destravar, { capture: true, passive: true }));

    function nota(a, freq, ini, dur, vol, forma) {
        const o = a.createOscillator(), g = a.createGain();
        o.type = forma || 'sine';
        o.frequency.setValueAtTime(freq, ini);
        g.gain.setValueAtTime(0.0001, ini);
        g.gain.exponentialRampToValueAtTime(vol, ini + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, ini + dur);
        o.connect(g); g.connect(a.destination);
        o.start(ini); o.stop(ini + dur + 0.05);
    }
    const SONS = {
        // "plim" subindo
        mensagem: (a, t) => { nota(a, 880, t, 0.16, 0.16); nota(a, 1318.5, t + 0.1, 0.32, 0.14); },
        // dois toques mais graves
        aviso: (a, t) => { nota(a, 659.25, t, 0.2, 0.15, 'triangle'); nota(a, 987.77, t + 0.15, 0.34, 0.13, 'triangle'); },
        // três toques (pedido de acesso externo)
        alerta: (a, t) => { nota(a, 784, t, 0.14, 0.14, 'triangle'); nota(a, 988, t + 0.13, 0.14, 0.13, 'triangle'); nota(a, 1175, t + 0.26, 0.3, 0.12, 'triangle'); }
    };
    function tocar(tipo, mesmoDesligado) {
        if (!mesmoDesligado && !somLigado()) return false;
        const a = audio();
        if (!a) return false;
        const vai = () => { try { (SONS[tipo] || SONS.aviso)(a, a.currentTime + 0.02); } catch (_) { /* sem som */ } };
        if (a.state === 'suspended') a.resume().then(vai).catch(() => {});
        else vai();
        return true;
    }

    // ── Uma aba só ───────────────────────────────────────────────────────────
    function souAPrimeira(chave) {
        try {
            const k = 'cortex_aviso_' + chave, agora = Date.now();
            const antes = Number(window.localStorage.getItem(k) || 0);
            if (agora - antes < JANELA_DEDUP_MS) return false;
            window.localStorage.setItem(k, String(agora));
            // limpa as marcas velhas
            for (let i = window.localStorage.length - 1; i >= 0; i--) {
                const kk = window.localStorage.key(i);
                if (kk && kk.indexOf('cortex_aviso_') === 0 && agora - Number(window.localStorage.getItem(kk) || 0) > 600000) window.localStorage.removeItem(kk);
            }
            return true;
        } catch (_) { return true; }
    }

    // ── Aviso do navegador ───────────────────────────────────────────────────
    function basePathFrontend() {
        const p = window.location.pathname;
        const idx = p.indexOf('/frontend/');
        return idx >= 0 ? p.substring(0, idx + '/frontend/'.length) : '/frontend/';
    }
    function urlCompleta(url) {
        if (!url) return basePathFrontend() + 'dashboard.html';
        if (/^https?:|^\//.test(url)) return url;
        return basePathFrontend() + String(url).replace(/^\.?\/+/, '');
    }
    function naFrente() {
        return document.visibilityState === 'visible' && (typeof document.hasFocus !== 'function' || document.hasFocus());
    }
    async function avisoDoNavegador(n) {
        if (!('Notification' in window) || Notification.permission !== 'granted') return false;
        const titulo = n.titulo || 'CORTEX';
        const opcoes = {
            body: n.corpo || '',
            icon: basePathFrontend() + 'icon-192.png',
            badge: basePathFrontend() + 'icon-192.png',
            tag: n.tag,
            renotify: false,
            silent: true,                 // o som é o nosso (não toca dois)
            data: { url: urlCompleta(n.url), id: n.id || null }
        };
        try {
            if ('serviceWorker' in navigator) {
                const reg = await navigator.serviceWorker.getRegistration(basePathFrontend());
                if (reg && reg.showNotification) { await reg.showNotification(titulo, opcoes); return true; }
            }
        } catch (_) { /* tenta do jeito simples */ }
        try {
            const nt = new Notification(titulo, opcoes);
            nt.onclick = () => { try { window.focus(); } catch (_) { /* ok */ } window.location.href = opcoes.data.url; nt.close(); };
            return true;
        } catch (_) { return false; }
    }

    // ── Título da aba ────────────────────────────────────────────────────────
    function marcarTitulo() {
        if (document.visibilityState === 'visible') return;
        if (tituloOriginal == null) tituloOriginal = document.title;
        document.title = '(●) ' + tituloOriginal;
    }
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && tituloOriginal != null) { document.title = tituloOriginal; tituloOriginal = null; }
    });

    /**
     * Chegou algo para a pessoa.
     * n: { id, tipo, titulo, corpo, url, tag? }   som: 'mensagem' | 'aviso' | 'alerta'
     */
    function chegou(n, som) {
        if (!n) return;
        const chave = n.tag || ((n.tipo || 'aviso') + ':' + (n.id || Date.now()));
        n = Object.assign({}, n, { tag: chave });
        const tipoSom = som || (n.tipo === 'chat_mensagem' ? 'mensagem' : 'aviso');
        // a aba que está na frente fala primeiro; as de trás esperam um pouco
        const espera = naFrente() ? 0 : 180 + Math.random() * 320;
        setTimeout(() => {
            if (!souAPrimeira(chave)) { marcarTitulo(); return; }
            tocar(tipoSom);
            marcarTitulo();
            if (!naFrente()) avisoDoNavegador(n);
        }, espera);
    }

    // ── Pedir a permissão do navegador ───────────────────────────────────────
    // O navegador só mostra o pedido "Permitir notificações?" depois de um clique.
    // No primeiro clique em qualquer lugar do CORTEX (uma vez por dia, enquanto a
    // pessoa não decidiu), o próprio clique já dispara o pedido.
    const CHAVE_ADIADO = 'cortex_push_adiado_em';
    function hoje() {
        const d = new Date();
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }
    function lerLocal(k) { try { return window.localStorage.getItem(k); } catch (_) { return null; } }
    function gravarLocal(k, v) { try { window.localStorage.setItem(k, v); } catch (_) { /* privado */ } }
    function podePedir() {
        if (!('Notification' in window) || Notification.permission !== 'default') return false;
        if (!window.CortexNotificacoes || typeof window.CortexNotificacoes.ativarPush !== 'function') return false;
        if (window.CortexChatBadge && typeof window.CortexChatBadge.devePerguntar === 'function') return window.CortexChatBadge.devePerguntar();
        return lerLocal(CHAVE_ADIADO) !== hoje();
    }
    function pedirNoPrimeiroClique(ev) {
        const alvo = ev && ev.target;
        // o próprio convite e o painel do sino têm botões para isso
        if (alvo && alvo.closest && alvo.closest('#chat-convite, #cortex-notif-painel, #cortex-sino')) return;
        if (!podePedir()) return;
        document.removeEventListener('pointerdown', pedirNoPrimeiroClique, true);
        gravarLocal(CHAVE_ADIADO, hoje());
        const convite = document.getElementById('chat-convite');
        if (convite) convite.remove();
        window.CortexNotificacoes.ativarPush();
    }
    document.addEventListener('pointerdown', pedirNoPrimeiroClique, true);

    // Bloqueado no navegador: o pedido nunca mais aparece sozinho. Mostra como
    // liberar (uma vez por dia, até a pessoa liberar).
    const CHAVE_BLOQ = 'cortex_notif_bloqueada_avisada_em';
    function avisarBloqueio() {
        if (!('Notification' in window) || Notification.permission !== 'denied') return;
        if (lerLocal(CHAVE_BLOQ) === hoje() || document.getElementById('chat-convite')) return;
        gravarLocal(CHAVE_BLOQ, hoje());
        const el = document.createElement('div');
        el.id = 'chat-convite';
        el.className = 'chat-convite';
        el.setAttribute('role', 'dialog');
        el.setAttribute('aria-label', 'Notificações bloqueadas');
        el.innerHTML =
            '<div class="chat-convite-ico">🔕</div>' +
            '<div class="chat-convite-txt">' +
                '<strong>Notificações bloqueadas neste navegador</strong>' +
                '<span>Para receber as mensagens e os avisos: clique no cadeado (ou no ícone ao lado do endereço do site), em <b>Notificações</b> escolha <b>Permitir</b> e recarregue a página.</span>' +
            '</div>' +
            '<div class="chat-convite-btns"><button type="button" class="chat-convite-ok">Entendi</button></div>';
        document.body.appendChild(el);
        requestAnimationFrame(() => el.classList.add('visivel'));
        el.querySelector('.chat-convite-ok').addEventListener('click', () => { el.classList.remove('visivel'); setTimeout(() => el.remove(), 260); });
    }
    setTimeout(avisarBloqueio, 2500);

    return { chegou, tocar, somLigado, ligarSom, avisoDoNavegador, podePedir };
})();

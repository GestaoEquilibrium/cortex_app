// ============================================================================
// CORTEX_APP — Sprint 91 — notificacoes.js
// ============================================================================
// Central de notificações do profissional:
//   - Sino na sidebar com contador de não lidas
//   - Painel com a lista, marcar como lida, marcar todas
//   - Realtime (INSERT em `notificacoes` filtrado por destinatario_id)
//   - Fallback de polling a cada 60s se o Realtime não conectar
//   - Push do navegador (funciona com o CORTEX fechado) via service worker
//
// Carregado automaticamente pelo sidebar.js — não precisa incluir <script>
// em cada página.
//
// Dependências: window.cortexClient, window.cortexProfissional, CortexUI.
// ============================================================================

window.CortexNotificacoes = (function () {
    'use strict';

    // Chave pública VAPID — pode ficar exposta, é o padrão do Web Push.
    // A privada vive só nos secrets da Edge Function.
    const VAPID_PUBLIC_KEY =
        'BBZV8Zis8_zaJ0d9JOBsxBO7XcvJtO5caLlaVHvNx9Bj8HmwteLOnZrn1q0Nt12UNLl8wxRVQc43Xraic3uiITo';

    const POLL_MS = 60000;
    const LIMITE = 30;

    const state = {
        lista: [],
        naoLidas: 0,
        aberto: false,
        canal: null,
        pollTimer: null,
        iniciado: false
    };

    // ─── Ícone e cor por tipo de evento ──────────────────────────────────────
    const TIPOS = {
        bateria_concluida: {
            emoji: '🎉',
            cor: '#22C55E',
            gradiente: 'linear-gradient(135deg,#22C55E 0%,#16A34A 100%)'
        },
        teste_respondido: {
            emoji: '✅',
            cor: '#2F6FED',
            gradiente: 'linear-gradient(135deg,#2F6FED 0%,#1E40AF 100%)'
        },
        paciente_novo: {
            emoji: '👤',
            cor: '#7C4DFF',
            gradiente: 'linear-gradient(135deg,#7C4DFF 0%,#5B21B6 100%)'
        },
        paciente_designado: {
            emoji: '📌',
            cor: '#F59E0B',
            gradiente: 'linear-gradient(135deg,#F59E0B 0%,#D97706 100%)'
        },
        anamnese_respondida: {
            emoji: '📝',
            cor: '#0EA5E9',
            gradiente: 'linear-gradient(135deg,#0EA5E9 0%,#0369A1 100%)'
        }
    };
    const TIPO_PADRAO = {
        emoji: '🔔',
        cor: '#64748B',
        gradiente: 'linear-gradient(135deg,#64748B 0%,#475569 100%)'
    };
    const tipoInfo = (t) => TIPOS[t] || TIPO_PADRAO;

    const SINO_SVG =
        '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>' +
        '<path d="M13.73 21a2 2 0 0 1-3.46 0"/>';

    // ────────────────────────────────────────────────────────────────────────
    // Caminhos
    // ────────────────────────────────────────────────────────────────────────
    // Descobre o caminho absoluto da pasta /frontend/ a partir da URL atual,
    // para registrar o service worker e montar links independente da
    // profundidade da página.
    function basePathFrontend() {
        const p = window.location.pathname;
        const idx = p.indexOf('/frontend/');
        if (idx >= 0) return p.substring(0, idx + '/frontend/'.length);
        return '/frontend/';
    }

    function urlDestino(n) {
        if (!n.url) return null;
        if (/^https?:\/\//i.test(n.url)) return n.url;
        // As URLs vêm do banco já relativas à pasta frontend (ex.:
        // "pacientes/pasta.html?id=..."), então prefixamos a base real.
        return basePathFrontend() + n.url.replace(/^\/+/, '');
    }

    // ────────────────────────────────────────────────────────────────────────
    // Dados
    // ────────────────────────────────────────────────────────────────────────
    async function carregar() {
        try {
            const { data, error } = await window.cortexClient
                .from('notificacoes')
                .select('id, tipo, titulo, corpo, paciente_id, url, lida_em, created_at')
                .order('created_at', { ascending: false })
                .limit(LIMITE);

            if (error) throw error;

            state.lista = data || [];
            state.naoLidas = state.lista.filter((n) => !n.lida_em).length;
            atualizarBadge();
            if (state.aberto) renderPainel();
        } catch (err) {
            console.warn('[notificacoes] carregar:', err.message || err);
        }
    }

    async function marcarLida(id) {
        const n = state.lista.find((x) => x.id === id);
        if (!n || n.lida_em) return;

        // Otimista: some o destaque na hora, corrige se der erro.
        n.lida_em = new Date().toISOString();
        state.naoLidas = Math.max(0, state.naoLidas - 1);
        atualizarBadge();
        if (state.aberto) renderPainel();

        try {
            const { error } = await window.cortexClient
                .from('notificacoes')
                .update({ lida_em: n.lida_em })
                .eq('id', id);
            if (error) throw error;
        } catch (err) {
            console.warn('[notificacoes] marcar lida:', err.message || err);
            await carregar();
        }
    }

    async function marcarTodas() {
        if (state.naoLidas === 0) return;
        try {
            const { error } = await window.cortexClient.rpc('notificacoes_marcar_todas_lidas');
            if (error) throw error;
            await carregar();
            if (window.CortexUI) window.CortexUI.toast('Notificações marcadas como lidas', 'success');
        } catch (err) {
            console.warn('[notificacoes] marcar todas:', err.message || err);
            if (window.CortexUI) window.CortexUI.toast('Erro ao marcar como lidas', 'danger');
        }
    }

    // ────────────────────────────────────────────────────────────────────────
    // Realtime + polling de segurança
    // ────────────────────────────────────────────────────────────────────────
    function assinarRealtime() {
        const profId = window.cortexProfissional?.id;
        if (!profId || state.canal) return;

        try {
            state.canal = window.cortexClient
                .channel('cortex-notif-' + profId)
                .on(
                    'postgres_changes',
                    {
                        event: 'INSERT',
                        schema: 'public',
                        table: 'notificacoes',
                        filter: 'destinatario_id=eq.' + profId
                    },
                    (payload) => {
                        const nova = payload.new;
                        if (!nova || state.lista.some((n) => n.id === nova.id)) return;
                        state.lista.unshift(nova);
                        state.lista = state.lista.slice(0, LIMITE);
                        state.naoLidas++;
                        atualizarBadge(true);
                        if (state.aberto) renderPainel();
                        if (window.CortexUI) {
                            window.CortexUI.toast(
                                tipoInfo(nova.tipo).emoji + ' ' + nova.titulo,
                                'info'
                            );
                        }
                    }
                )
                .subscribe();
        } catch (err) {
            console.warn('[notificacoes] realtime indisponível:', err.message || err);
        }

        // Rede de segurança: se o Realtime cair, o polling mantém o sino vivo.
        if (!state.pollTimer) {
            state.pollTimer = setInterval(() => {
                if (document.visibilityState === 'visible') carregar();
            }, POLL_MS);
        }
    }

    // ────────────────────────────────────────────────────────────────────────
    // Push do navegador
    // ────────────────────────────────────────────────────────────────────────
    function pushSuportado() {
        return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    }

    // Detecta iPhone/iPad fora do modo "instalado na tela inicial", onde o
    // push simplesmente não existe — vale avisar em vez de falhar calado.
    function ehIosNaoInstalado() {
        const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
            (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        const instalado = window.navigator.standalone === true ||
            window.matchMedia('(display-mode: standalone)').matches;
        return ios && !instalado;
    }

    function base64UrlParaUint8(base64) {
        const pad = '='.repeat((4 - (base64.length % 4)) % 4);
        const b64 = (base64 + pad).replace(/-/g, '+').replace(/_/g, '/');
        const raw = window.atob(b64);
        const out = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
        return out;
    }

    async function registrarServiceWorker() {
        const caminho = basePathFrontend() + 'sw-push.js';
        return navigator.serviceWorker.register(caminho, { scope: basePathFrontend() });
    }

    // Reaproveita a inscrição existente ou cria uma nova, e grava no banco.
    async function ativarPush() {
        if (!pushSuportado()) {
            if (window.CortexUI) {
                window.CortexUI.toast('Este navegador não suporta notificações push.', 'danger');
            }
            return false;
        }

        if (ehIosNaoInstalado()) {
            if (window.CortexUI) {
                window.CortexUI.toast(
                    'No iPhone é preciso instalar o CORTEX na tela inicial antes de ativar as notificações.',
                    'info'
                );
            }
            return false;
        }

        try {
            const permissao = await Notification.requestPermission();
            if (permissao !== 'granted') {
                if (window.CortexUI) {
                    window.CortexUI.toast('Permissão de notificação negada.', 'info');
                }
                renderPainel();
                return false;
            }

            const reg = await registrarServiceWorker();
            await navigator.serviceWorker.ready;

            let sub = await reg.pushManager.getSubscription();
            if (!sub) {
                sub = await reg.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: base64UrlParaUint8(VAPID_PUBLIC_KEY)
                });
            }

            const json = sub.toJSON();
            const { error } = await window.cortexClient.rpc('push_registrar', {
                p_endpoint: sub.endpoint,
                p_p256dh: json.keys.p256dh,
                p_auth: json.keys.auth,
                p_user_agent: navigator.userAgent.substring(0, 300)
            });
            if (error) throw error;

            if (window.CortexUI) {
                window.CortexUI.toast('Notificações ativadas neste dispositivo.', 'success');
            }
            renderPainel();
            return true;
        } catch (err) {
            console.warn('[notificacoes] ativar push:', err);
            if (window.CortexUI) {
                window.CortexUI.toast('Não foi possível ativar: ' + (err.message || err), 'danger');
            }
            return false;
        }
    }

    // Se a permissão já foi concedida antes, só garante que o SW está no ar e
    // que a inscrição continua registrada no banco (endpoints expiram).
    async function revalidarPushSilencioso() {
        if (!pushSuportado() || Notification.permission !== 'granted') return;
        try {
            const reg = await registrarServiceWorker();
            await navigator.serviceWorker.ready;
            const sub = await reg.pushManager.getSubscription();
            if (!sub) return;
            const json = sub.toJSON();
            await window.cortexClient.rpc('push_registrar', {
                p_endpoint: sub.endpoint,
                p_p256dh: json.keys.p256dh,
                p_auth: json.keys.auth,
                p_user_agent: navigator.userAgent.substring(0, 300)
            });
        } catch (err) {
            console.warn('[notificacoes] revalidar push:', err.message || err);
        }
    }

    // ────────────────────────────────────────────────────────────────────────
    // UI — sino
    // ────────────────────────────────────────────────────────────────────────
    function montarSino() {
        const nav = document.querySelector('#cortex-sidebar .sidebar-nav');
        if (!nav || document.getElementById('cortex-sino')) return;

        const btn = document.createElement('button');
        btn.id = 'cortex-sino';
        btn.className = 'nav-item nav-item-sino';
        btn.type = 'button';
        btn.title = 'Notificações';
        btn.innerHTML =
            '<span class="sino-wrap">' +
            '<svg class="nav-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
            SINO_SVG +
            '</svg>' +
            '<span class="sino-badge" id="cortex-sino-badge" hidden>0</span>' +
            '</span>' +
            '<span class="sidebar-text">Notificações</span>';

        btn.addEventListener('click', (e) => {
            e.preventDefault();
            alternarPainel();
        });

        nav.insertBefore(btn, nav.firstChild);
    }

    function atualizarBadge(pulsar) {
        const badge = document.getElementById('cortex-sino-badge');
        if (!badge) return;
        if (state.naoLidas > 0) {
            badge.textContent = state.naoLidas > 99 ? '99+' : String(state.naoLidas);
            badge.hidden = false;
        } else {
            badge.hidden = true;
        }
        if (pulsar) {
            const sino = document.getElementById('cortex-sino');
            if (sino) {
                sino.classList.remove('sino-tocando');
                void sino.offsetWidth;
                sino.classList.add('sino-tocando');
            }
        }
    }

    // ────────────────────────────────────────────────────────────────────────
    // UI — painel
    // ────────────────────────────────────────────────────────────────────────
    function alternarPainel() {
        state.aberto ? fecharPainel() : abrirPainel();
    }

    function abrirPainel() {
        let painel = document.getElementById('cortex-notif-painel');
        if (!painel) {
            painel = document.createElement('div');
            painel.id = 'cortex-notif-painel';
            painel.className = 'notif-painel';
            document.body.appendChild(painel);
        }
        state.aberto = true;
        renderPainel();
        posicionarPainel();
        painel.classList.add('aberto');
        setTimeout(() => document.addEventListener('click', cliqueFora), 0);
        window.addEventListener('resize', posicionarPainel);
    }

    function fecharPainel() {
        state.aberto = false;
        const painel = document.getElementById('cortex-notif-painel');
        if (painel) painel.classList.remove('aberto');
        document.removeEventListener('click', cliqueFora);
        window.removeEventListener('resize', posicionarPainel);
    }

    function cliqueFora(e) {
        const painel = document.getElementById('cortex-notif-painel');
        const sino = document.getElementById('cortex-sino');
        if (!painel) return;
        if (painel.contains(e.target) || (sino && sino.contains(e.target))) return;
        fecharPainel();
    }

    // Posiciona ancorado no sino — funciona com a sidebar expandida ou colapsada.
    function posicionarPainel() {
        const painel = document.getElementById('cortex-notif-painel');
        const sino = document.getElementById('cortex-sino');
        if (!painel || !sino) return;

        const r = sino.getBoundingClientRect();
        const largura = Math.min(400, window.innerWidth - 24);
        let left = r.right + 12;
        if (left + largura > window.innerWidth - 12) left = Math.max(12, window.innerWidth - largura - 12);
        let top = Math.max(12, r.top - 8);
        const alturaMax = window.innerHeight - top - 20;

        painel.style.width = largura + 'px';
        painel.style.left = left + 'px';
        painel.style.top = top + 'px';
        painel.style.maxHeight = alturaMax + 'px';
    }

    function renderPainel() {
        const painel = document.getElementById('cortex-notif-painel');
        if (!painel) return;

        const cabecalho =
            '<div class="notif-cabecalho">' +
            '<div class="notif-cabecalho-titulo">' +
            '<span class="notif-cabecalho-ico">🔔</span>' +
            '<span>Notificações</span>' +
            (state.naoLidas > 0 ? '<span class="notif-pill">' + state.naoLidas + ' nova' + (state.naoLidas > 1 ? 's' : '') + '</span>' : '') +
            '</div>' +
            (state.naoLidas > 0
                ? '<button class="notif-btn-texto" data-acao="marcar-todas">Marcar todas</button>'
                : '') +
            '</div>';

        const corpo = state.lista.length === 0
            ? '<div class="notif-vazio">' +
              '<div class="notif-vazio-ico">🌤️</div>' +
              '<strong>Tudo em dia</strong>' +
              '<p>Quando um teste for respondido ou uma bateria fechar, você vê aqui.</p>' +
              '</div>'
            : '<div class="notif-lista">' + state.lista.map(renderItem).join('') + '</div>';

        painel.innerHTML = cabecalho + renderFaixaPush() + corpo;

        painel.querySelector('[data-acao="marcar-todas"]')?.addEventListener('click', marcarTodas);
        painel.querySelector('[data-acao="ativar-push"]')?.addEventListener('click', ativarPush);

        painel.querySelectorAll('[data-notif-id]').forEach((el) => {
            el.addEventListener('click', async (e) => {
                e.preventDefault();
                const id = el.getAttribute('data-notif-id');
                const destino = el.getAttribute('data-url');
                await marcarLida(id);
                if (destino) window.location.href = destino;
            });
        });
    }

    // Faixa de convite para ligar o push — só aparece enquanto faz sentido.
    function renderFaixaPush() {
        if (!pushSuportado()) return '';

        if (ehIosNaoInstalado()) {
            return (
                '<div class="notif-faixa notif-faixa-info">' +
                '<span class="notif-faixa-ico">📲</span>' +
                '<div><strong>Instale o CORTEX na tela inicial</strong>' +
                '<span>No iPhone, o push só funciona com o app instalado. Toque em Compartilhar → Adicionar à Tela de Início.</span></div>' +
                '</div>'
            );
        }

        if (Notification.permission === 'granted') return '';

        if (Notification.permission === 'denied') {
            return (
                '<div class="notif-faixa notif-faixa-alerta">' +
                '<span class="notif-faixa-ico">🔕</span>' +
                '<div><strong>Notificações bloqueadas</strong>' +
                '<span>Libere nas permissões do navegador (cadeado na barra de endereço) para receber avisos.</span></div>' +
                '</div>'
            );
        }

        return (
            '<div class="notif-faixa notif-faixa-cta">' +
            '<span class="notif-faixa-ico">🔔</span>' +
            '<div><strong>Ative os avisos neste aparelho</strong>' +
            '<span>Receba quando uma bateria fechar, mesmo com o CORTEX fechado.</span></div>' +
            '<button class="notif-btn-cta" data-acao="ativar-push">Ativar</button>' +
            '</div>'
        );
    }

    function renderItem(n) {
        const info = tipoInfo(n.tipo);
        const destino = urlDestino(n);
        return (
            '<button class="notif-item' + (n.lida_em ? '' : ' nao-lida') + '"' +
            ' data-notif-id="' + escapeAttr(n.id) + '"' +
            (destino ? ' data-url="' + escapeAttr(destino) + '"' : '') +
            '>' +
            '<span class="notif-item-ico" style="background:' + info.gradiente + ';">' + info.emoji + '</span>' +
            '<span class="notif-item-corpo">' +
            '<span class="notif-item-titulo">' + escapeHtml(n.titulo) + '</span>' +
            (n.corpo ? '<span class="notif-item-texto">' + escapeHtml(n.corpo) + '</span>' : '') +
            '<span class="notif-item-tempo">' + tempoRelativo(n.created_at) + '</span>' +
            '</span>' +
            (n.lida_em ? '' : '<span class="notif-item-ponto" style="background:' + info.cor + ';"></span>') +
            '</button>'
        );
    }

    // ────────────────────────────────────────────────────────────────────────
    // Helpers
    // ────────────────────────────────────────────────────────────────────────
    function tempoRelativo(iso) {
        if (!iso) return '';
        const d = new Date(iso);
        const seg = Math.floor((Date.now() - d.getTime()) / 1000);
        if (seg < 60) return 'agora';
        if (seg < 3600) return 'há ' + Math.floor(seg / 60) + ' min';
        if (seg < 86400) {
            const h = Math.floor(seg / 3600);
            return 'há ' + h + (h === 1 ? ' hora' : ' horas');
        }
        if (seg < 604800) {
            const dias = Math.floor(seg / 86400);
            return 'há ' + dias + (dias === 1 ? ' dia' : ' dias');
        }
        return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
    }

    function escapeHtml(t) {
        if (t == null) return '';
        const d = document.createElement('div');
        d.textContent = String(t);
        return d.innerHTML;
    }

    function escapeAttr(t) {
        return escapeHtml(t).replace(/"/g, '&quot;');
    }

    // ────────────────────────────────────────────────────────────────────────
    // Início
    // ────────────────────────────────────────────────────────────────────────
    async function iniciar() {
        if (state.iniciado) return;
        if (!window.cortexClient || !window.cortexProfissional) return;
        state.iniciado = true;

        montarSino();
        await carregar();
        assinarRealtime();
        revalidarPushSilencioso();

        // Volta de segundo plano: recarrega para pegar o que chegou fora do ar.
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') carregar();
        });
    }

    return { iniciar, carregar, ativarPush, abrirPainel, fecharPainel };
})();

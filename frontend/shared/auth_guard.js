// ============================================================================
// CORTEX_APP — Auth Guard (Sprint 37 — anti-loop)
// ============================================================================
// Inclua este script em todas as páginas que exigem login.
// Se o usuário não estiver autenticado, redireciona para a tela de login.
//
// SPRINT 37 — Mudanças anti-loop:
//   1. Antes de redirecionar para o login, SEMPRE chama signOut() pra
//      limpar a sessão. Sem isso, auth.js (no index) detecta a sessão
//      residual e redireciona de volta pra dashboard → loop ("pisca").
//
//   2. Detecta sessão de paciente (user_metadata.paciente_id presente)
//      e força signOut + redirect, sem nem tentar buscar em `profissionais`.
//      Isso elimina o erro `PGRST116` que antes derrubava no catch.
// ============================================================================

(async function() {
    'use strict';

    if (!window.cortexClient) {
        console.error('CORTEX_APP: cortexClient não inicializado.');
        return;
    }

    // Calcula o caminho relativo até a raiz
    // (assume que estamos em alguma subpasta como /pacientes/)
    // Base ABSOLUTA da pasta /frontend/ a partir da URL atual (robusto contra
    // caminhos estranhos). Evita empilhar "frontend/" em loop no redirect.
    // Mesma técnica de sidebar.js / notificacoes.js.
    const path = window.location.pathname;
    const idxFront = path.indexOf('/frontend/');
    const caminhoRaiz = idxFront >= 0
        ? path.substring(0, idxFront + '/frontend/'.length)  // ex.: '/frontend/'
        : '/';

    // Helper: limpa a sessão e redireciona pro login. SEM chamar signOut
    // antes do redirect, o auth.js do index re-detecta a sessão residual
    // e devolve pra dashboard → loop.
    async function redirecionarParaLogin(motivo) {
        try {
            await window.cortexClient.auth.signOut();
        } catch (e) {
            console.warn('signOut falhou:', e);
        }
        // Pequena espera pra garantir que o storage foi limpo antes do reload
        setTimeout(() => {
            window.location.href = caminhoRaiz + 'index.html';
        }, 50);
    }

    // ── Sprint 81: logout por inatividade (15 min) ──────────────────────────
    function iniciarMonitorInatividade(raiz) {
        const LIMITE = 15 * 60 * 1000;          // 15 minutos
        const KEY = 'cortex_last_activity';
        const ultima = () => {
            const v = sessionStorage.getItem(KEY);
            return v ? parseInt(v, 10) : Date.now();
        };
        const marcar = () => { try { sessionStorage.setItem(KEY, String(Date.now())); } catch (e) {} };

        async function sairPorInatividade() {
            try { await window.cortexClient.auth.signOut(); } catch (e) {}
            try { sessionStorage.removeItem(KEY); } catch (e) {}
            window.location.href = raiz + 'index.html?timeout=1';
        }

        // Se já estourou o limite enquanto a página carregava, sai já
        if (Date.now() - ultima() >= LIMITE) { sairPorInatividade(); return; }
        marcar();

        let ultimaMarca = 0;
        const aoInteragir = () => {
            const n = Date.now();
            if (n - ultimaMarca > 5000) { ultimaMarca = n; marcar(); } // throttle 5s
        };
        ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click']
            .forEach(ev => window.addEventListener(ev, aoInteragir, { passive: true }));

        setInterval(() => {
            if (Date.now() - ultima() >= LIMITE) sairPorInatividade();
        }, 30000); // checa a cada 30s
    }

    try {
        const { data: { session }, error } = await window.cortexClient.auth.getSession();

        if (error) throw error;

        if (!session) {
            // Não autenticado: redireciona para login (sem signOut, não tem sessão)
            window.location.href = caminhoRaiz + 'index.html';
            return;
        }

        // ─── Bloqueio de sessão de PACIENTE no sistema profissional ────────
        // Pacientes têm `paciente_id` em user_metadata. Se aparecer aqui, é
        // sessão do portal vazando — limpa e manda pro login do sistema.
        const meta = session.user?.user_metadata || {};
        if (meta.paciente_id) {
            console.warn('CORTEX_APP: sessão de paciente detectada no sistema profissional. Limpando.');
            await redirecionarParaLogin('sessao_paciente');
            return;
        }

        // Sessão válida — armazena info do usuário globalmente
        window.cortexUser = session.user;

        // ── Sprint 81: cache do perfil pra navegação rápida ────────────────
        // Evita uma query ao banco a cada troca de aba. Validade curta (5 min)
        // pra não ficar stale. Em sessionStorage → some ao fechar a aba.
        const CACHE_KEY = 'cortex_prof_' + session.user.id;
        const CACHE_TTL = 5 * 60 * 1000;
        let profissional = null;
        try {
            const c = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null');
            if (c && c.dados && (Date.now() - c.ts) < CACHE_TTL) profissional = c.dados;
        } catch (e) { /* cache inválido: ignora e busca no banco */ }

        if (!profissional) {
            const { data, error: profError } = await window.cortexClient
                .from('profissionais')
                .select('id, nome_completo, email, perfil, foto_url')
                .eq('auth_user_id', session.user.id)
                .maybeSingle(); // 0 linhas = null (sem erro), não levanta PGRST116

            if (profError) throw profError;

            if (!data) {
                // Sessão de auth.users válida mas SEM vínculo em `profissionais`.
                console.error('Profissional não encontrado para auth_user_id:', session.user.id);
                await redirecionarParaLogin('sem_vinculo_profissional');
                return;
            }
            profissional = data;
            try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), dados: profissional })); } catch (e) {}
        }

        // ── Acesso de suporte técnico (só quem está em acesso_suporte, no banco) ──
        // O suporte tem o "ver como": o banco passa a responder como a pessoa
        // escolhida (current_profissional_id e current_perfil). Aqui a tela também
        // vira a dela e nada é gravado. A pergunta ao banco é pequena e é feita
        // em toda tela (sem guardar resposta, para valer na hora em que o acesso é dado).
        {
            let sup = null;
            try {
                const { data, error } = await window.cortexClient.rpc('suporte_estado');
                if (error) console.warn('[suporte] suporte_estado:', error.message);
                sup = data || null;
            } catch (e) { console.warn('[suporte] suporte_estado indisponível:', e); }
            if (sup && sup.suporte) {
                window.cortexSuporte = true;
                window.cortexProfissionalReal = profissional;
                const vc = sup.ver_como;
                if (vc && vc.ativo && vc.alvo && vc.alvo.id) {
                    window.cortexVerComo = vc;
                    profissional = vc.alvo;
                    ativarSoLeitura();
                    if (/\/chat\//.test(path)) { bloquearChat(); return; }
                }
                carregarSuporte(caminhoRaiz);
            }
        }

        // ── Profissional externo: só pacientes, resultados, laudo e chat ──
        if (profissional && profissional.perfil === 'profissional_externo') {
            const rel = path.substring(caminhoRaiz.length);
            const permitido = /^(pacientes\/(lista|pasta)\.html|chat\/|correcao\/|laudo-online\/)/.test(rel);
            if (!permitido) {
                window.location.replace(caminhoRaiz + 'pacientes/lista.html');
                return;
            }
        }

        window.cortexProfissional = profissional;

        // Marca que auth está pronto (flag persistente)
        window.cortexAuthReady = true;
        window.cortexAuthDetail = { profissional, session };

        // Dispara evento para que a página possa reagir
        window.dispatchEvent(new CustomEvent('cortex:auth-ready', {
            detail: { profissional, session }
        }));

        // Sprint 81: monitor de inatividade (15 min → logout) — DESATIVADO a pedido.
        // Para religar, basta descomentar a linha abaixo.
        // iniciarMonitorInatividade(caminhoRaiz);
        void iniciarMonitorInatividade; // mantém a função referenciada (sem lint de "não usada")

    } catch (err) {
        console.error('Erro no auth guard:', err);
        await redirecionarParaLogin('erro_inesperado');
    }
})();

// ============================================================================
// Workaround robusto pra race condition: addEventListener('cortex:auth-ready', fn)
// dispara imediatamente se o auth já estiver pronto quando o listener é registrado.
//
// Isso protege todas as páginas que usam o evento sem precisar mudá-las.
// ============================================================================
(function patchAuthReadyListener() {
    const originalAdd = window.addEventListener.bind(window);
    window.addEventListener = function (type, listener, options) {
        if (type === 'cortex:auth-ready' && window.cortexAuthReady) {
            // Auth já passou: dispara o callback no próximo tick (assíncrono,
            // mantendo o comportamento esperado pelo código)
            Promise.resolve().then(() => {
                try {
                    const fakeEvent = new CustomEvent('cortex:auth-ready', {
                        detail: window.cortexAuthDetail || {}
                    });
                    if (typeof listener === 'function') {
                        listener(fakeEvent);
                    } else if (listener && typeof listener.handleEvent === 'function') {
                        listener.handleEvent(fakeEvent);
                    }
                } catch (e) {
                    console.error('Erro em listener de cortex:auth-ready:', e);
                }
            });
            return;
        }
        return originalAdd(type, listener, options);
    };
})();

// Helper alternativo: window.cortexOnAuthReady(async (detail) => { ... })
window.cortexOnAuthReady = function (callback) {
    if (window.cortexAuthReady) {
        Promise.resolve().then(() => callback(window.cortexAuthDetail || {}));
    } else {
        window.addEventListener('cortex:auth-ready', (ev) => callback(ev.detail || {}), { once: true });
    }
};

// ============================================================================
// SUPORTE / VER COMO — modo só leitura e carregamento da tela (shared/suporte.js)
// ============================================================================
// Enquanto o suporte vê o sistema como outra pessoa, tudo o que gravaria
// no banco é barrado aqui: insert/update/upsert/delete, rpcs que salvam,
// envio de arquivo e funções do servidor. Assim nada sai com o nome da outra
// pessoa. As leituras seguem normais (e o banco responde como ela).
function ativarSoLeitura() {
    const c = window.cortexClient;
    if (!c || c.__soLeitura) return;
    c.__soLeitura = true;
    const MSG = 'Você está vendo como outra pessoa: nada é salvo. Volte para o seu usuário para alterar.';
    let ultimoAviso = 0;
    const avisar = () => {
        const n = Date.now();
        if (n - ultimoAviso < 2500) return;
        ultimoAviso = n;
        if (window.CortexUI && window.CortexUI.toast) window.CortexUI.toast(MSG, 'info');
    };
    const resultado = () => ({ data: null, error: { message: MSG, code: 'VER_COMO' } });
    // devolve algo que aceita os mesmos encadeamentos (.select().single()…) e termina em erro
    const barrado = () => {
        avisar();
        const r = resultado(), t = {};
        ['select', 'eq', 'neq', 'in', 'is', 'match', 'single', 'maybeSingle', 'order', 'limit', 'filter', 'not', 'or',
         'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'contains', 'range', 'returns', 'throwOnError', 'csv', 'abortSignal']
            .forEach(k => { t[k] = () => t; });
        t.then = (ok, ko) => Promise.resolve(r).then(ok, ko);
        t.catch = ko => Promise.resolve(r).catch(ko);
        return t;
    };
    const from0 = c.from.bind(c);
    c.from = function (tabela) {
        const q = from0(tabela);
        ['insert', 'update', 'upsert', 'delete'].forEach(m => { q[m] = barrado; });
        return q;
    };
    const ESCRITA = /(salvar|criar|inserir|atualizar|alterar|editar|excluir|apagar|deletar|remover|registrar|gravar|marcar|enviar|aprovar|negar|revogar|vincular|finalizar|liberar|gerar|cadastrar|importar|reabrir|arquivar|mover|aceitar|recusar|definir|trocar|confirmar|cancelar|corrigir|calcular|upsert|insert|update|delete|set_|add_|novo|nova)/i;
    const rpc0 = c.rpc.bind(c);
    c.rpc = function (nome, args, opts) {
        if (!/^ver_como_/.test(nome) && ESCRITA.test(nome)) return barrado();
        return rpc0(nome, args, opts);
    };
    try {
        const st = c.storage, stFrom = st.from.bind(st);
        st.from = function (b) {
            const x = stFrom(b);
            ['upload', 'update', 'remove', 'move', 'copy', 'uploadToSignedUrl'].forEach(m => { x[m] = async () => { avisar(); return resultado(); }; });
            return x;
        };
        Object.defineProperty(c, 'storage', { value: st, configurable: true });
    } catch (e) { /* storage indisponível */ }
    try {
        const fn = c.functions;
        fn.invoke = async () => { avisar(); return resultado(); };
        Object.defineProperty(c, 'functions', { value: fn, configurable: true });
    } catch (e) { /* functions indisponível */ }
}

// O chat é pessoal: não abre no "ver como".
function bloquearChat() {
    const pintar = () => {
        document.body.innerHTML = `<div style="min-height:100vh;display:grid;place-items:center;padding:24px;font-family:Inter,system-ui,sans-serif;background:#F7F8FC;color:#0F172A;text-align:center">
            <div style="max-width:420px"><div style="font-size:34px">💬</div><h1 style="font-size:20px;margin:10px 0 6px">O chat não abre no modo “ver como”</h1>
            <p style="color:#475569;line-height:1.6;margin:0 0 18px">As conversas são pessoais. Volte para o seu usuário para usar o chat.</p>
            <a href="../dashboard.html" style="display:inline-block;padding:10px 18px;border-radius:10px;background:#1F3864;color:#fff;text-decoration:none;font-weight:700">Ir para o início</a></div></div>`;
    };
    if (document.body) pintar(); else document.addEventListener('DOMContentLoaded', pintar);
}

// Carrega as ferramentas do suporte técnico: menu do nome e faixa "vendo como".
function carregarSuporte(raiz) {
    if (window.CortexVerComo || document.querySelector('script[data-cortex-suporte]')) return;
    const s = document.createElement('script');
    s.src = raiz + 'shared/suporte.js?v=sp2';
    s.setAttribute('data-cortex-suporte', '1');
    s.defer = true;
    (document.head || document.documentElement).appendChild(s);
}

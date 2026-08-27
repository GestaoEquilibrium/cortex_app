// ============================================================================
// CORTEX_APP — Sidebar Component
// ============================================================================
// Renderiza a sidebar lateral fixa com:
//  - Logo (ícone de cérebro) + nome CORTEX
//  - Botão de toggle (colapsa/expande)
//  - Itens de navegação com estado ativo
//  - Card do usuário no rodapé com botão de logout
//
// Uso em qualquer página autenticada:
//   <div id="sidebar-container"></div>
//   ...
//   <script src="../shared/sidebar.js"></script>
//   ...e no final:
//   CortexSidebar.render('pacientes'); // marca o item ativo
// ============================================================================

window.CortexSidebar = (function() {
    'use strict';

    const NAV_ITEMS = [
        {
            id: 'dashboard',
            labelCurto: 'Painel',
            accent: 'var(--accent-blue)',
            label: 'Dashboard',
            href: '../dashboard.html',
            icon: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'
        },
        {
            id: 'pacientes',
            accent: 'var(--accent-purple)',
            label: 'Pacientes',
            href: '../pacientes/lista.html',
            icon: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'
        },
        {
            id: 'agenda',
            accent: 'var(--accent-cyan)',
            label: 'Agenda',
            href: '../agenda/agenda.html',
            icon: '<rect x="3" y="4" width="18" height="18" rx="2.5"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>'
        },
        {
            id: 'graficos',
            accent: 'var(--accent-amber)',
            label: 'Gráficos',
            href: '../graficos/index.html',
            icon: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>'
        },
        {
            id: 'estoque',
            accent: 'var(--accent-green)',
            label: 'Estoque',
            href: '../estoque/estoque.html',
            adminOnly: true,
            icon: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>'
        },
        {
            id: 'relatorios',
            labelCurto: 'Relatórios',
            accent: 'var(--accent-pink)',
            label: 'Relatórios',
            href: '../relatorios/relatorios.html',
            adminOnly: true,
            icon: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>'
        },
        {
            id: 'auditoria',
            accent: 'var(--accent-green)',
            label: 'Auditoria',
            href: '../auditoria/auditoria.html',
            clinicoOnly: true,
            icon: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/>'
        },
        {
            id: 'ferramentas-laudo',
            labelCurto: 'Laudo',
            accent: 'var(--accent-purple-2)',
            label: 'Ferramentas de Laudo',
            href: '../ferramentas-laudo/ferramentas-laudo.html',
            adminOnly: true,
            icon: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>'
        },
        {
            id: 'configuracoes',
            labelCurto: 'Config.',
            accent: 'var(--accent-blue-2)',
            label: 'Configurações',
            href: '../configuracoes/configuracoes.html',
            clinicoOnly: true,
            icon: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'
        }
    ];

    // SVG do cérebro (estilo geométrico moderno)
    const BRAIN_SVG = `<svg class="sidebar-brand-icon" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
        <g stroke="currentColor" fill="currentColor" stroke-linecap="round">
            <line x1="16" y1="16" x2="9"  y2="9"  stroke-width="1"/>
            <line x1="16" y1="16" x2="23" y2="9"  stroke-width="1"/>
            <line x1="16" y1="16" x2="9"  y2="23" stroke-width="1"/>
            <line x1="16" y1="16" x2="23" y2="23" stroke-width="1"/>
            <line x1="16" y1="16" x2="16" y2="7"  stroke-width="1"/>
            <line x1="16" y1="16" x2="16" y2="25" stroke-width="1"/>
            <circle cx="16" cy="16" r="2.8"/>
            <circle cx="9"  cy="9"  r="1.6"/>
            <circle cx="23" cy="9"  r="1.6"/>
            <circle cx="9"  cy="23" r="1.6"/>
            <circle cx="23" cy="23" r="1.6"/>
            <circle cx="16" cy="7"  r="1.4"/>
            <circle cx="16" cy="25" r="1.4"/>
        </g>
    </svg>`;

    const CHEVRON_LEFT_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>`;
    const CLOSE_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    const MENU_SVG = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>`;
    const LOGOUT_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`;

    // ── Sprint 91: carrega a central de notificações sem precisar incluir
    // <script> em cada página. O sidebar.js já está em todas elas.
    function caminhoShared() {
        // Caminho absoluto de /frontend/shared/ a partir da URL atual.
        const p = window.location.pathname;
        const idx = p.indexOf('/frontend/');
        const base = idx >= 0 ? p.substring(0, idx + '/frontend/'.length) : '/frontend/';
        return base + 'shared/';
    }

    function carregarAsset(tag, attrs) {
        return new Promise((resolve) => {
            const el = document.createElement(tag);
            Object.keys(attrs).forEach(k => el.setAttribute(k, attrs[k]));
            el.onload = () => resolve(true);
            el.onerror = () => resolve(false);
            document.head.appendChild(el);
        });
    }

    // ── v2.0 "Aurora": carrega a camada visual e o sistema de janelas
    // suspensas em TODAS as páginas, sem precisar editar cada HTML.
    const V2 = '200';

    function iniciarV2() {
        const base = caminhoShared();
        const baseStyles = base.replace(/shared\/$/, 'styles/');

        if (!document.querySelector('link[data-cortex-v2-css]')) {
            const l = document.createElement('link');
            l.rel = 'stylesheet';
            l.href = baseStyles + 'cortex-v2.css?v=' + V2;
            l.setAttribute('data-cortex-v2-css', '1');
            document.head.appendChild(l);
        }

        if (!document.querySelector('link[data-cortex-mobile-css]')) {
            const m = document.createElement('link');
            m.rel = 'stylesheet';
            m.href = baseStyles + 'mobile-v2.css?v=' + V2;
            m.setAttribute('data-cortex-mobile-css', '1');
            document.head.appendChild(m);
        }

        if (!window.CortexPop && !document.querySelector('script[data-cortex-pop-js]')) {
            const sc = document.createElement('script');
            sc.src = base + 'cortex_pop.js?v=' + V2;
            sc.setAttribute('data-cortex-pop-js', '1');
            document.head.appendChild(sc);
        }

        // PWA: metas, splash do iOS, modo app e service worker de estáticos.
        if (!window.CortexPWA && !document.querySelector('script[data-cortex-pwa-js]')) {
            const pw = document.createElement('script');
            pw.src = base + 'pwa.js?v=' + V2;
            pw.setAttribute('data-cortex-pwa-js', '1');
            document.head.appendChild(pw);
        }
    }

    // Roda já no parse do arquivo — evita piscar o visual antigo.
    try { iniciarV2(); } catch (e) { console.warn('[sidebar] v2 indisponível:', e); }

    async function iniciarNotificacoes() {
        try {
            const base = caminhoShared();

            if (!document.querySelector('link[data-cortex-notif-css]')) {
                await carregarAsset('link', {
                    rel: 'stylesheet',
                    href: base + 'notificacoes.css?v=911',
                    'data-cortex-notif-css': '1'
                });
            }

            if (!window.CortexNotificacoes) {
                const ok = await carregarAsset('script', {
                    src: base + 'notificacoes.js?v=911',
                    'data-cortex-notif-js': '1'
                });
                if (!ok) return;
            }

            if (window.CortexNotificacoes) {
                await window.CortexNotificacoes.iniciar();
            }
        } catch (err) {
            // Notificação nunca pode derrubar a navegação do sistema.
            console.warn('[sidebar] notificações indisponíveis:', err.message || err);
        }
    }

    function pegarIniciais(nome) {
        if (!nome) return '?';
        const partes = nome.trim().split(/\s+/);
        if (partes.length === 1) return partes[0].substring(0, 2).toUpperCase();
        return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
    }

    // ── FIX v2.0 ────────────────────────────────────────────────────────────
    // Antes o link era montado contando "../" pela profundidade da URL. Isso
    // quebra no Cloudflare Pages, que serve /pasta/index.html como /pasta/ —
    // sem o nome do arquivo a conta dava um nivel a menos, o "../" era
    // removido e o link virava /frontend/graficos/auditoria/... (404). O 404
    // cai no index.html da raiz, que redirecionava de forma relativa, e a URL
    // ia empilhando /frontend/frontend/frontend/ em loop.
    //
    // Agora o link e sempre ABSOLUTO, ancorado na pasta /frontend/ da URL
    // atual — mesma tecnica ja usada pelo auth_guard.js. Funciona em qualquer
    // profundidade, com ou sem index.html no fim, e no app Tauri.
    function baseFrontend() {
        const p = window.location.pathname;
        const idx = p.indexOf('/frontend/');
        return idx >= 0 ? p.substring(0, idx + '/frontend/'.length) : null;
    }

    function getRelativePath(itemHref) {
        const base = baseFrontend();

        if (base) {
            // '../pacientes/lista.html' -> '/frontend/pacientes/lista.html'
            return base + String(itemHref).replace(/^(?:\.\.\/)+/, '');
        }

        // Fallback (fora de /frontend/, ex.: abrindo o arquivo solto):
        // mantem o comportamento relativo antigo.
        const segmentos = window.location.pathname.split('/').filter(s => s);
        const profundidade = Math.max(0, segmentos.length - 1);
        const diff = profundidade - 1;

        if (diff === 0) return itemHref;
        if (diff < 0) return itemHref.startsWith('../') ? itemHref.substring(3) : itemHref;
        return '../'.repeat(diff) + itemHref;
    }

    async function render(itemAtivoId) {
        const container = document.getElementById('sidebar-container');
        if (!container) {
            console.error('CortexSidebar: elemento #sidebar-container não encontrado.');
            return;
        }

        // Aguarda o profissional estar carregado pelo auth_guard
        if (!window.cortexProfissional) {
            await new Promise(resolve => {
                window.addEventListener('cortex:auth-ready', resolve, { once: true });
            });
        }

        const prof = window.cortexProfissional;
        const nomeExibido = prof.nome_completo || prof.email;
        const iniciais = pegarIniciais(nomeExibido);
        const perfilLabel = (window.CortexUI && window.CortexUI.PERFIL_LABELS[prof.perfil]) || prof.perfil;

        // Busca URL assinada da foto do profissional logado (se existir)
        let fotoSignedUrl = null;
        if (prof.foto_url) {
            try {
                const { data } = await window.cortexClient
                    .storage
                    .from('profissionais-fotos')
                    .createSignedUrl(prof.foto_url, 600);
                fotoSignedUrl = data?.signedUrl || null;
            } catch (_) {
                fotoSignedUrl = null;
            }
        }

        const avatarHtml = fotoSignedUrl
            ? `<div class="sidebar-user-avatar sidebar-user-avatar-foto"><img src="${fotoSignedUrl}" alt="${escapeHtml(nomeExibido)}"/></div>`
            : `<div class="sidebar-user-avatar">${iniciais}</div>`;

        // ── v2.0: estado da sidebar — 'expandida' | 'rail' | 'oculta' ──
        // Retrocompat: se ainda existir a chave antiga, converte.
        let estado = localStorage.getItem('cortex_sidebar_estado');
        if (!estado) {
            estado = localStorage.getItem('cortex_sidebar_collapsed') === 'true' ? 'rail' : 'expandida';
            localStorage.setItem('cortex_sidebar_estado', estado);
        }
        const colapsada = (estado === 'rail');
        const oculta = (estado === 'oculta');

        // Filtra itens com restrição de perfil (Sprint 74/78)
        const ehAdmin = (prof?.perfil === 'admin_clinico' || prof?.perfil === 'admin_gestor');
        const ehClinico = (prof?.perfil === 'admin_clinico');
        const itensVisiveis = NAV_ITEMS.filter(item => {
            if (item.adminOnly && !ehAdmin) return false;       // relatórios: clínico + gestor
            if (item.clinicoOnly && !ehClinico) return false;   // configurações: só clínico
            return true;
        });

        const navHtml = itensVisiveis.map(item => {
            const ativa = item.id === itemAtivoId ? 'active' : '';
            const hrefFinal = item.disabled ? item.href : getRelativePath(item.href);
            const onclick = item.disabled
                ? `onclick="event.preventDefault(); ${item.disabledLabel ? `window.CortexUI && window.CortexUI.toast('${item.disabledLabel}', 'info');` : ''} return false;"`
                : '';
            return `
                <a href="${hrefFinal}" class="nav-item ${ativa}" ${onclick} title="${item.label}" data-nav="${item.id}" style="--nav-accent: ${item.accent || 'var(--accent-blue)'}">
                    <svg class="nav-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${item.icon}</svg>
                    <span class="sidebar-text">${item.label}</span>
                </a>
            `;
        }).join('');

        // ── Sprint pwa_mobile: topbar + backdrop (visíveis só no mobile via CSS) ──
        if (!document.getElementById('cortex-topbar')) {
            const topbar = document.createElement('header');
            topbar.id = 'cortex-topbar';
            topbar.className = 'cortex-topbar';
            topbar.innerHTML = `
                <button class="topbar-menu-btn" id="topbar-menu-btn" title="Menu" aria-label="Abrir menu">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
                </button>
                <div class="topbar-brand">
                    ${BRAIN_SVG.replace('sidebar-brand-icon', 'topbar-brand-icon')}
                    <span>CORTEX</span>
                </div>
            `;
            document.body.insertBefore(topbar, document.body.firstChild);
        }
        // ── Sprint pwa_v2: barra inferior de navegação (só no celular) ──
        // Reaproveita a mesma lista já filtrada por perfil. Até 5 itens cabem
        // na barra; acima disso mostramos 4 + "Mais", que abre a gaveta.
        if (!document.getElementById('cortex-tabbar')) {
            const cabe = itensVisiveis.length <= 5;
            const principais = cabe ? itensVisiveis : itensVisiveis.slice(0, 4);

            const MAIS_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>';

            const itensHtml = principais.map(item => {
                const ativa = item.id === itemAtivoId ? 'active' : '';
                const hrefFinal = item.disabled ? '#' : getRelativePath(item.href);
                const rotulo = item.labelCurto || item.label;
                return `
                    <a href="${hrefFinal}" class="tabbar-item ${ativa}" data-nav="${item.id}"
                       style="--tab-accent: ${item.accent || 'var(--accent-blue)'}"
                       aria-label="${item.label}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${item.icon}</svg>
                        <span class="tabbar-label">${rotulo}</span>
                    </a>
                `;
            }).join('');

            const maisHtml = cabe ? '' : `
                <button class="tabbar-item" id="tabbar-mais" style="--tab-accent: var(--accent-purple)" aria-label="Mais opções">
                    ${MAIS_SVG}
                    <span class="tabbar-label">Mais</span>
                </button>
            `;

            const tabbar = document.createElement('nav');
            tabbar.id = 'cortex-tabbar';
            tabbar.className = 'cortex-tabbar';
            tabbar.innerHTML = itensHtml + maisHtml;
            document.body.appendChild(tabbar);
        }

        // ── v2.0: botão flutuante que reabre a sidebar quando está oculta ──
        if (!document.getElementById('sidebar-fab')) {
            const fab = document.createElement('button');
            fab.id = 'sidebar-fab';
            fab.className = 'sidebar-fab' + (oculta ? ' show' : '');
            fab.title = 'Abrir menu';
            fab.setAttribute('aria-label', 'Abrir menu');
            fab.innerHTML = MENU_SVG;
            document.body.appendChild(fab);
        }

        if (!document.getElementById('sidebar-backdrop')) {
            const backdrop = document.createElement('div');
            backdrop.id = 'sidebar-backdrop';
            backdrop.className = 'sidebar-backdrop';
            document.body.appendChild(backdrop);
        }

        container.innerHTML = `
            <aside class="sidebar ${colapsada ? 'collapsed' : ''} ${oculta ? 'is-hidden' : ''}" id="cortex-sidebar">
                <div class="sidebar-brand">
                    ${BRAIN_SVG}
                    <span class="sidebar-brand-text sidebar-text">CORTEX</span>
                    <div class="sidebar-actions">
                        <button class="sidebar-toggle" id="sidebar-toggle-btn" title="Minimizar / expandir" aria-label="Minimizar menu">
                            ${CHEVRON_LEFT_SVG}
                        </button>
                        <button class="sidebar-close" id="sidebar-close-btn" title="Fechar menu" aria-label="Fechar menu">
                            ${CLOSE_SVG}
                        </button>
                    </div>
                </div>

                <nav class="sidebar-nav">
                    ${navHtml}
                </nav>

                <div class="sidebar-user">
                    ${avatarHtml}
                    <div class="sidebar-user-info">
                        <div class="sidebar-user-name">${escapeHtml(nomeExibido)}</div>
                        <div class="sidebar-user-perfil">${escapeHtml(perfilLabel)}</div>
                    </div>
                    <button class="sidebar-user-logout" id="sidebar-logout-btn" title="Sair">
                        ${LOGOUT_SVG}
                    </button>
                </div>
            </aside>
        `;

        setupEventos();

        // Sprint 91 — sino de notificações (não bloqueia o render da sidebar)
        iniciarNotificacoes();
    }

    function setupEventos() {
        const toggleBtn = document.getElementById('sidebar-toggle-btn');
        const sidebar = document.getElementById('cortex-sidebar');
        const logoutBtn = document.getElementById('sidebar-logout-btn');

        // ── Sprint pwa_mobile: gaveta (drawer) ──
        const menuBtn = document.getElementById('topbar-menu-btn');
        const backdrop = document.getElementById('sidebar-backdrop');

        function abrirGaveta() {
            if (!sidebar) return;
            sidebar.classList.add('mobile-open');
            if (backdrop) backdrop.classList.add('show');
            document.body.classList.add('sidebar-aberta');
        }

        function fecharGaveta() {
            if (!sidebar) return;
            sidebar.classList.remove('mobile-open');
            if (backdrop) backdrop.classList.remove('show');
            document.body.classList.remove('sidebar-aberta');
        }

        if (menuBtn) {
            menuBtn.addEventListener('click', () => {
                if (sidebar && sidebar.classList.contains('mobile-open')) fecharGaveta();
                else abrirGaveta();
            });
        }

        if (backdrop) backdrop.addEventListener('click', fecharGaveta);

        // Barra inferior: o botão "Mais" abre a mesma gaveta lateral.
        const tabMais = document.getElementById('tabbar-mais');
        if (tabMais) tabMais.addEventListener('click', abrirGaveta);

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') fecharGaveta();
        });

        // Navegar fecha a gaveta (a página muda, mas evita flash em voltar/cache)
        if (sidebar) {
            sidebar.querySelectorAll('.nav-item').forEach(a => {
                a.addEventListener('click', fecharGaveta);
            });
        }

        // ── v2.0: três estados — expandida / rail / oculta ──
        const closeBtn = document.getElementById('sidebar-close-btn');
        const fab = document.getElementById('sidebar-fab');

        function aplicarEstado(novo) {
            if (!sidebar) return;
            sidebar.classList.toggle('collapsed', novo === 'rail');
            sidebar.classList.toggle('is-hidden', novo === 'oculta');
            if (fab) fab.classList.toggle('show', novo === 'oculta');
            localStorage.setItem('cortex_sidebar_estado', novo);
            // mantém a chave antiga em dia (outras telas podem ler)
            localStorage.setItem('cortex_sidebar_collapsed', novo === 'rail' ? 'true' : 'false');
            window.dispatchEvent(new CustomEvent('cortex:sidebar-estado', { detail: { estado: novo } }));
        }

        function estadoAtual() {
            if (!sidebar) return 'expandida';
            if (sidebar.classList.contains('is-hidden')) return 'oculta';
            if (sidebar.classList.contains('collapsed')) return 'rail';
            return 'expandida';
        }

        if (toggleBtn && sidebar) {
            toggleBtn.addEventListener('click', () => {
                aplicarEstado(estadoAtual() === 'rail' ? 'expandida' : 'rail');
            });
        }

        if (closeBtn && sidebar) {
            closeBtn.addEventListener('click', () => aplicarEstado('oculta'));
        }

        if (fab) {
            fab.addEventListener('click', () => {
                aplicarEstado('expandida');
                if (window.innerWidth <= 900) abrirGaveta();
            });
        }

        // Atalho: Ctrl/Cmd + B alterna o menu
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
                e.preventDefault();
                aplicarEstado(estadoAtual() === 'oculta' ? 'expandida' : 'oculta');
            }
        });

        if (logoutBtn) {
            logoutBtn.addEventListener('click', async () => {
                if (window.CortexAudit) {
                    await window.CortexAudit.log('logout', 'auth.users');
                }
                if (window.cortexClient) {
                    await window.cortexClient.auth.signOut();
                }
                // Usa o mesmo helper de path relativo para funcionar em qualquer profundidade
                window.location.href = getRelativePath('../index.html');
            });
        }
    }

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    return { render };
})();
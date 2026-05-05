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
            label: 'Dashboard',
            href: '../dashboard.html',
            icon: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'
        },
        {
            id: 'pacientes',
            label: 'Pacientes',
            href: '../pacientes/lista.html',
            icon: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'
        },
        {
            id: 'agenda',
            label: 'Agenda',
            href: '../agenda/agenda.html',
            icon: '<rect x="3" y="4" width="18" height="18" rx="2.5"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>'
        },
        {
            id: 'relatorios',
            label: 'Relatórios',
            href: '#',
            disabled: true,
            disabledLabel: 'Em breve',
            icon: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>'
        },
        {
            id: 'configuracoes',
            label: 'Configurações',
            href: '#',
            disabled: true,
            disabledLabel: 'Em breve',
            icon: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'
        }
    ];

    // SVG do cérebro (estilo geométrico moderno)
    const BRAIN_SVG = `<svg class="sidebar-brand-icon" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <path d="M16 5 C11 5, 7 8, 6.5 12.5 C5 13, 4 14.5, 4 16.5 C4 18.5, 5 20, 6.5 20.5 C7 24, 9.5 26, 12 26.5 L12 22 C10.5 22, 9 21, 9 19"/>
        <path d="M16 5 C21 5, 25 8, 25.5 12.5 C27 13, 28 14.5, 28 16.5 C28 18.5, 27 20, 25.5 20.5 C25 24, 22.5 26, 20 26.5 L20 22 C21.5 22, 23 21, 23 19"/>
        <line x1="16" y1="5" x2="16" y2="28"/>
        <path d="M11 11 C12 12, 13 12, 14 11"/>
        <path d="M18 11 C19 12, 20 12, 21 11"/>
        <line x1="10" y1="16" x2="13" y2="16"/>
        <line x1="19" y1="16" x2="22" y2="16"/>
        <path d="M11 21 C12 22, 13 22, 14 21"/>
        <path d="M18 21 C19 22, 20 22, 21 21"/>
    </svg>`;

    const CHEVRON_LEFT_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>`;
    const LOGOUT_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`;

    function pegarIniciais(nome) {
        if (!nome) return '?';
        const partes = nome.trim().split(/\s+/);
        if (partes.length === 1) return partes[0].substring(0, 2).toUpperCase();
        return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
    }

    function getRelativePath(itemHref) {
        // Sidebar.js está em shared/, mas as páginas que a usam estão em pacientes/
        // Por simplicidade: assumimos que as páginas autenticadas estão em frontend/pacientes/
        // Os links são relativos a pacientes/
        return itemHref;
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

        // Recupera estado de colapso (preferência salva)
        const colapsada = localStorage.getItem('cortex_sidebar_collapsed') === 'true';

        // Detecta se estamos na raiz (/dashboard.html, /index.html) ou em subpasta
        // Se o pathname tiver mais de uma '/' antes do arquivo final, estamos em subpasta
        const path = window.location.pathname;
        const segments = path.split('/').filter(s => s.length > 0);
        // segments inclui o nome do arquivo. Se for ['dashboard.html'] = raiz; se for ['pacientes', 'lista.html'] = subpasta
        const naRaiz = segments.length <= 1;

        const navHtml = NAV_ITEMS.map(item => {
            const ativa = item.id === itemAtivoId ? 'active' : '';
            const onclick = item.disabled
                ? `onclick="event.preventDefault(); ${item.disabledLabel ? `window.CortexUI && window.CortexUI.toast('${item.disabledLabel}', 'info');` : ''} return false;"`
                : '';
            // Ajusta href: se estamos na raiz e o link começa com '../', remove o '../'
            let href = item.href;
            if (naRaiz && href.startsWith('../')) {
                href = href.replace(/^\.\.\//, '');
            }
            return `
                <a href="${href}" class="nav-item ${ativa}" ${onclick} title="${item.label}">
                    <svg class="nav-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${item.icon}</svg>
                    <span class="sidebar-text">${item.label}</span>
                </a>
            `;
        }).join('');

        container.innerHTML = `
            <aside class="sidebar ${colapsada ? 'collapsed' : ''}" id="cortex-sidebar">
                <div class="sidebar-brand">
                    ${BRAIN_SVG}
                    <span class="sidebar-brand-text sidebar-text">CORTEX</span>
                    <button class="sidebar-toggle" id="sidebar-toggle-btn" title="Recolher / expandir">
                        ${CHEVRON_LEFT_SVG}
                    </button>
                </div>

                <nav class="sidebar-nav">
                    ${navHtml}
                </nav>

                <div class="sidebar-user">
                    <div class="sidebar-user-avatar">${iniciais}</div>
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
    }

    function setupEventos() {
        const toggleBtn = document.getElementById('sidebar-toggle-btn');
        const sidebar = document.getElementById('cortex-sidebar');
        const logoutBtn = document.getElementById('sidebar-logout-btn');

        if (toggleBtn && sidebar) {
            toggleBtn.addEventListener('click', () => {
                sidebar.classList.toggle('collapsed');
                localStorage.setItem(
                    'cortex_sidebar_collapsed',
                    sidebar.classList.contains('collapsed') ? 'true' : 'false'
                );
            });
        }

        if (logoutBtn) {
            logoutBtn.addEventListener('click', async () => {
                if (window.CortexAudit) {
                    await window.CortexAudit.log('logout', 'auth.users');
                }
                if (window.cortexClient) {
                    await window.cortexClient.auth.signOut();
                }
                window.location.href = '../index.html';
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
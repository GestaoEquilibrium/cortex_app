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
            id: 'graficos',
            label: 'Gráficos',
            href: '../graficos/index.html',
            icon: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>'
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
            href: '../configuracoes/configuracoes.html',
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
    const LOGOUT_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`;

    function pegarIniciais(nome) {
        if (!nome) return '?';
        const partes = nome.trim().split(/\s+/);
        if (partes.length === 1) return partes[0].substring(0, 2).toUpperCase();
        return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
    }

    function getRelativePath(itemHref) {
        // Os hrefs em NAV_ITEMS estão escritos como se a página atual fosse 1 nível abaixo de frontend/
        // Ex: '../pacientes/lista.html' — funciona quando estou em frontend/agenda/agenda.html
        //
        // Mas o sistema tem páginas em vários níveis:
        //   nível 0: frontend/dashboard.html        → precisa REMOVER 1× ../
        //   nível 1: frontend/pacientes/lista.html  → MANTÉM como está (referência)
        //   nível 2: frontend/correcao/wisciv/...   → precisa ADICIONAR 1× ../
        //   nível 3+: idem, adicionar ../ proporcional
        //
        // Estratégia: descobre a profundidade da página atual em relação a frontend/
        // e ajusta os ../ no href dinamicamente.

        const path = window.location.pathname;
        const segmentos = path.split('/').filter(s => s);

        // Acha o índice da pasta 'frontend' no path. Se não tiver, assume raiz.
        const idxFrontend = segmentos.indexOf('frontend');
        const profundidade = idxFrontend >= 0
            ? Math.max(0, segmentos.length - idxFrontend - 2)  // -1 pra contar de zero, -1 pra ignorar o arquivo
            : 0;

        // Os hrefs no NAV_ITEMS assumem profundidade 1 (vão de subpasta pra outra subpasta via ../)
        // - profundidade 0: tira 1× '../'
        // - profundidade 1: mantém igual (referência)
        // - profundidade 2: adiciona 1× '../'
        // - profundidade N: adiciona (N-1)× '../'
        const diff = profundidade - 1;

        if (diff === 0) return itemHref;

        if (diff < 0) {
            // Está mais raso que a referência: remove ../ do começo
            return itemHref.startsWith('../') ? itemHref.substring(3) : itemHref;
        }

        // Está mais fundo: adiciona ../ extras no começo
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

        // Recupera estado de colapso (preferência salva)
        const colapsada = localStorage.getItem('cortex_sidebar_collapsed') === 'true';

        const navHtml = NAV_ITEMS.map(item => {
            const ativa = item.id === itemAtivoId ? 'active' : '';
            const hrefFinal = item.disabled ? item.href : getRelativePath(item.href);
            const onclick = item.disabled
                ? `onclick="event.preventDefault(); ${item.disabledLabel ? `window.CortexUI && window.CortexUI.toast('${item.disabledLabel}', 'info');` : ''} return false;"`
                : '';
            return `
                <a href="${hrefFinal}" class="nav-item ${ativa}" ${onclick} title="${item.label}">
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
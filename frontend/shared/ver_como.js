/* ============================================================================
   CORTEX · Ver como  (frontend/shared/ver_como.js)
   ----------------------------------------------------------------------------
   O admin clínico clica no próprio nome na sidebar e escolhe outra pessoa:
   o sistema inteiro passa a aparecer como ela vê (menu, permissões e dados,
   porque o banco responde como ela — ver_como_iniciar no SQL).
   Só leitura: o auth_guard.js barra tudo o que gravaria. O chat não abre.
   A sessão termina sozinha em 2 horas, ou no botão "Voltar a ser eu".
   Carregado pelo auth_guard.js só para quem é admin clínico de verdade.
   Expõe: window.CortexVerComo = { abrirMenu, escolher, voltar }
   ============================================================================ */
(function () {
    'use strict';
    if (window.CortexVerComo) return;

    const c = () => window.cortexClient;
    const real = () => window.cortexProfissionalReal || window.cortexProfissional || {};
    const estado = () => window.cortexVerComo || null;
    const esc = t => t == null ? '' : String(t).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
    const rotuloPerfil = p => (window.CortexUI && window.CortexUI.PERFIL_LABELS && window.CortexUI.PERFIL_LABELS[p]) || p || '—';
    const iniciais = n => String(n || '?').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0].toUpperCase()).join('');
    const raiz = () => { const p = location.pathname, i = p.indexOf('/frontend/'); return i >= 0 ? p.substring(0, i + '/frontend/'.length) : '/'; };
    const toast = (m, t) => { if (window.CortexUI && window.CortexUI.toast) window.CortexUI.toast(m, t || 'info'); else alert(m); };

    function estilos() {
        if (document.getElementById('cortex-ver-como-css')) return;
        const st = document.createElement('style');
        st.id = 'cortex-ver-como-css';
        st.textContent = `
            #sidebar-user-menu { cursor: pointer; border-radius: 10px; }
            #sidebar-user-menu:hover, #sidebar-user-menu:focus-visible { background: rgba(255, 255, 255, .08); outline: none; }
            .sidebar-user.vendo-como { box-shadow: inset 0 0 0 2px #F5B544; border-radius: 12px; }
            .vc-faixa { position: fixed; left: 50%; bottom: calc(16px + env(safe-area-inset-bottom, 0px)); transform: translateX(-50%); z-index: 9000;
                display: flex; align-items: center; gap: 12px; padding: 8px 8px 8px 14px; border-radius: 999px; background: #14254A; color: #fff;
                font: 600 13px/1.2 Inter, system-ui, sans-serif; box-shadow: 0 14px 34px -12px rgba(15, 23, 42, .6); border: 1px solid rgba(245, 181, 68, .55); max-width: calc(100vw - 24px); }
            .vc-faixa b { color: #FFD891; }
            .vc-faixa small { color: rgba(255, 255, 255, .7); font-weight: 500; }
            .vc-faixa button { border: 0; border-radius: 999px; padding: 8px 14px; background: #F5B544; color: #14254A; font: 800 12.5px/1 Inter, system-ui, sans-serif; cursor: pointer; white-space: nowrap; }
            .vc-faixa button:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
            @media (max-width: 760px) { .vc-faixa { bottom: calc(78px + env(safe-area-inset-bottom, 0px)); font-size: 12px; } .vc-faixa small { display: none; } }
            body.cortex-copiando .vc-faixa, body.exportando .vc-faixa, body.cortex-embed .vc-faixa { display: none !important; }
            .vc-menu { position: fixed; z-index: 9100; min-width: 240px; padding: 6px; border-radius: 12px; background: #fff; color: #0F172A; box-shadow: 0 18px 40px -12px rgba(15, 23, 42, .45); border: 1px solid #E2E8F0; font: 500 13.5px/1.3 Inter, system-ui, sans-serif; }
            .vc-menu button { display: flex; width: 100%; align-items: center; gap: 10px; padding: 10px 12px; border: 0; border-radius: 8px; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; }
            .vc-menu button:hover, .vc-menu button:focus-visible { background: #F1F5F9; outline: none; }
            .vc-menu small { display: block; padding: 6px 12px 4px; font-size: 10.5px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: #94A3B8; }
            .vc-fundo { position: fixed; inset: 0; z-index: 9200; background: rgba(15, 23, 42, .45); display: grid; place-items: center; padding: 16px; }
            .vc-modal { width: min(520px, 100%); max-height: min(640px, calc(100vh - 32px)); display: flex; flex-direction: column; border-radius: 18px; background: #fff; color: #0F172A; box-shadow: 0 30px 60px -20px rgba(15, 23, 42, .5); font-family: Inter, system-ui, sans-serif; overflow: hidden; }
            .vc-modal header { padding: 18px 20px 10px; }
            .vc-modal h2 { margin: 0 0 4px; font-size: 18px; color: #14254A; }
            .vc-modal p { margin: 0; font-size: 13px; color: #475569; line-height: 1.5; }
            .vc-modal input { margin: 12px 0 0; width: 100%; box-sizing: border-box; padding: 10px 12px; border-radius: 10px; border: 1px solid #CBD5E1; font: 500 14px Inter, system-ui, sans-serif; }
            .vc-lista { overflow: auto; padding: 6px 10px 12px; display: grid; gap: 4px; }
            .vc-lista button { display: grid; grid-template-columns: 36px 1fr auto; gap: 10px; align-items: center; padding: 8px 10px; border: 0; border-radius: 10px; background: none; text-align: left; cursor: pointer; font: inherit; color: inherit; }
            .vc-lista button:hover, .vc-lista button:focus-visible { background: #F1F5F9; outline: none; }
            .vc-lista i { width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center; font-style: normal; font-weight: 800; font-size: 12px; color: #fff; background: linear-gradient(140deg, #14254A, #2E3F86); }
            .vc-lista b { display: block; font-size: 14px; } .vc-lista span { font-size: 12px; color: #64748B; }
            .vc-lista em { font-style: normal; font-size: 11px; font-weight: 700; padding: 4px 8px; border-radius: 99px; background: #EEF2FF; color: #3730A3; white-space: nowrap; }
            .vc-vazio { padding: 18px; text-align: center; color: #64748B; font-size: 13px; }
            .vc-modal footer { padding: 10px 16px 14px; border-top: 1px solid #F1F5F9; display: flex; justify-content: flex-end; }
            .vc-modal footer button { border: 1px solid #CBD5E1; background: #fff; border-radius: 10px; padding: 9px 16px; font: 700 13px Inter, system-ui, sans-serif; cursor: pointer; }`;
        document.head.appendChild(st);
    }

    // ── faixa "vendo como" em todas as telas ─────────────────────────────────
    function faixa() {
        const e = estado();
        if (!e || document.querySelector('.vc-faixa')) return;
        const d = document.createElement('div');
        d.className = 'vc-faixa';
        d.setAttribute('role', 'status');
        d.innerHTML = `<span>👁 Vendo como <b>${esc(e.alvo.nome_completo)}</b> <small>· ${esc(rotuloPerfil(e.alvo.perfil))} · só leitura</small></span><button type="button">Voltar a ser eu</button>`;
        d.querySelector('button').addEventListener('click', voltar);
        document.body.appendChild(d);
    }

    // ── menu do nome na sidebar ──────────────────────────────────────────────
    function fecharMenu() { document.querySelectorAll('.vc-menu').forEach(m => m.remove()); }
    function abrirMenu(ancora) {
        fecharMenu();
        const e = estado();
        const m = document.createElement('div');
        m.className = 'vc-menu';
        m.setAttribute('role', 'menu');
        m.innerHTML = e
            ? `<small>Vendo como ${esc(e.alvo.nome_completo)}</small><button type="button" role="menuitem" data-vc="voltar">↩ Voltar a ser eu (${esc(real().nome_completo || '')})</button><button type="button" role="menuitem" data-vc="trocar">👁 Ver como outra pessoa…</button>`
            : `<small>${esc(real().nome_completo || '')}</small><button type="button" role="menuitem" data-vc="trocar">👁 Ver o sistema como…</button>`;
        document.body.appendChild(m);
        const r = ancora.getBoundingClientRect();
        const alto = m.offsetHeight;
        m.style.left = Math.max(8, Math.min(r.left, window.innerWidth - m.offsetWidth - 8)) + 'px';
        m.style.top = Math.max(8, r.top - alto - 8) + 'px';
        m.addEventListener('click', ev => {
            const b = ev.target.closest('[data-vc]'); if (!b) return;
            fecharMenu();
            if (b.dataset.vc === 'voltar') voltar(); else escolher();
        });
        const primeiro = m.querySelector('button'); if (primeiro) primeiro.focus();
        setTimeout(() => {
            const fora = ev => { if (!m.contains(ev.target)) { fecharMenu(); document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', tecla); } };
            const tecla = ev => { if (ev.key === 'Escape') { fecharMenu(); document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', tecla); ancora.focus(); } };
            document.addEventListener('mousedown', fora);
            document.addEventListener('keydown', tecla);
        }, 0);
    }

    // ── escolher a pessoa ────────────────────────────────────────────────────
    async function escolher() {
        let lista = [];
        try {
            const { data, error } = await c().rpc('ver_como_lista');
            if (error) throw error;
            lista = data || [];
        } catch (e) {
            toast('Não consegui abrir a lista: ' + (e.message || 'rode o SQL do "ver como" no Supabase.'), 'danger');
            return;
        }
        const atual = estado() && estado().alvo.id;
        const fundo = document.createElement('div');
        fundo.className = 'vc-fundo';
        fundo.innerHTML = `<div class="vc-modal" role="dialog" aria-modal="true" aria-labelledby="vc-tit">
            <header><h2 id="vc-tit">Ver o sistema como…</h2>
                <p>Você vê o CORTEX exatamente como a pessoa vê: menu, permissões e os pacientes que ela acessa. É só leitura: nada é salvo. Termina sozinho em 2 horas.</p>
                <input id="vc-busca" type="search" placeholder="Buscar pelo nome" autocomplete="off" aria-label="Buscar pelo nome"></header>
            <div class="vc-lista" id="vc-lista"></div>
            <footer><button type="button" data-fechar>Cancelar</button></footer></div>`;
        document.body.appendChild(fundo);
        const caixa = fundo.querySelector('#vc-lista'), busca = fundo.querySelector('#vc-busca');
        const sem = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
        const pintar = () => {
            const q = sem(busca.value);
            const vis = lista.filter(p => !q || sem(p.nome_completo).includes(q) || sem(p.email).includes(q) || sem(rotuloPerfil(p.perfil)).includes(q));
            caixa.innerHTML = vis.length ? vis.map(p => `<button type="button" data-id="${esc(p.id)}"${p.id === atual ? ' aria-current="true"' : ''}>
                <i aria-hidden="true">${esc(iniciais(p.nome_completo))}</i><span><b>${esc(p.nome_completo)}</b><span>${esc(p.email || '')}</span></span><em>${esc(rotuloPerfil(p.perfil))}${p.id === atual ? ' · agora' : ''}</em></button>`).join('')
                : '<p class="vc-vazio">Ninguém encontrado.</p>';
        };
        const fechar = () => { fundo.remove(); document.removeEventListener('keydown', esc_); };
        const esc_ = ev => { if (ev.key === 'Escape') fechar(); };
        document.addEventListener('keydown', esc_);
        fundo.addEventListener('click', ev => {
            if (ev.target === fundo || ev.target.closest('[data-fechar]')) { fechar(); return; }
            const b = ev.target.closest('[data-id]'); if (!b) return;
            const p = lista.find(x => x.id === b.dataset.id); if (p) iniciar(p, b);
        });
        busca.addEventListener('input', pintar);
        pintar();
        busca.focus();
    }

    async function iniciar(p, botao) {
        if (botao) { botao.disabled = true; const em = botao.querySelector('em'); if (em) em.textContent = 'abrindo…'; }
        try {
            const { data, error } = await c().rpc('ver_como_iniciar', { p_alvo: p.id });
            if (error) throw error;
            if (data && data.ok === false) throw new Error(data.erro || 'não foi possível');
            location.href = raiz() + 'dashboard.html';
        } catch (e) {
            toast('Não consegui entrar como ' + p.nome_completo + ': ' + (e.message || e), 'danger');
            if (botao) botao.disabled = false;
        }
    }

    async function voltar() {
        try {
            const { error } = await c().rpc('ver_como_encerrar');
            if (error) throw error;
        } catch (e) {
            toast('Não consegui voltar: ' + (e.message || e), 'danger');
            return;
        }
        location.reload();
    }

    // aviso quando faltar pouco para acabar (a sessão vence sozinha em 2 horas)
    function vigiarFim() {
        const e = estado(); if (!e || !e.expira_em) return;
        const resta = new Date(e.expira_em).getTime() - Date.now();
        if (resta > 0) setTimeout(() => location.reload(), resta + 1500);
    }

    // Sair do sistema durante o "ver como" encerra a sessão junto (senão ela voltaria no próximo login)
    document.addEventListener('click', ev => {
        if (estado() && ev.target.closest && ev.target.closest('#sidebar-logout-btn')) {
            try { c().rpc('ver_como_encerrar').then(() => {}, () => {}); } catch (e) { /* segue o logout */ }
        }
    }, true);

    function iniciarTela() {
        estilos();
        faixa();
        vigiarFim();
    }
    if (document.body) iniciarTela(); else document.addEventListener('DOMContentLoaded', iniciarTela);

    window.CortexVerComo = { abrirMenu, escolher, voltar };
})();

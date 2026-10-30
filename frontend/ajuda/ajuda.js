// ============================================================================
// CORTEX_APP — Instruções
// ----------------------------------------------------------------------------
// Lista os guias que o perfil pode ver (guias.js) e abre cada um passo a passo.
// Nas imagens, cada número é clicável: destaca a área e explica o que é.
// ?guia=<id>&passo=<n> abre direto num passo. "Baixar PDF" imprime o guia
// inteiro (o navegador salva em PDF).
// ============================================================================
(function () {
    'use strict';

    const GUIAS = window.CORTEX_GUIAS || [];
    const st = { guia: null, passo: 0, perfil: null };
    const app = () => document.getElementById('aj-app');

    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const semTags = (h) => String(h || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

    // ── progresso (só conveniência de quem lê; pode não existir) ─────────
    function vistos(id) {
        try { return new Set(JSON.parse(localStorage.getItem('cortex_ajuda_' + id) || '[]')); } catch (e) { return new Set(); }
    }
    function marcarVisto(id, i) {
        const v = vistos(id); v.add(i);
        try { localStorage.setItem('cortex_ajuda_' + id, JSON.stringify([...v])); } catch (e) {}
    }

    function podeVer(g) {
        const p = g.publico || ['*'];
        if (p.includes('*')) return true;
        return !!st.perfil && p.includes(st.perfil);
    }
    const visiveis = () => GUIAS.filter(podeVer);

    // ── URL ──────────────────────────────────────────────────────────────
    function urlAtual() {
        const u = new URL(window.location.href);
        u.searchParams.delete('guia'); u.searchParams.delete('passo');
        if (st.guia) { u.searchParams.set('guia', st.guia.id); u.searchParams.set('passo', String(st.passo + 1)); }
        try { history.replaceState(null, '', u.toString()); } catch (e) {}
    }

    // ── topo + busca ─────────────────────────────────────────────────────
    function hero() {
        const ext = st.perfil === 'profissional_externo';
        return `
            <section class="aj-hero">
                <small>Central de instruções</small>
                <h1>Instruções</h1>
                <p>${ext ? 'Passo a passo para usar o seu acesso ao CORTEX.' : 'Guias passo a passo do CORTEX, com as telas do sistema. Toque nos números das imagens para ver o que cada parte faz.'}</p>
                <div class="aj-busca">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/></svg>
                    <input type="search" id="aj-q" placeholder="Buscar: senha, laudo, remover, abas..." autocomplete="off" aria-label="Buscar nas instruções">
                    <div class="aj-resultados" id="aj-res" hidden></div>
                </div>
            </section>`;
    }

    function indice() {
        const out = [];
        visiveis().forEach(g => (g.passos || []).forEach((p, i) => {
            const marcas = [].concat(p.imagem ? [p.imagem] : [], p.imagens || [])
                .flatMap(im => im.marcas || []).map(m => m.titulo + ' ' + m.texto).join(' ');
            const faq = (p.faq || []).map(f => f.p + ' ' + f.r).join(' ');
            out.push({ g, i, titulo: p.titulo, alvo: norm([p.titulo, semTags(p.html), semTags(p.depois), marcas, faq].join(' ')) });
        }));
        return out;
    }

    function ligarBusca() {
        const q = document.getElementById('aj-q'), res = document.getElementById('aj-res');
        if (!q) return;
        const idx = indice();
        const fechar = () => { res.hidden = true; };
        q.addEventListener('input', () => {
            const t = norm(q.value.trim());
            if (t.length < 2) { fechar(); return; }
            const palavras = t.split(/\s+/);
            const achados = idx.filter(x => palavras.every(w => x.alvo.includes(w))).slice(0, 12);
            res.innerHTML = achados.length
                ? achados.map((x, k) => `<button data-k="${k}"><b>${esc(x.titulo)}</b><span>${esc(x.g.titulo)} · passo ${x.i + 1}</span></button>`).join('')
                : '<div class="vazio">Nada encontrado. Tente outra palavra.</div>';
            res.hidden = false;
            res.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
                const a = achados[+b.dataset.k]; fechar(); q.value = '';
                abrirGuia(a.g.id, a.i);
            }));
        });
        q.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') { q.value = ''; fechar(); }
            if (e.key === 'Enter') { const b = res.querySelector('button'); if (b) b.click(); }
        });
        document.addEventListener('click', (e) => { if (!e.target.closest('.aj-busca')) fechar(); });
    }

    // ── lista de guias ───────────────────────────────────────────────────
    function telaInicial() {
        st.guia = null; urlAtual();
        const gs = visiveis();
        app().innerHTML = hero() + `
            <div class="aj-grade">
                ${gs.map(g => {
                    const n = (g.passos || []).length, v = n ? vistos(g.id).size : 0;
                    const pct = n ? Math.round(Math.min(v, n) / n * 100) : 0;
                    return `
                    <button class="aj-cartao" data-guia="${esc(g.id)}" style="--aj-cor:${esc(g.cor || '#0E9AA7')}">
                        <div class="aj-cartao-ic">${g.icone || '📘'}</div>
                        <span class="aj-tag">${esc(g.publicoTxt || '')}</span>
                        <h3>${esc(g.titulo)}</h3>
                        <p>${esc(g.resumo || '')}</p>
                        ${n ? `<div class="aj-barra"><i style="width:${pct}%"></i></div>` : ''}
                        <div class="aj-cartao-pe">
                            <span>${n ? `${n} passos${v ? ` · ${Math.min(v, n)} vistos` : ''}` : 'Guia completo'}</span>
                            <strong>${g.link ? 'Abrir →' : (v && v < n ? 'Continuar →' : (v >= n && n ? 'Rever →' : 'Começar →'))}</strong>
                        </div>
                    </button>`;
                }).join('') || '<p>Nenhum guia disponível para o seu perfil.</p>'}
            </div>`;
        app().querySelectorAll('[data-guia]').forEach(b => b.addEventListener('click', () => {
            const g = GUIAS.find(x => x.id === b.dataset.guia);
            if (g && g.link) { window.location.href = g.link; return; }
            const v = vistos(b.dataset.guia), n = (g.passos || []).length;
            let i = 0; while (i < n - 1 && v.has(i)) i++;
            abrirGuia(b.dataset.guia, v.size >= n ? 0 : i);
        }));
        ligarBusca();
        window.scrollTo(0, 0);
    }

    // ── imagem com marcas ────────────────────────────────────────────────
    function figura(im, k) {
        const marcas = im.marcas || [];
        const forma = im.proporcao > 1.4 ? 'celular' : (im.proporcao > 0.9 ? 'alta' : '');
        return `
            <figure class="aj-fig ${forma}" data-fig="${k}">
                <div class="aj-tela">
                    <img src="${esc(im.src)}" alt="${esc(im.alt || '')}" loading="lazy" width="1600" height="${Math.round(1600 * im.proporcao)}">
                    ${marcas.map((m, j) => `
                        <button class="aj-hs" data-j="${j}" style="left:${m.x}%;top:${m.y}%;width:${m.w}%;height:${m.h}%"
                                aria-label="${m.n}. ${esc(m.titulo)}"><span class="aj-hs-n">${m.n}</span></button>`).join('')}
                </div>
                ${marcas.length ? `
                <div class="aj-fig-barra">
                    <span>Toque nos números para ver o que cada parte faz.</span>
                    <span class="acoes">
                        <button class="aj-mini" data-acao="tour">▶ Um por um</button>
                        <button class="aj-mini" data-acao="zoom">⤢ Ampliar</button>
                    </span>
                </div>
                <ol class="aj-leg">
                    ${marcas.map((m, j) => `<li data-j="${j}"><span class="n">${m.n}</span><div><strong>${esc(m.titulo)}</strong><span>${esc(m.texto)}</span></div></li>`).join('')}
                </ol>` : `
                <div class="aj-fig-barra"><span></span><span class="acoes"><button class="aj-mini" data-acao="zoom">⤢ Ampliar</button></span></div>`}
            </figure>`;
    }

    function ligarFigura(fig, im) {
        const tela = fig.querySelector('.aj-tela');
        const marcas = im.marcas || [];
        let atual = -1;

        function limpar() {
            atual = -1;
            fig.querySelectorAll('.aj-hs.ativo, .aj-leg li.ativo').forEach(e => e.classList.remove('ativo'));
            const b = tela.querySelector('.aj-bolha'); if (b) b.remove();
        }
        function ativar(j) {
            if (j < 0 || j >= marcas.length) { limpar(); return; }
            limpar(); atual = j;
            const m = marcas[j];
            const hs = tela.querySelector(`.aj-hs[data-j="${j}"]`); if (hs) hs.classList.add('ativo');
            const li = fig.querySelector(`.aj-leg li[data-j="${j}"]`); if (li) li.classList.add('ativo');
            const bolha = document.createElement('div');
            bolha.className = 'aj-bolha';
            bolha.innerHTML = `<b><i>${m.n}</i>${esc(m.titulo)}</b><div>${esc(m.texto)}</div>
                <div class="aj-bolha-nav"><button data-d="-1" ${j === 0 ? 'disabled' : ''}>‹</button><span>${j + 1} de ${marcas.length}</span><button data-d="1">${j === marcas.length - 1 ? '✓' : '›'}</button></div>`;
            // abaixo da área marcada; se não couber, acima
            const embaixo = (m.y + m.h) < 62;
            bolha.style.top = embaixo ? `calc(${m.y + m.h}% + 12px)` : '';
            bolha.style.bottom = embaixo ? '' : `calc(${100 - m.y}% + 12px)`;
            const centro = m.x + m.w / 2;
            if (centro < 35) bolha.style.left = Math.max(1, m.x) + '%';
            else if (centro > 65) bolha.style.right = Math.max(1, 100 - (m.x + m.w)) + '%';
            else { bolha.style.left = '50%'; bolha.style.transform = 'translateX(-50%)'; }
            bolha.addEventListener('click', (e) => e.stopPropagation());
            bolha.querySelectorAll('[data-d]').forEach(b => b.addEventListener('click', () => {
                const d = +b.dataset.d;
                if (d > 0 && j === marcas.length - 1) limpar(); else ativar(j + d);
            }));
            tela.appendChild(bolha);
        }

        tela.querySelectorAll('.aj-hs').forEach(b => {
            b.addEventListener('click', (e) => { e.stopPropagation(); const j = +b.dataset.j; atual === j ? limpar() : ativar(j); });
        });
        tela.addEventListener('click', () => limpar());
        fig.querySelectorAll('.aj-leg li').forEach(li => {
            li.addEventListener('mouseenter', () => { const hs = tela.querySelector(`.aj-hs[data-j="${li.dataset.j}"]`); if (hs && atual < 0) hs.classList.add('ativo'); });
            li.addEventListener('mouseleave', () => { if (atual < 0) tela.querySelectorAll('.aj-hs.ativo').forEach(e => e.classList.remove('ativo')); });
            li.addEventListener('click', () => { const j = +li.dataset.j; atual === j ? limpar() : ativar(j); tela.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); });
        });
        const tour = fig.querySelector('[data-acao="tour"]');
        if (tour) tour.addEventListener('click', () => { ativar(0); tela.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); });
        const zoom = fig.querySelector('[data-acao="zoom"]');
        if (zoom) zoom.addEventListener('click', () => ampliar(im));
    }

    function ampliar(im) {
        const fundo = document.createElement('div');
        fundo.className = 'aj-zoom';
        fundo.innerHTML = `<button class="aj-zoom-fechar" aria-label="Fechar">✕</button>` + figura(im, 'z');
        const tela = fundo.querySelector('.aj-tela');
        if (im.proporcao > 1.2) tela.classList.add('alta');
        fundo.querySelectorAll('.aj-fig-barra, .aj-leg').forEach(e => e.remove());
        document.body.appendChild(fundo);
        ligarFigura(fundo.querySelector('.aj-fig'), im);
        const sair = () => { fundo.remove(); document.removeEventListener('keydown', tecla, true); };
        const tecla = (e) => { if (e.key === 'Escape') { e.stopPropagation(); sair(); } };
        fundo.querySelector('.aj-zoom-fechar').addEventListener('click', sair);
        fundo.addEventListener('click', (e) => { if (e.target === fundo) sair(); });
        document.addEventListener('keydown', tecla, true);
    }

    // ── um passo ─────────────────────────────────────────────────────────
    function conteudoPasso(p) {
        const imgs = [].concat(p.imagem ? [p.imagem] : [], p.imagens || []);
        return `
            <div class="aj-texto">${p.html || ''}</div>
            ${imgs.length ? `<div class="aj-figuras ${imgs.length > 1 ? 'duas' : ''}">${imgs.map((im, k) => figura(im, k)).join('')}</div>` : ''}
            ${p.depois ? `<div class="aj-texto">${p.depois}</div>` : ''}
            ${(p.faq || []).length ? `<div class="aj-faq">${p.faq.map(f => `<details><summary>${esc(f.p)}</summary><p>${esc(f.r)}</p></details>`).join('')}</div>` : ''}`;
    }

    function abrirGuia(id, passo) {
        const g = GUIAS.find(x => x.id === id && podeVer(x));
        if (!g || !g.passos) { telaInicial(); return; }
        st.guia = g;
        st.passo = Math.max(0, Math.min((g.passos.length - 1), passo || 0));
        renderGuia();
    }

    function renderGuia() {
        const g = st.guia, i = st.passo, p = g.passos[i], n = g.passos.length;
        marcarVisto(g.id, i);
        const v = vistos(g.id);
        const pct = Math.round(Math.min(v.size, n) / n * 100);
        urlAtual();
        app().innerHTML = `
            <button class="aj-voltar" id="aj-voltar">‹ Todas as instruções</button>
            <div class="aj-guia-topo" style="--aj-cor:${esc(g.cor || '#0E9AA7')}">
                <div class="aj-cartao-ic">${g.icone || '📘'}</div>
                <div class="aj-guia-tit">
                    <h2>${esc(g.titulo)}</h2>
                    <div class="aj-barra"><i style="width:${pct}%"></i></div>
                    <small>Passo ${i + 1} de ${n} · ${Math.min(v.size, n)} vistos</small>
                </div>
                <button class="aj-botao" id="aj-pdf" title="Abre a impressão do guia inteiro. Escolha “Salvar como PDF”.">⬇ <span>Baixar PDF</span></button>
            </div>
            <div class="aj-corpo">
                <nav class="aj-passos" aria-label="Passos">
                    <ol>${g.passos.map((x, k) => `
                        <li><button data-k="${k}" class="${k === i ? 'ativo' : ''} ${v.has(k) ? 'visto' : ''}">
                            <span class="aj-num">${v.has(k) && k !== i ? '✓' : k + 1}</span>${esc(x.titulo)}</button></li>`).join('')}
                    </ol>
                </nav>
                <article class="aj-passo">
                    <div class="aj-passo-eyebrow">Passo ${i + 1} de ${n}</div>
                    <h3>${esc(p.titulo)}</h3>
                    ${conteudoPasso(p)}
                    ${i === n - 1 ? `<div class="aj-fim">🎉 <div><strong>Fim do guia.</strong> Volte a qualquer passo pela lista ou baixe o PDF para guardar.</div></div>` : ''}
                    <div class="aj-navpasso">
                        <button class="aj-botao" id="aj-ant" ${i === 0 ? 'disabled' : ''}>‹ Anterior</button>
                        ${i < n - 1 ? `<button class="aj-botao primario" id="aj-prox">Próximo: ${esc(g.passos[i + 1].titulo)} ›</button>`
                                    : `<button class="aj-botao primario" id="aj-inicio">Ver outras instruções</button>`}
                    </div>
                    <div class="aj-dica">Dica: use as setas ← → do teclado para trocar de passo.</div>
                </article>
            </div>`;

        const imgs = [].concat(p.imagem ? [p.imagem] : [], p.imagens || []);
        app().querySelectorAll('.aj-passo .aj-fig').forEach((fig, k) => ligarFigura(fig, imgs[k]));
        app().querySelectorAll('.aj-passos [data-k]').forEach(b => b.addEventListener('click', () => irPara(+b.dataset.k)));
        document.getElementById('aj-voltar').addEventListener('click', telaInicial);
        document.getElementById('aj-ant').addEventListener('click', () => irPara(i - 1));
        const prox = document.getElementById('aj-prox'); if (prox) prox.addEventListener('click', () => irPara(i + 1));
        const ini = document.getElementById('aj-inicio'); if (ini) ini.addEventListener('click', telaInicial);
        document.getElementById('aj-pdf').addEventListener('click', imprimir);
        const ativo = app().querySelector('.aj-passos button.ativo');
        if (ativo && window.innerWidth <= 900) ativo.scrollIntoView({ inline: 'center', block: 'nearest' });
    }

    function irPara(k) {
        if (!st.guia || k < 0 || k >= st.guia.passos.length) return;
        st.passo = k; renderGuia();
        const topo = app().querySelector('.aj-guia-topo');
        if (topo) window.scrollTo({ top: Math.max(0, topo.getBoundingClientRect().top + window.scrollY - 12), behavior: 'smooth' });
    }

    document.addEventListener('keydown', (e) => {
        if (!st.guia || document.querySelector('.aj-zoom')) return;
        const t = e.target;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
        if (e.key === 'ArrowRight') irPara(st.passo + 1);
        if (e.key === 'ArrowLeft') irPara(st.passo - 1);
    });

    // ── PDF: o guia inteiro numa página para imprimir ────────────────────
    function montarImpressao() {
        const g = st.guia, box = document.getElementById('aj-impressao');
        if (!g || !box) return;
        const hoje = new Date().toLocaleDateString('pt-BR');
        box.innerHTML = `
            <div class="imp-capa"><small>CORTEX · Instruções</small><h1>${esc(g.titulo)}</h1><p>${esc(g.resumo || '')}</p></div>
            ${g.passos.map((p, k) => `
                <section class="imp-passo ${k > 0 && (p.imagem || p.imagens) ? 'quebra' : ''}">
                    <h2><em>Passo ${k + 1} de ${g.passos.length}</em>${esc(p.titulo)}</h2>
                    ${conteudoPasso(p).replace(/<details>/g, '<details open>').replace(/<details class="aj-det"(?! open)/g, '<details class="aj-det" open')}
                </section>`).join('')}
            <div class="imp-rodape">Grupo Equilibrium · CORTEX · gerado em ${hoje}</div>`;
        box.querySelectorAll('.aj-fig-barra').forEach(e => e.remove());
        box.querySelectorAll('img[loading]').forEach(img => img.removeAttribute('loading'));
    }
    function imprimir() {
        montarImpressao();
        const imgs = [...document.querySelectorAll('#aj-impressao img')];
        Promise.all(imgs.map(im => im.complete ? 1 : new Promise(r => { im.onload = im.onerror = r; })))
            .then(() => window.print());
    }
    window.addEventListener('beforeprint', () => { if (st.guia && !document.querySelector('#aj-impressao .imp-capa')) montarImpressao(); });
    window.CortexAjuda = { imprimir, montarImpressao, abrirGuia };

    // ── início ───────────────────────────────────────────────────────────
    window.addEventListener('cortex:auth-ready', async () => {
        st.perfil = (window.cortexProfissional && window.cortexProfissional.perfil) || null;
        if (window.CortexSidebar) await window.CortexSidebar.render('ajuda');
        const u = new URLSearchParams(window.location.search);
        const id = u.get('guia');
        if (id) abrirGuia(id, Math.max(0, (parseInt(u.get('passo'), 10) || 1) - 1));
        else telaInicial();
    });
})();

// ============================================================================
// CORTEX_APP — cortex_pop.js  ·  v2.0 "Aurora"
// ----------------------------------------------------------------------------
// Sistema global de POPUP / JANELA SUSPENSA.
//
// Carregado automaticamente pelo sidebar.js em todas as páginas autenticadas,
// junto com styles/cortex-v2.css.
//
// API (window.CortexPop):
//
//   const j = CortexPop.abrir({
//       titulo, subtitulo, icone, tone,        // 'blue'|'purple'|'amber'|'green'|'red'
//       html | elemento,                       // conteúdo
//       tamanho: 'sm'|'md'|'lg'|'xl'|'full',
//       glass, arrastavel, maximizavel,        // booleans
//       semPadding, persistente,               // booleans
//       rodape: [{ label, classe, onClick, fechar }],
//       aoFechar: fn
//   });
//   j.fecharJanela();  j.corpo;  j.el;
//
//   CortexPop.previa({ url, tipo, titulo, subtitulo, baixarUrl })
//   CortexPop.drawer({ ...mesmas opções, lado: 'direita'|'esquerda' })
//   CortexPop.sheet({ ... })
//   CortexPop.confirmar({ titulo, texto, tone, labelOk, labelCancelar }) -> Promise<bool>
//   CortexPop.popover(ancora, html, { tamanho })
//   CortexPop.fecharTopo() / CortexPop.fecharTodos()
//
// Adoção sem código: qualquer elemento com
//   data-cx-previa="URL" [data-cx-tipo="imagem|pdf|html"] [data-cx-titulo="..."]
// abre a prévia em janela suspensa ao clique.
// ============================================================================

window.CortexPop = (function () {
    'use strict';

    const pilha = [];

    // ── ícones ───────────────────────────────────────────────────────────────
    const IC = {
        fechar:   '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
        maximizar:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>',
        restaurar:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>',
        baixar:   '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
        janela:   '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2.5"/><line x1="3" y1="9" x2="21" y2="9"/></svg>',
        imagem:   '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.6"/><polyline points="21 15 16 10 5 21"/></svg>',
        doc:      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
        alerta:   '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
    };

    function esc(t) {
        if (t === null || t === undefined) return '';
        const d = document.createElement('div');
        d.textContent = String(t);
        return d.innerHTML;
    }

    function travarScroll(travar) {
        if (travar) {
            if (pilha.length === 1) {
                document.body.dataset.cxOverflow = document.body.style.overflow || '';
                document.body.style.overflow = 'hidden';
            }
        } else if (pilha.length === 0) {
            document.body.style.overflow = document.body.dataset.cxOverflow || '';
            delete document.body.dataset.cxOverflow;
        }
    }

    // ── construtor base ──────────────────────────────────────────────────────
    function construir(op, modo) {
        op = op || {};
        const tamanho     = op.tamanho || 'md';
        const tone        = op.tone || 'blue';
        const persistente = !!op.persistente;

        const scrim = document.createElement('div');
        scrim.className = 'cx-pop-scrim';
        if (modo === 'drawer') {
            scrim.classList.add('as-drawer');
            if (op.lado === 'esquerda') scrim.classList.add('from-left');
        }
        if (modo === 'sheet') scrim.classList.add('as-sheet');

        const janela = document.createElement('div');
        janela.className = 'cx-pop size-' + tamanho;
        if (op.glass) janela.classList.add('glass');
        if (op.arrastavel && modo === 'modal') janela.classList.add('is-draggable');
        janela.setAttribute('role', 'dialog');
        janela.setAttribute('aria-modal', 'true');

        // cabeçalho
        const temCabecalho = op.titulo || op.subtitulo || op.icone !== false;
        let cabecalho = null;
        if (temCabecalho) {
            cabecalho = document.createElement('div');
            cabecalho.className = 'cx-pop-head';
            cabecalho.innerHTML = `
                ${op.icone === false ? '' : `<div class="cx-pop-ico tone-${esc(tone)}">${op.icone || IC.janela}</div>`}
                <div class="cx-pop-titles">
                    <div class="cx-pop-title">${esc(op.titulo || '')}</div>
                    ${op.subtitulo ? `<div class="cx-pop-sub">${esc(op.subtitulo)}</div>` : ''}
                </div>
                <div class="cx-pop-headbtns"></div>
            `;
            const btns = cabecalho.querySelector('.cx-pop-headbtns');

            (op.acoesTopo || []).forEach(a => {
                const b = document.createElement('button');
                b.className = 'cx-pop-btn';
                b.title = a.titulo || '';
                b.innerHTML = a.icone || IC.baixar;
                b.addEventListener('click', () => a.onClick && a.onClick(api));
                btns.appendChild(b);
            });

            if (op.maximizavel) {
                const bMax = document.createElement('button');
                bMax.className = 'cx-pop-btn';
                bMax.title = 'Maximizar';
                bMax.innerHTML = IC.maximizar;
                bMax.addEventListener('click', () => {
                    janela.classList.toggle('is-max');
                    const max = janela.classList.contains('is-max');
                    bMax.innerHTML = max ? IC.restaurar : IC.maximizar;
                    bMax.title = max ? 'Restaurar' : 'Maximizar';
                });
                btns.appendChild(bMax);
            }

            const bFechar = document.createElement('button');
            bFechar.className = 'cx-pop-btn danger';
            bFechar.title = 'Fechar';
            bFechar.innerHTML = IC.fechar;
            bFechar.addEventListener('click', () => fechar());
            btns.appendChild(bFechar);

            janela.appendChild(cabecalho);
        }

        // corpo
        const corpo = document.createElement('div');
        corpo.className = 'cx-pop-body' + (op.semPadding ? ' flush' : '');
        if (op.elemento) corpo.appendChild(op.elemento);
        else corpo.innerHTML = op.html || '';
        janela.appendChild(corpo);

        // rodapé
        if (op.rodape && op.rodape.length) {
            const foot = document.createElement('div');
            foot.className = 'cx-pop-foot';
            op.rodape.forEach(b => {
                const btn = document.createElement('button');
                btn.className = 'btn ' + (b.classe || 'btn-secondary');
                btn.textContent = b.label || 'OK';
                btn.addEventListener('click', async () => {
                    let ok = true;
                    if (b.onClick) ok = await b.onClick(api);
                    if (b.fechar !== false && ok !== false) fechar();
                });
                foot.appendChild(btn);
            });
            janela.appendChild(foot);
        }

        scrim.appendChild(janela);
        document.body.appendChild(scrim);

        // arrastar
        if (op.arrastavel && cabecalho && modo === 'modal') ativarArrasto(janela, cabecalho);

        // fechar no scrim
        scrim.addEventListener('mousedown', (e) => {
            if (e.target === scrim && !persistente) fechar();
        });

        let fechando = false;
        function fechar(resultado) {
            if (fechando) return;
            fechando = true;
            scrim.classList.remove('is-open');
            scrim.classList.add('is-closing');
            const idx = pilha.indexOf(api);
            if (idx >= 0) pilha.splice(idx, 1);
            setTimeout(() => {
                scrim.remove();
                travarScroll(false);
                if (op.aoFechar) op.aoFechar(resultado);
            }, 260);
        }

        const api = {
            el: scrim,
            janela: janela,
            corpo: corpo,
            fecharJanela: fechar,
            definirConteudo(html) { corpo.innerHTML = html; },
            definirTitulo(t) {
                const el = janela.querySelector('.cx-pop-title');
                if (el) el.textContent = t;
            }
        };

        pilha.push(api);
        travarScroll(true);

        requestAnimationFrame(() => {
            requestAnimationFrame(() => scrim.classList.add('is-open'));
        });

        const focavel = janela.querySelector('input, textarea, select, button.btn');
        if (focavel) setTimeout(() => { try { focavel.focus(); } catch (_) {} }, 300);

        return api;
    }

    // ── arrastar a janela ────────────────────────────────────────────────────
    function ativarArrasto(janela, alca) {
        let ativo = false, x0 = 0, y0 = 0, dx = 0, dy = 0;

        alca.addEventListener('mousedown', (e) => {
            if (e.target.closest('.cx-pop-btn')) return;
            ativo = true;
            janela.classList.add('is-dragging');
            x0 = e.clientX - dx;
            y0 = e.clientY - dy;
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!ativo) return;
            dx = e.clientX - x0;
            dy = e.clientY - y0;
            janela.style.transform = `translate(${dx}px, ${dy}px)`;
        });

        document.addEventListener('mouseup', () => {
            if (!ativo) return;
            ativo = false;
            janela.classList.remove('is-dragging');
        });
    }

    // ── ESC fecha a do topo ──────────────────────────────────────────────────
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape' || !pilha.length) return;
        const topo = pilha[pilha.length - 1];
        if (topo && topo.el && !topo.el.dataset.persistente) topo.fecharJanela();
    });

    // ── API pública ──────────────────────────────────────────────────────────

    function abrir(op) { return construir(op, 'modal'); }
    function drawer(op) { return construir(op, 'drawer'); }
    function sheet(op) { return construir(op, 'sheet'); }

    function detectarTipo(url) {
        const limpa = String(url || '').split('?')[0].toLowerCase();
        if (/\.(png|jpe?g|gif|webp|svg|bmp|avif)$/.test(limpa)) return 'imagem';
        if (/\.pdf$/.test(limpa)) return 'pdf';
        return 'html';
    }

    /**
     * Janela de prévia (imagem, PDF ou página).
     */
    function previa(op) {
        op = op || {};
        const url = op.url;
        const tipo = op.tipo || detectarTipo(url);

        let inner;
        if (!url) {
            inner = `<div class="cx-preview-empty">Nada para pré-visualizar.</div>`;
        } else if (tipo === 'imagem') {
            inner = `<img src="${esc(url)}" alt="${esc(op.titulo || 'Prévia')}">`;
        } else {
            inner = `<iframe src="${esc(url)}" title="${esc(op.titulo || 'Prévia')}"></iframe>`;
        }

        const acoesTopo = [];
        const urlBaixar = op.baixarUrl || (op.permitirBaixar !== false ? url : null);
        if (urlBaixar) {
            acoesTopo.push({
                titulo: 'Baixar',
                icone: IC.baixar,
                onClick: () => {
                    const a = document.createElement('a');
                    a.href = urlBaixar;
                    a.download = op.nomeArquivo || '';
                    a.target = '_blank';
                    a.rel = 'noopener';
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                }
            });
        }

        return construir({
            titulo: op.titulo || 'Prévia',
            subtitulo: op.subtitulo || '',
            icone: tipo === 'imagem' ? IC.imagem : IC.doc,
            tone: tipo === 'imagem' ? 'purple' : 'blue',
            tamanho: op.tamanho || (tipo === 'imagem' ? 'lg' : 'xl'),
            semPadding: true,
            maximizavel: true,
            html: `<div class="cx-preview">${inner}</div>`,
            acoesTopo: acoesTopo,
            rodape: op.rodape,
            aoFechar: op.aoFechar
        }, 'modal');
    }

    /**
     * Confirmação em janela suspensa. Retorna Promise<boolean>.
     * (Não substitui window.CortexConfirm — é uma alternativa v2.)
     */
    function confirmar(op) {
        op = op || {};
        return new Promise((resolve) => {
            let respondido = false;
            const j = construir({
                titulo: op.titulo || 'Confirmar',
                subtitulo: op.subtitulo || '',
                icone: op.icone || IC.alerta,
                tone: op.tone || 'amber',
                tamanho: 'sm',
                persistente: true,
                html: `<p style="font-size:14px;line-height:1.6;color:var(--color-text-muted);margin:0;">${esc(op.texto || '')}</p>`,
                rodape: [
                    {
                        label: op.labelCancelar || 'Cancelar',
                        classe: 'btn-secondary',
                        onClick: () => { respondido = true; resolve(false); }
                    },
                    {
                        label: op.labelOk || 'Confirmar',
                        classe: op.classeOk || 'btn-primary',
                        onClick: () => { respondido = true; resolve(true); }
                    }
                ],
                aoFechar: () => { if (!respondido) resolve(false); }
            }, 'modal');
            j.el.dataset.persistente = '1';
        });
    }

    /**
     * Popover ancorado — janela suspensa leve, sem scrim.
     */
    function popover(ancora, html, op) {
        op = op || {};
        fecharPopovers();

        const pop = document.createElement('div');
        pop.className = 'cx-popover';
        pop.innerHTML = html || '';
        document.body.appendChild(pop);

        const r = ancora.getBoundingClientRect();
        const larguraPop = Math.min(pop.offsetWidth || 240, 360);
        let left = r.left;
        if (left + larguraPop > window.innerWidth - 12) left = window.innerWidth - larguraPop - 12;
        if (left < 12) left = 12;

        let top = r.bottom + 8;
        if (top + pop.offsetHeight > window.innerHeight - 12) {
            top = Math.max(12, r.top - pop.offsetHeight - 8);
        }

        pop.style.left = left + 'px';
        pop.style.top = top + 'px';

        requestAnimationFrame(() => pop.classList.add('is-open'));

        setTimeout(() => {
            document.addEventListener('mousedown', function aoClicar(e) {
                if (!pop.contains(e.target)) {
                    document.removeEventListener('mousedown', aoClicar);
                    fecharPopover(pop);
                }
            });
        }, 0);

        return { el: pop, fechar: () => fecharPopover(pop) };
    }

    function fecharPopover(pop) {
        if (!pop) return;
        pop.classList.remove('is-open');
        setTimeout(() => pop.remove(), 220);
    }

    function fecharPopovers() {
        document.querySelectorAll('.cx-popover').forEach(fecharPopover);
    }

    function fecharTopo() {
        if (pilha.length) pilha[pilha.length - 1].fecharJanela();
    }

    function fecharTodos() {
        [...pilha].forEach(j => j.fecharJanela());
        fecharPopovers();
    }

    // ── Adoção sem código: data-cx-previa ────────────────────────────────────
    document.addEventListener('click', (e) => {
        const alvo = e.target.closest('[data-cx-previa]');
        if (!alvo) return;
        e.preventDefault();
        previa({
            url: alvo.getAttribute('data-cx-previa'),
            tipo: alvo.getAttribute('data-cx-tipo') || null,
            titulo: alvo.getAttribute('data-cx-titulo') || 'Prévia',
            subtitulo: alvo.getAttribute('data-cx-subtitulo') || ''
        });
    });

    return {
        abrir, drawer, sheet, previa, confirmar, popover,
        fecharTopo, fecharTodos, fecharPopovers,
        icones: IC
    };
})();

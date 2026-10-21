/* ============================================================================
   CORTEX · Laudo Online — IMPRESSÃO DO ONLINE  (frontend/shared/laudo/laudo_folhas_online.js)
   ----------------------------------------------------------------------------
   Sprint LO-10. A página online (laudo_portfolio.js) em folhas A4, em três
   modelos para escolher na hora:
     escuro  — a página online como ela é, fundo azul-noite;
     claro   — papel branco e os azuis da clínica;
     revista — capa inteira azul, faixa lateral e capítulo em folha nova.
   O conteúdo é o mesmo do online: desenha a página fora da tela, copia os
   blocos e distribui nas folhas, quebrando cartões grandes entre folhas.
   Expõe: window.LaudoFolhasOnline.desenhar(alvo, opcoes) → { paginas }
   ============================================================================ */
(function () {
    'use strict';
    const MODELOS = {
        claro: { nome: 'Claro', dica: 'Papel branco e os azuis da clínica. Bom para PDF e para imprimir.' },
        revista: { nome: 'Revista', dica: 'Capa inteira azul, faixa lateral e cada capítulo em folha nova.' },
        escuro: { nome: 'Escuro', dica: 'Igual à página online, fundo azul-noite. Melhor para PDF (gasta tinta no papel).' }
    };
    const esc = s => window.LaudoCore.esc(s);

    function desenhar(alvo, o) {
        const modelo = MODELOS[o.modelo] ? o.modelo : 'claro';
        // 1) a página online, fora da tela
        const fonte = document.createElement('div');
        fonte.style.cssText = 'position:absolute;left:-12000px;top:0;width:1140px;';
        fonte.setAttribute('aria-hidden', 'true');
        document.body.appendChild(fonte);
        window.LaudoPortfolio.desenhar(fonte, Object.assign({ publico: true }, o.portfolio || {}));
        if (window.LaudoPortfolio.parar) window.LaudoPortfolio.parar();
        const src = fonte.querySelector('.port');
        const nome = ((src.querySelector('.p-nome') || {}).textContent || '').trim();

        // 2) folhas
        alvo.innerHTML = '';
        const caixa = document.createElement('div');
        caixa.className = `port flo flo-${modelo}${o.rascunho ? ' flo-rascunho' : ''}`;
        alvo.appendChild(caixa);
        let pag = 0, corpo = null, capAtual = '';
        const usado = () => { const u = corpo.lastElementChild; return u ? u.offsetTop + u.offsetHeight - corpo.offsetTop : 0; };
        function folha(tipo) {
            pag++;
            const f = document.createElement('section');
            f.className = 'flo-folha' + (tipo ? ' ' + tipo : '');
            f.innerHTML = `<div class="flo-faixa"><span>${esc(capAtual)}</span></div><div class="flo-corpo"></div>
                <div class="flo-rod"><span>Laudo neuropsicológico · ${esc(nome)}</span><span>Equilibrium Med Center · documento sigiloso</span><b>${pag}</b></div>`;
            caixa.appendChild(f);
            corpo = f.querySelector('.flo-corpo');
            return f;
        }
        const estoura = () => corpo.scrollHeight > corpo.clientHeight + 1;
        const vazio = () => !corpo.children.length;
        function por(el, prof) {
            corpo.appendChild(el); if (!estoura()) return;
            corpo.removeChild(el);
            const livre = corpo.clientHeight - usado();
            const quebrar = el.children.length >= 2 && livre > corpo.clientHeight * 0.33 && prof < 3;
            if (!vazio() && !quebrar) { folha(); corpo.appendChild(el); if (!estoura()) return; corpo.removeChild(el); }
            const filhos = [...el.children];
            if (filhos.length < 2 || prof > 3) { corpo.appendChild(el); folha(); return; }
            const nova = () => { const e = el.cloneNode(false); e.classList.add('flo-cont'); corpo.appendChild(e); return e; };
            let emb = nova();
            filhos.forEach(k => {
                emb.appendChild(k);
                if (!estoura()) return;
                emb.removeChild(k);
                if (!emb.children.length) corpo.removeChild(emb);
                folha(); emb = nova(); emb.appendChild(k);
                if (estoura()) { emb.removeChild(k); corpo.removeChild(emb); por(k, prof + 1); emb = nova(); }
            });
            if (!emb.children.length) corpo.removeChild(emb);
        }
        function copia(el) {
            const c = el.cloneNode(true);
            c.classList.remove('pre');
            c.querySelectorAll('.pre').forEach(x => x.classList.remove('pre'));
            c.querySelectorAll('button.p-btn, .p-rolar, [data-gaveta], .p-compl-btn').forEach(x => x.remove());
            c.querySelectorAll('[tabindex]').forEach(x => x.removeAttribute('tabindex'));
            // no papel o mapa mostra todos os domínios, não só o escolhido
            c.querySelectorAll('.p-mapa').forEach(m => {
                let L = []; try { L = JSON.parse(m.dataset.mapa || '[]'); } catch (e) { L = []; }
                const rot = { ok: 'Preservado', at: 'Atenção', cr: 'Comprometido' };
                const info = m.querySelector('.p-mapa-info');
                if (info) info.innerHTML = `<div class="flo-mapa">${L.map(l => `<div class="flo-mapa-l st-${l.st}"><b>${esc(l.dominio)}</b><span class="flo-mapa-st">${rot[l.st] || ''}</span><p>${l.desempenho || ''}</p></div>`).join('')}</div>`;
            });
            if (modelo !== 'escuro') c.querySelectorAll('.p-graf').forEach(x => { x.classList.remove('p-graf'); x.classList.add('flo-graf'); });
            return c;
        }

        folha('capa');
        const hero = src.querySelector('.p-hero');
        if (hero) corpo.appendChild(copia(hero));
        const caps = [...src.querySelectorAll('.p-cap')];
        caps.forEach((cap, i) => {
            const n = cap.querySelector('.p-cap-n').textContent, tit = cap.querySelector('.p-cap-tit').textContent, sec = cap.querySelector('.p-cap-sec').textContent;
            capAtual = `${n} · ${tit}`;
            if (i === 0 || modelo === 'revista' || usado() > corpo.clientHeight * 0.6) folha('nova');
            const ab = document.createElement('div'); ab.className = 'flo-capab';
            ab.innerHTML = `<span class="flo-capn">${esc(n)}</span><div><h2>${esc(tit)}</h2><small>${esc(sec)}</small></div>`;
            por(ab, 0);
            [...cap.querySelector('.p-cap-corpo').children].forEach(k => por(copia(k), 0));
        });
        // folha que ficou vazia no fim
        if (vazio() && pag > 1) { corpo.closest('.flo-folha').remove(); pag--; }
        const rod = src.querySelector('.p-rodape');
        fonte.remove();
        return { paginas: pag, rodape: rod ? rod.textContent : '' };
    }

    window.LaudoFolhasOnline = { desenhar, MODELOS };
})();

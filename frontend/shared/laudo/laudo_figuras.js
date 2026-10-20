/* ============================================================================
   CORTEX · Laudo Online — FIGURAS DAS TELAS DE CORREÇÃO
   (frontend/shared/laudo/laudo_figuras.js) · sprint LO-6
   ----------------------------------------------------------------------------
   As telas de correção já oferecem 📷 (só o cabeçalho) e 📋 (cada tabela,
   gráfico ou cartão) para colar no Word. Aqui o Laudo Online faz o mesmo
   sozinho: abre a tela de correção do teste num quadro escondido, espera
   desenhar, fotografa em alta resolução o cabeçalho e cada bloco copiável
   (os mesmos que recebem o 📋) e guarda as imagens no bucket laudos-midia.
   O resultado vai para doc.figuras[SIGLA] e é congelado na finalização.

   Nada é recalculado aqui: é a própria tela de correção que desenha.
   Uso (só admin clínico, laudo em construção):
     LaudoFiguras.capturar({ client, pacienteId, laudoId, aplicacoes:[{id,sigla}], aoProgresso })
       → { figuras: { SIGLA: {...} }, erros: { SIGLA: 'motivo' } }
   ============================================================================ */
(function () {
    'use strict';

    const ESCALA = 2.5;            // alta resolução (o 📋 das telas usa 3)
    const LIMITE_BYTES = 4.6 * 1024 * 1024;
    const OVERRIDES = {            // mesmos desvios da convenção usados na bateria
        'SCARED-A': 'scared/scared_resultado.html',
        'SCARED-H': 'scared/scared_resultado.html',
        'BPA-2': 'bpa2/bpa2_laudo.html',       // a tela do crivo não tem laudo; o laudo do BPA-2 é esta (LO-7)
        'BPA2': 'bpa2/bpa2_laudo.html'
    };
    const BASE = (function () {
        const s = document.currentScript && document.currentScript.src;
        return s ? s.replace(/shared\/laudo\/[^/]*$/, 'correcao/') : '../correcao/';
    })();

    const slug = sigla => String(sigla || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    function urlDa(sigla, aplicacaoId) {
        const rel = OVERRIDES[sigla] || `${slug(sigla)}/${slug(sigla)}_resultado.html`;
        return `${BASE}${rel}?aplicacao_id=${encodeURIComponent(aplicacaoId)}&laudo_figuras=1`;
    }

    const espera = ms => new Promise(r => setTimeout(r, ms));

    function abrirQuadro(url) {
        return new Promise(resolve => {
            const f = document.createElement('iframe');
            f.setAttribute('aria-hidden', 'true');
            f.tabIndex = -1;
            f.style.cssText = 'position:fixed;left:-14000px;top:0;width:1240px;height:1800px;border:0;opacity:1;pointer-events:none;';
            f.addEventListener('load', () => resolve(f), { once: true });
            f.src = url;
            document.body.appendChild(f);
        });
    }

    // Espera a tela terminar: .laudo desenhado, html2canvas presente e os 📋 colocados.
    async function esperarTela(f, limite) {
        const t0 = Date.now();
        let ultimoN = -1, estavel = 0;
        while (Date.now() - t0 < limite) {
            const w = f.contentWindow, d = f.contentDocument;
            if (d) {
                const laudo = d.querySelector('.laudo, .laudo-header');
                const erro = d.querySelector('#erro:not([hidden]), .erro-estado, .laudo-erro');
                if (erro && erro.offsetParent !== null && !laudo) throw new Error((erro.textContent || 'erro na tela de correção').trim().slice(0, 140));
                // telas de resultados lançados (LO-7) ainda sem números
                if (!laudo && d.body && d.body.dataset.lancamentoPendente === '1') throw new Error('os resultados ainda não foram lançados na tela do teste (abra pela bateria e digite os números do relatório)');
                // telas que mostram o erro só como texto ("Erro: Norma … não cadastrada")
                if (!laudo && Date.now() - t0 > 5000 && d.body) {
                    const m = /Erro:?\s*([^\n]{3,140})/.exec(d.body.innerText || '');
                    if (m) throw new Error('a tela de correção deu erro: ' + m[1].trim());
                }
                if (laudo && w.html2canvas) {
                    const n = d.querySelectorAll('.cortex-copyable').length;
                    if (n === ultimoN) estavel++; else { estavel = 0; ultimoN = n; }
                    if (estavel >= 3 && (n > 0 || Date.now() - t0 > 6000)) return;
                }
            }
            await espera(400);
        }
        throw new Error('a tela de correção não terminou de abrir');
    }

    // Texto do título de seção, sem a etiqueta numérica e sem a dica ao lado.
    function textoTitulo(t) {
        const c = t.cloneNode(true);
        c.querySelectorAll('.laudo-secao-tag, .laudo-secao-hint').forEach(x => x.remove());
        return (c.textContent || '').replace(/\s+/g, ' ').trim();
    }
    // Título do bloco: o título da seção do laudo que vem antes dele.
    function tituloDe(el) {
        const proprio = el.querySelector('h2, h3, h4, [class*="-titulo"]');
        let n = el;
        while (n && !n.classList.contains('laudo')) {
            let p = n.previousElementSibling;
            while (p) {
                if (p.classList && p.classList.contains('laudo-secao-titulo')) return textoTitulo(p);
                const dentro = p.querySelectorAll && p.querySelectorAll('.laudo-secao-titulo');
                if (dentro && dentro.length) return textoTitulo(dentro[dentro.length - 1]);
                p = p.previousElementSibling;
            }
            n = n.parentElement;
        }
        return proprio ? (proprio.textContent || '').trim().slice(0, 80) : 'Bloco';
    }
    function tipoDe(el) {
        if (el.matches('canvas') || el.querySelector('canvas, svg')) return 'grafico';
        if (el.matches('table') || el.querySelector('table') || /tab/i.test(el.className)) return 'tabela';
        return 'quadro';
    }

    async function fotografar(w, el, escala) {
        const canvas = await w.html2canvas(el, {
            scale: escala, backgroundColor: '#ffffff', useCORS: true, logging: false,
            ignoreElements: n => n.classList && (n.classList.contains('cortex-copy-btn') || n.classList.contains('cortex-copy-laudo-btn'))
        });
        const blob = await new Promise((ok, ko) => canvas.toBlob(b => b ? ok(b) : ko(new Error('falha ao gerar a imagem')), 'image/png'));
        return { blob, w: canvas.width / escala, h: canvas.height / escala };
    }

    async function capturarUma(o, apl) {
        // teste sem tela de correção no CORTEX (ex.: aplicado fora): avisa logo, sem esperar
        try {
            const h = await fetch(urlDa(apl.sigla, apl.id).replace(/\?.*$/, ''), { method: 'HEAD', cache: 'no-store' });
            if (h.status === 404) throw new Error('este teste não tem tela de correção no CORTEX');
        } catch (e) { if (/não tem tela/.test(e.message)) throw e; }
        const f = await abrirQuadro(urlDa(apl.sigla, apl.id));
        try {
            await esperarTela(f, 25000);
            const w = f.contentWindow, d = f.contentDocument;
            // sem animação e sem os botões de copiar na foto
            const st = d.createElement('style');
            // sem animação, sem os botões de copiar e sem dados de identificação (nome, nascimento)
            st.textContent = '*,*::before,*::after{animation:none!important;transition:none!important}.cortex-copy-btn,.cortex-copy-laudo-btn,.laudo-identificacao,[class*="-identif"],.laudo-rodape,.laudo-acoes-topo,.resultado-acoes-topo{display:none!important}';
            d.head.appendChild(st);
            // A foto é montada numa cópia da página; endereços relativos (../../styles/…) precisam
            // ficar completos, senão a cópia procura os estilos a partir do Laudo Online e sai sem formatação.
            const base = d.createElement('base'); base.href = w.location.href; d.head.insertBefore(base, d.head.firstChild);
            d.querySelectorAll('link[href]').forEach(l => l.setAttribute('href', l.href));
            d.querySelectorAll('img[src]').forEach(i => i.setAttribute('src', i.src));
            d.body.classList.add('cortex-copiando', 'exportando');
            await espera(300);

            const alvos = [];
            const cab = d.querySelector('.laudo-header');
            if (cab) alvos.push({ el: cab, chave: 'cabecalho', titulo: 'Cabeçalho', tipo: 'cabecalho' });
            [...d.querySelectorAll('.cortex-copyable')].filter(el => !el.closest('.laudo-header')).forEach((el, i) => {
                alvos.push({ el, chave: 'b' + String(i + 1).padStart(2, '0'), titulo: tituloDe(el), tipo: tipoDe(el), classe: String(el.className || '').replace(/cortex-copyable/g, '').trim() });
            });
            // Seções da tela sem nenhum 📋 (ex.: réguas de gravidade) também viram figura, com o título da seção.
            const corpoLaudo = d.querySelector('.laudo-body');
            if (corpoLaudo) {
                let grupo = null; const grupos = [];
                [...corpoLaudo.children].forEach(el => {
                    if (el.classList.contains('laudo-secao-titulo')) { grupo = { titulo: el, els: [] }; grupos.push(grupo); }
                    else if (grupo) grupo.els.push(el);
                });
                grupos.forEach((g, k) => {
                    const nome = textoTitulo(g.titulo);
                    if (/identifica/i.test(nome)) return;
                    const visiveis = g.els.filter(el => el.getBoundingClientRect().height > 4 && !el.matches('.laudo-identificacao, [class*="-identif"]'));
                    if (!visiveis.length || visiveis.some(el => el.matches('.cortex-copyable') || el.querySelector('.cortex-copyable'))) return;
                    const caixa = d.createElement('div');
                    caixa.className = 'lo-fig-secao';
                    visiveis[0].parentNode.insertBefore(caixa, visiveis[0]);
                    visiveis.forEach(el => caixa.appendChild(el));
                    alvos.push({ el: caixa, chave: 's' + String(k + 1).padStart(2, '0'), titulo: nome, tipo: tipoDe(caixa), classe: visiveis.map(el => el.className).join(' ') });
                });
                const ordem = (x, y) => (x.el.compareDocumentPosition(y.el) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1;
                const cabA = alvos.filter(x => x.chave === 'cabecalho'), resto = alvos.filter(x => x.chave !== 'cabecalho').sort(ordem);
                alvos.length = 0; alvos.push(...cabA, ...resto);
            }
            // Tela sem 📋 por bloco: o resultado inteiro vira uma figura (sem identificação, escondida acima).
            if (alvos.length <= 1) {
                const corpo = d.querySelector('.laudo-body') || d.querySelector('.laudo') || d.querySelector('#laudo-conteudo');
                if (corpo) alvos.push({ el: corpo, chave: 'b01', titulo: 'Resultado completo', tipo: 'quadro', classe: 'resultado-completo' });
            }
            if (!alvos.length) throw new Error('a tela não tem cabeçalho nem blocos de laudo');
            // Partes com o mesmo título (ex.: um cartão por escala): acrescenta o nome do próprio cartão.
            const vezes = {};
            alvos.forEach(x => { vezes[x.titulo] = (vezes[x.titulo] || 0) + 1; });
            const contagem = {};
            alvos.forEach(x => {
                if (x.chave === 'cabecalho' || vezes[x.titulo] < 2) return;
                contagem[x.titulo] = (contagem[x.titulo] || 0) + 1;
                const gt = x.el.querySelector('[class*="grafico-tit"]');
                const h = gt || (/(^|\s)\S*cards(\s|$)/.test(x.el.className || '') ? null : x.el.querySelector('h1, h2, h3, h4, h5, [class*="titulo"], [class*="nome"], [class*="-header"], [class*="label"], strong'));
                let proprio = h ? (h.textContent || '').trim().split('\n')[0].replace(/\s+/g, ' ').slice(0, 50) : '';
                if (!proprio && /cards/.test(x.el.className || '')) proprio = 'cartões';
                x.titulo = `${x.titulo} — ${proprio && proprio.toLowerCase() !== x.titulo.toLowerCase() ? proprio : contagem[x.titulo]}`;
            });

            const blocos = [], falhas = [];
            for (const a of alvos) {
                const r = a.el.getBoundingClientRect();
                if (r.width < 4 || r.height < 4) continue;          // bloco escondido na tela
                let foto;
                try {
                    foto = await fotografar(w, a.el, ESCALA);
                    if (foto.blob.size > LIMITE_BYTES) foto = await fotografar(w, a.el, 1.5);
                } catch (e) { falhas.push(a.titulo); console.warn('[figuras] bloco', apl.sigla, a.titulo, e); continue; }
                const arquivo = `${o.pacienteId}/${o.laudoId}/fig/${apl.id}/${a.chave}.png`;
                const up = await o.client.storage.from('laudos-midia').upload(arquivo, foto.blob, { contentType: 'image/png', upsert: true });
                if (up.error) throw new Error('não consegui guardar a imagem: ' + up.error.message);
                blocos.push({ chave: a.chave, titulo: a.titulo, tipo: a.tipo, classe: a.classe || '', arquivo, w: Math.round(foto.w), h: Math.round(foto.h) });
            }
            if (!blocos.length) throw new Error('nenhum bloco pôde ser fotografado');
            return {
                falhas,
                aplicacao_id: apl.id, pagina: urlDa(apl.sigla, '').replace(BASE, '').replace(/\?.*$/, ''),
                capturado_em: new Date().toISOString(), blocos
            };
        } finally {
            f.remove();
        }
    }

    async function capturar(o) {
        const figuras = {}, erros = {};
        const lista = o.aplicacoes || [];
        for (let i = 0; i < lista.length; i++) {
            const a = lista[i];
            if (o.aoProgresso) o.aoProgresso(i, lista.length, a.sigla, 'abrindo a tela de correção…');
            try {
                figuras[a.sigla] = await capturarUma(o, a);
                if (o.aoProgresso) o.aoProgresso(i + 1, lista.length, a.sigla, `${figuras[a.sigla].blocos.length} figura(s)`);
            } catch (e) {
                console.warn('[figuras]', a.sigla, e);
                erros[a.sigla] = e.message || String(e);
                if (o.aoProgresso) o.aoProgresso(i + 1, lista.length, a.sigla, 'não deu: ' + erros[a.sigla]);
            }
        }
        return { figuras, erros };
    }

    window.LaudoFiguras = { capturar, urlDa, slug };
})();

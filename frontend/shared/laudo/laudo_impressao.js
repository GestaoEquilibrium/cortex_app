/* ============================================================================
   CORTEX · Laudo Online — MODELO DE IMPRESSÃO (A4)
   (frontend/shared/laudo/laudo_impressao.js)
   ----------------------------------------------------------------------------
   Documento 1 §9.1 e Documento 3 §6.3. Lê o documento cortex-laudo 2.0 e
   desenha folhas A4 no padrão dos laudos finalizados: capa com logo e faixa,
   cabeçalho e rodapé em todas as páginas (com assinatura), crachá, QR
   "Acompanhe este paciente", blocos do CORTEX com dados do banco e
   fechamento com convite.
   Pagina sozinho: mede cada pedaço numa folha invisível da mesma largura;
   respeita quebra_antes, quebra_pagina e manter_com_proximo; parágrafo que
   não cabe é dividido entre frases; tabela com dividir_tabela é dividida entre
   linhas (cabeçalho repetido); título nunca fica sozinho no pé.
   A tela mostra exatamente o que sai no "Salvar como PDF" do navegador.
   Expõe: window.LaudoImpressao.desenhar(doc, alvo, ctx) → Promise<{ paginas }>
   ============================================================================ */
(function () {
    'use strict';
    const C = () => window.LaudoCore, G = () => window.LaudoGraf;
    const esc = s => C().esc(s);
    const A4 = { w: 794, h: 1123, mt: 94, mb: 76, ml: 94, mr: 76 };   // 96 dpi · margens 2,5 / 2 / 2,5 / 2 cm
    const CORPO_W = A4.w - A4.ml - A4.mr, CORPO_H = A4.h - A4.mt - A4.mb;
    // Ventinho (mascote) travado no pé da 1ª folha depois da capa (Identificação), antes do rodapé
    const VENT = { h: 120, gap: 12 };
    const comVentinho = doc => (((doc.layout || {}).impressao) || {}).ventinho !== false;
    const BASE = (function () {
        const s = document.currentScript && document.currentScript.src;
        return s ? s.replace(/[^/]*$/, '') : '../shared/laudo/';
    })();

    function qrSVG(texto, lado) {
        if (typeof window.qrcode !== 'function' || !texto) return `<div class="qr-vazio" style="width:${lado}px;height:${lado}px">QR</div>`;
        const q = window.qrcode(0, 'M'); q.addData(texto); q.make();
        const n = q.getModuleCount(); let d = '';
        for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
        return `<svg class="qr" viewBox="-2 -2 ${n + 4} ${n + 4}" width="${lado}" height="${lado}" shape-rendering="crispEdges" aria-label="QR Code"><rect x="-2" y="-2" width="${n + 4}" height="${n + 4}" fill="#fff"/><path d="${d}" fill="#0F172A"/></svg>`;
    }

    const visivelNaImpressao = b => b && !b.oculto && b.exibir !== 'online' && b.tipo !== 'conteudo_gerador';

    // ── documento → pedaços (chunks) para paginar ────────────────────────────
    function pedacos(doc, ctx) {
        const out = [];
        const pac = ctx.pac;
        const I = t => C().inline(t, pac, { impressao: true });
        let blocoAtual = null, secaoAtual = null, fixarAtual = null;
        // fixar_folha: 'baixo' (vai para o pé da folha) ou 'meio' (fica no meio do espaço que sobra);
        // o que vem depois começa na folha seguinte
        const add = (html, o) => out.push(Object.assign({ html, manter: false, dividir: false, quebra: false, bloco: blocoAtual, secaoId: secaoAtual, fixar: fixarAtual }, o || {}));
        // Tabela automática: com "Dividir tabela entre páginas" ligado, as linhas que não cabem
        // seguem na folha seguinte com o cabeçalho da tabela repetido (sem buraco em branco).
        const addTab = (b, abre, linhas, depois, o) => {
            const tab = { abre, linhas, fecha: '</tbody></table>', depois: depois || '' };
            const html = abre + linhas.join('') + tab.fecha + tab.depois;
            if (b.dividir_tabela && linhas.length > 1) add(html, Object.assign(o, { dividir: true, tab }));
            else add(html, o);
        };
        ctx.omitidos = [];
        const textos = doc.textos || {};
        const resp = textos.responsavel || window.LaudoModeloPadrao.RESP;
        const registro = textos.registro || window.LaudoModeloPadrao.CRP;

        (doc.secoes || []).forEach((sec, si) => {
            if (sec.oculta) return;
            const blocos = (sec.blocos || []).filter(visivelNaImpressao);
            blocoAtual = null; secaoAtual = sec.id; fixarAtual = null;
            add(`<h2 class="i-h2" id="i-sec-${esc(sec.id)}">${esc(sec.n)}. ${esc(sec.titulo)}</h2>`,
                { manter: true, secao: sec.n, quebra: !!sec.quebra_antes || si === 0 });
            for (let i = 0; i < blocos.length; i++) {
                const b = blocos[i];
                blocoAtual = b.id;
                fixarAtual = b.fixar_folha === 'baixo' || b.fixar_folha === 'meio' ? b.fixar_folha : null;
                const o = { quebra: !!b.quebra_antes, manter: !!b.manter_com_proximo };
                switch (b.tipo) {
                    case 'titulo':
                        add(Number(b.nivel) === 4 ? `<h4 class="i-h4" data-ed="texto">${I(b.texto)}</h4>` : `<h3 class="i-h3" data-ed="texto">${I(b.texto)}</h3>`, Object.assign(o, { manter: b.manter_com_proximo !== false })); break;
                    case 'paragrafo': add(`<p class="i-p" data-ed="texto">${I(b.texto)}</p>`, Object.assign(o, { dividir: !o.manter })); break;
                    case 'meta': add(`<p class="i-meta" data-ed="texto">${I(b.texto)}</p>`, Object.assign(o, { manter: true })); break;
                    case 'nota': add(`<p class="i-nota" data-ed="texto">${I(b.texto)}</p>`, o); break;
                    case 'alerta': add(`<div class="i-alerta${b.nivel === 'vermelho' ? ' verm' : ''}">⚠️ <span data-ed="texto">${I(b.texto)}</span></div>`, o); break;
                    case 'caixa': {
                        const ps = b.paragrafos || [];
                        if (b.titulo) add(`<div class="i-box ini ${esc(b.estilo || 'azul')}"><p class="i-box-tit" data-ed="titulo">${I(b.titulo)}</p></div>`, Object.assign({}, o, { manter: true }));
                        ps.forEach((p, k) => add(`<div class="i-box ${esc(b.estilo || 'azul')}${!b.titulo && k === 0 ? ' ini' : ''}${k === ps.length - 1 ? ' fim' : ''}"><p class="i-p" data-ed="paragrafos:${k}">${I(p)}</p></div>`, k === 0 && !b.titulo ? o : {}));
                        break;
                    }
                    case 'lista': {
                        const num = b.estilo !== 'marcadores';
                        (b.itens || []).forEach((it, k) => add(`<div class="i-li"><span>${num ? (k + 1) + '.' : '•'}</span><p class="i-p" data-ed="itens:${k}">${I(it)}</p></div>`, k === 0 ? o : {}));
                        break;
                    }
                    case 'padrao': {
                        const paras = String(b.texto || '').split(/\n{2,}/).filter(x => x.trim());
                        if (b.chave === 'nota_tecnica_81') paras.forEach((p, k) => add(`<div class="i-box${k === 0 ? ' ini' : ''}${k === paras.length - 1 ? ' fim' : ''}"><p class="i-p" data-ed="par:${k}">${I(p)}</p></div>`, k === 0 ? o : {}));
                        else paras.forEach((p, k) => add(`<p class="i-p" data-ed="par:${k}">${I(p)}</p>`, Object.assign(k === 0 ? o : {}, { dividir: true })));
                        break;
                    }
                    case 'campos': {
                        let linhas = (b.linhas || []).map(l => [I(l.rotulo), I(l.valor)]);
                        if (String(sec.n) === '1' || sec.id === 's1') {
                            linhas = [['Data de nascimento', esc(C().dataBR(pac.paciente.data_nascimento))]].concat(linhas)
                                .concat([['Profissional Responsável', esc(`${resp} — Neuropsicólogo — ${registro}`)]]);
                        }
                        addTab(b, '<table class="i-campos"><tbody>', linhas.map(l => `<tr><th scope="row">${l[0]}</th><td>${l[1]}</td></tr>`), '', o); break;
                    }
                    case 'cracha': {
                        const p = pac.paciente;
                        add(`<div class="i-cracha"><div><p class="i-cr-nome">${esc(p.nome_completo)}</p><p><b>Idade na Avaliação:</b> ${esc(pac.idade)} - <b>Sexo:</b> ${esc(p.sexo || '')}</p><p><b>Escolaridade:</b> ${esc(p.escolaridade || '—')}</p></div>
                            ${p.foto_assinada ? `<img class="i-cr-foto" src="${esc(p.foto_assinada)}" alt="">` : ''}</div>`, o); break;
                    }
                    case 'acompanhe':
                        add(`<div class="i-qrbloco"><div class="i-qrcol">${qrSVG(ctx.linkProntuario, 92)}<span>Escaneie aqui</span></div>
                            <div><p class="i-chips"><span>CFP 06/2019</span><span>LGPD</span><span class="v">Acesso auditado</span></p><p class="i-qrtit">Acompanhe este paciente</p><p class="i-qrtxt">${esc(b.texto || '')}</p></div></div>`, o); break;
                    case 'tabela_instrumentos': {
                        const marca = { complementar: '†', sem_peso: '‡' };
                        addTab(b, '<table class="i-tab i-instr"><thead><tr><th>Instrumento</th><th>Domínio Avaliado</th></tr></thead><tbody>',
                            (b.linhas || []).map(l => `<tr><td class="n">${esc(l.nome || l.sigla)}${marca[l.status] ? ' ' + marca[l.status] : ''}</td><td class="d">${esc(l.dominio || '')}</td></tr>`), '', o); break;
                    }
                    case 'classificacao_qi':
                        // mesmo desenho da tabela pronta das Ferramentas de Laudo
                        addTab(b, C().QI_ABRE, (b.linhas || []).map(C().qiLinha),
                            `<p class="i-nota">OBS. Legenda de classificação nas tabelas: para facilitar a compreensão, os resultados são sinalizados por cores.</p>`, o); break;
                    case 'resultado': {
                        // Resultado sem dado no banco (teste não aplicado ou não corrigido) não vai para o PDF.
                        const falta = G().indisponivel(b, ctx.banco);
                        if (falta) { ctx.omitidos.push(falta); break; }
                        // Dois resultados seguidos com largura "metade" saem lado a lado.
                        const prox = blocos[i + 1];
                        if ((b.opcoes || {}).largura === 'metade' && prox && prox.tipo === 'resultado' && (prox.opcoes || {}).largura === 'metade' && !prox.quebra_antes && !G().indisponivel(prox, ctx.banco)) {
                            add(`<div class="i-par"><div>${G().render(b, ctx.banco, ctx)}</div><div>${G().render(prox, ctx.banco, ctx)}</div></div>`, o);
                            i++;
                        } else {
                            add(G().render(b, ctx.banco, ctx), Object.assign(o, { manter: o.manter || b.vista === 'cabecalho' }));
                        }
                        break;
                    }
                    case 'tabela': {
                        const cab = b.cabecalho || [];
                        const larg = Array.isArray(b.larguras) ? `<colgroup>${b.larguras.map(w => `<col style="width:${esc(w)}">`).join('')}</colgroup>` : '';
                        // cor de fundo pela classificação, selo, cor do texto e negrito (LaudoCore.celulaTabela)
                        const cel = (txt, k) => {
                            const c = C().celulaTabela(b, txt, k), st = c.css ? ` style="${c.css}"` : '';
                            if (c.selo) return `<td><span class="cl-selo cl-${c.fundo}"${st}>${I(c.texto)}</span></td>`;
                            return `<td${c.fundo ? ` class="cl cl-${c.fundo}"` : ''}${st}>${I(c.texto)}</td>`;
                        };
                        addTab(b, `<table class="i-tab i-tabx">${larg}<thead><tr>${cab.map(h => `<th>${I(h)}</th>`).join('')}</tr></thead><tbody>`,
                            (b.linhas || []).map(l => `<tr>${l.map((c, k) => cel(c, k)).join('')}</tr>`), b.nota ? `<p class="i-nota">${I(b.nota)}</p>` : '', o);
                        break;
                    }
                    case 'fidedignidade':
                        add(`<h4 class="i-h4">Fidedignidade do QIT — Análise de Discrepância Indicial</h4>`, Object.assign(o, { manter: true }));
                        (b.paragrafos || []).forEach((p, k) => add(`<p class="i-p i-fided" data-ed="paragrafos:${k}">${I(p)}</p>`, { dividir: true })); break;
                    case 'hipotese': {
                        const cods = (Array.isArray(b.codigos) ? b.codigos : [b.codigos]).filter(Boolean).concat(b.confianca ? [`Nível de Confiança: ${b.confianca}`] : []).join(' | ');
                        const rot = { criterios: 'Critérios', evidencias: 'Evidências', contraponto: 'Contraponto', acao: 'Ação' };
                        add(`<div class="i-hip"><p class="i-hip-n">${I(b.nome)}</p><p class="i-hip-c">${esc(cods)}</p>${Object.keys(rot).filter(k => b[k]).map(k => `<p class="i-p"><b>${rot[k]}:</b> ${I(b[k])}</p>`).join('')}</div>`, o); break;
                    }
                    case 'afastada': add(`<p class="i-p"><b>${I(b.condicao)} — afastada.</b> ${I(b.motivo)}${b.fonte ? ` Fonte: ${I(b.fonte)}.` : ''}</p>`, Object.assign(o, { dividir: true })); break;
                    case 'mapa': {
                        const st = { preservado: 'ok', atencao: 'at', comprometido: 'cr' };
                        addTab(b, '<table class="i-tab i-mapa"><thead><tr><th>Status</th><th>Domínio</th><th>Desempenho</th><th>Instrumentos Principais</th></tr></thead><tbody>',
                            (b.linhas || []).map(l => `<tr class="m-${st[l.status] || 'at'}"><td><span class="m-dot"></span></td><td><b>${I(l.dominio)}</b></td><td>${I(l.desempenho)}</td><td class="m-ins">${I(l.instrumentos)}</td></tr>`), '', o); break;
                    }
                    case 'referencias': (b.itens || []).forEach((r, k) => add(`<p class="i-ref" data-ed="itens:${k}">${I(r)}</p>`, k === 0 ? o : {})); break;
                    case 'imagem': {
                        const url = (ctx.imagens || {})[b.arquivo];
                        const w = { inteira: '100%', metade: '50%', terco: '33%' }[b.largura] || '100%';
                        add(`<figure class="i-fig">${url ? `<img src="${esc(url)}" alt="${esc(C().plano(b.legenda || '', pac))}" style="width:${w}">` : `<div class="i-fig-vazia">Imagem indisponível</div>`}${b.legenda ? `<figcaption>${I(b.legenda)}</figcaption>` : ''}</figure>`, o); break;
                    }
                    case 'local_data':
                        add(`<p class="i-p i-local">${esc(b.cidade || textos.cidade || 'Uberlândia — MG')}, ${esc(C().dataExtenso((doc.meta || {}).data_emissao || new Date().toISOString().slice(0, 10)))}.</p>`, o); break;
                    case 'assinatura':
                        add(`<div class="i-assin">${ctx.assinaturaImg ? `<img class="i-assin-img" src="${esc(ctx.assinaturaImg)}" alt="">` : ''}<span class="i-assin-linha"></span><p class="i-assin-nome">${esc(b.nome || resp)}</p><p class="i-assin-crp">${esc(b.registro || registro)}</p>
                            ${b.mostrar_logo !== false ? `<img class="i-assin-logo" src="${BASE}img/logo.png" width="150" height="134" alt="Equilibrium">` : ''}</div>`, Object.assign(o, { manter: false })); break;
                    case 'convite': {
                        const texto = String(b.texto || '');
                        add(`<div class="i-qrbloco i-convite"><div class="i-qrcol">${qrSVG(b.link || textos.link_convite, 112)}<span>Escaneie aqui</span></div>
                            <div><p class="i-chips"><span class="estrelas">★★★★★</span><span class="am">Avalie no Google</span></p><p class="i-qrtit grande">Sua opinião faz a diferença!</p>
                            <p class="i-qrtxt">${esc(texto)}</p></div></div>`, o); break;
                    }
                    case 'quebra_pagina': add('', { quebra: true, vazio: true }); break;
                    case 'espaco': add(`<div class="i-espaco ${esc(b.altura || 'm')}"></div>`, o); break;
                    default:
                        add(`<div class="i-alerta">Bloco não reconhecido (${esc(b.tipo)}). O conteúdo está guardado no laudo.</div>`, o);
                }
            }
        });
        return out;
    }

    // ── divisão de parágrafo entre frases (fora de tags) ─────────────────────
    function frases(html) {
        const cortes = []; let prof = 0, dentro = false;
        for (let i = 0; i < html.length; i++) {
            const ch = html[i];
            if (ch === '<') { dentro = true; prof += html[i + 1] === '/' ? -1 : (/^<(br|img|input)/i.test(html.slice(i, i + 6)) ? 0 : 1); continue; }
            if (ch === '>') { dentro = false; continue; }
            if (!dentro && prof === 0 && /[.!?:;]/.test(ch) && html[i + 1] === ' ') cortes.push(i + 1);
        }
        const out = []; let a = 0;
        cortes.forEach(c => { out.push(html.slice(a, c)); a = c + 1; });
        out.push(html.slice(a));
        return out.filter(s => s.trim());
    }
    function partirP(htmlP, cabe) {
        const m = /^<p class="([^"]*)"([^>]*)>([\s\S]*)<\/p>$/.exec(htmlP.trim());
        if (!m) return null;
        const fs = frases(m[3]), at = m[2];
        if (fs.length < 2) return null;
        let lo = 0, hi = fs.length - 2, best = 0;
        while (lo <= hi) { const k = (lo + hi) >> 1; if (cabe(`<p class="${m[1]} cont-a"${at}>${fs.slice(0, k + 1).join(' ')}</p>`)) { best = k + 1; lo = k + 1; } else hi = k - 1; }
        if (!best) return null;
        return [`<p class="${m[1]} cont-a"${at}>${fs.slice(0, best).join(' ')}</p>`, `<p class="${m[1]} cont-b"${at}>${fs.slice(best).join(' ')}</p>`];
    }

    // Tabela: quantas linhas cabem (no mínimo 1); o resto vira um pedaço novo com o cabeçalho repetido.
    function partirTab(tab, cabe) {
        const L = tab.linhas;
        let lo = 1, hi = L.length - 1, best = 0;
        while (lo <= hi) { const k = (lo + hi) >> 1; if (cabe(tab.abre + L.slice(0, k).join('') + tab.fecha)) { best = k; lo = k + 1; } else hi = k - 1; }
        if (!best) return null;
        const resto = { abre: tab.abre, linhas: L.slice(best), fecha: tab.fecha, depois: tab.depois };
        return [tab.abre + L.slice(0, best).join('') + tab.fecha, resto.abre + resto.linhas.join('') + resto.fecha + resto.depois, resto];
    }

    // ── paginação ─────────────────────────────────────────────────────────────
    function paginar(ps, medidor, reserva1) {
        // altura útil da folha atual (a 1ª pode ter o Ventinho no pé)
        const lim = () => pags.length === 0 ? CORPO_H - (reserva1 || 0) : CORPO_H;
        const alt = html => { medidor.innerHTML = `<div class="ck">${html}</div>`; return medidor.firstChild.getBoundingClientRect().height; };
        const pags = []; let atual = [], usado = 0;
        // meta: o que começa cada pedaço (para o editor marcar onde a página quebra)
        const metas = [], usos = []; let metaAtual = [];
        const nova = () => { if (atual.length) { pags.push(atual); metas.push(metaAtual.filter(m => !m.fixo)); usos.push(usado); } atual = []; metaAtual = []; usado = 0; };
        const emb = (p, html) => {
            metaAtual.push({ bloco: p.bloco || null, secao: p.secaoId || null, titulo: !!p.secao, cont: !!p.cont, manter: !!p.manter });
            return `<div class="i-ck" data-bloco="${esc(p.bloco || '')}" data-secao="${esc(p.secaoId || '')}"${p.secao ? ' data-titulo-secao="1"' : ''}>${html}</div>`;
        };
        const fila = ps.map(p => Object.assign({}, p, { h: p.vazio ? 0 : alt(p.html) }));
        // trecho fixado: o espaço que sobra na folha entra antes dele (todo = embaixo, metade = no meio)
        const fixarSeFim = i => {
            const p = fila[i];
            if (!p.fixar || !p.bloco) return;
            const prox = fila[i + 1];
            if (prox && prox.bloco === p.bloco && !prox.quebra) return;   // o trecho continua no próximo pedaço
            let k = metaAtual.length - 1;
            while (k > 0 && metaAtual[k - 1].bloco === p.bloco) k--;
            // o título (e o que está "junto do próximo") vai junto com o trecho fixado
            while (k > 0 && metaAtual[k - 1].manter && !metaAtual[k - 1].fixo) k--;
            const sobra = Math.max(0, lim() - usado);
            atual.splice(k, 0, `<div class="i-fixo ${p.fixar}" data-fixo="${p.fixar}" style="height:${Math.floor(p.fixar === 'meio' ? sobra / 2 : sobra)}px"></div>`);
            metaAtual.splice(k, 0, { bloco: null, secao: null, titulo: false, cont: false, fixo: true });
            usado = lim();
            nova();
        };
        for (let i = 0; i < fila.length; i++) {
            const p = fila[i];
            if (p.quebra && atual.length) nova();
            if (p.vazio) continue;
            // "manter com o próximo": a corrente inteira (título → norma → cabeçalho do
            // teste → primeiro bloco de conteúdo) precisa caber; senão abre página
            if (p.manter && !(fila[i - 1] && fila[i - 1].manter && !fila[i - 1].vazio)) {
                let j = i, juntos = 0;
                while (j < fila.length && fila[j].manter && !fila[j].vazio) { juntos += fila[j].h; j++; }
                if (j < fila.length && !fila[j].vazio && !fila[j].quebra) juntos += fila[j].dividir ? Math.min(fila[j].h, fila[j].tab ? 90 : 70) : fila[j].h;
                if (usado + juntos > lim() && atual.length && juntos <= lim()) nova();
            }
            if (usado + p.h <= lim()) { atual.push(emb(p, p.html)); usado += p.h; fixarSeFim(i); continue; }
            if (p.tab && lim() - usado > 60) {
                const sobra = lim() - usado;
                const r = partirTab(p.tab, h => alt(h) <= sobra);
                if (r) { atual.push(emb(p, r[0])); nova(); fila.splice(i + 1, 0, { html: r[1], dividir: r[2].linhas.length > 1, tab: r[2].linhas.length > 1 ? r[2] : null, h: alt(r[1]), bloco: p.bloco, secaoId: p.secaoId, cont: true, fixar: p.fixar }); continue; }
            } else if (p.dividir && lim() - usado > 60) {
                const sobra = lim() - usado;
                const r = partirP(p.html, h => alt(h) <= sobra);
                if (r) { atual.push(emb(p, r[0])); nova(); fila.splice(i + 1, 0, { html: r[1], dividir: true, h: alt(r[1]), bloco: p.bloco, secaoId: p.secaoId, cont: true, fixar: p.fixar }); continue; }
            }
            if (p.tab && atual.length) { nova(); i--; continue; }   // folha nova e tenta dividir de novo nela
            nova();
            atual.push(emb(p, p.html)); usado += p.h;
            fixarSeFim(i);
        }
        if (atual.length) { pags.push(atual); metas.push(metaAtual.filter(m => !m.fixo)); usos.push(usado); }
        pags.meta = metas; pags.usado = usos;
        return pags;
    }

    function textoCabecalho(doc, pac) {
        const imp = ((doc.layout || {}).impressao) || {};
        const modelo = imp.cabecalho || 'Laudo Neuropsicológico — {nome} | {mes_ano}';
        return modelo.replace(/\{nome\}/g, pac.nome).replace(/\{mes_ano\}/g, C().mesAno((doc.meta || {}).data_emissao));
    }

    function capa(doc) {
        const titulo = (doc.meta || {}).titulo_capa || (doc.textos || {}).capa_titulo || 'LAUDO PSICOLÓGICO DE AVALIAÇÃO NEUROPSICOLÓGICO';
        return `<div class="folha capa"><p class="capa-tit">${esc(titulo)}</p>
            <img class="capa-logo" src="${BASE}img/logo.png" alt="Equilibrium Med Center">
            <img class="capa-rod" src="${BASE}img/faixa_capa.png" alt="Grupo Equilibrium — CNPJ 34.032.586/0001-98"></div>`;
    }

    function folha(conteudo, n, doc, ctx, ventinho) {
        const imp = ((doc.layout || {}).impressao) || {};
        const textos = doc.textos || {};
        const resp = textos.responsavel || window.LaudoModeloPadrao.RESP;
        const registro = textos.registro || window.LaudoModeloPadrao.CRP;
        const ass = imp.rodape_assinatura === false ? '' : (ctx.assinaturaImg
            ? `<span class="f-ass com-img"><img src="${esc(ctx.assinaturaImg)}" alt=""><b>${esc(resp)}</b>${esc(registro)}</span>`
            : `<span class="f-ass"><b>${esc(resp)}</b>Psicólogo<br>${esc(registro)}</span>`);
        const vent = ventinho ? `<img class="f-ventinho" src="${BASE}img/ventinho.png" alt="Ventinho, mascote do Grupo Equilibrium" style="height:${VENT.h}px">` : '';
        return `<div class="folha${ventinho ? ' com-ventinho' : ''}"><div class="f-cab">${esc(ctx.cabecalho)}</div><div class="f-corpo" data-lim="${ventinho ? CORPO_H - VENT.h - VENT.gap : CORPO_H}">${conteudo.join('')}</div>${vent}
            <div class="f-rod"><span>${esc(resp)} - Neuropsicólogo - ${esc(registro)} | Página ${n}</span>${ass}</div></div>`;
    }

    function escalar(alvo) {
        const w = alvo.clientWidth || A4.w;
        const s = Math.min(1, (w - 2) / A4.w);
        alvo.style.setProperty('--escala', s.toFixed(4));
    }

    let fontesProntas = null;
    function carregarFontes() {
        if (fontesProntas) return fontesProntas;
        const pesos = ['400 13px Carlito', '700 13px Carlito', 'italic 400 13px Carlito', 'italic 700 13px Carlito', '400 12px Inter', '600 12px Inter', '700 12px Inter', '800 12px Inter'];
        fontesProntas = (document.fonts && document.fonts.load)
            ? Promise.all(pesos.map(p => document.fonts.load(p).catch(() => null))).then(() => document.fonts.ready)
            : Promise.resolve();
        return fontesProntas;
    }
    function carregarImagens(raiz) {
        const imgs = Array.from(raiz.querySelectorAll('img'));
        return Promise.all(imgs.map(im => im.complete ? null : new Promise(r => { im.onload = im.onerror = r; setTimeout(r, 4000); })));
    }

    /**
     * Desenha o laudo em folhas A4 dentro de `alvo`.
     * ctx: { banco, glossario, congelado, linkProntuario, assinaturaImg, imagens }
     */
    async function paginarDoc(doc, ctx) {
        ctx.pac = C().contexto(ctx.banco, doc.meta);
        ctx.cabecalho = textoCabecalho(doc, ctx.pac);
        await carregarFontes();
        const ps = pedacos(doc, ctx);
        let medidor = document.getElementById('i-medidor');
        if (!medidor) {
            medidor = document.createElement('div'); medidor.id = 'i-medidor'; medidor.className = 'imp i-medidor';
            medidor.setAttribute('aria-hidden', 'true'); document.body.appendChild(medidor);
        }
        medidor.style.width = CORPO_W + 'px';
        // imagens precisam ter altura antes de medir
        medidor.innerHTML = ps.map(p => p.html).join('');
        await carregarImagens(medidor);
        const pags = paginar(ps, medidor, comVentinho(doc) ? VENT.h + VENT.gap : 0);
        medidor.innerHTML = '';
        return pags;
    }

    /** Só a conta das páginas, sem desenhar: onde começa cada página (usado pelo editor). */
    async function mapa(doc, ctx) {
        ctx = Object.assign({}, ctx);
        const pags = await paginarDoc(doc, ctx);
        const imp = ((doc.layout || {}).impressao) || {};
        const textos = doc.textos || {};
        const resp = textos.responsavel || window.LaudoModeloPadrao.RESP, registro = textos.registro || window.LaudoModeloPadrao.CRP;
        return { paginas: pags.length, inicio: Number(imp.numerar_desde || 1), meta: pags.meta || [], usado: pags.usado || [], alvo: Number(imp.alvo_paginas || 25),
            altura: CORPO_H, cabecalho: ctx.cabecalho, rodape: `${resp} - Neuropsicólogo - ${registro}`, capa: imp.capa !== false };
    }

    // A conta soma as alturas dos pedaços; na folha as margens se encostam. Aqui o espaço
    // do trecho fixado é acertado pela altura real, para ele ficar exatamente no pé / no meio.
    function acertarFixos(alvo) {
        alvo.querySelectorAll('.i-fixo').forEach(f => {
            const corpo = f.closest('.f-corpo'); if (!corpo) return;
            const atual = parseFloat(f.style.height) || 0;
            const resto = (Number(corpo.dataset.lim) || CORPO_H) - (corpo.offsetHeight - atual);   // o que sobra na folha sem o espaço
            f.style.height = Math.max(0, Math.floor(f.dataset.fixo === 'meio' ? resto / 2 : resto)) + 'px';
        });
    }

    async function desenhar(doc, alvo, ctx) {
        ctx = Object.assign({}, ctx);
        const pags = await paginarDoc(doc, ctx);
        const imp = ((doc.layout || {}).impressao) || {};
        const inicio = Number(imp.numerar_desde || 1);
        const folhas = (imp.capa === false ? [] : [capa(doc)]).concat(pags.map((c, i) => folha(c, i + inicio, doc, ctx, i === 0 && comVentinho(doc))));
        alvo.classList.add('imp');
        alvo.innerHTML = `<div class="folhas">${folhas.map(f => `<div class="folha-quadro">${f}</div>`).join('')}</div>`;
        escalar(alvo);
        await carregarImagens(alvo);
        acertarFixos(alvo);
        return { paginas: pags.length, folhas: folhas.length, alvo: Number(imp.alvo_paginas || 25), omitidos: Array.from(new Set(ctx.omitidos || [])) };
    }

    window.LaudoImpressao = { desenhar, mapa, escalar, qrSVG, A4, BASE, pedacos };
})();

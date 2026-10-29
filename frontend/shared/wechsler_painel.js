/* ============================================================================
   CORTEX · Painel moderno do WAIS-III e do WISC-IV  (frontend/shared/wechsler_painel.js)
   ----------------------------------------------------------------------------
   Peças visuais da tela de resultados dos dois Wechsler (o mesmo desenho nos dois):
     cartoes      — QI Total e os quatro índices em cartões
     conversao    — PB → ponderado e quanto cada subteste soma em cada índice
     barras       — perfil dos pontos ponderados (barras por domínio)
     indices      — índices e QI com intervalo de confiança (grupos e faixas)
     linha        — perfil dos subtestes em linha
     tabelaIndices, detalhe, discrepancias, fortesFracos
   Só desenha: os números vêm prontos do cálculo (wais_resultados / wisc_resultados).
   As cores vão como cor sólida no estilo (sem color-mix), porque o PDF e o botão
   📋 usam o html2canvas, que não entende color-mix. Pelo mesmo motivo o gráfico em
   linha usa atributos no próprio SVG, e não classes de CSS.
   Os nomes de classe com "-perfil-", "-ic-chart", "-matriz", "-tab-", "-discrep" e
   "-ff-" fazem o 📋 aparecer em cada bloco (copy_to_clipboard.js).
   Expõe: window.WechslerPainel
   ============================================================================ */
(function () {
    'use strict';

    const esc = t => t == null ? '' : String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
    const virg = n => String(n).replace('.', ',');

    // ── cores ────────────────────────────────────────────────────────────────
    function corComp(v) {
        v = Number(v);
        return v >= 130 ? '#047857' : v >= 110 ? '#059669' : v >= 90 ? '#1A56DB' : v >= 80 ? '#D97706' : v >= 70 ? '#DC2626' : '#991B1B';
    }
    function corPond(p) {
        p = Number(p);
        return p >= 16 ? '#047857' : p >= 12 ? '#059669' : p >= 9 ? '#1A56DB' : p >= 7 ? '#D97706' : p >= 4 ? '#DC2626' : '#991B1B';
    }
    function clsComp(s) {
        s = Number(s);
        if (Number.isNaN(s)) return '—';
        if (s >= 130) return 'Muito Superior'; if (s >= 120) return 'Superior'; if (s >= 110) return 'Médio Superior';
        if (s >= 90) return 'Médio'; if (s >= 80) return 'Médio Inferior'; if (s >= 70) return 'Limítrofe'; return 'Extremamente Baixo';
    }
    function clsPond(p) {
        p = Number(p);
        if (Number.isNaN(p)) return '—';
        if (p >= 16) return 'Muito Superior'; if (p >= 14) return 'Superior'; if (p >= 12) return 'Médio Superior';
        if (p >= 9) return 'Médio'; if (p >= 7) return 'Médio Inferior'; if (p >= 4) return 'Limítrofe'; return 'Extremamente Baixo';
    }
    const rgb = h => { h = h.replace('#', ''); return [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16)); };
    /** Cor misturada com branco (k = quanto da cor fica). */
    function claro(h, k) {
        const m = c => Math.round(c * k + 255 * (1 - k));
        return '#' + rgb(h).map(c => m(c).toString(16).padStart(2, '0')).join('');
    }
    const rgba = (h, a) => `rgba(${rgb(h).join(',')},${a})`;
    const CINZA = '#94A3B8';

    /** Selo arredondado na cor da classificação. */
    function pil(txt, cor) {
        return `<span class="cxp-pil" style="color:${cor};background:${claro(cor, .11)};border-color:${claro(cor, .32)}">${esc(txt)}</span>`;
    }

    // Cores de cada coluna da conversão (índices) e de cada domínio: diferentes das cores
    // de classificação, para não confundir "qual índice" com "qual faixa".
    const COR_DOMINIO = ['#4338CA', '#9333EA', '#DB2777', '#0D9488', '#64748B'];

    const NOME_IDX = { ICV: 'Compreensão Verbal', IOP: 'Organização Perceptual', IMO: 'Memória Operacional', IVP: 'Velocidade de Processamento' };

    // ── dados comuns ─────────────────────────────────────────────────────────
    const nomeSub = (cfg, c) => (cfg.subtestes.find(s => s.codigo === c) || {}).nome || c;
    const temValor = v => v != null && v !== '';
    /** Grupos (domínios) só com os subtestes que têm resultado; o que sobrar vai em "Outros". */
    function grupos(cfg, soPond) {
        const usados = new Set();
        const tem = c => temValor(cfg.ponds[c]) || (!soPond && temValor((cfg.brutos || {})[c]));
        const lista = cfg.grupos.map((g, i) => {
            g.codes.forEach(c => usados.add(c));
            return { titulo: g.titulo, cor: COR_DOMINIO[i] || COR_DOMINIO[4], codes: g.codes.filter(tem) };
        });
        const resto = cfg.subtestes.map(s => s.codigo).filter(c => !usados.has(c) && tem(c));
        if (resto.length) lista.push({ titulo: 'Outros', cor: COR_DOMINIO[4], codes: resto });
        return lista.filter(g => g.codes.length);
    }
    const composto = (cfg, chave) => {
        if (chave === 'ICG') return cfg.icg && cfg.icg.composto != null ? { composto: cfg.icg.composto, ic95: cfg.icg.ic95, percentil: cfg.icg.percentil } : null;
        const c = (cfg.compostos || {})[chave];
        return c && c.composto != null && c.composto !== '' ? c : null;
    };

    // ── 1. cartões (QI Total + quatro índices) ───────────────────────────────
    function cartoes(cfg) {
        const tile = (sig, nome, c, main) => {
            const v = c ? Number(c.composto) : null, cor = c ? corComp(v) : CINZA;
            const selo = c ? (main ? `<span class="cxp-pil cxp-pil-main">${esc(clsComp(v))}</span>` : pil(clsComp(v), cor)) : '<span class="cxp-tile-sem">não calculado</span>';
            return `<div class="cxp-tile${main ? ' main' : ''}"><small style="${main ? '' : `color:${cor}`}">${sig}</small><span class="cxp-tile-nome">${esc(nome)}</span>
                <b>${c ? esc(c.composto) : '—'}</b>${selo}${main ? '' : `<i class="cxp-tile-barra" style="background:${cor}"></i>`}</div>`;
        };
        return `<div class="laudo-cards cxp-hero">${tile('QIT', 'QI Total', composto(cfg, 'QI_TOTAL'), true)}${['ICV', 'IOP', 'IMO', 'IVP'].map(k => tile(k, NOME_IDX[k], composto(cfg, k))).join('')}</div>`;
    }

    // ── 2. conversão PB → ponderado ──────────────────────────────────────────
    function conversao(cfg) {
        const cols = cfg.colunas, nIdx = cols.filter(c => !c.qi).length, nQi = cols.length - nIdx;
        const usados = cols.map(c => new Set(((cfg.somas || {})[c.soma] || {}).usados || []));
        const sep = k => k === nIdx ? ' class="sep"' : '';
        let h = `<table class="cxp-cv"><thead>
            <tr class="grupo-cab"><th colspan="3"></th><th colspan="${nIdx}"><span>Índices fatoriais</span></th>${nQi ? `<th colspan="${nQi}" class="sep"><span>${esc(cfg.rotuloQI)}</span></th>` : ''}</tr>
            <tr><th class="esq"><span class="cab-txt">Subteste</span></th><th><span class="cab-txt">PB</span></th><th><span class="cab-txt">Pond.</span></th>
            ${cols.map((c, k) => `<th${sep(k)}><span class="cab-idx"><b style="color:${c.cor};background:${claro(c.cor, .1)};border-color:${claro(c.cor, .3)}">${c.k}</b><small>${esc(c.nome)}</small></span></th>`).join('')}</tr>
            </thead><tbody>`;
        grupos(cfg, false).forEach(g => {
            h += `<tr class="dom"><td colspan="${3 + cols.length}" style="color:${g.cor}">${esc(g.titulo)}</td></tr>`;
            g.codes.forEach(code => {
                const p = cfg.ponds[code], tem = temValor(p), b = (cfg.brutos || {})[code];
                const sub = (cfg.subtestes.find(s => s.codigo === code) || {});
                h += `<tr><td class="sub"><i class="acento" style="background:${g.cor}"></i><b>${esc(sub.nome || code)}</b><span>${code}</span>${sub.principal === false ? '<em>supl.</em>' : ''}</td>
                    <td class="pb">${temValor(b) ? esc(b) : '—'}</td>
                    <td>${tem ? `<span class="pond" style="color:${corPond(p)};background:${claro(corPond(p), .12)};border-color:${claro(corPond(p), .5)}">${esc(p)}</span>` : '<span class="pb">—</span>'}</td>
                    ${cols.map((c, k) => {
                        let cel = '<i class="vz"></i>';
                        if (tem && usados[k].has(code)) cel = `<span class="chip" style="background:${c.cor}">${esc(p)}</span>`;
                        else if (tem && c.poss.includes(code)) cel = `<span class="chip sup" style="color:${c.cor};border-color:${claro(c.cor, .5)}">(${esc(p)})</span>`;
                        return `<td${sep(k)}>${cel}</td>`;
                    }).join('')}</tr>`;
            });
        });
        h += `<tr class="soma"><td colspan="3" class="rot">Soma dos ponderados</td>${cols.map((c, k) => {
            const s = ((cfg.somas || {})[c.soma] || {}).soma;
            return `<td${sep(k)}><span class="tot" style="color:${c.cor};background:${claro(c.cor, .1)};border-color:${claro(c.cor, .38)}">${temValor(s) ? esc(s) : '—'}</span></td>`;
        }).join('')}</tr></tbody></table>`;
        return `<div class="cxp-matriz">${h}<div class="cxp-cv-leg"><span><i></i>entra na soma do índice</span><span><i class="s"></i>(suplementar) não entra na soma</span><span>círculo = ponderado, na cor da classificação</span></div></div>`;
    }

    // ── 3. perfil dos pontos ponderados (barras) ─────────────────────────────
    function barras(cfg) {
        const X = v => Math.max(0, Math.min(100, (v - 1) / 18 * 100)).toFixed(2) + '%';
        const gs = grupos(cfg, true);
        if (!gs.length) return '<p class="cxp-vazio">Sem pontos ponderados.</p>';
        let h = `<div class="cxp-pp-esc"><span></span><span></span><span class="t">${[1, 4, 7, 10, 13, 16, 19].map(v => `<i style="left:${X(v)}">${v}</i>`).join('')}</span><span></span><span></span></div>`;
        gs.forEach(g => {
            h += `<div class="cxp-pp-g">${esc(g.titulo)}</div>`;
            g.codes.forEach(c => {
                const p = Number(cfg.ponds[c]), cor = corPond(p);
                h += `<div class="cxp-pp-l"><span class="cd" style="color:${cor}">${c}</span><span class="nm">${esc(nomeSub(cfg, c))}</span>
                    <span class="tr"><i class="faixa"></i><i class="br" style="width:${p <= 1 ? '2%' : X(p)};background:${cor}"></i></span><span class="vl" style="color:${cor}">${esc(cfg.ponds[c])}</span>${pil(clsPond(p), cor)}</div>`;
            });
        });
        return `<div class="cxp-perfil-pond">${h}<p class="cxp-leg">Barra = escore ponderado (1 a 19) · faixa tracejada = Média (9 a 11) · cor = classificação</p></div>`;
    }

    // ── 4. índices e QI (intervalo de confiança, por grupos) ─────────────────
    const ZONAS = [[40, 70, '#FEF2F2'], [70, 80, '#FFF5F5'], [80, 90, '#FFFBEB'], [90, 110, '#F1F6FF'], [110, 120, '#F0FBF6'], [120, 130, '#E8F8F0'], [130, 160, '#DDF4E9']];
    function indices(cfg) {
        const min = 40, max = 160, X = v => ((Math.max(min, Math.min(max, v)) - min) / (max - min) * 100).toFixed(2) + '%';
        const zonas = `<div class="cxp-ga-zonas">${ZONAS.map(z => `<span style="width:${((z[1] - z[0]) / (max - min) * 100).toFixed(3)}%;background:${z[2]}"></span>`).join('')}</div>`;
        const lin = (sig, nome, c) => {
            const v = Number(c.composto), cor = corComp(v), ic = c.ic95 && c.ic95.length === 2 ? c.ic95 : [v - 5, v + 5];
            return `<div class="cxp-ga-l"><div class="cxp-ga-nome"><b style="color:${cor}">${sig}</b><span>${esc(nome)}</span></div>
                <div class="cxp-ga-t">${zonas}<i class="cxp-ga-med" style="left:${X(100)}"></i>
                <i class="cxp-ga-ic" style="left:${X(ic[0])};width:calc(${X(ic[1])} - ${X(ic[0])});background:${rgba(cor, .22)};border-color:${rgba(cor, .7)}"></i>
                <i class="cxp-ga-p" style="left:${X(v)};background:${cor}">${esc(c.composto)}</i></div>${pil(clsComp(v), cor)}</div>`;
        };
        const grupo = (tit, itens) => {
            const ls = itens.map(([sig, chave, nome]) => { const c = composto(cfg, chave); return c ? lin(sig, nome, c) : ''; }).join('');
            return ls ? `<div class="cxp-ga-grupo">${esc(tit)}</div>${ls}` : '';
        };
        const corpo = grupo('Índices fatoriais', ['ICV', 'IOP', 'IMO', 'IVP'].map(k => [k, k, NOME_IDX[k]]))
            + (cfg.escalasQI && cfg.escalasQI.length ? grupo('Escalas de QI', cfg.escalasQI) : '')
            + grupo('Resultado global', [['QIT', 'QI_TOTAL', 'QI Total'], ['ICG', 'ICG', 'Capacidade Geral']]);
        if (!corpo) return '<p class="cxp-vazio">Índices não calculados.</p>';
        const esc0 = `<div class="cxp-ga-esc"><span></span><span class="t">${[40, 60, 80, 100, 120, 140, 160].map(v => `<i class="${v === 100 ? 'm' : ''}" style="left:${X(v)}">${v}</i>`).join('')}</span><span></span></div>`;
        const rot = `<div class="cxp-ga-zrot"><span></span><span class="t">${[[55, 'Extr. baixo'], [75, 'Limítrofe', 1], [85, 'Méd. inf.'], [100, 'Médio', 1], [115, 'Méd. sup.'], [125, 'Superior', 1], [145, 'Muito sup.']].map(q => `<em class="${q[2] ? 'b' : ''}" style="left:${X(q[0])}">${q[1]}</em>`).join('')}</span><span></span></div>`;
        return `<div class="cxp-ic-chart">${esc0}${corpo}${rot}<p class="cxp-leg">Linha escura = média (100) · faixa = intervalo de confiança 95% · círculo = escore obtido, na cor da classificação</p></div>`;
    }

    // ── 5. perfil dos subtestes em linha (SVG com atributos, para o html2canvas) ─
    const CURTO = { 'Compreensão Verbal': 'COMPREENSÃO VERBAL', 'Organização Perceptual': 'ORG. PERCEPTUAL', 'Memória Operacional': 'MEM. OPERACIONAL', 'Velocidade de Processamento': 'VELOCIDADE', 'Outros': 'OUTROS' };
    /** Nome que cabe na largura (≈ 5 px por letra no corpo 9). */
    function curtoNome(nm, larg) {
        const max = Math.max(5, Math.floor(larg / 5.2));
        return nm.length > max ? nm.slice(0, max - 1).trim() + '…' : nm;
    }
    function linha(cfg) {
        const gs = grupos(cfg, true);
        const todos = []; gs.forEach(g => g.codes.forEach(c => todos.push({ c, nm: nomeSub(cfg, c), v: Number(cfg.ponds[c]) })));
        if (!todos.length) return '<p class="cxp-vazio">Sem pontos ponderados.</p>';
        const F = 'font-family="Inter, Arial, sans-serif"';
        const W = 760, l = 34, r = 22, t = 30, gap = 18, n = todos.length;
        const larg = (W - l - r - gap * (gs.length - 1)) / n;
        const alterna = larg < 66;                       // muitos subtestes: nomes em duas alturas
        const b = alterna ? 74 : 62, H = 208 + b;
        const xs = []; let x0 = l; gs.forEach(g => { g.codes.forEach(() => { xs.push(x0 + larg / 2); x0 += larg; }); x0 += gap; });
        const Y = v => +(t + (1 - (Math.max(1, Math.min(19, v)) - 1) / 18) * (H - t - b)).toFixed(2);
        let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Perfil dos subtestes" ${F}>`;
        s += `<rect x="${l}" y="${Y(11.5)}" width="${W - l - r}" height="${(Y(8.5) - Y(11.5)).toFixed(2)}" rx="4" fill="#EEF4FF"/>`;
        [1, 4, 7, 10, 13, 16, 19].forEach(v => { s += `<line x1="${l}" x2="${W - r}" y1="${Y(v)}" y2="${Y(v)}" stroke="#EEF1F6"/><text x="${l - 8}" y="${Y(v) + 3.5}" text-anchor="end" font-size="10" fill="#94A3B8">${v}</text>`; });
        s += `<line x1="${l}" x2="${W - r}" y1="${Y(10)}" y2="${Y(10)}" stroke="#1F3864" stroke-dasharray="4 4" stroke-opacity=".55"/>`;
        let k = 0;
        gs.forEach((g, gi) => {
            const ini = k, fim = k + g.codes.length - 1, xa = xs[ini] - larg / 2, xb = xs[fim] + larg / 2;
            s += `<text x="${((xa + xb) / 2).toFixed(1)}" y="16" text-anchor="middle" font-size="9.5" font-weight="800" letter-spacing="1.1" fill="${g.cor}">${esc(CURTO[g.titulo] || g.titulo.toUpperCase())}</text>`;
            if (gi) s += `<line x1="${(xa - gap / 2).toFixed(1)}" x2="${(xa - gap / 2).toFixed(1)}" y1="${t - 6}" y2="${H - b + 4}" stroke="#CBD5E1"/>`;
            if (fim > ini) s += `<polyline points="${g.codes.map((_, j) => `${xs[ini + j].toFixed(1)},${Y(todos[ini + j].v)}`).join(' ')}" fill="none" stroke="#1F3864" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>`;
            k = fim + 1;
        });
        todos.forEach((p, i) => {
            const cor = corPond(p.v), x = xs[i].toFixed(1);
            s += `<circle cx="${x}" cy="${Y(p.v)}" r="7" fill="${cor}" stroke="#ffffff" stroke-width="2.5"/>`
                + `<text x="${x}" y="${(Y(p.v) - 12).toFixed(1)}" text-anchor="middle" font-size="10.5" font-weight="800" fill="${cor}">${p.v}</text>`
                + `<text x="${x}" y="${H - b + 20}" text-anchor="middle" font-size="10.5" font-weight="800" fill="#0F172A">${p.c}</text>`
                + `<text x="${x}" y="${H - b + 34 + (alterna && i % 2 ? 12 : 0)}" text-anchor="middle" font-size="9" fill="#475569">${esc(curtoNome(p.nm, alterna ? 2 * larg : larg))}</text>`;
        });
        return `<div class="cxp-perfil-linha">${s}</svg><p class="cxp-leg">Faixa azul = Média (9 a 11) · tracejado = média 10 · cor do ponto = classificação</p></div>`;
    }

    // ── 6. tabela de índices e QIs ───────────────────────────────────────────
    function tabelaIndices(cfg) {
        const itens = [['ICV', 'ICV', NOME_IDX.ICV], ['IOP', 'IOP', NOME_IDX.IOP], ['IMO', 'IMO', NOME_IDX.IMO], ['IVP', 'IVP', NOME_IDX.IVP]]
            .concat(cfg.escalasQI || []).concat([['QIT', 'QI_TOTAL', 'QI Total']]);
        const linhas = itens.map(([sig, chave, nome], i) => {
            const c = composto(cfg, chave); if (!c) return '';
            const v = Number(c.composto), cor = corComp(v), s = ((cfg.somas || {})[chave] || {}).soma;
            const quebra = (i === 4 || (sig === 'QIT')) ? ' class="quebra"' : '';
            return `<tr${quebra}><td><b style="color:${cor}">${sig}</b><span>${esc(nome)}</span></td><td class="c">${temValor(s) ? esc(s) : '—'}</td>
                <td class="c"><b class="num" style="color:${cor}">${esc(c.composto)}</b></td><td class="c">${temValor(c.percentil) ? esc(c.percentil) : '—'}</td>
                <td class="c ic">${c.ic90 ? esc(c.ic90[0]) + '–' + esc(c.ic90[1]) : '—'}</td><td class="c ic">${c.ic95 ? esc(c.ic95[0]) + '–' + esc(c.ic95[1]) : '—'}</td><td>${pil(clsComp(v), cor)}</td></tr>`;
        }).join('');
        if (!linhas) return '';
        return `<div class="cxp-tab-qis"><table><thead><tr><th>Escala</th><th class="c">Soma pond.</th><th class="c">QI / Índice</th><th class="c">Percentil</th><th class="c">IC 90%</th><th class="c">IC 95%</th><th>Classificação</th></tr></thead><tbody>${linhas}</tbody></table></div>`;
    }

    // ── 7. subtestes — detalhamento ──────────────────────────────────────────
    function detalhe(cfg) {
        const media = Number(cfg.media) || 10;
        let h = '';
        grupos(cfg, true).forEach(g => {
            h += `<tr class="gr"><td colspan="5" style="color:${g.cor}">${esc(g.titulo)}</td></tr>`;
            g.codes.forEach(c => {
                const p = Number(cfg.ponds[c]), cor = corPond(p), dv = p - media, forte = Math.abs(dv) >= 3;
                const b = (cfg.brutos || {})[c];
                h += `<tr><td>${esc(nomeSub(cfg, c))} <span class="cod">(${c})</span></td><td class="c num">${temValor(b) ? esc(b) : '—'}</td>
                    <td class="c"><b class="num" style="color:${cor}">${esc(cfg.ponds[c])}</b></td><td>${pil(clsPond(p), cor)}</td>
                    <td class="c num" style="color:${forte ? (dv > 0 ? '#059669' : '#D97706') : '#64748B'};font-weight:${forte ? 800 : 500}">${dv > 0 ? '+' : ''}${virg(dv.toFixed(1))}</td></tr>`;
            });
        });
        if (!h) return '<p class="cxp-vazio">Sem pontos ponderados.</p>';
        return `<div class="cxp-tab-detalhe"><table><thead><tr><th>Subteste</th><th class="c">PB</th><th class="c">Ponderado</th><th>Classificação</th><th class="c">Desvio da média pessoal</th></tr></thead>
            <tbody>${h}</tbody><tfoot><tr><td colspan="4" class="rot">Média pessoal dos ponderados</td><td class="c num"><b>${virg(media)}</b></td></tr></tfoot></table></div>`;
    }

    // ── 8. discrepâncias ─────────────────────────────────────────────────────
    function discrepancias(lista) {
        if (!lista || !lista.length) return '';
        const linhas = lista.map(d => {
            const dif = Number(d.diff);
            const res = d.sig ? pil('Significativa', '#D97706') : Math.abs(dif) >= 8 ? pil('Notável (≥ 8)', '#64748B') : pil('Não significativa', '#059669');
            return `<tr><td><b>${esc(d.par)}</b><small>${esc(d.va)} × ${esc(d.vb)}</small></td>
                <td class="c"><b class="num">${dif > 0 ? '+' : ''}${esc(d.diff)}</b>${temValor(d.vc) ? `<small>crít. ${esc(virg(d.vc))}</small>` : ''}</td><td>${res}</td></tr>`;
        }).join('');
        return `<div class="cxp-discrep"><table><thead><tr><th>Comparação</th><th class="c">Diferença</th><th>Resultado</th></tr></thead><tbody>${linhas}</tbody></table></div>`;
    }

    // ── 9. pontos fortes e fracos ────────────────────────────────────────────
    function fortesFracos(ff) {
        if (!ff) return '';
        const item = (it, alto) => `<div class="cxp-ff-item"><i style="background:${alto ? '#059669' : '#D97706'}">${alto ? '▲' : '▼'}</i>
            <span><b>${esc(it.nome)}</b> <em>(${esc(it.cod)})</em><br>ponderado ${esc(it.p)} · ${alto ? '+' : '−'}${virg(Math.abs(Number(it.desvio)).toFixed(1))} ${alto ? 'acima' : 'abaixo'} da média pessoal</span></div>`;
        const f = (ff.fortes || []).map(x => item(x, true)).join(''), r = (ff.fracos || []).map(x => item(x, false)).join('');
        return `<div class="cxp-ff-lista">${f}${r}${f || r ? '' : '<p class="cxp-vazio">Nenhum subteste se afasta 3 pontos ou mais da média pessoal.</p>'}</div>`;
    }

    window.WechslerPainel = {
        cartoes, conversao, barras, indices, linha, tabelaIndices, detalhe, discrepancias, fortesFracos,
        corComp, corPond, clsComp, clsPond, pil, claro
    };
})();

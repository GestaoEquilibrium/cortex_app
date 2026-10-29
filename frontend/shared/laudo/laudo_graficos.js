/* ============================================================================
   CORTEX · Laudo Online — BLOCOS DE RESULTADO  (frontend/shared/laudo/laudo_graficos.js)
   ----------------------------------------------------------------------------
   Desenha, a partir do que está gravado em *_resultados, os blocos que hoje
   são copiados das telas de correção como imagem (Documento 1, §5.3):
     WAIS-III / WISC-IV: cabecalho · cartoes · indice · qit_icg · perfil_subtestes ·
                         perfil_linha · intervalos · discrepancias · tabela_subtestes · resumo
     RAVLT: cartao · curva · tabela · resumo
     FDT:   cartao · barras · tabela · resumo
     BFP:   cartao · fatores · facetas · resumo
   Em HTML/SVG nítido (vetorial no PDF). Os estilos ficam em laudo_impressao.css
   e valem dentro de um elemento com a classe .imp.
   Balões da página online: elementos com data-pop-tit / data-pop-txt.
   Expõe: window.LaudoGraf.render(bloco, banco) e auxiliares
   ============================================================================ */
(function () {
    'use strict';
    const C = () => window.LaudoCore;
    const esc = s => C().esc(s);
    const num = v => (typeof v === 'number' && !Number.isInteger(v)) ? v.toFixed(2).replace('.', ',') : String(v == null ? '—' : v);
    // k = medida (idx:IMO, sub:DG, ravlt:A1…) e n = faixa (dificuldade/esperado/forte): a página online
    // usa os dois para buscar a explicação para a família (laudo_explica.js)
    const pop = (tit, txt, faixa, k, n) => ` data-pop-tit="${esc(tit)}" data-pop-txt="${esc(txt)}"${faixa ? ` data-pop-faixa="${faixa}"` : ''}${k ? ` data-pop-k="${esc(k)}"` : ''}${n ? ` data-pop-n="${esc(n)}"` : ''}`;
    const EX = () => window.LaudoExplica || { nivelComp: () => null, nivelPond: () => null, nivelRotulo: () => null, nivelTom: () => null, nivelPct: () => null };

    function classPond(p) {
        if (p >= 16) return 'Muito Superior'; if (p >= 14) return 'Superior'; if (p >= 12) return 'Médio Superior';
        if (p >= 9) return 'Médio'; if (p >= 7) return 'Médio Inferior'; if (p >= 4) return 'Limítrofe'; return 'Extremamente Baixo';
    }
    function classComp(s) {
        if (s >= 130) return 'Muito Superior'; if (s >= 120) return 'Superior'; if (s >= 110) return 'Médio Superior';
        if (s >= 90) return 'Médio'; if (s >= 80) return 'Médio Inferior'; if (s >= 70) return 'Limítrofe'; return 'Extremamente Baixo';
    }
    /** Selo de classificação no padrão das telas de correção do CORTEX. */
    function tom(label) {
        const t = String(label || '').toLowerCase();
        if (/muito superior|muito alto/.test(t)) return 'vs';
        if (/m[ée]di[oa] superior/.test(t)) return 'ms';
        if (/superior|alto/.test(t)) return 's';
        if (/m[ée]di[oa] inferior/.test(t)) return 'mi';
        if (/limítrofe|baixo$|^baixo/.test(t) && !/muito baixo/.test(t)) return 'l';
        if (/extremamente|muito baixo|dificuldade|positivo|grave|alta prob/.test(t)) return 'eb';
        if (/negativo|típico|não significativo|mínimo/.test(t)) return 'ok';
        if (/m[ée]di[oa]/.test(t)) return 'm';
        return 'n';
    }
    const selo = l => `<span class="selo selo-${tom(l)}">${esc(l || '—')}</span>`;
    const percentilTxt = p => p == null || p === '' ? '—' : (/^[<>≥≤]/.test(String(p)) ? 'P' + p : 'P' + p);

    const ICONE = '<svg viewBox="0 0 32 32"><g stroke="currentColor" fill="currentColor" stroke-linecap="round"><line x1="16" y1="16" x2="9" y2="9"/><line x1="16" y1="16" x2="23" y2="9"/><line x1="16" y1="16" x2="9" y2="23"/><line x1="16" y1="16" x2="23" y2="23"/><line x1="16" y1="16" x2="16" y2="7"/><line x1="16" y1="16" x2="16" y2="25"/><circle cx="16" cy="16" r="2.8"/><circle cx="9" cy="9" r="1.6"/><circle cx="23" cy="9" r="1.6"/><circle cx="9" cy="23" r="1.6"/><circle cx="23" cy="23" r="1.6"/><circle cx="16" cy="7" r="1.4"/><circle cx="16" cy="25" r="1.4"/></g></svg>';

    /** Faixa azul-marinho "Relatório Neuropsicológico" das telas de correção. */
    function cabecalho(o) {
        return `<div class="cx-cab"><div class="cx-cab-esq"><span class="cx-ico" aria-hidden="true">${ICONE}</span><div>
            <p class="cx-supra">${esc(o.supra || 'Relatório Neuropsicológico')}</p><p class="cx-tit">${esc(o.titulo)}</p>
            ${(o.sub || []).filter(Boolean).map(s => `<p class="cx-sub">${esc(s)}</p>`).join('')}</div></div>
            ${o.rot || o.valor || o.nota ? `<div class="cx-cab-dir"><p class="cx-supra">${esc(o.rot)}</p><p class="cx-valor">${o.valor}</p>${o.nota ? `<p class="cx-sub">${esc(o.nota)}</p>` : ''}</div>` : ''}</div>`;
    }

    // ── WECHSLER ──────────────────────────────────────────────────────────────
    const NOME_IDX = {
        ICV: 'Índice de Compreensão Verbal', IOP: 'Índice de Organização Perceptual', IMO: 'Índice de Memória Operacional',
        IVP: 'Índice de Velocidade de Processamento', QI_TOTAL: 'QI Total', QI_VERBAL: 'QI Verbal', QI_EXECUCAO: 'QI de Execução'
    };
    const SIGLA_IDX = { QI_TOTAL: 'QIT', QI_VERBAL: 'QIV', QI_EXECUCAO: 'QIE' };
    const SUBTESTES = {
        CF: ['Completar Figuras', 'Atenção a detalhes visuais'], VC: ['Vocabulário', 'Conhecimento de palavras e expressão verbal'],
        CD: ['Códigos', 'Velocidade e precisão grafomotora'], SM: ['Semelhanças', 'Abstração e formação de conceitos verbais'],
        CB: ['Cubos', 'Análise e síntese visuoespacial'], AR: ['Aritmética', 'Cálculo mental e memória operacional'],
        RM: ['Raciocínio Matricial', 'Raciocínio lógico com figuras'], DG: ['Dígitos', 'Repetição de números em ordem direta e inversa'],
        IN: ['Informação', 'Conhecimentos gerais adquiridos'], AF: ['Arranjo de Figuras', 'Sequência lógica de eventos'],
        CO: ['Compreensão', 'Julgamento social e senso prático'], PS: ['Procurar Símbolos', 'Rastreio visual rápido'],
        SNL: ['Sequência de Números e Letras', 'Manipulação mental de sequências'], AO: ['Armar Objetos', 'Montagem visuoconstrutiva'],
        CN: ['Conceitos Figurativos', 'Raciocínio categorial com figuras'], CA: ['Cancelamento', 'Atenção seletiva e velocidade'],
        RP: ['Raciocínio com Palavras', 'Raciocínio verbal a partir de pistas']
    };
    const COMPOSICAO = {
        'WAIS-III': { ICV: ['VC', 'SM', 'IN'], IOP: ['CB', 'RM', 'CF'], IMO: ['AR', 'DG', 'SNL'], IVP: ['CD', 'PS'] },
        'WISC-IV': { ICV: ['SM', 'VC', 'CO'], IOP: ['CB', 'CN', 'RM'], IMO: ['DG', 'SNL'], IVP: ['CD', 'PS'] }
    };
    const GRUPOS = {
        'WAIS-III': [['Compreensão Verbal', ['SM', 'VC', 'IN', 'CO']], ['Organização Perceptual', ['CB', 'CF', 'RM', 'AF', 'AO']], ['Memória Operacional', ['AR', 'DG', 'SNL']], ['Velocidade de Processamento', ['CD', 'PS']]],
        'WISC-IV': [['Compreensão Verbal', ['SM', 'VC', 'CO', 'IN', 'RP']], ['Organização Perceptual', ['CB', 'CN', 'RM', 'CF']], ['Memória Operacional', ['DG', 'SNL', 'AR']], ['Velocidade de Processamento', ['CD', 'PS', 'CA']]]
    };
    const NOME_TESTE = {
        'WAIS-III': 'Escala Wechsler de Inteligência para Adultos — 3ª Edição',
        'WISC-IV': 'Escala Wechsler de Inteligência para Crianças — 4ª Edição'
    };

    // Cores das classificações (iguais às da tela de resultados) e faixas do gráfico de índices
    function corComp(v) { return v >= 130 ? '#047857' : v >= 110 ? '#059669' : v >= 90 ? '#1A56DB' : v >= 80 ? '#D97706' : v >= 70 ? '#DC2626' : '#991B1B'; }
    function corPond(p) { return p >= 16 ? '#047857' : p >= 12 ? '#059669' : p >= 9 ? '#1A56DB' : p >= 7 ? '#D97706' : p >= 4 ? '#DC2626' : '#991B1B'; }
    const rgba = (h, a) => `rgba(${[1, 3, 5].map(i => parseInt(h.substr(i, 2), 16)).join(',')},${a})`;
    const ZONAS_IC = [[40, 70, 'eb'], [70, 80, 'l'], [80, 90, 'mi'], [90, 110, 'm'], [110, 120, 'ms'], [120, 130, 's'], [130, 160, 'vs']];
    const NOME_CURTO = { ICV: 'Compreensão Verbal', IOP: 'Organização Perceptual', IMO: 'Memória Operacional', IVP: 'Velocidade de Processamento' };
    const COR_DOMINIO = ['#4338CA', '#9333EA', '#DB2777', '#0D9488', '#64748B'];
    /** Domínios só com os subtestes que têm ponderado (o que sobrar vai em "Outros"). */
    function gruposCom(sig, pond) {
        const gs = GRUPOS[sig] || GRUPOS['WAIS-III'], todos = new Set(gs.flatMap(g => g[1]));
        const l = gs.map(([nome, cods], i) => ({ nome, cor: COR_DOMINIO[i], cods: cods.filter(c => pond[c] != null && pond[c] !== '') }));
        const resto = Object.keys(pond).filter(c => !todos.has(c) && pond[c] != null && pond[c] !== '');
        if (resto.length) l.push({ nome: 'Outros', cor: COR_DOMINIO[4], cods: resto });
        return l.filter(g => g.cods.length);
    }
    const CURTO_DOM = { 'Compreensão Verbal': 'COMPREENSÃO VERBAL', 'Organização Perceptual': 'ORG. PERCEPTUAL', 'Memória Operacional': 'MEM. OPERACIONAL', 'Velocidade de Processamento': 'VELOCIDADE', Outros: 'OUTROS' };
    /** Perfil dos subtestes em linha (ponderados, faixa Média 9 a 11). */
    function perfilLinha(sig, pond) {
        const gs = gruposCom(sig, pond);
        const todos = []; gs.forEach(g => g.cods.forEach(c => todos.push({ c, v: Number(pond[c]) })));
        if (!todos.length) return '<p class="nota">Sem ponderados.</p>';
        const W = 760, l = 34, r = 22, t = 30, gap = 18, n = todos.length, larg = (W - l - r - gap * (gs.length - 1)) / n;
        const alterna = larg < 66, b = alterna ? 74 : 62, H = 208 + b;
        const xs = []; let x0 = l; gs.forEach(g => { g.cods.forEach(() => { xs.push(x0 + larg / 2); x0 += larg; }); x0 += gap; });
        const Y = v => +(t + (1 - (Math.max(1, Math.min(19, v)) - 1) / 18) * (H - t - b)).toFixed(2);
        const curto = nm => { const m = Math.max(5, Math.floor((alterna ? 2 * larg : larg) / 5.2)); return nm.length > m ? nm.slice(0, m - 1).trim() + '…' : nm; };
        let s = `<rect class="pl-fx" x="${l}" y="${Y(11.5)}" width="${W - l - r}" height="${(Y(8.5) - Y(11.5)).toFixed(2)}" rx="4"/>`;
        [1, 4, 7, 10, 13, 16, 19].forEach(v => { s += `<line class="g-grid" x1="${l}" x2="${W - r}" y1="${Y(v)}" y2="${Y(v)}"/><text class="g-tick" x="${l - 8}" y="${Y(v) + 3.5}" text-anchor="end">${v}</text>`; });
        s += `<line class="pl-md" x1="${l}" x2="${W - r}" y1="${Y(10)}" y2="${Y(10)}"/>`;
        let k = 0;
        gs.forEach((g, gi) => {
            const ini = k, fim = k + g.cods.length - 1, xa = xs[ini] - larg / 2, xb = xs[fim] + larg / 2;
            s += `<text class="pl-gr" x="${((xa + xb) / 2).toFixed(1)}" y="16" text-anchor="middle" style="--c:${g.cor}">${esc(CURTO_DOM[g.nome] || g.nome.toUpperCase())}</text>`;
            if (gi) s += `<line class="g-sep" x1="${(xa - gap / 2).toFixed(1)}" x2="${(xa - gap / 2).toFixed(1)}" y1="${t - 6}" y2="${H - b + 4}"/>`;
            if (fim > ini) s += `<polyline class="pl-ln anim-l" pathLength="1" points="${g.cods.map((_, j) => `${xs[ini + j].toFixed(1)},${Y(todos[ini + j].v)}`).join(' ')}"/>`;
            k = fim + 1;
        });
        todos.forEach((p, i) => {
            const cor = corPond(p.v), x = xs[i].toFixed(1), cl = classPond(p.v), sb = SUBTESTES[p.c] || [p.c, ''];
            s += `<g class="g-item"${pop(`${sb[0]} · ${p.v}`, `${sb[1]}. Escore ponderado ${p.v} (${cl}). A média é 10.`, C().faixa(cl), 'sub:' + p.c, EX().nivelPond(p.v))}><circle class="pl-pt anim-o" cx="${x}" cy="${Y(p.v)}" r="7" style="--c:${cor}"/><text class="pl-vl" x="${x}" y="${(Y(p.v) - 12).toFixed(1)}" text-anchor="middle" style="--c:${cor}">${p.v}</text></g>`
                + `<text class="g-cod" x="${x}" y="${H - b + 20}" text-anchor="middle">${p.c}</text><text class="pl-nm" x="${x}" y="${H - b + 34 + (alterna && i % 2 ? 12 : 0)}" text-anchor="middle">${esc(curto(sb[0]))}</text>`;
        });
        return `<div class="cx-card cx-graf cx-pl anima"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Perfil dos subtestes">${s}</svg>
            <p class="cx-leg">Faixa azul = Média (9 a 11) · tracejado = média 10 · cor do ponto = classificação</p></div>`;
    }

    function classeDe(c) { return (c && c.classificacao) || (c && c.composto != null ? classComp(c.composto) : '—'); }

    function cartaoIndice(cab, sig, valor, pct, classe, popAttr) {
        return `<div class="cx-card cx-idx"><div class="cx-idx-cab"><span>${esc(cab)}</span><span>Q.I</span><span>Percentil</span><span>Classificação</span></div>
            <div class="cx-idx-lin"${popAttr || ''}><span class="cx-sig">${esc(sig)}</span><span class="t-${tom(classe)}">${esc(valor)}</span><span>${esc(pct)}</span><span class="t-${tom(classe)} forte">${esc(classe)}</span></div></div>`;
    }

    function icgDe(d) { return d._icg && d._icg.composto != null ? d._icg : null; }

    function wechsler(b, d, sig) {
        const comp = d.compostos || {}, pond = d.ponderados || {}, op = b.opcoes || {};
        const vista = b.vista;
        if (vista === 'cabecalho') {
            return cabecalho({
                titulo: op.titulo || sig, sub: [NOME_TESTE[sig], 'Conversão PB → Ponderado e somatórios por índice'],
                rot: 'Faixa normativa', valor: esc(String(d.faixa_norma || '—').replace(/\s/g, '')),
                nota: d.idade_anos != null ? `Idade: ${d.idade_anos}a ${d.idade_meses != null ? d.idade_meses + 'm' : ''}` : ''
            });
        }
        if (vista === 'indice') {
            const k = op.indice || b.indice || 'ICV', c = comp[k];
            if (!c) return `<p class="nota">${esc(k)} não calculado no CORTEX para esta aplicação.</p>`;
            const subs = (COMPOSICAO[sig] || {})[k] || [], cl = classeDe(c);
            const det = subs.map(s => `${(SUBTESTES[s] || [s])[0]} ${pond[s] != null ? pond[s] : '—'}`).join(' · ');
            return cartaoIndice(NOME_IDX[k] || k, k, c.composto, percentilTxt(c.percentil), cl,
                pop(`${NOME_IDX[k] || k} · ${c.composto}`, `${k} = ${c.composto} (${cl}). Subtestes (escore ponderado): ${det}. IC 95%: ${c.ic95 ? c.ic95.join(' a ') : '—'}.`, C().faixa(cl), 'idx:' + k, EX().nivelComp(c.composto)));
        }
        if (vista === 'qit_icg') {
            const q = comp.QI_TOTAL, g = icgDe(d), interp = d._interpretacao;
            let h = q ? cartaoIndice('QI Total', 'QIT', q.composto, percentilTxt(q.percentil), classeDe(q), pop(`QI Total · ${q.composto}`, `QIT = ${q.composto} (${classeDe(q)}). Percentil ${q.percentil != null ? q.percentil : '—'}.`, C().faixa(classeDe(q)), 'idx:QIT', EX().nivelComp(q.composto))) : '';
            if (g) {
                const cl = g.classificacao || classComp(g.composto);
                h += `<div class="cx-card cx-icg"><div class="cx-icg-cab"><span>Índice de Capacidade Geral</span><span>Soma EP</span><span>ICG</span><span>Percentil</span><span>IC 95%</span><span>Classificação</span></div>
                    <div class="cx-icg-lin"${pop('Índice de Capacidade Geral · ' + g.composto, `ICG = ${g.composto} (${cl}). Calculado pelo CORTEX a partir dos 6 subtestes de ICV e IOP (soma ${g.somaEP}), pela tabela oficial.`, C().faixa(cl), 'idx:ICG', EX().nivelComp(g.composto))}><span class="cx-sig">ICG</span><span>${esc(g.somaEP)}</span><span class="t-${tom(cl)} forte">${esc(g.composto)}</span><span>${esc(percentilTxt(g.percentil))}</span><span>${g.ic95 ? esc(g.ic95.join('–')) : '—'}</span><span class="t-${tom(cl)} forte">${esc(cl)}</span></div></div>`;
            } else if (d._icg && d._icg.incompleto) {
                h += `<p class="nota">ICG não calculado: faltam ponderados dos subtestes ${esc((d._icg.faltando || []).join(', '))}.</p>`;
            }
            if (interp && interp.amplitude != null) {
                h += `<p class="cx-leg">Amplitude entre índices: ${esc(interp.amplitude)} pontos — QIT ${interp.qitInterpretavel ? 'interpretável' : 'não interpretável pela regra dos 23 (leitura pelo ICG)'}.</p>`;
            }
            return h || `<p class="nota">QIT e ICG não calculados.</p>`;
        }
        // Painel moderno (o mesmo desenho da tela de resultados do WAIS/WISC, shared/wechsler_painel.js)
        if (vista === 'perfil_subtestes') {
            const X = v => Math.max(0, Math.min(100, (v - 1) / 18 * 100)).toFixed(2) + '%';
            const grupos = gruposCom(sig, pond).map(g => {
                const linhas = g.cods.map(c => {
                    const p = Number(pond[c]), cl = classPond(p), s = SUBTESTES[c] || [c, ''], cor = corPond(p);
                    return `<div class="cx-pp-l"${pop(`${s[0]} · ${p}`, `${s[1]}. Escore ponderado ${p} (${cl}). A média é 10.`, C().faixa(cl), 'sub:' + c, EX().nivelPond(p))}><span class="cx-pp-c" style="color:${cor}">${c}</span><span class="cx-pp-n">${esc(s[0])}</span>
                        <span class="cx-pp-t"><i class="cx-pp-fx"></i><i class="cx-pp-b anim-x" style="width:${p <= 1 ? '2%' : X(p)};background:${cor}"></i></span><span class="cx-pp-v" style="color:${cor}">${p}</span>${selo(cl)}</div>`;
                }).join('');
                return `<p class="cx-pp-g">${esc(g.nome)}</p>${linhas}`;
            }).join('');
            if (!grupos) return '<p class="nota">Sem ponderados.</p>';
            const escala = `<div class="cx-pp-esc"><span></span><span></span><span class="cx-pp-et">${[1, 4, 7, 10, 13, 16, 19].map(v => `<i style="left:${X(v)}">${v}</i>`).join('')}</span><span></span><span></span></div>`;
            return `<div class="cx-card cx-perfil cx-pp anima">${escala}${grupos}<p class="cx-leg">Barra = escore ponderado (1 a 19) · faixa tracejada = Média (9 a 11) · cor = classificação</p></div>`;
        }
        if (vista === 'perfil_linha') return perfilLinha(sig, pond);
        if (vista === 'cartoes') {
            const tile = (s, nome, c, main) => {
                const v = c ? Number(c.composto) : null, cl = c ? classeDe(c) : '', cor = c ? corComp(v) : '#94A3B8';
                return `<div class="cx-wt${main ? ' main' : ''}"${c ? pop(`${nome} · ${c.composto}`, `${s} = ${c.composto} (${cl}). Percentil ${c.percentil != null ? c.percentil : '—'}.`, C().faixa(cl), 'idx:' + s, EX().nivelComp(v)) : ''}>
                    <small style="${main ? '' : `color:${cor}`}">${s}</small><span class="cx-wt-n">${esc(nome)}</span><b>${c ? esc(c.composto) : '—'}</b>${c ? selo(cl) : '<span class="nota">não calculado</span>'}${main ? '' : `<i class="cx-wt-b" style="background:${cor}"></i>`}</div>`;
            };
            return `<div class="cx-wts">${tile('QIT', 'QI Total', comp.QI_TOTAL, true)}${['ICV', 'IOP', 'IMO', 'IVP'].map(k => tile(k, NOME_CURTO[k], comp[k])).join('')}</div>`;
        }
        if (vista === 'intervalos') {
            const grupos = [
                ['Índices fatoriais', [['ICV', comp.ICV], ['IOP', comp.IOP], ['IMO', comp.IMO], ['IVP', comp.IVP]]],
                ['Escalas de QI', [['QIV', comp.QI_VERBAL], ['QIE', comp.QI_EXECUCAO]]],
                ['Resultado global', [['QIT', comp.QI_TOTAL], ['ICG', icgDe(d)]]]
            ].map(([t, l]) => [t, l.filter(x => x[1] && x[1].composto != null)]).filter(g => g[1].length);
            if (!grupos.length) return '<p class="nota">Índices não calculados.</p>';
            const auto = op.escala === 'auto';
            const vals = grupos.flatMap(g => g[1].map(x => Number(x[1].composto)));
            const min = auto ? Math.max(40, Math.floor((Math.min(...vals) - 15) / 10) * 10) : 40;
            const max = auto ? Math.min(160, Math.ceil((Math.max(...vals) + 15) / 10) * 10) : 160;
            const X = v => ((Math.max(min, Math.min(max, v)) - min) / (max - min) * 100).toFixed(2) + '%';
            const zonas = `<span class="cx-ga-z">${ZONAS_IC.filter(z => z[1] > min && z[0] < max).map(z => `<i class="z-${z[2]}" style="width:${((Math.min(max, z[1]) - Math.max(min, z[0])) / (max - min) * 100).toFixed(3)}%"></i>`).join('')}</span>`;
            const marcas = []; for (let v = min; v <= max; v += 20) marcas.push(v);
            const NOME = { QIV: 'QI Verbal', QIE: 'QI de Execução', QIT: 'QI Total', ICG: 'Capacidade Geral' };
            const linha = ([s, c]) => {
                const cl = classeDe(c), v = Number(c.composto), cor = corComp(v), ic = c.ic95 || [v - 5, v + 5];
                return `<div class="cx-ga-l"${pop(`${({ QIV: 'QI Verbal', QIE: 'QI de Execução', QIT: 'QI Total', ICG: 'Índice de Capacidade Geral' })[s] || NOME_IDX[s] || s} · ${c.composto}`, `${s} = ${c.composto} (${cl}). Com 95% de segurança, o escore verdadeiro está entre ${ic[0]} e ${ic[1]}.`, C().faixa(cl), 'idx:' + s, EX().nivelComp(v))}>
                    <span class="cx-ga-n"><b style="color:${cor}">${s}</b><span>${esc(NOME[s] || NOME_CURTO[s] || s)}</span></span>
                    <span class="cx-ga-t">${zonas}<i class="cx-ga-m" style="left:${X(100)}"></i><i class="cx-ga-f" style="left:${X(ic[0])};width:calc(${X(ic[1])} - ${X(ic[0])});background:${rgba(cor, .2)};border-color:${rgba(cor, .7)}"></i><i class="cx-ga-p anim-o" style="left:${X(v)};background:${cor}">${esc(c.composto)}</i></span>${selo(cl)}</div>`;
            };
            const rot = [[55, 'Extr. baixo'], [75, 'Limítrofe', 1], [85, 'Méd. inf.'], [100, 'Médio', 1], [115, 'Méd. sup.'], [125, 'Superior', 1], [145, 'Muito sup.']].filter(q => q[0] > min && q[0] < max);
            return `<div class="cx-card cx-icart cx-ga anima"><div class="cx-ga-esc"><span></span><span class="cx-ga-et">${marcas.map(v => `<i class="${v === 100 ? 'm' : ''}" style="left:${X(v)}">${v}</i>`).join('')}</span><span></span></div>
                ${grupos.map(([t, l]) => `<p class="cx-ga-g">${esc(t)}</p>${l.map(linha).join('')}`).join('')}
                <div class="cx-ga-zr"><span></span><span class="cx-ga-et">${rot.map(q => `<em class="${q[2] ? 'b' : ''}" style="left:${X(q[0])}">${q[1]}</em>`).join('')}</span><span></span></div>
                <p class="cx-leg">Linha escura = média (100) · faixa = intervalo de confiança 95% · círculo = escore obtido, na cor da classificação</p></div>`;
        }
        if (vista === 'discrepancias') {
            const ds = d.discrepancias || [];
            if (!ds.length) return '<p class="nota">Sem discrepâncias calculadas.</p>';
            return `<div class="cx-card cx-tb cx-tb6"><div class="cx-tb-cab"><span>Comparação</span><span>Escore A</span><span>Escore B</span><span>Diferença</span><span>Valor crítico</span><span>Significância</span></div>
                ${ds.map(x => `<div class="cx-tb-lin"><span>${esc(x.par)}</span><span>${esc(x.va)}</span><span>${esc(x.vb)}</span><span class="forte">${x.diff > 0 ? '+' : ''}${esc(x.diff)}</span><span>${esc(num(x.vc))}</span><span>${x.sig ? '<span class="selo selo-mi">Significativa</span>' : '<span class="selo selo-ok">Não significativa</span>'}</span></div>`).join('')}</div>`;
        }
        if (vista === 'tabela_subtestes') {
            const cods = Object.keys(pond).filter(c => pond[c] != null);
            const ordem = (GRUPOS[sig] || []).flatMap(g => g[1]);
            cods.sort((a, b) => (ordem.indexOf(a) + 99 * (ordem.indexOf(a) < 0)) - (ordem.indexOf(b) + 99 * (ordem.indexOf(b) < 0)));
            return `<div class="cx-card cx-tb cx-tb4"><div class="cx-tb-cab"><span>Subteste</span><span>Código</span><span>Ponderado</span><span>Classificação</span></div>
                ${cods.map(c => `<div class="cx-tb-lin"><span>${esc((SUBTESTES[c] || [c])[0])}</span><span>${esc(c)}</span><span class="forte">${esc(pond[c])}</span><span>${selo(classPond(pond[c]))}</span></div>`).join('')}</div>`;
        }
        return null;
    }

    // ── RAVLT ─────────────────────────────────────────────────────────────────
    function curvaRavlt(d) {
        const cv = d.curva || {}, pac = cv.paciente || [], nor = cv.normaPc50 || [];
        const rot = ['A1', 'A2', 'A3', 'A4', 'A5', 'B1', 'A6', 'A7'];
        const xa = 56, xb = 640, yT = 20, yB = 200, X = i => xa + i * (xb - xa) / 7, Y = v => yB - Math.max(0, Math.min(15, Number(v) || 0)) / 15 * (yB - yT);
        const grade = [0, 3, 6, 9, 12, 15].map(v => `<line x1="${xa}" x2="${xb}" y1="${Y(v)}" y2="${Y(v)}" class="g-grid"/><text x="${xa - 10}" y="${Y(v) + 4}" class="g-tick" text-anchor="end">${v}</text>`).join('');
        const seg = (a, i0, i1) => a.slice(i0, i1 + 1).map((v, k) => v == null ? '' : `${k ? 'L' : 'M'}${X(i0 + k)} ${Y(v)}`).join(' ');
        const linhas = (a, cls) => `<path d="${seg(a, 0, 4)}" class="${cls}"/><path d="${seg(a, 6, 7)}" class="${cls}"/>`;
        const desc = { A1: 'Primeira leitura da lista A', A2: 'Segunda leitura', A3: 'Terceira leitura', A4: 'Quarta leitura', A5: 'Quinta leitura', B1: 'Lista B, lida uma vez só (distrator)', A6: 'Lista A logo após a lista B, sem nova leitura', A7: 'Lista A após cerca de 20 minutos' };
        const pts = pac.map((v, i) => v == null ? '' : `<g class="g-item"${pop(`${rot[i]}: ${v} palavras`, `${desc[rot[i]]}. Mediana da idade: ${nor[i] != null ? nor[i] : '—'}.`, null, 'ravlt:' + rot[i], nor[i] == null ? null : v <= nor[i] - 2 ? 'dificuldade' : v >= nor[i] + 2 ? 'forte' : 'esperado')}><circle cx="${X(i)}" cy="${Y(v)}" r="6" class="pt"/><text x="${X(i)}" y="${Y(v) - 12}" class="g-val" text-anchor="middle">${v}</text></g>`).join('');
        const ptsN = nor.map((v, i) => v == null ? '' : `<circle cx="${X(i)}" cy="${Y(v)}" r="3.5" class="ptn"/>`).join('');
        const xl = rot.map((r, i) => `<text x="${X(i)}" y="${yB + 20}" class="g-cod" text-anchor="middle">${r}</text>`).join('');
        const sep = [4.5, 5.5].map(k => `<line x1="${(X(Math.floor(k)) + X(Math.ceil(k))) / 2}" x2="${(X(Math.floor(k)) + X(Math.ceil(k))) / 2}" y1="${yT}" y2="${yB}" class="g-sep"/>`).join('');
        const leg = `<g transform="translate(${xa},242)"><line x1="0" x2="22" y1="0" y2="0" class="ln-pac"/><text x="30" y="4" class="g-leg">Paciente</text><line x1="110" x2="132" y1="0" y2="0" class="ln-nor"/><text x="140" y="4" class="g-leg">Mediana da idade (P50)</text></g>`;
        return `<div class="cx-card cx-graf"><svg viewBox="0 0 680 256" role="img" aria-label="Curva de aprendizagem do RAVLT">${grade}${sep}${linhas(nor, 'ln-nor')}${linhas(pac, 'ln-pac')}${ptsN}${pts}${xl}${leg}</svg></div>`;
    }

    function ravlt(b, d) {
        const med = d.medidas || [], op = b.opcoes || {};
        const total = (med.find(m => m.key === 'Total') || {}).raw;
        const cab = () => cabecalho({ titulo: op.titulo || 'RAVLT', sub: ['Teste de Aprendizagem Auditivo-Verbal de Rey', `Listas A e B · 15 palavras · norma ${d.faixa_norma || '—'}`],
            rot: 'Escore total', valor: `${total != null ? esc(total) : '—'}<small>/75</small>`, nota: 'A1 a A5' });
        if (b.vista === 'cabecalho') return cab();
        if (b.vista === 'cartao') return cab() + curvaRavlt(d);
        if (b.vista === 'curva') return curvaRavlt(d);
        if (b.vista === 'tabela') {
            let grupo = null; const lin = [];
            med.forEach(m => {
                if (m.grupo !== grupo) { grupo = m.grupo; lin.push(`<div class="cx-tb-sep">${esc(grupo || '')}</div>`); }
                const cl = (m.classificacao || {}).label || '—';
                lin.push(`<div class="cx-tb-lin"><span>${esc(m.label)}</span><span>${esc(num(m.raw))}</span><span>${m.pct != null ? 'P' + esc(m.pct) : '—'}</span>${op.mostrar_norma === false ? '' : `<span>${m.normPc50 != null ? esc(num(m.normPc50)) : '—'}</span>`}<span>${selo(cl)}</span></div>`);
            });
            const cols = op.mostrar_norma === false ? 'cx-tb4' : 'cx-tb5';
            return `<div class="cx-card cx-tb ${cols}"><div class="cx-tb-cab"><span>Medida</span><span>Escore</span><span>Percentil</span>${op.mostrar_norma === false ? '' : '<span>Norma (P50)</span>'}<span>Classificação</span></div>${lin.join('')}</div>`;
        }
        return null;
    }

    // ── FDT ───────────────────────────────────────────────────────────────────
    function fdt(b, d) {
        const op = b.opcoes || {};
        const ordem = ['L', 'C', 'E', 'A', 'CI', 'FC'], M = {}; (d.medidas || []).forEach(m => { M[m.key] = m; });
        const barras = () => `<div class="cx-card cx-fdc"><p class="cx-leg cima">Barra = percentil estimado (1–99), baseado nos tempos · menos tempo é melhor</p>${ordem.filter(k => M[k]).map(k => {
            const m = M[k], cl = (m.classificacao || {}).label || '—', er = { C: 'eC', E: 'eE', A: 'eA' }[k];
            const erTxt = er && M[er] ? ` Erros: ${M[er].raw} (${(M[er].classificacao || {}).label || '—'}).` : '';
            return `<div class="cx-fd"${pop(`${m.label}: ${m.raw} s`, `Percentil ${m.pctLabel || '—'} · ${cl}. Menos tempo é melhor.${erTxt}`, C().faixa(cl), 'fdt:' + k, EX().nivelRotulo(cl))}><span class="cx-fd-n">${esc(String(m.label || k).replace(/ \(.*\)/, ''))}</span>
                <span class="cx-fd-t"><span class="cx-fd-b b-${tom(cl)}" style="width:${Math.max(4, Math.min(100, m.pctNum || 0))}%"></span></span><span class="cx-fd-p">${esc(m.pctLabel || '—')}</span>${selo(cl)}</div>`;
        }).join('')}</div>`;
        const cabFdt = () => cabecalho({ titulo: op.titulo || 'FDT', sub: ['Teste dos Cinco Dígitos', 'Five Digit Test · Atenção, Controle Inibitório e Flexibilidade Cognitiva'],
            rot: 'Faixa normativa', valor: esc(String(d.faixa_norma || '—').replace(/\s/g, '')), nota: d.idade_anos != null ? `Idade: ${d.idade_anos}a` : '' });
        if (b.vista === 'cabecalho') return cabFdt();
        if (b.vista === 'cartao') return cabFdt() + barras();
        if (b.vista === 'barras') return barras();
        if (b.vista === 'tabela') {
            const grupos = [['tempo', 'Tempos (segundos)'], ['derivado', 'Índices derivados'], ['erro', 'Erros']];
            const lin = [];
            grupos.forEach(([g, nome]) => {
                const ms = (d.medidas || []).filter(m => m.grupo === g);
                if (!ms.length) return;
                lin.push(`<div class="cx-tb-sep">${esc(nome)}</div>`);
                ms.forEach(m => lin.push(`<div class="cx-tb-lin"><span>${esc(m.label)}</span><span class="forte">${esc(num(m.raw))}</span><span>${esc(m.pctLabel || '—')}</span><span>${selo((m.classificacao || {}).label)}</span></div>`));
            });
            return `<div class="cx-card cx-tb cx-tb4"><div class="cx-tb-cab"><span>Medida</span><span>Escore</span><span>Percentil</span><span>Classificação</span></div>${lin.join('')}</div>`;
        }
        return null;
    }

    // ── BFP ───────────────────────────────────────────────────────────────────
    const FATORES = [['N', 'Neuroticismo'], ['E', 'Extroversão'], ['S', 'Socialização'], ['R', 'Realização'], ['A', 'Abertura']];
    const FACETAS = {
        N1: 'Vulnerabilidade', N2: 'Instabilidade Emocional', N3: 'Passividade / Falta de Energia', N4: 'Depressão',
        E1: 'Comunicação', E2: 'Altivez', E3: 'Dinamismo', E4: 'Interações Sociais',
        S1: 'Amabilidade', S2: 'Pró-sociabilidade', S3: 'Confiança nas Pessoas',
        R1: 'Competência', R2: 'Ponderação / Prudência', R3: 'Empenho / Comprometimento',
        A1: 'Abertura a Ideias', A2: 'Liberalismo', A3: 'Busca por Novidades'
    };

    function bfpZ(d, glossario) {
        const z = d.z_fatores || {}, pc = d.percentil_fatores || {}, cl = d.classificacao_fatores || {};
        const x0 = 70, larg = 560, w = larg / FATORES.length, Y = v => 150 - Math.max(-3, Math.min(3, v)) * 40;
        const grade = [-3, -2, -1, 0, 1, 2, 3].map(v => `<line x1="${x0}" x2="${x0 + larg}" y1="${Y(v)}" y2="${Y(v)}" class="${v === 0 ? 'g-zero' : 'g-grid'}"/><text x="${x0 - 10}" y="${Y(v) + 4}" class="g-tick" text-anchor="end">${v.toFixed(1)}</text>`).join('');
        const barras = FATORES.map((f, i) => {
            const v = z[f[0]]; if (v == null) return '';
            const cx = x0 + w * i + w / 2, y1 = Y(Math.max(v, 0)), h = Math.abs(Y(v) - Y(0));
            const g = (glossario || {})[f[1].toLowerCase()];
            return `<g class="g-item"${pop(`${f[1]} · P${pc[f[0]]}`, `Classificação: ${cl[f[0]] || '—'} (escore Z ${num(v)}, percentil ${pc[f[0]]}).`, null, 'bfp:' + f[0], EX().nivelPct(pc[f[0]]))}>
                <rect x="${cx - w * 0.32}" y="${y1}" width="${w * 0.64}" height="${Math.max(h, 1)}" rx="3" class="fb-${f[0]}"/>
                <text x="${cx}" y="${v >= 0 ? Y(v) - 7 : Y(v) + 16}" class="g-val c-${f[0]}" text-anchor="middle">${num(v).replace(',', '.')}</text>
                <text x="${cx}" y="292" class="g-cod" text-anchor="middle">${f[1]}</text><text x="${cx}" y="308" class="g-tick" text-anchor="middle">P${pc[f[0]] != null ? pc[f[0]] : '—'}</text></g>`;
        }).join('');
        return `<div class="cx-card cx-graf"><svg viewBox="0 0 680 320" role="img" aria-label="Perfil de escores Z dos fatores da BFP"><text x="340" y="18" class="g-titulo" text-anchor="middle">Perfil de Escores Z — Fatores BFP</text>${grade}${barras}</svg></div>`;
    }

    function bfp(b, d, glossario) {
        const op = b.opcoes || {};
        const sexo = d.sexo_norma === 'feminino' ? '♀ Feminino' : d.sexo_norma === 'masculino' ? '♂ Masculino' : 'Geral';
        const cabBfp = () => cabecalho({ titulo: op.titulo || 'BFP', sub: ['Bateria Fatorial de Personalidade — Modelo Big Five', 'Nunes, Hutz & Nunes (2010) · 126 itens · 5 fatores e 17 facetas'],
            rot: 'Norma', valor: sexo, nota: d.idade_anos != null ? `Idade: ${d.idade_anos}a` : 'Adulto' });
        if (b.vista === 'cabecalho') return cabBfp();
        if (b.vista === 'cartao') return cabBfp() + bfpZ(d, glossario);
        if (b.vista === 'fatores') {
            const pc = d.percentil_fatores || {}, cl = d.classificacao_fatores || {}, eb = d.eb_fatores || {};
            return `<div class="cx-card cx-tb cx-tb4"><div class="cx-tb-cab"><span>Fator</span><span>Escore bruto</span><span>Percentil</span><span>Classificação</span></div>
                ${FATORES.filter(f => pc[f[0]] != null).map(f => `<div class="cx-tb-lin"><span>${esc(f[1])}</span><span>${esc(num(eb[f[0]]))}</span><span class="forte">P${esc(pc[f[0]])}</span><span>${selo(cl[f[0]])}</span></div>`).join('')}</div>`;
        }
        if (b.vista === 'facetas') {
            const pc = d.percentil_facetas || {}, cl = d.classificacao_facetas || {}, eb = d.eb_facetas || {};
            const fs = op.fator ? FATORES.filter(f => f[0] === op.fator) : FATORES;
            const lin = [];
            fs.forEach(f => {
                const ks = Object.keys(FACETAS).filter(k => k[0] === f[0] && pc[k] != null);
                if (!ks.length) return;
                lin.push(`<div class="cx-tb-sep">${esc(f[1])}</div>`);
                ks.forEach(k => lin.push(`<div class="cx-tb-lin"><span>${esc(k)} · ${esc(FACETAS[k])}</span><span>${esc(num(eb[k]))}</span><span class="forte">P${esc(pc[k])}</span><span>${selo(cl[k])}</span></div>`));
            });
            return `<div class="cx-card cx-tb cx-tb4"><div class="cx-tb-cab"><span>Faceta</span><span>Escore bruto</span><span>Percentil</span><span>Classificação</span></div>${lin.join('') || '<div class="cx-tb-lin"><span>Sem facetas calculadas.</span></div>'}</div>`;
        }
        return null;
    }

    // ── ESCALAS ONLINE (LO-6) ─────────────────────────────────────────────────
    // Desenho comum a todas as escalas, a partir do resumo do leitor
    // (shared/laudo/escalas/). Mesmas cores das telas de correção.
    const TOM_CLS = { ok: 'ok', leve: 'mi', mod: 'l', grave: 'eb', neutro: 'n' };
    const seloTom = (rot, t) => `<span class="selo selo-${TOM_CLS[t] || tom(rot)}">${esc(rot || '—')}</span>`;
    const pct = (v, min, max) => Math.max(0, Math.min(100, ((v - min) / Math.max(1e-9, max - min)) * 100));

    function reguaEscala(r, titulo) {
        if (!r || !Array.isArray(r.zonas) || !r.zonas.length) return '';
        const min = r.min != null ? r.min : 0, max = r.max != null ? r.max : r.zonas[r.zonas.length - 1].ate;
        // limites inteiros: a fronteira fica entre "até 12" e "a partir de 13", e a marca mostra o 13 (como nas telas)
        const inteiro = r.zonas.every(z => Number.isInteger(z.ate)) && Number.isInteger(min) && Number.isInteger(max);
        const fronteira = z => inteiro ? z.ate + 0.5 : z.ate;
        const rotuloFronteira = z => inteiro ? z.ate + 1 : z.ate;
        let ini = min;
        const zonas = r.zonas.map((z, i) => {
            const fim = i === r.zonas.length - 1 ? max : Math.min(max, fronteira(z));
            const w = pct(fim, min, max) - pct(ini, min, max);
            const h = `<span class="cx-rz-z rz-${esc(z.tom || 'n')}" style="width:${w.toFixed(2)}%" title="${esc(z.rotulo || '')}"></span>`;
            ini = fim; return h;
        }).join('');
        const v = r.valor;
        const marca = v != null ? `<span class="cx-rz-m" style="left:${pct(v, min, max).toFixed(2)}%">${esc(num(v))}</span>` : '';
        const legenda = r.zonas.map(z => `<span><i class="rz-${esc(z.tom || 'n')}"></i>${esc(z.rotulo || '')}</span>`).join('');
        const marcas = [[min, min]].concat(r.zonas.slice(0, -1).filter(z => fronteira(z) > min && fronteira(z) < max).map(z => [fronteira(z), rotuloFronteira(z)])).concat([[max, max]]);
        return `<div class="cx-rz">${titulo ? `<p class="cx-regua-tit">${esc(titulo)}</p>` : ''}
            <div class="cx-rz-t">${zonas}${marca}</div>
            <div class="cx-rz-esc">${marcas.map(m => `<span style="left:${pct(m[0], min, max).toFixed(2)}%">${esc(num(m[1]))}</span>`).join('')}</div>
            <div class="cx-rz-leg">${legenda}</div></div>`;
    }

    function linhasSub(R) {
        const rg = R.regua;   // escalas em T (sem máximo por subescala) usam a faixa da régua principal
        return (R.subescalas || []).map(sb => {
            const lo = sb.max ? 0 : (rg ? rg.min : 0), hi = sb.max || (rg ? rg.max : null);
            const w = hi != null && sb.valor != null ? pct(sb.valor, lo, hi) : 0;
            return `<div class="cx-fd"${pop(`${sb.nome} · ${num(sb.valor)}${sb.max ? ' de ' + sb.max : ''}`, `${R.sigla ? R.sigla + ' · ' : ''}${num(sb.valor)}${sb.max ? ' de ' + sb.max : ''}${sb.classificacao ? ' · ' + sb.classificacao : ''}${sb.extra ? ' · ' + sb.extra : ''}`, null, 'esc:' + sb.nome, EX().nivelTom(sb.tom))}><span class="cx-fd-n">${esc(sb.nome)}</span>
                <span class="cx-fd-t">${hi != null ? `<i class="cx-fd-b b-${TOM_CLS[sb.tom] || 'n'} anim-x" style="width:${w.toFixed(1)}%"></i>` : ''}</span>
                <span class="cx-fd-p">${esc(num(sb.valor))}${sb.max ? `<small>/${esc(sb.max)}</small>` : ''}</span>${seloTom(sb.classificacao, sb.tom)}</div>`;
        }).join('');
    }

    function escala(b, d, sig) {
        const R = d.resumo || {}, P = R.principal, op = b.opcoes || {};
        const valorCab = P ? `${esc(num(P.valor))}${P.max ? `<small>/${esc(P.max)}</small>` : ''}` : '';
        const cab = () => cabecalho({
            supra: 'Escala', titulo: R.sigla || sig, sub: [R.nome, R.respondente ? 'Respondente: ' + R.respondente : null, R.norma],
            rot: P ? P.rotulo : '', valor: valorCab, nota: P ? P.classificacao : ''
        });
        const ind = R.indicacao ? `<p class="cx-leg cima cx-ind">${esc(R.indicacao)}</p>` : '';
        const subs = (R.subescalas || []).length ? `<div class="cx-card cx-fdc">${linhasSub(R)}</div>` : '';
        const reguas = () => {
            if (R.regua) return `<div class="cx-card cx-regua"${P ? pop(`${P.rotulo || 'Total'} · ${num(P.valor)}${P.max ? ' de ' + P.max : ''}`, `${R.sigla || sig} · ${num(P.valor)}${P.max ? ' de ' + P.max : ''}${P.classificacao ? ' · ' + P.classificacao : ''}${R.norma ? ' · ' + R.norma : ''}`, null, 'esc:' + (P.rotulo || 'total'), EX().nivelTom(P.tom)) : ''}>${reguaEscala(R.regua, R.regua.rotulo || (P && P.rotulo))}</div>`;
            const rs = (R.subescalas || []).filter(sb => sb.zonas && sb.zonas.length)
                .map(sb => reguaEscala({ min: 0, max: sb.max, valor: sb.valor, zonas: sb.zonas }, `${sb.nome}${sb.classificacao ? ' · ' + sb.classificacao : ''}`)).join('');
            return rs ? `<div class="cx-card cx-regua">${rs}</div>` : '';
        };
        if (b.vista === 'cabecalho') return cab();
        if (b.vista === 'cartao') return `${op.sem_cabecalho ? '' : cab()}${P && P.classificacao ? `<div class="cx-esc-cl">${seloTom(P.classificacao, P.tom)}${ind}</div>` : ind}${reguas()}${subs}`;
        if (b.vista === 'regua') return reguas() || subs;
        if (b.vista === 'subescalas') return subs || reguas();
        if (b.vista === 'tabela') {
            const lin = [];
            if (P) lin.push(`<div class="cx-tb-lin"><span class="forte">${esc(P.rotulo)}</span><span>${esc(num(P.valor))}</span><span>${esc(P.max != null ? P.max : '—')}</span><span>${seloTom(P.classificacao, P.tom)}</span></div>`);
            (R.subescalas || []).forEach(sb => lin.push(`<div class="cx-tb-lin"><span>${esc(sb.nome)}${sb.extra ? ` <small>${esc(sb.extra)}</small>` : ''}</span><span>${esc(num(sb.valor))}</span><span>${esc(sb.max != null ? sb.max : '—')}</span><span>${seloTom(sb.classificacao, sb.tom)}</span></div>`));
            (R.linhas || []).forEach(l => lin.push(`<div class="cx-tb-lin"><span>${esc(l[0])}</span><span>${esc(l[1])}</span><span></span><span></span></div>`));
            return `<div class="cx-card cx-tb cx-tb4"><div class="cx-tb-cab"><span>Medida</span><span>Escore</span><span>Máximo</span><span>Classificação</span></div>${lin.join('')}</div>${ind}`;
        }
        return null;
    }

    // ── FIGURAS DAS TELAS DE CORREÇÃO (LO-6) ──────────────────────────────────
    // O laudo pode trazer, em doc.figuras, os blocos capturados da própria tela
    // de correção de cada teste (cabeçalho, tabelas, gráficos): as mesmas
    // imagens do 📷/📋 das telas, em alta resolução. Quem desenha a página
    // informa as figuras e os links assinados com LaudoGraf.usarFiguras().
    const FIG = { figuras: null, urls: {} };
    const APELIDO_FIG = { 'SRS-2': ['SRS-2-HET', 'SRS-2-AUTO', 'SRS-2-PRE', 'SRS-2-ESC-F', 'SRS-2-ESC-M'], 'SCARED': ['SCARED-A', 'SCARED-H'], 'CARS-2': ['CARS2-ST', 'CARS2-HF'], 'CARS2': ['CARS2-ST', 'CARS2-HF'], 'QA16+': ['QA 16+'] };
    function usarFiguras(figuras, urls) { FIG.figuras = figuras || null; FIG.urls = urls || {}; }

    // Testes com as duas formas na MESMA tela de correção (SCARED: auto + hetero juntos).
    // Diz quais partes da tela vão em cada vista e qual parte é de cada forma.
    const MESMA_TELA = {
        'SCARED': {
            vistas: { cartao: /scared-totais/, tabela: /scared-tab-z|scared-comp/, subescalas: /scared-subs/, regua: /scared-subs/ },
            vistasForma: { cartao: /scared-card-total/ },             // uma forma só: o cartão dela
            juntos: /scared-comp/,                                   // comparativo: só no "SCARED" (as duas formas)
            formas: { 'SCARED-A': [/auto/i, /hetero|pais/i], 'SCARED-H': [/hetero|pais/i, /auto/i] }
        }
    };
    function mesmaTela(sig) {
        if (MESMA_TELA[sig]) return MESMA_TELA[sig];
        return Object.keys(MESMA_TELA).map(k => MESMA_TELA[k]).find(r => r.formas[sig]) || null;
    }
    /** Formas de um nome do Gerador (SCARED → SCARED-A e SCARED-H) que têm resultado no banco. */
    function formasDe(sig, banco) {
        const E = window.LaudoEscalas, res = (banco || {}).resultados || {};
        const ap = E && E.APELIDOS[sig];
        if (!ap || ap.length < 2 || (res[sig] && !res[sig].apelido_de)) return [];
        return ap.filter(s => res[s] && !res[s].erro);
    }
    function figurasDaSigla(sig) {
        const F = FIG.figuras || {};
        if (F[sig]) return F[sig];
        const eq = C().equivalente && C().equivalente(sig);
        if (eq && F[eq.sigla]) return F[eq.sigla];
        const vizinha = C().siglaNoCortex && C().modeloLancado && C().modeloLancado(sig) && C().siglaNoCortex(sig, Object.keys(F));
        if (vizinha) return F[vizinha];
        const apE = window.LaudoEscalas && (window.LaudoEscalas.APELIDOS[sig] || []).find(x => F[x]);
        if (apE) return F[apE];
        const ap = (APELIDO_FIG[sig] || []).find(x => F[x]);
        return ap ? F[ap] : null;
    }
    /** Blocos de figura para um bloco `resultado`, ou null (desenha pelo banco). */
    function figurasDe(b) {
        const F = figurasDaSigla(b.sigla);
        if (!F || !(F.blocos || []).length) return null;
        const op = b.opcoes || {}, bs = F.blocos;
        const por = ch => bs.find(x => x.chave === ch);
        if (b.vista === 'figura' || op.figura || op.figuras) {
            const lista = [].concat(op.figuras || op.figura || []).map(por).filter(Boolean);
            return lista.length ? lista : null;
        }
        // Testes desenhados pelo próprio Laudo Online (WAIS, WISC, RAVLT, FDT, BFP) continuam vetoriais.
        if (C().SIGLAS_DO_CORTEX.includes(b.sigla)) return null;
        let corpo = bs.filter(x => x.chave !== 'cabecalho');
        // Sigla do Gerador que é parte de uma tela com vários testes (TEACO-2 dentro de TEACO/TEADI/TEALT)
        const eq = C().equivalente && C().equivalente(b.sigla);
        if (eq && eq.parte) {
            const so = corpo.filter(x => new RegExp(eq.parte, 'i').test(x.titulo || ''));
            if (so.length) return b.vista === 'cabecalho' ? [por('cabecalho')].filter(Boolean) : so;
        }
        const achar = re => corpo.find(x => re.test(`${x.classe || ''} ${x.titulo || ''}`));
        // Tela com as duas formas juntas: cada vista pega as partes certas (e só as da forma pedida)
        const mt = mesmaTela(b.sigla);
        if (mt && mt.vistas[b.vista]) {
            const fm = mt.formas[b.sigla], vf = mt.vistasForma && mt.vistasForma[b.vista];
            // filtra: tira o que é só da outra forma (e o comparativo, que é das duas)
            const pega = (re, filtra) => corpo.filter(x => re.test(x.classe || '')).filter(x => !(filtra && fm) ||
                (!mt.juntos.test(x.classe || '') && !(fm[1].test(x.titulo || '') && !fm[0].test(x.titulo || ''))));
            let l = fm && vf ? pega(vf, true) : pega(mt.vistas[b.vista], !!fm);
            // cartões juntos × separados (figuras trazidas antes ou depois desta versão)
            if (!l.length && vf) l = fm ? pega(mt.vistas[b.vista], false) : pega(vf, false);
            if (b.vista === 'cartao') l = [por('cabecalho')].concat(l);
            l = l.filter(Boolean);
            // figuras antigas (sem estas partes): pede para trazer de novo em vez de pôr a parte errada
            return l.length > (b.vista === 'cartao' ? 1 : 0) ? l : null;
        }
        let lista;
        switch (b.vista) {
            case 'cabecalho': lista = [por('cabecalho')]; break;
            case 'cartao': lista = [por('cabecalho'), corpo[0]]; break;
            case 'tabela': lista = [corpo.find(x => x.tipo === 'tabela') || achar(/tab/i) || corpo[0]]; break;
            case 'regua': lista = [achar(/regua|barra|gravidade|total/i) || corpo[0]]; break;
            case 'subescalas': lista = [achar(/sub|perfil|fator|dom[ií]nio|escala/i) || corpo[0]]; break;
            case 'resumo': return null;
            default: lista = [corpo[0]];
        }
        lista = lista.filter(Boolean);
        return lista.length ? lista : null;
    }
    function figurasHtml(b, figs) {
        return `<div class="resultado cx-figs" data-sigla="${esc(b.sigla)}" data-vista="${esc(b.vista)}">${figs.map(f => {
            const url = FIG.urls[f.arquivo];
            const w = Math.round(f.w || 800), h = Math.round(f.h || 400);
            return url
                ? `<figure class="cx-fig"><img src="${esc(url)}" width="${w}" height="${h}" alt="${esc(f.titulo || b.sigla)}" decoding="async"></figure>`
                : `<figure class="cx-fig cx-fig-vazia" style="aspect-ratio:${w}/${h}"><span>${esc(b.sigla)} · ${esc(f.titulo || 'figura')}</span></figure>`;
        }).join('')}${(b.opcoes || {}).legenda ? `<p class="cx-leg">${esc(b.opcoes.legenda)}</p>` : ''}</div>`;
    }

    // ── Resumo (qualquer teste) ───────────────────────────────────────────────
    function resumo(sig, d) {
        const r = window.LaudoDados.resumo(sig, { resultados: { [sig]: d } });
        if (!r) return null;
        return `<div class="cx-card cx-resumo"><span class="cx-sig">${esc(sig)}</span><span>${esc(r.principal)}</span><span class="forte">${esc(r.valor)}</span>${selo(r.classificacao)}</div>`;
    }

    function aviso(txt, sig) {
        return `<div class="i-alerta cx-aviso" data-sigla="${esc(sig || '')}">⚠️ ${txt}</div>`;
    }

    /** Motivo de um resultado não poder ser desenhado (null = pode). */
    // Aplicação do teste (já corrigida) — serve para o "Só o cabeçalho" de qualquer teste,
    // mesmo sem leitura dos números no Laudo Online.
    function aplicacaoDe(sig, banco) {
        const eq = C().equivalente && C().equivalente(sig);
        const nomes = [sig].concat(eq ? [eq.sigla] : [], (window.LaudoEscalas && window.LaudoEscalas.APELIDOS[sig]) || []);
        const todas = (banco || {}).aplicacoes || [];
        // teste de fora com nome um pouco diferente no catálogo (ex.: "SON-R 6-40" ↔ "SON-R")
        if (C().modeloLancado && C().modeloLancado(sig)) { const v = C().siglaNoCortex(sig, todas.map(a => a.sigla)); if (v) nomes.push(v); }
        const ap = todas.filter(a => nomes.includes(a.sigla));
        return ap.find(a => a.corrigida) || ap[0] || null;
    }
    /** O bloco traz os dados do cabeçalho (Gerador, para teste sem tela no CORTEX, ou editados no laudo)? */
    const CAMPOS_CAB = ['nome', 'descricao', 'rotulo', 'valor', 'maximo', 'nota'];
    const temCabManual = op => CAMPOS_CAB.some(k => op && op[k] != null && String(op[k]).trim() !== '');
    function cabecalhoSimples(sig, banco, op) {
        op = op || {};
        const d = ((banco || {}).resultados || {})[sig];
        if (C().SIGLAS_DO_CORTEX.includes(sig) && d && !d.erro) return null;   // WAIS/WISC/RAVLT/FDT/BFP: cabeçalho do modelo
        const a = aplicacaoDe(sig, banco);
        const manual = temCabManual(op);
        if (!a && !manual) return null;
        // Cabeçalho montado com as informações do teste: nome, linha de descrição e o resultado principal
        const txt = v => v == null ? '' : String(v).trim();
        const nome = txt(op.nome) || (a && a.nome && a.nome !== sig ? a.nome : '');
        const valor = txt(op.valor);
        return cabecalho({
            titulo: txt(op.titulo) || sig, sub: [nome || null, txt(op.descricao) || null],
            rot: txt(op.rotulo) || (valor ? 'Resultado' : ''),
            valor: valor ? esc(valor) + (txt(op.maximo) ? `<small>/${esc(txt(op.maximo))}</small>` : '') : '',
            nota: txt(op.nota)
        });
    }

    // Teste sem as partes da tela: diz o que falta fazer (lançar, corrigir ou trazer as figuras).
    function motivoSemFigura(sig, banco) {
        const d = ((banco || {}).resultados || {})[sig];
        const a = aplicacaoDe(sig, banco);
        if (!a && !d) return null;
        if (a && !a.corrigida && !(d && !d.erro)) {
            const lanca = C().equivalente(sig) || (C().LANCADOS || {})[a.sigla];
            return lanca ? `${sig}: os resultados ainda não estão no CORTEX — mande-os no pacote do Gerador ("lancados") ou abra o teste na bateria (📝 Aplicar / Corrigir); depois use 📷 Figuras dos testes`
                : `${sig}: o teste ainda não foi corrigido no CORTEX`;
        }
        return `${sig}: as tabelas e gráficos da tela de correção ainda não foram trazidos (📷 Figuras dos testes)`;
    }

    // Página online: nada de imagens das telas de correção — tudo desenhado com os
    // resultados. Um bloco "figura" vira o desenho completo do teste; só o cabeçalho sai.
    function paraOnline(b) {
        if (b.vista !== 'figura') return b;
        const fs = [].concat((b.opcoes || {}).figuras || (b.opcoes || {}).figura || []);
        if (fs.length && fs.every(f => /cabecalho/.test(String(f)))) return null;
        const sig = b.sigla;
        const v = sig === 'WAIS-III' || sig === 'WISC-IV' ? 'perfil_subtestes' : 'cartao';
        return Object.assign({}, b, { vista: v, opcoes: Object.assign({}, b.opcoes, { figura: undefined, figuras: undefined }) });
    }

    function indisponivel(b, banco, extra) {
        if (extra && extra.online) {
            const bo = paraOnline(b);
            if (!bo) return 'só o cabeçalho (no online o título do teste já aparece)';
            b = bo;
            const sig = b.sigla, d = ((banco || {}).resultados || {})[sig];
            if (!C().vistasDe(sig).includes(b.vista)) return `${sig}: vista "${b.vista}" ainda não construída`;
            if (!d) return `${sig}: sem resultados no CORTEX para desenhar`;
            if (d.erro) return `${sig}: ${d.erro}`;
            return null;
        }
        const sig = b.sigla;
        if (figurasDe(b)) return null;
        if (b.vista === 'cabecalho' && cabecalhoSimples(sig, banco, b.opcoes)) return null;
        // Escalas e demais testes: só as partes da tela de correção (sem desenho próprio).
        if (!C().SIGLAS_DO_CORTEX.includes(sig) && b.vista !== 'resumo') { const m = motivoSemFigura(sig, banco); if (m) return m; }
        if (b.vista === 'figura') return `${sig}: figura da tela de correção ainda não capturada`;
        if (!C().vistasDe(sig).includes(b.vista)) return `${sig}: vista "${b.vista}" ainda não construída`;
        const d = ((banco || {}).resultados || {})[sig];
        if (!C().SIGLAS_DO_CORTEX.includes(sig)) {
            if (d && d.erro) return `${sig}: ${d.erro}`;
            if (d) return null;
            const E = window.LaudoEscalas;
            const conhecida = E && (E.leitor(sig) || (E.APELIDOS[sig] || []).some(x => E.leitor(x)));
            return conhecida || !E ? `${sig}: escala não respondida ou não corrigida no CORTEX` : `${sig}: este teste não está na bateria do paciente no CORTEX — a tabela não sai; o texto do Gerador continua no laudo`;
        }
        if (!d) return `${sig}: teste não aplicado ou não corrigido no CORTEX`;
        return null;
    }

    /**
     * Desenha um bloco `resultado`.
     * @param b      bloco { sigla, vista, opcoes }
     * @param banco  { resultados: { SIGLA: objeto } } (do banco ou do snapshot)
     * @param extra  { glossario, congelado }
     */
    function render(b, banco, extra) {
        extra = extra || {};
        // "SCARED" com autorrelato e heterorrelato respondidos: sai cada forma, uma depois da outra.
        // Na impressão, se a tela de correção já mostra as duas juntas (figuras), usa a tela.
        const formas = formasDe(b.sigla, banco);
        if (formas.length > 1 && !(mesmaTela(b.sigla) && !extra.online && figurasDe(b))) {
            // no online o cabeçalho do teste não aparece: um título diz de quem é cada parte
            const rotulo = s => { const r = (((banco || {}).resultados || {})[s] || {}).resumo || {}; return r.respondente || s; };
            return formas.map(s => (extra.online ? `<div class="cx-forma" data-sigla="${esc(s)}">${esc(rotulo(s))}</div>` : '') +
                render(Object.assign({}, b, { sigla: s }), banco, extra)).join('');
        }
        if (extra.online) {
            b = paraOnline(b);
            if (!b) return '';
            const m = indisponivel(b, banco, extra);
            if (m) return aviso(esc(m) + '.', b.sigla);
        }
        const sig = b.sigla, op = b.opcoes || {};
        // Cabeçalho com os dados escritos (Gerador ou editor): vale mesmo sem tela de correção no CORTEX
        if (!extra.online && b.vista === 'cabecalho' && temCabManual(op)) {
            const cm = cabecalhoSimples(sig, banco, op);
            if (cm) return `<div class="resultado" data-sigla="${esc(sig)}" data-vista="cabecalho" data-origem="pacote">${cm}${op.legenda ? `<p class="cx-leg">${esc(op.legenda)}</p>` : ''}</div>`;
        }
        const figs = extra.online ? null : figurasDe(b);
        if (figs) return figurasHtml(b, figs);
        if (b.vista === 'figura') return aviso(`${esc(sig)}: figura da tela de correção ainda não capturada. Use 📷 Figuras dos testes.`, sig);
        if (!C().vistasDe(sig).includes(b.vista)) return aviso(`${esc(sig)}: componente ainda não construído (vista "${esc(b.vista)}").`, sig);
        const d = ((banco || {}).resultados || {})[sig];
        if (b.vista === 'cabecalho') {
            const cs = cabecalhoSimples(sig, banco, op);
            if (cs) return `<div class="resultado" data-sigla="${esc(sig)}" data-vista="cabecalho" data-origem="${extra.congelado ? 'snapshot' : 'banco'}">${cs}${op.legenda ? `<p class="cx-leg">${esc(op.legenda)}</p>` : ''}</div>`;
        }
        if (!extra.online && !C().SIGLAS_DO_CORTEX.includes(sig) && b.vista !== 'resumo') { const m = motivoSemFigura(sig, banco); if (m) return aviso(esc(m) + '.', sig); }
        if (!C().SIGLAS_DO_CORTEX.includes(sig) && !d) return aviso(esc(indisponivel(b, banco) || `${sig}: sem dados`) + '.', sig);
        if (!d) return aviso(`${esc(sig)}: teste ainda não corrigido no CORTEX para este paciente.`, sig);
        if (d.erro) return aviso(`${esc(sig)}: ${esc(d.erro)}.`, sig);
        let h = null;
        if (b.vista === 'resumo') h = resumo(sig, d);
        else if (d.tipo === 'escala') h = escala(b, d, sig);
        else if (sig === 'WAIS-III' || sig === 'WISC-IV') h = wechsler(b, d, sig);
        else if (sig === 'RAVLT') h = ravlt(b, d);
        else if (sig === 'FDT') h = fdt(b, d);
        else if (sig === 'BFP') h = bfp(b, d, extra.glossario);
        if (h == null) return aviso(`${esc(sig)}: componente ainda não construído (vista "${esc(b.vista)}").`, sig);
        const cls = ['resultado'];
        if (op.sem_cabecalho) cls.push('sem-cab');
        return `<div class="${cls.join(' ')}" data-sigla="${esc(sig)}" data-vista="${esc(b.vista)}" data-origem="${extra.congelado ? 'snapshot' : 'banco'}">${h}${op.legenda ? `<p class="cx-leg">${esc(op.legenda)}</p>` : ''}</div>`;
    }

    /** Número-destaque de cada instrumento (página online, LO-5). */
    function destaque(sigla, d) {
        if (!d) return null;
        if (d.tipo === 'escala') {
            const R = d.resumo || {};
            if (R.principal) return { valor: R.principal.valor, rotulo: R.principal.rotulo, sub: R.indicacao || R.nome || '', classe: R.principal.classificacao, tom: R.principal.tom };
            const s0 = (R.subescalas || []).slice().sort((a, b) => ({ grave: 3, mod: 2, leve: 1 }[b.tom] || 0) - ({ grave: 3, mod: 2, leve: 1 }[a.tom] || 0))[0];
            return s0 ? { valor: s0.valor, rotulo: s0.nome, sub: R.indicacao || R.nome || '', classe: s0.classificacao, tom: s0.tom } : null;
        }
        if (sigla === 'WAIS-III' || sigla === 'WISC-IV') {
            const c = d.compostos || {}, g = icgDe(d), interp = d._interpretacao;
            if (interp && interp.qitInterpretavel === false && g) return { valor: g.composto, rotulo: 'ICG', sub: `Capacidade geral · QIT não interpretável (amplitude ${interp.amplitude})`, classe: g.classificacao || classComp(g.composto) };
            return c.QI_TOTAL ? { valor: c.QI_TOTAL.composto, rotulo: 'QIT', sub: 'QI Total', classe: classeDe(c.QI_TOTAL) } : null;
        }
        const r = window.LaudoDados.resumo(sigla, { resultados: { [sigla]: d } });
        return r ? { valor: r.valor, rotulo: r.principal, sub: '', classe: r.classificacao } : null;
    }

    window.LaudoGraf = { render, temCabManual, CAMPOS_CAB, indisponivel, paraOnline, destaque, usarFiguras, figurasDaSigla, figurasDe, selo, tom, classComp, classPond, SUBTESTES, FACETAS, NOME_IDX };
})();

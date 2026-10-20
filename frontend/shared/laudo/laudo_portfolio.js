/* ============================================================================
   CORTEX · Laudo Online — PÁGINA ONLINE (portfólio interativo)
   (frontend/shared/laudo/laudo_portfolio.js)
   ----------------------------------------------------------------------------
   Documento 1, §9.2 e Documento 3, §6.4 (sprint LO-5).
   Lê o MESMO documento da impressão (formato 2.0) e o apresenta como página
   inteira: abertura com o paciente, capítulos, fundo de neurônios que reage à
   rolagem e ao ponteiro, números que contam, vitrine de cada teste com a
   gaveta "Ver dados completos", balões do glossário, anotações (complementos)
   e mapa de domínios. Nada é escrito duas vezes: todo texto vem do documento.

   Usado em três lugares, sempre com o mesmo desenho:
     - CORTEX (laudo-online/online.html): em construção ou finalizado;
     - portal do paciente (portal/laudo-online.html): só finalizado e liberado;
     - acesso externo (frontend/externo/laudo.html): idem, escopo `laudos`.
   No portal e no externo (`publico: true`) não aparecem pendências nem avisos
   internos; `nota_interna` nunca aparece (o banco já tira do snapshot).

   LaudoPortfolio.desenhar(alvo, {
       doc, banco, glossario,          // documento, { paciente, resultados }, termos
       publico, linkProntuario, imagens, fotoUrl
   }) → { capitulos }
   LaudoPortfolio.parar()
   ============================================================================ */
(function () {
    'use strict';
    const C = () => window.LaudoCore, G = () => window.LaudoGraf;
    const esc = s => C().esc(s);
    const reduz = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const TOM_PILULA = { ok: 'sup', leve: 'mi', mod: 'mi', grave: 'inf', neutro: 'neu' };
    const pilula = (rot, t) => `<span class="p-pilula ${(t && TOM_PILULA[t]) || ({ sup: 'sup', med: 'med', mi: 'mi', inf: 'inf' })[C().faixa(rot)] || 'neu'}">${esc(rot)}</span>`;

    // Capítulos (Documento 1, §9.2). A seção vai para o capítulo de SECOES[n][2],
    // ou para secoes[].capitulo_online quando o laudo define outro.
    const CAPS = [
        { id: 'quem', tit: 'Quem é', matiz: 190 },
        { id: 'historia', tit: 'A história', matiz: 235 },
        { id: 'como', tit: 'Como avaliamos', matiz: 262 },
        { id: 'achados', tit: 'O que encontramos', matiz: 205 },
        { id: 'sintese', tit: 'Como tudo se conecta', matiz: 38 },
        { id: 'mapa', tit: 'Mapa de domínios', matiz: 165 },
        { id: 'hipoteses', tit: 'Hipóteses', matiz: 320 },
        { id: 'conclusao', tit: 'Conclusão', matiz: 215 },
        { id: 'passos', tit: 'Próximos passos', matiz: 150 },
        { id: 'fim', tit: 'Fechamento', matiz: 215 }
    ];

    const INSTRUMENTOS = {
        'WAIS-III': { dominio: 'Inteligência', cor: 'azul', avalia: 'Funcionamento intelectual global e quatro grandes índices: compreensão verbal, organização perceptual, memória operacional e velocidade de processamento.' },
        'WISC-IV': { dominio: 'Inteligência', cor: 'azul', avalia: 'Funcionamento intelectual de crianças e adolescentes em quatro índices e no QI total.' },
        'RAVLT': { dominio: 'Memória', cor: 'ciano', avalia: 'Aprendizagem de uma lista de 15 palavras ao longo de cinco leituras, interferência, evocação tardia e reconhecimento.' },
        'FDT': { dominio: 'Funções executivas', cor: 'roxo', avalia: 'Velocidade de processamento, controle inibitório e flexibilidade cognitiva, com números e quantidades.' },
        'BFP': { dominio: 'Personalidade', cor: 'rosa', avalia: 'Os cinco grandes fatores da personalidade: Neuroticismo, Extroversão, Socialização, Realização e Abertura.' },
        'ASRS-18': { dominio: 'Rastreio de TDAH', cor: 'ambar', avalia: 'Sintomas de desatenção e de hiperatividade/impulsividade em adultos, por autorrelato.' }
    };
    const CORES = ['azul', 'ciano', 'roxo', 'rosa', 'ambar', 'verde'];
    const FAIXA_TEXTO = {
        sup: 'Faixa Superior: acima de 110 em escore composto (percentil 75 ou mais). Recurso que pode compensar dificuldades em outras áreas.',
        med: 'Faixa Média: entre 90 e 109 em escore composto (percentis 25 a 74). Metade da população está aqui.',
        mi: 'Faixa Médio Inferior: entre 80 e 89 em escore composto (percentis 9 a 24). Zona de vulnerabilidade que costuma aparecer no dia a dia.',
        inf: 'Faixa Inferior: abaixo de 80 em escore composto (percentil 8 ou menos). Dificuldade significativa em relação à idade.'
    };
    const STATUS_MAPA = { preservado: 'ok', atencao: 'at', comprometido: 'cr' };

    let O = {};   // opções do desenho em curso

    // ── texto ────────────────────────────────────────────────────────────────
    function I(t) {
        let h = C().inline(t, O.ctx).replace(/class="lo-termo"/g, 'class="termo"');
        if (O.publico) h = h.replace(/<span class="lo-pend" data-pend="1">([\s\S]*?)<\/span>/g, '$1');
        else h = h.replace(/class="lo-pend"/g, 'class="pend" tabindex="0"');
        return h;
    }
    const plano = t => C().plano(t, O.ctx);
    const paras = (t, cls) => String(t || '').split(/\n{2,}/).filter(x => x.trim()).map(x => `<p class="${cls || 'p-txt'}">${I(x)}</p>`).join('');
    const semNumero = t => String(t || '').replace(/^\s*\d+(\.\d+)*\s*/, '');

    const visivel = b => b && !b.oculto && b.exibir !== 'impressao' && b.tipo !== 'conteudo_gerador' && b.tipo !== 'quebra_pagina' && b.tipo !== 'espaco';
    const ehTitulo = n => b => b.tipo === 'titulo' && Number(b.nivel || 3) === n;

    function agrupar(blocos, inicio) {
        const grupos = []; let atual = null; const soltos = [];
        blocos.forEach(b => {
            if (inicio(b)) { atual = { cab: b, blocos: [] }; grupos.push(atual); }
            else if (atual) atual.blocos.push(b);
            else soltos.push(b);
        });
        return { grupos, soltos };
    }

    // ── anotações (complementos, Documento 1, §7.3) ─────────────────────────
    function compl(b) {
        const cs = (b.complementos || []).filter(c => c && (c.texto || c.titulo));
        if (!cs.length) return '';
        return `<div class="p-compl">${cs.map(c => `<button type="button" class="p-compl-btn" data-pop-tag="Anotação" data-pop-tit="${esc(plano(c.titulo || 'Anotação'))}" data-pop-txt="${esc(plano(c.texto || ''))}">
            <span aria-hidden="true">💬</span>${esc(plano(c.titulo || 'Anotação'))}</button>`).join('')}</div>`;
    }

    // ── blocos genéricos (qualquer bloco, em qualquer capítulo) ─────────────
    function bloco(b, extra) {
        extra = extra || {};
        let h = '';
        try { h = conteudo(b, extra); } catch (e) { console.warn('[portfólio] bloco', b, e); h = ''; }
        if (!h) return '';
        return `<div class="p-bl rv" data-bloco="${esc(b.id || '')}">${h}${compl(b)}</div>`;
    }

    function conteudo(b, extra) {
        switch (b.tipo) {
            case 'titulo': return Number(b.nivel) === 4 ? `<h4 class="p-h4">${I(semNumero(b.texto))}</h4>` : `<h3 class="p-h3">${I(semNumero(b.texto))}</h3>`;
            case 'paragrafo': return `<p class="${extra.classe || 'p-txt'}">${I(b.texto)}</p>`;
            case 'padrao': return paras(b.texto);
            case 'meta': return `<p class="p-meta">${I(b.texto)}</p>`;
            case 'nota': return `<p class="p-nota">${I(b.texto)}</p>`;
            case 'alerta': return `<div class="p-alerta ${b.nivel === 'vermelho' ? 'verm' : ''}">${I(b.texto)}</div>`;
            case 'caixa': return `<div class="p-vidro p-caixa">${b.titulo ? `<h4>${I(b.titulo)}</h4>` : ''}${(b.paragrafos || []).map(x => `<p class="p-txt">${I(x)}</p>`).join('')}</div>`;
            case 'lista': {
                if (extra.passos) return passos(b);
                const tag = b.estilo === 'marcadores' ? 'ul' : 'ol';
                return `<${tag} class="p-lista">${(b.itens || []).map(x => `<li>${I(x)}</li>`).join('')}</${tag}>`;
            }
            case 'campos': return campos(b);
            case 'tabela_instrumentos': return instrumentos(b);
            case 'fidedignidade': return `<div class="p-callout"><small>Por que o ICG e não o QIT</small>${(b.paragrafos || []).map(p => `<p>${I(p)}</p>`).join('')}</div>`;
            case 'hipotese': return hipotese(b);
            case 'afastada': return `<div class="p-vidro p-afast"><i aria-hidden="true">✕</i><div><b>${I(b.condicao)} — afastada</b><p>${I(b.motivo)}${b.fonte ? ` Fonte: ${I(b.fonte)}.` : ''}</p></div></div>`;
            case 'mapa': return mapa(b);
            case 'referencias': return (b.itens || []).length ? `<details class="p-det"><summary>${b.chave === 'normativas' ? 'Referências normativas' : 'Referências bibliográficas'}</summary><div class="p-det-corpo p-refs">${b.itens.map(r => `<p>${I(r)}</p>`).join('')}</div></details>` : '';
            case 'resultado': return resultado(b);
            case 'tabela': return `<div class="p-tabela-w"><table class="p-tabela"><thead><tr>${(b.cabecalho || []).map(x => `<th>${I(x)}</th>`).join('')}</tr></thead><tbody>${(b.linhas || []).map(l => `<tr>${l.map(celula).join('')}</tr>`).join('')}</tbody></table></div>${b.nota ? `<p class="p-nota">${I(b.nota)}</p>` : ''}`;
            case 'imagem': {
                const url = (O.imagens || {})[b.arquivo];
                if (!url) return O.publico ? '' : `<p class="p-nota">Imagem <code>${esc(b.arquivo || '')}</code> não carregou.</p>`;
                return `<figure class="p-fig"><img src="${esc(url)}" alt="${esc(plano(b.legenda || ''))}" loading="lazy">${b.legenda ? `<figcaption>${I(b.legenda)}</figcaption>` : ''}</figure>`;
            }
            case 'acompanhe': return `<div class="p-vidro p-protegido">${O.linkProntuario ? `<div class="qrw">${window.LaudoImpressao.qrSVG(O.linkProntuario, 96)}</div>` : ''}
                <div><div class="p-chips"><span class="p-chip">CFP 06/2019</span><span class="p-chip">LGPD</span><span class="p-chip v">Acesso auditado</span></div><p>${esc(plano(b.texto || ''))}</p></div></div>`;
            case 'convite': {
                const link = b.link || ((O.doc.textos || {}).link_convite) || '';
                return `<div class="p-vidro p-review">${link ? `<div class="qrw">${window.LaudoImpressao.qrSVG(link, 110)}</div>` : ''}<div><span class="estrelas" aria-hidden="true">★★★★★</span><h3>Sua opinião faz a diferença!</h3>
                    <p>${esc(plano(b.texto || '')) || `Ficamos muito felizes em realizar a avaliação de ${esc(O.ctx.primeiroNome)}. Se puder, conte como foi no Google: leva menos de um minuto.`}</p>${link ? `<a class="p-btn sec" href="${esc(link)}" target="_blank" rel="noopener">Avaliar no Google ↗</a>` : ''}</div></div>`;
            }
            case 'classificacao_qi': return sino(b);
            case 'local_data': return `<p class="p-txt">${esc(b.cidade || 'Uberlândia — MG')}, ${esc(C().dataExtenso((O.doc.meta || {}).data_emissao || new Date().toISOString().slice(0, 10)))}.</p>`;
            case 'assinatura': {
                const t = O.doc.textos || {};
                return `<div class="p-vidro p-assin"><small class="p-cap-sec">Responsável técnico</small><p class="nome">${esc(b.nome || t.responsavel || '')}</p>
                    <p><b>${esc(b.registro || t.registro || '')}</b> · Neuropsicólogo</p>${b.mostrar_logo !== false ? `<img src="${esc(logo())}" alt="Equilibrium Med Center">` : ''}</div>`;
            }
            case 'cracha': return '';
            default: return '';
        }
    }
    function celula(cel) {
        const m = /^\{(sup|med|mi|inf|neutro)\}\s*/.exec(String(cel || ''));
        return m ? `<td>${pilula(String(cel).slice(m[0].length))}</td>` : `<td>${I(cel)}</td>`;
    }
    function logo() { return ((window.LaudoImpressao && window.LaudoImpressao.BASE) || '../shared/laudo/') + 'img/logo.png'; }

    function campos(b) {
        const p = O.banco.paciente || {};
        const linhas = [];
        if (p.data_nascimento) linhas.push(['Data de nascimento', esc(C().dataBR(p.data_nascimento))]);
        (b.linhas || []).forEach(l => linhas.push([I(l.rotulo), I(l.valor)]));
        return `<div class="p-campos">${linhas.map(l => `<div class="p-campo"><small>${l[0]}</small><span>${l[1]}</span></div>`).join('')}</div>`;
    }

    function instrumentos(b) {
        return `<div class="p-instr">${(b.linhas || []).map((l, i) => {
            const info = INSTRUMENTOS[l.sigla] || { cor: CORES[i % CORES.length] };
            const alvo = O.expos[l.sigla];
            const nome = String(l.nome || l.sigla || '');
            return `<button class="p-ins cor-${info.cor}" type="button"${alvo ? ` data-ir="${alvo}"` : ''} title="${esc(info.avalia || nome)}">
                ${l.status === 'complementar' ? '<span class="compl">† complementar</span>' : ''}<b>${esc(l.sigla || nome)}</b><span>${esc(nome.split(' — ')[1] || nome)}</span>${l.dominio ? `<em>${esc(l.dominio)}</em>` : ''}</button>`;
        }).join('')}</div>`;
    }

    function hipotese(b) {
        const conf = String(b.confianca || '').trim();
        const nivel = { INSUFICIENTE: 0, BAIXA: 1, BAIXO: 1, MODERADA: 2, MODERADO: 2, ALTA: 3, ALTO: 3 }[conf.toUpperCase()] || 0;
        const cods = Array.isArray(b.codigos) ? b.codigos : String(b.codigos || '').split('|').map(s => s.trim()).filter(Boolean);
        const rot = { principal: 'Hipótese principal', secundaria: 'Hipótese secundária', investigar: 'Hipótese a investigar' }[b.rotulo || 'principal'] || 'Hipótese';
        return `<article class="p-vidro p-hip"><div><small>${rot}</small><h3>${I(b.nome)}</h3></div>
            ${cods.length ? `<div class="p-cods">${cods.map(c => `<span class="p-cod">${esc(c)}</span>`).join('')}</div>` : ''}
            ${conf ? `<div class="p-conf"><div class="p-conf-barras">${[1, 2, 3].map(k => `<i class="${k <= nivel ? 'on' : ''}"></i>`).join('')}</div><span>Nível de confiança: <b>${esc(conf.charAt(0).toUpperCase() + conf.slice(1).toLowerCase())}</b></span></div>` : ''}
            <div class="p-hip-col">${[['Critérios', b.criterios], ['Evidências', b.evidencias], ['Contraponto', b.contraponto]].filter(x => x[1]).map(x => `<div><h4>${x[0]}</h4><p>${I(x[1])}</p></div>`).join('')}</div>
            ${b.acao ? `<p class="p-txt"><strong>Ação:</strong> ${I(b.acao)}</p>` : ''}</article>`;
    }

    function passos(b) {
        return `<div class="p-passos">${(b.itens || []).map(it => {
            const mm = /^\*\*(.+?)\*\*\s*([\s\S]*)$/.exec(String(it));
            const tit = mm ? mm[1].replace(/[.:]$/, '') : '', resto = mm ? mm[2] : it;
            return `<article class="p-passo">${tit ? `<h3>${I(tit)}</h3>` : ''}<p>${I(resto)}</p></article>`;
        }).join('')}</div>`;
    }

    // Resultado dentro do texto: desenhado pelo mesmo componente da impressão.
    function resultado(b) {
        const motivo = G().indisponivel(b, O.banco);
        if (motivo) return O.publico ? '' : `<p class="p-nota">${esc(motivo)}.</p>`;
        return `<div class="p-graf"><div class="imp">${G().render(b, O.banco, { glossario: O.glossario, congelado: O.congelado })}</div></div>`;
    }

    // ── curva das faixas de QI (Seção 4) ─────────────────────────────────────
    function sino(b) {
        const fq = b.linhas || [];
        if (!fq.length) return '';
        const rng = l => {
            const s = String(l[2]).replace(/\s/g, '');
            if (/^>/.test(s)) return [130, 160];
            if (/^[≤<]/.test(s)) return [40, 70];
            const [a, z] = s.split(/[–-]/).map(Number); return [a, z + 1];
        };
        const X = v => 30 + (v - 40) / 120 * 640, pdf = v => Math.exp(-((v - 100) ** 2) / (2 * 15 * 15)), Y = v => 210 - pdf(v) * 170;
        const curva = (a, z) => { let d = `M${X(a)} 210`; for (let v = a; v <= z; v += 1) d += ` L${X(v).toFixed(1)} ${Y(v).toFixed(1)}`; return d + ` L${X(z)} 210 Z`; };
        const cores = { sup: '#4CD08A', med: '#4C8DF6', mi: '#F5B544', inf: '#F2706B' };
        const faixas = fq.map((l, i) => {
            const [a, z] = rng(l), t = C().faixa(l[3]) || 'med';
            return `<g class="faixa" tabindex="0" role="button" data-i="${i}" aria-label="${esc(l[3])}"><path d="${curva(a, z)}" fill="${cores[t] || cores.med}" fill-opacity="${t === 'med' ? .55 : .42}" stroke="${cores[t] || cores.med}" stroke-opacity=".9" stroke-width="1"/>
                <text x="${X((a + z) / 2)}" y="${Math.min(Y((a + z) / 2) - 8, 196)}" text-anchor="middle" font-size="11" font-weight="700" fill="#E8EEFA">${esc(l[0])}%</text></g>`;
        }).join('');
        const ticks = [70, 80, 90, 100, 110, 120, 130].map(v => `<text x="${X(v)}" y="228" text-anchor="middle" font-size="10.5" fill="#6E80A3">${v}</text>`).join('');
        const R = O.banco.resultados || {};
        const d = G().destaque('WAIS-III', R['WAIS-III']) || G().destaque('WISC-IV', R['WISC-IV']);
        const marca = d && typeof d.valor === 'number' ? `<g><line x1="${X(d.valor)}" x2="${X(d.valor)}" y1="${Y(d.valor) - 26}" y2="210" stroke="#fff" stroke-width="2" stroke-dasharray="4 3"/><circle cx="${X(d.valor)}" cy="${Y(d.valor)}" r="6" fill="#fff"/><text x="${X(d.valor)}" y="${Y(d.valor) - 32}" text-anchor="middle" font-size="12" font-weight="800" fill="#fff">${esc(d.rotulo)} ${d.valor}</text></g>` : '';
        return `<div class="p-vidro p-sino" data-fq='${esc(JSON.stringify(fq))}'><h3>Como ler os resultados</h3><p>A curva mostra como a população se distribui. Toque numa faixa para ver o que ela significa${marca ? `; a linha branca marca a capacidade geral de ${esc(O.ctx.primeiroNome)}` : ''}.</p>
            <svg viewBox="0 0 700 240" role="img" aria-label="Distribuição normal com as faixas de classificação">${faixas}<line x1="30" x2="670" y1="210" y2="210" stroke="rgba(148,178,230,.35)"/>${ticks}${marca}</svg>
            <div class="p-sino-info" aria-live="polite"><span>Escolha uma faixa da curva.</span></div></div>`;
    }

    // ── mapa de domínios (Seção 7) ───────────────────────────────────────────
    function quebrar(t, n) { const ps = String(t).split(' '), out = []; let l = ''; ps.forEach(p => { if ((l + ' ' + p).trim().length > n && l) { out.push(l); l = p; } else l = (l + ' ' + p).trim(); }); if (l) out.push(l); return out; }
    function mapa(b) {
        const L = (b.linhas || []).map(l => ({ st: STATUS_MAPA[l.status] || 'at', dominio: plano(l.dominio || ''), desempenho: I(l.desempenho || ''), instrumentos: plano(l.instrumentos || '') }));
        if (!L.length) return '';
        L.forEach(l => { const s = Object.keys(O.expos).find(sig => l.instrumentos.includes(sig)); l.ir = s ? O.expos[s] : ''; });
        const n = L.length, cx = 260, cy = 250, R = 165;
        const cor = { ok: '#4CD08A', at: '#F5B544', cr: '#F2706B' };
        const nos = L.map((l, i) => {
            const a = -Math.PI / 2 + i * 2 * Math.PI / n, x = cx + R * Math.cos(a), y = cy + R * Math.sin(a);
            const tx = cx + (R + 44) * Math.cos(a), ty = cy + (R + 44) * Math.sin(a), anc = Math.abs(Math.cos(a)) < 0.3 ? 'middle' : Math.cos(a) > 0 ? 'start' : 'end';
            return { l, i, x, y, tx, ty, anc, linhas: l.dominio.length > 14 ? quebrar(l.dominio, 14) : [l.dominio] };
        });
        const svg = `<svg viewBox="-95 -30 710 560" role="img" aria-label="Mapa de domínios">
            <defs><radialGradient id="p-centro" cx="35%" cy="30%"><stop offset="0" stop-color="#3B7BE8"/><stop offset="1" stop-color="#0E1F45"/></radialGradient></defs>
            <circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="rgba(148,178,230,.12)" stroke-dasharray="3 6"/>
            ${nos.map(o => `<line class="lig" x1="${cx}" y1="${cy}" x2="${o.x}" y2="${o.y}" stroke="${cor[o.l.st]}"/>`).join('')}
            <circle cx="${cx}" cy="${cy}" r="46" fill="url(#p-centro)" stroke="rgba(92,201,211,.6)" stroke-width="2"/>
            <text x="${cx}" y="${cy + 8}" text-anchor="middle" font-size="24" font-weight="700" fill="#fff" font-family="Bricolage Grotesque, Inter, sans-serif">${esc(C().iniciais(O.banco.paciente.nome_completo))}</text>
            ${nos.map(o => `<g class="no" tabindex="0" role="button" data-i="${o.i}" aria-label="${esc(o.l.dominio)}"><circle class="halo" cx="${o.x}" cy="${o.y}" r="34" fill="${cor[o.l.st]}"/><circle cx="${o.x}" cy="${o.y}" r="18" fill="${cor[o.l.st]}" stroke="#060B18" stroke-width="3"/>
                <text x="${o.tx}" y="${o.ty - (o.linhas.length - 1) * 10 + 6}" text-anchor="${o.anc}">${o.linhas.map((t, k) => `<tspan x="${o.tx}" dy="${k ? 20 : 0}">${esc(t)}</tspan>`).join('')}</text></g>`).join('')}</svg>`;
        return `<div class="p-vidro p-mapa" data-mapa='${esc(JSON.stringify(L))}'>${svg}
            <div class="p-mapa-info"><div class="p-mapa-card" aria-live="polite"></div><div class="p-legenda"><span class="st-ok">Preservado</span><span class="st-at">Atenção</span><span class="st-cr">Comprometido</span></div></div></div>`;
    }

    // ── abertura ─────────────────────────────────────────────────────────────
    function abertura() {
        const p = O.banco.paciente || {}, ctx = O.ctx;
        const todos = []; (O.doc.secoes || []).forEach(s => { if (!s.oculta) (s.blocos || []).filter(visivel).forEach(b => todos.push(b)); });
        const camposB = todos.find(b => b.tipo === 'campos');
        const campo = re => { const l = camposB && (camposB.linhas || []).find(x => re.test(plano(x.rotulo))); return l ? l.valor : ''; };
        const periodo = plano(campo(/Aplica/i));
        const finalidade = campo(/Finalidade/i);
        const mp = todos.find(b => b.tipo === 'mapa');
        const linhasMapa = (mp && mp.linhas) || [];
        const ok = linhasMapa.filter(l => l.status === 'preservado').length, aten = linhasMapa.length - ok;
        const hip = todos.find(b => b.tipo === 'hipotese' && (b.rotulo || 'principal') === 'principal');
        const conf = hip && hip.confianca ? String(hip.confianca) : '';
        const ti = todos.find(b => b.tipo === 'tabela_instrumentos');
        const nInst = (O.doc.inventario || []).length || ((ti && ti.linhas) || []).length;
        const foto = O.fotoUrl || p.foto_assinada;
        const nums = [
            nInst ? `<div class="p-num"><b data-contar="${nInst}">${nInst}</b><span>instrumentos aplicados</span></div>` : '',
            linhasMapa.length ? `<div class="p-num"><b data-contar="${ok}">${ok}</b><span>domínios preservados</span></div>` : '',
            linhasMapa.length ? `<div class="p-num al"><b data-contar="${aten}">${aten}</b><span>domínios pedem atenção</span></div>` : '',
            conf ? `<div class="p-num"><b class="p-num-txt">${esc(conf.charAt(0).toUpperCase() + conf.slice(1).toLowerCase())}</b><span>confiança da hipótese principal</span></div>` : ''
        ].join('');
        return `<header class="p-hero" data-matiz="215"><div class="port-larg">
            <p class="p-eyebrow rv"><img src="${esc(logo())}" alt="">Laudo neuropsicológico · Equilibrium Med Center</p>
            <div class="p-hero-grade"><div class="rv"><h1 class="p-nome">${esc(p.nome_completo || '')}</h1>
                <p class="p-sub"><b>${esc(ctx.idade)}</b>${p.escolaridade ? ` · ${esc(p.escolaridade)}` : ''}${periodo ? ` · avaliação de ${esc(periodo)}` : ''}</p></div>
                <div class="p-avatar rv" aria-hidden="true">${foto ? `<img src="${esc(foto)}" alt="">` : esc(C().iniciais(p.nome_completo))}</div></div>
            ${finalidade ? `<div class="p-pergunta rv"><span class="p-pergunta-ico" aria-hidden="true">?</span><div><small>A pergunta da avaliação</small><p>${I(finalidade)}</p></div></div>` : ''}
            ${nums ? `<div class="p-numeros rv">${nums}</div>` : ''}
            <p class="p-rolar"><i aria-hidden="true"></i>Role para percorrer o laudo</p></div></header>`;
    }

    // ── capítulos ────────────────────────────────────────────────────────────
    function capitulo(i, cap, secoes, corpo) {
        const ns = secoes.map(s => s.n);
        const rot = ns.length === 1 ? `Seção ${ns[0]}` : ns.length === 2 ? `Seções ${ns[0]} e ${ns[1]}` : `Seções ${ns[0]} a ${ns[ns.length - 1]}`;
        return `<section class="p-cap" id="cap-${cap.id}" data-matiz="${cap.matiz}"><div class="port-larg p-cap-grade">
            <div class="p-cap-rot rv"><span class="p-cap-n">${String(i + 1).padStart(2, '0')}</span><h2 class="p-cap-tit">${esc(cap.tit)}</h2><span class="p-cap-sec">${esc(rot)}</span></div>
            <div class="p-cap-corpo">${corpo}</div></div></section>`;
    }

    const lista = bs => bs.map(b => bloco(b)).join('');

    function corpoHistoria(bs) {
        const { grupos, soltos } = agrupar(bs, ehTitulo(3));
        const marco = (tit, blocos) => `<article class="p-vidro p-marco rv">${tit ? `<h3>${I(semNumero(tit))}</h3>` : ''}${blocos.map(b => conteudo(b, {}) + compl(b)).join('')}</article>`;
        return `<div class="p-linha">${soltos.length ? marco('', soltos) : ''}${grupos.map(g => marco(g.cab.texto, g.blocos)).join('')}</div>`;
    }

    function corpoComo(bs) {
        let primeiro = true;
        return bs.map(b => {
            if (b.tipo === 'paragrafo' && primeiro) { primeiro = false; return bloco(b, { classe: 'p-lede' }); }
            return bloco(b);
        }).join('');
    }

    function gruposAchados(bs) {
        const { grupos, soltos } = agrupar(bs, ehTitulo(3));
        return {
            soltos,
            grupos: grupos.map((g, i) => {
                const res = g.blocos.find(b => b.tipo === 'resultado');
                const txt = semNumero(g.cab.texto);
                const sigla = res ? res.sigla : txt.split(' — ')[0].trim();
                return { id: 'expo-' + C().slug(sigla || ('t' + i)) + '-' + i, sigla, num: (/^\s*(\d+\.\d+)/.exec(g.cab.texto) || [])[1] || '', nome: txt.split(' — ')[1] || '', cab: g.cab, blocos: g.blocos };
            })
        };
    }

    const VISTAS_VITRINE_FORA = /^(cabecalho|tabela|tabela_subtestes|resumo|indice|qit_icg)$/;
    function expo(gr) {
        const R = O.banco.resultados || {}, d = R[gr.sigla], info = Object.assign({ dominio: O.dominios[gr.sigla] }, INSTRUMENTOS[gr.sigla] || {});
        const dest = G().destaque(gr.sigla, d);
        const meta = gr.blocos.find(b => b.tipo === 'meta');
        const ehW = gr.sigla === 'WAIS-III' || gr.sigla === 'WISC-IV';
        const usados = new Set(meta ? [meta] : []);
        const destHtml = dest ? `<div class="p-dest"><small>${esc(dest.rotulo || 'Resultado')}</small>
            <b>${typeof dest.valor === 'number' ? `<span data-contar="${dest.valor}">${dest.valor}</span>` : esc(dest.valor)}</b>
            ${dest.classe ? pilula(dest.classe, dest.tom) : ''}${dest.sub ? `<p>${esc(dest.sub)}</p>` : ''}${meta ? `<p class="p-dest-meta">${I(meta.texto)}</p>` : ''}</div>` : '';
        let corpo = '';
        if (ehW && d) {
            const idx = []; let cur = null;
            gr.blocos.forEach(b => {
                if (b.tipo === 'titulo' && Number(b.nivel) === 4) { cur = { h4: b, res: null, ps: [] }; idx.push(cur); }
                else if (cur && b.tipo === 'resultado' && b.vista === 'indice') cur.res = b;
                else if (cur && b.tipo === 'paragrafo' && cur.res) cur.ps.push(b);
            });
            const comp = d.compostos || {};
            const cards = idx.filter(x => x.res && comp[(x.res.opcoes || {}).indice || x.res.indice]).map(x => {
                const k = (x.res.opcoes || {}).indice || x.res.indice, c = comp[k], cl = c.classificacao || G().classComp(c.composto);
                [x.h4, x.res].concat(x.ps).forEach(b => usados.add(b));
                return `<article class="p-idx"><div class="p-idx-top"><span>${esc(k)}</span><b data-contar="${c.composto}">${c.composto}</b></div>
                    <div class="p-regua-idx anima"><i class="anim-x" style="width:${Math.max(2, Math.min(100, (c.composto - 40) / 120 * 100)).toFixed(1)}%"></i></div>
                    <h4>${esc(semNumero(x.h4.texto).split(' — ')[1] || semNumero(x.h4.texto))} · ${pilula(cl)}</h4>${x.ps.map(p => `<p>${I(p.texto)}</p>${compl(p)}`).join('')}</article>`;
            }).join('');
            const fid = gr.blocos.find(b => b.tipo === 'fidedignidade');
            if (fid) usados.add(fid);
            const graf = gr.blocos.filter(b => b.tipo === 'resultado' && visivel(b) && (b.vista === 'intervalos' || b.vista === 'perfil_subtestes') && !G().indisponivel(b, O.banco));
            graf.forEach(b => usados.add(b));
            gr.blocos.filter(b => b.tipo === 'resultado' || (b.tipo === 'titulo' && Number(b.nivel) === 4 && !idx.some(x => x.h4 === b && x.res))).forEach(b => usados.add(b));
            const resto = gr.blocos.filter(b => !usados.has(b) && visivel(b));
            corpo = `<div class="p-expo-grade">${destHtml}<div class="p-textos">${fid ? conteudo(fid, {}) : ''}${resto.map(b => conteudo(b, {}) + compl(b)).join('')}</div></div>
                ${cards ? `<div class="p-idx-grade">${cards}</div>` : ''}
                ${graf.length ? `<div class="p-graf-lista">${graf.map(b => resultado(b)).join('')}</div>` : ''}`;
        } else {
            const graf = gr.blocos.filter(b => b.tipo === 'resultado' && visivel(b) && !VISTAS_VITRINE_FORA.test(b.vista));
            const textos = gr.blocos.filter(b => b.tipo !== 'resultado' && b !== meta && visivel(b));
            const grafHtml = graf.map(b => resultado(b)).join('');
            corpo = `<div class="p-expo-grade ${destHtml ? '' : 'sem-dest'}">${destHtml}<div class="p-textos">${textos.map(b => conteudo(b, {}) + compl(b)).join('')}</div></div>${grafHtml ? `<div class="p-graf-lista">${grafHtml}</div>` : ''}`;
        }
        const temGaveta = gr.blocos.some(b => b.tipo === 'resultado' && b.exibir !== 'impressao' && !b.oculto && !G().indisponivel(b, O.banco));
        return `<article class="p-vidro p-expo rv" id="${gr.id}"><div class="p-expo-cab"><div><small>${esc(gr.num)}${info.dominio ? ` · ${esc(info.dominio)}` : ''}</small><h3>${esc(gr.sigla)}<span>${esc(gr.nome)}</span></h3></div>
            ${temGaveta ? `<button class="p-btn" type="button" data-gaveta="${gr.id}">Ver dados completos</button>` : ''}</div>${corpo}</article>`;
    }

    // Gaveta: todos os blocos da subseção, no visual claro das telas de correção.
    function gavetaHtml(gr) {
        const info = INSTRUMENTOS[gr.sigla] || {};
        const conteudoG = gr.blocos.filter(b => !b.oculto && b.exibir !== 'impressao').map(b => {
            if (b.tipo === 'resultado') return G().indisponivel(b, O.banco) ? '' : `<div class="p-gav-res">${G().render(b, O.banco, { glossario: O.glossario, congelado: O.congelado })}</div>`;
            if (b.tipo === 'titulo') return `<h4 class="i-h4">${I(semNumero(b.texto))}</h4>`;
            if (b.tipo === 'paragrafo') return `<p class="i-p">${I(b.texto)}</p>`;
            if (b.tipo === 'nota') return `<p class="i-nota">${I(b.texto)}</p>`;
            if (b.tipo === 'fidedignidade') return `<h4 class="i-h4">Fidedignidade do QIT</h4>` + (b.paragrafos || []).map(p => `<p class="i-p">${I(p)}</p>`).join('');
            return '';
        }).join('');
        const meta = gr.blocos.find(b => b.tipo === 'meta');
        return `${info.avalia ? `<div class="p-gaveta-sobre"><small>O que o instrumento avalia</small><p>${esc(info.avalia)}</p></div>` : ''}
            ${meta ? `<div class="p-gaveta-sobre"><small>Norma e aplicação</small><p>${I(meta.texto)}</p></div>` : ''}
            <div class="imp">${conteudoG}</div>`;
    }

    function corpoAchados(bs, A) {
        return `${A.soltos.map((b, i) => bloco(b, i === 0 && b.tipo === 'paragrafo' ? {} : {})).join('')}${A.grupos.map(g => expo(g)).join('')}`;
    }

    function corpoSintese(bs) {
        const { grupos, soltos } = agrupar(bs, ehTitulo(3));
        return `${lista(soltos)}<div class="p-sint">${grupos.map((g, i) => {
            const txt = g.blocos.map(b => C().textos(b).join(' ')).join(' ');
            const fontes = Object.keys(O.expos).filter(s => txt.includes(s));
            return `<article class="p-vidro p-sint-c rv" data-n="${String(i + 1).padStart(2, '0')}"><h3>${I(semNumero(g.cab.texto))}</h3>
                ${g.blocos.map(b => conteudo(b, {}) + compl(b)).join('')}
                ${fontes.length ? `<div class="p-fontes">${fontes.map(s => `<button class="p-fonte" type="button" data-ir="${O.expos[s]}">Ver ${esc(s)} ↗</button>`).join('')}</div>` : ''}</article>`;
        }).join('')}</div>`;
    }

    function corpoHipoteses(bs) {
        let afastadas = false;
        // a Nota técnica (texto institucional) vai para o fim do capítulo, recolhida
        const notas = bs.filter(b => b.tipo === 'padrao' && b.chave === 'nota_tecnica_81');
        bs = bs.filter(b => !notas.includes(b)).concat(notas);
        return bs.map(b => {
            if (b.tipo === 'titulo' && /afastad/i.test(b.texto || '')) { afastadas = true; return `<p class="p-cap-sec rv">Hipóteses afastadas</p>`; }
            if (b.tipo === 'titulo' && /hip[oó]tese principal/i.test(b.texto || '')) return '';
            if (b.tipo === 'afastada' && !afastadas) { afastadas = true; return `<p class="p-cap-sec rv">Hipóteses afastadas</p>` + bloco(b); }
            if (b.tipo === 'padrao' && b.chave === 'nota_tecnica_81') return `<details class="p-det rv"><summary>Sobre este documento · Nota técnica</summary><div class="p-det-corpo">${paras(b.texto, 'p-txt')}</div></details>`;
            if (b.tipo === 'titulo' && b.ancora === 'nota-tecnica') return '';
            return bloco(b);
        }).join('');
    }

    function corpoConclusao(bs) {
        let primeiro = true;
        return bs.map(b => {
            if (b.tipo === 'paragrafo' && primeiro) { primeiro = false; return `<div class="p-bl rv"><p class="p-concl">${I(b.texto)}</p>${compl(b)}</div>`; }
            return bloco(b);
        }).join('');
    }

    function corpoPassos(bs) { return bs.map(b => bloco(b, { passos: true })).join(''); }

    function corpoFim(bs) {
        const cards = bs.filter(b => b.tipo === 'assinatura' || b.tipo === 'convite');
        const refs = bs.filter(b => b.tipo === 'referencias' && (b.itens || []).length);
        const outros = bs.filter(b => !cards.includes(b) && !refs.includes(b));
        const itensRefs = [];
        refs.forEach(r => (r.itens || []).forEach(x => itensRefs.push(x)));
        return `${lista(outros)}${cards.length ? `<div class="p-fim rv">${cards.map(b => conteudo(b, {})).join('')}</div>` : ''}
            ${itensRefs.length ? `<details class="p-det rv"><summary>Referências bibliográficas e normativas</summary><div class="p-det-corpo p-refs">${itensRefs.map(r => `<p>${I(r)}</p>`).join('')}</div></details>` : ''}`;
    }

    // ── balão ────────────────────────────────────────────────────────────────
    let balao = null, balaoDe = null;
    function abrirBalao(anc, o) {
        fecharBalao();
        balao = document.createElement('div');
        balao.className = 'p-balao'; balao.setAttribute('role', 'dialog');
        if (o.faixa) balao.dataset.faixa = o.faixa;
        if (o.tipo) balao.dataset.tipo = o.tipo;
        balao.innerHTML = `<button type="button" aria-label="Fechar">×</button>${o.tag ? `<small>${esc(o.tag)}</small>` : ''}<h4>${esc(o.tit)}</h4><p>${esc(o.txt)}</p>${o.extra ? `<p>${esc(o.extra)}</p>` : ''}`;
        document.body.appendChild(balao);
        const r = anc.getBoundingClientRect(), bw = balao.offsetWidth, bh = balao.offsetHeight;
        let left = r.left + window.scrollX + r.width / 2 - bw / 2;
        left = Math.max(window.scrollX + 16, Math.min(left, window.scrollX + document.documentElement.clientWidth - bw - 16));
        let top = r.bottom + window.scrollY + 12;
        if (r.bottom + bh + 24 > window.innerHeight && r.top > bh + 24) top = r.top + window.scrollY - bh - 12;
        balao.style.left = left + 'px'; balao.style.top = top + 'px';
        balao.querySelector('button').onclick = fecharBalao;
        balaoDe = anc;
    }
    function fecharBalao() { if (balao) { balao.remove(); balao = null; if (balaoDe && balaoDe.focus) balaoDe.focus({ preventScroll: true }); balaoDe = null; } }
    function acionarBalao(el) {
        if (el.matches('.termo')) {
            const t = el.dataset.termo || el.textContent;
            if (el.dataset.texto) return abrirBalao(el, { tag: 'Explicação deste caso', tit: t, txt: el.dataset.texto });
            const g = (O.glossario || {})[String(t).toLowerCase()];
            return abrirBalao(el, g ? { tag: 'Glossário', tit: g.titulo || t, txt: g.texto } : { tag: 'Glossário', tit: t, txt: 'Termo sem explicação no glossário da clínica.' });
        }
        if (el.matches('.pend')) return abrirBalao(el, { tag: 'Pendência', tipo: 'pend', tit: 'Campo a confirmar', txt: 'O Gerador marcou este ponto para confirmação. Não aparece no portal nem para o médico externo.', extra: el.textContent });
        if (el.matches('[data-pop-tit]')) {
            const f = el.dataset.popFaixa;
            return abrirBalao(el, { tag: el.dataset.popTag || 'Resultado', tit: el.dataset.popTit, txt: el.dataset.popTxt, faixa: f, extra: f ? FAIXA_TEXTO[f] : '' });
        }
    }
    const SEL_BALAO = '.termo, .pend, [data-pop-tit]';

    // ── gaveta ───────────────────────────────────────────────────────────────
    function abrirGaveta(html, sup, tit) {
        fecharGaveta();
        const g = document.createElement('div');
        g.className = 'p-gaveta'; g.id = 'p-gaveta';
        g.innerHTML = `<aside class="p-gaveta-painel" role="dialog" aria-modal="true" aria-label="${esc(tit)}"><div class="p-gaveta-cab"><div><small>${esc(sup)}</small><h3>${esc(tit)}</h3></div><button class="p-fechar" type="button" aria-label="Fechar">×</button></div>${html}</aside>`;
        document.body.appendChild(g);
        g.addEventListener('click', e => {
            if (e.target === g) { fecharGaveta(); return; }
            const el = e.target.closest(SEL_BALAO);
            if (el) { e.stopPropagation(); if (balaoDe === el && balao) fecharBalao(); else acionarBalao(el); }
        });
        g.querySelector('.p-fechar').onclick = fecharGaveta;
        g.querySelector('.p-fechar').focus();
        document.body.style.overflow = 'hidden';
    }
    function fecharGaveta() { const g = document.getElementById('p-gaveta'); if (g) { g.remove(); document.body.style.overflow = ''; } }

    // ── fundo vivo: rede de neurônios ────────────────────────────────────────
    function Fundo(cv) {
        const g = cv.getContext('2d');
        let w = 0, h = 0, dpr = 1, nos = [], matiz = 215, alvo = 215, vel = 0, ultimoY = window.scrollY, raf = 0;
        const t0 = performance.now();
        const ponteiro = { x: -999, y: -999 };
        function medir() {
            dpr = Math.min(2, window.devicePixelRatio || 1); w = window.innerWidth; h = window.innerHeight;
            cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); g.setTransform(dpr, 0, 0, dpr, 0, 0);
            const n = w < 700 ? 52 : 104;
            nos = Array.from({ length: n }, (_, i) => ({ x: Math.random() * w, y: Math.random() * h * 1.4, z: .35 + Math.random() * .65, f: Math.random() * 6.28, r: 1 + Math.random() * 1.8, k: i % 7 === 0 }));
        }
        function quadro(agora) {
            const t = (agora - t0) / 1000, sy = window.scrollY;
            vel += (sy - ultimoY) * 0.12; vel *= 0.9; ultimoY = sy;
            matiz += (alvo - matiz) * 0.035;
            g.clearRect(0, 0, w, h);
            const pts = nos.map(n => {
                const H = h * 1.4;
                let y = ((n.y - sy * n.z * 0.22) % H + H) % H - h * 0.2;
                let x = n.x + Math.sin(t * 0.25 + n.f) * 10 * n.z;
                y += Math.cos(t * 0.2 + n.f) * 8 * n.z - vel * n.z * 0.6;
                const dx = x - ponteiro.x, dy = y - ponteiro.y, d = Math.hypot(dx, dy);
                let brilho = 0;
                if (d < 170) { const f = (1 - d / 170); x -= dx * f * 0.12; y -= dy * f * 0.12; brilho = f; }
                return { x, y, z: n.z, r: n.r, k: n.k, b: brilho };
            });
            const forca = Math.min(1, Math.abs(vel) / 30);
            for (let i = 0; i < pts.length; i++) {
                const a = pts[i];
                for (let j = i + 1; j < pts.length; j++) {
                    const b = pts[j], dx = a.x - b.x, dy = a.y - b.y, lim = 70 + 80 * Math.min(a.z, b.z);
                    if (dx * dx + dy * dy > lim * lim) continue;
                    const d = Math.sqrt(dx * dx + dy * dy), al = (1 - d / lim) * (0.12 + 0.22 * Math.min(a.z, b.z) + 0.25 * forca + 0.35 * Math.max(a.b, b.b));
                    g.strokeStyle = `hsla(${matiz + a.z * 40}, 85%, 68%, ${al.toFixed(3)})`;
                    g.lineWidth = 0.6 + a.z * 0.6;
                    g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
                }
            }
            pts.forEach(p => {
                const al = 0.35 + p.z * 0.45 + p.b * 0.4;
                g.fillStyle = `hsla(${matiz + p.z * 40}, 90%, ${p.k ? 78 : 70}%, ${Math.min(1, al).toFixed(3)})`;
                g.beginPath(); g.arc(p.x, p.y, p.r * (p.k ? 1.8 : 1) * (1 + p.b * 0.8), 0, 6.283); g.fill();
                if (p.k) { g.fillStyle = `hsla(${matiz}, 90%, 70%, 0.08)`; g.beginPath(); g.arc(p.x, p.y, 14 + p.b * 10, 0, 6.283); g.fill(); }
            });
            if (!reduz()) raf = requestAnimationFrame(quadro);
        }
        const mover = e => { const p = e.touches ? e.touches[0] : e; ponteiro.x = p.clientX; ponteiro.y = p.clientY; };
        const sair = () => { ponteiro.x = ponteiro.y = -999; };
        return {
            iniciar() { medir(); window.addEventListener('resize', medir); window.addEventListener('pointermove', mover, { passive: true }); window.addEventListener('pointerleave', sair); cancelAnimationFrame(raf); raf = requestAnimationFrame(quadro); },
            parar() { cancelAnimationFrame(raf); window.removeEventListener('resize', medir); window.removeEventListener('pointermove', mover); window.removeEventListener('pointerleave', sair); },
            alvo(m) { alvo = m; }
        };
    }

    // ── montagem ─────────────────────────────────────────────────────────────
    let fundo = null, observadores = [], aoRolar = null, raizAtual = null;
    function parar() {
        if (fundo) fundo.parar(); fundo = null;
        observadores.forEach(o => o.disconnect()); observadores = [];
        if (aoRolar) window.removeEventListener('scroll', aoRolar); aoRolar = null;
        fecharBalao(); fecharGaveta();
    }

    function capituloDe(sec) {
        if (sec.capitulo_online && CAPS.some(c => c.id === sec.capitulo_online)) return sec.capitulo_online;
        const def = C().SECOES.find(s => s[0] === String(sec.n));
        return def ? def[2] : 'fim';
    }

    function desenhar(alvo, opcoes) {
        parar();
        O = Object.assign({ glossario: {}, imagens: {}, publico: false }, opcoes || {});
        O.banco = O.banco || { paciente: {}, resultados: {} };
        O.banco.paciente = O.banco.paciente || {};
        O.ctx = C().contexto(O.banco, (O.doc || {}).meta);
        O.congelado = !!O.banco.congelado;
        if (G().usarFiguras) G().usarFiguras((O.doc || {}).figuras || null, O.imagens || {});

        // seções → capítulos
        const porCap = {};
        (O.doc.secoes || []).forEach(s => {
            if (s.oculta) return;
            const bs = (s.blocos || []).filter(visivel);
            if (!bs.length) return;
            const id = capituloDe(s);
            (porCap[id] = porCap[id] || { secoes: [], blocos: [] }).secoes.push(s);
            porCap[id].blocos.push(...bs);
        });
        const ordem = (((O.doc.layout || {}).online || {}).capitulos || []).map(c => c.id || c).filter(id => CAPS.some(c => c.id === id));
        const caps = (ordem.length ? ordem.map(id => CAPS.find(c => c.id === id)) : CAPS).map(c => {
            const nome = ((((O.doc.layout || {}).online || {}).capitulos || []).find(x => x && x.id === c.id) || {}).titulo;
            return nome ? Object.assign({}, c, { tit: nome }) : c;
        }).filter(c => porCap[c.id]);

        O.dominios = {};
        (O.doc.secoes || []).forEach(s => (s.blocos || []).forEach(b => { if (b.tipo === 'tabela_instrumentos') (b.linhas || []).forEach(l => { if (l.sigla && l.dominio) O.dominios[l.sigla] = l.dominio; }); }));
        const A = gruposAchados(porCap.achados ? porCap.achados.blocos : []);
        O.expos = {};
        A.grupos.forEach(g => { if (g.sigla && !O.expos[g.sigla]) O.expos[g.sigla] = g.id; });

        const CORPOS = {
            historia: corpoHistoria, como: corpoComo, achados: bs => corpoAchados(bs, A), sintese: corpoSintese,
            hipoteses: corpoHipoteses, conclusao: corpoConclusao, passos: corpoPassos, fim: corpoFim
        };
        const corpoCap = c => (CORPOS[c.id] || lista)(porCap[c.id].blocos);

        alvo.innerHTML = `<div class="port"><canvas class="port-fundo" aria-hidden="true"></canvas><div class="port-veu" aria-hidden="true"></div><div class="port-conteudo">
            ${abertura()}${caps.map((c, i) => capitulo(i, c, porCap[c.id].secoes, corpoCap(c))).join('')}
            <footer class="p-rodape port-larg">Laudo neuropsicológico · Equilibrium Med Center · documento sigiloso, acesso registrado (LGPD)</footer></div>
            <nav class="p-trilho" aria-label="Capítulos">${caps.map(c => `<a href="#cap-${c.id}" data-cap="${c.id}"><span>${esc(c.tit)}</span><i></i></a>`).join('')}</nav>
            <div class="p-progresso" aria-hidden="true"><i></i></div></div>`;
        const raiz = alvo.querySelector('.port');
        raizAtual = raiz;

        fundo = Fundo(raiz.querySelector('.port-fundo')); fundo.iniciar();

        // revelação, números que contam e barras que crescem
        const contar = el => {
            const fim = Number(el.dataset.contar); if (!isFinite(fim) || reduz()) return;
            const t0 = performance.now(), dur = 1100;
            const passo = t => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = Math.round(fim * e); if (k < 1) requestAnimationFrame(passo); };
            requestAnimationFrame(passo);
        };
        const abaixo = el => el.getBoundingClientRect().top > window.innerHeight * 0.9;
        const vigiados = [...raiz.querySelectorAll('.rv, .anima')].filter(abaixo);
        if (!reduz() && 'IntersectionObserver' in window) {
            vigiados.forEach(el => { el.classList.add('pre'); el.querySelectorAll('.anim-x').forEach((x, i) => x.style.setProperty('--i', i % 14)); });
            const ob = new IntersectionObserver(es => es.forEach(e => {
                if (!e.isIntersecting) return;
                e.target.classList.remove('pre'); ob.unobserve(e.target);
                e.target.querySelectorAll('[data-contar]').forEach(contar);
            }), { rootMargin: '0px 0px -10% 0px' });
            vigiados.forEach(el => ob.observe(el)); observadores.push(ob);
        }

        // capítulo ativo → cor do fundo, trilho e barra de progresso
        const secs = [...raiz.querySelectorAll('.p-cap')], trilho = [...raiz.querySelectorAll('.p-trilho a')], barra = raiz.querySelector('.p-progresso i');
        let pend = false;
        aoRolar = () => {
            if (pend) return; pend = true;
            requestAnimationFrame(() => {
                pend = false;
                const lim = window.innerHeight * 0.45; let at = null;
                secs.forEach(c => { if (c.getBoundingClientRect().top <= lim) at = c; });
                const matiz = at ? Number(at.dataset.matiz) : 215;
                raiz.style.setProperty('--matiz', matiz); if (fundo) fundo.alvo(matiz);
                trilho.forEach(a => a.classList.toggle('ativo', !!at && a.dataset.cap === at.id.replace('cap-', '')));
                const r = raiz.getBoundingClientRect(), tot = r.height - window.innerHeight;
                barra.style.transform = `scaleX(${Math.max(0, Math.min(1, -r.top / Math.max(1, tot))).toFixed(4)})`;
            });
        };
        window.addEventListener('scroll', aoRolar, { passive: true }); aoRolar();
        trilho.forEach(a => a.addEventListener('click', e => { e.preventDefault(); const c = document.getElementById(a.getAttribute('href').slice(1)); if (c) c.scrollIntoView({ behavior: reduz() ? 'auto' : 'smooth' }); }));

        const ir = id => { const el = document.getElementById(id); if (!el) return; el.scrollIntoView({ behavior: reduz() ? 'auto' : 'smooth', block: 'start' }); el.classList.remove('flash-p'); void el.offsetWidth; el.classList.add('flash-p'); };

        // curva das faixas
        raiz.querySelectorAll('.p-sino').forEach(sinoEl => {
            const fq = JSON.parse(sinoEl.dataset.fq), info = sinoEl.querySelector('.p-sino-info');
            const escolher = g => {
                sinoEl.querySelectorAll('.faixa').forEach(x => x.classList.toggle('ativa', x === g));
                const l = fq[Number(g.dataset.i)];
                info.innerHTML = `<b>${esc(l[3])}</b><span>QI ${esc(l[2])} · percentil ${esc(l[1])} · ${esc(l[0])}% da população${l[4] ? ` · ${esc(l[4])}` : ''}</span>`;
            };
            sinoEl.querySelectorAll('.faixa').forEach(g => { g.addEventListener('click', () => escolher(g)); g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); escolher(g); } }); });
            const media = [...sinoEl.querySelectorAll('.faixa')].find(g => /M[ée]dio$/i.test(fq[Number(g.dataset.i)][3]));
            if (media) escolher(media);
        });

        // mapa
        raiz.querySelectorAll('.p-mapa').forEach(mapaEl => {
            const L = JSON.parse(mapaEl.dataset.mapa), card = mapaEl.querySelector('.p-mapa-card');
            const rot = { ok: ['Preservado', '#4CD08A'], at: ['Atenção', '#F5B544'], cr: ['Comprometido', '#F2706B'] };
            const escolher = i => {
                const l = L[i];
                mapaEl.querySelectorAll('.no').forEach(n => n.classList.toggle('ativo', Number(n.dataset.i) === i));
                card.innerHTML = `<small style="color:${rot[l.st][1]}">${rot[l.st][0]}</small><h3>${esc(l.dominio)}</h3><p>${l.desempenho}</p>${l.instrumentos ? `<p class="p-mapa-fontes">Fontes: ${esc(l.instrumentos)}</p>` : ''}${l.ir ? `<button class="p-btn sec" type="button" data-ir="${l.ir}">Ver a análise ↓</button>` : ''}`;
            };
            mapaEl.querySelectorAll('.no').forEach(n => { n.addEventListener('click', () => escolher(Number(n.dataset.i))); n.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); escolher(Number(n.dataset.i)); } }); });
            const prim = L.findIndex(l => l.st === 'cr'); escolher(prim >= 0 ? prim : 0);
        });

        // cliques gerais: ir para um teste, gaveta, balões
        raiz.addEventListener('click', e => {
            const bIr = e.target.closest('[data-ir]'); if (bIr) { ir(bIr.dataset.ir); return; }
            const bG = e.target.closest('[data-gaveta]');
            if (bG) {
                const gr = A.grupos.find(g => g.id === bG.dataset.gaveta);
                if (gr) abrirGaveta(gavetaHtml(gr), `${gr.num}${(INSTRUMENTOS[gr.sigla] || {}).dominio ? ' · ' + INSTRUMENTOS[gr.sigla].dominio : ''}`, `${gr.sigla}${gr.nome ? ' — ' + gr.nome : ''}`);
                return;
            }
            const el = e.target.closest(SEL_BALAO);
            if (el) { e.stopPropagation(); if (balaoDe === el && balao) fecharBalao(); else acionarBalao(el); }
        });
        raiz.addEventListener('keydown', e => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            const el = e.target.closest(SEL_BALAO);
            if (el && !el.closest('.faixa') && !el.closest('.no') && el.tagName !== 'BUTTON') { e.preventDefault(); acionarBalao(el); }
        });
        return { capitulos: secs.length, testes: A.grupos.length };
    }

    document.addEventListener('click', e => { if (balao && !balao.contains(e.target) && !e.target.closest(SEL_BALAO)) fecharBalao(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { fecharBalao(); fecharGaveta(); } });
    window.addEventListener('resize', fecharBalao);

    window.LaudoPortfolio = { desenhar, parar, INSTRUMENTOS };
})();

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

    // ── referências: cada item ganha âncora para as citações do texto irem direto a ele ──
    function refHtml(r) {
        const i = (O.refs || []).indexOf(String(r));
        return `<p class="p-ref"${i >= 0 ? ` id="p-ref-${i}"` : ''}>${I(r)}</p>`;
    }
    const semAc = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    // "(Wechsler, 2013)", "(Mattos et al., 2006; Rohde, 2010)", "Wechsler (2013)" → link para a referência
    // certa. Só vira link quando o sobrenome e o ano batem com um item das referências (nunca chuta).
    function acharRef(autor, ano) {
        const a = (semAc(autor).match(/[a-z][a-z'-]+/) || [])[0];     // primeiro sobrenome citado
        if (!a || a.length < 2 || a === 'et') return -1;
        return (O.refsPlano || []).findIndex(t => t.startsWith(a) && t.includes(ano));
    }
    function botaoCita(txt, i) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'p-cita'; b.dataset.ref = 'p-ref-' + i;
        b.dataset.popTag = 'Referência'; b.dataset.popTit = 'Referência citada'; b.dataset.popTxt = O.refsPlano2[i];
        b.textContent = txt; return b;
    }
    function linkarCitacoes(raiz) {
        if (!(O.refs || []).length) return;
        const andar = document.createTreeWalker(raiz.querySelector('.port-conteudo') || raiz, NodeFilter.SHOW_TEXT, {
            acceptNode: n => (!/\d{4}/.test(n.nodeValue) || n.parentElement.closest('.p-refs, button, a, svg, .termo, script, style')) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
        });
        const nos = []; while (andar.nextNode()) nos.push(andar.currentNode);
        // (Autor, 2013) · (Autor et al., 2006; Outro, 2010) · Autor (2013)
        const re = /\(([^()]{2,240}?\d{4}[a-z]?)\)|([A-ZÀ-Ú][A-Za-zÀ-ú'-]+(?:\s+(?:et al\.|e|&)(?:\s+[A-ZÀ-Ú][A-Za-zÀ-ú'-]+)?)?)\s+\((\d{4}[a-z]?)\)/g;
        nos.forEach(no => {
            const t = no.nodeValue, frag = document.createDocumentFragment();
            let ult = 0, achou = false, m;
            re.lastIndex = 0;
            while ((m = re.exec(t))) {
                const pecas = [];
                if (m[1]) {
                    let algum = false;
                    m[1].split(/;\s*/).forEach((pt, k) => {
                        if (k) pecas.push('; ');
                        const mm = /^(.+?),\s*(\d{4}[a-z]?)$/.exec(pt.trim()), i = mm ? acharRef(mm[1], mm[2]) : -1;
                        if (i >= 0) { algum = true; pecas.push(botaoCita(pt.trim(), i)); } else pecas.push(pt);
                    });
                    if (!algum) continue;
                    pecas.unshift('('); pecas.push(')');
                } else {
                    const i = acharRef(m[2], m[3]); if (i < 0) continue;
                    pecas.push(botaoCita(m[0], i));
                }
                achou = true;
                frag.append(t.slice(ult, m.index), ...pecas); ult = m.index + m[0].length;
            }
            if (!achou) return;
            frag.append(t.slice(ult)); no.replaceWith(frag);
        });
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
            case 'referencias': return (b.itens || []).length ? `<details class="p-det"><summary>${b.chave === 'normativas' ? 'Referências normativas' : 'Referências bibliográficas'}</summary><div class="p-det-corpo p-refs">${b.itens.map(r => refHtml(r)).join('')}</div></details>` : '';
            case 'resultado': return resultado(b);
            case 'tabela': return `<div class="p-tabela-w"><table class="p-tabela"><thead><tr>${(b.cabecalho || []).map(x => `<th>${I(x)}</th>`).join('')}</tr></thead><tbody>${(b.linhas || []).map(l => `<tr>${l.map((cel, k) => celula(cel, b, k)).join('')}</tr>`).join('')}</tbody></table></div>${b.nota ? `<p class="p-nota">${I(b.nota)}</p>` : ''}`;
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
    // na página online a classificação vira pílula; cor do texto e negrito valem igual à impressão
    function celula(cel, b, k) {
        const c = C().celulaTabela(b || {}, cel, k);
        if (c.fundo) return `<td><span class="p-pilula ${c.fundo}">${I(c.texto)}</span></td>`;
        // fundo escuro: os mesmos tons, mais claros
        const CLARAS = { verde: '#86EFAC', azul: '#93C5FD', ambar: '#FCD34D', laranja: '#FDBA74', vermelho: '#FCA5A5', roxo: '#C4B5FD', cinza: '#CBD5E1' };
        // cor livre escura (ex.: azuis do padrão) fica legível no fundo escuro: clareia
        const clarear = hex => { const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, bl = n & 255; const lum = (0.299 * r + 0.587 * g + 0.114 * bl) / 255; if (lum > .55) return hex; const mx = v => Math.round(v + (255 - v) * .55); return `rgb(${mx(r)},${mx(g)},${mx(bl)})`; };
        const L = C().lerCelula(cel), cor = L.cor ? (CLARAS[L.cor] || clarear(L.cor)) : null;
        const css = [cor ? `color:${cor}` : '', L.bg ? `background:${L.bg}55` : '', L.negrito ? 'font-weight:700' : ''].filter(Boolean).join(';');
        return `<td${css ? ` style="${css}"` : ''}>${I(c.texto)}</td>`;
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

    // Online: tudo desenhado com os resultados, sem imagens das telas de correção (LO-8).
    const ON = { online: true };
    // vários blocos do mesmo teste (partes da tela) viram um desenho só
    function semRepetir(bs) {
        const vistos = new Set();
        const on = b => (G().paraOnline ? G().paraOnline(b) : b);
        const R = O.banco.resultados || {};
        // numa escala, o desenho completo (cartão) já tem a régua e as subescalas
        const comCartao = new Set(bs.map(on).filter(x => x && x.vista === 'cartao' && R[x.sigla] && R[x.sigla].tipo === 'escala').map(x => x.sigla));
        return bs.filter(b => {
            const bo = on(b);
            if (!bo) return false;
            if (comCartao.has(bo.sigla) && (bo.vista === 'regua' || bo.vista === 'subescalas')) return false;
            const k = bo.sigla + '|' + bo.vista;
            if (vistos.has(k)) return false;
            vistos.add(k); return true;
        });
    }
    // Resultado dentro do texto: desenhado pelo mesmo componente da impressão.
    function resultado(b) {
        const motivo = G().indisponivel(b, O.banco, ON);
        if (motivo) return O.publico ? '' : `<p class="p-nota">${esc(motivo)}.</p>`;
        return `<div class="p-graf"><div class="imp">${G().render(b, O.banco, { glossario: O.glossario, congelado: O.congelado, online: true })}</div></div>`;
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
        // "SCARED" com as duas formas: o destaque mostra o total da outra forma também
        if (dest && d && (d.formas || []).length > 1) {
            const outras = d.formas.filter(s => s !== d.apelido_de).map(s => {
                const r = (R[s] || {}).resumo || {}, P = r.principal;
                return P && P.valor != null ? `${r.respondente || s}: total ${P.valor}${P.classificacao ? ' (' + P.classificacao + ')' : ''}.` : null;
            }).filter(Boolean);
            if (outras.length) dest.sub = [dest.sub].concat(outras).filter(Boolean).join(' ');
        }
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
            const vistaW = b => { const bo = G().paraOnline ? G().paraOnline(b) : b; return bo ? bo.vista : ''; };
            const graf = semRepetir(gr.blocos.filter(b => b.tipo === 'resultado' && visivel(b) && (vistaW(b) === 'intervalos' || vistaW(b) === 'perfil_subtestes') && !G().indisponivel(b, O.banco, ON)));
            graf.forEach(b => usados.add(b));
            gr.blocos.filter(b => b.tipo === 'resultado' || (b.tipo === 'titulo' && Number(b.nivel) === 4 && !idx.some(x => x.h4 === b && x.res))).forEach(b => usados.add(b));
            const resto = gr.blocos.filter(b => !usados.has(b) && visivel(b));
            corpo = `<div class="p-expo-grade">${destHtml}<div class="p-textos">${fid ? conteudo(fid, {}) : ''}${resto.map(b => conteudo(b, {}) + compl(b)).join('')}</div></div>
                ${cards ? `<div class="p-idx-grade">${cards}</div>` : ''}
                ${graf.length ? `<div class="p-graf-lista">${graf.map(b => resultado(b)).join('')}</div>` : ''}`;
        } else {
            const graf = semRepetir(gr.blocos.filter(b => b.tipo === 'resultado' && visivel(b) && !VISTAS_VITRINE_FORA.test(b.vista) && !G().indisponivel(b, O.banco, ON)));
            const textos = gr.blocos.filter(b => b.tipo !== 'resultado' && b !== meta && visivel(b));
            const grafHtml = graf.map(b => resultado(b)).join('');
            corpo = `<div class="p-expo-grade ${destHtml ? '' : 'sem-dest'}">${destHtml}<div class="p-textos">${textos.map(b => conteudo(b, {}) + compl(b)).join('')}</div></div>${grafHtml ? `<div class="p-graf-lista">${grafHtml}</div>` : ''}`;
        }
        const temGaveta = gr.blocos.some(b => b.tipo === 'resultado' && b.exibir !== 'impressao' && !b.oculto && !G().indisponivel(b, O.banco, ON));
        return `<article class="p-vidro p-expo rv" id="${gr.id}"><div class="p-expo-cab"><div><small>${esc(gr.num)}${info.dominio ? ` · ${esc(info.dominio)}` : ''}</small><h3>${esc(gr.sigla)}<span>${esc(gr.nome)}</span></h3></div>
            ${temGaveta ? `<button class="p-btn" type="button" data-gaveta="${gr.id}">Ver dados completos</button>` : ''}</div>${corpo}</article>`;
    }

    // Gaveta: todos os blocos da subseção, no visual claro das telas de correção.
    function gavetaHtml(gr) {
        const info = INSTRUMENTOS[gr.sigla] || {};
        const dosRes = semRepetir(gr.blocos.filter(b => b.tipo === 'resultado' && !b.oculto && b.exibir !== 'impressao'));
        const conteudoG = gr.blocos.filter(b => !b.oculto && b.exibir !== 'impressao' && (b.tipo !== 'resultado' || dosRes.includes(b))).map(b => {
            if (b.tipo === 'resultado') return G().indisponivel(b, O.banco, ON) ? '' : `<div class="p-gav-res">${G().render(b, O.banco, { glossario: O.glossario, congelado: O.congelado, online: true })}</div>`;
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
            // sigla como palavra inteira (sem pegar "ATA" dentro de outra palavra)
            const fontes = Object.keys(O.expos).filter(s => new RegExp(`(^|[^A-Za-z0-9-])${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9])`).test(txt));
            // índices citados no texto (IMO, IVP…) levam direto à linha do gráfico daquele teste
            const pontuais = [];
            fontes.filter(s => s === 'WAIS-III' || s === 'WISC-IV').forEach(s => {
                ['ICV', 'IOP', 'IMO', 'IVP', 'QIT', 'ICG', 'QIV', 'QIE'].forEach(k => { if (new RegExp(`\\b${k}\\b`).test(txt)) pontuais.push([s, k]); });
            });
            const bts = pontuais.map(([s, k]) => `<button class="p-fonte" type="button" data-ir="${O.expos[s]}" data-alvo="idx:${k}">${esc(k)} no ${esc(s)} ↗</button>`)
                .concat(fontes.filter(s => !pontuais.some(p => p[0] === s)).map(s => `<button class="p-fonte" type="button" data-ir="${O.expos[s]}">Ver ${esc(s)} ↗</button>`));
            return `<article class="p-vidro p-sint-c rv" data-n="${String(i + 1).padStart(2, '0')}"><h3>${I(semNumero(g.cab.texto))}</h3>
                ${g.blocos.map(b => conteudo(b, {}) + compl(b)).join('')}
                ${bts.length ? `<div class="p-fontes">${bts.join('')}</div>` : ''}</article>`;
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
            ${itensRefs.length ? `<details class="p-det rv"><summary>Referências bibliográficas e normativas</summary><div class="p-det-corpo p-refs">${itensRefs.map(r => refHtml(r)).join('')}</div></details>` : ''}`;
    }

    // ── balão ────────────────────────────────────────────────────────────────
    let balao = null, balaoDe = null;
    function abrirBalao(anc, o) {
        fecharBalao();
        balao = document.createElement('div');
        balao.className = 'p-balao'; balao.setAttribute('role', 'dialog');
        if (o.faixa) balao.dataset.faixa = o.faixa;
        if (o.tipo) balao.dataset.tipo = o.tipo;
        if (o.fixo) balao.classList.add('fixo');
        const partes = (o.partes || []).filter(x => x && x.txt).map(x => `<div class="p-bal-parte ${x.cls || ''}"><small>${esc(x.rot)}</small><p>${esc(x.txt)}</p></div>`).join('');
        balao.innerHTML = `<button type="button" aria-label="Fechar">×</button>${o.tag ? `<small>${esc(o.tag)}</small>` : ''}<h4>${esc(o.tit)}</h4>` +
            (partes || `<p>${esc(o.txt)}</p>${o.extra ? `<p>${esc(o.extra)}</p>` : ''}`) +
            (o.tecnico ? `<p class="p-bal-tec">${esc(o.tecnico)}</p>` : '');
        balao.addEventListener('mouseenter', () => clearTimeout(tFechar));
        balao.addEventListener('mouseleave', () => { if (!balao || !balao.classList.contains('fixo')) agendarFechar(); });
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
    function fecharBalao() { if (balao) { const fixo = balao.classList.contains('fixo'); balao.remove(); balao = null; if (fixo && balaoDe && balaoDe.focus) balaoDe.focus({ preventScroll: true }); balaoDe = null; } }
    function acionarBalao(el, fixo) {
        if (el.matches('.termo')) {
            const t = el.dataset.termo || el.textContent;
            if (el.dataset.texto) return abrirBalao(el, { tag: 'Explicação deste caso', tit: t, txt: el.dataset.texto, fixo });
            const g = (O.glossario || {})[String(t).toLowerCase()];
            return abrirBalao(el, g ? { tag: 'Glossário', tit: g.titulo || t, txt: g.texto, fixo } : { tag: 'Glossário', tit: t, txt: 'Termo sem explicação no glossário da clínica.', fixo });
        }
        if (el.matches('.pend')) return abrirBalao(el, { tag: 'Pendência', tipo: 'pend', tit: 'Campo a confirmar', txt: 'O Gerador marcou este ponto para confirmação. Não aparece no portal nem para o médico externo.', extra: el.textContent, fixo });
        if (el.matches('[data-pop-tit]')) {
            const f = el.dataset.popFaixa;
            // medida com explicação para a família: "o que é" + "no dia a dia", e os números embaixo
            const ex = el.dataset.popK && window.LaudoExplica ? window.LaudoExplica.de(el.dataset.popK, el.dataset.popN, (O.ctx || {}).primeiroNome) : null;
            if (ex && ex.oque) return abrirBalao(el, { tag: 'Entenda este resultado', tit: el.dataset.popTit, faixa: f, fixo,
                partes: [{ rot: 'O que é', txt: ex.oque }, { rot: `No dia a dia${(O.ctx || {}).primeiroNome ? ' de ' + O.ctx.primeiroNome : ''}`, txt: ex.vida, cls: 'vida' }],
                tecnico: el.dataset.popTxt });
            return abrirBalao(el, { tag: el.dataset.popTag || 'Resultado', tit: el.dataset.popTit, txt: el.dataset.popTxt, faixa: f, extra: f ? FAIXA_TEXTO[f] : '', fixo });
        }
    }
    const SEL_BALAO = '.termo, .pend, [data-pop-tit]';
    // Ao passar o mouse (computador): abre sozinho e fecha ao sair. Clique fixa o balão aberto.
    // No celular/tablet continua por toque.
    const comMouse = () => window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    let tAbrir = null, tFechar = null;
    function agendarFechar() { clearTimeout(tFechar); tFechar = setTimeout(() => { if (balao && !balao.classList.contains('fixo')) fecharBalao(); }, 220); }
    function cliqueBalao(el) {
        clearTimeout(tAbrir);
        if (balaoDe === el && balao) { if (balao.classList.contains('fixo')) fecharBalao(); else balao.classList.add('fixo'); }
        else acionarBalao(el, true);
    }
    document.addEventListener('mouseover', e => {
        if (!comMouse()) return;
        const el = e.target.closest && e.target.closest(SEL_BALAO);
        if (!el || !el.closest('.port, #p-gaveta')) return;
        clearTimeout(tFechar);
        if (el === balaoDe) return;
        if (balao && balao.classList.contains('fixo')) return;
        clearTimeout(tAbrir); tAbrir = setTimeout(() => acionarBalao(el, false), 140);
    });
    document.addEventListener('mouseout', e => {
        if (!comMouse()) return;
        const el = e.target.closest && e.target.closest(SEL_BALAO);
        if (!el || el.contains(e.relatedTarget) || (balao && balao.contains(e.relatedTarget))) return;
        clearTimeout(tAbrir);
        if (el === balaoDe) agendarFechar();
    });

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
            if (el) { e.stopPropagation(); cliqueBalao(el); }
        });
        g.querySelector('.p-fechar').onclick = fecharGaveta;
        g.querySelector('.p-fechar').focus();
        document.body.style.overflow = 'hidden';
    }
    function fecharGaveta() { const g = document.getElementById('p-gaveta'); if (g) { g.remove(); document.body.style.overflow = ''; } }

    // ── fundo vivo: sinapses (rede neural orgânica) ──────────────────────────
    // Corpos de neurônio com espinhos curtos, filamentos curvos que afinam até um
    // botão sináptico e pulsos de luz correndo pelas ligações. O mouse/dedo solta
    // uma onda de disparos; a rolagem acelera os pulsos. Escuro: tons do capítulo;
    // claro creme: tudo no azul-marinho.
    function Fundo(cv) {
        const g = cv.getContext('2d');
        let w = 0, h = 0, dpr = 1, nos = [], matiz = 215, alvo = 215, vel = 0, ultimoY = window.scrollY, raf = 0, creme = false, ult = performance.now();
        const t0 = performance.now();
        const ponteiro = { x: -999, y: -999 };
        const semente = (i, j, k) => { const x = Math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453; return x - Math.floor(x); };
        function medir() {
            dpr = Math.min(2, window.devicePixelRatio || 1); w = window.innerWidth; h = window.innerHeight;
            cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); g.setTransform(dpr, 0, 0, dpr, 0, 0);
            const n = w < 700 ? 46 : 92;
            nos = Array.from({ length: n }, () => ({ x: Math.random() * w, y: Math.random() * h * 1.4, z: .4 + Math.random() * .6, f: Math.random() * 6.28, onda: 0 }));
        }
        const linha = a => creme ? `rgba(31, 56, 100, ${a.toFixed(3)})` : `hsla(${matiz + 25}, 85%, 70%, ${a.toFixed(3)})`;
        const viva = a => creme ? `rgba(46, 90, 156, ${a.toFixed(3)})` : `hsla(${matiz - 25}, 95%, 78%, ${a.toFixed(3)})`;
        const corpo = a => creme ? `rgba(31, 56, 100, ${a.toFixed(3)})` : `hsla(${matiz + 15}, 90%, 74%, ${a.toFixed(3)})`;
        function quadro(agora) {
            const t = (agora - t0) / 1000, dt = Math.min(.05, (agora - ult) / 1000), sy = window.scrollY;
            ult = agora;
            vel += (sy - ultimoY) * 0.12; vel *= 0.9; ultimoY = sy;
            matiz += (alvo - matiz) * 0.035;
            g.clearRect(0, 0, w, h);
            const forca = Math.min(1, Math.abs(vel) / 30);
            const H = h * 1.4;
            const P = nos.map(n => {
                let y = ((n.y - sy * n.z * 0.22) % H + H) % H - h * 0.2;
                const x = n.x + Math.sin(t * 0.25 + n.f) * 8 * n.z;
                y += Math.cos(t * 0.2 + n.f) * 7 * n.z - vel * n.z * 0.5;
                const d = Math.hypot(x - ponteiro.x, y - ponteiro.y);
                if (d < 150) n.onda = Math.max(n.onda, 1 - d / 150);
                n.onda = Math.max(0, n.onda - dt * 0.7);
                return { x, y, n };
            });
            const lim = w < 700 ? 118 : 150, liga = new Array(P.length).fill(0);
            g.lineCap = 'round';
            for (let i = 0; i < P.length; i++) {
                const A = P[i];
                for (let j = i + 1; j < P.length; j++) {
                    if (liga[i] >= 3 || liga[j] >= 4) continue;
                    const B = P[j], dx = A.x - B.x, dy = A.y - B.y;
                    if (dx * dx + dy * dy > lim * lim) continue;
                    liga[i]++; liga[j]++;
                    const d = Math.sqrt(dx * dx + dy * dy), perto = 1 - d / lim;
                    const k = (semente(i, j, 1) - .5) * .5;
                    const mx = (A.x + B.x) / 2 - (B.y - A.y) * k, my = (A.y + B.y) / 2 + (B.x - A.x) * k;
                    const on = Math.max(A.n.onda, B.n.onda), z = Math.min(A.n.z, B.n.z);
                    const base = (creme ? .1 : .12) + (creme ? .14 : .2) * z;
                    const al = perto * (base + .25 * forca) + on * .45;
                    // filamento: mais grosso no começo, fino até o botão sináptico
                    const qx = (A.x + 2 * mx + B.x) / 4, qy = (A.y + 2 * my + B.y) / 4;
                    g.strokeStyle = on > .15 ? viva(Math.min(.9, al)) : linha(al);
                    g.lineWidth = .9 + z * .7; g.beginPath(); g.moveTo(A.x, A.y); g.quadraticCurveTo((A.x + mx) / 2, (A.y + my) / 2, qx, qy); g.stroke();
                    g.lineWidth = .45 + z * .4; g.beginPath(); g.moveTo(qx, qy); g.quadraticCurveTo((mx + B.x) / 2, (my + B.y) / 2, B.x, B.y); g.stroke();
                    g.fillStyle = corpo(Math.min(1, al * 1.6)); g.beginPath(); g.arc(B.x + (mx - B.x) * .12, B.y + (my - B.y) * .12, 1.3 + z * .5, 0, 6.283); g.fill();
                    // pulso de luz correndo pela ligação (mais rápido ao rolar e perto do mouse)
                    const fase = (t * (.1 + semente(i, j, 2) * .18) * (1 + forca * 2 + on * 2.5) + semente(i, j, 3)) % 1;
                    const u = 1 - fase, px = u * u * A.x + 2 * u * fase * mx + fase * fase * B.x, py = u * u * A.y + 2 * u * fase * my + fase * fase * B.y;
                    g.fillStyle = viva(Math.min(1, perto * (.3 + .4 * z) + on * .6 + forca * .3));
                    g.beginPath(); g.arc(px, py, 1.3 + z * .6 + on * 1.4, 0, 6.283); g.fill();
                }
            }
            P.forEach(p => {
                const v = p.n.onda, z = p.n.z;
                if (v > .05) { g.fillStyle = viva(v * (creme ? .12 : .16)); g.beginPath(); g.arc(p.x, p.y, 10 + v * 14, 0, 6.283); g.fill(); }
                g.strokeStyle = v > .15 ? viva(.35 + v * .4) : linha((creme ? .2 : .26) + z * .2); g.lineWidth = .7;
                for (let s = 0; s < 3; s++) { const a = p.n.f + s * 2.1, c = 5 + z * 6; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x + Math.cos(a) * c, p.y + Math.sin(a) * c); g.stroke(); }
                g.fillStyle = v > .1 ? viva(.85) : corpo((creme ? .38 : .45) + z * .4);
                g.beginPath(); g.arc(p.x, p.y, 1.8 + z * 1.6 + v * 1.6, 0, 6.283); g.fill();
            });
            if (!reduz()) raf = requestAnimationFrame(quadro);
        }
        const mover = e => { const p = e.touches ? e.touches[0] : e; ponteiro.x = p.clientX; ponteiro.y = p.clientY; };
        const sair = () => { ponteiro.x = ponteiro.y = -999; };
        return {
            iniciar() { medir(); window.addEventListener('resize', medir); window.addEventListener('pointermove', mover, { passive: true }); window.addEventListener('pointerleave', sair); cancelAnimationFrame(raf); raf = requestAnimationFrame(quadro); },
            parar() { cancelAnimationFrame(raf); window.removeEventListener('resize', medir); window.removeEventListener('pointermove', mover); window.removeEventListener('pointerleave', sair); },
            alvo(m) { alvo = m; },
            tema(c) { creme = !!c; if (reduz()) { cancelAnimationFrame(raf); raf = requestAnimationFrame(quadro); } }
        };
    }

    // ── fundo vivo (opção A): neurônios com dendritos, axônios e disparos em cadeia ──
    function FundoNeuronios(cv) {
        const g = cv.getContext('2d');
        let w = 0, h = 0, dpr = 1, ns = [], ax = [], pulsos = [], matiz = 215, alvo = 215, vel = 0, ultimoY = window.scrollY, raf = 0, creme = false, ult = performance.now(), prox = 0;
        const t0 = performance.now();
        const ponteiro = { x: -999, y: -999 };
        const rnd = (a, b) => a + Math.random() * (b - a);
        function medir() {
            dpr = Math.min(2, window.devicePixelRatio || 1); w = window.innerWidth; h = window.innerHeight;
            cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); g.setTransform(dpr, 0, 0, dpr, 0, 0);
            const H = h * 1.4, n = w < 700 ? 18 : 34, dmin = Math.min(w, H) / 4.6;
            ns = [];
            for (let k = 0; k < n * 8 && ns.length < n; k++) {
                const x = rnd(30, w - 30), y = rnd(0, H);
                if (ns.every(o => Math.hypot(o.x - x, o.y - y) > dmin)) ns.push({ x, y, f: rnd(0, 6.28), fogo: 0, r: rnd(3.2, 5.6) });
            }
            ns.forEach(o => {
                o.dend = [];
                const q = Math.floor(rnd(5, 8));
                for (let i = 0; i < q; i++) {
                    const galho = (ang, x, y, comp, larg, prof) => {
                        const pts = [[x, y]]; let a = ang;
                        for (let s2 = 0; s2 < 6; s2++) { a += rnd(-.35, .35); x += Math.cos(a) * comp / 6; y += Math.sin(a) * comp / 6; pts.push([x, y]); }
                        o.dend.push({ pts, larg });
                        if (prof < 2) { galho(a + rnd(.3, .7), x, y, comp * .6, larg * .6, prof + 1); if (Math.random() < .6) galho(a - rnd(.3, .7), x, y, comp * .55, larg * .55, prof + 1); }
                    };
                    galho((i / q) * 6.283 + rnd(-.3, .3), 0, 0, rnd(24, 46), 1.6, 0);
                }
            });
            ax = [];
            ns.forEach((a, i) => {
                ns.map((b, j) => ({ j, d: Math.hypot(a.x - b.x, a.y - b.y) })).filter(o => o.j !== i).sort((p1, p2) => p1.d - p2.d).slice(0, 2).forEach(({ j }) => {
                    if (ax.some(e => e.a === j && e.b === i)) return;
                    const b = ns[j], k = rnd(-.28, .28);
                    ax.push({ a: i, b: j, k });
                });
            });
            pulsos = [];
        }
        const linha = a => creme ? `rgba(31, 56, 100, ${a.toFixed(3)})` : `hsla(${matiz + 25}, 80%, 72%, ${a.toFixed(3)})`;
        const viva = a => creme ? `rgba(46, 90, 156, ${a.toFixed(3)})` : `hsla(${matiz - 30}, 95%, 80%, ${a.toFixed(3)})`;
        const disparar = i => { const o = ns[i]; if (!o || o.fogo > .3) return; o.fogo = 1; ax.forEach(e => { if (e.a === i) pulsos.push({ e, t: 0, ida: true, v: rnd(.45, .7) }); else if (e.b === i) pulsos.push({ e, t: 0, ida: false, v: rnd(.45, .7) }); }); };
        function quadro(agora) {
            const t = (agora - t0) / 1000, dt = Math.min(.05, (agora - ult) / 1000), sy = window.scrollY;
            ult = agora;
            vel += (sy - ultimoY) * 0.12; vel *= 0.9; ultimoY = sy;
            matiz += (alvo - matiz) * 0.035;
            g.clearRect(0, 0, w, h);
            const H = h * 1.4, forca = Math.min(1, Math.abs(vel) / 30);
            // posição na tela (a rede inteira desliza devagar com a rolagem)
            const P = ns.map(o => ({ x: o.x, y: ((o.y - sy * 0.18) % H + H) % H - h * 0.2 - vel * 0.4 }));
            if (t > prox) { disparar(Math.floor(Math.random() * ns.length)); prox = t + rnd(.5, 1.4) / (1 + forca * 2); }
            ns.forEach((o, i) => { if (Math.hypot(P[i].x - ponteiro.x, P[i].y - ponteiro.y) < 120 && Math.random() < .05) disparar(i); o.fogo = Math.max(0, o.fogo - dt * .9); });
            const curva = e => { const A = P[e.a], B = P[e.b]; if (Math.abs(A.y - B.y) > h * .7) return null; const mx = (A.x + B.x) / 2 - (B.y - A.y) * e.k, my = (A.y + B.y) / 2 + (B.x - A.x) * e.k; return { A, B, mx, my }; };
            g.lineCap = 'round';
            ax.forEach(e => { const c = curva(e); if (!c) return; g.strokeStyle = linha(creme ? .16 : .2); g.lineWidth = 1.1; g.beginPath(); g.moveTo(c.A.x, c.A.y); g.quadraticCurveTo(c.mx, c.my, c.B.x, c.B.y); g.stroke(); });
            for (let k = pulsos.length - 1; k >= 0; k--) {
                const p = pulsos[k]; p.t += dt * p.v * (1 + forca);
                if (p.t >= 1) { pulsos.splice(k, 1); if (Math.random() < .55) disparar(p.ida ? p.e.b : p.e.a); continue; }
                const c = curva(p.e); if (!c) continue;
                for (let r = 0; r < 6; r++) {
                    const base = p.ida ? p.t : 1 - p.t, tr = p.ida ? base - r * .018 : base + r * .018;
                    if (tr < 0 || tr > 1) continue;
                    const u = 1 - tr, x = u * u * c.A.x + 2 * u * tr * c.mx + tr * tr * c.B.x, y = u * u * c.A.y + 2 * u * tr * c.my + tr * tr * c.B.y;
                    g.fillStyle = viva((1 - r / 6) * .9); g.beginPath(); g.arc(x, y, 2.5 - r * .3, 0, 6.283); g.fill();
                }
            }
            ns.forEach((o, i) => {
                const p = P[i]; if (p.y < -80 || p.y > h + 80) return;
                const aceso = o.fogo;
                g.save(); g.translate(p.x, p.y); g.rotate(Math.sin(t * .6 + o.f) * .04);
                g.strokeStyle = aceso > .2 ? viva(.35 + aceso * .45) : linha(creme ? .28 : .34);
                o.dend.forEach(d => { for (let s2 = 1; s2 < d.pts.length; s2++) { g.lineWidth = Math.max(.35, d.larg * (1 - s2 / d.pts.length * .8)); g.beginPath(); g.moveTo(d.pts[s2 - 1][0], d.pts[s2 - 1][1]); g.lineTo(d.pts[s2][0], d.pts[s2][1]); g.stroke(); } });
                if (aceso > 0) { g.fillStyle = viva(aceso * (creme ? .14 : .2)); g.beginPath(); g.arc(0, 0, o.r * 5 * (2 - aceso), 0, 6.283); g.fill(); }
                g.fillStyle = aceso > .1 ? viva(.6 + aceso * .4) : (creme ? `rgba(31, 56, 100, .55)` : `hsla(${matiz + 10}, 90%, 76%, .7)`);
                g.beginPath(); g.ellipse(0, 0, o.r * 1.25, o.r, o.f, 0, 6.283); g.fill();
                g.restore();
            });
            if (!reduz()) raf = requestAnimationFrame(quadro);
        }
        const mover = e => { const p = e.touches ? e.touches[0] : e; ponteiro.x = p.clientX; ponteiro.y = p.clientY; };
        const sair = () => { ponteiro.x = ponteiro.y = -999; };
        return {
            iniciar() { medir(); window.addEventListener('resize', medir); window.addEventListener('pointermove', mover, { passive: true }); window.addEventListener('pointerleave', sair); cancelAnimationFrame(raf); raf = requestAnimationFrame(quadro); },
            parar() { cancelAnimationFrame(raf); window.removeEventListener('resize', medir); window.removeEventListener('pointermove', mover); window.removeEventListener('pointerleave', sair); },
            alvo(m) { alvo = m; },
            tema(c) { creme = !!c; if (reduz()) { cancelAnimationFrame(raf); raf = requestAnimationFrame(quadro); } }
        };
    }
    // estilo do fundo: 'neuronios' (escolhido, opção A) ou 'sinapses' (opção B)
    const FUNDOS = { sinapses: Fundo, neuronios: FundoNeuronios };
    let estiloFundo = 'neuronios';
    function trocarFundo(estilo) {
        if (!FUNDOS[estilo]) return;
        estiloFundo = estilo;
        if (!raizAtual || !fundo) return;
        fundo.parar();
        fundo = FUNDOS[estilo](raizAtual.querySelector('.port-fundo'));
        fundo.iniciar();
        fundo.alvo(Number(getComputedStyle(raizAtual).getPropertyValue('--matiz')) || 215);
        fundo.tema(raizAtual.classList.contains('creme'));
    }

    // ── modo escuro / claro creme (escolha de quem lê, guardada no aparelho) ──
    const CHAVE_TEMA = 'cortex_laudo_online_tema';
    function temaSalvo() { try { return localStorage.getItem(CHAVE_TEMA) === 'creme'; } catch (e) { return false; } }
    function aplicarTema(raiz, creme, guardar) {
        raiz.classList.toggle('creme', creme);
        document.documentElement.classList.toggle('p-creme', creme);
        const bt = raiz.querySelector('.p-tema');
        if (bt) { bt.setAttribute('aria-pressed', String(creme)); bt.title = creme ? 'Voltar para o modo escuro' : 'Ver no modo claro'; bt.querySelector('span').textContent = creme ? '🌙' : '☀'; }
        if (fundo) fundo.tema(creme);
        if (guardar) { try { localStorage.setItem(CHAVE_TEMA, creme ? 'creme' : 'escuro'); } catch (e) { /* ok */ } }
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

        O.refs = []; O.refsPlano = []; O.refsPlano2 = [];
        (O.doc.secoes || []).forEach(s => (s.blocos || []).forEach(b => { if (b.tipo === 'referencias') (b.itens || []).forEach(r => { if (!O.refs.includes(String(r))) { O.refs.push(String(r)); O.refsPlano2.push(plano(r)); O.refsPlano.push(semAc(plano(r))); } }); }));
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
            <div class="p-progresso" aria-hidden="true"><i></i></div>
            <button type="button" class="p-tema" aria-pressed="false" aria-label="Alternar entre modo escuro e modo claro"><span>☀</span></button>
            <button type="button" class="p-voltar" hidden>← Voltar para onde eu estava</button></div>`;
        const raiz = alvo.querySelector('.port');
        raizAtual = raiz;
        ULT = { A, porCap, caps };

        fundo = (FUNDOS[O.fundo] || FUNDOS[estiloFundo] || Fundo)(raiz.querySelector('.port-fundo')); fundo.iniciar();
        aplicarTema(raiz, O.tema ? O.tema === 'creme' : temaSalvo(), false);
        raiz.querySelector('.p-tema').addEventListener('click', () => aplicarTema(raiz, !raiz.classList.contains('creme'), true));

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

        // Saltos (Síntese → teste, citação → referência, mapa → análise) guardam o lugar de onde saiu
        const btVolta = raiz.querySelector('.p-voltar');
        let volta = null;
        const marcarVolta = () => { volta = window.scrollY; btVolta.hidden = false; };
        btVolta.addEventListener('click', () => { if (volta != null) window.scrollTo({ top: volta, behavior: reduz() ? 'auto' : 'smooth' }); volta = null; btVolta.hidden = true; });
        const piscar = el => { el.classList.remove('flash-p'); void el.offsetWidth; el.classList.add('flash-p'); };
        const ir = (id, alvo) => {
            const sec = document.getElementById(id); if (!sec) return;
            // alvo = medida citada (ex.: idx:IMO): vai à linha do gráfico, e não só ao começo do teste
            const ponto = alvo ? [...sec.querySelectorAll(`[data-pop-k="${alvo}"]`)].find(x => x.offsetParent) : null;
            marcarVolta();
            (ponto || sec).scrollIntoView({ behavior: reduz() ? 'auto' : 'smooth', block: ponto ? 'center' : 'start' });
            piscar(ponto || sec);
        };
        const irRef = id => {
            const el = document.getElementById(id); if (!el) return;
            const det = el.closest('details'); if (det) det.open = true;
            marcarVolta();
            el.scrollIntoView({ behavior: reduz() ? 'auto' : 'smooth', block: 'center' });
            piscar(el);
        };
        linkarCitacoes(raiz);

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
            const bCita = e.target.closest('.p-cita'); if (bCita) { e.stopPropagation(); fecharBalao(); irRef(bCita.dataset.ref); return; }
            const bIr = e.target.closest('[data-ir]'); if (bIr) { ir(bIr.dataset.ir, bIr.dataset.alvo); return; }
            const bG = e.target.closest('[data-gaveta]');
            if (bG) {
                const gr = A.grupos.find(g => g.id === bG.dataset.gaveta);
                if (gr) abrirGaveta(gavetaHtml(gr), `${gr.num}${(INSTRUMENTOS[gr.sigla] || {}).dominio ? ' · ' + INSTRUMENTOS[gr.sigla].dominio : ''}`, `${gr.sigla}${gr.nome ? ' — ' + gr.nome : ''}`);
                return;
            }
            const el = e.target.closest(SEL_BALAO);
            if (el) { e.stopPropagation(); cliqueBalao(el); }
        });
        raiz.addEventListener('keydown', e => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            const el = e.target.closest(SEL_BALAO);
            if (el && !el.closest('.faixa') && !el.closest('.no') && el.tagName !== 'BUTTON') { e.preventDefault(); acionarBalao(el, true); }
        });
        return { capitulos: secs.length, testes: A.grupos.length };
    }

    document.addEventListener('click', e => { if (balao && !balao.contains(e.target) && !e.target.closest(SEL_BALAO)) fecharBalao(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { fecharBalao(); fecharGaveta(); } });
    window.addEventListener('resize', fecharBalao);

    // ═════════════════════════════════════════════════════════════════════════
    // MODO APRESENTAÇÃO (TV) — o mesmo laudo, uma parte por tela
    // ─────────────────────────────────────────────────────────────────────────
    // Palco fixo 1920×1080 que escala para a tela (TV). Fundo parado (sem a rede
    // animada) para o espelhamento não travar. Clique/rodinha/setas avançam;
    // botão direito volta. Clicar numa linha de gráfico acende o holofote: o resto
    // escurece e a explicação para a família aparece embaixo, em letra grande.
    // ═════════════════════════════════════════════════════════════════════════
    let ULT = null;
    const primeiraFrase = (t, max) => {
        const x = plano(t || '').replace(/\s+/g, ' ').trim(); if (!x) return '';
        const fr = (x.match(/^.*?[.!?](\s|$)/) || [x])[0].trim();
        const r = fr.length >= 60 || x.length <= fr.length ? fr : (x.match(/^(.*?[.!?]\s.*?[.!?])(\s|$)/) || [x])[1];
        return r.length > max ? r.slice(0, max).replace(/\s+\S*$/, '') + '…' : r;
    };
    function telasDaApresentacao() {
        const { A, porCap } = ULT, R = O.banco.resultados || {}, p = O.banco.paciente || {}, ctx = O.ctx;
        const todos = []; (O.doc.secoes || []).forEach(sc => { if (!sc.oculta) (sc.blocos || []).filter(visivel).forEach(b => todos.push(b)); });
        const telas = [];
        // 1 · abertura
        const camposB = todos.find(b => b.tipo === 'campos');
        const campo = re => { const l = camposB && (camposB.linhas || []).find(x => re.test(plano(x.rotulo))); return l ? l.valor : ''; };
        const mp = todos.find(b => b.tipo === 'mapa'), lm = (mp && mp.linhas) || [];
        const ti = todos.find(b => b.tipo === 'tabela_instrumentos');
        const nInst = (O.doc.inventario || []).length || ((ti && ti.linhas) || []).length;
        const okN = lm.filter(l => l.status === 'preservado').length;
        telas.push({ nome: 'Abertura', matiz: 215, html: `<div class="ap-capa">
            <p class="ap-olho"><img src="${esc(logo())}" alt="">Devolutiva · Avaliação neuropsicológica</p>
            <h1>${esc(p.nome_completo || '')}</h1>
            <p class="ap-sub"><b>${esc(ctx.idade)}</b>${p.escolaridade ? ` · ${esc(p.escolaridade)}` : ''}${plano(campo(/Aplica/i)) ? ` · avaliação de ${esc(plano(campo(/Aplica/i)))}` : ''}</p>
            ${campo(/Finalidade/i) ? `<div class="ap-pergunta"><span>?</span><div><small>A pergunta da avaliação</small><p>${esc(primeiraFrase(campo(/Finalidade/i), 220))}</p></div></div>` : ''}
            <div class="ap-nums">${nInst ? `<div><b>${nInst}</b><span>instrumentos aplicados</span></div>` : ''}${lm.length ? `<div><b>${okN}</b><span>áreas preservadas</span></div><div class="al"><b>${lm.length - okN}</b><span>áreas pedem atenção</span></div>` : ''}</div></div>` });
        // 2 · como avaliamos
        if (ti && (ti.linhas || []).length) {
            const ls = ti.linhas.slice(0, 15);
            telas.push({ nome: 'Como avaliamos', matiz: 195, html: `<p class="ap-olho">Como avaliamos</p><h2>${ls.length} instrumentos, cada um olhando uma parte</h2>
                <div class="ap-inst ${ls.length > 9 ? 'muitos' : ''}">${ls.map(l => `<div class="ap-vidro"><small>${esc(plano(l.dominio || O.dominios[l.sigla] || ''))}</small><b>${esc(l.sigla || '')}</b></div>`).join('')}</div>` });
        }
        // 3 · mapa das áreas
        if (lm.length) {
            const cor = { preservado: 'ok', atencao: 'at', comprometido: 'cr' }, rot = { ok: 'Preservado', at: 'Atenção', cr: 'Comprometido' };
            telas.push({ nome: 'Mapa das áreas', matiz: 165, html: `<p class="ap-olho">Mapa das áreas</p><h2>O que está bem e o que pede atenção</h2>
                <div class="ap-mapa ${lm.length > 6 ? 'muitos' : ''}">${lm.map(l => { const c = cor[l.status] || 'at'; return `<div class="ap-vidro ap-area ${c}"><i></i><div><small>${rot[c]}</small><b>${esc(plano(l.dominio || ''))}</b><p>${esc(primeiraFrase(l.desempenho, 110))}</p></div></div>`; }).join('')}</div>` });
        }
        // 4 · um teste por tela
        A.grupos.forEach(gr => {
            const d = R[gr.sigla], dest = d ? G().destaque(gr.sigla, d) : null;
            const ehW = gr.sigla === 'WAIS-III' || gr.sigla === 'WISC-IV';
            const rs = gr.blocos.filter(b => b.tipo === 'resultado' && visivel(b) && !G().indisponivel(b, O.banco, ON));
            const vis = b => (G().paraOnline ? G().paraOnline(b) || {} : b).vista;
            const graf = ehW ? (rs.find(b => vis(b) === 'intervalos') || rs.find(b => vis(b) === 'perfil_subtestes'))
                : (rs.find(b => !VISTAS_VITRINE_FORA.test(vis(b))) || rs[0]);
            const par = gr.blocos.find(b => b.tipo === 'paragrafo' && visivel(b));
            const info = Object.assign({ dominio: O.dominios[gr.sigla] }, INSTRUMENTOS[gr.sigla] || {});
            let grafHtml = '';
            if (graf) { try { grafHtml = G().render(graf, O.banco, { glossario: O.glossario, congelado: O.congelado, online: true }); } catch (e) { grafHtml = ''; } }
            if (!dest && !grafHtml && !par) return;      // teste sem nada para mostrar na TV
            telas.push({ nome: gr.sigla, matiz: 230, html: `<p class="ap-olho">${esc(gr.num ? gr.num + ' · ' : '')}${esc(info.dominio || 'Resultado')}</p>
                <h2>${esc(gr.sigla)}${gr.nome && gr.nome !== gr.sigla ? `<span>${esc(gr.nome)}</span>` : ''}</h2>
                <div class="ap-teste ${grafHtml ? '' : 'so-texto'}">
                    <div class="ap-lado">${dest ? `<div class="ap-vidro ap-dest"><small>${esc(dest.rotulo || 'Resultado')}</small><b>${esc(dest.valor)}</b>${dest.classe ? pilula(dest.classe, dest.tom) : ''}</div>` : ''}
                        ${par ? `<div class="ap-vidro ap-palavras"><small>Em poucas palavras</small><p>${esc(primeiraFrase(par.texto, 230))}</p></div>` : ''}</div>
                    ${grafHtml ? `<div class="ap-vidro ap-graf"><div class="p-graf"><div class="imp">${grafHtml}</div></div></div>` : ''}
                </div>` });
        });
        // 5 · síntese
        const sint = porCap.sintese ? agrupar(porCap.sintese.blocos, ehTitulo(3)).grupos : [];
        if (sint.length) telas.push({ nome: 'Como tudo se conecta', matiz: 38, html: `<p class="ap-olho">Síntese</p><h2>Como tudo se conecta</h2>
            <div class="ap-sint ${sint.length > 4 ? 'muitos' : ''}">${sint.slice(0, 6).map((g, i) => { const pp = g.blocos.find(b => b.tipo === 'paragrafo'); return `<div class="ap-vidro"><small>${String(i + 1).padStart(2, '0')}</small><b>${esc(plano(semNumero(g.cab.texto)))}</b>${pp ? `<p>${esc(primeiraFrase(pp.texto, 150))}</p>` : ''}</div>`; }).join('')}</div>` });
        // 6 · hipóteses
        const hips = todos.filter(b => b.tipo === 'hipotese');
        if (hips.length) telas.push({ nome: 'Hipóteses', matiz: 320, html: `<p class="ap-olho">Hipóteses</p><h2>O que os resultados indicam</h2>
            <div class="ap-hips">${hips.slice(0, 3).map(b => { const cods = Array.isArray(b.codigos) ? b.codigos : String(b.codigos || '').split('|').map(x => x.trim()).filter(Boolean);
                const rot = { principal: 'Hipótese principal', secundaria: 'Hipótese secundária', investigar: 'Hipótese a investigar' }[b.rotulo || 'principal'] || 'Hipótese';
                return `<div class="ap-vidro ap-hip"><small>${rot}</small><b>${esc(plano(b.nome || ''))}</b>${cods.length ? `<div class="ap-cods">${cods.map(c => `<span>${esc(c)}</span>`).join('')}</div>` : ''}${b.confianca ? `<p>Nível de confiança: <b>${esc(String(b.confianca).charAt(0).toUpperCase() + String(b.confianca).slice(1).toLowerCase())}</b></p>` : ''}</div>`; }).join('')}</div>` });
        // 7 · conclusão
        const conc = porCap.conclusao && porCap.conclusao.blocos.find(b => b.tipo === 'paragrafo');
        if (conc) telas.push({ nome: 'Conclusão', matiz: 215, html: `<p class="ap-olho">Conclusão</p><h2>Em resumo</h2><p class="ap-concl">${esc(primeiraFrase(conc.texto, 420))}</p>` });
        // 8 · próximos passos
        const li = porCap.passos && porCap.passos.blocos.find(b => b.tipo === 'lista');
        if (li && (li.itens || []).length) telas.push({ nome: 'Próximos passos', matiz: 150, html: `<p class="ap-olho">Próximos passos</p><h2>O que fazer daqui para frente</h2>
            <div class="ap-passos ${li.itens.length > 4 ? 'muitos' : ''}">${li.itens.slice(0, 6).map((it, i) => { const mm = /^\*\*(.+?)\*\*\s*([\s\S]*)$/.exec(String(it));
                return `<div class="ap-vidro"><small>${String(i + 1).padStart(2, '0')}</small>${mm ? `<b>${esc(plano(mm[1]).replace(/[.:]$/, ''))}</b><p>${esc(primeiraFrase(mm[2], 140))}</p>` : `<p>${esc(primeiraFrase(it, 170))}</p>`}</div>`; }).join('')}</div>` });
        // 9 · fim
        telas.push({ nome: 'Encerramento', matiz: 215, html: `<div class="ap-fim"><img src="${esc(logo())}" alt=""><h2>Ficou alguma dúvida?</h2><p>Podemos voltar em qualquer parte. O laudo completo fica disponível para ${esc(ctx.primeiroNome)} e a família.</p></div>` });
        return telas;
    }

    let AP = null;
    function apresentar() {
        if (!ULT || AP) return;
        const telas = telasDaApresentacao(), creme = raizAtual && raizAtual.classList.contains('creme');
        const el = document.createElement('div');
        el.className = 'ap port' + (creme ? ' creme' : ''); el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Modo apresentação');
        el.innerHTML = `<div class="ap-palco"><div class="ap-veu"></div><div class="ap-prog"><i></i></div>
            ${telas.map((t, i) => `<section class="ap-tela" data-i="${i}" style="--matiz:${t.matiz}">${t.html}</section>`).join('')}
            <div class="ap-holo"><h3 class="ap-h-t"></h3><div><small>O que é</small><p class="ap-h-o"></p></div><div class="vida"><small class="ap-h-vt">No dia a dia</small><p class="ap-h-v"></p></div><button type="button" class="ap-holo-x" aria-label="Fechar holofote">×</button></div>
            <div class="ap-partes"><p class="ap-olho">Ir para</p><div class="ap-partes-lista">${telas.map((t, i) => `<button type="button" data-ir-tela="${i}"><small>${String(i + 1).padStart(2, '0')}</small><span>${esc(t.nome)}</span></button>`).join('')}</div></div>
</div>
            <div class="ap-dica">Clique ou gire a rodinha para avançar · botão direito volta · clique numa linha do gráfico para o holofote</div>
            <nav class="ap-ctrl" aria-label="Controles da apresentação">
                <button type="button" data-ap="ant">‹ Voltar</button><span class="ap-cont"></span><button type="button" data-ap="prox">Avançar ›</button><i></i>
                <button type="button" data-ap="partes">Partes</button><button type="button" data-ap="tema">${creme ? 'Modo escuro' : 'Modo creme'}</button><button type="button" data-ap="tela">Tela cheia</button><button type="button" data-ap="sair">Sair</button></nav>`;
        document.body.appendChild(el);
        document.documentElement.classList.add('ap-aberta');
        fecharBalao(); if (fundo && fundo.parar) fundo.parar();
        const palco = el.querySelector('.ap-palco'), secs = [...el.querySelectorAll('.ap-tela')], holo = el.querySelector('.ap-holo');
        let atual = 0;
        const caber = () => { const k = Math.min(window.innerWidth / 1920, window.innerHeight / 1080); palco.style.transform = `translate(-50%, -50%) scale(${k})`; };
        // gráficos que passam da altura da tela encolhem para caber
        // o gráfico do laudo (desenhado para a página) é ampliado para ocupar o espaço da TV
        const ajustar = sec => sec.querySelectorAll('.ap-graf').forEach(caixa => {
            const g = caixa.querySelector('.p-graf'); if (!g) return;
            g.style.zoom = '1';
            const pr = palco.getBoundingClientRect(), k = pr.height / 1080 || 1;
            const larg = caixa.clientWidth - 80, topo = (caixa.getBoundingClientRect().top - pr.top) / k;
            const disp = 1080 - 130 - topo - 70, h = g.offsetHeight || 1, w = g.offsetWidth || 1;
            g.style.zoom = Math.max(.6, Math.min(2.1, larg / w, disp / h)).toFixed(3);
        });
        const tirarHolo = () => { palco.classList.remove('holo'); el.querySelectorAll('.ap-foco').forEach(x => x.classList.remove('ap-foco')); };
        const ir = i => {
            atual = Math.max(0, Math.min(secs.length - 1, i)); tirarHolo();
            secs.forEach((s2, k) => s2.classList.toggle('ativa', k === atual));
            el.querySelector('.ap-prog i').style.width = ((atual + 1) / secs.length * 100) + '%';
            el.querySelector('.ap-cont').textContent = `${atual + 1} / ${secs.length}`;
            ajustar(secs[atual]);
        };
        const holofote = item => {
            if (item.classList.contains('ap-foco')) { tirarHolo(); return; }
            tirarHolo();
            const ex = window.LaudoExplica ? window.LaudoExplica.de(item.dataset.popK, item.dataset.popN, O.ctx.primeiroNome) : null;
            item.classList.add('ap-foco'); palco.classList.add('holo');
            // a explicação fica do lado oposto à linha destacada, para não cobrir o gráfico
            const pr = palco.getBoundingClientRect(), ir2 = item.getBoundingClientRect();
            holo.classList.toggle('cima', (ir2.top + ir2.height / 2 - pr.top) / (pr.height / 1080) > 540);
            el.querySelector('.ap-h-o').textContent = ex && ex.oque ? ex.oque : (item.dataset.popTxt || '');
            el.querySelector('.ap-h-t').textContent = item.dataset.popTit || '';
            el.querySelector('.ap-h-vt').textContent = O.ctx.primeiroNome ? 'No dia a dia de ' + O.ctx.primeiroNome : 'No dia a dia';
            el.querySelector('.ap-h-v').textContent = ex && ex.vida ? ex.vida : (item.dataset.popTxt || '');
        };
        const sair = () => {
            window.removeEventListener('resize', caber); document.removeEventListener('keydown', teclas, true); el.removeEventListener('wheel', roda);
            clearTimeout(ocioso); el.remove(); document.documentElement.classList.remove('ap-aberta'); AP = null;
            try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) { /* sem tela cheia */ }
            if (fundo && fundo.iniciar && !reduz()) fundo.iniciar();
        };
        const telaCheia = () => { try { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {}); } catch (e) { /* sem tela cheia */ } };
        const partes = abrir => { el.querySelector('.ap-partes').classList.toggle('aberto', abrir); el.querySelectorAll('[data-ir-tela]').forEach(b => b.classList.toggle('atual', Number(b.dataset.irTela) === atual)); };
        el.addEventListener('click', e => {
            const b = e.target.closest('[data-ap]');
            if (b) {
                const a = b.dataset.ap;
                if (a === 'ant') ir(atual - 1); else if (a === 'prox') ir(atual + 1); else if (a === 'sair') sair(); else if (a === 'tela') telaCheia();
                else if (a === 'partes') partes(!el.querySelector('.ap-partes').classList.contains('aberto'));
                else if (a === 'tema') { el.classList.toggle('creme'); b.textContent = el.classList.contains('creme') ? 'Modo escuro' : 'Modo creme'; }
                return;
            }
            const t = e.target.closest('[data-ir-tela]'); if (t) { ir(Number(t.dataset.irTela)); partes(false); return; }
            if (el.querySelector('.ap-partes.aberto')) { partes(false); return; }
            if (e.target.closest('.ap-holo-x')) { tirarHolo(); return; }
            const item = e.target.closest('[data-pop-k]'); if (item && item.closest('.ap-tela.ativa')) { holofote(item); return; }
            if (palco.classList.contains('holo')) { tirarHolo(); return; }
            if (e.target.closest('.ap-ctrl')) return;
            ir(atual + 1);
        });
        el.addEventListener('contextmenu', e => { e.preventDefault(); ir(atual - 1); });
        let acum = 0, trava = 0;
        const roda = e => { e.preventDefault(); const ag = Date.now(); if (ag < trava) return; acum += e.deltaY; if (Math.abs(acum) > 60) { ir(atual + (acum > 0 ? 1 : -1)); acum = 0; trava = ag + 450; } };
        el.addEventListener('wheel', roda, { passive: false });
        const teclas = e => {
            const k = e.key;
            if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(k)) { e.preventDefault(); e.stopPropagation(); ir(atual + 1); }
            else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(k)) { e.preventDefault(); e.stopPropagation(); ir(atual - 1); }
            else if (k === 'Home') ir(0); else if (k === 'End') ir(secs.length - 1);
            else if (k === 'Escape') { e.stopPropagation(); if (palco.classList.contains('holo')) tirarHolo(); else if (el.querySelector('.ap-partes.aberto')) partes(false); else sair(); }
            else if (k === 'f' || k === 'F') telaCheia(); else if (k === 'p' || k === 'P') partes(!el.querySelector('.ap-partes').classList.contains('aberto'));
        };
        document.addEventListener('keydown', teclas, true);
        // barra e cursor somem com o mouse parado (TV limpa)
        let ocioso = null;
        const acordar = () => { el.classList.remove('ocioso'); clearTimeout(ocioso); ocioso = setTimeout(() => el.classList.add('ocioso'), 2600); };
        el.addEventListener('mousemove', acordar); acordar();
        setTimeout(() => { const d = el.querySelector('.ap-dica'); if (d) d.classList.add('some'); }, 5000);
        window.addEventListener('resize', caber); caber(); ir(0);
        AP = { ir, sair };
        telaCheia();
    }

    window.LaudoPortfolio = { desenhar, parar, INSTRUMENTOS, trocarFundo, apresentar };
})();

/* ============================================================================
   CORTEX · Testes corrigidos fora do CORTEX — LANÇAMENTO + LAUDO
   (frontend/correcao/_lancados/lancados.js) · sprint LO-7
   ----------------------------------------------------------------------------
   Para os testes que a clínica corrige na plataforma da editora ou à mão
   (TDE-II, TAVIS-4, TEPIC-M-2, BDEFS, CPM-Raven, IHS-2, BPA-2, BETA-III,
   TEACO/TEADI/TEALT, Torre de Londres). O(a) profissional digita os números
   do relatório de correção (bruto, percentil, classificação…) e a tela monta
   o laudo no mesmo padrão das telas de correção do CORTEX, com 📷 e 📋 para
   o Word e para o Laudo Online.

   Nada é calculado por norma aqui: a tela só organiza e desenha o que foi
   lançado. Cada teste tem o seu próprio modelo (<slug>_resultado.js), que
   chama LancTeste.iniciar(def). Os números ficam em resultados_lancados.dados.

   def = {
     titulo, nome, subtitulo, sobre,
     contexto: [{ c, r, tipo: 'texto'|'select'|'numero', opcoes }],
     grupos:   [{ cod, nome, cor, medidas: [{ cod, nome, campos: ['bruto','percentil',…], max, sentido }] }],
     principal(d, H) → { rotulo, valor, nota },
     laudo(d, H)     → [{ titulo, hint?, html }],
     extra?(client, aplicacao) → { medidas: { cod: { campo: valor } } }   // números já no CORTEX (fixos)
   }
   ============================================================================ */
(function () {
    'use strict';

    const c = () => window.cortexClient;
    const toast = (m, t) => { if (window.CortexUI && window.CortexUI.toast) window.CortexUI.toast(m, t); };
    const el = () => document.getElementById('laudo-conteudo');

    // Rótulos dos campos que um teste pode pedir em cada medida.
    const CAMPOS = {
        bruto: { r: 'Bruto', tipo: 'numero' },
        pontos: { r: 'Pontos', tipo: 'numero' },
        acertos: { r: 'Acertos', tipo: 'numero' },
        erros: { r: 'Erros', tipo: 'numero' },
        omissoes: { r: 'Omissões', tipo: 'numero' },
        valor: { r: 'Resultado', tipo: 'numero' },
        tempo: { r: 'Tempo', tipo: 'texto' },
        ponderado: { r: 'Ponderado', tipo: 'numero' },
        escore: { r: 'Escore', tipo: 'numero' },
        intervalo: { r: 'IC 95%', tipo: 'texto' },
        percentil: { r: 'Percentil', tipo: 'texto' },
        classificacao: { r: 'Classificação', tipo: 'classif' }
    };
    const CLASSIFS = ['Muito inferior', 'Inferior', 'Médio inferior', 'Médio', 'Médio superior', 'Superior', 'Muito superior'];

    function esc(t) { const d = document.createElement('div'); d.textContent = t == null ? '' : String(t); return d.innerHTML; }
    function dataBR(iso) { if (!iso) return '—'; const d = new Date(String(iso).length <= 10 ? iso + 'T12:00:00' : iso); return isNaN(d) ? '—' : d.toLocaleDateString('pt-BR'); }
    function idadeEm(nasc, ref) {
        if (!nasc) return null;
        const n = new Date(nasc + 'T12:00:00'), r = ref ? new Date(String(ref).slice(0, 10) + 'T12:00:00') : new Date();
        let a = r.getFullYear() - n.getFullYear(), m = r.getMonth() - n.getMonth();
        if (r.getDate() < n.getDate()) m--;
        if (m < 0) { a--; m += 12; }
        return { anos: a, meses: m };
    }
    const vazio = v => v === null || v === undefined || String(v).trim() === '';
    const num = v => vazio(v) ? '—' : String(v).replace('.', ',');
    const numero = v => { if (vazio(v)) return null; const x = Number(String(v).replace(',', '.')); return isFinite(x) ? x : null; };

    // Percentil pode vir como texto do relatório: "35", "<1", ">99", "25-50", "P10".
    function percentilNum(p) {
        if (vazio(p)) return null;
        const s = String(p).replace(/[Pp\s]/g, '').replace(',', '.');
        const faixa = /^(\d+(?:\.\d+)?)[-–a](\d+(?:\.\d+)?)$/.exec(s);
        if (faixa) return (Number(faixa[1]) + Number(faixa[2])) / 2;
        const m = /^([<>≤≥]=?)?(\d+(?:\.\d+)?)$/.exec(s);
        if (!m) return null;
        let v = Number(m[2]);
        if (m[1] && m[1][0] === '<') v = Math.max(0.5, v - 0.5);
        if (m[1] && m[1][0] === '>') v = Math.min(99.5, v + 0.5);
        return Math.max(0, Math.min(100, v));
    }
    const percentilTxt = p => vazio(p) ? '—' : (/^[Pp]/.test(String(p).trim()) ? String(p).trim().toUpperCase() : 'P' + String(p).trim());

    // Classificação (texto do relatório) → tom das sete faixas do padrão CORTEX.
    function tomDe(txt) {
        const t = String(txt || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
        if (!t.trim()) return 'nulo';
        if (/muito inferior|extremamente baixo|muito baixo|deficitari|grave|severo|clinicamente significativ|prejuizo/.test(t)) return 'grave';
        if (/medio inferior|media inferior|limitrofe|marginal|limite|alerta|abaixo da media/.test(t)) return 'alerta';
        if (/inferior|baixo|deficit|rebaixad/.test(t)) return 'moderado';
        if (/medio superior|media superior|acima da media|elaborado|bom repertorio/.test(t)) return 'acima';
        if (/muito superior|altamente|superior|muito alto|alto/.test(t)) return 'muito';
        if (/medio|media|adequad|tipic|normal|esperad|preservad|dentro/.test(t)) return 'dentro';
        return 'nulo';
    }
    function chip(classif) { return vazio(classif) ? '<span class="lc-chip lc-f-nulo">—</span>' : `<span class="lc-chip lc-f-${tomDe(classif)}">${esc(classif)}</span>`; }

    // ── Peças de desenho (iguais às das telas de correção) ─────────────────
    const H = {
        esc, num, numero, chip, tomDe, percentilNum, percentilTxt, vazio,
        /** Cartões grandes: [{ rot, valor, pe, classif, escuro }] */
        cards(itens) {
            const n = Math.min(4, itens.length || 1);
            return `<div class="lc-cards lc-grafico-cards" style="grid-template-columns:repeat(${n},1fr)">${itens.map(i => `
                <div class="lc-card ${i.escuro ? 'escuro' : 'lc-f-' + tomDe(i.classif)}">
                    <div class="lc-card-label">${esc(i.rot)}</div>
                    <div class="lc-card-valor">${i.valor == null || i.valor === '' ? '—' : esc(i.valor)}</div>
                    ${i.pe || i.classif ? `<div class="lc-card-pe">${esc(i.pe || i.classif)}</div>` : ''}
                </div>`).join('')}</div>`;
        },
        /** Régua do percentil (P0–P100) com a faixa média P25–P75 marcada. */
        regua(o) {
            const pc = percentilNum(o.percentil), tom = tomDe(o.classif);
            const cortes = (o.cortes || []).map(k => `<div class="lc-regua-corte" style="left:${k.p}%"><span>${esc(k.rot || 'P' + k.p)}</span></div>`).join('');
            return `<div class="lc-regua-bloco${pc == null ? ' vazia' : ''}">
                <div class="lc-regua-rot">${esc(o.rot)}</div>
                <div class="lc-regua-trilho">
                    <div class="lc-regua-media" style="left:25%;width:50%"></div>${cortes}
                    ${pc == null ? '' : `<div class="lc-regua-marcador lc-f-${tom}" style="left:${pc.toFixed(2)}%">${esc(percentilTxt(o.percentil))}</div>`}
                </div>
                <div class="lc-regua-pes"><span>P0</span><span class="lc-t-${tom} lc-regua-classif">${esc(o.classif || (pc == null ? 'percentil não lançado' : ''))}</span><span>P100</span></div>
            </div>`;
        },
        reguas(tit, lista, nota) {
            return `<div class="lc-grafico-regua"><div class="lc-grafico-tit">${esc(tit)}</div>${lista.map(H.regua).join('')}
                <div class="lc-legenda"><span class="lc-leg-media"></span> faixa média (P25 a P75)${nota ? ` · ${esc(nota)}` : ''}</div></div>`;
        },
        /** Barras de percentil, uma por medida, com linhas de corte opcionais. */
        barrasPercentil(o) {
            const cortes = (o.cortes || []);
            const linhas = o.itens.map(i => {
                if (i.grupo) return `<div class="lc-perfil-grupo">${esc(i.grupo)}</div>`;
                const pc = percentilNum(i.percentil), tom = tomDe(i.classif);
                return `<div class="lc-perfil-linha">
                    <div class="lc-perfil-rot">${i.cor ? `<span class="lc-dot" style="background:${i.cor}"></span>` : ''}${esc(i.rot)}</div>
                    <div class="lc-perfil-trilho">
                        <div class="lc-regua-media" style="left:25%;width:50%"></div>
                        ${cortes.map(k => `<div class="lc-perfil-corte" style="left:${k.p}%"></div>`).join('')}
                        ${pc == null ? '' : `<div class="lc-perfil-fill lc-f-${tom}" style="width:${Math.max(1.5, pc).toFixed(1)}%"></div>`}
                    </div>
                    <div class="lc-perfil-val">${esc(percentilTxt(i.percentil))}</div>
                    <div class="lc-perfil-cl lc-t-${tom}">${esc(i.classif || '')}</div>
                </div>`;
            }).join('');
            const eixo = `<div class="lc-perfil-eixo"><span></span><div>${[0, 25, 50, 75, 100].map(p => `<i style="left:${p}%">P${p}</i>`).join('')}${cortes.map(k => `<b style="left:${k.p}%">${esc(k.rot || 'P' + k.p)}</b>`).join('')}</div><span></span><span></span></div>`;
            return `<div class="lc-grafico-barras"><div class="lc-grafico-tit">${esc(o.tit)}</div>${linhas}${eixo}
                ${o.nota ? `<div class="lc-grafico-nota">${esc(o.nota)}</div>` : ''}</div>`;
        },
        /** Barras de valor (0..max): pontos por série, acertos/erros etc. */
        barrasValor(o) {
            const linhas = o.itens.map(i => {
                if (i.grupo) return `<div class="lc-perfil-grupo">${esc(i.grupo)}</div>`;
                const v = numero(i.valor), max = numero(i.max) || o.max || 1;
                const w = v == null ? 0 : Math.max(1.5, Math.min(100, v / max * 100));
                return `<div class="lc-perfil-linha valor">
                    <div class="lc-perfil-rot">${i.cor ? `<span class="lc-dot" style="background:${i.cor}"></span>` : ''}${esc(i.rot)}</div>
                    <div class="lc-perfil-trilho">${v == null ? '' : `<div class="lc-perfil-fill" style="width:${w.toFixed(1)}%;background:${i.cor || '#2F6FED'}"></div>`}</div>
                    <div class="lc-perfil-val">${esc(num(i.valor))}${i.max || o.max ? `<small>/${esc(i.max || o.max)}</small>` : ''}</div>
                </div>`;
            }).join('');
            return `<div class="lc-grafico-barras"><div class="lc-grafico-tit">${esc(o.tit)}</div>${linhas}
                ${o.nota ? `<div class="lc-grafico-nota">${esc(o.nota)}</div>` : ''}</div>`;
        },
        /** Composição acertos / erros / omissões em barra empilhada. */
        composicao(o) {
            const linhas = o.itens.map(i => {
                const a = numero(i.acertos) || 0, e = numero(i.erros) || 0, om = numero(i.omissoes) || 0, t = a + e + om;
                if (!t) return '';
                const p = x => (x / t * 100).toFixed(1);
                return `<div class="lc-comp-linha"><div class="lc-perfil-rot">${esc(i.rot)}</div>
                    <div class="lc-comp-barra"><span class="ac" style="width:${p(a)}%">${a ? a : ''}</span><span class="er" style="width:${p(e)}%">${e ? e : ''}</span><span class="om" style="width:${p(om)}%">${om ? om : ''}</span></div></div>`;
            }).join('');
            if (!linhas) return '';
            return `<div class="lc-grafico-comp"><div class="lc-grafico-tit">${esc(o.tit)}</div>${linhas}
                <div class="lc-comp-leg"><span><i class="ac"></i>Acertos</span><span><i class="er"></i>Erros</span><span><i class="om"></i>Omissões</span></div></div>`;
        },
        /** Perfil de escores ponderados (média 10, DP 3), faixa média 8–12. */
        ponderados(o) {
            const linhas = o.itens.map(i => {
                const v = numero(i.valor);
                return `<div class="lc-pond-linha"><div class="lc-perfil-rot">${esc(i.rot)}</div>
                    <div class="lc-pond-trilho"><div class="lc-pond-media"></div>${Array.from({ length: 19 }, (_, k) => `<i style="left:${(k / 18 * 100).toFixed(2)}%"></i>`).join('')}
                        ${v == null ? '' : `<div class="lc-pond-ponto lc-f-${tomDe(i.classif) === 'nulo' ? (v < 8 ? (v < 5 ? 'grave' : 'alerta') : v > 12 ? 'acima' : 'dentro') : tomDe(i.classif)}" style="left:${((Math.max(1, Math.min(19, v)) - 1) / 18 * 100).toFixed(2)}%">${esc(num(v))}</div>`}</div></div>`;
            }).join('');
            return `<div class="lc-grafico-pond"><div class="lc-grafico-tit">${esc(o.tit)}</div>${linhas}
                <div class="lc-pond-eixo"><span></span><div>${[1, 4, 7, 10, 13, 16, 19].map(p => `<i style="left:${((p - 1) / 18 * 100).toFixed(2)}%">${p}</i>`).join('')}</div></div>
                <div class="lc-legenda"><span class="lc-leg-media"></span> faixa média dos ponderados (8 a 12)</div></div>`;
        },
        /** Curva normal com a posição do escore (QI: média 100, DP 15). */
        curva(o) {
            const W = 640, Hh = 190, base = 150, m = o.media || 100, dp = o.dp || 15;
            const x = v => 30 + (v - (m - 3.5 * dp)) / (7 * dp) * (W - 60);
            const y = v => base - Math.exp(-0.5 * Math.pow((v - m) / dp, 2)) * 120;
            let d = ''; for (let v = m - 3.5 * dp; v <= m + 3.5 * dp; v += dp / 20) d += (d ? 'L' : 'M') + x(v).toFixed(1) + ' ' + y(v).toFixed(1);
            const val = numero(o.valor), tom = tomDe(o.classif);
            const marcas = [-3, -2, -1, 0, 1, 2, 3].map(k => `<line x1="${x(m + k * dp)}" y1="${base}" x2="${x(m + k * dp)}" y2="${base + 6}" stroke="#94A3B8"/><text x="${x(m + k * dp)}" y="${base + 20}" text-anchor="middle" font-size="11" fill="#64748B">${m + k * dp}</text>`).join('');
            const faixa = `<path d="M${x(m - dp)} ${base} ${(() => { let s = ''; for (let v = m - dp; v <= m + dp + 0.01; v += dp / 20) s += 'L' + x(v).toFixed(1) + ' ' + y(v).toFixed(1); return s; })()} L${x(m + dp)} ${base} Z" fill="#DBEAFE"/>`;
            const ponto = val == null ? '' : (() => { const vx = x(Math.max(m - 3.5 * dp, Math.min(m + 3.5 * dp, val))); return `<line x1="${vx}" y1="${base}" x2="${vx}" y2="22" class="lc-curva-linha lc-f-${tom}"/><circle cx="${vx}" cy="22" r="6" class="lc-curva-ponto lc-f-${tom}"/><text x="${vx}" y="12" text-anchor="middle" font-size="12.5" font-weight="800" class="lc-curva-txt lc-t-${tom}">${esc(o.rotValor || '')} ${esc(num(val))}</text>`; })();
            return `<div class="lc-grafico-curva"><div class="lc-grafico-tit">${esc(o.tit)}</div>
                <svg viewBox="0 0 ${W} ${Hh}" width="100%" role="img" aria-label="${esc(o.tit)}">${faixa}<path d="${d}" fill="none" stroke="#60A5FA" stroke-width="2.2"/><line x1="30" y1="${base}" x2="${W - 30}" y2="${base}" stroke="#CBD5E1"/>${marcas}${ponto}</svg>
                <div class="lc-legenda"><span class="lc-leg-media"></span> faixa média (${m - dp} a ${m + dp})${o.nota ? ' · ' + esc(o.nota) : ''}</div></div>`;
        },
        /** Tabela no padrão das telas: cabeçalho azul-marinho e classificação em selo. */
        tabela(o) {
            const cols = o.cols;
            // linha sem nenhum número lançado não entra (o relatório não trouxe essa medida)
            const linhasOk = o.linhas.filter(l => l.grupo || cols.some(k => k.k !== 'rot' && !vazio(l[k.k])));
            const corpo = linhasOk.filter((l, i) => !l.grupo || (linhasOk[i + 1] && !linhasOk[i + 1].grupo)).map(l => {
                if (l.grupo) return `<tr class="lc-tab-grupo"><td colspan="${cols.length}">${l.cor ? `<span class="lc-dot" style="background:${l.cor}"></span>` : ''}${esc(l.grupo)}</td></tr>`;
                return `<tr${l.destaque ? ' class="lc-tab-total"' : ''}>${cols.map(k => {
                    const v = l[k.k];
                    if (k.k === 'classificacao') return `<td class="ctr">${chip(v)}</td>`;
                    if (k.k === 'percentil') return `<td class="ctr">${esc(percentilTxt(v))}</td>`;
                    return `<td class="${k.ctr ? 'ctr' : ''}">${k.k === 'rot' ? esc(v) : esc(num(v))}</td>`;
                }).join('')}</tr>`;
            }).join('');
            return `<div class="lc-tabela-resultados"><table><thead><tr>${cols.map(k => `<th class="${k.ctr ? 'ctr' : ''}">${esc(k.r)}</th>`).join('')}</tr></thead><tbody>${corpo}</tbody></table>
                ${o.nota ? `<div class="lc-tab-nota">${esc(o.nota)}</div>` : ''}</div>`;
        },
        texto(paragrafos) {
            const ps = [].concat(paragrafos || []).filter(p => !vazio(p));
            return ps.length ? `<div class="lc-interp">${ps.map(p => `<p>${esc(p)}</p>`).join('')}</div>` : '';
        }
    };

    // Medida já resolvida: valores lançados + fixos (CORTEX) + nome
    function medidasDe(def, d) {
        const out = [];
        def.grupos.forEach(g => g.medidas.forEach(m => {
            const v = Object.assign({}, (d.medidas || {})[m.cod] || {}, (state.fixos.medidas || {})[m.cod] || {});
            out.push(Object.assign({ grupo: g, def: m, cod: m.cod, nome: v.nome || m.nome }, v));
        }));
        return out;
    }

    const state = { def: null, aplicacaoId: null, aplicacao: null, paciente: null, instrumento: null, linha: null, dados: null, tela: 'entrada', fixos: {} };

    async function carregar() {
        const { data: ap, error: e1 } = await c().from('aplicacoes_instrumento').select('*').eq('id', state.aplicacaoId).single();
        if (e1) throw new Error('Aplicação: ' + e1.message);
        state.aplicacao = ap;
        const { data: inst, error: e2 } = await c().from('instrumentos_catalogo').select('id, sigla, nome_completo').eq('id', ap.instrumento_id).single();
        if (e2) throw new Error('Instrumento: ' + e2.message);
        state.instrumento = inst;
        const { data: pac, error: e3 } = await c().from('pacientes').select('id, nome_completo, data_nascimento, sexo, escolaridade').eq('id', ap.paciente_id).single();
        if (e3) throw new Error('Paciente: ' + e3.message);
        state.paciente = pac;
        const { data: lin, error: e4 } = await c().from('resultados_lancados').select('*').eq('aplicacao_id', state.aplicacaoId).maybeSingle();
        if (e4) throw new Error('Resultados lançados: ' + e4.message + (/relation|does not exist|schema cache/i.test(e4.message) ? ' — rode o SQL do sprint LO-7.' : ''));
        state.linha = lin || null;
        state.dados = (lin && lin.dados) || { medidas: {}, contexto: {} };
        state.dados.medidas = state.dados.medidas || {}; state.dados.contexto = state.dados.contexto || {};
        if (state.def.extra) { try { state.fixos = (await state.def.extra(c(), ap)) || {}; } catch (e) { console.warn('[lancados] extra', e); state.fixos = {}; } }
        state.tela = lin ? 'laudo' : 'entrada';
        if (window.CortexAudit) window.CortexAudit.log('leitura', 'resultados_lancados', state.aplicacaoId, { pacienteId: pac.id, detalhes: { sigla: inst.sigla } });
    }

    // ── Entrada dos números ────────────────────────────────────────────────
    function renderEntrada() {
        const def = state.def, d = state.dados;
        document.body.dataset.lancamentoPendente = state.linha ? '' : '1';
        const ctx = (def.contexto || []).map(k => {
            const v = d.contexto[k.c] == null ? '' : d.contexto[k.c];
            const campo = k.tipo === 'select'
                ? `<select data-ctx="${k.c}"><option value="">—</option>${k.opcoes.map(o => `<option ${String(o) === String(v) ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`
                : `<input data-ctx="${k.c}" value="${esc(v)}" ${k.tipo === 'numero' ? 'inputmode="decimal"' : ''} placeholder="${esc(k.ph || '')}">`;
            return `<div class="lc-campo"><label>${esc(k.r)}</label>${campo}</div>`;
        }).join('');
        const grupos = def.grupos.map(g => `
            <div class="lc-sub" style="border-left-color:${g.cor || '#2F6FED'}">
                <div class="lc-sub-cab"><span class="lc-sub-nome">${esc(g.nome)}</span></div>
                ${g.medidas.map(m => {
                    const v = d.medidas[m.cod] || {}, fixo = (state.fixos.medidas || {})[m.cod] || {};
                    return `<div class="lc-med">
                        <input class="lc-med-nome" data-med="${m.cod}" data-campo="nome" value="${esc(v.nome || m.nome)}" title="Nome da medida (pode ajustar ao do relatório)">
                        <div class="lc-med-campos">${m.campos.map(k => {
                            const C = CAMPOS[k] || { r: k, tipo: 'texto' };
                            const val = fixo[k] != null ? fixo[k] : (v[k] == null ? '' : v[k]);
                            return `<label class="lc-mini${C.tipo === 'classif' ? ' largo' : ''}"><span>${esc((m.rotulos || {})[k] || C.r)}${m.max && (k === 'bruto' || k === 'pontos' || k === 'valor') ? ` <em>/${m.max}</em>` : ''}</span>
                                <input data-med="${m.cod}" data-campo="${k}" value="${esc(val)}" ${fixo[k] != null ? 'disabled title="Valor que já está no CORTEX"' : ''}
                                    ${C.tipo === 'numero' ? 'inputmode="decimal"' : ''} ${C.tipo === 'classif' ? 'list="lc-classifs"' : ''} placeholder="${k === 'percentil' ? 'ex.: 35' : ''}"></label>`;
                        }).join('')}</div></div>`;
                }).join('')}
            </div>`).join('');
        el().innerHTML = `
            <div class="lc-form-entrada">
                <div class="lc-aviso info"><strong>${esc(def.titulo)} — lançar os resultados.</strong> Digite os números do relatório de correção do teste
                    (plataforma da editora ou correção manual). O CORTEX não recalcula: ele organiza e desenha o laudo no padrão das telas de correção,
                    pronto para o 📷/📋 e para o Laudo Online. Deixe em branco o que o relatório não trouxer.</div>
                ${ctx ? `<div class="lc-cab">${ctx}</div>` : ''}
                <div class="lc-subs">${grupos}</div>
                <div class="lc-campo largo"><label>Observações do profissional (opcional, saem no laudo)</label>
                    <textarea id="lc-obs" rows="3">${esc(d.observacoes || '')}</textarea></div>
                <datalist id="lc-classifs">${[...new Set((def.classificacoes || []).concat(CLASSIFS))].map(x => `<option value="${esc(x)}">`).join('')}</datalist>
                <div class="lc-acoes">
                    <button class="btn btn-primary" id="lc-salvar">💾 Salvar e ver o laudo</button>
                    ${state.linha ? '<button class="btn btn-secondary" id="lc-cancelar">Cancelar</button>' : ''}
                </div>
            </div>`;
        document.getElementById('lc-salvar').addEventListener('click', salvar);
        const cc = document.getElementById('lc-cancelar');
        if (cc) cc.addEventListener('click', () => { state.tela = 'laudo'; renderizar(); });
    }

    function lerFormulario() {
        const d = { versao: 1, medidas: {}, contexto: {} };
        el().querySelectorAll('[data-ctx]').forEach(i => { if (!vazio(i.value)) d.contexto[i.dataset.ctx] = i.value.trim(); });
        el().querySelectorAll('[data-med]').forEach(i => {
            if (i.disabled) return;
            const m = d.medidas[i.dataset.med] = d.medidas[i.dataset.med] || {};
            const v = i.value.trim();
            if (i.dataset.campo === 'nome') { const def = state.def.grupos.flatMap(g => g.medidas).find(x => x.cod === i.dataset.med); if (v && def && v !== def.nome) m.nome = v; return; }
            if (!vazio(v)) m[i.dataset.campo] = (CAMPOS[i.dataset.campo] || {}).tipo === 'numero' && numero(v) != null ? numero(v) : v;
        });
        Object.keys(d.medidas).forEach(k => { if (!Object.keys(d.medidas[k]).length) delete d.medidas[k]; });
        const obs = document.getElementById('lc-obs').value.trim();
        if (obs) d.observacoes = obs;
        return d;
    }

    async function salvar() {
        const bt = document.getElementById('lc-salvar');
        const d = lerFormulario();
        const temAlgum = Object.values(d.medidas).some(m => Object.keys(m).some(k => k !== 'nome')) || Object.keys(state.fixos.medidas || {}).length;
        if (!temAlgum) { toast('Lance ao menos um resultado.', 'warning'); return; }
        bt.disabled = true; bt.textContent = 'Salvando…';
        try {
            const { error } = await c().from('resultados_lancados').upsert({ aplicacao_id: state.aplicacaoId, dados: d, updated_at: new Date().toISOString() }, { onConflict: 'aplicacao_id' });
            if (error) throw error;
            if (!['corrigido', 'integrado_laudo'].includes(state.aplicacao.status)) {
                const { error: eS } = await c().from('aplicacoes_instrumento')
                    .update({ status: 'corrigido', data_conclusao: state.aplicacao.data_conclusao || new Date().toISOString() }).eq('id', state.aplicacaoId);
                if (eS) throw eS;
                state.aplicacao.status = 'corrigido';
            }
            if (window.CortexAudit) window.CortexAudit.log('edicao', 'resultados_lancados', state.aplicacaoId, { pacienteId: state.paciente.id, detalhes: { sigla: state.instrumento.sigla, operacao: state.linha ? 'resultados_editados' : 'resultados_lancados' } });
            state.linha = { aplicacao_id: state.aplicacaoId, dados: d };
            state.dados = d;
            state.tela = 'laudo';
            renderizar();
            window.scrollTo(0, 0);
            toast('Resultados salvos.', 'success');
        } catch (err) {
            console.error('[lancados salvar]', err);
            toast('Não consegui salvar: ' + (err.message || 'erro'), 'danger');
            bt.disabled = false; bt.textContent = '💾 Salvar e ver o laudo';
        }
    }

    // ── Laudo ──────────────────────────────────────────────────────────────
    function renderLaudo() {
        const def = state.def, d = state.dados;
        document.body.dataset.lancamentoPendente = '';
        const dApl = state.aplicacao.data_aplicacao || state.aplicacao.created_at;
        const id = idadeEm(state.paciente.data_nascimento, dApl);
        const idadeStr = id ? `${id.anos} ano${id.anos !== 1 ? 's' : ''} e ${id.meses} mes${id.meses !== 1 ? 'es' : ''}` : '—';
        const ctx = { dados: d, medidas: medidasDe(def, d), m: {}, contexto: d.contexto || {}, paciente: state.paciente };
        ctx.medidas.forEach(m => { ctx.m[m.cod] = m; });
        const P = def.principal ? def.principal(ctx, H) : null;
        const secoes = (def.laudo(ctx, H) || []).filter(s => s && s.html);
        let n = 1;
        const sec = (t, hint) => `<div class="laudo-secao-titulo"><span class="laudo-secao-tag">${++n}</span>${esc(t)}${hint ? `<span class="laudo-secao-hint">${esc(hint)}</span>` : ''}</div>`;
        const identCtx = (def.contexto || []).filter(k => !vazio(d.contexto[k.c])).map(k => `<div class="laudo-identif-item"><span class="laudo-identif-label">${esc(k.r)}:</span><span class="laudo-identif-valor">${esc(d.contexto[k.c])}</span></div>`).join('');
        el().innerHTML = `
        <div class="laudo" id="laudo-lancado">
            <div class="laudo-header">
                <div class="laudo-header-esq">
                    <div class="laudo-header-logo">E</div>
                    <div class="laudo-header-textos">
                        <div class="laudo-header-supratitulo">Relatório de Avaliação Neuropsicológica</div>
                        <h1 class="laudo-header-titulo">${esc(def.titulo)}</h1>
                        <div class="laudo-header-subtitulo">${esc(def.nome)}${def.subtitulo ? `<br>${esc(def.subtitulo)}` : ''}</div>
                    </div>
                </div>
                ${P ? `<div class="laudo-header-pontuacao">
                    <div class="laudo-header-pontuacao-label">${esc(P.rotulo)}</div>
                    <div class="laudo-header-pontuacao-valor">${esc(P.valor == null || P.valor === '' ? '—' : P.valor)}</div>
                    ${P.nota ? `<div class="laudo-header-pontuacao-max">${esc(P.nota)}</div>` : ''}
                </div>` : ''}
            </div>
            <div class="laudo-body">
                <div class="laudo-secao-titulo"><span class="laudo-secao-tag">1</span>Identificação</div>
                <div class="laudo-identificacao">
                    <div class="laudo-identif-item"><span class="laudo-identif-label">Avaliado(a):</span><span class="laudo-identif-valor">${esc(state.paciente.nome_completo)}</span></div>
                    <div class="laudo-identif-item"><span class="laudo-identif-label">Idade:</span><span class="laudo-identif-valor">${idadeStr}</span></div>
                    <div class="laudo-identif-item"><span class="laudo-identif-label">Nascimento:</span><span class="laudo-identif-valor">${dataBR(state.paciente.data_nascimento)}</span></div>
                    <div class="laudo-identif-item"><span class="laudo-identif-label">Aplicação:</span><span class="laudo-identif-valor">${dataBR(dApl)}</span></div>
                    ${identCtx}
                </div>
                ${secoes.map(s => sec(s.titulo, s.hint) + s.html).join('')}
                ${d.observacoes ? sec('Observações do profissional') + H.texto(String(d.observacoes).split(/\n{2,}/)) : ''}
                <div class="lc-nota"><strong>Nota técnica:</strong> ${esc(def.sobre || '')} Os resultados desta página foram lançados pelo(a) profissional
                    a partir do relatório de correção do teste; o CORTEX não recalcula nem altera os valores, apenas os organiza e representa graficamente.
                    Percentis e classificações seguem a norma indicada no relatório original.</div>
            </div>
            <div class="laudo-rodape">
                <div class="laudo-rodape-esq"><div class="laudo-rodape-org">Equilibrium Neuropsicologia</div><div class="laudo-rodape-tipo">Resultados lançados — ${esc(def.titulo)}</div></div>
                <div class="laudo-rodape-dir"><div class="laudo-rodape-data">Documento gerado em ${dataBR(new Date().toISOString())}</div><div class="laudo-rodape-confidencial">Documento confidencial — uso restrito ao profissional solicitante.</div></div>
            </div>
        </div>
        <div class="lc-acoes"><button class="btn btn-secondary" id="lc-editar">✏️ Editar os resultados</button></div>`;
        document.getElementById('lc-editar').addEventListener('click', () => { state.tela = 'entrada'; renderizar(); window.scrollTo(0, 0); });
        if (window.CortexCopy && typeof window.CortexCopy.aplicar === 'function') window.CortexCopy.aplicar();
    }

    function renderizar() {
        const acoes = document.getElementById('acoes-topo');
        if (state.tela === 'laudo') { renderLaudo(); if (acoes) acoes.style.display = 'flex'; }
        else { renderEntrada(); if (acoes) acoes.style.display = 'none'; }
    }

    async function gerarPDF() {
        const btn = document.getElementById('btn-gerar-pdf'), orig = btn.textContent;
        btn.disabled = true; btn.textContent = '⏳ Gerando PDF…';
        try {
            document.body.classList.add('exportando');
            await new Promise(r => setTimeout(r, 120));
            const alvo = document.getElementById('laudo-lancado');
            if (document.fonts && document.fonts.ready) await document.fonts.ready;
            const canvas = await window.html2canvas(alvo, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false,
                ignoreElements: n => n.classList && (n.classList.contains('cortex-copy-btn') || n.classList.contains('cortex-copy-laudo-btn')) });
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
            const imgA = canvas.height * 210 / canvas.width, img = canvas.toDataURL('image/jpeg', 0.95);
            let resta = imgA, pos = 0;
            pdf.addImage(img, 'JPEG', 0, 0, 210, imgA); resta -= 297;
            while (resta > 0) { pos -= 297; pdf.addPage(); pdf.addImage(img, 'JPEG', 0, pos, 210, imgA); resta -= 297; }
            const nome = (state.paciente.nome_completo || 'paciente').replace(/[^\wÀ-ÿ]+/g, '_');
            pdf.save(`${state.def.titulo.replace(/[^\w-]+/g, '_')}_${nome}.pdf`);
            if (window.CortexAudit) window.CortexAudit.log('geracao_pdf', 'resultados_lancados', state.aplicacaoId, { pacienteId: state.paciente.id });
        } catch (err) {
            console.error('[lancados pdf]', err);
            toast('Não foi possível gerar o PDF: ' + (err.message || 'erro'), 'danger');
        } finally {
            document.body.classList.remove('exportando');
            btn.disabled = false; btn.textContent = orig;
        }
    }

    function mostrarErro(msg) { el().innerHTML = `<div class="lc-aviso ruim"><strong>Erro:</strong> ${esc(msg)}</div>`; }

    function iniciar(def) {
        state.def = def;
        window.addEventListener('cortex:auth-ready', async () => {
            if (window.CortexSidebar) { try { await window.CortexSidebar.render('pacientes'); } catch (e) { /* segue */ } }
            const p = new URLSearchParams(location.search);
            state.aplicacaoId = p.get('aplicacao_id') || p.get('aplicacao');
            if (!state.aplicacaoId) { mostrarErro('aplicacao_id não fornecido na URL'); return; }
            try {
                await carregar();
                const v = document.getElementById('back-link');
                if (v) v.href = `../../bateria/bateria.html?paciente=${state.aplicacao.paciente_id}`;
                renderizar();
                const bp = document.getElementById('btn-gerar-pdf');
                if (bp) bp.addEventListener('click', gerarPDF);
            } catch (err) {
                console.error('[lancados]', err);
                mostrarErro(err.message || 'desconhecido');
            }
        });
    }

    window.LancTeste = { iniciar, H, tomDe, percentilNum, _state: state };
})();

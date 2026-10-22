/* ============================================================================
   CORTEX · Laudo Online — EDITOR  (frontend/shared/laudo/laudo_editor.js)
   ----------------------------------------------------------------------------
   Documento 3, §6.2 (sprint LO-3). Só para admin_clinico, laudo em construção.
     - texto editado direto no bloco, sem ver marcação: negrito, itálico,
       balão, pendência e variáveis viram a marcação do Documento 1 §7;
     - cada bloco: mover (↑ ↓ e arrastar), editar, ocultar, apagar (lixeira),
       onde aparece, página nova antes, manter com o próximo, trocar vista,
       anotações, nota interna, restaurar original, ver mudanças;
     - inserir: texto, título, lista, tabela, caixa, alerta, resultado de teste
       (com prévia), imagem, quebra de página, espaço, texto padrão do modelo;
     - seções: mover, ocultar, renomear, renumerar, acrescentar;
     - gravação automática 1,5 s depois da última mudança, com revisão;
     - conflitos da reimportação: manter o meu / usar o novo / ver diferença.
     - ao vivo (LO-8): mudanças de outra pessoa entram sozinhas (laudo_aovivo.js).
   Expõe: window.LaudoEditor.criar(pagina) → editor
   ============================================================================ */
(function () {
    'use strict';
    const C = () => window.LaudoCore;
    const esc = s => C().esc(s);
    const ATRASO_GRAVAR = 1500;

    const VARIAVEIS = [
        ['{nome}', 'Nome completo'], ['{primeiro_nome}', 'Primeiro nome'], ['{idade}', 'Idade'],
        ['{o|a}', 'o / a'], ['{do|da}', 'do / da'], ['{ao|à}', 'ao / à'], ['{ele|ela}', 'ele / ela'],
        ['{examinando|examinanda}', 'examinando / examinanda'], ['{avaliado|avaliada}', 'avaliado / avaliada'], ['{paciente|paciente}', 'paciente']
    ];
    const INSERIR = [
        ['paragrafo', '¶', 'Texto'], ['titulo', 'T', 'Título'], ['lista', '☰', 'Lista'], ['tabela', '▦', 'Tabela'],
        ['caixa', '▭', 'Caixa'], ['alerta', '⚠', 'Alerta'], ['resultado', '📊', 'Resultado de teste'], ['imagem', '🖼', 'Imagem / print de outro teste'],
        ['quebra_pagina', '⤓', 'Quebra de página'], ['espaco', '↕', 'Espaço'], ['padrao', '📄', 'Texto padrão do modelo']
    ];
    const ONDE = { ambos: 'Impressão e online', impressao: 'Só na impressão', online: 'Só no online' };

    function criar(pg) {
        const st = pg.estado;
        const sb = () => window.cortexClient;
        const toast = pg.toast;
        const ed = {
            pendente: false, gravando: false, timer: null, eventos: [], edicoes: {},
            status: 'salvo', erro: null, urlsImg: {}, modeloCache: null,
            // ao vivo (LO-8): base = último documento em comum com o banco
            base: JSON.parse(JSON.stringify(st.doc || {})), digitouEm: 0, vivo: null, outros: [],
            sincronizando: false, deNovo: false, timerSync: null, conflitos: 0, avisouEm: 0, morto: false,
            // desfazer / refazer (Ctrl+Z, Ctrl+Y): fotos do documento antes de cada mudança
            pilha: [], refazer: [], ultimo: null, textoEm: 0, textoBloco: null
        };

        // ── utilidades de documento ───────────────────────────────────────────
        const doc = () => st.doc;
        function achar(id) {
            for (const sec of (doc().secoes || [])) {
                const i = (sec.blocos || []).findIndex(b => b.id === id);
                if (i >= 0) return { sec, i, b: sec.blocos[i] };
            }
            return null;
        }
        function original(id) {
            const o = st.laudo && st.laudo.documento_original;
            if (!o) return null;
            for (const sec of (o.secoes || [])) { const b = (sec.blocos || []).find(x => x.id === id); if (b) return b; }
            return null;
        }
        const mudou = (a, b) => window.LaudoMesclar.mudou(a, b);
        function novoId() { return 'u.' + C().aleatorio(8); }
        function novoBloco(tipo, extra) { return C().completarBloco(Object.assign({ id: novoId(), tipo, origem: 'manual' }, extra || {}), 'manual'); }
        function ctxPac() { return C().contexto(st.banco, doc().meta); }

        // ── marcação ⇄ HTML editável ──────────────────────────────────────────
        function inlineEdicao(txt, ctx) {
            let s = esc(String(txt == null ? '' : txt));
            const bal = [];
            s = s.replace(/\{\{([^{}|]+?)(?:\|([^{}]+?))?\}\}/g, (m, t, x) => {
                bal.push(`<span class="lo-termo" data-termo="${t.trim()}"${x ? ` data-texto="${x.trim()}"` : ''}>${t.trim()}</span>`);
                return `\u0000${bal.length - 1}\u0000`;
            });
            const chip = (v, txt) => `<span class="ed-var" contenteditable="false" data-var="${v}">${esc(txt)}</span>`;
            s = s.replace(/\{primeiro_nome\}/g, chip('{primeiro_nome}', ctx.primeiroNome || 'primeiro nome'))
                .replace(/\{nome\}/g, chip('{nome}', ctx.nome || 'nome'))
                .replace(/\{idade\}/g, chip('{idade}', ctx.idade || 'idade'))
                .replace(/\{([^{}|\u0000]*)\|([^{}|\u0000]*)\}/g, (m, a, b) => chip(m, ctx.fem ? b : a));
            s = s.replace(/\u0000(\d+)\u0000/g, (m, i) => bal[Number(i)]);
            s = s.replace(/\[\[(.+?)\]\]/g, '<span class="lo-pend">$1</span>');
            s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
            s = s.replace(/(^|[^\w*])\*(?=\S)([^*]+?)\*(?!\w)/g, '$1<em>$2</em>');
            return s;
        }
        function paraMarcacao(no) {
            let out = '';
            no.childNodes.forEach(n => {
                if (n.nodeType === 3) { out += n.nodeValue.replace(/ /g, ' '); return; }
                if (n.nodeType !== 1) return;
                const tag = n.tagName.toLowerCase();
                if (n.classList.contains('ed-var')) { out += n.dataset.var || ''; return; }
                if (n.classList.contains('lo-termo')) {
                    const t = n.textContent.trim();
                    if (t) out += `{{${t}${n.dataset.texto ? '|' + n.dataset.texto : ''}}}`;
                    return;
                }
                if (n.classList.contains('lo-pend')) { const t = paraMarcacao(n).trim(); if (t) out += `[[${t}]]`; return; }
                if (tag === 'br') { out += ' '; return; }
                const dentro = paraMarcacao(n);
                if (tag === 'strong' || tag === 'b') { out += dentro.trim() ? `**${dentro}**` : dentro; return; }
                if (tag === 'em' || tag === 'i') { out += dentro.trim() ? `*${dentro}*` : dentro; return; }
                if (tag === 'div' || tag === 'p') { out += (out && !/\s$/.test(out) ? ' ' : '') + dentro; return; }
                out += dentro;
            });
            return out.replace(/\*\*\s*\*\*/g, '').replace(/[ \t]{2,}/g, ' ');
        }

        // ── gravação ──────────────────────────────────────────────────────────
        function registrar(ev) { marco(); ed.eventos.push(ev); agendar(); }

        // ── desfazer / refazer ────────────────────────────────────────────────
        // ed.ultimo = o documento no último ponto estável. Cada mudança empilha o
        // estado de antes; a digitação conta como uma mudança por "rajada".
        const MAX_DESFAZER = 40;
        function marco() {
            if (ed.morto || !doc()) return;
            const atual = JSON.stringify(doc());
            if (ed.ultimo != null && atual !== ed.ultimo) {
                ed.pilha.push(ed.ultimo);
                if (ed.pilha.length > MAX_DESFAZER) ed.pilha.shift();
                ed.refazer = [];
            }
            ed.ultimo = atual;
            pintarDesfazer();
        }
        function aplicarFoto(j) {
            const d = doc();
            Object.keys(d).forEach(k => { delete d[k]; });
            Object.assign(d, JSON.parse(j));
            ed.ultimo = j; ed.edicoes = {}; ed.textoEm = 0; ed.textoBloco = null;
            ed.eventos.push({ acao: 'editar', bloco_id: null, depois: { desfazer: true } });
            agendar();
            const y = window.scrollY;
            pg.render();
            window.scrollTo(0, y);
            pintarDesfazer();
        }
        function desfazer() {
            if (ed.morto) return;
            marco();
            if (!ed.pilha.length) { toast('Nada para desfazer.'); return; }
            const ant = ed.pilha.pop();
            ed.refazer.push(ed.ultimo);
            aplicarFoto(ant);
        }
        function refazerUltimo() {
            if (ed.morto) return;
            if (!ed.refazer.length) { toast('Nada para refazer.'); return; }
            const atual = JSON.stringify(doc());
            if (atual !== ed.ultimo) { marco(); return; }   // mudou algo depois de desfazer: não há o que refazer
            const prox = ed.refazer.pop();
            ed.pilha.push(ed.ultimo);
            aplicarFoto(prox);
        }
        function pintarDesfazer() {
            const a = document.getElementById('ed-desfazer'), b = document.getElementById('ed-refazer');
            if (a) a.disabled = !ed.pilha.length && JSON.stringify(doc()) === ed.ultimo;
            if (b) b.disabled = !ed.refazer.length;
        }
        function teclaDesfazer(ev) {
            if (ed.morto || !(ev.ctrlKey || ev.metaKey) || ev.altKey) return;
            const k = String(ev.key || '').toLowerCase();
            if (k !== 'z' && k !== 'y') return;
            if (document.querySelector('.lo-modal, .cortex-confirm-overlay')) return;
            const a = document.activeElement;
            if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return;   // campo de formulário: desfazer do próprio campo
            if (a && a.closest && a.closest('.imp-editando')) return;          // escrevendo na folha da Impressão: desfazer do próprio texto
            if (!document.querySelector('.ed-papel, #lo-folhas')) return;
            ev.preventDefault();
            if (k === 'y' || ev.shiftKey) refazerUltimo(); else desfazer();
        }
        document.addEventListener('keydown', teclaDesfazer, true);
        document.addEventListener('click', ev => {
            const b = ev.target.closest && ev.target.closest('#ed-desfazer, #ed-refazer');
            if (!b || ed.morto) return;
            ev.preventDefault();
            if (b.id === 'ed-desfazer') desfazer(); else refazerUltimo();
        });
        function agendar() {
            ed.pendente = true; ed.status = 'pendente'; atualizarStatus();
            clearTimeout(ed.timer);
            ed.timer = setTimeout(gravar, ATRASO_GRAVAR);
        }
        function textoAtual(b) { return JSON.parse(JSON.stringify(b)); }
        async function gravar() {
            clearTimeout(ed.timer);
            if (ed.gravando) { ed.timer = setTimeout(gravar, 400); return; }
            if (!ed.pendente) return;
            // edições de texto viram um evento por bloco (antes → depois)
            Object.keys(ed.edicoes).forEach(id => {
                const r = achar(id);
                ed.eventos.push({ acao: 'editar', bloco_id: id, antes: ed.edicoes[id], depois: r ? textoAtual(r.b) : null });
            });
            const eventos = ed.eventos.slice(); const edicoes = ed.edicoes;
            ed.eventos = []; ed.edicoes = {}; ed.pendente = false; ed.gravando = true; ed.status = 'gravando'; atualizarStatus();
            const enviado = JSON.parse(JSON.stringify(doc()));
            let juntar = false;
            try {
                const { data, error } = await sb().rpc('laudo_online_salvar', {
                    p_id: st.laudo.id, p_revisao: st.laudo.revisao, p_documento: enviado, p_eventos: eventos
                });
                if (error) throw error;
                if (!data || !data.ok) {
                    ed.eventos = eventos.concat(ed.eventos); Object.assign(ed.edicoes, edicoes); ed.pendente = true;
                    // outra pessoa gravou antes: junta as duas versões e grava de novo, sem recarregar
                    if (data && data.erro === 'revisao' && window.LaudoAoVivo && ++ed.conflitos <= 5) {
                        ed.status = 'juntando'; juntar = true;
                    } else {
                        ed.status = 'conflito'; ed.erro = (data && data.mensagem) || 'Não consegui gravar.';
                    }
                    atualizarStatus();
                    return;
                }
                ed.conflitos = 0;
                st.laudo.revisao = data.revisao;
                st.laudo.documento = doc();
                ed.base = enviado;
                if (ed.vivo) ed.vivo.avisar(data.revisao);
                ed.status = ed.pendente ? 'pendente' : 'salvo'; ed.erro = null;
                st.impressao = null;
                if (pg.aposGravar) pg.aposGravar();
            } catch (err) {
                console.error('[editor] gravar', err);
                ed.eventos = eventos.concat(ed.eventos); Object.assign(ed.edicoes, edicoes); ed.pendente = true;
                ed.status = 'erro'; ed.erro = err.message || 'sem conexão';
                ed.timer = setTimeout(gravar, 5000);
            } finally {
                ed.gravando = false;
                atualizarStatus();
                if (juntar) sincronizar({ conflito: true });
                else if (ed.pendente && ed.status === 'pendente') agendar();
            }
        }
        function statusHtml() {
            const t = {
                salvo: ['ok', '✓ Salvo'], pendente: ['amb', '● Alterações não salvas'], gravando: ['amb', '↻ Salvando…'],
                erro: ['err', '⚠ Não salvou — tentando de novo'], conflito: ['err', '⚠ Alterado em outra janela'],
                juntando: ['amb', '↻ Juntando com as mudanças de outra pessoa…']
            }[ed.status] || ['ok', ''];
            const outros = ed.outros || [];
            const nomes = outros.map(p => p.mesmaPessoa ? 'você (outra janela)' : String(p.nome || 'Alguém').split(' ')[0]);
            const juntos = outros.length
                ? `<span class="ed-juntos" title="Também com este laudo aberto: ${esc(outros.map(p => p.mesmaPessoa ? 'você, em outra janela' : p.nome).join(', '))}. As mudanças aparecem sozinhas nas duas telas.">👥 ${esc(nomes.slice(0, 2).join(', '))}${nomes.length > 2 ? ' +' + (nomes.length - 2) : ''}</span>`
                : '';
            const podeDesf = ed.pilha.length > 0 || (ed.ultimo != null && doc() && JSON.stringify(doc()) !== ed.ultimo);
            return `<span class="ed-desf" id="ed-desf-grupo"><button type="button" id="ed-desfazer" title="Desfazer (Ctrl+Z)" ${podeDesf ? '' : 'disabled'}>↶</button><button type="button" id="ed-refazer" title="Refazer (Ctrl+Y)" ${ed.refazer.length ? '' : 'disabled'}>↷</button></span><span class="ed-status ${t[0]}" id="ed-status" title="${esc(ed.erro || '')}">${t[1]}${ed.status === 'conflito' ? ' <button class="ed-link" id="ed-recarregar">Recarregar</button>' : ''}${juntos}</span>`;
        }
        function atualizarStatus() {
            const el = document.getElementById('ed-status');
            if (el) {
                const g = document.getElementById('ed-desf-grupo'); if (g) g.remove();
                el.outerHTML = statusHtml();
                const b = document.getElementById('ed-recarregar'); if (b) b.addEventListener('click', () => location.reload());
            }
        }
        window.addEventListener('beforeunload', ev => { if (!ed.morto && (ed.pendente || ed.gravando)) { gravar(); ev.preventDefault(); ev.returnValue = ''; } });

        function mudouEstrutura(ev, manterFoco) {
            if (ev) registrar(ev); else marco();
            const y = window.scrollY;
            pg.render();
            window.scrollTo(0, y);
            if (manterFoco) focar(manterFoco.id, manterFoco.inicio);
        }

        // ── ao vivo (LO-8): mudanças de outra pessoa entram sem recarregar ──────
        const J = x => JSON.stringify(x);
        function conectarAoVivo() {
            if (ed.vivo || !window.LaudoAoVivo || !st.laudo) return;
            const eu = window.cortexProfissional || {};
            ed.vivo = window.LaudoAoVivo.conectar({
                client: sb(), laudoId: st.laudo.id,
                eu: { id: eu.id || null, nome: eu.nome_completo || eu.email || 'Alguém' },
                revisao: () => st.laudo.revisao,
                aoMudarRemoto: info => { if (info && info.nome) ed.ultimoNome = info.nome; sincronizar({ status: info && info.status }); },
                aoPresenca: lista => { ed.outros = lista; atualizarStatus(); }
            });
        }
        function desligar() {
            ed.morto = true;
            document.removeEventListener('keydown', teclaDesfazer, true);
            clearTimeout(ed.timer); clearTimeout(ed.timerSync);
            if (ed.vivo) ed.vivo.desligar();
            ed.vivo = null;
        }
        function depoisSync(ms) { clearTimeout(ed.timerSync); ed.timerSync = setTimeout(() => sincronizar(ed.optsSync || {}), ms); }
        function ocupado() {
            if (document.querySelector('.lo-modal, .cortex-confirm-overlay')) return 'janela aberta';
            if (document.querySelector('.ed-bloco.arrastando, .ed-bloco.dragging')) return 'arrastando';
            const a = document.activeElement;
            if (a && a.closest && a.closest('.ed-txt') && Date.now() - ed.digitouEm < 2000) return 'digitando';
            if (a && a.closest && a.closest('.imp-editando')) return 'digitando';
            return '';
        }
        // guarda e devolve o cursor no mesmo campo e na mesma letra
        function guardarCursor() {
            const a = document.activeElement;
            const el = a && a.closest && a.closest('.ed-txt'); if (!el) return null;
            const bl = el.closest('.ed-bloco'); if (!bl) return null;
            const sel = window.getSelection(); let pos = null;
            if (sel.rangeCount && el.contains(sel.anchorNode)) {
                const r = document.createRange(); r.selectNodeContents(el); r.setEnd(sel.anchorNode, sel.anchorOffset);
                pos = r.toString().length;
            }
            return { id: bl.dataset.bloco, campo: el.dataset.campo, i: el.dataset.i, pos };
        }
        function devolverCursor(c) {
            if (!c) return;
            const sel = `#b-${CSS.escape(c.id)} .ed-txt[data-campo="${c.campo}"]` + (c.i != null ? `[data-i="${c.i}"]` : '');
            const el = document.querySelector(sel); if (!el) return;
            el.focus();
            const s = window.getSelection(); const r = document.createRange();
            let falta = c.pos == null ? Infinity : c.pos, feito = false;
            const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
            while (w.nextNode()) {
                const n = w.currentNode;
                if (falta <= n.nodeValue.length) { r.setStart(n, falta); feito = true; break; }
                falta -= n.nodeValue.length;
            }
            if (!feito) { r.selectNodeContents(el); r.collapse(false); } else r.collapse(true);
            s.removeAllRanges(); s.addRange(r);
        }
        // Busca o documento do banco e junta com o desta tela.
        // opts.conflito: veio de uma gravação recusada; opts.semGravar: quem chamou grava depois.
        async function sincronizar(opts) {
            opts = opts || {};
            if (ed.morto || !st.laudo) return false;
            if (ed.sincronizando) { ed.deNovo = true; ed.optsSync = Object.assign({}, ed.optsSync, opts); return false; }
            if (!opts.semGravar && (ed.gravando || ocupado())) { ed.optsSync = Object.assign({}, ed.optsSync, opts); depoisSync(1200); return false; }
            ed.optsSync = null;
            ed.sincronizando = true;
            let aplicou = false;
            try {
                const { data, error } = await sb().from('laudos_online').select('revisao, status, documento').eq('id', st.laudo.id).maybeSingle();
                if (error || !data) throw error || new Error('laudo sumiu');
                if (data.status !== 'em_construcao') {
                    toast('Este laudo foi finalizado em outra tela. Abrindo a versão finalizada…');
                    desligar();
                    if (pg.recarregarLaudo) pg.recarregarLaudo(); else location.reload();
                    return false;
                }
                if (Number(data.revisao) <= Number(st.laudo.revisao)) { if (opts.conflito) { ed.status = 'pendente'; agendar(); } return false; }
                if (!opts.semGravar && (ed.gravando || ocupado())) { ed.optsSync = opts; depoisSync(1200); return false; }
                const remoto = data.documento || {};
                const local = doc();
                const temLocal = J(local) !== J(ed.base);
                const m = temLocal ? window.LaudoAoVivo.mesclar(ed.base, local, remoto) : { doc: JSON.parse(J(remoto)), mudancas: { mesmos: [] } };
                const figurasMudaram = J((local || {}).figuras || {}) !== J(m.doc.figuras || {});
                const cursor = guardarCursor();
                // troca o conteúdo no mesmo objeto (outras partes da página guardam a referência)
                Object.keys(local).forEach(k => { delete local[k]; });
                Object.assign(local, m.doc);
                ed.base = JSON.parse(J(remoto));
                st.laudo.revisao = data.revisao;
                st.laudo.documento = local;
                st.impressao = null; st.ctxImp = null;
                Object.keys(ed.edicoes).forEach(id => { if (!achar(id)) delete ed.edicoes[id]; });
                // mudança de outra pessoa entrou: o Ctrl+Z recomeça daqui (não desfaz o que o outro fez)
                ed.pilha = []; ed.refazer = []; ed.ultimo = JSON.stringify(local);
                const aindaTem = J(local) !== J(ed.base);
                if (!aindaTem && !ed.eventos.length) { ed.pendente = false; ed.status = 'salvo'; }
                if (pg.aoRemoto) { try { await pg.aoRemoto({ figurasMudaram }); } catch (e) { console.warn('[ao vivo]', e); } }
                if (!opts.semGravar) {
                    const y = window.scrollY;
                    pg.render();
                    window.scrollTo(0, y);
                    devolverCursor(cursor);
                    if (Date.now() - ed.avisouEm > 20000) {
                        ed.avisouEm = Date.now();
                        toast(`Laudo atualizado com as mudanças de ${ed.ultimoNome ? String(ed.ultimoNome).split(' ')[0] : 'outra pessoa'}.`);
                    }
                    if (m.mudancas.mesmos.length) toast('Vocês dois mexeram no mesmo trecho ao mesmo tempo; ficou a sua versão. Confira se quiser.', 'warning');
                    if (aindaTem || ed.eventos.length || Object.keys(ed.edicoes).length) agendar();
                    else atualizarStatus();
                }
                aplicou = true;
            } catch (err) {
                console.warn('[ao vivo] sincronizar', err);
                if (opts.conflito) { ed.status = 'erro'; ed.erro = 'Não consegui juntar com as mudanças de outra pessoa.'; atualizarStatus(); clearTimeout(ed.timer); ed.timer = setTimeout(gravar, 5000); }
            } finally {
                ed.sincronizando = false;
                if (ed.deNovo) { ed.deNovo = false; const o = ed.optsSync || {}; ed.optsSync = null; setTimeout(() => sincronizar(o), 50); }
            }
            return aplicou;
        }
        // depois que a página gravou sozinha (figuras, ajustes, reimportação)
        function marcarSalvo(revisao) {
            if (revisao != null) st.laudo.revisao = revisao;
            ed.base = JSON.parse(J(doc()));
            if (ed.vivo) ed.vivo.avisar(st.laudo.revisao);
        }
        conectarAoVivo();
        ed.ultimo = JSON.stringify(doc() || {});

        // ── documento editável ────────────────────────────────────────────────
        function documentoHtml() {
            const ctx = ctxPac();
            return (doc().secoes || []).map(sec => `
                <section class="lo-sec ed-sec ${sec.oculta ? 'oculta' : ''}" id="sec-${esc(sec.id)}" data-secao="${esc(sec.id)}">
                    <h2 class="lo-h2 ed-h2"><span>${esc(sec.n)}.</span> ${esc(sec.titulo)}${sec.oculta ? ' <em class="lo-tag">oculta</em>' : ''}${sec.quebra_antes ? ' <em class="lo-tag">página nova antes</em>' : ''}
                        <button class="ed-mini" data-sec-editar="${esc(sec.id)}" title="Renomear, renumerar e opções da seção">✎</button></h2>
                    ${inserirLinha(sec.id, 0)}
                    ${(sec.blocos || []).map((b, i) => blocoHtml(b, ctx, sec) + inserirLinha(sec.id, i + 1)).join('')}
                </section>`).join('');
        }
        function inserirLinha(secId, pos) {
            return `<div class="ed-ins" data-ins-sec="${esc(secId)}" data-ins-pos="${pos}"><button title="Inserir bloco aqui">+</button></div>`;
        }

        const EDITAVEIS = ['titulo', 'paragrafo', 'meta', 'nota', 'alerta'];
        const COM_FORM = ['titulo', 'alerta', 'lista', 'caixa', 'campos', 'tabela_instrumentos', 'hipotese', 'afastada', 'mapa', 'tabela',
            'referencias', 'resultado', 'imagem', 'espaco', 'local_data', 'assinatura', 'convite', 'acompanhe', 'fidedignidade', 'padrao', 'paragrafo', 'meta', 'nota'];

        function ce(campo, html, cls, extra) {
            return `<div class="ed-txt ${cls || ''}" contenteditable="true" spellcheck="true" data-campo="${campo}"${extra || ''}>${html}</div>`;
        }

        function corpoBloco(b, ctx, sec) {
            const I = t => inlineEdicao(t, ctx);
            switch (b.tipo) {
                case 'titulo': return ce('texto', I(b.texto), Number(b.nivel) === 4 ? 'lo-h4' : 'lo-h3');
                case 'paragrafo': return ce('texto', I(b.texto), 'lo-p');
                case 'meta': return ce('texto', I(b.texto), 'lo-meta');
                case 'nota': return ce('texto', I(b.texto), 'lo-nota');
                case 'alerta': return `<div class="lo-alerta ${b.nivel === 'vermelho' ? 'verm' : ''}">${ce('texto', I(b.texto), '')}</div>`;
                case 'padrao': return String(b.texto || '').split(/\n{2,}/).map((p, k) => ce('texto', I(p), 'lo-p', ` data-par="${k}"`)).join('');
                case 'lista': {
                    const tag = b.estilo === 'marcadores' ? 'ul' : 'ol';
                    return `<${tag} class="lo-lista">${(b.itens || []).map((x, k) => `<li>${ce('itens', I(x), '', ` data-i="${k}"`)}</li>`).join('')}</${tag}>`;
                }
                case 'caixa': return `<div class="lo-caixa ${esc(b.estilo || 'azul')}">${ce('titulo', I(b.titulo || ''), 'ed-caixa-tit', ' data-vazio="Título da caixa (opcional)"')}${(b.paragrafos || []).map((p, k) => ce('paragrafos', I(p), 'lo-p', ` data-i="${k}"`)).join('')}</div>`;
                case 'fidedignidade': return `<div class="lo-caixa azul"><b>Análise de fidedignidade</b>${(b.paragrafos || []).map((p, k) => ce('paragrafos', I(p), 'lo-p', ` data-i="${k}"`)).join('')}</div>`;
                case 'referencias': return `<div class="lo-refs">${(b.itens || []).map((x, k) => ce('itens', I(x), 'ed-ref', ` data-i="${k}"`)).join('')}</div>`;
                case 'imagem': {
                    const url = ed.urlsImg[b.arquivo];
                    if (!url && b.arquivo && !(b.arquivo in ed.urlsImg)) carregarImagem(b.arquivo);
                    const w = { inteira: '100%', metade: '50%', terco: '33%' }[b.largura] || '100%';
                    return `<figure class="ed-fig">${url ? `<img src="${esc(url)}" style="width:${w}" alt="">` : '<div class="i-fig-vazia">Carregando imagem…</div>'}${b.legenda ? `<figcaption>${I(b.legenda)}</figcaption>` : ''}</figure>`;
                }
                default: return pg.conteudoLeitura(b, ctx, sec);
            }
        }

        function blocoHtml(b, ctx, sec) {
            const o = original(b.id);
            const editado = o && mudou(b, o);
            const tags = [];
            if (b.exibir === 'impressao') tags.push('<em class="lo-tag">só impressão</em>');
            if (b.tipo === 'tabela' && b.sigla) tags.push('<em class="lo-tag" title="Teste corrigido fora do CORTEX: os números são os do Gerador">números do Gerador · sem conferência</em>');
            if (b.exibir === 'online') tags.push('<em class="lo-tag">só online</em>');
            if (b.oculto) tags.push('<em class="lo-tag">oculto</em>');
            if (b.quebra_antes) tags.push('<em class="lo-tag azul">página nova antes</em>');
            if (b.manter_com_proximo && b.tipo !== 'titulo') tags.push('<em class="lo-tag">junto do próximo</em>');
            if (b.dividir_tabela) tags.push('<em class="lo-tag">divide entre páginas</em>');
            if (editado) tags.push('<em class="lo-tag roxo">editado</em>');
            const conflito = b._conflito ? `
                <div class="ed-conflito"><b>O Gerador mudou este trecho na reimportação.</b> A sua versão continua aqui.
                    <span><button data-conf="meu">Manter o meu</button><button data-conf="novo">Usar o novo</button><button data-conf="ver">Ver diferença</button></span></div>` : '';
            const fora = b._fora_do_pacote ? `
                <div class="ed-conflito amb"><b>Este trecho não existe mais no pacote do Gerador.</b> Ficou porque você tinha editado.
                    <span><button data-conf="ok">Manter</button><button data-conf="apagar">Apagar</button></span></div>` : '';
            const compl = (b.complementos || []).length ? `<div class="lo-compl">${b.complementos.map(c => `<div><b>💬 ${esc(c.titulo || 'Anotação')}</b> ${C().inline(c.texto || '', ctx)}</div>`).join('')}</div>` : '';
            const nota = b.nota_interna ? `<div class="lo-nota-int"><b>Nota interna:</b> ${esc(b.nota_interna)}</div>` : '';
            return `
                <div class="lo-bloco ed-bloco ${b.oculto ? 'oculto' : ''} ${b._conflito ? 'tem-conflito' : ''}" id="b-${esc(b.id)}" data-bloco="${esc(b.id)}" data-tipo="${esc(b.tipo)}">
                    <div class="ed-barra" contenteditable="false">
                        <span class="ed-arrastar" draggable="true" title="Arrastar para mover">⠿</span>
                        <button data-acao="subir" title="Subir">↑</button><button data-acao="descer" title="Descer">↓</button>
                        ${COM_FORM.includes(b.tipo) ? '<button data-acao="editar" title="Editar">✎</button>' : ''}
                        <button data-acao="ocultar" title="${b.oculto ? 'Mostrar' : 'Ocultar sem apagar'}">${b.oculto ? '👁‍🗨' : '👁'}</button>
                        <button data-acao="menu" title="Mais opções">⋯</button>
                        <button data-acao="apagar" class="perigo" title="Apagar (vai para a lixeira)">🗑</button>
                    </div>
                    <div class="lo-bloco-marca"><span class="lo-orig ${esc(b.origem || '')}" title="${esc(b.id)}">${esc({ gerador: 'Gerador', modelo: 'Modelo', cortex: 'CORTEX', manual: 'Manual' }[b.origem] || b.origem || '')}</span>${tags.join('')}</div>
                    ${conflito}${fora}
                    ${corpoBloco(b, ctx, sec)}${compl}${nota}
                </div>`;
        }

        async function carregarImagem(arq) {
            ed.urlsImg[arq] = null;
            try {
                const { data } = await sb().storage.from('laudos-midia').createSignedUrl(arq, 900);
                ed.urlsImg[arq] = (data && data.signedUrl) || '';
            } catch (e) { ed.urlsImg[arq] = ''; }
            document.querySelectorAll('.ed-bloco[data-tipo="imagem"]').forEach(el => {
                const r = achar(el.dataset.bloco); if (!r) return;
                const fig = el.querySelector('.ed-fig');
                if (fig) fig.outerHTML = corpoBloco(r.b, ctxPac(), r.sec);
            });
        }

        // ── árvore de seções (esquerda) ───────────────────────────────────────
        function arvoreHtml() {
            const pend = new Set(((st.validacao || {}).pendencias || []).map(x => String(x.secao)));
            return `<h3>Seções</h3><ol class="ed-arvore">${(doc().secoes || []).map((s, k, arr) => `
                <li class="${s.oculta ? 'oculta' : ''}" data-secao="${esc(s.id)}">
                    <a href="#sec-${esc(s.id)}" data-ir="${esc(s.id)}"><i>${esc(s.n)}</i><span>${esc(cap(s.titulo))}</span>${pend.has(String(s.n)) ? '<b class="lo-ponto" title="Tem pendência"></b>' : ''}</a>
                    <span class="ed-arv-acoes">
                        <button data-sec-acao="subir" ${k === 0 ? 'disabled' : ''} title="Subir seção">↑</button>
                        <button data-sec-acao="descer" ${k === arr.length - 1 ? 'disabled' : ''} title="Descer seção">↓</button>
                        <button data-sec-acao="ocultar" title="${s.oculta ? 'Mostrar seção' : 'Ocultar seção'}">${s.oculta ? '👁‍🗨' : '👁'}</button>
                        <button data-sec-acao="editar" title="Renomear e renumerar">✎</button>
                    </span>
                </li>`).join('')}</ol>
                <button class="ed-nova-sec" id="ed-nova-sec">+ Seção</button>
                <div class="lo-legenda">
                    <span class="lo-orig gerador">Gerador</span><span class="lo-orig modelo">Modelo</span>
                    <span class="lo-orig cortex">CORTEX</span><span class="lo-orig manual">Manual</span>
                </div>`;
        }
        function cap(t) { const s = String(t || '').toLowerCase().replace(/\bqi\b/g, 'QI'); return s.charAt(0).toUpperCase() + s.slice(1); }

        // ── lixeira e restauração (direita) ───────────────────────────────────
        function lixeiraHtml() {
            const lx = doc().lixeira || [];
            return `
                <h3>Lixeira <span class="lo-resumo ${lx.length ? 'aviso' : 'ok'}">${lx.length}</span></h3>
                <ul class="lo-hist ed-lixeira">${lx.length ? lx.slice().reverse().map((x, k) => {
                    const i = lx.length - 1 - k;
                    const resumo = C().plano(C().textos(x.bloco).join(' '), ctxPac()).slice(0, 70) || (C().TIPOS[x.bloco.tipo] || x.bloco.tipo);
                    return `<li><b>${esc(C().TIPOS[x.bloco.tipo] || x.bloco.tipo)}</b> ${esc(resumo)}<span>${x.motivo === 'saiu_do_pacote' ? 'Saiu do pacote · ' : ''}${esc(new Date(x.apagado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }))} <button class="ed-link" data-restaurar-lixo="${i}">Restaurar</button></span></li>`;
                }).join('') : '<li class="vazio">Vazia.</li>'}</ul>
                <button class="ed-link perigo" id="ed-restaurar-tudo">↺ Voltar o laudo inteiro ao original</button>`;
        }

        // ── eventos ───────────────────────────────────────────────────────────
        function ligar(raiz) {
            const papel = raiz.querySelector('.ed-papel');
            if (!papel) return;
            atualizarStatus();
            // texto
            papel.addEventListener('input', ev => {
                const el = ev.target.closest('.ed-txt'); if (!el) return;
                const bl = el.closest('.ed-bloco'); if (!bl) return;
                const r = achar(bl.dataset.bloco); if (!r) return;
                if (!(r.b.id in ed.edicoes)) ed.edicoes[r.b.id] = textoAtual(r.b);
                // nova rajada de digitação (pausa ou outro bloco) = um passo do Ctrl+Z
                if (Date.now() - ed.textoEm > 1200 || ed.textoBloco !== r.b.id) marco();
                ed.textoEm = Date.now(); ed.textoBloco = r.b.id;
                ed.digitouEm = Date.now();
                aplicarCampo(r.b, el, bl);
                agendar();
            });
            papel.addEventListener('keydown', teclas);
            papel.addEventListener('paste', ev => {
                if (!ev.target.closest('.ed-txt')) return;
                ev.preventDefault();
                const t = (ev.clipboardData || window.clipboardData).getData('text/plain').replace(/\s*\n\s*/g, ' ');
                document.execCommand('insertText', false, t);
            });
            papel.addEventListener('focusin', ev => { const el = ev.target.closest('.ed-txt'); if (el) mostrarFormatacao(el); });
            papel.addEventListener('focusout', ev => { setTimeout(() => { if (!document.activeElement || !document.activeElement.closest || (!document.activeElement.closest('.ed-txt') && !document.activeElement.closest('.ed-fmt'))) esconderFormatacao(); }, 150); });
            // barra do bloco
            papel.addEventListener('click', ev => {
                const bt = ev.target.closest('.ed-barra button[data-acao]');
                if (bt) { acaoBloco(bt.dataset.acao, bt.closest('.ed-bloco').dataset.bloco, bt); return; }
                const ins = ev.target.closest('.ed-ins button');
                if (ins) { const d = ins.parentElement; menuInserir(d.dataset.insSec, Number(d.dataset.insPos), ins); return; }
                const cf = ev.target.closest('.ed-conflito button[data-conf]');
                if (cf) { resolverConflito(cf.closest('.ed-bloco').dataset.bloco, cf.dataset.conf); return; }
                const se = ev.target.closest('[data-sec-editar]');
                if (se) { editarSecao(se.dataset.secEditar); return; }
                const pd = ev.target.closest('.lo-pend');
                if (pd && pd.closest('.ed-txt') && ev.detail === 2) { /* duplo clique numa pendência: seleciona o texto */ }
            });
            // arrastar
            papel.addEventListener('dragstart', ev => {
                const h = ev.target.closest('.ed-arrastar'); if (!h) return;
                const bl = h.closest('.ed-bloco');
                ev.dataTransfer.setData('text/x-bloco', bl.dataset.bloco); ev.dataTransfer.effectAllowed = 'move';
                bl.classList.add('arrastando');
            });
            papel.addEventListener('dragend', () => papel.querySelectorAll('.arrastando, .alvo-cima, .alvo-baixo').forEach(e => e.classList.remove('arrastando', 'alvo-cima', 'alvo-baixo')));
            papel.addEventListener('dragover', ev => {
                if (!Array.from(ev.dataTransfer.types || []).includes('text/x-bloco')) return;
                const bl = ev.target.closest('.ed-bloco'); const sec = ev.target.closest('.ed-sec');
                if (!bl && !sec) return;
                ev.preventDefault();
                papel.querySelectorAll('.alvo-cima, .alvo-baixo').forEach(e => e.classList.remove('alvo-cima', 'alvo-baixo'));
                if (bl) { const r = bl.getBoundingClientRect(); bl.classList.add(ev.clientY < r.top + r.height / 2 ? 'alvo-cima' : 'alvo-baixo'); }
            });
            papel.addEventListener('drop', ev => {
                const id = ev.dataTransfer.getData('text/x-bloco'); if (!id) return;
                ev.preventDefault();
                const bl = ev.target.closest('.ed-bloco'); const secEl = ev.target.closest('.ed-sec');
                const de = achar(id); if (!de) return;
                if (bl && bl.dataset.bloco === id) return;
                const [movido] = de.sec.blocos.splice(de.i, 1);
                if (bl) {
                    const alvo = achar(bl.dataset.bloco);
                    const r = bl.getBoundingClientRect();
                    alvo.sec.blocos.splice(alvo.i + (ev.clientY < r.top + r.height / 2 ? 0 : 1), 0, movido);
                } else {
                    doc().secoes.find(s => s.id === secEl.dataset.secao).blocos.push(movido);
                }
                mudouEstrutura({ acao: 'mover', bloco_id: id, antes: { secao: de.sec.id, posicao: de.i } });
            });
            // árvore
            const arv = raiz.querySelector('.ed-arvore');
            if (arv) arv.addEventListener('click', ev => {
                const bt = ev.target.closest('[data-sec-acao]'); if (!bt) return;
                acaoSecao(bt.dataset.secAcao, bt.closest('li').dataset.secao);
            });
            const ns = raiz.querySelector('#ed-nova-sec'); if (ns) ns.addEventListener('click', () => editarSecao(null));
            ligarLixeira(raiz);
        }
        function ligarLixeira(raiz) {
            raiz.querySelectorAll('[data-restaurar-lixo]').forEach(b => b.addEventListener('click', () => restaurarDaLixeira(Number(b.dataset.restaurarLixo))));
            const rt = raiz.querySelector('#ed-restaurar-tudo'); if (rt) rt.addEventListener('click', restaurarTudo);
        }

        function aplicarCampo(b, el, bl) {
            const campo = el.dataset.campo;
            const txt = paraMarcacao(el).trim();
            if (b.tipo === 'padrao') {
                b.texto = Array.from(bl.querySelectorAll('.ed-txt[data-campo="texto"]')).map(e => paraMarcacao(e).trim()).filter(Boolean).join('\n\n');
            } else if (campo === 'itens' || campo === 'paragrafos') {
                b[campo] = Array.from(bl.querySelectorAll(`.ed-txt[data-campo="${campo}"]`)).map(e => paraMarcacao(e).trim());
            } else {
                b[campo] = txt;
            }
        }

        // Enter cria parágrafo/item novo; Backspace num bloco vazio apaga
        function teclas(ev) {
            const el = ev.target.closest('.ed-txt'); if (!el) return;
            const bl = el.closest('.ed-bloco'); const r = achar(bl.dataset.bloco); if (!r) return;
            if ((ev.ctrlKey || ev.metaKey) && !ev.shiftKey && ['b', 'i'].includes(ev.key.toLowerCase())) {
                ev.preventDefault(); document.execCommand(ev.key.toLowerCase() === 'b' ? 'bold' : 'italic'); el.dispatchEvent(new Event('input', { bubbles: true })); return;
            }
            if (ev.key === 'Enter' && !ev.shiftKey) {
                ev.preventDefault();
                if (r.b.tipo === 'paragrafo' || el.dataset.campo === 'itens' || el.dataset.campo === 'paragrafos') {
                    const resto = cortarDepoisDoCursor(el);
                    if (!(r.b.id in ed.edicoes)) ed.edicoes[r.b.id] = textoAtual(r.b);
                    aplicarCampo(r.b, el, bl);
                    if (r.b.tipo === 'paragrafo') {
                        const nb = novoBloco('paragrafo', { texto: resto });
                        r.sec.blocos.splice(r.i + 1, 0, nb);
                        mudouEstrutura({ acao: 'inserir', bloco_id: nb.id, depois: { tipo: 'paragrafo', apos: r.b.id } }, { id: nb.id, inicio: true });
                    } else {
                        const k = Number(el.dataset.i);
                        r.b[el.dataset.campo].splice(k + 1, 0, resto);
                        mudouEstrutura(null);
                        agendar();
                        focarItem(r.b.id, el.dataset.campo, k + 1);
                    }
                } else el.blur();
                return;
            }
            if (ev.key === 'Backspace' && !el.textContent.trim()) {
                if (r.b.tipo === 'paragrafo' && !paraMarcacao(el).trim()) {
                    ev.preventDefault();
                    const ant = r.sec.blocos[r.i - 1];
                    r.sec.blocos.splice(r.i, 1);
                    delete ed.edicoes[r.b.id];
                    mudouEstrutura({ acao: 'apagar', bloco_id: r.b.id, antes: r.b }, ant ? { id: ant.id, fim: true } : null);
                } else if ((el.dataset.campo === 'itens' || el.dataset.campo === 'paragrafos') && (r.b[el.dataset.campo] || []).length > 1) {
                    ev.preventDefault();
                    const k = Number(el.dataset.i);
                    r.b[el.dataset.campo].splice(k, 1);
                    if (!(r.b.id in ed.edicoes)) ed.edicoes[r.b.id] = textoAtual(r.b);
                    agendar(); mudouEstrutura(null);
                    focarItem(r.b.id, el.dataset.campo, Math.max(0, k - 1), true);
                }
            }
        }
        function cortarDepoisDoCursor(el) {
            const sel = window.getSelection();
            if (!sel.rangeCount) return '';
            const r = sel.getRangeAt(0);
            const rr = document.createRange();
            rr.setStart(r.endContainer, r.endOffset);
            rr.setEnd(el, el.childNodes.length);
            const tmp = document.createElement('div');
            tmp.appendChild(rr.extractContents());
            return paraMarcacao(tmp).trim();
        }
        function focar(id, inicio) {
            const el = document.querySelector(`#b-${CSS.escape(id)} .ed-txt`);
            if (!el) return;
            el.focus();
            const r = document.createRange(); r.selectNodeContents(el); r.collapse(!!inicio);
            const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
        }
        function focarItem(id, campo, k, fim) {
            const el = document.querySelector(`#b-${CSS.escape(id)} .ed-txt[data-campo="${campo}"][data-i="${k}"]`);
            if (!el) return;
            el.focus();
            const r = document.createRange(); r.selectNodeContents(el); r.collapse(!fim);
            const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
        }

        // ── barra de formatação ───────────────────────────────────────────────
        let fmt = null, fmtAlvo = null;
        function mostrarFormatacao(el) {
            fmtAlvo = el;
            if (!fmt) {
                fmt = document.createElement('div');
                fmt.className = 'ed-fmt';
                fmt.innerHTML = `
                    <button data-f="bold" title="Negrito (Ctrl+B)"><b>N</b></button>
                    <button data-f="italic" title="Itálico (Ctrl+I)"><i>I</i></button>
                    <button data-f="balao" title="Balão: explicação ao clicar no termo (online)">💬 Balão</button>
                    <button data-f="pend" title="Marcar como pendência (cinza no PDF, listada nas conferências)">⟦ Pendência ⟧</button>
                    <span class="ed-fmt-var"><button data-f="var" title="Inserir variável do cadastro">{ } Variável ▾</button>
                        <span class="ed-fmt-menu" hidden>${VARIAVEIS.map(v => `<button data-v="${esc(v[0])}">${esc(v[1])} <code>${esc(v[0])}</code></button>`).join('')}</span></span>
                    <button data-f="limpar" title="Tirar balão ou pendência do trecho selecionado">✕ Desmarcar</button>`;
                document.body.appendChild(fmt);
                fmt.addEventListener('mousedown', ev => ev.preventDefault());
                fmt.addEventListener('click', ev => {
                    const b = ev.target.closest('button'); if (!b || !fmtAlvo) return;
                    if (b.dataset.v) { inserirVariavel(b.dataset.v); fmt.querySelector('.ed-fmt-menu').hidden = true; return; }
                    formatar(b.dataset.f);
                });
            }
            fmt.hidden = false;
            const r = el.getBoundingClientRect();
            fmt.style.top = (window.scrollY + r.top - fmt.offsetHeight - 6) + 'px';
            fmt.style.left = (window.scrollX + Math.max(8, Math.min(r.left, window.innerWidth - fmt.offsetWidth - 8))) + 'px';
        }
        function esconderFormatacao() { if (fmt) { fmt.hidden = true; fmt.querySelector('.ed-fmt-menu').hidden = true; } }
        function selecao() {
            const s = window.getSelection();
            if (!s.rangeCount) return null;
            const r = s.getRangeAt(0);
            if (!fmtAlvo || !fmtAlvo.contains(r.commonAncestorContainer)) return null;
            return r;
        }
        function envolver(r, el) {
            try { r.surroundContents(el); }
            catch (e) { el.appendChild(r.extractContents()); r.insertNode(el); }
        }
        function avisarMudanca() { if (fmtAlvo) fmtAlvo.dispatchEvent(new Event('input', { bubbles: true })); }
        function formatar(f) {
            if (f === 'bold' || f === 'italic') { document.execCommand(f); avisarMudanca(); return; }
            if (f === 'var') { const m = fmt.querySelector('.ed-fmt-menu'); m.hidden = !m.hidden; return; }
            const r = selecao();
            if (f === 'limpar') {
                if (!r) return;
                let n = r.commonAncestorContainer; if (n.nodeType === 3) n = n.parentElement;
                const alvo = n.closest('.lo-termo, .lo-pend');
                if (alvo && fmtAlvo.contains(alvo)) { alvo.replaceWith(document.createTextNode(alvo.textContent)); avisarMudanca(); }
                return;
            }
            if (!r || r.collapsed) {
                if (f === 'pend') {
                    const sp = document.createElement('span'); sp.className = 'lo-pend'; sp.textContent = 'a confirmar';
                    if (r) r.insertNode(sp); else fmtAlvo.appendChild(sp);
                    avisarMudanca(); return;
                }
                toast('Selecione o termo primeiro.', 'info'); return;
            }
            if (f === 'pend') { const sp = document.createElement('span'); sp.className = 'lo-pend'; envolver(r, sp); avisarMudanca(); return; }
            if (f === 'balao') {
                const termo = r.toString().trim();
                if (!termo) return;
                const g = st.glossario[termo.toLowerCase()];
                const rr = r.cloneRange();
                abrirForm({
                    titulo: `Balão: “${termo}”`,
                    texto: g ? `O glossário da clínica já explica este termo: “${g.texto}”. Deixe em branco para usar essa explicação, ou escreva uma só para este caso.` : 'Este termo não está no glossário da clínica. Escreva a explicação que aparece ao clicar no termo, na página online.',
                    campos: [{ k: 'texto', rotulo: 'Explicação para este caso', tipo: 'area', obrigatorio: !g }],
                    valores: { texto: '' },
                    aoSalvar: v => {
                        const sp = document.createElement('span'); sp.className = 'lo-termo';
                        sp.dataset.termo = termo; if (v.texto.trim()) sp.dataset.texto = v.texto.trim().replace(/[{}|]/g, '');
                        envolver(rr, sp); avisarMudanca();
                    }
                });
            }
        }
        function inserirVariavel(v) {
            const r = selecao(); if (!fmtAlvo) return;
            const ctx = ctxPac();
            const sp = document.createElement('span');
            sp.className = 'ed-var'; sp.contentEditable = 'false'; sp.dataset.var = v;
            const m = /^\{([^|]*)\|([^|]*)\}$/.exec(v);
            sp.textContent = v === '{nome}' ? ctx.nome : v === '{primeiro_nome}' ? ctx.primeiroNome : v === '{idade}' ? ctx.idade : (m ? (ctx.fem ? m[2] : m[1]) : v);
            if (r) { r.deleteContents(); r.insertNode(sp); r.setStartAfter(sp); r.collapse(true); const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); }
            else fmtAlvo.appendChild(sp);
            avisarMudanca();
        }

        // ── ações do bloco ────────────────────────────────────────────────────
        function acaoBloco(acao, id, botao) {
            const r = achar(id); if (!r) return;
            const b = r.b;
            if (acao === 'subir' || acao === 'descer') {
                const secs = doc().secoes, si = secs.indexOf(r.sec);
                r.sec.blocos.splice(r.i, 1);
                if (acao === 'subir') {
                    if (r.i > 0) r.sec.blocos.splice(r.i - 1, 0, b);
                    else if (si > 0) secs[si - 1].blocos.push(b);
                    else r.sec.blocos.unshift(b);
                } else {
                    if (r.i < r.sec.blocos.length) r.sec.blocos.splice(r.i + 1, 0, b);
                    else if (si < secs.length - 1) secs[si + 1].blocos.unshift(b);
                    else r.sec.blocos.push(b);
                }
                mudouEstrutura({ acao: 'mover', bloco_id: id, antes: { secao: r.sec.id, posicao: r.i } });
                const el = document.getElementById('b-' + id); if (el) { el.scrollIntoView({ block: 'nearest' }); el.classList.add('piscar'); }
                return;
            }
            if (acao === 'ocultar') { b.oculto = !b.oculto; mudouEstrutura({ acao: 'ocultar', bloco_id: id, depois: { oculto: b.oculto } }); return; }
            if (acao === 'apagar') {
                window.CortexConfirm.mostrar({
                    icone: '🗑', titulo: 'Apagar este bloco?', texto: 'Ele vai para a lixeira do laudo e pode ser restaurado até a finalização.',
                    btnSim: 'Apagar', btnNao: 'Cancelar', btnSimDanger: true,
                    onSim: () => apagar(id)
                });
                return;
            }
            if (acao === 'editar') { editarBloco(id); return; }
            if (acao === 'menu') { menuBloco(id, botao); }
        }
        function apagar(id, motivo) {
            const r = achar(id); if (!r) return;
            r.sec.blocos.splice(r.i, 1);
            doc().lixeira = doc().lixeira || [];
            doc().lixeira.push({ bloco: r.b, secao_id: r.sec.id, posicao: r.i, apagado_em: new Date().toISOString(), motivo: motivo || 'apagado' });
            delete ed.edicoes[id];
            mudouEstrutura({ acao: 'apagar', bloco_id: id, antes: r.b });
        }
        function restaurarDaLixeira(i) {
            const lx = doc().lixeira || []; const x = lx[i]; if (!x) return;
            const sec = doc().secoes.find(s => s.id === x.secao_id) || doc().secoes[doc().secoes.length - 1];
            sec.blocos.splice(Math.min(x.posicao || 0, sec.blocos.length), 0, x.bloco);
            lx.splice(i, 1);
            mudouEstrutura({ acao: 'restaurar', bloco_id: x.bloco.id, depois: { da: 'lixeira' } });
            setTimeout(() => { const el = document.getElementById('b-' + x.bloco.id); if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('piscar'); } }, 50);
        }
        function restaurarTudo() {
            const o = st.laudo && st.laudo.documento_original; if (!o) return;
            window.CortexConfirm.mostrar({
                icone: '↺', titulo: 'Voltar o laudo inteiro ao original?',
                texto: 'Todas as edições, blocos acrescentados e ajustes de página somem. O histórico continua registrado.',
                btnSim: 'Voltar ao original', btnNao: 'Cancelar', btnSimDanger: true,
                onSim: () => {
                    const atual = doc();
                    const novo = C().clonar(o); novo.lixeira = [];
                    Object.keys(atual).forEach(k => { delete atual[k]; });
                    Object.assign(atual, novo);
                    mudouEstrutura({ acao: 'restaurar', bloco_id: null, depois: { laudo_inteiro: true } });
                }
            });
        }

        function menuBloco(id, botao) {
            const r = achar(id); const b = r.b;
            const o = original(id);
            const editado = o && mudou(b, o);
            const itens = [];
            itens.push(`<div class="ed-menu-tit">Onde aparece</div>` + Object.keys(ONDE).map(k => `<button data-m="exibir:${k}" class="${(b.exibir || 'ambos') === k ? 'sel' : ''}">${ONDE[k]}</button>`).join(''));
            itens.push('<hr>');
            itens.push(`<button data-m="quebra">${b.quebra_antes ? '✓ ' : ''}Página nova antes</button>`);
            itens.push(`<button data-m="manter">${b.manter_com_proximo ? '✓ ' : ''}Manter junto do próximo</button>`);
            if (['tabela', 'tabela_instrumentos', 'classificacao_qi', 'mapa', 'campos'].includes(b.tipo)) itens.push(`<button data-m="dividir_tabela" title="O que não couber continua na folha seguinte, com o cabeçalho repetido">${b.dividir_tabela ? '✓ ' : ''}Dividir a tabela entre páginas</button>`);
            if (b.tipo === 'resultado') itens.push('<button data-m="vista">Trocar vista / opções do gráfico</button>');
            itens.push('<hr>');
            itens.push(`<button data-m="complementos">💬 Anotações do online (${(b.complementos || []).length})</button>`);
            itens.push(`<button data-m="nota">📝 Nota interna${b.nota_interna ? ' ✓' : ''}</button>`);
            if (o) { itens.push('<hr>'); itens.push(`<button data-m="restaurar" ${editado ? '' : 'disabled'}>↺ Restaurar original</button>`); itens.push(`<button data-m="mudancas" ${editado ? '' : 'disabled'}>⇆ Ver mudanças</button>`); }
            popMenu(botao, itens.join(''), m => {
                if (m.startsWith('exibir:')) { b.exibir = m.split(':')[1]; mudouEstrutura({ acao: 'editar', bloco_id: id, depois: { exibir: b.exibir } }); }
                else if (m === 'quebra') { b.quebra_antes = !b.quebra_antes; mudouEstrutura({ acao: 'editar', bloco_id: id, depois: { quebra_antes: b.quebra_antes } }); }
                else if (m === 'dividir_tabela') { if (b.dividir_tabela) delete b.dividir_tabela; else b.dividir_tabela = true; mudouEstrutura({ acao: 'editar', bloco_id: id, depois: { dividir_tabela: !!b.dividir_tabela } }); }
                else if (m === 'manter') { b.manter_com_proximo = !b.manter_com_proximo; mudouEstrutura({ acao: 'editar', bloco_id: id, depois: { manter_com_proximo: b.manter_com_proximo } }); }
                else if (m === 'vista') escolherResultado(b);
                else if (m === 'complementos') editarComplementos(b);
                else if (m === 'nota') editarNota(b);
                else if (m === 'restaurar') restaurarBloco(id);
                else if (m === 'mudancas') verMudancas(o, b);
            });
        }
        function restaurarBloco(id) {
            const r = achar(id), o = original(id); if (!r || !o) return;
            const antes = r.b;
            const layout = {}; ['oculto', 'quebra_antes', 'manter_com_proximo', 'dividir_tabela', 'exibir', 'complementos', 'nota_interna'].forEach(k => { if (k in antes) layout[k] = antes[k]; });
            r.sec.blocos[r.i] = Object.assign(C().clonar(o), layout);
            delete ed.edicoes[id];
            mudouEstrutura({ acao: 'restaurar', bloco_id: id, antes });
        }

        function popMenu(ancora, html, aoEscolher) {
            document.querySelectorAll('.ed-menu').forEach(m => m.remove());
            const m = document.createElement('div');
            m.className = 'ed-menu'; m.innerHTML = html;
            document.body.appendChild(m);
            const r = ancora.getBoundingClientRect();
            m.style.top = (window.scrollY + r.bottom + 4) + 'px';
            m.style.left = (window.scrollX + Math.max(8, Math.min(r.right - m.offsetWidth, window.innerWidth - m.offsetWidth - 8))) + 'px';
            m.addEventListener('click', ev => { const b = ev.target.closest('button[data-m]'); if (!b || b.disabled) return; m.remove(); aoEscolher(b.dataset.m); });
            setTimeout(() => document.addEventListener('click', function fechar(ev) { if (!m.contains(ev.target)) { m.remove(); document.removeEventListener('click', fechar); } }), 0);
        }

        // ── inserir ───────────────────────────────────────────────────────────
        function menuInserir(secId, pos, botao) {
            popMenu(botao, `<div class="ed-menu-tit">Inserir aqui</div><div class="ed-menu-grade">${INSERIR.map(x => `<button data-m="${x[0]}"><i>${x[1]}</i>${esc(x[2])}</button>`).join('')}</div>`,
                tipo => inserir(tipo, secId, pos));
        }
        function inserir(tipo, secId, pos) {
            const sec = doc().secoes.find(s => s.id === secId); if (!sec) return;
            const colocar = (b, focarTexto) => {
                sec.blocos.splice(pos, 0, b);
                mudouEstrutura({ acao: 'inserir', bloco_id: b.id, depois: { tipo: b.tipo, secao: secId, posicao: pos } }, focarTexto ? { id: b.id, inicio: true } : null);
                if (!focarTexto) setTimeout(() => { const el = document.getElementById('b-' + b.id); if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('piscar'); } }, 30);
            };
            switch (tipo) {
                case 'paragrafo': colocar(novoBloco('paragrafo', { texto: '' }), true); break;
                case 'titulo': colocar(novoBloco('titulo', { nivel: 3, texto: 'Novo título', manter_com_proximo: true }), true); break;
                case 'lista': colocar(novoBloco('lista', { estilo: 'numerada', itens: [''] }), true); break;
                case 'alerta': colocar(novoBloco('alerta', { nivel: 'ambar', texto: '' }), true); break;
                case 'caixa': colocar(novoBloco('caixa', { titulo: '', estilo: 'azul', paragrafos: [''] }), true); break;
                case 'tabela': editarTabela(novoBloco('tabela', { cabecalho: ['Coluna 1', 'Coluna 2'], linhas: [['', '']] }), b => colocar(b)); break;
                case 'quebra_pagina': colocar(novoBloco('quebra_pagina', { exibir: 'impressao' })); break;
                case 'espaco': colocar(novoBloco('espaco', { altura: 'm' })); break;
                case 'resultado': escolherResultado(null, b => colocar(b)); break;
                case 'imagem': inserirImagens(bs => bs.slice().reverse().forEach(b => colocar(b))); break;
                case 'padrao': escolherPadrao(b => colocar(b)); break;
            }
        }

        // ── resultado: escolher teste e vista, com prévia ─────────────────────
        function escolherResultado(existente, aoInserir) {
            // Tudo o que entra aqui já existe nas telas de correção: o laudo só traz a foto
            // das partes (cabeçalho, gráficos, tabelas, cartões). WAIS/WISC/RAVLT/FDT/BFP
            // também têm os desenhos do modelo do laudo (LO-3).
            const NUCLEO = C().SIGLAS_DO_CORTEX;
            const res = st.banco.resultados || {};
            const disponiveis = [];
            const incluir = s => { if (s && !disponiveis.includes(s) && !(res[s] && res[s].apelido_de)) disponiveis.push(s); };
            NUCLEO.forEach(s => { if (res[s]) incluir(s); });
            (st.banco.aplicacoes || []).forEach(a => { if (a.corrigida) incluir(a.sigla); });
            Object.keys(st.doc.figuras || {}).forEach(incluir);
            if (!disponiveis.length) { toast('Nenhum teste corrigido no CORTEX para este paciente.', 'info'); return; }
            const atual = existente ? C().clonar(existente) : novoBloco('resultado', { sigla: disponiveis[0], vista: '', opcoes: {} });
            atual.opcoes = atual.opcoes || {};
            if (!disponiveis.includes(atual.sigla)) disponiveis.unshift(atual.sigla);
            const figurasDoTeste = sig => { const F = window.LaudoGraf.figurasDaSigla(sig); return F ? (F.blocos || []) : []; };
            // seleção inicial
            let sel = [], desenho = '';
            if (existente) {
                const fs = window.LaudoGraf.figurasDe(existente);
                if (fs) sel = fs.map(f => f.chave);
                else if (NUCLEO.includes(existente.sigla) && existente.vista !== 'figura') desenho = existente.vista;
                else if (existente.vista === 'cabecalho') sel = ['_cab'];
            }
            const m = modal(`
                <h2>${existente ? 'Trocar o resultado' : 'Inserir resultado de teste'}</h2>
                <p>Escolha o teste e clique nas partes da <b>tela de correção</b> que devem ir para o laudo. Pode marcar várias; elas entram na ordem da tela.</p>
                <div class="ed-res-grade ed-res-fig">
                    <div class="ed-res-op">
                        <label>Teste<select id="er-sigla">${disponiveis.map(s => `<option ${s === atual.sigla ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></label>
                        <div class="ed-partes" id="er-partes"></div>
                        <div id="er-desenho-l" class="ed-res-desenho">
                            <label>Ou um desenho do modelo do laudo<select id="er-vista"></select></label>
                            <label id="er-indice-l">Índice<select id="er-indice">${['ICV', 'IOP', 'IMO', 'IVP'].map(k => `<option>${k}</option>`).join('')}</select></label>
                            <label id="er-fator-l">Fator<select id="er-fator"><option value="">Todos</option>${['N', 'E', 'S', 'R', 'A'].map(k => `<option value="${k}">${C().FATORES_BFP[k]}</option>`).join('')}</select></label>
                            <label class="chk" id="er-semcab-l"><input type="checkbox" id="er-semcab"> Sem a faixa azul do teste</label>
                        </div>
                        <label>Largura<select id="er-largura"><option value="inteira">Inteira</option><option value="metade">Metade (dois lado a lado)</option></select></label>
                        <label>Legenda (opcional)<input id="er-legenda" type="text"></label>
                    </div>
                    <div class="ed-res-previa imp" id="er-previa"></div>
                </div>
                <div class="lo-modal-acoes"><button class="btn btn-secondary" data-fechar>Cancelar</button><button class="btn btn-primary" id="er-ok">${existente ? 'Aplicar' : 'Inserir'}</button></div>`, 'largo ed-res-modal');
            const $ = id => m.querySelector('#' + id);
            const NOMES = { indice: 'Cartão de um índice', qit_icg: 'QIT e ICG', perfil_subtestes: 'Perfil de subtestes', intervalos: 'Intervalos de confiança', discrepancias: 'Discrepâncias', tabela_subtestes: 'Tabela de subtestes', resumo: 'Resumo em uma linha', cartao: 'Cartão completo', cabecalho: 'Só o cabeçalho', curva: 'Curva', tabela: 'Tabela', barras: 'Barras', fatores: 'Fatores', facetas: 'Facetas' };
            let trazendo = false;
            function encherPartes() {
                const sig = $('er-sigla').value;
                const figs = figurasDoTeste(sig);
                const urls = st.urlsFig || {};
                const item = (ch, tit, img) => `<button type="button" class="ed-parte${sel.includes(ch) ? ' sel' : ''}" data-ch="${esc(ch)}" aria-pressed="${sel.includes(ch)}">
                    ${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : `<span class="ed-parte-sem">${esc(sig)}</span>`}<span class="ed-parte-t">${esc(tit)}</span><i class="ed-parte-n"></i></button>`;
                let h = '';
                if (figs.length) {
                    h = figs.map(f => item(f.chave, f.chave === 'cabecalho' ? 'Só o cabeçalho' : f.titulo, urls[f.arquivo])).join('');
                    if (!figs.some(f => f.chave === 'cabecalho')) h = item('_cab', 'Só o cabeçalho', null) + h;
                    h += `<p class="ed-partes-nota">Tela de correção trazida em ${esc(new Date(window.LaudoGraf.figurasDaSigla(sig).capturado_em || Date.now()).toLocaleDateString('pt-BR'))}. <button type="button" class="ed-link" id="er-trazer">📷 Trazer de novo</button></p>`;
                } else {
                    h = item('_cab', 'Só o cabeçalho', null) + `<div class="ed-partes-vazio">As tabelas e gráficos da tela de correção deste teste ainda não foram trazidos.<button type="button" class="btn btn-primary" id="er-trazer">📷 Trazer da tela de correção</button></div>`;
                }
                $('er-partes').innerHTML = `<p class="ed-partes-tit">Partes da tela de correção</p><div class="ed-partes-grade">${h}</div>`;
                numerar();
                const vs = NUCLEO.includes(sig) && res[sig] && !res[sig].erro ? C().vistasDe(sig).filter(v => v !== 'figura') : [];
                $('er-desenho-l').hidden = !vs.length;
                $('er-vista').innerHTML = `<option value="">—</option>` + vs.map(v => `<option value="${esc(v)}" ${v === desenho ? 'selected' : ''}>${esc(NOMES[v] || v)}</option>`).join('');
                const bt = $('er-trazer');
                if (bt) bt.addEventListener('click', trazer);
            }
            function numerar() {
                const ordem = ordenados();
                m.querySelectorAll('.ed-parte').forEach(b => {
                    const k = ordem.indexOf(b.dataset.ch);
                    b.classList.toggle('sel', k >= 0); b.setAttribute('aria-pressed', String(k >= 0));
                    b.querySelector('.ed-parte-n').textContent = k >= 0 && ordem.length > 1 ? String(k + 1) : (k >= 0 ? '✓' : '');
                });
            }
            function ordenados() {
                const chaves = ['_cab'].concat(figurasDoTeste($('er-sigla').value).map(f => f.chave));
                return chaves.filter(ch => sel.includes(ch));
            }
            async function trazer() {
                if (trazendo) return;
                if (!pg.capturarFigurasDe) { toast('Use 📷 Figuras dos testes no topo da página.', 'info'); return; }
                trazendo = true;
                const sig = $('er-sigla').value;
                const bt = $('er-trazer'); bt.disabled = true; bt.textContent = 'Abrindo a tela de correção…';
                $('er-ok').disabled = true;
                try {
                    const r = await pg.capturarFigurasDe(sig);
                    if (r.erroGravar) toast('Não consegui gravar: ' + r.erroGravar, 'danger');
                    else if (r.erros && r.erros[sig]) toast(`${sig}: ${r.erros[sig]}`, 'danger');
                    else toast(`${sig}: partes da tela de correção trazidas.`, 'success');
                } finally {
                    trazendo = false; $('er-ok').disabled = false;
                    if (document.body.contains(m) && $('er-sigla').value === sig) { encherPartes(); previa(); }
                }
            }
            function ler() {
                atual.sigla = $('er-sigla').value;
                const op = {};
                const ordem = ordenados().filter(ch => ch !== '_cab');
                if (ordem.length) { atual.vista = 'figura'; op.figuras = ordem; }
                else if (sel.includes('_cab')) atual.vista = 'cabecalho';
                else if (desenho) {
                    atual.vista = desenho;
                    if (desenho === 'indice') op.indice = $('er-indice').value;
                    if (desenho === 'facetas' && $('er-fator').value) op.fator = $('er-fator').value;
                    if ($('er-semcab').checked) op.sem_cabecalho = true;
                } else atual.vista = '';
                if ($('er-largura').value === 'metade') op.largura = 'metade';
                if ($('er-legenda').value.trim()) op.legenda = $('er-legenda').value.trim();
                const resto = Object.assign({}, atual.opcoes); ['indice', 'fator', 'largura', 'sem_cabecalho', 'legenda', 'figura', 'figuras'].forEach(k => delete resto[k]);
                atual.opcoes = Object.assign(resto, op);
            }
            function previa() {
                ler();
                $('er-indice-l').hidden = desenho !== 'indice';
                $('er-fator-l').hidden = desenho !== 'facetas';
                $('er-semcab-l').hidden = !desenho;
                $('er-ok').disabled = trazendo || !atual.vista;
                $('er-previa').innerHTML = atual.vista ? window.LaudoGraf.render(atual, st.banco, { glossario: st.glossario })
                    : '<p class="ed-previa-vazia">Clique nas partes da tela de correção que quer no laudo.</p>';
            }
            encherPartes();
            if (atual.opcoes.indice) $('er-indice').value = atual.opcoes.indice;
            if (atual.opcoes.fator) $('er-fator').value = atual.opcoes.fator;
            if (atual.opcoes.largura === 'metade') $('er-largura').value = 'metade';
            $('er-semcab').checked = !!atual.opcoes.sem_cabecalho;
            $('er-legenda').value = atual.opcoes.legenda || '';
            $('er-sigla').addEventListener('change', () => { sel = []; desenho = ''; atual.opcoes = {}; encherPartes(); previa(); });
            $('er-partes').addEventListener('click', ev => {
                const b = ev.target.closest('.ed-parte'); if (!b) return;
                const ch = b.dataset.ch;
                if (ch === '_cab') sel = sel.includes('_cab') ? [] : ['_cab'];          // cabeçalho desenhado vai sozinho
                else { sel = sel.filter(x => x !== '_cab'); sel = sel.includes(ch) ? sel.filter(x => x !== ch) : sel.concat(ch); }
                desenho = ''; $('er-vista').value = '';
                numerar(); previa();
            });
            $('er-vista').addEventListener('change', () => { desenho = $('er-vista').value; if (desenho) { sel = []; numerar(); } previa(); });
            ['er-indice', 'er-fator', 'er-largura', 'er-semcab'].forEach(id => $(id).addEventListener('change', previa));
            $('er-legenda').addEventListener('input', previa);
            previa();
            $('er-ok').addEventListener('click', () => {
                ler(); if (!atual.vista) return;
                m.remove();
                if (existente) {
                    const r = achar(existente.id);
                    const antes = C().clonar(r.b);
                    Object.assign(r.b, { sigla: atual.sigla, vista: atual.vista, opcoes: atual.opcoes });
                    mudouEstrutura({ acao: 'editar', bloco_id: r.b.id, antes, depois: C().clonar(r.b) });
                } else aoInserir(atual);
            });
        }

        // ── imagem ────────────────────────────────────────────────────────────
        // Várias imagens de fora (prints de outros testes, fotos): colar com Ctrl+V, arrastar ou escolher.
        function inserirImagens(aoInserir) {
            const lista = [];   // { arquivo: File, url, legenda }
            const m = modal(`
                <h2>Imagens de fora</h2>
                <p>Prints de outros testes (TAVIS-4, plataformas das editoras…), fotos de provas ou desenhos. <b>Cole com Ctrl+V</b>, arraste os arquivos para cá ou escolha no computador. PNG, JPG ou WEBP de até 5 MB cada; ficam guardadas no laudo, com acesso restrito.</p>
                <div class="ed-img-zona" id="ei-zona" tabindex="0">
                    <b>📋 Cole aqui (Ctrl+V)</b><span>ou arraste as imagens</span>
                    <label class="lo-btn sec"><input type="file" id="ei-arqs" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden>📎 Escolher no computador</label>
                </div>
                <div class="ed-img-lista" id="ei-lista"></div>
                <label class="ed-campo">Largura<select id="ei-larg"><option value="inteira">Inteira</option><option value="metade">Metade</option><option value="terco">Um terço</option></select></label>
                <div id="ei-res"></div>
                <div class="lo-modal-acoes"><button class="btn btn-secondary" data-fechar>Cancelar</button><button class="btn btn-primary" id="ei-ok" disabled>Inserir</button></div>`, 'largo');
            const $ = id => m.querySelector('#' + id);
            function desenhar() {
                $('ei-lista').innerHTML = lista.map((x, k) => `<div class="ed-img-item"><img src="${x.url}" alt=""><div><input data-leg="${k}" type="text" placeholder="Legenda (opcional) — ex.: TAVIS-4, Tarefa 2 — Alternada" value="${esc(x.legenda)}"><small>${esc(x.arquivo.name || 'imagem colada')} · ${(x.arquivo.size / 1024).toFixed(0)} KB</small></div><button type="button" class="ed-x" data-tirar="${k}" title="Tirar">✕</button></div>`).join('');
                $('ei-ok').disabled = !lista.length;
                $('ei-ok').textContent = lista.length > 1 ? `Inserir ${lista.length} imagens` : 'Inserir';
            }
            function adicionar(files) {
                const erros = [];
                [...files].forEach(f => {
                    if (!/^image\//.test(f.type)) return erros.push(`${f.name || 'arquivo'}: não é imagem`);
                    if (f.size > 5 * 1024 * 1024) return erros.push(`${f.name || 'imagem'}: maior que 5 MB`);
                    lista.push({ arquivo: f, url: URL.createObjectURL(f), legenda: '' });
                });
                $('ei-res').innerHTML = erros.length ? `<p class="lo-imp-erro">${esc(erros.join(' · '))}</p>` : '';
                desenhar();
            }
            const colar = ev => { const fs = [...((ev.clipboardData || {}).files || [])]; if (fs.length) { ev.preventDefault(); adicionar(fs); } };
            document.addEventListener('paste', colar);
            const fechou = new MutationObserver(() => { if (!document.body.contains(m)) { document.removeEventListener('paste', colar); fechou.disconnect(); } });
            fechou.observe(document.body, { childList: true });
            $('ei-arqs').addEventListener('change', ev => adicionar(ev.target.files));
            const zona = $('ei-zona');
            zona.addEventListener('dragover', ev => { ev.preventDefault(); zona.classList.add('sobre'); });
            zona.addEventListener('dragleave', () => zona.classList.remove('sobre'));
            zona.addEventListener('drop', ev => { ev.preventDefault(); zona.classList.remove('sobre'); adicionar(ev.dataTransfer.files); });
            zona.focus();
            $('ei-lista').addEventListener('input', ev => { const k = ev.target.dataset.leg; if (k != null) lista[Number(k)].legenda = ev.target.value; });
            $('ei-lista').addEventListener('click', ev => { const k = ev.target.dataset.tirar; if (k != null) { lista.splice(Number(k), 1); desenhar(); } });
            $('ei-ok').addEventListener('click', async () => {
                const bt = $('ei-ok'); bt.disabled = true;
                const blocos = [];
                try {
                    for (let k = 0; k < lista.length; k++) {
                        bt.textContent = `Enviando ${k + 1} de ${lista.length}…`;
                        const x = lista[k], tipo = x.arquivo.type || 'image/png';
                        const ext = ((x.arquivo.name || '').split('.').pop() || tipo.split('/')[1] || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
                        const caminho = `${st.pacienteId}/${st.laudo.id}/${C().aleatorio(10)}.${ext}`;
                        const up = await sb().storage.from('laudos-midia').upload(caminho, x.arquivo, { contentType: tipo, upsert: false });
                        if (up.error) throw up.error;
                        blocos.push(novoBloco('imagem', { arquivo: caminho, legenda: x.legenda.trim() || null, largura: $('ei-larg').value }));
                    }
                    m.remove();
                    aoInserir(blocos);
                } catch (err) {
                    bt.disabled = false; bt.textContent = 'Tentar de novo';
                    $('ei-res').innerHTML = `<p class="lo-imp-erro">Não consegui enviar: ${esc(err.message || '')}</p>`;
                    if (blocos.length) { m.remove(); aoInserir(blocos); toast(`${blocos.length} imagem(ns) entraram; as outras falharam.`, 'warning'); }
                }
            });
        }

        function escolherImagem(aoInserir, existente) {
            const m = modal(`
                <h2>${existente ? 'Imagem' : 'Inserir imagem'}</h2>
                <p>Desenho, foto de prova ou gráfico de fora do CORTEX. PNG, JPG ou WEBP de até 5 MB. A imagem fica guardada no laudo, com acesso restrito.</p>
                <div class="lo-imp-linha"><label class="lo-btn sec"><input type="file" id="ei-arq" accept="image/png,image/jpeg,image/webp,image/gif" hidden>📎 ${existente ? 'Trocar arquivo' : 'Escolher imagem'}</label><span class="lo-imp-nome" id="ei-nome">${existente ? 'Arquivo atual mantido' : 'Nenhum arquivo'}</span></div>
                <label class="ed-campo">Legenda (opcional)<input id="ei-leg" type="text" value="${esc(existente ? existente.legenda || '' : '')}"></label>
                <label class="ed-campo">Largura<select id="ei-larg"><option value="inteira">Inteira</option><option value="metade">Metade</option><option value="terco">Um terço</option></select></label>
                <div id="ei-res"></div>
                <div class="lo-modal-acoes"><button class="btn btn-secondary" data-fechar>Cancelar</button><button class="btn btn-primary" id="ei-ok" ${existente ? '' : 'disabled'}>${existente ? 'Aplicar' : 'Inserir'}</button></div>`);
            const $ = id => m.querySelector('#' + id);
            if (existente && existente.largura) $('ei-larg').value = existente.largura;
            let arquivo = null;
            $('ei-arq').addEventListener('change', ev => {
                const f = ev.target.files[0]; arquivo = null; $('ei-res').innerHTML = '';
                if (!f) return;
                $('ei-nome').textContent = f.name;
                if (!/^image\//.test(f.type)) { $('ei-res').innerHTML = '<p class="lo-imp-erro">Escolha uma imagem.</p>'; return; }
                if (f.size > 5 * 1024 * 1024) { $('ei-res').innerHTML = '<p class="lo-imp-erro">Imagem maior que 5 MB.</p>'; return; }
                arquivo = f; $('ei-ok').disabled = false;
            });
            $('ei-ok').addEventListener('click', async () => {
                const bt = $('ei-ok'); bt.disabled = true; bt.textContent = 'Enviando…';
                try {
                    let caminho = existente ? existente.arquivo : null;
                    if (arquivo) {
                        const ext = (arquivo.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '');
                        caminho = `${st.pacienteId}/${st.laudo.id}/${C().aleatorio(10)}.${ext}`;
                        const up = await sb().storage.from('laudos-midia').upload(caminho, arquivo, { contentType: arquivo.type, upsert: false });
                        if (up.error) throw up.error;
                        delete ed.urlsImg[caminho];
                    }
                    const dados = { arquivo: caminho, legenda: $('ei-leg').value.trim() || null, largura: $('ei-larg').value };
                    m.remove();
                    if (existente) {
                        const r = achar(existente.id); const antes = C().clonar(r.b);
                        Object.assign(r.b, dados);
                        mudouEstrutura({ acao: 'editar', bloco_id: r.b.id, antes, depois: C().clonar(r.b) });
                    } else aoInserir(novoBloco('imagem', dados));
                } catch (err) {
                    bt.disabled = false; bt.textContent = existente ? 'Aplicar' : 'Inserir';
                    $('ei-res').innerHTML = `<p class="lo-imp-erro">Não consegui enviar: ${esc(err.message || '')}</p>`;
                }
            });
        }

        // ── texto padrão do modelo ────────────────────────────────────────────
        async function escolherPadrao(aoInserir) {
            try {
                if (!ed.modeloCache) {
                    const q = await sb().from('laudo_modelos').select('esqueleto').eq('padrao', true).eq('ativo', true).limit(1);
                    ed.modeloCache = (q.data && q.data[0] && q.data[0].esqueleto) || window.LaudoModeloPadrao.esqueleto();
                }
            } catch (e) { ed.modeloCache = window.LaudoModeloPadrao.esqueleto(); }
            const lista = [];
            (ed.modeloCache.secoes || []).forEach(s => (s.blocos || []).forEach(b => { if (b.tipo === 'padrao' && b.texto) lista.push(b); }));
            const m = modal(`
                <h2>Texto padrão do modelo</h2>
                <p>Uma cópia do texto entra no laudo. Editar aqui não muda o modelo.</p>
                <div class="ed-padroes">${lista.map((b, k) => `<button data-k="${k}"><b>${esc(b.chave)}</b><span>${esc(C().plano(b.texto, ctxPac()).slice(0, 160))}…</span></button>`).join('')}</div>
                <div class="lo-modal-acoes"><button class="btn btn-secondary" data-fechar>Cancelar</button></div>`);
            m.querySelector('.ed-padroes').addEventListener('click', ev => {
                const b = ev.target.closest('button[data-k]'); if (!b) return;
                const p = lista[Number(b.dataset.k)];
                m.remove();
                aoInserir(novoBloco('padrao', { chave: p.chave, texto: p.texto }));
            });
        }

        // ── formulários ───────────────────────────────────────────────────────
        function modal(html, cls) {
            const m = document.createElement('div');
            m.className = 'lo-modal';
            m.innerHTML = `<div class="lo-modal-card ${cls || ''}" role="dialog" aria-modal="true">${html}</div>`;
            document.body.appendChild(m);
            m.addEventListener('click', ev => { if (ev.target === m || ev.target.closest('[data-fechar]')) m.remove(); });
            return m;
        }
        /**
         * Formulário genérico. campos: { k, rotulo, tipo: texto|area|select|check|linhas, opcoes, colunas, obrigatorio, ajuda }
         */
        function abrirForm(o) {
            const linhaHtml = (cols, v) => `<tr>${cols.map(c => `<td>${c.tipo === 'select'
                ? `<select data-col="${c.k}">${c.opcoes.map(op => `<option value="${esc(op[0])}" ${String(v[c.k] ?? '') === String(op[0]) ? 'selected' : ''}>${esc(op[1])}</option>`).join('')}</select>`
                : c.tipo === 'area' ? `<textarea data-col="${c.k}" rows="2">${esc(v[c.k] ?? '')}</textarea>` : `<input data-col="${c.k}" value="${esc(v[c.k] ?? '')}">`}</td>`).join('')}
                <td class="ed-lin-acoes"><button type="button" data-lin="subir" title="Subir">↑</button><button type="button" data-lin="tirar" title="Tirar linha">✕</button></td></tr>`;
            const campoHtml = c => {
                const v = o.valores[c.k];
                if (c.tipo === 'area') return `<label class="ed-campo">${esc(c.rotulo)}<textarea data-k="${c.k}" rows="${c.linhas || 4}">${esc(v ?? '')}</textarea>${c.ajuda ? `<small>${esc(c.ajuda)}</small>` : ''}</label>`;
                if (c.tipo === 'select') return `<label class="ed-campo">${esc(c.rotulo)}<select data-k="${c.k}">${c.opcoes.map(op => `<option value="${esc(op[0])}" ${String(v ?? '') === String(op[0]) ? 'selected' : ''}>${esc(op[1])}</option>`).join('')}</select></label>`;
                if (c.tipo === 'check') return `<label class="ed-campo chk"><input type="checkbox" data-k="${c.k}" ${v ? 'checked' : ''}> ${esc(c.rotulo)}</label>`;
                if (c.tipo === 'linhas') return `<div class="ed-campo"><span>${esc(c.rotulo)}</span><table class="ed-linhas" data-k="${c.k}"><thead><tr>${c.colunas.map(cc => `<th>${esc(cc.rotulo)}</th>`).join('')}<th></th></tr></thead><tbody>${(v || []).map(x => linhaHtml(c.colunas, x)).join('')}</tbody></table><button type="button" class="ed-link" data-add="${c.k}">+ Linha</button></div>`;
                return `<label class="ed-campo">${esc(c.rotulo)}<input data-k="${c.k}" value="${esc(v ?? '')}">${c.ajuda ? `<small>${esc(c.ajuda)}</small>` : ''}</label>`;
            };
            const m = modal(`<h2>${esc(o.titulo)}</h2>${o.texto ? `<p>${esc(o.texto)}</p>` : ''}<form class="ed-form">${o.campos.map(campoHtml).join('')}</form>
                <p class="lo-imp-erro" id="ef-erro"></p>
                <div class="lo-modal-acoes"><button class="btn btn-secondary" data-fechar>Cancelar</button><button class="btn btn-primary" id="ef-ok">${esc(o.botao || 'Aplicar')}</button></div>`, o.largo ? 'largo' : '');
            m.addEventListener('click', ev => {
                const ad = ev.target.closest('[data-add]');
                if (ad) { const c = o.campos.find(x => x.k === ad.dataset.add); m.querySelector(`table[data-k="${c.k}"] tbody`).insertAdjacentHTML('beforeend', linhaHtml(c.colunas, {})); return; }
                const li = ev.target.closest('[data-lin]');
                if (li) { const tr = li.closest('tr'); if (li.dataset.lin === 'tirar') tr.remove(); else if (tr.previousElementSibling) tr.parentNode.insertBefore(tr, tr.previousElementSibling); }
            });
            const primeiro = m.querySelector('input, textarea, select'); if (primeiro) primeiro.focus();
            m.querySelector('#ef-ok').addEventListener('click', () => {
                const v = {};
                o.campos.forEach(c => {
                    if (c.tipo === 'linhas') {
                        v[c.k] = Array.from(m.querySelectorAll(`table[data-k="${c.k}"] tbody tr`)).map(tr => {
                            const x = {}; c.colunas.forEach(cc => { x[cc.k] = tr.querySelector(`[data-col="${cc.k}"]`).value.trim(); }); return x;
                        }).filter(x => Object.values(x).some(Boolean));
                    } else if (c.tipo === 'check') v[c.k] = m.querySelector(`[data-k="${c.k}"]`).checked;
                    else v[c.k] = m.querySelector(`[data-k="${c.k}"]`).value;
                });
                const falta = o.campos.find(c => c.obrigatorio && !String(v[c.k] || '').trim());
                if (falta) { m.querySelector('#ef-erro').textContent = `Preencha: ${falta.rotulo}.`; return; }
                m.remove();
                o.aoSalvar(v);
            });
            return m;
        }

        function aplicarForm(id, mudar) {
            const r = achar(id); if (!r) return;
            const antes = C().clonar(r.b);
            mudar(r.b);
            delete ed.edicoes[id];
            mudouEstrutura({ acao: 'editar', bloco_id: id, antes, depois: C().clonar(r.b) });
        }
        const linhasTxt = a => (a || []).join('\n');
        const txtLinhas = t => String(t || '').split('\n').map(x => x.trim()).filter(Boolean);

        function editarBloco(id) {
            const r = achar(id); if (!r) return;
            const b = r.b;
            const F = (titulo, campos, valores, aoSalvar, extra) => abrirForm(Object.assign({ titulo, campos, valores, aoSalvar: v => aplicarForm(id, x => aoSalvar(x, v)) }, extra || {}));
            const MARC = 'Marcação: **negrito**, *itálico*, {nome}, {{termo}}, [[pendência]].';
            switch (b.tipo) {
                case 'titulo': return F('Título', [{ k: 'texto', rotulo: 'Texto' }, { k: 'nivel', rotulo: 'Nível', tipo: 'select', opcoes: [['3', 'Subseção (5.1, 2.1…)'], ['4', 'Item dentro da subseção']] }, { k: 'ancora', rotulo: 'Âncora (liga ao Mapa de Domínios e ao online)', ajuda: 'Ex.: wais, ravlt. Deixe como está se não souber.' }],
                    { texto: b.texto, nivel: String(b.nivel || 3), ancora: b.ancora || '' }, (x, v) => { x.texto = v.texto; x.nivel = Number(v.nivel); x.ancora = C().slug(v.ancora) || null; });
                case 'paragrafo': case 'meta': case 'nota': case 'padrao':
                    return F('Editar marcação', [{ k: 'texto', rotulo: 'Texto', tipo: 'area', linhas: 8, ajuda: MARC }], { texto: b.texto }, (x, v) => { x.texto = v.texto.trim(); }, { largo: true });
                case 'alerta': return F('Alerta', [{ k: 'texto', rotulo: 'Texto', tipo: 'area', ajuda: MARC }, { k: 'nivel', rotulo: 'Cor', tipo: 'select', opcoes: [['ambar', 'Âmbar'], ['vermelho', 'Vermelho']] }], { texto: b.texto, nivel: b.nivel || 'ambar' }, (x, v) => { x.texto = v.texto.trim(); x.nivel = v.nivel; });
                case 'lista': return F('Lista', [{ k: 'estilo', rotulo: 'Tipo', tipo: 'select', opcoes: [['numerada', 'Numerada'], ['marcadores', 'Marcadores']] }, { k: 'itens', rotulo: 'Itens (um por linha)', tipo: 'area', linhas: 8, ajuda: MARC }],
                    { estilo: b.estilo || 'numerada', itens: linhasTxt(b.itens) }, (x, v) => { x.estilo = v.estilo; x.itens = txtLinhas(v.itens); }, { largo: true });
                case 'caixa': return F('Caixa', [{ k: 'titulo', rotulo: 'Título (opcional)' }, { k: 'estilo', rotulo: 'Cor', tipo: 'select', opcoes: [['azul', 'Azul'], ['ambar', 'Âmbar'], ['neutro', 'Neutra']] }, { k: 'paragrafos', rotulo: 'Parágrafos (separe com uma linha em branco)', tipo: 'area', linhas: 8 }],
                    { titulo: b.titulo || '', estilo: b.estilo || 'azul', paragrafos: (b.paragrafos || []).join('\n\n') }, (x, v) => { x.titulo = v.titulo.trim(); x.estilo = v.estilo; x.paragrafos = v.paragrafos.split(/\n{2,}/).map(p => p.trim()).filter(Boolean); }, { largo: true });
                case 'fidedignidade': return F('Fidedignidade', [{ k: 'paragrafos', rotulo: 'Parágrafos (separe com uma linha em branco)', tipo: 'area', linhas: 8 }],
                    { paragrafos: (b.paragrafos || []).join('\n\n') }, (x, v) => { x.paragrafos = v.paragrafos.split(/\n{2,}/).map(p => p.trim()).filter(Boolean); }, { largo: true });
                case 'campos': return F('Identificação', [{ k: 'linhas', rotulo: 'Campos', tipo: 'linhas', colunas: [{ k: 'rotulo', rotulo: 'Rótulo' }, { k: 'valor', rotulo: 'Valor', tipo: 'area' }] }],
                    { linhas: b.linhas || [] }, (x, v) => { x.linhas = v.linhas; }, { largo: true, texto: 'Data de nascimento e profissional responsável entram sozinhos na Seção 1.' });
                case 'tabela_instrumentos': return F('Instrumentos', [{ k: 'linhas', rotulo: 'Instrumentos', tipo: 'linhas', colunas: [{ k: 'sigla', rotulo: 'Sigla' }, { k: 'nome', rotulo: 'Nome' }, { k: 'dominio', rotulo: 'Domínio' }, { k: 'status', rotulo: 'Status', tipo: 'select', opcoes: [['fundamental', 'Fundamental'], ['a_confirmar', 'A confirmar'], ['complementar', 'Complementar (†)'], ['sem_peso', 'Sem peso (‡)']] }] }],
                    { linhas: b.linhas || [] }, (x, v) => { x.linhas = v.linhas; }, { largo: true });
                case 'hipotese': return F('Hipótese', [
                    { k: 'rotulo', rotulo: 'Tipo', tipo: 'select', opcoes: [['principal', 'Principal'], ['secundaria', 'Secundária'], ['investigar', 'A investigar']] },
                    { k: 'nome', rotulo: 'Nome', obrigatorio: true }, { k: 'codigos', rotulo: 'Códigos (separe com |)', ajuda: 'Ex.: CID-11: 6A05.0 | DSM-5-TR: F90.0' },
                    { k: 'confianca', rotulo: 'Nível de confiança', tipo: 'select', opcoes: [['', '—'], ['ALTA', 'Alta'], ['MODERADA', 'Moderada'], ['BAIXA', 'Baixa'], ['INSUFICIENTE', 'Insuficiente']] },
                    { k: 'criterios', rotulo: 'Critérios', tipo: 'area' }, { k: 'evidencias', rotulo: 'Evidências', tipo: 'area' }, { k: 'contraponto', rotulo: 'Contraponto', tipo: 'area' }, { k: 'acao', rotulo: 'Ação', tipo: 'area' }],
                    { rotulo: b.rotulo || 'principal', nome: b.nome, codigos: (Array.isArray(b.codigos) ? b.codigos : [b.codigos]).filter(Boolean).join(' | '), confianca: b.confianca || '', criterios: b.criterios || '', evidencias: b.evidencias || '', contraponto: b.contraponto || '', acao: b.acao || '' },
                    (x, v) => { Object.assign(x, { rotulo: v.rotulo, nome: v.nome.trim(), codigos: v.codigos.split('|').map(s => s.trim()).filter(Boolean), confianca: v.confianca || null, criterios: v.criterios.trim(), evidencias: v.evidencias.trim(), contraponto: v.contraponto.trim(), acao: v.acao.trim() }); }, { largo: true });
                case 'afastada': return F('Hipótese afastada', [{ k: 'condicao', rotulo: 'Condição', obrigatorio: true }, { k: 'motivo', rotulo: 'Motivo', tipo: 'area' }, { k: 'fonte', rotulo: 'Fonte' }],
                    { condicao: b.condicao, motivo: b.motivo, fonte: b.fonte }, (x, v) => { x.condicao = v.condicao.trim(); x.motivo = v.motivo.trim(); x.fonte = v.fonte.trim(); });
                case 'mapa': return F('Mapa de Domínios', [{ k: 'linhas', rotulo: 'Domínios', tipo: 'linhas', colunas: [
                    { k: 'status', rotulo: 'Status', tipo: 'select', opcoes: [['preservado', '🟢 Preservado'], ['atencao', '🟡 Atenção'], ['comprometido', '🔴 Comprometido']] },
                    { k: 'dominio', rotulo: 'Domínio' }, { k: 'desempenho', rotulo: 'Desempenho', tipo: 'area' }, { k: 'instrumentos', rotulo: 'Instrumentos' }, { k: 'ancora', rotulo: 'Âncora' }] }],
                    { linhas: b.linhas || [] }, (x, v) => { x.linhas = v.linhas.map(l => Object.assign(l, { ancora: l.ancora || null })); }, { largo: true });
                case 'tabela': return editarTabela(C().clonar(b), nb => aplicarForm(id, x => {
                    x.cabecalho = nb.cabecalho; x.linhas = nb.linhas; x.nota = nb.nota;
                    if (nb.colorir) x.colorir = nb.colorir; else delete x.colorir;
                    if (nb.estilo_classif) x.estilo_classif = nb.estilo_classif; else delete x.estilo_classif;
                }));
                case 'referencias': return F('Referências', [{ k: 'itens', rotulo: 'Uma referência por linha (APA)', tipo: 'area', linhas: 12, ajuda: MARC }], { itens: linhasTxt(b.itens) }, (x, v) => { x.itens = txtLinhas(v.itens); }, { largo: true });
                case 'resultado': return escolherResultado(b);
                case 'imagem': return escolherImagem(null, b);
                case 'espaco': return F('Espaço', [{ k: 'altura', rotulo: 'Altura', tipo: 'select', opcoes: [['p', 'Pequeno'], ['m', 'Médio'], ['g', 'Grande']] }], { altura: b.altura || 'm' }, (x, v) => { x.altura = v.altura; });
                case 'local_data': return F('Local e data', [{ k: 'cidade', rotulo: 'Cidade' }], { cidade: b.cidade || '' }, (x, v) => { x.cidade = v.cidade.trim(); }, { texto: 'A data é a data de emissão do laudo.' });
                case 'assinatura': return F('Assinatura', [{ k: 'nome', rotulo: 'Nome' }, { k: 'registro', rotulo: 'Registro' }, { k: 'mostrar_logo', rotulo: 'Mostrar o logo abaixo', tipo: 'check' }],
                    { nome: b.nome, registro: b.registro, mostrar_logo: b.mostrar_logo !== false }, (x, v) => { x.nome = v.nome.trim(); x.registro = v.registro.trim(); x.mostrar_logo = v.mostrar_logo; });
                case 'convite': return F('Convite', [{ k: 'texto', rotulo: 'Texto', tipo: 'area' }, { k: 'link', rotulo: 'Link do QR' }], { texto: b.texto, link: b.link || '' }, (x, v) => { x.texto = v.texto.trim(); x.link = v.link.trim(); });
                case 'acompanhe': return F('Acompanhe este paciente', [{ k: 'texto', rotulo: 'Texto', tipo: 'area', linhas: 6 }], { texto: b.texto }, (x, v) => { x.texto = v.texto.trim(); });
            }
        }

        function editarTabela(b, aoAplicar) {
            // Grade editável: cada célula guarda o texto e as marcas de cor ({sup}, {cor:#1F4E79}, {bg:#…}, {b}).
            // Seleção de várias células: arrastar, Shift+clique (intervalo), Ctrl+clique, ▸ linha, ▾ coluna ou "Tudo".
            const cab = (b.cabecalho || []).slice();
            let grade = (b.linhas || []).map(l => l.map(c => C().lerCelula(c)));
            const ncol = () => Math.max(cab.length, ...grade.map(l => l.length), 1);
            const igualar = () => { const n = ncol(); while (cab.length < n) cab.push(''); grade.forEach(l => { while (l.length < n) l.push(C().lerCelula('')); }); };
            igualar(); if (!grade.length) grade.push(cab.map(() => C().lerCelula('')));
            let colorir = Array.isArray(b.colorir) ? b.colorir.slice() : null;      // null = automático pelo título da coluna
            let estilo = b.estilo_classif || 'fundo';
            let sel = new Set(), ancora = null, arrastando = false;
            const chave = (r, k) => r + ',' + k;
            const PADRAO = C().CORES_PADRAO;                                         // #2E75B6 · #1F4E79 · #1F3864
            const CORES = [['', 'Padrão (preto)', '#0F172A']].concat(PADRAO.map((c, n) => [c, 'Azul do padrão ' + (n + 1) + ' (' + c + ')', c]),
                [['verde', 'Verde', '#15803D'], ['azul', 'Azul', '#1D4ED8'], ['ambar', 'Amarelo', '#A16207'], ['laranja', 'Laranja', '#C2410C'], ['vermelho', 'Vermelho', '#B91C1C'], ['roxo', 'Roxo', '#6D28D9'], ['cinza', 'Cinza', '#64748B'], ['#FFFFFF', 'Branco', '#FFFFFF']]);
            const FUNDOS = [['', 'Automático'], ['sup', 'Superior'], ['med', 'Médio'], ['mi', 'Médio inferior'], ['inf', 'Inferior'], ['neutro', 'Sem cor']];
            const m = modal(`
                <h2>Tabela</h2>
                <p>Selecione uma ou várias células e escolha a cor. Para várias: <b>arraste</b>, use <b>Shift</b> (intervalo) ou <b>Ctrl</b> (uma a uma), ou clique em ▸ (linha), ▾ (coluna) ou Tudo.</p>
                <div class="ed-tab-barra">
                    <div><span>Cor do texto</span>${CORES.map(c => `<button type="button" class="ed-cor${c[2] === '#FFFFFF' ? ' branco' : ''}" data-cor="${c[0]}" title="${c[1]}" style="--c:${c[2]}">A</button>`).join('')}
                        <label class="ed-cor livre" title="Outra cor do texto"><input type="color" id="et-cor-livre" value="#2E75B6">🎨</label>
                        <button type="button" class="ed-cor neg" data-neg="1" title="Negrito"><b>N</b></button></div>
                    <div><span>Fundo da célula</span>${FUNDOS.map(f => `<button type="button" class="ed-fundo ${f[0] ? 'cl-' + f[0] : 'auto'}" data-fundo="${f[0]}">${f[1]}</button>`).join('')}
                        ${PADRAO.map(c => `<button type="button" class="ed-bg" data-bg="${c}" title="Fundo ${c} (texto branco)" style="background:${c}"></button>`).join('')}
                        <label class="ed-bg livre" title="Outra cor de fundo"><input type="color" id="et-bg-livre" value="#DEEAF6">🎨</label></div>
                    <div class="ed-tab-selinfo"><span id="et-selinfo">Nenhuma célula selecionada</span><button type="button" class="lo-btn sec" id="et-tudo">Tudo</button><button type="button" class="lo-btn sec" id="et-limpar">Tirar as cores da seleção</button></div>
                </div>
                <div class="ed-tab-wrap"><table class="ed-tab-grade" id="et-grade"></table></div>
                <div class="ed-tab-acoes"><button type="button" class="lo-btn sec" id="et-lin">+ Linha</button><button type="button" class="lo-btn sec" id="et-col">+ Coluna</button></div>
                <div class="ed-tab-op">
                    <div><b>Classificação colorida</b> — colunas pintadas pelo texto (Superior, Médio, Inferior…):<div id="et-cols"></div></div>
                    <label>Estilo<select id="et-estilo"><option value="fundo">Célula colorida (como no laudo)</option><option value="selo">Selo arredondado</option></select></label>
                </div>
                <label class="ed-campo">Nota abaixo da tabela (opcional)<input id="et-nota" type="text" value="${esc(b.nota || '')}"></label>
                <p class="ed-tab-tit">Prévia</p><div class="imp ed-tab-previa" id="et-previa"></div>
                <div class="lo-modal-acoes"><button class="btn btn-secondary" data-fechar>Cancelar</button><button class="btn btn-primary" id="et-ok">Aplicar</button></div>`, 'largo ed-tab-modal');
            const $ = id => m.querySelector('#' + id);
            const blocoAtual = () => ({ cabecalho: cab.slice(), linhas: grade.map(l => l.map(C().escreverCelula)), colorir: colorir === null ? undefined : colorir.slice(), estilo_classif: estilo === 'fundo' ? undefined : estilo, nota: $('et-nota').value.trim() || null });
            const autoCols = () => C().colunasColoridas({ cabecalho: cab });
            const colsAtivas = () => colorir === null ? autoCols() : colorir;
            const pintarTd = (td, r, k) => {
                const c = C().celulaTabela({ cabecalho: cab, colorir: colsAtivas() }, C().escreverCelula(grade[r][k]), k);
                td.className = (c.fundo ? 'cl-' + c.fundo : '') + (sel.has(chave(r, k)) ? ' sel' : '');
                td.style.background = c.bg || '';
                const inp = td.querySelector('input'); if (inp) inp.setAttribute('style', (c.css || '').replace(/background:[^;]+;?/, ''));
            };
            function marcarSelecao() {
                m.querySelectorAll('#et-grade td[data-r]').forEach(td => td.classList.toggle('sel', sel.has(chave(td.dataset.r, td.dataset.k))));
                $('et-selinfo').textContent = sel.size === 0 ? 'Nenhuma célula selecionada' : sel.size === 1 ? '1 célula selecionada' : `${sel.size} células selecionadas`;
            }
            function desenharGrade() {
                $('et-grade').innerHTML = `<thead><tr><th class="ed-tab-canto"></th>${cab.map((h, k) => `<th><button type="button" class="ed-selcol" data-selcol="${k}" title="Selecionar a coluna">▾</button><input data-h="${k}" value="${esc(h)}" placeholder="Coluna ${k + 1}"><button type="button" class="ed-x" data-xcol="${k}" title="Tirar esta coluna">✕</button></th>`).join('')}<th></th></tr></thead>
                    <tbody>${grade.map((l, r) => `<tr><td class="ed-tab-canto"><button type="button" class="ed-sellin" data-sellin="${r}" title="Selecionar a linha">▸</button></td>${l.map((c, k) => `<td data-r="${r}" data-k="${k}"><input data-r="${r}" data-k="${k}" value="${esc(c.texto)}"></td>`).join('')}<td><button type="button" class="ed-x" data-xlin="${r}" title="Tirar esta linha">✕</button></td></tr>`).join('')}</tbody>`;
                m.querySelectorAll('#et-grade td[data-r]').forEach(td => pintarTd(td, Number(td.dataset.r), Number(td.dataset.k)));
                marcarSelecao();
                const ativas = colsAtivas();
                $('et-cols').innerHTML = cab.map((h, k) => `<label class="chk"><input type="checkbox" data-cc="${k}" ${ativas.includes(k) ? 'checked' : ''}> ${esc(h || 'Coluna ' + (k + 1))}</label>`).join('') || '<em>—</em>';
            }
            function previa() {
                const t = blocoAtual();
                $('et-previa').innerHTML = `<table class="i-tab"><thead><tr>${t.cabecalho.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${t.linhas.map(l => `<tr>${l.map((x, k) => {
                    const c = C().celulaTabela(t, x, k), st = c.css ? ` style="${c.css}"` : '';
                    return c.selo ? `<td><span class="cl-selo cl-${c.fundo}"${st}>${esc(c.texto)}</span></td>` : `<td${c.fundo ? ` class="cl cl-${c.fundo}"` : ''}${st}>${esc(c.texto)}</td>`;
                }).join('')}</tr>`).join('')}</tbody></table>${t.nota ? `<p class="i-nota">${esc(t.nota)}</p>` : ''}`;
            }
            const tudo = () => { desenharGrade(); previa(); };
            const intervalo = (a, z) => { const s2 = new Set(); for (let r = Math.min(a[0], z[0]); r <= Math.max(a[0], z[0]); r++) for (let k = Math.min(a[1], z[1]); k <= Math.max(a[1], z[1]); k++) s2.add(chave(r, k)); return s2; };
            function aplicar(mudar) {
                if (!sel.size) { toast('Selecione primeiro uma ou mais células da tabela.', 'info'); return; }
                sel.forEach(x => { const [r, k] = x.split(',').map(Number); if (grade[r] && grade[r][k]) mudar(grade[r][k]); });
                m.querySelectorAll('#et-grade td[data-r]').forEach(td => pintarTd(td, Number(td.dataset.r), Number(td.dataset.k)));
                previa();
            }
            $('et-estilo').value = estilo;
            tudo();
            // seleção: clique, Shift, Ctrl e arrastar
            m.addEventListener('mousedown', ev => {
                if (ev.target.closest('.ed-cor:not(.livre), .ed-fundo, .ed-bg:not(.livre)')) { ev.preventDefault(); return; }   // não tira o foco
                const td = ev.target.closest('#et-grade td[data-r]'); if (!td) return;
                const p = [Number(td.dataset.r), Number(td.dataset.k)];
                if (ev.shiftKey && ancora) { sel = intervalo(ancora, p); ev.preventDefault(); }
                else if (ev.ctrlKey || ev.metaKey) { const x = chave(p[0], p[1]); if (sel.has(x)) sel.delete(x); else sel.add(x); ancora = p; ev.preventDefault(); }
                else { sel = new Set([chave(p[0], p[1])]); ancora = p; arrastando = true; }
                marcarSelecao();
            });
            m.addEventListener('mouseover', ev => {
                if (!arrastando || !ancora) return;
                const td = ev.target.closest('#et-grade td[data-r]'); if (!td) return;
                const p = [Number(td.dataset.r), Number(td.dataset.k)];
                if (p[0] !== ancora[0] || p[1] !== ancora[1]) { sel = intervalo(ancora, p); marcarSelecao(); if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); }
            });
            const soltar = () => { arrastando = false; };
            document.addEventListener('mouseup', soltar);
            new MutationObserver((_, ob) => { if (!document.body.contains(m)) { document.removeEventListener('mouseup', soltar); ob.disconnect(); } }).observe(document.body, { childList: true });
            m.addEventListener('input', ev => {
                const i = ev.target;
                if (i.dataset.h != null) { cab[Number(i.dataset.h)] = i.value; if (colorir === null) { const a = autoCols(); m.querySelectorAll('[data-cc]').forEach(x => { x.checked = a.includes(Number(x.dataset.cc)); }); m.querySelectorAll('#et-grade td[data-r]').forEach(td => pintarTd(td, Number(td.dataset.r), Number(td.dataset.k))); } previa(); return; }
                if (i.dataset.r != null) { const r = Number(i.dataset.r), k = Number(i.dataset.k); grade[r][k].texto = i.value; pintarTd(i.parentElement, r, k); previa(); return; }
                if (i.id === 'et-nota') previa();
            });
            m.addEventListener('change', ev => {
                const i = ev.target;
                if (i.dataset.cc != null) { colorir = [...m.querySelectorAll('[data-cc]:checked')].map(x => Number(x.dataset.cc)); tudo(); }
                if (i.id === 'et-estilo') { estilo = i.value; previa(); }
                if (i.id === 'et-cor-livre') aplicar(c => { c.cor = i.value.toUpperCase(); });
                if (i.id === 'et-bg-livre') aplicar(c => { c.bg = i.value.toUpperCase(); c.fundo = null; });
            });
            m.addEventListener('click', ev => {
                const t = ev.target.closest('button'); if (!t) return;
                if (t.dataset.xcol != null) { if (cab.length <= 1) return; const k = Number(t.dataset.xcol); cab.splice(k, 1); grade.forEach(l => l.splice(k, 1)); if (colorir) colorir = colorir.filter(x => x !== k).map(x => x > k ? x - 1 : x); sel = new Set(); tudo(); return; }
                if (t.dataset.xlin != null) { if (grade.length <= 1) return; grade.splice(Number(t.dataset.xlin), 1); sel = new Set(); tudo(); return; }
                if (t.id === 'et-lin') { grade.push(cab.map(() => C().lerCelula(''))); tudo(); return; }
                if (t.id === 'et-col') { cab.push(''); grade.forEach(l => l.push(C().lerCelula(''))); tudo(); return; }
                if (t.dataset.sellin != null) { const r = Number(t.dataset.sellin); sel = new Set(cab.map((_, k) => chave(r, k))); ancora = [r, 0]; marcarSelecao(); return; }
                if (t.dataset.selcol != null) { const k = Number(t.dataset.selcol); sel = new Set(grade.map((_, r) => chave(r, k))); ancora = [0, k]; marcarSelecao(); return; }
                if (t.id === 'et-tudo') { sel = intervalo([0, 0], [grade.length - 1, cab.length - 1]); ancora = [0, 0]; marcarSelecao(); return; }
                if (t.id === 'et-limpar') return aplicar(c => { c.cor = null; c.bg = null; c.fundo = null; c.negrito = false; });
                if (t.dataset.cor != null) return aplicar(c => { c.cor = t.dataset.cor || null; });
                if (t.dataset.neg) { const todos = [...sel].every(x => { const [r, k] = x.split(',').map(Number); return grade[r][k].negrito; }); return aplicar(c => { c.negrito = !todos; }); }
                if (t.dataset.fundo != null) return aplicar(c => { c.fundo = t.dataset.fundo || null; c.bg = null; });
                if (t.dataset.bg) return aplicar(c => { c.bg = t.dataset.bg; c.fundo = null; if (!c.cor) c.cor = '#FFFFFF'; });
            });
            $('et-ok').addEventListener('click', () => {
                const t = blocoAtual();
                m.remove();
                aoAplicar(Object.assign(b, t, { colorir: t.colorir, estilo_classif: t.estilo_classif }));
            });
        }

        function editarComplementos(b) {
            abrirForm({
                titulo: 'Anotações do online', largo: true,
                texto: 'Aparecem só na página online, ao clicar no bloco, para todos que a abrem — inclusive paciente e família quando liberada no portal.',
                campos: [{ k: 'complementos', rotulo: 'Anotações', tipo: 'linhas', colunas: [{ k: 'titulo', rotulo: 'Título' }, { k: 'texto', rotulo: 'Texto', tipo: 'area' }] }],
                valores: { complementos: b.complementos || [] },
                aoSalvar: v => aplicarForm(b.id, x => { x.complementos = v.complementos; })
            });
        }
        function editarNota(b) {
            abrirForm({
                titulo: 'Nota interna', texto: 'Só para você. Nunca aparece na impressão, no online, no portal ou no acesso externo.',
                campos: [{ k: 'nota', rotulo: 'Nota', tipo: 'area', linhas: 5 }], valores: { nota: b.nota_interna || '' },
                aoSalvar: v => aplicarForm(b.id, x => { x.nota_interna = v.nota.trim() || null; })
            });
        }

        // ── ver mudanças (diferença por palavra) ──────────────────────────────
        function palavras(t) { return String(t || '').split(/(\s+)/).filter(x => x !== ''); }
        function diffHtml(a, b) {
            const A = palavras(a), B = palavras(b);
            const n = A.length, m = B.length;
            if (n * m > 400000) return `<p><b>Antes:</b> ${esc(a)}</p><p><b>Agora:</b> ${esc(b)}</p>`;
            const L = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
            for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
            let i = 0, j = 0, out = '';
            while (i < n && j < m) {
                if (A[i] === B[j]) { out += esc(A[i]); i++; j++; }
                else if (L[i + 1][j] >= L[i][j + 1]) { out += `<del>${esc(A[i])}</del>`; i++; }
                else { out += `<ins>${esc(B[j])}</ins>`; j++; }
            }
            while (i < n) out += `<del>${esc(A[i++])}</del>`;
            while (j < m) out += `<ins>${esc(B[j++])}</ins>`;
            return out;
        }
        function verMudancas(antes, agora, titulos) {
            const ctx = ctxPac();
            const ta = C().plano(C().textos(antes).join('\n'), ctx), tb = C().plano(C().textos(agora).join('\n'), ctx);
            modal(`<h2>${esc((titulos || ['Mudanças neste bloco'])[0])}</h2><p>${esc((titulos || [])[1] || 'Riscado em vermelho = saiu do original. Sublinhado em verde = entrou.')}</p>
                <div class="ed-diff">${ta === tb ? '<i>O texto é o mesmo; mudou só a estrutura ou as opções do bloco.</i>' : diffHtml(ta, tb)}</div>
                <div class="lo-modal-acoes"><button class="btn btn-primary" data-fechar>Fechar</button></div>`, 'largo');
        }

        // ── conflitos da reimportação ─────────────────────────────────────────
        function resolverConflito(id, escolha) {
            const r = achar(id); if (!r) return;
            const b = r.b;
            if (escolha === 'ver') { verMudancas(b, b._conflito.novo, ['O Gerador mudou este trecho', 'Riscado = a sua versão. Sublinhado = a versão nova do Gerador.']); return; }
            if (escolha === 'meu') { delete b._conflito; mudouEstrutura({ acao: 'aceitar', bloco_id: id, depois: { conflito: 'manter_meu' } }); return; }
            if (escolha === 'novo') {
                const layout = {}; ['oculto', 'quebra_antes', 'manter_com_proximo', 'dividir_tabela', 'exibir', 'complementos', 'nota_interna'].forEach(k => { if (k in b) layout[k] = b[k]; });
                const antes = C().clonar(b);
                r.sec.blocos[r.i] = Object.assign(C().clonar(b._conflito.novo), layout);
                mudouEstrutura({ acao: 'aceitar', bloco_id: id, antes, depois: { conflito: 'usar_novo' } });
                return;
            }
            if (escolha === 'ok') { delete b._fora_do_pacote; mudouEstrutura({ acao: 'aceitar', bloco_id: id, depois: { fora_do_pacote: 'manter' } }); return; }
            if (escolha === 'apagar') { delete b._fora_do_pacote; apagar(id, 'saiu_do_pacote'); }
        }

        // ── seções ────────────────────────────────────────────────────────────
        function acaoSecao(acao, id) {
            const secs = doc().secoes, i = secs.findIndex(s => s.id === id); if (i < 0) return;
            const s = secs[i];
            if (acao === 'subir' && i > 0) { secs.splice(i, 1); secs.splice(i - 1, 0, s); mudouEstrutura({ acao: 'mover', bloco_id: id, antes: { posicao: i } }); }
            else if (acao === 'descer' && i < secs.length - 1) { secs.splice(i, 1); secs.splice(i + 1, 0, s); mudouEstrutura({ acao: 'mover', bloco_id: id, antes: { posicao: i } }); }
            else if (acao === 'ocultar') { s.oculta = !s.oculta; mudouEstrutura({ acao: 'ocultar', bloco_id: id, depois: { oculta: s.oculta } }); }
            else if (acao === 'editar') editarSecao(id);
        }
        function editarSecao(id) {
            const s = id ? doc().secoes.find(x => x.id === id) : null;
            const CAP = [['', 'Padrão'], ['quem', 'Quem é'], ['historia', 'A história'], ['como', 'Como avaliamos'], ['achados', 'O que encontramos'], ['sintese', 'Como tudo se conecta'], ['mapa', 'Mapa de domínios'], ['hipoteses', 'Hipóteses'], ['conclusao', 'Conclusão'], ['passos', 'Próximos passos'], ['fim', 'Fechamento']];
            const campos = [{ k: 'n', rotulo: 'Número exibido', obrigatorio: true }, { k: 'titulo', rotulo: 'Título', obrigatorio: true },
                { k: 'capitulo_online', rotulo: 'Capítulo na página online', tipo: 'select', opcoes: CAP }, { k: 'quebra_antes', rotulo: 'Começar em página nova', tipo: 'check' }];
            abrirForm({
                titulo: s ? `Seção ${s.n}` : 'Nova seção', campos,
                valores: s ? { n: s.n, titulo: s.titulo, capitulo_online: s.capitulo_online || '', quebra_antes: !!s.quebra_antes } : { n: String(doc().secoes.length + 1), titulo: '', capitulo_online: '', quebra_antes: false },
                botao: s ? 'Aplicar' : 'Criar seção',
                aoSalvar: v => {
                    if (s) {
                        const antes = { n: s.n, titulo: s.titulo };
                        Object.assign(s, { n: v.n.trim(), titulo: v.titulo.trim().toUpperCase(), capitulo_online: v.capitulo_online || null, quebra_antes: v.quebra_antes });
                        mudouEstrutura({ acao: 'editar', bloco_id: s.id, antes, depois: { n: s.n, titulo: s.titulo } });
                        if (s.blocos && s.blocos.length && /^s\d+$/.test(s.id) === false) { /* seção manual: ids dos blocos ficam */ }
                    } else {
                        const nova = { id: 'sx-' + C().aleatorio(5), n: v.n.trim(), titulo: v.titulo.trim().toUpperCase(), oculta: false, quebra_antes: v.quebra_antes, capitulo_online: v.capitulo_online || null, blocos: [novoBloco('paragrafo', { texto: '' })] };
                        doc().secoes.push(nova);
                        mudouEstrutura({ acao: 'inserir', bloco_id: nova.id, depois: { secao: nova.titulo } }, { id: nova.blocos[0].id, inicio: true });
                    }
                }
            });
        }

        // Edição direto na folha da Impressão: o mesmo texto/marcação do editor,
        // a mesma gravação automática e o mesmo Ctrl+Z (uma rajada por pausa).
        function editarTexto(id, alterar) {
            const r = achar(id); if (!r || ed.morto) return false;
            if (!(r.b.id in ed.edicoes)) ed.edicoes[r.b.id] = textoAtual(r.b);
            if (Date.now() - ed.textoEm > 1200 || ed.textoBloco !== r.b.id) marco();
            ed.textoEm = Date.now(); ed.textoBloco = r.b.id; ed.digitouEm = Date.now();
            alterar(r.b);
            agendar();
            return true;
        }

        return {
            documentoHtml, arvoreHtml, lixeiraHtml, statusHtml, ligar, ligarLixeira, gravar,
            paraHtml: t => inlineEdicao(t, ctxPac()), paraTexto: no => paraMarcacao(no), editarTexto,
            // a barra de cada trecho na aba Impressão usa as mesmas ações do editor
            acaoBloco, menuInserir, editarSecao, temForm: tipo => COM_FORM.includes(tipo),
            tem: () => ed.pendente || ed.gravando,
            reimportado: () => mudouEstrutura(null),
            sincronizar, marcarSalvo, desligar, marco, desfazer, refazer: refazerUltimo
        };
    }

    window.LaudoEditor = { criar };
})();

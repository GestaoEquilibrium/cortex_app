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
        ['caixa', '▭', 'Caixa'], ['alerta', '⚠', 'Alerta'], ['resultado', '📊', 'Resultado de teste'], ['imagem', '🖼', 'Imagem'],
        ['quebra_pagina', '⤓', 'Quebra de página'], ['espaco', '↕', 'Espaço'], ['padrao', '📄', 'Texto padrão do modelo']
    ];
    const ONDE = { ambos: 'Impressão e online', impressao: 'Só na impressão', online: 'Só no online' };

    function criar(pg) {
        const st = pg.estado;
        const sb = () => window.cortexClient;
        const toast = pg.toast;
        const ed = {
            pendente: false, gravando: false, timer: null, eventos: [], edicoes: {},
            status: 'salvo', erro: null, urlsImg: {}, modeloCache: null
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
        function registrar(ev) { ed.eventos.push(ev); agendar(); }
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
            try {
                const { data, error } = await sb().rpc('laudo_online_salvar', {
                    p_id: st.laudo.id, p_revisao: st.laudo.revisao, p_documento: doc(), p_eventos: eventos
                });
                if (error) throw error;
                if (!data || !data.ok) {
                    ed.status = 'conflito'; ed.erro = (data && data.mensagem) || 'Não consegui gravar.';
                    ed.eventos = eventos.concat(ed.eventos); Object.assign(ed.edicoes, edicoes); ed.pendente = true;
                    atualizarStatus();
                    return;
                }
                st.laudo.revisao = data.revisao;
                st.laudo.documento = doc();
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
                if (ed.pendente && ed.status === 'pendente') agendar();
            }
        }
        function statusHtml() {
            const t = {
                salvo: ['ok', '✓ Salvo'], pendente: ['amb', '● Alterações não salvas'], gravando: ['amb', '↻ Salvando…'],
                erro: ['err', '⚠ Não salvou — tentando de novo'], conflito: ['err', '⚠ Alterado em outra janela']
            }[ed.status] || ['ok', ''];
            return `<span class="ed-status ${t[0]}" id="ed-status" title="${esc(ed.erro || '')}">${t[1]}${ed.status === 'conflito' ? ' <button class="ed-link" id="ed-recarregar">Recarregar</button>' : ''}</span>`;
        }
        function atualizarStatus() {
            const el = document.getElementById('ed-status');
            if (el) { el.outerHTML = statusHtml(); const b = document.getElementById('ed-recarregar'); if (b) b.addEventListener('click', () => location.reload()); }
        }
        window.addEventListener('beforeunload', ev => { if (ed.pendente || ed.gravando) { gravar(); ev.preventDefault(); ev.returnValue = ''; } });

        function mudouEstrutura(ev, manterFoco) {
            if (ev) registrar(ev);
            const y = window.scrollY;
            pg.render();
            window.scrollTo(0, y);
            if (manterFoco) focar(manterFoco.id, manterFoco.inicio);
        }

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
                case 'imagem': escolherImagem(b => colocar(b)); break;
                case 'padrao': escolherPadrao(b => colocar(b)); break;
            }
        }

        // ── resultado: escolher teste e vista, com prévia ─────────────────────
        function escolherResultado(existente, aoInserir) {
            // testes do CORTEX e escalas com leitura (LO-6); apelidos ("SRS-2") ficam de fora para não repetir
            const disponiveis = Object.keys(st.banco.resultados || {}).filter(s => {
                const r = st.banco.resultados[s];
                return C().SIGLAS_DO_CORTEX.includes(s) || (r && r.tipo === 'escala' && !r.erro && !r.apelido_de);
            });
            // testes com figuras capturadas da tela de correção (inclusive os sem leitura de números)
            Object.keys(st.doc.figuras || {}).forEach(s => { if (!disponiveis.includes(s)) disponiveis.push(s); });
            // todo teste corrigido no CORTEX entra, nem que seja só com o cabeçalho
            (st.banco.aplicacoes || []).forEach(a => {
                const r = (st.banco.resultados || {})[a.sigla];
                if (a.corrigida && !disponiveis.includes(a.sigla) && !(r && r.apelido_de)) disponiveis.push(a.sigla);
            });
            if (!disponiveis.length) { toast('Nenhum teste corrigido no CORTEX para este paciente.', 'info'); return; }
            const atual = existente ? C().clonar(existente) : novoBloco('resultado', { sigla: disponiveis[0], vista: C().vistasDe(disponiveis[0])[0], opcoes: {} });
            atual.opcoes = atual.opcoes || {};
            const m = modal(`
                <h2>${existente ? 'Trocar vista do resultado' : 'Inserir resultado de teste'}</h2>
                <p>Os números vêm do banco. Escolha o teste, o desenho e as opções; a prévia mostra como fica.</p>
                <div class="ed-res-grade">
                    <div class="ed-res-op">
                        <label>Teste<select id="er-sigla">${disponiveis.map(s => `<option ${s === atual.sigla ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></label>
                        <label>Desenho<select id="er-vista"></select></label>
                        <label id="er-indice-l">Índice<select id="er-indice">${['ICV', 'IOP', 'IMO', 'IVP'].map(k => `<option>${k}</option>`).join('')}</select></label>
                        <label id="er-fator-l">Fator<select id="er-fator"><option value="">Todos</option>${['N', 'E', 'S', 'R', 'A'].map(k => `<option value="${k}">${C().FATORES_BFP[k]}</option>`).join('')}</select></label>
                        <label>Largura<select id="er-largura"><option value="inteira">Inteira</option><option value="metade">Metade (dois lado a lado)</option></select></label>
                        <label class="chk"><input type="checkbox" id="er-semcab"> Sem a faixa azul do teste</label>
                        <label>Legenda (opcional)<input id="er-legenda" type="text"></label>
                    </div>
                    <div class="ed-res-previa imp" id="er-previa"></div>
                </div>
                <div class="lo-modal-acoes"><button class="btn btn-secondary" data-fechar>Cancelar</button><button class="btn btn-primary" id="er-ok">${existente ? 'Aplicar' : 'Inserir'}</button></div>`, 'largo');
            const $ = id => m.querySelector('#' + id);
            const NOMES = { indice: 'Cartão de um índice', qit_icg: 'QIT e ICG', perfil_subtestes: 'Perfil de subtestes', intervalos: 'Intervalos de confiança', discrepancias: 'Discrepâncias', tabela_subtestes: 'Tabela de subtestes', resumo: 'Resumo em uma linha', cartao: 'Cartão completo', cabecalho: 'Só o cabeçalho', curva: 'Curva', tabela: 'Tabela', barras: 'Barras', fatores: 'Fatores', facetas: 'Facetas', regua: 'Régua de gravidade', subescalas: 'Subescalas' };
            function encherVistas() {
                const sig = $('er-sigla').value;
                const R = (st.banco.resultados || {})[sig];
                const temDados = !!(R && !R.erro);
                const vs = temDados ? C().vistasDe(sig).filter(v => v !== 'figura') : ['cabecalho'];
                const F = (st.doc.figuras || {})[sig];
                const figs = F ? (F.blocos || []) : [];
                const temCabFig = figs.some(f => f.chave === 'cabecalho');
                const atualV = atual.vista === 'figura' ? 'fig:' + ((atual.opcoes || {}).figura || '') : atual.vista;
                const opt = (v, rot) => `<option value="${esc(v)}" ${v === atualV ? 'selected' : ''}>${esc(rot)}</option>`;
                // sempre há um "Só o cabeçalho": o da tela de correção quando foi capturado, senão o desenhado aqui
                const topo = temCabFig ? '' : opt('cabecalho', 'Só o cabeçalho');
                const vsD = temCabFig ? vs : vs.filter(v => v !== 'cabecalho');
                const gDesenho = vsD.length ? `<optgroup label="Desenho do Laudo Online">${vsD.map(v => opt(v, v === 'cabecalho' ? 'Só o cabeçalho (desenho)' : (NOMES[v] || v))).join('')}</optgroup>` : '';
                const gFigura = figs.length ? `<optgroup label="Igual à tela de correção">${figs.map(f => opt('fig:' + f.chave, f.chave === 'cabecalho' ? 'Só o cabeçalho' : f.titulo)).join('')}</optgroup>` : '';
                // escalas e demais testes: a figura da tela de correção vem primeiro
                $('er-vista').innerHTML = topo + (C().SIGLAS_DO_CORTEX.includes(sig) ? gDesenho + gFigura : gFigura + gDesenho);
                if (!$('er-vista').value && $('er-vista').options.length) $('er-vista').selectedIndex = 0;
            }
            function ler() {
                atual.sigla = $('er-sigla').value;
                const vv = $('er-vista').value || '';
                atual.vista = vv.startsWith('fig:') ? 'figura' : vv;
                const op = {};
                if (vv.startsWith('fig:')) op.figura = vv.slice(4);
                if (atual.vista === 'indice') op.indice = $('er-indice').value;
                if (atual.vista === 'facetas' && $('er-fator').value) op.fator = $('er-fator').value;
                if ($('er-largura').value === 'metade') op.largura = 'metade';
                if ($('er-semcab').checked) op.sem_cabecalho = true;
                if ($('er-legenda').value.trim()) op.legenda = $('er-legenda').value.trim();
                const resto = Object.assign({}, atual.opcoes); ['indice', 'fator', 'largura', 'sem_cabecalho', 'legenda', 'figura', 'figuras'].forEach(k => delete resto[k]);
                atual.opcoes = Object.assign(resto, op);
            }
            function previa() {
                ler();
                $('er-indice-l').hidden = atual.vista !== 'indice';
                $('er-fator-l').hidden = atual.vista !== 'facetas';
                $('er-previa').innerHTML = window.LaudoGraf.render(atual, st.banco, { glossario: st.glossario });
            }
            encherVistas();
            if (atual.opcoes.indice) $('er-indice').value = atual.opcoes.indice;
            if (atual.opcoes.fator) $('er-fator').value = atual.opcoes.fator;
            if (atual.opcoes.largura === 'metade') $('er-largura').value = 'metade';
            $('er-semcab').checked = !!atual.opcoes.sem_cabecalho;
            $('er-legenda').value = atual.opcoes.legenda || '';
            $('er-sigla').addEventListener('change', () => { atual.vista = ''; atual.opcoes = {}; encherVistas(); previa(); });
            ['er-vista', 'er-indice', 'er-fator', 'er-largura', 'er-semcab'].forEach(id => $(id).addEventListener('change', previa));
            $('er-legenda').addEventListener('input', previa);
            previa();
            $('er-ok').addEventListener('click', () => {
                ler(); m.remove();
                if (existente) {
                    const r = achar(existente.id);
                    const antes = C().clonar(r.b);
                    Object.assign(r.b, { sigla: atual.sigla, vista: atual.vista, opcoes: atual.opcoes });
                    mudouEstrutura({ acao: 'editar', bloco_id: r.b.id, antes, depois: C().clonar(r.b) });
                } else aoInserir(atual);
            });
        }

        // ── imagem ────────────────────────────────────────────────────────────
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
                case 'tabela': return editarTabela(b, nb => aplicarForm(id, x => { x.cabecalho = nb.cabecalho; x.linhas = nb.linhas; x.nota = nb.nota; }));
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
            const txt = [(b.cabecalho || []).join(' | ')].concat((b.linhas || []).map(l => l.join(' | '))).join('\n');
            abrirForm({
                titulo: 'Tabela', largo: true,
                texto: 'Primeira linha = cabeçalho. Uma linha por linha da tabela, colunas separadas por | . Para colorir uma célula, comece com {sup}, {med}, {mi} ou {inf}.',
                campos: [{ k: 'grade', rotulo: 'Tabela', tipo: 'area', linhas: 10 }, { k: 'nota', rotulo: 'Nota abaixo da tabela (opcional)' }],
                valores: { grade: txt, nota: b.nota || '' },
                aoSalvar: v => {
                    const linhas = v.grade.split('\n').map(l => l.trim()).filter(Boolean).map(l => l.split('|').map(c => c.trim()));
                    const n = Math.max(...linhas.map(l => l.length));
                    const norm = linhas.map(l => l.concat(Array(n - l.length).fill('')));
                    aoAplicar(Object.assign(b, { cabecalho: norm[0] || [], linhas: norm.slice(1), nota: v.nota.trim() || null }));
                }
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

        return {
            documentoHtml, arvoreHtml, lixeiraHtml, statusHtml, ligar, ligarLixeira, gravar,
            tem: () => ed.pendente || ed.gravando,
            reimportado: () => mudouEstrutura(null)
        };
    }

    window.LaudoEditor = { criar };
})();

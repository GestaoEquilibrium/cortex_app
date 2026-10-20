/* ============================================================================
   CORTEX · Laudo Online — PÁGINA  (frontend/laudo-online/laudo-online.js)
   ----------------------------------------------------------------------------
   Sprint LO-1 (Documento 3, §6 e §8):
     - importar o pacote do Gerador, conferir com o banco e montar o laudo;
     - visão Editor em modo leitura, com conferências, pendências e histórico.
   Impressão (LO-2), edição (LO-3), finalização (LO-4) e página online (LO-5)
   entram nas próximas sprints.
   URL: laudo-online.html?paciente=<uuid>[&laudo=<uuid>][&importar=1]
   ============================================================================ */
(function () {
    'use strict';

    const C = () => window.LaudoCore;
    const sb = () => window.cortexClient;
    const esc = s => C().esc(s);
    const params = new URLSearchParams(location.search);

    const STATUS = {
        em_construcao: ['Em construção', 'amb'],
        aguardando_revisao_supervisor: ['Em revisão', 'amb'],
        pronto_para_devolutiva: ['Finalizado', 'ok'],
        devolutiva_realizada: ['Devolutiva feita', 'ok'],
        entregue: ['Entregue', 'ok'],
        errata: ['Errata', 'roxo']
    };
    const ORIGEM = { gerador: 'Gerador', modelo: 'Modelo', cortex: 'CORTEX', manual: 'Manual' };
    const NIVEL = {
        bloqueia: ['Bloqueia', 'erro', '✕'], importante: ['Importante', 'erro', '!'],
        atencao: ['Atenção', 'aviso', '!'], info: ['Informação', 'info', 'i'], ok: ['Confere', 'ok', '✓']
    };

    const st = {
        pacienteId: params.get('paciente'),
        laudoId: params.get('laudo'),
        perfil: null, admClin: false,
        banco: null, laudos: [], laudo: null, doc: null,
        glossario: {}, validacao: null, historico: [],
        importacao: null,
        visao: params.get('visao') === 'impressao' ? 'impressao' : 'editor',
        impressao: null          // { paginas, folhas } depois de desenhar
    };

    // ── Início ────────────────────────────────────────────────────────────────
    window.addEventListener('cortex:auth-ready', iniciar);

    async function iniciar() {
        try { await window.CortexSidebar.render('pacientes'); } catch (e) { console.warn(e); }
        st.perfil = (window.cortexProfissional || {}).perfil || null;
        st.admClin = st.perfil === 'admin_clinico';
        const raiz = document.getElementById('lo-raiz');

        if (!st.pacienteId) { raiz.innerHTML = vazio('⚠', 'Paciente não informado', 'Abra o Laudo Online pela aba Laudo da pasta do paciente.'); return; }

        try {
            await carregarTudo();
        } catch (err) {
            console.error('[laudo-online]', err);
            raiz.innerHTML = vazio('⚠', 'Não consegui abrir o Laudo Online', err.message || 'erro desconhecido');
            return;
        }
        render();
        if (params.get('importar') === '1' && podeImportar()) abrirImportar();
    }

    async function carregarTudo() {
        const [banco, laudos, glos] = await Promise.all([
            window.LaudoDados.carregar(st.pacienteId),
            sb().from('laudos_online')
                .select('id, versao, status, errata, revisao, created_at, updated_at, finalizado_em, online_liberado_em, modelo_versao, finalizador:finalizado_por(nome_completo)')
                .eq('paciente_id', st.pacienteId).order('versao', { ascending: false }),
            sb().from('laudo_glossario').select('termo, titulo, texto').eq('ativo', true)
        ]);
        if (laudos.error) throw laudos.error;
        st.banco = banco;
        st.laudos = laudos.data || [];
        st.glossario = {};
        ((glos && glos.data) || []).forEach(g => { st.glossario[g.termo.toLowerCase()] = g; });

        const alvo = st.laudos.find(l => l.id === st.laudoId) || st.laudos[0] || null;
        if (alvo) await abrirLaudo(alvo.id, true);
        else { st.laudo = null; st.doc = null; st.validacao = null; st.historico = []; }
    }

    async function abrirLaudo(id, semRender) {
        if (st.editor && st.editor.tem()) await st.editor.gravar();
        const { data, error } = await sb().from('laudos_online').select('*').eq('id', id).maybeSingle();
        if (error) throw error;
        if (!data) throw new Error('Laudo não encontrado ou sem permissão para abrir.');
        st.laudo = data;
        st.laudoId = data.id;
        st.ctxImp = null; st.impressao = null;
        st.doc = data.status === 'em_construcao' || !data.snapshot ? data.documento : (data.snapshot.documento || data.documento);
        reconferir();
        st.historico = [];
        if (st.admClin) {
            const h = await sb().from('laudos_online_historico').select('id, em, acao, bloco_id, revisao, profissional:por(nome_completo)')
                .eq('laudo_online_id', data.id).order('id', { ascending: false }).limit(30);
            st.historico = (h && h.data) || [];
        }
        try { history.replaceState(null, '', `?paciente=${st.pacienteId}&laudo=${data.id}`); } catch (e) { /* sem histórico */ }
        window.CortexAudit && window.CortexAudit.log('leitura', 'laudos_online', data.id, {
            pacienteId: st.pacienteId, detalhes: { versao: data.versao, status: data.status }
        });
        if (!semRender) render();
    }

    function reconferir() {
        if (!st.doc) { st.validacao = null; return; }
        let pacote = null;
        if (st.laudo && st.laudo.pacote_original) { const r = C().lerPacote(st.laudo.pacote_original); pacote = r.pacote || null; }
        st.validacao = C().validar(st.doc, st.banco, { pacote: pacote || st.doc });
    }

    function editavel() { return st.admClin && st.laudo && st.laudo.status === 'em_construcao' && !!window.LaudoEditor; }
    function editor() {
        if (!editavel()) return null;
        if (!st.editor || st.editor._laudo !== st.laudo.id) {
            st.editor = window.LaudoEditor.criar({
                estado: st, render, toast,
                conteudoLeitura: (b, ctx, sec) => conteudo(b, ctx, sec),
                aposGravar: () => {
                    reconferir();
                    const p = document.querySelector('.lo-painel');
                    if (p) { p.innerHTML = painel(); ligarPainel(p); }
                }
            });
            st.editor._laudo = st.laudo.id;
        }
        return st.editor;
    }

    function podeImportar() {
        return st.admClin && !st.laudos.some(l => l.status === 'em_construcao');
    }

    // ── Página ────────────────────────────────────────────────────────────────
    function vazio(icone, titulo, texto, acoes) {
        return `<div class="lo-vazio"><div class="lo-vazio-ico">${icone}</div><h2>${esc(titulo)}</h2><p>${esc(texto)}</p>${acoes || ''}</div>`;
    }

    function render() {
        const raiz = document.getElementById('lo-raiz');
        raiz.innerHTML = `${cabecalho()}<div class="lo-corpo">${corpo()}</div>`;
        ligarEventos(raiz);
    }

    function cabecalho() {
        const p = st.banco.paciente;
        const l = st.laudo;
        const [stTxt, stCls] = l ? (STATUS[l.status] || [l.status, 'amb']) : ['Sem laudo', 'neutro'];
        const versoes = st.laudos.length > 1 ? `
            <label class="lo-versoes">Versão
                <select id="lo-versao">${st.laudos.map(v => `<option value="${v.id}" ${l && v.id === l.id ? 'selected' : ''}>v${v.versao} · ${esc((STATUS[v.status] || [v.status])[0])}</option>`).join('')}</select>
            </label>` : '';
        return `
        <header class="lo-topo">
            <a class="lo-voltar" href="../pacientes/pasta.html?id=${encodeURIComponent(st.pacienteId)}" title="Voltar para a pasta">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
            </a>
            <div class="lo-marca">
                <div class="lo-marca-ico"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/><path d="M10 13h6M10 17h4"/></svg></div>
                <div><small>Laudo Online${l ? ` · v${l.versao}` : ''}</small><strong>${esc(p.nome_completo || '')}</strong></div>
            </div>
            <span class="lo-codigo" title="Código do paciente">${esc(p.codigo || '—')}</span>
            <span class="lo-status ${stCls}">${esc(stTxt)}</span>
            ${versoes}
            <nav class="lo-visoes" role="tablist" aria-label="Visões do laudo">
                <button role="tab" data-visao="editor" aria-selected="${st.visao === 'editor'}" ${l ? '' : 'disabled'}>Editor</button>
                <button role="tab" data-visao="impressao" aria-selected="${st.visao === 'impressao'}" ${l ? '' : 'disabled'}>Impressão</button>
                <button role="tab" aria-selected="false" disabled title="Chega na sprint LO-5">Online</button>
            </nav>
            <div class="lo-acoes">
                ${editavel() ? editor().statusHtml() : ''}
                ${l ? '<button class="lo-btn" id="lo-reconferir" title="Lê os resultados do banco de novo e refaz as conferências">↻ Reconferir</button>' : ''}
                ${editavel() ? '<button class="lo-btn" id="lo-reimportar" title="Trazer uma versão revisada do pacote do Gerador sem perder suas edições">⟳ Reimportar</button>' : ''}
                ${l && l.status === 'em_construcao' && st.admClin ? '<button class="lo-btn" id="lo-descartar" title="Apaga esta versão em construção para importar de novo">🗑 Descartar</button>' : ''}
                ${podeImportar() ? '<button class="lo-btn prim" id="lo-importar">⤓ Importar pacote</button>' : ''}
            </div>
        </header>`;
    }

    function corpo() {
        if (!st.laudo) {
            if (st.admClin) return vazio('📄', 'Nenhum Laudo Online ainda',
                'Cole aqui o arquivo .cortex.json que o Gerador de Laudos entregou. O CORTEX confere com os testes corrigidos e monta o laudo com o modelo da clínica.',
                '<button class="lo-btn prim grande" id="lo-importar-2">⤓ Importar pacote</button>');
            return vazio('🔒', 'Nenhum Laudo Online finalizado',
                'Laudos em construção só o admin clínico abre. Quando o laudo for finalizado, ele aparece aqui para toda a equipe.');
        }
        if (st.visao === 'impressao') return impressaoHtml();
        if (editavel()) {
            const e = editor();
            return `
            <div class="lo-grade">
                <aside class="lo-arvore" aria-label="Seções do laudo">${e.arvoreHtml()}</aside>
                <section class="lo-mesa"><div class="lo-faixa azul">Clique no texto para editar. Passe o mouse num bloco para mover, ocultar, apagar e mais opções; use o <b>+</b> entre blocos para inserir. A gravação é automática.</div>
                    <article class="lo-papel ed-papel" lang="pt-BR">${e.documentoHtml()}</article></section>
                <aside class="lo-painel" aria-label="Conferências">${painel()}</aside>
            </div>`;
        }
        const ro = st.laudo.status !== 'em_construcao'
            ? '<div class="lo-faixa ok">Laudo finalizado. Mudanças agora só em uma nova versão.</div>'
            : '<div class="lo-faixa">Modo leitura: só o admin clínico edita o laudo em construção.</div>';
        return `
        <div class="lo-grade">
            <aside class="lo-arvore" aria-label="Seções do laudo">${arvore()}</aside>
            <section class="lo-mesa">${ro}<article class="lo-papel" lang="pt-BR">${documento()}</article></section>
            <aside class="lo-painel" aria-label="Conferências">${painel()}</aside>
        </div>`;
    }

    function arvore() {
        const pend = new Set(((st.validacao || {}).pendencias || []).map(x => String(x.secao)));
        return `<h3>Seções</h3><ol>${(st.doc.secoes || []).map(s => `
            <li class="${s.oculta ? 'oculta' : ''}">
                <a href="#sec-${esc(s.id)}" data-ir="${esc(s.id)}">
                    <i>${esc(s.n)}</i><span>${esc(cap(s.titulo))}</span>
                    ${pend.has(String(s.n)) ? '<b class="lo-ponto" title="Tem pendência"></b>' : ''}
                </a>
            </li>`).join('')}</ol>
            <div class="lo-legenda">
                <span class="lo-orig gerador">Gerador</span><span class="lo-orig modelo">Modelo</span>
                <span class="lo-orig cortex">CORTEX</span><span class="lo-orig manual">Manual</span>
            </div>`;
    }
    function cap(t) { const s = String(t || '').toLowerCase().replace(/\bqi\b/g, 'QI'); return s.charAt(0).toUpperCase() + s.slice(1); }

    // ── Documento (leitura) ───────────────────────────────────────────────────
    function documento() {
        const ctx = C().contexto(st.banco, st.doc.meta);
        return (st.doc.secoes || []).map(s => `
            <section class="lo-sec ${s.oculta ? 'oculta' : ''}" id="sec-${esc(s.id)}">
                <h2 class="lo-h2"><span>${esc(s.n)}.</span> ${esc(s.titulo)}${s.oculta ? ' <em class="lo-tag">oculta</em>' : ''}</h2>
                ${(s.blocos || []).map(b => bloco(b, ctx, s)).join('')}
            </section>`).join('');
    }

    function bloco(b, ctx, sec) {
        let html;
        try { html = conteudo(b, ctx, sec); } catch (e) { console.warn('[bloco]', b, e); html = desconhecido(b); }
        const tags = [];
        if (b.exibir === 'impressao') tags.push('<em class="lo-tag">só impressão</em>');
        if (b.exibir === 'online') tags.push('<em class="lo-tag">só online</em>');
        if (b.oculto) tags.push('<em class="lo-tag">oculto</em>');
        if (b.quebra_antes) tags.push('<em class="lo-tag">nova página antes</em>');
        const compl = (b.complementos || []).length ? `
            <div class="lo-compl">${b.complementos.map(c => `<div><b>💬 ${esc(c.titulo || 'Anotação')}</b> ${C().inline(c.texto || '', ctx)}</div>`).join('')}</div>` : '';
        const nota = b.nota_interna && st.admClin ? `<div class="lo-nota-int"><b>Nota interna:</b> ${esc(b.nota_interna)}</div>` : '';
        return `
            <div class="lo-bloco ${b.oculto ? 'oculto' : ''}" id="b-${esc(b.id)}" data-bloco="${esc(b.id)}">
                <div class="lo-bloco-marca"><span class="lo-orig ${esc(b.origem || '')}" title="${esc(b.id)}">${esc(ORIGEM[b.origem] || b.origem || '')}</span>${tags.join('')}</div>
                ${html}${compl}${nota}
            </div>`;
    }

    function I(t, ctx) { return C().inline(t, ctx); }
    function paras(t, ctx) { return String(t || '').split(/\n{2,}/).filter(x => x.trim()).map(x => `<p class="lo-p">${I(x, ctx)}</p>`).join(''); }

    function conteudo(b, ctx, sec) {
        const p = st.banco.paciente;
        switch (b.tipo) {
            case 'titulo': return Number(b.nivel) === 4 ? `<h4 class="lo-h4">${I(b.texto, ctx)}</h4>` : `<h3 class="lo-h3">${I(b.texto, ctx)}</h3>`;
            case 'paragrafo': return `<p class="lo-p">${I(b.texto, ctx)}</p>`;
            case 'meta': return `<p class="lo-meta">${I(b.texto, ctx)}</p>`;
            case 'nota': return `<p class="lo-nota">${I(b.texto, ctx)}</p>`;
            case 'alerta': return `<div class="lo-alerta ${b.nivel === 'vermelho' ? 'verm' : ''}">${I(b.texto, ctx)}</div>`;
            case 'caixa': return `<div class="lo-caixa ${esc(b.estilo || 'azul')}">${b.titulo ? `<b>${I(b.titulo, ctx)}</b>` : ''}${(b.paragrafos || []).map(x => `<p class="lo-p">${I(x, ctx)}</p>`).join('')}</div>`;
            case 'lista': {
                const tag = b.estilo === 'marcadores' ? 'ul' : 'ol';
                return `<${tag} class="lo-lista">${(b.itens || []).map(x => `<li>${I(x, ctx)}</li>`).join('')}</${tag}>`;
            }
            case 'padrao': return paras(b.texto, ctx);
            case 'campos': {
                let linhas = (b.linhas || []).map(l => [I(l.rotulo, ctx), I(l.valor, ctx)]);
                if (sec && String(sec.n) === '1') {
                    linhas = [['Data de nascimento', esc(C().dataBR(p.data_nascimento))]].concat(linhas)
                        .concat([['Profissional Responsável', esc(`${(st.doc.textos || {}).responsavel || window.LaudoModeloPadrao.RESP} — Neuropsicólogo — ${(st.doc.textos || {}).registro || window.LaudoModeloPadrao.CRP}`)]]);
                }
                return `<table class="lo-campos"><tbody>${linhas.map(l => `<tr><th>${l[0]}</th><td>${l[1]}</td></tr>`).join('')}</tbody></table>`;
            }
            case 'tabela_instrumentos': {
                const marca = { complementar: '†', sem_peso: '‡' };
                return `<table class="lo-tab"><thead><tr><th>Instrumento</th><th>Domínio avaliado</th></tr></thead><tbody>${(b.linhas || []).map(l => `
                    <tr class="${l.status === 'a_confirmar' ? 'pend' : ''}"><td class="esq"><b>${esc(l.nome || l.sigla)}</b>${marca[l.status] ? ' ' + marca[l.status] : ''}</td><td class="esq"><em>${esc(l.dominio || '')}</em></td></tr>`).join('')}</tbody></table>`;
            }
            case 'fidedignidade': return `<div class="lo-caixa azul"><b>Análise de fidedignidade</b>${(b.paragrafos || []).map(x => `<p class="lo-p">${I(x, ctx)}</p>`).join('')}</div>`;
            case 'hipotese': {
                const rot = { principal: 'Hipótese principal', secundaria: 'Hipótese secundária', investigar: 'Hipótese a investigar' }[b.rotulo] || 'Hipótese';
                const cods = Array.isArray(b.codigos) ? b.codigos.join(' | ') : (b.codigos || '');
                const linha = (r, t) => t ? `<p class="lo-p"><strong>${r}</strong> ${I(t, ctx)}</p>` : '';
                return `<div class="lo-hip"><small>${rot}</small><p class="lo-hip-n">${I(b.nome, ctx)}</p>
                    <p class="lo-hip-c">${esc(cods)}${b.confianca ? ` | Nível de Confiança: <b>${esc(b.confianca)}</b>` : ''}</p>
                    ${linha('Critérios:', b.criterios)}${linha('Evidências:', b.evidencias)}${linha('Contraponto:', b.contraponto)}${linha('Ação:', b.acao)}</div>`;
            }
            case 'afastada': return `<div class="lo-afastada"><b>${I(b.condicao, ctx)}</b><span>${I(b.motivo, ctx)}</span><em>${I(b.fonte, ctx)}</em></div>`;
            case 'mapa': {
                const st2 = { preservado: ['ok', 'Preservado'], atencao: ['at', 'Atenção'], comprometido: ['cr', 'Comprometido'] };
                return `<table class="lo-tab lo-mapa"><thead><tr><th></th><th>Domínio</th><th>Desempenho</th><th>Instrumentos</th></tr></thead><tbody>${(b.linhas || []).map(l => {
                    const s = st2[l.status] || st2.atencao;
                    return `<tr class="m-${s[0]}"><td><i class="lo-dot" title="${s[1]}"></i></td><td class="esq"><b>${I(l.dominio, ctx)}</b></td><td class="esq">${I(l.desempenho, ctx)}</td><td class="esq"><em>${I(l.instrumentos, ctx)}</em></td></tr>`;
                }).join('')}</tbody></table>`;
            }
            case 'referencias': return `<div class="lo-refs">${(b.itens || []).map(x => `<p>${I(x, ctx)}</p>`).join('')}</div>`;
            case 'tabela': return `<table class="lo-tab"><thead><tr>${(b.cabecalho || []).map(h => `<th>${I(h, ctx)}</th>`).join('')}</tr></thead><tbody>${(b.linhas || []).map(l => `<tr>${l.map(cel => celula(cel, ctx)).join('')}</tr>`).join('')}</tbody></table>${b.nota ? `<p class="lo-nota">${I(b.nota, ctx)}</p>` : ''}`;
            case 'imagem': return `<div class="lo-auto">🖼 Imagem <code>${esc(b.arquivo || '')}</code>${b.legenda ? ` — ${I(b.legenda, ctx)}` : ''}</div>`;
            case 'resultado': return `<div class="imp lo-imp-res">${window.LaudoGraf.render(b, st.banco, { glossario: st.glossario, congelado: !!st.congelado })}</div>`;
            case 'cracha': return `
                <div class="lo-cracha">
                    <div><p class="nome">${esc(p.nome_completo || '')}</p>
                    <p><b>Idade:</b> ${esc(ctx.idade)} &nbsp; <b>Sexo:</b> ${esc(p.sexo || '')}</p>
                    <p><b>Escolaridade:</b> ${esc(p.escolaridade || '—')}</p></div>
                    ${p.foto_assinada ? `<img src="${esc(p.foto_assinada)}" alt="">` : `<span class="lo-ini">${esc(C().iniciais(p.nome_completo))}</span>`}
                </div>`;
            case 'acompanhe': return `<div class="lo-qr"><div class="lo-qr-q">QR</div><div><b>ACOMPANHE ESTE PACIENTE</b><p>${esc(b.texto || '')}</p></div></div>`;
            case 'convite': return `<div class="lo-qr"><div class="lo-qr-q">QR</div><div><b>Sua opinião faz a diferença!</b><p>${esc(b.texto || '')}</p></div></div>`;
            case 'classificacao_qi': return `<table class="lo-tab"><thead><tr><th>%</th><th>Percentil</th><th>Escore</th><th>Classificação</th><th>Interpretação</th></tr></thead><tbody>${(b.linhas || []).map(l => `<tr>${l.map((x, i) => `<td${i === 3 ? ` class="cl cl-${C().faixa(x) || 'med'}"` : ''}>${esc(x)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
            case 'local_data': return `<p class="lo-p">${esc(b.cidade || 'Uberlândia — MG')}, ${esc(C().dataExtenso((st.doc.meta || {}).data_emissao || new Date().toISOString().slice(0, 10)))}.</p>`;
            case 'assinatura': return `<div class="lo-assin"><i></i><p>${esc(b.nome || '')}</p><small>${esc(b.registro || '')}</small></div>`;
            case 'quebra_pagina': return '<div class="lo-quebra">quebra de página</div>';
            case 'espaco': return `<div class="lo-espaco ${esc(b.altura || 'm')}"></div>`;
            default: return desconhecido(b);
        }
    }

    function celula(cel, ctx) {
        const m = /^\{(sup|med|mi|inf|neutro)\}\s*/.exec(String(cel || ''));
        return m ? `<td class="cl cl-${m[1]}">${I(String(cel).slice(m[0].length), ctx)}</td>` : `<td>${I(cel, ctx)}</td>`;
    }

    function desconhecido(b) {
        return `<div class="lo-desc"><b>Bloco não reconhecido</b> (${esc(b.tipo)}). O conteúdo está guardado e aparece aqui sem formatação:<pre>${esc(JSON.stringify(b, null, 2))}</pre></div>`;
    }

    // ── Visão Impressão (LO-2) ────────────────────────────────────────────────
    async function trocarVisao(v) {
        if (!st.laudo || v === st.visao) return;
        if (st.editor && st.editor.tem()) await st.editor.gravar();
        st.visao = v;
        try { history.replaceState(null, '', `?paciente=${st.pacienteId}&laudo=${st.laudo.id}${v === 'impressao' ? '&visao=impressao' : ''}`); } catch (e) { /* ok */ }
        render();
    }

    function impressaoHtml() {
        const enviado = st.laudo.laudo_paciente_id
            ? '<span class="lo-imp-ok">PDF desta versão já enviado para a aba Laudo</span>' : '';
        return `
        <div class="lo-imp-barra">
            <div class="lo-imp-info"><b id="lo-imp-pags">Paginando…</b><span>Folhas A4 iguais ao PDF. Os números vêm do banco.</span>${enviado}
                ${podeAjustar() ? '<span class="lo-imp-dica">Para ajustar as páginas, passe o mouse num trecho da folha: <b>↵ Espaço</b> empurra para baixo e <b>Página nova</b> começa outra folha.</span>' : ''}</div>
            <div class="lo-imp-acoes">
                ${st.admClin ? '<button class="btn btn-secondary" id="lo-enviar-assinatura">✍️ Enviar para assinatura</button>' : ''}
                <button class="btn btn-primary" id="lo-gerar-pdf">🖨 Gerar PDF</button>
            </div>
        </div>
        <div class="lo-imp-aviso" id="lo-imp-aviso" hidden></div>
        <div id="lo-folhas" class="lo-folhas" aria-label="Folhas do laudo"></div>`;
    }

    async function contextoImpressao() {
        if (st.ctxImp) return st.ctxImp;
        const ctx = { banco: st.banco, glossario: st.glossario, congelado: false, imagens: {} };
        // QR "Acompanhe este paciente": o mesmo token do prontuário (só admin gera)
        if (st.perfil === 'admin_clinico' || st.perfil === 'admin_gestor') {
            try {
                const { data, error } = await sb().rpc('qr_prontuario_token', { p_paciente_id: st.pacienteId });
                if (!error && data) ctx.linkProntuario = 'https://cortexneuro.com.br/e/?t=' + encodeURIComponent(data);
            } catch (e) { console.warn('[impressão] QR', e); }
        }
        // Assinatura de quem assina (o admin clínico logado)
        try {
            const prof = await sb().from('profissionais').select('assinatura_url').eq('id', (window.cortexProfissional || {}).id).maybeSingle();
            const caminho = prof && prof.data && prof.data.assinatura_url;
            if (caminho) {
                const { data } = await sb().storage.from('profissionais-assinaturas').createSignedUrl(caminho, 900);
                ctx.assinaturaImg = (data && data.signedUrl) || null;
            }
        } catch (e) { console.warn('[impressão] assinatura', e); }
        // Imagens inseridas no laudo (bucket laudos-midia)
        const arqs = [];
        C().cadaBloco(st.doc, b => { if (b.tipo === 'imagem' && b.arquivo) arqs.push(b.arquivo); });
        for (const a of arqs) {
            try { const { data } = await sb().storage.from('laudos-midia').createSignedUrl(a, 900); if (data) ctx.imagens[a] = data.signedUrl; } catch (e) { /* segue sem */ }
        }
        st.ctxImp = ctx;
        return ctx;
    }

    let desenhando = null;
    async function desenharImpressao() {
        const alvo = document.getElementById('lo-folhas');
        if (!alvo) return;
        const minha = desenhando = Symbol('d');
        try {
            const ctx = await contextoImpressao();
            if (minha !== desenhando) return;
            const r = await window.LaudoImpressao.desenhar(st.doc, alvo, ctx);
            if (minha !== desenhando) return;
            st.impressao = r;
            const el = document.getElementById('lo-imp-pags');
            if (el) el.textContent = `${r.paginas} página${r.paginas === 1 ? '' : 's'} + capa`;
            const av = document.getElementById('lo-imp-aviso');
            const avisos = [];
            if (r.paginas > r.alvo) avisos.push(`O laudo passou de ${r.alvo} páginas (alvo do modelo). Isso não impede nada.`);
            if (r.omitidos && r.omitidos.length) avisos.push(`Não saem no PDF: ${r.omitidos.join('; ')}.`);
            if (!ctx.linkProntuario) avisos.push('O QR "Acompanhe este paciente" sai em branco: só admin gera o token do prontuário.');
            if (!ctx.assinaturaImg) avisos.push('Sem imagem de assinatura cadastrada: o rodapé mostra o nome. Cadastre em Configurações → Perfil.');
            if (av) { av.hidden = !avisos.length; av.innerHTML = avisos.map(a => `<p>⚠️ ${esc(a)}</p>`).join(''); }
            if (podeAjustar()) ligarAjustes(alvo);
        } catch (err) {
            console.error('[impressão]', err);
            alvo.innerHTML = `<div class="lo-desc"><b>Não consegui montar as folhas.</b> ${esc(err.message || '')}</div>`;
        }
    }

    // ── Ajuste de páginas direto na folha (↵ Espaço / Página nova) ────────────
    function podeAjustar() { return st.admClin && st.laudo && st.laudo.status === 'em_construcao'; }

    function acharBloco(id) {
        for (const sec of (st.doc.secoes || [])) {
            const i = (sec.blocos || []).findIndex(b => b.id === id);
            if (i >= 0) return { sec, i, b: sec.blocos[i] };
        }
        return null;
    }
    function anteriorVisivel(sec, i) {
        for (let k = i - 1; k >= 0; k--) { const b = sec.blocos[k]; if (b && !b.oculto && b.exibir !== 'online') return { b, k }; }
        return null;
    }
    function novoEspaco() {
        return C().completarBloco({ id: 'u.' + C().aleatorio(8), tipo: 'espaco', altura: 'm', origem: 'manual' }, 'manual');
    }

    let barraAjuste = null, ajustando = false;
    function ligarAjustes(alvo) {
        if (!barraAjuste) {
            barraAjuste = document.createElement('div');
            barraAjuste.className = 'lo-ajuste';
            barraAjuste.hidden = true;
            document.body.appendChild(barraAjuste);
            barraAjuste.addEventListener('mouseleave', ev => { if (!ev.relatedTarget || !ev.relatedTarget.closest('.i-ck')) barraAjuste.hidden = true; });
            barraAjuste.addEventListener('click', ev => {
                const bt = ev.target.closest('button[data-ajuste]');
                if (bt && barraAjuste._alvo) ajustar(bt.dataset.ajuste, barraAjuste._alvo);
            });
        }
        alvo.querySelectorAll('.i-ck').forEach(el => {
            el.addEventListener('mouseenter', () => mostrarAjuste(el));
        });
        alvo.addEventListener('mouseleave', ev => { if (!ev.relatedTarget || !barraAjuste.contains(ev.relatedTarget)) barraAjuste.hidden = true; });
    }

    function mostrarAjuste(el) {
        if (ajustando) return;
        const ehTitulo = !!el.dataset.tituloSecao;
        let temEspacoAcima = false, temPagina = false;
        if (ehTitulo) {
            const sec = (st.doc.secoes || []).find(x => x.id === el.dataset.secao);
            temPagina = !!(sec && sec.quebra_antes);
            const idx = st.doc.secoes.indexOf(sec), ant = idx > 0 ? st.doc.secoes[idx - 1] : null;
            const ult = ant && ant.blocos && ant.blocos[ant.blocos.length - 1];
            temEspacoAcima = !!(ult && ult.tipo === 'espaco');
        } else {
            const r = acharBloco(el.dataset.bloco);
            if (!r || r.b.tipo === 'espaco') { barraAjuste.hidden = true; return; }
            temPagina = !!r.b.quebra_antes;
            const a = anteriorVisivel(r.sec, r.i);
            temEspacoAcima = !!(a && a.b.tipo === 'espaco');
        }
        barraAjuste.innerHTML = `
            <button data-ajuste="espaco" title="Empurra este trecho para baixo, como dar Enter">↵ Espaço</button>
            ${temEspacoAcima ? '<button data-ajuste="tirar_espaco" title="Tira um espaço acima deste trecho">⌫ Tirar espaço</button>' : ''}
            <button data-ajuste="pagina" class="${temPagina ? 'ativo' : ''}" title="${temPagina ? 'Tira a página nova antes deste trecho' : 'Começa uma folha nova a partir deste trecho'}">${temPagina ? '✕ Tirar página nova' : '⤓ Página nova aqui'}</button>`;
        barraAjuste._alvo = el;
        const r = el.getBoundingClientRect();
        barraAjuste.hidden = false;
        // dentro do próprio trecho, no canto de cima à direita: o mouse vai do texto à barra sem sair dele
        barraAjuste.style.top = (window.scrollY + r.top + 2) + 'px';
        barraAjuste.style.left = (window.scrollX + Math.max(8, r.right - barraAjuste.offsetWidth - 2)) + 'px';
    }

    async function ajustar(acao, el) {
        if (ajustando || !podeAjustar()) return;
        if (st.editor && st.editor.tem()) await st.editor.gravar();
        const copia = JSON.stringify(st.doc);
        const eventos = [];
        const ehTitulo = !!el.dataset.tituloSecao;
        if (ehTitulo) {
            const secs = st.doc.secoes, sec = secs.find(x => x.id === el.dataset.secao);
            if (!sec) return;
            const ant = secs[secs.indexOf(sec) - 1];
            if (acao === 'pagina') {
                sec.quebra_antes = !sec.quebra_antes;
                eventos.push({ acao: 'editar', bloco_id: sec.id, antes: { quebra_antes: !sec.quebra_antes }, depois: { quebra_antes: sec.quebra_antes } });
            } else if (acao === 'espaco' && ant) {
                const novo = novoEspaco(); ant.blocos.push(novo);
                eventos.push({ acao: 'inserir', bloco_id: novo.id, depois: { tipo: 'espaco', antes_de: sec.id } });
            } else if (acao === 'tirar_espaco' && ant && ant.blocos.length && ant.blocos[ant.blocos.length - 1].tipo === 'espaco') {
                const tirado = ant.blocos.pop();
                eventos.push({ acao: 'apagar', bloco_id: tirado.id, antes: tirado });
            }
        } else {
            const r = acharBloco(el.dataset.bloco);
            if (!r) return;
            if (acao === 'pagina') {
                r.b.quebra_antes = !r.b.quebra_antes;
                eventos.push({ acao: 'editar', bloco_id: r.b.id, antes: { quebra_antes: !r.b.quebra_antes }, depois: { quebra_antes: r.b.quebra_antes } });
            } else if (acao === 'espaco') {
                const novo = novoEspaco(); r.sec.blocos.splice(r.i, 0, novo);
                eventos.push({ acao: 'inserir', bloco_id: novo.id, depois: { tipo: 'espaco', antes_de: r.b.id } });
            } else if (acao === 'tirar_espaco') {
                const a = anteriorVisivel(r.sec, r.i);
                if (a && a.b.tipo === 'espaco') { r.sec.blocos.splice(a.k, 1); eventos.push({ acao: 'apagar', bloco_id: a.b.id, antes: a.b }); }
            }
        }
        if (!eventos.length) return;
        ajustando = true;
        barraAjuste.hidden = true;
        const y = window.scrollY;
        try {
            const { data, error } = await sb().rpc('laudo_online_salvar', { p_id: st.laudo.id, p_revisao: st.laudo.revisao, p_documento: st.doc, p_eventos: eventos });
            if (error) throw error;
            if (!data || !data.ok) {
                st.doc = JSON.parse(copia); st.laudo.documento = st.doc;
                toast((data && data.mensagem) || 'Não consegui gravar.', 'danger');
                if (data && data.erro === 'revisao') setTimeout(() => location.reload(), 1500);
                return;
            }
            st.laudo.revisao = data.revisao;
            st.laudo.documento = st.doc;
            st.impressao = null;
            await desenharImpressao();
            window.scrollTo(0, y);
        } catch (err) {
            st.doc = JSON.parse(copia); st.laudo.documento = st.doc;
            toast('Não consegui gravar o ajuste: ' + (err.message || ''), 'danger');
        } finally {
            ajustando = false;
        }
    }

    window.addEventListener('resize', () => {
        const alvo = document.getElementById('lo-folhas');
        if (alvo && window.LaudoImpressao) window.LaudoImpressao.escalar(alvo);
    });

    async function gerarPdf() {
        if (!st.impressao) await desenharImpressao();
        const origem = document.getElementById('lo-folhas');
        if (!origem || !origem.querySelector('.folha')) { toast('As folhas ainda não ficaram prontas.', 'danger'); return; }
        let box = document.getElementById('lo-print');
        if (!box) { box = document.createElement('div'); box.id = 'lo-print'; box.className = 'imp'; document.body.appendChild(box); }
        box.innerHTML = origem.innerHTML;
        box.style.setProperty('--escala', '1');
        const tituloAntes = document.title;
        document.title = `Laudo Neuropsicológico - ${st.banco.paciente.nome_completo || ''} - v${st.laudo.versao}`;
        document.body.classList.add('lo-imprimindo');
        let terminou = false;
        const fim = () => {
            if (terminou) return; terminou = true;
            document.body.classList.remove('lo-imprimindo');
            box.innerHTML = '';
            document.title = tituloAntes;
            window.removeEventListener('afterprint', fim);
            if (st.admClin) setTimeout(abrirEnvioAssinatura, 150);
        };
        window.addEventListener('afterprint', fim);
        window.CortexAudit && window.CortexAudit.log('geracao_pdf', 'laudos_online', st.laudo.id, {
            pacienteId: st.pacienteId, detalhes: { versao: st.laudo.versao, paginas: (st.impressao || {}).paginas }
        });
        await new Promise(r => setTimeout(r, 60));
        window.print();
        setTimeout(fim, 400);
    }

    function abrirEnvioAssinatura() {
        if (!st.admClin || document.querySelector('.lo-modal')) return;
        const ja = !!st.laudo.laudo_paciente_id;
        const m = document.createElement('div');
        m.className = 'lo-modal';
        m.innerHTML = `
            <div class="lo-modal-card" role="dialog" aria-modal="true" aria-labelledby="lo-ass-tit">
                <h2 id="lo-ass-tit">Enviar para assinatura</h2>
                <p>No diálogo de impressão, escolha <b>Salvar como PDF</b> e guarde o arquivo. Depois escolha aqui o PDF salvo: ele entra na aba Laudo como <b>Laudo Online v${esc(st.laudo.versao)}</b> e abre a janela de assinatura digital.</p>
                ${ja ? '<p class="lo-imp-ok">Esta versão já tem um PDF enviado. Enviar de novo cria uma nova versão no histórico de PDFs.</p>' : ''}
                <div class="lo-imp-linha">
                    <label class="lo-btn sec"><input type="file" id="lo-ass-arq" accept="application/pdf" hidden>📎 Escolher PDF</label>
                    <span id="lo-ass-nome" class="lo-imp-nome">Nenhum arquivo escolhido</span>
                </div>
                <div id="lo-ass-res" aria-live="polite"></div>
                <div class="lo-modal-acoes">
                    <button class="btn btn-secondary" id="lo-ass-cancelar">Agora não</button>
                    <button class="btn btn-primary" id="lo-ass-enviar" disabled>Enviar e assinar</button>
                </div>
            </div>`;
        document.body.appendChild(m);
        const $ = id => m.querySelector('#' + id);
        let arquivo = null;
        $('lo-ass-cancelar').addEventListener('click', () => m.remove());
        m.addEventListener('click', ev => { if (ev.target === m) m.remove(); });
        $('lo-ass-arq').addEventListener('change', ev => {
            const f = ev.target.files[0];
            arquivo = null; $('lo-ass-enviar').disabled = true; $('lo-ass-res').innerHTML = '';
            if (!f) return;
            $('lo-ass-nome').textContent = f.name;
            if (f.type !== 'application/pdf') { $('lo-ass-res').innerHTML = '<p class="lo-imp-erro">Escolha o arquivo PDF.</p>'; return; }
            if (f.size > 20 * 1024 * 1024) { $('lo-ass-res').innerHTML = '<p class="lo-imp-erro">Arquivo maior que 20 MB.</p>'; return; }
            arquivo = f; $('lo-ass-enviar').disabled = false;
        });
        $('lo-ass-enviar').addEventListener('click', async () => {
            if (!arquivo) return;
            const bt = $('lo-ass-enviar'); bt.disabled = true; bt.textContent = 'Enviando…';
            try {
                const r = await enviarPdf(arquivo);
                m.remove();
                toast('PDF guardado na aba Laudo. Abrindo a assinatura…', 'success');
                if (window.CortexAssinatura && window.CortexAssinatura.abrir) {
                    window.CortexAssinatura.abrir({
                        tipo: 'laudo', id: r.id, bucket: 'laudos', path: r.path, titulo: `Laudo Online v${st.laudo.versao}`,
                        onAssinado: () => toast('Laudo assinado. Ele já está na aba Laudo da pasta.', 'success')
                    });
                }
            } catch (err) {
                console.error('[assinatura]', err);
                bt.disabled = false; bt.textContent = 'Enviar e assinar';
                $('lo-ass-res').innerHTML = `<p class="lo-imp-erro">Não consegui enviar: ${esc(err.message || 'erro desconhecido')}</p>`;
            }
        });
    }

    async function enviarPdf(file) {
        const path = `${st.pacienteId}/v${Date.now()}.pdf`;
        const up = await sb().storage.from('laudos').upload(path, file, { contentType: 'application/pdf', upsert: false });
        if (up.error) throw up.error;
        const { data: { user } } = await sb().auth.getUser();
        const ins = await sb().from('laudos_paciente').insert({
            paciente_id: st.pacienteId, titulo: `Laudo Online v${st.laudo.versao}`,
            arquivo_path: path, arquivo_nome_original: file.name, arquivo_tamanho_bytes: file.size,
            ativo: true, created_by: (user && user.id) || null
        }).select('id').single();
        if (ins.error) throw ins.error;
        const upd = await sb().from('laudos_online').update({ laudo_paciente_id: ins.data.id }).eq('id', st.laudo.id);
        if (upd.error) console.warn('[assinatura] vínculo laudo_paciente_id:', upd.error.message);
        else st.laudo.laudo_paciente_id = ins.data.id;
        window.CortexAudit && await window.CortexAudit.log('criacao', 'laudos_paciente', ins.data.id, {
            pacienteId: st.pacienteId, detalhes: { origem: 'laudo_online', laudo_online_id: st.laudo.id, versao: st.laudo.versao, tamanho: file.size }
        });
        return { id: ins.data.id, path };
    }

    // ── Painel de conferências ────────────────────────────────────────────────
    function painel() {
        const v = st.validacao || { checks: [], pendencias: [] };
        const contagem = { erro: 0, aviso: 0 };
        v.checks.forEach(c => { const n = NIVEL[c.nivel] || NIVEL.info; if (n[1] === 'erro') contagem.erro++; else if (n[1] === 'aviso') contagem.aviso++; });
        const resumoTxt = contagem.erro ? `${contagem.erro} ponto(s) importante(s)` : contagem.aviso ? `${contagem.aviso} ponto(s) de atenção` : 'Tudo confere';
        const quando = st.banco.carregado_em ? new Date(st.banco.carregado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
        const hist = st.admClin ? `
            <h3>Histórico</h3>
            <ul class="lo-hist">${st.historico.length ? st.historico.map(h => `
                <li><b>${esc(acaoTxt(h.acao))}</b>${h.bloco_id ? ` <code>${esc(h.bloco_id)}</code>` : ''}<span>${esc(new Date(h.em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }))} · ${esc((h.profissional || {}).nome_completo || '—')}</span></li>`).join('') : '<li class="vazio">Sem registros.</li>'}</ul>` : '';
        return `
            <h3>Conferências <span class="lo-resumo ${contagem.erro ? 'erro' : contagem.aviso ? 'aviso' : 'ok'}">${esc(resumoTxt)}</span></h3>
            <p class="lo-painel-sub">Dados do banco lidos às ${esc(quando)}. Avisos não impedem nada; você decide na finalização.</p>
            <div class="lo-checks">${v.checks.map(chk).join('')}</div>
            ${v.pendencias && v.pendencias.length ? `<h3>Pendências</h3><ul class="lo-pends">${v.pendencias.map(x => `<li${x.bloco ? ` data-ir-bloco="${esc(x.bloco)}"` : ''}><span>Seção ${esc(x.secao)}</span>${esc(x.texto)}</li>`).join('')}</ul>` : ''}
            ${hist}
            ${editavel() ? editor().lixeiraHtml() : ''}`;
    }
    function chk(c) {
        const n = NIVEL[c.nivel] || NIVEL.info;
        return `<div class="lo-chk ${n[1]}"><i>${n[2]}</i><div><small>${esc(c.grupo)} · ${esc(n[0])}</small><b>${esc(c.titulo)}</b><p>${esc(c.detalhe || '')}</p></div></div>`;
    }
    function acaoTxt(a) {
        return { importar: 'Importou o pacote', reimportar: 'Reimportou', editar: 'Editou', mover: 'Moveu', ocultar: 'Ocultou', apagar: 'Apagou', inserir: 'Inseriu',
            restaurar: 'Restaurou', aceitar: 'Aceitou aviso', finalizar: 'Finalizou', nova_versao: 'Nova versão', liberar_online: 'Liberação online' }[a] || a;
    }

    // ── Eventos ───────────────────────────────────────────────────────────────
    function ligarEventos(raiz) {
        const on = (id, fn) => { const el = raiz.querySelector('#' + id); if (el) el.addEventListener('click', fn); };
        on('lo-importar', abrirImportar);
        on('lo-importar-2', abrirImportar);
        on('lo-descartar', descartar);
        raiz.querySelectorAll('[data-visao]').forEach(bt => bt.addEventListener('click', () => trocarVisao(bt.dataset.visao)));
        on('lo-gerar-pdf', gerarPdf);
        on('lo-enviar-assinatura', abrirEnvioAssinatura);
        if (st.visao === 'impressao' && st.laudo) desenharImpressao();
        on('lo-reconferir', async () => {
            try {
                st.banco = await window.LaudoDados.carregar(st.pacienteId);
                st.ctxImp = null; st.impressao = null;
                reconferir(); render();
                toast('Conferências refeitas com os dados atuais do banco.', 'success');
            } catch (e) { toast('Erro ao reconferir: ' + (e.message || ''), 'danger'); }
        });
        const sel = raiz.querySelector('#lo-versao');
        if (sel) sel.addEventListener('change', () => abrirLaudo(sel.value).catch(e => toast(e.message, 'danger')));
        raiz.querySelectorAll('[data-ir]').forEach(a => a.addEventListener('click', ev => {
            ev.preventDefault(); const el = document.getElementById('sec-' + a.dataset.ir); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }));
        on('lo-reimportar', () => abrirImportar(true));
        const p = raiz.querySelector('.lo-painel'); if (p) ligarPainel(p, true);
        if (editavel() && st.visao === 'editor') editor().ligar(raiz);
        raiz.querySelectorAll('.lo-termo').forEach(t => {
            t.addEventListener('click', () => balao(t));
            t.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); balao(t); } });
        });
    }

    function ligarPainel(p, primeiraVez) {
        p.querySelectorAll('[data-ir-bloco]').forEach(li => li.addEventListener('click', () => {
            const el = document.getElementById('b-' + li.dataset.irBloco);
            if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('piscar'); setTimeout(() => el.classList.remove('piscar'), 1600); }
        }));
        if (!primeiraVez && editavel()) editor().ligarLixeira(p);
    }

    function balao(el) {
        document.querySelectorAll('.lo-balao').forEach(b => b.remove());
        const termo = el.dataset.termo || '';
        const g = st.glossario[termo.toLowerCase()];
        const texto = el.dataset.texto || (g && g.texto) || 'Termo sem explicação no glossário da clínica.';
        const div = document.createElement('div');
        div.className = 'lo-balao';
        div.innerHTML = `<b>${esc((g && !el.dataset.texto && g.titulo) || termo)}</b><p>${esc(texto)}</p>${el.dataset.texto ? '<small>Explicação escrita para este caso</small>' : (g ? '<small>Glossário da clínica</small>' : '')}`;
        document.body.appendChild(div);
        const r = el.getBoundingClientRect();
        const w = Math.min(320, window.innerWidth - 24);
        div.style.width = w + 'px';
        div.style.left = Math.max(12, Math.min(window.innerWidth - w - 12, r.left + window.scrollX)) + 'px';
        div.style.top = (r.bottom + window.scrollY + 8) + 'px';
        setTimeout(() => document.addEventListener('click', function fechar(ev) { if (!div.contains(ev.target) && ev.target !== el) { div.remove(); document.removeEventListener('click', fechar); } }), 0);
    }

    function toast(msg, tipo) {
        if (window.CortexUI && window.CortexUI.toast) window.CortexUI.toast(msg, tipo || 'info');
        else console.log(msg);
    }

    // ── Descartar versão em construção ───────────────────────────────────────
    function descartar() {
        const l = st.laudo;
        if (!l || l.status !== 'em_construcao') return;
        window.CortexConfirm.mostrar({
            icone: '🗑',
            titulo: `Descartar o Laudo Online v${l.versao}?`,
            texto: 'A versão em construção e o histórico dela serão apagados. O pacote pode ser importado de novo depois. Laudos finalizados não são afetados.',
            btnSim: 'Sim, descartar', btnNao: 'Cancelar', btnSimDanger: true,
            onSim: async () => {
                const { error } = await sb().from('laudos_online').delete().eq('id', l.id);
                if (error) { toast('Não consegui descartar: ' + (error.message || ''), 'danger'); return; }
                window.CortexAudit && await window.CortexAudit.log('delecao', 'laudos_online', l.id, { pacienteId: st.pacienteId, detalhes: { versao: l.versao } });
                toast('Versão descartada.', 'success');
                st.laudoId = null;
                await carregarTudo();
                render();
            }
        });
    }

    // ── Importar pacote ───────────────────────────────────────────────────────
    function abrirImportar(reimportar) {
        reimportar = reimportar === true;
        if (!reimportar && !podeImportar()) { toast('Já existe um Laudo Online em construção para este paciente.', 'info'); return; }
        if (reimportar && !editavel()) return;
        st.importacao = null;
        st.reimportando = reimportar;
        const m = document.createElement('div');
        m.className = 'lo-modal';
        m.innerHTML = `
            <div class="lo-modal-card" role="dialog" aria-modal="true" aria-labelledby="lo-imp-tit">
                <h2 id="lo-imp-tit">${reimportar ? 'Reimportar pacote revisado' : 'Importar pacote do Gerador'}</h2>
                <p>Cole o conteúdo do arquivo <code>.cortex.json</code> ou escolha o arquivo. O código do paciente no pacote precisa ser <b>${esc(st.banco.paciente.codigo || '—')}</b>.${reimportar ? ' Trechos que você editou ficam como estão; o que o Gerador mudou neles aparece para você decidir.' : ''}</p>
                <textarea id="lo-imp-txt" spellcheck="false" placeholder='{ "formato": "cortex-laudo", "versao_formato": "2.0", ... }'></textarea>
                <div class="lo-imp-linha">
                    <label class="lo-btn sec"><input type="file" id="lo-imp-arq" accept=".json,application/json" hidden>📎 Escolher arquivo</label>
                    <span id="lo-imp-nome" class="lo-imp-nome"></span>
                    <button class="lo-btn sec" id="lo-imp-conferir">Conferir</button>
                </div>
                <div id="lo-imp-res" aria-live="polite"></div>
                <div class="lo-modal-acoes">
                    <button class="btn btn-secondary" id="lo-imp-cancelar">Cancelar</button>
                    <button class="btn btn-primary" id="lo-imp-montar" disabled>${reimportar ? 'Reimportar' : 'Montar laudo'}</button>
                </div>
            </div>`;
        document.body.appendChild(m);
        const $ = id => m.querySelector('#' + id);
        const fechar = () => m.remove();
        $('lo-imp-cancelar').addEventListener('click', fechar);
        m.addEventListener('click', ev => { if (ev.target === m) fechar(); });
        $('lo-imp-arq').addEventListener('change', async ev => {
            const f = ev.target.files[0]; if (!f) return;
            $('lo-imp-nome').textContent = f.name;
            $('lo-imp-txt').value = await f.text();
            conferirImportacao(m);
        });
        $('lo-imp-conferir').addEventListener('click', () => conferirImportacao(m));
        $('lo-imp-txt').addEventListener('input', () => { $('lo-imp-montar').disabled = true; });
        $('lo-imp-montar').addEventListener('click', () => reimportar ? reimportarPacote(m) : montarEGravar(m));
        $('lo-imp-txt').focus();
    }

    function conferirImportacao(m) {
        const res = m.querySelector('#lo-imp-res');
        const btn = m.querySelector('#lo-imp-montar');
        btn.disabled = true;
        const txt = m.querySelector('#lo-imp-txt').value.trim();
        if (!txt) { res.innerHTML = '<p class="lo-imp-erro">Cole o pacote ou escolha o arquivo.</p>'; return; }
        const r = C().lerPacote(txt);
        if (r.erro) { res.innerHTML = `<div class="lo-chk erro"><i>✕</i><div><small>Arquivo · Bloqueia</small><b>Pacote não pode ser importado</b><p>${esc(r.erro)}</p></div></div>`; return; }
        const v = C().validar(r.pacote, st.banco, { pacote: r.pacote });
        st.importacao = { pacote: r.pacote, original: r.original, validacao: v };
        const bloq = v.bloqueios.length;
        res.innerHTML = `
            <p class="lo-imp-resumo ${bloq ? 'erro' : ''}">${bloq ? 'Este pacote não pode ser importado:' : 'Conferência do pacote. Os avisos não impedem a montagem.'}</p>
            <div class="lo-checks">${v.checks.map(chk).join('')}</div>`;
        btn.disabled = !!bloq;
    }

    async function obterModelo() {
        const q = await sb().from('laudo_modelos').select('id, versao, esqueleto').eq('padrao', true).eq('ativo', true).limit(1);
        if (q.error) throw q.error;
        if (q.data && q.data.length) return q.data[0];
        const ins = await sb().from('laudo_modelos').insert({
            nome: window.LaudoModeloPadrao.NOME, versao: 1, esqueleto: window.LaudoModeloPadrao.esqueleto(), padrao: true, ativo: true
        }).select('id, versao, esqueleto').single();
        if (ins.error) {
            const de = await sb().from('laudo_modelos').select('id, versao, esqueleto').eq('padrao', true).eq('ativo', true).limit(1);
            if (de.data && de.data.length) return de.data[0];
            throw ins.error;
        }
        return ins.data;
    }

    async function montarEGravar(m) {
        const imp = st.importacao;
        if (!imp || imp.validacao.bloqueios.length) return;
        const btn = m.querySelector('#lo-imp-montar');
        btn.disabled = true; btn.textContent = 'Montando…';
        try {
            const modelo = await obterModelo();
            const doc = window.LaudoMesclar.montar({ modelo, pacote: imp.pacote, banco: st.banco });
            const validacao = C().validar(doc, st.banco, { pacote: imp.pacote });
            const { data, error } = await sb().from('laudos_online').insert({
                paciente_id: st.pacienteId,
                versao_formato: C().VERSAO_ATUAL,
                pacote_original: imp.original,
                documento_original: doc,
                documento: doc,
                modelo_id: modelo.id,
                modelo_versao: modelo.versao,
                validacao: { checks: validacao.checks, em: validacao.em }
            }).select('id').single();
            if (error) {
                if (/laudos_online_um_em_construcao|duplicate key/i.test(error.message || '')) throw new Error('Já existe um Laudo Online em construção para este paciente.');
                if (/row-level security/i.test(error.message || '')) throw new Error('Só o admin clínico importa pacotes.');
                throw error;
            }
            window.CortexAudit && await window.CortexAudit.log('criacao', 'laudos_online', data.id, {
                pacienteId: st.pacienteId,
                detalhes: { evento: 'importar', paciente_ref: imp.pacote.paciente_ref, motor: (imp.pacote.origem || {}).motor || null,
                    avisos: validacao.checks.filter(c => c.nivel !== 'ok').map(c => c.id) }
            });
            m.remove();
            toast('Laudo montado. Veja as conferências do pacote com o banco.', 'success');
            st.laudoId = data.id;
            await carregarTudo();
            render();
        } catch (err) {
            console.error('[importar]', err);
            btn.disabled = false; btn.textContent = 'Montar laudo';
            m.querySelector('#lo-imp-res').insertAdjacentHTML('afterbegin', `<p class="lo-imp-erro">Não consegui montar: ${esc(err.message || 'erro desconhecido')}</p>`);
        }
    }

    async function reimportarPacote(m) {
        const imp = st.importacao;
        if (!imp || imp.validacao.bloqueios.length) return;
        const btn = m.querySelector('#lo-imp-montar');
        btn.disabled = true; btn.textContent = 'Reimportando…';
        try {
            const e = editor();
            if (e.tem()) await e.gravar();
            const modelo = await obterModelo();
            const r = window.LaudoMesclar.reimportar({ atual: st.doc, original: st.laudo.documento_original, pacote: imp.pacote, modelo, banco: st.banco });
            const up = await sb().from('laudos_online').update({ documento_original: r.original }).eq('id', st.laudo.id);
            if (up.error) throw up.error;
            st.laudo.documento_original = r.original;
            const atual = st.doc;
            Object.keys(atual).forEach(k => { delete atual[k]; });
            Object.assign(atual, r.doc);
            const rs = r.resumo;
            const { data, error } = await sb().rpc('laudo_online_salvar', {
                p_id: st.laudo.id, p_revisao: st.laudo.revisao, p_documento: st.doc,
                p_eventos: [{ acao: 'reimportar', bloco_id: null, depois: Object.assign({ motor: (imp.pacote.origem || {}).motor || null }, rs) }]
            });
            if (error) throw error;
            if (!data || !data.ok) throw new Error((data && data.mensagem) || 'Não consegui gravar.');
            st.laudo.revisao = data.revisao;
            m.remove();
            reconferir(); render();
            const linhas = [
                [rs.substituidos.length, 'trecho(s) atualizado(s) com a versão nova (você não tinha mexido)'],
                [rs.novos.length, 'trecho(s) novo(s) inserido(s)'],
                [rs.removidos.length, 'trecho(s) que saíram do pacote foram para a lixeira'],
                [rs.conflitos.length, 'trecho(s) que você editou e o Gerador também mudou — marcados em amarelo para você decidir'],
                [rs.mantidos_fora.length, 'trecho(s) que você editou e saíram do pacote — ficaram, marcados']
            ].filter(x => x[0]);
            const md = document.createElement('div');
            md.className = 'lo-modal';
            md.innerHTML = `<div class="lo-modal-card" role="dialog" aria-modal="true"><h2>Reimportação feita</h2>
                ${linhas.length ? `<ul class="ed-resumo">${linhas.map(x => `<li><b>${x[0]}</b> ${esc(x[1])}</li>`).join('')}</ul>` : '<p>Nada mudou: o pacote é igual ao que já estava no laudo.</p>'}
                <div class="lo-modal-acoes"><button class="btn btn-primary" data-ok>Ver o laudo</button></div></div>`;
            document.body.appendChild(md);
            md.querySelector('[data-ok]').addEventListener('click', () => {
                md.remove();
                const alvo = document.querySelector('.tem-conflito, .ed-bloco .ed-conflito');
                if (alvo) alvo.scrollIntoView({ behavior: 'smooth', block: 'center' });
            });
        } catch (err) {
            console.error('[reimportar]', err);
            btn.disabled = false; btn.textContent = 'Reimportar';
            m.querySelector('#lo-imp-res').insertAdjacentHTML('afterbegin', `<p class="lo-imp-erro">Não consegui reimportar: ${esc(err.message || 'erro desconhecido')}</p>`);
        }
    }

    window.LaudoOnlinePagina = { estado: st };
})();

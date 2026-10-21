/* ============================================================================
   CORTEX · Laudo Online — PÁGINA  (frontend/laudo-online/laudo-online.js)
   ----------------------------------------------------------------------------
   Documento 3, §6 a §8:
     - LO-1: importar o pacote do Gerador, conferir com o banco e montar o laudo;
     - LO-2: impressão A4, PDF e assinatura;
     - LO-3: editor, lixeira e reimportação;
     - LO-4: finalizar com confirmações, congelar números (snapshot), status,
       nova versão e errata;
     - LO-5: página online (online.html) e Liberar online para portal e externo.
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
        bancoVivo: null,         // sempre o banco de agora (para comparar com o laudo finalizado)
        congelado: false,        // true: doc e banco vêm do snapshot da finalização
        mudancas: [], snapGlossario: {},
        urlsFig: {},             // links assinados das figuras das telas de correção (LO-6)
        glossario: {}, validacao: null, historico: [],
        importacao: null,
        visao: ['impressao', 'folhas'].includes(params.get('visao')) ? params.get('visao') : 'editor',
        modeloFolhas: (() => { try { return localStorage.getItem('cortex_lo_modelo_folhas') || 'claro'; } catch (e) { return 'claro'; } })(),
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
        st.bancoVivo = banco;
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
        if (st.editor) { st.editor.desligar(); st.editor = null; }   // o editor novo começa do documento recém-lido
        const { data, error } = await sb().from('laudos_online').select('*').eq('id', id).maybeSingle();
        if (error) throw error;
        if (!data) throw new Error('Laudo não encontrado ou sem permissão para abrir.');
        st.laudo = data;
        st.laudoId = data.id;
        st.ctxImp = null; st.impressao = null;
        const snap = data.status !== 'em_construcao' && data.snapshot && data.snapshot.formato === (window.LaudoSnapshot || {}).FORMATO ? data.snapshot : null;
        if (snap) {
            // Finalizado: texto e números só do snapshot. Recorrigir um teste não muda este laudo.
            st.congelado = true;
            st.doc = snap.documento;
            st.banco = window.LaudoSnapshot.bancoDe(snap);
            st.snapGlossario = snap.glossario || {};
            try { st.banco.paciente.foto_assinada = await window.LaudoDados.fotoAssinada(st.banco.paciente.foto_url); } catch (e) { /* sem foto */ }
            st.mudancas = window.LaudoSnapshot.comparar(st.banco, st.bancoVivo);
        } else {
            st.congelado = false;
            st.banco = st.bancoVivo;
            st.snapGlossario = {};
            st.mudancas = [];
            st.doc = data.status === 'em_construcao' || !data.snapshot ? data.documento : (data.snapshot.documento || data.documento);
        }
        await assinarFiguras();
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

    // Figuras das telas de correção (doc.figuras): links curtos para desenhar e imprimir.
    async function assinarFiguras() {
        st.urlsFig = {};
        const F = (st.doc && st.doc.figuras) || {};
        const arqs = [];
        Object.keys(F).forEach(sig => (F[sig].blocos || []).forEach(b => { if (b.arquivo) arqs.push(b.arquivo); }));
        if (arqs.length) {
            try {
                const r = await sb().storage.from('laudos-midia').createSignedUrls(arqs, 1800);
                ((r && r.data) || []).forEach(x => { if (x && x.signedUrl && x.path) st.urlsFig[x.path] = x.signedUrl; });
            } catch (e) { console.warn('[figuras] links', e); }
            const faltam = arqs.filter(a => !st.urlsFig[a]);
            for (const a of faltam) {
                try { const r = await sb().storage.from('laudos-midia').createSignedUrl(a, 1800); if (r.data) st.urlsFig[a] = r.data.signedUrl; } catch (e) { /* segue sem */ }
            }
        }
        if (window.LaudoGraf && window.LaudoGraf.usarFiguras) window.LaudoGraf.usarFiguras(F, st.urlsFig);
    }

    function reconferir() {
        if (!st.doc || st.congelado) { st.validacao = null; return; }
        let pacote = null;
        if (st.laudo && st.laudo.pacote_original) { const r = C().lerPacote(st.laudo.pacote_original); pacote = r.pacote || null; }
        st.validacao = C().validar(st.doc, st.banco, { pacote: pacote || st.doc });
    }

    function editavel() { return st.admClin && st.laudo && st.laudo.status === 'em_construcao' && !!window.LaudoEditor; }
    function editor() {
        if (!editavel()) return null;
        if (!st.editor || st.editor._laudo !== st.laudo.id) {
            st.editor = window.LaudoEditor.criar({
                estado: st, render, toast, capturarFigurasDe,
                conteudoLeitura: (b, ctx, sec) => conteudo(b, ctx, sec),
                // LO-8: outra pessoa gravou e o documento desta tela foi atualizado
                aoRemoto: async ({ figurasMudaram }) => { if (figurasMudaram) await assinarFiguras(); reconferir(); },
                recarregarLaudo: async () => {
                    st.editor = null;
                    try { await carregarTudo(); render(); } catch (e) { location.reload(); }
                },
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

    // Gravações feitas pela própria página (ajustes da impressão, figuras, reimportação).
    // Se outra pessoa gravou antes, junta as duas versões e tenta de novo (LO-8).
    async function salvarDoc(eventos) {
        let juntou = false;
        for (let t = 0; t < 5; t++) {
            const { data, error } = await sb().rpc('laudo_online_salvar', { p_id: st.laudo.id, p_revisao: st.laudo.revisao, p_documento: st.doc, p_eventos: eventos });
            if (error || !data || data.ok || data.erro !== 'revisao' || !st.editor) {
                if (!error && data && data.ok) { st.laudo.revisao = data.revisao; if (st.editor) st.editor.marcarSalvo(data.revisao); }
                return { data, error, juntou };
            }
            const ok = await st.editor.sincronizar({ semGravar: true });
            if (ok) juntou = true; else await new Promise(r => setTimeout(r, 400));
        }
        return { data: { ok: false, mensagem: 'Outra pessoa está gravando muito neste laudo agora. Tente de novo em instantes.' }, error: null, juntou };
    }

    function finalizado() { return !!(st.laudo && st.laudo.status !== 'em_construcao'); }
    function glossario() { return st.congelado ? Object.assign({}, st.glossario, st.snapGlossario) : st.glossario; }
    function linhaDoLaudo() { return st.laudos.find(v => st.laudo && v.id === st.laudo.id) || {}; }
    function quando(iso) { return iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : ''; }

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
        const errataTag = l && l.errata && l.status !== 'errata' ? '<span class="lo-status roxo">Errata</span>' : '';
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
            <span class="lo-status ${stCls}">${esc(stTxt)}</span>${errataTag}
            ${versoes}
            <nav class="lo-visoes" role="tablist" aria-label="Visões do laudo">
                <button role="tab" data-visao="editor" aria-selected="${st.visao === 'editor'}" ${l ? '' : 'disabled'}>Editor</button>
                <button role="tab" data-visao="impressao" aria-selected="${st.visao === 'impressao'}" ${l ? '' : 'disabled'}>Impressão</button>
                ${window.LaudoFolhasOnline ? `<button role="tab" data-visao="folhas" aria-selected="${st.visao === 'folhas'}" ${l ? '' : 'disabled'} title="A página online em folhas A4, para PDF">Impressão do online</button>` : ''}
                <button role="tab" data-visao="online" aria-selected="false" ${l ? '' : 'disabled'} title="A página interativa, como o paciente e o médico veem">Online ↗</button>
            </nav>
            <div class="lo-acoes">
                ${editavel() ? editor().statusHtml() : ''}
                ${l && !st.congelado ? '<button class="lo-btn" id="lo-reconferir" title="Lê os resultados do banco de novo e refaz as conferências">↻ Reconferir</button>' : ''}
                ${l && st.congelado ? '<button class="lo-btn" id="lo-reconferir" title="Compara os números deste laudo com o banco de agora. O laudo não muda.">↻ Comparar com o banco</button>' : ''}
                ${acoesStatus()}
                ${editavel() && window.LaudoFiguras ? '<button class="lo-btn" id="lo-figuras" title="Traz as tabelas, gráficos e cabeçalhos iguais aos das telas de correção de cada teste">📷 Figuras dos testes</button>' : ''}
                ${editavel() ? '<button class="lo-btn" id="lo-reimportar" title="Trazer uma versão revisada do pacote do Gerador sem perder suas edições">⟳ Reimportar</button>' : ''}
                ${l && l.status === 'em_construcao' && st.admClin ? '<button class="lo-btn" id="lo-descartar" title="Apaga esta versão em construção para importar de novo">🗑 Descartar</button>' : ''}
                ${podeImportar() && !finalizado() ? '<button class="lo-btn prim" id="lo-importar">⤓ Importar pacote</button>' : ''}
                ${editavel() ? '<button class="lo-btn prim" id="lo-finalizar" title="Confere tudo, pede as confirmações e congela o laudo">✓ Finalizar</button>' : ''}
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
        if (st.visao === 'folhas' && window.LaudoFolhasOnline) return folhasOnHtml();
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
        const fin = linhaDoLaudo();
        const ro = st.laudo.status !== 'em_construcao'
            ? `<div class="lo-faixa ok">Laudo finalizado${st.laudo.finalizado_em ? ` em ${esc(quando(st.laudo.finalizado_em))}` : ''}${(fin.finalizador || {}).nome_completo ? ` por ${esc(fin.finalizador.nome_completo)}` : ''}. Texto e números estão congelados; mudanças só em uma nova versão.</div>`
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
            if (b.tipo === 'tabela' && b.sigla) tags.push('<em class="lo-tag" title="Teste corrigido fora do CORTEX: os números são os do Gerador">números do Gerador · sem conferência</em>');
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
            case 'tabela': return `<table class="lo-tab"><thead><tr>${(b.cabecalho || []).map(h => `<th>${I(h, ctx)}</th>`).join('')}</tr></thead><tbody>${(b.linhas || []).map(l => `<tr>${l.map((cel, k) => celula(cel, ctx, b, k)).join('')}</tr>`).join('')}</tbody></table>${b.nota ? `<p class="lo-nota">${I(b.nota, ctx)}</p>` : ''}`;
            case 'imagem': return `<div class="lo-auto">🖼 Imagem <code>${esc(b.arquivo || '')}</code>${b.legenda ? ` — ${I(b.legenda, ctx)}` : ''}</div>`;
            case 'resultado': return `<div class="imp lo-imp-res">${window.LaudoGraf.render(b, st.banco, { glossario: glossario(), congelado: !!st.congelado })}</div>`;
            case 'cracha': return `
                <div class="lo-cracha">
                    <div><p class="nome">${esc(p.nome_completo || '')}</p>
                    <p><b>Idade:</b> ${esc(ctx.idade)} &nbsp; <b>Sexo:</b> ${esc(p.sexo || '')}</p>
                    <p><b>Escolaridade:</b> ${esc(p.escolaridade || '—')}</p></div>
                    ${p.foto_assinada ? `<img src="${esc(p.foto_assinada)}" alt="">` : `<span class="lo-ini">${esc(C().iniciais(p.nome_completo))}</span>`}
                </div>`;
            case 'acompanhe': return `<div class="lo-qr"><div class="lo-qr-q">QR</div><div><b>ACOMPANHE ESTE PACIENTE</b><p>${esc(b.texto || '')}</p></div></div>`;
            case 'convite': return `<div class="lo-qr"><div class="lo-qr-q">QR</div><div><b>Sua opinião faz a diferença!</b><p>${esc(b.texto || '')}</p></div></div>`;
            case 'classificacao_qi': return `${C().QI_ABRE}${(b.linhas || []).map(C().qiLinha).join('')}</tbody></table>`;
            case 'local_data': return `<p class="lo-p">${esc(b.cidade || 'Uberlândia — MG')}, ${esc(C().dataExtenso((st.doc.meta || {}).data_emissao || new Date().toISOString().slice(0, 10)))}.</p>`;
            case 'assinatura': return `<div class="lo-assin"><i></i><p>${esc(b.nome || '')}</p><small>${esc(b.registro || '')}</small></div>`;
            case 'quebra_pagina': return '<div class="lo-quebra">quebra de página</div>';
            case 'espaco': return `<div class="lo-espaco ${esc(b.altura || 'm')}"></div>`;
            default: return desconhecido(b);
        }
    }

    function celula(cel, ctx, b, k) {
        const c = C().celulaTabela(b || {}, cel, k), st = c.css ? ` style="${c.css}"` : '';
        if (c.selo) return `<td><span class="cl-selo cl-${c.fundo}"${st}>${I(c.texto, ctx)}</span></td>`;
        return `<td${c.fundo ? ` class="cl cl-${c.fundo}"` : ''}${st}>${I(c.texto, ctx)}</td>`;
    }

    function desconhecido(b) {
        return `<div class="lo-desc"><b>Bloco não reconhecido</b> (${esc(b.tipo)}). O conteúdo está guardado e aparece aqui sem formatação:<pre>${esc(JSON.stringify(b, null, 2))}</pre></div>`;
    }

    // ── Visão Impressão (LO-2) ────────────────────────────────────────────────
    async function trocarVisao(v) {
        if (!st.laudo || v === st.visao) return;
        if (st.editor && st.editor.tem()) await st.editor.gravar();
        if (v === 'online') { location.href = `online.html?paciente=${encodeURIComponent(st.pacienteId)}&laudo=${encodeURIComponent(st.laudo.id)}`; return; }
        st.visao = v;
        try { history.replaceState(null, '', `?paciente=${st.pacienteId}&laudo=${st.laudo.id}${v !== 'editor' ? '&visao=' + v : ''}`); } catch (e) { /* ok */ }
        render();
    }

    function rascunho() { return !!(st.laudo && st.laudo.status === 'em_construcao'); }

    function impressaoHtml() {
        const enviado = st.laudo.laudo_paciente_id
            ? '<span class="lo-imp-ok">PDF desta versão já enviado para a aba Laudo</span>' : '';
        const origem = st.congelado
            ? `Os números são os congelados na finalização${st.banco.carregado_em ? ` (lidos do banco em ${esc(quando(st.banco.carregado_em))})` : ''}.`
            : 'Os números vêm do banco.';
        const rasc = rascunho()
            ? `<span class="lo-imp-dica">Rascunho: o PDF sai com a marca <b>RASCUNHO</b>. ${st.admClin ? 'Para gerar o PDF que vai para assinatura, finalize o laudo.' : ''}</span>` : '';
        return `
        <div class="lo-imp-barra">
            <div class="lo-imp-info"><b id="lo-imp-pags">Paginando…</b><span>Folhas A4 iguais ao PDF. ${origem}</span>${enviado}${rasc}
                ${podeAjustar() ? '<span class="lo-imp-dica">Para ajustar as páginas, passe o mouse num trecho da folha: <b>↵ Espaço</b> empurra para baixo e <b>Página nova</b> começa outra folha.</span>' : ''}</div>
            <div class="lo-imp-acoes">
                ${st.admClin && !rascunho() ? '<button class="btn btn-secondary" id="lo-enviar-assinatura">✍️ Enviar para assinatura</button>' : ''}
                ${editavel() ? '<button class="btn btn-secondary" id="lo-finalizar-2">✓ Finalizar</button>' : ''}
                <button class="btn btn-primary" id="lo-gerar-pdf">${rascunho() ? '🖨 PDF de rascunho' : '🖨 Gerar PDF'}</button>
            </div>
        </div>
        <div class="lo-imp-aviso" id="lo-imp-aviso" hidden></div>
        <div id="lo-folhas" class="lo-folhas" aria-label="Folhas do laudo"></div>`;
    }

    // ── Impressão do online (LO-10): a página online em folhas A4 ──────────────
    function folhasOnHtml() {
        const M = window.LaudoFolhasOnline.MODELOS;
        const m = M[st.modeloFolhas] ? st.modeloFolhas : 'claro';
        return `
        <div class="lo-imp-barra">
            <div class="lo-imp-info"><b id="lo-flo-pags">Montando…</b>
                <span class="lo-flo-modelos" role="group" aria-label="Modelo">${Object.keys(M).map(k => `<button type="button" class="lo-flo-mod" data-flo-modelo="${k}" aria-pressed="${k === m}">${esc(M[k].nome)}</button>`).join('')}</span>
                <span id="lo-flo-dica">${esc(M[m].dica)}</span>
                ${rascunho() ? '<span class="lo-imp-dica">Rascunho: o PDF sai com a marca <b>RASCUNHO</b>.</span>' : ''}</div>
            <div class="lo-imp-acoes"><button class="btn btn-primary" id="lo-flo-pdf">${rascunho() ? '🖨 PDF de rascunho' : '🖨 Gerar PDF'}</button></div>
        </div>
        <div id="lo-folhas-on" class="lo-folhas-on" aria-label="Folhas da página online"></div>`;
    }
    let desenhandoOn = null;
    async function desenharFolhasOn() {
        const alvo = document.getElementById('lo-folhas-on');
        if (!alvo) return;
        const minha = desenhandoOn = Symbol('on');
        try {
            const ctx = await contextoImpressao();
            try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch (e) { /* ok */ }
            if (minha !== desenhandoOn) return;
            const r = window.LaudoFolhasOnline.desenhar(alvo, {
                modelo: st.modeloFolhas, rascunho: rascunho(),
                portfolio: { doc: st.doc, banco: st.banco, glossario: glossario(), imagens: ctx.imagens || {}, publico: true }
            });
            st.folhasOn = r;
            const el = document.getElementById('lo-flo-pags');
            if (el) el.textContent = `${r.paginas} folha${r.paginas === 1 ? '' : 's'}`;
        } catch (err) {
            console.error('[impressão do online]', err);
            alvo.innerHTML = `<div class="lo-faixa">Não consegui montar as folhas: ${esc(err.message || 'erro')}</div>`;
        }
    }
    async function gerarPdfOnline() {
        const origem = document.querySelector('#lo-folhas-on .flo');
        if (!origem || !origem.querySelector('.flo-folha')) { toast('As folhas ainda não ficaram prontas.', 'danger'); return; }
        let box = document.getElementById('lo-print-on');
        if (!box) { box = document.createElement('div'); box.id = 'lo-print-on'; document.body.appendChild(box); }
        box.innerHTML = origem.outerHTML;
        const tituloAntes = document.title;
        document.title = `Laudo Neuropsicológico - ${st.banco.paciente.nome_completo || ''} - v${st.laudo.versao}${rascunho() ? ' - RASCUNHO' : ''}`;
        document.body.classList.add('lo-imprimindo-on');
        let terminou = false;
        const fim = () => {
            if (terminou) return; terminou = true;
            document.body.classList.remove('lo-imprimindo-on');
            box.innerHTML = '';
            document.title = tituloAntes;
            window.removeEventListener('afterprint', fim);
        };
        window.addEventListener('afterprint', fim);
        window.CortexAudit && window.CortexAudit.log('geracao_pdf', 'laudos_online', st.laudo.id, {
            pacienteId: st.pacienteId, detalhes: { versao: st.laudo.versao, formato: 'online_em_folhas', modelo: st.modeloFolhas, paginas: (st.folhasOn || {}).paginas, rascunho: rascunho() }
        });
        await new Promise(r => setTimeout(r, 60));
        window.print();
        setTimeout(fim, 400);
    }

    async function contextoImpressao() {
        if (st.ctxImp) return st.ctxImp;
        const ctx = { banco: st.banco, glossario: glossario(), congelado: !!st.congelado, imagens: {} };
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
        Object.assign(ctx.imagens, st.urlsFig || {});
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
            alvo.classList.toggle('rascunho', rascunho());
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
    // tabelas montadas pelo laudo (não os resultados dos testes) que podem continuar na folha seguinte
    const TABELAS_AUTO = ['tabela', 'tabela_instrumentos', 'classificacao_qi', 'mapa', 'campos'];

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
        let temEspacoAcima = false, temPagina = false, tabela = null;
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
            if (TABELAS_AUTO.includes(r.b.tipo) && (r.b.tipo === 'campos' || (r.b.linhas || []).length > 1)) tabela = !!r.b.dividir_tabela;
            const a = anteriorVisivel(r.sec, r.i);
            temEspacoAcima = !!(a && a.b.tipo === 'espaco');
        }
        barraAjuste.innerHTML = `
            <button data-ajuste="espaco" title="Empurra este trecho para baixo, como dar Enter">↵ Espaço</button>
            ${temEspacoAcima ? '<button data-ajuste="tirar_espaco" title="Tira um espaço acima deste trecho">⌫ Tirar espaço</button>' : ''}
            <button data-ajuste="pagina" class="${temPagina ? 'ativo' : ''}" title="${temPagina ? 'Tira a página nova antes deste trecho' : 'Começa uma folha nova a partir deste trecho'}">${temPagina ? '✕ Tirar página nova' : '⤓ Página nova aqui'}</button>
            ${tabela === null ? '' : `<button data-ajuste="dividir_tabela" class="${tabela ? 'ativo' : ''}" title="${tabela ? 'A tabela volta a ficar inteira numa folha só' : 'O que não couber continua na folha seguinte, com o cabeçalho da tabela repetido'}">${tabela ? '✕ Não dividir a tabela' : '✂ Dividir a tabela entre páginas'}</button>`}`;
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
            if (acao === 'dividir_tabela') {
                const antes = !!r.b.dividir_tabela;
                if (antes) delete r.b.dividir_tabela; else r.b.dividir_tabela = true;
                eventos.push({ acao: 'editar', bloco_id: r.b.id, antes: { dividir_tabela: antes }, depois: { dividir_tabela: !antes } });
            } else if (acao === 'pagina') {
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
            const { data, error, juntou } = await salvarDoc(eventos);
            if (error) throw error;
            if (!data || !data.ok) {
                if (!juntou) { st.doc = JSON.parse(copia); st.laudo.documento = st.doc; }
                toast((data && data.mensagem) || 'Não consegui gravar.', 'danger');
                if (juntou) { st.impressao = null; render(); }
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
        box.className = 'imp' + (rascunho() ? ' rascunho' : '');
        box.style.setProperty('--escala', '1');
        const tituloAntes = document.title;
        document.title = `Laudo Neuropsicológico - ${st.banco.paciente.nome_completo || ''} - v${st.laudo.versao}${rascunho() ? ' - RASCUNHO' : ''}`;
        document.body.classList.add('lo-imprimindo');
        let terminou = false;
        const fim = () => {
            if (terminou) return; terminou = true;
            document.body.classList.remove('lo-imprimindo');
            box.innerHTML = '';
            document.title = tituloAntes;
            window.removeEventListener('afterprint', fim);
            if (st.admClin && !rascunho()) setTimeout(abrirEnvioAssinatura, 150);
        };
        window.addEventListener('afterprint', fim);
        window.CortexAudit && window.CortexAudit.log('geracao_pdf', 'laudos_online', st.laudo.id, {
            pacienteId: st.pacienteId, detalhes: { versao: st.laudo.versao, paginas: (st.impressao || {}).paginas, rascunho: rascunho() }
        });
        await new Promise(r => setTimeout(r, 60));
        window.print();
        setTimeout(fim, 400);
    }

    function abrirEnvioAssinatura() {
        if (!st.admClin || rascunho() || document.querySelector('.lo-modal')) return;
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
    function historicoHtml() {
        if (!st.admClin) return '';
        return `
            <h3>Histórico</h3>
            <ul class="lo-hist">${st.historico.length ? st.historico.map(h => `
                <li><b>${esc(acaoTxt(h.acao))}</b>${h.bloco_id ? ` <code>${esc(h.bloco_id)}</code>` : ''}<span>${esc(quando(h.em))} · ${esc((h.profissional || {}).nome_completo || '—')}</span></li>`).join('') : '<li class="vazio">Sem registros.</li>'}</ul>`;
    }

    // Laudo finalizado: o que foi confirmado e se o banco mudou depois.
    function painelFinalizado() {
        const fin = linhaDoLaudo();
        const lidos = st.banco.carregado_em ? quando(st.banco.carregado_em) : '';
        const mud = st.mudancas || [];
        const banco = mud.length
            ? `<div class="lo-chk aviso"><i>!</i><div><small>Banco · Depois da finalização</small><b>O banco mudou</b><p>${mud.map(m => esc(m.texto)).join('<br>')}</p>
                <p>Este laudo não muda.${st.admClin ? ' Para usar os números novos, crie uma <b>nova versão</b>.' : ''}</p></div></div>`
            : '<div class="lo-chk ok"><i>✓</i><div><small>Banco</small><b>Números iguais ao banco</b><p>Os resultados do banco continuam os mesmos que foram congelados.</p></div></div>';
        const aceites = Array.isArray(st.laudo.aceites) ? st.laudo.aceites : [];
        const conf = st.admClin ? `
            <h3>Confirmações da finalização</h3>
            ${aceites.length ? `<ul class="lo-aceites">${aceites.map(a => `
                <li class="${(NIVEL[a.nivel] || NIVEL.info)[1]}"><b>${esc(a.titulo)}</b>${a.detalhe ? `<p>${esc(a.detalhe)}</p>` : ''}${a.justificativa ? `<p class="just"><span>Justificativa:</span> ${esc(a.justificativa)}</p>` : ''}</li>`).join('')}</ul>`
                : '<p class="lo-painel-sub">Nenhum aviso precisou de confirmação.</p>'}` : '';
        return `
            <h3>Laudo finalizado <span class="lo-resumo ok">Congelado</span></h3>
            <p class="lo-painel-sub">${st.laudo.finalizado_em ? `Finalizado em ${esc(quando(st.laudo.finalizado_em))}` : 'Finalizado'}${(fin.finalizador || {}).nome_completo ? ` por ${esc(fin.finalizador.nome_completo)}` : ''}.${lidos ? ` Números lidos do banco em ${esc(lidos)}.` : ''}</p>
            <div class="lo-checks">${banco}</div>
            ${conf}
            ${historicoHtml()}`;
    }

    function painel() {
        if (st.congelado) return painelFinalizado();
        const v = st.validacao || { checks: [], pendencias: [] };
        const contagem = { erro: 0, aviso: 0 };
        v.checks.forEach(c => { const n = NIVEL[c.nivel] || NIVEL.info; if (n[1] === 'erro') contagem.erro++; else if (n[1] === 'aviso') contagem.aviso++; });
        const resumoTxt = contagem.erro ? `${contagem.erro} ponto(s) importante(s)` : contagem.aviso ? `${contagem.aviso} ponto(s) de atenção` : 'Tudo confere';
        const quando = st.banco.carregado_em ? new Date(st.banco.carregado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
        const hist = historicoHtml();
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
        if (st.visao === 'folhas' && st.laudo) {
            desenharFolhasOn();
            raiz.querySelectorAll('[data-flo-modelo]').forEach(bt => bt.addEventListener('click', () => {
                st.modeloFolhas = bt.dataset.floModelo;
                try { localStorage.setItem('cortex_lo_modelo_folhas', st.modeloFolhas); } catch (e) { /* ok */ }
                raiz.querySelectorAll('[data-flo-modelo]').forEach(x => x.setAttribute('aria-pressed', String(x === bt)));
                const d = raiz.querySelector('#lo-flo-dica'); if (d) d.textContent = window.LaudoFolhasOnline.MODELOS[st.modeloFolhas].dica;
                desenharFolhasOn();
            }));
            on('lo-flo-pdf', gerarPdfOnline);
        }
        on('lo-reconferir', async () => {
            try {
                st.bancoVivo = await window.LaudoDados.carregar(st.pacienteId);
                if (st.congelado) {
                    st.mudancas = window.LaudoSnapshot.comparar(st.banco, st.bancoVivo);
                    render();
                    toast(st.mudancas.length ? 'O banco mudou depois da finalização. Este laudo continua como foi finalizado.' : 'Os números do banco continuam iguais aos deste laudo.', st.mudancas.length ? 'info' : 'success');
                    return;
                }
                st.banco = st.bancoVivo;
                st.ctxImp = null; st.impressao = null;
                reconferir(); render();
                toast('Conferências refeitas com os dados atuais do banco.', 'success');
            } catch (e) { toast('Erro ao reconferir: ' + (e.message || ''), 'danger'); }
        });
        on('lo-finalizar', abrirFinalizar);
        on('lo-finalizar-2', abrirFinalizar);
        on('lo-nova-versao', abrirNovaVersao);
        on('lo-liberar', liberarOnline);
        on('lo-link', () => window.LaudoLink.abrir({ laudoId: st.laudo.id, versao: st.laudo.versao, pacienteId: st.pacienteId, pacienteNome: (st.banco.paciente || {}).nome_completo }));
        on('lo-figuras', () => abrirFiguras(false));
        raiz.querySelectorAll('[data-status]').forEach(bt => bt.addEventListener('click', () => mudarStatus(bt.dataset.status)));
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
        const g = glossario()[termo.toLowerCase()];
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

    // ── Finalizar (LO-4) ──────────────────────────────────────────────────────
    // Documento 1, §10 e §11: avisos não impedem, mas cada um pede confirmação;
    // número do texto diferente do banco pede justificativa.
    function itensParaAceitar(v) {
        const itens = [];
        (v.checks || []).forEach(c => {
            if (c.nivel !== 'importante' && c.nivel !== 'atencao') return;
            let detalhe = c.detalhe || '';
            if (c.id === 'pendencias') detalhe += ' As pendências saem em cinza no PDF.';
            if (c.id === 'identificacao') detalhe += ' A confirmação fica registrada na auditoria.';
            itens.push({ id: c.id, nivel: c.nivel, titulo: c.titulo, detalhe, justificar: c.id === 'conferencia' });
        });
        let conflitos = 0;
        const semDados = [];
        C().cadaBloco(st.doc, b => {
            if (b._conflito) conflitos++;
            if (b.tipo === 'resultado' && !b.oculto && b.exibir !== 'online' && window.LaudoGraf && window.LaudoGraf.indisponivel) {
                const m = window.LaudoGraf.indisponivel(b, st.banco);
                if (m) semDados.push(m);
            }
        });
        if (conflitos) itens.push({ id: 'conflitos', nivel: 'atencao', titulo: 'Conflitos da reimportação sem decisão',
            detalhe: `${conflitos} trecho(s) marcado(s) em amarelo. Fica o texto atual; a versão nova do Gerador é descartada.` });
        if (semDados.length) itens.push({ id: 'resultados_sem_dados', nivel: 'atencao', titulo: 'Gráficos que não saem no laudo',
            detalhe: Array.from(new Set(semDados)).join('; ') + '.' });
        return itens;
    }

    function atualizarPainel() {
        const p = document.querySelector('.lo-painel');
        if (p) { p.innerHTML = painel(); ligarPainel(p); }
    }

    async function abrirFinalizar() {
        if (!editavel() || document.querySelector('.lo-modal')) return;
        try {
            if (st.editor && st.editor.tem()) await st.editor.gravar();
            // números de agora: é isto que vai ser congelado
            st.bancoVivo = await window.LaudoDados.carregar(st.pacienteId);
            st.banco = st.bancoVivo;
            st.ctxImp = null; st.impressao = null;
            reconferir();
            atualizarPainel();
        } catch (e) { toast('Não consegui ler o banco para finalizar: ' + (e.message || ''), 'danger'); return; }
        const v = st.validacao;
        if (v.bloqueios.length) { toast('Este laudo tem um bloqueio de segurança: ' + v.bloqueios.map(b => b.detalhe).join(' '), 'danger'); return; }
        const itens = itensParaAceitar(v);
        const l = st.laudo;
        const m = document.createElement('div');
        m.className = 'lo-modal';
        m.innerHTML = `
            <div class="lo-modal-card lo-fin" role="dialog" aria-modal="true" aria-labelledby="lo-fin-tit">
                <h2 id="lo-fin-tit">Finalizar o Laudo Online v${esc(l.versao)}${l.errata ? ' (errata)' : ''}</h2>
                <p>Ao finalizar, o texto e os números do banco ficam <b>congelados</b> nesta versão. Recorrigir um teste depois não muda este laudo; mudanças só em uma nova versão. Depois você gera o PDF e envia para assinatura.</p>
                ${itens.length ? `
                <h3>Confirme ${itens.length === 1 ? 'o aviso' : `os ${itens.length} avisos`}</h3>
                <div class="lo-fin-itens">${itens.map((it, i) => {
                    const n = NIVEL[it.nivel] || NIVEL.info;
                    return `
                    <div class="lo-fin-item ${n[1]}">
                        <label><input type="checkbox" data-aceite="${i}">
                            <span><small>${esc(n[0])}</small><b>${esc(it.titulo)}</b><em>${esc(it.detalhe)}</em></span></label>
                        ${it.justificar ? `<textarea data-just="${i}" rows="2" placeholder="Justificativa obrigatória: por que o número do texto é diferente do banco?"></textarea>` : ''}
                    </div>`;
                }).join('')}</div>`
                : '<div class="lo-chk ok"><i>✓</i><div><small>Conferências</small><b>Tudo confere</b><p>Nenhum aviso para confirmar.</p></div></div>'}
                <label class="lo-fin-final"><input type="checkbox" id="lo-fin-revisei"> Revisei o laudo e quero finalizar a versão ${esc(l.versao)}.</label>
                <div id="lo-fin-res" aria-live="polite"></div>
                <div class="lo-modal-acoes">
                    <button class="btn btn-secondary" id="lo-fin-cancelar">Cancelar</button>
                    <button class="btn btn-primary" id="lo-fin-ok" disabled>✓ Finalizar laudo</button>
                </div>
            </div>`;
        document.body.appendChild(m);
        const $ = s => m.querySelector(s);
        const btn = $('#lo-fin-ok');
        const pronto = () => {
            const todos = itens.every((it, i) => {
                if (!$(`[data-aceite="${i}"]`).checked) return false;
                return !it.justificar || $(`[data-just="${i}"]`).value.trim().length >= 10;
            });
            btn.disabled = !(todos && $('#lo-fin-revisei').checked);
        };
        m.querySelectorAll('input, textarea').forEach(el => el.addEventListener('input', pronto));
        m.querySelectorAll('input[type=checkbox]').forEach(el => el.addEventListener('change', pronto));
        $('#lo-fin-cancelar').addEventListener('click', () => m.remove());
        m.addEventListener('click', ev => { if (ev.target === m) m.remove(); });
        btn.addEventListener('click', async () => {
            btn.disabled = true; btn.textContent = 'Finalizando…';
            const res = $('#lo-fin-res');
            res.innerHTML = '';
            try {
                const prof = (window.cortexProfissional || {}).id || null;
                const agora = new Date().toISOString();
                const aceites = itens.map((it, i) => ({
                    id: it.id, nivel: it.nivel, titulo: it.titulo, detalhe: it.detalhe,
                    justificativa: it.justificar ? $(`[data-just="${i}"]`).value.trim() : null, por: prof, em: agora
                }));
                const snap = window.LaudoSnapshot.montar({
                    doc: st.doc, banco: st.banco, glossario: st.glossario,
                    modelo: { id: l.modelo_id || null, versao: l.modelo_versao || null }, validacao: v
                });
                const { data, error } = await sb().rpc('laudo_online_finalizar', { p_id: l.id, p_revisao: l.revisao, p_snapshot: snap, p_aceites: aceites });
                if (error) throw error;
                if (!data || !data.ok) {
                    const extra = data && data.erro === 'revisao' ? ' Recarregue a página (Ctrl+Shift+R) e finalize de novo.' : '';
                    res.innerHTML = `<p class="lo-imp-erro">${esc(((data && data.mensagem) || 'Não consegui finalizar.') + extra)}</p>`;
                    btn.textContent = '✓ Finalizar laudo'; pronto();
                    return;
                }
                m.remove();
                st.editor = null;
                st.laudoId = l.id;
                st.visao = 'impressao';
                await carregarTudo();
                render();
                toast('Laudo finalizado e congelado. Agora gere o PDF e envie para assinatura.', 'success');
            } catch (err) {
                console.error('[finalizar]', err);
                res.innerHTML = `<p class="lo-imp-erro">Não consegui finalizar: ${esc(err.message || 'erro desconhecido')}</p>`;
                btn.textContent = '✓ Finalizar laudo'; pronto();
            }
        });
    }

    // ── Status, nova versão e errata (LO-4) ───────────────────────────────────
    function acoesStatus() {
        const l = st.laudo;
        if (!st.admClin || !finalizado()) return '';
        const out = [];
        if (l.status === 'pronto_para_devolutiva') out.push('<button class="lo-btn" data-status="devolutiva_realizada" title="A devolutiva desta versão foi feita">✓ Devolutiva feita</button>');
        if (l.status === 'devolutiva_realizada' || l.status === 'errata') out.push('<button class="lo-btn" data-status="entregue" title="O laudo assinado foi entregue">📦 Entregue</button>');
        out.push(l.online_liberado_em
            ? '<button class="lo-btn lo-btn-lib on" id="lo-liberar" title="O paciente vê no portal e o médico externo com acesso aprovado vê no prontuário. Clique para desligar.">🌐 Online liberado</button>'
            : '<button class="lo-btn lo-btn-lib" id="lo-liberar" title="Mostra a página online no portal do paciente e para o médico externo com acesso aprovado">🌐 Liberar online</button>');
        if (window.LaudoLink) out.push('<button class="lo-btn" id="lo-link" title="Link curto que abre só a página online deste laudo, sem senha e sem acesso ao sistema">🔗 Enviar link</button>');
        if (!st.laudos.some(v => v.status === 'em_construcao')) out.push('<button class="lo-btn prim" id="lo-nova-versao" title="Cria uma versão nova, em construção, a partir desta">＋ Nova versão</button>');
        return out.join('');
    }

    function mudarStatus(para) {
        const l = st.laudo;
        if (!st.admClin || !finalizado()) return;
        const txt = {
            devolutiva_realizada: ['Marcar devolutiva feita?', `A devolutiva do Laudo Online v${l.versao} foi realizada.`],
            entregue: ['Marcar como entregue?', `O Laudo Online v${l.versao} assinado foi entregue.${l.laudo_paciente_id ? '' : ' Atenção: ainda não há PDF desta versão na aba Laudo.'}`]
        }[para];
        if (!txt) return;
        window.CortexConfirm.mostrar({
            icone: para === 'entregue' ? '📦' : '✓', titulo: txt[0], texto: txt[1], btnSim: 'Sim, marcar', btnNao: 'Cancelar',
            onSim: async () => {
                const de = l.status;
                const { error } = await sb().from('laudos_online').update({ status: para, atualizado_por: (window.cortexProfissional || {}).id || null }).eq('id', l.id);
                if (error) { toast('Não consegui mudar o status: ' + (error.message || ''), 'danger'); return; }
                window.CortexAudit && await window.CortexAudit.log('edicao', 'laudos_online', l.id, {
                    pacienteId: st.pacienteId, detalhes: { evento: 'status', versao: l.versao, de, para }
                });
                await carregarTudo();
                render();
                toast(para === 'entregue' ? 'Laudo marcado como entregue.' : 'Devolutiva marcada como feita.', 'success');
            }
        });
    }

    // Liberar online (LO-5): portal do paciente e médico externo com escopo `laudos`.
    function liberarOnline() {
        const l = st.laudo;
        if (!st.admClin || !finalizado()) return;
        const ligar = !l.online_liberado_em;
        window.CortexConfirm.mostrar({
            icone: '🌐',
            titulo: ligar ? `Liberar a página online da v${l.versao}?` : `Tirar a página online da v${l.versao} do ar?`,
            texto: ligar
                ? 'O paciente passa a ver a página no portal, e o médico externo com acesso aprovado (escopo Laudos) vê no prontuário. Notas internas e pendências não aparecem; as anotações (💬) aparecem para todos.'
                : 'O paciente e o médico externo deixam de ver a página online desta versão. O PDF assinado continua como está.',
            btnSim: ligar ? 'Sim, liberar' : 'Sim, tirar do ar', btnNao: 'Cancelar', btnSimDanger: !ligar,
            onSim: async () => {
                const { data, error } = await sb().rpc('laudo_online_liberar', { p_id: l.id, p_liberar: ligar });
                if (error || !data || !data.ok) { toast('Não consegui: ' + ((data && data.mensagem) || (error && error.message) || ''), 'danger'); return; }
                window.CortexAudit && await window.CortexAudit.log('edicao', 'laudos_online', l.id, {
                    pacienteId: st.pacienteId, detalhes: { evento: 'liberar_online', versao: l.versao, liberado: ligar }
                });
                await carregarTudo();
                render();
                toast(ligar ? 'Página online liberada no portal e para o médico externo.' : 'Página online tirada do ar.', 'success');
            }
        });
    }

    function abrirNovaVersao() {
        const l = st.laudo;
        if (!st.admClin || !finalizado() || document.querySelector('.lo-modal')) return;
        if (st.laudos.some(v => v.status === 'em_construcao')) { toast('Já existe uma versão em construção para este paciente.', 'info'); return; }
        const prox = Math.max.apply(null, st.laudos.map(v => v.versao || 0)) + 1;
        const jaEntregue = l.status === 'devolutiva_realizada' || l.status === 'entregue';
        const m = document.createElement('div');
        m.className = 'lo-modal';
        m.innerHTML = `
            <div class="lo-modal-card lo-fin" role="dialog" aria-modal="true" aria-labelledby="lo-nv-tit">
                <h2 id="lo-nv-tit">Criar a versão ${prox}</h2>
                <p>A versão ${prox} nasce em construção com o texto da v${esc(l.versao)}. A v${esc(l.versao)} continua íntegra e assinada. Na versão nova os números voltam a vir do banco de agora.</p>
                <div class="lo-nv-opcoes">
                    <label><input type="radio" name="lo-nv" value="versao" ${jaEntregue ? '' : 'checked'}>
                        <span><b>Nova versão</b><em>Ajuste antes da entrega, ou números recorrigidos.</em></span></label>
                    <label><input type="radio" name="lo-nv" value="errata" ${jaEntregue ? 'checked' : ''}>
                        <span><b>Errata</b><em>Corrige um laudo que já foi entregue. A versão nova sai marcada como errata.</em></span></label>
                </div>
                <div id="lo-nv-res" aria-live="polite"></div>
                <div class="lo-modal-acoes">
                    <button class="btn btn-secondary" id="lo-nv-cancelar">Cancelar</button>
                    <button class="btn btn-primary" id="lo-nv-ok">Criar versão ${prox}</button>
                </div>
            </div>`;
        document.body.appendChild(m);
        m.querySelector('#lo-nv-cancelar').addEventListener('click', () => m.remove());
        m.addEventListener('click', ev => { if (ev.target === m) m.remove(); });
        m.querySelector('#lo-nv-ok').addEventListener('click', async ev => {
            const bt = ev.currentTarget;
            const errata = (m.querySelector('input[name=lo-nv]:checked') || {}).value === 'errata';
            bt.disabled = true; bt.textContent = 'Criando…';
            try {
                const { data, error } = await sb().rpc('laudo_online_nova_versao', { p_id: l.id, p_errata: errata });
                if (error) throw error;
                if (!data || !data.ok) throw new Error((data && data.mensagem) || 'Não consegui criar a versão.');
                window.CortexAudit && await window.CortexAudit.log('criacao', 'laudos_online', data.id, {
                    pacienteId: st.pacienteId, detalhes: { evento: 'nova_versao', de_versao: l.versao, errata }
                });
                m.remove();
                st.editor = null;
                st.laudoId = data.id;
                st.visao = 'editor';
                await carregarTudo();
                render();
                toast(`Versão ${prox}${errata ? ' (errata)' : ''} criada em construção.`, 'success');
            } catch (err) {
                console.error('[nova versão]', err);
                bt.disabled = false; bt.textContent = `Criar versão ${prox}`;
                m.querySelector('#lo-nv-res').innerHTML = `<p class="lo-imp-erro">${esc(err.message || 'erro desconhecido')}</p>`;
            }
        });
    }

    // ── Figuras das telas de correção (LO-6) ──────────────────────────────────
    function aplicacoesComTela() {
        const vistas = new Set(), lista = [];
        (st.banco.aplicacoes || []).forEach(a => {      // a mais recente de cada teste, já corrigida
            if (!a.corrigida || vistas.has(a.sigla)) return;
            vistas.add(a.sigla); lista.push({ id: a.id, sigla: a.sigla, nome: a.nome });
        });
        return lista;
    }

    // Abre as telas de correção, fotografa as partes e grava em doc.figuras.
    // Usado pelo botão 📷 e pelo editor ("Trazer da tela de correção").
    async function capturarFiguras(alvo, aoProgresso) {
        if (st.editor && st.editor.tem()) await st.editor.gravar();
        const r = await window.LaudoFiguras.capturar({ client: sb(), pacienteId: st.pacienteId, laudoId: st.laudo.id, aplicacoes: alvo, aoProgresso });
        const novas = Object.keys(r.figuras);
        if (novas.length) {
            const antes = Object.keys(st.doc.figuras || {});
            st.doc.figuras = Object.assign({}, st.doc.figuras || {}, r.figuras);
            const { data, error } = await salvarDoc([{ acao: 'editar', bloco_id: null, antes: { figuras: antes }, depois: { figuras_capturadas: novas } }]);
            if (error || !data || !data.ok) return { novas: [], erros: r.erros, erroGravar: (data && data.mensagem) || (error && error.message) || 'erro ao gravar' };
            st.laudo.revisao = data.revisao;
            st.laudo.documento = st.doc;
            window.CortexAudit && window.CortexAudit.log('edicao', 'laudos_online', st.laudo.id, { pacienteId: st.pacienteId, detalhes: { evento: 'figuras', testes: novas } });
            await assinarFiguras();
            st.ctxImp = null; st.impressao = null;
        }
        return { novas, erros: r.erros };
    }
    async function capturarFigurasDe(sigla) {
        const alvo = aplicacoesComTela().filter(a => a.sigla === sigla);
        if (!alvo.length) return { novas: [], erros: { [sigla]: 'este teste não tem tela de correção com laudo' } };
        return capturarFiguras(alvo);
    }

    function abrirFiguras(aposImportar) {
        if (!editavel() || document.querySelector('.lo-modal')) return;
        const lista = aplicacoesComTela();
        const F = st.doc.figuras || {};
        const quando = iso => iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '';
        const m = document.createElement('div');
        m.className = 'lo-modal';
        m.innerHTML = `
            <div class="lo-modal-card lo-fin" role="dialog" aria-modal="true" aria-labelledby="lo-fig-tit">
                <h2 id="lo-fig-tit">📷 Figuras dos testes</h2>
                <p>${aposImportar ? '<b>Laudo montado.</b> ' : ''}O CORTEX abre a tela de correção de cada teste e traz o cabeçalho, as tabelas e os gráficos <b>iguais aos que vocês copiam com 📷 e 📋</b>. Depois você escolhe no editor qual figura vai em cada lugar (inclusive <b>só o cabeçalho</b>). Leva alguns segundos por teste. Dados de identificação ficam de fora.</p>
                ${lista.length ? `<div class="lo-fig-lista">${lista.map(a => {
                    const f = F[a.sigla];
                    const est = f ? `${(f.blocos || []).length} figura(s) · ${quando(f.capturado_em)}${f.aplicacao_id !== a.id ? ' · <b>há correção mais nova</b>' : ''}` : 'ainda não capturadas';
                    return `<label class="lo-fig-item"><input type="checkbox" data-fig="${esc(a.id)}" ${!f || f.aplicacao_id !== a.id ? 'checked' : ''}>
                        <span><b>${esc(a.sigla)}</b><em data-fig-est="${esc(a.id)}">${est}</em></span></label>`;
                }).join('')}</div>` : '<p class="lo-imp-erro">Nenhum teste corrigido no CORTEX para este paciente.</p>'}
                <div id="lo-fig-res" aria-live="polite"></div>
                <div class="lo-modal-acoes">
                    <button class="btn btn-secondary" id="lo-fig-fechar">${aposImportar ? 'Agora não' : 'Fechar'}</button>
                    ${lista.length ? '<button class="btn btn-primary" id="lo-fig-ok">📷 Capturar as marcadas</button>' : ''}
                </div>
            </div>`;
        document.body.appendChild(m);
        const $ = s => m.querySelector(s);
        let rodando = false;
        $('#lo-fig-fechar').addEventListener('click', () => { if (!rodando) m.remove(); });
        const ok = $('#lo-fig-ok');
        if (!ok) return;
        ok.addEventListener('click', async () => {
            const ids = [...m.querySelectorAll('[data-fig]:checked')].map(x => x.dataset.fig);
            const alvo = lista.filter(a => ids.includes(a.id));
            if (!alvo.length) { toast('Marque ao menos um teste.', 'info'); return; }
            rodando = true; ok.disabled = true; $('#lo-fig-fechar').disabled = true; ok.textContent = 'Capturando…';
            const r = await capturarFiguras(alvo, (i, n, sigla, msg) => {
                const a = alvo.find(x => x.sigla === sigla);
                const el = a && m.querySelector(`[data-fig-est="${a.id}"]`);
                if (el) el.textContent = msg;
                $('#lo-fig-res').innerHTML = `<p class="lo-painel-sub">${i} de ${n} testes…</p>`;
            });
            if (r.erroGravar) {
                $('#lo-fig-res').innerHTML = `<p class="lo-imp-erro">As figuras foram tiradas, mas não consegui gravar no laudo: ${esc(r.erroGravar)}</p>`;
                rodando = false; $('#lo-fig-fechar').disabled = false; ok.textContent = 'Tentar de novo'; ok.disabled = false;
                return;
            }
            const novas = r.novas;
            const errs = Object.keys(r.erros);
            rodando = false;
            m.remove();
            render();
            if (novas.length) toast(`${novas.length} teste(s) com figuras: ${novas.join(', ')}.`, 'success');
            if (errs.length) toast(`Sem figura: ${errs.map(s => s + ' (' + r.erros[s] + ')').join('; ')}`, 'danger');
        });
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

    // ── Resultados dos testes de fora (pacote.lancados → resultados_lancados) ──
    const CAMPOS_LANC = ['nome', 'bruto', 'pontos', 'acertos', 'erros', 'omissoes', 'valor', 'ponderado', 'escore', 'intervalo', 'percentil', 'classificacao', 'padronizado', 'z', 'achado'];
    const CTX_LANC = ['norma', 'respondente', 'forma', 'versao', 'ano_escolar', 'sessoes'];
    function camposLanc(o) {
        const r = {};
        CAMPOS_LANC.forEach(k => { if (o && o[k] !== undefined && o[k] !== null && o[k] !== '') r[k] = o[k]; });
        return r;
    }
    async function lancarDoPacote(pacote) {
        const L = pacote && pacote.lancados;
        if (!L || typeof L !== 'object') return null;
        const grupos = {};
        const naBateria = (st.banco.aplicacoes || []).map(a => a.sigla);
        Object.keys(L).forEach(sig => {
            // sigla do Gerador → sigla do catálogo (igual, equivalente ou "SON-R 6-40" ↔ "SON-R")
            const x = L[sig] || {}, eq = C().equivalente(sig), alvo = C().siglaNoCortex(sig, naBateria) || (eq ? eq.sigla : sig);
            const g = grupos[alvo] = grupos[alvo] || { medidas: {}, contexto: {}, de: [] };
            g.de.push(sig);
            if (x.medidas && typeof x.medidas === 'object') Object.keys(x.medidas).forEach(k => { g.medidas[k] = Object.assign(g.medidas[k] || {}, camposLanc(x.medidas[k])); });
            if (eq && eq.parte) { const cp = camposLanc(x); if (Object.keys(cp).length) { const k = eq.parte.toLowerCase(); g.medidas[k] = Object.assign(g.medidas[k] || {}, cp); } }
            CTX_LANC.forEach(k => { if (x[k]) g.contexto[k] = String(x[k]); });
            if (x.contexto && typeof x.contexto === 'object') Object.assign(g.contexto, x.contexto);
            if (x.observacoes) g.observacoes = String(x.observacoes);
        });
        const out = { feitos: [], semBateria: [], erros: [] };
        for (const alvo of Object.keys(grupos)) {
            const g = grupos[alvo];
            const apl = (st.banco.aplicacoes || []).filter(a => a.sigla === alvo);
            const a = apl.find(x => x.corrigida) || apl[apl.length - 1];
            if (!a) { out.semBateria.push(...g.de); continue; }
            try {
                const ex = await sb().from('resultados_lancados').select('dados').eq('aplicacao_id', a.id).maybeSingle();
                if (ex.error) throw ex.error;
                const d = (ex.data && ex.data.dados) || { versao: 1, medidas: {}, contexto: {} };
                d.medidas = d.medidas || {}; d.contexto = d.contexto || {};
                Object.keys(g.medidas).forEach(k => { d.medidas[k] = Object.assign(d.medidas[k] || {}, g.medidas[k]); });
                Object.assign(d.contexto, g.contexto);
                if (g.observacoes && !d.observacoes) d.observacoes = g.observacoes;
                d.origem = 'gerador';
                const up = await sb().from('resultados_lancados').upsert({ aplicacao_id: a.id, dados: d, updated_at: new Date().toISOString() }, { onConflict: 'aplicacao_id' });
                if (up.error) throw up.error;
                if (!['corrigido', 'integrado_laudo'].includes(a.status)) {
                    const us = await sb().from('aplicacoes_instrumento').update({ status: 'corrigido', data_conclusao: a.data_conclusao || new Date().toISOString() }).eq('id', a.id);
                    if (us.error) throw us.error;
                }
                out.feitos.push(alvo);
            } catch (e) {
                console.warn('[lancados]', alvo, e);
                out.erros.push(`${alvo} (${e.message || e})`);
            }
        }
        if (out.feitos.length) window.CortexAudit && window.CortexAudit.log('edicao', 'resultados_lancados', null, { pacienteId: st.pacienteId, detalhes: { evento: 'lancados_do_gerador', testes: out.feitos } });
        return out;
    }
    function avisarLancados(r) {
        if (!r) return;
        if (r.feitos.length) toast(`Resultados preenchidos a partir do Gerador: ${r.feitos.join(', ')}.`, 'success');
        if (r.semBateria.length) toast(`Não estão na bateria do paciente (as tabelas não saem): ${r.semBateria.join(', ')}.`, 'warning');
        if (r.erros.length) toast(`Não consegui gravar os resultados de: ${r.erros.join('; ')}`, 'danger');
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
            avisarLancados(await lancarDoPacote(imp.pacote));
            await carregarTudo();
            render();
            if (window.LaudoFiguras) setTimeout(() => abrirFiguras(true), 300);
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
            const { data, error } = await salvarDoc([{ acao: 'reimportar', bloco_id: null, depois: Object.assign({ motor: (imp.pacote.origem || {}).motor || null }, rs) }]);
            if (error) throw error;
            if (!data || !data.ok) throw new Error((data && data.mensagem) || 'Não consegui gravar.');
            st.laudo.revisao = data.revisao;
            m.remove();
            const lr = await lancarDoPacote(imp.pacote);
            if (lr && lr.feitos.length) await carregarTudo();
            avisarLancados(lr);
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

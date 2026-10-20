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
        importacao: null
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
        const { data, error } = await sb().from('laudos_online').select('*').eq('id', id).maybeSingle();
        if (error) throw error;
        if (!data) throw new Error('Laudo não encontrado ou sem permissão para abrir.');
        st.laudo = data;
        st.laudoId = data.id;
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
                <button role="tab" aria-selected="true">Editor</button>
                <button role="tab" aria-selected="false" disabled title="Chega na sprint LO-2">Impressão</button>
                <button role="tab" aria-selected="false" disabled title="Chega na sprint LO-5">Online</button>
            </nav>
            <div class="lo-acoes">
                ${l ? '<button class="lo-btn" id="lo-reconferir" title="Lê os resultados do banco de novo e refaz as conferências">↻ Reconferir</button>' : ''}
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
        const ro = st.laudo.status !== 'em_construcao'
            ? '<div class="lo-faixa ok">Laudo finalizado. Mudanças agora só em uma nova versão.</div>'
            : '<div class="lo-faixa">Modo leitura. A edição dos blocos chega na sprint LO-3.</div>';
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
            case 'resultado': return resultado(b);
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

    // ── Resultado (prévia com números do banco; desenho completo no LO-2) ─────
    function resultado(b) {
        const sig = b.sigla, vista = b.vista, op = b.opcoes || {};
        const r = (st.banco.resultados || {})[sig];
        const cab = `<div class="lo-res-cab"><b>${esc(sig)}</b><span>${esc(vista)}${op.indice ? ' · ' + esc(op.indice) : ''}</span><em>do banco</em></div>`;
        if (!C().vistasDe(sig).includes(vista)) return `<div class="lo-res aviso">${cab}<p>Componente ainda não construído: vista "${esc(vista)}".</p></div>`;
        if (!C().SIGLAS_DO_CORTEX.includes(sig)) return `<div class="lo-res info">${cab}<p>Escala online: o desenho com dados do banco chega na sprint LO-6.</p></div>`;
        if (!r) return `<div class="lo-res aviso">${cab}<p>Teste ainda não corrigido no CORTEX para este paciente.</p></div>`;
        let corpo = '';
        if (vista === 'resumo') {
            const rs = window.LaudoDados.resumo(sig, st.banco);
            corpo = rs ? `<p class="lo-res-obs">${esc(rs.principal)} <b>${esc(rs.valor)}</b> ${selo(rs.classificacao)}</p>` : '';
        } else if (sig === 'WAIS-III' || sig === 'WISC-IV') corpo = resWechsler(r, vista, op);
        else if (sig === 'RAVLT' || sig === 'FDT') corpo = resMedidas(r, vista);
        else if (sig === 'BFP') corpo = resBfp(r, vista, op);
        const ap = r._aplicacao || {};
        return `<div class="lo-res">${cab}${corpo}<p class="lo-res-rod">Aplicação de ${esc(C().dataBR(ap.data_aplicacao) || '—')}${r.calculado_em ? ` · calculado em ${esc(C().dataBR(r.calculado_em))}` : ''} · desenho final na impressão (LO-2)</p></div>`;
    }

    function selo(txt) { return `<span class="lo-selo cl-${C().faixa(txt) || 'med'}">${esc(txt || '—')}</span>`; }

    function resWechsler(r, vista, op) {
        const comp = r.compostos || {};
        const linha = k => { const c = comp[k]; if (!c) return ''; return `<tr><td class="esq">${esc(C().NOMES_INDICE[k] || k)} <small>${esc(k === 'QI_TOTAL' ? 'QIT' : k)}</small></td><td><b>${esc(c.composto)}</b></td><td>${esc(c.percentil != null ? c.percentil : '')}</td><td>${c.ic95 ? esc(c.ic95.join('–')) : ''}</td><td>${selo(c.classificacao)}</td></tr>`; };
        const tab = ks => `<table class="lo-tab mini"><thead><tr><th>Índice</th><th>Composto</th><th>Percentil</th><th>IC 95%</th><th>Classificação</th></tr></thead><tbody>${ks.map(linha).join('')}</tbody></table>`;
        const icg = r._icg && r._icg.composto != null ? `<tr><td class="esq">Índice de Capacidade Geral <small>ICG</small></td><td><b>${esc(r._icg.composto)}</b></td><td>${esc(r._icg.percentil || '')}</td><td>${r._icg.ic95 ? esc(r._icg.ic95.join('–')) : ''}</td><td>${selo(r._icg.classificacao)}</td></tr>` : '';
        const interp = r._interpretacao;
        const aviso = interp ? `<p class="lo-res-obs">Amplitude entre índices: <b>${esc(interp.amplitude)}</b> pontos — QIT ${interp.qitInterpretavel ? 'interpretável' : '<b>não interpretável</b> (regra dos 23); leitura pelo ICG'}.</p>` : '';
        if (vista === 'indice') return tab([op.indice || 'ICV']);
        if (vista === 'cabecalho') return `<p class="lo-res-obs">Faixa normativa ${esc(r.faixa_norma || '—')} · idade ${esc(r.idade_anos != null ? r.idade_anos + ' anos' : '—')}</p>${tab(['QI_TOTAL'])}`;
        if (vista === 'qit_icg') return `<table class="lo-tab mini"><thead><tr><th>Índice</th><th>Composto</th><th>Percentil</th><th>IC 95%</th><th>Classificação</th></tr></thead><tbody>${linha('QI_TOTAL')}${icg}</tbody></table>${aviso}`;
        if (vista === 'intervalos') return tab(['ICV', 'IOP', 'IMO', 'IVP', 'QI_TOTAL']);
        if (vista === 'discrepancias') return `<table class="lo-tab mini"><thead><tr><th>Par</th><th>Diferença</th><th>Valor crítico</th><th>Significativa</th></tr></thead><tbody>${(r.discrepancias || []).map(d => `<tr><td class="esq">${esc(d.par)}</td><td>${esc(d.diff)}</td><td>${esc(d.vc != null ? d.vc : '')}</td><td>${d.sig ? 'Sim' : 'Não'}</td></tr>`).join('')}</tbody></table>`;
        if (vista === 'perfil_subtestes' || vista === 'tabela_subtestes') {
            const pond = r.ponderados || {};
            return `<div class="lo-chips">${Object.keys(pond).filter(k => pond[k] != null).map(k => `<span><b>${esc(k)}</b> ${esc(pond[k])}</span>`).join('')}</div>`;
        }
        return tab(['QI_TOTAL']);
    }

    function resMedidas(r, vista) {
        const ms = r.medidas || [];
        const pct = m => m.pctLabel != null ? m.pctLabel : (m.pct != null ? m.pct : '');
        const lista = vista === 'resumo' ? ms.filter(m => m.key === 'Total' || m.key === 'CI') : ms;
        return `<table class="lo-tab mini"><thead><tr><th>Medida</th><th>Bruto</th><th>Percentil</th><th>Classificação</th></tr></thead><tbody>${lista.map(m => `
            <tr><td class="esq">${esc(m.label || m.key)}</td><td><b>${esc(m.raw)}</b></td><td>${esc(pct(m))}</td><td>${selo((m.classificacao || {}).label)}</td></tr>`).join('')}</tbody></table>`;
    }

    function resBfp(r, vista, op) {
        const pf = r.percentil_fatores || {}, cf = r.classificacao_fatores || {}, eb = r.eb_fatores || {};
        const ks = op.fator ? [op.fator] : ['N', 'E', 'S', 'R', 'A'];
        return `<table class="lo-tab mini"><thead><tr><th>Fator</th><th>Escore bruto</th><th>Percentil</th><th>Classificação</th></tr></thead><tbody>${ks.map(k => `
            <tr><td class="esq">${esc(C().FATORES_BFP[k] || k)}</td><td>${esc(eb[k] != null ? eb[k] : '')}</td><td><b>${esc(pf[k] != null ? pf[k] : '')}</b></td><td>${selo(cf[k])}</td></tr>`).join('')}</tbody></table>`;
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
            ${hist}`;
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
        on('lo-reconferir', async () => {
            try {
                st.banco = await window.LaudoDados.carregar(st.pacienteId);
                reconferir(); render();
                toast('Conferências refeitas com os dados atuais do banco.', 'success');
            } catch (e) { toast('Erro ao reconferir: ' + (e.message || ''), 'danger'); }
        });
        const sel = raiz.querySelector('#lo-versao');
        if (sel) sel.addEventListener('change', () => abrirLaudo(sel.value).catch(e => toast(e.message, 'danger')));
        raiz.querySelectorAll('[data-ir]').forEach(a => a.addEventListener('click', ev => {
            ev.preventDefault(); const el = document.getElementById('sec-' + a.dataset.ir); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }));
        raiz.querySelectorAll('[data-ir-bloco]').forEach(li => li.addEventListener('click', () => {
            const el = document.getElementById('b-' + li.dataset.irBloco);
            if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('piscar'); setTimeout(() => el.classList.remove('piscar'), 1600); }
        }));
        raiz.querySelectorAll('.lo-termo').forEach(t => {
            t.addEventListener('click', () => balao(t));
            t.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); balao(t); } });
        });
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
    function abrirImportar() {
        if (!podeImportar()) { toast('Já existe um Laudo Online em construção para este paciente.', 'info'); return; }
        st.importacao = null;
        const m = document.createElement('div');
        m.className = 'lo-modal';
        m.innerHTML = `
            <div class="lo-modal-card" role="dialog" aria-modal="true" aria-labelledby="lo-imp-tit">
                <h2 id="lo-imp-tit">Importar pacote do Gerador</h2>
                <p>Cole o conteúdo do arquivo <code>.cortex.json</code> ou escolha o arquivo. O código do paciente no pacote precisa ser <b>${esc(st.banco.paciente.codigo || '—')}</b>.</p>
                <textarea id="lo-imp-txt" spellcheck="false" placeholder='{ "formato": "cortex-laudo", "versao_formato": "2.0", ... }'></textarea>
                <div class="lo-imp-linha">
                    <label class="lo-btn sec"><input type="file" id="lo-imp-arq" accept=".json,application/json" hidden>📎 Escolher arquivo</label>
                    <span id="lo-imp-nome" class="lo-imp-nome"></span>
                    <button class="lo-btn sec" id="lo-imp-conferir">Conferir</button>
                </div>
                <div id="lo-imp-res" aria-live="polite"></div>
                <div class="lo-modal-acoes">
                    <button class="btn btn-secondary" id="lo-imp-cancelar">Cancelar</button>
                    <button class="btn btn-primary" id="lo-imp-montar" disabled>Montar laudo</button>
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
        $('lo-imp-montar').addEventListener('click', () => montarEGravar(m));
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

    window.LaudoOnlinePagina = { estado: st };
})();

// ============================================================================
// CORTEX_APP — documentos.js
// ----------------------------------------------------------------------------
// Aba "Documentos" do prontuário: anexos gerais em PDF.
//
// Laudo e relatório escolar continuam nas telas próprias — aqui vai o resto:
// encaminhamento médico, exame, relatório de outro profissional, termo
// assinado, receita, documento pessoal.
//
// Anexar e apagar: só admin (clínico e gestor). Ver: quem tem vínculo com o
// paciente. Isso é decidido pelas policies, não aqui — a tela apenas esconde
// o que o banco recusaria.
//
// Cuidado no upload: a política de leitura do bucket descobre o dono do
// arquivo consultando documentos_paciente. Se o arquivo subir e o INSERT
// falhar, o arquivo fica órfão e invisível para todos — por isso, se o
// INSERT falhar, apagamos o arquivo antes de reportar o erro.
//
// API: window.CortexDocumentos
//   .render(pacienteId)  -> HTML da aba
//   .carregar(pacienteId)
// ============================================================================

window.CortexDocumentos = (function () {
    'use strict';

    const BUCKET = 'documentos-paciente';
    const MAX_MB = 20;

    const CATEGORIAS = {
        encaminhamento:    { nome: 'Encaminhamento',        ic: '📨', cor: '#2F6FED' },
        exame:             { nome: 'Exame',                 ic: '🔬', cor: '#06B6D4' },
        relatorio_externo: { nome: 'Relatório externo',     ic: '📄', cor: '#7C4DFF' },
        termo:             { nome: 'Termo assinado',        ic: '✍️', cor: '#22C55E' },
        receita:           { nome: 'Receita',               ic: '💊', cor: '#EC4899' },
        documento_pessoal: { nome: 'Documento pessoal',     ic: '🪪', cor: '#F59E0B' },
        outro:             { nome: 'Outro',                 ic: '📎', cor: '#64748B' }
    };

    let ctx = { pacienteId: null, itens: [], carregando: false, erro: null };

    const c = () => window.cortexClient;
    const esc = (t) => { const d = document.createElement('div'); d.textContent = t ?? ''; return d.innerHTML; };
    const toast = (m, t) => { if (window.CortexUI?.toast) window.CortexUI.toast(m, t); };

    const ehAdmin = () => {
        const p = window.cortexProfissional?.perfil;
        return p === 'admin_clinico' || p === 'admin_gestor';
    };

    function dataHora(iso) {
        if (!iso) return '—';
        const d = new Date(iso);
        return isNaN(d) ? '—' : d.toLocaleDateString('pt-BR') + ' às ' +
            d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }

    function tamanho(bytes) {
        if (!bytes) return '';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
        return (bytes / 1024 / 1024).toFixed(1) + ' MB';
    }

    // ── Carga ───────────────────────────────────────────────────────────────

    async function carregar(pacienteId) {
        ctx.pacienteId = pacienteId;
        ctx.carregando = true;
        ctx.erro = null;

        try {
            const { data, error } = await c()
                .from('documentos_paciente')
                .select('*, autor:created_by(nome_completo)')
                .eq('paciente_id', pacienteId)
                .eq('ativo', true)
                .order('created_at', { ascending: false });
            if (error) throw error;
            ctx.itens = data || [];
        } catch (err) {
            console.error('[documentos] carregar:', err);
            ctx.erro = err.message || String(err);
        } finally {
            ctx.carregando = false;
        }
        pintar();
    }

    // ── Render ──────────────────────────────────────────────────────────────

    function render(pacienteId) {
        setTimeout(() => carregar(pacienteId), 0);
        return `
            <div class="etapa-content">
                <div class="doc-topo">
                    <div>
                        <h3 class="doc-titulo">Documentos</h3>
                        <p class="doc-sub">
                            Encaminhamentos, exames, relatórios de outros profissionais e termos.
                            Laudos ficam na aba Laudo.
                        </p>
                    </div>
                    ${ehAdmin() ? `
                    <button class="btn btn-primary btn-sm" id="doc-btn-anexar">📎 Anexar documento</button>
                    <input type="file" id="doc-file" accept="application/pdf" style="display:none">` : ''}
                </div>
                <div id="doc-lista">
                    <div class="doc-carregando"><div class="doc-spin"></div> Carregando…</div>
                </div>
            </div>`;
    }

    function pintar() {
        const alvo = document.getElementById('doc-lista');
        if (!alvo) return;

        if (ctx.erro) {
            alvo.innerHTML = `<div class="doc-vazio"><div class="doc-vazio-ic">⚠️</div>
                <strong>Não foi possível carregar</strong>${esc(ctx.erro)}</div>`;
            return;
        }

        if (!ctx.itens.length) {
            alvo.innerHTML = `<div class="doc-vazio">
                <div class="doc-vazio-ic">📎</div>
                <strong>Nenhum documento anexado</strong>
                ${ehAdmin()
                    ? 'Use o botão acima para anexar um PDF.'
                    : 'Somente a administração pode anexar documentos.'}</div>`;
            ligarBotoes();
            return;
        }

        alvo.innerHTML = `<div class="doc-grid">${ctx.itens.map(cardHtml).join('')}</div>`;
        ligarBotoes();
    }

    function cardHtml(d) {
        const cat = CATEGORIAS[d.categoria] || CATEGORIAS.outro;
        return `
            <div class="doc-card" data-id="${d.id}" style="--c:${cat.cor}">
                <div class="doc-card-ic">${cat.ic}</div>
                <div class="doc-card-corpo">
                    <div class="doc-card-titulo">${esc(d.titulo)}</div>
                    <div class="doc-card-cat">${esc(cat.nome)}</div>
                    ${d.arquivo_assinado_path ? `
                    <div class="doc-assinado">
                        🔒 Assinado digitalmente · ${esc(d.assinante_nome || '')} · ${dataHora(d.assinado_em)}
                    </div>` : ''}
                    ${d.observacao ? `<div class="doc-card-obs">${esc(d.observacao)}</div>` : ''}
                    <div class="doc-card-meta">
                        <span>${esc(d.autor?.nome_completo || '—')}</span>
                        <span>${dataHora(d.created_at)}</span>
                        ${d.arquivo_tamanho_bytes ? `<span>${tamanho(d.arquivo_tamanho_bytes)}</span>` : ''}
                    </div>
                </div>
                <div class="doc-card-acoes">
                    ${!d.arquivo_assinado_path && podeAssinar()
                        ? `<button class="doc-mini doc-mini-assinar" data-assinar="${d.id}" title="Assinar com certificado ICP-Brasil">✍️ Assinar</button>` : ''}
                    <button class="doc-mini" data-ver="${d.id}" title="Ver">👁</button>
                    <button class="doc-mini" data-baixar="${d.id}" title="Baixar">⬇</button>
                    ${ehAdmin() ? `<button class="doc-mini perigo" data-apagar="${d.id}" title="Apagar">🗑</button>` : ''}
                </div>
            </div>`;
    }

    function ligarBotoes() {
        const btn = document.getElementById('doc-btn-anexar');
        const inp = document.getElementById('doc-file');
        if (btn && inp) {
            btn.onclick = () => inp.click();
            inp.onchange = escolherArquivo;
        }
        document.querySelectorAll('[data-ver]').forEach(b =>
            b.addEventListener('click', () => abrir(b.dataset.ver, false)));
        document.querySelectorAll('[data-baixar]').forEach(b =>
            b.addEventListener('click', () => abrir(b.dataset.baixar, true)));
        document.querySelectorAll('[data-apagar]').forEach(b =>
            b.addEventListener('click', () => apagar(b.dataset.apagar)));
        document.querySelectorAll('[data-assinar]').forEach(b =>
            b.addEventListener('click', () => abrirAssinatura(b.dataset.assinar)));
    }

    // ── Upload ──────────────────────────────────────────────────────────────

    function escolherArquivo(ev) {
        const file = ev.target.files[0];
        ev.target.value = '';
        if (!file) return;

        if (file.type !== 'application/pdf') {
            toast('Apenas arquivos PDF são aceitos.', 'danger');
            return;
        }
        if (file.size > MAX_MB * 1024 * 1024) {
            toast(`Arquivo muito grande. Máximo: ${MAX_MB}MB.`, 'danger');
            return;
        }

        const sugestao = file.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim();

        window.CortexPop.abrir({
            titulo: 'Anexar documento',
            subtitulo: file.name,
            tone: 'blue',
            tamanho: 'sm',
            persistente: true,
            html: `
                <div class="doc-campo">
                    <label>Título *</label>
                    <input id="doc-titulo" value="${esc(sugestao)}" placeholder="Como este documento será identificado">
                </div>
                <div class="doc-campo">
                    <label>Tipo</label>
                    <select id="doc-categoria">
                        ${Object.entries(CATEGORIAS).map(([k, v]) =>
                            `<option value="${k}" ${k === 'outro' ? 'selected' : ''}>${v.ic} ${esc(v.nome)}</option>`).join('')}
                    </select>
                </div>
                <div class="doc-campo">
                    <label>Observação <span style="font-weight:400;text-transform:none">(opcional)</span></label>
                    <textarea id="doc-obs" rows="3" placeholder="De onde veio, para que serve"></textarea>
                </div>
                <div class="doc-hint">${esc(file.name)} · ${tamanho(file.size)}</div>`,
            rodape: [
                { label: 'Cancelar', classe: 'btn-secondary' },
                { label: 'Anexar', classe: 'btn-primary', fechar: false,
                  onClick: (j) => enviar(file, j) }
            ]
        });
    }

    async function enviar(file, janela) {
        const titulo = janela.corpo.querySelector('#doc-titulo').value.trim();
        if (!titulo) { toast('Informe um título.', 'danger'); return false; }

        const categoria = janela.corpo.querySelector('#doc-categoria').value;
        const obs = janela.corpo.querySelector('#doc-obs').value.trim();

        const path = `${ctx.pacienteId}/${Date.now()}.pdf`;

        try {
            const { error: errUp } = await c().storage
                .from(BUCKET)
                .upload(path, file, { contentType: 'application/pdf', upsert: false });
            if (errUp) throw errUp;

            const { data: { user } } = await c().auth.getUser();
            const { data: novo, error: errIns } = await c()
                .from('documentos_paciente')
                .insert({
                    paciente_id: ctx.pacienteId,
                    titulo: titulo,
                    categoria: categoria,
                    observacao: obs || null,
                    arquivo_path: path,
                    arquivo_nome_original: file.name,
                    arquivo_tamanho_bytes: file.size,
                    created_by: window.cortexProfissional?.id || null
                })
                .select('id')
                .single();

            if (errIns) {
                // Sem a linha na tabela, a policy do bucket não acha o dono
                // e o arquivo fica invisível para todos. Melhor remover.
                await c().storage.from(BUCKET).remove([path]).catch(() => {});
                throw errIns;
            }

            if (window.CortexAudit) {
                window.CortexAudit.log('criacao', 'documentos_paciente', novo.id, {
                    pacienteId: ctx.pacienteId,
                    detalhes: { operacao: 'anexar_documento', titulo, categoria,
                                arquivo: file.name, tamanho: file.size }
                });
            }

            janela.fecharJanela();
            toast('Documento anexado.', 'success');
            await carregar(ctx.pacienteId);
            return true;
        } catch (err) {
            console.error('[documentos] enviar:', err);
            toast('Erro ao anexar: ' + (err.message || ''), 'danger');
            return false;
        }
    }

    // ── Abrir e baixar ──────────────────────────────────────────────────────

    async function abrir(id, baixar) {
        const d = ctx.itens.find(x => x.id === id);
        if (!d) return;

        // Assinado: é a versão assinada que vale e que sai para fora.
        const caminho = d.arquivo_assinado_path || d.arquivo_path;
        const nomeArq = d.arquivo_assinado_path
            ? (d.titulo || 'documento').replace(/[\\/:*?"<>|]/g, '') + ' (assinado).pdf'
            : (d.arquivo_nome_original || (d.titulo + '.pdf'));

        try {
            const { data, error } = await c().storage
                .from(BUCKET)
                .createSignedUrl(caminho, 600);
            if (error || !data?.signedUrl) throw error || new Error('URL não gerada');

            if (window.CortexAudit) {
                window.CortexAudit.log('leitura', 'documentos_paciente', d.id, {
                    pacienteId: ctx.pacienteId,
                    detalhes: { operacao: baixar ? 'baixar_documento' : 'ver_documento',
                                titulo: d.titulo }
                });
            }

            if (baixar) {
                const a = document.createElement('a');
                a.href = data.signedUrl;
                a.download = nomeArq;
                a.rel = 'noopener';
                document.body.appendChild(a); a.click(); a.remove();
                return;
            }

            if (window.CortexPrevia) {
                window.CortexPrevia.arquivo({
                    bucket: BUCKET,
                    path: caminho,
                    nome: nomeArq,
                    titulo: d.titulo,
                    subtitulo: (CATEGORIAS[d.categoria] || CATEGORIAS.outro).nome
                });
            } else {
                window.open(data.signedUrl, '_blank', 'noopener');
            }
        } catch (err) {
            console.error('[documentos] abrir:', err);
            toast('Erro ao abrir: ' + (err.message || ''), 'danger');
        }
    }

    // ── Assinatura digital ──────────────────────────────────────────────────
    // O profissional escolhe na tela onde o selo fica; a Edge Function
    // assinar-documento desenha o selo exatamente ali e assina com o
    // certificado A1 guardado nos secrets.
    //
    // Quem de fato pode assinar é decidido no servidor (CERT_A1_ASSINANTES).
    // Aqui o botão só aparece para admin clínico, para não oferecer a quem
    // receberia recusa.

    const PDFJS_VER = '3.11.174';
    const SELO_W = 240, SELO_H = 52;       // mesmas medidas da Edge Function

    function podeAssinar() {
        return window.cortexProfissional?.perfil === 'admin_clinico';
    }

    async function carregarPdfJs() {
        if (window.pdfjsLib) return window.pdfjsLib;
        await new Promise((res, rej) => {
            const sc = document.createElement('script');
            sc.src = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VER}/pdf.min.js`;
            sc.onload = res;
            sc.onerror = () => rej(new Error('Não foi possível carregar o visualizador de PDF.'));
            document.head.appendChild(sc);
        });
        window.pdfjsLib.GlobalWorkerOptions.workerSrc =
            `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VER}/pdf.worker.min.js`;
        return window.pdfjsLib;
    }

    async function abrirAssinatura(id) {
        const d = ctx.itens.find(x => x.id === id);
        if (!d) return;

        let pdf;
        try {
            const pdfjs = await carregarPdfJs();
            const { data, error } = await c().storage.from(BUCKET).createSignedUrl(d.arquivo_path, 600);
            if (error || !data?.signedUrl) throw error || new Error('URL não gerada');
            const bytes = await (await fetch(data.signedUrl)).arrayBuffer();
            pdf = await pdfjs.getDocument({ data: bytes }).promise;
        } catch (err) {
            console.error('[documentos] abrir para assinar:', err);
            toast('Não consegui abrir o PDF: ' + (err.message || ''), 'danger');
            return;
        }

        const st = { pagina: 0, total: pdf.numPages, pos: null, ptW: 0, ptH: 0 };

        const janela = window.CortexPop.abrir({
            titulo: 'Assinar documento',
            subtitulo: d.titulo,
            tone: 'blue',
            tamanho: 'xl',
            persistente: true,
            html: `
                <div class="ass-topo">
                    <div class="ass-instrucao">
                        Toque ou clique no lugar da página onde a assinatura deve ficar.
                    </div>
                    <div class="ass-nav">
                        <button class="doc-mini" id="ass-ant" title="Página anterior">‹</button>
                        <span id="ass-pag">1 / ${st.total}</span>
                        <button class="doc-mini" id="ass-prox" title="Próxima página">›</button>
                    </div>
                </div>
                <div class="ass-palco" id="ass-palco">
                    <div class="ass-folha" id="ass-folha">
                        <canvas id="ass-canvas"></canvas>
                        <div class="ass-selo" id="ass-selo" style="display:none">
                            <strong>Documento assinado digitalmente</strong>
                            <span>assinatura ICP-Brasil</span>
                        </div>
                    </div>
                </div>
                <div class="ass-aviso">
                    A assinatura digital tem o mesmo valor legal da assinatura de próprio punho
                    do titular do certificado. Depois de assinado, o documento não pode ser alterado.
                </div>`,
            rodape: [
                { label: 'Cancelar', classe: 'btn-secondary' },
                { label: 'Assinar aqui', classe: 'btn-primary', fechar: false,
                  onClick: (j) => confirmarAssinatura(d, st, j) }
            ]
        });

        const corpo = janela.corpo;
        const canvas = corpo.querySelector('#ass-canvas');
        const folha  = corpo.querySelector('#ass-folha');
        const selo   = corpo.querySelector('#ass-selo');
        const lblPag = corpo.querySelector('#ass-pag');

        function btnAssinar() {
            return janela.el?.querySelector('.cx-pop-foot .btn-primary') ||
                   document.querySelector('.cx-pop:last-of-type .btn-primary');
        }
        function atualizarBotao() {
            const b = btnAssinar();
            if (b) b.disabled = !st.pos;
        }

        async function desenhar() {
            const page = await pdf.getPage(st.pagina + 1);
            const base = page.getViewport({ scale: 1 });
            st.ptW = base.width; st.ptH = base.height;

            // Cabe na largura da janela, sem passar de ~720px de largura útil
            const largura = Math.min(corpo.querySelector('#ass-palco').clientWidth - 24, 720);
            const escala = largura / base.width;
            const vp = page.getViewport({ scale: escala * (window.devicePixelRatio || 1) });

            canvas.width = vp.width;
            canvas.height = vp.height;
            canvas.style.width = (base.width * escala) + 'px';
            canvas.style.height = (base.height * escala) + 'px';
            await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;

            lblPag.textContent = `${st.pagina + 1} / ${st.total}`;
            // Trocar de página desfaz a escolha: a posição vale por página.
            st.pos = null;
            selo.style.display = 'none';
            atualizarBotao();
        }

        // Clique marca o CENTRO do selo, em fração da página — o mesmo
        // sistema que a Edge Function usa, então não depende do zoom.
        function posicionar(clientX, clientY) {
            const r = canvas.getBoundingClientRect();
            let fx = (clientX - r.left) / r.width;
            let fy = (clientY - r.top) / r.height;
            if (fx < 0 || fx > 1 || fy < 0 || fy > 1) return;

            const wFrac = SELO_W / st.ptW, hFrac = SELO_H / st.ptH;
            fx = Math.max(wFrac / 2, Math.min(1 - wFrac / 2, fx));
            fy = Math.max(hFrac / 2, Math.min(1 - hFrac / 2, fy));
            st.pos = { pagina: st.pagina, x: fx, y: fy };

            selo.style.display = 'flex';
            selo.style.width  = (wFrac * r.width) + 'px';
            selo.style.height = (hFrac * r.height) + 'px';
            selo.style.left   = ((fx - wFrac / 2) * r.width) + 'px';
            selo.style.top    = ((fy - hFrac / 2) * r.height) + 'px';
            atualizarBotao();
        }

        folha.addEventListener('click', (e) => posicionar(e.clientX, e.clientY));
        corpo.querySelector('#ass-ant').addEventListener('click', () => {
            if (st.pagina > 0) { st.pagina--; desenhar(); }
        });
        corpo.querySelector('#ass-prox').addEventListener('click', () => {
            if (st.pagina < st.total - 1) { st.pagina++; desenhar(); }
        });

        // Abre na última página: é onde a assinatura costuma ficar.
        st.pagina = st.total - 1;
        setTimeout(desenhar, 60);
        setTimeout(atualizarBotao, 80);
    }

    async function confirmarAssinatura(d, st, janela) {
        if (!st.pos) {
            toast('Escolha na página onde a assinatura vai ficar.', 'info');
            return false;
        }
        if (!confirm(`Assinar "${d.titulo}" com o certificado digital?\n\nO documento assinado não poderá ser alterado.`)) {
            return false;
        }

        const btn = janela.el?.querySelector('.cx-pop-foot .btn-primary');
        const txt = btn ? btn.textContent : '';
        if (btn) { btn.disabled = true; btn.textContent = 'Assinando…'; }

        try {
            const { data, error } = await c().functions.invoke('assinar-documento', {
                body: { documento_id: d.id, pagina: st.pos.pagina, x: st.pos.x, y: st.pos.y }
            });

            // Erro HTTP: a mensagem útil vem no corpo da resposta
            if (error) {
                let msg = error.message || 'Erro ao assinar.';
                try { const b = await error.context?.json(); if (b?.erro) msg = b.erro; } catch (_) {}
                throw new Error(msg);
            }
            if (!data?.ok) throw new Error(data?.erro || 'Erro ao assinar.');

            janela.fecharJanela();
            toast('Documento assinado.', 'success');
            await carregar(ctx.pacienteId);
            return true;
        } catch (err) {
            console.error('[documentos] assinar:', err);
            toast(err.message || 'Erro ao assinar.', 'danger');
            if (btn) { btn.disabled = false; btn.textContent = txt; }
            return false;
        }
    }

    // ── Apagar ──────────────────────────────────────────────────────────────

    function apagar(id) {
        const d = ctx.itens.find(x => x.id === id);
        if (!d) return;

        window.CortexConfirm.mostrar({
            icone: '🗑️',
            titulo: `Apagar “${d.titulo}”?`,
            texto: 'O arquivo é removido em definitivo. A auditoria guarda o registro de quem apagou.',
            btnSim: 'Sim, apagar', btnNao: 'Cancelar', btnSimDanger: true,
            onSim: async () => {
                try {
                    if (window.CortexAudit) {
                        window.CortexAudit.log('delecao', 'documentos_paciente', d.id, {
                            pacienteId: ctx.pacienteId,
                            detalhes: { operacao: 'apagar_documento', titulo: d.titulo,
                                        categoria: d.categoria,
                                        arquivo: d.arquivo_nome_original,
                                        anexado_em: d.created_at }
                        });
                    }

                    const { error } = await c().from('documentos_paciente').delete().eq('id', d.id);
                    if (error) throw error;

                    // Arquivo depois do registro: se a remoção falhar, sobra
                    // arquivo órfão — ruim, mas melhor que registro apontando
                    // para arquivo inexistente.
                    await c().storage.from(BUCKET)
                        .remove([d.arquivo_path, d.arquivo_assinado_path].filter(Boolean)).catch(
                        e => console.warn('[documentos] arquivo não removido:', e));

                    toast('Documento apagado.', 'success');
                    await carregar(ctx.pacienteId);
                } catch (err) {
                    console.error('[documentos] apagar:', err);
                    toast('Erro ao apagar: ' + (err.message || ''), 'danger');
                }
            }
        });
    }

    return { render, carregar, CATEGORIAS };
})();

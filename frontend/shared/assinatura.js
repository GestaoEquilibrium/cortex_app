// ============================================================================
// CORTEX_APP — assinatura.js
// ----------------------------------------------------------------------------
// Assinatura digital com o certificado A1 ICP-Brasil, compartilhada entre a
// aba Documentos e a aba Laudo do prontuário.
//
// Mostra o PDF numa janela suspensa, o profissional toca onde o selo deve
// ficar, e a Edge Function assinar-documento desenha o selo ali e assina.
//
// Quem assina: admin clínico e admin gestor, pelo certificado do titular.
// O botão só aparece para esses perfis; o servidor confere de novo.
//
// API: window.CortexAssinatura
//   .podeAssinar()                          -> boolean
//   .abrir({ tipo, id, bucket, path, titulo, onAssinado })
//        tipo: 'documento' | 'laudo'
// ============================================================================

window.CortexAssinatura = (function () {
    'use strict';

    const PDFJS_VER = '3.11.174';
    const SELO_W = 240, SELO_H = 52;       // mesmas medidas da Edge Function

    const c = () => window.cortexClient;
    const toast = (m, t) => { if (window.CortexUI?.toast) window.CortexUI.toast(m, t); };

    function podeAssinar() {
        const p = window.cortexProfissional?.perfil;
        return p === 'admin_clinico' || p === 'admin_gestor';
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

    async function abrir(op) {
        if (!window.CortexPop) { toast('Sistema de janelas não carregou.', 'danger'); return; }

        let pdf;
        try {
            const pdfjs = await carregarPdfJs();
            const { data, error } = await c().storage.from(op.bucket).createSignedUrl(op.path, 600);
            if (error || !data?.signedUrl) throw error || new Error('URL não gerada');
            const bytes = await (await fetch(data.signedUrl)).arrayBuffer();
            pdf = await pdfjs.getDocument({ data: bytes }).promise;
        } catch (err) {
            console.error('[assinatura] abrir:', err);
            toast('Não consegui abrir o PDF: ' + (err.message || ''), 'danger');
            return;
        }

        const st = { pagina: 0, total: pdf.numPages, pos: null, ptW: 0, ptH: 0 };

        const janela = window.CortexPop.abrir({
            titulo: 'Assinar ' + (op.tipo === 'laudo' ? 'laudo' : 'documento'),
            subtitulo: op.titulo || '',
            tone: 'blue',
            tamanho: 'xl',
            persistente: true,
            html: `
                <div class="ass-topo">
                    <div class="ass-instrucao">
                        Toque ou clique no lugar da página onde a assinatura deve ficar.
                    </div>
                    <div class="ass-nav">
                        <button class="ass-nav-btn" id="ass-ant" title="Página anterior">‹</button>
                        <span id="ass-pag">1 / ${st.total}</span>
                        <button class="ass-nav-btn" id="ass-prox" title="Próxima página">›</button>
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
                    do titular do certificado. Depois de assinado, o arquivo não pode ser alterado.
                </div>`,
            rodape: [
                { label: 'Cancelar', classe: 'btn-secondary' },
                { label: 'Assinar aqui', classe: 'btn-primary', fechar: false,
                  onClick: (j) => confirmar(op, st, j) }
            ]
        });

        const corpo  = janela.corpo;
        const canvas = corpo.querySelector('#ass-canvas');
        const folha  = corpo.querySelector('#ass-folha');
        const selo   = corpo.querySelector('#ass-selo');
        const lblPag = corpo.querySelector('#ass-pag');

        function atualizarBotao() {
            const b = janela.el?.querySelector('.cx-pop-foot .btn-primary');
            if (b) b.disabled = !st.pos;
        }

        async function desenhar() {
            const page = await pdf.getPage(st.pagina + 1);
            const base = page.getViewport({ scale: 1 });
            st.ptW = base.width; st.ptH = base.height;

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

        // O clique marca o CENTRO do selo, em fração da página — o mesmo
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

    async function confirmar(op, st, janela) {
        if (!st.pos) {
            toast('Escolha na página onde a assinatura vai ficar.', 'info');
            return false;
        }
        const oque = op.tipo === 'laudo' ? 'o laudo' : 'o documento';
        if (!confirm(`Assinar ${oque} "${op.titulo || ''}" com o certificado digital?\n\nO arquivo assinado não poderá ser alterado.`)) {
            return false;
        }

        const btn = janela.el?.querySelector('.cx-pop-foot .btn-primary');
        const txt = btn ? btn.textContent : '';
        if (btn) { btn.disabled = true; btn.textContent = 'Assinando…'; }

        try {
            const { data, error } = await c().functions.invoke('assinar-documento', {
                body: { tipo: op.tipo, id: op.id, pagina: st.pos.pagina, x: st.pos.x, y: st.pos.y }
            });

            // Erro HTTP: a mensagem útil vem no corpo da resposta
            if (error) {
                let msg = error.message || 'Erro ao assinar.';
                try { const b = await error.context?.json(); if (b?.erro) msg = b.erro; } catch (_) {}
                throw new Error(msg);
            }
            if (!data?.ok) throw new Error(data?.erro || 'Erro ao assinar.');

            janela.fecharJanela();
            toast((op.tipo === 'laudo' ? 'Laudo' : 'Documento') + ' assinado.', 'success');
            if (typeof op.onAssinado === 'function') await op.onAssinado(data);
            return true;
        } catch (err) {
            console.error('[assinatura] assinar:', err);
            toast(err.message || 'Erro ao assinar.', 'danger');
            if (btn) { btn.disabled = false; btn.textContent = txt; }
            return false;
        }
    }

    return { podeAssinar, abrir };
})();

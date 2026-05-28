// ============================================================================
// CORTEX_APP — Sprint 68 — image_cropper.js
// Cropper de imagem quadrado (estilo Instagram), sem dependências externas.
// ============================================================================
// Uso:
//   CortexCropper.abrir(file, { tamanho: 512 }).then(result => {
//       // result.blob       → Blob JPEG quadrado (pra upload via storage)
//       // result.dataUrl    → string base64 (pra preview ou Edge Function)
//       // result.file       → File JPEG (nome perfil.jpg)
//   }).catch(() => { /* usuário cancelou */ });
//
// Abre um modal com moldura quadrada fixa. O usuário arrasta a imagem e usa
// um slider de zoom. Ao confirmar, recorta a área da moldura num canvas e
// exporta como JPEG quadrado (tamanho x tamanho).
// ============================================================================

(function() {
    'use strict';

    const VIEWPORT = 300; // tamanho da moldura na tela (px)

    function abrir(file, opts) {
        opts = opts || {};
        const tamanhoSaida = opts.tamanho || 512; // px do JPEG final
        const qualidade = opts.qualidade || 0.9;

        return new Promise((resolve, reject) => {
            if (!file) { reject(new Error('sem arquivo')); return; }

            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => montarModal(img, tamanhoSaida, qualidade, resolve, reject);
                img.onerror = () => reject(new Error('imagem inválida'));
                img.src = e.target.result;
            };
            reader.onerror = () => reject(new Error('falha ao ler arquivo'));
            reader.readAsDataURL(file);
        });
    }

    function montarModal(img, tamanhoSaida, qualidade, resolve, reject) {
        // Estado da transformação
        const st = {
            escalaMin: 1,
            escala: 1,
            offsetX: 0,   // deslocamento do centro da imagem (px na tela)
            offsetY: 0,
            arrastando: false,
            lastX: 0,
            lastY: 0
        };

        // Escala mínima: a imagem deve sempre cobrir a moldura inteira
        const coverScale = Math.max(VIEWPORT / img.width, VIEWPORT / img.height);
        st.escalaMin = coverScale;
        st.escala = coverScale;

        // Overlay
        const overlay = document.createElement('div');
        overlay.className = 'cortex-cropper-overlay';
        overlay.innerHTML = `
            <div class="cortex-cropper-box">
                <h2 class="cortex-cropper-titulo">Enquadrar foto</h2>
                <p class="cortex-cropper-ajuda">Arraste para posicionar e use o controle para aproximar.</p>

                <div class="cortex-cropper-palco" id="cc-palco">
                    <canvas id="cc-canvas" width="${VIEWPORT}" height="${VIEWPORT}"></canvas>
                    <div class="cortex-cropper-mascara"></div>
                </div>

                <div class="cortex-cropper-zoom">
                    <span class="cortex-cropper-zoom-ico">−</span>
                    <input type="range" id="cc-zoom" min="1" max="3" step="0.01" value="1">
                    <span class="cortex-cropper-zoom-ico">+</span>
                </div>

                <div class="cortex-cropper-acoes">
                    <button class="btn btn-secondary" id="cc-cancelar" type="button">Cancelar</button>
                    <button class="btn btn-primary" id="cc-confirmar" type="button">Usar esta foto</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        const canvas = overlay.querySelector('#cc-canvas');
        const ctx = canvas.getContext('2d');
        const zoomSlider = overlay.querySelector('#cc-zoom');
        const palco = overlay.querySelector('#cc-palco');

        // Garante que offset não deixa "buracos" fora da imagem
        function limitarOffset() {
            const larg = img.width * st.escala;
            const alt = img.height * st.escala;
            const maxX = Math.max(0, (larg - VIEWPORT) / 2);
            const maxY = Math.max(0, (alt - VIEWPORT) / 2);
            st.offsetX = Math.max(-maxX, Math.min(maxX, st.offsetX));
            st.offsetY = Math.max(-maxY, Math.min(maxY, st.offsetY));
        }

        function desenhar() {
            limitarOffset();
            ctx.clearRect(0, 0, VIEWPORT, VIEWPORT);
            const larg = img.width * st.escala;
            const alt = img.height * st.escala;
            const x = (VIEWPORT - larg) / 2 + st.offsetX;
            const y = (VIEWPORT - alt) / 2 + st.offsetY;
            ctx.drawImage(img, x, y, larg, alt);
        }

        desenhar();

        // ─── Zoom ──────────────────────────────────────────────────────────
        zoomSlider.addEventListener('input', () => {
            const fator = parseFloat(zoomSlider.value); // 1..3
            st.escala = st.escalaMin * fator;
            desenhar();
        });

        // ─── Arrastar (mouse) ──────────────────────────────────────────────
        palco.addEventListener('mousedown', (e) => {
            st.arrastando = true;
            st.lastX = e.clientX;
            st.lastY = e.clientY;
        });
        window.addEventListener('mousemove', (e) => {
            if (!st.arrastando) return;
            st.offsetX += e.clientX - st.lastX;
            st.offsetY += e.clientY - st.lastY;
            st.lastX = e.clientX;
            st.lastY = e.clientY;
            desenhar();
        });
        window.addEventListener('mouseup', () => { st.arrastando = false; });

        // ─── Arrastar (toque) ──────────────────────────────────────────────
        palco.addEventListener('touchstart', (e) => {
            if (e.touches.length !== 1) return;
            st.arrastando = true;
            st.lastX = e.touches[0].clientX;
            st.lastY = e.touches[0].clientY;
        }, { passive: true });
        palco.addEventListener('touchmove', (e) => {
            if (!st.arrastando || e.touches.length !== 1) return;
            st.offsetX += e.touches[0].clientX - st.lastX;
            st.offsetY += e.touches[0].clientY - st.lastY;
            st.lastX = e.touches[0].clientX;
            st.lastY = e.touches[0].clientY;
            desenhar();
            e.preventDefault();
        }, { passive: false });
        palco.addEventListener('touchend', () => { st.arrastando = false; });

        // ─── Cancelar ──────────────────────────────────────────────────────
        function fechar() { overlay.remove(); }
        overlay.querySelector('#cc-cancelar').addEventListener('click', () => {
            fechar();
            reject(new Error('cancelado'));
        });

        // ─── Confirmar: exporta o recorte ──────────────────────────────────
        overlay.querySelector('#cc-confirmar').addEventListener('click', () => {
            // Canvas de saída no tamanho final
            const out = document.createElement('canvas');
            out.width = tamanhoSaida;
            out.height = tamanhoSaida;
            const octx = out.getContext('2d');

            // Mapeia a viewport (VIEWPORT) pra saída (tamanhoSaida)
            const fator = tamanhoSaida / VIEWPORT;
            const larg = img.width * st.escala * fator;
            const alt = img.height * st.escala * fator;
            const x = (tamanhoSaida - larg) / 2 + st.offsetX * fator;
            const y = (tamanhoSaida - alt) / 2 + st.offsetY * fator;

            octx.fillStyle = '#ffffff';
            octx.fillRect(0, 0, tamanhoSaida, tamanhoSaida);
            octx.drawImage(img, x, y, larg, alt);

            out.toBlob((blob) => {
                if (!blob) { fechar(); reject(new Error('falha ao exportar')); return; }
                const dataUrl = out.toDataURL('image/jpeg', qualidade);
                const fileOut = new File([blob], 'perfil.jpg', { type: 'image/jpeg' });
                fechar();
                resolve({ blob, dataUrl, file: fileOut });
            }, 'image/jpeg', qualidade);
        });
    }

    window.CortexCropper = { abrir };
})();

// ============================================================================
// CORTEX — bloco_laudo.js
// ----------------------------------------------------------------------------
// Motor dos "blocos de laudo": aqueles retângulos azuis com QR de um lado e
// texto do outro, que a gente monta em HTML, vira imagem e cola no Word.
//
// Existem dois hoje, e vão existir mais:
//   • QR do prontuário  (shared/qr_prontuario.js) — token por paciente
//   • Avaliação no Google (ferramentas-laudo)      — link fixo
//
// O que é comum mora aqui: desenhar o QR, montar o bloco fora da vista na
// largura de impressão, virar imagem com html2canvas, copiar para a área de
// transferência (com queda para download) e imprimir.
//
// Por que HTML e não canvas: texto justificado, fonte Inter e canto
// arredondado saem certos assim; no canvas sairiam à força e feios.
//
// Por que `em`: a escala inteira do bloco sai do `font-size` do container.
// A prévia na tela é o MESMO HTML na largura real, encolhido por transform —
// se fosse `font-size` menor, o texto refluiria e a prévia mentiria.
//
// Depende de shared/vendor/qrcode.js (Kazuhiko Arase, MIT) e do html2canvas.
// ============================================================================

window.CortexBlocoLaudo = (function () {
    'use strict';

    // Largura útil de um A4 com margem de 2,5 cm. É a régua de todos os
    // blocos: 1400 px representam esses 16 cm.
    const LARGURA_PADRAO = 1400;

    // 17px de escala dá um QR de ~2,8 cm no papel. Abaixo de ~2,5 cm a
    // leitura de QR impresso começa a falhar.
    const ESCALA_PADRAO = 17;

    const QR_MARGEM = 4;   // módulos de borda branca (a norma pede 4)

    const toast = (m, t) => window.CortexUI?.toast ? window.CortexUI.toast(m, t) : null;

    // ── QR ──────────────────────────────────────────────────────────────────

    function desenharQr(canvas, texto, ladoAlvo) {
        if (!canvas) throw new Error('Canvas do QR não encontrado.');
        if (typeof window.qrcode !== 'function') {
            throw new Error('Biblioteca de QR não carregada (shared/vendor/qrcode.js).');
        }
        // 0 = menor versão que couber; 'M' = 15% de correção de erro, que é o
        // equilíbrio certo para papel.
        const q = window.qrcode(0, 'M');
        q.addData(texto);
        q.make();

        const n = q.getModuleCount();
        const total = n + QR_MARGEM * 2;
        // Passo inteiro de pixel: meio pixel por módulo é o que faz QR
        // impresso falhar.
        const passo = Math.max(1, Math.floor((ladoAlvo || 480) / total));
        const px = passo * total;

        // Só a resolução interna. O tamanho na tela e no papel é do CSS, em
        // `em`: mexer aqui desanda o bloco inteiro.
        canvas.width = px;
        canvas.height = px;

        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, px, px);
        ctx.fillStyle = '#000000';
        for (let r = 0; r < n; r++) {
            for (let c = 0; c < n; c++) {
                if (q.isDark(r, c)) {
                    ctx.fillRect((c + QR_MARGEM) * passo, (r + QR_MARGEM) * passo, passo, passo);
                }
            }
        }
        return canvas;
    }

    // Lado em px que o QR terá dentro do bloco, com folga de 2x para não
    // depender de interpolação.
    function ladoQrParaEscala(escala, emDoQr) {
        return Math.round((emDoQr || 14.4) * (escala || ESCALA_PADRAO)) * 2;
    }

    // ── Prévia encolhida ────────────────────────────────────────────────────

    // O transform não encolhe a caixa do elemento, então a altura da moldura
    // tem que ser dada na mão — senão sobra um buraco embaixo da prévia.
    function ajustarPrevia(moldura, palco, larguraBase) {
        if (!moldura || !palco) return;
        const bloco = palco.firstElementChild;
        if (!bloco) return;

        const disponivel = moldura.clientWidth - 2;
        if (disponivel <= 0) return;

        const escala = Math.min(1, disponivel / (larguraBase || LARGURA_PADRAO));
        palco.style.transform = `scale(${escala})`;
        moldura.style.height = Math.ceil(bloco.offsetHeight * escala) + 'px';
    }

    // ── Montagem fora da vista ──────────────────────────────────────────────

    // Monta o bloco na largura de impressão, entrega para o chamador preparar
    // (desenhar o QR, por exemplo) e limpa depois — dê erro ou não.
    async function comPalco(html, opcoes, trabalho) {
        const op = opcoes || {};
        const largura = op.largura || LARGURA_PADRAO;
        const escala = op.escala || ESCALA_PADRAO;

        const palco = document.createElement('div');
        palco.className = 'cbl-palco';
        palco.innerHTML = `<div class="${op.classe || 'cbl-bloco'}" style="width:${largura}px; font-size:${escala}px">${html}</div>`;
        document.body.appendChild(palco);

        try {
            return await trabalho(palco.firstElementChild, palco);
        } finally {
            palco.remove();
        }
    }

    // ── HTML → imagem ───────────────────────────────────────────────────────

    async function imagemDoElemento(el, escalaPixel) {
        if (typeof window.html2canvas !== 'function') {
            throw new Error('html2canvas não carregou nesta página.');
        }
        // Duas voltas: sem isso o html2canvas às vezes fotografa antes da
        // fonte entrar e a imagem sai com o fallback.
        if (document.fonts && document.fonts.ready) await document.fonts.ready;
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

        return await window.html2canvas(el, {
            scale: escalaPixel || 2,
            backgroundColor: '#FFFFFF',
            useCORS: true,
            logging: false
        });
    }

    async function blobDoElemento(el, escalaPixel) {
        const canvas = await imagemDoElemento(el, escalaPixel);
        const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
        if (!blob) throw new Error('Não foi possível gerar a imagem.');
        return blob;
    }

    // ── Saídas ──────────────────────────────────────────────────────────────

    function salvarBlob(blob, nomeArquivo) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = nomeArquivo || 'bloco.png';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
    }

    function ocupado(botao, sim, rotuloFinal) {
        if (!botao) return;
        botao.disabled = sim;
        if (sim && !botao.dataset.rotulo) botao.dataset.rotulo = botao.textContent;
        botao.textContent = sim
            ? 'Gerando...'
            : (rotuloFinal || botao.dataset.rotulo || botao.textContent);
    }

    // Copia o bloco como imagem, para colar com Ctrl+V.
    //
    // A área de transferência de imagem depende do navegador. Se ela negar
    // — navegador antigo, página sem HTTPS, webview do app — cai para o
    // download, porque o que não pode é a pessoa ficar sem a imagem.
    async function copiar(el, nomeArquivo, botao, rotuloFinal) {
        ocupado(botao, true);
        try {
            if (!navigator.clipboard || typeof window.ClipboardItem !== 'function') {
                throw new Error('sem_suporte');
            }
            const blob = await blobDoElemento(el);
            await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })]);
            toast('Imagem copiada — cole no laudo com Ctrl+V.', 'success');
            return 'copiado';
        } catch (err) {
            console.warn('[bloco] copiar falhou, baixando:', err);
            try {
                salvarBlob(await blobDoElemento(el), nomeArquivo);
                toast('Este navegador não deixa copiar imagem — baixei o PNG.', 'info');
                return 'baixado';
            } catch (err2) {
                console.error('[bloco] baixar (após falha ao copiar):', err2);
                toast('Erro ao gerar a imagem: ' + (err2.message || ''), 'danger');
                return 'erro';
            }
        } finally {
            ocupado(botao, false, rotuloFinal);
        }
    }

    async function baixar(el, nomeArquivo, botao, rotuloFinal) {
        ocupado(botao, true);
        try {
            salvarBlob(await blobDoElemento(el), nomeArquivo);
            toast('PNG baixado.', 'success');
            return 'baixado';
        } catch (err) {
            console.error('[bloco] baixar:', err);
            toast('Erro ao gerar o PNG: ' + (err.message || ''), 'danger');
            return 'erro';
        } finally {
            ocupado(botao, false, rotuloFinal);
        }
    }

    // Imprime o bloco sozinho numa folha, para colar no papel.
    async function imprimir(el, legenda, botao, rotuloFinal) {
        ocupado(botao, true);
        try {
            const dataUrl = (await imagemDoElemento(el)).toDataURL('image/png');
            const w = window.open('', '_blank');
            if (!w) { toast('O navegador bloqueou a janela de impressão.', 'danger'); return 'erro'; }

            const div = document.createElement('div');
            div.textContent = legenda || '';

            w.document.write(`<!DOCTYPE html><html lang="pt-BR"><head>
                <meta charset="UTF-8"><title>Bloco do laudo</title>
                <style>
                    @page { margin: 20mm; }
                    body { margin: 0; font-family: Arial, sans-serif; }
                    img { width: 100%; height: auto; display: block; }
                    .legenda { margin-top: 8mm; font-size: 10pt; color: #5B6B85; text-align: center; }
                </style></head><body>
                <img src="${dataUrl}" alt="Bloco do laudo">
                <div class="legenda">${div.innerHTML}</div>
                <script>window.onload = function () { window.print(); };<\/script>
                </body></html>`);
            w.document.close();
            return 'impresso';
        } catch (err) {
            console.error('[bloco] imprimir:', err);
            toast('Erro ao preparar a impressão: ' + (err.message || ''), 'danger');
            return 'erro';
        } finally {
            ocupado(botao, false, rotuloFinal);
        }
    }

    // Nome de arquivo previsível a partir de um texto livre.
    function nomeArquivo(prefixo, texto) {
        const base = String(texto || '')
            .normalize('NFD').replace(/[̀-ͯ]/g, '')
            .replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '').toLowerCase();
        return [prefixo, base].filter(Boolean).join('_') + '.png';
    }

    return {
        LARGURA_PADRAO, ESCALA_PADRAO,
        desenharQr, ladoQrParaEscala, ajustarPrevia,
        comPalco, imagemDoElemento, blobDoElemento,
        copiar, baixar, imprimir, salvarBlob, nomeArquivo, ocupado
    };
})();

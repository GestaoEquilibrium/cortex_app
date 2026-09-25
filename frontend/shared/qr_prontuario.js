// ============================================================================
// CORTEX — qr_prontuario.js
// ----------------------------------------------------------------------------
// O QR que vai impresso no laudo.
//
// Quem escaneia cai em /e/?t=TOKEN: se não tem conta, se cadastra e o pedido
// fica esperando a autorização do admin; se já tem, pede (ou já vê) aquele
// prontuário. O token é gerado no banco e é o mesmo sempre — todo laudo do
// paciente sai com o mesmo QR, até alguém trocar.
//
// Trocar o código invalida os laudos já impressos. É de propósito: é o botão
// de "esse papel vazou".
//
// Depende de shared/vendor/qrcode.js (Kazuhiko Arase, MIT), servido junto com
// o app — nada de CDN aqui, porque isso tem que funcionar na hora de imprimir.
// ============================================================================

window.CortexQR = (function () {
    'use strict';

    const BASE_PUBLICA = 'https://cortexneuro.com.br';

    // Tamanho do desenho: o PNG sai grande para colar no Word sem serrilhar.
    const PNG_LADO   = 1000;   // px do quadrado do QR
    const PNG_MARGEM = 4;      // módulos de borda branca (a norma pede 4)

    const toast = (m, t) => window.CortexUI?.toast ? window.CortexUI.toast(m, t) : null;

    function esc(t) {
        const d = document.createElement('div');
        d.textContent = t ?? '';
        return d.innerHTML;
    }

    function linkDoToken(token) {
        return `${BASE_PUBLICA}/e/?t=${encodeURIComponent(token)}`;
    }

    // ── Desenho ─────────────────────────────────────────────────────────────

    function matriz(texto) {
        if (typeof window.qrcode !== 'function') {
            throw new Error('Biblioteca de QR não carregada (shared/vendor/qrcode.js).');
        }
        // 0 = escolhe a menor versão que couber; 'M' = 15% de correção de erro,
        // que é o equilíbrio certo para papel impresso.
        const q = window.qrcode(0, 'M');
        q.addData(texto);
        q.make();
        return q;
    }

    function desenhar(canvas, texto, lado) {
        const q = matriz(texto);
        const n = q.getModuleCount();
        const total = n + PNG_MARGEM * 2;
        // Passo inteiro: meio pixel por módulo é o que faz QR impresso falhar.
        const passo = Math.max(1, Math.floor(lado / total));
        const px = passo * total;

        canvas.width = px;
        canvas.height = px;

        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, px, px);
        ctx.fillStyle = '#000000';
        for (let r = 0; r < n; r++) {
            for (let c = 0; c < n; c++) {
                if (q.isDark(r, c)) {
                    ctx.fillRect((c + PNG_MARGEM) * passo, (r + PNG_MARGEM) * passo, passo, passo);
                }
            }
        }
        return canvas;
    }

    // PNG com legenda embaixo, do jeito que vai para dentro do laudo.
    function canvasParaLaudo(texto, nomePaciente) {
        const qrCanvas = desenhar(document.createElement('canvas'), texto, PNG_LADO);
        const lado = qrCanvas.width;
        const rodape = Math.round(lado * 0.20);

        const out = document.createElement('canvas');
        out.width = lado;
        out.height = lado + rodape;

        const ctx = out.getContext('2d');
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, out.width, out.height);
        ctx.drawImage(qrCanvas, 0, 0);

        ctx.fillStyle = '#0c1f3f';
        ctx.textAlign = 'center';
        ctx.font = `700 ${Math.round(lado * 0.050)}px Inter, Arial, sans-serif`;
        ctx.fillText('ACOMPANHE ESTE PACIENTE', lado / 2, lado + rodape * 0.36);
        ctx.fillStyle = '#5B6B85';
        ctx.font = `400 ${Math.round(lado * 0.040)}px Inter, Arial, sans-serif`;
        ctx.fillText('Profissional de saúde: escaneie para', lado / 2, lado + rodape * 0.64);
        ctx.fillText('solicitar acesso ao prontuário', lado / 2, lado + rodape * 0.88);

        return out;
    }

    // ── Banco ───────────────────────────────────────────────────────────────

    async function obterToken(pacienteId) {
        const { data, error } = await window.cortexClient
            .rpc('qr_prontuario_token', { p_paciente_id: pacienteId });
        if (error) throw error;
        return data;
    }

    async function rotacionarToken(pacienteId) {
        const { data, error } = await window.cortexClient
            .rpc('qr_prontuario_rotacionar', { p_paciente_id: pacienteId });
        if (error) throw error;
        return data;
    }

    // ── Janela ──────────────────────────────────────────────────────────────

    async function abrir(pacienteId, nomePaciente) {
        if (!pacienteId) return;
        try {
            const token = await obterToken(pacienteId);
            if (!token) throw new Error('Não foi possível gerar o código.');
            pintarJanela(pacienteId, nomePaciente, token);
        } catch (err) {
            console.error('[qr] abrir:', err);
            toast('Erro ao gerar o QR: ' + (err.message || ''), 'danger');
        }
    }

    function pintarJanela(pacienteId, nomePaciente, token) {
        const link = linkDoToken(token);

        const janela = window.CortexPop.abrir({
            titulo: 'QR do prontuário',
            subtitulo: nomePaciente || '',
            icone: '🔗',
            tone: 'blue',
            tamanho: 'md',
            html: `
                <div class="qrp-explica">
                    Cole este QR no laudo. O profissional de fora escaneia, se cadastra e
                    pede acesso ao prontuário deste paciente — e <strong>nada aparece para
                    ele antes de você autorizar</strong> em Configurações → Acesso externo.
                </div>

                <div class="qrp-caixa">
                    <canvas id="qrp-canvas" class="qrp-canvas"></canvas>
                    <div class="qrp-legenda">
                        <div class="qrp-legenda-tit">ACOMPANHE ESTE PACIENTE</div>
                        <div class="qrp-legenda-sub">Escaneie para solicitar acesso ao prontuário</div>
                    </div>
                </div>

                <div class="qrp-link">
                    <span id="qrp-url">${esc(link)}</span>
                    <button class="qrp-mini" id="qrp-copiar">Copiar</button>
                </div>

                <div class="qrp-acoes">
                    <button class="btn btn-primary btn-sm" id="qrp-baixar">⬇ Baixar PNG para o laudo</button>
                    <button class="btn btn-secondary btn-sm" id="qrp-imprimir">🖨️ Imprimir etiqueta</button>
                </div>

                <details class="qrp-avancado">
                    <summary>Trocar o código deste paciente</summary>
                    <p>Use se um laudo impresso foi para as mãos erradas. O código novo passa
                       a valer e <strong>todos os laudos já impressos deixam de abrir</strong>.
                       Quem já está liberado continua liberado.</p>
                    <button class="btn btn-ghost btn-sm qrp-perigo" id="qrp-trocar">🔁 Gerar um código novo</button>
                </details>`,
            rodape: [{ label: 'Fechar', classe: 'btn-secondary' }]
        });

        // Prévia na tela (pequena; o PNG que baixa é o grande).
        try {
            desenhar(janela.corpo.querySelector('#qrp-canvas'), link, 460);
        } catch (err) {
            console.error('[qr] desenhar:', err);
            janela.corpo.querySelector('.qrp-caixa').innerHTML =
                '<div class="qrp-falha">Não foi possível desenhar o QR nesta tela. ' +
                'O link abaixo funciona do mesmo jeito.</div>';
        }

        janela.corpo.querySelector('#qrp-copiar').onclick = async () => {
            try {
                await navigator.clipboard.writeText(link);
                toast('Link copiado.', 'success');
            } catch (e) {
                const r = document.createRange();
                r.selectNode(janela.corpo.querySelector('#qrp-url'));
                window.getSelection().removeAllRanges();
                window.getSelection().addRange(r);
                toast('Selecionado — use Ctrl+C.', 'info');
            }
        };

        janela.corpo.querySelector('#qrp-baixar').onclick = () => baixarPng(link, nomePaciente, pacienteId);
        janela.corpo.querySelector('#qrp-imprimir').onclick = () => imprimirEtiqueta(link, nomePaciente);

        janela.corpo.querySelector('#qrp-trocar').onclick = () => {
            window.CortexConfirm.mostrar({
                icone: '🔁',
                titulo: 'Gerar um código novo?',
                texto: 'Os laudos já impressos com o QR antigo deixam de abrir. ' +
                       'Quem já tem acesso liberado não é afetado.',
                btnSim: 'Sim, gerar novo', btnNao: 'Cancelar', btnSimDanger: true,
                onSim: async () => {
                    try {
                        const novo = await rotacionarToken(pacienteId);
                        if (window.CortexAudit) {
                            window.CortexAudit.log('edicao', 'qr_prontuario', null, {
                                pacienteId, detalhes: { operacao: 'rotacionar_qr_prontuario' }
                            });
                        }
                        janela.fecharJanela();
                        pintarJanela(pacienteId, nomePaciente, novo);
                        toast('Código novo gerado.', 'success');
                    } catch (err) {
                        console.error('[qr] rotacionar:', err);
                        toast('Erro ao gerar: ' + (err.message || ''), 'danger');
                    }
                }
            });
        };
    }

    // ── Saídas ──────────────────────────────────────────────────────────────

    function nomeArquivo(nomePaciente) {
        const base = String(nomePaciente || 'paciente')
            .normalize('NFD').replace(/[̀-ͯ]/g, '')
            .replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '').toLowerCase();
        return `qr_prontuario_${base || 'paciente'}.png`;
    }

    function baixarPng(link, nomePaciente, pacienteId) {
        try {
            const canvas = canvasParaLaudo(link, nomePaciente);
            canvas.toBlob((blob) => {
                if (!blob) return toast('Não foi possível gerar o PNG.', 'danger');
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = nomeArquivo(nomePaciente);
                document.body.appendChild(a);
                a.click();
                a.remove();
                setTimeout(() => URL.revokeObjectURL(url), 4000);
                toast('PNG baixado — cole no laudo.', 'success');
                if (window.CortexAudit) {
                    window.CortexAudit.log('leitura', 'qr_prontuario', null, {
                        pacienteId, detalhes: { operacao: 'baixar_qr_prontuario' }
                    });
                }
            }, 'image/png');
        } catch (err) {
            console.error('[qr] baixar:', err);
            toast('Erro ao gerar o PNG: ' + (err.message || ''), 'danger');
        }
    }

    // Uma etiqueta só, do tamanho de colar no papel.
    function imprimirEtiqueta(link, nomePaciente) {
        try {
            const dataUrl = canvasParaLaudo(link, nomePaciente).toDataURL('image/png');
            const w = window.open('', '_blank');
            if (!w) return toast('O navegador bloqueou a janela de impressão.', 'danger');
            w.document.write(`<!DOCTYPE html><html lang="pt-BR"><head>
                <meta charset="UTF-8"><title>QR do prontuário</title>
                <style>
                    @page { margin: 12mm; }
                    body { margin: 0; font-family: Arial, sans-serif; text-align: center; }
                    img { width: 55mm; height: auto; }
                    .nome { margin-top: 6mm; font-size: 11pt; color: #0c1f3f; }
                </style></head><body>
                <img src="${dataUrl}" alt="QR do prontuário">
                <div class="nome">${esc(nomePaciente || '')}</div>
                <script>window.onload = function () { window.print(); };<\/script>
                </body></html>`);
            w.document.close();
        } catch (err) {
            console.error('[qr] imprimir:', err);
            toast('Erro ao preparar a impressão: ' + (err.message || ''), 'danger');
        }
    }

    return { abrir, linkDoToken };
})();

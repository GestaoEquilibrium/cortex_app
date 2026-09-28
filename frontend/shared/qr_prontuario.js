// ============================================================================
// CORTEX — qr_prontuario.js
// ----------------------------------------------------------------------------
// O bloco de QR que vai impresso no laudo.
//
// Quem escaneia cai em /e/?t=TOKEN: se não tem conta, se cadastra e o pedido
// fica esperando a autorização do admin; se já tem, pede (ou já vê) aquele
// prontuário. O token é gerado no banco e é o mesmo sempre — todo laudo do
// paciente sai com o mesmo QR, até alguém trocar.
//
// Trocar o código invalida os laudos já impressos. É de propósito: é o botão
// de "esse papel vazou".
//
// O bloco é montado em HTML e convertido em imagem com html2canvas, não
// desenhado no canvas à mão. Texto justificado, fonte Inter e cantos
// arredondados saem certos assim; no canvas sairiam à força e feios.
//
// A escala inteira do bloco sai do `font-size` do container: tudo por dentro
// está em `em`. Por isso a prévia na tela e o PNG de impressão são o mesmo
// HTML com um número diferente, sem duas listas de tamanhos para manter.
//
// Depende de shared/vendor/qrcode.js (Kazuhiko Arase, MIT), servido junto com
// o app — nada de CDN para o QR, porque isso tem que funcionar na hora de
// imprimir.
// ============================================================================

window.CortexQR = (function () {
    'use strict';

    const BASE_PUBLICA = 'https://cortexneuro.com.br';

    const QR_MARGEM = 4;    // módulos de borda branca (a norma pede 4)

    // Escala do bloco. 17px reproduz, num bloco de 16 cm (largura útil de um
    // A4 com margem de 2,5 cm), um QR de ~2,8 cm — abaixo de ~2,5 cm a leitura
    // do papel começa a falhar.
    const ESCALA_EXPORT = 17;
    const LARGURA_EXPORT = 1400;   // px; com scale 2 o PNG sai com 2800

    const TEXTO_LEGAL =
        'Documento de natureza técnico-científica emitido sob responsabilidade do(a) ' +
        'profissional signatário(a), nos termos da Resolução CFP nº 06/2019. Destina-se ' +
        'exclusivamente à(s) finalidade(s) e ao(à) solicitante indicados neste laudo, sendo ' +
        'vedada sua utilização para fins diversos daqueles a que se propõe. A reprodução ' +
        'parcial, a divulgação, a publicação ou o compartilhamento deste conteúdo com ' +
        'terceiros não autorizados são expressamente vedados, nos termos da Lei nº ' +
        '13.709/2018 (LGPD) e do sigilo profissional previsto no Código de Ética ' +
        'Profissional do Psicólogo. O acesso por profissional externo somente será ' +
        'concedido mediante autorização expressa do responsável técnico.';

    const toast = (m, t) => window.CortexUI?.toast ? window.CortexUI.toast(m, t) : null;

    function esc(t) {
        const d = document.createElement('div');
        d.textContent = t ?? '';
        return d.innerHTML;
    }

    function linkDoToken(token) {
        return `${BASE_PUBLICA}/e/?t=${encodeURIComponent(token)}`;
    }

    // ── QR ──────────────────────────────────────────────────────────────────

    function matriz(texto) {
        if (typeof window.qrcode !== 'function') {
            throw new Error('Biblioteca de QR não carregada (shared/vendor/qrcode.js).');
        }
        // 0 = menor versão que couber; 'M' = 15% de correção de erro, que é o
        // equilíbrio certo para papel.
        const q = window.qrcode(0, 'M');
        q.addData(texto);
        q.make();
        return q;
    }

    // Desenha num canvas com passo inteiro de pixel: meio pixel por módulo é
    // o que faz QR impresso falhar.
    function desenhar(canvas, texto, ladoAlvo) {
        const q = matriz(texto);
        const n = q.getModuleCount();
        const total = n + QR_MARGEM * 2;
        const passo = Math.max(1, Math.floor(ladoAlvo / total));
        const px = passo * total;

        // Só a resolução interna. O tamanho na tela/no papel é do CSS, em `em`:
        // se mexer aqui, o bloco inteiro desanda.
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

    // ── O bloco ─────────────────────────────────────────────────────────────
    // Sem truque de borda: a barra azul da esquerda é um elemento de verdade e
    // a divisória é uma borda simples. html2canvas erra borda de larguras
    // diferentes com canto arredondado; assim não tem o que errar.

    function blocoHtml() {
        return `
            <div class="qrp-bloco-barra"></div>
            <div class="qrp-bloco-esq">
                <div class="qrp-bloco-qr"><canvas class="qrp-bloco-canvas"></canvas></div>
                <div class="qrp-bloco-escaneie">Escaneie aqui</div>
            </div>
            <div class="qrp-bloco-dir">
                <div class="qrp-bloco-selos">
                    <span class="qrp-selo">CFP 06/2019</span>
                    <span class="qrp-selo">LGPD</span>
                    <span class="qrp-selo verde">ACESSO AUDITADO</span>
                </div>
                <div class="qrp-bloco-tit">ACOMPANHE ESTE PACIENTE</div>
                <p class="qrp-bloco-legal">${esc(TEXTO_LEGAL)}</p>
            </div>`;
    }

    // Monta o bloco pronto para virar imagem, fora da vista.
    function montarParaExport(link) {
        const palco = document.createElement('div');
        palco.className = 'qrp-palco';
        palco.innerHTML = `<div class="qrp-bloco" style="width:${LARGURA_EXPORT}px; font-size:${ESCALA_EXPORT}px">${blocoHtml()}</div>`;
        document.body.appendChild(palco);

        const bloco = palco.querySelector('.qrp-bloco');
        // Lado do QR em px a partir do em, para o canvas nascer na resolução
        // em que vai ser usado em vez de ser esticado.
        const ladoQr = Math.round(14.4 * ESCALA_EXPORT) * 2;
        desenhar(palco.querySelector('.qrp-bloco-canvas'), link, ladoQr);

        return { palco, bloco };
    }

    // Encolhe a prévia para caber na janela, mantendo a proporção do impresso.
    function ajustarPrevia(corpo) {
        const moldura = corpo.querySelector('.qrp-previa');
        const palco = corpo.querySelector('#qrp-palco-previa');
        const bloco = palco && palco.querySelector('.qrp-bloco');
        if (!moldura || !palco || !bloco) return;

        const disponivel = moldura.clientWidth - 2;   // respira dentro da borda
        if (disponivel <= 0) return;

        const escala = Math.min(1, disponivel / LARGURA_EXPORT);
        palco.style.transform = `scale(${escala})`;
        // O transform não encolhe a caixa: a altura tem que ser dada na mão,
        // senão sobra um buraco embaixo da prévia.
        moldura.style.height = Math.ceil(bloco.offsetHeight * escala) + 'px';
    }

    async function blocoParaCanvas(link) {
        if (typeof window.html2canvas !== 'function') {
            throw new Error('html2canvas não carregou nesta página.');
        }
        const { palco, bloco } = montarParaExport(link);
        try {
            // Duas voltas de fonte: sem isso o html2canvas às vezes fotografa
            // antes da Inter entrar e o PNG sai com a fonte de fallback.
            if (document.fonts && document.fonts.ready) await document.fonts.ready;
            await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

            return await window.html2canvas(bloco, {
                scale: 2,
                backgroundColor: '#FFFFFF',
                useCORS: true,
                logging: false
            });
        } finally {
            palco.remove();
        }
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
            tamanho: 'lg',
            html: `
                <div class="qrp-explica">
                    Este é o bloco que vai no laudo. Copie a imagem e cole no documento
                    antes de gerar o PDF. Quem escanear se cadastra e pede acesso ao
                    prontuário deste paciente — e <strong>nada aparece para ele antes de
                    você autorizar</strong> em Configurações → Acesso externo.
                </div>

                <div class="qrp-previa-rot">Como vai sair no laudo</div>
                <div class="qrp-previa">
                    <div class="qrp-previa-palco" id="qrp-palco-previa">
                        <div class="qrp-bloco" style="width:${LARGURA_EXPORT}px; font-size:${ESCALA_EXPORT}px">${blocoHtml()}</div>
                    </div>
                </div>

                <div class="qrp-acoes">
                    <button class="btn btn-primary btn-sm" id="qrp-copiar-img">
                        📋 Copiar imagem para o laudo
                    </button>
                    <button class="btn btn-secondary btn-sm" id="qrp-imprimir">🖨️ Imprimir</button>
                </div>
                <p class="qrp-dica">
                    Copie e cole direto no laudo com <strong>Ctrl+V</strong>.
                    <button class="qrp-link-acao" id="qrp-baixar">Ou baixe o arquivo PNG</button>
                </p>

                <details class="qrp-avancado">
                    <summary>Link direto e troca do código</summary>
                    <div class="qrp-link">
                        <span id="qrp-url">${esc(link)}</span>
                        <button class="qrp-mini" id="qrp-copiar">Copiar</button>
                    </div>
                    <p>O link é o mesmo do QR — serve para mandar por WhatsApp quando o
                       profissional não está com o laudo na mão. <strong>Ele não sai
                       impresso no bloco.</strong></p>
                    <p>Trocar o código é para quando um laudo impresso foi para as mãos
                       erradas: o novo passa a valer e <strong>todos os laudos já impressos
                       deixam de abrir</strong>. Quem já está liberado continua liberado.</p>
                    <button class="btn btn-ghost btn-sm qrp-perigo" id="qrp-trocar">🔁 Gerar um código novo</button>
                </details>`,
            rodape: [{ label: 'Fechar', classe: 'btn-secondary' }]
        });

        // Prévia: o bloco de verdade, na largura de verdade, encolhido por
        // transform. Mudar o font-size aqui mudaria as proporções — o texto
        // reflui e a prévia deixa de ser fiel ao que sai impresso.
        try {
            desenhar(janela.corpo.querySelector('.qrp-bloco-canvas'),
                     link, Math.round(14.4 * ESCALA_EXPORT) * 2);
            ajustarPrevia(janela.corpo);
            // A janela abre com animação; quando ela assenta, remede.
            setTimeout(() => ajustarPrevia(janela.corpo), 320);
            window.addEventListener('resize', () => ajustarPrevia(janela.corpo));
        } catch (err) {
            console.error('[qr] desenhar:', err);
            const p = janela.corpo.querySelector('.qrp-previa');
            if (p) p.innerHTML = '<div class="qrp-falha">Não foi possível desenhar o QR nesta ' +
                                 'tela. O link, no rodapé, funciona do mesmo jeito.</div>';
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

        janela.corpo.querySelector('#qrp-copiar-img').onclick = (ev) =>
            copiarImagem(link, nomePaciente, pacienteId, ev.currentTarget);
        janela.corpo.querySelector('#qrp-baixar').onclick = (ev) =>
            baixarPng(link, nomePaciente, pacienteId, ev.currentTarget);
        janela.corpo.querySelector('#qrp-imprimir').onclick = (ev) =>
            imprimir(link, nomePaciente, ev.currentTarget);

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

    function ocupado(botao, sim, rotuloOriginal) {
        if (!botao) return;
        botao.disabled = sim;
        if (sim) botao.dataset.rotulo = botao.textContent;
        botao.textContent = sim ? 'Gerando...' : (rotuloOriginal || botao.dataset.rotulo || botao.textContent);
    }

    function auditar(pacienteId, operacao) {
        if (!window.CortexAudit) return;
        window.CortexAudit.log('leitura', 'qr_prontuario', null, {
            pacienteId, detalhes: { operacao }
        });
    }

    async function gerarBlob(link) {
        const canvas = await blocoParaCanvas(link);
        const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
        if (!blob) throw new Error('Não foi possível gerar a imagem.');
        return blob;
    }

    function salvarBlob(blob, nomePaciente) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = nomeArquivo(nomePaciente);
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
    }

    // Copia o bloco como imagem, para colar no laudo com Ctrl+V.
    //
    // A área de transferência de imagem depende do navegador. Se ela negar
    // — navegador antigo, página sem HTTPS, webview do app — cai para o
    // download, porque o que não pode é ele ficar sem a imagem.
    async function copiarImagem(link, nomePaciente, pacienteId, botao) {
        ocupado(botao, true);
        try {
            if (!navigator.clipboard || typeof window.ClipboardItem !== 'function') {
                throw new Error('sem_suporte');
            }
            const blob = await gerarBlob(link);
            await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })]);
            toast('Imagem copiada — cole no laudo com Ctrl+V.', 'success');
            auditar(pacienteId, 'copiar_qr_prontuario');
        } catch (err) {
            console.warn('[qr] copiar imagem falhou, baixando:', err);
            try {
                salvarBlob(await gerarBlob(link), nomePaciente);
                toast('Este navegador não deixa copiar imagem — baixei o PNG.', 'info');
                auditar(pacienteId, 'baixar_qr_prontuario');
            } catch (err2) {
                console.error('[qr] baixar (após falha ao copiar):', err2);
                toast('Erro ao gerar a imagem: ' + (err2.message || ''), 'danger');
            }
        } finally {
            ocupado(botao, false, '📋 Copiar imagem para o laudo');
        }
    }

    async function baixarPng(link, nomePaciente, pacienteId, botao) {
        ocupado(botao, true);
        try {
            salvarBlob(await gerarBlob(link), nomePaciente);
            toast('PNG baixado.', 'success');
            auditar(pacienteId, 'baixar_qr_prontuario');
        } catch (err) {
            console.error('[qr] baixar:', err);
            toast('Erro ao gerar o PNG: ' + (err.message || ''), 'danger');
        } finally {
            ocupado(botao, false, 'Ou baixe o arquivo PNG');
        }
    }

    // Imprime o bloco sozinho numa folha, para colar no papel.
    async function imprimir(link, nomePaciente, botao) {
        ocupado(botao, true);
        try {
            const dataUrl = (await blocoParaCanvas(link)).toDataURL('image/png');
            const w = window.open('', '_blank');
            if (!w) return toast('O navegador bloqueou a janela de impressão.', 'danger');
            w.document.write(`<!DOCTYPE html><html lang="pt-BR"><head>
                <meta charset="UTF-8"><title>QR do prontuário</title>
                <style>
                    @page { margin: 20mm; }
                    body { margin: 0; font-family: Arial, sans-serif; }
                    img { width: 100%; height: auto; display: block; }
                    .nome { margin-top: 8mm; font-size: 10pt; color: #5B6B85; text-align: center; }
                </style></head><body>
                <img src="${dataUrl}" alt="Bloco de acesso ao prontuário">
                <div class="nome">${esc(nomePaciente || '')}</div>
                <script>window.onload = function () { window.print(); };<\/script>
                </body></html>`);
            w.document.close();
        } catch (err) {
            console.error('[qr] imprimir:', err);
            toast('Erro ao preparar a impressão: ' + (err.message || ''), 'danger');
        } finally {
            ocupado(botao, false, '🖨️ Imprimir');
        }
    }

    return { abrir, linkDoToken };
})();

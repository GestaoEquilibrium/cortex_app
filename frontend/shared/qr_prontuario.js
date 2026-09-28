// ============================================================================
// CORTEX — qr_prontuario.js
// ----------------------------------------------------------------------------
// O bloco de QR que vai impresso no laudo, com o token daquele paciente.
//
// Quem escaneia cai em /e/?t=TOKEN: se não tem conta, se cadastra e o pedido
// fica esperando a autorização do admin; se já tem, pede (ou já vê) aquele
// prontuário. O token é gerado no banco e é o mesmo sempre — todo laudo do
// paciente sai com o mesmo QR, até alguém trocar.
//
// Trocar o código invalida os laudos já impressos. É de propósito: é o botão
// de "esse papel vazou".
//
// O desenho do QR, a conversão HTML→imagem, o copiar/baixar/imprimir e o
// visual do bloco moram em shared/bloco_laudo.{js,css}, compartilhados com o
// bloco de avaliação no Google. Aqui fica só o que é do prontuário: o token,
// o texto legal e a janela.
// ============================================================================

window.CortexQR = (function () {
    'use strict';

    const BASE_PUBLICA = 'https://cortexneuro.com.br';

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

    const B = () => window.CortexBlocoLaudo;
    const toast = (m, t) => window.CortexUI?.toast ? window.CortexUI.toast(m, t) : null;

    function esc(t) {
        const d = document.createElement('div');
        d.textContent = t ?? '';
        return d.innerHTML;
    }

    function linkDoToken(token) {
        return `${BASE_PUBLICA}/e/?t=${encodeURIComponent(token)}`;
    }

    // ── O bloco ─────────────────────────────────────────────────────────────

    function blocoHtml() {
        return `
            <div class="cbl-barra"></div>
            <div class="cbl-esq">
                <div class="cbl-qr"><canvas class="cbl-canvas"></canvas></div>
                <div class="cbl-escaneie">Escaneie aqui</div>
            </div>
            <div class="cbl-dir">
                <div class="cbl-selos">
                    <span class="cbl-selo">CFP 06/2019</span>
                    <span class="cbl-selo">LGPD</span>
                    <span class="cbl-selo verde">ACESSO AUDITADO</span>
                </div>
                <div class="cbl-tit">ACOMPANHE ESTE PACIENTE</div>
                <p class="cbl-texto">${esc(TEXTO_LEGAL)}</p>
            </div>`;
    }

    // Monta o bloco na largura de impressão e entrega pronto para virar
    // imagem. O palco é desmontado sozinho ao fim.
    function comBloco(link, trabalho) {
        return B().comPalco(blocoHtml(), { classe: 'cbl-bloco' }, async (bloco, palco) => {
            B().desenharQr(palco.querySelector('.cbl-canvas'), link, B().ladoQrParaEscala());
            return await trabalho(bloco);
        });
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
        if (!B()) {
            toast('Módulo dos blocos de laudo não carregou. Recarregue a página.', 'danger');
            return;
        }
        try {
            const token = await obterToken(pacienteId);
            if (!token) throw new Error('Não foi possível gerar o código.');
            pintarJanela(pacienteId, nomePaciente, token);
        } catch (err) {
            console.error('[qr] abrir:', err);
            toast('Erro ao gerar o QR: ' + (err.message || ''), 'danger');
        }
    }

    function auditar(pacienteId, operacao) {
        if (!window.CortexAudit) return;
        window.CortexAudit.log('leitura', 'qr_prontuario', null, {
            pacienteId, detalhes: { operacao }
        });
    }

    function pintarJanela(pacienteId, nomePaciente, token) {
        const link = linkDoToken(token);
        const arquivo = B().nomeArquivo('qr_prontuario', nomePaciente || 'paciente');

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

                <div class="cbl-previa-rot">Como vai sair no laudo</div>
                <div class="cbl-previa">
                    <div class="cbl-previa-palco" id="qrp-palco-previa">
                        <div class="cbl-bloco" style="width:${B().LARGURA_PADRAO}px; font-size:${B().ESCALA_PADRAO}px">${blocoHtml()}</div>
                    </div>
                </div>

                <div class="cbl-acoes">
                    <button class="btn btn-primary btn-sm" id="qrp-copiar-img">
                        📋 Copiar imagem para o laudo
                    </button>
                    <button class="btn btn-secondary btn-sm" id="qrp-imprimir">🖨️ Imprimir</button>
                </div>
                <p class="cbl-dica">
                    Copie e cole direto no laudo com <strong>Ctrl+V</strong>.
                    <button class="cbl-link-acao" id="qrp-baixar">Ou baixe o arquivo PNG</button>
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

        const moldura = janela.corpo.querySelector('.cbl-previa');
        const palco = janela.corpo.querySelector('#qrp-palco-previa');

        try {
            B().desenharQr(janela.corpo.querySelector('.cbl-canvas'), link, B().ladoQrParaEscala());
            B().ajustarPrevia(moldura, palco);
            // A janela abre com animação; quando ela assenta, remede.
            setTimeout(() => B().ajustarPrevia(moldura, palco), 320);
            window.addEventListener('resize', () => B().ajustarPrevia(moldura, palco));
        } catch (err) {
            console.error('[qr] desenhar:', err);
            if (moldura) moldura.innerHTML = '<div class="cbl-falha">Não foi possível desenhar ' +
                'o QR nesta tela. O link, no rodapé, funciona do mesmo jeito.</div>';
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

        janela.corpo.querySelector('#qrp-copiar-img').onclick = async (ev) => {
            const r = await comBloco(link, (bloco) =>
                B().copiar(bloco, arquivo, ev.currentTarget, '📋 Copiar imagem para o laudo'));
            if (r === 'copiado' || r === 'baixado') auditar(pacienteId, 'copiar_qr_prontuario');
        };

        janela.corpo.querySelector('#qrp-baixar').onclick = async (ev) => {
            const r = await comBloco(link, (bloco) =>
                B().baixar(bloco, arquivo, ev.currentTarget, 'Ou baixe o arquivo PNG'));
            if (r === 'baixado') auditar(pacienteId, 'baixar_qr_prontuario');
        };

        janela.corpo.querySelector('#qrp-imprimir').onclick = (ev) =>
            comBloco(link, (bloco) =>
                B().imprimir(bloco, nomePaciente || '', ev.currentTarget, '🖨️ Imprimir'));

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

    return { abrir, linkDoToken };
})();

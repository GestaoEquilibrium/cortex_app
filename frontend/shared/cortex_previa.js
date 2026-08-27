// ============================================================================
// CORTEX_APP — cortex_previa.js  ·  Sprint previas (v2.0)
// ============================================================================
// Visualização PRÉVIA em janela suspensa, em cima do CortexPop.
//
// Três frentes:
//
//   1. PDF DA PRÓPRIA PÁGINA (páginas de resultado de teste)
//      As 37 páginas de correção já geram o PDF com html2canvas + jsPDF e
//      chamam pdf.save(nome). Em vez de duplicar essa lógica aqui (o que
//      significaria manter 37 variações de layout e de nome de arquivo em
//      dois lugares), interceptamos jsPDF.prototype.save: quando a prévia
//      está ativa, o save não baixa — devolve um blob que abrimos na janela.
//      Resultado: a prévia é EXATAMENTE o PDF que seria baixado, e nenhuma
//      das 37 páginas precisou ser editada.
//
//   2. ARQUIVO DO STORAGE (laudos, anexos, fotos)
//      CortexPrevia.arquivo({ bucket, path, ... }) gera a signed URL e abre.
//
//   3. PRONTUÁRIO (pasta do paciente)
//      CortexPrevia.paciente(linha) abre um resumo sem sair da lista.
//
// API (window.CortexPrevia):
//   .pdfDaPagina(opcoes)
//   .arquivo({ bucket, path, nome, titulo, subtitulo, expira })
//   .paciente(linha, { hrefPasta })
//   .disponivel()   -> o CortexPop está carregado?
// ============================================================================

window.CortexPrevia = (function () {
    'use strict';

    const ehIOS = /iPad|iPhone|iPod/.test(navigator.userAgent || '') ||
                  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    function disponivel() { return !!window.CortexPop; }

    function esc(t) {
        if (t === null || t === undefined) return '';
        const d = document.createElement('div');
        d.textContent = String(t);
        return d.innerHTML;
    }

    function avisar(msg, tipo) {
        if (window.CortexUI && window.CortexUI.toast) window.CortexUI.toast(msg, tipo || 'info');
        else console.warn('[previa]', msg);
    }

    function dormir(ms) { return new Promise(r => setTimeout(r, ms)); }

    const IC_OLHO = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>';
    const IC_DOC  = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
    const IC_BAIXAR = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
    const IC_ABRIR = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>';

    // ────────────────────────────────────────────────────────────────────────
    // Corpo da prévia de PDF.
    // O Safari do iPhone não renderiza PDF dentro de iframe (fica em branco),
    // então lá mostramos um painel com as ações em vez de uma moldura vazia.
    // ────────────────────────────────────────────────────────────────────────
    function corpoPdf(url, nome) {
        if (ehIOS) {
            return `
                <div class="cx-preview" style="flex-direction:column;gap:14px;text-align:center;padding:34px 22px">
                    <div class="cx-pop-ico tone-blue" style="width:52px;height:52px">${IC_DOC}</div>
                    <div>
                        <div style="font-weight:700;font-size:15px">${esc(nome)}</div>
                        <div style="font-size:12.5px;color:var(--color-text-muted);margin-top:4px">
                            O Safari do iPhone não exibe PDF dentro da janela.
                        </div>
                    </div>
                    <a class="btn btn-primary" href="${url}" target="_blank" rel="noopener"
                       style="text-decoration:none">${IC_ABRIR} Abrir o PDF</a>
                </div>`;
        }
        return `<div class="cx-preview"><iframe src="${url}#toolbar=1&navpanes=0" title="${esc(nome)}"></iframe></div>`;
    }

    function baixarUrl(url, nome) {
        const a = document.createElement('a');
        a.href = url;
        if (nome) a.download = nome;
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        a.remove();
    }

    // ════════════════════════════════════════════════════════════════════════
    // 1 · PDF DA PRÓPRIA PÁGINA — interceptação do jsPDF.save
    // ════════════════════════════════════════════════════════════════════════

    let capturando = false;
    let capturado = null;
    let patchAplicado = false;

    function aplicarPatchJsPdf() {
        if (patchAplicado) return true;
        const J = window.jspdf && window.jspdf.jsPDF;
        if (!J || !J.prototype || typeof J.prototype.save !== 'function') return false;

        const saveOriginal = J.prototype.save;
        J.prototype.save = function (nomeArquivo) {
            if (!capturando) return saveOriginal.apply(this, arguments);
            try {
                capturado = {
                    url: this.output('bloburl'),
                    nome: nomeArquivo || 'documento.pdf'
                };
            } catch (e) {
                console.error('[previa] não consegui extrair o PDF:', e);
                capturado = { erro: e };
            }
            return this;   // a página segue o fluxo normal (finally, botão etc.)
        };

        patchAplicado = true;
        return true;
    }

    // Silencia o "PDF gerado com sucesso" da página durante a prévia —
    // nada foi baixado ainda, o aviso confundiria.
    function silenciar(ativo) {
        if (!window.CortexUI || !window.CortexUI.toast) return;
        if (ativo) {
            if (window.CortexUI.__toastOriginal) return;
            window.CortexUI.__toastOriginal = window.CortexUI.toast;
            window.CortexUI.toast = function () {};
        } else if (window.CortexUI.__toastOriginal) {
            window.CortexUI.toast = window.CortexUI.__toastOriginal;
            delete window.CortexUI.__toastOriginal;
        }
    }

    /**
     * Dispara a geração de PDF que a própria página já sabe fazer e mostra
     * o resultado numa janela suspensa, em vez de baixar.
     */
    async function pdfDaPagina(op) {
        op = op || {};

        if (!disponivel()) { avisar('Sistema de janelas não carregou. Recarregue a página.', 'danger'); return; }

        const botao = document.getElementById(op.botaoId || 'btn-gerar-pdf');
        if (!botao) { avisar('Botão de PDF não encontrado nesta página.', 'danger'); return; }

        if (!aplicarPatchJsPdf()) {
            avisar('Biblioteca de PDF ainda carregando. Tente de novo em instantes.', 'info');
            return;
        }

        const btnPrevia = document.getElementById('btn-previa-pdf');
        const rotulo = btnPrevia ? btnPrevia.innerHTML : null;
        if (btnPrevia) {
            btnPrevia.disabled = true;
            btnPrevia.innerHTML = 'Montando prévia...';
        }

        capturando = true;
        capturado = null;
        silenciar(true);

        try {
            botao.click();

            // gerarPDF é assíncrono (html2canvas). Espera o save ser chamado.
            const limite = Date.now() + (op.timeout || 60000);
            while (!capturado && Date.now() < limite) await dormir(120);

            if (!capturado) throw new Error('A geração do PDF demorou demais.');
            if (capturado.erro) throw capturado.erro;

            const { url, nome } = capturado;

            window.CortexPop.abrir({
                titulo: op.titulo || nome,
                subtitulo: op.subtitulo || 'Prévia — este é exatamente o PDF que será baixado',
                icone: IC_DOC,
                tone: 'blue',
                tamanho: 'xl',
                semPadding: true,
                maximizavel: true,
                html: corpoPdf(url, nome),
                acoesTopo: [{
                    titulo: 'Baixar',
                    icone: IC_BAIXAR,
                    onClick: () => baixarUrl(url, nome)
                }],
                rodape: [
                    { label: 'Fechar', classe: 'btn-secondary' },
                    {
                        label: 'Baixar PDF',
                        classe: 'btn-primary',
                        fechar: false,
                        onClick: () => { baixarUrl(url, nome); return false; }
                    }
                ],
                aoFechar: () => { try { URL.revokeObjectURL(url); } catch (_) {} }
            });
        } catch (err) {
            console.error('[previa] pdfDaPagina:', err);
            avisar('Não consegui montar a prévia: ' + (err.message || 'erro desconhecido'), 'danger');
        } finally {
            capturando = false;
            capturado = null;
            silenciar(false);
            if (btnPrevia) {
                btnPrevia.disabled = false;
                if (rotulo !== null) btnPrevia.innerHTML = rotulo;
            }
        }
    }

    // ── Injeta o botão "Ver prévia" ao lado do "Gerar PDF" existente ────────
    function injetarBotaoPrevia() {
        const alvo = document.getElementById('btn-gerar-pdf');
        if (!alvo || document.getElementById('btn-previa-pdf')) return true;

        const btn = document.createElement('button');
        btn.id = 'btn-previa-pdf';
        btn.className = 'btn btn-secondary';
        btn.type = 'button';
        btn.innerHTML = IC_OLHO + ' Ver prévia';
        btn.style.marginRight = '8px';
        btn.addEventListener('click', () => pdfDaPagina());

        alvo.parentNode.insertBefore(btn, alvo);
        return true;
    }

    function observarBotao() {
        if (injetarBotaoPrevia()) return;
        // A barra de ações só aparece depois que o resultado carrega.
        let tentativas = 0;
        const t = setInterval(() => {
            if (injetarBotaoPrevia() || ++tentativas > 120) clearInterval(t);
        }, 250);
    }

    // ════════════════════════════════════════════════════════════════════════
    // 2 · ARQUIVO DO STORAGE
    // ════════════════════════════════════════════════════════════════════════

    async function arquivo(op) {
        op = op || {};
        if (!disponivel()) { avisar('Sistema de janelas não carregou.', 'danger'); return; }
        if (!op.bucket || !op.path) { avisar('Arquivo não informado.', 'danger'); return; }

        try {
            const { data, error } = await window.cortexClient
                .storage
                .from(op.bucket)
                .createSignedUrl(op.path, op.expira || 600);

            if (error || !data || !data.signedUrl) throw error || new Error('URL não gerada');

            const url = data.signedUrl;
            const nome = op.nome || op.path.split('/').pop() || 'arquivo';
            const limpo = nome.split('?')[0].toLowerCase();
            const ehImagem = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/.test(limpo);

            const corpo = ehImagem
                ? `<div class="cx-preview"><img src="${url}" alt="${esc(nome)}"></div>`
                : corpoPdf(url, nome);

            window.CortexPop.abrir({
                titulo: op.titulo || nome,
                subtitulo: op.subtitulo || '',
                icone: IC_DOC,
                tone: ehImagem ? 'purple' : 'blue',
                tamanho: op.tamanho || (ehImagem ? 'lg' : 'xl'),
                semPadding: true,
                maximizavel: true,
                html: corpo,
                acoesTopo: [{
                    titulo: 'Baixar',
                    icone: IC_BAIXAR,
                    onClick: () => {
                        if (op.aoBaixar) op.aoBaixar();
                        else baixarUrl(url, nome);
                    }
                }],
                rodape: op.rodape || [{ label: 'Fechar', classe: 'btn-secondary' }]
            });
        } catch (err) {
            console.error('[previa] arquivo:', err);
            avisar('Erro ao abrir o arquivo: ' + (err.message || 'desconhecido'), 'danger');
        }
    }

    // ════════════════════════════════════════════════════════════════════════
    // 3 · PÁGINA EMBUTIDA — resultado de teste em janela suspensa
    // ════════════════════════════════════════════════════════════════════════
    //
    // A página de resultado já existe e sabe se desenhar sozinha. Em vez de
    // recriar o relatório aqui, abrimos a própria página num iframe com
    // ?embed=1 — o sidebar.js reconhece esse parâmetro e não desenha menu,
    // topbar nem barra inferior. A sessão é a mesma (sessionStorage é
    // compartilhado entre iframes de mesma origem na mesma aba), então o
    // auth_guard autentica normalmente.

    function comEmbed(url) {
        if (!url) return url;
        if (/[?&]embed=1(&|$)/.test(url)) return url;
        return url + (url.indexOf('?') >= 0 ? '&' : '?') + 'embed=1';
    }

    function pagina(op) {
        op = op || {};
        if (!disponivel()) {
            // Sem o CortexPop, navega do jeito antigo em vez de travar.
            if (op.url) window.location.href = op.url;
            return;
        }
        if (!op.url) return;

        const src = comEmbed(op.url);

        const janela = window.CortexPop.abrir({
            titulo: op.titulo || 'Resultado',
            subtitulo: op.subtitulo || '',
            icone: op.icone || IC_DOC,
            tone: op.tone || 'blue',
            tamanho: op.tamanho || 'xl',
            semPadding: true,
            maximizavel: true,
            html: `
                <div class="cx-embed">
                    <div class="cx-embed-carregando" data-embed-carregando>
                        <div class="cx-embed-spinner"></div>
                        <span>Carregando…</span>
                    </div>
                    <iframe class="cx-embed-frame" src="${esc(src)}" title="${esc(op.titulo || 'Resultado')}"></iframe>
                </div>`,
            acoesTopo: [{
                titulo: 'Abrir em página inteira',
                icone: IC_ABRIR,
                onClick: () => { window.location.href = op.url; }
            }],
            rodape: op.rodape
        });

        const frame = janela.corpo.querySelector('.cx-embed-frame');
        const load = janela.corpo.querySelector('[data-embed-carregando]');
        if (frame) {
            frame.addEventListener('load', () => { if (load) load.remove(); });
            // Se o iframe travar, tira o spinner mesmo assim.
            setTimeout(() => { if (load) load.remove(); }, 15000);
        }

        return janela;
    }

    /** Atalho semântico para as chamadas de "Ver resultado". */
    function resultado(op) {
        op = op || {};
        return pagina({
            url: op.url,
            titulo: op.titulo || 'Resultado do teste',
            subtitulo: op.subtitulo || '',
            tone: 'purple',
            tamanho: 'xl'
        });
    }

    // ════════════════════════════════════════════════════════════════════════
    // 3 · PRONTUÁRIO — prévia sem sair da lista
    // ════════════════════════════════════════════════════════════════════════

    function linhaInfo(rotulo, valor) {
        if (!valor && valor !== 0) return '';
        return `
            <div style="display:flex;gap:10px;padding:9px 0;border-bottom:1px solid var(--slate-100)">
                <span style="min-width:112px;font-size:12px;font-weight:650;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.05em">${esc(rotulo)}</span>
                <span style="font-size:13.5px">${esc(valor)}</span>
            </div>`;
    }

    /**
     * Prévia do prontuário a partir da linha que a lista já carregou.
     * Não faz consulta nova: usa só os campos que vieram no objeto, então
     * nunca depende de coluna que possa não existir na view.
     */
    function paciente(linha, op) {
        op = op || {};
        if (!disponivel()) { avisar('Sistema de janelas não carregou.', 'danger'); return; }
        if (!linha) return;

        const href = op.hrefPasta || ('pasta.html?id=' + encodeURIComponent(linha.id));

        const statusLabel = (window.CortexUI && window.CortexUI.STATUS_LABELS &&
                             window.CortexUI.STATUS_LABELS[linha.status]) || linha.status || '—';
        const statusClasse = (window.CortexUI && window.CortexUI.STATUS_CLASSES &&
                              window.CortexUI.STATUS_CLASSES[linha.status]) || 'status-info';

        const avatar = (window.CortexAvatar && window.CortexAvatar.render)
            ? window.CortexAvatar.render(linha, { tamanho: 'md' })
            : '';

        // Só campos que realmente vieram no objeto.
        const campos = [
            ['Idade',      linha.idade_humanizada],
            ['Convênio',   linha.convenio_nome],
            ['Aplicador',  linha.aplicador_nome],
            ['Telefone',   linha.telefone],
            ['E-mail',     linha.email],
            ['CPF',        linha.cpf],
            ['Cidade',     linha.cidade]
        ].map(([r, v]) => linhaInfo(r, v)).join('');

        const html = `
            <div style="display:flex;align-items:center;gap:14px;margin-bottom:16px">
                ${avatar}
                <div style="min-width:0">
                    <div style="font-size:17px;font-weight:700;letter-spacing:-.02em">${esc(linha.nome_completo || '—')}</div>
                    <span class="badge ${statusClasse}" style="margin-top:5px;display:inline-block">${esc(statusLabel)}</span>
                </div>
            </div>
            <div>${campos || '<p style="color:var(--color-text-muted);font-size:13px">Sem dados adicionais nesta visão.</p>'}</div>
            <div id="previa-laudo-slot" style="margin-top:14px"></div>
        `;

        const janela = window.CortexPop.abrir({
            titulo: 'Prontuário',
            subtitulo: 'Prévia rápida — a pasta completa tem todas as etapas',
            tone: 'purple',
            tamanho: 'md',
            html: html,
            rodape: [
                { label: 'Fechar', classe: 'btn-secondary' },
                {
                    label: 'Abrir pasta completa',
                    classe: 'btn-primary',
                    onClick: () => { window.location.href = href; return false; }
                }
            ]
        });

        // Em background, oferece o laudo mais recente já dentro da prévia.
        carregarLaudoNaPrevia(linha.id, janela);
        return janela;
    }

    async function carregarLaudoNaPrevia(pacienteId, janela) {
        if (!pacienteId || !window.cortexClient) return;
        try {
            const { data, error } = await window.cortexClient
                .from('laudos_paciente')
                .select('*')
                .eq('paciente_id', pacienteId)
                .order('versao', { ascending: false })
                .limit(1);

            if (error || !data || !data.length) return;

            const laudo = data[0];
            const slot = janela.corpo.querySelector('#previa-laudo-slot');
            if (!slot) return;

            slot.innerHTML = `
                <div style="display:flex;align-items:center;gap:11px;padding:13px;border-radius:var(--radius-md);
                            background:var(--gradient-softer);border:1px solid var(--color-border)">
                    <div class="cx-pop-ico tone-green" style="width:32px;height:32px">${IC_DOC}</div>
                    <div style="flex:1;min-width:0">
                        <div style="font-size:13.5px;font-weight:650">Laudo v${esc(laudo.versao)}</div>
                        <div style="font-size:12px;color:var(--color-text-muted);overflow:hidden;
                                    text-overflow:ellipsis;white-space:nowrap">${esc(laudo.arquivo_nome_original || '')}</div>
                    </div>
                    <button class="btn btn-secondary" id="previa-ver-laudo"
                            style="padding:7px 12px;font-size:12.5px;flex-shrink:0">${IC_OLHO} Ver</button>
                </div>`;

            slot.querySelector('#previa-ver-laudo').addEventListener('click', () => {
                arquivo({
                    bucket: 'laudos',
                    path: laudo.arquivo_path,
                    nome: laudo.arquivo_nome_original || ('laudo-v' + laudo.versao + '.pdf'),
                    titulo: 'Laudo v' + laudo.versao,
                    subtitulo: laudo.arquivo_nome_original || ''
                });
            });
        } catch (err) {
            console.warn('[previa] laudo:', err);
        }
    }

    // ════════════════════════════════════════════════════════════════════════
    // 5 · HOVER — o proprio card expande e vira uma previa da pasta
    // ════════════════════════════════════════════════════════════════════════
    //
    // Em vez de um painel solto flutuando ao lado (que cobria cards vizinhos e
    // deixava duvida sobre a quem pertencia), o card cresce no lugar: ganha
    // relevo e uma continuacao emendada logo abaixo, sem costura, como se
    // fosse um so. A grade nao se mexe — a continuacao fica sobreposta.
    //
    // A foto vem de graca: a lista ja trocou as iniciais pela imagem assinada
    // dentro do card, entao clonamos o avatar que ja esta ali em vez de pedir
    // outra URL ao Storage.
    //
    // No hover tambem disparamos o pre-carregamento da pasta do paciente, pra
    // que o clique caia numa pagina ja em cache.

    const ATRASO_ABRIR = 320;
    const ATRASO_FECHAR = 160;
    const ALTURA_ESTIMADA = 300;   // pra decidir se abre pra baixo ou pra cima

    let cardAberto = null;
    let tOpen = null;
    let tClose = null;
    const cacheLaudo = new Map();
    const jaPrefetch = new Set();

    function temMouse() {
        return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    }

    function fecharExpansao() {
        clearTimeout(tOpen);
        if (!cardAberto) return;
        const card = cardAberto;
        cardAberto = null;

        const exp = card.querySelector('.card-expansao');
        card.classList.remove('is-expandido');
        if (exp) {
            exp.classList.remove('is-open');
            setTimeout(() => exp.remove(), 200);
        }
    }

    function agendarFechar() {
        clearTimeout(tClose);
        tClose = setTimeout(fecharExpansao, ATRASO_FECHAR);
    }

    function cancelarFechar() { clearTimeout(tClose); }

    // Pre-carrega a pasta do paciente para o clique ser instantaneo.
    function prefetchPasta(id) {
        const chave = String(id);
        if (jaPrefetch.has(chave)) return;
        jaPrefetch.add(chave);
        try {
            const l = document.createElement('link');
            l.rel = 'prefetch';
            l.as = 'document';
            l.href = 'pasta.html?id=' + encodeURIComponent(id);
            document.head.appendChild(l);
        } catch (_) { /* prefetch e otimizacao, nunca erro fatal */ }
    }

    // Clona o avatar que a lista ja carregou (com a foto assinada, quando tem).
    function avatarGrande(card, linha) {
        const orig = card.querySelector('.avatar');
        if (orig) {
            const clone = orig.cloneNode(true);
            clone.classList.remove('avatar-sm', 'avatar-md');
            clone.classList.add('avatar-lg');
            return clone.outerHTML;
        }
        if (window.CortexAvatar && window.CortexAvatar.render) {
            return window.CortexAvatar.render(linha, { tamanho: 'lg' });
        }
        return '';
    }

    function expandir(card, linha) {
        fecharExpansao();
        if (card.querySelector('.card-expansao')) return;

        const campos = [
            ['Telefone', linha.telefone],
            ['E-mail',   linha.email],
            ['CPF',      linha.cpf],
            ['Cidade',   linha.cidade],
            ['Aplicador', linha.aplicador_nome]
        ].map(([r, v]) => linhaInfo(r, v)).join('');

        const exp = document.createElement('div');
        exp.className = 'card-expansao';

        // Sem espaco embaixo? A continuacao sobe e emenda no topo do card.
        const r = card.getBoundingClientRect();
        const paraCima = (window.innerHeight - r.bottom) < ALTURA_ESTIMADA &&
                         r.top > ALTURA_ESTIMADA;
        if (paraCima) exp.classList.add('acima');

        exp.innerHTML = `
            <div class="card-expansao-topo">
                ${avatarGrande(card, linha)}
                <div class="card-expansao-id">
                    <div class="card-expansao-nome">${esc(linha.nome_completo || '\u2014')}</div>
                    <div class="card-expansao-idade">${esc(linha.idade_humanizada || '')}</div>
                </div>
            </div>
            <div class="card-expansao-campos">${campos ||
                '<p class="card-expansao-vazio">Sem dados de contato cadastrados.</p>'}</div>
            <div data-slot-laudo></div>
            <div class="card-expansao-rodape">Clique para abrir a pasta completa</div>`;

        // Impede que o hover na expansao dispare o fechamento do card.
        exp.addEventListener('mouseenter', cancelarFechar);
        exp.addEventListener('mouseleave', agendarFechar);

        card.appendChild(exp);
        card.classList.add('is-expandido');
        if (paraCima) card.classList.add('is-expandido-acima');
        else card.classList.remove('is-expandido-acima');

        cardAberto = card;
        requestAnimationFrame(() => exp.classList.add('is-open'));

        carregarLaudo(linha.id, card, exp);
    }

    async function carregarLaudo(pacienteId, card, exp) {
        const slot = exp.querySelector('[data-slot-laudo]');
        if (!slot || !window.cortexClient) return;

        const chave = String(pacienteId);
        let laudo = cacheLaudo.get(chave);

        if (laudo === undefined) {
            try {
                const { data, error } = await window.cortexClient
                    .from('laudos_paciente')
                    .select('*')
                    .eq('paciente_id', pacienteId)
                    .order('versao', { ascending: false })
                    .limit(1);
                laudo = (!error && data && data.length) ? data[0] : null;
                cacheLaudo.set(chave, laudo);
            } catch (err) {
                console.warn('[previa] laudo:', err);
                return;
            }
        }

        // O mouse pode ter saido enquanto a consulta rodava.
        if (!laudo || cardAberto !== card) return;

        slot.innerHTML = `
            <div class="card-expansao-laudo">
                <div class="cx-pop-ico tone-green" style="width:30px;height:30px">${IC_DOC}</div>
                <div style="flex:1;min-width:0">
                    <div style="font-size:13px;font-weight:650">Laudo v${esc(laudo.versao)}</div>
                    <div class="card-expansao-arquivo">${esc(laudo.arquivo_nome_original || '')}</div>
                </div>
                <button class="btn btn-secondary" data-ver-laudo
                        style="padding:6px 11px;font-size:12px;flex-shrink:0">${IC_OLHO} Ver</button>
            </div>`;

        slot.querySelector('[data-ver-laudo]').addEventListener('click', (ev) => {
            ev.stopPropagation();
            ev.preventDefault();
            fecharExpansao();
            arquivo({
                bucket: 'laudos',
                path: laudo.arquivo_path,
                nome: laudo.arquivo_nome_original || ('laudo-v' + laudo.versao + '.pdf'),
                titulo: 'Laudo v' + laudo.versao,
                subtitulo: laudo.arquivo_nome_original || ''
            });
        });
    }

    /**
     * Liga a expansao por hover nos cards/linhas de um container.
     * Recebe a lista ja carregada pela pagina — nao consulta pacientes.
     */
    function ativarHover(container, lista) {
        if (!container || !temMouse()) return;

        const porId = new Map((lista || []).map(x => [String(x.id), x]));

        // So os CARDS expandem. No modo Lista os elementos sao <tr>, e um
        // <div> dentro de uma linha de tabela e expulso da tabela pelo
        // navegador — viraria lixo flutuando na tela.
        container.querySelectorAll('.paciente-card[data-paciente-id]').forEach(el => {
            el.addEventListener('mouseenter', () => {
                cancelarFechar();
                const id = el.dataset.pacienteId;
                if (cardAberto === el) return;

                prefetchPasta(id);

                clearTimeout(tOpen);
                tOpen = setTimeout(() => {
                    const linha = porId.get(String(id));
                    if (linha) expandir(el, linha);
                }, ATRASO_ABRIR);
            });

            el.addEventListener('mouseleave', () => {
                clearTimeout(tOpen);
                agendarFechar();
            });
        });

        // No modo Lista nao ha expansao, mas o pre-carregamento da pasta
        // continua valendo: passar o mouse ja deixa a pagina em cache.
        container.querySelectorAll('tr[data-paciente-id]').forEach(el => {
            el.addEventListener('mouseenter', () => prefetchPasta(el.dataset.pacienteId));
        });

        window.addEventListener('scroll', fecharExpansao, { passive: true });
    }

    // ── Boot ────────────────────────────────────────────────────────────────
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', observarBotao);
    } else {
        observarBotao();
    }

    return { pdfDaPagina, arquivo, paciente, pagina, resultado, ativarHover, disponivel };
})();

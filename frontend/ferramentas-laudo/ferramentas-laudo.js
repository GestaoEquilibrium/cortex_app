// ============================================================================
// CORTEX_APP — Ferramentas de Laudo (somente admins: clínico + gestor)
// ----------------------------------------------------------------------------
// Parte A: tabelas prontas de referência (Classificação de QI) — copiar imagem.
// Parte B: montador de tabela livre — colunas e linhas definidas pelo usuário;
//          cor por linha automática pela classificação (com troca manual).
// Parte C: blocos de laudo — o convite de avaliação no Google, com QR.
// Estética: sólida-suave (cola bem em documento). Copia como imagem via CortexCopy.
//
// O bloco do Google usa shared/bloco_laudo.js, o mesmo motor do QR do
// prontuário: HTML montado na largura de impressão, virado imagem pelo
// html2canvas e copiado para a área de transferência. Aqui o link é fixo, sem
// token e sem banco — é a mesma página de avaliação para todos os pacientes.
// ============================================================================

(function () {
    'use strict';

    // Paleta suave por classificação (mesmas famílias do padrão CORTEX)
    const CORES = {
        verde:   { bg:'rgba(29,158,117,0.10)',  bd:'rgba(29,158,117,0.20)',  fg:'#0F6E56', fgForte:'#04342C' },
        azul:    { bg:'rgba(55,138,221,0.10)',   bd:'rgba(55,138,221,0.20)',  fg:'#185FA5', fgForte:'#042C53' },
        ambar:   { bg:'rgba(239,159,39,0.12)',   bd:'rgba(239,159,39,0.22)',  fg:'#854F0B', fgForte:'#633806' },
        vermelho:{ bg:'rgba(226,75,74,0.10)',    bd:'rgba(226,75,74,0.20)',   fg:'#A32D2D', fgForte:'#501313' },
        cinza:   { bg:'rgba(136,135,128,0.08)',  bd:'rgba(136,135,128,0.18)', fg:'#5F5E5A', fgForte:'#2C2C2A' },
    };
    const ORDEM_CORES = ['verde','azul','ambar','vermelho','cinza'];

    // Classificação (texto) -> cor automática
    function corAutomatica(txt) {
        const t = (txt || '').toLowerCase();
        if (/(muito superior|superior|excepcional|elevad|acima)/.test(t)) return 'verde';
        if (/(m[eé]dio inferior|lim[ií]trofe|vulnerab|aten[çc][aã]o)/.test(t)) return 'ambar';
        if (/(inferior|baixo|muito inferior|severo|deficit|défici|preju[ií]zo|negativ)/.test(t)) return 'vermelho';
        if (/(m[eé]dio|t[ií]pico|estável|estavel|adequad|preservad|normal)/.test(t)) return 'azul';
        return 'cinza';
    }

    // Estado do montador
    const mont = {
        titulo: 'Tabela de resultados',
        colunas: ['Medida', 'Bruto', 'Percentil', 'Classificação'],
        colClassif: 3, // índice da coluna que define a cor (a "Classificação")
        linhas: [
            ['', '', '', ''],
        ],
        coresManuais: {}, // idxLinha -> cor (sobrepõe a automática)
    };

    const esc = (t) => { const d=document.createElement('div'); d.textContent=t==null?'':String(t); return d.innerHTML; };

    window.addEventListener('cortex:auth-ready', async () => {
        await CortexSidebar.render('ferramentas-laudo');

        if (!window.CortexPerfil || !window.CortexPerfil.isAdmin || !window.CortexPerfil.isAdmin()) {
            document.getElementById('fl-conteudo').innerHTML =
                `<div class="fl-negado"><div class="fl-negado-ic">🔒</div>
                 <h2>Acesso restrito</h2>
                 <p>As ferramentas de laudo estão disponíveis apenas para administradores.</p></div>`;
            return;
        }

        montarUI();
    });

    // ── Tabela pronta: Classificação de QI ───────────────────────────────────
    // Cores um pouco mais fortes e texto em negrito (só nesta tabela)
    const CORES_QI = {
        verde:   { bg:'rgba(29,158,117,0.18)',  bd:'rgba(29,158,117,0.30)',  fg:'#0F6E56', fgForte:'#04342C' },
        azul:    { bg:'rgba(55,138,221,0.18)',   bd:'rgba(55,138,221,0.30)',  fg:'#185FA5', fgForte:'#042C53' },
        ambar:   { bg:'rgba(239,159,39,0.20)',   bd:'rgba(239,159,39,0.32)',  fg:'#854F0B', fgForte:'#633806' },
        vermelho:{ bg:'rgba(226,75,74,0.18)',    bd:'rgba(226,75,74,0.30)',   fg:'#A32D2D', fgForte:'#501313' },
    };
    function tabelaQI() {
        const linhas = [
            ['2,2','>98','>130','Q.I Muito Superior','Desempenho excepcional','verde'],
            ['6,7','91 – 97','120 – 129','Q.I Superior','Recurso cognitivo robusto','verde'],
            ['16,1','75 – 90','110 – 119','Q.I Médio Superior','Acima da média da maioria','verde'],
            ['50','25 – 74','90 – 109','Q.I Médio','Funcionamento estável','azul'],
            ['16,1','09 – 24','80 – 89','Q.I Médio Inferior','Zona de vulnerabilidade','ambar'],
            ['6,7','02 – 08','70 – 79','Q.I Inferior (Limítrofe)','Dificuldades significativas','vermelho'],
            ['2,2','<2','≤ 70','Extremamente Baixo','Prejuízo funcional severo','vermelho'],
        ];
        const heads = ['% Pop.','Percentil','QI / Escore','Classificação Científica','Interpretação Clínica'];
        const cols = '0.7fr 0.9fr 0.9fr 1.3fr 1.5fr';
        const th = heads.map(h => `<div class="fl-th">${esc(h)}</div>`).join('');
        const body = linhas.map(l => {
            const c = CORES_QI[l[5]];
            const cel = (v,i) => `<div class="fl-td" style="color:${i>=2&&i<=3?c.fgForte:c.fg}; font-weight:700;">${esc(v)}</div>`;
            return `<div class="fl-row" style="grid-template-columns:${cols}; background:${c.bg}; border-bottom:0.5px solid ${c.bd};">
                ${l.slice(0,5).map((v,i)=>cel(v,i)).join('')}</div>`;
        }).join('');
        return `
        <div class="fl-tabela-copiavel" data-copiavel data-copy-nome="Classificacao de QI"><div class="fl-tabela-laudo" style="grid-template-columns:${cols};">
            <div class="fl-head" style="grid-template-columns:${cols};">${th}</div>
            ${body}
        </div></div>`;
    }

    // ── Render do montador ───────────────────────────────────────────────────
    function renderMontadorPreview() {
        const n = mont.colunas.length;
        const cols = `repeat(${n}, 1fr)`;
        const th = mont.colunas.map(h => `<div class="fl-th">${esc(h)}</div>`).join('');
        const body = mont.linhas.map((linha, idx) => {
            const classifTxt = linha[mont.colClassif] || '';
            const corNome = mont.coresManuais[idx] || corAutomatica(classifTxt);
            const c = CORES[corNome];
            const cel = (v,i) => {
                const forte = (i === mont.colClassif);
                return `<div class="fl-td" style="color:${forte?c.fgForte:c.fg}; ${forte?'font-weight:500;':''}">${esc(v||'')}</div>`;
            };
            return `<div class="fl-row" style="grid-template-columns:${cols}; background:${c.bg}; border-bottom:0.5px solid ${c.bd};">
                ${linha.map((v,i)=>cel(v,i)).join('')}</div>`;
        }).join('');
        return `
        <div class="fl-tabela-copiavel" data-copiavel data-copy-nome="${esc(mont.titulo||'Tabela')}"><div class="fl-tabela-laudo" style="grid-template-columns:${cols};">
            <div class="fl-head" style="grid-template-columns:${cols};">${th}</div>
            ${body}
        </div></div>`;
    }

    function renderEditor() {
        const colInputs = mont.colunas.map((c,i) => `
            <div class="fl-col-edit">
                <input class="fl-inp-col" data-col="${i}" value="${esc(c)}" placeholder="Coluna ${i+1}">
                ${mont.colunas.length>1 ? `<button class="fl-x-col" data-delcol="${i}" title="Remover coluna">✕</button>` : ''}
            </div>`).join('');

        const linhasEdit = mont.linhas.map((linha, li) => {
            const celas = linha.map((v,ci) => `<input class="fl-inp-cel" data-lin="${li}" data-cel="${ci}" value="${esc(v)}" placeholder="—">`).join('');
            const corAtual = mont.coresManuais[li] || corAutomatica(linha[mont.colClassif]||'');
            const swatches = ORDEM_CORES.map(cn => `<span class="fl-swatch ${corAtual===cn?'sel':''}" data-lin="${li}" data-cor="${cn}" style="background:${CORES[cn].fg};" title="${cn}"></span>`).join('');
            return `<div class="fl-lin-edit">
                <div class="fl-lin-celas" style="grid-template-columns:repeat(${mont.colunas.length},1fr);">${celas}</div>
                <div class="fl-lin-cor">${swatches}</div>
                <button class="fl-x-lin" data-dellin="${li}" title="Remover linha">✕</button>
            </div>`;
        }).join('');

        const opcoesColClassif = mont.colunas.map((c,i)=>`<option value="${i}" ${i===mont.colClassif?'selected':''}>${esc(c)}</option>`).join('');

        return `
        <div class="fl-editor">
            <div class="fl-ed-linha">
                <label class="fl-lbl">Título da tabela</label>
                <input class="fl-inp-titulo" value="${esc(mont.titulo)}" placeholder="Ex.: Resultados — Atenção">
            </div>
            <div class="fl-ed-linha">
                <label class="fl-lbl">Colunas</label>
                <div class="fl-cols">${colInputs}<button class="fl-add-col">+ coluna</button></div>
            </div>
            <div class="fl-ed-linha">
                <label class="fl-lbl">Coluna que define a cor (classificação)</label>
                <select class="fl-sel-classif">${opcoesColClassif}</select>
            </div>
            <div class="fl-ed-linha">
                <label class="fl-lbl">Linhas <span class="fl-hint">(a cor é automática pela classificação; clique num quadradinho para trocar)</span></label>
                <div class="fl-linhas">${linhasEdit}</div>
                <button class="fl-add-lin">+ linha</button>
            </div>
        </div>`;
    }

    function reRenderMontador() {
        document.getElementById('fl-editor-wrap').innerHTML = renderEditor();
        document.getElementById('fl-preview-wrap').innerHTML = renderMontadorPreview();
        ligarEditor();
        if (window.CortexCopy?.aplicar) { try { window.CortexCopy.aplicar(); } catch(e){} }
    }

    function ligarEditor() {
        document.querySelector('.fl-inp-titulo')?.addEventListener('input', e => { mont.titulo = e.target.value; atualizarPreview(); });
        document.querySelectorAll('.fl-inp-col').forEach(inp => inp.addEventListener('input', e => {
            mont.colunas[+e.target.dataset.col] = e.target.value; atualizarPreview();
        }));
        document.querySelectorAll('.fl-inp-cel').forEach(inp => inp.addEventListener('input', e => {
            const l=+e.target.dataset.lin, c=+e.target.dataset.cel;
            mont.linhas[l][c] = e.target.value; atualizarPreview();
        }));
        document.querySelector('.fl-sel-classif')?.addEventListener('change', e => { mont.colClassif = +e.target.value; atualizarPreview(); });
        document.querySelector('.fl-add-col')?.addEventListener('click', () => {
            mont.colunas.push('Coluna '+(mont.colunas.length+1));
            mont.linhas.forEach(l => l.push(''));
            reRenderMontador();
        });
        document.querySelectorAll('.fl-x-col').forEach(b => b.addEventListener('click', e => {
            const i = +e.target.dataset.delcol;
            mont.colunas.splice(i,1); mont.linhas.forEach(l => l.splice(i,1));
            if (mont.colClassif >= mont.colunas.length) mont.colClassif = mont.colunas.length-1;
            reRenderMontador();
        }));
        document.querySelector('.fl-add-lin')?.addEventListener('click', () => {
            mont.linhas.push(new Array(mont.colunas.length).fill('')); reRenderMontador();
        });
        document.querySelectorAll('.fl-x-lin').forEach(b => b.addEventListener('click', e => {
            const i = +e.target.dataset.dellin;
            mont.linhas.splice(i,1); delete mont.coresManuais[i];
            if (!mont.linhas.length) mont.linhas.push(new Array(mont.colunas.length).fill(''));
            reRenderMontador();
        }));
        document.querySelectorAll('.fl-swatch').forEach(s => s.addEventListener('click', e => {
            const l = +e.target.dataset.lin, cor = e.target.dataset.cor;
            mont.coresManuais[l] = cor; reRenderMontador();
        }));
    }

    // ════════════════════════════════════════════════════════════════════════
    // PARTE C — Blocos de laudo: convite de avaliação no Google
    // ════════════════════════════════════════════════════════════════════════

    // Página de avaliação do Grupo Equilibrium no Google. Os utm_* são o que
    // faz a avaliação aparecer como vinda do QR no painel do Google Business.
    const LINK_GOOGLE = 'https://g.page/r/CVq0oQK8oq7HEBM/review' +
                        '?utm_source=gbp&utm_medium=reviews&utm_campaign=qr';

    const TEXTO_GOOGLE =
        'Ficamos muito felizes em realizar essa Avaliação Neuropsicológica, esperamos ' +
        'que esse laudo possa auxiliar em sua jornada. Você poderia nos ajudar com uma ' +
        'breve avaliação no Google? É rapidinho, leva menos de um minuto. Sua opinião é ' +
        'fundamental para que outras pessoas também encontrem o suporte de que precisam!';

    const B = () => window.CortexBlocoLaudo;

    function blocoGoogleHtml() {
        return `
            <div class="cbl-barra"></div>
            <div class="cbl-esq">
                <div class="cbl-qr"><canvas class="cbl-canvas" id="fl-canvas-google"></canvas></div>
                <div class="cbl-escaneie">Escaneie aqui</div>
            </div>
            <div class="cbl-dir">
                <div class="cbl-selos">
                    <span class="cbl-estrelas">★★★★★</span>
                    <span class="cbl-selo ambar">AVALIE NO GOOGLE</span>
                </div>
                <div class="cbl-tit conversa">Sua opinião faz a diferença!</div>
                <p class="cbl-texto">${esc(TEXTO_GOOGLE)}</p>
            </div>`;
    }

    // Monta o bloco na largura de impressão, fora da vista, e entrega pronto.
    function comBlocoGoogle(trabalho) {
        return B().comPalco(blocoGoogleHtml(), { classe: 'cbl-bloco' },
            async (bloco, palco) => {
                B().desenharQr(palco.querySelector('.cbl-canvas'), LINK_GOOGLE,
                               B().ladoQrParaEscala());
                return await trabalho(bloco);
            });
    }

    function renderSecaoBlocos() {
        return `
            <h2 class="fl-h2">Avaliação no Google</h2>
            <p class="fl-nota">
                Bloco para o fim do laudo. Copie a imagem e cole no documento —
                o QR abre direto a página de avaliação da clínica.
            </p>

            <div class="fl-bloco-moldura">
                <div class="cbl-previa" id="fl-previa-google">
                    <div class="cbl-previa-palco" id="fl-palco-google">
                        <div class="cbl-bloco" style="width:${B().LARGURA_PADRAO}px; font-size:${B().ESCALA_PADRAO}px">${blocoGoogleHtml()}</div>
                    </div>
                </div>

                <div class="cbl-acoes">
                    <button class="btn btn-primary btn-sm" id="fl-copiar-google">
                        📋 Copiar imagem para o laudo
                    </button>
                    <button class="btn btn-secondary btn-sm" id="fl-imprimir-google">🖨️ Imprimir</button>
                </div>
                <p class="cbl-dica">
                    Copie e cole no laudo com <strong>Ctrl+V</strong>.
                    <button class="cbl-link-acao" id="fl-baixar-google">Ou baixe o arquivo PNG</button>
                </p>
            </div>`;
    }

    function ligarSecaoBlocos() {
        if (!B()) {
            const m = document.querySelector('.fl-bloco-moldura');
            if (m) m.innerHTML = '<div class="cbl-falha">O módulo dos blocos de laudo não ' +
                                 'carregou. Recarregue a página.</div>';
            return;
        }

        const moldura = document.getElementById('fl-previa-google');
        const palco = document.getElementById('fl-palco-google');

        try {
            B().desenharQr(document.getElementById('fl-canvas-google'), LINK_GOOGLE,
                           B().ladoQrParaEscala());
            B().ajustarPrevia(moldura, palco);
            window.addEventListener('resize', () => B().ajustarPrevia(moldura, palco));
        } catch (err) {
            console.error('[fl] QR do Google:', err);
            if (moldura) moldura.innerHTML = '<div class="cbl-falha">Não foi possível ' +
                'desenhar o QR nesta tela.</div>';
        }

        const arquivo = 'bloco_avaliacao_google.png';

        const copiar = document.getElementById('fl-copiar-google');
        if (copiar) copiar.onclick = (ev) => comBlocoGoogle((bloco) =>
            B().copiar(bloco, arquivo, ev.currentTarget, '📋 Copiar imagem para o laudo'));

        const baixar = document.getElementById('fl-baixar-google');
        if (baixar) baixar.onclick = (ev) => comBlocoGoogle((bloco) =>
            B().baixar(bloco, arquivo, ev.currentTarget, 'Ou baixe o arquivo PNG'));

        const imprimir = document.getElementById('fl-imprimir-google');
        if (imprimir) imprimir.onclick = (ev) => comBlocoGoogle((bloco) =>
            B().imprimir(bloco, 'Avaliação no Google — Grupo Equilibrium',
                         ev.currentTarget, '🖨️ Imprimir'));
    }

    function atualizarPreview() {
        document.getElementById('fl-preview-wrap').innerHTML = renderMontadorPreview();
        if (window.CortexCopy?.aplicar) { try { window.CortexCopy.aplicar(); } catch(e){} }
    }

    function montarUI() {
        document.getElementById('fl-conteudo').innerHTML = `
            <div class="fl-header">
                <h1 class="fl-titulo">🧩 Ferramentas de Laudo</h1>
                <p class="fl-sub">Tabelas no padrão CORTEX para copiar como imagem e colar no laudo. Restrito a administradores.</p>
            </div>

            <div class="fl-tabs">
                <button class="fl-tab ativa" data-tab="prontas">Tabelas prontas</button>
                <button class="fl-tab" data-tab="montar">Montar tabela</button>
                <button class="fl-tab" data-tab="blocos">Blocos do laudo</button>
            </div>

            <section id="fl-sec-prontas" class="fl-sec">
                <h2 class="fl-h2">Classificação Geral de QI</h2>
                <p class="fl-nota">Passe o mouse sobre a tabela e clique no ícone de câmera para copiar como imagem.</p>
                <div class="fl-pronta-wrap">${tabelaQI()}</div>
            </section>

            <section id="fl-sec-montar" class="fl-sec" style="display:none;">
                <div class="fl-montar-grid">
                    <div id="fl-editor-wrap"></div>
                    <div>
                        <h2 class="fl-h2">Prévia</h2>
                        <p class="fl-nota">Clique na câmera para copiar como imagem.</p>
                        <div id="fl-preview-wrap"></div>
                    </div>
                </div>
            </section>

            <section id="fl-sec-blocos" class="fl-sec" style="display:none;">
                ${renderSecaoBlocos()}
            </section>`;

        document.querySelectorAll('.fl-tab').forEach(t => t.addEventListener('click', e => {
            document.querySelectorAll('.fl-tab').forEach(x=>x.classList.remove('ativa'));
            e.target.classList.add('ativa');
            const tab = e.target.dataset.tab;
            document.getElementById('fl-sec-prontas').style.display = tab==='prontas'?'':'none';
            document.getElementById('fl-sec-montar').style.display  = tab==='montar'?'':'none';
            document.getElementById('fl-sec-blocos').style.display  = tab==='blocos'?'':'none';
            if (tab==='montar') reRenderMontador();
            // A prévia é encolhida por transform e precisa da largura real da
            // moldura: enquanto a seção está escondida, ela mede zero.
            if (tab==='blocos') {
                B() && B().ajustarPrevia(document.getElementById('fl-previa-google'),
                                         document.getElementById('fl-palco-google'));
            }
        }));

        ligarSecaoBlocos();

        if (window.CortexCopy?.aplicar) { try { window.CortexCopy.aplicar(); } catch(e){} }
    }
})();

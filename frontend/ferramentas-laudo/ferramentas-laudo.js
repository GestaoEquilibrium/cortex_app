// ============================================================================
// CORTEX_APP — Ferramentas de Laudo (somente admins: clínico + gestor)
// ----------------------------------------------------------------------------
// Parte A: tabelas prontas de referência (Classificação de QI) — copiar imagem.
// Parte B: montador de tabela livre — colunas e linhas definidas pelo usuário;
//          cor por linha automática pela classificação (com troca manual).
// Estética: sólida-suave (cola bem em documento). Copia como imagem via CortexCopy.
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
            const c = CORES[l[5]];
            const cel = (v,i) => `<div class="fl-td" style="color:${i>=2&&i<=3?c.fgForte:c.fg}; ${i>=2&&i<=3?'font-weight:500;':''}">${esc(v)}</div>`;
            return `<div class="fl-row" style="background:${c.bg}; border-bottom:0.5px solid ${c.bd};">
                ${l.slice(0,5).map((v,i)=>cel(v,i)).join('')}</div>`;
        }).join('');
        return `
        <div class="fl-tabela" data-copiavel data-copy-nome="Classificacao de QI" style="grid-template-columns:${cols};">
            <div class="fl-head" style="grid-template-columns:${cols};">${th}</div>
            ${body}
        </div>`;
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
            return `<div class="fl-row" style="background:${c.bg}; border-bottom:0.5px solid ${c.bd};">
                ${linha.map((v,i)=>cel(v,i)).join('')}</div>`;
        }).join('');
        return `
        <div class="fl-tabela" data-copiavel data-copy-nome="${esc(mont.titulo||'Tabela')}" style="grid-template-columns:${cols};">
            <div class="fl-head" style="grid-template-columns:${cols};">${th}</div>
            ${body}
        </div>`;
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
            </section>`;

        document.querySelectorAll('.fl-tab').forEach(t => t.addEventListener('click', e => {
            document.querySelectorAll('.fl-tab').forEach(x=>x.classList.remove('ativa'));
            e.target.classList.add('ativa');
            const tab = e.target.dataset.tab;
            document.getElementById('fl-sec-prontas').style.display = tab==='prontas'?'':'none';
            document.getElementById('fl-sec-montar').style.display  = tab==='montar'?'':'none';
            if (tab==='montar') reRenderMontador();
        }));

        if (window.CortexCopy?.aplicar) { try { window.CortexCopy.aplicar(); } catch(e){} }
    }
})();

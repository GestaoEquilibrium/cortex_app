// ============================================================================
// CORTEX_APP — Copy to Clipboard (compartilhado entre laudos)
// ============================================================================
// Adiciona um botão 📋 discreto em gráficos, tabelas e cards de cada laudo.
// Ao clicar, copia o elemento em alta resolução (PNG 3x) pro clipboard.
// O usuário cola no Word/Google Docs/Excel com Ctrl+V e a imagem entra nítida.
//
// COMO FUNCIONA:
//   1. Após DOM estar pronto (e um delay pra renders dinâmicos), varre o
//      laudo procurando elementos copiáveis (canvas, tabelas, blocos de
//      visualização)
//   2. Adiciona um botão <button class="cortex-copy-btn">📋</button>
//      posicionado absolutamente no canto superior direito do elemento
//   3. Ao clicar: usa html2canvas (já carregado nos laudos) com scale=3
//      pra gerar PNG em alta resolução, converte pra Blob, e envia pro
//      clipboard via navigator.clipboard.write()
//
// NÃO APARECE NO PDF:
//   O gerarPDF() de cada laudo adiciona body.exportando antes da captura.
//   O CSS (injetado por este script) esconde os botões nesse modo.
//
// REQUISITOS:
//   - html2canvas global (já presente em todos os _resultado.html)
//   - navigator.clipboard.write() (Chrome/Edge/Firefox modernos)
//   - HTTPS ou localhost (ClipboardItem só funciona em contextos seguros)
//
// LIMITAÇÃO CONHECIDA:
//   Safari pode bloquear ClipboardItem. Nesses casos, faz fallback de
//   download da imagem. Toast informa o usuário.
// ============================================================================

(function () {
    'use strict';

    // Aceita configuração via window.CORTEX_COPY_CONFIG (cada laudo pode customizar)
    const CONFIG = Object.assign({
        scale: 3,                              // Alta resolução (3x)
        backgroundColor: '#ffffff',            // Fundo branco fixo (ignora transparência)
        rootSelector: '.laudo, .laudo-body, main', // Onde varrer
        // Padrão de seletores que viram copiáveis.
        // Cobre WAIS, WISC, SRS-2 (já funcionavam) + D3: RAADS-R, BAARS-IV,
        // CAT-Q, ETDAH-AD, EQ-15, e mais alguns por arrasto.
        seletores: [
            // ─── Genéricos (funcionam em qualquer laudo) ───
            'canvas',                              // Todos os Chart.js
            '[class*="-perfil-"]',                 // Perfis de subtestes/escalas
            '[class*="-ic-chart"]',                // Gráficos IC95 (WAIS, WISC)
            '[class*="-tab-"]',                    // Tabelas de resultados/QIs
            '[class*="-matriz"]',                  // Matriz de conversão (WAIS, WISC)
            '[class*="-detalhe-card"]',            // Cards de detalhamento
            '[class*="-ff-"]',                     // Fortes/fracos (grid)
            '[class*="-discrep"]',                 // Discrepâncias
            '[class*="-interp"]',                  // Interpretação clínica
            '[class*="-curva-"]',                  // Curva de aprendizagem (RAVLT) — qualquer instrumento que tenha curva
            '[class*="-grafico-"]',                // Outros wrappers de gráfico
            '.laudo-body > table',                 // Tabelas soltas direto no body

            // ─── D3: containers comuns com prefixo `.laudo-` ───
            '.laudo-cards',                        // Grid de cards (RAADS-R)
            '.laudo-card-total-bloco',             // Card de pontuação total (EQ-15)
            '.laudo-fatores-cards',                // Grid de fatores (EQ-15)
            '.laudo-fator-card',                   // Card individual de fator (EQ-15)
            '.laudo-grafico-fatores',              // Gráfico de fatores (EQ-15)
            '.laudo-detalhes-tabela',              // Tabela "Ver detalhes" (todos D3)
            '.laudo-barra-container',              // Barra de pontuação (RAADS-R, EQ-15)

            // ─── BAARS-IV ───
            '.baars-cards-row',                    // Linha de cards principais
            '.baars-sub-card',                     // Card de subtipo
            '.baars-subtipo-card',                 // Card de subtipo (variante)

            // ─── CAT-Q ───
            '.catq-perfil',                        // Gráfico de perfil
            '.catq-detalhe-card',                  // Card de domínio (já casa com [class*="-detalhe-card"], mas explícito por clareza)

            // ─── ETDAH-AD ───
            '.etdah-fator-card',                   // Card de fator (desatenção/hiperativ)
            '.etdah-grafico-wrap',                 // Wrapper do gráfico

            // ─── QCP-FC, QA 16+, AQ-Adolescente, ASSQ, VINELAND-3-P, SCARED ───
            // (já cobertos por [class*="-tab-"] e [class*="-perfil-"]; as classes
            //  específicas como .qa-grafico-wrap, .aq-grafico-wrap, .assq-grafico-wrap,
            //  .qcpfc-grafico-wrap, .vineland-cca-card, .scared-card-total
            //  são adicionadas abaixo por completude)
            '.qa-grafico-wrap',
            '.qa-sub-card',
            '.aq-grafico-wrap',
            '.aq-sub-card',
            '.assq-grafico-wrap',
            '.assq-sub-card',
            '.qcpfc-grafico-wrap',
            '.qcpfc-escala-card',
            '.vineland-cca-card',
            '.vineland-beh-card',
            '.scared-card-total',
        ].join(', '),
        // Seletores a IGNORAR (mesmo se baterem com os anteriores)
        ignorar: [
            '.cortex-copy-btn',                // O próprio botão
            '.laudo-header',                   // Não copiar header
            '.laudo-rodape',                   // Não copiar rodapé
            '.laudo-identificacao',            // Não copiar dados pessoais
            '[class*="-identif"]',             // idem
            '[class*="-aplicar"]',             // Não copiar form de edição
            '[class*="-form-"]',               // Não copiar form
        ].join(', '),
    }, window.CORTEX_COPY_CONFIG || {});

    // ─── 1. Injeta CSS dos botões + estado de hover ──────────────────────────
    function injetarCSS() {
        if (document.getElementById('cortex-copy-styles')) return;
        const style = document.createElement('style');
        style.id = 'cortex-copy-styles';
        style.textContent = `
            .cortex-copyable {
                position: relative;
            }
            .cortex-copy-btn {
                position: absolute;
                top: 8px;
                right: 8px;
                width: 30px;
                height: 30px;
                background: rgba(255, 255, 255, 0.92);
                border: 1px solid #cbd5e1;
                border-radius: 6px;
                padding: 0;
                font-size: 14px;
                line-height: 1;
                cursor: pointer;
                opacity: 0;
                transition: opacity 0.15s, background 0.15s, border-color 0.15s;
                z-index: 10;
                display: flex;
                align-items: center;
                justify-content: center;
                font-family: inherit;
                color: #475569;
                box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
            }
            .cortex-copyable:hover > .cortex-copy-btn,
            .cortex-copy-btn:focus {
                opacity: 1;
            }
            .cortex-copy-btn:hover {
                background: #fff;
                border-color: #1e40af;
                color: #1e40af;
            }
            .cortex-copy-btn:active {
                transform: scale(0.95);
            }
            .cortex-copy-btn.copiando {
                opacity: 1 !important;
                pointer-events: none;
                background: #f1f5f9;
            }
            .cortex-copy-btn.copiado {
                opacity: 1 !important;
                background: #dcfce7;
                border-color: #16a34a;
                color: #16a34a;
            }

            /* Esconder durante geração de PDF */
            body.exportando .cortex-copy-btn,
            body.gerando-pdf .cortex-copy-btn {
                display: none !important;
            }

            /* Esconder durante a própria captura html2canvas (auto-aplicado) */
            body.cortex-copiando .cortex-copy-btn {
                display: none !important;
            }
        `;
        document.head.appendChild(style);
    }

    // ─── 2. Detecta elementos copiáveis ──────────────────────────────────────
    function encontrarCopiaveis() {
        const roots = document.querySelectorAll(CONFIG.rootSelector);
        if (!roots.length) return [];
        const ignoreSet = new Set();
        for (const root of roots) {
            root.querySelectorAll(CONFIG.ignorar).forEach(el => ignoreSet.add(el));
        }
        const matches = [];
        const seen = new WeakSet();
        for (const root of roots) {
            root.querySelectorAll(CONFIG.seletores).forEach(el => {
                if (seen.has(el)) return;
                if (ignoreSet.has(el)) return;
                // Ignora se ESTIVER DENTRO de um elemento ignorado
                let parent = el.parentElement;
                let dentroIgnorado = false;
                while (parent) {
                    if (ignoreSet.has(parent)) { dentroIgnorado = true; break; }
                    parent = parent.parentElement;
                }
                if (dentroIgnorado) return;
                // Ignora se ESTIVER DENTRO de outro copiável já marcado
                // (canvas dentro de wrapper, por exemplo — copia o wrapper, não os 2)
                let p = el.parentElement;
                while (p) {
                    if (matches.includes(p)) return;
                    p = p.parentElement;
                }
                matches.push(el);
                seen.add(el);
            });
        }
        return matches;
    }

    // ─── 3. Injeta botão em cada elemento ────────────────────────────────────
    function adicionarBotao(el) {
        if (el.querySelector(':scope > .cortex-copy-btn')) return; // já tem
        // Garante position relative
        const cs = window.getComputedStyle(el);
        if (cs.position === 'static') {
            el.style.position = 'relative';
        }
        el.classList.add('cortex-copyable');
        const btn = document.createElement('button');
        btn.className = 'cortex-copy-btn';
        btn.type = 'button';
        btn.setAttribute('aria-label', 'Copiar imagem em alta resolução');
        btn.title = 'Copiar imagem em alta resolução';
        btn.textContent = '📋';
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            copiarElemento(el, btn);
        });
        el.appendChild(btn);
    }

    // ─── 4. Captura + envia pro clipboard ────────────────────────────────────
    async function copiarElemento(el, btn) {
        if (typeof html2canvas === 'undefined') {
            toast('html2canvas não carregado nesta página', 'danger');
            return;
        }
        const labelOrig = btn.textContent;
        btn.classList.add('copiando');
        btn.textContent = '⏳';

        try {
            // Marca body pra esconder TODOS os botões durante a captura
            document.body.classList.add('cortex-copiando');

            const canvas = await html2canvas(el, {
                scale: CONFIG.scale,
                backgroundColor: CONFIG.backgroundColor,
                useCORS: true,
                logging: false,
                // Ignora o próprio botão dentro do elemento
                ignoreElements: (node) => node.classList && node.classList.contains('cortex-copy-btn'),
            });

            // Canvas → Blob PNG
            const blob = await new Promise((resolve, reject) => {
                canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob falhou')), 'image/png');
            });

            // Tenta clipboard moderno
            if (navigator.clipboard && window.ClipboardItem) {
                try {
                    await navigator.clipboard.write([
                        new ClipboardItem({ 'image/png': blob })
                    ]);
                    sucesso(btn, labelOrig);
                    toast('✓ Copiado em alta resolução. Cole com Ctrl+V', 'success');
                    return;
                } catch (clipErr) {
                    console.warn('[copy] clipboard.write falhou, baixando como fallback:', clipErr);
                }
            }

            // Fallback: download do PNG
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `cortex-copia-${Date.now()}.png`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            sucesso(btn, labelOrig);
            toast('Imagem baixada (clipboard não suportado neste navegador)', 'info');

        } catch (err) {
            console.error('[copy] erro:', err);
            btn.classList.remove('copiando');
            btn.textContent = labelOrig;
            toast('Erro ao copiar: ' + (err.message || 'desconhecido'), 'danger');
        } finally {
            document.body.classList.remove('cortex-copiando');
        }
    }

    function sucesso(btn, labelOrig) {
        btn.classList.remove('copiando');
        btn.classList.add('copiado');
        btn.textContent = '✓';
        setTimeout(() => {
            btn.classList.remove('copiado');
            btn.textContent = labelOrig;
        }, 1800);
    }

    function toast(msg, tipo) {
        if (window.CortexUI && typeof window.CortexUI.toast === 'function') {
            window.CortexUI.toast(msg, tipo);
        } else {
            console.log(`[copy ${tipo}] ${msg}`);
        }
    }

    // ─── 5. Aplica em tudo + observa mudanças (laudo renderiza após fetch) ───
    let aplicado = false;
    function aplicar() {
        if (!document.querySelector(CONFIG.rootSelector)) return false;
        const elementos = encontrarCopiaveis();
        if (elementos.length === 0) return false;
        injetarCSS();
        elementos.forEach(adicionarBotao);
        aplicado = true;
        return true;
    }

    function init() {
        // Tenta imediatamente
        aplicar();

        // Polling rápido nos primeiros 5s — laudo renderiza após fetch (1-3s)
        // Faz reaplicar a cada 300ms; quando achar elementos, marca aplicado=true
        // e o intervalo continua só pra capturar elementos novos (idempotente).
        const pollInt = setInterval(() => aplicar(), 300);
        setTimeout(() => clearInterval(pollInt), 5000);

        // E observa mudanças no DOM por 30s (caso laudo demore além de 5s, ou
        // o usuário troque modo edição ↔ laudo dinamicamente)
        const observer = new MutationObserver(() => {
            aplicar();
        });
        observer.observe(document.body, { childList: true, subtree: true });
        // Para de observar depois de 30s pra não consumir CPU à toa
        setTimeout(() => observer.disconnect(), 30000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Expor API pública pra debug
    window.CortexCopy = {
        aplicar,
        encontrarCopiaveis,
        config: CONFIG,
    };
})();

// ============================================================================
// CORTEX_APP — Sprint 64 — graficos.js
// Gerador avulso de gráficos de instrumentos (sem precisar responder o teste).
// Por enquanto: categoria SRS-2. Estrutura preparada pra novas categorias.
// ============================================================================

(function() {
    'use strict';

    // ─── Catálogo de geradores (adicionar novas categorias aqui) ──────────────
    const SRS2 = {
        id: 'srs2',
        nome: 'SRS-2',
        descricao: 'Escala de Responsividade Social, 2ª edição — perfil de escores T',
        // 7 escalas na ordem oficial do gráfico
        escalas: [
            { slug: 'PS',  label: 'Percepção Social' },
            { slug: 'CGS', label: 'Cognição Social' },
            { slug: 'CMS', label: 'Comunicação Social' },
            { slug: 'MS',  label: 'Motivação Social' },
            { slug: 'RR',  label: 'Padrões Restritivos e Repetitivos' },
            { slug: 'CI',  label: 'Comunicação e Interação Social' },
            { slug: 'TOT', label: 'Total' }
        ]
    };

    const CATEGORIAS = [SRS2];

    const state = {
        categoria: null,
        valores: {},          // { slug: tScore }
        chartInstance: null
    };

    window.addEventListener('cortex:auth-ready', init);

    async function init() {
        await CortexSidebar.render('graficos');
        renderSelecaoCategoria();
    }

    // ─── Tela 1: seleção de categoria ─────────────────────────────────────────
    function renderSelecaoCategoria() {
        const cards = CATEGORIAS.map(cat => `
            <button class="grafico-cat-card" onclick="window.CortexGraficos.abrirCategoria('${cat.id}')">
                <div class="grafico-cat-icone">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
                    </svg>
                </div>
                <div class="grafico-cat-info">
                    <div class="grafico-cat-nome">${escapeHtml(cat.nome)}</div>
                    <div class="grafico-cat-desc">${escapeHtml(cat.descricao)}</div>
                </div>
                <svg class="grafico-cat-seta" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
        `).join('');

        document.getElementById('graficos-conteudo').innerHTML = `
            <div class="grafico-cat-grid">${cards}</div>
        `;
    }

    // ─── Tela 2: formulário + gráfico ─────────────────────────────────────────
    function abrirCategoria(id) {
        const cat = CATEGORIAS.find(c => c.id === id);
        if (!cat) return;
        state.categoria = cat;
        state.valores = {};
        if (state.chartInstance) { state.chartInstance.destroy(); state.chartInstance = null; }

        if (cat.id === 'srs2') renderFormSRS2();
    }

    function renderFormSRS2() {
        const cat = state.categoria;
        const inputs = cat.escalas.map(e => `
            <div class="grafico-form-linha">
                <label class="grafico-form-label" for="t-${e.slug}">
                    <span class="grafico-form-slug">${e.slug}</span>
                    <span class="grafico-form-nome">${escapeHtml(e.label)}</span>
                </label>
                <input type="number" id="t-${e.slug}" class="grafico-form-input"
                       min="20" max="120" step="1" inputmode="numeric"
                       placeholder="T" data-slug="${e.slug}">
            </div>
        `).join('');

        document.getElementById('graficos-conteudo').innerHTML = `
            <a href="#" class="page-back" id="grafico-voltar">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
                Voltar às categorias
            </a>

            <div class="grafico-layout">
                <div class="grafico-form-card">
                    <h2 class="grafico-form-titulo">SRS-2 — Escores T</h2>
                    <p class="grafico-form-ajuda">Digite o T-score de cada escala (geralmente entre 30 e 90).</p>
                    ${inputs}
                    <div class="grafico-form-acoes">
                        <button class="btn btn-secondary btn-sm" id="grafico-limpar">Limpar</button>
                        <button class="btn btn-primary" id="grafico-gerar">Gerar gráfico</button>
                    </div>
                </div>

                <div class="grafico-resultado-card" id="grafico-resultado" style="display:none;">
                    <div class="grafico-perfil-wrap">
                        <div class="grafico-perfil-canvas-container">
                            <canvas id="grafico-perfil-chart"></canvas>
                        </div>
                    </div>
                    <p class="grafico-dica-print">💡 Para usar no laudo: dê print ou use uma ferramenta de captura na área do gráfico.</p>
                </div>
            </div>
        `;

        document.getElementById('grafico-voltar').addEventListener('click', (e) => {
            e.preventDefault();
            renderSelecaoCategoria();
        });
        document.getElementById('grafico-gerar').addEventListener('click', gerarGraficoSRS2);
        document.getElementById('grafico-limpar').addEventListener('click', () => {
            cat.escalas.forEach(e => { const el = document.getElementById('t-' + e.slug); if (el) el.value = ''; });
            document.getElementById('grafico-resultado').style.display = 'none';
            if (state.chartInstance) { state.chartInstance.destroy(); state.chartInstance = null; }
        });

        // Enter no último campo gera
        const ultimo = document.getElementById('t-' + cat.escalas[cat.escalas.length - 1].slug);
        if (ultimo) ultimo.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') gerarGraficoSRS2(); });
    }

    function gerarGraficoSRS2() {
        const cat = state.categoria;
        const valores = {};
        const faltando = [];

        cat.escalas.forEach(e => {
            const el = document.getElementById('t-' + e.slug);
            const v = el ? parseInt(el.value, 10) : NaN;
            if (isNaN(v)) { faltando.push(e.slug); }
            else valores[e.slug] = v;
        });

        if (faltando.length > 0) {
            window.CortexUI.toast('Preencha o T de: ' + faltando.join(', '), 'danger');
            return;
        }

        state.valores = valores;
        document.getElementById('grafico-resultado').style.display = 'block';
        setTimeout(renderPerfilGrafico, 50);
    }

    // ─── Gráfico (porta fiel do laudo SRS-2, só com a coluna T) ───────────────
    function corPorT(t) {
        if (t >= 76) return '#9c0006';
        if (t >= 66) return '#ff9900';
        if (t >= 60) return '#bf8f00';
        return '#10b981';
    }

    function renderPerfilGrafico() {
        const canvas = document.getElementById('grafico-perfil-chart');
        if (!canvas || typeof Chart === 'undefined') return;
        if (state.chartInstance) state.chartInstance.destroy();

        const cat = state.categoria;
        const labels = cat.escalas.map(e => e.label.toUpperCase());
        const data = cat.escalas.map(e => state.valores[e.slug]);
        const coresBolinhas = data.map(corPorT);

        const cutoffsPlugin = {
            id: 'cutoffsCinza',
            beforeDatasetsDraw: (chart) => {
                const { ctx, chartArea, scales } = chart;
                if (!chartArea || !scales.x) return;
                const xs = scales.x;
                const yTopArea = chartArea.top;
                const yBotArea = chartArea.bottom;

                // Faixa azul-clara na zona TÍPICO (T 40–60)
                ctx.save();
                ctx.fillStyle = 'rgba(59, 130, 246, 0.08)';
                const xTipIni = xs.getPixelForValue(40);
                const xTipFim = xs.getPixelForValue(60);
                ctx.fillRect(xTipIni, yTopArea, xTipFim - xTipIni, yBotArea - yTopArea);
                ctx.restore();

                // Linhas verticais cinza tracejadas nos cutoffs
                ctx.save();
                ctx.strokeStyle = '#cbd5e1';
                ctx.lineWidth = 1;
                ctx.setLineDash([3, 3]);
                for (const cutoff of [50, 60, 66, 76]) {
                    const x = xs.getPixelForValue(cutoff);
                    ctx.beginPath();
                    ctx.moveTo(x, yTopArea);
                    ctx.lineTo(x, yBotArea);
                    ctx.stroke();
                }
                ctx.restore();
            },
            afterDraw: (chart) => {
                const { ctx, chartArea, scales } = chart;
                if (!chartArea || !scales.x || !scales.y) return;
                const xs = scales.x;
                const ys = scales.y;

                const yLinha1 = xs.top - 28;
                const yLinha2 = xs.top - 12;

                // Linha 1: TÍPICO (azul) e N1/N2/N3 (cinza-escuro)
                ctx.save();
                ctx.font = '700 12px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'alphabetic';
                ctx.fillStyle = '#3b82f6';
                ctx.fillText('TÍPICO', xs.getPixelForValue(50), yLinha1);
                ctx.fillStyle = '#475569';
                ctx.fillText('N1', xs.getPixelForValue(63), yLinha1);
                ctx.fillText('N2', xs.getPixelForValue(71), yLinha1);
                ctx.fillText('N3', xs.getPixelForValue(78), yLinha1);
                ctx.restore();

                // Linha 2: "50 (M)" embaixo de TÍPICO
                ctx.save();
                ctx.font = '700 11px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'alphabetic';
                ctx.fillStyle = '#1e40af';
                ctx.fillText('50 (M)', xs.getPixelForValue(50), yLinha2);
                ctx.restore();

                // À ESQUERDA: cabeçalho "T" + valores por escala
                ctx.save();
                ctx.textAlign = 'center';
                ctx.textBaseline = 'alphabetic';
                ctx.font = '700 11px sans-serif';
                ctx.fillStyle = '#94a3b8';
                const xColT = chartArea.left - 32;
                ctx.fillText('T', xColT, yLinha1);

                ctx.font = '600 12px sans-serif';
                ctx.fillStyle = '#334155';
                for (let i = 0; i < labels.length; i++) {
                    const y = ys.getPixelForValue(i);
                    ctx.fillText(String(data[i]), xColT, y + 4);
                }
                ctx.restore();
            }
        };

        state.chartInstance = new Chart(canvas, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    pointBackgroundColor: '#fff',
                    pointBorderColor: coresBolinhas,
                    pointBorderWidth: 2.5,
                    pointRadius: 7,
                    pointHoverRadius: 9,
                    borderWidth: 2.5,
                    tension: 0
                }]
            },
            options: {
                devicePixelRatio: Math.max(window.devicePixelRatio || 1, 3),
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                layout: { padding: { top: 64, right: 24, bottom: 12, left: 64 } },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => {
                                const i = ctx.dataIndex;
                                return ` T: ${data[i]}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        position: 'top',
                        min: 20, max: 80,
                        ticks: { stepSize: 5, font: { size: 10 }, color: '#94a3b8' },
                        grid: { color: '#f1f5f9' }
                    },
                    y: {
                        position: 'right',
                        ticks: { font: { size: 11, weight: '600' }, color: '#1e293b' },
                        grid: { display: false }
                    }
                }
            },
            plugins: [cutoffsPlugin]
        });
    }

    // ─── util ──────────────────────────────────────────────────────────────────
    function escapeHtml(t) {
        if (t == null) return '';
        const div = document.createElement('div');
        div.textContent = String(t);
        return div.innerHTML;
    }

    // API pública (onclick dos cards)
    window.CortexGraficos = {
        abrirCategoria
    };
})();

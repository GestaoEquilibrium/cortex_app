// ============================================================================
// CORTEX_APP — Resultado SRBCSS (Altas Habilidades/Superdotação — laudo)
// ============================================================================
// URL: ?aplicacao_id=<uuid>
//
// Renzulli, Smith, White, Callahan, Hartman, Westberg et al. | Adapt. Equilibrium
// 126 itens · escala 1-6 · 14 subescalas INDEPENDENTES · heteroaplicação
//
// Pontuação (decisão B — JS recalcula do zero a partir de escores_brutos):
//   - SOMA por subescala (sem média, sem escore total, sem classificação).
//   - Não há normas/pontos de corte publicados na adaptação.
//   - Barra = % do MÁXIMO de cada subescala (transformação aritmética simples,
//     só para tornar subescalas de tamanhos diferentes comparáveis). NÃO é
//     percentil normativo. Serve para apontar as áreas mais expressivas.
// ============================================================================

(function() {
    'use strict';

    const SIGLA_ESPERADA = 'SRBCSS';
    const TOTAL_ITENS = 126;
    const COR_BARRA = '#2e74b5';
    const COR_DESTAQUE = '#7c3aed';

    const state = {
        aplicacaoId: null,
        aplicacao: null,
        paciente: null,
        norma: null,
        itens: [],     // [{numero, texto, fator_codigo}]
        fatores: [],   // [{id, fator_codigo, fator_label, ordem, min_score, max_score, eh_total}]
        correcao: null,
        scores: null,
        chartPerfil: null
    };

    // ============================================================================
    // BOOT
    // ============================================================================
    window.addEventListener('cortex:auth-ready', async () => {
        await CortexSidebar.render('pacientes');

        const params = new URLSearchParams(window.location.search);
        state.aplicacaoId = params.get('aplicacao_id');

        if (!state.aplicacaoId) {
            mostrarErro('aplicacao_id não fornecido na URL');
            return;
        }

        try {
            await carregarTudo();
            renderizar();
        } catch (err) {
            console.error('Erro ao carregar:', err);
            mostrarErro('Erro: ' + (err.message || 'desconhecido'));
        }
    });

    async function carregarTudo() {
        const { data: aplicacao, error: errA } = await window.cortexClient
            .from('aplicacoes_instrumento').select('*').eq('id', state.aplicacaoId).single();
        if (errA) throw new Error('Aplicação: ' + errA.message);
        state.aplicacao = aplicacao;

        const { data: paciente, error: errP } = await window.cortexClient
            .from('pacientes')
            .select('id, nome_completo, sexo, data_nascimento, cpf, escolaridade, escolaridade_serie, mae_nome, pai_nome, responsavel_nome')
            .eq('id', aplicacao.paciente_id).single();
        if (errP) throw new Error('Paciente: ' + errP.message);
        state.paciente = paciente;

        const { data: instrumento, error: errI } = await window.cortexClient
            .from('instrumentos_catalogo').select('id, sigla').eq('id', aplicacao.instrumento_id).single();
        if (errI) throw new Error('Instrumento: ' + errI.message);
        if (instrumento.sigla !== SIGLA_ESPERADA) {
            throw new Error(`Esperado ${SIGLA_ESPERADA}, encontrado ${instrumento.sigla}`);
        }

        const { data: norma } = await window.cortexClient
            .from('instrumentos_normas').select('*').eq('instrumento_id', instrumento.id)
            .eq('ativa', true).maybeSingle();
        if (!norma) throw new Error('Norma SRBCSS não cadastrada');
        state.norma = norma;

        const { data: fatores } = await window.cortexClient
            .from('instrumentos_fatores')
            .select('id, fator_codigo, fator_label, ordem, min_score, max_score, eh_total')
            .eq('norma_id', norma.id)
            .order('ordem');
        state.fatores = fatores || [];

        const { data: itensRaw } = await window.cortexClient
            .from('instrumentos_itens').select('numero, texto, fator_id')
            .eq('norma_id', norma.id).order('numero');

        const mapFator = {};
        for (const f of state.fatores) mapFator[f.id] = f.fator_codigo;
        state.itens = (itensRaw || []).map(i => ({
            numero: i.numero,
            texto: i.texto,
            fator_codigo: mapFator[i.fator_id] || 'desconhecido'
        }));

        const { data: correcao, error: errC } = await window.cortexClient
            .from('correcoes').select('*').eq('aplicacao_id', state.aplicacaoId)
            .order('created_at', { ascending: false }).limit(1).maybeSingle();
        if (errC) throw new Error('Correção: ' + errC.message);
        if (!correcao) throw new Error('Nenhuma correção encontrada');
        state.correcao = correcao;

        state.scores = calcularResultados(correcao);

        await CortexAudit.log('leitura', 'correcoes', correcao.id, {
            detalhes: { aplicacaoId: state.aplicacaoId, sigla: SIGLA_ESPERADA }
        });
    }

    // ============================================================================
    // CÁLCULO — soma por subescala, % do máximo. Sem média/corte/total.
    // ============================================================================
    function calcularResultados(correcao) {
        const respostas = (correcao?.escores_brutos || {}).respostas || {};
        const respPorNum = {};
        for (const [k, v] of Object.entries(respostas)) respPorNum[parseInt(k)] = parseInt(v) || 0;

        const porFator = {};
        for (const f of state.fatores) {
            if (f.eh_total) continue;
            porFator[f.fator_codigo] = {
                codigo: f.fator_codigo,
                nome: f.fator_label,
                ordem: f.ordem,
                minScore: f.min_score || 0,
                maxScore: f.max_score || 0,
                itens: [],
                soma: 0,
                n: 0,
                pct: 0
            };
        }

        for (const item of state.itens) {
            const valor = respPorNum[item.numero] ?? 0;
            const fc = item.fator_codigo;
            if (porFator[fc]) {
                porFator[fc].itens.push({ numero: item.numero, valor, texto: item.texto });
                porFator[fc].soma += valor;
                porFator[fc].n += 1;
            }
        }

        const subescalas = Object.values(porFator).sort((a, b) => a.ordem - b.ordem);
        for (const s of subescalas) {
            s.pct = s.maxScore > 0 ? Math.round((s.soma / s.maxScore) * 100) : 0;
        }

        const respondidos = Object.keys(respostas).length;
        const destaques = [...subescalas].sort((a, b) => b.pct - a.pct).slice(0, 5);

        return {
            subescalas,
            destaques,
            respondidos,
            faltam: TOTAL_ITENS - respondidos
        };
    }

    function labelResposta(valor) {
        const labels = state.norma.answer_labels || [];
        const idx = valor - (state.norma.escala_min || 1);
        return labels[idx] !== undefined ? labels[idx] : String(valor);
    }

    // ============================================================================
    // RENDERIZAÇÃO
    // ============================================================================
    function renderizar() {
        const cont = document.getElementById('laudo-conteudo');
        cont.innerHTML = renderLaudo();

        document.getElementById('acoes-topo').style.display = 'flex';
        document.getElementById('back-link').href =
            `../../bateria/bateria.html?paciente=${state.paciente.id}`;
        document.getElementById('btn-gerar-pdf').addEventListener('click', gerarPDF);

        setTimeout(() => { renderGraficoPerfil(); }, 50);
    }

    function renderLaudo() {
        const s = state.scores;
        const p = state.paciente;
        const idade = calcularIdadeAnos(p.data_nascimento, state.aplicacao.created_at);
        const dataAplic = formatarDataBR(state.aplicacao.created_at);
        const nascStr = formatarDataBR(p.data_nascimento);
        const escolaridade = [p.escolaridade, p.escolaridade_serie].filter(Boolean).join(' — ') || '—';

        return `
        <div class="laudo">
            <div class="laudo-header">
                <div class="laudo-header-esq">
                    <div class="laudo-header-logo">E</div>
                    <div class="laudo-header-textos">
                        <div class="laudo-header-supratitulo">Relatório de Avaliação Neuropsicológica</div>
                        <h1 class="laudo-header-titulo">SRBCSS</h1>
                        <div class="laudo-header-subtitulo">Escala de Características de Altas Habilidades/Superdotação (Renzulli)<br>Adapt. Grupo Equilibrium · 126 itens · escala 1-6 · heteroaplicação · 14 subescalas independentes</div>
                    </div>
                </div>
                <div class="laudo-header-pontuacao">
                    <div class="laudo-header-pontuacao-label">Subescalas</div>
                    <div class="laudo-header-pontuacao-valor">${s.subescalas.length}</div>
                    <div class="laudo-header-pontuacao-max">itens 1–6</div>
                </div>
            </div>

            <div class="laudo-body">

                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">1</span>
                    Identificação
                </div>
                <div class="laudo-identificacao">
                    <div class="laudo-identif-item">
                        <span class="laudo-identif-label">Nome:</span>
                        <span class="laudo-identif-valor">${escapeHtml(p.nome_completo)}</span>
                    </div>
                    <div class="laudo-identif-item">
                        <span class="laudo-identif-label">Idade:</span>
                        <span class="laudo-identif-valor">${idade !== null ? idade + ' anos' : '—'}</span>
                    </div>
                    <div class="laudo-identif-item">
                        <span class="laudo-identif-label">Sexo:</span>
                        <span class="laudo-identif-valor">${escapeHtml(p.sexo || '—')}</span>
                    </div>
                    <div class="laudo-identif-item">
                        <span class="laudo-identif-label">Nascimento:</span>
                        <span class="laudo-identif-valor">${nascStr}</span>
                    </div>
                    <div class="laudo-identif-item">
                        <span class="laudo-identif-label">Escolaridade:</span>
                        <span class="laudo-identif-valor">${escapeHtml(escolaridade)}</span>
                    </div>
                    <div class="laudo-identif-item">
                        <span class="laudo-identif-label">Aplicação:</span>
                        <span class="laudo-identif-valor">${dataAplic}</span>
                    </div>
                </div>

                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">2</span>
                    Como interpretar
                </div>
                <div class="laudo-caixa-descricao">
                    <p>A SRBCSS é uma escala de <strong>observação comportamental</strong> respondida por um informante (professor[a] ou responsável). As <strong>14 subescalas são independentes</strong> e <strong>não são somadas em um escore total</strong>. Não há normas/pontos de corte publicados na adaptação — portanto <strong>não há classificação normativa</strong>.</p>
                    <p>O gráfico mostra a pontuação de cada subescala como <strong>percentual do seu próprio máximo</strong> (apenas para comparar subescalas de tamanhos diferentes). Use-o para identificar as <strong>áreas mais expressivas</strong>. O resultado isolado não estabelece diagnóstico e deve compor uma avaliação multiprofissional.</p>
                </div>

                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">3</span>
                    Perfil das 14 Subescalas
                </div>
                <div class="srbcss-grafico-wrap" style="height:460px;">
                    <canvas id="srbcss-chart-perfil"></canvas>
                </div>
                <p class="srbcss-grafico-legenda">
                    <span class="srbcss-leg-item"><span class="srbcss-leg-bola" style="background:${COR_BARRA}"></span> Pontuação da subescala (% do máximo)</span>
                </p>

                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">4</span>
                    Pontuação por Subescala
                </div>
                ${renderTabelaSubescalas()}

                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">5</span>
                    Áreas de maior destaque
                </div>
                <ul class="srbcss-itens-criticos" style="border-left-color:${COR_DESTAQUE};background:#f5f3ff;">
                    ${s.destaques.map(d => `
                        <li>
                            <strong style="color:${COR_DESTAQUE};">${escapeHtml(d.nome)}</strong>
                            — ${d.soma} de ${d.maxScore} pontos (${d.pct}% do máximo)
                        </li>
                    `).join('')}
                </ul>
                <p style="font-size:12px;color:#64748b;margin:-12px 0 24px;">Lista descritiva das subescalas com maior pontuação relativa. Não representa classificação diagnóstica.</p>

                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">6</span>
                    Respostas por item
                </div>
                ${renderTabelaItens()}

            </div>

            <div class="laudo-rodape">
                <div class="laudo-rodape-esq">
                    <div class="laudo-rodape-org">Equilibrium Neuropsicologia</div>
                    <div class="laudo-rodape-tipo">Correção automatizada — SRBCSS</div>
                </div>
                <div class="laudo-rodape-dir">
                    <div class="laudo-rodape-data">Documento gerado em ${formatarDataBR(new Date().toISOString())}</div>
                    <div class="laudo-rodape-confidencial">Instrumento de observação. O resultado isolado não estabelece diagnóstico.</div>
                </div>
            </div>
        </div>
        `;
    }

    function renderTabelaSubescalas() {
        const linhas = state.scores.subescalas.map(sub => `
            <tr>
                <td class="td-num">${escapeHtml(romano(sub.ordem))}</td>
                <td>${escapeHtml(sub.nome.replace(/^[IVX]+\.\s*/, ''))}</td>
                <td class="td-resposta">${sub.n}</td>
                <td class="td-resposta" style="font-weight:700;color:${COR_BARRA};">${sub.soma}</td>
                <td class="td-resposta">${sub.maxScore}</td>
                <td class="td-resposta" style="font-weight:700;">${sub.pct}%</td>
            </tr>
        `).join('');

        return `
            <table class="srbcss-tabela-itens">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Subescala</th>
                        <th>Itens</th>
                        <th>Soma</th>
                        <th>Máx.</th>
                        <th>% do máx.</th>
                    </tr>
                </thead>
                <tbody>${linhas}</tbody>
            </table>
        `;
    }

    function renderTabelaItens() {
        let linhas = '';
        for (const sub of state.scores.subescalas) {
            linhas += `
                <tr style="background:#eef4fb;">
                    <td class="td-num" style="font-weight:700;color:${COR_BARRA};">${escapeHtml(romano(sub.ordem))}</td>
                    <td colspan="2" style="font-weight:700;color:${COR_BARRA};">${escapeHtml(sub.nome)}</td>
                    <td class="td-resposta" style="font-weight:700;">${sub.soma}/${sub.maxScore}</td>
                </tr>
            `;
            for (const it of sub.itens) {
                linhas += `
                    <tr>
                        <td class="td-num">${it.numero}</td>
                        <td>${escapeHtml(it.texto)}</td>
                        <td class="td-resposta" style="font-weight:700;">${it.valor || '—'}</td>
                        <td class="td-label">${escapeHtml(it.valor ? labelResposta(it.valor) : '—')}</td>
                    </tr>
                `;
            }
        }

        return `
            <table class="srbcss-tabela-itens">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Item (O[a] aluno[a] demonstra…)</th>
                        <th>Resp.</th>
                        <th>Frequência</th>
                    </tr>
                </thead>
                <tbody>${linhas}</tbody>
            </table>
        `;
    }

    // ============================================================================
    // GRÁFICO PERFIL HORIZONTAL (14 subescalas, % do máximo)
    // ============================================================================
    function renderGraficoPerfil() {
        const canvas = document.getElementById('srbcss-chart-perfil');
        if (!canvas) return;
        if (state.chartPerfil) state.chartPerfil.destroy();

        const subs = state.scores.subescalas;
        const labels = subs.map(s => s.nome.replace(/^[IVX]+\.\s*/, ''));
        const dados = subs.map(s => s.pct);
        // destaca visualmente o(s) mais expressivo(s)
        const maxPct = Math.max(...dados, 0);
        const cores = subs.map(s => (s.pct === maxPct && maxPct > 0) ? COR_DESTAQUE : COR_BARRA);

        state.chartPerfil = new Chart(canvas, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: '% do máximo',
                    data: dados,
                    backgroundColor: cores,
                    borderColor: cores,
                    borderWidth: 1,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'y',
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            title: (ctx) => ctx[0].label,
                            label: (ctx) => {
                                const sub = state.scores.subescalas[ctx.dataIndex];
                                return `${sub.soma} de ${sub.maxScore} pontos (${sub.pct}% do máximo)`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        beginAtZero: true,
                        max: 100,
                        ticks: { stepSize: 20, callback: (v) => v + '%' },
                        grid: { color: '#e2e8f0' },
                        title: { display: true, text: '% do máximo da subescala', color: '#64748b' }
                    },
                    y: {
                        grid: { display: false },
                        ticks: { font: { size: 11 } }
                    }
                }
            }
        });
    }

    // ============================================================================
    // PDF
    // ============================================================================
    async function gerarPDF() {
        const btn = document.getElementById('btn-gerar-pdf');
        const orig = btn.textContent;
        btn.disabled = true;
        btn.textContent = '⏳ Gerando PDF...';

        try {
            document.body.classList.add('exportando');
            await new Promise(r => setTimeout(r, 100));
            const laudo = document.querySelector('.laudo');
            if (!laudo) throw new Error('Laudo não encontrado');

            const canvas = await html2canvas(laudo, {
                scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false
            });

            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            const pdfWidth = 210, pdfHeight = 297;
            const imgWidth = pdfWidth;
            const imgHeight = (canvas.height * pdfWidth) / canvas.width;

            if (imgHeight <= pdfHeight) {
                pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, imgWidth, imgHeight);
            } else {
                let posY = 0, restante = imgHeight;
                while (restante > 0) {
                    pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, -posY, imgWidth, imgHeight);
                    restante -= pdfHeight;
                    posY += pdfHeight;
                    if (restante > 0) pdf.addPage();
                }
            }

            const nomeAbreviado = state.paciente.nome_completo.toUpperCase()
                .replace(/[^A-Z\s]/g, '').trim().substring(0, 50);
            const dataStr = formatarDataArquivo(new Date());
            pdf.save(`SRBCSS - ${nomeAbreviado}_${dataStr}.pdf`);

            window.CortexUI.toast('PDF gerado com sucesso', 'success');
        } catch (err) {
            console.error('Erro ao gerar PDF:', err);
            window.CortexUI.toast('Erro ao gerar PDF: ' + err.message, 'danger');
        } finally {
            document.body.classList.remove('exportando');
            btn.disabled = false;
            btn.textContent = orig;
        }
    }

    // ============================================================================
    // UTILS
    // ============================================================================
    function romano(n) {
        const r = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X',
                   'XI', 'XII', 'XIII', 'XIV'];
        return r[n] || String(n);
    }

    function calcularIdadeAnos(nascISO, aplISO) {
        if (!nascISO) return null;
        const ref = aplISO ? new Date(aplISO) : new Date();
        const n = new Date(nascISO);
        if (isNaN(n) || isNaN(ref) || ref < n) return null;
        let anos = ref.getFullYear() - n.getFullYear();
        if (ref.getMonth() < n.getMonth() ||
            (ref.getMonth() === n.getMonth() && ref.getDate() < n.getDate())) {
            anos--;
        }
        return anos;
    }

    function formatarDataBR(iso) {
        if (!iso) return '—';
        const s = String(iso).slice(0, 10);
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
        if (m) return `${m[3]}/${m[2]}/${m[1]}`;
        return new Date(iso).toLocaleDateString('pt-BR');
    }

    function formatarDataArquivo(d) {
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    }

    function escapeHtml(text) {
        if (text === null || text === undefined) return '';
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }

    function mostrarErro(msg) {
        document.getElementById('laudo-conteudo').innerHTML = `
            <div class="erro-state">
                <h2>⚠️ Não foi possível carregar o laudo</h2>
                <p>${escapeHtml(msg)}</p>
                <button class="btn btn-primary" onclick="history.back()">Voltar</button>
            </div>
        `;
    }

})();

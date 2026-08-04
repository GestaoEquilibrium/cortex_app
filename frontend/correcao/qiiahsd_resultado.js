// ============================================================================
// CORTEX_APP — QIIAHSD-Adulto · Folha de resultado (perfil por área)
// ----------------------------------------------------------------------------
// URL: ?aplicacao_id=<uuid>
// Serve às DUAS versões (autorrelato QIIAHSD-AD e 2ª fonte QIIAHSD-AD-2F):
// detecta a versão pelo instrumento carregado e busca a versão-irmã do mesmo
// paciente para o comparativo lado a lado.
//
// Instrumento QUALITATIVO: NÃO há ponto de corte nem classificação. A folha
// mostra o PERFIL por área (média das respostas 1–5) e o cruzamento das duas
// fontes — a interpretação é clínica, feita pelo profissional.
// Os enunciados vêm do banco; nada de conteúdo do instrumento é embutido aqui.
// ============================================================================

(function () {
    'use strict';

    const NIVEL_LABELS = ['Nunca', 'Raramente', 'Às vezes', 'Frequentemente', 'Sempre'];

    const state = {
        aplicacaoId: null,
        aplicacao: null,
        paciente: null,
        instrumento: null,
        norma: null,
        fatores: [],
        itens: [],
        respostas: {},           // { numero: valor(1..5) }
        irma: null,              // { sigla, respostas, itensPorFator } da versão-irmã (se houver)
        chart: null,
        chartDist: null,
        aplicadorNome: null,
    };

    function fmtData(iso) {
        if (!iso) return '—';
        try { const d = new Date(iso); return d.toLocaleDateString('pt-BR'); } catch { return '—'; }
    }

    const c = () => window.cortexClient;
    const esc = (t) => { const d = document.createElement('div'); d.textContent = t == null ? '' : String(t); return d.innerHTML; };
    const fmt = (n) => (n == null || isNaN(n)) ? '—' : (Math.round(n * 100) / 100).toString().replace('.', ',');

    function calcularIdade(nascISO) {
        if (!nascISO) return null;
        const n = new Date(nascISO), h = new Date();
        let a = h.getFullYear() - n.getFullYear();
        const m = h.getMonth() - n.getMonth();
        if (m < 0 || (m === 0 && h.getDate() < n.getDate())) a--;
        return a >= 0 && a < 130 ? a : null;
    }

    window.addEventListener('cortex:auth-ready', async () => {
        await CortexSidebar.render('pacientes');
        const p = new URLSearchParams(location.search);
        state.aplicacaoId = p.get('aplicacao_id');
        if (!state.aplicacaoId) { erro('aplicacao_id não fornecido na URL.'); return; }
        try { await carregar(); render(); }
        catch (e) { console.error('[qiiahsd]', e); erro(e.message || 'Falha ao carregar o resultado.'); }
    });

    function erro(msg) {
        document.getElementById('laudo-conteudo').innerHTML =
            `<div class="q-erro"><div class="q-erro-ic">⚠️</div>${esc(msg)}</div>`;
    }

    // ── Carga ─────────────────────────────────────────────────────────────────
    async function carregar() {
        const cli = c();

        const { data: aplicacao, error: eA } = await cli
            .from('aplicacoes_instrumento').select('*').eq('id', state.aplicacaoId).single();
        if (eA) throw new Error('Aplicação: ' + eA.message);
        state.aplicacao = aplicacao;

        const { data: inst } = await cli
            .from('instrumentos_catalogo').select('id, sigla, nome_completo')
            .eq('id', aplicacao.instrumento_id).single();
        state.instrumento = inst;

        const { data: paciente } = await cli
            .from('pacientes').select('id, nome_completo, data_nascimento, sexo, cpf, escolaridade')
            .eq('id', aplicacao.paciente_id).maybeSingle();
        state.paciente = paciente || {};

        // aplicador/profissional (nome), se houver vínculo na aplicação
        state.aplicadorNome = aplicacao.aplicador_nome || aplicacao.criado_por_nome || null;
        if (!state.aplicadorNome && aplicacao.aplicador_id) {
            const { data: prof } = await cli
                .from('profissionais').select('nome_completo').eq('id', aplicacao.aplicador_id).maybeSingle();
            state.aplicadorNome = prof?.nome_completo || null;
        }

        const { data: norma } = await cli
            .from('instrumentos_normas').select('*')
            .eq('instrumento_id', inst.id).eq('ativa', true).limit(1).maybeSingle();
        state.norma = norma;

        const { data: fatores } = await cli
            .from('instrumentos_fatores').select('*').eq('norma_id', norma.id).order('ordem');
        state.fatores = (fatores || []).filter(f => !f.eh_total);

        const { data: itens } = await cli
            .from('instrumentos_itens').select('numero, texto, fator_id').eq('norma_id', norma.id).order('numero');
        state.itens = itens || [];

        const { data: correcao } = await cli
            .from('correcoes').select('escores_brutos').eq('aplicacao_id', state.aplicacaoId).maybeSingle();
        state.respostas = (correcao?.escores_brutos?.respostas) || {};

        await carregarIrma(cli, inst.sigla, aplicacao.paciente_id);
    }

    // Versão-irmã: QIIAHSD-AD <-> QIIAHSD-AD-2F, mesmo paciente, com correção
    async function carregarIrma(cli, sigla, pacienteId) {
        const siglaIrma = sigla.endsWith('-2F') ? sigla.slice(0, -3) : sigla + '-2F';
        const { data: instIrma } = await cli
            .from('instrumentos_catalogo').select('id, sigla').eq('sigla', siglaIrma).maybeSingle();
        if (!instIrma) return;

        const { data: apl } = await cli
            .from('aplicacoes_instrumento').select('id')
            .eq('paciente_id', pacienteId).eq('instrumento_id', instIrma.id)
            .eq('status', 'corrigido').order('data_conclusao', { ascending: false }).limit(1).maybeSingle();
        if (!apl) return;

        const { data: normaIrma } = await cli
            .from('instrumentos_normas').select('id').eq('instrumento_id', instIrma.id).eq('ativa', true).limit(1).maybeSingle();
        if (!normaIrma) return;
        const { data: itensIrma } = await cli
            .from('instrumentos_itens').select('numero, fator_id').eq('norma_id', normaIrma.id);
        const { data: fatIrma } = await cli
            .from('instrumentos_fatores').select('id, fator_codigo').eq('norma_id', normaIrma.id);
        const { data: corrIrma } = await cli
            .from('correcoes').select('escores_brutos').eq('aplicacao_id', apl.id).maybeSingle();

        const codePorFator = {};
        (fatIrma || []).forEach(f => codePorFator[f.id] = f.fator_codigo);
        state.irma = {
            sigla: siglaIrma,
            respostas: (corrIrma?.escores_brutos?.respostas) || {},
            fatorCodePorItem: Object.fromEntries((itensIrma || []).map(i => [i.numero, codePorFator[i.fator_id]])),
        };
    }

    // ── Cálculo do perfil por área ──────────────────────────────────────────
    function perfilPorArea(respostas, itens, fatoresById) {
        // retorna { fator_codigo: {soma, n, media, dist:[c1..c5]} }
        const acc = {};
        for (const it of itens) {
            const cod = fatoresById[it.fator_id];
            if (!cod) continue;
            const v = parseInt(respostas[it.numero], 10);
            if (!acc[cod]) acc[cod] = { soma: 0, n: 0, dist: [0, 0, 0, 0, 0] };
            if (v >= 1 && v <= 5) { acc[cod].soma += v; acc[cod].n++; acc[cod].dist[v - 1]++; }
        }
        for (const k in acc) acc[k].media = acc[k].n ? acc[k].soma / acc[k].n : null;
        return acc;
    }

    function mediaIrmaPorCodigo() {
        if (!state.irma) return null;
        const acc = {};
        for (const [numero, cod] of Object.entries(state.irma.fatorCodePorItem)) {
            const v = parseInt(state.irma.respostas[numero], 10);
            if (!cod) continue;
            if (!acc[cod]) acc[cod] = { soma: 0, n: 0 };
            if (v >= 1 && v <= 5) { acc[cod].soma += v; acc[cod].n++; }
        }
        const out = {};
        for (const k in acc) out[k] = acc[k].n ? acc[k].soma / acc[k].n : null;
        return out;
    }

    // ── Render ────────────────────────────────────────────────────────────────
    function render() {
        const p = state.paciente, inst = state.instrumento;
        const fatoresById = Object.fromEntries(state.fatores.map(f => [f.id, f.fator_codigo]));
        const perfil = perfilPorArea(state.respostas, state.itens, fatoresById);
        const irma = mediaIrmaPorCodigo();
        const ehAuto = !inst.sigla.endsWith('-2F');
        const rotuloEste = ehAuto ? 'Autorrelato' : '2ª fonte';
        const rotuloIrma = ehAuto ? '2ª fonte' : 'Autorrelato';
        const idade = calcularIdade(p.data_nascimento);
        const idadeStr = idade != null ? idade + ' anos' : '—';

        const maxN = Math.max(1, ...state.fatores.map(f => (perfil[f.fator_codigo]?.n || 0)));

        const cards = state.fatores.map(f => {
            const d = perfil[f.fator_codigo] || { media: null, n: 0, dist: [0,0,0,0,0] };
            const pct = d.media != null ? Math.round(((d.media - 1) / 4) * 100) : 0;
            return `
            <div class="q-card" style="border-top:4px solid ${f.cor_hex || 'var(--primary-blue)'}">
                <div class="q-card-area">${esc(f.fator_label)}</div>
                <div class="q-card-media">${fmt(d.media)}<span>/5</span></div>
                <div class="q-card-bar"><span style="width:${pct}%;background:${f.cor_hex || 'var(--primary-blue)'}"></span></div>
                <div class="q-card-n">${d.n} itens respondidos</div>
            </div>`;
        }).join('');

        const linhas = state.fatores.map(f => {
            const d = perfil[f.fator_codigo] || { media: null, n: 0, soma: 0 };
            const mi = irma ? irma[f.fator_codigo] : undefined;
            return `<tr>
                <td><span class="q-dot" style="background:${f.cor_hex}"></span>${esc(f.fator_label)}</td>
                <td class="ctr">${d.n}</td>
                <td class="ctr">${d.soma || '—'}</td>
                <td class="ctr"><b>${fmt(d.media)}</b></td>
                ${irma ? `<td class="ctr">${mi === undefined ? '—' : fmt(mi)}</td>` : ''}
            </tr>`;
        }).join('');

        // Distribuição Nunca→Sempre por área (contagem de respostas em cada nível)
        const linhasDist = state.fatores.map(f => {
            const d = perfil[f.fator_codigo] || { dist: [0,0,0,0,0] };
            const cels = d.dist.map((c, idx) => {
                const forte = idx >= 3 && c > 0;
                return `<td class="ctr ${forte ? 'q-hi' : ''}">${c || '—'}</td>`;
            }).join('');
            return `<tr><td><span class="q-dot" style="background:${f.cor_hex}"></span>${esc(f.fator_label)}</td>${cels}</tr>`;
        }).join('');

        document.getElementById('laudo-conteudo').innerHTML = `
        <a href="#" id="back-link" class="page-back">‹ Voltar à Bateria</a>
        <div class="resultado-acoes-topo"><button class="btn btn-primary" id="btn-pdf">📄 Gerar PDF</button></div>

        <div class="laudo" data-copiavel data-copy-nome="QIIAHSD ${rotuloEste} - ${esc(p.nome_completo || '')}">
            <div class="laudo-header">
                <div class="laudo-header-esq">
                    <div class="laudo-header-logo">E</div>
                    <div class="laudo-header-textos">
                        <div class="laudo-header-supratitulo">Relatório — Altas Habilidades/Superdotação</div>
                        <h1 class="laudo-header-titulo">QIIAHSD-Adulto · ${rotuloEste}</h1>
                        <div class="laudo-header-subtitulo">Indicadores de AH/SD · escala 1–5 (Nunca→Sempre) · perfil por área</div>
                    </div>
                </div>
            </div>

            <div class="laudo-body">
                <div class="laudo-secao-titulo"><span class="laudo-secao-tag">1</span> Identificação</div>
                <div class="laudo-identificacao">
                    <div class="laudo-identif-item"><span class="laudo-identif-label">Nome:</span><span class="laudo-identif-valor">${esc(p.nome_completo || '—')}</span></div>
                    <div class="laudo-identif-item"><span class="laudo-identif-label">Idade:</span><span class="laudo-identif-valor">${idadeStr}</span></div>
                    <div class="laudo-identif-item"><span class="laudo-identif-label">Sexo:</span><span class="laudo-identif-valor">${esc(p.sexo || '—')}</span></div>
                    <div class="laudo-identif-item"><span class="laudo-identif-label">Nascimento:</span><span class="laudo-identif-valor">${fmtData(p.data_nascimento)}</span></div>
                    <div class="laudo-identif-item"><span class="laudo-identif-label">CPF:</span><span class="laudo-identif-valor">${esc(p.cpf || '—')}</span></div>
                    <div class="laudo-identif-item"><span class="laudo-identif-label">Escolaridade:</span><span class="laudo-identif-valor">${esc(p.escolaridade || '—')}</span></div>
                    <div class="laudo-identif-item"><span class="laudo-identif-label">Avaliação:</span><span class="laudo-identif-valor">${fmtData(state.aplicacao.data_aplicacao || state.aplicacao.data_conclusao)}</span></div>
                    <div class="laudo-identif-item"><span class="laudo-identif-label">Aplicador:</span><span class="laudo-identif-valor">${esc(state.aplicadorNome || '—')}</span></div>
                    <div class="laudo-identif-item"><span class="laudo-identif-label">Fonte:</span><span class="laudo-identif-valor">${rotuloEste}</span></div>
                </div>

                <div class="laudo-secao-titulo"><span class="laudo-secao-tag">2</span> Perfil por Área (média das respostas)</div>
                <div class="q-cards" data-copiavel data-copy-nome="QIIAHSD perfil por area">${cards}</div>

                <div class="laudo-secao-titulo"><span class="laudo-secao-tag">3</span> ${irma ? 'Comparativo entre fontes' : 'Médias por área'}</div>
                <div class="q-grafico-wrap" data-copiavel data-copy-nome="QIIAHSD grafico areas"><canvas id="q-chart"></canvas></div>

                <table class="q-tabela">
                    <thead><tr><th>Área</th><th class="ctr">Itens</th><th class="ctr">Soma</th><th class="ctr">${rotuloEste} (média)</th>${irma ? `<th class="ctr">${rotuloIrma} (média)</th>` : ''}</tr></thead>
                    <tbody>${linhas}</tbody>
                </table>

                <div class="laudo-secao-titulo"><span class="laudo-secao-tag">4</span> Distribuição das respostas por área</div>
                <div class="q-grafico-wrap" data-copiavel data-copy-nome="QIIAHSD distribuicao"><canvas id="q-chart-dist"></canvas></div>
                <table class="q-tabela">
                    <thead><tr><th>Área</th>${NIVEL_LABELS.map(l => `<th class="ctr">${l}</th>`).join('')}</tr></thead>
                    <tbody>${linhasDist}</tbody>
                </table>

                <div class="q-nota">
                    <b>Instrumento qualitativo — sem ponto de corte.</b> O QIIAHSD levanta
                    <i>indicadores</i> de altas habilidades/superdotação por área; não estabelece
                    diagnóstico nem classificação numérica. A leitura é clínica, cruzando o autorrelato
                    com a segunda fonte e demais dados da avaliação.
                    ${irma ? `A coluna comparativa é da ${rotuloIrma} do(a) mesmo(a) paciente.`
                            : 'A versão-irmã (autorrelato/2ª fonte) ainda não foi corrigida para este paciente — quando estiver, o comparativo aparece aqui.'}
                </div>
            </div>

            <div class="laudo-rodape">
                <div class="laudo-rodape-esq">
                    <div class="laudo-rodape-org">Equilibrium Neuropsicologia</div>
                    <div class="laudo-rodape-tipo">QIIAHSD-Adulto — ${rotuloEste}</div>
                </div>
                <div class="laudo-rodape-dir">
                    <div class="laudo-rodape-confidencial">Instrumento de indicadores (Pérez). Uso restrito ao profissional.</div>
                </div>
            </div>
        </div>`;

        const bl = document.getElementById('back-link');
        if (bl) bl.addEventListener('click', (e) => { e.preventDefault(); history.back(); });
        document.getElementById('btn-pdf').addEventListener('click', gerarPDF);
        desenharGrafico(perfil, irma, rotuloEste, rotuloIrma);

        // Botões de copiar imagem (câmera no header + laudo inteiro), como nos demais laudos
        if (window.CortexCopy && typeof window.CortexCopy.aplicar === 'function') {
            try { window.CortexCopy.aplicar(); } catch (e) { /* silencioso */ }
        }
    }

    function desenharGrafico(perfil, irma, rotuloEste, rotuloIrma) {
        const ctx = document.getElementById('q-chart');
        if (!ctx || !window.Chart) return;
        const labels = state.fatores.map(f => f.fator_label);
        const dadosEste = state.fatores.map(f => (perfil[f.fator_codigo]?.media ?? null));
        const cores = state.fatores.map(f => f.cor_hex || '#0c1f3f');
        const datasets = [{ label: rotuloEste, data: dadosEste, backgroundColor: cores }];
        if (irma) {
            datasets.push({
                label: rotuloIrma,
                data: state.fatores.map(f => (irma[f.fator_codigo] ?? null)),
                backgroundColor: '#cbd5e1'
            });
        }
        state.chart = new Chart(ctx, {
            type: 'bar',
            data: { labels, datasets },
            options: {
                indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                scales: { x: { min: 1, max: 5, ticks: { stepSize: 1 } } },
                plugins: { legend: { display: !!irma } }
            }
        });

        desenharDistribuicao(perfil);
    }

    // Gráfico de distribuição: barras empilhadas Nunca→Sempre por área
    function desenharDistribuicao(perfil) {
        const ctx = document.getElementById('q-chart-dist');
        if (!ctx || !window.Chart) return;
        const labels = state.fatores.map(f => f.fator_label);
        const CORES_NIVEL = ['#d6dde9', '#adbbd2', '#6f80a3', '#1e3a6f', '#0c1f3f']; // tons do azul CORTEX
        const datasets = NIVEL_LABELS.map((lbl, idx) => ({
            label: lbl,
            data: state.fatores.map(f => (perfil[f.fator_codigo]?.dist?.[idx] ?? 0)),
            backgroundColor: CORES_NIVEL[idx],
        }));
        state.chartDist = new Chart(ctx, {
            type: 'bar',
            data: { labels, datasets },
            options: {
                indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                scales: { x: { stacked: true, ticks: { stepSize: 1 } }, y: { stacked: true } },
                plugins: { legend: { position: 'bottom' } }
            }
        });
    }

    // ── PDF (quebra por seção, não corta gráfico/tabela) ──────────────────────
    async function gerarPDF() {
        const btn = document.getElementById('btn-pdf'); const orig = btn.textContent;
        btn.disabled = true; btn.textContent = '⏳ Gerando...';
        try {
            const laudo = document.querySelector('.laudo');
            const canvas = await html2canvas(laudo, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false });
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            const MT = 8, MB = 8, pxPerMm = canvas.width / 210, pageContentPx = (297 - MT - MB) * pxPerMm;
            const lr = laudo.getBoundingClientRect(), ratio = canvas.height / lr.height;
            const bounds = Array.from(laudo.querySelectorAll('.laudo-secao-titulo, .laudo-rodape'))
                .map(el => (el.getBoundingClientRect().top - lr.top) * ratio)
                .filter(y => y > 1 && y < canvas.height - 1).sort((a, b) => a - b);
            bounds.push(canvas.height);
            const add = (s, e) => {
                const h = Math.max(1, Math.round(e - s));
                const t = document.createElement('canvas'); t.width = canvas.width; t.height = h;
                const cx = t.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, t.width, h);
                cx.drawImage(canvas, 0, s, canvas.width, h, 0, 0, canvas.width, h);
                pdf.addImage(t.toDataURL('image/jpeg', 0.95), 'JPEG', 0, MT, 210, h / pxPerMm);
            };
            if (canvas.height <= pageContentPx) add(0, canvas.height);
            else {
                let start = 0;
                while (start < canvas.height - 1) {
                    const maxEnd = start + pageContentPx; let end;
                    if (maxEnd >= canvas.height) end = canvas.height;
                    else { let cut = -1; for (const b of bounds) if (b > start + 1 && b <= maxEnd) cut = b; end = cut > 0 ? cut : maxEnd; }
                    add(start, end); start = end; if (start < canvas.height - 1) pdf.addPage();
                }
            }
            const nome = (state.paciente.nome_completo || 'paciente').toUpperCase().replace(/[^A-Z\s]/g, '').trim().slice(0, 40);
            pdf.save(`QIIAHSD ${state.instrumento.sigla.endsWith('2F') ? '2F' : 'Auto'} - ${nome}.pdf`);
            window.CortexUI?.toast('PDF gerado', 'success');
        } catch (e) {
            console.error(e); window.CortexUI?.toast('Erro ao gerar PDF: ' + e.message, 'danger');
        } finally { btn.disabled = false; btn.textContent = orig; }
    }
})();

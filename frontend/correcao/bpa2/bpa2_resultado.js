// ============================================================================
// CORTEX_APP — BPA-2 · Correção dos subtestes de cancelamento (AC / AD / AA)
// ----------------------------------------------------------------------------
// URL: /correcao/bpa2/bpa2_resultado.html?aplicacao_id=<uuid>
//
// O crivo (gabarito) é fixo (bpa2_crivos.js) e aparece TRAVADO — o corretor
// não altera. Ele só marca as respostas do paciente. Contagem por subteste:
//   Acertos  = alvo do crivo que o paciente marcou
//   Erros    = marcou onde não era alvo
//   Omissões = alvo NÃO marcado, contando só até a última marcação do paciente
// ============================================================================

(function () {
    'use strict';

    const SUBTESTES = ['AC', 'AD', 'AA'];
    const NOMES = { AC: 'Atenção Concentrada', AD: 'Atenção Dividida', AA: 'Atenção Alternada' };

    const state = {
        aplicacaoId: null,
        aplicacao: null,
        paciente: null,
        ativo: 'AC',
        respostas: { AC: new Set(), AD: new Set(), AA: new Set() }, // índices marcados pelo paciente
    };

    function client() { return window.cortexClient; }
    function toast(m, t) { if (window.CortexUI?.toast) window.CortexUI.toast(m, t); }
    function esc(t) { const d = document.createElement('div'); d.textContent = t == null ? '' : String(t); return d.innerHTML; }
    function crivo(sub) { return window.BPA2_CRIVOS[sub]; }

    // ── Boot ────────────────────────────────────────────────────────────────
    window.addEventListener('cortex:auth-ready', async () => {
        await CortexSidebar.render('pacientes');
        const params = new URLSearchParams(window.location.search);
        state.aplicacaoId = params.get('aplicacao_id');
        if (!state.aplicacaoId) { erro('aplicacao_id não fornecido na URL.'); return; }
        try {
            await carregar();
            render();
        } catch (e) {
            console.error('[bpa2] carregar:', e);
            erro(e.message || 'Falha ao carregar a correção.');
        }
    });

    function erro(msg) {
        document.getElementById('bpa2-root').innerHTML =
            `<div class="bpa2-erro"><div class="bpa2-erro-icone">⚠️</div>${esc(msg)}</div>`;
    }

    // ── Carga ─────────────────────────────────────────────────────────────────
    async function carregar() {
        const c = client();
        const { data: aplicacao, error: eA } = await c
            .from('aplicacoes_instrumento').select('*').eq('id', state.aplicacaoId).single();
        if (eA) throw new Error('Aplicação: ' + eA.message);
        state.aplicacao = aplicacao;

        const { data: paciente } = await c
            .from('pacientes').select('id, nome_completo, data_nascimento, idade_humanizada')
            .eq('id', aplicacao.paciente_id).single();
        state.paciente = paciente || {};

        const { data: rows } = await c
            .from('bpa2_respostas').select('subteste, respostas')
            .eq('aplicacao_id', state.aplicacaoId);
        for (const r of rows || []) {
            if (state.respostas[r.subteste]) {
                state.respostas[r.subteste] = new Set(Array.isArray(r.respostas) ? r.respostas : []);
            }
        }
    }

    // ── Contagem ──────────────────────────────────────────────────────────────
    function contar(sub) {
        const cr = crivo(sub);
        const marc = state.respostas[sub];
        if (!cr) return { acertos: 0, erros: 0, omissoes: 0, ultima: -1, total: 0 };
        const ultima = marc.size ? Math.max(...marc) : -1;   // extensão = última marcação
        let acertos = 0, erros = 0, omissoes = 0;
        for (const i of marc) {
            if (cr.alvos.has(i)) acertos++;
            else erros++;
        }
        for (const alvo of cr.alvos) {
            if (alvo <= ultima && !marc.has(alvo)) omissoes++;
        }
        return { acertos, erros, omissoes, ultima, total: cr.alvos.size };
    }

    // ── Render ──────────────────────────────────────────────────────────────
    function render() {
        const p = state.paciente || {};
        const root = document.getElementById('bpa2-root');
        root.innerHTML = `
        <div class="bpa2-wrap">
            <a href="javascript:history.back()" class="bpa2-voltar">‹ Voltar à bateria</a>

            <div class="bpa2-header">
                <div class="bpa2-header-icone">BPA</div>
                <div>
                    <div class="bpa2-header-sub">CANCELAMENTO · CORREÇÃO</div>
                    <h1>BPA-2</h1>
                    <p>${esc(p.nome_completo || '—')}${p.idade_humanizada ? ' · ' + esc(p.idade_humanizada) : ''}</p>
                </div>
                <button class="btn btn-primary" id="bpa2-salvar">💾 Salvar e corrigir</button>
            </div>

            <div class="bpa2-aviso">
                🔒 O crivo (posições-alvo) é fixo e não pode ser alterado aqui. Marque apenas as
                respostas do paciente — as células que ele assinalou. As omissões são contadas
                só até a sua última marcação.
            </div>

            <div class="bpa2-tabs">
                ${SUBTESTES.map(s => `
                    <button class="bpa2-tab ${state.ativo === s ? 'ativo' : ''}" data-sub="${s}">
                        <span class="bpa2-tab-sigla">${s}</span>
                        <span class="bpa2-tab-nome">${NOMES[s]}</span>
                    </button>`).join('')}
            </div>

            <div id="bpa2-painel"></div>
        </div>`;

        root.querySelectorAll('.bpa2-tab').forEach(b =>
            b.addEventListener('click', () => { state.ativo = b.dataset.sub; renderPainel(); atualizarTabs(); }));
        document.getElementById('bpa2-salvar').addEventListener('click', salvar);

        renderPainel();
    }

    function atualizarTabs() {
        document.querySelectorAll('.bpa2-tab').forEach(b =>
            b.classList.toggle('ativo', b.dataset.sub === state.ativo));
    }

    function renderPainel() {
        const sub = state.ativo;
        const cr = crivo(sub);
        const painel = document.getElementById('bpa2-painel');
        if (!cr) {
            painel.innerHTML = `<div class="bpa2-erro">Crivo do subteste ${sub} não configurado.</div>`;
            return;
        }
        const r = contar(sub);
        const total = cr.rows * cr.cols;

        let celulas = '';
        for (let i = 0; i < total; i++) {
            const alvo = cr.alvos.has(i);
            const marcado = state.respostas[sub].has(i);
            const dentro = r.ultima >= 0 && i <= r.ultima;
            let cls = 'bpa2-cel';
            if (alvo) cls += ' alvo';
            if (marcado && alvo) cls += ' acerto';
            else if (marcado && !alvo) cls += ' erro';
            else if (alvo && dentro) cls += ' omissao';
            celulas += `<button class="${cls}" data-i="${i}" title="pos ${i}"></button>`;
        }

        painel.innerHTML = `
            <div class="bpa2-stats">
                <div class="bpa2-stat s-ac"><div class="bpa2-stat-num">${r.acertos}</div><div class="bpa2-stat-lbl">Acertos</div></div>
                <div class="bpa2-stat s-er"><div class="bpa2-stat-num">${r.erros}</div><div class="bpa2-stat-lbl">Erros</div></div>
                <div class="bpa2-stat s-om"><div class="bpa2-stat-num">${r.omissoes}</div><div class="bpa2-stat-lbl">Omissões</div></div>
                <div class="bpa2-stat s-al"><div class="bpa2-stat-num">${cr.alvos.size}</div><div class="bpa2-stat-lbl">Alvos no crivo</div></div>
            </div>

            <div class="bpa2-legenda">
                <span><i class="lg alvo"></i> alvo do crivo</span>
                <span><i class="lg acerto"></i> acerto</span>
                <span><i class="lg erro"></i> erro</span>
                <span><i class="lg omissao"></i> omissão (até a última marca)</span>
            </div>

            <div class="bpa2-grade-wrap">
                <div class="bpa2-grade" id="bpa2-grade" style="grid-template-columns: repeat(${cr.cols}, 1fr);">
                    ${celulas}
                </div>
            </div>

            <div class="bpa2-acoes-sub">
                <button class="btn btn-secondary btn-sm" id="bpa2-limpar">Limpar respostas deste subteste</button>
                <span class="bpa2-extensao">Última marcação: ${r.ultima >= 0 ? 'posição ' + r.ultima : '—'}</span>
            </div>`;

        const grade = document.getElementById('bpa2-grade');
        grade.querySelectorAll('.bpa2-cel').forEach(cel =>
            cel.addEventListener('click', () => {
                const i = parseInt(cel.dataset.i, 10);
                const set = state.respostas[sub];
                if (set.has(i)) set.delete(i); else set.add(i);
                renderPainel();
            }));
        document.getElementById('bpa2-limpar').addEventListener('click', () => {
            if (!state.respostas[sub].size) return;
            state.respostas[sub] = new Set();
            renderPainel();
        });
    }

    // ── Salvar ────────────────────────────────────────────────────────────────
    async function salvar() {
        const btn = document.getElementById('bpa2-salvar');
        const orig = btn.textContent;
        btn.textContent = '⏳ Salvando...';
        btn.disabled = true;
        try {
            const c = client();
            const linhas = SUBTESTES.map(sub => {
                const r = contar(sub);
                return {
                    aplicacao_id: state.aplicacaoId,
                    subteste: sub,
                    respostas: Array.from(state.respostas[sub]).sort((a, b) => a - b),
                    acertos: r.acertos, erros: r.erros, omissoes: r.omissoes,
                    ultima_marca: r.ultima >= 0 ? r.ultima : null,
                };
            });

            const { error: eU } = await c
                .from('bpa2_respostas')
                .upsert(linhas, { onConflict: 'aplicacao_id,subteste' });
            if (eU) throw eU;

            const { error: eS } = await c
                .from('aplicacoes_instrumento')
                .update({ status: 'corrigido', data_conclusao: state.aplicacao.data_conclusao || new Date().toISOString() })
                .eq('id', state.aplicacaoId);
            if (eS) throw eS;

            try {
                await CortexAudit.log('edicao', 'bpa2_respostas', state.aplicacaoId, {
                    pacienteId: state.paciente?.id, detalhes: { operacao: 'bpa2_corrigido' }
                });
            } catch (e) { /* silencioso */ }

            state.aplicacao.status = 'corrigido';
            toast('✓ BPA-2 corrigido e salvo', 'success');
        } catch (err) {
            console.error('[bpa2] salvar:', err);
            toast('Erro ao salvar: ' + (err.message || 'desconhecido'), 'danger');
        } finally {
            btn.textContent = orig;
            btn.disabled = false;
        }
    }
})();

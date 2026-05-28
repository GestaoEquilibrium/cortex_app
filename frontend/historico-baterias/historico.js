// ============================================================================
// CORTEX_APP — Sprint 71 — historico-baterias/historico.js
// Lista de pacientes com bateria já marcada como vista pela equipe.
// Permite "desmarcar" (excluir o registro de visto) → volta pro dashboard.
// ============================================================================

(function() {
    'use strict';

    const state = { lista: [] };

    window.addEventListener('cortex:auth-ready', async () => {
        await CortexSidebar.render('dashboard');
        try {
            await carregar();
            renderizar();
        } catch (err) {
            console.error('[historico]', err);
            erro(err.message || 'Erro ao carregar');
        }
    });

    async function carregar() {
        // Todos os registros "vistos", ordenados pelo mais recente
        const { data: vistas, error } = await window.cortexClient
            .from('baterias_vistas')
            .select('paciente_id, vista_ate, vista_em, vista_por')
            .order('vista_em', { ascending: false });
        if (error) throw new Error(error.message);
        if (!vistas || vistas.length === 0) { state.lista = []; return; }

        const pacIds = vistas.map(v => v.paciente_id);
        const profIds = [...new Set(vistas.map(v => v.vista_por).filter(Boolean))];

        const [pacRes, profRes] = await Promise.all([
            window.cortexClient.from('vw_pacientes_lista')
                .select('id, nome_completo, idade_humanizada, sexo, status, foto_url')
                .in('id', pacIds),
            profIds.length
                ? window.cortexClient.from('profissionais').select('id, nome_completo').in('id', profIds)
                : { data: [] }
        ]);
        const pacMap = new Map((pacRes.data || []).map(p => [p.id, p]));
        const profMap = new Map((profRes.data || []).map(p => [p.id, p.nome_completo]));

        const lista = vistas
            .filter(v => pacMap.has(v.paciente_id))
            .map(v => ({
                ...pacMap.get(v.paciente_id),
                vista_ate: v.vista_ate,
                vista_em: v.vista_em,
                vista_por_nome: profMap.get(v.vista_por) || '—'
            }));

        await Promise.all(lista.map(async (p) => {
            if (p.foto_url && window.CortexAvatar) {
                try { p._signedUrl = await window.CortexAvatar.buscarUrlAssinada(p.id, p.foto_url); }
                catch (_) { p._signedUrl = null; }
            }
        }));

        state.lista = lista;
    }

    function renderizar() {
        const cont = document.getElementById('historico-conteudo');
        if (!state.lista.length) {
            cont.innerHTML = `
                <div class="hist-vazio">
                    <div class="hist-vazio-ic">📭</div>
                    <h2>Nenhum histórico ainda</h2>
                    <p>Quando alguém marcar uma bateria concluída como "vista" no dashboard, ela aparece aqui.</p>
                </div>
            `;
            return;
        }

        cont.innerHTML = `
            <div class="hist-lista">
                ${state.lista.map(p => renderLinha(p)).join('')}
            </div>
        `;
    }

    function renderLinha(p) {
        const avatar = p._signedUrl
            ? `<img src="${escapeHtml(p._signedUrl)}" alt="" class="hist-foto">`
            : `<div class="hist-foto hist-foto-placeholder">${escapeHtml((p.nome_completo || '?').charAt(0))}</div>`;
        const dataVisto = new Date(p.vista_em).toLocaleString('pt-BR', {
            day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });
        return `
            <div class="hist-item" data-pid="${escapeHtml(p.id)}" data-nome="${escapeHtml(p.nome_completo)}">
                <a class="hist-item-link" href="../pacientes/pasta.html?id=${escapeHtml(p.id)}">
                    ${avatar}
                    <div class="hist-info">
                        <div class="hist-nome">${escapeHtml(p.nome_completo)}</div>
                        <div class="hist-meta">Marcado por ${escapeHtml(p.vista_por_nome)} em ${escapeHtml(dataVisto)}</div>
                    </div>
                </a>
                <button class="btn btn-secondary btn-sm" data-acao="desmarcar">Desmarcar</button>
            </div>
        `;
    }

    async function desmarcar(pacienteId, nome) {
        await window.CortexConfirm.mostrar({
            icone: '↩️',
            titulo: 'Desmarcar visualização?',
            texto: `O paciente "${nome}" volta a aparecer no bloco "Baterias concluídas" do dashboard.`,
            btnSim: 'Sim, desmarcar',
            btnNao: 'Cancelar',
            onSim: async () => {
                const { error } = await window.cortexClient
                    .from('baterias_vistas')
                    .delete()
                    .eq('paciente_id', pacienteId);
                if (error) { window.CortexUI.toast('Erro: ' + error.message, 'danger'); throw error; }
                window.CortexUI.toast('Desmarcado.', 'success');
                await carregar();
                renderizar();
            }
        });
    }

    document.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-acao="desmarcar"]');
        if (!btn) return;
        e.preventDefault();
        const item = btn.closest('.hist-item');
        if (!item) return;
        desmarcar(item.dataset.pid, item.dataset.nome);
    });

    function erro(msg) {
        document.getElementById('historico-conteudo').innerHTML = `
            <div class="hist-vazio"><div class="hist-vazio-ic">⚠️</div><h2>Erro</h2><p>${escapeHtml(msg)}</p></div>
        `;
    }
    function escapeHtml(t) {
        if (t == null) return '';
        const d = document.createElement('div'); d.textContent = String(t); return d.innerHTML;
    }
})();

// ============================================================================
// CORTEX_APP — triagens.js
// ----------------------------------------------------------------------------
// Lista de quem respondeu a triagem rápida nos eventos.
//
// Não são pacientes: ficam em `triagens_evento` até alguém da equipe entrar
// em contato. Aqui a equipe acompanha, marca quem já foi contatado e exporta
// a lista.
//
// Quem marcou o item de risco do PHQ-9 (pensamentos de morte) aparece no topo,
// destacado. Esse aviso é só para a equipe — quem respondeu viu apenas a tela
// de agradecimento.
// ============================================================================

(function () {
    'use strict';

    const state = { itens: [], filtro: 'todos' };

    const c = () => window.cortexClient;
    const el = (id) => document.getElementById(id);
    const esc = (t) => { const d = document.createElement('div'); d.textContent = t ?? ''; return d.innerHTML; };
    const toast = (m, t) => { if (window.CortexUI?.toast) window.CortexUI.toast(m, t); };

    function dataHora(iso) {
        if (!iso) return '—';
        const d = new Date(iso);
        return isNaN(d) ? '—' : d.toLocaleDateString('pt-BR') + ' ' +
            d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }

    function idade(nasc) {
        if (!nasc) return '';
        const m = String(nasc).substring(0, 10).split('-');
        if (m.length !== 3) return '';
        const n = new Date(+m[0], +m[1] - 1, +m[2]), h = new Date();
        let a = h.getFullYear() - n.getFullYear();
        const dm = h.getMonth() - n.getMonth();
        if (dm < 0 || (dm === 0 && h.getDate() < n.getDate())) a--;
        return a + ' anos';
    }

    const risco = (t) => (t.phq9_item9 || 0) > 0;

    function corFaixa(f) {
        return { 'mínima': 'ok', 'leve': 'leve', 'moderada': 'media',
                 'moderadamente grave': 'alta', 'grave': 'alta' }[f] || '';
    }

    // ── Carga ───────────────────────────────────────────────────────────────

    async function carregar() {
        try {
            const { data, error } = await c()
                .from('triagens_evento')
                .select('*, contatador:contatado_por(nome_completo)')
                .order('created_at', { ascending: false })
                .limit(500);
            if (error) throw error;
            state.itens = data || [];
        } catch (err) {
            console.error('[triagens] carregar:', err);
            el('tg-conteudo').innerHTML =
                `<div class="tg-vazio"><strong>Erro ao carregar</strong>${esc(err.message || '')}</div>`;
            return;
        }
        pintar();
    }

    function filtrados() {
        if (state.filtro === 'risco')      return state.itens.filter(risco);
        if (state.filtro === 'pendentes')  return state.itens.filter(t => !t.contatado);
        if (state.filtro === 'contatados') return state.itens.filter(t => t.contatado);
        return state.itens;
    }

    function pintar() {
        const lista = filtrados();
        const nRisco = state.itens.filter(risco).length;
        const nPend = state.itens.filter(t => !t.contatado).length;

        el('tg-conteudo').innerHTML = `
            ${nRisco ? `
            <div class="tg-alerta">
                <span>⚠️</span>
                <div>
                    <strong>${nRisco} pessoa(s) marcaram o item sobre pensamentos de morte.</strong>
                    Priorize o contato. Quem respondeu não viu nenhum alerta.
                </div>
            </div>` : ''}

            <div class="tg-resumo">
                <div class="tg-num"><strong>${state.itens.length}</strong> respostas</div>
                <div class="tg-num"><strong>${nPend}</strong> a contatar</div>
                ${nRisco ? `<div class="tg-num risco"><strong>${nRisco}</strong> atenção</div>` : ''}
            </div>

            <div class="tg-filtros">
                ${[['todos','Todas'],['pendentes','A contatar'],['contatados','Contatadas'],['risco','Atenção']]
                    .map(([v,l]) => `<button class="tg-filtro ${state.filtro===v?'ativo':''}" data-f="${v}">${l}</button>`).join('')}
            </div>

            ${!lista.length ? `<div class="tg-vazio"><strong>Nenhuma resposta ainda</strong>
                Compartilhe o link da triagem para começar a receber.</div>` : `
            <div class="tg-lista">
                ${lista.map(card).join('')}
            </div>`}`;

        ligar();
    }

    function card(t) {
        return `
            <div class="tg-card ${risco(t) ? 'risco' : ''} ${t.contatado ? 'feito' : ''}">
                <div class="tg-card-topo">
                    <div>
                        <div class="tg-nome">${esc(t.nome)}${risco(t) ? ' <span class="tg-flag">atenção</span>' : ''}</div>
                        <div class="tg-meta">
                            ${esc(t.telefone)}
                            ${t.data_nascimento ? ' · ' + idade(t.data_nascimento) : ''}
                            ${t.sexo ? ' · ' + esc(t.sexo) : ''}
                            ${t.empresa ? ' · ' + esc(t.empresa) : ''}
                        </div>
                        <div class="tg-quando">${dataHora(t.created_at)}${t.evento ? ' · ' + esc(t.evento) : ''}</div>
                    </div>
                    <div class="tg-acoes">
                        <a class="tg-mini zap" target="_blank" rel="noopener"
                           href="https://wa.me/55${String(t.telefone||'').replace(/\D/g,'')}">WhatsApp</a>
                        <button class="tg-mini ${t.contatado ? 'feito' : ''}" data-contato="${t.id}">
                            ${t.contatado ? '✓ Contatada' : 'Marcar contato'}
                        </button>
                    </div>
                </div>

                <div class="tg-escalas">
                    <div class="tg-escala ${corFaixa(t.gad7_faixa)}">
                        <span class="tg-escala-nome">Ansiedade</span>
                        <span class="tg-escala-valor">${t.gad7_escore ?? '—'}<small>/21</small></span>
                        <span class="tg-escala-faixa">${esc(t.gad7_faixa || '')}</span>
                    </div>
                    <div class="tg-escala ${corFaixa(t.phq9_faixa)}">
                        <span class="tg-escala-nome">Humor</span>
                        <span class="tg-escala-valor">${t.phq9_escore ?? '—'}<small>/27</small></span>
                        <span class="tg-escala-faixa">${esc(t.phq9_faixa || '')}</span>
                    </div>
                    <div class="tg-escala ${t.asrs_positivo ? 'media' : 'ok'}">
                        <span class="tg-escala-nome">Atenção (TDAH)</span>
                        <span class="tg-escala-valor">${t.asrs_marcas ?? '—'}<small>/6</small></span>
                        <span class="tg-escala-faixa">${t.asrs_positivo ? 'rastreio positivo' : 'rastreio negativo'}</span>
                    </div>
                </div>

                ${t.contatado ? `<div class="tg-feito-nota">
                    Contatada em ${dataHora(t.contatado_em)}${t.contatador?.nome_completo ? ' por ' + esc(t.contatador.nome_completo) : ''}
                </div>` : ''}
            </div>`;
    }

    // ── Eventos ─────────────────────────────────────────────────────────────

    function ligar() {
        document.querySelectorAll('[data-f]').forEach(b =>
            b.addEventListener('click', () => { state.filtro = b.dataset.f; pintar(); }));
        document.querySelectorAll('[data-contato]').forEach(b =>
            b.addEventListener('click', () => marcarContato(b.dataset.contato)));
    }

    async function marcarContato(id) {
        const t = state.itens.find(x => x.id === id);
        if (!t) return;
        const novo = !t.contatado;
        try {
            const { error } = await c().from('triagens_evento').update({
                contatado: novo,
                contatado_em: novo ? new Date().toISOString() : null,
                contatado_por: novo ? (window.cortexProfissional?.id || null) : null
            }).eq('id', id);
            if (error) throw error;

            t.contatado = novo;
            t.contatado_em = novo ? new Date().toISOString() : null;
            t.contatador = novo ? { nome_completo: window.cortexProfissional?.nome_completo } : null;
            pintar();
        } catch (err) {
            console.error('[triagens] contato:', err);
            toast('Erro ao marcar: ' + (err.message || ''), 'danger');
        }
    }

    function copiarLink() {
        const url = location.origin + location.pathname.replace(/triagens\/.*$/, 'triagem/');
        navigator.clipboard.writeText(url)
            .then(() => toast('Link copiado: ' + url, 'success'))
            .catch(() => prompt('Copie o link da triagem:', url));
    }

    function exportarCsv() {
        const cols = ['Nome','Telefone','CPF','Nascimento','Sexo','Empresa','Evento',
                      'Ansiedade (GAD-7)','Faixa','Humor (PHQ-9)','Faixa','Item risco',
                      'TDAH (marcas)','Rastreio TDAH','Respondido em','Contatada'];
        const linhas = filtrados().map(t => [
            t.nome, t.telefone, t.cpf || '', t.data_nascimento || '', t.sexo || '',
            t.empresa || '', t.evento || '',
            t.gad7_escore ?? '', t.gad7_faixa || '',
            t.phq9_escore ?? '', t.phq9_faixa || '', t.phq9_item9 ?? '',
            t.asrs_marcas ?? '', t.asrs_positivo ? 'positivo' : 'negativo',
            dataHora(t.created_at), t.contatado ? 'sim' : 'não'
        ]);
        const csv = [cols, ...linhas]
            .map(l => l.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';'))
            .join('\n');
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }));
        a.download = `triagens_${new Date().toISOString().slice(0,10)}.csv`;
        document.body.appendChild(a); a.click(); a.remove();
    }

    window.addEventListener('cortex:auth-ready', async () => {
        await CortexSidebar.render('triagens');
        el('tg-link').addEventListener('click', copiarLink);
        el('tg-csv').addEventListener('click', exportarCsv);
        await carregar();
    });
})();

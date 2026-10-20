// ============================================================================
// CORTEX_APP — glossario_admin.js
// ----------------------------------------------------------------------------
// Aba "Glossário dos balões" em Configurações. Só admin clínico.
// Sprint LO-5 (Documento 3, §1 e §3.3).
//
// Os termos daqui aparecem no Laudo Online quando o texto marca {{Termo}}:
// a pessoa clica no termo sublinhado e lê a explicação. Para um caso
// específico, o texto do laudo pode trazer a própria explicação
// ({{Termo|explicação}}), que vence o glossário.
//
// Laudo finalizado guarda os termos que usou no dia da finalização: mudar o
// glossário depois não altera laudo entregue, só os próximos.
// ============================================================================

window.CortexGlossarioAdmin = (function () {
    'use strict';

    const state = { termos: [], busca: '' };
    const c = () => window.cortexClient;
    const toast = (m, t) => { if (window.CortexUI?.toast) window.CortexUI.toast(m, t); };
    const esc = (t) => { const d = document.createElement('div'); d.textContent = t ?? ''; return d.innerHTML; };

    async function carregar() {
        const { data, error } = await c().from('laudo_glossario')
            .select('termo, titulo, texto, ativo, updated_at').order('termo');
        if (error) throw error;
        state.termos = data || [];
    }

    function filtrados() {
        const b = state.busca.trim().toLowerCase();
        if (!b) return state.termos;
        return state.termos.filter(t => (t.termo + ' ' + t.titulo + ' ' + t.texto).toLowerCase().includes(b));
    }

    function render() {
        const lista = filtrados();
        return `
            <div class="cfg-card glo-card">
                <div class="glo-topo">
                    <div>
                        <h2>Glossário dos balões</h2>
                        <p>Explicações que aparecem no <b>Laudo Online</b> quando o texto marca um termo com <code>{{Termo}}</code>.
                           O paciente e o médico clicam no termo sublinhado e leem a explicação. Laudos já finalizados guardam
                           as explicações do dia da finalização.</p>
                    </div>
                    <button class="btn btn-primary" id="glo-novo">＋ Novo termo</button>
                </div>
                <div class="glo-busca">
                    <input type="search" id="glo-busca" placeholder="Buscar termo ou explicação…" value="${esc(state.busca)}">
                    <span>${state.termos.length} termo(s) · ${state.termos.filter(t => t.ativo).length} ativo(s)</span>
                </div>
                <div class="glo-lista" id="glo-lista">${lista.length ? lista.map(item).join('') : '<div class="cfg-vazio">Nenhum termo encontrado.</div>'}</div>
            </div>`;
    }

    function item(t) {
        return `
            <div class="glo-item ${t.ativo ? '' : 'inativo'}" data-termo="${esc(t.termo)}">
                <div class="glo-item-txt">
                    <div class="glo-item-cab"><code>{{${esc(t.termo)}}}</code>${t.ativo ? '' : '<span class="glo-tag">inativo</span>'}</div>
                    <b>${esc(t.titulo)}</b>
                    <p>${esc(t.texto)}</p>
                </div>
                <div class="glo-item-acoes">
                    <button class="btn btn-secondary btn-sm" data-glo="editar">Editar</button>
                    <button class="btn btn-secondary btn-sm glo-apagar" data-glo="apagar" title="Apagar termo">🗑</button>
                </div>
            </div>`;
    }

    function bind() {
        const raiz = document.getElementById('cfg-conteudo');
        raiz.querySelector('#glo-novo').addEventListener('click', () => abrirForm(null));
        const busca = raiz.querySelector('#glo-busca');
        busca.addEventListener('input', () => {
            state.busca = busca.value;
            const l = filtrados();
            raiz.querySelector('#glo-lista').innerHTML = l.length ? l.map(item).join('') : '<div class="cfg-vazio">Nenhum termo encontrado.</div>';
        });
        raiz.querySelector('#glo-lista').addEventListener('click', ev => {
            const bt = ev.target.closest('[data-glo]');
            if (!bt) return;
            const termo = bt.closest('.glo-item').dataset.termo;
            const t = state.termos.find(x => x.termo === termo);
            if (!t) return;
            if (bt.dataset.glo === 'editar') abrirForm(t);
            else apagar(t);
        });
    }

    async function recarregar() {
        await carregar();
        document.getElementById('cfg-conteudo').innerHTML = render();
        bind();
    }

    function abrirForm(t) {
        const novo = !t;
        const m = document.createElement('div');
        m.className = 'glo-modal';
        m.innerHTML = `
            <div class="glo-modal-card" role="dialog" aria-modal="true" aria-labelledby="glo-tit">
                <h3 id="glo-tit">${novo ? 'Novo termo' : 'Editar termo'}</h3>
                <label>Termo marcado no texto
                    <input id="glo-termo" maxlength="60" value="${esc(t ? t.termo : '')}" ${novo ? '' : 'disabled'} placeholder="Ex.: ICV, Curva de aprendizagem">
                    <small>${novo ? 'Escreva como aparece no laudo. No texto fica {{Termo}}. Maiúsculas e minúsculas não importam.' : 'Para trocar o termo, apague e crie de novo.'}</small>
                </label>
                <label>Título do balão
                    <input id="glo-titulo" maxlength="120" value="${esc(t ? t.titulo : '')}" placeholder="Ex.: Índice de Compreensão Verbal">
                </label>
                <label>Explicação
                    <textarea id="glo-texto" rows="5" maxlength="800" placeholder="Linguagem simples: o paciente e a família vão ler.">${esc(t ? t.texto : '')}</textarea>
                    <small><span id="glo-conta">${(t ? t.texto : '').length}</span>/800 · escreva para quem não é da área</small>
                </label>
                <label class="glo-check"><input type="checkbox" id="glo-ativo" ${!t || t.ativo ? 'checked' : ''}> Ativo (aparece nos laudos)</label>
                <div id="glo-erro" class="cfg-erro" hidden></div>
                <div class="glo-modal-acoes">
                    <button class="btn btn-secondary" id="glo-cancelar">Cancelar</button>
                    <button class="btn btn-primary" id="glo-salvar">Salvar</button>
                </div>
            </div>`;
        document.body.appendChild(m);
        const $ = id => m.querySelector('#' + id);
        $('glo-texto').addEventListener('input', () => { $('glo-conta').textContent = $('glo-texto').value.length; });
        $('glo-cancelar').addEventListener('click', () => m.remove());
        m.addEventListener('click', ev => { if (ev.target === m) m.remove(); });
        (novo ? $('glo-termo') : $('glo-titulo')).focus();
        $('glo-salvar').addEventListener('click', async () => {
            const termo = (novo ? $('glo-termo').value : t.termo).trim().replace(/[{}|]/g, '');
            const titulo = $('glo-titulo').value.trim();
            const texto = $('glo-texto').value.trim();
            const erro = msg => { $('glo-erro').textContent = msg; $('glo-erro').hidden = false; };
            if (!termo || !titulo || !texto) return erro('Preencha termo, título e explicação.');
            if (novo && state.termos.some(x => x.termo.toLowerCase() === termo.toLowerCase())) return erro(`Já existe o termo "${termo}".`);
            const bt = $('glo-salvar'); bt.disabled = true; bt.textContent = 'Salvando…';
            const reg = { termo, titulo, texto, ativo: $('glo-ativo').checked, atualizado_por: window.cortexProfissional?.id || null, updated_at: new Date().toISOString() };
            const q = novo ? c().from('laudo_glossario').insert(reg) : c().from('laudo_glossario').update(reg).eq('termo', t.termo);
            const { error } = await q;
            if (error) {
                bt.disabled = false; bt.textContent = 'Salvar';
                return erro(/row-level security|permission/i.test(error.message || '') ? 'Só o admin clínico edita o glossário.' : (error.message || 'Erro ao salvar.'));
            }
            window.CortexAudit && window.CortexAudit.log(novo ? 'criacao' : 'edicao', 'laudo_glossario', null, { detalhes: { termo } });
            m.remove();
            toast(novo ? 'Termo criado.' : 'Termo atualizado.', 'success');
            await recarregar();
        });
    }

    function apagar(t) {
        const fazer = async () => {
            const { error } = await c().from('laudo_glossario').delete().eq('termo', t.termo);
            if (error) { toast('Não consegui apagar: ' + (error.message || ''), 'danger'); return; }
            window.CortexAudit && window.CortexAudit.log('delecao', 'laudo_glossario', null, { detalhes: { termo: t.termo } });
            toast('Termo apagado.', 'success');
            await recarregar();
        };
        if (window.CortexConfirm?.mostrar) {
            window.CortexConfirm.mostrar({
                icone: '🗑', titulo: `Apagar o termo "${t.termo}"?`,
                texto: 'Laudos em construção que usam este termo passam a mostrar "termo sem explicação". Laudos já finalizados não mudam. Se quiser só esconder, desmarque "Ativo".',
                btnSim: 'Sim, apagar', btnNao: 'Cancelar', btnSimDanger: true, onSim: fazer
            });
        } else if (window.confirm(`Apagar o termo "${t.termo}"?`)) fazer();
    }

    return { carregar, render, bind };
})();

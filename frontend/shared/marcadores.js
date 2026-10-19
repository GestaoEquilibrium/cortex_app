// ============================================================================
// CORTEX_APP — Marcadores do paciente (sprint_marcadores)
// ============================================================================
// Etiquetas coloridas de texto livre ao lado do nome do paciente — uma
// característica, uma hipótese, um lembrete ("Hipótese TEA", "Bilíngue",
// "Prioridade laudo"). Ficam na tabela paciente_marcadores (RLS: só vê quem
// vê o paciente; corretor/estagiário só leem).
//
// Onde aparecem:
//   - pacientes/pasta.html  → logo abaixo do nome, com botão de editar
//   - pacientes/lista.html  → nos cards e na lista (e entram na busca)
//
// API:
//   CortexMarcadores.CORES                         paleta { chave: {nome, cor, bg} }
//   CortexMarcadores.carregarTodos()               → Map(paciente_id → [marcadores])
//   CortexMarcadores.carregarDoPaciente(id)        → [marcadores]
//   CortexMarcadores.chips(lista, {tamanho})       → HTML das etiquetas
//   CortexMarcadores.abrirEditor(id, nome, lista, onMudou)  → modal
// ============================================================================

window.CortexMarcadores = (function () {
    'use strict';

    const TABELA = 'paciente_marcadores';
    const MAX_POR_PACIENTE = 6;
    const MAX_TEXTO = 40;

    const CORES = {
        azul:     { nome: 'Azul',     cor: '#2F6FED', bg: '#E8F0FE' },
        roxo:     { nome: 'Roxo',     cor: '#7C4DFF', bg: '#F1EBFF' },
        verde:    { nome: 'Verde',    cor: '#16A34A', bg: '#E7F7EC' },
        ambar:    { nome: 'Âmbar',    cor: '#D97706', bg: '#FEF3C7' },
        vermelho: { nome: 'Vermelho', cor: '#DC2626', bg: '#FDE8E8' },
        rosa:     { nome: 'Rosa',     cor: '#DB2777', bg: '#FCE7F3' },
        ciano:    { nome: 'Ciano',    cor: '#0891B2', bg: '#E0F7FA' },
        grafite:  { nome: 'Grafite',  cor: '#475569', bg: '#EEF2F6' }
    };
    const COR_PADRAO = 'azul';

    const c = () => window.cortexClient;
    const toast = (m, t) => (window.CortexUI && window.CortexUI.toast) ? window.CortexUI.toast(m, t) : null;

    function esc(t) {
        if (t === null || t === undefined) return '';
        const d = document.createElement('div');
        d.textContent = String(t);
        return d.innerHTML;
    }
    function corDe(chave) { return CORES[chave] || CORES[COR_PADRAO]; }

    function podeEditar() {
        return !window.CortexPerfil || !window.CortexPerfil.podeEditarPasta || window.CortexPerfil.podeEditarPasta();
    }

    // ── Dados ───────────────────────────────────────────────────────────────
    async function carregarTodos() {
        const mapa = new Map();
        try {
            const { data, error } = await c().from(TABELA)
                .select('id, paciente_id, texto, cor, created_at')
                .order('created_at', { ascending: true });
            if (error) throw error;
            (data || []).forEach(m => {
                if (!mapa.has(m.paciente_id)) mapa.set(m.paciente_id, []);
                mapa.get(m.paciente_id).push(m);
            });
        } catch (e) {
            // Tabela ainda não criada ou sem permissão: a tela segue sem marcadores
            console.warn('Marcadores indisponíveis:', e && e.message);
        }
        return mapa;
    }

    async function carregarDoPaciente(pacienteId) {
        try {
            const { data, error } = await c().from(TABELA)
                .select('id, paciente_id, texto, cor, created_at')
                .eq('paciente_id', pacienteId)
                .order('created_at', { ascending: true });
            if (error) throw error;
            return data || [];
        } catch (e) {
            console.warn('Marcadores indisponíveis:', e && e.message);
            return [];
        }
    }

    // ── Visual ──────────────────────────────────────────────────────────────
    function chips(lista, opts) {
        opts = opts || {};
        if (!lista || !lista.length) return '';
        const tam = opts.tamanho === 'md' ? 'cmk-md' : 'cmk-sm';
        return `<span class="cmk-lista">${lista.map(m => {
            const k = corDe(m.cor);
            return `<span class="cmk-chip ${tam}" style="--cmk-cor:${k.cor};--cmk-bg:${k.bg};" title="${esc(m.texto)}"><i></i>${esc(m.texto)}</span>`;
        }).join('')}</span>`;
    }

    function injetarEstilo() {
        if (document.getElementById('cmk-estilo')) return;
        const st = document.createElement('style');
        st.id = 'cmk-estilo';
        st.textContent = `
.cmk-lista{display:inline-flex;flex-wrap:wrap;gap:5px;align-items:center;vertical-align:middle;}
.cmk-chip{display:inline-flex;align-items:center;gap:5px;max-width:100%;border-radius:999px;font-family:Inter,system-ui,sans-serif;font-weight:700;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--cmk-cor);background:var(--cmk-bg);border:1px solid color-mix(in srgb,var(--cmk-cor) 32%,transparent);-webkit-text-fill-color:var(--cmk-cor);letter-spacing:0;transition:transform .15s,box-shadow .15s;}
.cmk-chip i{flex:0 0 auto;width:7px;height:7px;border-radius:50%;background:var(--cmk-cor);box-shadow:0 0 0 3px color-mix(in srgb,var(--cmk-cor) 18%,transparent);}
.cmk-sm{font-size:10.5px;padding:3px 9px 3px 7px;max-width:170px;}
.cmk-md{font-size:12px;padding:5px 12px 5px 9px;max-width:260px;}
.cmk-chip:hover{transform:translateY(-1px);box-shadow:0 3px 10px color-mix(in srgb,var(--cmk-cor) 25%,transparent);}
.cmk-faixa{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:-2px 0 12px;}
.cmk-faixa .cmk-chip{cursor:pointer;}
.cmk-add{display:inline-flex;align-items:center;gap:5px;border:1.5px dashed #a5b4fc;background:#f5f3ff;color:#5b21b6;border-radius:999px;font:700 11.5px/1.2 Inter,system-ui,sans-serif;padding:5px 12px;cursor:pointer;transition:all .15s;}
.cmk-add:hover{background:linear-gradient(135deg,#2F6FED,#7C4DFF);color:#fff;border-color:transparent;box-shadow:0 4px 12px rgba(124,77,255,.3);}
.paciente-card-marcadores{margin-top:6px;display:flex;}
.cmk-ov{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(15,23,42,.45);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);animation:cmkFade .18s ease;}
@keyframes cmkFade{from{opacity:0}to{opacity:1}}
@keyframes cmkSobe{from{opacity:0;transform:translateY(12px) scale(.98)}to{opacity:1;transform:none}}
.cmk-box{width:100%;max-width:480px;max-height:calc(100vh - 32px);overflow:auto;background:#fff;border-radius:18px;box-shadow:0 24px 60px rgba(15,23,42,.3);animation:cmkSobe .22s ease;font-family:Inter,system-ui,sans-serif;}
.cmk-topo{padding:18px 20px 14px;background:linear-gradient(135deg,#141F3C 0%,#2F6FED 60%,#7C4DFF 100%);color:#fff;border-radius:18px 18px 0 0;display:flex;align-items:flex-start;gap:12px;}
.cmk-topo h2{margin:0;font-size:17px;font-weight:800;letter-spacing:-.01em;}
.cmk-topo p{margin:3px 0 0;font-size:12.5px;opacity:.85;}
.cmk-fechar{margin-left:auto;background:rgba(255,255,255,.16);border:0;color:#fff;width:30px;height:30px;border-radius:10px;font-size:18px;cursor:pointer;flex:0 0 auto;}
.cmk-fechar:hover{background:rgba(255,255,255,.28);}
.cmk-corpo{padding:16px 20px 20px;}
.cmk-atuais{display:flex;flex-direction:column;gap:8px;margin-bottom:16px;}
.cmk-vazio{font-size:13px;color:#64748b;background:#f8fafc;border:1px dashed #cbd5e1;border-radius:12px;padding:12px 14px;text-align:center;}
.cmk-item{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:12px;background:#f8fafc;border:1px solid #e2e8f0;}
.cmk-item .cmk-chip{flex:1;min-width:0;max-width:none;}
.cmk-ico{border:0;background:transparent;width:30px;height:30px;border-radius:9px;cursor:pointer;font-size:14px;flex:0 0 auto;}
.cmk-ico:hover{background:#e2e8f0;}
.cmk-ico.del:hover{background:#fee2e2;}
.cmk-form{border-radius:14px;padding:14px;background:linear-gradient(135deg,#f5f3ff 0%,#eef4ff 100%);border:1.5px solid #c7d2fe;}
.cmk-form label{display:block;font-size:11.5px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:#4c1d95;margin:0 0 6px;}
.cmk-form input[type=text]{width:100%;box-sizing:border-box;padding:11px 13px;border-radius:11px;border:1.5px solid #c4b5fd;font:600 15px Inter,system-ui,sans-serif;color:#141F3C;outline:none;background:#fff;}
.cmk-form input[type=text]:focus{border-color:#7C4DFF;box-shadow:0 0 0 3px rgba(124,77,255,.18);}
.cmk-cont{font-size:11px;color:#94a3b8;text-align:right;margin-top:4px;}
.cmk-sugest{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0 2px;}
.cmk-sugest button{border:1px solid #c7d2fe;background:#fff;color:#3730a3;border-radius:999px;font:600 11.5px Inter,system-ui,sans-serif;padding:4px 10px;cursor:pointer;}
.cmk-sugest button:hover{background:#eef2ff;}
.cmk-cores{display:flex;flex-wrap:wrap;gap:8px;margin-top:4px;}
.cmk-cor{width:32px;height:32px;border-radius:50%;border:3px solid #fff;cursor:pointer;box-shadow:0 0 0 1.5px #cbd5e1;transition:transform .12s,box-shadow .12s;}
.cmk-cor:hover{transform:scale(1.1);}
.cmk-cor.ativo{box-shadow:0 0 0 2.5px #141F3C;transform:scale(1.12);}
.cmk-previa{margin-top:12px;display:flex;align-items:center;gap:8px;font-size:12px;color:#64748b;}
.cmk-acoes{display:flex;gap:8px;justify-content:flex-end;margin-top:14px;}
.cmk-btn{border:0;border-radius:11px;padding:10px 16px;font:700 13.5px Inter,system-ui,sans-serif;cursor:pointer;}
.cmk-btn.sec{background:#eef2f6;color:#334155;}
.cmk-btn.sec:hover{background:#e2e8f0;}
.cmk-btn.pri{background:linear-gradient(135deg,#2F6FED,#7C4DFF);color:#fff;box-shadow:0 6px 16px rgba(47,111,237,.3);}
.cmk-btn.pri:disabled{opacity:.45;cursor:not-allowed;box-shadow:none;}
.cmk-limite{font-size:12.5px;color:#92400e;background:#fef3c7;border:1px solid #fcd34d;border-radius:10px;padding:10px 12px;}
body.exportando .cmk-add{display:none!important;}
`;
        document.head.appendChild(st);
    }

    // ── Editor (modal) ──────────────────────────────────────────────────────
    const SUGESTOES = ['Hipótese TEA', 'Hipótese TDAH', 'Altas habilidades', 'Dislexia?', 'Prioridade', 'Bilíngue', 'Retorno'];

    function abrirEditor(pacienteId, nomePaciente, listaAtual, onMudou) {
        injetarEstilo();
        let lista = (listaAtual || []).slice();
        let editandoId = null;
        let corSel = COR_PADRAO;

        const ov = document.createElement('div');
        ov.className = 'cmk-ov';
        document.body.appendChild(ov);

        function fechar() { ov.remove(); document.removeEventListener('keydown', onEsc); }
        function onEsc(e) { if (e.key === 'Escape') fechar(); }
        document.addEventListener('keydown', onEsc);
        ov.addEventListener('mousedown', e => { if (e.target === ov) fechar(); });

        function render() {
            const editavel = podeEditar();
            const cheio = lista.length >= MAX_POR_PACIENTE && !editandoId;
            const atuais = lista.length
                ? lista.map(m => `
                    <div class="cmk-item">
                        ${chips([m], { tamanho: 'md' })}
                        ${editavel ? `<button class="cmk-ico" data-ed="${m.id}" title="Editar">✏️</button>
                        <button class="cmk-ico del" data-del="${m.id}" title="Remover">🗑️</button>` : ''}
                    </div>`).join('')
                : `<div class="cmk-vazio">Nenhum marcador ainda. Use para sinalizar uma característica ou hipótese que todo mundo deve ver ao abrir o paciente.</div>`;

            const edit = editandoId ? lista.find(m => m.id === editandoId) : null;
            const form = !editavel ? '' : cheio
                ? `<div class="cmk-limite">Limite de ${MAX_POR_PACIENTE} marcadores por paciente. Remova um para adicionar outro.</div>`
                : `<div class="cmk-form">
                    <label for="cmk-texto">${edit ? 'Editar marcador' : 'Novo marcador'}</label>
                    <input type="text" id="cmk-texto" maxlength="${MAX_TEXTO}" placeholder="Ex.: Hipótese TEA, sensível a barulho…" value="${esc(edit ? edit.texto : '')}" autocomplete="off">
                    <div class="cmk-cont" id="cmk-cont"></div>
                    ${edit ? '' : `<div class="cmk-sugest">${SUGESTOES.map(s => `<button type="button" data-sug="${esc(s)}">${esc(s)}</button>`).join('')}</div>`}
                    <label style="margin-top:12px;">Cor</label>
                    <div class="cmk-cores">${Object.entries(CORES).map(([k, v]) =>
                        `<button type="button" class="cmk-cor ${k === corSel ? 'ativo' : ''}" data-cor="${k}" title="${v.nome}" style="background:${v.cor};"></button>`).join('')}</div>
                    <div class="cmk-previa">Prévia: <span id="cmk-previa"></span></div>
                    <div class="cmk-acoes">
                        ${edit ? '<button type="button" class="cmk-btn sec" id="cmk-cancelar">Cancelar edição</button>' : ''}
                        <button type="button" class="cmk-btn pri" id="cmk-salvar" disabled>${edit ? 'Salvar alteração' : '+ Adicionar'}</button>
                    </div>
                </div>`;

            ov.innerHTML = `
                <div class="cmk-box" role="dialog" aria-modal="true" aria-label="Marcadores do paciente">
                    <div class="cmk-topo">
                        <div>
                            <h2>🏷️ Marcadores</h2>
                            <p>${esc(nomePaciente || 'Paciente')}</p>
                        </div>
                        <button class="cmk-fechar" id="cmk-fechar" aria-label="Fechar">×</button>
                    </div>
                    <div class="cmk-corpo">
                        <div class="cmk-atuais">${atuais}</div>
                        ${form}
                    </div>
                </div>`;

            ov.querySelector('#cmk-fechar').onclick = fechar;
            ov.querySelectorAll('[data-ed]').forEach(b => b.onclick = () => {
                const m = lista.find(x => x.id === b.dataset.ed);
                editandoId = m.id; corSel = CORES[m.cor] ? m.cor : COR_PADRAO; render();
            });
            ov.querySelectorAll('[data-del]').forEach(b => b.onclick = () => remover(b.dataset.del));

            const inp = ov.querySelector('#cmk-texto');
            if (!inp) return;
            const btn = ov.querySelector('#cmk-salvar');
            const atualizar = () => {
                const t = inp.value.trim();
                btn.disabled = !t;
                ov.querySelector('#cmk-cont').textContent = `${inp.value.length}/${MAX_TEXTO}`;
                ov.querySelector('#cmk-previa').innerHTML = t ? chips([{ texto: t, cor: corSel }], { tamanho: 'md' }) : '—';
            };
            inp.addEventListener('input', atualizar);
            inp.addEventListener('keydown', e => { if (e.key === 'Enter' && !btn.disabled) salvar(); });
            ov.querySelectorAll('[data-sug]').forEach(b => b.onclick = () => { inp.value = b.dataset.sug; atualizar(); inp.focus(); });
            ov.querySelectorAll('[data-cor]').forEach(b => b.onclick = () => {
                corSel = b.dataset.cor;
                ov.querySelectorAll('[data-cor]').forEach(x => x.classList.toggle('ativo', x === b));
                atualizar();
            });
            const canc = ov.querySelector('#cmk-cancelar');
            if (canc) canc.onclick = () => { editandoId = null; corSel = COR_PADRAO; render(); };
            btn.onclick = salvar;
            atualizar();
            setTimeout(() => inp.focus(), 30);
        }

        async function salvar() {
            const inp = ov.querySelector('#cmk-texto');
            const texto = (inp.value || '').trim().slice(0, MAX_TEXTO);
            if (!texto) return;
            const btn = ov.querySelector('#cmk-salvar');
            btn.disabled = true;
            try {
                if (editandoId) {
                    const { data, error } = await c().from(TABELA)
                        .update({ texto, cor: corSel, updated_at: new Date().toISOString() })
                        .eq('id', editandoId).select('id, paciente_id, texto, cor, created_at').single();
                    if (error) throw error;
                    lista = lista.map(m => m.id === editandoId ? data : m);
                    try { await window.CortexAudit?.log('edicao', TABELA, data.id, { pacienteId }); } catch (_) {}
                    toast('Marcador atualizado', 'success');
                } else {
                    const { data, error } = await c().from(TABELA)
                        .insert({ paciente_id: pacienteId, texto, cor: corSel })
                        .select('id, paciente_id, texto, cor, created_at').single();
                    if (error) throw error;
                    lista.push(data);
                    try { await window.CortexAudit?.log('criacao', TABELA, data.id, { pacienteId }); } catch (_) {}
                    toast('Marcador adicionado', 'success');
                }
                editandoId = null; corSel = COR_PADRAO;
                render();
                if (onMudou) onMudou(lista.slice());
            } catch (e) {
                console.error(e);
                toast('Não foi possível salvar: ' + (e.message || e), 'danger');
                btn.disabled = false;
            }
        }

        async function remover(id) {
            const m = lista.find(x => x.id === id);
            if (!m) return;
            const executar = async () => {
                try {
                    const { error } = await c().from(TABELA).delete().eq('id', id);
                    if (error) throw error;
                    lista = lista.filter(x => x.id !== id);
                    if (editandoId === id) editandoId = null;
                    try { await window.CortexAudit?.log('delecao', TABELA, id, { pacienteId }); } catch (_) {}
                    toast('Marcador removido', 'success');
                    render();
                    if (onMudou) onMudou(lista.slice());
                } catch (e) {
                    console.error(e);
                    toast('Não foi possível remover: ' + (e.message || e), 'danger');
                }
            };
            if (window.CortexConfirm && window.CortexConfirm.mostrar) {
                await window.CortexConfirm.mostrar({
                    icone: '🏷️', titulo: 'Remover este marcador?',
                    texto: `"${m.texto}" deixa de aparecer no nome do paciente.`,
                    btnSim: 'Sim, remover', btnNao: 'Cancelar', btnSimDanger: true, onSim: executar
                });
            } else if (window.confirm(`Remover o marcador "${m.texto}"?`)) {
                await executar();
            }
        }

        render();
    }

    injetarEstilo();

    return { CORES, MAX_POR_PACIENTE, carregarTodos, carregarDoPaciente, chips, abrirEditor, podeEditar, injetarEstilo };
})();

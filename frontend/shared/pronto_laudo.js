// ============================================================================
// CORTEX_APP — Pronto para laudo
// ----------------------------------------------------------------------------
// O aplicador avisa que terminou: "Pronto para laudo". A coordenação (admin
// clínico e admin gestor) recebe aviso na tela e vê a lista no Dashboard,
// com quem marcou e quando. Depois: "Vou fazer o laudo" → "Laudo feito".
// Regras e avisos ficam no banco (laudo_pronto_marcar / laudo_pronto_acao).
//
// Na tela: <div class="pl-slot" data-pl="<paciente>" data-nome="..." data-pend="N">
//          + CortexProntoLaudo.montarSlots()
//          Dashboard: CortexProntoLaudo.painelDashboard(elemento)
// ============================================================================
window.CortexProntoLaudo = (function () {
    'use strict';

    const c = () => window.cortexClient;
    const cache = new Map();   // paciente -> estado (null = não marcado)
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, ch =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    const toast = (m, t) => window.CortexUI && window.CortexUI.toast(m, t || 'info');
    const perfil = () => (window.cortexProfissional && window.cortexProfissional.perfil) || '';
    const euId = () => (window.cortexProfissional && window.cortexProfissional.id) || null;
    const ehAdmin = () => ['admin_clinico', 'admin_gestor'].includes(perfil());
    const podeMarcar = () => ['admin_clinico', 'admin_gestor', 'neuropsicologo_aplicador', 'estagiario', 'corretor'].includes(perfil());
    const quando = (iso) => iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', ' às') : '';
    const primeiro = (n) => String(n || '').trim().split(/\s+/)[0] || '';
    function raiz() {
        const p = window.location.pathname, i = p.indexOf('/frontend/');
        return i >= 0 ? p.substring(0, i + '/frontend/'.length) : '/';
    }

    function estilos() {
        if (document.getElementById('pl-css')) return;
        const st = document.createElement('style');
        st.id = 'pl-css';
        st.textContent = `
            .pl-faixa{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin:0 0 16px;padding:12px 16px;border-radius:16px;border:1px solid}
            .pl-faixa .pl-ic{width:38px;height:38px;border-radius:12px;display:grid;place-items:center;font-size:19px;flex-shrink:0}
            .pl-faixa .pl-txt{flex:1;min-width:220px;line-height:1.45}
            .pl-faixa .pl-txt strong{display:block;font-size:14.5px}
            .pl-faixa .pl-txt span{display:block;font-size:12.8px;opacity:.9}
            .pl-faixa .pl-obs{margin-top:4px;font-style:italic}
            .pl-faixa .pl-acoes{display:flex;gap:8px;flex-wrap:wrap}
            .pl-b{border:none;border-radius:10px;padding:8px 12px;font:inherit;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap}
            .pl-b.prim{color:#fff;background:linear-gradient(135deg,#16A34A,#22C55E);box-shadow:0 6px 14px rgba(22,163,74,.25)}
            .pl-b.azul{color:#fff;background:linear-gradient(135deg,#22346B,#2F6FED)}
            .pl-b.sec{background:#fff;color:#334155;border:1px solid #E2E8F0}
            .pl-b.sec:hover{border-color:#94A3B8}
            .pl-b:disabled{opacity:.55;cursor:default}
            .pl-cta{background:#F8FAFC;border-color:#E2E8F0;color:#334155}
            .pl-cta .pl-ic{background:#ECFDF5}
            .pl-pronto{background:#ECFDF5;border-color:#A7F3D0;color:#14532D}
            .pl-pronto .pl-ic{background:#fff}
            .pl-em{background:#EEF4FF;border-color:#C7D7FE;color:#1E3A8A}
            .pl-em .pl-ic{background:#fff}
            .pl-feito{background:#F1F5F9;border-color:#E2E8F0;color:#475569}
            .pl-feito .pl-ic{background:#fff}
            .pl-aviso-pend{background:#FFFBEB;border:1px solid #FDE68A;color:#92400E;border-radius:12px;padding:10px 12px;font-size:13px;margin-bottom:12px}
            .pl-lista{display:grid;gap:8px}
            .pl-item{display:flex;align-items:center;gap:10px;padding:10px;border-radius:14px;border:1px solid #E2E8F0;background:#fff}
            .pl-item.em{border-color:#C7D7FE;background:#F8FAFF}
            .pl-av{width:36px;height:36px;border-radius:50%;display:grid;place-items:center;font-weight:800;font-size:13px;flex-shrink:0;background:#ECFDF5;color:#15803D}
            .pl-item.em .pl-av{background:#E8F0FE;color:#1D4ED8}
            .pl-item-info{flex:1;min-width:0}
            .pl-item-info a{display:block;font-weight:700;font-size:13.5px;color:#14213A;text-decoration:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
            .pl-item-info a:hover{color:#2F6FED}
            .pl-item-info small{display:block;font-size:11.8px;color:#64748B;line-height:1.35}
            .pl-item .pl-b{padding:6px 9px;font-size:12px}
            .pl-vazio{font-size:13px;color:#64748B;padding:8px 0}
            .pl-conta{display:inline-grid;place-items:center;min-width:22px;height:22px;padding:0 6px;border-radius:99px;background:#16A34A;color:#fff;font-size:12px;font-weight:800;margin-left:6px}
        `;
        document.head.appendChild(st);
    }

    const SELECT = 'paciente_id, status, marcado_em, observacao, pendentes, assumido_em, feito_em, marcado_por, assumido_por, feito_por, ' +
        'marcador:profissionais!prontos_laudo_marcado_por_fkey(nome_completo), ' +
        'assumidor:profissionais!prontos_laudo_assumido_por_fkey(nome_completo), ' +
        'fez:profissionais!prontos_laudo_feito_por_fkey(nome_completo)';

    async function estado(pacienteId, forcar) {
        if (!forcar && cache.has(pacienteId)) return cache.get(pacienteId);
        const { data, error } = await c().from('prontos_laudo').select(SELECT).eq('paciente_id', pacienteId).maybeSingle();
        if (error) { console.warn('[pronto-laudo]', error.message); return null; }
        cache.set(pacienteId, data || null);
        return data || null;
    }

    // nome de quem marcou (o aplicador nem sempre pode ler o cadastro dos outros)
    function nomeDe(id, obj) {
        if (id && id === euId()) return 'você';
        return primeiro(obj && obj.nome_completo) || 'equipe';
    }

    function htmlFaixa(e, pend) {
        if (!e) {
            if (!podeMarcar()) return '';
            return `
                <div class="pl-faixa pl-cta">
                    <div class="pl-ic">🏁</div>
                    <div class="pl-txt"><strong>Terminou a aplicação?</strong><span>Marque como pronto para laudo e a coordenação recebe o aviso.</span></div>
                    <div class="pl-acoes"><button class="pl-b prim" data-pl-acao="marcar">✅ Pronto para laudo</button></div>
                </div>`;
        }
        const obs = e.observacao ? `<span class="pl-obs">“${esc(e.observacao)}”</span>` : '';
        const marcou = `${esc(nomeDe(e.marcado_por, e.marcador))} em ${esc(quando(e.marcado_em))}`;
        if (e.status === 'pronto') {
            const souMarcador = e.marcado_por && e.marcado_por === euId();
            return `
                <div class="pl-faixa pl-pronto">
                    <div class="pl-ic">📝</div>
                    <div class="pl-txt"><strong>Pronto para laudo</strong><span>Marcado por ${marcou}${e.pendentes > 0 ? ` · ${e.pendentes} teste(s) ainda em aberto naquele momento` : ''}</span>${obs}</div>
                    <div class="pl-acoes">
                        ${ehAdmin() ? `<button class="pl-b azul" data-pl-acao="assumir">✍️ Vou fazer o laudo</button><button class="pl-b prim" data-pl-acao="feito">✓ Laudo feito</button>` : ''}
                        ${(ehAdmin() || souMarcador) ? `<button class="pl-b sec" data-pl-acao="desmarcar">Desmarcar</button>` : ''}
                    </div>
                </div>`;
        }
        if (e.status === 'em_laudo') {
            return `
                <div class="pl-faixa pl-em">
                    <div class="pl-ic">✍️</div>
                    <div class="pl-txt"><strong>Laudo em andamento com ${esc(nomeDe(e.assumido_por, e.assumidor))}</strong><span>Desde ${esc(quando(e.assumido_em))} · pronto para laudo marcado por ${marcou}</span>${obs}</div>
                    <div class="pl-acoes">
                        ${ehAdmin() ? `<button class="pl-b prim" data-pl-acao="feito">✓ Laudo feito</button><button class="pl-b sec" data-pl-acao="voltar">Voltar para pronto</button>` : ''}
                    </div>
                </div>`;
        }
        return `
            <div class="pl-faixa pl-feito">
                <div class="pl-ic">✅</div>
                <div class="pl-txt"><strong>Laudo feito por ${esc(nomeDe(e.feito_por, e.fez))}</strong><span>Em ${esc(quando(e.feito_em))} · pronto para laudo marcado por ${marcou}</span></div>
                <div class="pl-acoes">
                    ${podeMarcar() ? `<button class="pl-b sec" data-pl-acao="marcar">Marcar pronto de novo</button>` : ''}
                    ${ehAdmin() ? `<button class="pl-b sec" data-pl-acao="desmarcar">Tirar da lista</button>` : ''}
                </div>
            </div>`;
    }

    async function montar(slot) {
        estilos();
        const pid = slot.dataset.pl;
        if (!pid) return;
        const pend = parseInt(slot.dataset.pend || '0', 10) || 0;
        const desenhar = (e) => {
            slot.innerHTML = htmlFaixa(e, pend);
            slot.querySelectorAll('[data-pl-acao]').forEach(b => b.addEventListener('click', () =>
                agir(b.dataset.plAcao, pid, slot.dataset.nome || '', pend, () => montar(slot), b)));
        };
        if (cache.has(pid)) desenhar(cache.get(pid));
        else desenhar(await estado(pid));
    }

    function montarSlots(raizEl) {
        if (perfil() === 'profissional_externo') return;
        (raizEl || document).querySelectorAll('.pl-slot').forEach(s => montar(s));
    }

    async function agir(acao, pid, nome, pend, depois, botao) {
        if (acao === 'marcar') return marcar(pid, nome, pend, depois);
        if (acao === 'desmarcar') {
            const sim = window.CortexPop && window.CortexPop.confirmar
                ? await window.CortexPop.confirmar({ titulo: 'Tirar de “pronto para laudo”?', texto: 'O paciente sai da lista da coordenação.', labelOk: 'Tirar' })
                : confirm('Tirar este paciente da lista de pronto para laudo?');
            if (!sim) return;
        }
        if (botao) botao.disabled = true;
        const { data, error } = await c().rpc('laudo_pronto_acao', { p_paciente: pid, p_acao: acao });
        if (botao) botao.disabled = false;
        if (error || !data || !data.ok) { toast('Não deu: ' + ((error && error.message) || (data && data.erro) || ''), 'danger'); return; }
        toast({ assumir: 'Laudo com você agora.', feito: 'Marcado como laudo feito.', desmarcar: 'Saiu da lista.', voltar: 'Voltou para pronto.' }[acao] || 'Feito.', 'success');
        await estado(pid, true);
        if (depois) depois();
    }

    function marcar(pid, nome, pend, depois) {
        estilos();
        const enviar = async (obs) => {
            const { data, error } = await c().rpc('laudo_pronto_marcar', { p_paciente: pid, p_obs: obs || null });
            if (error || !data || !data.ok) { toast('Não deu para marcar: ' + ((error && error.message) || (data && data.erro) || ''), 'danger'); return false; }
            try { window.CortexAudit && window.CortexAudit.log('edicao', 'prontos_laudo', null, { pacienteId: pid, detalhes: { operacao: 'pronto_para_laudo' } }); } catch (e) {}
            toast('Pronto para laudo. A coordenação foi avisada.', 'success');
            await estado(pid, true);
            if (depois) depois();
            return true;
        };
        if (!window.CortexPop) return enviar(null);
        window.CortexPop.abrir({
            titulo: 'Pronto para laudo',
            subtitulo: nome,
            tone: 'green',
            tamanho: 'sm',
            html: `
                ${pend > 0 ? `<div class="pl-aviso-pend">⚠️ Ainda há <b>${pend}</b> teste(s) em aberto na bateria. Se estiver tudo certo assim, pode marcar.</div>` : ''}
                <p style="margin:0 0 10px;font-size:14px;color:#334155">A coordenação recebe um aviso na tela e o paciente entra na lista de “Prontos para laudo”.</p>
                <label style="display:block;font-size:12.5px;font-weight:700;color:#475569;margin-bottom:6px" for="pl-obs">Observação (opcional)</label>
                <textarea id="pl-obs" rows="3" maxlength="600" style="width:100%;padding:9px 11px;border:1px solid #E2E8F0;border-radius:10px;font:inherit;font-size:14px"
                    placeholder="Ex.: FDT não aplicado, paciente cansou. Escola ainda não respondeu."></textarea>`,
            rodape: [{ label: 'Cancelar', classe: 'btn-secondary' },
                     { label: '✅ Marcar pronto para laudo', classe: 'btn-primary', fechar: false, onClick: async (j) => {
                         const ok = await enviar((j.corpo.querySelector('#pl-obs') || {}).value || '');
                         if (ok) j.fecharJanela();
                         return false;
                     } }]
        });
    }

    // ── Dashboard: lista da coordenação ──────────────────────────────────
    async function painelDashboard(el) {
        if (!el || !ehAdmin()) { if (el) el.innerHTML = ''; return; }
        estilos();
        const { data, error } = await c().from('prontos_laudo')
            .select(SELECT + ', paciente:pacientes!prontos_laudo_paciente_id_fkey(id, nome_completo)')
            .in('status', ['pronto', 'em_laudo'])
            .order('marcado_em', { ascending: true });
        if (error) { console.warn('[pronto-laudo] lista:', error.message); el.innerHTML = ''; return; }
        const lista = data || [];
        lista.forEach(e => cache.set(e.paciente_id, e));
        el.innerHTML = `
            <div class="dash-bloco-header">
                <h3>📝 Prontos para laudo${lista.length ? `<span class="pl-conta">${lista.length}</span>` : ''}</h3>
            </div>
            ${lista.length ? `<div class="pl-lista">${lista.map(e => {
                const nome = (e.paciente && e.paciente.nome_completo) || 'Paciente';
                const ini = nome.trim().split(/\s+/).map(x => x[0]).filter(Boolean);
                const sub = e.status === 'em_laudo'
                    ? `✍️ com ${esc(nomeDe(e.assumido_por, e.assumidor))} · pronto desde ${esc(quando(e.marcado_em))}`
                    : `por ${esc(nomeDe(e.marcado_por, e.marcador))} · ${esc(quando(e.marcado_em))}${e.pendentes > 0 ? ` · ${e.pendentes} em aberto` : ''}`;
                return `
                <div class="pl-item ${e.status === 'em_laudo' ? 'em' : ''}" data-pid="${e.paciente_id}">
                    <div class="pl-av">${esc(((ini[0] || '') + (ini.length > 1 ? ini[ini.length - 1] : '')).toUpperCase())}</div>
                    <div class="pl-item-info">
                        <a href="${raiz()}pacientes/pasta.html?id=${e.paciente_id}" title="${esc(e.observacao || 'Abrir pasta')}">${esc(nome)}</a>
                        <small>${sub}</small>
                    </div>
                    ${e.status === 'pronto'
                        ? `<button class="pl-b azul" data-pl-acao="assumir" title="Vou fazer o laudo">✍️</button>`
                        : `<button class="pl-b prim" data-pl-acao="feito" title="Laudo feito">✓</button>`}
                </div>`;
            }).join('')}</div>` : '<div class="pl-vazio">Nenhum paciente esperando laudo.</div>'}
            <div style="height:16px"></div>`;
        el.querySelectorAll('.pl-item [data-pl-acao]').forEach(b => {
            const pid = b.closest('.pl-item').dataset.pid;
            b.addEventListener('click', () => agir(b.dataset.plAcao, pid, '', 0, () => painelDashboard(el), b));
        });
    }

    return { estado, montar, montarSlots, marcar, painelDashboard, podeMarcar };
})();

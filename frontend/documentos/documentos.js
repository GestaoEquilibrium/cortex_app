// ============================================================================
// CORTEX_APP — documentos.js
// ----------------------------------------------------------------------------
// Aba "Documentos" do prontuário: anexos gerais em PDF.
//
// Laudo e relatório escolar continuam nas telas próprias — aqui vai o resto:
// encaminhamento médico, exame, relatório de outro profissional, termo
// assinado, receita, documento pessoal.
//
// Anexar e apagar: só admin (clínico e gestor). Ver: quem tem vínculo com o
// paciente. Isso é decidido pelas policies, não aqui — a tela apenas esconde
// o que o banco recusaria.
//
// Cuidado no upload: a política de leitura do bucket descobre o dono do
// arquivo consultando documentos_paciente. Se o arquivo subir e o INSERT
// falhar, o arquivo fica órfão e invisível para todos — por isso, se o
// INSERT falhar, apagamos o arquivo antes de reportar o erro.
//
// API: window.CortexDocumentos
//   .render(pacienteId)  -> HTML da aba
//   .carregar(pacienteId)
// ============================================================================

window.CortexDocumentos = (function () {
    'use strict';

    const BUCKET = 'documentos-paciente';
    const MAX_MB = 20;

    const CATEGORIAS = {
        encaminhamento:    { nome: 'Encaminhamento',        ic: '📨', cor: '#2F6FED' },
        exame:             { nome: 'Exame',                 ic: '🔬', cor: '#06B6D4' },
        relatorio_externo: { nome: 'Relatório externo',     ic: '📄', cor: '#7C4DFF' },
        termo:             { nome: 'Termo assinado',        ic: '✍️', cor: '#22C55E' },
        receita:           { nome: 'Receita',               ic: '💊', cor: '#EC4899' },
        documento_pessoal: { nome: 'Documento pessoal',     ic: '🪪', cor: '#F59E0B' },
        outro:             { nome: 'Outro',                 ic: '📎', cor: '#64748B' }
    };

    let ctx = { pacienteId: null, itens: [], carregando: false, erro: null };

    const c = () => window.cortexClient;
    const esc = (t) => { const d = document.createElement('div'); d.textContent = t ?? ''; return d.innerHTML; };
    const toast = (m, t) => { if (window.CortexUI?.toast) window.CortexUI.toast(m, t); };

    const ehAdmin = () => {
        const p = window.cortexProfissional?.perfil;
        return p === 'admin_clinico' || p === 'admin_gestor';
    };

    function dataHora(iso) {
        if (!iso) return '—';
        const d = new Date(iso);
        return isNaN(d) ? '—' : d.toLocaleDateString('pt-BR') + ' às ' +
            d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }

    function tamanho(bytes) {
        if (!bytes) return '';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
        return (bytes / 1024 / 1024).toFixed(1) + ' MB';
    }

    // ── Carga ───────────────────────────────────────────────────────────────

    async function carregar(pacienteId) {
        ctx.pacienteId = pacienteId;
        ctx.carregando = true;
        ctx.erro = null;

        try {
            const { data, error } = await c()
                .from('documentos_paciente')
                .select('*, autor:created_by(nome_completo)')
                .eq('paciente_id', pacienteId)
                .eq('ativo', true)
                .order('created_at', { ascending: false });
            if (error) throw error;
            ctx.itens = data || [];
        } catch (err) {
            console.error('[documentos] carregar:', err);
            ctx.erro = err.message || String(err);
        } finally {
            ctx.carregando = false;
        }
        pintar();
    }

    // ── Render ──────────────────────────────────────────────────────────────

    function render(pacienteId) {
        setTimeout(() => carregar(pacienteId), 0);
        return `
            <div class="etapa-content">
                <div class="doc-topo">
                    <div>
                        <h3 class="doc-titulo">Documentos</h3>
                        <p class="doc-sub">
                            Encaminhamentos, exames, relatórios de outros profissionais e termos.
                            Laudos ficam na aba Laudo.
                        </p>
                    </div>
                    ${ehAdmin() ? `
                    <button class="btn btn-primary btn-sm" id="doc-btn-anexar">📎 Anexar documento</button>
                    <input type="file" id="doc-file" accept="application/pdf" style="display:none">` : ''}
                </div>
                <div id="doc-lista">
                    <div class="doc-carregando"><div class="doc-spin"></div> Carregando…</div>
                </div>
            </div>`;
    }

    function pintar() {
        const alvo = document.getElementById('doc-lista');
        if (!alvo) return;

        if (ctx.erro) {
            alvo.innerHTML = `<div class="doc-vazio"><div class="doc-vazio-ic">⚠️</div>
                <strong>Não foi possível carregar</strong>${esc(ctx.erro)}</div>`;
            return;
        }

        if (!ctx.itens.length) {
            alvo.innerHTML = `<div class="doc-vazio">
                <div class="doc-vazio-ic">📎</div>
                <strong>Nenhum documento anexado</strong>
                ${ehAdmin()
                    ? 'Use o botão acima para anexar um PDF.'
                    : 'Somente a administração pode anexar documentos.'}</div>`;
            ligarBotoes();
            return;
        }

        alvo.innerHTML = `<div class="doc-grid">${ctx.itens.map(cardHtml).join('')}</div>`;
        ligarBotoes();
    }

    function cardHtml(d) {
        const cat = CATEGORIAS[d.categoria] || CATEGORIAS.outro;
        return `
            <div class="doc-card" data-id="${d.id}" style="--c:${cat.cor}">
                <div class="doc-card-ic">${cat.ic}</div>
                <div class="doc-card-corpo">
                    <div class="doc-card-titulo">${esc(d.titulo)}</div>
                    <div class="doc-card-cat">${esc(cat.nome)}</div>
                    ${d.observacao ? `<div class="doc-card-obs">${esc(d.observacao)}</div>` : ''}
                    <div class="doc-card-meta">
                        <span>${esc(d.autor?.nome_completo || '—')}</span>
                        <span>${dataHora(d.created_at)}</span>
                        ${d.arquivo_tamanho_bytes ? `<span>${tamanho(d.arquivo_tamanho_bytes)}</span>` : ''}
                    </div>
                </div>
                <div class="doc-card-acoes">
                    <button class="doc-mini" data-ver="${d.id}" title="Ver">👁</button>
                    <button class="doc-mini" data-baixar="${d.id}" title="Baixar">⬇</button>
                    ${ehAdmin() ? `<button class="doc-mini perigo" data-apagar="${d.id}" title="Apagar">🗑</button>` : ''}
                </div>
            </div>`;
    }

    function ligarBotoes() {
        const btn = document.getElementById('doc-btn-anexar');
        const inp = document.getElementById('doc-file');
        if (btn && inp) {
            btn.onclick = () => inp.click();
            inp.onchange = escolherArquivo;
        }
        document.querySelectorAll('[data-ver]').forEach(b =>
            b.addEventListener('click', () => abrir(b.dataset.ver, false)));
        document.querySelectorAll('[data-baixar]').forEach(b =>
            b.addEventListener('click', () => abrir(b.dataset.baixar, true)));
        document.querySelectorAll('[data-apagar]').forEach(b =>
            b.addEventListener('click', () => apagar(b.dataset.apagar)));
    }

    // ── Upload ──────────────────────────────────────────────────────────────

    function escolherArquivo(ev) {
        const file = ev.target.files[0];
        ev.target.value = '';
        if (!file) return;

        if (file.type !== 'application/pdf') {
            toast('Apenas arquivos PDF são aceitos.', 'danger');
            return;
        }
        if (file.size > MAX_MB * 1024 * 1024) {
            toast(`Arquivo muito grande. Máximo: ${MAX_MB}MB.`, 'danger');
            return;
        }

        const sugestao = file.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim();

        window.CortexPop.abrir({
            titulo: 'Anexar documento',
            subtitulo: file.name,
            tone: 'blue',
            tamanho: 'sm',
            persistente: true,
            html: `
                <div class="doc-campo">
                    <label>Título *</label>
                    <input id="doc-titulo" value="${esc(sugestao)}" placeholder="Como este documento será identificado">
                </div>
                <div class="doc-campo">
                    <label>Tipo</label>
                    <select id="doc-categoria">
                        ${Object.entries(CATEGORIAS).map(([k, v]) =>
                            `<option value="${k}" ${k === 'outro' ? 'selected' : ''}>${v.ic} ${esc(v.nome)}</option>`).join('')}
                    </select>
                </div>
                <div class="doc-campo">
                    <label>Observação <span style="font-weight:400;text-transform:none">(opcional)</span></label>
                    <textarea id="doc-obs" rows="3" placeholder="De onde veio, para que serve"></textarea>
                </div>
                <div class="doc-hint">${esc(file.name)} · ${tamanho(file.size)}</div>`,
            rodape: [
                { label: 'Cancelar', classe: 'btn-secondary' },
                { label: 'Anexar', classe: 'btn-primary', fechar: false,
                  onClick: (j) => enviar(file, j) }
            ]
        });
    }

    async function enviar(file, janela) {
        const titulo = janela.corpo.querySelector('#doc-titulo').value.trim();
        if (!titulo) { toast('Informe um título.', 'danger'); return false; }

        const categoria = janela.corpo.querySelector('#doc-categoria').value;
        const obs = janela.corpo.querySelector('#doc-obs').value.trim();

        const path = `${ctx.pacienteId}/${Date.now()}.pdf`;

        try {
            const { error: errUp } = await c().storage
                .from(BUCKET)
                .upload(path, file, { contentType: 'application/pdf', upsert: false });
            if (errUp) throw errUp;

            const { data: { user } } = await c().auth.getUser();
            const { data: novo, error: errIns } = await c()
                .from('documentos_paciente')
                .insert({
                    paciente_id: ctx.pacienteId,
                    titulo: titulo,
                    categoria: categoria,
                    observacao: obs || null,
                    arquivo_path: path,
                    arquivo_nome_original: file.name,
                    arquivo_tamanho_bytes: file.size,
                    created_by: window.cortexProfissional?.id || null
                })
                .select('id')
                .single();

            if (errIns) {
                // Sem a linha na tabela, a policy do bucket não acha o dono
                // e o arquivo fica invisível para todos. Melhor remover.
                await c().storage.from(BUCKET).remove([path]).catch(() => {});
                throw errIns;
            }

            if (window.CortexAudit) {
                window.CortexAudit.log('criacao', 'documentos_paciente', novo.id, {
                    pacienteId: ctx.pacienteId,
                    detalhes: { operacao: 'anexar_documento', titulo, categoria,
                                arquivo: file.name, tamanho: file.size }
                });
            }

            janela.fecharJanela();
            toast('Documento anexado.', 'success');
            await carregar(ctx.pacienteId);
            return true;
        } catch (err) {
            console.error('[documentos] enviar:', err);
            toast('Erro ao anexar: ' + (err.message || ''), 'danger');
            return false;
        }
    }

    // ── Abrir e baixar ──────────────────────────────────────────────────────

    async function abrir(id, baixar) {
        const d = ctx.itens.find(x => x.id === id);
        if (!d) return;

        try {
            const { data, error } = await c().storage
                .from(BUCKET)
                .createSignedUrl(d.arquivo_path, 600);
            if (error || !data?.signedUrl) throw error || new Error('URL não gerada');

            if (window.CortexAudit) {
                window.CortexAudit.log('leitura', 'documentos_paciente', d.id, {
                    pacienteId: ctx.pacienteId,
                    detalhes: { operacao: baixar ? 'baixar_documento' : 'ver_documento',
                                titulo: d.titulo }
                });
            }

            if (baixar) {
                const a = document.createElement('a');
                a.href = data.signedUrl;
                a.download = d.arquivo_nome_original || (d.titulo + '.pdf');
                a.rel = 'noopener';
                document.body.appendChild(a); a.click(); a.remove();
                return;
            }

            if (window.CortexPrevia) {
                window.CortexPrevia.arquivo({
                    bucket: BUCKET,
                    path: d.arquivo_path,
                    nome: d.arquivo_nome_original || (d.titulo + '.pdf'),
                    titulo: d.titulo,
                    subtitulo: (CATEGORIAS[d.categoria] || CATEGORIAS.outro).nome
                });
            } else {
                window.open(data.signedUrl, '_blank', 'noopener');
            }
        } catch (err) {
            console.error('[documentos] abrir:', err);
            toast('Erro ao abrir: ' + (err.message || ''), 'danger');
        }
    }

    // ── Apagar ──────────────────────────────────────────────────────────────

    function apagar(id) {
        const d = ctx.itens.find(x => x.id === id);
        if (!d) return;

        window.CortexConfirm.mostrar({
            icone: '🗑️',
            titulo: `Apagar “${d.titulo}”?`,
            texto: 'O arquivo é removido em definitivo. A auditoria guarda o registro de quem apagou.',
            btnSim: 'Sim, apagar', btnNao: 'Cancelar', btnSimDanger: true,
            onSim: async () => {
                try {
                    if (window.CortexAudit) {
                        window.CortexAudit.log('delecao', 'documentos_paciente', d.id, {
                            pacienteId: ctx.pacienteId,
                            detalhes: { operacao: 'apagar_documento', titulo: d.titulo,
                                        categoria: d.categoria,
                                        arquivo: d.arquivo_nome_original,
                                        anexado_em: d.created_at }
                        });
                    }

                    const { error } = await c().from('documentos_paciente').delete().eq('id', d.id);
                    if (error) throw error;

                    // Arquivo depois do registro: se a remoção falhar, sobra
                    // arquivo órfão — ruim, mas melhor que registro apontando
                    // para arquivo inexistente.
                    await c().storage.from(BUCKET).remove([d.arquivo_path]).catch(
                        e => console.warn('[documentos] arquivo não removido:', e));

                    toast('Documento apagado.', 'success');
                    await carregar(ctx.pacienteId);
                } catch (err) {
                    console.error('[documentos] apagar:', err);
                    toast('Erro ao apagar: ' + (err.message || ''), 'danger');
                }
            }
        });
    }

    return { render, carregar, CATEGORIAS };
})();

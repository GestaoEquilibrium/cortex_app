// ============================================================================
// CORTEX_APP — Configurações
// ============================================================================
// Abas:
//   1. Meu Perfil — edita dados próprios (nome, CRP, telefone, formação, etc)
//   2. Convênios — lista, criar, editar, ativar/desativar
// ============================================================================

(function () {
    'use strict';

    const state = {
        profissional: null,
        convenios: [],
        profissionaisLista: [],
        abaAtiva: 'perfil',
        ehAdmin: false,
        fotoSignedUrl: null,
        assinaturaSignedUrl: null,
    };

    window.addEventListener('cortex:auth-ready', async () => {
        await CortexSidebar.render('configuracoes');

        state.profissional = window.cortexProfissional;
        const perfil = state.profissional?.perfil;
        state.ehAdmin = (perfil === 'admin_clinico' || perfil === 'admin_gestor');

        // Mostra aba Profissionais só pra admin
        if (state.ehAdmin) {
            const tab = document.getElementById('tab-profissionais');
            if (tab) tab.style.display = '';
        }

        // Bind das abas
        document.querySelectorAll('.cfg-tab').forEach(btn => {
            btn.addEventListener('click', () => trocarAba(btn.dataset.tab));
        });

        await renderAba(state.abaAtiva);
    });

    async function trocarAba(aba) {
        state.abaAtiva = aba;
        document.querySelectorAll('.cfg-tab').forEach(b => {
            b.classList.toggle('active', b.dataset.tab === aba);
        });
        await renderAba(aba);
    }

    async function renderAba(aba) {
        const cont = document.getElementById('cfg-conteudo');
        cont.innerHTML = `<div class="cfg-loading"><div class="spinner"></div><p>Carregando...</p></div>`;

        try {
            if (aba === 'perfil') {
                await carregarPerfilDetalhado();
                cont.innerHTML = renderPerfil();
                bindPerfil();
            } else if (aba === 'convenios') {
                await carregarConvenios();
                cont.innerHTML = renderConvenios();
                bindConvenios();
            } else if (aba === 'profissionais') {
                if (!state.ehAdmin) {
                    cont.innerHTML = `<div class="cfg-erro">Acesso restrito a administradores.</div>`;
                    return;
                }
                await carregarProfissionais();
                cont.innerHTML = renderProfissionais();
                bindProfissionais();
            }
        } catch (err) {
            console.error('[cfg] erro:', err);
            cont.innerHTML = `<div class="cfg-erro">${escapeHtml(err.message || 'Erro ao carregar')}</div>`;
        }
    }

    // ════════════════════════════════════════════════════════════════════════
    // PERFIL
    // ════════════════════════════════════════════════════════════════════════

    async function carregarPerfilDetalhado() {
        const { data, error } = await window.cortexClient
            .from('profissionais')
            .select('*')
            .eq('id', state.profissional.id)
            .single();
        if (error) throw error;
        state.profissional = { ...state.profissional, ...data };

        // URLs assinadas pra foto e assinatura (em paralelo)
        const [fotoRes, assinRes] = await Promise.all([
            data.foto_url
                ? window.cortexClient.storage.from('profissionais-fotos')
                    .createSignedUrl(data.foto_url, 600).catch(() => null)
                : Promise.resolve(null),
            data.assinatura_url
                ? window.cortexClient.storage.from('profissionais-assinaturas')
                    .createSignedUrl(data.assinatura_url, 600).catch(() => null)
                : Promise.resolve(null),
        ]);

        state.fotoSignedUrl = fotoRes?.data?.signedUrl || null;
        state.assinaturaSignedUrl = assinRes?.data?.signedUrl || null;
    }

    function renderPerfil() {
        const p = state.profissional;
        const perfilLabel = (window.CortexUI?.PERFIL_LABELS?.[p.perfil]) || p.perfil;
        const especialidades = Array.isArray(p.especialidades) ? p.especialidades : [];

        return `
            <!-- Card 1: Foto + dados de identificação -->
            <div class="cfg-card">
                <div class="cfg-card-header">
                    <h3>Foto de perfil</h3>
                    <p>Sua foto aparece na sidebar e nos laudos. Use uma imagem nítida e profissional.</p>
                </div>

                <div class="cfg-foto-wrapper">
                    <div class="cfg-foto-preview" id="foto-preview">
                        ${renderFotoPreview()}
                    </div>
                    <div class="cfg-foto-acoes">
                        <input type="file" id="foto-input" accept="image/jpeg,image/png,image/webp" style="display:none;">
                        <button type="button" class="btn btn-secondary btn-sm" id="btn-upload-foto">
                            ${p.foto_url ? '🔄 Trocar foto' : '📤 Enviar foto'}
                        </button>
                        ${p.foto_url ? `
                            <button type="button" class="btn btn-ghost btn-sm" id="btn-remover-foto" style="color: var(--color-danger-text);">
                                🗑 Remover
                            </button>
                        ` : ''}
                        <div class="cfg-hint" style="margin-top: 8px;">
                            JPG, PNG ou WEBP · até 5MB
                        </div>
                    </div>
                </div>
            </div>

            <!-- Card 2: Dados pessoais -->
            <div class="cfg-card">
                <div class="cfg-card-header">
                    <h3>Meus dados</h3>
                    <p>E-mail e perfil de acesso não podem ser alterados aqui.</p>
                </div>

                <form id="form-perfil">
                    <div class="cfg-form-grid">
                        <div class="cfg-field span-full">
                            <label>Nome completo <span class="required">*</span></label>
                            <input type="text" name="nome_completo" value="${escapeAttr(p.nome_completo || '')}" required maxlength="200">
                        </div>

                        <div class="cfg-field">
                            <label>E-mail</label>
                            <input type="email" value="${escapeAttr(p.email || '')}" readonly>
                            <span class="cfg-hint">🔒 Não pode ser alterado</span>
                        </div>

                        <div class="cfg-field">
                            <label>CPF</label>
                            <input type="text" name="cpf" id="cfg-cpf" value="${escapeAttr(p.cpf || '')}" placeholder="000.000.000-00" maxlength="14">
                        </div>

                        <div class="cfg-field">
                            <label>Data de nascimento</label>
                            <input type="date" name="data_nascimento" value="${escapeAttr(p.data_nascimento || '')}">
                        </div>

                        <div class="cfg-field">
                            <label>CRP</label>
                            <input type="text" name="crp" value="${escapeAttr(p.crp || '')}" placeholder="04/12345" maxlength="20">
                        </div>

                        <div class="cfg-field">
                            <label>Telefone</label>
                            <input type="text" name="telefone" id="cfg-telefone" value="${escapeAttr(p.telefone || '')}" placeholder="(34) 99999-8888">
                        </div>

                        <div class="cfg-field">
                            <label>Perfil de acesso</label>
                            <input type="text" value="${escapeAttr(perfilLabel)}" readonly>
                            <span class="cfg-hint">🔒 Definido pelo administrador</span>
                        </div>

                        <div class="cfg-field span-full">
                            <label>Formação</label>
                            <input type="text" name="formacao" value="${escapeAttr(p.formacao || '')}" placeholder="Ex: Psicologia (UFU, 2015)" maxlength="200">
                        </div>

                        <div class="cfg-field span-full">
                            <label>Especialidades</label>
                            <div class="cfg-tags-wrapper">
                                <div class="cfg-tags-lista" id="esp-tags">
                                    ${especialidades.map((e, i) => renderTag(e, i)).join('')}
                                </div>
                                <input type="text" id="esp-input" class="cfg-tag-input"
                                       placeholder="Digite e pressione Enter (ex: Neuropsicologia)"
                                       maxlength="80">
                            </div>
                            <span class="cfg-hint">Pressione Enter ou vírgula pra adicionar. Clique no × pra remover.</span>
                        </div>

                        <!-- Mantém compatibilidade: especialidade (singular) ainda é editável caso queira -->
                        <div class="cfg-field span-full">
                            <label>Especialidade principal (campo legado)</label>
                            <input type="text" name="especialidade" value="${escapeAttr(p.especialidade || '')}" placeholder="Opcional — para retrocompatibilidade" maxlength="200">
                        </div>
                    </div>

                    <div id="perfil-erro" class="cfg-erro" style="display:none;"></div>

                    <div class="cfg-actions">
                        <button type="submit" class="btn btn-primary" id="btn-salvar-perfil">
                            <span class="btn-text">💾 Salvar alterações</span>
                            <span class="btn-loading" style="display:none;">Salvando...</span>
                        </button>
                    </div>
                </form>
            </div>

            <!-- Card 3: Assinatura digital -->
            <div class="cfg-card">
                <div class="cfg-card-header">
                    <h3>Assinatura digital</h3>
                    <p>Imagem da sua assinatura, usada para estampar laudos. Prefira PNG com fundo transparente.</p>
                </div>

                <div class="cfg-assinatura-wrapper">
                    <div class="cfg-assinatura-preview" id="assinatura-preview">
                        ${renderAssinaturaPreview()}
                    </div>
                    <div class="cfg-assinatura-acoes">
                        <input type="file" id="assinatura-input" accept="image/png,image/jpeg,image/webp" style="display:none;">
                        <button type="button" class="btn btn-secondary btn-sm" id="btn-upload-assinatura">
                            ${p.assinatura_url ? '🔄 Trocar assinatura' : '📤 Enviar assinatura'}
                        </button>
                        ${p.assinatura_url ? `
                            <button type="button" class="btn btn-ghost btn-sm" id="btn-remover-assinatura" style="color: var(--color-danger-text);">
                                🗑 Remover
                            </button>
                        ` : ''}
                        <div class="cfg-hint" style="margin-top: 8px;">
                            PNG, JPG ou WEBP · até 2MB · idealmente PNG transparente
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    function renderFotoPreview() {
        const p = state.profissional;
        if (state.fotoSignedUrl) {
            return `<img src="${state.fotoSignedUrl}" alt="Foto" class="cfg-foto-img">`;
        }
        const inicial = (p.nome_completo || '?').charAt(0).toUpperCase();
        return `<div class="cfg-foto-fallback">${escapeHtml(inicial)}</div>`;
    }

    function renderAssinaturaPreview() {
        if (state.assinaturaSignedUrl) {
            return `<img src="${state.assinaturaSignedUrl}" alt="Assinatura" class="cfg-assinatura-img">`;
        }
        return `<div class="cfg-assinatura-vazia">Nenhuma assinatura cadastrada</div>`;
    }

    function renderTag(texto, indice) {
        return `
            <span class="cfg-tag" data-idx="${indice}">
                ${escapeHtml(texto)}
                <button type="button" class="cfg-tag-remover" data-idx="${indice}" title="Remover">×</button>
            </span>
        `;
    }

    function bindPerfil() {
        const tel = document.getElementById('cfg-telefone');
        if (tel && window.CortexUI?.aplicarMascaraTelefone) {
            window.CortexUI.aplicarMascaraTelefone(tel);
        }
        const cpf = document.getElementById('cfg-cpf');
        if (cpf && window.CortexUI?.aplicarMascaraCPF) {
            window.CortexUI.aplicarMascaraCPF(cpf);
        }
        document.getElementById('form-perfil').addEventListener('submit', salvarPerfil);

        // Tags de especialidades
        bindTagsEspecialidades();

        // Upload foto
        const btnFoto = document.getElementById('btn-upload-foto');
        const inpFoto = document.getElementById('foto-input');
        if (btnFoto && inpFoto) {
            btnFoto.addEventListener('click', () => inpFoto.click());
            inpFoto.addEventListener('change', uploadFoto);
        }
        const btnRemFoto = document.getElementById('btn-remover-foto');
        if (btnRemFoto) btnRemFoto.addEventListener('click', removerFoto);

        // Upload assinatura
        const btnAss = document.getElementById('btn-upload-assinatura');
        const inpAss = document.getElementById('assinatura-input');
        if (btnAss && inpAss) {
            btnAss.addEventListener('click', () => inpAss.click());
            inpAss.addEventListener('change', uploadAssinatura);
        }
        const btnRemAss = document.getElementById('btn-remover-assinatura');
        if (btnRemAss) btnRemAss.addEventListener('click', removerAssinatura);
    }

    // ── Tags de especialidades ──────────────────────────────────────────────

    function getEspecialidadesAtuais() {
        return Array.isArray(state.profissional.especialidades)
            ? [...state.profissional.especialidades]
            : [];
    }

    function bindTagsEspecialidades() {
        const inp = document.getElementById('esp-input');
        const lista = document.getElementById('esp-tags');
        if (!inp || !lista) return;

        inp.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                const valor = inp.value.trim().replace(/,$/, '');
                if (!valor) return;
                const atuais = getEspecialidadesAtuais();
                if (atuais.includes(valor)) {
                    inp.value = '';
                    return;
                }
                atuais.push(valor);
                state.profissional.especialidades = atuais;
                renderTagsEspecialidades();
                inp.value = '';
                inp.focus();
            }
            // Backspace em campo vazio remove a última tag
            if (e.key === 'Backspace' && inp.value === '') {
                const atuais = getEspecialidadesAtuais();
                if (atuais.length > 0) {
                    atuais.pop();
                    state.profissional.especialidades = atuais;
                    renderTagsEspecialidades();
                }
            }
        });
    }

    function renderTagsEspecialidades() {
        const lista = document.getElementById('esp-tags');
        if (!lista) return;
        const atuais = getEspecialidadesAtuais();
        lista.innerHTML = atuais.map((e, i) => renderTag(e, i)).join('');
        // Re-bind dos × de remover
        lista.querySelectorAll('.cfg-tag-remover').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.idx);
                const arr = getEspecialidadesAtuais();
                arr.splice(idx, 1);
                state.profissional.especialidades = arr;
                renderTagsEspecialidades();
            });
        });
    }

    async function salvarPerfil(e) {
        e.preventDefault();
        const form = e.target;
        const btn = document.getElementById('btn-salvar-perfil');
        const btnText = btn.querySelector('.btn-text');
        const btnLoading = btn.querySelector('.btn-loading');
        const erro = document.getElementById('perfil-erro');
        erro.style.display = 'none';

        const formData = new FormData(form);
        const dados = {};
        formData.forEach((v, k) => {
            const val = v && v.trim ? v.trim() : v;
            dados[k] = val || null;
        });

        // Especialidades vêm do state, não do form
        dados.especialidades = getEspecialidadesAtuais();

        if (!dados.nome_completo) {
            erro.textContent = 'Nome é obrigatório.';
            erro.style.display = 'block';
            return;
        }

        // Valida CPF se preenchido
        if (dados.cpf && window.CortexUI?.validarCPF && !window.CortexUI.validarCPF(dados.cpf)) {
            erro.textContent = 'CPF inválido. Verifique os dígitos.';
            erro.style.display = 'block';
            return;
        }

        btn.disabled = true;
        btnText.style.display = 'none';
        btnLoading.style.display = 'inline';

        try {
            const { error } = await window.cortexClient
                .from('profissionais')
                .update(dados)
                .eq('id', state.profissional.id);
            if (error) throw error;

            // Atualiza estado e o cache global
            Object.assign(state.profissional, dados);
            if (window.cortexProfissional) Object.assign(window.cortexProfissional, dados);

            await CortexAudit.log('atualizacao', 'profissionais', state.profissional.id, {
                detalhes: { autoatualizacao: true }
            });

            window.CortexUI.toast('Perfil atualizado com sucesso!', 'success');
        } catch (err) {
            console.error('[cfg] salvar perfil:', err);
            let msg = err.message || 'desconhecido';
            if (msg.includes('duplicate key') && msg.includes('cpf')) {
                msg = 'Este CPF já está cadastrado em outro profissional.';
            }
            erro.textContent = 'Erro: ' + msg;
            erro.style.display = 'block';
        } finally {
            btn.disabled = false;
            btnText.style.display = 'inline';
            btnLoading.style.display = 'none';
        }
    }

    // ── Upload de foto ──────────────────────────────────────────────────────

    async function uploadFoto(event) {
        const file = event.target.files[0];
        if (!file) return;

        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
            window.CortexUI.toast('Formato inválido. Use JPG, PNG ou WEBP.', 'danger');
            event.target.value = '';
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            window.CortexUI.toast('Arquivo muito grande. Máximo: 5MB.', 'danger');
            event.target.value = '';
            return;
        }

        const btn = document.getElementById('btn-upload-foto');
        const orig = btn.textContent;
        btn.disabled = true;
        btn.textContent = '⏳ Enviando...';

        try {
            const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
            const path = `${state.profissional.id}/foto_${Date.now()}.${ext}`;

            const { error: upErr } = await window.cortexClient
                .storage
                .from('profissionais-fotos')
                .upload(path, file, { contentType: file.type, upsert: false });
            if (upErr) throw upErr;

            // Apaga foto anterior (se existia)
            const fotoAntiga = state.profissional.foto_url;

            const { error: dbErr } = await window.cortexClient
                .from('profissionais')
                .update({ foto_url: path })
                .eq('id', state.profissional.id);
            if (dbErr) throw dbErr;

            if (fotoAntiga) {
                await window.cortexClient.storage.from('profissionais-fotos').remove([fotoAntiga]).catch(() => {});
            }

            await CortexAudit.log('upload', 'profissionais', state.profissional.id, {
                detalhes: { campo: 'foto_url' }
            });

            window.CortexUI.toast('Foto atualizada!', 'success');
            await renderAba('perfil');
        } catch (err) {
            console.error('[cfg] upload foto:', err);
            window.CortexUI.toast('Erro: ' + (err.message || 'desconhecido'), 'danger');
            btn.disabled = false;
            btn.textContent = orig;
        } finally {
            event.target.value = '';
        }
    }

    async function removerFoto() {
        if (!confirm('Remover a foto de perfil?')) return;
        try {
            const path = state.profissional.foto_url;
            const { error } = await window.cortexClient
                .from('profissionais')
                .update({ foto_url: null })
                .eq('id', state.profissional.id);
            if (error) throw error;

            if (path) {
                await window.cortexClient.storage.from('profissionais-fotos').remove([path]).catch(() => {});
            }

            window.CortexUI.toast('Foto removida.', 'success');
            await renderAba('perfil');
        } catch (err) {
            console.error('[cfg] remover foto:', err);
            window.CortexUI.toast('Erro: ' + (err.message || 'desconhecido'), 'danger');
        }
    }

    // ── Upload de assinatura ────────────────────────────────────────────────

    async function uploadAssinatura(event) {
        const file = event.target.files[0];
        if (!file) return;

        if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
            window.CortexUI.toast('Formato inválido. Use PNG, JPG ou WEBP.', 'danger');
            event.target.value = '';
            return;
        }
        if (file.size > 2 * 1024 * 1024) {
            window.CortexUI.toast('Arquivo muito grande. Máximo: 2MB.', 'danger');
            event.target.value = '';
            return;
        }

        const btn = document.getElementById('btn-upload-assinatura');
        const orig = btn.textContent;
        btn.disabled = true;
        btn.textContent = '⏳ Enviando...';

        try {
            const ext = (file.name.split('.').pop() || 'png').toLowerCase();
            const path = `${state.profissional.id}/assinatura_${Date.now()}.${ext}`;

            const { error: upErr } = await window.cortexClient
                .storage
                .from('profissionais-assinaturas')
                .upload(path, file, { contentType: file.type, upsert: false });
            if (upErr) throw upErr;

            const assinAntiga = state.profissional.assinatura_url;

            const { error: dbErr } = await window.cortexClient
                .from('profissionais')
                .update({ assinatura_url: path })
                .eq('id', state.profissional.id);
            if (dbErr) throw dbErr;

            if (assinAntiga) {
                await window.cortexClient.storage.from('profissionais-assinaturas').remove([assinAntiga]).catch(() => {});
            }

            await CortexAudit.log('upload', 'profissionais', state.profissional.id, {
                detalhes: { campo: 'assinatura_url' }
            });

            window.CortexUI.toast('Assinatura atualizada!', 'success');
            await renderAba('perfil');
        } catch (err) {
            console.error('[cfg] upload assinatura:', err);
            window.CortexUI.toast('Erro: ' + (err.message || 'desconhecido'), 'danger');
            btn.disabled = false;
            btn.textContent = orig;
        } finally {
            event.target.value = '';
        }
    }

    async function removerAssinatura() {
        if (!confirm('Remover a assinatura digital?')) return;
        try {
            const path = state.profissional.assinatura_url;
            const { error } = await window.cortexClient
                .from('profissionais')
                .update({ assinatura_url: null })
                .eq('id', state.profissional.id);
            if (error) throw error;

            if (path) {
                await window.cortexClient.storage.from('profissionais-assinaturas').remove([path]).catch(() => {});
            }

            window.CortexUI.toast('Assinatura removida.', 'success');
            await renderAba('perfil');
        } catch (err) {
            console.error('[cfg] remover assinatura:', err);
            window.CortexUI.toast('Erro: ' + (err.message || 'desconhecido'), 'danger');
        }
    }

    // ════════════════════════════════════════════════════════════════════════
    // CONVÊNIOS
    // ════════════════════════════════════════════════════════════════════════

    async function carregarConvenios() {
        const { data, error } = await window.cortexClient
            .from('convenios')
            .select('*')
            .order('ativo', { ascending: false })
            .order('nome');
        if (error) throw error;
        state.convenios = data || [];
    }

    function renderConvenios() {
        const ativos = state.convenios.filter(c => c.ativo);
        const inativos = state.convenios.filter(c => !c.ativo);

        return `
            <div class="cfg-card">
                <div class="cfg-card-header" style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;">
                    <div>
                        <h3>Convênios atendidos</h3>
                        <p>Cadastre os convênios que aparecem no formulário de pacientes.</p>
                    </div>
                    <button class="btn btn-primary" id="btn-novo-convenio">+ Novo convênio</button>
                </div>

                ${ativos.length === 0 && inativos.length === 0 ? `
                    <div class="cfg-empty">
                        <p>Nenhum convênio cadastrado ainda.</p>
                    </div>
                ` : ''}

                ${ativos.length > 0 ? `
                    <h4 class="cfg-grupo-titulo">✅ Ativos <span class="cfg-grupo-contador">${ativos.length}</span></h4>
                    <div class="cfg-conv-lista">
                        ${ativos.map(c => renderConvenioLinha(c)).join('')}
                    </div>
                ` : ''}

                ${inativos.length > 0 ? `
                    <h4 class="cfg-grupo-titulo" style="margin-top: 18px; color: var(--color-text-muted);">
                        💤 Inativos <span class="cfg-grupo-contador">${inativos.length}</span>
                    </h4>
                    <div class="cfg-conv-lista">
                        ${inativos.map(c => renderConvenioLinha(c)).join('')}
                    </div>
                ` : ''}
            </div>

            <!-- Modal de edição -->
            <div id="modal-convenio" class="cfg-modal" style="display:none;">
                <div class="cfg-modal-box">
                    <div class="cfg-modal-header">
                        <h3 id="modal-convenio-titulo">Novo convênio</h3>
                        <button class="cfg-modal-close" onclick="window.CortexCfg.fecharModal()">✕</button>
                    </div>
                    <form id="form-convenio">
                        <input type="hidden" name="id" id="conv-id">
                        <div class="cfg-form-grid">
                            <div class="cfg-field">
                                <label>Nome <span class="required">*</span></label>
                                <input type="text" name="nome" id="conv-nome" required maxlength="100" placeholder="Ex: GNDI, Unimed">
                            </div>
                            <div class="cfg-field">
                                <label>Operadora</label>
                                <input type="text" name="operadora" id="conv-operadora" maxlength="100">
                            </div>
                            <div class="cfg-field">
                                <label>Tipo de pacote</label>
                                <input type="text" name="tipo_pacote" id="conv-tipo" maxlength="100" placeholder="Ex: Psico TEA">
                            </div>
                            <div class="cfg-field">
                                <label>Código de procedimento</label>
                                <input type="text" name="codigo_procedimento" id="conv-codigo" maxlength="50" placeholder="Ex: 60010126">
                            </div>
                            <div class="cfg-field span-full">
                                <label>Observações</label>
                                <textarea name="observacoes" id="conv-obs" rows="2"></textarea>
                            </div>
                        </div>
                        <div id="conv-erro" class="cfg-erro" style="display:none;"></div>
                        <div class="cfg-actions">
                            <button type="button" class="btn btn-ghost" onclick="window.CortexCfg.fecharModal()">Cancelar</button>
                            <button type="submit" class="btn btn-primary" id="btn-salvar-conv">
                                <span class="btn-text">💾 Salvar</span>
                                <span class="btn-loading" style="display:none;">Salvando...</span>
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;
    }

    function renderConvenioLinha(c) {
        const subtitle = [c.operadora, c.tipo_pacote].filter(Boolean).join(' · ') || '—';
        const codigo = c.codigo_procedimento ? `<span class="cfg-conv-codigo">${escapeHtml(c.codigo_procedimento)}</span>` : '';
        return `
            <div class="cfg-conv-item ${c.ativo ? '' : 'inativo'}">
                <div class="cfg-conv-info">
                    <div class="cfg-conv-nome">
                        ${escapeHtml(c.nome)}
                        ${codigo}
                    </div>
                    <div class="cfg-conv-meta">${escapeHtml(subtitle)}</div>
                </div>
                <div class="cfg-conv-acoes">
                    <button class="btn btn-secondary btn-sm" onclick="window.CortexCfg.editar('${c.id}')">✏️ Editar</button>
                    ${c.ativo ? `
                        <button class="btn btn-ghost btn-sm" onclick="window.CortexCfg.toggleAtivo('${c.id}', false)">Desativar</button>
                    ` : `
                        <button class="btn btn-ghost btn-sm" onclick="window.CortexCfg.toggleAtivo('${c.id}', true)">Ativar</button>
                    `}
                </div>
            </div>
        `;
    }

    function bindConvenios() {
        document.getElementById('btn-novo-convenio').addEventListener('click', () => abrirModalConvenio(null));
        document.getElementById('form-convenio').addEventListener('submit', salvarConvenio);
    }

    function abrirModalConvenio(c) {
        document.getElementById('modal-convenio-titulo').textContent = c ? `Editar: ${c.nome}` : 'Novo convênio';
        document.getElementById('conv-id').value = c?.id || '';
        document.getElementById('conv-nome').value = c?.nome || '';
        document.getElementById('conv-operadora').value = c?.operadora || '';
        document.getElementById('conv-tipo').value = c?.tipo_pacote || '';
        document.getElementById('conv-codigo').value = c?.codigo_procedimento || '';
        document.getElementById('conv-obs').value = c?.observacoes || '';
        document.getElementById('conv-erro').style.display = 'none';
        document.getElementById('modal-convenio').style.display = 'flex';
    }

    async function salvarConvenio(e) {
        e.preventDefault();
        const form = e.target;
        const btn = document.getElementById('btn-salvar-conv');
        const btnText = btn.querySelector('.btn-text');
        const btnLoading = btn.querySelector('.btn-loading');
        const erro = document.getElementById('conv-erro');
        erro.style.display = 'none';

        const formData = new FormData(form);
        const dados = {};
        formData.forEach((v, k) => {
            const val = v && v.trim ? v.trim() : v;
            if (val) dados[k] = val;
            else if (k !== 'id') dados[k] = null;
        });

        if (!dados.nome) {
            erro.textContent = 'Nome é obrigatório.';
            erro.style.display = 'block';
            return;
        }

        const id = dados.id;
        delete dados.id;

        btn.disabled = true;
        btnText.style.display = 'none';
        btnLoading.style.display = 'inline';

        try {
            if (id) {
                const { error } = await window.cortexClient
                    .from('convenios')
                    .update(dados)
                    .eq('id', id);
                if (error) throw error;
                window.CortexUI.toast('Convênio atualizado.', 'success');
            } else {
                dados.ativo = true;
                const { error } = await window.cortexClient
                    .from('convenios')
                    .insert(dados);
                if (error) throw error;
                window.CortexUI.toast('Convênio criado.', 'success');
            }
            await CortexAudit.log(id ? 'atualizacao' : 'criacao', 'convenios', id || null, {
                detalhes: { nome: dados.nome }
            });
            fecharModal();
            await renderAba('convenios');
        } catch (err) {
            console.error('[cfg] salvar conv:', err);
            let msg = err.message || 'Erro';
            if (msg.includes('duplicate key')) msg = 'Já existe um convênio com esse nome.';
            erro.textContent = msg;
            erro.style.display = 'block';
        } finally {
            btn.disabled = false;
            btnText.style.display = 'inline';
            btnLoading.style.display = 'none';
        }
    }

    function fecharModal() {
        document.getElementById('modal-convenio').style.display = 'none';
    }

    // API global pros botões inline
    window.CortexCfg = {
        editar: function(id) {
            const c = state.convenios.find(x => x.id === id);
            if (c) abrirModalConvenio(c);
        },
        toggleAtivo: async function(id, novoStatus) {
            const c = state.convenios.find(x => x.id === id);
            if (!c) return;
            const acao = novoStatus ? 'ativar' : 'desativar';
            if (!confirm(`${acao.charAt(0).toUpperCase() + acao.slice(1)} o convênio "${c.nome}"?`)) return;
            try {
                const { error } = await window.cortexClient
                    .from('convenios')
                    .update({ ativo: novoStatus })
                    .eq('id', id);
                if (error) throw error;
                await CortexAudit.log('atualizacao', 'convenios', id, {
                    detalhes: { campo: 'ativo', valor: novoStatus }
                });
                window.CortexUI.toast(`Convênio ${novoStatus ? 'ativado' : 'desativado'}.`, 'success');
                await renderAba('convenios');
            } catch (err) {
                console.error('[cfg] toggle:', err);
                window.CortexUI.toast('Erro: ' + (err.message || 'desconhecido'), 'danger');
            }
        },
        fecharModal: fecharModal,
    };

    // ════════════════════════════════════════════════════════════════════════
    // PROFISSIONAIS (só admin) — Sprint 9
    // ════════════════════════════════════════════════════════════════════════

    const PERFIS_DISPONIVEIS = {
        'admin_clinico':            'Admin Clínico',
        'admin_gestor':             'Admin Gestor',
        'neuropsicologo_aplicador': 'Neuropsicólogo Aplicador',
        'estagiario':               'Estagiário',
        'corretor':                 'Corretor',
    };

    async function carregarProfissionais() {
        const { data, error } = await window.cortexClient
            .from('profissionais')
            .select('id, nome_completo, email, crp, perfil, ativo, foto_url, created_at, telefone')
            .order('ativo', { ascending: false })
            .order('nome_completo');
        if (error) throw error;
        state.profissionaisLista = data || [];
    }

    function renderProfissionais() {
        const ativos = state.profissionaisLista.filter(p => p.ativo);
        const inativos = state.profissionaisLista.filter(p => !p.ativo);

        return `
            <div class="cfg-card">
                <div class="cfg-card-header" style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;">
                    <div>
                        <h3>Profissionais cadastrados</h3>
                        <p>Gerencie quem tem acesso ao sistema. Apenas admins veem esta aba.</p>
                    </div>
                    <button class="btn btn-primary" id="btn-novo-prof">+ Novo profissional</button>
                </div>

                ${ativos.length === 0 && inativos.length === 0 ? `
                    <div class="cfg-empty"><p>Nenhum profissional cadastrado ainda.</p></div>
                ` : ''}

                ${ativos.length > 0 ? `
                    <h4 class="cfg-grupo-titulo">✅ Ativos <span class="cfg-grupo-contador">${ativos.length}</span></h4>
                    <div class="cfg-conv-lista">
                        ${ativos.map(p => renderProfLinha(p)).join('')}
                    </div>
                ` : ''}

                ${inativos.length > 0 ? `
                    <h4 class="cfg-grupo-titulo" style="margin-top: 18px; color: var(--color-text-muted);">
                        💤 Inativos <span class="cfg-grupo-contador">${inativos.length}</span>
                    </h4>
                    <div class="cfg-conv-lista">
                        ${inativos.map(p => renderProfLinha(p)).join('')}
                    </div>
                ` : ''}
            </div>

            <!-- Modal -->
            <div id="modal-prof" class="cfg-modal" style="display:none;">
                <div class="cfg-modal-box">
                    <div class="cfg-modal-header">
                        <h3 id="modal-prof-titulo">Novo profissional</h3>
                        <button class="cfg-modal-close" onclick="window.CortexCfgProf.fecharModal()">✕</button>
                    </div>
                    <form id="form-prof">
                        <input type="hidden" name="id" id="prof-id">
                        <div class="cfg-form-grid">
                            <div class="cfg-field span-full">
                                <label>Nome completo <span class="required">*</span></label>
                                <input type="text" name="nome_completo" id="prof-nome" required maxlength="200">
                            </div>

                            <div class="cfg-field">
                                <label>E-mail <span class="required">*</span></label>
                                <input type="email" name="email" id="prof-email" required maxlength="200">
                                <span class="cfg-hint" id="prof-email-hint">Será usado para login</span>
                            </div>

                            <div class="cfg-field">
                                <label>Perfil <span class="required">*</span></label>
                                <select name="perfil" id="prof-perfil" required>
                                    ${Object.entries(PERFIS_DISPONIVEIS).map(([v, l]) =>
                                        `<option value="${v}">${l}</option>`
                                    ).join('')}
                                </select>
                            </div>

                            <div class="cfg-field">
                                <label>CRP</label>
                                <input type="text" name="crp" id="prof-crp" maxlength="20" placeholder="04/12345">
                            </div>

                            <div class="cfg-field">
                                <label>Telefone</label>
                                <input type="text" name="telefone" id="prof-telefone" maxlength="20" placeholder="(34) 99999-8888">
                            </div>

                            <!-- Senha aparece só na criação -->
                            <div class="cfg-field span-full" id="prof-bloco-senha">
                                <label>Senha provisória <span class="required">*</span></label>
                                <input type="text" id="prof-senha" maxlength="50" placeholder="Mínimo 8 caracteres" autocomplete="off">
                                <span class="cfg-hint">⚠ Anote esta senha — você precisará passar pra ela. O profissional pode trocar depois.</span>
                            </div>
                        </div>

                        <div id="prof-erro" class="cfg-erro" style="display:none;"></div>

                        <div class="cfg-actions">
                            <button type="button" class="btn btn-ghost" onclick="window.CortexCfgProf.fecharModal()">Cancelar</button>
                            <button type="submit" class="btn btn-primary" id="btn-salvar-prof">
                                <span class="btn-text">💾 Salvar</span>
                                <span class="btn-loading" style="display:none;">Salvando...</span>
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;
    }

    function renderProfLinha(p) {
        const perfilLabel = PERFIS_DISPONIVEIS[p.perfil] || p.perfil;
        const ehVoce = p.id === state.profissional.id;
        const inicial = (p.nome_completo || p.email || '?').charAt(0).toUpperCase();

        return `
            <div class="cfg-conv-item ${p.ativo ? '' : 'inativo'}">
                <div class="cfg-conv-info" style="display: flex; align-items: center; gap: 12px;">
                    <div class="cfg-prof-avatar">${escapeHtml(inicial)}</div>
                    <div style="min-width: 0; flex: 1;">
                        <div class="cfg-conv-nome">
                            ${escapeHtml(p.nome_completo || '— sem nome —')}
                            ${ehVoce ? '<span class="cfg-conv-codigo" style="background:#dbeafe; color:#1d4ed8;">VOCÊ</span>' : ''}
                            <span class="cfg-conv-codigo">${escapeHtml(perfilLabel)}</span>
                        </div>
                        <div class="cfg-conv-meta">
                            ${escapeHtml(p.email)}${p.crp ? ' · CRP ' + escapeHtml(p.crp) : ''}
                        </div>
                    </div>
                </div>
                <div class="cfg-conv-acoes">
                    <button class="btn btn-secondary btn-sm" onclick="window.CortexCfgProf.editar('${p.id}')">✏️ Editar</button>
                    ${ehVoce ? '' : (p.ativo ? `
                        <button class="btn btn-ghost btn-sm" onclick="window.CortexCfgProf.toggleAtivo('${p.id}', false)">Desativar</button>
                    ` : `
                        <button class="btn btn-ghost btn-sm" onclick="window.CortexCfgProf.toggleAtivo('${p.id}', true)">Ativar</button>
                    `)}
                </div>
            </div>
        `;
    }

    function bindProfissionais() {
        document.getElementById('btn-novo-prof').addEventListener('click', () => abrirModalProf(null));
        document.getElementById('form-prof').addEventListener('submit', salvarProf);
    }

    function abrirModalProf(p) {
        const ehNovo = !p;
        document.getElementById('modal-prof-titulo').textContent = ehNovo
            ? 'Novo profissional'
            : `Editar: ${p.nome_completo || p.email}`;

        document.getElementById('prof-id').value = p?.id || '';
        document.getElementById('prof-nome').value = p?.nome_completo || '';
        document.getElementById('prof-email').value = p?.email || '';
        document.getElementById('prof-crp').value = p?.crp || '';
        document.getElementById('prof-telefone').value = p?.telefone || '';
        document.getElementById('prof-perfil').value = p?.perfil || 'neuropsicologo_aplicador';

        const blocoSenha = document.getElementById('prof-bloco-senha');
        const inpSenha = document.getElementById('prof-senha');
        const inpEmail = document.getElementById('prof-email');
        const hintEmail = document.getElementById('prof-email-hint');

        if (ehNovo) {
            blocoSenha.style.display = '';
            inpSenha.value = '';
            inpSenha.required = true;
            inpEmail.readOnly = false;
            hintEmail.textContent = 'Será usado para login';
        } else {
            blocoSenha.style.display = 'none';
            inpSenha.required = false;
            inpEmail.readOnly = true;
            hintEmail.textContent = '🔒 E-mail não pode ser alterado depois do cadastro';
        }

        document.getElementById('prof-erro').style.display = 'none';
        document.getElementById('modal-prof').style.display = 'flex';
    }

    async function salvarProf(e) {
        e.preventDefault();
        const form = e.target;
        const btn = document.getElementById('btn-salvar-prof');
        const btnText = btn.querySelector('.btn-text');
        const btnLoading = btn.querySelector('.btn-loading');
        const erro = document.getElementById('prof-erro');
        erro.style.display = 'none';

        const formData = new FormData(form);
        const dados = {};
        formData.forEach((v, k) => {
            const val = v && v.trim ? v.trim() : v;
            if (val) dados[k] = val;
            else if (k !== 'id') dados[k] = null;
        });

        const id = dados.id;
        delete dados.id;
        const senha = document.getElementById('prof-senha').value;

        if (!dados.nome_completo) { mostrarErroProf(erro, 'Nome é obrigatório.'); return; }
        if (!dados.email) { mostrarErroProf(erro, 'E-mail é obrigatório.'); return; }
        if (!dados.perfil) { mostrarErroProf(erro, 'Perfil é obrigatório.'); return; }

        const ehNovo = !id;
        if (ehNovo) {
            if (!senha || senha.length < 8) {
                mostrarErroProf(erro, 'Senha provisória precisa ter no mínimo 8 caracteres.');
                return;
            }
        }

        btn.disabled = true;
        btnText.style.display = 'none';
        btnLoading.style.display = 'inline';

        try {
            if (ehNovo) {
                await criarProfissional(dados, senha);
                window.CortexUI.toast(`✓ Profissional cadastrado. Senha: ${senha}`, 'success');
            } else {
                // Edita só campos do registro em profissionais (e-mail não muda)
                const update = {
                    nome_completo: dados.nome_completo,
                    crp: dados.crp,
                    telefone: dados.telefone,
                    perfil: dados.perfil,
                };
                const { error } = await window.cortexClient
                    .from('profissionais')
                    .update(update)
                    .eq('id', id);
                if (error) throw error;
                window.CortexUI.toast('Profissional atualizado.', 'success');
            }

            await CortexAudit.log(ehNovo ? 'criacao' : 'atualizacao', 'profissionais', id || null, {
                detalhes: { nome: dados.nome_completo, perfil: dados.perfil }
            });

            fecharModalProf();
            await renderAba('profissionais');

        } catch (err) {
            console.error('[cfg] salvar prof:', err);
            let msg = err.message || 'Erro';
            if (msg.includes('User already registered') || msg.includes('already been registered')) {
                msg = 'Este e-mail já está cadastrado no sistema.';
            } else if (msg.includes('duplicate key')) {
                if (msg.includes('email')) msg = 'Este e-mail já está cadastrado.';
                else if (msg.includes('cpf')) msg = 'Este CPF já está cadastrado.';
                else msg = 'Dados duplicados detectados.';
            } else if (msg.includes('Password should be')) {
                msg = 'Senha muito fraca. Use no mínimo 8 caracteres com letras e números.';
            }
            mostrarErroProf(erro, msg);
        } finally {
            btn.disabled = false;
            btnText.style.display = 'inline';
            btnLoading.style.display = 'none';
        }
    }

    /**
     * Cria profissional usando supabase.auth.signUp.
     *
     * Truque pra preservar a sessão do admin: signUp normalmente troca a sessão
     * pro novo usuário. Pra evitar isso, salvamos a sessão atual antes,
     * fazemos o signUp e restauramos a sessão depois.
     */
    async function criarProfissional(dados, senha) {
        // 1. Salva sessão atual (admin)
        const { data: { session: sessaoAdmin } } = await window.cortexClient.auth.getSession();
        if (!sessaoAdmin) throw new Error('Sessão de admin perdida. Faça login novamente.');

        // 2. signUp do novo usuário (pode trocar sessão temporariamente)
        const { data: signUpData, error: signUpErr } = await window.cortexClient.auth.signUp({
            email: dados.email,
            password: senha,
            options: {
                // emailRedirectTo: undefined — não queremos enviar email de confirmação
            }
        });
        if (signUpErr) throw signUpErr;
        if (!signUpData?.user) throw new Error('Falha ao criar usuário (sem retorno).');

        // 3. Restaura sessão do admin imediatamente (pra recuperar permissões)
        const { error: restErr } = await window.cortexClient.auth.setSession({
            access_token: sessaoAdmin.access_token,
            refresh_token: sessaoAdmin.refresh_token,
        });
        if (restErr) {
            console.warn('Não foi possível restaurar sessão do admin:', restErr);
            // Tenta continuar — pode ser que ainda tenha permissão
        }

        // 4. Trigger handle_new_user já criou o registro em `profissionais` com perfil padrão.
        //    Atualiza com os dados completos.
        const authUserId = signUpData.user.id;

        // Aguarda um pouco pra garantir que o trigger rodou
        await new Promise(r => setTimeout(r, 500));

        const { error: updErr } = await window.cortexClient
            .from('profissionais')
            .update({
                nome_completo: dados.nome_completo,
                crp: dados.crp,
                telefone: dados.telefone,
                perfil: dados.perfil,
                ativo: true,
            })
            .eq('auth_user_id', authUserId);

        if (updErr) {
            // Se o trigger ainda não rodou, tenta INSERT direto (fallback)
            console.warn('Update falhou, tentando INSERT direto:', updErr);
            const { error: insErr } = await window.cortexClient
                .from('profissionais')
                .insert({
                    auth_user_id: authUserId,
                    email: dados.email,
                    nome_completo: dados.nome_completo,
                    crp: dados.crp,
                    telefone: dados.telefone,
                    perfil: dados.perfil,
                    ativo: true,
                });
            if (insErr) throw insErr;
        }
    }

    function fecharModalProf() {
        const m = document.getElementById('modal-prof');
        if (m) m.style.display = 'none';
    }

    function mostrarErroProf(el, msg) {
        el.textContent = msg;
        el.style.display = 'block';
    }

    window.CortexCfgProf = {
        editar: function(id) {
            const p = state.profissionaisLista.find(x => x.id === id);
            if (p) abrirModalProf(p);
        },
        toggleAtivo: async function(id, novoStatus) {
            const p = state.profissionaisLista.find(x => x.id === id);
            if (!p) return;
            if (p.id === state.profissional.id) {
                window.CortexUI.toast('Você não pode desativar a si mesmo.', 'danger');
                return;
            }
            const acao = novoStatus ? 'ativar' : 'desativar';
            if (!confirm(`${acao.charAt(0).toUpperCase() + acao.slice(1)} ${p.nome_completo || p.email}?`)) return;
            try {
                const { error } = await window.cortexClient
                    .from('profissionais')
                    .update({ ativo: novoStatus })
                    .eq('id', id);
                if (error) throw error;
                await CortexAudit.log('atualizacao', 'profissionais', id, {
                    detalhes: { campo: 'ativo', valor: novoStatus }
                });
                window.CortexUI.toast(`Profissional ${novoStatus ? 'ativado' : 'desativado'}.`, 'success');
                await renderAba('profissionais');
            } catch (err) {
                console.error('[cfg] toggle prof:', err);
                window.CortexUI.toast('Erro: ' + (err.message || 'desconhecido'), 'danger');
            }
        },
        fecharModal: fecharModalProf,
    };

    // Helpers
    function escapeHtml(text) {
        if (text == null) return '';
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }
    function escapeAttr(text) {
        return escapeHtml(text).replace(/"/g, '&quot;');
    }

})();

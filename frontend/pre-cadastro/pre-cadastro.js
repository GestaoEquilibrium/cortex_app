// ============================================================================
// CORTEX_APP — Sprint 59 — pre-cadastro.js
// Página pública de pré-cadastro de paciente.
// ============================================================================
// URL: /frontend/pre-cadastro/index.html?t=<token>
//   1. Valida token via RPC pública pre_cadastro_get
//   2. Mostra form igual ao novo.html (mesmo HTML/CSS)
//   3. Submete via Edge Function pre-cadastro-submit (sem auth)
//   4. Tela de sucesso com botão "Ir para o portal"
// ============================================================================

(function() {
    'use strict';

    const state = {
        token: null,
        info: null,
        foto_base64: null,
        enviando: false
    };

    let supabase = null;

    // ─── Init ─────────────────────────────────────────────────────────────
    window.addEventListener('DOMContentLoaded', init);

    async function init() {
        if (typeof SUPABASE_CONFIG === 'undefined') {
            return mostrarErro('Configuração não disponível.');
        }
        supabase = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);

        const params = new URLSearchParams(window.location.search);
        state.token = params.get('t');
        if (!state.token) {
            return mostrarErro('Link inválido — token ausente. Confirme se você copiou o endereço inteiro.');
        }

        try {
            const { data, error } = await supabase.rpc('pre_cadastro_get', { p_token: state.token });
            if (error) throw error;
            const linha = Array.isArray(data) ? data[0] : data;

            if (!linha) return mostrarErro('Link não reconhecido. Solicite um novo à clínica.');
            if (linha.erro === 'token_invalido')     return mostrarErro('Link inválido. Solicite um novo à clínica.');
            if (linha.erro === 'token_expirado')     return mostrarErro('Este link expirou. Solicite um novo à clínica.');
            if (linha.erro === 'token_ja_utilizado') return mostrarErro('Este link já foi utilizado. Caso precise editar dados, entre em contato com a clínica.');

            state.info = linha;
            renderFormulario();
        } catch (err) {
            console.error('[pre-cadastro] init:', err);
            mostrarErro('Erro ao carregar: ' + (err.message || err));
        }
    }

    // ─── Telas ────────────────────────────────────────────────────────────
    function mostrarErro(msg) {
        document.getElementById('prc-conteudo').innerHTML = `
            <div class="prc-card prc-card-erro">
                <div class="prc-card-icone">⚠️</div>
                <h1>Não foi possível continuar</h1>
                <p>${escapeHtml(msg)}</p>
            </div>
        `;
    }

    function renderFormulario() {
        const nomeProf = state.info?.profissional_nome || 'sua equipe clínica';
        document.getElementById('prc-conteudo').innerHTML = `
            <div class="prc-saudacao">
                <h1>Bem-vindo(a)!</h1>
                <p>Você foi convidado(a) por <strong>${escapeHtml(nomeProf)}</strong> para completar seu cadastro.
                Preencha seus dados abaixo. Tudo é confidencial.</p>
            </div>

            <form id="prc-form" class="prc-form">

                <!-- Foto -->
                <div class="form-section">
                    <h2 class="form-section-title">Foto</h2>
                    <div class="prc-foto-wrap">
                        <div class="prc-foto-preview" id="prc-foto-preview">
                            <span class="prc-foto-placeholder">📷</span>
                        </div>
                        <div class="prc-foto-acoes">
                            <label class="btn btn-secondary btn-sm" for="prc-foto-input">
                                <span id="prc-foto-label-texto">Escolher foto</span>
                            </label>
                            <button type="button" class="btn btn-ghost btn-sm" id="prc-foto-remover" style="display:none;">Remover</button>
                            <input type="file" id="prc-foto-input" accept="image/*" capture="user" style="display:none;">
                            <p class="form-help" style="margin-top:6px;">Opcional. Máximo 3 MB.</p>
                        </div>
                    </div>
                </div>

                <!-- Identificação -->
                <div class="form-section">
                    <h2 class="form-section-title">Identificação</h2>
                    <div class="form-grid">
                        <div class="form-group span-full">
                            <label class="form-label">Nome completo <span class="required">*</span></label>
                            <input type="text" class="form-input" name="nome_completo" required maxlength="200">
                        </div>

                        <div class="form-group">
                            <label class="form-label">Nome social</label>
                            <input type="text" class="form-input" name="nome_social" maxlength="200">
                            <span class="form-help">Se diferente do nome de registro</span>
                        </div>

                        <div class="form-group">
                            <label class="form-label">Sexo <span class="required">*</span></label>
                            <select class="form-select" name="sexo" required>
                                <option value="">Selecione...</option>
                                <option value="Masculino">Masculino</option>
                                <option value="Feminino">Feminino</option>
                                <option value="Outro">Outro</option>
                            </select>
                        </div>

                        <div class="form-group">
                            <label class="form-label">Data de nascimento <span class="required">*</span></label>
                            <input type="date" class="form-input" name="data_nascimento" required>
                        </div>

                        <div class="form-group">
                            <label class="form-label">CPF <span class="required">*</span></label>
                            <input type="text" class="form-input" name="cpf" id="prc-cpf" required maxlength="14" placeholder="000.000.000-00">
                            <span class="form-help">Será usado como login no portal.</span>
                        </div>

                        <div class="form-group">
                            <label class="form-label">RG</label>
                            <input type="text" class="form-input" name="rg" maxlength="20">
                        </div>
                    </div>
                </div>

                <!-- Sociodemográficos -->
                <div class="form-section">
                    <h2 class="form-section-title">Dados sociodemográficos</h2>
                    <div class="form-grid">
                        <div class="form-group">
                            <label class="form-label">Escolaridade <span class="required">*</span></label>
                            <select class="form-select" name="escolaridade" required>
                                <option value="">Não informado</option>
                                <option value="Não alfabetizado">Não alfabetizado</option>
                                <option value="Educação infantil">Educação infantil</option>
                                <option value="Fundamental I incompleto">Fundamental I incompleto (1º–5º ano)</option>
                                <option value="Fundamental I completo">Fundamental I completo</option>
                                <option value="Fundamental II incompleto">Fundamental II incompleto (6º–9º ano)</option>
                                <option value="Fundamental II completo">Fundamental II completo</option>
                                <option value="Médio incompleto">Médio incompleto</option>
                                <option value="Médio completo">Médio completo</option>
                                <option value="Superior incompleto">Superior incompleto</option>
                                <option value="Superior completo">Superior completo</option>
                                <option value="Pós-graduação">Pós-graduação</option>
                                <option value="Mestrado">Mestrado</option>
                                <option value="Doutorado">Doutorado</option>
                            </select>
                        </div>

                        <div class="form-group">
                            <label class="form-label">Ano/série cursando</label>
                            <input type="text" class="form-input" name="escolaridade_serie" maxlength="80" placeholder="Ex: 7º ano, 2º período">
                        </div>

                        <div class="form-group">
                            <label class="form-label">Profissão <span class="required">*</span></label>
                            <input type="text" class="form-input" name="profissao" required maxlength="100">
                        </div>

                        <div class="form-group">
                            <label class="form-label">Estado civil <span class="required">*</span></label>
                            <select class="form-select" name="estado_civil" required>
                                <option value="">Não informado</option>
                                <option value="Solteiro(a)">Solteiro(a)</option>
                                <option value="Casado(a)">Casado(a)</option>
                                <option value="União estável">União estável</option>
                                <option value="Divorciado(a)">Divorciado(a)</option>
                                <option value="Viúvo(a)">Viúvo(a)</option>
                            </select>
                        </div>
                    </div>
                </div>

                <!-- Convênio -->
                <div class="form-section">
                    <h2 class="form-section-title">Convênio</h2>
                    <div class="form-grid">
                        <div class="form-group">
                            <label class="form-label">Convênio <span class="required">*</span></label>
                            <select class="form-select" name="convenio_id" id="prc-convenio" required>
                                <option value="">Não informado</option>
                            </select>
                        </div>

                        <div class="form-group">
                            <label class="form-label">Número da carteirinha</label>
                            <input type="text" class="form-input" name="numero_convenio" maxlength="50">
                        </div>
                    </div>
                </div>

                <!-- Contatos -->
                <div class="form-section">
                    <h2 class="form-section-title">Contatos</h2>
                    <div class="form-grid">
                        <div class="form-group">
                            <label class="form-label">Telefone <span class="required">*</span></label>
                            <input type="text" class="form-input" name="telefone" id="prc-tel" required placeholder="(34) 99999-8888">
                        </div>

                        <div class="form-group">
                            <label class="form-label">E-mail <span class="required">*</span></label>
                            <input type="email" class="form-input" name="email" required maxlength="200">
                        </div>

                        <div class="form-group span-full">
                            <label class="form-label">Endereço <span class="required">*</span></label>
                            <input type="text" class="form-input" name="endereco" required maxlength="200">
                        </div>

                        <div class="form-group">
                            <label class="form-label">Cidade <span class="required">*</span></label>
                            <input type="text" class="form-input" name="cidade" required value="Uberlândia" maxlength="100">
                        </div>

                        <div class="form-group">
                            <label class="form-label">CEP <span class="required">*</span></label>
                            <input type="text" class="form-input" name="cep" id="prc-cep" required placeholder="38400-000" maxlength="9">
                        </div>
                    </div>
                </div>

                <!-- Mãe -->
                <div class="form-section">
                    <h2 class="form-section-title">Mãe</h2>
                    <div class="form-grid">
                        <div class="form-group">
                            <label class="form-label">Nome da mãe <span class="required">*</span></label>
                            <input type="text" class="form-input" name="mae_nome" required maxlength="200">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Telefone da mãe <span class="required">*</span></label>
                            <input type="text" class="form-input" name="mae_telefone" id="prc-mae-tel" required placeholder="(34) 99999-8888" maxlength="20">
                        </div>
                    </div>
                </div>

                <!-- Pai -->
                <div class="form-section">
                    <h2 class="form-section-title">Pai</h2>
                    <div class="form-grid">
                        <div class="form-group">
                            <label class="form-label">Nome do pai</label>
                            <input type="text" class="form-input" name="pai_nome" maxlength="200">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Telefone do pai</label>
                            <input type="text" class="form-input" name="pai_telefone" id="prc-pai-tel" placeholder="(34) 99999-8888" maxlength="20">
                        </div>
                    </div>
                </div>

                <!-- Outro responsável -->
                <div class="form-section">
                    <h2 class="form-section-title">Outro responsável legal</h2>
                    <p class="form-help" style="margin-bottom: 12px;">Opcional. Use só se houver tutor, curador, avó ou outro responsável distinto dos pais.</p>
                    <div class="form-grid">
                        <div class="form-group">
                            <label class="form-label">Nome do responsável</label>
                            <input type="text" class="form-input" name="responsavel_nome" maxlength="200">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Parentesco</label>
                            <input type="text" class="form-input" name="responsavel_parentesco" maxlength="50" placeholder="Tutor, curador, avó...">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Telefone do responsável</label>
                            <input type="text" class="form-input" name="responsavel_telefone" id="prc-resp-tel" placeholder="(34) 99999-8888">
                        </div>
                        <div class="form-group">
                            <label class="form-label">E-mail do responsável</label>
                            <input type="email" class="form-input" name="responsavel_email" maxlength="200">
                        </div>
                    </div>
                </div>

                <!-- Médico solicitante -->
                <div class="form-section">
                    <h2 class="form-section-title">Médico solicitante</h2>
                    <div class="form-grid">
                        <div class="form-group">
                            <label class="form-label">Encaminhado por</label>
                            <input type="text" class="form-input" name="encaminhado_por" maxlength="200" placeholder="Médico, escola, busca espontânea...">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Médico de referência <span class="required">*</span></label>
                            <input type="text" class="form-input" name="medico_referencia" required maxlength="200">
                        </div>
                        <div class="form-group">
                            <label class="form-label">CRM do médico</label>
                            <input type="text" class="form-input" name="medico_crm" maxlength="20">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Clínica do médico</label>
                            <input type="text" class="form-input" name="medico_clinica" maxlength="200">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Telefone do médico</label>
                            <input type="text" class="form-input" name="medico_telefone" id="prc-med-tel" placeholder="(34) 99999-8888" maxlength="20">
                        </div>
                    </div>
                </div>

                <!-- Observações -->
                <div class="form-section">
                    <h2 class="form-section-title">Observações</h2>
                    <div class="form-group">
                        <textarea class="form-textarea" name="observacoes" rows="3" placeholder="Alguma informação adicional que queira nos passar..."></textarea>
                    </div>
                </div>

                <div id="prc-erro" class="prc-erro-box" style="display:none;"></div>

                <div class="prc-actions">
                    <button type="submit" id="prc-submit" class="btn btn-primary btn-lg">
                        <span class="btn-text">Concluir cadastro</span>
                        <span class="btn-loading" style="display:none;">Enviando...</span>
                    </button>
                </div>
            </form>
        `;

        aplicarMascaras();
        setupFoto();
        carregarConvenios();
        document.getElementById('prc-form').addEventListener('submit', enviar);
    }

    function renderSucesso(payload) {
        document.getElementById('prc-conteudo').innerHTML = `
            <div class="prc-card prc-card-sucesso">
                <div class="prc-card-icone">✓</div>
                <h1>Cadastro concluído!</h1>
                <p>Seus dados foram enviados com sucesso. A clínica já tem acesso ao seu cadastro.</p>

                <div class="prc-sucesso-acesso">
                    <h3>Acesso ao Portal do Paciente</h3>
                    <p style="margin:8px 0;">Você pode acessar agora o portal para acompanhar suas consultas, responder questionários e baixar laudos.</p>
                    <div class="prc-credenciais">
                        <div><strong>Login:</strong> ${escapeHtml(payload.cpf)} <span class="prc-cred-help">(seu CPF)</span></div>
                        <div><strong>Senha inicial:</strong> ${escapeHtml(payload.cpf)} <span class="prc-cred-help">(o mesmo CPF — você poderá trocar)</span></div>
                    </div>
                </div>

                <a class="btn btn-primary btn-lg prc-btn-block" href="${escapeAttr(payload.url_portal || 'https://cortexneuro.com.br/portal/')}">
                    Ir para o portal →
                </a>
            </div>
        `;
        window.scrollTo(0, 0);
    }

    // ─── Helpers ──────────────────────────────────────────────────────────
    function aplicarMascaras() {
        // Não temos ui_helpers aqui (público) — aplicamos máscaras simples inline
        mascararCpf(document.getElementById('prc-cpf'));
        ['prc-tel','prc-mae-tel','prc-pai-tel','prc-resp-tel','prc-med-tel'].forEach(id => {
            const el = document.getElementById(id);
            if (el) mascararTel(el);
        });
        const cep = document.getElementById('prc-cep');
        if (cep) mascararCep(cep);
    }

    function mascararCpf(el) {
        if (!el) return;
        el.addEventListener('input', () => {
            let v = el.value.replace(/\D/g, '').slice(0, 11);
            if (v.length > 9) v = v.replace(/^(\d{3})(\d{3})(\d{3})(\d{1,2}).*/, '$1.$2.$3-$4');
            else if (v.length > 6) v = v.replace(/^(\d{3})(\d{3})(\d{1,3}).*/, '$1.$2.$3');
            else if (v.length > 3) v = v.replace(/^(\d{3})(\d{1,3}).*/, '$1.$2');
            el.value = v;
        });
    }

    function mascararTel(el) {
        if (!el) return;
        el.addEventListener('input', () => {
            let v = el.value.replace(/\D/g, '').slice(0, 11);
            if (v.length > 10) v = v.replace(/^(\d{2})(\d{5})(\d{4}).*/, '($1) $2-$3');
            else if (v.length > 6) v = v.replace(/^(\d{2})(\d{4})(\d{0,4}).*/, '($1) $2-$3');
            else if (v.length > 2) v = v.replace(/^(\d{2})(\d{0,5}).*/, '($1) $2');
            else if (v.length > 0) v = v.replace(/^(\d{0,2})/, '($1');
            el.value = v.trim();
        });
    }

    function mascararCep(el) {
        el.addEventListener('input', () => {
            let v = el.value.replace(/\D/g, '').slice(0, 8);
            if (v.length > 5) v = v.replace(/^(\d{5})(\d{1,3}).*/, '$1-$2');
            el.value = v;
        });
    }

    function setupFoto() {
        const input = document.getElementById('prc-foto-input');
        const preview = document.getElementById('prc-foto-preview');
        const btnRem = document.getElementById('prc-foto-remover');
        const labelTxt = document.getElementById('prc-foto-label-texto');

        input.addEventListener('change', () => {
            const f = input.files && input.files[0];
            if (!f) return;
            if (f.size > 5 * 1024 * 1024) {
                alert('Foto muito grande (máx 5 MB). Tente uma menor.');
                input.value = '';
                return;
            }
            const reader = new FileReader();
            reader.onload = e => {
                state.foto_base64 = e.target.result;
                preview.innerHTML = `<img src="${state.foto_base64}" alt="Foto">`;
                btnRem.style.display = 'inline-flex';
                labelTxt.textContent = 'Trocar foto';
            };
            reader.readAsDataURL(f);
        });

        btnRem.addEventListener('click', () => {
            state.foto_base64 = null;
            input.value = '';
            preview.innerHTML = '<span class="prc-foto-placeholder">📷</span>';
            btnRem.style.display = 'none';
            labelTxt.textContent = 'Escolher foto';
        });
    }

    async function carregarConvenios() {
        try {
            const { data } = await supabase
                .from('convenios')
                .select('id, nome')
                .eq('ativo', true)
                .order('nome');
            const sel = document.getElementById('prc-convenio');
            (data || []).forEach(c => {
                const o = document.createElement('option');
                o.value = c.id;
                o.textContent = c.nome;
                sel.appendChild(o);
            });
        } catch (e) {
            console.warn('Convênios falharam (segue sem):', e);
        }
    }

    // ─── Submit ───────────────────────────────────────────────────────────
    async function enviar(ev) {
        ev.preventDefault();
        if (state.enviando) return;

        const form = ev.target;
        const erroBox = document.getElementById('prc-erro');
        erroBox.style.display = 'none';
        erroBox.textContent = '';

        // Monta dados
        const formData = new FormData(form);
        const dados = {};
        formData.forEach((v, k) => {
            const trimmed = (typeof v === 'string') ? v.trim() : v;
            if (trimmed !== '' && trimmed !== null && trimmed !== undefined) dados[k] = trimmed;
        });

        // Sprint 59.1: validação dos campos obrigatórios.
        // (nome social, RG, pai, responsável, CRM/clínica/telefone do médico,
        //  encaminhado_por, carteirinha e observações são opcionais)
        const obrigatorios = [
            ['nome_completo', 'Nome completo'],
            ['sexo', 'Sexo'],
            ['data_nascimento', 'Data de nascimento'],
            ['cpf', 'CPF'],
            ['escolaridade', 'Escolaridade'],
            ['profissao', 'Profissão'],
            ['estado_civil', 'Estado civil'],
            ['convenio_id', 'Convênio'],
            ['telefone', 'Telefone'],
            ['email', 'E-mail'],
            ['endereco', 'Endereço'],
            ['cidade', 'Cidade'],
            ['cep', 'CEP'],
            ['mae_nome', 'Nome da mãe'],
            ['mae_telefone', 'Telefone da mãe'],
            ['medico_referencia', 'Médico de referência']
        ];

        const faltando = obrigatorios.filter(([campo]) => !dados[campo]).map(([, label]) => label);
        if (faltando.length > 0) {
            // destaca o primeiro campo vazio
            const primeiro = obrigatorios.find(([campo]) => !dados[campo]);
            if (primeiro) {
                const el = form.elements[primeiro[0]];
                if (el && el.focus) {
                    el.focus();
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }
            return mostrarErroForm(
                faltando.length === 1
                    ? `O campo "${faltando[0]}" é obrigatório.`
                    : `Preencha os campos obrigatórios: ${faltando.join(', ')}.`
            );
        }

        state.enviando = true;
        const btn = document.getElementById('prc-submit');
        btn.disabled = true;
        btn.querySelector('.btn-text').style.display = 'none';
        btn.querySelector('.btn-loading').style.display = '';

        try {
            const url = `${SUPABASE_CONFIG.url}/functions/v1/pre-cadastro-submit`;
            const resp = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': SUPABASE_CONFIG.anonKey
                    // Sem Authorization (deploy --no-verify-jwt)
                },
                body: JSON.stringify({
                    token: state.token,
                    dados: dados,
                    foto_base64: state.foto_base64
                })
            });

            const body = await resp.json().catch(() => ({}));

            if (!resp.ok || body.ok === false) {
                return mostrarErroForm(body.mensagem || body.erro || 'Erro ao enviar. Tente novamente.');
            }

            renderSucesso(body);
        } catch (err) {
            console.error('[pre-cadastro] enviar:', err);
            mostrarErroForm('Erro de conexão. Tente novamente em alguns instantes.');
        } finally {
            state.enviando = false;
            if (btn) {
                btn.disabled = false;
                btn.querySelector('.btn-text').style.display = '';
                btn.querySelector('.btn-loading').style.display = 'none';
            }
        }
    }

    function mostrarErroForm(msg) {
        const erroBox = document.getElementById('prc-erro');
        erroBox.textContent = msg;
        erroBox.style.display = 'block';
        erroBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // ─── Util ─────────────────────────────────────────────────────────────
    function escapeHtml(t) {
        if (t == null) return '';
        const div = document.createElement('div');
        div.textContent = String(t);
        return div.innerHTML;
    }
    function escapeAttr(t) {
        return String(t == null ? '' : t).replace(/'/g, '%27').replace(/"/g, '%22');
    }
})();

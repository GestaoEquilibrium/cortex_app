// ============================================================================
// CORTEX_APP — Cadastro de profissional externo pelo link da clínica
// ----------------------------------------------------------------------------
// O link traz ?c=<código>. O banco confere o código (externo_convite_valido)
// e, no cadastro, cria a pessoa como profissional externo, sem paciente
// nenhum. Depois do cadastro ela já entra e vai para a lista de pacientes,
// onde busca pelo nome e pede acesso.
// ============================================================================
(function () {
    'use strict';

    const sb = supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey, SUPABASE_CONFIG.options);
    const conteudo = document.getElementById('conteudo');
    const codigo = new URLSearchParams(window.location.search).get('c') || '';
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, ch =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

    function estado(ic, titulo, texto, botao) {
        conteudo.innerHTML = `
            <div class="estado">
                <div class="ic">${ic}</div>
                <h2>${esc(titulo)}</h2>
                <p>${texto}</p>
                ${botao ? `<a class="botao" href="${botao.href}">${esc(botao.texto)}</a>` : ''}
            </div>`;
    }

    function formulario(sessaoAtual) {
        conteudo.innerHTML = `
            <h2>Criar meu acesso</h2>
            <p class="sub">Preencha seus dados. Você entra no CORTEX logo em seguida.</p>
            ${sessaoAtual ? `<div class="aviso">Este navegador já está conectado ao CORTEX (${esc(sessaoAtual)}). Ao criar o cadastro, essa sessão é encerrada.</div>` : ''}
            <form id="form" novalidate>
                <div class="grade">
                    <div class="campo cheio">
                        <label for="nome">Nome completo <span class="req">*</span></label>
                        <input type="text" id="nome" autocomplete="name" maxlength="200" required>
                    </div>
                    <div class="campo cheio">
                        <label for="especialidade">Especialidade ou instituição <span class="req">*</span></label>
                        <input type="text" id="especialidade" maxlength="200" placeholder="Ex.: Neuropediatra · Coordenação pedagógica da Escola X" required>
                    </div>
                    <div class="campo">
                        <label for="crp">Registro profissional</label>
                        <input type="text" id="crp" maxlength="20" placeholder="CRM, CRP, CRFa...">
                        <span class="dica">Escola pode deixar em branco.</span>
                    </div>
                    <div class="campo">
                        <label for="telefone">Telefone</label>
                        <input type="tel" id="telefone" maxlength="20" autocomplete="tel" placeholder="(34) 99999-0000">
                    </div>
                    <div class="campo cheio">
                        <label for="email">E-mail <span class="req">*</span></label>
                        <input type="email" id="email" autocomplete="email" maxlength="200" required>
                        <span class="dica">Você vai usar este e-mail para entrar.</span>
                    </div>
                    <div class="campo">
                        <label for="senha">Senha <span class="req">*</span></label>
                        <input type="password" id="senha" autocomplete="new-password" minlength="8" required>
                        <div class="forca"><i id="forca"></i></div>
                        <span class="dica">Mínimo de 8 caracteres.</span>
                    </div>
                    <div class="campo">
                        <label for="senha2">Repita a senha <span class="req">*</span></label>
                        <input type="password" id="senha2" autocomplete="new-password" minlength="8" required>
                    </div>
                </div>
                <label class="aceite">
                    <input type="checkbox" id="aceite">
                    <span>Vou usar o acesso só para acompanhar os pacientes que a clínica liberar para mim, mantendo o sigilo dos dados (LGPD). Sei que cada acesso fica registrado.</span>
                </label>
                <div class="erro" id="erro"></div>
                <button type="submit" class="enviar" id="enviar">Criar meu acesso e entrar</button>
            </form>
            <div class="rodape">Já tem cadastro? <a href="../index.html">Entrar no CORTEX</a></div>`;

        const senha = document.getElementById('senha');
        senha.addEventListener('input', () => {
            const v = senha.value; let n = 0;
            if (v.length >= 8) n++; if (/[A-Z]/.test(v) && /[a-z]/.test(v)) n++; if (/\d/.test(v)) n++; if (/[^A-Za-z0-9]/.test(v)) n++;
            const f = document.getElementById('forca');
            f.style.width = (n * 25) + '%';
            f.style.background = ['#E2E8F0', '#EF4444', '#F59E0B', '#22C55E', '#16A34A'][n];
        });
        document.getElementById('form').addEventListener('submit', enviar);
    }

    function erro(msg) {
        const el = document.getElementById('erro');
        el.textContent = msg; el.style.display = 'block';
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    async function enviar(e) {
        e.preventDefault();
        document.getElementById('erro').style.display = 'none';
        const v = (id) => (document.getElementById(id).value || '').trim();
        const dados = { nome: v('nome'), especialidade: v('especialidade'), crp: v('crp'), telefone: v('telefone'), email: v('email').toLowerCase() };
        const senha = document.getElementById('senha').value, senha2 = document.getElementById('senha2').value;

        if (dados.nome.split(/\s+/).length < 2) return erro('Escreva o nome completo.');
        if (!dados.especialidade) return erro('Informe a especialidade ou a instituição.');
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(dados.email)) return erro('Confira o e-mail.');
        if (senha.length < 8) return erro('A senha precisa ter pelo menos 8 caracteres.');
        if (senha !== senha2) return erro('As duas senhas não são iguais.');
        if (!document.getElementById('aceite').checked) return erro('Para continuar, marque a declaração de sigilo.');

        const btn = document.getElementById('enviar');
        btn.disabled = true; btn.textContent = 'Criando o seu acesso...';
        try {
            // confere o link de novo (pode ter sido trocado enquanto a página estava aberta)
            const ok = await sb.rpc('externo_convite_valido', { p_token: codigo });
            if (!ok.data) throw new Error('LINK_INVALIDO');

            try { await sb.auth.signOut(); } catch (_) {}
            const { data, error } = await sb.auth.signUp({
                email: dados.email,
                password: senha,
                options: { data: {
                    cadastro: 'externo', convite: codigo, nome_completo: dados.nome,
                    especialidade: dados.especialidade, crp: dados.crp, telefone: dados.telefone
                } }
            });
            if (error) throw error;

            let sessao = data && data.session;
            if (!sessao) {
                // sem confirmação de e-mail ligada, o login funciona na hora
                const r = await sb.auth.signInWithPassword({ email: dados.email, password: senha });
                sessao = r.data && r.data.session;
            }
            if (sessao) {
                window.location.href = '../pacientes/lista.html?bemvindo=1';
                return;
            }
            estado('📧', 'Confira o seu e-mail',
                `Enviamos um e-mail para <b>${esc(dados.email)}</b>. Clique no link dele para confirmar e depois entre no CORTEX.`,
                { href: '../index.html', texto: 'Ir para o login' });
        } catch (err) {
            const m = String((err && err.message) || err || '');
            btn.disabled = false; btn.textContent = 'Criar meu acesso e entrar';
            if (m === 'LINK_INVALIDO') return erro('Este link de cadastro não vale mais. Peça um novo à clínica.');
            if (/already registered|already been registered|User already/i.test(m)) return erro('Este e-mail já tem cadastro no CORTEX. Use “Entrar no CORTEX”, abaixo.');
            if (/Password should|weak/i.test(m)) return erro('Senha fraca. Use letras e números, com pelo menos 8 caracteres.');
            if (/rate limit|too many/i.test(m)) return erro('Muitas tentativas seguidas. Espere um minuto e tente de novo.');
            erro('Não deu para criar o cadastro: ' + m);
        }
    }

    async function iniciar() {
        if (!codigo) {
            estado('🔗', 'Link incompleto', 'Este endereço precisa do link de cadastro enviado pela clínica. Peça o link à clínica.');
            return;
        }
        try {
            const { data, error } = await sb.rpc('externo_convite_valido', { p_token: codigo });
            if (error) throw error;
            if (!data) {
                estado('⛔', 'Link vencido', 'Este link de cadastro não vale mais. Peça um novo link à clínica.',
                    { href: '../index.html', texto: 'Já tenho cadastro' });
                return;
            }
        } catch (err) {
            estado('⚠️', 'Não deu para conferir o link', 'Verifique a internet e recarregue a página.');
            return;
        }
        let atual = null;
        try { const { data } = await sb.auth.getSession(); atual = data && data.session && data.session.user ? data.session.user.email : null; } catch (_) {}
        formulario(atual);
    }

    iniciar();
})();

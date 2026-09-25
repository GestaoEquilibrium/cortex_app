// ============================================================================
// CORTEX — externo.js
// ----------------------------------------------------------------------------
// Área do profissional de fora. É onde o QR do laudo cai.
//
// Quem chega aqui está com um laudo na mão, provavelmente no celular, e não
// tem conta. O caminho é: vê de quem é o prontuário (só "Maria S. R.", nunca o
// nome inteiro), cria o acesso, e espera a liberação. Nada aparece antes de o
// admin autorizar.
//
// Nenhuma consulta ao banco sai daqui: tudo passa pela Edge Function
// `externo-acesso`, que é a única que fala com as funções do banco.
// ============================================================================

(function () {
    'use strict';

    const FN = `${SUPABASE_CONFIG.url}/functions/v1/externo-acesso`;
    const CHAVE_SESSAO = 'cortex_externo_sessao';

    const state = {
        token: null,      // token do QR (?t=)
        sessao: null,     // sessão da área externa
        qrRotulo: null,   // "Maria S. R." — só para confirmar o paciente
        enviando: false
    };

    const el = () => document.getElementById('ea-conteudo');

    function esc(t) {
        const d = document.createElement('div');
        d.textContent = t ?? '';
        return d.innerHTML;
    }

    function dataBR(iso) {
        if (!iso) return '—';
        const s = String(iso).slice(0, 10).split('-');
        return s.length === 3 ? `${s[2]}/${s[1]}/${s[0]}` : '—';
    }

    // ── Comunicação ─────────────────────────────────────────────────────────

    async function chamar(acao, dados) {
        const resp = await fetch(FN, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': SUPABASE_CONFIG.anonKey
            },
            body: JSON.stringify({ acao, ...dados })
        });
        return await resp.json().catch(() => ({ ok: false, erro: 'resposta_invalida' }));
    }

    // ── Telas ───────────────────────────────────────────────────────────────

    function pintar(html) {
        el().innerHTML = html;
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function carregando(texto) {
        pintar(`<div class="ea-card ea-centro">
                    <div class="ea-spinner"></div>
                    <p>${esc(texto || 'Aguarde...')}</p>
                </div>`);
    }

    function erroFatal(texto) {
        pintar(`<div class="ea-card ea-centro">
                    <div class="ea-icone">⚠️</div>
                    <h1>Link inválido</h1>
                    <p>${esc(texto)}</p>
                    <p class="ea-ajuda">Se você recebeu este QR num laudo, peça à clínica
                       um laudo atualizado — o código pode ter sido trocado.</p>
                </div>`);
    }

    function cartaoPaciente() {
        if (!state.qrRotulo) return '';
        return `<div class="ea-paciente">
                    <div class="ea-paciente-rot">Prontuário de</div>
                    <div class="ea-paciente-nome">${esc(state.qrRotulo)}</div>
                </div>`;
    }

    // Entrada: escolhe entre entrar e criar acesso.
    function telaAbertura() {
        pintar(`
            <div class="ea-card">
                <span class="ea-selo">Acesso profissional</span>
                <h1>Acompanhe o paciente pelo CORTEX</h1>
                <p>Este é o acesso para profissionais e clínicas de fora que acompanham
                   pacientes avaliados aqui. Você vê apenas os pacientes liberados para você.</p>
                ${cartaoPaciente()}
                <div class="ea-botoes">
                    <button class="ea-btn ea-btn-primario" id="ea-ir-login">Já tenho acesso</button>
                    <button class="ea-btn ea-btn-linha" id="ea-ir-cadastro">Criar meu acesso</button>
                </div>
                <p class="ea-ajuda">A liberação é feita pela equipe da clínica. Você recebe
                   o aviso assim que for autorizada.</p>
            </div>`);

        document.getElementById('ea-ir-login').onclick = telaLogin;
        document.getElementById('ea-ir-cadastro').onclick = telaCadastro;
    }

    function telaLogin(msg) {
        pintar(`
            <div class="ea-card">
                <h2>Entrar</h2>
                <p class="ea-ajuda">Use o e-mail do seu cadastro.</p>
                ${typeof msg === 'string' && msg ? `<div class="ea-erro">${esc(msg)}</div>` : ''}
                <form id="ea-form-login" novalidate>
                    <label class="ea-campo">
                        <span>E-mail</span>
                        <input type="email" id="lg-email" autocomplete="username" inputmode="email" required>
                    </label>
                    <label class="ea-campo">
                        <span>Senha</span>
                        <input type="password" id="lg-senha" autocomplete="current-password" required>
                    </label>
                    <div class="ea-erro ea-erro-form" id="ea-erro-login" hidden></div>
                    <button type="submit" class="ea-btn ea-btn-primario" id="ea-btn-login">Entrar</button>
                </form>
                <button class="ea-link" id="ea-volta">Não tenho acesso ainda</button>
            </div>`);

        document.getElementById('ea-volta').onclick = telaCadastro;
        document.getElementById('ea-form-login').addEventListener('submit', enviarLogin);
        setTimeout(() => document.getElementById('lg-email')?.focus(), 200);
    }

    function telaCadastro(msg) {
        pintar(`
            <div class="ea-card">
                <h2>Criar meu acesso</h2>
                <p class="ea-ajuda">Seu cadastro passa por autorização da clínica antes
                   de liberar qualquer prontuário.</p>
                ${cartaoPaciente()}
                ${typeof msg === 'string' && msg ? `<div class="ea-erro">${esc(msg)}</div>` : ''}
                <form id="ea-form-cad" novalidate>
                    <label class="ea-campo">
                        <span>Nome completo *</span>
                        <input type="text" id="cd-nome" autocomplete="name" required>
                    </label>
                    <div class="ea-grid">
                        <label class="ea-campo">
                            <span>Conselho</span>
                            <select id="cd-conselho">
                                <option value="">—</option>
                                <option value="CRM">CRM</option>
                                <option value="CRP">CRP</option>
                                <option value="CRO">CRO</option>
                                <option value="CREFITO">CREFITO</option>
                                <option value="CRFa">CRFa</option>
                                <option value="OUTRO">Outro</option>
                            </select>
                        </label>
                        <label class="ea-campo">
                            <span>Registro</span>
                            <input type="text" id="cd-registro" placeholder="ex.: 12345/MG">
                        </label>
                    </div>
                    <label class="ea-campo">
                        <span>Especialidade</span>
                        <input type="text" id="cd-esp" placeholder="ex.: Neuropediatria">
                    </label>
                    <label class="ea-campo">
                        <span>Clínica ou local de atendimento</span>
                        <input type="text" id="cd-clinica">
                    </label>
                    <div class="ea-grid">
                        <label class="ea-campo">
                            <span>E-mail *</span>
                            <input type="email" id="cd-email" autocomplete="email" inputmode="email" required>
                        </label>
                        <label class="ea-campo">
                            <span>Telefone</span>
                            <input type="tel" id="cd-tel" autocomplete="tel" inputmode="tel">
                        </label>
                    </div>
                    <label class="ea-campo">
                        <span>Senha * <em>(mínimo 8 caracteres)</em></span>
                        <input type="password" id="cd-senha" autocomplete="new-password" required>
                    </label>
                    <label class="ea-aceite">
                        <input type="checkbox" id="cd-aceite">
                        <span>Declaro que acompanho clinicamente este paciente e me
                              responsabilizo pelo sigilo das informações a que tiver acesso,
                              nos termos da LGPD e do meu código de ética profissional.</span>
                    </label>
                    <div class="ea-erro ea-erro-form" id="ea-erro-cad" hidden></div>
                    <button type="submit" class="ea-btn ea-btn-primario" id="ea-btn-cad">
                        <span class="ea-btn-txt">Solicitar acesso</span>
                        <span class="ea-btn-load" hidden>Enviando...</span>
                    </button>
                </form>
                <button class="ea-link" id="ea-volta-login">Já tenho acesso</button>
            </div>`);

        document.getElementById('ea-volta-login').onclick = telaLogin;
        document.getElementById('ea-form-cad').addEventListener('submit', enviarCadastro);
        setTimeout(() => document.getElementById('cd-nome')?.focus(), 200);
    }

    function telaPendente(nome, comSolicitacao) {
        pintar(`
            <div class="ea-card ea-centro">
                <div class="ea-icone">⏳</div>
                <h1>Cadastro em análise</h1>
                <p>${nome ? esc(nome) + ', s' : 'S'}eu acesso foi registrado e está aguardando
                   autorização da equipe da clínica.</p>
                ${comSolicitacao ? `<div class="ea-nota">
                    O pedido para acompanhar ${esc(state.qrRotulo || 'o paciente')} já entrou
                    junto com o cadastro. Não precisa pedir de novo.</div>` : ''}
                <p class="ea-ajuda">Você pode fechar esta página. Quando estiver liberado,
                   basta escanear o QR do laudo outra vez ou voltar aqui e entrar.</p>
                <button class="ea-link" id="ea-sair">Sair</button>
            </div>`);
        const b = document.getElementById('ea-sair');
        if (b) b.onclick = sair;
    }

    function telaRecusado(nome, motivo) {
        pintar(`
            <div class="ea-card ea-centro">
                <div class="ea-icone">🚫</div>
                <h1>Acesso não autorizado</h1>
                <p>${nome ? esc(nome) + ', o' : 'O'} seu cadastro não foi autorizado.</p>
                ${motivo ? `<div class="ea-nota">${esc(motivo)}</div>` : ''}
                <p class="ea-ajuda">Fale com a clínica: (34) 3212-9269.</p>
                <button class="ea-link" id="ea-sair">Sair</button>
            </div>`);
        document.getElementById('ea-sair').onclick = sair;
    }

    function telaPainel(d) {
        const qr = d.qr || null;
        const liberados = d.liberados || [];
        const solicitacoes = d.solicitacoes || [];

        // Bloco do paciente que veio no QR.
        let blocoQr = '';
        if (qr && qr.estado === 'pode_solicitar') {
            blocoQr = `
                <div class="ea-bloco ea-bloco-acao">
                    <div class="ea-bloco-tit">Paciente do QR</div>
                    <div class="ea-paciente-nome">${esc(qr.rotulo || '—')}</div>
                    <p class="ea-ajuda">Você ainda não acompanha este paciente aqui.
                       Peça o acesso e a equipe autoriza.</p>
                    <label class="ea-campo">
                        <span>Mensagem para a equipe (opcional)</span>
                        <input type="text" id="sl-msg" maxlength="200"
                               placeholder="ex.: acompanho desde março, sou o neuropediatra">
                    </label>
                    <div class="ea-erro ea-erro-form" id="ea-erro-sl" hidden></div>
                    <button class="ea-btn ea-btn-primario" id="ea-solicitar">
                        <span class="ea-btn-txt">Solicitar acesso a este prontuário</span>
                        <span class="ea-btn-load" hidden>Enviando...</span>
                    </button>
                </div>`;
        } else if (qr && qr.estado === 'pendente') {
            blocoQr = `
                <div class="ea-bloco">
                    <div class="ea-bloco-tit">Paciente do QR</div>
                    <div class="ea-paciente-nome">${esc(qr.rotulo || '—')}</div>
                    <div class="ea-nota">⏳ Pedido enviado. Aguardando a autorização da equipe.</div>
                </div>`;
        } else if (qr && qr.estado === 'liberado') {
            blocoQr = `
                <div class="ea-bloco ea-bloco-ok">
                    <div class="ea-bloco-tit">Paciente do QR</div>
                    <div class="ea-paciente-nome">${esc(qr.rotulo || '—')}</div>
                    <div class="ea-nota ea-nota-ok">✅ Já liberado para você — está na sua lista abaixo.</div>
                </div>`;
        } else if (qr && qr.estado === 'token_invalido') {
            blocoQr = `<div class="ea-bloco">
                    <div class="ea-nota">Este QR não é mais válido. Peça à clínica um laudo atualizado.</div>
                </div>`;
        }

        pintar(`
            <div class="ea-card">
                <div class="ea-topo">
                    <div>
                        <h2>Olá, ${esc((d.nome || '').split(' ')[0])}</h2>
                        <p class="ea-ajuda">Pacientes liberados para você acompanhar.</p>
                    </div>
                    <button class="ea-link" id="ea-sair">Sair</button>
                </div>

                ${blocoQr}

                <div class="ea-bloco">
                    <div class="ea-bloco-tit">Meus pacientes (${liberados.length})</div>
                    ${liberados.length ? liberados.map(p => `
                        <div class="ea-item">
                            <div>
                                <strong>${esc(p.nome)}</strong>
                                <div class="ea-item-sub">${(p.escopo || []).map(e => esc(rotuloEscopo(e))).join(' · ')}</div>
                            </div>
                            <div class="ea-item-dir">até ${dataBR(p.expira_em)}</div>
                        </div>`).join('')
                        : `<p class="ea-ajuda">Nenhum paciente liberado ainda.</p>`}
                </div>

                ${solicitacoes.length ? `
                <div class="ea-bloco">
                    <div class="ea-bloco-tit">Pedidos aguardando autorização (${solicitacoes.length})</div>
                    ${solicitacoes.map(s => `
                        <div class="ea-item">
                            <div><strong>${esc(s.rotulo)}</strong>
                                 <div class="ea-item-sub">pedido em ${dataBR(s.solicitado_em)}</div></div>
                            <div class="ea-item-dir">⏳</div>
                        </div>`).join('')}
                </div>` : ''}

                ${liberados.length ? `
                <div class="ea-nota">
                    A visualização do prontuário (resultados, evoluções e laudos) entra na
                    próxima atualização. Os acessos que você já tem continuam valendo.
                </div>` : ''}

                <div class="ea-cortex">
                    <strong>Quer o CORTEX na sua clínica?</strong>
                    <p>Prontuário, testagem, correção automática e laudo num só lugar.</p>
                    <a class="ea-btn ea-btn-linha" href="https://wa.me/553432129269?text=Quero%20conhecer%20o%20CORTEX"
                       target="_blank" rel="noopener">Conhecer o CORTEX</a>
                </div>
            </div>`);

        document.getElementById('ea-sair').onclick = sair;
        const btn = document.getElementById('ea-solicitar');
        if (btn) btn.onclick = enviarSolicitacao;
    }

    function rotuloEscopo(e) {
        return ({ resultados: 'Resultados dos testes', evolucoes: 'Evoluções', laudos: 'Laudos' })[e] || e;
    }

    // ── Ações ───────────────────────────────────────────────────────────────

    function mostrarErro(id, msg) {
        const d = document.getElementById(id);
        if (!d) return;
        d.textContent = msg;
        d.hidden = false;
        d.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function travar(btnId, travado) {
        const b = document.getElementById(btnId);
        if (!b) return;
        b.disabled = travado;
        const t = b.querySelector('.ea-btn-txt');
        const l = b.querySelector('.ea-btn-load');
        if (t) t.hidden = travado;
        if (l) l.hidden = !travado;
    }

    async function enviarLogin(ev) {
        ev.preventDefault();
        if (state.enviando) return;
        const email = document.getElementById('lg-email').value.trim();
        const senha = document.getElementById('lg-senha').value;
        if (!email || !senha) return mostrarErro('ea-erro-login', 'Informe e-mail e senha.');

        state.enviando = true;
        travar('ea-btn-login', true);
        try {
            const r = await chamar('login', { email, senha });
            if (!r.ok) {
                if (r.erro === 'recusado') return telaRecusado(null, r.motivo);
                return mostrarErro('ea-erro-login',
                    r.erro === 'credenciais' ? 'E-mail ou senha incorretos.'
                                             : 'Não foi possível entrar. Tente de novo.');
            }
            state.sessao = r.sessao;
            try { localStorage.setItem(CHAVE_SESSAO, r.sessao); } catch (e) { /* modo privado */ }
            await abrirPainel();
        } catch (err) {
            console.error('[externo] login:', err);
            mostrarErro('ea-erro-login', 'Erro de conexão. Tente de novo.');
        } finally {
            state.enviando = false;
            travar('ea-btn-login', false);
        }
    }

    async function enviarCadastro(ev) {
        ev.preventDefault();
        if (state.enviando) return;

        const v = (id) => (document.getElementById(id)?.value || '').trim();
        const nome = v('cd-nome'), email = v('cd-email');
        const senha = document.getElementById('cd-senha').value;

        if (nome.length < 5)  return mostrarErro('ea-erro-cad', 'Informe seu nome completo.');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
                              return mostrarErro('ea-erro-cad', 'Informe um e-mail válido.');
        if (senha.length < 8) return mostrarErro('ea-erro-cad', 'A senha precisa de pelo menos 8 caracteres.');
        if (!document.getElementById('cd-aceite').checked)
                              return mostrarErro('ea-erro-cad', 'Marque a declaração para continuar.');

        state.enviando = true;
        travar('ea-btn-cad', true);
        try {
            const r = await chamar('cadastrar', {
                token: state.token, nome, email, senha,
                telefone: v('cd-tel'), conselho: v('cd-conselho'), registro: v('cd-registro'),
                especialidade: v('cd-esp'), clinica_nome: v('cd-clinica'), aceite: true
            });
            if (!r.ok) {
                const msgs = {
                    email_existe: 'Já existe um cadastro com esse e-mail. Use "Já tenho acesso".',
                    senha_curta: 'A senha precisa de pelo menos 8 caracteres.',
                    dados_incompletos: 'Preencha nome e e-mail.',
                    aceite_obrigatorio: 'Marque a declaração para continuar.'
                };
                return mostrarErro('ea-erro-cad', msgs[r.erro] || 'Não foi possível enviar. Tente de novo.');
            }
            telaPendente(nome, r.com_solicitacao);
        } catch (err) {
            console.error('[externo] cadastro:', err);
            mostrarErro('ea-erro-cad', 'Erro de conexão. Tente de novo.');
        } finally {
            state.enviando = false;
            travar('ea-btn-cad', false);
        }
    }

    async function enviarSolicitacao() {
        if (state.enviando || !state.token) return;
        state.enviando = true;
        travar('ea-solicitar', true);
        try {
            const r = await chamar('solicitar', {
                sessao: state.sessao, token: state.token,
                mensagem: document.getElementById('sl-msg')?.value || null
            });
            if (!r.ok) {
                if (r.erro === 'sessao_invalida') return sair();
                return mostrarErro('ea-erro-sl', 'Não foi possível enviar o pedido. Tente de novo.');
            }
            await abrirPainel();
        } catch (err) {
            console.error('[externo] solicitar:', err);
            mostrarErro('ea-erro-sl', 'Erro de conexão. Tente de novo.');
        } finally {
            state.enviando = false;
            travar('ea-solicitar', false);
        }
    }

    async function abrirPainel() {
        carregando('Abrindo seu acesso...');
        const r = await chamar('painel', { sessao: state.sessao, token: state.token });

        if (!r.ok) {
            try { localStorage.removeItem(CHAVE_SESSAO); } catch (e) { /* ignora */ }
            state.sessao = null;
            return state.qrRotulo ? telaAbertura() : telaLogin();
        }
        if (r.situacao === 'pendente') return telaPendente(r.nome, !!state.token);
        if (r.situacao === 'recusado' || r.situacao === 'suspenso')
            return telaRecusado(r.nome, r.motivo);
        telaPainel(r);
    }

    async function sair() {
        const s = state.sessao;
        state.sessao = null;
        try { localStorage.removeItem(CHAVE_SESSAO); } catch (e) { /* ignora */ }
        if (s) { try { await chamar('logout', { sessao: s }); } catch (e) { /* ignora */ } }
        state.qrRotulo ? telaAbertura() : telaLogin();
    }

    // ── Início ──────────────────────────────────────────────────────────────

    async function iniciar() {
        const p = new URLSearchParams(location.search);
        state.token = p.get('t') || null;

        try { state.sessao = localStorage.getItem(CHAVE_SESSAO) || null; } catch (e) { state.sessao = null; }

        // Quem tem sessão vai direto, com ou sem QR.
        if (state.sessao) {
            if (state.token) await resolverToken(true);
            return abrirPainel();
        }

        if (!state.token) return telaLogin();
        await resolverToken(false);
    }

    async function resolverToken(silencioso) {
        if (!silencioso) carregando('Verificando o código do laudo...');
        try {
            const r = await chamar('resolver', { token: state.token });
            if (!r.ok) {
                state.token = null;
                if (!silencioso) {
                    erroFatal('Este código não é mais válido ou já foi trocado pela clínica.');
                }
                return;
            }
            state.qrRotulo = r.rotulo;
            if (!silencioso) telaAbertura();
        } catch (err) {
            console.error('[externo] resolver:', err);
            if (!silencioso) erroFatal('Não foi possível verificar o código agora. Tente de novo em instantes.');
        }
    }

    document.addEventListener('DOMContentLoaded', iniciar);
})();

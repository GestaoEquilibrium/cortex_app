// ============================================================================
// CORTEX — externo.js
// ----------------------------------------------------------------------------
// Área do profissional de fora. É onde o QR do laudo cai.
//
// Depois de autorizado, ele vê o CORTEX: mesma sidebar, mesmos cards, mesmo
// visual. O que muda é o que aparece — só os pacientes liberados para ele, e
// dentro deles só o escopo que a clínica marcou.
//
// Nenhuma consulta ao banco sai daqui. Tudo passa pela Edge Function
// `externo-acesso`, que é a única que fala com as funções do banco. Ele não
// tem sessão do Supabase Auth, então não existe para nenhuma policy do CORTEX.
//
// E as páginas de resultado do CORTEX não são reaproveitadas aqui de
// propósito: elas recalculam o escore no navegador, lendo as normas. Abrir
// isso para fora seria entregar as regras de correção junto. Os testes entram
// quando houver resultado publicado.
// ============================================================================

(function () {
    'use strict';

    const FN = `${SUPABASE_CONFIG.url}/functions/v1/externo-acesso`;
    const CHAVE_SESSAO = 'cortex_externo_sessao';

    const state = {
        token: null,        // token do QR (?t=)
        sessao: null,
        qrRotulo: null,     // "Maria S. R." — só para confirmar o paciente
        painel: null,       // { nome, liberados, solicitacoes, qr }
        paciente: null,     // prontuário aberto
        aba: 'evolucoes',
        enviando: false
    };

    const raiz = () => document.getElementById('ea-raiz');

    function esc(t) {
        const d = document.createElement('div');
        d.textContent = t ?? '';
        return d.innerHTML;
    }

    // Data pura, sem passar por new Date(): 'YYYY-MM-DD' vira meia-noite UTC e
    // volta um dia no fuso de Brasília.
    function dataBR(iso) {
        if (!iso) return '—';
        const s = String(iso).slice(0, 10).split('-');
        return s.length === 3 ? `${s[2]}/${s[1]}/${s[0]}` : '—';
    }

    function dataHoraBR(iso) {
        if (!iso) return '—';
        const d = new Date(iso);
        if (isNaN(d)) return dataBR(iso);
        return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit',
                                           year: 'numeric', hour: '2-digit', minute: '2-digit' });
    }

    function idade(nasc) {
        if (!nasc) return '';
        const p = String(nasc).slice(0, 10).split('-');
        if (p.length !== 3) return '';
        const hoje = new Date();
        let anos = hoje.getFullYear() - Number(p[0]);
        const m = (hoje.getMonth() + 1) - Number(p[1]);
        if (m < 0 || (m === 0 && hoje.getDate() < Number(p[2]))) anos--;
        return anos >= 0 ? `${anos} anos` : '';
    }

    function iniciais(nome) {
        const p = String(nome || '').trim().split(/\s+/).filter(Boolean);
        if (!p.length) return '?';
        return ((p[0][0] || '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
    }

    function tamanho(b) {
        if (!b) return '';
        const kb = b / 1024;
        return kb < 1024 ? `${Math.round(kb)} KB` : `${(kb / 1024).toFixed(1)} MB`;
    }

    const ESCOPO_LABEL = {
        resultados: 'Resultados dos testes',
        evolucoes: 'Evoluções',
        laudos: 'Laudos'
    };

    // ── Comunicação ─────────────────────────────────────────────────────────

    async function chamar(acao, dados) {
        const resp = await fetch(FN, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_CONFIG.anonKey },
            body: JSON.stringify({ acao, ...dados })
        });
        return await resp.json().catch(() => ({ ok: false, erro: 'resposta_invalida' }));
    }

    // ── Marca do CORTEX ─────────────────────────────────────────────────────

    const BRAIN_SVG = `<svg class="sidebar-brand-icon" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
        <g stroke="currentColor" fill="currentColor" stroke-linecap="round">
            <line x1="16" y1="16" x2="9"  y2="9"  stroke-width="1"/>
            <line x1="16" y1="16" x2="23" y2="9"  stroke-width="1"/>
            <line x1="16" y1="16" x2="9"  y2="23" stroke-width="1"/>
            <line x1="16" y1="16" x2="23" y2="23" stroke-width="1"/>
            <line x1="16" y1="16" x2="16" y2="7"  stroke-width="1"/>
            <line x1="16" y1="16" x2="16" y2="25" stroke-width="1"/>
            <circle cx="16" cy="16" r="2.8"/>
            <circle cx="9"  cy="9"  r="1.6"/><circle cx="23" cy="9"  r="1.6"/>
            <circle cx="9"  cy="23" r="1.6"/><circle cx="23" cy="23" r="1.6"/>
            <circle cx="16" cy="7"  r="1.4"/><circle cx="16" cy="25" r="1.4"/>
        </g>
    </svg>`;

    const ICO = {
        pacientes: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/>',
        pedidos: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
        sair: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>'
    };

    // ── Shells ──────────────────────────────────────────────────────────────

    // Antes de entrar: cartão centralizado no fundo do CORTEX.
    function telaPublica(html) {
        document.body.classList.remove('tem-shell');
        raiz().innerHTML = `
            <div class="ea-publico">
                <div class="ea-marca">${BRAIN_SVG}<span>CORTEX</span></div>
                <div class="ea-card-publico">${html}</div>
                <div class="ea-rodape">
                    🔒 Acesso registrado e auditado · Sigilo profissional (LGPD)<br>
                    Grupo Equilibrium · Uberlândia/MG
                </div>
            </div>`;
        window.scrollTo({ top: 0 });
    }

    // Depois de entrar: o shell do CORTEX.
    function telaApp(conteudo, itemAtivo) {
        document.body.classList.add('tem-shell');
        const nome = state.painel?.nome || '';
        const pend = (state.painel?.solicitacoes || []).length;

        raiz().innerHTML = `
            <header class="cortex-topbar" id="cortex-topbar">
                <button class="topbar-menu-btn" id="topbar-menu-btn" aria-label="Abrir menu">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
                </button>
                <div class="topbar-brand">${BRAIN_SVG.replace('sidebar-brand-icon', 'topbar-brand-icon')}<span>CORTEX</span></div>
            </header>
            <div class="sidebar-backdrop" id="sidebar-backdrop"></div>

            <div class="app-shell">
                <aside class="sidebar" id="cortex-sidebar">
                    <div class="sidebar-brand">
                        ${BRAIN_SVG}
                        <span class="sidebar-brand-text sidebar-text">CORTEX</span>
                        <div class="sidebar-actions">
                            <button class="sidebar-close" id="sidebar-close-btn" aria-label="Fechar menu">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            </button>
                        </div>
                    </div>

                    <nav class="sidebar-nav">
                        <a href="#" class="nav-item ${itemAtivo === 'pacientes' ? 'active' : ''}"
                           data-ir="lista" style="--nav-accent: var(--accent-blue)">
                            <svg class="nav-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICO.pacientes}</svg>
                            <span class="sidebar-text">Meus pacientes</span>
                        </a>
                        <a href="#" class="nav-item ${itemAtivo === 'pedidos' ? 'active' : ''}"
                           data-ir="pedidos" style="--nav-accent: var(--accent-amber)">
                            <svg class="nav-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICO.pedidos}</svg>
                            <span class="sidebar-text">Pedidos${pend ? ` (${pend})` : ''}</span>
                        </a>
                    </nav>

                    <div class="sidebar-user">
                        <div class="sidebar-user-avatar">${esc(iniciais(nome))}</div>
                        <div class="sidebar-user-info">
                            <div class="sidebar-user-name">${esc(nome)}</div>
                            <div class="sidebar-user-perfil">Profissional externo</div>
                        </div>
                        <button class="sidebar-user-logout" id="ea-sair" title="Sair">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICO.sair}</svg>
                        </button>
                    </div>
                </aside>

                <main class="app-main">${conteudo}</main>
            </div>`;

        ligarShell();
        window.scrollTo({ top: 0 });
    }

    function ligarShell() {
        const sb = document.getElementById('cortex-sidebar');
        const bd = document.getElementById('sidebar-backdrop');
        const abrir = () => { sb.classList.add('mobile-open'); bd.classList.add('show'); document.body.classList.add('sidebar-aberta'); };
        const fechar = () => { sb.classList.remove('mobile-open'); bd.classList.remove('show'); document.body.classList.remove('sidebar-aberta'); };

        document.getElementById('topbar-menu-btn')?.addEventListener('click', abrir);
        document.getElementById('sidebar-close-btn')?.addEventListener('click', fechar);
        bd?.addEventListener('click', fechar);
        document.getElementById('ea-sair')?.addEventListener('click', sair);

        raiz().querySelectorAll('[data-ir]').forEach(a => a.addEventListener('click', (ev) => {
            ev.preventDefault();
            fechar();
            if (a.dataset.ir === 'lista') verLista();
            if (a.dataset.ir === 'pedidos') verPedidos();
        }));
    }

    function carregando(texto) {
        const alvo = document.querySelector('.app-main') || null;
        const html = `<div class="loading-state"><div class="spinner"></div><p>${esc(texto || 'Carregando...')}</p></div>`;
        if (alvo) alvo.innerHTML = html; else telaPublica(html);
    }

    // ── Telas públicas ──────────────────────────────────────────────────────

    function cartaoPaciente() {
        if (!state.qrRotulo) return '';
        return `<div class="ea-qr-paciente">
                    <div class="ea-qr-rot">Prontuário de</div>
                    <div class="ea-qr-nome">${esc(state.qrRotulo)}</div>
                </div>`;
    }

    function telaAbertura() {
        telaPublica(`
            <span class="badge status-info">Acesso profissional</span>
            <h1>Acompanhe o paciente pelo CORTEX</h1>
            <p>Para profissionais e clínicas de fora que acompanham pacientes avaliados
               aqui. Você vê apenas os pacientes liberados para você.</p>
            ${cartaoPaciente()}
            <button class="btn btn-primary btn-lg ea-bloco" id="ea-ir-login">Já tenho acesso</button>
            <button class="btn btn-secondary btn-lg ea-bloco" id="ea-ir-cadastro">Criar meu acesso</button>
            <p class="ea-ajuda">A liberação é feita pela equipe da clínica. Você recebe o
               aviso assim que for autorizada.</p>`);

        document.getElementById('ea-ir-login').onclick = () => telaLogin();
        document.getElementById('ea-ir-cadastro').onclick = () => telaCadastro();
    }

    function telaLogin() {
        telaPublica(`
            <h2>Entrar</h2>
            <p class="ea-ajuda-topo">Use o e-mail do seu cadastro.</p>
            <form id="ea-form-login" novalidate>
                <div class="form-group">
                    <label class="form-label" for="lg-email">E-mail</label>
                    <input class="form-input" type="email" id="lg-email" autocomplete="username" inputmode="email" required>
                </div>
                <div class="form-group">
                    <label class="form-label" for="lg-senha">Senha</label>
                    <input class="form-input" type="password" id="lg-senha" autocomplete="current-password" required>
                </div>
                <div class="ea-erro" id="ea-erro-login" hidden></div>
                <button type="submit" class="btn btn-primary btn-lg ea-bloco" id="ea-btn-login">
                    <span class="ea-btn-txt">Entrar</span>
                    <span class="ea-btn-load" hidden>Entrando...</span>
                </button>
            </form>
            <button class="ea-link" id="ea-volta">Não tenho acesso ainda</button>`);

        document.getElementById('ea-volta').onclick = () => telaCadastro();
        document.getElementById('ea-form-login').addEventListener('submit', enviarLogin);
        setTimeout(() => document.getElementById('lg-email')?.focus(), 200);
    }

    function telaCadastro() {
        telaPublica(`
            <h2>Criar meu acesso</h2>
            <p class="ea-ajuda-topo">Seu cadastro passa por autorização da clínica antes
               de liberar qualquer prontuário.</p>
            ${cartaoPaciente()}
            <form id="ea-form-cad" novalidate>
                <div class="form-group">
                    <label class="form-label" for="cd-nome">Nome completo <span class="required">*</span></label>
                    <input class="form-input" type="text" id="cd-nome" autocomplete="name" required>
                </div>
                <div class="form-grid">
                    <div class="form-group">
                        <label class="form-label" for="cd-conselho">Conselho</label>
                        <select class="form-select" id="cd-conselho">
                            <option value="">—</option>
                            <option value="CRM">CRM</option><option value="CRP">CRP</option>
                            <option value="CRO">CRO</option><option value="CREFITO">CREFITO</option>
                            <option value="CRFa">CRFa</option><option value="OUTRO">Outro</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label" for="cd-registro">Registro</label>
                        <input class="form-input" type="text" id="cd-registro" placeholder="ex.: 12345/MG">
                    </div>
                </div>
                <div class="form-group">
                    <label class="form-label" for="cd-esp">Especialidade</label>
                    <input class="form-input" type="text" id="cd-esp" placeholder="ex.: Neuropediatria">
                </div>
                <div class="form-group">
                    <label class="form-label" for="cd-clinica">Clínica ou local de atendimento</label>
                    <input class="form-input" type="text" id="cd-clinica">
                </div>
                <div class="form-grid">
                    <div class="form-group">
                        <label class="form-label" for="cd-email">E-mail <span class="required">*</span></label>
                        <input class="form-input" type="email" id="cd-email" autocomplete="email" inputmode="email" required>
                    </div>
                    <div class="form-group">
                        <label class="form-label" for="cd-tel">Telefone</label>
                        <input class="form-input" type="tel" id="cd-tel" autocomplete="tel" inputmode="tel">
                    </div>
                </div>
                <div class="form-group">
                    <label class="form-label" for="cd-senha">Senha <span class="required">*</span> <em class="ea-hint">(mínimo 8 caracteres)</em></label>
                    <input class="form-input" type="password" id="cd-senha" autocomplete="new-password" required>
                </div>
                <label class="ea-aceite">
                    <input type="checkbox" id="cd-aceite">
                    <span>Declaro que acompanho clinicamente este paciente e me responsabilizo
                          pelo sigilo das informações a que tiver acesso, nos termos da LGPD e
                          do meu código de ética profissional.</span>
                </label>
                <div class="ea-erro" id="ea-erro-cad" hidden></div>
                <button type="submit" class="btn btn-primary btn-lg ea-bloco" id="ea-btn-cad">
                    <span class="ea-btn-txt">Solicitar acesso</span>
                    <span class="ea-btn-load" hidden>Enviando...</span>
                </button>
            </form>
            <button class="ea-link" id="ea-volta-login">Já tenho acesso</button>`);

        document.getElementById('ea-volta-login').onclick = () => telaLogin();
        document.getElementById('ea-form-cad').addEventListener('submit', enviarCadastro);
        setTimeout(() => document.getElementById('cd-nome')?.focus(), 200);
    }

    function telaPendente(nome, comSolicitacao) {
        telaPublica(`
            <div class="ea-centro">
                <div class="ea-icone">⏳</div>
                <h1>Cadastro em análise</h1>
                <p>${nome ? esc(String(nome).split(' ')[0]) + ', s' : 'S'}eu acesso foi registrado
                   e está aguardando autorização da equipe da clínica.</p>
                ${comSolicitacao ? `<div class="ea-nota">O pedido para acompanhar
                    ${esc(state.qrRotulo || 'o paciente')} já entrou junto com o cadastro.
                    Não precisa pedir de novo.</div>` : ''}
                <p class="ea-ajuda">Pode fechar esta página. Quando estiver liberado, escaneie
                   o QR do laudo outra vez ou volte aqui e entre.</p>
                <button class="ea-link" id="ea-sair-pub">Sair</button>
            </div>`);
        document.getElementById('ea-sair-pub').onclick = sair;
    }

    function telaRecusado(nome, motivo) {
        telaPublica(`
            <div class="ea-centro">
                <div class="ea-icone">🚫</div>
                <h1>Acesso não autorizado</h1>
                <p>${nome ? esc(String(nome).split(' ')[0]) + ', o' : 'O'} seu cadastro não foi autorizado.</p>
                ${motivo ? `<div class="ea-nota">${esc(motivo)}</div>` : ''}
                <p class="ea-ajuda">Fale com a clínica: (34) 3212-9269.</p>
                <button class="ea-link" id="ea-sair-pub">Sair</button>
            </div>`);
        document.getElementById('ea-sair-pub').onclick = sair;
    }

    function erroFatal(texto) {
        telaPublica(`
            <div class="ea-centro">
                <div class="ea-icone">⚠️</div>
                <h1>Link inválido</h1>
                <p>${esc(texto)}</p>
                <p class="ea-ajuda">Se você recebeu este QR num laudo, peça à clínica um laudo
                   atualizado — o código pode ter sido trocado.</p>
            </div>`);
    }

    // ── Lista de pacientes ──────────────────────────────────────────────────

    function verLista() {
        const d = state.painel || {};
        const libs = d.liberados || [];
        const qr = d.qr;

        let blocoQr = '';
        if (qr && qr.estado === 'pode_solicitar') {
            blocoQr = `
                <div class="ea-destaque">
                    <div class="ea-destaque-rot">Paciente do QR que você escaneou</div>
                    <div class="ea-destaque-nome">${esc(qr.rotulo || '—')}</div>
                    <p>Você ainda não acompanha este paciente aqui. Peça o acesso e a equipe autoriza.</p>
                    <div class="form-group">
                        <label class="form-label" for="sl-msg">Mensagem para a equipe (opcional)</label>
                        <input class="form-input" type="text" id="sl-msg" maxlength="200"
                               placeholder="ex.: acompanho desde março, sou o neuropediatra">
                    </div>
                    <div class="ea-erro" id="ea-erro-sl" hidden></div>
                    <button class="btn btn-primary" id="ea-solicitar">
                        <span class="ea-btn-txt">Solicitar acesso a este prontuário</span>
                        <span class="ea-btn-load" hidden>Enviando...</span>
                    </button>
                </div>`;
        } else if (qr && qr.estado === 'pendente') {
            blocoQr = `<div class="ea-destaque aguardando">
                    <div class="ea-destaque-rot">Paciente do QR</div>
                    <div class="ea-destaque-nome">${esc(qr.rotulo || '—')}</div>
                    <p>⏳ Pedido enviado. Aguardando a autorização da equipe.</p>
                </div>`;
        } else if (qr && qr.estado === 'token_invalido') {
            blocoQr = `<div class="ea-destaque aguardando">
                    <p>Este QR não é mais válido. Peça à clínica um laudo atualizado.</p>
                </div>`;
        }

        telaApp(`
            <div class="page-header">
                <div class="page-title">
                    <h1>Meus pacientes</h1>
                    <p>Pacientes que a clínica liberou para você acompanhar.</p>
                </div>
            </div>

            ${blocoQr}

            ${libs.length ? `
                <div class="ea-grade">
                    ${libs.map(p => `
                        <button class="ea-pac" data-paciente="${esc(p.paciente_id)}">
                            <div class="ea-pac-avatar">${esc(iniciais(p.nome))}</div>
                            <div class="ea-pac-corpo">
                                <div class="ea-pac-nome">${esc(p.nome)}</div>
                                <div class="ea-pac-tags">
                                    ${(p.escopo || []).map(e => `<span class="ea-tag">${esc(ESCOPO_LABEL[e] || e)}</span>`).join('')}
                                </div>
                                <div class="ea-pac-prazo">Acesso até ${dataBR(p.expira_em)}</div>
                            </div>
                            <svg class="ea-pac-seta" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
                        </button>`).join('')}
                </div>`
            : `<div class="empty-state">
                    <div class="empty-state-icon">👥</div>
                    <div class="empty-state-title">Nenhum paciente liberado ainda</div>
                    <div class="empty-state-text">Escaneie o QR do laudo de um paciente seu
                        para pedir acesso, ou fale com a clínica.</div>
                </div>`}

            <div class="ea-oferta">
                <div>
                    <strong>Quer o CORTEX na sua clínica?</strong>
                    <p>Prontuário, testagem, correção automática e laudo num só lugar.</p>
                </div>
                <a class="btn btn-secondary" target="_blank" rel="noopener"
                   href="https://wa.me/553432129269?text=Quero%20conhecer%20o%20CORTEX">Conhecer o CORTEX</a>
            </div>`, 'pacientes');

        raiz().querySelectorAll('[data-paciente]').forEach(b =>
            b.addEventListener('click', () => abrirProntuario(b.dataset.paciente)));
        const btn = document.getElementById('ea-solicitar');
        if (btn) btn.onclick = enviarSolicitacao;
    }

    function verPedidos() {
        const sols = state.painel?.solicitacoes || [];
        telaApp(`
            <div class="page-header">
                <div class="page-title">
                    <h1>Pedidos</h1>
                    <p>Acessos que você pediu e ainda aguardam autorização da clínica.</p>
                </div>
            </div>
            ${sols.length ? `
                <div class="ea-lista-simples">
                    ${sols.map(s => `
                        <div class="ea-linha">
                            <div>
                                <strong>${esc(s.rotulo)}</strong>
                                <div class="ea-sub">pedido em ${dataBR(s.solicitado_em)}</div>
                            </div>
                            <span class="badge status-warning">Aguardando</span>
                        </div>`).join('')}
                </div>`
            : `<div class="empty-state">
                    <div class="empty-state-icon">✅</div>
                    <div class="empty-state-title">Nenhum pedido em aberto</div>
                    <div class="empty-state-text">Tudo que você pediu já foi respondido.</div>
                </div>`}`, 'pedidos');
    }

    // ── Prontuário ──────────────────────────────────────────────────────────

    async function abrirProntuario(pacienteId) {
        telaApp(`<div class="loading-state"><div class="spinner"></div><p>Abrindo o prontuário...</p></div>`, 'pacientes');
        try {
            const r = await chamar('prontuario', { sessao: state.sessao, paciente_id: pacienteId });
            if (!r.ok) {
                if (r.erro === 'sessao_invalida') return sair();
                return verLista();
            }
            state.paciente = r;
            state.aba = (r.evolucoes || []).length || !(r.laudos || []).length ? 'evolucoes' : 'laudos';
            pintarProntuario();
        } catch (err) {
            console.error('[externo] prontuario:', err);
            verLista();
        }
    }

    function pintarProntuario() {
        const d = state.paciente;
        const p = d.paciente;
        const escopo = d.escopo || [];
        const temEvo = escopo.indexOf('evolucoes') >= 0;
        const temLau = escopo.indexOf('laudos') >= 0;

        telaApp(`
            <a href="#" class="page-back" id="ea-voltar">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
                Voltar aos meus pacientes
            </a>

            <div class="ea-cabecalho">
                <div class="ea-cab-avatar">${esc(iniciais(p.nome))}</div>
                <div class="ea-cab-info">
                    <div class="ea-cab-nome">${esc(p.nome)}</div>
                    <div class="ea-cab-meta">
                        ${p.nascimento ? `<span><b>Nascimento:</b> ${dataBR(p.nascimento)}</span>` : ''}
                        ${idade(p.nascimento) ? `<span><b>Idade:</b> ${idade(p.nascimento)}</span>` : ''}
                        ${p.sexo ? `<span><b>Sexo:</b> ${esc(p.sexo)}</span>` : ''}
                    </div>
                    <div class="ea-cab-acesso">Seu acesso vai até ${dataBR(d.expira_em)}</div>
                </div>
            </div>

            <div class="ea-abas">
                ${temEvo ? `<button class="ea-aba ${state.aba === 'evolucoes' ? 'ativa' : ''}" data-aba="evolucoes">Evoluções (${(d.evolucoes || []).length})</button>` : ''}
                ${temLau ? `<button class="ea-aba ${state.aba === 'laudos' ? 'ativa' : ''}" data-aba="laudos">Laudos (${(d.laudos || []).length})</button>` : ''}
                ${d.resultados_pendentes ? `<button class="ea-aba" data-aba="resultados">Testes</button>` : ''}
            </div>

            <div id="ea-aba-conteudo">${conteudoAba()}</div>`, 'pacientes');

        document.getElementById('ea-voltar').onclick = (ev) => { ev.preventDefault(); verLista(); };
        raiz().querySelectorAll('[data-aba]').forEach(b => b.addEventListener('click', () => {
            state.aba = b.dataset.aba;
            pintarProntuario();
        }));
        raiz().querySelectorAll('[data-laudo]').forEach(b =>
            b.addEventListener('click', () => abrirLaudo(b.dataset.laudo, b)));
    }

    function conteudoAba() {
        const d = state.paciente;

        if (state.aba === 'resultados') {
            return `<div class="empty-state">
                        <div class="empty-state-icon">🧪</div>
                        <div class="empty-state-title">Testes corrigidos em breve</div>
                        <div class="empty-state-text">A clínica vai publicar aqui os resultados
                            dos testes deste paciente. Os laudos já estão disponíveis na aba ao lado.</div>
                    </div>`;
        }

        if (state.aba === 'laudos') {
            const ls = d.laudos || [];
            if (!ls.length) {
                return `<div class="empty-state">
                            <div class="empty-state-icon">📄</div>
                            <div class="empty-state-title">Nenhum laudo disponível</div>
                            <div class="empty-state-text">Quando a clínica emitir o laudo deste
                                paciente, ele aparece aqui.</div>
                        </div>`;
            }
            return `<div class="ea-lista-simples">
                ${ls.map(l => `
                    <div class="ea-linha">
                        <div>
                            <strong>${esc(l.nome || 'Laudo')}</strong>
                            <div class="ea-sub">
                                versão ${esc(String(l.versao || 1))}
                                ${l.tamanho ? ' · ' + tamanho(l.tamanho) : ''}
                                · ${dataBR(l.enviado_em)}
                            </div>
                            ${l.assinado ? `<div class="ea-assinado">🔒 Assinado digitalmente
                                ${l.assinante ? '· ' + esc(l.assinante) : ''}</div>` : ''}
                        </div>
                        <button class="btn btn-primary btn-sm" data-laudo="${esc(l.id)}">Abrir PDF</button>
                    </div>`).join('')}
            </div>
            <p class="ea-ajuda">O link do PDF vale por 2 minutos e cada abertura fica registrada.</p>`;
        }

        const evs = d.evolucoes || [];
        if (!evs.length) {
            return `<div class="empty-state">
                        <div class="empty-state-icon">📝</div>
                        <div class="empty-state-title">Nenhuma evolução registrada</div>
                        <div class="empty-state-text">Os registros de sessão da equipe aparecem aqui.</div>
                    </div>`;
        }
        return `<div class="ea-timeline">
            ${evs.map(e => `
                <article class="ea-evo ${e.tipo === 'sessao' ? 'tipo-sessao' : 'tipo-simples'}">
                    <div class="ea-evo-topo">
                        <span class="ea-evo-tipo">${e.tipo === 'sessao' ? 'Evolução de sessão' : 'Evolução'}</span>
                        <span class="ea-evo-data">${dataHoraBR(e.data_evolucao)}</span>
                    </div>
                    ${e.titulo ? `<div class="ea-evo-titulo">${esc(e.titulo)}</div>` : ''}
                    <div class="ea-evo-corpo">${esc(e.conteudo).replace(/\n/g, '<br>')}</div>
                    <div class="ea-evo-autor">${esc(e.autor || 'Equipe')}${e.autor_registro ? ' · ' + esc(e.autor_registro) : ''}</div>
                </article>`).join('')}
        </div>`;
    }

    async function abrirLaudo(laudoId, botao) {
        const rotulo = botao ? botao.textContent : '';
        if (botao) { botao.disabled = true; botao.textContent = 'Abrindo...'; }
        try {
            const r = await chamar('laudo', { sessao: state.sessao, laudo_id: laudoId });
            if (!r.ok) {
                if (r.erro === 'sessao_invalida') return sair();
                if (botao) { botao.disabled = false; botao.textContent = rotulo; }
                return alert('Não foi possível abrir o laudo agora. Tente de novo.');
            }
            window.open(r.url, '_blank', 'noopener');
        } catch (err) {
            console.error('[externo] laudo:', err);
            alert('Erro de conexão ao abrir o laudo.');
        } finally {
            if (botao) { botao.disabled = false; botao.textContent = rotulo; }
        }
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

        state.painel = r;
        verLista();
    }

    async function sair() {
        const s = state.sessao;
        state.sessao = null;
        state.painel = null;
        state.paciente = null;
        try { localStorage.removeItem(CHAVE_SESSAO); } catch (e) { /* ignora */ }
        if (s) { try { await chamar('logout', { sessao: s }); } catch (e) { /* ignora */ } }
        state.qrRotulo ? telaAbertura() : telaLogin();
    }

    // ── Início ──────────────────────────────────────────────────────────────

    async function iniciar() {
        const p = new URLSearchParams(location.search);
        state.token = p.get('t') || null;

        try { state.sessao = localStorage.getItem(CHAVE_SESSAO) || null; } catch (e) { state.sessao = null; }

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
                if (!silencioso) erroFatal('Este código não é mais válido ou já foi trocado pela clínica.');
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

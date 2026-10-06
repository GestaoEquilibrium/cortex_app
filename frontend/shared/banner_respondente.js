// ============================================================================
// CORTEX_APP — Banner de Respondente (compartilhado)
// ============================================================================
// Gera caixa colorida destacada que indica QUEM deve responder o questionário.
// Usado em:
//   - frontend/responder/<sigla>.js  → renderConsentimento() insere o banner
//   - portal/portal.js               → card de cada teste pendente
//
// Lê tipo_respondente do catálogo (cinco valores possíveis):
//   - paciente                 : próprio paciente responde sobre si
//   - responsavel              : pais/cuidador sobre paciente
//   - professor                : professor sobre aluno
//   - paciente_ou_responsavel  : adulto autorresponde, se menor pai junto
//   - responsavel_ou_professor : manual permite os dois
//
// API pública:
//   window.CortexRespondente.gerarBanner(tipo)        → string HTML
//   window.CortexRespondente.LABEL[tipo]              → label curto pra cards
//   window.CortexRespondente.descrever(tipo)          → texto descritivo
//   window.CortexRespondente.exigeCpf(tipo)           → true nos heterorrelatos
//
// CPF de quem responde (sprint_hetero_cpf):
//   Nas escalas de heterorrelato (responsavel, professor,
//   responsavel_ou_professor) a tela de consentimento ganha o bloco "Quem está
//   respondendo", com CPF obrigatório. Como todas as 33 páginas de resposta
//   chamam gerarBanner() nessa tela, o bloco é montado daqui: gerarBanner()
//   agenda a montagem logo depois que a página injeta o HTML, encaixando o
//   campo antes do aceite. O clique em "Começar" é interceptado antes do
//   handler da página: valida o CPF, registra no banco
//   (publico_registrar_respondente — recusa CPF inválido e o CPF do paciente)
//   e só então deixa o clique seguir para o consentimento. O banco também
//   recusa o consentimento sem CPF registrado, então não dá para pular.
// ============================================================================

(function() {
    'use strict';

    const DADOS = {
        paciente: {
            cor:        '#0c4a6e',
            bg:         '#e0f2fe',
            borda:      '#7dd3fc',
            icone:      '👤',
            label:      'Para o(a) próprio(a) paciente responder',
            titulo:     'Para o(a) próprio(a) paciente responder',
            descricao:  'Este questionário deve ser respondido pelo(a) próprio(a) paciente sobre si mesmo(a).'
        },
        responsavel: {
            cor:        '#581c87',
            bg:         '#f3e8ff',
            borda:      '#c4b5fd',
            icone:      '👨‍👩‍👧',
            label:      'Para pai, mãe ou responsável',
            titulo:     'Para pai, mãe ou responsável responder',
            descricao:  'Este questionário deve ser respondido pelo(a) pai, mãe ou responsável legal sobre a criança / adolescente avaliado(a).'
        },
        professor: {
            cor:        '#92400e',
            bg:         '#fef3c7',
            borda:      '#fcd34d',
            icone:      '🎓',
            label:      'Para o(a) professor(a) responder',
            titulo:     'Para o(a) professor(a) responder',
            descricao:  'Este questionário deve ser respondido pelo(a) professor(a) ou profissional do contexto educacional que acompanha o(a) aluno(a).'
        },
        paciente_ou_responsavel: {
            cor:        '#9a3412',
            bg:         '#ffedd5',
            borda:      '#fdba74',
            icone:      '👤 / 👨‍👩‍👧',
            label:      'Para o paciente — com ajuda do responsável, se necessário',
            titulo:     'Para o(a) paciente responder',
            descricao:  'Pode ser respondido pelo(a) próprio(a) paciente. Se for menor de idade ou tiver dificuldade, peça ajuda ao pai, mãe ou responsável.'
        },
        responsavel_ou_professor: {
            cor:        '#134e4a',
            bg:         '#ccfbf1',
            borda:      '#5eead4',
            icone:      '👨‍👩‍👧 / 🎓',
            label:      'Para pai, mãe, responsável OU professor(a)',
            titulo:     'Para pai, mãe, responsável ou professor(a) responder',
            descricao:  'Este questionário pode ser respondido pelo(a) pai/mãe/responsável OU pelo(a) professor(a) que convive diariamente com a criança / adolescente.'
        }
    };

    function dados(tipo) {
        return DADOS[tipo] || DADOS.paciente;  // fallback seguro
    }

    /**
     * Retorna o HTML da caixa colorida do banner.
     * @param {string} tipo - um dos valores de tipo_respondente
     * @returns {string} HTML pronto pra injetar
     */
    function gerarBanner(tipo) {
        const d = dados(tipo);
        // Heterorrelato: assim que a página colocar este HTML no DOM, encaixa o
        // bloco do CPF antes do aceite (ver cabeçalho).
        if (exigeCpf(tipo)) setTimeout(montarBlocoCpf, 0);
        return `
            <div class="cortex-banner-respondente" style="
                background: ${d.bg};
                border: 1.5px solid ${d.borda};
                border-radius: 10px;
                padding: 14px 16px;
                margin: 0 0 20px 0;
                display: flex;
                gap: 12px;
                align-items: flex-start;
            ">
                <div style="
                    font-size: 22px;
                    line-height: 1;
                    flex-shrink: 0;
                    min-width: 28px;
                ">${d.icone}</div>
                <div style="flex: 1; min-width: 0;">
                    <div style="
                        font-size: 11.5px;
                        font-weight: 800;
                        color: ${d.cor};
                        letter-spacing: 0.06em;
                        text-transform: uppercase;
                        margin-bottom: 4px;
                    ">${escapeHtml(d.titulo)}</div>
                    <div style="
                        font-size: 13px;
                        line-height: 1.5;
                        color: #1e293b;
                    ">${escapeHtml(d.descricao)}</div>
                </div>
            </div>
        `;
    }

    /**
     * Versão compacta — pra cards do portal do paciente
     * @param {string} tipo
     * @returns {string} HTML compacto (uma linha)
     */
    function gerarTag(tipo) {
        const d = dados(tipo);
        return `
            <span class="cortex-tag-respondente" style="
                display: inline-flex;
                gap: 6px;
                align-items: center;
                background: ${d.bg};
                border: 1px solid ${d.borda};
                color: ${d.cor};
                padding: 4px 10px;
                border-radius: 999px;
                font-size: 11px;
                font-weight: 700;
                letter-spacing: 0.03em;
                white-space: nowrap;
            ">
                <span>${d.icone}</span>
                <span>${escapeHtml(d.label)}</span>
            </span>
        `;
    }

    function descrever(tipo) {
        return dados(tipo).descricao;
    }

    // ────────────────────────────────────────────────────────────────────────
    // CPF de quem responde (heterorrelato)
    // ────────────────────────────────────────────────────────────────────────
    const TIPOS_HETERO = ['responsavel', 'professor', 'responsavel_ou_professor'];
    const cpfState = { registrado: false, cpf: '', interceptando: false, cliente: null };

    function exigeCpf(tipo) {
        return TIPOS_HETERO.indexOf(tipo) >= 0;
    }

    function soDigitos(v) {
        return String(v || '').replace(/\D/g, '');
    }

    function mascararCpf(v) {
        const d = soDigitos(v).slice(0, 11);
        let out = d;
        if (d.length > 9) out = d.slice(0, 3) + '.' + d.slice(3, 6) + '.' + d.slice(6, 9) + '-' + d.slice(9);
        else if (d.length > 6) out = d.slice(0, 3) + '.' + d.slice(3, 6) + '.' + d.slice(6);
        else if (d.length > 3) out = d.slice(0, 3) + '.' + d.slice(3);
        return out;
    }

    // Mesma conta do banco (publico_cpf_valido): dígitos verificadores.
    function cpfValido(v) {
        const d = soDigitos(v);
        if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
        let s = 0;
        for (let i = 0; i < 9; i++) s += parseInt(d[i], 10) * (10 - i);
        let d1 = (s * 10) % 11; if (d1 === 10) d1 = 0;
        s = 0;
        for (let i = 0; i < 10; i++) s += parseInt(d[i], 10) * (11 - i);
        let d2 = (s * 10) % 11; if (d2 === 10) d2 = 0;
        return d1 === parseInt(d[9], 10) && d2 === parseInt(d[10], 10);
    }

    function tokenDaUrl() {
        try { return new URLSearchParams(window.location.search).get('token'); } catch (_) { return null; }
    }

    // Cliente anônimo próprio, com chave de storage separada para não brigar
    // com o cliente da página.
    function clienteCpf() {
        if (cpfState.cliente) return cpfState.cliente;
        if (!window.supabase || !window.SUPABASE_CONFIG) return null;
        cpfState.cliente = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey, {
            auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'cortex-resp-cpf' }
        });
        return cpfState.cliente;
    }

    function injetarEstiloCpf() {
        if (document.getElementById('resp-cpf-estilo')) return;
        const st = document.createElement('style');
        st.id = 'resp-cpf-estilo';
        st.textContent = [
            '.resp-cpf{margin-top:22px;padding:18px;border-radius:14px;background:linear-gradient(135deg,#F5F3FF 0%,#EEF2FF 100%);border:1.5px solid #C4B5FD;}',
            '.resp-cpf-titulo{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#5B21B6;margin:0 0 6px;}',
            '.resp-cpf-titulo span{font-size:16px;}',
            '.resp-cpf p{margin:0 0 12px;font-size:13px;line-height:1.5;color:#334155;}',
            '.resp-cpf label{display:block;font-size:12px;font-weight:700;color:#4C1D95;margin-bottom:6px;}',
            '.resp-cpf input{width:100%;box-sizing:border-box;padding:13px 14px;border-radius:11px;border:1.5px solid #C4B5FD;background:#fff;font:600 17px/1.2 Inter,system-ui,sans-serif;letter-spacing:.06em;color:#141F3C;outline:none;transition:border-color .15s,box-shadow .15s;}',
            '.resp-cpf input:focus{border-color:#7C4DFF;box-shadow:0 0 0 3px rgba(124,77,255,.18);}',
            '.resp-cpf input.ok{border-color:#22C55E;}',
            '.resp-cpf input.erro{border-color:#EF4444;}',
            '.resp-cpf-erro{margin-top:8px;font-size:12.5px;font-weight:600;color:#B91C1C;line-height:1.4;}',
            '.resp-cpf-erro[hidden]{display:none;}'
        ].join('\n');
        document.head.appendChild(st);
    }

    function mostrarErroCpf(msg) {
        const el = document.getElementById('resp-cpf-erro');
        const input = document.getElementById('resp-cpf-input');
        if (el) { el.textContent = msg || ''; el.hidden = !msg; }
        if (input) input.classList.toggle('erro', !!msg);
    }

    // Monta o bloco na tela de consentimento, logo antes do aceite. Chamado
    // por gerarBanner() via setTimeout, quando o HTML da página já está no DOM.
    function montarBlocoCpf() {
        const aceite = document.querySelector('.consentimento-aceite');
        const btn = document.getElementById('btn-prosseguir');
        const check = document.getElementById('check-consentimento');
        if (!aceite || !btn || !check || !aceite.parentNode) return;
        if (document.getElementById('resp-cpf-bloco')) return;

        injetarEstiloCpf();
        const bloco = document.createElement('div');
        bloco.id = 'resp-cpf-bloco';
        bloco.className = 'resp-cpf';
        bloco.innerHTML =
            '<div class="resp-cpf-titulo"><span>🪪</span>Quem está respondendo</div>' +
            '<p>Informe o <strong>seu</strong> CPF — de quem está respondendo, e não o da pessoa avaliada. Ele fica registrado junto com as respostas.</p>' +
            '<label for="resp-cpf-input">Seu CPF</label>' +
            '<input id="resp-cpf-input" type="text" inputmode="numeric" autocomplete="off" placeholder="000.000.000-00" maxlength="14"' +
                (cpfState.cpf ? ' value="' + escapeHtml(mascararCpf(cpfState.cpf)) + '"' : '') + '>' +
            '<div class="resp-cpf-erro" id="resp-cpf-erro" hidden></div>';
        aceite.parentNode.insertBefore(bloco, aceite);

        const input = bloco.querySelector('#resp-cpf-input');
        const atualizar = () => {
            const ok = cpfValido(input.value);
            input.classList.toggle('ok', ok);
            // A página habilita o botão só pelo aceite; aqui o CPF também conta.
            btn.disabled = !check.checked || !ok;
        };
        input.addEventListener('input', () => {
            input.value = mascararCpf(input.value);
            if (soDigitos(input.value) !== cpfState.cpf) cpfState.registrado = false;
            cpfState.cpf = soDigitos(input.value);
            mostrarErroCpf('');
            atualizar();
        });
        // Registrado depois do handler da página, então roda depois dele e prevalece.
        check.addEventListener('change', atualizar);
        atualizar();

        if (!cpfState.interceptando) {
            document.addEventListener('click', interceptarComecar, true);
            cpfState.interceptando = true;
        }
    }

    // Captura o clique em "Começar" antes do handler da página: registra o CPF
    // no banco e, se deu certo, dispara o clique de novo para a página seguir.
    async function interceptarComecar(e) {
        const btn = e.target && e.target.closest ? e.target.closest('#btn-prosseguir') : null;
        if (!btn) return;
        const input = document.getElementById('resp-cpf-input');
        if (!input) return;                         // tela sem CPF: não interfere
        if (cpfState.registrado) return;            // já registrado: deixa passar

        e.preventDefault();
        e.stopImmediatePropagation();

        const cpf = soDigitos(input.value);
        if (!cpfValido(cpf)) {
            mostrarErroCpf('Informe um CPF válido.');
            input.focus();
            return;
        }
        const token = tokenDaUrl();
        const cli = clienteCpf();
        if (!token || !cli) {
            mostrarErroCpf('Não foi possível verificar o CPF. Recarregue a página.');
            return;
        }

        const textoOriginal = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Verificando CPF…';
        try {
            const { data, error } = await cli.rpc('publico_registrar_respondente', { p_token: token, p_cpf: cpf });
            if (error) throw error;
            if (data && data.erro) {
                const msgs = {
                    cpf_invalido: 'Informe um CPF válido.',
                    cpf_do_paciente: 'Este é o CPF da pessoa avaliada. Este questionário precisa ser respondido por outra pessoa — informe o seu CPF.',
                    token_invalido_ou_expirado: 'Este link não é mais válido. Peça um novo à clínica.',
                    nao_exige_cpf: ''
                };
                if (data.erro === 'nao_exige_cpf') {
                    // Catálogo mudou no meio do caminho: segue sem exigir.
                    cpfState.registrado = true;
                } else {
                    mostrarErroCpf(msgs[data.erro] || 'Não foi possível registrar o CPF. Tente de novo.');
                    btn.disabled = false;
                    btn.textContent = textoOriginal;
                    return;
                }
            } else {
                cpfState.registrado = true;
            }
            btn.disabled = false;
            btn.textContent = textoOriginal;
            btn.click();   // agora passa direto para o handler da página
        } catch (err) {
            console.warn('[respondente] cpf:', err);
            mostrarErroCpf('Não foi possível verificar o CPF. Confira sua internet e tente de novo.');
            btn.disabled = false;
            btn.textContent = textoOriginal;
        }
    }

    function escapeHtml(text) {
        if (text === null || text === undefined) return '';
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }

    // Exporta a API
    window.CortexRespondente = {
        gerarBanner,
        gerarTag,
        descrever,
        exigeCpf,
        cpfValido,
        LABEL: Object.fromEntries(Object.entries(DADOS).map(([k, v]) => [k, v.label])),
        TITULO: Object.fromEntries(Object.entries(DADOS).map(([k, v]) => [k, v.titulo]))
    };
})();

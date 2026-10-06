// ============================================================================
// CORTEX_APP — Portal da Escola (página pública, sem login)
// ----------------------------------------------------------------------------
// A escola abre pelo QR/link do aluno, se identifica uma vez, responde as
// escalas que o profissional liberou e anexa o relatório escolar.
//
// Esta página NÃO fala com o Supabase. Tudo passa pela Edge Function
// `escola-portal`, que é a única com service_role. Sem anon key aqui: se
// tivesse, a escola poderia tentar consultar tabela por fora.
//
// Telas: carregando → erro | identificacao | painel | escala | obrigado
// ============================================================================

(function () {
    'use strict';

    const FUNCAO_URL = 'https://fducqudteuarrmjndzhm.supabase.co/functions/v1/escola-portal';

    const FUNCOES = [
        'Professor(a) regente',
        'Professor(a) de apoio / AEE',
        'Coordenador(a) pedagógico(a)',
        'Diretor(a)',
        'Psicopedagogo(a)',
        'Outro'
    ];

    const state = {
        token: null,
        tela: 'carregando',
        dados: null,       // retorno do abrir
        escala: null,      // escala aberta
        respostas: {},
        enviando: false
    };

    const el = () => document.getElementById('esc-conteudo');

    function esc(t) {
        const d = document.createElement('div');
        d.textContent = (t === null || t === undefined) ? '' : String(t);
        return d.innerHTML;
    }

    // Corta a string ISO em vez de usar new Date: 'YYYY-MM-DD' é lido como
    // meia-noite UTC e em Brasília volta um dia.
    function dataBR(iso) {
        if (!iso) return '—';
        const p = String(iso).substring(0, 10).split('-');
        return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : '—';
    }

    let toastTimer = null;
    function toast(msg, tipo) {
        const antigo = document.querySelector('.esc-toast');
        if (antigo) antigo.remove();
        clearTimeout(toastTimer);
        const d = document.createElement('div');
        d.className = 'esc-toast' + (tipo ? ' ' + tipo : '');
        d.textContent = msg;
        document.body.appendChild(d);
        toastTimer = setTimeout(() => d.remove(), 3600);
    }

    // ── Conversa com a Edge Function ────────────────────────────────────────

    async function chamar(acao, extra) {
        const resp = await fetch(FUNCAO_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(Object.assign({ acao, token: state.token }, extra || {}))
        });
        return await resp.json();
    }

    async function enviarArquivo(file, titulo) {
        const fd = new FormData();
        fd.append('token', state.token);
        fd.append('arquivo', file);
        if (titulo) fd.append('titulo', titulo);
        const resp = await fetch(FUNCAO_URL, { method: 'POST', body: fd });
        return await resp.json();
    }

    const ERROS = {
        token_invalido:   ['Link não encontrado', 'Confira se o endereço foi copiado inteiro. Se você recebeu por mensagem, toque no link em vez de digitar.'],
        token_revogado:   ['Link encerrado', 'Este link foi encerrado pela clínica. Entre em contato com o Grupo Equilibrium para receber um novo.'],
        token_expirado:   ['Link vencido', 'O prazo deste link terminou. Entre em contato com o Grupo Equilibrium para receber um novo.'],
        token_ausente:    ['Link incompleto', 'Falta a parte final do endereço. Abra o link pelo QR code ou pela mensagem que você recebeu.'],
        falha_interna:    ['Erro no servidor', 'Algo deu errado do nosso lado. Tente de novo em alguns minutos.']
    };

    // ── Telas ───────────────────────────────────────────────────────────────

    function renderErro(titulo, texto) {
        state.tela = 'erro';
        el().innerHTML = `
            <div class="esc-cartao">
                <div class="esc-vazio">
                    <div class="esc-vazio-ic">🔒</div>
                    <h1>${esc(titulo)}</h1>
                    <p>${esc(texto)}</p>
                </div>
            </div>`;
    }

    function renderIdentificacao() {
        state.tela = 'identificacao';
        const d = state.dados;
        el().innerHTML = `
            <div class="esc-cartao">
                <h1>Relatório escolar</h1>
                <p>
                    O Grupo Equilibrium está realizando uma avaliação neuropsicológica
                    de <b>${esc(d.aluno)}</b> e a contribuição da escola é parte
                    importante desse processo.
                </p>
                <div class="esc-aluno">
                    <span>Aluno(a): <b>${esc(d.aluno)}</b></span>
                    <span>Nascimento: <b>${dataBR(d.nascimento)}</b></span>
                </div>
                <div class="esc-aviso info">
                    Antes de começar, diga quem está preenchendo. Essa informação
                    entra no laudo: uma escala respondida sem identificação não tem
                    valor técnico.
                </div>
                <div class="esc-campo">
                    <label for="i-escola">Nome da escola</label>
                    <input id="i-escola" type="text" autocomplete="organization"
                           placeholder="Ex.: EMEI Jardim das Flores" value="${esc(d.escola_nome || '')}">
                </div>
                <div class="esc-campo">
                    <label for="i-nome">Seu nome completo</label>
                    <input id="i-nome" type="text" autocomplete="name"
                           placeholder="Ex.: Maria Souza" value="${esc(d.respondente_nome || '')}">
                </div>
                <div class="esc-campo">
                    <label for="i-matricula">Sua matrícula profissional</label>
                    <input id="i-matricula" type="text" autocomplete="off" maxlength="40"
                           placeholder="Ex.: SEE-MG 1234567" value="${esc(d.respondente_matricula || '')}">
                    <small class="esc-dica">Número de matrícula na rede de ensino ou na escola. Fica registrado com as respostas.</small>
                </div>
                <div class="esc-campo">
                    <label for="i-funcao">Sua função na escola</label>
                    <select id="i-funcao">
                        <option value="">Selecione…</option>
                        ${FUNCOES.map(f => `<option value="${esc(f)}" ${d.respondente_funcao === f ? 'selected' : ''}>${esc(f)}</option>`).join('')}
                    </select>
                </div>
                <div class="esc-campo" id="i-outra-wrap" style="display:none;">
                    <label for="i-outra">Qual função?</label>
                    <input id="i-outra" type="text" placeholder="Descreva sua função">
                </div>
                <button class="esc-btn" id="i-ok">Começar</button>
            </div>`;

        const sel = document.getElementById('i-funcao');
        const wrap = document.getElementById('i-outra-wrap');
        const matEl = document.getElementById('i-matricula');
        sel.addEventListener('change', () => {
            wrap.style.display = sel.value === 'Outro' ? 'block' : 'none';
        });

        document.getElementById('i-ok').addEventListener('click', async (ev) => {
            const escola = document.getElementById('i-escola').value.trim();
            const nome = document.getElementById('i-nome').value.trim();
            let funcao = sel.value;
            if (funcao === 'Outro') funcao = (document.getElementById('i-outra').value || '').trim();

            const matricula = matEl.value.replace(/\s+/g, ' ').trim();

            if (!escola) { toast('Informe o nome da escola.', 'ruim'); return; }
            if (nome.length < 3) { toast('Informe seu nome completo.', 'ruim'); return; }
            if (!funcao) { toast('Informe sua função na escola.', 'ruim'); return; }
            if (matricula.length < 3 || matricula.length > 40) { toast('Informe sua matrícula profissional (3 a 40 caracteres).', 'ruim'); matEl.focus(); return; }

            ev.target.disabled = true;
            ev.target.textContent = 'Salvando…';
            const r = await chamar('identificar', { escola, nome, funcao, matricula });
            if (!r || !r.ok) {
                ev.target.disabled = false;
                ev.target.textContent = 'Começar';
                const msgs = {
                    matricula_invalida: 'Informe sua matrícula profissional (3 a 40 caracteres).',
                    identificacao_incompleta: 'Preencha todos os campos.',
                    token_invalido_ou_expirado: 'Este link não é mais válido. Peça um novo à clínica.'
                };
                toast(msgs[r && r.erro] || 'Não foi possível salvar. Tente de novo.', 'ruim');
                if (r && r.erro === 'matricula_invalida') matEl.focus();
                return;
            }
            await abrir();
        });
    }

    function renderPainel() {
        state.tela = 'painel';
        const d = state.dados;
        const pendentes = d.escalas.filter(e => !e.respondida);
        const feitas = d.escalas.filter(e => e.respondida);

        const lista = d.escalas.length ? d.escalas.map(e => `
            <button class="esc-escala ${e.respondida ? 'feita' : ''}"
                    data-id="${esc(e.aplicacao_id)}" ${e.respondida ? 'disabled' : ''}>
                <span class="esc-escala-ic">${e.respondida ? '✓' : '📝'}</span>
                <span class="esc-escala-mid">
                    <span class="esc-escala-sigla">${esc(e.sigla)}</span>
                    <span class="esc-escala-nome">${esc(e.nome)}</span>
                    <span class="esc-escala-sub">${e.respondida
                        ? `Respondida em ${dataBR(e.respondida_em)}${e.respondida_por ? ' por ' + esc(e.respondida_por) : ''}`
                        : 'Toque para responder'}</span>
                </span>
                ${e.respondida ? '' : '<span class="esc-escala-seta">›</span>'}
            </button>`).join('')
            : '<div class="esc-aviso info">Nenhum questionário foi liberado neste link. Se a clínica pediu para você preencher algo, entre em contato.</div>';

        const tudoFeito = d.escalas.length > 0 && pendentes.length === 0;

        el().innerHTML = `
            <div class="esc-cartao">
                <h1>Relatório escolar</h1>
                <div class="esc-aluno">
                    <span>Aluno(a): <b>${esc(d.aluno)}</b></span>
                    <span>Nascimento: <b>${dataBR(d.nascimento)}</b></span>
                </div>
                <p style="font-size:13px;color:#64748B;margin-bottom:0;">
                    Preenchido por <b>${esc(d.respondente_nome)}</b> · ${esc(d.respondente_funcao)}
                    · ${esc(d.escola_nome)}
                    <button class="esc-voltar" id="p-trocar" style="margin:0 0 0 6px;">alterar</button>
                </p>
            </div>

            ${tudoFeito ? `<div class="esc-aviso bom">
                <strong>Tudo respondido.</strong> ${feitas.length === 1 ? 'O questionário foi' : 'Os questionários foram'}
                enviado${feitas.length === 1 ? '' : 's'} com sucesso. Se quiser, ainda pode anexar o relatório escolar abaixo.
            </div>` : ''}

            <div class="esc-cartao">
                <h2>1. Questionários ${pendentes.length ? `· ${pendentes.length} pendente${pendentes.length > 1 ? 's' : ''}` : ''}</h2>
                ${lista}
            </div>

            <div class="esc-cartao">
                <h2>2. Relatório escolar (opcional)</h2>
                <p style="font-size:13.5px;">
                    Se a escola já tem um relatório, parecer ou boletim sobre o(a)
                    aluno(a), anexe aqui. Pode ser a foto de um documento impresso.
                </p>
                <div class="esc-anexo-area">
                    <div style="font-size:30px;">📎</div>
                    <p>PDF, JPG ou PNG · até 10 MB · no máximo 5 arquivos</p>
                    <input type="file" id="a-arquivo" accept="application/pdf,image/jpeg,image/png" style="display:none;">
                    <button class="esc-btn secundario" id="a-escolher">Escolher arquivo</button>
                </div>
                ${d.anexos > 0 ? `<div class="esc-anexo-lista">
                    <div class="esc-anexo-linha">✓ ${d.anexos} arquivo${d.anexos > 1 ? 's' : ''} enviado${d.anexos > 1 ? 's' : ''} por este link</div>
                </div>` : ''}
            </div>

            <p style="font-size:12px;color:#8A9BB5;text-align:center;">
                Link válido até ${dataBR(d.expira_em)}
            </p>`;

        document.getElementById('p-trocar').addEventListener('click', renderIdentificacao);

        document.querySelectorAll('.esc-escala[data-id]').forEach(b => {
            if (b.disabled) return;
            b.addEventListener('click', () => abrirEscala(b.dataset.id));
        });

        const input = document.getElementById('a-arquivo');
        document.getElementById('a-escolher').addEventListener('click', () => input.click());
        input.addEventListener('change', async () => {
            const f = input.files && input.files[0];
            if (!f) return;
            if (f.size > 10 * 1024 * 1024) { toast('Arquivo maior que 10 MB.', 'ruim'); input.value = ''; return; }

            const btn = document.getElementById('a-escolher');
            btn.disabled = true;
            btn.textContent = 'Enviando…';
            const r = await enviarArquivo(f, f.name);
            input.value = '';
            btn.disabled = false;
            btn.textContent = 'Escolher arquivo';

            if (r && r.ok) { toast('Arquivo enviado.', 'bom'); await abrir(); return; }

            const msgs = {
                tipo_nao_permitido: 'Só PDF, JPG ou PNG.',
                arquivo_grande: 'Arquivo maior que 10 MB.',
                arquivo_vazio: 'O arquivo está vazio.',
                limite_de_anexos: 'Já foram enviados 5 arquivos por este link.',
                identificacao_pendente: 'Identifique-se antes de anexar.'
            };
            toast(msgs[r && r.erro] || 'Não foi possível enviar o arquivo.', 'ruim');
        });
    }

    function renderEscala() {
        state.tela = 'escala';
        const e = state.escala;
        const labels = (e.norma && e.norma.answer_labels) || [];
        const min = (e.norma && e.norma.escala_min) || 0;
        const max = (e.norma && e.norma.escala_max);

        const itensHtml = e.itens.map(it => {
            const atual = state.respostas[it.numero];
            const opcoes = (it.opcoes && it.opcoes.length)
                ? it.opcoes.map((o, i) => ({ v: i, label: (typeof o === 'object' ? o.texto : o) }))
                : labelsParaOpcoes(labels, min, max);

            return `
                <div class="esc-item ${atual !== undefined ? 'ok' : ''}" id="it-${it.numero}">
                    <div class="esc-item-txt">
                        <span class="esc-item-num">${it.numero}</span>
                        <span>${esc(it.texto)}</span>
                    </div>
                    <div class="esc-opcoes">
                        ${opcoes.map(o => `
                            <button class="esc-opcao ${atual === o.v ? 'ativa' : ''}"
                                    data-num="${it.numero}" data-v="${o.v}" type="button">${esc(o.label)}</button>`).join('')}
                    </div>
                </div>`;
        }).join('');

        el().innerHTML = `
            <button class="esc-voltar" id="e-voltar">‹ Voltar aos questionários</button>
            <div class="esc-progresso">
                <span id="e-status">—</span>
                <div class="esc-progresso-barra"><div class="esc-progresso-fill" id="e-fill" style="width:0%"></div></div>
            </div>
            <div class="esc-cartao">
                <span class="esc-escala-sigla">${esc(e.sigla)}</span>
                <h1 style="margin-top:3px;">${esc(e.nome)}</h1>
                <p>
                    Responda pensando no comportamento do(a) aluno(a) <b>no ambiente
                    escolar</b>, considerando os últimos meses. Não existe resposta
                    certa ou errada. Suas respostas vão sendo salvas sozinhas.
                </p>
            </div>
            ${itensHtml}
            <button class="esc-btn" id="e-enviar" disabled>Enviar respostas</button>
            <p style="font-size:12px;color:#8A9BB5;text-align:center;margin-top:10px;">
                Depois de enviar não é possível alterar.
            </p>`;

        document.getElementById('e-voltar').addEventListener('click', () => abrir());

        document.querySelectorAll('.esc-opcao').forEach(b => {
            b.addEventListener('click', () => {
                const num = parseInt(b.dataset.num, 10);
                state.respostas[num] = parseInt(b.dataset.v, 10);
                pintarItem(num);
                atualizarProgresso();
                salvar();
                const prox = state.escala.itens.find(i => i.numero > num && state.respostas[i.numero] === undefined);
                if (prox) {
                    setTimeout(() => {
                        const d = document.getElementById('it-' + prox.numero);
                        if (d && d.scrollIntoView) d.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }, 90);
                }
            });
        });

        document.getElementById('e-enviar').addEventListener('click', finalizar);
        atualizarProgresso();
    }

    // Monta as opções a partir dos answer_labels da norma. Se a norma não
    // trouxer rótulos, cai no número puro — melhor que inventar texto.
    function labelsParaOpcoes(labels, min, max) {
        const fim = (max === undefined || max === null) ? (labels.length ? labels.length - 1 : 3) : max;
        const out = [];
        for (let v = min; v <= fim; v++) {
            const idx = v - min;
            out.push({ v, label: labels[idx] !== undefined ? labels[idx] : String(v) });
        }
        return out;
    }

    function pintarItem(num) {
        const d = document.getElementById('it-' + num);
        if (!d) return;
        d.classList.toggle('ok', state.respostas[num] !== undefined);
        d.querySelectorAll('.esc-opcao').forEach(b => {
            b.classList.toggle('ativa', state.respostas[num] === parseInt(b.dataset.v, 10));
        });
    }

    function atualizarProgresso() {
        const total = state.escala.itens.length;
        const feitos = state.escala.itens.filter(i => state.respostas[i.numero] !== undefined).length;
        const falta = total - feitos;
        const st = document.getElementById('e-status');
        const fill = document.getElementById('e-fill');
        const btn = document.getElementById('e-enviar');
        if (st) st.textContent = falta === 0
            ? `✓ Todas as ${total} respondidas`
            : `${feitos} de ${total} · faltam ${falta}`;
        if (fill) fill.style.width = (total ? Math.round(feitos / total * 100) : 0) + '%';
        if (btn) btn.disabled = falta !== 0;
    }

    let salvandoAgora = false;
    let salvarTimer = null;
    function salvar() {
        clearTimeout(salvarTimer);
        salvarTimer = setTimeout(async () => {
            if (salvandoAgora) return;
            salvandoAgora = true;
            try {
                await chamar('salvar', {
                    aplicacao_id: state.escala.aplicacao_id,
                    respostas: state.respostas
                });
            } catch (err) {
                // Falha silenciosa: quem está respondendo não precisa saber
                // que o autosave piscou. O envio final é que vale.
                console.warn('autosave:', err);
            } finally {
                salvandoAgora = false;
            }
        }, 900);
    }

    async function finalizar() {
        if (state.enviando) return;
        const btn = document.getElementById('e-enviar');
        state.enviando = true;
        btn.disabled = true;
        btn.textContent = 'Enviando…';

        const r = await chamar('finalizar', {
            aplicacao_id: state.escala.aplicacao_id,
            respostas: state.respostas
        });

        state.enviando = false;

        if (r && r.ok) {
            toast('Questionário enviado. Obrigado!', 'bom');
            await abrir();
            window.scrollTo(0, 0);
            return;
        }

        btn.disabled = false;
        btn.textContent = 'Enviar respostas';
        const msgs = {
            respostas_incompletas: 'Faltou responder alguma questão. Confira a lista.',
            identificacao_pendente: 'Identifique-se antes de enviar.',
            escala_fora_do_link: 'Este questionário não faz parte do seu link.',
            escala_ja_finalizada_ou_sem_link: 'Este questionário já foi enviado.'
        };
        toast(msgs[r && r.erro] || 'Não foi possível enviar. Verifique sua conexão.', 'ruim');
    }

    // ── Navegação ───────────────────────────────────────────────────────────

    async function abrirEscala(aplicacaoId) {
        el().innerHTML = '<div class="esc-carregando"><div class="esc-spinner"></div><p>Abrindo questionário…</p></div>';
        const r = await chamar('escala', { aplicacao_id: aplicacaoId });
        if (!r || !r.ok) {
            toast('Não foi possível abrir o questionário.', 'ruim');
            await abrir();
            return;
        }
        r.aplicacao_id = aplicacaoId;
        state.escala = r;
        state.respostas = {};
        const p = r.respostas_parciais || {};
        Object.keys(p).forEach(k => {
            const n = parseInt(k, 10);
            const v = parseInt(p[k], 10);
            if (Number.isFinite(n) && Number.isFinite(v)) state.respostas[n] = v;
        });
        renderEscala();
        window.scrollTo(0, 0);
    }

    async function abrir() {
        const r = await chamar('abrir', {});
        if (!r || r.erro) {
            const e = ERROS[r && r.erro] || ['Link inválido', 'Não foi possível abrir este link.'];
            renderErro(e[0], e[1]);
            return;
        }
        state.dados = r;
        const rot = document.getElementById('esc-rotulo');
        if (rot) rot.textContent = r.aluno ? `Aluno(a): ${r.aluno}` : '';
        if (!r.identificado) renderIdentificacao();
        else renderPainel();
    }

    // ── Início ──────────────────────────────────────────────────────────────

    document.addEventListener('DOMContentLoaded', () => {
        const p = new URLSearchParams(window.location.search);
        state.token = p.get('t') || p.get('token');
        if (!state.token) {
            renderErro('Link incompleto',
                'Falta a parte final do endereço. Abra pelo QR code ou toque no link da mensagem que você recebeu.');
            return;
        }
        abrir();
    });
})();

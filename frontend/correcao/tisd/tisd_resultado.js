// ============================================================================
// CORTEX_APP — TISD (Teste para Identificação de Sinais de Dislexia)
// ----------------------------------------------------------------------------
// Aplicação presencial, com o livro na frente da criança. O sistema NÃO guarda
// estímulo nenhum: ele é a folha de pontuação. O profissional digita o que
// contou no papel, a tela soma por subteste e a função tisd_calcular do banco
// converte em percentil.
//
// A tabela normativa vive no banco e não tem policy de SELECT: o navegador
// nunca a recebe. Se a faixa não estiver cadastrada, o laudo mostra a bruta e
// diz que falta a norma — nunca inventa percentil.
//
// As normas do manual são por ANO ESCOLAR (1º ao 5º), não por idade. Há tabela
// da população geral para os cinco anos, e tabela por região só para Sudeste
// (1º–5º), Centro-Oeste (1º–3º) e Nordeste (3º–5º).
//
// Padrão do FDT: tisd_brutos (o que foi digitado) + tisd_resultados (calculado).
// ============================================================================

(function () {
    'use strict';

    const SIGLA_ESPERADA = 'TISD';

    // A folha de pontuação, na mesma ordem do papel.
    const SUBTESTES = [
        {
            cod: 'leitura', num: 1, nome: 'Leitura', cor: '#2F6FED', ic: '📖',
            campos: [
                { c: 'lei_letras',   r: 'Total de letras lidas incorretamente',         max: 21 },
                { c: 'lei_palavras', r: 'Total de palavras lidas incorretamente',       max: 9 },
                { c: 'lei_pseudo',   r: 'Total de pseudopalavras lidas incorretamente', max: 9 }
            ]
        },
        {
            cod: 'escrita', num: 2, nome: 'Escrita', cor: '#7C4DFF', ic: '✍️',
            campos: [
                // O exemplo resolvido do manual traz 10 letras escritas
                // incorretamente, então o teto aqui é 21 (as mesmas letras da
                // leitura), não 9.
                { c: 'esc_letras',   r: 'Total de letras escritas incorretamente',         max: 21 },
                { c: 'esc_palavras', r: 'Total de palavras escritas incorretamente',       max: 9 },
                { c: 'esc_pseudo',   r: 'Total de pseudopalavras escritas incorretamente', max: 9 }
            ]
        },
        {
            cod: 'atencao', num: 3, nome: 'Atenção visual', cor: '#06B6D4', ic: '👁️',
            campos: [
                { c: 'atv_adicao',  r: 'Total adição',  max: 176 },
                { c: 'atv_omissao', r: 'Total omissão', max: 19 }
            ]
        },
        {
            cod: 'calculo', num: 4, nome: 'Cálculo', cor: '#F59E0B', ic: '🔢',
            campos: [
                { c: 'cal_p1', r: 'Problema 1', max: 1 },
                { c: 'cal_p2', r: 'Problema 2', max: 1 },
                { c: 'cal_p3', r: 'Problema 3', max: 1 },
                { c: 'cal_p4', r: 'Problema 4', max: 1 }
            ]
        },
        {
            cod: 'motoras', num: 5, nome: 'Habilidades motoras', cor: '#22C55E', ic: '✏️',
            campos: [
                { c: 'hmo_circulo',   r: 'Círculo',   max: 2 },
                { c: 'hmo_retangulo', r: 'Retângulo', max: 2 },
                { c: 'hmo_quadrado',  r: 'Quadrado',  max: 2 },
                { c: 'hmo_triangulo', r: 'Triângulo', max: 2 },
                { c: 'hmo_cruz',      r: 'Cruz',      max: 2 }
            ]
        },
        {
            cod: 'fonologica', num: 6, nome: 'Consciência fonológica', cor: '#EC4899', ic: '🔊',
            campos: [
                { c: 'cfo_rima',     r: 'Total de erros de rima',              max: 3 },
                { c: 'cfo_producao', r: 'Total de erros de produção de rima',  max: 3 }
            ]
        },
        {
            cod: 'nomeacao', num: 7, nome: 'Nomeação rápida', cor: '#0EA5E9', ic: '⏱️',
            // A folha registra PONTOS, não tempo: 1 ponto por erro e 1 ponto a
            // cada 5 segundos. A calculadora abaixo é só um atalho de conta —
            // o que fica salvo é o ponto, igual ao papel.
            campos: [
                { c: 'nom_letras',  r: 'Total de pontos em nomeação de letras',  max: null, calc: true },
                { c: 'nom_numeros', r: 'Total de pontos em nomeação de números', max: null, calc: true }
            ]
        },
        {
            cod: 'memoria', num: 8, nome: 'Memória de curto prazo', cor: '#8B5CF6', ic: '🧠',
            campos: [
                { c: 'mcp_digitos', r: 'Total de erro em dígitos',        max: 6 },
                { c: 'mcp_pseudo',  r: 'Total de erro em pseudopalavras', max: 6 }
            ]
        }
    ];

    // Anos escolares com tabela normativa por região (Tabelas 35, 36 e 37 do
    // manual). Norte e Sul ficam na folha porque a folha os traz, mas o manual
    // ainda não publicou norma para eles.
    const REGIOES = [
        ['sudeste',      'Sudeste',      [1, 2, 3, 4, 5]],
        ['nordeste',     'Nordeste',     [3, 4, 5]],
        ['centro_oeste', 'Centro-Oeste', [1, 2, 3]],
        ['norte',        'Norte',        []],
        ['sul',          'Sul',          []]
    ];

    const ANOS = [1, 2, 3, 4, 5];

    function nomeRegiao(v) {
        const r = REGIOES.find(x => x[0] === v);
        return r ? r[1] : '—';
    }

    function temNormaRegional(v, ano) {
        const r = REGIOES.find(x => x[0] === v);
        return !!(r && ano && r[2].indexOf(Number(ano)) !== -1);
    }

    const TODOS_CAMPOS = SUBTESTES.reduce((a, s) => a.concat(s.campos.map(c => c.c)), []);

    const state = {
        aplicacaoId: null,
        aplicacao: null,
        paciente: null,
        brutos: {},
        resultado: null,
        amostraGeral: null,
        amostraRegiao: null,
        tela: 'entrada'   // entrada | laudo
    };

    const c = () => window.cortexClient;
    const el = () => document.getElementById('tisd-conteudo');
    const toast = (m, t) => { if (window.CortexUI && window.CortexUI.toast) window.CortexUI.toast(m, t); };

    function esc(t) {
        const d = document.createElement('div');
        d.textContent = (t === null || t === undefined) ? '' : String(t);
        return d.innerHTML;
    }

    // Corta a string ISO: new Date('YYYY-MM-DD') é meia-noite UTC e volta um
    // dia em Brasília.
    function dataBR(iso) {
        if (!iso) return '—';
        const p = String(iso).substring(0, 10).split('-');
        return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : '—';
    }

    function idadeEm(nascISO, refISO) {
        if (!nascISO) return null;
        const n = String(nascISO).substring(0, 10).split('-').map(Number);
        const r = refISO ? String(refISO).substring(0, 10).split('-').map(Number)
                         : (() => { const d = new Date(); return [d.getFullYear(), d.getMonth() + 1, d.getDate()]; })();
        let anos = r[0] - n[0];
        let meses = r[1] - n[1];
        if (r[2] < n[2]) meses--;
        if (meses < 0) { anos--; meses += 12; }
        return { anos, meses };
    }

    // ── Carga ───────────────────────────────────────────────────────────────

    async function carregar() {
        const { data: ap, error: e1 } = await c()
            .from('aplicacoes_instrumento').select('*').eq('id', state.aplicacaoId).single();
        if (e1) throw new Error('Aplicação: ' + e1.message);
        state.aplicacao = ap;

        const { data: inst, error: e2 } = await c()
            .from('instrumentos_catalogo').select('id, sigla, nome_completo')
            .eq('id', ap.instrumento_id).single();
        if (e2) throw new Error('Instrumento: ' + e2.message);
        if (inst.sigla !== SIGLA_ESPERADA) {
            throw new Error(`Esperado ${SIGLA_ESPERADA}, encontrado ${inst.sigla}`);
        }
        state.instrumento = inst;

        const { data: pac, error: e3 } = await c()
            .from('pacientes').select('id, nome_completo, data_nascimento, sexo, escolaridade')
            .eq('id', ap.paciente_id).single();
        if (e3) throw new Error('Paciente: ' + e3.message);
        state.paciente = pac;

        const { data: br } = await c()
            .from('tisd_brutos').select('*').eq('aplicacao_id', state.aplicacaoId).maybeSingle();
        state.brutos = br || {};

        const { data: res } = await c()
            .from('tisd_resultados').select('*').eq('aplicacao_id', state.aplicacaoId).maybeSingle();
        state.resultado = res || null;

        state.tela = state.resultado ? 'laudo' : 'entrada';
        if (state.resultado) await carregarAmostras();

        if (window.CortexAudit) {
            window.CortexAudit.log('leitura', 'tisd_brutos', state.aplicacaoId, {
                pacienteId: pac.id, detalhes: { sigla: SIGLA_ESPERADA }
            });
        }
    }

    // A amostra de referência é opcional no laudo: se a função não existir ou
    // devolver erro, o laudo sai sem a nota de rodapé em vez de quebrar.
    async function carregarAmostras() {
        state.amostraGeral = null;
        state.amostraRegiao = null;
        const r = state.resultado;
        if (!r || !r.ano_escolar) return;
        try {
            const g = await c().rpc('tisd_amostra', { p_regiao: 'geral', p_ano: r.ano_escolar });
            if (!g.error) state.amostraGeral = g.data || null;
            if (r.regiao && temNormaRegional(r.regiao, r.ano_escolar)) {
                const x = await c().rpc('tisd_amostra', { p_regiao: r.regiao, p_ano: r.ano_escolar });
                if (!x.error) state.amostraRegiao = x.data || null;
            }
        } catch (e) {
            console.warn('[tisd amostra]', e);
        }
    }

    // ── Tela de digitação ───────────────────────────────────────────────────

    function renderEntrada() {
        const b = state.brutos;
        const dataApl = (state.aplicacao.data_aplicacao || '').substring(0, 10)
                        || new Date().toISOString().substring(0, 10);

        const cards = SUBTESTES.map(s => `
            <div class="tisd-sub" style="border-left-color:${s.cor};">
                <div class="tisd-sub-cab">
                    <span class="tisd-sub-ic">${s.ic}</span>
                    <span class="tisd-sub-nome">${s.num}. ${esc(s.nome)}</span>
                    <span class="tisd-sub-total" id="st-${s.cod}">0</span>
                </div>
                ${s.campos.map(f => `
                    <div class="tisd-linha">
                        <label for="f-${f.c}">${esc(f.r)}</label>
                        <div class="tisd-entrada">
                            <input type="number" id="f-${f.c}" data-campo="${f.c}" min="0"
                                   ${f.max !== null ? `max="${f.max}"` : ''}
                                   value="${b[f.c] !== undefined && b[f.c] !== null ? b[f.c] : ''}"
                                   placeholder="0" inputmode="numeric">
                            <span class="tisd-max">${f.max !== null ? 'máx ' + f.max : 'pontos'}</span>
                        </div>
                    </div>
                    ${f.calc ? `
                    <div class="tisd-calc" data-alvo="${f.c}">
                        <span class="tisd-calc-rot">Calcular os pontos:</span>
                        <input type="number" min="0" class="tisd-calc-seg" placeholder="segundos" inputmode="numeric">
                        <input type="number" min="0" class="tisd-calc-err" placeholder="erros" inputmode="numeric">
                        <button type="button" class="tisd-calc-btn">= pontos</button>
                        <span class="tisd-calc-regra">1 ponto por erro + 1 ponto a cada 5 segundos</span>
                    </div>` : ''}`).join('')}
            </div>`).join('');

        el().innerHTML = `
            <div class="page-header">
                <div class="page-title">
                    <h1>TISD — folha de pontuação</h1>
                    <p>${esc(state.paciente.nome_completo)}</p>
                </div>
            </div>

            <div class="tisd-aviso info">
                O TISD é aplicado com o livro de aplicação. Aqui entra só o que você
                já contou na folha: a tela soma por subteste e o sistema converte em
                percentil pela tabela normativa.
            </div>

            <div class="card tisd-cab">
                <div class="tisd-campo">
                    <label>Avaliado(a)</label>
                    <input type="text" value="${esc(state.paciente.nome_completo)}" disabled>
                </div>
                <div class="tisd-campo">
                    <label>Nascimento</label>
                    <input type="text" value="${dataBR(state.paciente.data_nascimento)}" disabled>
                </div>
                <div class="tisd-campo">
                    <label for="h-data">Data de aplicação</label>
                    <input type="date" id="h-data" value="${dataApl}">
                </div>
                <div class="tisd-campo">
                    <label for="h-avaliador">Avaliador(a)</label>
                    <input type="text" id="h-avaliador" value="${esc(b.avaliador || '')}" placeholder="Nome de quem aplicou">
                </div>
                <div class="tisd-campo">
                    <label for="h-escola">Tipo de escola</label>
                    <select id="h-escola">
                        <option value="">—</option>
                        <option value="publica" ${b.tipo_escola === 'publica' ? 'selected' : ''}>Pública</option>
                        <option value="privada" ${b.tipo_escola === 'privada' ? 'selected' : ''}>Privada</option>
                    </select>
                </div>
                <div class="tisd-campo">
                    <label for="h-ano">Ano escolar <span class="tisd-obrig">obrigatório</span></label>
                    <select id="h-ano">
                        <option value="">—</option>
                        ${ANOS.map(a => `<option value="${a}" ${Number(b.ano_escolar) === a ? 'selected' : ''}>${a}º ano</option>`).join('')}
                    </select>
                </div>
                <div class="tisd-campo">
                    <label for="h-regiao">Região do país</label>
                    <select id="h-regiao">
                        <option value="">—</option>
                        ${REGIOES.map(([v, n]) => `<option value="${v}" ${b.regiao === v ? 'selected' : ''}>${n}</option>`).join('')}
                    </select>
                </div>
                <div class="tisd-campo largo">
                    <div class="tisd-nota-norma" id="nota-norma"></div>
                </div>
            </div>

            <div class="tisd-subs">${cards}</div>

            <div class="card tisd-rodape">
                <div class="tisd-bruta">
                    <span>Pontuação bruta total</span>
                    <strong id="bruta-total">0</strong>
                </div>
                <div class="tisd-campo largo">
                    <label for="h-obs">Outras observações</label>
                    <textarea id="h-obs" rows="3" placeholder="Indicadores qualitativos, comportamento durante a aplicação…">${esc(b.observacoes || '')}</textarea>
                </div>
                <label class="tisd-check">
                    <input type="checkbox" id="h-encaminhar" ${b.encaminhamento ? 'checked' : ''}>
                    <span>Encaminhamento para avaliação</span>
                </label>
            </div>

            <div class="tisd-acoes">
                <button class="btn btn-primary" id="btn-calcular">Calcular e gerar laudo</button>
                <button class="btn btn-secondary" id="btn-salvar">Salvar sem calcular</button>
            </div>`;

        el().querySelectorAll('input[data-campo]').forEach(i => {
            i.addEventListener('input', somar);
        });
        el().querySelectorAll('.tisd-calc').forEach(bloco => {
            bloco.querySelector('.tisd-calc-btn').addEventListener('click', () => {
                const seg = parseInt(bloco.querySelector('.tisd-calc-seg').value, 10);
                const err = parseInt(bloco.querySelector('.tisd-calc-err').value, 10);
                if (!Number.isFinite(seg) && !Number.isFinite(err)) {
                    toast('Informe o tempo em segundos e/ou os erros.', 'warning');
                    return;
                }
                const pontos = (Number.isFinite(err) && err > 0 ? err : 0)
                             + (Number.isFinite(seg) && seg > 0 ? Math.floor(seg / 5) : 0);
                const alvo = document.getElementById('f-' + bloco.dataset.alvo);
                if (alvo) { alvo.value = pontos; somar(); }
            });
        });
        document.getElementById('h-ano').addEventListener('change', notaNorma);
        document.getElementById('h-regiao').addEventListener('change', notaNorma);
        document.getElementById('btn-salvar').addEventListener('click', () => salvar(false));
        document.getElementById('btn-calcular').addEventListener('click', () => salvar(true));
        somar();
        notaNorma();
    }

    // Diz, antes de calcular, o que a norma vai conseguir entregar.
    function notaNorma() {
        const alvo = document.getElementById('nota-norma');
        if (!alvo) return;
        const ano = document.getElementById('h-ano').value;
        const reg = document.getElementById('h-regiao').value;

        if (!ano) {
            alvo.className = 'tisd-nota-norma alerta';
            alvo.textContent = 'Sem o ano escolar o sistema não converte a bruta em percentil — '
                             + 'as tabelas do manual são por ano escolar, do 1º ao 5º.';
            return;
        }
        if (!reg) {
            alvo.className = 'tisd-nota-norma info';
            alvo.textContent = `Sai o percentil da população geral (${ano}º ano). `
                             + 'Informe a região para sair também o percentil regional.';
            return;
        }
        if (temNormaRegional(reg, ano)) {
            alvo.className = 'tisd-nota-norma bom';
            alvo.textContent = `Saem as duas classificações: população geral e ${nomeRegiao(reg)}, ${ano}º ano.`;
            return;
        }
        alvo.className = 'tisd-nota-norma alerta';
        alvo.textContent = `O manual não publicou tabela de ${nomeRegiao(reg)} para o ${ano}º ano. `
                         + 'O laudo sai com o percentil da população geral e sem o regional.';
    }

    // Soma na tela com a mesma conta da tisd_calcular. É só conferência visual:
    // o número que vale é o que o banco calcula.
    function somar() {
        let total = 0;
        SUBTESTES.forEach(s => {
            let t = 0;
            s.campos.forEach(f => {
                const v = parseInt((document.getElementById('f-' + f.c) || {}).value, 10);
                if (Number.isFinite(v) && v > 0) t += v;
            });
            const alvo = document.getElementById('st-' + s.cod);
            if (alvo) alvo.textContent = t;
            total += t;
        });
        const bt = document.getElementById('bruta-total');
        if (bt) bt.textContent = total;
    }

    async function salvar(eCalcular) {
        const btn = document.getElementById(eCalcular ? 'btn-calcular' : 'btn-salvar');
        const rotulo = btn.textContent;
        btn.disabled = true;
        btn.textContent = eCalcular ? 'Calculando…' : 'Salvando…';

        try {
            const linha = { aplicacao_id: state.aplicacaoId };
            let foraDaEscala = [];

            SUBTESTES.forEach(s => s.campos.forEach(f => {
                const bruto = (document.getElementById('f-' + f.c) || {}).value;
                if (bruto === '' || bruto === undefined) { linha[f.c] = null; return; }
                const v = parseInt(bruto, 10);
                if (!Number.isFinite(v) || v < 0) { linha[f.c] = null; return; }
                if (f.max !== null && v > f.max) foraDaEscala.push(`${f.r} (máx ${f.max})`);
                linha[f.c] = v;
            }));

            // Quem contou foi o profissional, no papel. Se o valor passar do
            // máximo que conheço, eu aviso e salvo mesmo assim — não recuso a
            // contagem dele.
            if (foraDaEscala.length) {
                toast('Confira: ' + foraDaEscala[0] + (foraDaEscala.length > 1
                      ? ` (e mais ${foraDaEscala.length - 1})` : ''), 'warning');
            }

            const anoSel = document.getElementById('h-ano').value;
            linha.ano_escolar   = anoSel ? parseInt(anoSel, 10) : null;
            linha.regiao        = document.getElementById('h-regiao').value || null;
            linha.tipo_escola   = document.getElementById('h-escola').value || null;
            linha.avaliador     = document.getElementById('h-avaliador').value.trim() || null;
            linha.observacoes   = document.getElementById('h-obs').value.trim() || null;
            linha.encaminhamento = document.getElementById('h-encaminhar').checked;
            linha.updated_at    = new Date().toISOString();
            if (window.cortexProfissional) linha.created_by = window.cortexProfissional.id;

            const dataApl = document.getElementById('h-data').value;
            if (dataApl) {
                const { error } = await c().from('aplicacoes_instrumento')
                    .update({ data_aplicacao: dataApl }).eq('id', state.aplicacaoId);
                if (error) throw error;
                state.aplicacao.data_aplicacao = dataApl;
            }

            const { error: errB } = await c().from('tisd_brutos')
                .upsert(linha, { onConflict: 'aplicacao_id' });
            if (errB) throw errB;
            state.brutos = linha;

            if (window.CortexAudit) {
                window.CortexAudit.log(state.resultado ? 'edicao' : 'criacao', 'tisd_brutos',
                    state.aplicacaoId, { pacienteId: state.paciente.id });
            }

            if (!eCalcular) {
                toast('Folha salva.', 'success');
                btn.disabled = false;
                btn.textContent = rotulo;
                return;
            }

            const { data, error } = await c().rpc('tisd_calcular', { p_aplicacao_id: state.aplicacaoId });
            if (error) throw error;
            if (!data || data.erro) {
                const m = {
                    sem_profissional: 'Seu usuário não está ligado a um profissional.',
                    sem_brutos: 'A folha não foi salva. Tente de novo.'
                };
                toast(m[data && data.erro] || 'Não foi possível calcular.', 'danger');
                btn.disabled = false;
                btn.textContent = rotulo;
                return;
            }

            const { data: res } = await c().from('tisd_resultados')
                .select('*').eq('aplicacao_id', state.aplicacaoId).maybeSingle();
            state.resultado = res;
            await carregarAmostras();
            state.tela = 'laudo';
            renderizar();
            window.scrollTo(0, 0);
            if (data.motivo === 'sem_ano_escolar') {
                toast('Calculado sem percentil: falta o ano escolar.', 'warning');
            } else if (!data.norma_encontrada) {
                toast('Calculado. Falta a tabela normativa para o percentil.', 'warning');
            } else {
                toast('Calculado.', 'success');
            }
        } catch (err) {
            console.error('[tisd salvar]', err);
            toast('Erro: ' + (err.message || 'desconhecido'), 'danger');
            btn.disabled = false;
            btn.textContent = rotulo;
        }
    }

    // ── Laudo ───────────────────────────────────────────────────────────────

    function renderLaudo() {
        const r = state.resultado;
        const b = state.brutos;
        const dataApl = state.aplicacao.data_aplicacao || state.aplicacao.created_at;
        const id = idadeEm(state.paciente.data_nascimento, dataApl);
        const idadeStr = id ? `${id.anos} ano${id.anos !== 1 ? 's' : ''} e ${id.meses} mes${id.meses !== 1 ? 'es' : ''}` : '—';
        const regiaoNome = r.regiao ? nomeRegiao(r.regiao) : '—';
        const anoStr = r.ano_escolar ? r.ano_escolar + 'º ano' : '—';

        // Faixa visual da classificação. Mesma ordem das sete faixas do manual.
        const FAIXA = {
            'Déficit grave':           'grave',
            'Déficit moderado':        'moderado',
            'Déficit leve':            'leve',
            'Alerta para déficit':     'alerta',
            'Dentro do esperado':      'bom',
            'Acima do esperado':       'bom',
            'Muito acima do esperado': 'otimo'
        };

        function amostraTxt(a) {
            if (!a || a.n === null || a.n === undefined) return '';
            const num = v => (v === null || v === undefined) ? '—' : String(v).replace('.', ',');
            return `Amostra de referência: N = ${a.n} · M = ${num(a.media)} (DP = ${num(a.desvio)}) · `
                 + `bruta de ${a.minimo} a ${a.maximo}.`;
        }

        function cartao(rot, pc, cl, amostra, vazio) {
            const faixa = FAIXA[cl] || '';
            return `
                <div class="tisd-classif-card ${faixa}">
                    <div class="tisd-classif-rot">${rot}</div>
                    <div class="tisd-classif-num">${pc !== null && pc !== undefined ? 'P' + pc : '—'}</div>
                    <div class="tisd-classif-lbl">${esc(cl || vazio)}</div>
                    ${amostra ? `<div class="tisd-classif-amostra">${esc(amostra)}</div>` : ''}
                </div>`;
        }

        const porSub = {
            leitura: r.t_leitura, escrita: r.t_escrita, atencao: r.t_atencao,
            calculo: r.t_calculo, motoras: r.t_motoras, fonologica: r.t_fonologica,
            nomeacao: r.t_nomeacao, memoria: r.t_memoria
        };

        const linhas = SUBTESTES.map(s => `
            <tr>
                <td><span class="tisd-dot" style="background:${s.cor};"></span>${s.num}. ${esc(s.nome)}</td>
                ${s.campos.map(f => '').join('')}
                <td class="ctr">${s.campos.map(f => (b[f.c] === null || b[f.c] === undefined) ? '—' : b[f.c]).join(' · ')}</td>
                <td class="ctr"><strong>${porSub[s.cod] !== null && porSub[s.cod] !== undefined ? porSub[s.cod] : '—'}</strong></td>
            </tr>`).join('');

        el().innerHTML = `
        <div class="laudo" id="laudo-tisd">
            <div class="laudo-header">
                <div class="laudo-header-esq">
                    <div class="laudo-header-logo">E</div>
                    <div class="laudo-header-textos">
                        <div class="laudo-header-supratitulo">Relatório de Avaliação Neuropsicológica</div>
                        <h1 class="laudo-header-titulo">TISD</h1>
                        <div class="laudo-header-subtitulo">Teste para Identificação de Sinais de Dislexia<br>Aplicação individual com o livro de aplicação · 8 subtestes</div>
                    </div>
                </div>
                <div class="laudo-header-pontuacao">
                    <div class="laudo-header-pontuacao-label">Bruto</div>
                    <div class="laudo-header-pontuacao-valor">${r.bruto_total}</div>
                    <div class="laudo-header-pontuacao-detalhe">${r.norma_encontrada ? esc(r.classificacao_geral || '—') : 'sem norma'}</div>
                </div>
            </div>

            <div class="laudo-body">
                ${!r.norma_encontrada ? `
                <div class="tisd-aviso atencao">
                    <strong>⚠ Percentil não calculado.</strong>
                    ${!r.ano_escolar
                        ? 'Falta o ano escolar na folha. As tabelas normativas do TISD são por ano escolar (1º ao 5º), então sem ele o relatório mostra só a pontuação bruta. Clique em “Editar a folha”, informe o ano e calcule de novo.'
                        : `A norma do ${anoStr} não está cadastrada no sistema, então o relatório mostra apenas a pontuação bruta.`}
                </div>` : ''}

                <div class="laudo-secao-titulo"><span class="laudo-secao-tag">1</span>Identificação</div>
                <div class="laudo-identificacao">
                    <div class="laudo-identif-item"><span class="laudo-identif-label">Avaliado(a):</span>
                        <span class="laudo-identif-valor">${esc(state.paciente.nome_completo)}</span></div>
                    <div class="laudo-identif-item"><span class="laudo-identif-label">Idade:</span>
                        <span class="laudo-identif-valor">${idadeStr}</span></div>
                    <div class="laudo-identif-item"><span class="laudo-identif-label">Nascimento:</span>
                        <span class="laudo-identif-valor">${dataBR(state.paciente.data_nascimento)}</span></div>
                    <div class="laudo-identif-item"><span class="laudo-identif-label">Aplicação:</span>
                        <span class="laudo-identif-valor">${dataBR(dataApl)}</span></div>
                    <div class="laudo-identif-item"><span class="laudo-identif-label">Avaliador(a):</span>
                        <span class="laudo-identif-valor">${esc(b.avaliador || '—')}</span></div>
                    <div class="laudo-identif-item"><span class="laudo-identif-label">Escola:</span>
                        <span class="laudo-identif-valor">${b.tipo_escola === 'publica' ? 'Pública' : b.tipo_escola === 'privada' ? 'Privada' : '—'}</span></div>
                    <div class="laudo-identif-item"><span class="laudo-identif-label">Ano escolar:</span>
                        <span class="laudo-identif-valor">${anoStr}</span></div>
                    <div class="laudo-identif-item"><span class="laudo-identif-label">Região:</span>
                        <span class="laudo-identif-valor">${esc(regiaoNome)}</span></div>
                    <div class="laudo-identif-item"><span class="laudo-identif-label">Modalidade:</span>
                        <span class="laudo-identif-valor">Aplicação individual</span></div>
                </div>

                <div class="laudo-secao-titulo"><span class="laudo-secao-tag">2</span>Pontuações por subteste</div>
                <div class="tisd-tabela">
                    <table>
                        <thead><tr>
                            <th>Subteste</th>
                            <th class="ctr">Pontos brutos</th>
                            <th class="ctr">Total do subteste</th>
                        </tr></thead>
                        <tbody>
                            ${linhas}
                            <tr class="tisd-total-linha">
                                <td><strong>Pontuação bruta total</strong></td>
                                <td class="ctr">—</td>
                                <td class="ctr"><strong style="font-size:16px;">${r.bruto_total}</strong></td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <div class="laudo-secao-titulo"><span class="laudo-secao-tag">3</span>Classificações</div>
                <div class="tisd-classif-row">
                    ${cartao('População geral · ' + anoStr, r.percentil_geral, r.classificacao_geral,
                             amostraTxt(state.amostraGeral),
                             r.ano_escolar ? 'Norma não cadastrada' : 'Ano escolar não informado')}
                    ${cartao('Por região do país' + (r.regiao ? ' · ' + esc(regiaoNome) : ''),
                             r.percentil_regiao, r.classificacao_regiao,
                             amostraTxt(state.amostraRegiao),
                             !r.regiao ? 'Região não informada'
                               : !r.ano_escolar ? 'Ano escolar não informado'
                               : `Sem tabela de ${regiaoNome} para o ${anoStr}`)}
                </div>
                ${r.regiao && r.ano_escolar && !temNormaRegional(r.regiao, r.ano_escolar) ? `
                <div class="tisd-aviso info">
                    O manual publicou tabelas por região apenas para Sudeste (1º ao 5º ano),
                    Centro-Oeste (1º ao 3º) e Nordeste (3º ao 5º). Para ${esc(regiaoNome)} no
                    ${anoStr} não há norma regional, então vale a classificação da população geral.
                </div>` : ''}

                <div class="laudo-secao-titulo"><span class="laudo-secao-tag">4</span>Conclusões</div>
                <div class="tisd-conclusao">
                    <p><strong>Encaminhamento para avaliação:</strong> ${b.encaminhamento ? 'Sim' : 'Não'}</p>
                    ${b.observacoes ? `<p><strong>Outras observações:</strong> ${esc(b.observacoes)}</p>` : ''}
                </div>

                <div class="tisd-nota">
                    <strong>Nota técnica:</strong> o TISD é um instrumento de rastreio de sinais
                    de dislexia, aplicado individualmente. A pontuação bruta total é a soma dos
                    oito subtestes e é interpretada por percentil, por ano escolar, na população
                    geral e por região do país. Pontuação bruta mais alta indica mais sinais, e
                    portanto percentil mais baixo. Quando a bruta obtida não consta da tabela,
                    adota-se o ponto bruto tabelado mais próximo e, havendo empate, o percentil
                    mais alto — a regra de arredondamento do próprio manual. Resultado de rastreio
                    não é diagnóstico: a confirmação exige avaliação multiprofissional. As
                    pontuações acima foram lançadas pelo(a) profissional a partir do livro de
                    aplicação; a conversão em percentil é feita pelo sistema.
                </div>
            </div>

            <div class="laudo-rodape">
                <div class="laudo-rodape-esq">
                    <div class="laudo-rodape-org">Equilibrium Neuropsicologia</div>
                    <div class="laudo-rodape-tipo">Correção assistida — TISD</div>
                </div>
                <div class="laudo-rodape-dir">
                    <div class="laudo-rodape-data">Documento gerado em ${dataBR(new Date().toISOString())}</div>
                    <div class="laudo-rodape-confidencial">Documento confidencial — uso restrito ao profissional solicitante.</div>
                </div>
            </div>
        </div>

        <div class="tisd-acoes">
            <button class="btn btn-secondary" id="btn-voltar-entrada">Editar a folha</button>
        </div>`;

        document.getElementById('btn-voltar-entrada').addEventListener('click', () => {
            state.tela = 'entrada';
            renderizar();
            window.scrollTo(0, 0);
        });
    }

    function renderizar() {
        const acoes = document.getElementById('acoes-topo');
        if (state.tela === 'laudo') {
            renderLaudo();
            if (acoes) acoes.style.display = 'flex';
        } else {
            renderEntrada();
            if (acoes) acoes.style.display = 'none';
        }
    }

    // ── PDF ─────────────────────────────────────────────────────────────────

    async function gerarPDF() {
        const btn = document.getElementById('btn-gerar-pdf');
        const orig = btn.textContent;
        btn.disabled = true;
        btn.textContent = '⏳ Gerando PDF…';
        try {
            const alvo = document.getElementById('laudo-tisd');
            if (!alvo) throw new Error('laudo não está na tela');
            if (document.fonts && document.fonts.ready) await document.fonts.ready;
            const canvas = await window.html2canvas(alvo, {
                scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false
            });
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
            const lMM = 210, aMM = 297;
            const imgA = canvas.height * lMM / canvas.width;
            let resta = imgA, pos = 0;
            const img = canvas.toDataURL('image/jpeg', 0.95);
            pdf.addImage(img, 'JPEG', 0, 0, lMM, imgA);
            resta -= aMM;
            while (resta > 0) {
                pos -= aMM;
                pdf.addPage();
                pdf.addImage(img, 'JPEG', 0, pos, lMM, imgA);
                resta -= aMM;
            }
            const nome = (state.paciente.nome_completo || 'paciente').replace(/[^\wÀ-ÿ]+/g, '_');
            pdf.save(`TISD_${nome}_${(state.aplicacao.data_aplicacao || '').substring(0, 10)}.pdf`);
            if (window.CortexAudit) {
                window.CortexAudit.log('geracao_pdf', 'tisd_resultados', state.aplicacaoId, {
                    pacienteId: state.paciente.id
                });
            }
        } catch (err) {
            console.error('[tisd pdf]', err);
            toast('Não foi possível gerar o PDF: ' + (err.message || 'erro'), 'danger');
        } finally {
            btn.disabled = false;
            btn.textContent = orig;
        }
    }

    function mostrarErro(msg) {
        el().innerHTML = `<div class="tisd-aviso ruim"><strong>Erro.</strong> ${esc(msg)}</div>`;
    }

    // ── Boot ────────────────────────────────────────────────────────────────

    window.addEventListener('cortex:auth-ready', async () => {
        if (window.CortexSidebar) await window.CortexSidebar.render('pacientes');

        const p = new URLSearchParams(window.location.search);
        state.aplicacaoId = p.get('aplicacao_id') || p.get('aplicacao');
        if (!state.aplicacaoId) { mostrarErro('aplicacao_id não fornecido na URL'); return; }

        try {
            await carregar();
            const voltar = document.getElementById('back-link');
            if (voltar) voltar.href = `../../bateria/bateria.html?paciente=${state.aplicacao.paciente_id}`;
            renderizar();
            const bp = document.getElementById('btn-gerar-pdf');
            if (bp) bp.addEventListener('click', gerarPDF);
        } catch (err) {
            console.error('[tisd]', err);
            mostrarErro(err.message || 'desconhecido');
        }
    });
})();

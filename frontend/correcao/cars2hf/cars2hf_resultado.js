// ============================================================================
// CORTEX_APP — CARS2-HF (PRESENCIAL) — página dois-modos: INPUT + LAUDO
// ============================================================================
// URL: ?aplicacao_id=<uuid>  (aberta pela Bateria via "Aplicar / Corrigir")
//
// O aplicador pontua os 15 itens DENTRO do Cortex (heteroavaliação clínica) —
// o paciente não responde nada. Sem link público.
//
// MODO INPUT  : status != 'corrigido' (ou "Editar respostas"). Mostra os 15
//               itens com 7 alternativas cada (de instrumentos_itens), grava
//               rascunho/corrige via RPC interno_corrigir_cars2.
// MODO LAUDO  : status 'corrigido'. Lê de correcoes, faz ÷2, gravidade por
//               idade e Escore-T de ../cars2_norms.json.
//
// Escala dobrada: o banco soma 'valor' como inteiro -> 1=2 .. 4=8. O laudo /2.
// ============================================================================

(function() {
    'use strict';

    const SIGLA_ESPERADA = 'CARS2-HF';
    const RAW_MIN = 15, RAW_MAX = 60;
    const COR_SLUG = { minimo: '#16a34a', leve_mod: '#ea580c', grave: '#dc2626' };
    let CARS2_NORMS = null;

    const state = {
        aplicacaoId: null, aplicacao: null, paciente: null,
        norma: null, itens: [], correcao: null, scores: null, normSet: null,
        modo: 'input',            // 'input' | 'laudo'
        respostas: {}             // {numero: índice da opção} (modo input)
    };

    window.addEventListener('cortex:auth-ready', async () => {
        await CortexSidebar.render('pacientes');
        const params = new URLSearchParams(window.location.search);
        state.aplicacaoId = params.get('aplicacao_id');
        if (!state.aplicacaoId) { mostrarErro('aplicacao_id não fornecido na URL'); return; }
        try { await carregarTudo(); renderizar(); }
        catch (err) { console.error('Erro:', err); mostrarErro('Erro: ' + (err.message || 'desconhecido')); }
    });

    async function carregarTudo() {
        try {
            const resp = await fetch('../cars2_norms.json?v=1', { cache: 'no-cache' });
            if (resp.ok) { CARS2_NORMS = await resp.json(); state.normSet = CARS2_NORMS?.instruments?.[SIGLA_ESPERADA] || null; }
        } catch (e) { console.warn('cars2_norms.json não carregado:', e); }

        const { data: aplicacao, error: errA } = await window.cortexClient
            .from('aplicacoes_instrumento').select('*').eq('id', state.aplicacaoId).single();
        if (errA) throw new Error('Aplicação: ' + errA.message);
        state.aplicacao = aplicacao;

        const { data: paciente, error: errP } = await window.cortexClient
            .from('pacientes').select('id, nome_completo, sexo, data_nascimento, cpf, escolaridade')
            .eq('id', aplicacao.paciente_id).single();
        if (errP) throw new Error('Paciente: ' + errP.message);
        state.paciente = paciente;

        const { data: instrumento, error: errI } = await window.cortexClient
            .from('instrumentos_catalogo').select('id, sigla').eq('id', aplicacao.instrumento_id).single();
        if (errI) throw new Error('Instrumento: ' + errI.message);
        if (instrumento.sigla !== SIGLA_ESPERADA) throw new Error(`Esperado ${SIGLA_ESPERADA}, encontrado ${instrumento.sigla}`);

        const { data: norma } = await window.cortexClient
            .from('instrumentos_normas').select('*').eq('instrumento_id', instrumento.id).eq('ativa', true).maybeSingle();
        if (!norma) throw new Error('Norma CARS2-HF não cadastrada');
        state.norma = norma;

        const { data: itens } = await window.cortexClient
            .from('instrumentos_itens').select('numero, texto, opcoes').eq('norma_id', norma.id).order('numero');
        state.itens = itens || [];

        const { data: correcao } = await window.cortexClient
            .from('correcoes').select('*').eq('aplicacao_id', state.aplicacaoId)
            .order('created_at', { ascending: false }).limit(1).maybeSingle();
        state.correcao = correcao || null;

        // Decide modo
        const corrigido = aplicacao.status === 'corrigido' && state.correcao;
        state.modo = corrigido ? 'laudo' : 'input';

        // Restaura respostas (rascunho ou correção anterior) p/ modo input
        const fonte = (state.correcao?.escores_brutos?.respostas) || aplicacao.respostas_parciais || {};
        state.respostas = {};
        for (const [k, v] of Object.entries(fonte)) {
            const n = parseInt(k, 10); if (!isNaN(n) && v != null) state.respostas[n] = parseInt(v, 10);
        }

        if (state.modo === 'laudo') {
            state.scores = calcularResultados(state.correcao);
            await CortexAudit.log('leitura', 'correcoes', state.correcao.id, { detalhes: { aplicacaoId: state.aplicacaoId, sigla: SIGLA_ESPERADA } });
        }
    }

    // ── helpers de opções ────────────────────────────────────────────────────
    function opcaoTexto(item, idx) {
        const ops = Array.isArray(item.opcoes) ? item.opcoes : []; const op = ops[idx];
        if (op == null) return null;
        return (typeof op === 'object') ? (op.texto != null ? op.texto : null) : op;
    }
    function opcaoValorDobrado(item, idx) {
        const ops = Array.isArray(item.opcoes) ? item.opcoes : []; const op = ops[idx];
        if (op == null) return null;
        if (typeof op === 'object') return (op.valor != null && !isNaN(op.valor)) ? parseFloat(op.valor) : null;
        return idx;
    }

    // ============================================================================
    // ROTEAMENTO DE RENDER
    // ============================================================================
    function renderizar() {
        document.getElementById('back-link').href = `../../bateria/bateria.html?paciente=${state.paciente.id}`;
        const acoesTopo = document.getElementById('acoes-topo');
        if (state.modo === 'laudo') {
            acoesTopo.style.display = 'flex';
            acoesTopo.innerHTML = `
                <button class="btn btn-ghost" id="btn-editar">✏️ Editar respostas</button>
                <button class="btn btn-primary" id="btn-gerar-pdf">📄 Gerar PDF do relatório</button>`;
            document.getElementById('laudo-conteudo').innerHTML = renderLaudo();
            document.getElementById('btn-gerar-pdf').addEventListener('click', gerarPDF);
            document.getElementById('btn-editar').addEventListener('click', () => { state.modo = 'input'; renderizar(); window.scrollTo(0,0); });
        } else {
            acoesTopo.style.display = 'none';
            document.getElementById('laudo-conteudo').innerHTML = renderInput();
            attachInput();
            atualizarProgressoInput();
        }
    }

    // ============================================================================
    // MODO INPUT (aplicador pontua)
    // ============================================================================
    function renderInput() {
        const p = state.paciente;
        const idade = calcularIdade(p.data_nascimento, state.aplicacao.created_at);
        let itensHtml = '';
        for (const item of state.itens) {
            const ops = Array.isArray(item.opcoes) ? item.opcoes : [];
            let opcoes = '';
            for (let v = 0; v < ops.length; v++) {
                const txt = opcaoTexto(item, v) || String(v);
                const real = opcaoValorDobrado(item, v);
                const realLbl = real != null ? fmtNum(real / 2) : '';
                const ativo = state.respostas[item.numero] === v ? 'ativo' : '';
                opcoes += `
                    <button type="button" class="cars-opt ${ativo}" data-numero="${item.numero}" data-valor="${v}">
                        <span class="cars-opt-nota">${realLbl}</span>
                        <span class="cars-opt-txt">${escapeHtml(txt)}</span>
                    </button>`;
            }
            const ok = state.respostas[item.numero] !== undefined ? 'respondido' : '';
            itensHtml += `
                <div class="cars-item ${ok}" id="cars-item-${item.numero}">
                    <div class="cars-item-head"><span class="cars-item-n">${item.numero}</span>
                        <span class="cars-item-tit">${escapeHtml(item.texto)}</span></div>
                    <div class="cars-opts">${opcoes}</div>
                </div>`;
        }
        return `
            <div class="cars-input">
                <div class="cars-input-head">
                    <div>
                        <div class="cars-input-supra">Aplicação presencial · heteroavaliação clínica</div>
                        <h1 class="cars-input-tit">CARS2-HF</h1>
                        <div class="cars-input-sub">${escapeHtml(p.nome_completo)} · ${idade !== null ? idade + ' anos' : 'idade —'}</div>
                    </div>
                    <div class="cars-input-prog">
                        <div class="cars-input-prog-num"><span id="prog-resp">0</span>/${state.itens.length}</div>
                        <div class="cars-input-prog-bar"><div class="cars-input-prog-fill" id="prog-fill"></div></div>
                    </div>
                </div>
                <div class="cars-input-aviso">Marque, em cada item, a alternativa que melhor descreve a pessoa avaliada. Use as alternativas intermediárias quando o comportamento ficar entre duas descrições.</div>
                ${itensHtml}
                <div class="cars-input-acoes">
                    <button class="btn btn-secondary" id="btn-rascunho">💾 Salvar rascunho</button>
                    <button class="btn btn-primary" id="btn-corrigir">✓ Salvar e corrigir</button>
                </div>
            </div>`;
    }

    function attachInput() {
        document.querySelectorAll('.cars-opt').forEach(btn => {
            btn.addEventListener('click', () => {
                const numero = parseInt(btn.dataset.numero, 10);
                const valor = parseInt(btn.dataset.valor, 10);
                state.respostas[numero] = valor;
                const card = document.getElementById('cars-item-' + numero);
                card.querySelectorAll('.cars-opt').forEach(b => b.classList.toggle('ativo', parseInt(b.dataset.valor,10) === valor));
                card.classList.add('respondido');
                atualizarProgressoInput();
            });
        });
        document.getElementById('btn-rascunho').addEventListener('click', () => salvar(false));
        document.getElementById('btn-corrigir').addEventListener('click', () => salvar(true));
    }

    function atualizarProgressoInput() {
        const n = Object.keys(state.respostas).length, total = state.itens.length;
        const el = document.getElementById('prog-resp'); if (el) el.textContent = n;
        const fill = document.getElementById('prog-fill'); if (fill) fill.style.width = (total ? Math.round(n/total*100) : 0) + '%';
    }

    async function salvar(finalizar) {
        const total = state.itens.length;
        const n = Object.keys(state.respostas).length;
        if (finalizar && n !== total) {
            window.CortexUI.toast(`Faltam ${total - n} ${total - n === 1 ? 'item' : 'itens'} pra corrigir`, 'danger');
            const falt = state.itens.find(it => state.respostas[it.numero] === undefined);
            if (falt) document.getElementById('cars-item-' + falt.numero)?.scrollIntoView({ behavior:'smooth', block:'center' });
            return;
        }
        const bR = document.getElementById('btn-rascunho'), bC = document.getElementById('btn-corrigir');
        const oR = bR.textContent, oC = bC.textContent;
        bR.disabled = true; bC.disabled = true;
        (finalizar ? bC : bR).textContent = '⏳ Salvando...';
        try {
            const { data, error } = await window.cortexClient.rpc('interno_corrigir_cars2', {
                p_aplicacao_id: state.aplicacaoId, p_respostas: state.respostas, p_finalizar: finalizar
            });
            if (error || data?.erro) {
                console.error('RPC:', error || data);
                let msg = 'Não foi possível salvar. Tente novamente.';
                if (data?.erro === 'respostas_incompletas') msg = 'Respostas incompletas.';
                if (data?.erro === 'nao_autenticado') msg = 'Sessão expirada. Recarregue a página.';
                window.CortexUI.toast(msg, 'danger');
                bR.disabled = false; bC.disabled = false; bR.textContent = oR; bC.textContent = oC;
                return;
            }
            if (finalizar) {
                window.CortexUI.toast('CARS2-HF corrigido', 'success');
                await carregarTudo(); renderizar(); window.scrollTo(0, 0);
            } else {
                window.CortexUI.toast('Rascunho salvo', 'success');
                bR.disabled = false; bC.disabled = false; bR.textContent = oR; bC.textContent = oC;
            }
        } catch (err) {
            console.error(err);
            window.CortexUI.toast('Erro de conexão.', 'danger');
            bR.disabled = false; bC.disabled = false; bR.textContent = oR; bC.textContent = oC;
        }
    }

    // ============================================================================
    // MODO LAUDO (lê de correcoes)
    // ============================================================================
    function calcularResultados(correcao) {
        const respostas = (correcao?.escores_brutos || {}).respostas || {};
        const respItem = {}, notaRealItem = {}; let totalDobrado = 0;
        for (const item of state.itens) {
            let r = respostas[item.numero]; if (r == null) r = respostas[String(item.numero)];
            const idx = (r != null && !isNaN(r)) ? parseInt(r, 10) : null;
            respItem[item.numero] = idx;
            const dobrado = (idx != null) ? opcaoValorDobrado(item, idx) : null;
            notaRealItem[item.numero] = (dobrado != null) ? (dobrado / 2) : null;
            if (dobrado != null) totalDobrado += dobrado;
        }
        const totalReal = totalDobrado / 2;
        const idade = calcularIdade(state.paciente.data_nascimento, state.aplicacao.created_at);
        const grupoIdade = pickGrupoIdade(idade);
        const classif = classificarGravidade(totalReal, grupoIdade);
        const tscore = lookupTscore(totalReal, grupoIdade);
        return { respItem, notaRealItem, totalReal, idade, grupoIdade, classif, tscore };
    }

    function pickGrupoIdade(idadeAnos) {
        const grupos = state.normSet?.severity?.age_groups || [];
        if (!grupos.length || idadeAnos == null) return null;
        return grupos.find(g => idadeAnos >= (g.age_min_years ?? 0) && idadeAnos <= (g.age_max_years ?? 200)) || null;
    }
    function classificarGravidade(totalReal, grupo) {
        if (!grupo) return null;
        for (const b of (grupo.bands || [])) if (totalReal >= b.min && totalReal <= b.max) return b;
        const bands = grupo.bands || []; return bands.length ? bands[bands.length - 1] : null;
    }
    function lookupTscore(totalReal, grupo) {
        const by = state.normSet?.tscore?.by_raw;
        if (!by || !Object.keys(by).length) return null;
        const row = by[String(totalReal)] != null ? by[String(totalReal)] : by[String(parseFloat(totalReal))];
        if (row == null) return null;
        if (typeof row === 'number') return row;
        const gid = grupo?.id;
        if (gid && row[gid] != null) return row[gid];
        if (row.all != null) return row.all;
        return null;
    }

    function fmtNum(n) { if (n == null) return '—'; return Number.isInteger(n) ? String(n) : String(n).replace('.', ','); }

    function renderLaudo() {
        const p = state.paciente, s = state.scores;
        const sexoStr = p.sexo === 'M' ? 'Masculino' : (p.sexo === 'F' ? 'Feminino' : (p.sexo || '—'));
        const total = s.totalReal;
        return `
        <div class="laudo">
            <div class="laudo-header">
                <div class="laudo-header-esq">
                    <div class="laudo-header-logo">E</div>
                    <div class="laudo-header-textos">
                        <div class="laudo-header-supratitulo">Relatório de Avaliação Neuropsicológica</div>
                        <h1 class="laudo-header-titulo">CARS2-HF</h1>
                        <div class="laudo-header-subtitulo">Childhood Autism Rating Scale, Second Edition — Versão de Alto Funcionamento<br>15 itens · escore 1 a 4 por item · total bruto ${RAW_MIN}–${RAW_MAX}</div>
                    </div>
                </div>
                <div class="laudo-header-pontuacao">
                    <div class="laudo-header-pontuacao-label">Escore Bruto Total</div>
                    <div class="laudo-header-pontuacao-valor">${fmtNum(total)}<span style="font-size:18px;color:#94a3b8;">/${RAW_MAX}</span></div>
                </div>
            </div>
            <div class="laudo-body">
                <div class="laudo-secao-titulo"><span class="laudo-secao-tag">1</span>Identificação</div>
                <div class="laudo-identificacao">
                    <div class="laudo-identif-item"><span class="laudo-identif-label">Paciente:</span><span class="laudo-identif-valor">${escapeHtml(p.nome_completo)}</span></div>
                    <div class="laudo-identif-item"><span class="laudo-identif-label">Idade:</span><span class="laudo-identif-valor">${s.idade !== null ? s.idade + ' anos' : '—'}</span></div>
                    <div class="laudo-identif-item"><span class="laudo-identif-label">Sexo:</span><span class="laudo-identif-valor">${escapeHtml(sexoStr)}</span></div>
                    <div class="laudo-identif-item"><span class="laudo-identif-label">Nascimento:</span><span class="laudo-identif-valor">${formatarDataBR(p.data_nascimento)}</span></div>
                    <div class="laudo-identif-item"><span class="laudo-identif-label">Avaliação:</span><span class="laudo-identif-valor">${formatarDataBR(state.aplicacao.created_at)}</span></div>
                    <div class="laudo-identif-item"><span class="laudo-identif-label">Modalidade:</span><span class="laudo-identif-valor">Observação / entrevista clínica</span></div>
                </div>
                <div class="laudo-secao-titulo"><span class="laudo-secao-tag">2</span>Resultado</div>
                ${renderResultado()}
                <div class="laudo-secao-titulo"><span class="laudo-secao-tag">3</span>Distribuição das respostas</div>
                ${renderIntensidade()}
                <div class="bai-nota-tecnica">
                    <strong>Importante:</strong> o CARS2 é um instrumento de apoio à avaliação da gravidade de
                    sintomas do espectro autista — <strong>não constitui, isoladamente, um diagnóstico</strong>.
                    O resultado integra-se ao conjunto da avaliação clínica conduzida pelo profissional.
                </div>
                <div class="laudo-secao-titulo laudo-secao-prof"><span class="laudo-secao-tag">4</span>Detalhamento técnico <span class="laudo-secao-prof-tag">uso do profissional</span></div>
                ${renderDetalhesItens()}
            </div>
            <div class="laudo-rodape">
                <div class="laudo-rodape-esq">
                    <div class="laudo-rodape-org">Equilibrium Neuropsicologia</div>
                    <div class="laudo-rodape-tipo">Correção automatizada — CARS2-HF</div>
                </div>
                <div class="laudo-rodape-dir">
                    <div class="laudo-rodape-data">Documento gerado em ${formatarDataBR(new Date().toISOString())}</div>
                    <div class="laudo-rodape-confidencial">Documento confidencial — uso restrito ao profissional solicitante.</div>
                </div>
            </div>
        </div>`;
    }

    function renderResultado() {
        const s = state.scores, total = s.totalReal, grupo = s.grupoIdade, cl = s.classif;
        if (!grupo) {
            return `<div class="bai-nivel-expl" style="border-left-color:#94a3b8;">
                <strong>Escore bruto total: ${fmtNum(total)} de ${RAW_MAX}.</strong>
                Não foi possível determinar o grupo etário (idade ausente) — a classificação do CARS2-HF é
                estratificada por idade. Verifique a data de nascimento do paciente.</div>`;
        }
        const cards = (grupo.bands || []).map(b => {
            const ativo = cl && b.slug === cl.slug; const cor = COR_SLUG[b.slug] || '#64748b';
            return `<div class="cars-nivel-card ${ativo ? 'ativo' : ''}" ${ativo ? `style="border-color:${cor};"` : ''}>
                <div class="bai-nivel-dot" style="background:${cor};"></div>
                <div class="bai-nivel-nome">${escapeHtml(b.label.replace(' de TEA',''))}</div>
                <div class="bai-nivel-faixa">${fmtNum(b.min)} – ${fmtNum(b.max)}</div>
                ${ativo ? `<div class="bai-nivel-voce" style="color:${cor};">● resultado: ${fmtNum(total)}</div>` : ''}
            </div>`;
        }).join('');
        const cor = cl ? (COR_SLUG[cl.slug] || '#64748b') : '#64748b';
        const tscoreLinha = s.tscore != null
            ? `<div class="cars-tscore"><span class="cars-tscore-lbl">Escore-T</span><span class="cars-tscore-val" style="color:${cor};">${fmtNum(s.tscore)}</span></div>`
            : `<div class="cars-tscore cars-tscore-vazio"><span class="cars-tscore-lbl">Escore-T</span><span class="cars-tscore-val">não configurado</span><span class="cars-tscore-nota">preencha a tabela em cars2_norms.json</span></div>`;
        return `<div class="cars-niveis-grid">${cards}</div>${tscoreLinha}
            <div class="bai-nivel-expl" style="border-left-color:${cor};">
                <strong>${cl ? cl.label + '.' : 'Classificação indisponível.'}</strong>
                Escore bruto total <strong>${fmtNum(total)}</strong> de ${RAW_MAX}
                (faixa etária de referência: ${escapeHtml(grupo.label)}).</div>`;
    }

    function renderIntensidade() {
        const buckets = [
            { lbl: 'Adequado / típico (≈1)',     cor: '#16a34a', n: 0 },
            { lbl: 'Levemente atípico (≈2)',     cor: '#d97706', n: 0 },
            { lbl: 'Moderadamente atípico (≈3)', cor: '#ea580c', n: 0 },
            { lbl: 'Gravemente atípico (≈4)',    cor: '#dc2626', n: 0 }
        ];
        let respondidos = 0;
        for (const item of state.itens) {
            const v = state.scores.notaRealItem[item.numero]; if (v == null) continue;
            respondidos++; const idxB = Math.min(3, Math.max(0, Math.round(v) - 1)); buckets[idxB].n++;
        }
        const maxC = Math.max(1, ...buckets.map(b => b.n));
        const linhas = buckets.map(b => {
            const w = Math.round((b.n / maxC) * 100);
            return `<div class="bai-int-row">
                <span class="bai-int-lbl" style="color:${b.cor};">${escapeHtml(b.lbl)}</span>
                <span class="bai-int-trk"><span class="bai-int-fill" style="width:${w}%;background:${b.cor};"></span></span>
                <span class="bai-int-val">${b.n} ${b.n === 1 ? 'item' : 'itens'}</span></div>`;
        }).join('');
        return `<div class="bai-intensidade">${linhas}
            <div class="bai-int-nota">Dos ${respondidos} itens, distribuição por nível de atipicidade (aproximada ao ponto âncora mais próximo; os meios-pontos aparecem no detalhamento técnico).</div></div>`;
    }

    function renderDetalhesItens() {
        if (!state.itens.length) return '';
        const linhas = state.itens.map(item => {
            const idx = state.scores.respItem[item.numero], nota = state.scores.notaRealItem[item.numero];
            const frase = (idx != null) ? (opcaoTexto(item, idx) || '—') : '—';
            const corResp = nota == null ? '#cbd5e1' : (nota >= 3.5 ? '#dc2626' : nota >= 3 ? '#ea580c' : nota >= 2 ? '#d97706' : '#16a34a');
            return `<tr>
                <td style="text-align:center;font-weight:700;color:#4f46e5;">${item.numero}</td>
                <td><div class="cars-item-titulo">${escapeHtml(item.texto)}</div><div class="cars-item-frase">${escapeHtml(frase)}</div></td>
                <td style="text-align:center;font-weight:700;color:${corResp};">${fmtNum(nota)}</td></tr>`;
        }).join('');
        return `<div class="bai-tab-itens"><table>
            <thead><tr><th style="width:48px;text-align:center;">Item</th><th>Item · alternativa marcada</th><th style="text-align:center;width:64px;">Nota</th></tr></thead>
            <tbody>${linhas}</tbody></table>
            <div class="cars-tab-nota">Escore bruto total = soma das 15 notas = <strong>${fmtNum(state.scores.totalReal)}</strong> (de ${RAW_MAX}).</div></div>`;
    }

    async function gerarPDF() {
        const btn = document.getElementById('btn-gerar-pdf'); const orig = btn.textContent;
        btn.disabled = true; btn.textContent = '⏳ Gerando PDF...';
        try {
            document.body.classList.add('exportando'); await new Promise(r => setTimeout(r, 100));
            const laudo = document.querySelector('.laudo');
            const canvas = await html2canvas(laudo, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false });
            const { jsPDF } = window.jspdf; const pdf = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' });
            const pdfWidth = 210, pdfHeight = 297, imgWidth = pdfWidth, imgHeight = (canvas.height * pdfWidth) / canvas.width;
            if (imgHeight <= pdfHeight) pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, imgWidth, imgHeight);
            else { let posY = 0, restante = imgHeight; while (restante > 0) { pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, -posY, imgWidth, imgHeight); restante -= pdfHeight; posY += pdfHeight; if (restante > 0) pdf.addPage(); } }
            const nome = state.paciente.nome_completo.toUpperCase().replace(/[^A-Z\s]/g, '').trim().substring(0, 50);
            pdf.save(`CARS2-HF - ${nome}_${formatarDataArquivo(new Date())}.pdf`);
            window.CortexUI.toast('PDF gerado com sucesso', 'success');
        } catch (err) { console.error(err); window.CortexUI.toast('Erro ao gerar PDF: ' + err.message, 'danger'); }
        finally { document.body.classList.remove('exportando'); btn.disabled = false; btn.textContent = orig; }
    }

    function calcularIdade(nascISO, aplISO) {
        if (!nascISO) return null;
        const ref = aplISO ? new Date(aplISO) : new Date(); const n = new Date(nascISO);
        if (isNaN(n) || isNaN(ref) || ref < n) return null;
        let anos = ref.getFullYear() - n.getFullYear(); const m = ref.getMonth() - n.getMonth();
        if (m < 0 || (m === 0 && ref.getDate() < n.getDate())) anos--;
        return anos;
    }
    function formatarDataBR(iso) { if (!iso) return '—'; const d = iso.includes('T') ? new Date(iso) : new Date(iso + 'T00:00:00'); return d.toLocaleDateString('pt-BR'); }
    function formatarDataArquivo(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
    function mostrarErro(msg) { document.getElementById('laudo-conteudo').innerHTML = `<div class="empty-state"><div class="empty-state-title">${escapeHtml(msg)}</div></div>`; }
    function escapeHtml(text) { if (text === null || text === undefined) return ''; const div = document.createElement('div'); div.textContent = String(text); return div.innerHTML; }
})();

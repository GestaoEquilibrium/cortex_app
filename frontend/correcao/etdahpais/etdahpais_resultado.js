// ============================================================================
// CORTEX_APP — Resultado ETDAH-PAIS (Benczik / Memnon) — laudo
// ============================================================================
// URL: ?aplicacao_id=<uuid>
//
// 58 itens, escala 1-6. 4 fatores: RE, HI, CA, A + Escore Geral.
// Inversão (crivo 1<->6 = 7-resp): itens reverso=true (todos do CA + item 1 de A).
//
// Cálculo NO LAUDO a partir de escores_brutos.respostas = {numero: 1..6}:
//   - aplica inversão nos itens reverso; soma bruta por fator; Escore Geral = soma.
//   - PERCENTIL/CLASSIFICAÇÃO: dependem das tabelas do manual (sexo+idade ou geral).
//     Enquanto não houver tabela carregada em NORMAS, mostra brutos e "—".
//   - Triagem; não substitui avaliação diagnóstica.
// ============================================================================

(function() {
    'use strict';

    const SIGLA_ESPERADA = 'ETDAH-PAIS';
    const TOTAL_ITENS = 58;
    const FATORES_ORDEM = ['RE', 'HI', 'CA', 'A'];

    // Cores por fator (gradiente índigo/violeta — diferencia do ICA azul)
    const COR_FATOR = {
        RE: '#6366f1', HI: '#8b5cf6', CA: '#0ea5e9', A: '#ec4899', GERAL: '#4338ca'
    };

    // -------------------------------------------------------------------------
    // TABELAS DE PERCENTIL — preencher com os dados do MANUAL (sexo+idade / geral).
    // Estrutura esperada (exemplo):
    //   NORMAS['M_6a8'] = { RE: {<bruto>: <percentil>, ...}, HI: {...}, CA, A, GERAL }
    // Enquanto vazio, o laudo exibe só os brutos e percentil/classificação = "—".
    // -------------------------------------------------------------------------
    const NORMAS = {};
    // Faixas de classificação por percentil (do manual). Preencher quando confirmado.
    // Ex.: [{min:85,max:99,label:'Superior'}, ...]. Vazio => classificação "—".
    const FAIXAS_PERCENTIL = [];

    function detectarEstrato(/* sexo, idadeMeses */) { return null; } // depende do manual
    function buscarPercentil(tabela, bruto) {
        if (!tabela || bruto == null) return null;
        if (tabela[bruto] != null) return tabela[bruto];
        return null;
    }
    function classificarPercentil(pct) {
        if (pct == null || !FAIXAS_PERCENTIL.length) return { label: '—', slug: 'pendente' };
        const f = FAIXAS_PERCENTIL.find(x => pct >= x.min && pct <= x.max);
        return f ? { label: f.label, slug: f.slug || 'ok' } : { label: '—', slug: 'pendente' };
    }

    const state = {
        aplicacaoId: null, aplicacao: null, paciente: null,
        norma: null, itens: [], fatores: [], correcao: null, scores: null, estrato: null
    };

    // ============================================================================
    // BOOT
    // ============================================================================
    window.addEventListener('cortex:auth-ready', async () => {
        await CortexSidebar.render('pacientes');
        const params = new URLSearchParams(window.location.search);
        state.aplicacaoId = params.get('aplicacao_id');
        if (!state.aplicacaoId) { mostrarErro('aplicacao_id não fornecido na URL'); return; }
        try {
            await carregarTudo();
            renderizar();
        } catch (err) {
            console.error('Erro ao carregar:', err);
            mostrarErro('Erro: ' + (err.message || 'desconhecido'));
        }
    });

    async function carregarTudo() {
        const { data: aplicacao, error: errA } = await window.cortexClient
            .from('aplicacoes_instrumento').select('*').eq('id', state.aplicacaoId).single();
        if (errA) throw new Error('Aplicação: ' + errA.message);
        state.aplicacao = aplicacao;

        const { data: paciente, error: errP } = await window.cortexClient
            .from('pacientes')
            .select('id, nome_completo, sexo, data_nascimento, cpf, escolaridade, escolaridade_serie')
            .eq('id', aplicacao.paciente_id).single();
        if (errP) throw new Error('Paciente: ' + errP.message);
        state.paciente = paciente;

        const { data: instrumento, error: errI } = await window.cortexClient
            .from('instrumentos_catalogo').select('id, sigla').eq('id', aplicacao.instrumento_id).single();
        if (errI) throw new Error('Instrumento: ' + errI.message);
        if (instrumento.sigla !== SIGLA_ESPERADA) {
            throw new Error(`Esperado ${SIGLA_ESPERADA}, encontrado ${instrumento.sigla}`);
        }

        const { data: norma } = await window.cortexClient
            .from('instrumentos_normas').select('*').eq('instrumento_id', instrumento.id)
            .eq('ativa', true).maybeSingle();
        if (!norma) throw new Error('Norma ETDAH-PAIS não cadastrada');
        state.norma = norma;

        const { data: fatores } = await window.cortexClient
            .from('instrumentos_fatores')
            .select('id, fator_codigo, fator_label, ordem, min_score, max_score, eh_total')
            .eq('norma_id', norma.id).order('ordem');
        state.fatores = fatores || [];

        const { data: itensRaw } = await window.cortexClient
            .from('instrumentos_itens').select('numero, texto, reverso, fator_id')
            .eq('norma_id', norma.id).order('numero');
        const mapFator = {};
        for (const f of state.fatores) mapFator[f.id] = f.fator_codigo;
        state.itens = (itensRaw || []).map(i => ({
            numero: i.numero, texto: i.texto, reverso: !!i.reverso,
            fator_codigo: mapFator[i.fator_id] || 'desconhecido'
        }));

        const { data: correcao, error: errC } = await window.cortexClient
            .from('correcoes').select('*').eq('aplicacao_id', state.aplicacaoId)
            .order('created_at', { ascending: false }).limit(1).maybeSingle();
        if (errC) throw new Error('Correção: ' + errC.message);
        if (!correcao) throw new Error('Nenhuma correção encontrada');
        state.correcao = correcao;

        state.estrato = detectarEstrato();
        state.scores = calcularResultados(correcao);

        await CortexAudit.log('leitura', 'correcoes', correcao.id, {
            detalhes: { aplicacaoId: state.aplicacaoId, sigla: SIGLA_ESPERADA }
        });
    }

    // ============================================================================
    // CÁLCULO — soma bruta por fator (com inversão) + Escore Geral
    // ============================================================================
    function calcularResultados(correcao) {
        const respostas = (correcao?.escores_brutos || {}).respostas || {};
        const respPorNum = {};
        for (const [k, v] of Object.entries(respostas)) respPorNum[parseInt(k)] = parseInt(v) || 0;

        const eMin = state.norma.escala_min || 1;
        const eMax = state.norma.escala_max || 6;

        const porFator = {};
        for (const f of state.fatores) {
            if (f.eh_total) continue;
            porFator[f.fator_codigo] = {
                codigo: f.fator_codigo, nome: f.fator_label, ordem: f.ordem,
                minScore: f.min_score || 0, maxScore: f.max_score || 0,
                itens: [], soma: 0, n: 0
            };
        }
        for (const item of state.itens) {
            const valor = respPorNum[item.numero] ?? 0;
            const valido = valor >= eMin && valor <= eMax;
            const ajustado = valido ? (item.reverso ? (eMin + eMax - valor) : valor) : 0;
            const fc = item.fator_codigo;
            if (porFator[fc]) {
                porFator[fc].itens.push({ numero: item.numero, valor, ajustado, reverso: item.reverso, texto: item.texto });
                porFator[fc].soma += ajustado; porFator[fc].n += 1;
            }
        }
        const fatores = FATORES_ORDEM.map(c => porFator[c]).filter(Boolean);
        let geral = 0, geralMax = 0;
        for (const f of fatores) {
            geral += f.soma; geralMax += f.maxScore;
            f.pct = f.maxScore > 0 ? Math.round((f.soma / f.maxScore) * 100) : 0;
            f.cor = COR_FATOR[f.codigo] || '#6366f1';
            // percentil (pendente até NORMAS ter tabela do estrato)
            const tabela = state.estrato && NORMAS[state.estrato] ? NORMAS[state.estrato][f.codigo] : null;
            f.percentil = buscarPercentil(tabela, f.soma);
            f.classif = classificarPercentil(f.percentil);
        }
        const tabelaG = state.estrato && NORMAS[state.estrato] ? NORMAS[state.estrato]['GERAL'] : null;
        const geralPerc = buscarPercentil(tabelaG, geral);
        const respondidos = Object.keys(respostas).length;
        return {
            fatores, geral, geralMax,
            geralPct: geralMax > 0 ? Math.round((geral / geralMax) * 100) : 0,
            geralPercentil: geralPerc, geralClassif: classificarPercentil(geralPerc),
            respondidos, faltam: TOTAL_ITENS - respondidos,
            temNorma: !!(state.estrato && NORMAS[state.estrato])
        };
    }

    function labelResposta(valor) {
        const labels = state.norma.answer_labels || [];
        const idx = valor - (state.norma.escala_min || 1);
        return labels[idx] !== undefined ? labels[idx] : String(valor);
    }

    // ============================================================================
    // RENDER
    // ============================================================================
    function renderizar() {
        const cont = document.getElementById('laudo-conteudo');
        cont.innerHTML = renderLaudo();
        document.getElementById('acoes-topo').style.display = 'flex';
        document.getElementById('back-link').href = `../../bateria/bateria.html?paciente=${state.paciente.id}`;
        document.getElementById('btn-gerar-pdf').addEventListener('click', gerarPDF);
        const btnTeste = document.getElementById('btn-imprimir-teste');
        if (btnTeste) btnTeste.addEventListener('click', imprimirTeste);

        document.querySelectorAll('[data-goto]').forEach(el => {
            el.addEventListener('click', () => {
                const alvo = document.getElementById('fator-' + el.dataset.goto);
                if (alvo) {
                    alvo.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    alvo.classList.add('ep-card-foco');
                    setTimeout(() => alvo.classList.remove('ep-card-foco'), 1400);
                }
            });
        });
    }

    function renderLaudo() {
        const s = state.scores;
        const p = state.paciente;
        const idade = calcularIdadeAnos(p.data_nascimento, state.aplicacao.created_at);
        const dataAplic = formatarDataBR(state.aplicacao.created_at);
        const nascStr = formatarDataBR(p.data_nascimento);
        const sexoStr = p.sexo === 'M' ? 'Masculino' : (p.sexo === 'F' ? 'Feminino' : '—');

        return `
        <div class="laudo ep-laudo">
            ${renderCabecalho(p, idade, sexoStr, nascStr, dataAplic)}
            ${!s.temNorma ? renderAvisoNorma() : ''}
            ${renderTabela(s)}
            ${renderPerfil(s)}
            ${renderFatoresDetalhe(s)}
            ${renderRodape(s)}
        </div>`;
    }

    function renderCabecalho(p, idade, sexoStr, nascStr, dataAplic) {
        const idadeStr = idade !== null ? `${idade} anos` : '—';
        return `
        <header class="ep-header">
            <div class="ep-header-top">
                <div class="ep-header-marca">
                    <div class="ep-logo-mark">E</div>
                    <div>
                        <div class="ep-header-clinica">Equilibrium · Neuropsicologia</div>
                        <div class="ep-header-instr">ETDAH-PAIS — Comportamentos de TDAH (Visão dos Pais)</div>
                    </div>
                </div>
                <span class="ep-header-chip">⚡ TDAH · Heteroaplicação</span>
            </div>
            <div class="ep-paciente-grid">
                <div><span class="ep-pl">Paciente</span><span class="ep-pv">${escapeHtml(p.nome_completo)}</span></div>
                <div><span class="ep-pl">Idade</span><span class="ep-pv">${idadeStr}</span></div>
                <div><span class="ep-pl">Sexo</span><span class="ep-pv">${sexoStr}</span></div>
                <div><span class="ep-pl">Nascimento</span><span class="ep-pv">${nascStr}</span></div>
                <div><span class="ep-pl">Aplicação</span><span class="ep-pv">${dataAplic}</span></div>
                <div><span class="ep-pl">Respondente</span><span class="ep-pv">Pai / mãe / responsável</span></div>
            </div>
        </header>`;
    }

    function renderAvisoNorma() {
        return `
        <div class="ep-aviso">
            <span class="ep-aviso-ic">ℹ️</span>
            <div>
                <strong>Percentis e classificação pendentes.</strong>
                Exibindo as <strong>pontuações brutas</strong> por fator (com as inversões aplicadas) e o Escore Geral.
                Para gerar percentil e classificação (Superior / Médio Superior / Médio / Médio Inferior / Inferior),
                é necessário carregar as tabelas de percentil do manual (por sexo+idade ou amostra geral).
            </div>
        </div>`;
    }

    // Tabela RESULTADOS (igual ao protocolo): Fator | Bruto | Percentil | Classificação
    function renderTabela(s) {
        const linhas = s.fatores.map(f => `
            <tr>
                <td class="ep-td-fator"><span class="ep-dot" style="background:${f.cor};"></span>${escapeHtml(f.nome)}</td>
                <td class="ep-td-num"><strong>${f.soma}</strong><span class="ep-td-max"> / ${f.maxScore}</span></td>
                <td class="ep-td-num">${f.percentil != null ? f.percentil : '—'}</td>
                <td><span class="ep-classif ep-classif-${f.classif.slug}">${f.classif.label}</span></td>
            </tr>`).join('');
        return `
        <section class="ep-secao">
            <h2 class="ep-secao-titulo">Resultados</h2>
            <table class="ep-tabela">
                <thead><tr><th>Fator</th><th>Pontuação bruta</th><th>Percentil</th><th>Classificação</th></tr></thead>
                <tbody>
                    ${linhas}
                    <tr class="ep-tr-geral">
                        <td class="ep-td-fator"><span class="ep-dot" style="background:${COR_FATOR.GERAL};"></span><strong>Escore Geral</strong></td>
                        <td class="ep-td-num"><strong>${s.geral}</strong><span class="ep-td-max"> / ${s.geralMax}</span></td>
                        <td class="ep-td-num">${s.geralPercentil != null ? s.geralPercentil : '—'}</td>
                        <td><span class="ep-classif ep-classif-${s.geralClassif.slug}">${s.geralClassif.label}</span></td>
                    </tr>
                </tbody>
            </table>
            <p class="ep-secao-nota">Fator 3 (CA) e item 1 do Fator 4 (A) entram com pontuação invertida (crivo 1↔6), conforme o protocolo. Escore Geral = soma dos 4 fatores brutos.</p>
        </section>`;
    }

    // Perfil dos fatores em barras (bruto / máx)
    function renderPerfil(s) {
        const barras = s.fatores.map(f => {
            const w = Math.max(2, f.pct);
            return `
            <div class="ep-bar-row" data-goto="${f.codigo}" role="button" tabindex="0">
                <div class="ep-bar-nome">${escapeHtml(f.nome)}</div>
                <div class="ep-bar-track"><div class="ep-bar-fill" style="width:${w}%;background:${f.cor};"></div></div>
                <div class="ep-bar-val">${f.soma}<span class="ep-bar-max">/${f.maxScore}</span></div>
            </div>`;
        }).join('');
        return `
        <section class="ep-secao">
            <h2 class="ep-secao-titulo">Perfil por fator (pontuação bruta)</h2>
            <p class="ep-secao-nota">Proporção da pontuação bruta de cada fator em relação ao seu máximo. Clique numa barra para ver os itens.</p>
            <div class="ep-bars">${barras}</div>
        </section>`;
    }

    // Detalhe por fator: itens com valor 1-6 (e ajuste se invertido)
    function renderFatoresDetalhe(s) {
        const cards = s.fatores.map(f => {
            const itensHtml = f.itens.map(it => {
                const inv = it.reverso
                    ? `<span class="ep-item-inv" title="Item invertido (crivo 1↔6)">⇄ ${it.valor}→<b>${it.ajustado}</b></span>`
                    : `<span class="ep-item-val">${it.valor || '—'}</span>`;
                return `
                <div class="ep-item ${it.reverso ? 'ep-item-rev' : ''}">
                    <span class="ep-item-num">${it.numero}</span>
                    <span class="ep-item-txt">${escapeHtml(it.texto)}</span>
                    ${inv}
                </div>`;
            }).join('');
            return `
            <div class="ep-fator-card" id="fator-${f.codigo}">
                <div class="ep-fator-head" style="--fc:${f.cor};">
                    <div class="ep-fator-head-nome">${escapeHtml(f.nome)}</div>
                    <div class="ep-fator-head-stats"><span><b>${f.soma}</b> / ${f.maxScore} pts</span></div>
                </div>
                <div class="ep-fator-itens">${itensHtml}</div>
            </div>`;
        }).join('');
        return `
        <section class="ep-secao">
            <h2 class="ep-secao-titulo">Itens por fator</h2>
            <p class="ep-secao-nota"><span class="ep-leg-inv">⇄</span> = item com pontuação invertida (mostra resposta → valor usado na soma).</p>
            <div class="ep-fatores">${cards}</div>
        </section>`;
    }

    function renderRodape(s) {
        return `
        <section class="ep-rodape">
            <p><strong>Interpretação:</strong> a pontuação bruta de cada fator é convertida em percentil pela tabela do manual (por sexo+idade ou amostra geral) e classificada em Superior, Médio Superior, Médio, Médio Inferior ou Inferior.</p>
            <p class="ep-rodape-aviso">⚠️ A ETDAH-PAIS é um <strong>instrumento de triagem</strong> respondido pelos pais; não estabelece diagnóstico e deve compor uma avaliação multiprofissional. Escala de Avaliação de Comportamentos Infantojuvenis no TDAH em Ambiente Familiar — Versão para Pais (ETDAH-PAIS), Edyleine Bellini Peroni Benczik, Memnon Edições Científicas.</p>
        </section>`;
    }

    // ============================================================================
    // IMPRESSÃO / PDF
    // ============================================================================
    function imprimirTeste() {
        const senha = window.prompt('Senha para impressão de teste:');
        if (senha === null) return;
        if (String(senha).trim() !== '3226') { window.CortexUI.toast('Senha incorreta.', 'danger'); return; }
        document.body.classList.add('imprimindo-teste');
        const limpar = () => document.body.classList.remove('imprimindo-teste');
        window.addEventListener('afterprint', limpar, { once: true });
        setTimeout(() => { window.print(); }, 60);
    }

    async function gerarPDF() {
        const btn = document.getElementById('btn-gerar-pdf');
        const orig = btn.textContent;
        btn.disabled = true; btn.textContent = '⏳ Gerando PDF...';
        try {
            document.body.classList.add('exportando');
            await new Promise(r => setTimeout(r, 120));
            const laudo = document.querySelector('.laudo');
            if (!laudo) throw new Error('Laudo não encontrado');
            const canvas = await html2canvas(laudo, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false });
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            const pdfWidth = 210, pdfHeight = 297;
            const imgWidth = pdfWidth, imgHeight = (canvas.height * pdfWidth) / canvas.width;
            if (imgHeight <= pdfHeight) {
                pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, imgWidth, imgHeight);
            } else {
                let posY = 0, restante = imgHeight;
                while (restante > 0) {
                    pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, -posY, imgWidth, imgHeight);
                    restante -= pdfHeight; posY += pdfHeight;
                    if (restante > 0) pdf.addPage();
                }
            }
            const nome = state.paciente.nome_completo.toUpperCase().replace(/[^A-Z\s]/g, '').trim().substring(0, 50);
            pdf.save(`ETDAH-PAIS - ${nome}_${formatarDataArquivo(new Date())}.pdf`);
            window.CortexUI.toast('PDF gerado com sucesso', 'success');
        } catch (err) {
            console.error('Erro ao gerar PDF:', err);
            window.CortexUI.toast('Erro ao gerar PDF: ' + err.message, 'danger');
        } finally {
            document.body.classList.remove('exportando');
            btn.disabled = false; btn.textContent = orig;
        }
    }

    // ============================================================================
    // UTILS
    // ============================================================================
    function calcularIdadeAnos(nascISO, aplISO) {
        if (!nascISO) return null;
        const ref = aplISO ? new Date(aplISO) : new Date();
        const n = new Date(nascISO);
        if (isNaN(n) || isNaN(ref) || ref < n) return null;
        let anos = ref.getFullYear() - n.getFullYear();
        if (ref.getMonth() < n.getMonth() || (ref.getMonth() === n.getMonth() && ref.getDate() < n.getDate())) anos--;
        return anos;
    }
    function formatarDataBR(iso) {
        if (!iso) return '—';
        const s = String(iso).slice(0, 10);
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
        if (m) return `${m[3]}/${m[2]}/${m[1]}`;
        return new Date(iso).toLocaleDateString('pt-BR');
    }
    function formatarDataArquivo(d) {
        const p = n => String(n).padStart(2, '0');
        return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()}`;
    }
    function escapeHtml(text) {
        if (text === null || text === undefined) return '';
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }
    function mostrarErro(msg) {
        document.getElementById('laudo-conteudo').innerHTML = `
            <div class="erro-state">
                <h2>⚠️ Não foi possível carregar o laudo</h2>
                <p>${escapeHtml(msg)}</p>
                <button class="btn btn-primary" onclick="history.back()">Voltar</button>
            </div>`;
    }
})();

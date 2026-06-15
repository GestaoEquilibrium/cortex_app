// ============================================================================
// CORTEX_APP — Resultado ICA (Inventário de Comportamentos Autísticos / ABC)
// ============================================================================
// URL: ?aplicacao_id=<uuid>
//
// Krug (ABC) | trad. Pedromônico & Marteletto (2005) | 57 itens binários (Sim/Não)
// Peso 1-4 por item | 5 áreas | heteroaplicação (responsável).
//
// Laudo (JS recalcula a partir de escores_brutos.respostas = {numero: 0|1}):
//   - "Sim" soma o PESO do item; "Não" soma 0. Sem itens invertidos.
//   - Subtotal por área (5) + escore total ponderado (0-158).
//   - Classificação por corte do total (fonte: material Genial Care):
//       >=68 Alta probabilidade | 54-67 Moderada | 47-53 Duvidosa | <47 Tipico.
//   - Pesos vivem AQUI (banco nao tem coluna de peso) — area vem do fator (DB).
//   - Triagem; nao substitui avaliacao diagnostica.
// ============================================================================

(function() {
    'use strict';

    const SIGLA_ESPERADA = 'ICA';
    const TOTAL_ITENS = 57;

    // Peso por item (1-4) — protocolo oficial. NÃO está no banco; vive aqui.
    const PESOS = {
        1:4,2:2,3:4,4:1,5:2,6:2,7:2,8:3,9:3,10:3,11:4,12:4,13:2,14:3,15:2,16:4,17:3,18:2,19:4,20:1,
        21:3,22:4,23:3,24:4,25:4,26:3,27:3,28:2,29:2,30:2,31:2,32:3,33:3,34:1,35:2,36:2,37:1,38:4,39:4,40:4,
        41:1,42:2,43:3,44:3,45:1,46:3,47:4,48:4,49:2,50:4,51:3,52:3,53:4,54:2,55:1,56:3,57:4
    };

    // Cortes do escore TOTAL ponderado (0-158)
    const FAIXAS = [
        { min: 68, max: 158, label: 'Alta probabilidade de autismo', cor: '#dc2626', corClara: '#fee2e2', classe: 'ica-alta' },
        { min: 54, max: 67,  label: 'Probabilidade moderada',        cor: '#ea580c', corClara: '#ffedd5', classe: 'ica-moderada' },
        { min: 47, max: 53,  label: 'Avaliação duvidosa',            cor: '#d97706', corClara: '#fef3c7', classe: 'ica-duvidosa' },
        { min: 0,  max: 46,  label: 'Desenvolvimento típico',        cor: '#16a34a', corClara: '#dcfce7', classe: 'ica-tipico' }
    ];
    const MAX_TOTAL = 158;

    function classificarTotal(total) {
        return FAIXAS.find(f => total >= f.min && total <= f.max) || FAIXAS[FAIXAS.length - 1];
    }

    const state = {
        aplicacaoId: null, aplicacao: null, paciente: null,
        norma: null, itens: [], fatores: [], correcao: null, scores: null
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
        if (!norma) throw new Error('Norma ICA não cadastrada');
        state.norma = norma;

        const { data: fatores } = await window.cortexClient
            .from('instrumentos_fatores')
            .select('id, fator_codigo, fator_label, ordem, min_score, max_score, eh_total')
            .eq('norma_id', norma.id).order('ordem');
        state.fatores = fatores || [];

        const { data: itensRaw } = await window.cortexClient
            .from('instrumentos_itens').select('numero, texto, fator_id')
            .eq('norma_id', norma.id).order('numero');
        const mapFator = {};
        for (const f of state.fatores) mapFator[f.id] = f.fator_codigo;
        state.itens = (itensRaw || []).map(i => ({
            numero: i.numero, texto: i.texto,
            fator_codigo: mapFator[i.fator_id] || 'desconhecido'
        }));

        const { data: correcao, error: errC } = await window.cortexClient
            .from('correcoes').select('*').eq('aplicacao_id', state.aplicacaoId)
            .order('created_at', { ascending: false }).limit(1).maybeSingle();
        if (errC) throw new Error('Correção: ' + errC.message);
        if (!correcao) throw new Error('Nenhuma correção encontrada');
        state.correcao = correcao;

        state.scores = calcularResultados(correcao);

        await CortexAudit.log('leitura', 'correcoes', correcao.id, {
            detalhes: { aplicacaoId: state.aplicacaoId, sigla: SIGLA_ESPERADA }
        });
    }

    // ============================================================================
    // CÁLCULO — Sim=peso, Não=0; subtotal por área + total ponderado + classificação
    // ============================================================================
    function calcularResultados(correcao) {
        const respostas = (correcao?.escores_brutos || {}).respostas || {};
        const respPorNum = {};
        for (const [k, v] of Object.entries(respostas)) respPorNum[parseInt(k)] = parseInt(v) || 0;

        const porFator = {};
        for (const f of state.fatores) {
            if (f.eh_total) continue;
            porFator[f.fator_codigo] = {
                codigo: f.fator_codigo, nome: f.fator_label, ordem: f.ordem,
                minScore: f.min_score || 0, maxScore: f.max_score || 0,
                itens: [], soma: 0, n: 0, simCount: 0, pct: 0
            };
        }
        for (const item of state.itens) {
            const valor = respPorNum[item.numero] ?? 0;      // 0 (Não) | 1 (Sim)
            const peso = PESOS[item.numero] || 0;
            const contrib = valor === 1 ? peso : 0;
            const fc = item.fator_codigo;
            if (porFator[fc]) {
                porFator[fc].itens.push({ numero: item.numero, valor, peso, contrib, texto: item.texto });
                porFator[fc].soma += contrib; porFator[fc].n += 1;
                if (valor === 1) porFator[fc].simCount += 1;
            }
        }
        const areas = Object.values(porFator).sort((a, b) => a.ordem - b.ordem);
        let total = 0;
        for (const a of areas) {
            total += a.soma;
            a.pct = a.maxScore > 0 ? Math.round((a.soma / a.maxScore) * 100) : 0;
            a.cor = corAzulPct(a.pct);
            a.corClara = '#dbeafe';
        }

        const respondidos = Object.keys(respostas).length;
        const faixa = classificarTotal(total);
        return {
            areas,
            porPct: [...areas].sort((a, b) => b.pct - a.pct),
            total, maxTotal: MAX_TOTAL, faixa,
            pctTotal: Math.round((total / MAX_TOTAL) * 100),
            respondidos, faltam: TOTAL_ITENS - respondidos
        };
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
                const alvo = document.getElementById('area-' + el.dataset.goto);
                if (alvo) {
                    alvo.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    alvo.classList.add('ica-card-foco');
                    setTimeout(() => alvo.classList.remove('ica-card-foco'), 1400);
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
        <div class="laudo ica-laudo">
            ${renderCabecalho(p, idade, sexoStr, nascStr, dataAplic)}
            ${renderTotal(s)}
            ${renderPerfil(s)}
            ${renderAreasDetalhe(s)}
            ${renderRodape(s)}
        </div>`;
    }

    function renderCabecalho(p, idade, sexoStr, nascStr, dataAplic) {
        const idadeStr = idade !== null ? `${idade} anos` : '—';
        return `
        <header class="ica-header">
            <div class="ica-header-top">
                <div class="ica-header-marca">
                    <div class="ica-logo-mark">E</div>
                    <div>
                        <div class="ica-header-clinica">Equilibrium · Neuropsicologia</div>
                        <div class="ica-header-instr">ICA — Inventário de Comportamentos Autísticos (ABC)</div>
                    </div>
                </div>
                <span class="ica-header-chip">🧩 Rastreio TEA</span>
            </div>
            <div class="ica-paciente-grid">
                <div><span class="ica-pl">Paciente</span><span class="ica-pv">${escapeHtml(p.nome_completo)}</span></div>
                <div><span class="ica-pl">Idade</span><span class="ica-pv">${idadeStr}</span></div>
                <div><span class="ica-pl">Sexo</span><span class="ica-pv">${sexoStr}</span></div>
                <div><span class="ica-pl">Nascimento</span><span class="ica-pv">${nascStr}</span></div>
                <div><span class="ica-pl">Aplicação</span><span class="ica-pv">${dataAplic}</span></div>
                <div><span class="ica-pl">Respondente</span><span class="ica-pv">Heteroaplicação (responsável)</span></div>
            </div>
        </header>`;
    }

    // Painel do escore total + faixa de classificação + régua das 4 faixas
    function renderTotal(s) {
        const f = s.faixa;
        // posição do marcador na régua (0-158)
        const posPct = Math.max(0, Math.min(100, (s.total / s.maxTotal) * 100));
        // larguras das faixas na régua (proporcional ao intervalo de pontos)
        const segs = [
            { lbl: 'Típico', ini: 0,  fim: 46,  cor: '#16a34a' },
            { lbl: 'Duvidosa', ini: 47, fim: 53, cor: '#d97706' },
            { lbl: 'Moderada', ini: 54, fim: 67, cor: '#ea580c' },
            { lbl: 'Alta', ini: 68, fim: 158, cor: '#dc2626' }
        ];
        const reguaSegs = segs.map(g => {
            const w = ((g.fim - g.ini + 1) / (s.maxTotal + 1)) * 100;
            return `<div class="ica-regua-seg" style="width:${w}%;background:${g.cor};" title="${g.lbl} (${g.ini}–${g.fim})">
                        <span class="ica-regua-seg-lbl">${g.lbl}</span>
                    </div>`;
        }).join('');

        return `
        <section class="ica-total" style="--faixa:${f.cor};--faixaClara:${f.corClara};">
            <div class="ica-total-grid">
                <div class="ica-total-num">
                    <div class="ica-total-valor">${s.total}<span class="ica-total-max"> / ${s.maxTotal}</span></div>
                    <div class="ica-total-cap">Escore total ponderado</div>
                </div>
                <div class="ica-total-class">
                    <span class="ica-badge ${f.classe}">${f.label}</span>
                    <div class="ica-total-sub">${s.respondidos}/${TOTAL_ITENS} itens respondidos${s.faltam > 0 ? ` · ${s.faltam} em branco` : ''}</div>
                </div>
            </div>
            <div class="ica-regua">
                <div class="ica-regua-track">${reguaSegs}
                    <div class="ica-regua-marker" style="left:${posPct}%;" title="Escore: ${s.total}">
                        <div class="ica-regua-marker-pin"></div>
                        <div class="ica-regua-marker-val">${s.total}</div>
                    </div>
                </div>
                <div class="ica-regua-eixo"><span>0</span><span>47</span><span>54</span><span>68</span><span>158</span></div>
            </div>
        </section>`;
    }

    // Perfil das 5 áreas em barras (peso ponderado / máx), ordenadas pela mais expressiva
    function renderPerfil(s) {
        const barras = s.porPct.map(a => {
            const w = Math.max(2, a.pct);
            return `
            <div class="ica-bar-row" data-goto="${a.codigo}" role="button" tabindex="0">
                <div class="ica-bar-nome">${escapeHtml(a.nome)}</div>
                <div class="ica-bar-track">
                    <div class="ica-bar-fill" style="width:${w}%;background:${a.cor};"></div>
                </div>
                <div class="ica-bar-val">${a.soma}<span class="ica-bar-max">/${a.maxScore}</span></div>
            </div>`;
        }).join('');
        return `
        <section class="ica-secao">
            <h2 class="ica-secao-titulo">Perfil por área</h2>
            <p class="ica-secao-nota">Soma ponderada de cada área (peso dos itens marcados “Sim”), em relação ao máximo da área. Clique numa barra para ver os itens.</p>
            <div class="ica-bars">${barras}</div>
        </section>`;
    }

    // Detalhe por área: cabeçalho + tira item a item (Sim/Não + peso)
    function renderAreasDetalhe(s) {
        const cards = s.areas.map(a => {
            const itensHtml = a.itens.map(it => {
                const sim = it.valor === 1;
                return `
                <div class="ica-item ${sim ? 'ica-item-sim' : 'ica-item-nao'}">
                    <span class="ica-item-num">${it.numero}</span>
                    <span class="ica-item-txt">${escapeHtml(it.texto)}</span>
                    <span class="ica-item-peso" title="Peso do item">×${it.peso}</span>
                    <span class="ica-item-resp">${sim ? `Sim <b>+${it.contrib}</b>` : 'Não'}</span>
                </div>`;
            }).join('');
            return `
            <div class="ica-area-card" id="area-${a.codigo}">
                <div class="ica-area-head" style="--ac:${a.cor};">
                    <div class="ica-area-head-nome">${escapeHtml(a.nome)}</div>
                    <div class="ica-area-head-stats">
                        <span><b>${a.soma}</b>/${a.maxScore} pts</span>
                        <span>${a.simCount}/${a.n} “Sim”</span>
                    </div>
                </div>
                <div class="ica-area-itens">${itensHtml}</div>
            </div>`;
        }).join('');
        return `
        <section class="ica-secao">
            <h2 class="ica-secao-titulo">Itens por área</h2>
            <div class="ica-areas">${cards}</div>
        </section>`;
    }

    function renderRodape(s) {
        return `
        <section class="ica-rodape">
            <p><strong>Interpretação:</strong> o escore total ponderado (0–158) classifica em faixas de probabilidade — <em>≥68</em> alta, <em>54–67</em> moderada, <em>47–53</em> duvidosa, <em>&lt;47</em> desenvolvimento típico.</p>
            <p class="ica-rodape-aviso">⚠️ O ICA/ABC é um <strong>instrumento de triagem</strong> por observação do responsável. Não estabelece diagnóstico; deve compor uma avaliação multiprofissional. Krug, D. (ABC) — tradução brasileira: Pedromônico, M.R.M.; Marteletto, M.R.F. (2005).</p>
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
            pdf.save(`ICA - ${nome}_${formatarDataArquivo(new Date())}.pdf`);
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
    function corAzulPct(pct) {
        const p = Math.max(0, Math.min(100, pct || 0));
        const l = Math.round(58 - (p / 100) * 18);
        return `hsl(222, 72%, ${l}%)`;
    }
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

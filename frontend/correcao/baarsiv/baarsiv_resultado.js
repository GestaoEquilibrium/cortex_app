// ============================================================================
// CORTEX_APP — Resultado BAARS-IV (laudo)
// ============================================================================
// URL: ?aplicacao_id=<uuid>
//
// BAARS-IV — Barkley Adult ADHD Rating Scale-IV (Barkley, 2011)
// 27 itens · escala Likert 0-3 · 3 subescalas · pontuação por sintomas significativos
//
// AUTOAVALIAÇÃO ADULTOS (18+).
//
// DECISÃO ARQUITETURAL ESPECIAL:
//   Banco grava índice 0-3 em escores_brutos.respostas.
//   JS no laudo:
//     1. Lê as respostas
//     2. Conta SINTOMAS SIGNIFICATIVOS por subescala (val ≥ 2)
//     3. Compara com cutoffs: DES≥5, HIP≥4, SCT≥5 (auxiliar)
//     4. Classifica POSITIVO/NEGATIVO por subescala
//     5. Deriva SUBTIPO TDAH:
//        - DES POS + HIP POS = TDAH-C (Combinada)
//        - DES POS + HIP NEG = TDAH-PI (Predominantemente Desatenta)
//        - DES NEG + HIP POS = TDAH-HI (Predominantemente Hiperativa/Imp)
//        - DES NEG + HIP NEG = Abaixo dos pontos de corte clínicos
// ============================================================================

(function() {
    'use strict';

    const SIGLA_ESPERADA = 'BAARS-IV';

    // ============================================================================
    // SUBESCALAS — cada uma tem 9 itens, max 9 sintomas, cutoff próprio
    // ============================================================================
    const SUBESCALAS_INFO = {
        'DES': {
            label: 'Desatenção',
            cor: '#3b82f6',
            cutoff: 5,
            max_sintomas: 9,
            descricao: 'Avalia 9 sintomas de desatenção do DSM-5/CID-11: dificuldade em manter atenção, organizar tarefas, completar trabalhos, esquecimento e distração por estímulos externos. Cutoff ≥5 sintomas significativos para perfil clinicamente relevante.'
        },
        'HIP': {
            label: 'Hiperatividade/Impulsividade',
            cor: '#dc2626',
            cutoff: 4,
            max_sintomas: 9,
            descricao: 'Avalia 9 sintomas de hiperatividade/impulsividade: inquietação motora, fala excessiva, dificuldade em esperar a vez, interromper conversas e responder precipitadamente. Cutoff ≥4 sintomas significativos.'
        },
        'SCT': {
            label: 'SCT (Sluggish Cognitive Tempo)',
            cor: '#7c3aed',
            cutoff: 5,
            max_sintomas: 9,
            descricao: 'Perfil cognitivo de "ritmo lento" — sonhar acordado, letargia, dificuldade em manter alerta, lentidão para completar tarefas. Não possui cutoff oficial; valores ≥5 são clinicamente relevantes como perfil auxiliar (não diagnóstico de TDAH em si).'
        }
    };

    const SUBESCALAS_ORDEM = ['DES', 'HIP', 'SCT'];

    const ITEM_TO_GRUPO = {"1": "DES", "2": "DES", "3": "DES", "4": "DES", "5": "DES", "6": "DES", "7": "DES", "8": "DES", "9": "DES", "10": "HIP", "11": "HIP", "12": "HIP", "13": "HIP", "14": "HIP", "15": "HIP", "16": "HIP", "17": "HIP", "18": "HIP", "19": "SCT", "20": "SCT", "21": "SCT", "22": "SCT", "23": "SCT", "24": "SCT", "25": "SCT", "26": "SCT", "27": "SCT"};

    // ============================================================================
    // CLASSIFICAÇÃO POR SUBESCALA (em SINTOMAS SIGNIFICATIVOS, não escore bruto)
    // ============================================================================
    function classificarSubescala(code, sintomas) {
        const info = SUBESCALAS_INFO[code];
        const positivo = sintomas >= info.cutoff;

        if (code === 'SCT') {
            return positivo
                ? { label: 'CLINICAMENTE RELEVANTE', slug: 'relevante', cor: '#d97706', positivo: true }
                : { label: 'NEGATIVO', slug: 'negativo', cor: '#16a34a', positivo: false };
        }

        return positivo
            ? { label: 'POSITIVO', slug: 'positivo', cor: '#dc2626', positivo: true }
            : { label: 'NEGATIVO', slug: 'negativo', cor: '#16a34a', positivo: false };
    }

    // ============================================================================
    // DERIVAÇÃO DE SUBTIPO (DSM-5 / Barkley 2011)
    // ============================================================================
    function derivarSubtipo(desPos, hipPos) {
        if (desPos && hipPos) {
            return {
                codigo: 'TDAH-C',
                titulo: 'Apresentação Combinada (TDAH-C)',
                desc: 'Sintomas significativos de Desatenção E de Hiperatividade/Impulsividade ultrapassam os pontos de corte. Configuração típica para investigação diagnóstica de TDAH com apresentação combinada (DSM-5 / CID-11: 6A05).',
                positivo: true
            };
        }
        if (desPos) {
            return {
                codigo: 'TDAH-PI',
                titulo: 'Predominantemente Desatenta (TDAH-PI)',
                desc: 'Sintomas significativos de Desatenção ultrapassam o ponto de corte (≥5), mas Hiperatividade/Impulsividade abaixo do limiar (<4). Compatível com apresentação predominantemente desatenta — investigação diagnóstica recomendada.',
                positivo: true
            };
        }
        if (hipPos) {
            return {
                codigo: 'TDAH-HI',
                titulo: 'Predominantemente Hiperativa/Impulsiva (TDAH-HI)',
                desc: 'Sintomas significativos de Hiperatividade/Impulsividade ultrapassam o ponto de corte (≥4), mas Desatenção abaixo do limiar (<5). Compatível com apresentação predominantemente hiperativa/impulsiva — investigação diagnóstica recomendada.',
                positivo: true
            };
        }
        return {
            codigo: 'NEGATIVO',
            titulo: 'Abaixo dos pontos de corte clínicos',
            desc: 'As contagens de sintomas significativos em ambas as subescalas (Desatenção <5; Hiperatividade <4) ficam abaixo dos pontos de corte clínicos do BAARS-IV (Barkley, 2011) para autoavaliação. Este resultado, isoladamente, não sugere perfil de TDAH em nível clinicamente significativo.',
            positivo: false
        };
    }

    const state = {
        aplicacaoId: null,
        aplicacao: null,
        paciente: null,
        norma: null,
        itens: [],
        correcao: null,
        scores: null
    };

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
            .from('pacientes').select('id, nome_completo, sexo, data_nascimento, cpf, escolaridade')
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
        if (!norma) throw new Error('Norma BAARS-IV não cadastrada');
        state.norma = norma;

        const { data: itens } = await window.cortexClient
            .from('instrumentos_itens').select('numero, texto, reverso, fator_id')
            .eq('norma_id', norma.id).order('numero');
        state.itens = itens || [];

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

    function calcularResultados(correcao) {
        const respostas = (correcao?.escores_brutos || {}).respostas || {};

        // Lê valores 0-3
        const valores = {};
        for (let n = 1; n <= 27; n++) {
            const r = respostas[n];
            valores[n] = (r != null && !isNaN(r)) ? parseInt(r, 10) : 0;
        }

        // Conta SINTOMAS SIGNIFICATIVOS por subescala (val ≥ 2)
        const sintomas = { DES: 0, HIP: 0, SCT: 0 };
        const escoreBruto = { DES: 0, HIP: 0, SCT: 0 };

        for (const [itemStr, code] of Object.entries(ITEM_TO_GRUPO)) {
            const n = parseInt(itemStr, 10);
            const v = valores[n];
            escoreBruto[code] += v;
            if (v >= 2) sintomas[code]++;
        }

        // Classifica cada subescala
        const classifs = {};
        for (const code of SUBESCALAS_ORDEM) {
            classifs[code] = classificarSubescala(code, sintomas[code]);
        }

        // Subtipo derivado (DES e HIP — SCT não entra na derivação)
        const subtipo = derivarSubtipo(classifs.DES.positivo, classifs.HIP.positivo);

        return { valores, sintomas, escoreBruto, classifs, subtipo };
    }

    function renderizar() {
        const cont = document.getElementById('laudo-conteudo');
        cont.innerHTML = renderLaudo();
        document.getElementById('acoes-topo').style.display = 'flex';

        document.getElementById('back-link').href =
            `../../bateria/bateria.html?paciente=${state.paciente.id}`;
        document.getElementById('btn-gerar-pdf').addEventListener('click', gerarPDF);
    }

    function renderLaudo() {
        const idade = calcularIdade(state.paciente.data_nascimento, state.aplicacao.data_aplicacao);
        const dataApl = state.aplicacao.data_aplicacao || state.aplicacao.created_at;
        const nascStr = state.paciente.data_nascimento
            ? formatarDataBR(state.paciente.data_nascimento) : '—';

        const subtipo = state.scores.subtipo;
        const subtipoExtraClass = subtipo.positivo ? '' : ' subtipo-negativo';

        return `
        <div class="laudo">
            <div class="laudo-header">
                <div class="laudo-header-esq">
                    <div class="laudo-header-logo">E</div>
                    <div class="laudo-header-textos">
                        <div class="laudo-header-supratitulo">Relatório de Avaliação Neuropsicológica</div>
                        <h1 class="laudo-header-titulo">BAARS-IV</h1>
                        <div class="laudo-header-subtitulo">Escala de Avaliação de Barkley para TDAH em Adultos<br>Barkley (2011) · 27 itens · 3 subescalas · cutoffs DES≥5, HIP≥4</div>
                    </div>
                </div>
                <div class="laudo-header-pontuacao">
                    <div class="laudo-header-pontuacao-label">Subtipo</div>
                    <div class="laudo-header-pontuacao-valor" style="font-size: 30px;">${subtipo.codigo}</div>
                    <div class="laudo-header-pontuacao-detalhe">DES:${state.scores.sintomas.DES} · HIP:${state.scores.sintomas.HIP} · SCT:${state.scores.sintomas.SCT}</div>
                </div>
            </div>

            <div class="laudo-body">

                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">1</span>
                    Identificação
                </div>
                <div class="laudo-identificacao">
                    <div class="laudo-identif-item">
                        <span class="laudo-identif-label">Nome:</span>
                        <span class="laudo-identif-valor">${escapeHtml(state.paciente.nome_completo)}</span>
                    </div>
                    <div class="laudo-identif-item">
                        <span class="laudo-identif-label">Idade:</span>
                        <span class="laudo-identif-valor">${idade !== null ? idade + ' anos' : '—'}</span>
                    </div>
                    <div class="laudo-identif-item">
                        <span class="laudo-identif-label">Sexo:</span>
                        <span class="laudo-identif-valor">${escapeHtml(state.paciente.sexo || '—')}</span>
                    </div>
                    <div class="laudo-identif-item">
                        <span class="laudo-identif-label">Nascimento:</span>
                        <span class="laudo-identif-valor">${nascStr}</span>
                    </div>
                    <div class="laudo-identif-item">
                        <span class="laudo-identif-label">Avaliação:</span>
                        <span class="laudo-identif-valor">${formatarDataBR(dataApl)}</span>
                    </div>
                    <div class="laudo-identif-item">
                        <span class="laudo-identif-label">Modalidade:</span>
                        <span class="laudo-identif-valor">Autoavaliação (adulto)</span>
                    </div>
                </div>

                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">2</span>
                    Subtipo Derivado
                </div>
                <div class="baars-subtipo-card${subtipoExtraClass}">
                    <div class="baars-subtipo-card-label">Apresentação clínica BAARS-IV</div>
                    <div class="baars-subtipo-card-titulo">${escapeHtml(subtipo.titulo)}</div>
                    <div class="baars-subtipo-card-desc">${escapeHtml(subtipo.desc)}</div>
                </div>

                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">3</span>
                    Resultado por Subescala
                </div>
                <div class="baars-cards-row">
                    ${SUBESCALAS_ORDEM.map(renderSubescalaCard).join('')}
                </div>

                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">4</span>
                    Resumo Numérico
                </div>
                ${renderTabelaResumo()}

                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">5</span>
                    Detalhamento por Subescala
                </div>
                ${SUBESCALAS_ORDEM.map(renderSubescalaDetalhe).join('')}

                <div class="baars-aviso-rastreio">
                    <strong>⚠ Aviso clínico:</strong> O BAARS-IV é um instrumento de
                    <strong>rastreio</strong>. O diagnóstico definitivo de TDAH requer
                    avaliação clínica completa, incluindo história do desenvolvimento,
                    início dos sintomas antes dos 12 anos, presença em múltiplos contextos
                    e impacto funcional significativo (DSM-5 / CID-11: 6A05). Sintomas
                    devem persistir por ≥6 meses e serem incompatíveis com o nível de
                    desenvolvimento.
                </div>

                <div class="baars-nota-tecnica">
                    <strong>Nota técnica:</strong> O BAARS-IV (Barkley, 2011) é
                    instrumento de autoavaliação dos sintomas de TDAH em adultos, baseado
                    nos critérios DSM-5/CID-11. Cada item utiliza escala 0-3 (Nunca-Raramente
                    / Às vezes / Frequentemente / Muito Frequentemente). A pontuação clínica
                    é feita por <strong>contagem de sintomas significativos</strong> — itens
                    com resposta "Frequentemente" (2) ou "Muito Frequentemente" (3) são
                    contabilizados. Os pontos de corte (DES≥5, HIP≥4 sintomas) são derivados
                    dos critérios DSM-5 para TDAH adulto. A subescala SCT (Sluggish Cognitive
                    Tempo) não constitui critério diagnóstico para TDAH, mas pode evidenciar
                    perfil cognitivo auxiliar de relevância clínica quando ≥5 sintomas.
                </div>

                ${renderDetalhesItens()}

            </div>

            <div class="laudo-rodape">
                <div class="laudo-rodape-esq">
                    <div class="laudo-rodape-org">Equilibrium Neuropsicologia</div>
                    <div class="laudo-rodape-tipo">Correção automatizada — BAARS-IV</div>
                </div>
                <div class="laudo-rodape-dir">
                    <div class="laudo-rodape-data">Documento gerado em ${formatarDataBR(new Date().toISOString())}</div>
                    <div class="laudo-rodape-confidencial">Documento confidencial — uso restrito ao profissional solicitante.</div>
                </div>
            </div>
        </div>
        `;
    }

    function renderSubescalaCard(code) {
        const info = SUBESCALAS_INFO[code];
        const sintomas = state.scores.sintomas[code];
        const cl = state.scores.classifs[code];
        const pctBarra = (sintomas / info.max_sintomas) * 100;
        const pctCutoff = (info.cutoff / info.max_sintomas) * 100;
        const statusClass = cl.slug === 'positivo' ? 'baars-status-positivo'
                          : cl.slug === 'relevante' ? 'baars-status-relevante'
                          : 'baars-status-negativo';

        return `
            <div class="baars-sub-card" style="border-left-color:${info.cor};">
                <div class="baars-sub-card-titulo">
                    <span class="baars-sub-card-bullet" style="background:${info.cor};"></span>
                    ${info.label}
                </div>
                <div class="baars-sub-card-numero" style="color:${info.cor};">${sintomas}</div>
                <div class="baars-sub-card-de">de ${info.max_sintomas} sintomas significativos</div>
                <span class="baars-sub-card-status ${statusClass}">${cl.label}</span>
                <div class="baars-sub-barra-wrap">
                    <div class="baars-sub-barra-bg">
                        <div class="baars-sub-barra-fill" style="width:${pctBarra}%;background:${info.cor};"></div>
                        <div class="baars-sub-cutoff-marker" style="left:${pctCutoff}%;"></div>
                    </div>
                    <div class="baars-sub-cutoff-label">cutoff: ≥${info.cutoff} sintomas</div>
                </div>
            </div>
        `;
    }

    function renderTabelaResumo() {
        const linhas = SUBESCALAS_ORDEM.map(code => {
            const info = SUBESCALAS_INFO[code];
            const sintomas = state.scores.sintomas[code];
            const bruto = state.scores.escoreBruto[code];
            const cl = state.scores.classifs[code];
            const statusClass = cl.slug === 'positivo' ? 'baars-status-positivo'
                              : cl.slug === 'relevante' ? 'baars-status-relevante'
                              : 'baars-status-negativo';

            return `<tr>
                <td>
                    <span class="nome-sub">
                        <span class="nome-sub-bullet" style="background:${info.cor};"></span>
                        ${info.label}
                    </span>
                </td>
                <td class="ctr">${bruto} / 27</td>
                <td class="ctr"><span class="escore-sintomas">${sintomas} / ${info.max_sintomas}</span></td>
                <td class="ctr">≥${info.cutoff}</td>
                <td class="ctr"><span class="baars-sub-card-status ${statusClass}" style="margin:0;font-size:10px;padding:3px 10px;">${cl.label}</span></td>
            </tr>`;
        }).join('');

        return `
            <div class="baars-tab-resumo">
                <table>
                    <thead>
                        <tr>
                            <th>Subescala</th>
                            <th class="ctr">Escore Bruto</th>
                            <th class="ctr">Sintomas Sign.</th>
                            <th class="ctr">Cutoff</th>
                            <th class="ctr">Status</th>
                        </tr>
                    </thead>
                    <tbody>${linhas}</tbody>
                </table>
            </div>
        `;
    }

    function renderSubescalaDetalhe(code) {
        const info = SUBESCALAS_INFO[code];
        const cl = state.scores.classifs[code];

        return `
            <div class="baars-sub-card" style="display:block;border-left-color:${info.cor};margin-bottom:14px;">
                <div class="baars-sub-card-titulo" style="margin-bottom:10px;">
                    <span class="baars-sub-card-bullet" style="background:${info.cor};"></span>
                    ${info.label}
                </div>
                <p style="font-size:13px;color:#334155;line-height:1.7;margin:0;">${escapeHtml(info.descricao)}</p>
            </div>
        `;
    }

    function renderDetalhesItens() {
        if (!state.itens.length) return '';
        const labels = state.norma?.answer_labels || [];
        const respostas = state.correcao?.escores_brutos?.respostas || {};

        const linhas = state.itens.map(item => {
            const grupo = ITEM_TO_GRUPO[item.numero];
            const grupoInfo = SUBESCALAS_INFO[grupo];
            const grupoTxt = grupo
                ? `<span style="background:${grupoInfo.cor}22;color:${grupoInfo.cor};padding:2px 8px;border-radius:6px;font-size:10px;font-weight:700;">${grupo}</span>`
                : '—';
            const idxResp = respostas[item.numero];
            const labelResp = (idxResp !== undefined && labels[idxResp] !== undefined) ? labels[idxResp] : '—';
            const v = state.scores.valores[item.numero];
            const isSintoma = v >= 2;

            return `<tr>
                <td style="text-align:center;font-weight:700;color:#1e40af;">${item.numero}</td>
                <td>${escapeHtml(item.texto)}</td>
                <td>${grupoTxt}</td>
                <td style="text-align:center;">${labelResp}</td>
                <td style="text-align:center;font-weight:700;color:${isSintoma ? '#dc2626' : '#94a3b8'};">${isSintoma ? '✓' : '—'}</td>
            </tr>`;
        }).join('');

        return `
            <details class="laudo-detalhes-toggle">
                <summary>▾ Ver respostas item a item (${state.itens.length} itens)</summary>
                <table class="laudo-detalhes-tabela">
                    <thead>
                        <tr>
                            <th style="width:40px;text-align:center;">Nº</th>
                            <th>Item</th>
                            <th>Subescala</th>
                            <th style="text-align:center;width:170px;">Resposta</th>
                            <th style="text-align:center;width:90px;">Sint. Sign.</th>
                        </tr>
                    </thead>
                    <tbody>${linhas}</tbody>
                </table>
            </details>
        `;
    }

    async function gerarPDF() {
        const btn = document.getElementById('btn-gerar-pdf');
        const orig = btn.textContent;
        btn.disabled = true;
        btn.textContent = '⏳ Gerando PDF...';

        try {
            document.body.classList.add('exportando');
            await new Promise(r => setTimeout(r, 100));
            const laudo = document.querySelector('.laudo');
            if (!laudo) throw new Error('Laudo não encontrado');

            const canvas = await html2canvas(laudo, {
                scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false
            });

            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            const pdfWidth = 210, pdfHeight = 297;
            const imgWidth = pdfWidth;
            const imgHeight = (canvas.height * pdfWidth) / canvas.width;

            if (imgHeight <= pdfHeight) {
                pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, imgWidth, imgHeight);
            } else {
                let posY = 0, restante = imgHeight;
                while (restante > 0) {
                    pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, -posY, imgWidth, imgHeight);
                    restante -= pdfHeight;
                    posY += pdfHeight;
                    if (restante > 0) pdf.addPage();
                }
            }

            const nomeAbreviado = state.paciente.nome_completo.toUpperCase()
                .replace(/[^A-Z\s]/g, '').trim().substring(0, 50);
            const dataStr = formatarDataArquivo(new Date());
            const nomeArquivo = `BAARS-IV - ${nomeAbreviado}_${dataStr}.pdf`;

            pdf.save(nomeArquivo);
            window.CortexUI.toast('PDF gerado com sucesso', 'success');
        } catch (err) {
            console.error('Erro ao gerar PDF:', err);
            window.CortexUI.toast('Erro ao gerar PDF: ' + err.message, 'danger');
        } finally {
            document.body.classList.remove('exportando');
            btn.disabled = false;
            btn.textContent = orig;
        }
    }

    function calcularIdade(nascISO, aplISO) {
        if (!nascISO) return null;
        const ref = aplISO ? new Date(aplISO) : new Date();
        const n = new Date(nascISO);
        if (isNaN(n) || isNaN(ref) || ref < n) return null;
        let anos = ref.getFullYear() - n.getFullYear();
        const m = ref.getMonth() - n.getMonth();
        if (m < 0 || (m === 0 && ref.getDate() < n.getDate())) anos--;
        return anos;
    }

    function formatarDataBR(iso) {
        if (!iso) return '—';
        const d = iso.includes('T') ? new Date(iso) : new Date(iso + 'T00:00:00');
        return d.toLocaleDateString('pt-BR');
    }

    function formatarDataArquivo(d) {
        const ano = d.getFullYear();
        const mes = String(d.getMonth() + 1).padStart(2, '0');
        const dia = String(d.getDate()).padStart(2, '0');
        return `${ano}-${mes}-${dia}`;
    }

    function mostrarErro(msg) {
        document.getElementById('laudo-conteudo').innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="12" y1="8" x2="12" y2="12"/>
                        <line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                </div>
                <div class="empty-state-title">${escapeHtml(msg)}</div>
            </div>
        `;
    }

    function escapeHtml(text) {
        if (text === null || text === undefined) return '';
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }
})();

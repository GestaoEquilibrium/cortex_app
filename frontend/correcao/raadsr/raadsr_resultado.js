// ============================================================================
// CORTEX_APP — Resultado RAADS-R (visualização + geração de PDF)
// ============================================================================
// URL: ?aplicacao_id=<uuid>
//
// Carrega:
//   - Aplicação + paciente + instrumento
//   - Correção (escores_brutos, classificacoes)
//   - Renderiza no padrão Equilibrium
//
// Gera PDF via html2canvas + jsPDF (mesma técnica do Ponto Digital)
// ============================================================================

(function() {
    'use strict';

    const VERSAO_ESPERADA = 'raadsr_screen';

    const state = {
        aplicacaoId: null,
        aplicacao: null,
        paciente: null,
        instrumento: null,
        norma: null,
        correcao: null,
        respostas: {},
        itens: []  // pra mostrar no detalhamento
    };

    // ============================================================================
    // INICIALIZAÇÃO
    // ============================================================================

    window.addEventListener('cortex:auth-ready', async () => {
        await CortexSidebar.render('pacientes');

        const params = new URLSearchParams(window.location.search);
        state.aplicacaoId = params.get('aplicacao_id');

        if (!state.aplicacaoId) {
            mostrarErro('aplicacao_id não fornecido na URL');
            return;
        }

        try {
            await carregarTudo();
            renderizar();
        } catch (err) {
            console.error('Erro ao carregar:', err);
            mostrarErro('Erro: ' + (err.message || 'desconhecido'));
        }
    });

    async function carregarTudo() {
        // 1. Aplicação
        const { data: aplicacao, error: errA } = await window.cortexClient
            .from('aplicacoes_instrumento')
            .select('*')
            .eq('id', state.aplicacaoId)
            .single();
        if (errA) throw new Error('Aplicação: ' + errA.message);
        state.aplicacao = aplicacao;

        // 2. Paciente
        const { data: paciente, error: errP } = await window.cortexClient
            .from('pacientes')
            .select('id, nome_completo, sexo, data_nascimento, cpf')
            .eq('id', aplicacao.paciente_id)
            .single();
        if (errP) throw new Error('Paciente: ' + errP.message);
        state.paciente = paciente;

        // 3. Instrumento
        const { data: instrumento, error: errI } = await window.cortexClient
            .from('instrumentos_catalogo')
            .select('id, sigla, nome_completo')
            .eq('id', aplicacao.instrumento_id)
            .single();
        if (errI) throw new Error('Instrumento: ' + errI.message);
        state.instrumento = instrumento;

        if (instrumento.sigla !== 'RAADS-R') {
            throw new Error(`Esperado RAADS-R, encontrado ${instrumento.sigla}`);
        }

        // 4. Norma
        const { data: norma, error: errN } = await window.cortexClient
            .from('instrumentos_normas')
            .select('*')
            .eq('versao_codigo', VERSAO_ESPERADA)
            .eq('instrumento_id', instrumento.id)
            .eq('ativa', true)
            .maybeSingle();
        if (errN) throw new Error('Norma: ' + errN.message);
        if (!norma) throw new Error('Norma RAADS-R não cadastrada');
        state.norma = norma;

        // 5. Itens (pra detalhamento)
        const { data: itens } = await window.cortexClient
            .from('instrumentos_itens')
            .select('numero, texto, reverso')
            .eq('norma_id', norma.id)
            .order('numero');
        state.itens = itens || [];

        // 6. Correção
        const { data: correcao, error: errC } = await window.cortexClient
            .from('correcoes')
            .select('*')
            .eq('aplicacao_id', state.aplicacaoId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        if (errC) throw new Error('Correção: ' + errC.message);
        if (!correcao) {
            throw new Error('Nenhuma correção encontrada para esta aplicação');
        }
        state.correcao = correcao;

        // Extrai respostas
        const escoresBrutos = correcao.escores_brutos || {};
        state.respostas = escoresBrutos.respostas || {};

        await CortexAudit.log('leitura', 'correcoes', correcao.id, {
            detalhes: { aplicacaoId: state.aplicacaoId }
        });
    }

    // ============================================================================
    // RENDERIZAÇÃO DO LAUDO
    // ============================================================================

    function renderizar() {
        const cont = document.getElementById('laudo-conteudo');
        cont.innerHTML = renderLaudo();
        document.getElementById('acoes-topo').style.display = 'flex';

        // Listeners
        document.getElementById('back-link').href =
            `../../bateria/bateria.html?paciente=${state.paciente.id}`;

        document.getElementById('btn-gerar-pdf').addEventListener('click', gerarPDF);
    }

    function renderLaudo() {
        const score = parseInt(state.correcao.escores_brutos?.score_total || 0);
        const cutoff = 46;
        const max = 80;
        const positivo = score >= cutoff;
        const classifLabel = state.correcao.classificacoes?.total || '—';

        // Identificação
        const idade = calcularIdade(state.paciente.data_nascimento);
        const dataAplStr = state.aplicacao.data_aplicacao
            ? formatarDataExtenso(state.aplicacao.data_aplicacao)
            : '—';
        const nascStr = state.paciente.data_nascimento
            ? formatarDataBR(state.paciente.data_nascimento)
            : '—';

        // Posição na barra (raw 20-80 → 0-100%)
        const pctMarcador = Math.max(0, Math.min(100, ((score - 20) / (max - 20)) * 100));

        // Cor do card paciente conforme resultado
        const corCardPaciente = positivo
            ? 'laudo-card-paciente-positivo'
            : 'laudo-card-paciente-negativo';

        const corMarcador = positivo
            ? 'background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%);'
            : 'background: linear-gradient(135deg, #059669 0%, #047857 100%);';

        // Texto interpretativo
        let interpretacao;
        if (positivo) {
            interpretacao = `A pontuação de <strong>${score} pontos</strong> encontra-se <strong>ACIMA</strong> do ponto de corte estabelecido (${cutoff}) pelos estudos de validação. Este resultado indica que a participante reporta uma frequência de comportamentos e experiências compatível com o perfil do Espectro Autista. Estatisticamente, pontuações nesta faixa apresentam alta sensibilidade (90,1%) para a identificação do transtorno.`;
        } else {
            interpretacao = `A pontuação de <strong>${score} pontos</strong> encontra-se <strong>ABAIXO</strong> do ponto de corte estabelecido (${cutoff}) pelos estudos de validação. Este resultado indica frequência de comportamentos abaixo do limiar clínico de rastreio para o Espectro Autista nesta escala.`;
        }

        return `
        <div class="laudo">

            <!-- ─── CABEÇALHO AZUL ─── -->
            <div class="laudo-header">
                <div class="laudo-header-esq">
                    <div class="laudo-header-logo">E</div>
                    <div class="laudo-header-textos">
                        <div class="laudo-header-supratitulo">Relatório Neuropsicológico</div>
                        <h1 class="laudo-header-titulo">RAADS-R-BR Screen</h1>
                        <div class="laudo-header-subtitulo">
                            Escala Ritvo para Diagnóstico de Autismo em Adultos<br>
                            Versão Brasileira Reduzida
                        </div>
                    </div>
                </div>
                <div class="laudo-header-pontuacao">
                    <div class="laudo-header-pontuacao-label">Pontuação</div>
                    <div class="laudo-header-pontuacao-valor">${score}</div>
                    <div class="laudo-header-pontuacao-max">de ${max} pontos</div>
                </div>
            </div>

            <!-- ─── CORPO ─── -->
            <div class="laudo-body">

                <!-- ① Identificação -->
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
                        <span class="laudo-identif-label">CPF:</span>
                        <span class="laudo-identif-valor">${escapeHtml(state.paciente.cpf || '—')}</span>
                    </div>
                    <div class="laudo-identif-item">
                        <span class="laudo-identif-label">Nascimento:</span>
                        <span class="laudo-identif-valor">${nascStr}${idade !== null ? ` (${idade} anos)` : ''}</span>
                    </div>
                    <div class="laudo-identif-item">
                        <span class="laudo-identif-label">Avaliação:</span>
                        <span class="laudo-identif-valor">${dataAplStr}</span>
                    </div>
                    <div class="laudo-identif-item">
                        <span class="laudo-identif-label">Respondente:</span>
                        <span class="laudo-identif-valor">A própria</span>
                    </div>
                    <div class="laudo-identif-item">
                        <span class="laudo-identif-label">Modalidade:</span>
                        <span class="laudo-identif-valor">${state.aplicacao.modalidade === 'online' ? 'Online (link)' : 'Presencial'}</span>
                    </div>
                </div>

                <!-- ② Sobre o Instrumento -->
                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">2</span>
                    Sobre o Instrumento
                </div>
                <div class="laudo-caixa-descricao">
                    <p>O RAADS-R-BR Screen é uma escala de rastreio desenvolvida para identificar características do Transtorno do Espectro Autista (TEA) em adultos. A versão utilizada é composta por 20 itens que avaliam domínios centrais do perfil neurodivergente, incluindo: Interação Social, Linguagem, Sensório-Motor e Interesses Circunscritos.</p>
                    <p>O instrumento foi validado para o contexto brasileiro, apresentando evidências robustas de validade e confiabilidade, com <strong>sensibilidade de 90,1%</strong> e <strong>especificidade de 87,9%</strong> para o ponto de corte estabelecido.</p>
                </div>

                <!-- ③ Resultados Obtidos -->
                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">3</span>
                    Resultados Obtidos
                </div>

                <div class="laudo-cards">
                    <div class="laudo-card ${corCardPaciente}">
                        <div class="laudo-card-label">Paciente</div>
                        <div class="laudo-card-valor">${score}</div>
                    </div>
                    <div class="laudo-card laudo-card-corte">
                        <div class="laudo-card-label">Ponto de Corte</div>
                        <div class="laudo-card-valor">${cutoff}</div>
                    </div>
                    <div class="laudo-card laudo-card-max">
                        <div class="laudo-card-label">Máximo</div>
                        <div class="laudo-card-valor">${max}</div>
                    </div>
                </div>

                <div class="laudo-barra-container">
                    <div class="laudo-barra-titulo">Pontuação do paciente vs ponto de corte</div>
                    <div class="laudo-barra-fundo">
                        <div class="laudo-barra-cutoff"></div>
                        <div class="laudo-barra-marcador" style="left: ${pctMarcador}%; ${corMarcador}">
                            ${score}
                        </div>
                    </div>
                    <div class="laudo-barra-extremos">
                        <span>20 (mín.)</span>
                        <span>↑ corte ${cutoff}</span>
                        <span>${max} (máx.)</span>
                    </div>
                </div>

                <!-- ④ Interpretação -->
                <div class="laudo-secao-titulo">
                    <span class="laudo-secao-tag">4</span>
                    Classificação: ${escapeHtml(classifLabel)}
                </div>
                <div class="laudo-caixa-descricao">
                    <p>${interpretacao}</p>
                </div>

                ${renderDetalhes()}

            </div>

            <!-- ─── RODAPÉ ─── -->
            <div class="laudo-rodape">
                <div class="laudo-rodape-esq">
                    <div class="laudo-rodape-org">Equilibrium Neuropsicologia</div>
                    <div class="laudo-rodape-tipo">Correção automatizada — RAADS-R-BR Screen</div>
                </div>
                <div class="laudo-rodape-dir">
                    <div class="laudo-rodape-data">Documento gerado em ${formatarDataBR(new Date().toISOString())}</div>
                    <div class="laudo-rodape-confidencial">Este documento é confidencial e destinado exclusivamente ao profissional solicitante.</div>
                </div>
            </div>

        </div>
        `;
    }

    function renderDetalhes() {
        if (!state.itens || state.itens.length === 0) return '';

        let linhas = '';
        for (const item of state.itens) {
            const valor = state.respostas[item.numero];
            const labels = state.norma.answer_labels;
            const labelResposta = (valor !== undefined && labels[valor - 1])
                ? labels[valor - 1]
                : '—';

            const tagReverso = item.reverso
                ? '<span class="laudo-detalhes-tag-reversa">↩ invertido</span>'
                : '';

            // Pontuação aplicando inversão (escala 1-4)
            let pontos = '—';
            if (valor !== undefined) {
                pontos = item.reverso ? (5 - valor) : valor;
            }

            linhas += `
                <tr>
                    <td style="text-align:center;font-weight:700;color:#1e40af;">${item.numero}</td>
                    <td>${escapeHtml(item.texto)} ${tagReverso}</td>
                    <td style="text-align:center;">${escapeHtml(labelResposta)} (${valor || '—'})</td>
                    <td style="text-align:center;font-weight:700;">${pontos}</td>
                </tr>
            `;
        }

        return `
        <details class="laudo-detalhes-toggle">
            <summary>▾ Ver respostas item a item (${state.itens.length} itens)</summary>
            <table class="laudo-detalhes-tabela">
                <thead>
                    <tr>
                        <th style="width:40px;text-align:center;">Nº</th>
                        <th>Item</th>
                        <th style="text-align:center;width:160px;">Resposta</th>
                        <th style="text-align:center;width:60px;">Pontos</th>
                    </tr>
                </thead>
                <tbody>
                    ${linhas}
                </tbody>
            </table>
        </details>
        `;
    }

    // ============================================================================
    // GERAÇÃO DE PDF
    // ============================================================================

    async function gerarPDF() {
        const btn = document.getElementById('btn-gerar-pdf');
        const textoOriginal = btn.textContent;
        btn.disabled = true;
        btn.textContent = '⏳ Gerando PDF...';

        try {
            // Modo "exportando" — esconde sidebar, botões, detalhes
            document.body.classList.add('exportando');

            // Espera CSS aplicar
            await new Promise(r => setTimeout(r, 100));

            const laudo = document.querySelector('.laudo');
            if (!laudo) throw new Error('Laudo não encontrado');

            // Renderiza HTML como canvas em alta resolução
            const canvas = await html2canvas(laudo, {
                scale: 2,                  // 2x pra qualidade
                backgroundColor: '#ffffff',
                useCORS: true,
                logging: false
            });

            // Cria PDF A4 (210x297mm)
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4'
            });

            const pdfWidth = 210;
            const pdfHeight = 297;
            const imgWidth = pdfWidth;
            const imgHeight = (canvas.height * pdfWidth) / canvas.width;

            // Se couber em 1 página
            if (imgHeight <= pdfHeight) {
                pdf.addImage(
                    canvas.toDataURL('image/jpeg', 0.95),
                    'JPEG',
                    0, 0, imgWidth, imgHeight
                );
            } else {
                // Quebra em páginas
                let posY = 0;
                let restante = imgHeight;
                while (restante > 0) {
                    pdf.addImage(
                        canvas.toDataURL('image/jpeg', 0.95),
                        'JPEG',
                        0, -posY, imgWidth, imgHeight
                    );
                    restante -= pdfHeight;
                    posY += pdfHeight;
                    if (restante > 0) pdf.addPage();
                }
            }

            // Nome do arquivo
            const nomeAbreviado = state.paciente.nome_completo.toUpperCase()
                .replace(/[^A-Z\s]/g, '')
                .trim()
                .substring(0, 50);
            const score = state.correcao.escores_brutos?.score_total || 0;
            const dataStr = formatarDataArquivo(new Date());
            const nomeArquivo = `RAADS-R - ${nomeAbreviado}_${dataStr}_${score}pts.pdf`;

            pdf.save(nomeArquivo);

            window.CortexUI.toast('PDF gerado com sucesso', 'success');
        } catch (err) {
            console.error('Erro ao gerar PDF:', err);
            window.CortexUI.toast('Erro ao gerar PDF: ' + err.message, 'danger');
        } finally {
            document.body.classList.remove('exportando');
            btn.disabled = false;
            btn.textContent = textoOriginal;
        }
    }

    // ============================================================================
    // UTILS
    // ============================================================================

    function calcularIdade(dataNascISO) {
        if (!dataNascISO) return null;
        const hoje = new Date();
        const nasc = new Date(dataNascISO);
        let anos = hoje.getFullYear() - nasc.getFullYear();
        const m = hoje.getMonth() - nasc.getMonth();
        if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) anos--;
        return anos;
    }

    function formatarDataBR(iso) {
        if (!iso) return '—';
        const d = iso.includes('T') ? new Date(iso) : new Date(iso + 'T00:00:00');
        return d.toLocaleDateString('pt-BR');
    }

    function formatarDataExtenso(iso) {
        if (!iso) return '—';
        const d = iso.includes('T') ? new Date(iso) : new Date(iso + 'T00:00:00');
        const meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
                       'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
        return `${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;
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

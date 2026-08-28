// ============================================================================
// CORTEX_APP — solicitacao_escolar.js
// ----------------------------------------------------------------------------
// Gera a "Solicitação de relatório escolar para fins de diagnóstico" já
// preenchida com os dados do paciente, no layout do CORTEX, pronta para
// imprimir e levar na escola.
//
// Dois modelos, porque o que se pergunta a uma creche não é o que se pergunta
// a um professor de ensino médio:
//   - infantil     : educação infantil (até ~5 anos)
//   - escolarizado : fundamental e médio
//
// O modelo é sugerido pela escolaridade/idade do paciente e pode ser trocado
// na hora. Todo campo do documento é editável antes de gerar — a edição vale
// só para o documento, não altera o cadastro.
//
// API:
//   CortexSolicitacaoEscolar.abrir({ paciente, profissional, logo })
// ============================================================================

window.CortexSolicitacaoEscolar = (function () {
    'use strict';

    const CLINICA = {
        nome: 'Equilibrium Med Center',
        endereco: 'Av. Cesário Alvim, 2001 — B. Aparecida, Uberlândia/MG',
        telefones: '(34) 3212-9269 · (34) 99781-3331 · (34) 99642-4575'
    };

    // ── Conteúdo dos dois modelos ───────────────────────────────────────────

    const MODELOS = {
        infantil: {
            rotulo: 'Educação infantil',
            destinatario: 'Coordenação Pedagógica / Professor(a) Regente',
            finalidade: 'investigação clínica e o acompanhamento do neurodesenvolvimento',
            secoes: [
                {
                    titulo: 'Desenvolvimento cognitivo e aprendizagem',
                    itens: [
                        'Curiosidade e exploração do ambiente escolar;',
                        'Desenvolvimento da linguagem expressiva e receptiva (consegue comunicar desejos e necessidades? compreende comandos simples?);',
                        'Participação em atividades lúdicas, musicais e contação de histórias;',
                        'Assimilação de noções básicas trabalhadas na idade (cores, formas, esquema corporal).'
                    ]
                },
                {
                    titulo: 'Desenvolvimento motor (amplo e fino)',
                    itens: [
                        'Coordenação motora global em atividades recreativas (correr, pular, subir, descer, equilíbrio);',
                        'Coordenação motora fina (manuseio de massinha, preensão do giz e do lápis, encaixe de peças);',
                        'Autonomia nas atividades de vida diária na escola (alimentação, higiene, desfralde e uso do banheiro).'
                    ]
                },
                {
                    titulo: 'Participação e rotina escolar',
                    itens: [
                        'Nível de atenção e permanência em atividades direcionadas (por exemplo, o momento da rodinha);',
                        'Facilidade ou dificuldade em seguir instruções simples do(a) professor(a);',
                        'Adaptação às transições de rotina (sair do parque para a sala, hora de guardar os brinquedos);',
                        'Necessidade de suporte individualizado ou mediação constante do adulto.'
                    ]
                },
                {
                    titulo: 'Interação social e afetividade',
                    itens: [
                        'Interação com os pares (brinca junto, realiza brincadeiras paralelas, busca os colegas ou permanece isolado?);',
                        'Capacidade de compartilhar brinquedos e aguardar a sua vez;',
                        'Interação e estabelecimento de vínculo com professores e outros adultos;',
                        'Receptividade ao toque, ao contato visual e ao acolhimento.'
                    ]
                },
                {
                    titulo: 'Interesses e engajamento',
                    itens: [
                        'Brincadeiras, brinquedos e áreas de interesse preferidas;',
                        'Engajamento e motivação diante de novas atividades propostas.'
                    ]
                },
                {
                    titulo: 'Traços comportamentais e regulação emocional',
                    itens: [
                        'Temperamento geral e disposição no dia a dia;',
                        'Reação a frustrações, a limites ou a mudanças no ambiente (intensidade, frequência e tempo de recuperação em crises de choro);',
                        'Presença de comportamentos repetitivos, atípicos ou estereotipias motoras e vocais;',
                        'Reatividade sensorial (incômodo com barulhos, com texturas como tinta e areia, ou seletividade alimentar).'
                    ]
                }
            ]
        },

        escolarizado: {
            rotulo: 'Ensino fundamental / médio',
            destinatario: 'Responsável / Coordenador Pedagógico',
            finalidade: 'diagnóstico e avaliação neuropsicológica',
            secoes: [
                {
                    titulo: 'Desenvolvimento acadêmico',
                    itens: [
                        'Desempenho em disciplinas específicas (pontos fortes e pontos frágeis);',
                        'Hábitos de estudo e organização;',
                        'Dificuldades de aprendizagem observadas;',
                        'Habilidades e dificuldades na leitura e na escrita.'
                    ]
                },
                {
                    titulo: 'Desenvolvimento motor nas atividades físicas',
                    itens: [
                        'Coordenação motora e habilidades atléticas;',
                        'Participação em atividades físicas e esportivas;',
                        'Dificuldades de coordenação.'
                    ]
                },
                {
                    titulo: 'Participação do aluno em aula',
                    itens: [
                        'Nível de atenção e concentração;',
                        'Participação em discussões e atividades em grupo;',
                        'Comportamento em sala de aula;',
                        'Facilidade em seguir instruções.'
                    ]
                },
                {
                    titulo: 'Interação com os colegas',
                    itens: [
                        'Habilidades sociais e relacionamentos interpessoais;',
                        'Comportamento em situações de grupo;',
                        'Aceitação entre os colegas.'
                    ]
                },
                {
                    titulo: 'Interesses demonstrados',
                    itens: [
                        'Áreas de interesse e hobbies;',
                        'Atividades extracurriculares;',
                        'Motivação escolar.'
                    ]
                },
                {
                    titulo: 'Traços comportamentais',
                    itens: [
                        'Temperamento e personalidade;',
                        'Comportamentos desafiadores ou atípicos;',
                        'Reação a frustrações e a mudanças;',
                        'Adaptação ao ambiente escolar.'
                    ]
                }
            ]
        }
    };

    // ── Estado ──────────────────────────────────────────────────────────────

    let ctx = { paciente: null, profissional: null, logo: '' };
    let edits = {};
    let modeloAtual = 'escolarizado';

    // ── Utilitários ─────────────────────────────────────────────────────────

    function esc(t) {
        const d = document.createElement('div');
        d.textContent = (t === null || t === undefined) ? '' : String(t);
        return d.innerHTML;
    }

    function fmtData(iso) {
        if (!iso) return '—';
        const s = String(iso).substring(0, 10).split('-');
        if (s.length !== 3) return '—';
        return `${s[2]}/${s[1]}/${s[0]}`;
    }

    function hoje() {
        const d = new Date();
        const meses = ['janeiro','fevereiro','março','abril','maio','junho',
                       'julho','agosto','setembro','outubro','novembro','dezembro'];
        return `Uberlândia, ${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;
    }

    function idadeAnos(dn) {
        if (!dn) return null;
        const p = String(dn).substring(0, 10).split('-');
        if (p.length !== 3) return null;
        // Data local, não UTC: new Date('YYYY-MM-DD') vira o dia anterior em BRT.
        const nasc = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
        const h = new Date();
        let a = h.getFullYear() - nasc.getFullYear();
        const m = h.getMonth() - nasc.getMonth();
        if (m < 0 || (m === 0 && h.getDate() < nasc.getDate())) a--;
        return a;
    }

    /** Sugere o modelo pela escolaridade escrita; cai na idade se não der. */
    function sugerirModelo(p) {
        const txt = [(p.escolaridade || ''), (p.escolaridade_serie || ''),
                     (p.escolaridade_completa || '')].join(' ').toLowerCase();

        if (/infantil|cre(ch|x)e|maternal|jardim|pr[eé][- ]?escola|berç/.test(txt)) return 'infantil';
        if (/fundamental|m[eé]dio|ano|s[eé]rie|eja/.test(txt)) return 'escolarizado';

        const idade = idadeAnos(p.data_nascimento);
        if (idade !== null && idade < 6) return 'infantil';
        return 'escolarizado';
    }

    function serieDoPaciente(p) {
        const serie = (p.escolaridade_serie || '').trim();
        const nivel = (p.escolaridade || '').trim();
        const completa = (p.escolaridade_completa || '').trim();
        if (completa) return completa;
        if (nivel && serie) return `${serie} — ${nivel}`;
        return serie || nivel || '';
    }

    function valores() {
        const p = ctx.paciente || {};
        const prof = ctx.profissional || {};
        const pick = (k, padrao) => (edits[k] !== undefined ? edits[k] : padrao);
        const m = MODELOS[modeloAtual];

        return {
            aluno: pick('aluno', (p.nome_completo || '').toUpperCase()),
            nascimento: pick('nascimento', fmtData(p.data_nascimento)),
            serie: pick('serie', serieDoPaciente(p)),
            destinatario: pick('destinatario', m.destinatario),
            finalidade: pick('finalidade', m.finalidade),
            profNome: pick('profNome', prof.nome_completo || ''),
            profTitulo: pick('profTitulo', 'Psicólogo(a) / Neuropsicólogo(a)'),
            profCrp: pick('profCrp', prof.crp || ''),
            local: pick('local', hoje())
        };
    }

    // ── Documento ───────────────────────────────────────────────────────────

    function montarHtml() {
        const v = valores();
        const m = MODELOS[modeloAtual];

        const secoes = m.secoes.map((s, i) => `
            <div style="margin-bottom:13px; page-break-inside:avoid;">
                <div style="display:flex; align-items:baseline; gap:8px; margin-bottom:5px;">
                    <span style="
                        display:inline-block; min-width:19px; height:19px; line-height:19px;
                        text-align:center; border-radius:5px; background:#2e74b5; color:#ffffff;
                        font-size:10.5px; font-weight:700; flex-shrink:0;">${i + 1}</span>
                    <span style="font-size:12.5px; font-weight:700; color:#12325a; letter-spacing:.01em;">${esc(s.titulo)}</span>
                </div>
                <div style="padding-left:27px;">
                    ${s.itens.map(it => `
                        <div style="display:flex; gap:8px; margin-bottom:3px;">
                            <span style="color:#2e74b5; font-size:11px; line-height:1.55; flex-shrink:0;">▪</span>
                            <span style="font-size:11px; line-height:1.55; color:#243244;">${esc(it)}</span>
                        </div>`).join('')}
                </div>
            </div>`).join('');

        return `
        <div id="pdf-solicitacao-escolar" style="
            width:720px; background:#ffffff; box-sizing:border-box;
            font-family:'Inter',-apple-system,sans-serif; color:#0f172a;
            padding:0 0 34px; margin:0;">

            <div style="background:#ecf8ff; border-bottom:3px solid #2e74b5;
                        padding:22px 54px 18px; text-align:center;">
                ${ctx.logo ? `<img src="${ctx.logo}" alt="${esc(CLINICA.nome)}" style="height:56px; width:auto; display:block; margin:0 auto 6px;" />` : ''}
                <div style="font-size:9px; color:#4a6a8a; letter-spacing:.05em;">
                    ${esc(CLINICA.endereco)}
                </div>
            </div>

            <div style="padding:24px 54px 0;">

                <div style="text-align:center; margin-bottom:20px;">
                    <div style="font-size:14.5px; font-weight:800; color:#12325a; letter-spacing:.02em; line-height:1.35;">
                        SOLICITAÇÃO DE RELATÓRIO ESCOLAR
                    </div>
                    <div style="font-size:10.5px; color:#5a7290; margin-top:2px; letter-spacing:.06em; text-transform:uppercase;">
                        para fins de diagnóstico
                    </div>
                </div>

                <div style="background:#f8fafc; border-left:4px solid #2e74b5;
                            border-radius:0 6px 6px 0; padding:11px 15px; margin-bottom:17px;">
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:7px 18px;">
                        ${campoDoc('Aluno(a)', v.aluno, true)}
                        ${campoDoc('Data de nascimento', v.nascimento)}
                        ${campoDoc('Ano / série', v.serie || '—')}
                        ${campoDoc('Destinatário', v.destinatario, true)}
                    </div>
                </div>

                <p style="font-size:11.5px; line-height:1.65; color:#243244; margin:0 0 8px;">
                    Prezados(as),
                </p>

                <p style="font-size:11.5px; line-height:1.65; color:#243244; margin:0 0 16px; text-align:justify;">
                    Solicito, por meio deste, a elaboração e o envio de um relatório escolar detalhado
                    referente ao(à) aluno(a) <strong>${esc(v.aluno)}</strong>, nascido(a) em
                    <strong>${esc(v.nascimento)}</strong>${v.serie ? `, atualmente matriculado(a) e cursando <strong>${esc(v.serie)}</strong>` : ''}.
                    O presente relatório é necessário para fins de ${esc(v.finalidade)}.
                </p>

                <p style="font-size:11.5px; line-height:1.65; color:#243244; margin:0 0 14px;">
                    Peço que o relatório contemple os seguintes quesitos, com o máximo de
                    detalhamento e objetividade possível:
                </p>

                ${secoes}

                <p style="font-size:11.5px; line-height:1.65; color:#243244; margin:14px 0 0; text-align:justify;">
                    Agradeço a colaboração e a atenção dispensadas a este pedido, ressaltando a
                    importância deste relatório para a avaliação e o direcionamento adequado do caso.
                </p>

                <p style="font-size:11.5px; color:#243244; margin:16px 0 0;">
                    ${esc(v.local)}
                </p>

                <div style="margin-top:34px; text-align:center; page-break-inside:avoid;">
                    <div style="width:280px; border-top:1px solid #94a3b8; margin:0 auto 6px;"></div>
                    <div style="font-size:11.5px; font-weight:700; color:#12325a;">${esc(v.profNome || '—')}</div>
                    <div style="font-size:10px; color:#5a7290; margin-top:1px;">${esc(v.profTitulo)}</div>
                    ${v.profCrp ? `<div style="font-size:10px; color:#5a7290;">CRP ${esc(v.profCrp)}</div>` : ''}
                </div>

                <div style="margin-top:22px; padding-top:9px; border-top:1px solid #e2e8f0;
                            text-align:center; font-size:8.5px; color:#8296ad; letter-spacing:.03em;">
                    ${esc(CLINICA.nome)} · ${esc(CLINICA.telefones)}
                </div>

            </div>
        </div>`;
    }

    function campoDoc(rotulo, valor, largo) {
        return `
            <div style="${largo ? 'grid-column:1 / -1;' : ''}">
                <div style="font-size:8px; color:#2e74b5; font-weight:700; letter-spacing:.1em; text-transform:uppercase;">${esc(rotulo)}</div>
                <div style="font-size:11.5px; color:#1e293b; font-weight:600; line-height:1.3;">${esc(valor || '—')}</div>
            </div>`;
    }

    // ── Painel de edição ────────────────────────────────────────────────────

    const CAMPOS = [
        ['aluno',        'Nome do aluno'],
        ['nascimento',   'Data de nascimento'],
        ['serie',        'Ano / série'],
        ['destinatario', 'Destinatário'],
        ['finalidade',   'Finalidade'],
        ['profNome',     'Profissional que assina'],
        ['profTitulo',   'Titulação'],
        ['profCrp',      'CRP'],
        ['local',        'Local e data']
    ];

    function montarPainel() {
        const painel = document.getElementById('solic-edit-panel');
        if (!painel) return;
        const v = valores();

        painel.innerHTML = `
            <div style="font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.07em;
                        color:#64748b; margin-bottom:9px;">Modelo</div>
            <div style="display:grid; gap:7px; margin-bottom:18px;">
                ${Object.keys(MODELOS).map(k => `
                    <label style="display:flex; align-items:center; gap:9px; padding:10px 12px;
                                  border:1px solid ${modeloAtual === k ? '#2F6FED' : '#e2e8f0'};
                                  background:${modeloAtual === k ? '#eff6ff' : '#fff'};
                                  border-radius:10px; cursor:pointer; font-size:13px;">
                        <input type="radio" name="solic-modelo" value="${k}" ${modeloAtual === k ? 'checked' : ''} style="width:auto;margin:0">
                        ${esc(MODELOS[k].rotulo)}
                    </label>`).join('')}
            </div>

            <div style="font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.07em;
                        color:#64748b; margin-bottom:9px;">Dados do documento</div>
            <div style="display:grid; gap:11px;">
                ${CAMPOS.map(([k, lbl]) => `
                    <div>
                        <label style="display:block; font-size:11px; font-weight:600; color:#64748b; margin-bottom:3px;">${esc(lbl)}</label>
                        <input data-solic="${k}" value="${esc(v[k] || '')}"
                               style="width:100%; padding:8px 10px; border:1px solid #e2e8f0;
                                      border-radius:8px; font-size:13px;">
                    </div>`).join('')}
            </div>

            <p style="font-size:11.5px; color:#94a3b8; line-height:1.55; margin-top:14px;">
                As alterações valem só para este documento. O cadastro do paciente não muda.
            </p>`;

        painel.querySelectorAll('input[name="solic-modelo"]').forEach(r => {
            r.addEventListener('change', (e) => {
                modeloAtual = e.target.value;
                // Destinatário e finalidade seguem o modelo, se não foram editados à mão.
                delete edits.destinatario;
                delete edits.finalidade;
                montarPainel();
                rerender();
            });
        });

        painel.querySelectorAll('[data-solic]').forEach(inp => {
            inp.addEventListener('input', (e) => {
                edits[e.target.dataset.solic] = e.target.value;
                rerender();
            });
        });
    }

    function rerender() {
        const wrap = document.getElementById('solic-preview-wrap');
        if (wrap) wrap.innerHTML = montarHtml();
    }

    // ── PDF ─────────────────────────────────────────────────────────────────

    async function gerarPdf() {
        if (!window.html2canvas || !window.jspdf) {
            aviso('Biblioteca de PDF ainda carregando. Tente em dois segundos.', 'info');
            return;
        }

        const btn = document.getElementById('btn-solic-pdf');
        const txt = btn ? btn.textContent : '';
        if (btn) { btn.disabled = true; btn.textContent = 'Gerando…'; }

        try {
            const el = document.getElementById('pdf-solicitacao-escolar');
            if (!el) throw new Error('Documento não encontrado');

            const imgs = el.querySelectorAll('img');
            await Promise.all([...imgs].map(img => {
                if (img.complete && img.naturalHeight !== 0) return Promise.resolve();
                return new Promise(r => { img.onload = r; img.onerror = r; setTimeout(r, 2000); });
            }));

            const canvas = await window.html2canvas(el, {
                scale: 3, backgroundColor: '#ffffff',
                useCORS: true, allowTaint: true, logging: false
            });

            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF('p', 'mm', 'a4');
            const larguraMm = 210;
            const alturaMm = 297;
            const alturaImgMm = (canvas.height * larguraMm) / canvas.width;

            // Documento mais alto que uma página: fatia em páginas A4.
            if (alturaImgMm <= alturaMm) {
                pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, larguraMm, alturaImgMm);
            } else {
                const pxPorPagina = Math.floor(canvas.width * (alturaMm / larguraMm));
                let restante = canvas.height;
                let origemY = 0;
                let primeira = true;

                while (restante > 0) {
                    const alturaFatia = Math.min(pxPorPagina, restante);
                    const fatia = document.createElement('canvas');
                    fatia.width = canvas.width;
                    fatia.height = alturaFatia;
                    const ctx2d = fatia.getContext('2d');
                    ctx2d.fillStyle = '#ffffff';
                    ctx2d.fillRect(0, 0, fatia.width, fatia.height);
                    ctx2d.drawImage(canvas, 0, origemY, canvas.width, alturaFatia,
                                            0, 0, canvas.width, alturaFatia);

                    if (!primeira) pdf.addPage();
                    pdf.addImage(fatia.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0,
                                 larguraMm, (alturaFatia * larguraMm) / canvas.width);

                    primeira = false;
                    origemY += alturaFatia;
                    restante -= alturaFatia;
                }
            }

            const v = valores();
            const nomeArq = 'Solicitacao relatorio escolar - ' +
                (v.aluno || 'paciente').replace(/[\\/:*?"<>|]/g, '') + '.pdf';
            pdf.save(nomeArq);
            aviso('PDF gerado.', 'success');
        } catch (err) {
            console.error('[solicitacao escolar]', err);
            aviso('Erro ao gerar o PDF: ' + (err.message || err), 'danger');
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = txt; }
        }
    }

    function imprimir() {
        const el = document.getElementById('pdf-solicitacao-escolar');
        if (!el) return;
        const janela = window.open('', '_blank');
        if (!janela) { aviso('O navegador bloqueou a janela de impressão.', 'danger'); return; }
        janela.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
            <title>Solicitação de relatório escolar</title>
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
            <style>@page{size:A4;margin:0}body{margin:0}</style></head>
            <body>${el.outerHTML}</body></html>`);
        janela.document.close();
        setTimeout(() => { janela.focus(); janela.print(); }, 700);
    }

    function aviso(msg, tipo) {
        if (window.CortexUI && window.CortexUI.toast) window.CortexUI.toast(msg, tipo || 'info');
    }

    // ── Abrir ───────────────────────────────────────────────────────────────

    function abrir(op) {
        op = op || {};
        if (!op.paciente) { aviso('Paciente não carregado.', 'danger'); return; }

        ctx = {
            paciente: op.paciente,
            profissional: op.profissional || window.cortexProfissional || {},
            logo: op.logo || ''
        };
        edits = {};
        modeloAtual = sugerirModelo(op.paciente);

        const antigo = document.getElementById('modal-solicitacao-escolar');
        if (antigo) antigo.remove();

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.id = 'modal-solicitacao-escolar';
        overlay.style.display = 'flex';
        overlay.innerHTML = `
            <div class="modal-content" style="max-width:1120px; max-height:92vh; display:flex; flex-direction:column;">
                <div class="modal-header">
                    <h2>Solicitação de relatório escolar</h2>
                    <div style="display:flex; gap:10px; align-items:center;">
                        <button class="btn btn-secondary btn-sm" id="btn-solic-imprimir">Imprimir</button>
                        <button class="btn btn-primary btn-sm" id="btn-solic-pdf">Baixar PDF</button>
                        <button class="modal-close" id="btn-solic-fechar">×</button>
                    </div>
                </div>
                <div class="modal-body" style="flex:1; overflow-y:auto; padding:0; background:#f1f5f9;
                                               display:grid; grid-template-columns:320px 1fr; gap:0;">
                    <div id="solic-edit-panel" style="background:#fff; border-right:1px solid #e2e8f0;
                                                      padding:18px 18px 26px; overflow-y:auto;"></div>
                    <div id="solic-preview-wrap" style="padding:24px; overflow-y:auto;">
                        ${montarHtml()}
                    </div>
                </div>
            </div>`;
        document.body.appendChild(overlay);

        montarPainel();

        document.getElementById('btn-solic-fechar').addEventListener('click', () => overlay.remove());
        document.getElementById('btn-solic-pdf').addEventListener('click', gerarPdf);
        document.getElementById('btn-solic-imprimir').addEventListener('click', imprimir);

        try {
            if (window.CortexAudit && op.paciente.id) {
                window.CortexAudit.log('leitura', 'pacientes', op.paciente.id, {
                    operacao: 'solicitacao_relatorio_escolar_gerada'
                });
            }
        } catch (e) { /* silencioso */ }
    }

    return { abrir, MODELOS };
})();

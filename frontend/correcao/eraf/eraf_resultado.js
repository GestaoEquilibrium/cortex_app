// ============================================================================
// CORTEX_APP — ERA-F · Folha de resultado (rastreio de autismo feminino)
// ----------------------------------------------------------------------------
// URL: ?aplicacao_id=<uuid>
// 34 itens, escala 1–5, 4 fatores + Escore Geral. Normas PERCENTÍLICAS
// (N=7.738) fornecidas pela clínica. Corte de atenção: percentil ≥ 60.
// Regra de lookup (degraus): maior percentil cuja pontuação <= bruto
//   → implementa "inferior mais próximo" + "empate → maior percentil".
// Enunciados vêm do banco; nada de conteúdo do instrumento é embutido aqui.
// ============================================================================

(function () {
    'use strict';

    const CORTE = 60;

    // Mapa item → fator
    const ITEM_FATOR = {
        1:'CCA',2:'CCA',3:'ADG',4:'ADG',5:'ADG',6:'CCA',7:'CM',8:'CM',9:'CCA',10:'CCA',
        11:'CCA',12:'CCA',13:'CCA',14:'CM',15:'CM',16:'CM',17:'CM',18:'CCA',19:'CCA',20:'SS',
        21:'CM',22:'CM',23:'CM',24:'CM',25:'ADG',26:'CM',27:'CM',28:'SS',29:'CM',30:'CM',
        31:'SS',32:'SS',33:'CM',34:'CM'
    };
    const FATORES = [
        { cod:'CCA', label:'Camuflagem: Compensação e Assimilação', cor:'#3b82f6' },
        { cod:'ADG', label:'Autopercepção de Gênero',              cor:'#f59e0b' },
        { cod:'CM',  label:'Camuflagem: Mascaramento',             cor:'#22c55e' },
        { cod:'SS',  label:'Sensibilidade Sensorial',             cor:'#ef4444' },
    ];
    const PERCENTIS = [1,5,10,15,20,25,30,35,40,45,50,55,60,65,70,75,80,85,90,95,99];

    // Tabela 6 — Escore Geral [percentil, bruto]
    const NORMA_GERAL = [[1,34],[5,62],[10,77],[15,87],[20,95],[25,102],[30,107],[35,112],[40,117],[45,121],[50,125],[55,128],[60,132],[65,135],[70,139],[75,142],[80,146],[85,149],[90,153],[95,159],[99,170]];
    // Tabela 7 — por fator: pontos alinhados a PERCENTIS
    const NORMA_FATOR = {
        CCA:[10,14,18,20,23,25,27,29,31,32,34,35,37,38,39,41,42,44,46,48,50],
        ADG:[4,4,6,7,7,8,9,9,10,11,11,12,13,13,14,15,16,16,17,19,20],
        CM: [16,33,41,47,51,55,57,60,61,63,65,66,68,69,71,72,74,75,77,78,80],
        SS: [4,6,8,10,11,11,12,13,14,15,15,15,16,17,17,18,18,19,19,20,20],
    };
    const MEDIA = { GERAL:119.6, CCA:32.7, ADG:11.4, CM:61.7, SS:14.4 };
    const DP    = { GERAL:29.1,  CCA:10.3, ADG:4.3,  CM:13.7, SS:4.2 };

    const state = { aplicacaoId:null, aplicacao:null, paciente:null, instrumento:null,
                    norma:null, itens:[], respostas:{}, aplicadorNome:null, chart:null };

    const c = () => window.cortexClient;
    const esc = (t) => { const d = document.createElement('div'); d.textContent = t==null?'':String(t); return d.innerHTML; };
    const fmtData = (iso) => { if(!iso) return '—'; try { return new Date(iso).toLocaleDateString('pt-BR'); } catch { return '—'; } };

    // pares [percentil,bruto] a partir da lista de pontos por fator
    function tabelaFator(cod) { return PERCENTIS.map((p,i) => [p, NORMA_FATOR[cod][i]]); }

    // regra de degraus
    function buscarPercentil(tabela, bruto) {
        const v = tabela.filter(([p,b]) => b!=null && !isNaN(b));
        if (!v.length) return null;
        if (bruto < v[0][1]) return 1;                 // nunca 0
        let achado = 1;
        for (const [p,b] of v) if (bruto >= b) achado = p;
        return achado;                                 // nunca 100 (máx tabela = 99)
    }
    const classificar = (pct) => pct >= CORTE ? 'Alta presença de sintomas' : 'Baixa presença de sintomas';

    window.addEventListener('cortex:auth-ready', async () => {
        await CortexSidebar.render('pacientes');
        const p = new URLSearchParams(location.search);
        state.aplicacaoId = p.get('aplicacao_id');
        if (!state.aplicacaoId) { erro('aplicacao_id não fornecido na URL.'); return; }
        try { await carregar(); render(); }
        catch (e) { console.error('[eraf]', e); erro(e.message || 'Falha ao carregar o resultado.'); }
    });

    function erro(msg) {
        document.getElementById('laudo-conteudo').innerHTML =
            `<div class="q-erro"><div class="q-erro-ic">⚠️</div>${esc(msg)}</div>`;
    }

    async function carregar() {
        const cli = c();
        const { data: aplicacao, error: eA } = await cli
            .from('aplicacoes_instrumento').select('*').eq('id', state.aplicacaoId).single();
        if (eA) throw new Error('Aplicação: ' + eA.message);
        state.aplicacao = aplicacao;

        const { data: inst } = await cli
            .from('instrumentos_catalogo').select('id, sigla, nome_completo').eq('id', aplicacao.instrumento_id).single();
        state.instrumento = inst;

        const { data: paciente } = await cli
            .from('pacientes').select('id, nome_completo, data_nascimento, sexo, cpf, escolaridade')
            .eq('id', aplicacao.paciente_id).maybeSingle();
        state.paciente = paciente || {};

        state.aplicadorNome = aplicacao.aplicador_nome || aplicacao.criado_por_nome || null;
        if (!state.aplicadorNome && aplicacao.aplicador_id) {
            const { data: prof } = await cli.from('profissionais').select('nome_completo').eq('id', aplicacao.aplicador_id).maybeSingle();
            state.aplicadorNome = prof?.nome_completo || null;
        }

        const { data: norma } = await cli
            .from('instrumentos_normas').select('*').eq('instrumento_id', inst.id).eq('ativa', true).limit(1).maybeSingle();
        state.norma = norma;

        const { data: correcao } = await cli
            .from('correcoes').select('escores_brutos').eq('aplicacao_id', state.aplicacaoId).maybeSingle();
        state.respostas = (correcao?.escores_brutos?.respostas) || {};
    }

    function calcular() {
        // soma por fator + geral, a partir das respostas 1..5
        const somaFator = { CCA:0, ADG:0, CM:0, SS:0 };
        let geral = 0, respondidos = 0;
        for (let n=1; n<=34; n++) {
            let v = parseInt(state.respostas[n], 10);
            if (isNaN(v)) v = 3;              // branco → 3 (Neutro), regra do manual
            else respondidos++;
            somaFator[ITEM_FATOR[n]] += v;
            geral += v;
        }
        const res = { fatores:{}, geral:{}, respondidos };
        for (const f of FATORES) {
            const bruto = somaFator[f.cod];
            const pct = buscarPercentil(tabelaFator(f.cod), bruto);
            res.fatores[f.cod] = { bruto, pct, classif: classificar(pct) };
        }
        const pctG = buscarPercentil(NORMA_GERAL, geral);
        res.geral = { bruto: geral, pct: pctG, classif: classificar(pctG) };
        return res;
    }

    function render() {
        const p = state.paciente, inst = state.instrumento;
        const r = calcular();
        const idade = (() => { if(!p.data_nascimento) return '—'; const n=new Date(p.data_nascimento),h=new Date(); let a=h.getFullYear()-n.getFullYear(); const m=h.getMonth()-n.getMonth(); if(m<0||(m===0&&h.getDate()<n.getDate()))a--; return a>=0&&a<130?a+' anos':'—'; })();

        const badge = (cl) => cl.startsWith('Alta')
            ? '<span class="eraf-badge alta">Alta presença</span>'
            : '<span class="eraf-badge baixa">Baixa presença</span>';

        const cards = FATORES.map(f => {
            const d = r.fatores[f.cod];
            const alta = d.pct >= CORTE;
            return `<div class="q-card ${alta?'alta':'baixa'}" data-copiavel data-copy-nome="ERA-F ${esc(f.cod)}">
                <div class="q-card-area">${esc(f.label)}</div>
                <div class="q-card-media">P${d.pct}</div>
                <div class="q-card-barra"><i style="width:${d.pct}%"></i><span class="corte"></span></div>
                <div class="q-card-n">bruto ${d.bruto} · ${badge(d.classif)}</div>
            </div>`;
        }).join('');

        const linhas = FATORES.map(f => {
            const d = r.fatores[f.cod];
            return `<tr>
                <td><span class="q-dot" style="background:${f.cor}"></span>${esc(f.label)}</td>
                <td class="ctr">${d.bruto}</td>
                <td class="ctr"><b>${d.pct}</b></td>
                <td class="ctr">${MEDIA[f.cod]}</td>
                <td class="ctr">${DP[f.cod]}</td>
                <td>${badge(d.classif)}</td>
            </tr>`;
        }).join('');

        document.getElementById('laudo-conteudo').innerHTML = `
        <a href="#" id="back-link" class="page-back">‹ Voltar à Bateria</a>
        <div class="resultado-acoes-topo"><button class="btn btn-primary" id="btn-pdf">📄 Gerar PDF</button></div>

        <div class="laudo" data-copiavel data-copy-nome="ERA-F - ${esc(p.nome_completo||'')}">
            <div class="laudo-header">
                <div class="laudo-header-esq">
                    <div class="laudo-header-logo">E</div>
                    <div class="laudo-header-textos">
                        <div class="laudo-header-supratitulo">Relatório — Rastreio de TEA</div>
                        <h1 class="laudo-header-titulo">ERA-F · Escala de Rastreio de Autismo Feminino</h1>
                        <div class="laudo-header-subtitulo">34 itens · escala 1–5 · normas percentílicas (N=7.738) · corte P≥60</div>
                    </div>
                </div>
            </div>

            <div class="laudo-body">
                <div class="laudo-secao-titulo"><span class="laudo-secao-tag">1</span> Identificação</div>
                <div class="laudo-identificacao">
                    <div class="laudo-identif-item"><span class="laudo-identif-label">Nome:</span><span class="laudo-identif-valor">${esc(p.nome_completo||'—')}</span></div>
                    <div class="laudo-identif-item"><span class="laudo-identif-label">Idade:</span><span class="laudo-identif-valor">${idade}</span></div>
                    <div class="laudo-identif-item"><span class="laudo-identif-label">Sexo:</span><span class="laudo-identif-valor">${esc(p.sexo||'—')}</span></div>
                    <div class="laudo-identif-item"><span class="laudo-identif-label">Nascimento:</span><span class="laudo-identif-valor">${fmtData(p.data_nascimento)}</span></div>
                    <div class="laudo-identif-item"><span class="laudo-identif-label">CPF:</span><span class="laudo-identif-valor">${esc(p.cpf||'—')}</span></div>
                    <div class="laudo-identif-item"><span class="laudo-identif-label">Escolaridade:</span><span class="laudo-identif-valor">${esc(p.escolaridade||'—')}</span></div>
                    <div class="laudo-identif-item"><span class="laudo-identif-label">Avaliação:</span><span class="laudo-identif-valor">${fmtData(state.aplicacao.data_aplicacao||state.aplicacao.data_conclusao)}</span></div>
                    <div class="laudo-identif-item"><span class="laudo-identif-label">Aplicador:</span><span class="laudo-identif-valor">${esc(state.aplicadorNome||'—')}</span></div>
                </div>

                <div class="laudo-secao-titulo"><span class="laudo-secao-tag">2</span> Escore Geral</div>
                <div class="eraf-geral ${r.geral.classif.startsWith('Alta')?'alta':'baixa'}" data-copiavel data-copy-nome="ERA-F escore geral">
                    <div class="eraf-geral-num"><span>P</span>${r.geral.pct}</div>
                    <div class="eraf-geral-info">
                        <div class="eraf-geral-bruto">Escore bruto: <b>${r.geral.bruto}</b> / 170 · Média ${MEDIA.GERAL} (DP ${DP.GERAL})</div>
                        <div class="eraf-geral-classif">${badge(r.geral.classif)}</div>
                    </div>
                    <div class="eraf-medidor">
                        <div class="eraf-medidor-track">
                            <div class="eraf-medidor-fill" style="width:${r.geral.pct}%"></div>
                            <div class="eraf-medidor-corte" style="left:${CORTE}%"></div>
                        </div>
                        <div class="eraf-medidor-legenda"><span>P1</span><span>corte P${CORTE}</span><span>P99</span></div>
                    </div>
                </div>

                <div class="laudo-secao-titulo"><span class="laudo-secao-tag">3</span> Perfil por Fator (percentil)</div>
                <div class="q-cards" data-copiavel data-copy-nome="ERA-F perfil fatores">${cards}</div>
                <div class="q-grafico-wrap" data-copiavel data-copy-nome="ERA-F grafico percentis"><canvas id="eraf-chart"></canvas></div>

                <table class="q-tabela">
                    <thead><tr><th>Fator</th><th class="ctr">Bruto</th><th class="ctr">Percentil</th><th class="ctr">Média</th><th class="ctr">DP</th><th>Classificação</th></tr></thead>
                    <tbody>${linhas}</tbody>
                </table>

                <div class="q-nota">
                    <b>Instrumento de rastreio — não é diagnóstico.</b> Percentil <b>≥ ${CORTE}</b> indica
                    alta presença de sintomas consistentes com TEA e sugere <b>avaliação diagnóstica
                    completa e multidisciplinar</b>, com instrumentos específicos e histórico clínico.
                    Percentil &lt; ${CORTE} indica baixa relação com TEA pela autopercepção. Itens em branco
                    são pontuados como 3 (Neutro). Normas: N=7.738 (Fortaleza et al., 2025; Anunciação et al., 2021).
                    ${r.respondidos < 34 ? `<br><b>Atenção:</b> ${34 - r.respondidos} item(ns) sem resposta foram pontuados como 3.` : ''}
                </div>
            </div>

            <div class="laudo-rodape">
                <div class="laudo-rodape-esq">
                    <div class="laudo-rodape-org">Equilibrium Neuropsicologia</div>
                    <div class="laudo-rodape-tipo">ERA-F — rastreio de autismo feminino</div>
                </div>
                <div class="laudo-rodape-dir">
                    <div class="laudo-rodape-confidencial">Instrumento de rastreio (Nilapress). Uso restrito ao profissional.</div>
                </div>
            </div>
        </div>`;

        const bl = document.getElementById('back-link');
        if (bl) bl.addEventListener('click', (e)=>{ e.preventDefault(); history.back(); });
        document.getElementById('btn-pdf').addEventListener('click', gerarPDF);
        desenharGrafico(r);
        if (window.CortexCopy?.aplicar) { try { window.CortexCopy.aplicar(); } catch(e){} }
    }

    function desenharGrafico(r) {
        const ctx = document.getElementById('eraf-chart');
        if (!ctx || !window.Chart) return;
        state.chart = new Chart(ctx, {
            type:'bar',
            data:{
                labels: FATORES.map(f=>f.label),
                datasets:[{
                    label:'Percentil',
                    data: FATORES.map(f=>r.fatores[f.cod].pct),
                    backgroundColor: FATORES.map(f=>r.fatores[f.cod].pct>=CORTE ? '#ef4444' : f.cor),
                }]
            },
            options:{
                indexAxis:'y', responsive:true, maintainAspectRatio:false,
                scales:{ x:{ min:0, max:100, ticks:{ stepSize:10 } } },
                plugins:{
                    legend:{ display:false },
                    annotation:{}  // linha de corte desenhada via plugin abaixo, se disponível
                }
            }
        });
    }

    async function gerarPDF() {
        const btn = document.getElementById('btn-pdf'); const orig = btn.textContent;
        btn.disabled = true; btn.textContent = '⏳ Gerando...';
        try {
            const laudo = document.querySelector('.laudo');
            const canvas = await html2canvas(laudo, { scale:2, backgroundColor:'#ffffff', useCORS:true, logging:false });
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' });
            const MT=8, MB=8, pxPerMm=canvas.width/210, pageContentPx=(297-MT-MB)*pxPerMm;
            const lr=laudo.getBoundingClientRect(), ratio=canvas.height/lr.height;
            const bounds=Array.from(laudo.querySelectorAll('.laudo-secao-titulo, .laudo-rodape'))
                .map(el=>(el.getBoundingClientRect().top-lr.top)*ratio).filter(y=>y>1&&y<canvas.height-1).sort((a,b)=>a-b);
            bounds.push(canvas.height);
            const add=(s,e)=>{ const h=Math.max(1,Math.round(e-s)); const t=document.createElement('canvas'); t.width=canvas.width; t.height=h;
                const cx=t.getContext('2d'); cx.fillStyle='#fff'; cx.fillRect(0,0,t.width,h);
                cx.drawImage(canvas,0,s,canvas.width,h,0,0,canvas.width,h);
                pdf.addImage(t.toDataURL('image/jpeg',0.95),'JPEG',0,MT,210,h/pxPerMm); };
            if (canvas.height<=pageContentPx) add(0,canvas.height);
            else { let start=0; while(start<canvas.height-1){ const maxEnd=start+pageContentPx; let end;
                if(maxEnd>=canvas.height) end=canvas.height; else { let cut=-1; for(const b of bounds) if(b>start+1&&b<=maxEnd) cut=b; end=cut>0?cut:maxEnd; }
                add(start,end); start=end; if(start<canvas.height-1) pdf.addPage(); } }
            const nome=(state.paciente.nome_completo||'paciente').toUpperCase().replace(/[^A-Z\s]/g,'').trim().slice(0,40);
            pdf.save(`ERA-F - ${nome}.pdf`);
            window.CortexUI?.toast('PDF gerado', 'success');
        } catch(e){ console.error(e); window.CortexUI?.toast('Erro ao gerar PDF: '+e.message,'danger'); }
        finally { btn.disabled=false; btn.textContent=orig; }
    }
})();

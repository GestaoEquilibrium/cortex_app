// ============================================================================
// CORTEX_APP — solicitacao_escolar.js  (v2 — três modelos + grade)
// ----------------------------------------------------------------------------
// Monta a Solicitação de Relatório Escolar já preenchida com os dados do
// paciente, no layout CORTEX, pronta para imprimir e entregar na escola.
//
// Três modelos por faixa de escolarização (ver solicitacao_escolar_modelos.js).
// Cada documento traz: capa de instruções (opcional), identificação, roteiro
// qualitativo, grade de frequência, observações e assinaturas.
//
// PAGINAÇÃO: os blocos são renderizados fora da tela, medidos um a um e
// distribuídos em páginas A4. Isso evita o corte no meio de uma linha da
// grade, que aconteceria se a gente fatiasse um canvas único por altura.
//
// API: CortexSolicitacaoEscolar.abrir({ paciente, profissional, logo })
// ============================================================================

window.CortexSolicitacaoEscolar = (function () {
    'use strict';

    const M = () => window.CortexSolicitacaoEscolarModelos;

    const CLINICA = {
        nome: 'Grupo Equilibrium',
        tagline: 'Saúde Mental e Neurodesenvolvimento',
        rodape: 'Grupo Equilibrium · Av. Cesário Alvim, 2001 — B. Aparecida, Uberlândia/MG · ' +
                '(34) 3212-9269 · (34) 99781-3331 · (34) 99642-4575'
    };

    const NAVY = '#12325a';
    const AZUL = '#2e74b5';
    const PAG_W = 720;
    const PAG_H = 1018;
    const PAD_X = 54;

    let ctx = { paciente: null, profissional: null, logo: '' };
    let edits = {};
    let modeloAtual = 'fundamental_final_medio';
    let incluirCapa = true;

    // ── Utilitários ─────────────────────────────────────────────────────────

    function esc(t) {
        const d = document.createElement('div');
        d.textContent = (t === null || t === undefined) ? '' : String(t);
        return d.innerHTML;
    }

    function fmtData(iso) {
        if (!iso) return '';
        const s = String(iso).substring(0, 10).split('-');
        return s.length === 3 ? `${s[2]}/${s[1]}/${s[0]}` : '';
    }

    function hoje() {
        const d = new Date();
        const m = ['janeiro','fevereiro','março','abril','maio','junho',
                   'julho','agosto','setembro','outubro','novembro','dezembro'];
        return `Uberlândia, ${d.getDate()} de ${m[d.getMonth()]} de ${d.getFullYear()}`;
    }

    function idadeAnos(dn) {
        if (!dn) return null;
        const p = String(dn).substring(0, 10).split('-');
        if (p.length !== 3) return null;
        // Data local: new Date('YYYY-MM-DD') seria meia-noite UTC = dia anterior em BRT.
        const nasc = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
        const h = new Date();
        let a = h.getFullYear() - nasc.getFullYear();
        const mm = h.getMonth() - nasc.getMonth();
        if (mm < 0 || (mm === 0 && h.getDate() < nasc.getDate())) a--;
        return a;
    }

    function sugerirModelo(p) {
        const txt = [(p.escolaridade || ''), (p.escolaridade_serie || ''),
                     (p.escolaridade_completa || '')].join(' ').toLowerCase();

        if (/infantil|cre(ch|x)e|maternal|jardim|pr[eé][- ]?escola|berç|g[1-5]\b/.test(txt)) return 'infantil';
        if (/m[eé]dio|9[ºo°]|8[ºo°]|7[ºo°]|6[ºo°]/.test(txt)) return 'fundamental_final_medio';
        if (/fundamental/.test(txt) && /[1-5][ºo°]/.test(txt)) return 'fundamental_inicial';

        const idade = idadeAnos(p.data_nascimento);
        if (idade === null) return 'fundamental_final_medio';
        if (idade <= 5) return 'infantil';
        if (idade <= 10) return 'fundamental_inicial';
        return 'fundamental_final_medio';
    }

    function serieDoPaciente(p) {
        const completa = (p.escolaridade_completa || '').trim();
        if (completa) return completa;
        const serie = (p.escolaridade_serie || '').trim();
        const nivel = (p.escolaridade || '').trim();
        if (nivel && serie) return `${serie} — ${nivel}`;
        return serie || nivel || '';
    }

    function valores() {
        const p = ctx.paciente || {};
        const prof = ctx.profissional || {};
        const pick = (k, padrao) => (edits[k] !== undefined ? edits[k] : padrao);
        const idade = idadeAnos(p.data_nascimento);

        return {
            aluno: pick('aluno', (p.nome_completo || '').toUpperCase()),
            nascimento: pick('nascimento', fmtData(p.data_nascimento)),
            idade: pick('idade', idade !== null ? `${idade} anos` : ''),
            serie: pick('serie', serieDoPaciente(p)),
            instituicao: pick('instituicao', ''),
            profNome: pick('profNome', prof.nome_completo || ''),
            profTitulo: pick('profTitulo', 'Psicólogo · Neuropsicólogo'),
            profCrp: pick('profCrp', prof.crp || ''),
            local: pick('local', hoje())
        };
    }

    // ── Peças visuais ───────────────────────────────────────────────────────

    function linhaPreenchivel(largura) {
        return `<span style="display:inline-block;width:${largura};border-bottom:1px solid #94a3b8;
                             height:12px;vertical-align:baseline;"></span>`;
    }

    /** Campo da identificação: com valor do cadastro ou linha para a escola. */
    function campoId(rotulo, valor, largura) {
        const conteudo = valor
            ? `<span style="font-weight:600;color:#1e293b;">${esc(valor)}</span>`
            : linhaPreenchivel(largura || '260px');
        return `<span style="font-size:11px;color:${NAVY};font-weight:700;">${esc(rotulo)}:</span>
                <span style="font-size:11px;margin-left:5px;">${conteudo}</span>`;
    }

    function tarja(texto) {
        return `<div style="background:${NAVY};border-radius:9px;padding:9px 16px;margin-bottom:16px;">
                    <div style="color:#ffffff;font-size:12.5px;font-weight:800;letter-spacing:.03em;
                                text-align:center;text-transform:uppercase;line-height:1.35;">
                        Solicitação de relatório escolar · ${esc(texto)}
                    </div>
                </div>`;
    }

    function tituloSecao(num, texto) {
        return `<div style="display:flex;align-items:center;gap:8px;margin:0 0 8px;">
                    <span style="display:inline-block;min-width:19px;height:19px;line-height:19px;
                                 text-align:center;border-radius:6px;background:${AZUL};color:#fff;
                                 font-size:10.5px;font-weight:700;">${num}</span>
                    <span style="font-size:12.5px;font-weight:800;color:${NAVY};">${esc(texto)}</span>
                </div>`;
    }

    /** Caixinha arredondada onde o educador marca o X. */
    function celulaMarcar() {
        return `<td style="width:52px;padding:5px 4px;text-align:center;border-bottom:1px solid #eef2f7;">
                    <span style="display:inline-block;width:17px;height:17px;border:1px solid #b9c6d6;
                                 border-radius:5px;background:#fff;"></span>
                </td>`;
    }

    /**
     * Grade de frequência. O arredondamento vai no wrapper com overflow hidden
     * porque o html2canvas 1.4.1 não respeita border-radius em <table>.
     */
    function tabelaGrade(grade, escala) {
        const cabecalho = `
            <tr>
                <th style="text-align:left;padding:8px 12px;font-size:10px;font-weight:700;
                           color:#ffffff;background:${NAVY};letter-spacing:.04em;text-transform:uppercase;">
                    Comportamento observado
                </th>
                ${escala.map(e => `
                    <th style="width:52px;padding:8px 4px;font-size:9.5px;font-weight:700;color:#ffffff;
                               background:${NAVY};text-align:center;">${esc(e)}</th>`).join('')}
            </tr>`;

        const corpo = grade.map(g => `
            <tr>
                <td colspan="${escala.length + 1}" style="padding:6px 12px;background:#eaf2fb;
                        font-size:10.5px;font-weight:700;color:${NAVY};letter-spacing:.02em;">
                    ${esc(g.dominio)}
                </td>
            </tr>
            ${g.itens.map((it, i) => `
                <tr style="background:${i % 2 ? '#fbfcfe' : '#ffffff'};">
                    <td style="padding:6px 12px;font-size:10.5px;color:#243244;line-height:1.4;
                               border-bottom:1px solid #eef2f7;">${esc(it)}</td>
                    ${escala.map(() => celulaMarcar()).join('')}
                </tr>`).join('')}
        `).join('');

        return `<div style="border:1px solid #d7e0ea;border-radius:11px;overflow:hidden;">
                    <table style="width:100%;border-collapse:collapse;">
                        <thead>${cabecalho}</thead>
                        <tbody>${corpo}</tbody>
                    </table>
                </div>`;
    }

    function tabelaAlerta(alerta) {
        return `
            <div style="border:1px solid #f0b4b4;border-radius:11px;overflow:hidden;">
                <div style="background:#a32d2d;padding:8px 14px;">
                    <div style="color:#fff;font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;">
                        ${esc(alerta.titulo)}
                    </div>
                </div>
                <div style="padding:10px 14px;background:#fef6f6;">
                    <p style="font-size:10px;line-height:1.55;color:#7a2626;margin:0 0 9px;text-align:justify;">
                        ${esc(alerta.instrucao)}
                    </p>
                    <table style="width:100%;border-collapse:collapse;">
                        <thead>
                            <tr>
                                <th style="text-align:left;padding:6px 10px;font-size:9.5px;font-weight:700;
                                           color:#7a2626;background:#fbe6e6;text-transform:uppercase;letter-spacing:.04em;">Indicador</th>
                                <th style="width:52px;padding:6px;font-size:9.5px;color:#7a2626;background:#fbe6e6;">Sim</th>
                                <th style="width:52px;padding:6px;font-size:9.5px;color:#7a2626;background:#fbe6e6;">Não</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${alerta.itens.map(it => `
                                <tr style="background:#fff;">
                                    <td style="padding:6px 10px;font-size:10.5px;color:#243244;line-height:1.4;
                                               border-bottom:1px solid #f6e3e3;">${esc(it)}</td>
                                    <td style="text-align:center;padding:5px;border-bottom:1px solid #f6e3e3;">
                                        <span style="display:inline-block;width:17px;height:17px;border:1px solid #d59a9a;border-radius:5px;background:#fff;"></span></td>
                                    <td style="text-align:center;padding:5px;border-bottom:1px solid #f6e3e3;">
                                        <span style="display:inline-block;width:17px;height:17px;border:1px solid #d59a9a;border-radius:5px;background:#fff;"></span></td>
                                </tr>`).join('')}
                        </tbody>
                    </table>
                </div>
            </div>`;
    }

    // ── Blocos do documento ─────────────────────────────────────────────────

    function blocos() {
        const mod = M().MODELOS[modeloAtual];
        const v = valores();
        const out = [];
        const add = (html, junto) => out.push({ html, junto: !!junto });

        if (incluirCapa) {
            add(`
                <div style="margin-bottom:14px;">
                    <div style="font-size:15px;font-weight:800;color:${NAVY};line-height:1.35;">
                        SOLICITAÇÃO DE RELATÓRIO ESCOLAR PARA FINS DE AVALIAÇÃO NEUROPSICOLÓGICA
                    </div>
                    <div style="font-size:11px;font-style:italic;color:#5a7290;margin-top:5px;line-height:1.5;">
                        Modelos por faixa de escolarização, com roteiro de observação e grade estruturada
                        de triagem de indicadores de saúde mental.
                    </div>
                </div>`);

            add(`
                <div style="margin-bottom:14px;">
                    <div style="font-size:12px;font-weight:800;color:${AZUL};margin-bottom:7px;">Como utilizar</div>
                    ${M().COMO_UTILIZAR.map(t => `
                        <div style="display:flex;gap:8px;margin-bottom:5px;">
                            <span style="color:${AZUL};font-size:11px;line-height:1.55;">▪</span>
                            <span style="font-size:11px;line-height:1.55;color:#243244;text-align:justify;">${esc(t)}</span>
                        </div>`).join('')}
                </div>`);

            add(`
                <div style="background:#f2f7fc;border-left:4px solid ${AZUL};border-radius:0 9px 9px 0;
                            padding:11px 15px;margin-bottom:6px;">
                    <span style="font-size:11px;font-weight:800;color:${AZUL};">Consentimento e LGPD:</span>
                    <span style="font-size:10.5px;line-height:1.6;color:#243244;">${esc(M().LGPD)}</span>
                </div>`);

            add('<div data-quebra="1"></div>');
        }

        add(tarja(mod.titulo));

        add(`
            <p style="font-size:11px;line-height:1.65;color:#243244;margin:0 0 16px;text-align:justify;">
                À Coordenação Pedagógica / Professor(a) Regente, solicitamos a elaboração de relatório
                escolar sobre o(a) estudante identificado(a) abaixo, matriculado(a) ${esc(mod.etapa)}.
                O relatório integra processo de avaliação neuropsicológica e subsidia a investigação
                clínica e o acompanhamento do neurodesenvolvimento e da saúde mental. Abaixo, um roteiro
                qualitativo e uma grade estruturada de observação, ${esc(mod.faixaTexto)}.
            </p>`);

        add(tituloSecao(1, 'Identificação') + `
            <div style="border:1px solid #d7e0ea;border-radius:11px;padding:13px 15px;margin-bottom:14px;
                        background:#fbfcfe;line-height:2.1;">
                <div>${campoId('Nome do(a) estudante', v.aluno, '400px')}</div>
                <div>${campoId('Data de nascimento', v.nascimento, '130px')}
                     <span style="margin-left:26px;"></span>${campoId('Idade', v.idade, '90px')}</div>
                <div>${campoId('Etapa / ano que cursa', v.serie, '330px')}</div>
                <div>${campoId('Turno', '', '150px')}
                     <span style="margin-left:26px;"></span>${campoId('Instituição', v.instituicao, '280px')}</div>
                <div>${campoId('Profissional que responde (nome e função)', '', '290px')}</div>
                <div>${campoId('Há quanto tempo acompanha o(a) estudante', '', '150px')}
                     <span style="margin-left:20px;"></span>${campoId('Frequência do contato', '', '140px')}</div>
            </div>`, true);

        add(`
            <div style="background:#f2f7fc;border-left:4px solid ${AZUL};border-radius:0 9px 9px 0;
                        padding:10px 15px;margin-bottom:16px;">
                <span style="font-size:10.5px;font-weight:800;color:${AZUL};">Orientações ao preenchimento:</span>
                <span style="font-size:10px;line-height:1.6;color:#243244;">${esc(M().ORIENTACOES)}</span>
            </div>`);

        add(tituloSecao(2, 'Roteiro qualitativo de observação'), true);

        mod.roteiro.forEach(s => {
            add(`
                <div style="margin-bottom:11px;">
                    <div style="font-size:11.5px;font-weight:800;color:${AZUL};margin-bottom:4px;">${esc(s.titulo)}</div>
                    <div style="padding-left:14px;">
                        ${s.itens.map(it => `
                            <div style="display:flex;gap:8px;margin-bottom:3px;">
                                <span style="color:${AZUL};font-size:10.5px;line-height:1.5;">▪</span>
                                <span style="font-size:10.5px;line-height:1.5;color:#243244;">${esc(it)}</span>
                            </div>`).join('')}
                    </div>
                </div>`);
        });

        add(`<div style="height:6px;"></div>`);
        add(tituloSecao(3, 'Grade estruturada de observação') + `
            <p style="font-size:9.5px;line-height:1.55;color:#5a7290;margin:0 0 9px;text-align:justify;">
                <strong>Escala de frequência:</strong> ${esc(M().LEGENDA_ESCALA)}
            </p>`, true);

        // Cada domínio vira um bloco próprio: assim a paginação nunca corta
        // uma linha da grade ao meio.
        mod.grade.forEach((g, i) => {
            add(tabelaGrade([g], M().ESCALA) + `<div style="height:${i === mod.grade.length - 1 ? 0 : 8}px;"></div>`);
        });

        if (mod.alerta) {
            add(`<div style="height:12px;"></div>` + tabelaAlerta(mod.alerta));
        }

        add(`
            <div style="height:12px;"></div>
            <div style="border:1px solid #d7e0ea;border-radius:11px;padding:12px 15px;background:#fbfcfe;">
                <div style="font-size:11px;font-weight:800;color:${NAVY};margin-bottom:8px;">
                    Observações complementares
                </div>
                <div style="font-size:9.5px;color:#8296ad;margin-bottom:8px;">
                    Relate fatos relevantes, evolução e contexto.
                </div>
                ${[1,2,3,4,5].map(() =>
                    `<div style="border-bottom:1px solid #dbe3ec;height:21px;"></div>`).join('')}
            </div>`);

        add(`
            <div style="height:18px;"></div>
            <div style="display:flex;gap:26px;align-items:flex-start;">
                <div style="flex:1;text-align:center;">
                    <div style="border-top:1px solid #94a3b8;margin-bottom:5px;"></div>
                    <div style="font-size:11px;font-weight:700;color:${NAVY};">${esc(v.profNome || '—')}</div>
                    <div style="font-size:9.5px;color:#5a7290;line-height:1.4;">${esc(v.profTitulo)}</div>
                    ${v.profCrp ? `<div style="font-size:9.5px;color:#5a7290;">CRP ${esc(v.profCrp)} — ${esc(CLINICA.nome)}</div>` : ''}
                    <div style="font-size:9px;color:#8296ad;margin-top:4px;">Profissional solicitante</div>
                </div>
                <div style="flex:1;">
                    <div style="font-size:10.5px;font-weight:700;color:${NAVY};margin-bottom:9px;">
                        Responsável pelo preenchimento
                    </div>
                    <div style="font-size:10.5px;color:#243244;margin-bottom:9px;">
                        Nome / função: ${linhaPreenchivel('190px')}
                    </div>
                    <div style="font-size:10.5px;color:#243244;">
                        Data: ${linhaPreenchivel('52px')} / ${linhaPreenchivel('52px')} / ${linhaPreenchivel('68px')}
                    </div>
                </div>
            </div>
            <div style="font-size:10.5px;color:#243244;margin-top:14px;">${esc(v.local)}</div>`, true);

        return out;
    }

    // ── Paginação por medição ───────────────────────────────────────────────

    function cabecalhoPagina(primeira) {
        if (primeira) {
            return `
                <div style="border-bottom:3px solid ${AZUL};padding:0 ${PAD_X}px 12px;margin-bottom:18px;">
                    ${ctx.logo ? `<img src="${ctx.logo}" alt="${esc(CLINICA.nome)}" style="height:52px;width:auto;display:block;" />` : ''}
                    <div style="font-size:10px;color:${AZUL};letter-spacing:.03em;margin-top:2px;">
                        ${esc(CLINICA.tagline)}
                    </div>
                </div>`;
        }
        return `
            <div style="border-bottom:1px solid #d7e0ea;padding:0 ${PAD_X}px 8px;margin-bottom:14px;
                        display:flex;justify-content:space-between;align-items:flex-end;">
                ${ctx.logo ? `<img src="${ctx.logo}" alt="" style="height:26px;width:auto;display:block;" />` : '<span></span>'}
                <span style="font-size:9px;color:#8296ad;">Solicitação de relatório escolar</span>
            </div>`;
    }

    function rodapePagina(n, total) {
        return `
            <div style="position:absolute;left:${PAD_X}px;right:${PAD_X}px;bottom:20px;
                        border-top:1px solid #e2e8f0;padding-top:7px;
                        display:flex;justify-content:space-between;align-items:center;">
                <span style="font-size:8px;color:#8296ad;letter-spacing:.02em;">${esc(CLINICA.rodape)}</span>
                <span style="font-size:8px;color:#8296ad;">${n}/${total}</span>
            </div>`;
    }

    /** Altura útil de conteúdo, por página. */
    function alturaUtil(primeira) {
        return PAG_H - (primeira ? 100 : 68) - 46;
    }

    function paginar(lista) {
        // Mede fora da tela, na largura real de conteúdo.
        const regua = document.createElement('div');
        regua.style.cssText = `position:absolute;left:-99999px;top:0;width:${PAG_W - PAD_X * 2}px;
                               font-family:'Inter',-apple-system,sans-serif;visibility:hidden;`;
        document.body.appendChild(regua);

        const medidos = lista.map(b => {
            if (/data-quebra/.test(b.html)) return { ...b, altura: -1 };
            regua.innerHTML = b.html;
            return { ...b, altura: regua.getBoundingClientRect().height };
        });
        regua.remove();

        const paginas = [];
        let atual = [];
        let usado = 0;
        let primeira = true;

        const fechar = () => {
            if (atual.length) paginas.push(atual);
            atual = [];
            usado = 0;
            primeira = false;
        };

        medidos.forEach((b, i) => {
            if (b.altura === -1) { fechar(); return; }

            // "junto" = não deve ficar sozinho no fim da página: leva o próximo junto.
            const extra = (b.junto && medidos[i + 1] && medidos[i + 1].altura > 0)
                ? medidos[i + 1].altura : 0;

            if (usado > 0 && usado + b.altura + extra > alturaUtil(primeira)) fechar();

            atual.push(b);
            usado += b.altura;
        });
        fechar();

        return paginas;
    }

    function montarDocumento() {
        const paginas = paginar(blocos());
        const total = paginas.length;

        return paginas.map((pag, i) => `
            <div class="solic-pagina" style="
                width:${PAG_W}px;height:${PAG_H}px;background:#fff;box-sizing:border-box;
                font-family:'Inter',-apple-system,sans-serif;color:#0f172a;position:relative;
                overflow:hidden;padding:${i === 0 ? 26 : 20}px 0 0;margin:0 auto ${i < total - 1 ? 22 : 0}px;
                box-shadow:0 1px 3px rgba(15,23,42,.12);">
                ${cabecalhoPagina(i === 0)}
                <div style="padding:0 ${PAD_X}px;">
                    ${pag.map(b => b.html).join('')}
                </div>
                ${rodapePagina(i + 1, total)}
            </div>`).join('');
    }

    function rerender() {
        const wrap = document.getElementById('solic-preview-wrap');
        if (wrap) wrap.innerHTML = montarDocumento();
    }

    // ── Painel de edição ────────────────────────────────────────────────────

    const CAMPOS = [
        ['aluno',       'Nome do estudante'],
        ['nascimento',  'Data de nascimento'],
        ['idade',       'Idade'],
        ['serie',       'Etapa / ano que cursa'],
        ['instituicao', 'Instituição (opcional)'],
        ['profNome',    'Profissional solicitante'],
        ['profTitulo',  'Titulação'],
        ['profCrp',     'CRP'],
        ['local',       'Local e data']
    ];

    function montarPainel() {
        const painel = document.getElementById('solic-edit-panel');
        if (!painel) return;
        const v = valores();
        const mods = M().MODELOS;

        painel.innerHTML = `
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;
                        color:#64748b;margin-bottom:9px;">Modelo</div>
            <div style="display:grid;gap:7px;margin-bottom:16px;">
                ${Object.keys(mods).map(k => `
                    <label style="display:flex;align-items:center;gap:9px;padding:10px 12px;
                                  border:1px solid ${modeloAtual === k ? '#2F6FED' : '#e2e8f0'};
                                  background:${modeloAtual === k ? '#eff6ff' : '#fff'};
                                  border-radius:10px;cursor:pointer;font-size:12.5px;line-height:1.35;">
                        <input type="radio" name="solic-modelo" value="${k}" ${modeloAtual === k ? 'checked' : ''} style="width:auto;margin:0;flex-shrink:0">
                        ${esc(mods[k].rotulo)}
                    </label>`).join('')}
            </div>

            <label style="display:flex;align-items:center;gap:9px;padding:10px 12px;border:1px solid #e2e8f0;
                          border-radius:10px;cursor:pointer;font-size:12.5px;margin-bottom:16px;">
                <input type="checkbox" id="solic-capa" ${incluirCapa ? 'checked' : ''} style="width:auto;margin:0">
                Incluir a página de instruções
            </label>

            <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;
                        color:#64748b;margin-bottom:9px;">Dados do documento</div>
            <div style="display:grid;gap:10px;">
                ${CAMPOS.map(([k, lbl]) => `
                    <div>
                        <label style="display:block;font-size:11px;font-weight:600;color:#64748b;margin-bottom:3px;">${esc(lbl)}</label>
                        <input data-solic="${k}" value="${esc(v[k] || '')}"
                               style="width:100%;padding:8px 10px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;">
                    </div>`).join('')}
            </div>

            <p style="font-size:11.5px;color:#94a3b8;line-height:1.55;margin-top:14px;">
                Campos vazios viram linhas para a escola preencher à mão.
                As alterações valem só para este documento; o cadastro do paciente não muda.
            </p>`;

        painel.querySelectorAll('input[name="solic-modelo"]').forEach(r => {
            r.addEventListener('change', (e) => { modeloAtual = e.target.value; montarPainel(); rerender(); });
        });
        painel.querySelector('#solic-capa').addEventListener('change', (e) => {
            incluirCapa = e.target.checked; rerender();
        });
        painel.querySelectorAll('[data-solic]').forEach(inp => {
            let t = null;
            inp.addEventListener('input', (e) => {
                edits[e.target.dataset.solic] = e.target.value;
                clearTimeout(t);
                t = setTimeout(rerender, 220);   // debounce: a paginação remede tudo
            });
        });
    }

    // ── Saídas ──────────────────────────────────────────────────────────────

    function aviso(msg, tipo) {
        if (window.CortexUI && window.CortexUI.toast) window.CortexUI.toast(msg, tipo || 'info');
    }

    async function gerarPdf() {
        if (!window.html2canvas || !window.jspdf) {
            aviso('Biblioteca de PDF ainda carregando. Tente em dois segundos.', 'info');
            return;
        }
        const btn = document.getElementById('btn-solic-pdf');
        const txt = btn ? btn.textContent : '';
        if (btn) { btn.disabled = true; btn.textContent = 'Gerando…'; }

        try {
            const pgs = [...document.querySelectorAll('.solic-pagina')];
            if (!pgs.length) throw new Error('Documento não encontrado');

            const imgs = document.querySelectorAll('#solic-preview-wrap img');
            await Promise.all([...imgs].map(img => {
                if (img.complete && img.naturalHeight !== 0) return Promise.resolve();
                return new Promise(r => { img.onload = r; img.onerror = r; setTimeout(r, 2000); });
            }));

            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF('p', 'mm', 'a4');

            for (let i = 0; i < pgs.length; i++) {
                const canvas = await window.html2canvas(pgs[i], {
                    scale: 3, backgroundColor: '#ffffff',
                    useCORS: true, allowTaint: true, logging: false
                });
                if (i > 0) pdf.addPage();
                pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 210, 297);
            }

            const v = valores();
            const nome = 'Solicitacao relatorio escolar - ' +
                (v.aluno || 'paciente').replace(/[\\/:*?"<>|]/g, '') + '.pdf';
            pdf.save(nome);
            aviso(`PDF gerado com ${pgs.length} página(s).`, 'success');
        } catch (err) {
            console.error('[solicitacao escolar]', err);
            aviso('Erro ao gerar o PDF: ' + (err.message || err), 'danger');
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = txt; }
        }
    }

    function imprimir() {
        const wrap = document.getElementById('solic-preview-wrap');
        if (!wrap) return;
        const j = window.open('', '_blank');
        if (!j) { aviso('O navegador bloqueou a janela de impressão.', 'danger'); return; }
        j.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
            <title>Solicitação de relatório escolar</title>
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
            <style>@page{size:A4;margin:0}body{margin:0}
            .solic-pagina{box-shadow:none !important;margin:0 auto !important;page-break-after:always;}
            .solic-pagina:last-child{page-break-after:auto;}</style></head>
            <body>${wrap.innerHTML}</body></html>`);
        j.document.close();
        setTimeout(() => { j.focus(); j.print(); }, 800);
    }

    // ── Abrir ───────────────────────────────────────────────────────────────

    function abrir(op) {
        op = op || {};
        if (!M()) { aviso('Modelos não carregaram. Recarregue a página.', 'danger'); return; }
        if (!op.paciente) { aviso('Paciente não carregado.', 'danger'); return; }

        ctx = {
            paciente: op.paciente,
            profissional: op.profissional || window.cortexProfissional || {},
            logo: op.logo || ''
        };
        edits = {};
        incluirCapa = true;
        modeloAtual = sugerirModelo(op.paciente);

        const antigo = document.getElementById('modal-solicitacao-escolar');
        if (antigo) antigo.remove();

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.id = 'modal-solicitacao-escolar';
        overlay.style.display = 'flex';
        overlay.innerHTML = `
            <div class="modal-content" style="max-width:1180px;max-height:93vh;display:flex;flex-direction:column;">
                <div class="modal-header">
                    <h2>Solicitação de relatório escolar</h2>
                    <div style="display:flex;gap:10px;align-items:center;">
                        <button class="btn btn-secondary btn-sm" id="btn-solic-imprimir">Imprimir</button>
                        <button class="btn btn-primary btn-sm" id="btn-solic-pdf">Baixar PDF</button>
                        <button class="modal-close" id="btn-solic-fechar">×</button>
                    </div>
                </div>
                <div class="modal-body" style="flex:1;overflow-y:auto;padding:0;background:#eef2f7;
                                               display:grid;grid-template-columns:320px 1fr;gap:0;">
                    <div id="solic-edit-panel" style="background:#fff;border-right:1px solid #e2e8f0;
                                                      padding:18px 18px 26px;overflow-y:auto;"></div>
                    <div id="solic-preview-wrap" style="padding:24px;overflow-y:auto;"></div>
                </div>
            </div>`;
        document.body.appendChild(overlay);

        montarPainel();
        rerender();

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

    return { abrir, sugerirModelo };
})();

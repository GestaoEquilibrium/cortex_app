/* ============================================================================
   CORTEX · Laudo Online — leitores TIAH/S e TISD
   (frontend/shared/laudo/escalas/tiahs_tisd.js) · sprint LO-6
   ----------------------------------------------------------------------------
   TIAH/S — mesma conta de frontend/correcao/tiahs/tiahs_resultado.js
     (calcularResultados + labelTipoAHS). Nakano/Vetor · 42 itens · 5 áreas.
     Só a resposta 3 ("acima da média") pontua: bruta da área = nº de 3 × 3.
     Resposta ausente/não numérica vale 0. A área de cada item vem do fator do
     banco (itens[].fator_codigo); item sem área conhecida é ignorado.
     Indicativo por área: bruta ≥ corte (Intelectual 22 · Acadêmicas 22 ·
     Liderança 17 · Criatividade 19 · Talento Artístico 17).
     Tipo: 0 áreas → sem indicativo · 1 → isolada · 2+ → combinada.
     Destaque: nº de áreas com indicativo (de 5). tom: indicativo → mod.

   TISD — a tela NÃO usa `correcoes`. O profissional digita a folha em
     `tisd_brutos` e a função do banco tisd_calcular grava `tisd_resultados`
     (bruto_total, t_<subteste>, percentil_geral/regiao, classificacao_geral/
     regiao, bruto_ref_*, norma_encontrada, ano_escolar, regiao). A tela só lê
     e mostra; este leitor lê a mesma linha (extra) e aplica as mesmas faixas
     (faixaDe) e os mesmos textos. Percentil por ano escolar; mais pontos = mais
     sinais = percentil mais baixo. Subtestes são descritivos (sem norma).
     tom das 7 faixas: Déficit grave → grave · moderado → mod · leve → leve ·
     Alerta → leve · Dentro/Acima/Muito acima → ok.
   ============================================================================ */
(function () {
    'use strict';
    if (!window.LaudoEscalas) { console.warn('[tiahs_tisd] escalas_base.js não carregado'); return; }
    const U = window.LaudoEscalas.util;

    // =========================================================================
    // TIAH/S — copiado de tiahs_resultado.js
    // =========================================================================
    const VALOR_ACIMA = 3;
    const AREAS = [
        { codigo: 'intelectual_geral',      nome: 'Capacidade Intelectual Geral',         qtdItens: 8, corte: 22, maxScore: 24 },
        { codigo: 'academicas_especificas', nome: 'Habilidades Acadêmicas Específicas',   qtdItens: 9, corte: 22, maxScore: 27 },
        { codigo: 'lideranca',              nome: 'Liderança',                            qtdItens: 8, corte: 17, maxScore: 24 },
        { codigo: 'criatividade',           nome: 'Criatividade',                         qtdItens: 8, corte: 19, maxScore: 24 },
        { codigo: 'talento_artistico',      nome: 'Talento Artístico',                    qtdItens: 9, corte: 17, maxScore: 27 }
    ];

    // itens: [{ numero, fator_codigo }]
    function calcularTiahs(respostas, itens) {
        const respostaPorNumero = {};
        for (const [k, v] of Object.entries(respostas)) respostaPorNumero[parseInt(k)] = parseInt(v) || 0;

        const porArea = {};
        for (const area of AREAS) porArea[area.codigo] = { ...area, qtdAcima: 0, pontuacaoBruta: 0, indicativoAHS: false };

        for (const item of itens) {
            const valor = respostaPorNumero[item.numero] ?? 0;
            const a = porArea[item.fator_codigo];
            if (!a) continue;
            if (valor === VALOR_ACIMA) a.qtdAcima++;
        }
        for (const a of Object.values(porArea)) {
            a.pontuacaoBruta = a.qtdAcima * 3;
            a.indicativoAHS = a.pontuacaoBruta >= a.corte;
        }
        const areasOrdenadas = AREAS.map(a => porArea[a.codigo]);
        const areasComIndicativo = areasOrdenadas.filter(a => a.indicativoAHS);
        let tipoAHS;
        if (areasComIndicativo.length === 0) tipoAHS = 'sem_indicativo';
        else if (areasComIndicativo.length === 1) tipoAHS = 'isolada';
        else tipoAHS = 'combinada';
        return { areasOrdenadas, areasComIndicativo, tipoAHS };
    }

    function labelTipoAHS(t) {
        return {
            sem_indicativo: 'Sem indicativo de AH/S',
            isolada:        'AH/S Isolada (1 área)',
            combinada:      'AH/S Combinada (2 ou mais áreas)'
        }[t] || '—';
    }

    window.LaudoEscalas.registrar({
        siglas: ['TIAH/S'],
        carregar: { fatores: true, itens: true, classificacoes: false, json: null },
        calcular(ctx) {
            if (!ctx.correcao) throw new Error('Nenhuma correção encontrada');
            if (!ctx.norma) throw new Error('Norma TIAH/S não cadastrada');
            const itens = (ctx.itens || []).map(i => ({ numero: i.numero, fator_codigo: i.fator_codigo || 'desconhecido' }));
            if (!itens.length) throw new Error('Itens da TIAH/S não carregados');
            const s = calcularTiahs(ctx.respostas || {}, itens);
            const n = s.areasComIndicativo.length;
            const totalAcima = s.areasOrdenadas.reduce((a, b) => a + b.qtdAcima, 0);

            const conferencia = { total: n, areas_com_indicativo: n, itens_acima: totalAcima };
            const subescalas = s.areasOrdenadas.map(a => {
                conferencia[a.codigo] = a.pontuacaoBruta;
                conferencia[U.chave(a.nome)] = a.pontuacaoBruta;
                conferencia[a.codigo + '_itens_acima'] = a.qtdAcima;
                return {
                    codigo: a.codigo, nome: a.nome, valor: a.pontuacaoBruta, max: a.maxScore,
                    classificacao: a.indicativoAHS ? 'Indicativo AH/S' : 'Abaixo do corte',
                    tom: a.indicativoAHS ? 'mod' : 'ok',
                    zonas: [
                        { ate: a.corte - 1, rotulo: 'Abaixo do corte', tom: 'ok' },
                        { ate: a.maxScore, rotulo: 'Indicativo AH/S', tom: 'mod' }
                    ],
                    extra: `${a.qtdAcima} de ${a.qtdItens} itens "acima" · corte ≥ ${a.corte}`
                };
            });

            const indicacao = n === 0
                ? 'Pontuação abaixo dos respectivos pontos de corte nas 5 áreas: sem indicativos de Altas Habilidades/Superdotação na triagem'
                : `Indicativos de AH/S em ${n} ${n === 1 ? 'área' : 'áreas'}: ${s.areasComIndicativo.map(a => a.nome).join(', ')} — ${labelTipoAHS(s.tipoAHS)}`;

            return {
                sigla: ctx.sigla || 'TIAH/S',
                nome: 'Triagem de Indicadores de Altas Habilidades/Superdotação (TIAH/S)',
                respondente: 'Professor',
                norma: 'Nakano (Vetor) · cortes por área: 22 · 22 · 17 · 19 · 17',
                principal: {
                    rotulo: 'Áreas com indicativo', valor: n, max: 5, sufixo: '',
                    classificacao: labelTipoAHS(s.tipoAHS), tom: n ? 'mod' : 'ok'
                },
                regua: {
                    min: 0, max: 5, valor: n, rotulo: 'Áreas com indicativo',
                    zonas: [
                        { ate: 0, rotulo: labelTipoAHS('sem_indicativo'), tom: 'ok' },
                        { ate: 1, rotulo: labelTipoAHS('isolada'), tom: 'mod' },
                        { ate: 5, rotulo: labelTipoAHS('combinada'), tom: 'mod' }
                    ]
                },
                subescalas,
                linhas: [
                    ['Tipo', labelTipoAHS(s.tipoAHS)],
                    ['Total de itens "acima"', `${totalAcima} / 42`]
                ],
                indicacao,
                conferencia
            };
        }
    });

    // =========================================================================
    // TISD — copiado de tisd_resultado.js
    // =========================================================================
    const SUBTESTES = [
        { cod: 'leitura',    nome: 'Leitura',                maxes: [21, 9, 9] },
        { cod: 'escrita',    nome: 'Escrita',                maxes: [21, 9, 9] },
        { cod: 'atencao',    nome: 'Atenção visual',         maxes: [176, 19] },
        { cod: 'calculo',    nome: 'Cálculo',                maxes: [1, 1, 1, 1] },
        { cod: 'motoras',    nome: 'Habilidades motoras',    maxes: [2, 2, 2, 2, 2] },
        { cod: 'fonologica', nome: 'Consciência fonológica', maxes: [3, 3] },
        { cod: 'nomeacao',   nome: 'Nomeação rápida',        maxes: [null, null] },   // pontos (erros + 1 a cada 5 s), sem teto
        { cod: 'memoria',    nome: 'Memória de curto prazo', maxes: [6, 6] }
    ];
    const REGIOES = [
        ['sudeste',      'Sudeste',      [1, 2, 3, 4, 5]],
        ['nordeste',     'Nordeste',     [3, 4, 5]],
        ['centro_oeste', 'Centro-Oeste', [1, 2, 3]],
        ['norte',        'Norte',        []],
        ['sul',          'Sul',          []]
    ];
    function nomeRegiao(v) { const r = REGIOES.find(x => x[0] === v); return r ? r[1] : '—'; }
    function temNormaRegional(v, ano) {
        const r = REGIOES.find(x => x[0] === v);
        return !!(r && ano && r[2].indexOf(Number(ano)) !== -1);
    }
    const FAIXAS = [
        { min:  1, max:  5, nome: 'Déficit grave',           slug: 'grave'    },
        { min:  6, max:  9, nome: 'Déficit moderado',        slug: 'moderado' },
        { min: 10, max: 24, nome: 'Déficit leve',            slug: 'leve'     },
        { min: 25, max: 49, nome: 'Alerta para déficit',     slug: 'alerta'   },
        { min: 50, max: 74, nome: 'Dentro do esperado',      slug: 'dentro'   },
        { min: 75, max: 94, nome: 'Acima do esperado',       slug: 'acima'    },
        { min: 95, max: 99, nome: 'Muito acima do esperado', slug: 'muito'    }
    ];
    function faixaDe(pc) {
        if (pc === null || pc === undefined) return null;
        return FAIXAS.find(f => pc >= f.min && pc <= f.max) || null;
    }
    // -------------------------------------------------------------------------

    const TOM_FAIXA = { grave: 'grave', moderado: 'mod', leve: 'leve', alerta: 'leve', dentro: 'ok', acima: 'ok', muito: 'ok' };
    const ZONAS_PCT = FAIXAS.map(f => ({ ate: f.max, rotulo: f.nome, tom: TOM_FAIXA[f.slug] }));
    const temValor = v => v !== null && v !== undefined;

    function maxSubteste(s) {
        return s.maxes.some(m => m === null) ? null : s.maxes.reduce((a, b) => a + b, 0);
    }

    // mesmo resultado que a tela mostra, a partir da linha de tisd_resultados
    function resumoTisd(r, encaminhamento, sigla) {
        const anoStr = r.ano_escolar ? r.ano_escolar + 'º ano' : '—';
        const regiaoNome = r.regiao ? nomeRegiao(r.regiao) : '—';
        const porSub = {
            leitura: r.t_leitura, escrita: r.t_escrita, atencao: r.t_atencao,
            calculo: r.t_calculo, motoras: r.t_motoras, fonologica: r.t_fonologica,
            nomeacao: r.t_nomeacao, memoria: r.t_memoria
        };
        const fg = faixaDe(r.percentil_geral);
        const fr = faixaDe(r.percentil_regiao);
        const classGeral = r.classificacao_geral || (r.ano_escolar ? 'norma não cadastrada' : 'ano escolar não informado');
        const classRegiao = r.classificacao_regiao || (!r.regiao ? 'região não informada' : `sem tabela para o ${anoStr}`);
        const total = r.bruto_total || 0;

        const conferencia = { total: r.bruto_total, bruto_total: r.bruto_total };
        if (temValor(r.percentil_geral)) {
            conferencia.percentil = r.percentil_geral;
            conferencia.percentil_geral = r.percentil_geral;
            conferencia.total_percentil = r.percentil_geral;
        }
        if (temValor(r.percentil_regiao)) conferencia.percentil_regiao = r.percentil_regiao;

        const subescalas = SUBTESTES.map(s => {
            const v = porSub[s.cod];
            const pct = (total > 0 && v) ? (v / total * 100) : 0;
            if (temValor(v)) { conferencia[s.cod] = v; conferencia[U.chave(s.nome)] = v; }
            return {
                codigo: s.cod, nome: s.nome, valor: temValor(v) ? v : null, max: maxSubteste(s),
                classificacao: null, tom: 'neutro', zonas: null,
                extra: `${total > 0 ? Math.round(pct) + '%' : '—'} da bruta total · descritivo`
            };
        });

        const linhas = [
            [`População geral · ${anoStr}`, temValor(r.percentil_geral) ? `P${r.percentil_geral} · ${classGeral}` : classGeral],
            [`Região do país${r.regiao ? ' · ' + regiaoNome : ''}`, temValor(r.percentil_regiao) ? `P${r.percentil_regiao} · ${classRegiao}` : classRegiao]
        ];
        if (temValor(r.percentil_geral) && temValor(r.bruto_ref_geral) && temValor(r.bruto_total) && r.bruto_ref_geral !== r.bruto_total)
            linhas.push(['Arredondamento (população geral)', `bruta ${r.bruto_total} arredondada para o ponto tabelado ${r.bruto_ref_geral}`]);
        if (temValor(r.percentil_regiao) && temValor(r.bruto_ref_regiao) && temValor(r.bruto_total) && r.bruto_ref_regiao !== r.bruto_total)
            linhas.push(['Arredondamento (região)', `bruta ${r.bruto_total} arredondada para o ponto tabelado ${r.bruto_ref_regiao}`]);
        if (encaminhamento !== undefined) linhas.push(['Encaminhamento para avaliação', encaminhamento ? 'Sim' : 'Não']);

        // frase-resumo = primeiros parágrafos da "Leitura clínica" da tela, sem HTML
        const ind = [];
        if (temValor(r.percentil_geral)) {
            ind.push(`Pontuação bruta total de ${r.bruto_total} pontos. No ${anoStr}, comparada à população geral, corresponde ao percentil ${r.percentil_geral}, faixa ${r.classificacao_geral}.`);
        } else {
            ind.push(`Pontuação bruta total de ${r.bruto_total} pontos. Não foi possível converter em percentil${r.ano_escolar ? '' : ' porque o ano escolar não foi informado'}.`);
        }
        if (temValor(r.percentil_regiao)) {
            ind.push(`Na amostra da região ${regiaoNome}, percentil ${r.percentil_regiao}, faixa ${r.classificacao_regiao}.`);
            if (fg && fr && fg.slug !== fr.slug) ind.push('As duas leituras não coincidem.');
        } else if (r.regiao && r.ano_escolar && !temNormaRegional(r.regiao, r.ano_escolar)) {
            ind.push(`O manual não publicou tabela da região ${regiaoNome} para o ${anoStr}; vale a conversão pela população geral.`);
        }

        let norma = r.ano_escolar ? `Percentil por ano escolar (${anoStr}) · população geral` : 'Percentil por ano escolar';
        if (temValor(r.percentil_regiao)) norma += ' e ' + regiaoNome;

        return {
            sigla: sigla || 'TISD',
            nome: 'Teste para Identificação de Sinais de Dislexia (TISD)',
            respondente: null,
            norma,
            principal: {
                rotulo: 'Pontuação bruta total', valor: r.bruto_total, max: null, sufixo: '',
                classificacao: classGeral, tom: fg ? TOM_FAIXA[fg.slug] : 'neutro'
            },
            regua: temValor(r.percentil_geral)
                ? { min: 1, max: 99, valor: r.percentil_geral, rotulo: `Percentil · população geral · ${anoStr}`, zonas: ZONAS_PCT }
                : null,
            subescalas,
            linhas,
            indicacao: ind.join(' '),
            conferencia
        };
    }

    window.LaudoEscalas.registrar({
        siglas: ['TISD'],
        semCorrecao: true,                   // não há linha em `correcoes`
        carregar: { fatores: false, itens: false, classificacoes: false, json: null },
        async extra(client, ctx) {
            const id = ctx.aplicacao && ctx.aplicacao.id;
            if (!id) return { tisd_resultado: null };
            const { data, error } = await client
                .from('tisd_resultados').select('*').eq('aplicacao_id', id).maybeSingle();
            if (error) throw new Error('tisd_resultados: ' + error.message);
            let encaminhamento;
            if (data) {
                const b = await client.from('tisd_brutos').select('encaminhamento').eq('aplicacao_id', id).maybeSingle();
                if (!b.error && b.data) encaminhamento = !!b.data.encaminhamento;
            }
            return { tisd_resultado: data || null, tisd_encaminhamento: encaminhamento };
        },
        calcular(ctx) {
            const r = ctx.tisd_resultado;
            if (!r) return null;             // folha ainda não calculada
            return resumoTisd(r, ctx.tisd_encaminhamento, ctx.sigla);
        }
    });
})();

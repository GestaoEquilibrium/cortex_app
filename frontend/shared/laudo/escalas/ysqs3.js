/* ============================================================================
   CORTEX · Laudo Online — leitor YSQ-S3
   (frontend/shared/laudo/escalas/ysqs3.js) · sprint LO-6
   ----------------------------------------------------------------------------
   Mesma conta de frontend/correcao/ysqs3/ysqs3_resultado.js
   (calcularResultados + classificarMedia), sem tocar na tela.

   Questionário de Esquemas de Young (versão breve) · 90 itens 1-6 · 18 esquemas
   × 5 itens · 5 domínios · autorrelato.
     - esquema de cada item = fator do banco (fator_id → fator_codigo, como a tela;
       sem fator conhecido → não soma)
     - item sem resposta vale 0 na soma (como na tela) e o esquema divide pelo
       número de itens do fator
     - média do esquema: ≤ 2,0 Ausente / Irrelevante · ≤ 3,0 Leve · ≤ 4,0 Moderado
       · ≤ 5,0 Intenso · > 5,0 Muito intenso; clínico se média ≥ 3,0
     - Total = soma dos 18 esquemas; Média geral = Total ÷ respostas gravadas
     - domínio: média das médias dos seus esquemas + nº de esquemas clínicos
   Número principal: "Média geral" (cabeçalho da tela, 2 casas). A tela não
   classifica a média geral; classifica cada esquema.
   ============================================================================ */
(function () {
    'use strict';
    if (!window.LaudoEscalas) { console.warn('[ysqs3] escalas_base.js não carregado'); return; }
    const U = window.LaudoEscalas.util;

    // ---- copiado de ysqs3_resultado.js --------------------------------------
    const CORTE_CLINICO = 3.0;
    const ESCALA_MAX = 6;
    const ESQUEMAS = [
        { codigo: 'privacao_emocional',        nome: 'Privação Emocional',                    dominio: 'D1' },
        { codigo: 'abandono_instabilidade',    nome: 'Abandono / Instabilidade',              dominio: 'D1' },
        { codigo: 'desconfianca_abuso',        nome: 'Desconfiança / Abuso',                  dominio: 'D1' },
        { codigo: 'isolamento_social',         nome: 'Isolamento Social / Alienação',         dominio: 'D1' },
        { codigo: 'defectividade_vergonha',    nome: 'Defectividade / Vergonha',              dominio: 'D1' },
        { codigo: 'fracasso',                  nome: 'Fracasso',                              dominio: 'D2' },
        { codigo: 'dependencia_incompetencia', nome: 'Dependência / Incompetência',           dominio: 'D2' },
        { codigo: 'vulnerabilidade_dano',      nome: 'Vulnerabilidade ao Dano / Doença',      dominio: 'D2' },
        { codigo: 'emaranhamento',             nome: 'Emaranhamento / Self Subdesenvolvido',  dominio: 'D2' },
        { codigo: 'subjugacao',                nome: 'Subjugação',                            dominio: 'D3' },
        { codigo: 'autossacrificio',           nome: 'Autossacrifício',                       dominio: 'D3' },
        { codigo: 'inibicao_emocional',        nome: 'Inibição Emocional',                    dominio: 'D3' },
        { codigo: 'padroes_inflexiveis',       nome: 'Padrões Inflexíveis / Postura Crítica', dominio: 'D4' },
        { codigo: 'arrogo_grandiosidade',      nome: 'Arrogo / Grandiosidade',                dominio: 'D4' },
        { codigo: 'autocontrole_insuficiente', nome: 'Autocontrole / Autodisciplina Insuf.',  dominio: 'D4' },
        { codigo: 'busca_aprovacao',           nome: 'Busca de Aprovação / Reconhecimento',   dominio: 'D5' },
        { codigo: 'negativismo_pessimismo',    nome: 'Negativismo / Pessimismo',              dominio: 'D5' },
        { codigo: 'postura_punitiva',          nome: 'Postura Punitiva',                      dominio: 'D5' }
    ];
    const DOMINIOS = {
        D1: 'Desconexão e Rejeição',
        D2: 'Autonomia e Desempenho Prejudicados',
        D3: 'Limites Prejudicados',
        D4: 'Orientação para o Outro',
        D5: 'Supervigilância e Inibição'
    };

    // itens: [{ numero, fator_codigo }] mapeados como na tela
    function calcularResultados(respostas, itens) {
        const respostaPorNumero = {};
        for (const [k, v] of Object.entries(respostas)) {
            respostaPorNumero[parseInt(k)] = parseInt(v) || 0;
        }
        const porEsquema = {};
        for (const esq of ESQUEMAS) {
            porEsquema[esq.codigo] = { ...esq, itens: [], soma: 0, media: 0, classificacao: 'ausente', acimaCorte: false };
        }
        for (const item of itens) {
            const valor = respostaPorNumero[item.numero] ?? 0;
            const esqCod = item.fator_codigo;
            if (porEsquema[esqCod]) {
                porEsquema[esqCod].itens.push({ numero: item.numero, valor });
                porEsquema[esqCod].soma += valor;
            }
        }
        for (const esq of Object.values(porEsquema)) {
            const n = esq.itens.length;
            esq.media = n > 0 ? esq.soma / n : 0;
            esq.classificacao = classificarMedia(esq.media);
            esq.acimaCorte = esq.media >= CORTE_CLINICO;
        }
        const esquemasOrdenados = ESQUEMAS.map(e => porEsquema[e.codigo]);
        const porDominio = {};
        for (const dom of Object.keys(DOMINIOS)) {
            porDominio[dom] = {
                codigo: dom, nome: DOMINIOS[dom],
                esquemas: esquemasOrdenados.filter(e => e.dominio === dom),
                somaMedias: 0, qtdAcimaCorte: 0
            };
            porDominio[dom].somaMedias = porDominio[dom].esquemas.reduce((a, e) => a + e.media, 0);
            porDominio[dom].qtdAcimaCorte = porDominio[dom].esquemas.filter(e => e.acimaCorte).length;
            porDominio[dom].mediaDominio = porDominio[dom].esquemas.length > 0
                ? porDominio[dom].somaMedias / porDominio[dom].esquemas.length : 0;
        }
        const totalGeral = esquemasOrdenados.reduce((a, e) => a + e.soma, 0);
        const respondidos = Object.keys(respostas).length;
        const mediaGeral = respondidos > 0 ? totalGeral / respondidos : 0;
        const esquemasClinicos = esquemasOrdenados.filter(e => e.acimaCorte);
        return { totalGeral, mediaGeral, respondidos, esquemasOrdenados, esquemasClinicos, porDominio };
    }

    function classificarMedia(media) {
        if (media <= 2.0) return 'ausente';
        if (media <= 3.0) return 'leve';
        if (media <= 4.0) return 'moderado';
        if (media <= 5.0) return 'intenso';
        return 'muito_intenso';
    }
    function labelClassificacao(c) {
        return {
            ausente:        'Ausente / Irrelevante',
            leve:           'Leve',
            moderado:       'Moderado',
            intenso:        'Intenso',
            muito_intenso:  'Muito intenso'
        }[c] || '—';
    }
    // Primeiro parágrafo de renderInterpretacao() da tela, em texto puro
    function fraseInterpretacao(s) {
        const qtd = s.esquemasClinicos.length;
        if (qtd === 0) {
            return `Nenhum dos 18 esquemas iniciais desadaptativos atingiu o ponto de corte clínico (média ≥ ${CORTE_CLINICO.toFixed(1)}). A média geral foi de ${s.mediaGeral.toFixed(2)} em uma escala de 1 a 6.`;
        }
        return `Foram identificados ${qtd} ${qtd === 1 ? 'esquema' : 'esquemas'} com média ≥ ${CORTE_CLINICO.toFixed(1)}, considerados clinicamente relevantes pelo YSQ-S3. A média geral foi de ${s.mediaGeral.toFixed(2)} em escala 1-6.`;
    }
    // -------------------------------------------------------------------------

    const TOM = { ausente: 'ok', leve: 'leve', moderado: 'mod', intenso: 'grave', muito_intenso: 'grave' };
    // Régua de cada esquema (média 0-6). A última zona termina um fio acima de 6
    // para a régua não tratar os limites como inteiros (2,0 / 3,0 … são cortes
    // reais de média, não "até 2 → a partir de 3"); zonaDe continua idêntica.
    const ZONAS_ESQUEMA = [
        { ate: 2, rotulo: 'Ausente / Irrelevante', tom: 'ok' },
        { ate: 3, rotulo: 'Leve', tom: 'leve' },
        { ate: 4, rotulo: 'Moderado', tom: 'mod' },
        { ate: 5, rotulo: 'Intenso', tom: 'grave' },
        { ate: 6.0001, rotulo: 'Muito intenso', tom: 'grave' }
    ];
    const r2 = x => Number(x.toFixed(2));   // mesmo arredondamento de exibição da tela

    window.LaudoEscalas.registrar({
        siglas: ['YSQ-S3'],
        carregar: { fatores: true, itens: true, classificacoes: false, json: null },
        calcular(ctx) {
            const mapFator = {};
            for (const f of (ctx.fatores || [])) mapFator[f.id] = f.fator_codigo;
            const itens = (ctx.itens || []).slice().sort((a, b) => a.numero - b.numero)
                .map(i => ({ numero: i.numero, fator_codigo: mapFator[i.fator_id] || 'desconhecido' }));
            if (!itens.length) throw new Error('YSQ-S3: itens da norma não carregados');

            const s = calcularResultados(ctx.respostas || {}, itens);
            const qtdClinicos = s.esquemasClinicos.length;

            const conferencia = {
                total: s.totalGeral, total_ysq: s.totalGeral,
                media_geral: r2(s.mediaGeral),
                esquemas_clinicos: qtdClinicos
            };
            const subescalas = s.esquemasOrdenados.map(e => {
                const m = r2(e.media);
                conferencia[e.codigo] = m; conferencia[U.chave(e.nome)] = m;
                conferencia[e.codigo + '_soma'] = e.soma;
                return {
                    codigo: e.codigo, nome: e.nome, valor: m, max: ESCALA_MAX,
                    classificacao: labelClassificacao(e.classificacao), tom: TOM[e.classificacao] || 'neutro',
                    zonas: ZONAS_ESQUEMA,
                    extra: `${e.dominio} · soma ${e.soma}${e.acimaCorte ? ' · ✓ clínico' : ''}`
                };
            });
            const linhas = [
                ['Total YSQ-S3', String(s.totalGeral)],
                ['Esquemas clinicamente relevantes', `${qtdClinicos} de 18`],
                ['Ponto de corte', `média ≥ ${CORTE_CLINICO.toFixed(1)}`]
            ];
            Object.values(s.porDominio).forEach(d => {
                const md = r2(d.mediaDominio);
                conferencia[d.codigo] = md; conferencia[U.chave(d.nome)] = md;
                conferencia[d.codigo + '_clinicos'] = d.qtdAcimaCorte;
                const clin = d.qtdAcimaCorte > 0 ? d.qtdAcimaCorte + ' clínico' + (d.qtdAcimaCorte > 1 ? 's' : '') : 'nenhum clínico';
                linhas.push([`${d.codigo} — ${d.nome}`, `média ${d.mediaDominio.toFixed(2)} · ${d.esquemas.length} esquemas · ${clin}`]);
            });

            return {
                sigla: ctx.sigla || 'YSQ-S3',
                nome: 'Questionário de Esquemas de Young (Versão Breve)',
                respondente: 'Autorrelato',
                norma: `Adapt. BR GAAPCC/PUCRS (2020) · corte clínico: média ≥ ${CORTE_CLINICO.toFixed(1)}`,
                principal: {
                    rotulo: 'Média geral', valor: r2(s.mediaGeral), max: ESCALA_MAX, sufixo: '',
                    classificacao: null, tom: 'neutro'
                },
                regua: null,          // a média geral não tem faixas na tela; cada esquema tem régua
                subescalas,
                linhas,
                indicacao: fraseInterpretacao(s),
                conferencia
            };
        }
    });
})();

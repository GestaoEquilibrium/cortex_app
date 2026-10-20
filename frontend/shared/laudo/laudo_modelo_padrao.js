/* ============================================================================
   CORTEX · Laudo Online — MODELO PADRÃO DA CLÍNICA
   (frontend/shared/laudo/laudo_modelo_padrao.js)
   ----------------------------------------------------------------------------
   Esqueleto das seções 1–13 com os textos institucionais do motor 5.5
   (Documento 1, §2 e §8.4; Documento 3, sprint LO-1). Na primeira importação,
   se a tabela laudo_modelos ainda não tem modelo padrão, este esqueleto é
   gravado lá; daí em diante vale o que estiver na tabela.
   Marca `conteudo_gerador`: onde entram os blocos do pacote daquela seção.
   Expõe: window.LaudoModeloPadrao
   ============================================================================ */
(function () {
    'use strict';

    const NOME = 'Modelo padrão Equilibrium';

    const RESP = 'Wessilon Marques de Sousa';
    const CRP = 'CRP 04/53832';

    const ACOMPANHE = 'Documento de natureza técnico-científica emitido sob responsabilidade do(a) profissional signatário(a), nos termos da Resolução CFP nº 06/2019. Destina-se exclusivamente à(s) finalidade(s) e ao(à) solicitante indicados neste laudo, sendo vedada sua utilização para fins diversos daqueles a que se propõe. A reprodução parcial, a divulgação, a publicação ou o compartilhamento deste conteúdo com terceiros não autorizados são expressamente vedados, nos termos da Lei nº 13.709/2018 (LGPD) e do sigilo profissional previsto no Código de Ética Profissional do Psicólogo. O acesso por profissional externo somente será concedido mediante autorização expressa do responsável técnico.';

    const INTRO_4 = 'A tabela a seguir apresenta o sistema de classificação normativa adotado para a interpretação dos escores compostos de inteligência e, por extensão, das demais medidas padronizadas deste laudo, conforme a distribuição normal da população de referência.';

    const FAIXAS_QI = [
        ['2,2', '>98', '>130', 'Q.I Muito Superior', 'Desempenho excepcional'],
        ['6,7', '91 – 97', '120 – 129', 'Q.I Superior', 'Recurso cognitivo robusto'],
        ['16,1', '75 – 90', '110 – 119', 'Q.I Médio Superior', 'Acima da média da maioria'],
        ['50', '25 – 74', '90 – 109', 'Q.I Médio', 'Funcionamento estável'],
        ['16,1', '09 – 24', '80 – 89', 'Q.I Médio Inferior', 'Zona de vulnerabilidade'],
        ['6,7', '02 – 08', '70 – 79', 'Q.I Inferior (Limítrofe)', 'Dificuldades significativas'],
        ['2,2', '<2', '≤ 70', 'Extremamente Baixo', 'Prejuízo funcional severo']
    ];

    const INTRO_5 = 'Os resultados apresentados a seguir estão organizados de forma individualizada por instrumento. A integração transversal dos achados e os cruzamentos clínicos entre domínios são realizados exclusivamente na **Seção de Síntese e Integração Clínica**, em conformidade com os princípios metodológicos da avaliação neuropsicológica.';

    const NOTA_TITULO = '8.1 Nota Técnica — Natureza, Alcance e Articulação desta Avaliação';
    const NOTA_81 = [
        '**Do que se trata este documento.** Este é um laudo psicológico produzido em processo de avaliação neuropsicológica, conduzido com instrumentos aprovados pelo SATEPSI/CFP e normatizados para a população brasileira, nos termos das Resoluções CFP nº 06/2019 e nº 31/2022. A avaliação reúne **medidas diretas de desempenho** — testes de inteligência, atenção, memória e funções executivas —, **observação comportamental sistemática em sessão**, **anamnese e histórico documental** e **medidas de relato**. Seu produto é o **diagnóstico psicológico**, função privativa do psicólogo (Lei nº 4.119/1962, art. 13, § 1º, "a"), expresso na caracterização objetiva do funcionamento cognitivo, comportamental e emocional do examinando e na formulação de **hipóteses diagnósticas fundamentadas** — conteúdo expressamente previsto no art. 13, § 6º, I, da Resolução CFP nº 06/2019.',
        '**Do método: convergência entre fontes independentes.** Nenhuma hipótese aqui apresentada decorre de instrumento isolado ou de um único informante. Os dados de relato — do examinando e de terceiros — são **sistematicamente confrontados** com o desempenho objetivo em teste, com a observação direta em sessão e com o histórico de desenvolvimento, e as convergências e divergências entre essas fontes são explicitadas ao longo do laudo. É esse desenho que confere validade às conclusões: o serviço responde tecnicamente pela seleção dos instrumentos, pela correção da aplicação, pela apuração dos escores e pela interpretação integrada dos achados, sendo o relato subjetivo tratado como **dado a ser corroborado**, jamais como evidência suficiente por si.',
        '**Da articulação multiprofissional.** A legislação brasileira estabelece que a avaliação de condições do neurodesenvolvimento seja **multiprofissional e interdisciplinar** (Lei nº 12.764/2012, art. 3º, III, "b"; Lei nº 13.146/2015, art. 2º, § 1º). Este laudo constitui a **contribuição especializada da neuropsicologia** a esse processo: entrega ao médico assistente o substrato mensurado — perfil intelectual, atencional, executivo, mnemônico e socioemocional — que o exame clínico isoladamente não obtém. A **definição diagnóstica formal**, a codificação para fins legais e a conduta terapêutica competem ao médico (Lei nº 12.842/2013, art. 4º; Lei nº 12.764/2012, art. 3º-A, § 1º), a quem cabe integrar os presentes achados ao exame clínico e aos demais elementos disponíveis.',
        '**Do alcance temporal e do grau de certeza.** O fenômeno psicológico tem natureza **dinâmica, não definitiva e não cristalizada** (Resolução CFP nº 06/2019, art. 5º); este documento retrata o funcionamento do examinando no período avaliado. Cada hipótese apresentada acompanha-se de **nível de confiança explícito**. As classificadas como INSUFICIENTE são registradas como "Hipótese a Investigar", sem codificação CID-11 ou DSM-5-TR, indicando com precisão a direção do aprofundamento necessário.'
    ];

    const FECHAMENTO = 'O presente laudo foi elaborado em conformidade com as **Resoluções CFP nº 06/2019 e nº 31/2022**, do Conselho Federal de Psicologia, a partir de entrevista de anamnese, observação clínica sistemática e aplicação de instrumentos padronizados. Destina-se a subsidiar o raciocínio clínico do médico solicitante e da equipe terapêutica, devendo seus achados ser integrados ao acompanhamento longitudinal d{o|a} examinand{o|a}. Coloco-me à disposição para a entrevista devolutiva e para os esclarecimentos que se fizerem necessários.';
    // __VALIDADE__ é trocado na montagem pelo `meta.validade` do pacote.
    const VALIDADE = '**Prazo de validade.** Considerando a natureza dinâmica do funcionamento psicológico, o conteúdo deste documento tem validade de __VALIDADE__, a contar da data de emissão, ressalvada a reavaliação antecipada diante de mudança clínica relevante.';

    const CONVITE = 'Ficamos muito felizes em realizar essa Avaliação Neuropsicológica, esperamos que esse laudo possa auxiliar em sua jornada. Você poderia nos ajudar com uma breve avaliação no Google? É rapidinho, leva menos de um minuto. Sua opinião é fundamental para que outras pessoas também encontrem o suporte de que precisam!';
    const LINK_GOOGLE = 'https://g.page/r/CVq0oQK8oq7HEBM/review?utm_source=gbp&utm_medium=reviews&utm_campaign=qr';

    // Referências normativas: base + extras escolhidos no pacote (meta.normas_extras)
    const NORMAS = [
        'BRASIL. **Lei nº 4.119, de 27 de agosto de 1962.** Dispõe sobre os cursos de formação em Psicologia e regulamenta a profissão de Psicólogo. Brasília, DF.',
        'BRASIL. **Lei nº 12.764, de 27 de dezembro de 2012.** Institui a Política Nacional de Proteção dos Direitos da Pessoa com Transtorno do Espectro Autista. Brasília, DF.',
        'BRASIL. **Lei nº 12.842, de 10 de julho de 2013.** Dispõe sobre o exercício da Medicina. Brasília, DF.',
        'BRASIL. **Lei nº 13.146, de 6 de julho de 2015.** Institui a Lei Brasileira de Inclusão da Pessoa com Deficiência (Estatuto da Pessoa com Deficiência). Brasília, DF.'
    ];
    const NORMAS_EXTRA = {
        ciptea: 'BRASIL. **Lei nº 13.977, de 8 de janeiro de 2020.** Institui a Carteira de Identificação da Pessoa com Transtorno do Espectro Autista (CIPTEA). Brasília, DF.',
        ahsd: 'BRASIL. **Lei nº 15.436, de 2026.** Dispõe sobre altas habilidades/superdotação. Brasília, DF.',
        etica: 'CONSELHO FEDERAL DE PSICOLOGIA. **Resolução CFP nº 10, de 21 de julho de 2005.** Aprova o Código de Ética Profissional do Psicólogo. Brasília, DF: CFP.'
    };
    const RESOLUCOES = [
        'CONSELHO FEDERAL DE PSICOLOGIA. **Resolução CFP nº 06, de 29 de março de 2019.** Institui regras para a elaboração de documentos escritos produzidos pela(o) psicóloga(o) no exercício profissional. Brasília, DF: CFP.',
        'CONSELHO FEDERAL DE PSICOLOGIA. **Resolução CFP nº 31, de 15 de dezembro de 2022.** Estabelece diretrizes para a realização de Avaliação Psicológica e regulamenta o SATEPSI. Brasília, DF: CFP.'
    ];

    function m(chave, tipo, extra) {
        return Object.assign({ id: 'm.' + chave, tipo, origem: 'modelo' }, extra || {});
    }
    const GERADOR = { tipo: 'conteudo_gerador' };

    function esqueleto() {
        const S = window.LaudoCore.SECOES;
        const sec = (n, blocos) => {
            const def = S.find(s => s[0] === String(n));
            return { id: 's' + n, n: String(n), titulo: def[1], oculta: false, quebra_antes: false, capitulo_online: def[2], blocos };
        };
        return {
            formato: 'cortex-laudo', versao_formato: '2.0', tipo: 'modelo', nome: NOME,
            textos: {
                capa_titulo: 'LAUDO PSICOLÓGICO DE AVALIAÇÃO NEUROPSICOLÓGICO',
                responsavel: RESP, registro: CRP, cidade: 'Uberlândia — MG',
                link_convite: LINK_GOOGLE,
                normas: NORMAS, normas_extra: NORMAS_EXTRA, resolucoes: RESOLUCOES,
                validade: VALIDADE
            },
            layout: {
                impressao: { capa: true, cabecalho: 'Laudo Neuropsicológico — {nome} | {mes_ano}', rodape_assinatura: true, numerar_desde: 1, alvo_paginas: 25 },
                online: {}
            },
            secoes: [
                sec(1, [m('cracha', 'cracha', { origem: 'cortex' }), GERADOR, m('acompanhe', 'acompanhe', { origem: 'cortex', texto: ACOMPANHE })]),
                sec(2, [GERADOR]),
                sec(3, [m('intro_3', 'padrao', { chave: 'intro_3', texto: '' }), GERADOR]),
                sec(4, [m('intro_4', 'padrao', { chave: 'intro_4', texto: INTRO_4 }), m('classificacao_qi', 'classificacao_qi', { linhas: FAIXAS_QI })]),
                sec(5, [m('intro_5', 'padrao', { chave: 'intro_5', texto: INTRO_5 }), GERADOR]),
                sec(6, [GERADOR]),
                sec(7, [GERADOR]),
                sec(8, [
                    m('titulo_81', 'titulo', { nivel: 3, texto: NOTA_TITULO, ancora: 'nota-tecnica', manter_com_proximo: true }),
                    m('nota_tecnica_81', 'padrao', { chave: 'nota_tecnica_81', texto: NOTA_81.join('\n\n') }),
                    GERADOR
                ]),
                sec(9, [GERADOR]),
                sec(10, [GERADOR]),
                sec(11, [
                    m('fechamento', 'padrao', { chave: 'fechamento', texto: FECHAMENTO }),
                    m('validade', 'padrao', { chave: 'validade', texto: VALIDADE }),
                    m('local_data', 'local_data', { origem: 'cortex', cidade: 'Uberlândia — MG' }),
                    m('assinatura', 'assinatura', { origem: 'cortex', nome: RESP, registro: 'CRP-04: 53832', mostrar_logo: true }),
                    m('convite', 'convite', { origem: 'cortex', texto: CONVITE, link: LINK_GOOGLE })
                ]),
                sec(12, [GERADOR]),
                sec(13, [m('normativas', 'referencias', { chave: 'normativas', itens: [] })])
            ]
        };
    }

    window.LaudoModeloPadrao = { NOME, RESP, CRP, esqueleto };
})();

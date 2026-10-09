// ============================================================================
// CORTEX_APP — TLPP (ANELE-4) · motor de correção
// ----------------------------------------------------------------------------
// Puro (sem DOM, sem rede). Recebe os estímulos e as normas vindos do banco
// (tlpp_estimulos / tlpp_normas) e a marcação item a item; devolve escores,
// intervalos de percentil, Z, classificação (Tabela 6.2), efeitos
// psicolinguísticos e levantamento dos tipos de erro.
//
// Regras do manual (cap. 5 e 6):
//   - 1 ponto por estímulo lido corretamente; autocorreção espontânea = acerto.
//   - Tipos de erro contam todas as produções, inclusive as autocorrigidas:
//     um acerto pode carregar tipos de erro; um estímulo pode ter mais de um.
//   - Percentil: escore igual ao valor da tabela → aquele percentil (ou o
//     intervalo de percentis que repetem o valor); entre dois valores → o
//     intervalo; abaixo do p2,5 → "< 2,5"; acima do p90 → "> 90".
//   - Interpretação pelo percentil MAIS ALTO do intervalo ("que favoreça o
//     desempenho do examinando" — cap. 6), segundo a Tabela 6.2.
//   - Z = (X − M) / DP.
//   - Efeitos: diferença de porcentagem de acertos (regularidade, frequência,
//     lexicalidade, extensão em palavras e em pseudopalavras).
// ============================================================================

(function (root) {
    'use strict';

    const REGRA_PERCENTIL = 'alto';   // 'alto' (manual, cap. 6) | 'baixo'

    const PCTS = [2.5, 7, 10, 16, 20, 30, 40, 50, 60, 70, 80, 90];
    const COL  = { 2.5: 'p2_5', 7: 'p7', 10: 'p10', 16: 'p16', 20: 'p20', 30: 'p30',
                   40: 'p40', 50: 'p50', 60: 'p60', 70: 'p70', 80: 'p80', 90: 'p90' };

    const GRUPOS = {
        cri_10_13:  { label: 'Crianças e adolescentes · 10 a 13 anos', curto: '10–13 anos',           tabela: '6.5', n: 35 },
        adu_ate5:   { label: 'Adultos · até 5 anos de estudo',          curto: 'Adultos, até 5 anos',  tabela: '6.6', n: 52 },
        adu_6_10:   { label: 'Adultos · 6 a 10 anos de estudo',         curto: 'Adultos, 6–10 anos',   tabela: '6.7', n: 58 },
        adu_11mais: { label: 'Adultos · 11 ou mais anos de estudo',     curto: 'Adultos, 11+ anos',    tabela: '6.8', n: 69 }
    };

    const MEDIDAS = [
        { key: 'palavras',       label: 'Palavras',                max: 48, bloco: 'palavras' },
        { key: 'regulares',      label: 'Regulares',               max: 24, bloco: 'palavras', sub: true },
        { key: 'irregulares',    label: 'Irregulares',             max: 24, bloco: 'palavras', sub: true },
        { key: 'curtas',         label: 'Curtas',                  max: 24, bloco: 'palavras', sub: true },
        { key: 'longas',         label: 'Longas',                  max: 24, bloco: 'palavras', sub: true },
        { key: 'frequentes',     label: 'Frequentes',              max: 24, bloco: 'palavras', sub: true },
        { key: 'nao_frequentes', label: 'Não frequentes',          max: 24, bloco: 'palavras', sub: true },
        { key: 'pseudo',         label: 'Pseudopalavras',          max: 24, bloco: 'pseudo' },
        { key: 'pseudo_curtas',  label: 'Pseudopalavras curtas',   max: 12, bloco: 'pseudo', sub: true },
        { key: 'pseudo_longas',  label: 'Pseudopalavras longas',   max: 12, bloco: 'pseudo', sub: true },
        { key: 'total',          label: 'Total TLPP',              max: 72, bloco: 'total' }
    ];

    const CLASSES = {
        grav:   { cod: 'grav',   nivel: 0, label: 'Déficit de gravidade importante',    cor: '#B91C1C' },
        mod:    { cod: 'mod',    nivel: 1, label: 'Déficit moderado a grave',           cor: '#DC2626' },
        def:    { cod: 'def',    nivel: 2, label: 'Déficit',                            cor: '#EA580C' },
        alerta: { cod: 'alerta', nivel: 3, label: 'Alerta para déficit',                cor: '#D97706' },
        esp:    { cod: 'esp',    nivel: 4, label: 'Escore esperado para a escolaridade', cor: '#16A34A' }
    };

    const TIPOS_ERRO = [
        { cod: 'paralexia_fonologica', label: 'Paralexia fonológica', curto: 'Paralexia fonol.',
          desc: 'Lê outra palavra da língua, fonologicamente parecida (adição, omissão, substituição ou inversão de sons), mantendo ao menos metade do estímulo.', ex: 'Terno → "Termo"' },
        { cod: 'paralexia_semantica', label: 'Paralexia semântica', curto: 'Paralexia semânt.',
          desc: 'Lê uma palavra semanticamente relacionada, mas formalmente distinta.', ex: 'Fermento → "Farinha"' },
        { cod: 'paralexia_semantico_fonologica', label: 'Paralexia semântico-fonológica', curto: 'Paralexia sem.-fonol.',
          desc: 'Lê uma palavra da língua parecida em som e em significado, mantendo ao menos 50% da original.', ex: 'Saxofone → "Sanfona"' },
        { cod: 'paralexia_morfemica', label: 'Paralexia morfêmica', curto: 'Paralexia morf.',
          desc: 'Lê outra palavra com morfemas em comum (muda sufixo/prefixo), mantendo a raiz.', ex: 'Carta → "Carteiro"' },
        { cod: 'paralexia_verbal', label: 'Paralexia verbal', curto: 'Paralexia verbal',
          desc: 'Lê outra palavra da língua sem relação semântica ou formal (mais da metade dos sons diferentes).', ex: 'Terno → "Letra"' },
        { cod: 'desconhecimento_regra', label: 'Desconhecimento de regra', curto: 'Desc. de regra',
          desc: 'Substitui ou omite sons cuja correspondência é regulada por regra do português (inclui nasais).', ex: 'Casa → "Cassa"; Zarronte → "Zaróte"' },
        { cod: 'regularizacao', label: 'Regularização', curto: 'Regularização',
          desc: 'Só em palavras irregulares: troca de som por outro possível para a mesma letra, ou tonicidade de "e"/"o".', ex: 'Taxímetro → "Tachímetro"; Gosma → "Gósma"' },
        { cod: 'acentuacao', label: 'Erro na pronúncia da acentuação', curto: 'Acentuação',
          desc: 'Erro na sílaba tônica ou desconsideração do acento gráfico.', ex: 'Jaula → "Jaúla"; Cárie → "Cariê"' },
        { cod: 'lexicalizacao', label: 'Lexicalização', curto: 'Lexicalização',
          desc: 'Lê a pseudopalavra como uma palavra real parecida (mantém 50% ou mais da estrutura).', ex: 'Teile → "Leite"; Jenala → "Janela"' },
        { cod: 'neologismo', label: 'Neologismo', curto: 'Neologismo',
          desc: 'Lê uma pseudopalavra mais de 50% diferente do alvo (no lugar de palavra ou de pseudopalavra).', ex: 'Fosaxone → "Forssene"; Cárie → "Corilo"' },
        { cod: 'substituicao', label: 'Substituição', curto: 'Substituição',
          desc: 'Substitui sons não presentes no alvo, mantendo mais de 50% da estrutura.', ex: 'Barba → "Borba"; Grade → "Grole"' },
        { cod: 'omissao', label: 'Omissão', curto: 'Omissão',
          desc: 'Omite sons do alvo, mantendo mais da metade da estrutura.', ex: 'Filho → "Filo"; Saxofone → "Safone"' },
        { cod: 'acrescimo', label: 'Acréscimo', curto: 'Acréscimo',
          desc: 'Acrescenta sons que não estão no alvo, mantendo mais de 50% da estrutura.', ex: 'Fermento → "Ferramento"; Taspobe → "Taspobre"' },
        { cod: 'inversao', label: 'Inversão', curto: 'Inversão',
          desc: 'Inverte (transpõe) sons, mantendo ao menos 50% do alvo.', ex: 'Divairo → "Divario"' },
        { cod: 'perseveracao', label: 'Perseveração', curto: 'Perseveração',
          desc: 'Repete palavra, pseudopalavra ou erro apresentado antes, no lugar do alvo.', ex: '"Safone" em Saxofone e em Fosaxone' },
        { cod: 'nao_resposta', label: 'Não resposta', curto: 'Não resposta',
          desc: 'Nenhuma tentativa de leitura do estímulo.', ex: '—' }
    ];

    const EFEITOS = [
        { key: 'regularidade',      label: 'Regularidade',             formula: '% regulares − % irregulares' },
        { key: 'frequencia',        label: 'Frequência',               formula: '% frequentes − % não frequentes' },
        { key: 'lexicalidade',      label: 'Lexicalidade',             formula: '% palavras − % pseudopalavras' },
        { key: 'extensao_palavras', label: 'Extensão (palavras)',      formula: '% curtas − % longas' },
        { key: 'extensao_pseudo',   label: 'Extensão (pseudopalavras)', formula: '% pseudo curtas − % pseudo longas' }
    ];

    // ── util ─────────────────────────────────────────────────────────────
    function chave(est) { return (est.tipo === 'pseudo' ? 'n' : 'p') + est.numero; }
    function fmtP(p) { return p === 2.5 ? '2,5' : String(p); }
    function pct(acertos, max) { return max ? (acertos / max) * 100 : 0; }
    function r1(x) { return Math.round(x * 10) / 10; }
    function r2(x) { return Math.round(x * 100) / 100; }

    function itemDe(itens, k) {
        const it = itens && itens[k];
        return { a: it && typeof it.a === 'boolean' ? it.a : null,
                 l: it && it.l ? String(it.l) : '',
                 e: it && Array.isArray(it.e) ? it.e.filter(c => TIPOS_ERRO.some(t => t.cod === c)) : [] };
    }

    // ── contagem ─────────────────────────────────────────────────────────
    function contar(itens, estimulos) {
        const c = { palavras: 0, regulares: 0, irregulares: 0, curtas: 0, longas: 0, frequentes: 0,
                    nao_frequentes: 0, pseudo: 0, pseudo_curtas: 0, pseudo_longas: 0, total: 0,
                    marcados: 0, nao_marcados: 0 };
        for (const est of estimulos) {
            const it = itemDe(itens, chave(est));
            if (it.a === null) { c.nao_marcados++; continue; }
            c.marcados++;
            if (!it.a) continue;
            c.total++;
            if (est.tipo === 'palavra') {
                c.palavras++;
                c[est.regularidade === 'regular' ? 'regulares' : 'irregulares']++;
                c[est.extensao === 'curta' ? 'curtas' : 'longas']++;
                c[est.frequencia === 'frequente' ? 'frequentes' : 'nao_frequentes']++;
            } else {
                c.pseudo++;
                c[est.extensao === 'curta' ? 'pseudo_curtas' : 'pseudo_longas']++;
            }
        }
        return c;
    }

    // ── percentil ────────────────────────────────────────────────────────
    function percentil(norma, x) {
        const vals = PCTS.map(p => Number(norma[COL[p]]));
        if (x < vals[0]) return { label: '< 2,5', baixo: 2.5, alto: 2.5, abaixo: true };
        const iguais = PCTS.filter((p, i) => vals[i] === x);
        if (iguais.length) {
            const lo = iguais[0], hi = iguais[iguais.length - 1];
            return { label: lo === hi ? fmtP(lo) : fmtP(lo) + ' - ' + fmtP(hi), baixo: lo, alto: hi };
        }
        if (x > vals[vals.length - 1]) return { label: '> 90', baixo: 90, alto: 90, acima: true };
        let i = 0;
        while (i + 1 < vals.length && vals[i + 1] < x) i++;
        return { label: fmtP(PCTS[i]) + ' - ' + fmtP(PCTS[i + 1]), baixo: PCTS[i], alto: PCTS[i + 1] };
    }

    // Tabela 6.2
    function classificar(p) {
        if (p == null) return null;
        if (p <= 2.5) return CLASSES.grav;
        if (p < 7)    return CLASSES.mod;
        if (p < 10)   return CLASSES.def;
        if (p < 25)   return CLASSES.alerta;
        return CLASSES.esp;
    }

    function z(norma, x) {
        const dp = Number(norma.dp);
        if (!dp) return null;
        return r2((x - Number(norma.media)) / dp);
    }

    // ── efeitos ──────────────────────────────────────────────────────────
    function efeitos(c) {
        const P = (k) => pct(c[k], MEDIDAS.find(m => m.key === k).max);
        return {
            regularidade:      r1(P('regulares') - P('irregulares')),
            frequencia:        r1(P('frequentes') - P('nao_frequentes')),
            lexicalidade:      r1(P('palavras') - P('pseudo')),
            extensao_palavras: r1(P('curtas') - P('longas')),
            extensao_pseudo:   r1(P('pseudo_curtas') - P('pseudo_longas'))
        };
    }

    // ── erros ────────────────────────────────────────────────────────────
    function erros(itens, estimulos) {
        const porTipo = {};
        for (const t of TIPOS_ERRO) porTipo[t.cod] = 0;
        const lista = [];
        let estimulosComErro = 0, total = 0;
        for (const est of estimulos) {
            const it = itemDe(itens, chave(est));
            if (it.a === false) estimulosComErro++;
            if (!it.e.length && it.a !== false && !it.l) continue;
            for (const cod of it.e) { porTipo[cod]++; total++; }
            lista.push({ tipo: est.tipo, numero: est.numero, estimulo: est.estimulo,
                         acerto: it.a, leitura: it.l, tipos: it.e.slice() });
        }
        return { por_tipo: porTipo, total, estimulos_com_erro: estimulosComErro, lista };
    }

    // ── cálculo completo ─────────────────────────────────────────────────
    // normas: array de linhas de tlpp_normas do grupo escolhido
    function calcular(itens, estimulos, normas, grupo) {
        const c = contar(itens, estimulos);
        const porMedida = {};
        for (const n of normas) if (n.grupo === grupo) porMedida[n.medida] = n;

        const escores = MEDIDAS.map(m => {
            const n = porMedida[m.key];
            const bruto = c[m.key];
            const out = { key: m.key, label: m.label, bloco: m.bloco, sub: !!m.sub, bruto, max: m.max,
                          pct: r1(pct(bruto, m.max)), percentil: null, p_baixo: null, p_alto: null,
                          z: null, media: null, dp: null, classificacao: null };
            if (n) {
                const p = percentil(n, bruto);
                out.percentil = p.label; out.p_baixo = p.baixo; out.p_alto = p.alto;
                out.media = Number(n.media); out.dp = Number(n.dp);
                out.z = z(n, bruto);
                out.classificacao = classificar(REGRA_PERCENTIL === 'alto' ? p.alto : p.baixo);
            }
            return out;
        });

        return { grupo, contagem: c, escores, efeitos: efeitos(c), erros: erros(itens, estimulos) };
    }

    // ── interpretação automática ─────────────────────────────────────────
    function fmtNum(x) { return String(x).replace('.', ','); }
    function sinal(x) { return (x > 0 ? '+' : '') + fmtNum(x); }

    function interpretar(res, ctx) {
        const nome = (ctx && ctx.nome) ? ctx.nome.split(' ')[0] : 'O(a) avaliando(a)';
        const g = GRUPOS[res.grupo];
        const E = {}; for (const e of res.escores) E[e.key] = e;
        const cls = (e) => e.classificacao ? e.classificacao.label.toLowerCase() : 'sem norma';
        const par = [];

        par.push(`Na Tarefa de Leitura de Palavras e Pseudopalavras (TLPP – ANELE-4), ${nome} obteve ${E.total.bruto} acertos em 72 estímulos ` +
                 `(${fmtNum(E.total.pct)}%), o que corresponde ao percentil ${E.total.percentil} no grupo normativo "${g.label}" (Tabela ${g.tabela}), ` +
                 `classificado como ${cls(E.total)} (Z = ${fmtNum(E.total.z)}). ` +
                 `Na leitura de palavras reais foram ${E.palavras.bruto}/48 acertos (percentil ${E.palavras.percentil}; ${cls(E.palavras)}) ` +
                 `e, nas pseudopalavras, ${E.pseudo.bruto}/24 (percentil ${E.pseudo.percentil}; ${cls(E.pseudo)}).`);

        const abaixo = res.escores.filter(e => e.sub && e.classificacao && e.classificacao.nivel <= 2);
        const alerta = res.escores.filter(e => e.sub && e.classificacao && e.classificacao.nivel === 3);
        const frase = (lista) => lista.map(e => `${e.label.toLowerCase()} (${e.bruto}/${e.max}, percentil ${e.percentil})`).join(', ');
        if (abaixo.length || alerta.length) {
            let t = 'Por categoria de estímulo, ';
            if (abaixo.length) t += `ficaram abaixo do esperado: ${frase(abaixo)}`;
            if (abaixo.length && alerta.length) t += '; ';
            if (alerta.length) t += `em alerta para déficit: ${frase(alerta)}`;
            t += '. As demais categorias situaram-se dentro do esperado para a escolaridade.';
            par.push(t);
        } else {
            par.push('Todas as categorias de estímulos (regulares, irregulares, curtas, longas, frequentes, não frequentes e pseudopalavras curtas e longas) situaram-se dentro do esperado para a escolaridade.');
        }

        const ef = res.efeitos;
        const desc = {
            regularidade:      'melhor leitura de palavras regulares do que de irregulares, o que pode indicar maior apoio na rota fonológica e dificuldade na rota lexical',
            frequencia:        'melhor leitura de palavras frequentes do que de não frequentes, sugerindo leitura apoiada predominantemente na rota lexical',
            lexicalidade:      'melhor leitura de palavras reais do que de pseudopalavras, o que pode indicar dificuldade na rota fonológica (conversão grafema-fonema)',
            extensao_palavras: 'melhor leitura de palavras curtas do que de longas, compatível com uso prioritário da rota fonológica e sobrecarga do buffer fonológico',
            extensao_pseudo:   'melhor leitura de pseudopalavras curtas do que de longas, compatível com sobrecarga do buffer fonológico na conversão grafema-fonema'
        };
        const ordenados = EFEITOS.map(e => ({ ...e, valor: ef[e.key] })).sort((a, b) => b.valor - a.valor);
        const acentuados = ordenados.filter(e => e.valor >= 10);
        const listaEf = EFEITOS.map(e => `${e.label.toLowerCase()} ${sinal(ef[e.key])}`).join('; ');
        let tEf = `Efeitos psicolinguísticos (diferença de porcentagem de acertos): ${listaEf}. `;
        if (acentuados.length) {
            const m = acentuados[0];
            tEf += `O efeito mais acentuado foi o de ${m.label.toLowerCase()} (${sinal(m.valor)} pontos percentuais): ${desc[m.key]}.`;
            if (acentuados.length > 1) {
                tEf += ` Também se destacou o efeito de ${acentuados.slice(1).map(e => `${e.label.toLowerCase()} (${sinal(e.valor)})`).join(' e ')}.`;
            }
        } else {
            tEf += 'Nenhum efeito se mostrou acentuado (todas as diferenças abaixo de 10 pontos percentuais).';
        }
        tEf += ' O manual não estabelece padrão normativo para os efeitos; a leitura é qualitativa e deve ser integrada aos tipos de erro e aos demais dados da avaliação.';
        par.push(tEf);

        const er = res.erros;
        const tipos = TIPOS_ERRO.map(t => ({ ...t, n: er.por_tipo[t.cod] })).filter(t => t.n > 0).sort((a, b) => b.n - a.n);
        if (tipos.length) {
            par.push(`Foram registrados ${er.total} erro(s) de leitura em ${er.estimulos_com_erro} estímulo(s) pontuado(s) como erro ` +
                     `(as primeiras tentativas autocorrigidas também entram na contagem). Tipos mais frequentes: ` +
                     tipos.slice(0, 4).map(t => `${t.label.toLowerCase()} (${t.n})`).join(', ') + '.');
        } else if (er.estimulos_com_erro) {
            par.push(`Foram pontuados ${er.estimulos_com_erro} estímulo(s) como erro, sem classificação do tipo de erro.`);
        } else {
            par.push('Não houve erros de leitura.');
        }

        par.push('Esses resultados devem ser correlacionados com os demais instrumentos da avaliação e com o histórico escolar e de saúde; a TLPP isoladamente não fundamenta diagnóstico de dislexia.');
        return par.join('\n\n');
    }

    root.TLPP_ENGINE = {
        REGRA_PERCENTIL, PCTS, GRUPOS, MEDIDAS, CLASSES, TIPOS_ERRO, EFEITOS,
        chave, itemDe, contar, percentil, classificar, z, efeitos, erros, calcular, interpretar
    };
})(typeof window !== 'undefined' ? window : globalThis);

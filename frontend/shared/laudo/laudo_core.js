/* ============================================================================
   CORTEX · Laudo Online — NÚCLEO  (frontend/shared/laudo/laudo_core.js)
   ----------------------------------------------------------------------------
   Formato cortex-laudo 2.0 (Documento 1):
     - catálogo de tipos de bloco e de vistas de resultado;
     - marcação dos textos ({nome}, {o|a}, [[pendência]], {{balão}}, **, *);
     - conversão do formato 1.0 do protótipo e geração de ids (§6, §14);
     - conferências do pacote/documento contra o banco (§10).
   Expõe: window.LaudoCore
   ============================================================================ */
(function () {
    'use strict';

    const FORMATO = 'cortex-laudo';
    const VERSOES_ACEITAS = ['1.0', '2.0'];
    const VERSAO_ATUAL = '2.0';
    const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

    const SECOES = [
        ['1', 'IDENTIFICAÇÃO', 'quem'], ['2', 'ANAMNESE', 'historia'], ['3', 'PROCEDIMENTOS E INSTRUMENTOS', 'como'],
        ['4', 'CLASSIFICAÇÃO GERAL DE QI', 'como'], ['5', 'ANÁLISE DOS RESULTADOS', 'achados'],
        ['6', 'SÍNTESE E INTEGRAÇÃO CLÍNICA', 'sintese'], ['7', 'MAPA DE DOMÍNIOS', 'mapa'],
        ['8', 'HIPÓTESE DIAGNÓSTICA', 'hipoteses'], ['9', 'CONCLUSÃO', 'conclusao'], ['10', 'ORIENTAÇÕES E ENCAMINHAMENTOS', 'passos'],
        ['11', 'FECHAMENTO', 'fim'], ['12', 'REFERÊNCIAS BIBLIOGRÁFICAS', 'fim'], ['13', 'REFERÊNCIAS NORMATIVAS', 'fim']
    ];
    const SECOES_DO_GERADOR = ['1', '2', '3', '5', '6', '7', '8', '9', '10', '12'];

    /** Tipos de bloco do formato 2.0 (Documento 1, §5.2). */
    const TIPOS = {
        titulo: 'Título', paragrafo: 'Parágrafo', lista: 'Lista', meta: 'Linha de norma', nota: 'Nota', alerta: 'Alerta', caixa: 'Caixa',
        campos: 'Identificação', tabela_instrumentos: 'Instrumentos', fidedignidade: 'Fidedignidade', hipotese: 'Hipótese',
        afastada: 'Hipótese afastada', mapa: 'Mapa de domínios', referencias: 'Referências',
        resultado: 'Resultado de teste', tabela: 'Tabela', imagem: 'Imagem',
        cracha: 'Crachá', acompanhe: 'QR Acompanhe', classificacao_qi: 'Classificação de QI', padrao: 'Texto padrão',
        local_data: 'Local e data', assinatura: 'Assinatura', convite: 'Convite',
        quebra_pagina: 'Quebra de página', espaco: 'Espaço'
    };

    /** Vistas de resultado (Documento 1, §5.3). */
    const VISTAS = {
        'WAIS-III': ['cabecalho', 'indice', 'qit_icg', 'perfil_subtestes', 'intervalos', 'discrepancias', 'tabela_subtestes', 'resumo', 'figura'],
        'WISC-IV': ['cabecalho', 'indice', 'qit_icg', 'perfil_subtestes', 'intervalos', 'discrepancias', 'tabela_subtestes', 'resumo', 'figura'],
        'RAVLT': ['cabecalho', 'cartao', 'curva', 'tabela', 'resumo', 'figura'],
        'FDT': ['cabecalho', 'cartao', 'barras', 'tabela', 'resumo', 'figura'],
        'BFP': ['cabecalho', 'cartao', 'fatores', 'facetas', 'resumo', 'figura'],
        // escalas e demais testes: as vistas do Gerador + 'figura' (bloco capturado da tela de correção)
        '_escala': ['cabecalho', 'cartao', 'regua', 'subescalas', 'tabela', 'resumo', 'figura']
    };
    const SIGLAS_DO_CORTEX = ['WAIS-III', 'WISC-IV', 'RAVLT', 'FDT', 'BFP'];
    // Siglas que o Gerador escreve → teste do catálogo do CORTEX (telas de resultados lançados, LO-7).
    // "parte" escolhe, entre as figuras da tela, as que são daquele teste (TEACO/TEADI/TEALT é uma tela só).
    const EQUIVALENTES = {
        'TEACO-2': { sigla: 'TEACO/TEADI/TEALT', parte: 'TEACO' }, 'TEACO': { sigla: 'TEACO/TEADI/TEALT', parte: 'TEACO' }, 'TEACO-FF': { sigla: 'TEACO/TEADI/TEALT', parte: 'TEACO' },
        'TEADI-2': { sigla: 'TEACO/TEADI/TEALT', parte: 'TEADI' }, 'TEADI': { sigla: 'TEACO/TEADI/TEALT', parte: 'TEADI' },
        'TEALT-2': { sigla: 'TEACO/TEADI/TEALT', parte: 'TEALT' }, 'TEALT': { sigla: 'TEACO/TEADI/TEALT', parte: 'TEALT' },
        'TOL-BR': { sigla: 'TORRE DE LONDRES' }, 'TOL': { sigla: 'TORRE DE LONDRES' }, 'TORRE': { sigla: 'TORRE DE LONDRES' },
        'CPM': { sigla: 'CPM-RAVEN' }, 'RAVEN': { sigla: 'CPM-RAVEN' }, 'CPM RAVEN': { sigla: 'CPM-RAVEN' },
        'BETA III': { sigla: 'BETA-III' }, 'BETA-3': { sigla: 'BETA-III' }, 'TDE II': { sigla: 'TDE-II' }, 'TDE-2': { sigla: 'TDE-II' },
        'TAVIS 4': { sigla: 'TAVIS-4' }, 'BPA2': { sigla: 'BPA-2' }, 'PROTEA-R': { sigla: 'PROTEA-R-NV' }, 'PROTEA': { sigla: 'PROTEA-R-NV' }, 'TEPIC-M': { sigla: 'TEPIC-M-2' }, 'TEPIC M 2': { sigla: 'TEPIC-M-2' }, 'IHS2': { sigla: 'IHS-2' }, 'IHS': { sigla: 'IHS-2' }
    };
    // Testes corrigidos fora do CORTEX: o Gerador manda os números em "lancados" e o CORTEX
    // preenche a tela do teste sozinho (LO-7). Códigos das medidas de cada tela.
    const LANCADOS = {
        'BETA-III': ['rm', 'cod', 'qi'],
        'BPA-2': ['AC', 'AD', 'AA', 'AG'],
        'TAVIS-4': ['t1', 't2', 't3'].flatMap(t => ['acertos', 'omissoes', 'acao', 'tr'].map(m => `${t}_${m}`)),
        'TEPIC-M-2': ['total'],
        'TORRE DE LONDRES': ['planejamento'],
        'TEACO/TEADI/TEALT': ['teaco', 'teadi', 'tealt'],
        'TDE-II': ['escrita', 'aritmetica', 'leitura'],
        'CPM-RAVEN': ['a', 'ab', 'b', 'total'],
        'IHS-2': ['total', 'f1', 'f2', 'f3', 'f4', 'f5'],
        'BDEFS': ['tempo', 'organizacao', 'autocontrole', 'motivacao', 'emocoes', 'total', 'sintomas', 'tdah'],
        'IDADI': ['cognitivo', 'socioemocional', 'receptiva', 'expressiva', 'motora_ampla', 'motora_fina', 'adaptativo'],
        'PROTEA-R-NV': ['interesse', 'respostas', 'interacao', 'brincadeira', 'motora', 'repetitivos'],
        'SON-R': ['categorias', 'mosaicos', 'analogias', 'padroes', 'situacoes', 'raciocinio', 'execucao', 'qi']
    };
    const slugSig = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    /** Sigla do CORTEX, entre `disponiveis`, para a sigla escrita pelo Gerador: igual, equivalente
     *  ou com o mesmo começo (ex.: "SON-R 6-40" ↔ "SON-R"). */
    function siglaNoCortex(sig, disponiveis) {
        const lista = Array.from(disponiveis || []);
        if (lista.includes(sig)) return sig;
        const eq = equivalente(sig);
        if (eq && lista.includes(eq.sigla)) return eq.sigla;
        const a = slugSig(eq ? eq.sigla : sig);
        if (a.length < 4) return null;
        return lista.find(x => { const b = slugSig(x); return b.length >= 4 && (a.startsWith(b) || b.startsWith(a)); }) || null;
    }
    /** Códigos das medidas da tela de resultados lançados desse teste (ou null). */
    function modeloLancado(sigla) { const k = siglaNoCortex(sigla, Object.keys(LANCADOS)); return k ? LANCADOS[k] : null; }
    /** Teste do CORTEX que corresponde à sigla escrita pelo Gerador ({ sigla, parte } ou null). */
    function equivalente(sig) { return EQUIVALENTES[sig] || EQUIVALENTES[String(sig || '').toUpperCase()] || null; }
    function vistasDe(sigla) { return VISTAS[sigla] || VISTAS._escala; }

    const NOMES_INDICE = {
        ICV: 'Índice de Compreensão Verbal', IOP: 'Índice de Organização Perceptual', IMO: 'Índice de Memória Operacional',
        IVP: 'Índice de Velocidade de Processamento', QI_TOTAL: 'QI Total', QI_VERBAL: 'QI Verbal', QI_EXECUCAO: 'QI de Execução', ICG: 'Índice de Capacidade Geral'
    };
    const FATORES_BFP = { N: 'Neuroticismo', E: 'Extroversão', S: 'Socialização', R: 'Realização', A: 'Abertura' };

    // ── Utilidades ────────────────────────────────────────────────────────────
    function esc(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function slug(s) {
        return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
            .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'secao';
    }
    function aleatorio(n) {
        const a = 'abcdefghijkmnpqrstuvwxyz23456789'; let s = '';
        const buf = (window.crypto && crypto.getRandomValues) ? crypto.getRandomValues(new Uint8Array(n)) : Array.from({ length: n }, () => Math.random() * 256);
        for (let i = 0; i < n; i++) s += a[buf[i] % a.length];
        return s;
    }
    function clonar(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }

    /** Faixa canônica de 4 cores. "Médio Inferior" é testado antes de "Médio". */
    function faixa(label) {
        const t = String(label || '').toLowerCase();
        if (/m[ée]di[oa] inferior|limítrofe inferior/.test(t)) return 'mi';
        if (/inferior|limítrofe|deficitário|extremamente baixo|dificuldade acentuada|positivo|baixo/.test(t)) return 'inf';
        if (/superior|alto/.test(t)) return 'sup';
        if (/m[ée]di[oa]|típico|normal|negativo/.test(t)) return 'med';
        return null;
    }
    // ── Células de tabela: cor de fundo pela classificação, cor do texto e negrito ──
    // Marcas no começo do texto da célula: {sup} {med} {mi} {inf} (fundo), {neutro} (sem cor
    // mesmo na coluna de classificação), {cor:verde|…|#rrggbb} (texto), {bg:#rrggbb} (fundo livre) e {b}.
    const CORES_TEXTO = { verde: '#15803D', azul: '#1D4ED8', ambar: '#A16207', laranja: '#C2410C', vermelho: '#B91C1C', roxo: '#6D28D9', cinza: '#64748B' };
    // azuis do padrão Equilibrium (os mesmos dos laudos em Word)
    const CORES_PADRAO = ['#2E75B6', '#1F4E79', '#1F3864'];
    const corCss = c => !c ? null : (CORES_TEXTO[c] || (/^#[0-9a-fA-F]{6}$/.test(c) ? c : null));
    function lerCelula(txt) {
        let s = String(txt == null ? '' : txt);
        const o = { fundo: null, cor: null, bg: null, negrito: false };
        for (;;) {
            const m = /^\{(sup|med|mi|inf|neutro|b|cor:(?:[a-z]+|#[0-9a-fA-F]{6})|bg:#[0-9a-fA-F]{6})\}\s*/.exec(s);
            if (!m) break;
            if (m[1] === 'b') o.negrito = true;
            else if (m[1].startsWith('cor:')) o.cor = corCss(m[1].slice(4)) ? m[1].slice(4) : null;
            else if (m[1].startsWith('bg:')) o.bg = m[1].slice(3);
            else o.fundo = m[1];
            s = s.slice(m[0].length);
        }
        o.texto = s;
        return o;
    }
    function escreverCelula(o) {
        return `${o.fundo ? `{${o.fundo}}` : ''}${o.bg ? `{bg:${o.bg}}` : ''}${o.cor ? `{cor:${o.cor}}` : ''}${o.negrito ? '{b}' : ''}${o.texto || ''}`;
    }
    /** Colunas pintadas pela classificação: as escolhidas, ou as de título classificação/faixa/resultado. */
    function colunasColoridas(b) {
        if (Array.isArray(b.colorir)) return b.colorir;
        return (b.cabecalho || []).map((h, k) => /classifica|faixa|resultado|interpreta/i.test(String(h)) ? k : -1).filter(k => k >= 0);
    }
    /** { fundo, selo, css, texto } de uma célula (k = índice da coluna). */
    function celulaTabela(b, txt, k) {
        const c = lerCelula(txt);
        let f = c.fundo;
        if (f === 'neutro') f = null;
        else if (!f && colunasColoridas(b).includes(k)) f = faixa(c.texto);
        if (c.bg) f = null;                       // fundo livre vence a cor da classificação
        const css = [corCss(c.cor) ? `color:${corCss(c.cor)}` : '', c.bg ? `background:${c.bg}` : '', c.negrito ? 'font-weight:700' : ''].filter(Boolean).join(';');
        return { fundo: f, selo: !!f && b.estilo_classif === 'selo', css, texto: c.texto, bg: c.bg };
    }

    // ── Classificação Geral de QI no padrão das Ferramentas de Laudo (linha inteira colorida) ──
    const QI_TONS = { sup: 'verde', med: 'azul', mi: 'ambar', inf: 'vermelho' };
    const QI_ABRE = '<table class="qi2"><thead><tr><th>% Pop.</th><th>Percentil</th><th>QI / Escore</th><th>Classificação Científica</th><th>Interpretação Clínica</th></tr></thead><tbody>';
    function qiLinha(f) {
        const tom = QI_TONS[faixa(f[3])] || 'azul';
        return `<tr class="qi2-${tom}">${[0, 1, 2, 3, 4].map(i => `<td${i === 2 || i === 3 ? ' class="forte"' : ''}>${esc(f[i] == null ? '' : f[i])}</td>`).join('')}</tr>`;
    }

    function idadeTexto(nasc, ref) {
        if (!nasc) return '[[idade a confirmar]]';
        const [y, m, d] = String(nasc).slice(0, 10).split('-').map(Number);
        const [ry, rm, rd] = String(ref || new Date().toISOString()).slice(0, 10).split('-').map(Number);
        let anos = ry - y, meses = rm - m;
        if (rd < d) meses -= 1;
        if (meses < 0) { anos -= 1; meses += 12; }
        return `${anos} anos${meses ? ` e ${meses} ${meses === 1 ? 'mês' : 'meses'}` : ''}`;
    }
    const dataBR = iso => iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '';
    function dataExtenso(iso) { const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number); return `${d} de ${MESES[m - 1]} de ${y}`; }
    function mesAno(iso) { const [y, m] = String(iso || new Date().toISOString()).slice(0, 10).split('-').map(Number); return `${MESES[m - 1].charAt(0).toUpperCase() + MESES[m - 1].slice(1)} de ${y}`; }
    function iniciais(nome) { const p = String(nome || '').trim().split(/\s+/).filter(Boolean); return ((p[0] || '')[0] || '') + ((p.length > 1 ? p[p.length - 1] : '')[0] || ''); }
    function feminino(p) { return /^f/i.test(String((p || {}).sexo || '')); }

    /** Contexto do paciente para resolver variáveis. */
    function contexto(banco, meta) {
        const p = (banco && banco.paciente) || {};
        const ref = p.data_inicio_avaliacao || (meta && meta.data_emissao) || null;
        return {
            paciente: p,
            nome: p.nome_completo || '',
            primeiroNome: String(p.nome_completo || '').trim().split(/\s+/)[0] || '',
            idade: idadeTexto(p.data_nascimento, ref),
            fem: feminino(p)
        };
    }

    // ── Marcação (Documento 1, §7) ────────────────────────────────────────────
    /** Variáveis → texto. Mantém {{balões}}, [[pendências]] e **negrito**. */
    function variaveis(txt, ctx) {
        ctx = ctx || {};
        let s = String(txt == null ? '' : txt);
        const balões = [];
        s = s.replace(/\{\{[\s\S]+?\}\}/g, m => { balões.push(m); return `\u0000${balões.length - 1}\u0000`; });
        s = s.replace(/\{primeiro_nome\}/g, ctx.primeiroNome || '').replace(/\{nome\}/g, ctx.nome || '').replace(/\{idade\}/g, ctx.idade || '');
        s = s.replace(/\{([^{}|\u0000]*)\|([^{}|\u0000]*)\}/g, (m, mas, fem) => (ctx.fem ? fem : mas));
        s = s.replace(/\u0000(\d+)\u0000/g, (m, i) => balões[Number(i)]);
        return s;
    }
    /** Texto com marcação → HTML seguro. */
    function inline(txt, ctx, opcoes) {
        opcoes = opcoes || {};
        let s = esc(variaveis(txt, ctx));
        s = s.replace(/\{\{([^{}|]+?)(?:\|([^{}]+?))?\}\}/g, (m, termo, extra) => {
            const t = termo.trim();
            if (opcoes.impressao) return t;
            return `<span class="lo-termo" tabindex="0" data-termo="${t}"${extra ? ` data-texto="${extra.trim()}"` : ''}>${t}</span>`;
        });
        s = s.replace(/\[\[(.+?)\]\]/g, '<span class="lo-pend" data-pend="1">$1</span>');
        s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        s = s.replace(/(^|[^\w*])\*(?=\S)([^*]+?)\*(?!\w)/g, '$1<em>$2</em>');
        return s;
    }
    /** Texto puro, sem marcação. */
    function plano(txt, ctx) {
        return variaveis(txt, ctx).replace(/\{\{([^{}|]+?)(?:\|[^{}]+?)?\}\}/g, '$1').replace(/\[\[(.+?)\]\]/g, '$1')
            .replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1');
    }
    function textos(o, out) {
        out = out || [];
        if (typeof o === 'string') out.push(o);
        else if (Array.isArray(o)) o.forEach(x => textos(x, out));
        else if (o && typeof o === 'object') Object.keys(o).forEach(k => { if (k !== 'id' && k !== 'nota_interna') textos(o[k], out); });
        return out;
    }

    // ── Ids (Documento 1, §6) ─────────────────────────────────────────────────
    const LETRA = { titulo: 't', paragrafo: 'p', resultado: 'r', lista: 'l', hipotese: 'h' };
    function ancoraDoTitulo(texto) {
        let t = String(texto || '').replace(/\{#([^}]+)\}/, '').trim();
        const m = /\{#([^}]+)\}/.exec(String(texto || ''));
        if (m) return slug(m[1]);
        t = t.replace(/^\d+(\.\d+)*\s*/, '');
        const cabeca = t.split(/\s+[—–-]\s+/)[0].trim();
        if (/^[A-Z0-9][A-Z0-9-]{1,}$/.test(cabeca) && /[A-Z]/.test(cabeca)) return slug(cabeca);
        return slug(t);
    }
    /** Preenche ids que faltam e corrige repetidos, sem mudar ids existentes válidos. */
    function garantirIds(doc) {
        const usados = new Set();
        (doc.secoes || []).forEach(sec => (sec.blocos || []).forEach(b => { if (b && b.id) { if (usados.has(b.id)) b._dup = true; else usados.add(b.id); } }));
        (doc.secoes || []).forEach(sec => {
            const n = String(sec.n || '').trim() || 'x';
            if (!sec.id) sec.id = SECOES.some(s => s[0] === n) ? 's' + n : 'sx-' + aleatorio(5);
            let ancora = 'abre';
            const cont = {};
            (sec.blocos || []).forEach(b => {
                if (!b) return;
                if (b.tipo === 'titulo' && Number(b.nivel || 3) === 3) {
                    ancora = b.ancora ? slug(b.ancora) : ancoraDoTitulo(b.texto);
                    if (!b.ancora) b.ancora = ancora;
                }
                if (b.id && !b._dup) return;
                delete b._dup;
                const letra = LETRA[b.tipo] || 'x';
                const chave = ancora + '|' + letra;
                let id;
                do {
                    cont[chave] = (cont[chave] || 0) + 1;
                    id = `s${n}.${ancora}.${letra}${String(cont[chave]).padStart(2, '0')}`;
                } while (usados.has(id));
                b.id = id; usados.add(id);
            });
        });
        return doc;
    }

    /** Campos comuns de todo bloco (§5.1). */
    function completarBloco(b, origemPadrao) {
        if (!b.origem) b.origem = origemPadrao || 'gerador';
        if (!b.exibir) b.exibir = 'ambos';
        if (b.oculto == null) b.oculto = false;
        if (b.quebra_antes == null) b.quebra_antes = false;
        if (b.manter_com_proximo == null) b.manter_com_proximo = b.tipo === 'titulo';
        if (!Array.isArray(b.complementos)) b.complementos = [];
        if (b.nota_interna === undefined) b.nota_interna = null;
        return b;
    }

    // ── Conversão 1.0 → 2.0 (Documento 1, §14) ───────────────────────────────
    const STATUS_INSTR_1 = { '🟢': 'fundamental', '⚪': 'a_confirmar', '🟠': 'complementar', '🟡': 'complementar', '🔴': 'sem_peso' };
    const STATUS_MAPA_1 = { '🟢': 'preservado', '⚠️': 'atencao', '⚠': 'atencao', '🔴': 'comprometido' };
    function bloco1para2(b) {
        switch (b.tipo) {
            case 'lista_numerada': return { tipo: 'lista', estilo: 'numerada', itens: b.itens || [] };
            case 'tabela_manual': return { tipo: 'tabela', cabecalho: b.cabecalho || [], linhas: b.linhas || [], nota: b.nota || null };
            case 'resultado': {
                const r = { tipo: 'resultado', sigla: b.sigla, vista: b.vista, opcoes: Object.assign({}, b.opcoes || {}) };
                if (b.indice) r.opcoes.indice = b.indice;
                return r;
            }
            case 'tabela_instrumentos': return {
                tipo: 'tabela_instrumentos',
                linhas: (b.linhas || []).map(l => Array.isArray(l)
                    ? { sigla: String(l[0] || '').split(' — ')[0].trim(), nome: l[0], dominio: l[1], status: STATUS_INSTR_1[l[2]] || 'fundamental' }
                    : l)
            };
            case 'hipotese': {
                const partes = String(b.codigos || '').split('|').map(x => x.trim()).filter(Boolean);
                let confianca = null; const codigos = [];
                partes.forEach(p => { const m = /n[íi]vel de confian[çc]a:\s*(\w+)/i.exec(p); if (m) confianca = m[1].toUpperCase(); else codigos.push(p); });
                return Object.assign({}, b, { rotulo: b.rotulo || 'principal', codigos, confianca: confianca || b.confianca || null });
            }
            case 'mapa': return {
                tipo: 'mapa',
                linhas: (b.linhas || []).map(l => Array.isArray(l)
                    ? { status: STATUS_MAPA_1[l[0]] || 'atencao', dominio: l[1], desempenho: l[2], instrumentos: l[3], ancora: l[4] || null }
                    : l)
            };
            default: return Object.assign({}, b);
        }
    }
    function converter1para2(p) {
        const novo = {
            formato: FORMATO, versao_formato: VERSAO_ATUAL, tipo: 'pacote',
            origem: { motor: p.motor || (p.origem || {}).motor || null, gerado_em: p.gerado_em || (p.origem || {}).gerado_em || null, convertido_de: '1.0' },
            paciente_ref: p.paciente_ref, meta: clonar(p.meta || {}), inventario: clonar(p.inventario || []),
            conferencia: clonar(p.conferencia || {}), secoes: []
        };
        (p.secoes || []).forEach(s => {
            const blocos = [];
            const campos = [];
            (s.blocos || []).forEach(b => {
                if (b.tipo === 'campo') { campos.push({ rotulo: b.rotulo, valor: b.valor }); return; }
                blocos.push(bloco1para2(b));
            });
            if (campos.length) blocos.unshift({ tipo: 'campos', linhas: campos });
            novo.secoes.push({ n: String(s.n), blocos });
        });
        return novo;
    }

    /** Lê o texto colado/arquivo e devolve { pacote } ou { erro }. Não valida paciente. */
    function lerPacote(texto) {
        let p;
        try { p = typeof texto === 'string' ? JSON.parse(texto.replace(/^\uFEFF/, '')) : clonar(texto); }
        catch (e) { return { erro: 'O conteúdo não é um JSON válido. Cole o arquivo .cortex.json inteiro, sem cortar.' }; }
        if (!p || typeof p !== 'object' || Array.isArray(p)) return { erro: 'O arquivo não é um pacote de laudo.' };
        if (p.formato !== FORMATO) return { erro: `Formato não reconhecido. Esperado "${FORMATO}".` };
        if (!VERSOES_ACEITAS.includes(String(p.versao_formato))) return { erro: `Versão ${p.versao_formato} do formato ainda não é conhecida por este CORTEX.` };
        const original = clonar(p);
        if (String(p.versao_formato) === '1.0') p = converter1para2(p);
        p.tipo = p.tipo || 'pacote';
        p.secoes = (p.secoes || []).map(s => {
            const sec = Object.assign({}, s, { n: String(s.n != null ? s.n : (s.id || '').replace(/^s/, '')) });
            sec.blocos = (s.blocos || []).filter(Boolean).map(b => completarBloco(Object.assign({}, b), 'gerador'));
            return sec;
        });
        garantirIds(p);
        return { pacote: p, original };
    }

    // ── Percorrer blocos ──────────────────────────────────────────────────────
    function cadaBloco(doc, fn) {
        (doc.secoes || []).forEach(sec => (sec.blocos || []).forEach((b, i) => fn(b, sec, i)));
    }
    function blocosDoTipo(doc, tipo) { const out = []; cadaBloco(doc, b => { if (b.tipo === tipo) out.push(b); }); return out; }

    // ── Conferências (Documento 1, §10) ───────────────────────────────────────
    // nivel: 'bloqueia' | 'importante' | 'atencao' | 'info' | 'ok'
    function validar(doc, banco, opcoes) {
        opcoes = opcoes || {};
        const checks = [];
        const add = (id, grupo, titulo, nivel, detalhe, itens) => checks.push({ id, grupo, titulo, nivel, detalhe, itens: itens || [] });
        doc = doc || {};
        banco = banco || {};
        const p = banco.paciente || {};
        const pacoteBruto = opcoes.pacote || doc;

        // Formato
        if (doc.formato !== FORMATO || !VERSOES_ACEITAS.includes(String(doc.versao_formato)))
            add('formato', 'Arquivo', 'Formato do pacote', 'bloqueia', `Esperado "${FORMATO}" versão 2.0.`);
        else add('formato', 'Arquivo', 'Formato e versão', 'ok', `${doc.formato} ${doc.versao_formato}${(doc.origem || {}).motor ? ` · motor ${doc.origem.motor}` : ''}`);

        // Paciente
        if (!p.codigo) add('paciente', 'Paciente', 'Paciente do pacote', 'bloqueia', 'Este paciente ainda não tem código no CORTEX.');
        else if (doc.paciente_ref !== p.codigo)
            add('paciente', 'Paciente', 'Paciente do pacote', 'bloqueia', `O pacote é de ${doc.paciente_ref || '(sem código)'}; a pasta aberta é ${p.codigo}.`);
        else add('paciente', 'Paciente', 'Paciente do pacote', 'ok', `${p.codigo} confere com a pasta aberta.`);

        // Identificação dentro do arquivo
        const bruto = JSON.stringify(pacoteBruto.secoes || []).toLowerCase();
        const vazou = [];
        const partes = String(p.nome_completo || '').trim().split(/\s+/).filter(x => x.length > 1);
        if (p.nome_completo && bruto.includes(String(p.nome_completo).toLowerCase())) vazou.push('nome completo');
        else if (partes.length > 1 && partes.slice(1).some(s => bruto.includes((partes[0] + ' ' + s).toLowerCase()))) vazou.push('nome e sobrenome');
        const cpf = String(p.cpf || '').replace(/\D/g, '');
        if (cpf.length === 11 && JSON.stringify(pacoteBruto.secoes || []).replace(/\D/g, ' ').includes(cpf)) vazou.push('CPF');
        add('identificacao', 'Paciente', 'Sem identificação no arquivo', vazou.length ? 'importante' : 'ok',
            vazou.length ? `O pacote contém ${vazou.join(', ')}. O Gerador deve usar {nome} e {primeiro_nome}.` : 'O texto usa {nome} e {primeiro_nome}; nada identificável no arquivo.');

        // Inventário × testes corrigidos
        const inv = doc.inventario || [];
        const corrigidas = new Set((banco.aplicacoes || []).filter(a => a.corrigida).map(a => a.sigla));
        Object.keys(banco.resultados || {}).forEach(s => { if (!(banco.resultados[s] || {}).erro) corrigidas.add(s); });
        const AP = (window.LaudoEscalas && window.LaudoEscalas.APELIDOS) || {};
        Object.keys(AP).forEach(ap => { if (AP[ap].some(s => corrigidas.has(s))) corrigidas.add(ap); });
        const faltam = inv.filter(sig => !corrigidas.has(sig) && !siglaNoCortex(sig, corrigidas));
        add('inventario', 'Testes', 'Inventário × testes corrigidos', faltam.length ? 'atencao' : 'ok',
            faltam.length ? `Sem aplicação corrigida no CORTEX: ${faltam.join(', ')}.` : `${inv.length} de ${inv.length} instrumentos corrigidos neste paciente.`, faltam);

        // Números do texto × banco
        const conf = doc.conferencia || {};
        let total = 0; const div = []; const adiadas = [];
        Object.keys(conf).forEach(sig => Object.keys(conf[sig] || {}).forEach(k => {
            // Escala sem leitor no Laudo Online (ou teste fora do CORTEX): só informação.
            const res = (banco.resultados || {})[sig];
            const temLeitor = window.LaudoEscalas && (window.LaudoEscalas.leitor(sig) || (window.LaudoEscalas.APELIDOS[sig] || []).some(x => window.LaudoEscalas.leitor(x) && (banco.resultados || {})[x]));
            if (!SIGLAS_DO_CORTEX.includes(sig) && !res && !temLeitor) { adiadas.push(`${sig} ${k}`); return; }
            const v = window.LaudoDados ? window.LaudoDados.valor(sig, k, banco) : undefined;
            // escala lida, mas sem esse número (ex.: percentil que a tela não calcula): fica sem conferência
            if (res && res.tipo === 'escala' && v === undefined) { adiadas.push(`${sig} ${k}`); return; }
            total++;
            if (v === undefined || v === null || Number(v) !== Number(conf[sig][k])) div.push({ sigla: sig, chave: k, pacote: conf[sig][k], banco: v == null ? null : v });
        }));
        add('conferencia', 'Testes', 'Números do texto × banco', div.length ? 'importante' : (total ? 'ok' : 'atencao'),
            div.length ? div.map(d => `${d.sigla} ${d.chave}: texto diz ${d.pacote}, banco tem ${d.banco == null ? '—' : d.banco}`).join(' · ')
                : (total ? `${total} de ${total} números conferem com o banco.` : 'O pacote não trouxe números de testes corrigidos no CORTEX para conferir.'), div);
        if (adiadas.length)
            add('conferencia_escalas', 'Testes', 'Números sem conferência', 'info',
                `Testes fora do CORTEX ou escalas ainda sem leitura no Laudo Online; o número fica como o Gerador escreveu: ${adiadas.join(', ')}.`, adiadas);

        // Resultados de testes de fora que o pacote traz (preenchem as telas dos testes)
        const lanc = pacoteBruto.lancados && typeof pacoteBruto.lancados === 'object' ? Object.keys(pacoteBruto.lancados) : [];
        if (lanc.length) {
            const naBateria = (banco.aplicacoes || []).map(a => a.sigla);
            const fora = lanc.filter(s => !siglaNoCortex(s, naBateria));
            const semTela = lanc.filter(s => !modeloLancado(s));
            const codigos = [];
            lanc.forEach(s => { const m = (pacoteBruto.lancados[s] || {}).medidas, ok = modeloLancado(s); if (m && ok) Object.keys(m).filter(k => !ok.includes(k)).forEach(k => codigos.push(`${s}.${k}`)); });
            add('lancados', 'Testes', 'Resultados dos testes de fora', fora.length || semTela.length || codigos.length ? 'atencao' : 'ok',
                [`O pacote traz os resultados de ${lanc.join(', ')}; ao montar, o CORTEX preenche a tela de cada teste.`,
                    fora.length ? `Não estão na bateria do paciente (inclua para gerar as tabelas): ${fora.join(', ')}.` : '',
                    semTela.length ? `Sem tela de resultados no CORTEX: ${semTela.join(', ')}.` : '',
                    codigos.length ? `Códigos de medida que a tela não conhece (ficam de fora): ${codigos.join(', ')}.` : ''].filter(Boolean).join(' '), fora);
        }

        // Pendências
        const pend = [];
        cadaBloco(doc, (b, sec) => textos(b).forEach(t => (String(t).match(/\[\[(.+?)\]\]/g) || [])
            .forEach(x => pend.push({ secao: sec.n, bloco: b.id, texto: x.slice(2, -2) }))));
        if (!doc.meta || !doc.meta.validade) pend.push({ secao: '11', bloco: null, texto: 'prazo de validade' });
        add('pendencias', 'Texto', 'Campos a confirmar', pend.length ? 'atencao' : 'ok',
            pend.length ? pend.map(x => `Seção ${x.secao}: ${x.texto}`).join(' · ') : 'Nenhum campo pendente.', pend);

        // Termos vedados (fora da Nota 8.1)
        const vedados = [];
        cadaBloco(doc, b => {
            if (b.tipo === 'padrao' && b.chave === 'nota_tecnica_81') return;
            const t = textos(b).join(' ');
            if (/\bADOS\b/.test(t)) vedados.push({ bloco: b.id, termo: 'ADOS' });
            if (/médico assistente/i.test(t)) vedados.push({ bloco: b.id, termo: '"médico assistente"' });
        });
        add('vedados', 'Texto', 'Termos vedados', vedados.length ? 'importante' : 'ok',
            vedados.length ? Array.from(new Set(vedados.map(v => v.termo))).join('; ') + ' fora da Nota 8.1.' : 'Nenhum termo vedado.', vedados);

        // Seção 8
        const s8 = (doc.secoes || []).find(s => String(s.n) === '8' || s.id === 's8');
        const b8 = (s8 && s8.blocos) || [];
        const temPrincipal = b8.some(b => b.tipo === 'hipotese' && (b.rotulo || 'principal') === 'principal');
        const temAfastada = b8.some(b => b.tipo === 'afastada');
        add('secao8', 'Estrutura', 'Hipótese principal e afastadas', temPrincipal && temAfastada ? 'ok' : 'atencao',
            temPrincipal && temAfastada ? 'A Seção 8 tem hipótese principal e hipóteses afastadas.'
                : `Falta ${[!temPrincipal && 'hipótese principal (8.2)', !temAfastada && 'hipóteses afastadas (8.6)'].filter(Boolean).join(' e ')}.`);

        // Tipos e vistas
        const desconhecidos = [];
        cadaBloco(doc, b => {
            if (b.tipo === 'conteudo_gerador') return;
            if (!TIPOS[b.tipo]) desconhecidos.push(`bloco "${b.tipo}" (${b.id})`);
            else if (b.tipo === 'resultado' && !vistasDe(b.sigla).includes(b.vista)) desconhecidos.push(`vista "${b.vista}" de ${b.sigla} (${b.id})`);
        });
        add('tipos', 'Estrutura', 'Tipos de bloco e vistas', desconhecidos.length ? 'atencao' : 'ok',
            desconhecidos.length ? `Não reconhecidos: ${desconhecidos.join(', ')}.` : 'Todos os blocos e vistas são conhecidos.', desconhecidos);

        const bloqueios = checks.filter(c => c.nivel === 'bloqueia');
        return { checks, bloqueios, divergencias: div, pendencias: pend, em: new Date().toISOString() };
    }

    window.LaudoCore = {
        FORMATO, VERSAO_ATUAL, SECOES, SECOES_DO_GERADOR, TIPOS, VISTAS, SIGLAS_DO_CORTEX, EQUIVALENTES, equivalente, LANCADOS, siglaNoCortex, modeloLancado, QI_ABRE, qiLinha, CORES_TEXTO, CORES_PADRAO, corCss, lerCelula, escreverCelula, colunasColoridas, celulaTabela, NOMES_INDICE, FATORES_BFP,
        esc, slug, aleatorio, clonar, faixa, idadeTexto, dataBR, dataExtenso, mesAno, iniciais, feminino, contexto,
        variaveis, inline, plano, textos, ancoraDoTitulo, garantirIds, completarBloco, converter1para2, lerPacote,
        cadaBloco, blocosDoTipo, vistasDe, validar
    };
})();

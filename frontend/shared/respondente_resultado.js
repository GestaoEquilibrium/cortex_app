// ============================================================================
// CORTEX — respondente_resultado.js
// ----------------------------------------------------------------------------
// "Quem respondeu" nas telas de resultado das escalas de heterorrelato e
// escolares (SNAP-IV, ATA, SRS-2, SCARED pais, ETDAH pais/professor…).
//
// Carregado pelo correcao_guard.js, que está em todas as telas
// correcao/*/*_resultado.html — não precisa mexer em cada tela.
//
// Lê o que o respondente informou ao responder:
//   · link do paciente  → aplicacoes_instrumento.respondente_cpf (pai, mãe ou
//     responsável) ou .respondente_matricula (professor) e .respondente_em
//   · Portal da Escola  → escola_respostas (escola, nome, função, matrícula,
//     data)
// e coloca o quadro dentro do laudo da tela, logo depois da Identificação.
// Como fica dentro de `.laudo`, sai no PDF da tela (que vai para o Gerador de
// Laudos) e nas figuras/downloads que fotografam a tela.
//
// O CPF sai mascarado (123.***.***-09): identifica quem respondeu sem expor
// o documento inteiro no PDF.
// ============================================================================

(function () {
    'use strict';
    if (window.__cortexRespondenteResultado) return;
    window.__cortexRespondenteResultado = true;

    const HETERO = ['responsavel', 'professor', 'responsavel_ou_professor'];
    const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    function aplicacaoDaUrl() {
        const q = new URLSearchParams(window.location.search);
        return q.get('aplicacao_id') || q.get('aplicacao') || null;
    }
    function dataBR(iso) {
        if (!iso) return '';
        const d = new Date(iso);
        if (isNaN(d)) return '';
        return d.toLocaleDateString('pt-BR') + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }
    function cpfMascarado(cpf) {
        const d = String(cpf || '').replace(/\D/g, '');
        if (d.length !== 11) return cpf ? '***' : '';
        return d.slice(0, 3) + '.***.***-' + d.slice(9);
    }

    async function buscar(c, id) {
        let ap = null;
        // respondente_em pode não existir em bancos antigos: tenta sem ela
        for (const cols of ['id, respondente_cpf, respondente_matricula, respondente_em, instrumentos_catalogo(sigla, tipo_respondente)',
                            'id, respondente_cpf, respondente_matricula, instrumentos_catalogo(sigla, tipo_respondente)',
                            'id, respondente_cpf, instrumentos_catalogo(sigla, tipo_respondente)']) {
            try {
                const { data, error } = await c.from('aplicacoes_instrumento').select(cols).eq('id', id).maybeSingle();
                if (!error) { ap = data; break; }
            } catch (_) { /* tenta a próxima */ }
        }
        let escola = null;
        try {
            const { data, error } = await c.from('escola_respostas')
                .select('escola_nome, respondente_nome, respondente_funcao, respondente_matricula, respondido_em')
                .eq('aplicacao_id', id).maybeSingle();
            if (!error) escola = data;
            else {
                const r2 = await c.from('escola_respostas').select('escola_nome, respondente_nome, respondente_funcao, respondido_em').eq('aplicacao_id', id).maybeSingle();
                if (!r2.error) escola = r2.data;
            }
        } catch (_) { /* sem portal da escola */ }
        return { ap, escola };
    }

    // Linhas do quadro (rótulo, valor)
    function linhas(info) {
        const ap = info.ap || {}, es = info.escola, tipo = ((ap.instrumentos_catalogo || {}).tipo_respondente) || '';
        const L = [];
        if (es) {
            L.push(['Respondido por', 'Escola (Portal da Escola)']);
            if (es.respondente_nome) L.push(['Nome', es.respondente_nome]);
            if (es.respondente_funcao) L.push(['Função', es.respondente_funcao]);
            if (es.escola_nome) L.push(['Escola', es.escola_nome]);
            const mat = es.respondente_matricula || ap.respondente_matricula;
            if (mat) L.push(['Matrícula profissional', mat]);
            if (es.respondido_em) L.push(['Respondido em', dataBR(es.respondido_em)]);
            return L;
        }
        if (ap.respondente_matricula) {
            L.push(['Respondido por', 'Professor(a)']);
            L.push(['Matrícula profissional', ap.respondente_matricula]);
        } else if (ap.respondente_cpf) {
            L.push(['Respondido por', 'Pai, mãe ou responsável']);
            L.push(['CPF de quem respondeu', cpfMascarado(ap.respondente_cpf)]);
        } else if (HETERO.includes(tipo)) {
            L.push(['Respondido por', tipo === 'professor' ? 'Professor(a)' : tipo === 'responsavel' ? 'Pai, mãe ou responsável' : 'Pai, mãe, responsável ou professor(a)']);
            L.push(['Identificação', 'Não registrada (respondido antes da identificação obrigatória ou digitado no CORTEX)']);
        }
        if (L.length && ap.respondente_em) L.push(['Identificado em', dataBR(ap.respondente_em)]);
        return L;
    }

    function estilo() {
        if (document.getElementById('cx-resp-css')) return;
        const st = document.createElement('style');
        st.id = 'cx-resp-css';
        st.textContent = [
            '.cx-resp{margin:14px 0 18px;border:1px solid #DDE3F0;border-radius:12px;overflow:hidden;background:#fff;break-inside:avoid;page-break-inside:avoid;font-family:inherit;}',
            '.cx-resp-cab{display:flex;align-items:center;gap:8px;padding:9px 14px;background:#F3F0FF;border-bottom:1px solid #DDE3F0;color:#4C1D95;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;}',
            '.cx-resp-cab i{font-style:normal;font-size:15px;letter-spacing:0;}',
            '.cx-resp-grade{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:0;}',
            '.cx-resp-item{display:flex;flex-direction:column;gap:2px;padding:9px 14px;border-bottom:1px solid #EEF1F7;}',
            '.cx-resp-item span{font-size:11px;color:#64748B;font-weight:600;}',
            '.cx-resp-item b{font-size:13.5px;color:#0F172A;font-weight:600;word-break:break-word;}'
        ].join('');
        document.head.appendChild(st);
    }

    function quadroHtml(L) {
        return '<div class="cx-resp-cab"><i>👤</i>Quem respondeu</div><div class="cx-resp-grade">' +
            L.map(l => '<div class="cx-resp-item"><span>' + esc(l[0]) + '</span><b>' + esc(l[1]) + '</b></div>').join('') + '</div>';
    }

    // Coloca (ou recoloca, se a tela redesenhar) o quadro dentro do laudo.
    function encaixar(L) {
        const laudo = document.querySelector('.laudo');
        if (!laudo || laudo.querySelector('.cx-resp')) return;
        // o cabeçalho "Respondente: Pais / responsável / professor" passa a dizer quem foi
        const quem = (L.find(l => l[0] === 'Respondido por') || [])[1];
        laudo.querySelectorAll('.laudo-header-pontuacao-label').forEach(lab => {
            if (/^\s*respondente\s*$/i.test(lab.textContent || '') && quem) {
                const v = lab.parentNode && lab.parentNode.querySelector('.laudo-header-pontuacao-valor');
                if (v) v.textContent = quem.replace(' (Portal da Escola)', '');
            }
        });
        const box = document.createElement('div');
        box.className = 'cx-resp';
        box.setAttribute('data-cortex-respondente', '1');
        box.innerHTML = quadroHtml(L);
        let ident = laudo.querySelector('.laudo-identificacao');
        if (!ident) ident = Array.from(laudo.querySelectorAll('[class*="identif"]')).find(e => !e.classList.contains('laudo-secao-titulo') && !e.querySelector('.laudo-secao-titulo') && e.offsetHeight < 420) || null;
        if (ident && ident.parentNode) { ident.parentNode.insertBefore(box, ident.nextSibling); return; }
        const corpo = laudo.querySelector('.laudo-body');
        if (corpo) { corpo.insertBefore(box, corpo.firstChild); return; }
        const cab = laudo.querySelector('.laudo-header');
        if (cab && cab.parentNode) cab.parentNode.insertBefore(box, cab.nextSibling);
        else laudo.insertBefore(box, laudo.firstChild);
    }

    async function iniciar() {
        const id = aplicacaoDaUrl();
        const c = window.cortexClient;
        if (!id || !c) return;
        let info;
        try { info = await buscar(c, id); } catch (e) { console.warn('[respondente]', e); return; }
        const L = linhas(info);
        if (!L.length) return;
        estilo();
        encaixar(L);
        // as telas redesenham o laudo (ao calcular, trocar aba etc.): recoloca
        let agendado = false;
        new MutationObserver(() => {
            if (agendado) return;
            agendado = true;
            requestAnimationFrame(() => { agendado = false; encaixar(L); });
        }).observe(document.body, { childList: true, subtree: true });
    }

    if (typeof window.cortexOnAuthReady === 'function') window.cortexOnAuthReady(iniciar);
    else window.addEventListener('cortex:auth-ready', iniciar, { once: true });
})();

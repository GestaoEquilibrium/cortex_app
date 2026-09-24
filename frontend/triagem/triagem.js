// ============================================================================
// CORTEX_APP — triagem.js
// ----------------------------------------------------------------------------
// Triagem rápida para captação em evento (NR-1). Link público, sem login e
// sem criar paciente: os dados caem em `triagens_evento`, que a equipe
// acompanha depois.
//
// ESCALAS — todas de uso livre e feitas para autoaplicação:
//   GAD-7    7 itens · ansiedade
//   PHQ-9    9 itens · depressão
//   ASRS-A   6 itens · rastreio de TDAH em adultos (Parte A da ASRS-18,
//            que é a parte validada COMO rastreio; as outras 12 servem para
//            avaliação, não para triagem)
//
// São 22 itens, uns 3 minutos. Com BAI e BDI-II seriam 60, e num estande
// de evento a maioria largaria no meio — além de serem testes de uso
// restrito a psicólogo, o que não cabe em autoaplicação aberta.
//
// O item 9 do PHQ-9 pergunta sobre ideação suicida. Quem responde vê a
// tela de agradecimento normal; a equipe é que recebe o alerta na lista
// interna. Há psicólogo no estande — foi por isso que o item ficou.
// ============================================================================

(function () {
    'use strict';

    const OPC_FREQ = [
        ['Nenhuma vez', 0],
        ['Vários dias', 1],
        ['Mais da metade dos dias', 2],
        ['Quase todos os dias', 3]
    ];

    const OPC_ASRS = [
        ['Nunca', 0],
        ['Raramente', 1],
        ['Às vezes', 2],
        ['Frequentemente', 3],
        ['Muito frequentemente', 4]
    ];

    const GAD7 = {
        chave: 'gad7',
        titulo: 'Como você tem se sentido',
        enunciado: 'Nas últimas 2 semanas, com que frequência você foi incomodado(a) por:',
        opcoes: OPC_FREQ,
        itens: [
            'Sentir-se nervoso(a), ansioso(a) ou muito tenso(a)',
            'Não ser capaz de impedir ou de controlar as preocupações',
            'Preocupar-se muito com diversas coisas',
            'Dificuldade para relaxar',
            'Ficar tão agitado(a) que se torna difícil permanecer sentado(a)',
            'Ficar facilmente aborrecido(a) ou irritado(a)',
            'Sentir medo como se algo terrível fosse acontecer'
        ]
    };

    const PHQ9 = {
        chave: 'phq9',
        titulo: 'Seu dia a dia',
        enunciado: 'Nas últimas 2 semanas, com que frequência você foi incomodado(a) por:',
        opcoes: OPC_FREQ,
        itens: [
            'Pouco interesse ou pouco prazer em fazer as coisas',
            'Sentir-se para baixo, deprimido(a) ou sem perspectiva',
            'Dificuldade para pegar no sono, para continuar dormindo, ou dormir mais do que de costume',
            'Sentir-se cansado(a) ou com pouca energia',
            'Falta de apetite ou comer demais',
            'Sentir-se mal consigo mesmo(a), achar que é um fracasso ou que decepcionou sua família',
            'Dificuldade para se concentrar nas coisas, como ler ou assistir televisão',
            'Lentidão para se mover ou falar a ponto das pessoas perceberem — ou o contrário, ficar tão agitado(a) que anda de um lado para o outro mais do que de costume',
            'Pensar em se ferir de alguma maneira ou que seria melhor estar morto(a)'
        ]
    };

    const ASRS = {
        chave: 'asrs',
        titulo: 'Atenção e organização',
        enunciado: 'Nos últimos 6 meses, com que frequência:',
        opcoes: OPC_ASRS,
        itens: [
            'Você tem dificuldade para finalizar os detalhes de um projeto, depois que as partes mais difíceis já foram feitas?',
            'Você tem dificuldade para colocar as coisas em ordem quando precisa fazer uma tarefa que exige organização?',
            'Você tem dificuldade para lembrar de compromissos ou obrigações?',
            'Quando tem uma tarefa que exige muita concentração, você evita ou adia começar?',
            'Você mexe as mãos ou os pés, ou se remexe na cadeira, quando precisa ficar sentado(a) por muito tempo?',
            'Você se sente ativo(a) demais e levado(a) a fazer coisas, como se estivesse com um motor ligado?'
        ]
    };

    const ESCALAS = [GAD7, PHQ9, ASRS];

    // Passos: 0 = boas-vindas, 1 = dados, 2..4 = escalas, 5 = fim
    const state = { passo: 0, dados: {}, respostas: {}, enviando: false };

    let sb = null;

    const el = (id) => document.getElementById(id);
    const esc = (t) => { const d = document.createElement('div'); d.textContent = t ?? ''; return d.innerHTML; };

    // ── Escores ─────────────────────────────────────────────────────────────

    function faixaGad7(n) {
        if (n <= 4)  return 'mínima';
        if (n <= 9)  return 'leve';
        if (n <= 14) return 'moderada';
        return 'grave';
    }

    function faixaPhq9(n) {
        if (n <= 4)  return 'mínima';
        if (n <= 9)  return 'leve';
        if (n <= 14) return 'moderada';
        if (n <= 19) return 'moderadamente grave';
        return 'grave';
    }

    /**
     * ASRS Parte A tem corte próprio por item, não soma simples:
     * itens 1–3 contam a partir de "Às vezes" (2); itens 4–6 a partir de
     * "Frequentemente" (3). Quatro ou mais marcas = rastreio positivo.
     */
    function marcasAsrs(r) {
        let m = 0;
        for (let i = 0; i < 6; i++) {
            const v = r[i];
            if (v === undefined) continue;
            if (i < 3 ? v >= 2 : v >= 3) m++;
        }
        return m;
    }

    function calcular() {
        const g = state.respostas.gad7 || {};
        const p = state.respostas.phq9 || {};
        const a = state.respostas.asrs || {};
        const soma = (o, n) => { let s = 0; for (let i = 0; i < n; i++) s += (o[i] || 0); return s; };

        const gad = soma(g, 7), phq = soma(p, 9), marcas = marcasAsrs(a);
        return {
            gad7_escore: gad, gad7_faixa: faixaGad7(gad),
            phq9_escore: phq, phq9_faixa: faixaPhq9(phq),
            phq9_item9: p[8] || 0,
            asrs_marcas: marcas, asrs_positivo: marcas >= 4
        };
    }

    // ── Telas ───────────────────────────────────────────────────────────────

    function barra() {
        const pct = Math.round((state.passo / 5) * 100);
        const b = el('tri-barra');
        if (b) b.style.width = pct + '%';
    }

    function render() {
        barra();
        const c = el('tri-conteudo');
        if (state.passo === 0) c.innerHTML = telaInicio();
        else if (state.passo === 1) c.innerHTML = telaDados();
        else if (state.passo <= 4) c.innerHTML = telaEscala(ESCALAS[state.passo - 2]);
        else c.innerHTML = telaFim();
        ligar();
        window.scrollTo(0, 0);
    }

    function telaInicio() {
        return `
            <div class="tri-card tri-inicio">
                <div class="tri-selo">3 minutos</div>
                <h1>Como anda a sua saúde mental?</h1>
                <p>
                    Responda algumas perguntas rápidas sobre ansiedade, humor e concentração.
                    É uma <strong>triagem inicial</strong>, não um diagnóstico — nossa equipe
                    entra em contato depois para conversar sobre o resultado.
                </p>
                <ul class="tri-lista">
                    <li>22 perguntas, sem resposta certa ou errada</li>
                    <li>Seus dados ficam protegidos e não são compartilhados</li>
                    <li>Quem avalia é psicólogo, presencialmente</li>
                </ul>
                <button class="tri-btn tri-btn-grande" id="tri-comecar">Começar →</button>
            </div>`;
    }

    function telaDados() {
        const d = state.dados;
        return `
            <div class="tri-card">
                <h2>Seus dados</h2>
                <p class="tri-ajuda">Para podermos entrar em contato com você.</p>

                <div class="tri-campo">
                    <label>Nome completo *</label>
                    <input id="d-nome" value="${esc(d.nome || '')}" autocomplete="name">
                </div>
                <div class="tri-grid">
                    <div class="tri-campo">
                        <label>Telefone / WhatsApp *</label>
                        <input id="d-tel" value="${esc(d.telefone || '')}" inputmode="numeric"
                               placeholder="(34) 99999-9999" autocomplete="tel">
                    </div>
                    <div class="tri-campo">
                        <label>Data de nascimento</label>
                        <input id="d-nasc" type="date" value="${esc(d.data_nascimento || '')}">
                    </div>
                </div>
                <div class="tri-grid">
                    <div class="tri-campo">
                        <label>CPF</label>
                        <input id="d-cpf" value="${esc(d.cpf || '')}" inputmode="numeric" placeholder="000.000.000-00">
                    </div>
                    <div class="tri-campo">
                        <label>Sexo</label>
                        <select id="d-sexo">
                            <option value="">—</option>
                            <option ${d.sexo === 'Masculino' ? 'selected' : ''}>Masculino</option>
                            <option ${d.sexo === 'Feminino' ? 'selected' : ''}>Feminino</option>
                            <option ${d.sexo === 'Outro' ? 'selected' : ''}>Outro</option>
                        </select>
                    </div>
                </div>
                <div class="tri-campo">
                    <label>Empresa <span class="tri-op">(opcional)</span></label>
                    <input id="d-empresa" value="${esc(d.empresa || '')}">
                </div>

                <label class="tri-aceite">
                    <input type="checkbox" id="d-aceite" ${d.consentimento ? 'checked' : ''}>
                    <span>
                        Autorizo o Grupo Equilibrium a guardar meus dados e os resultados desta
                        triagem para <strong>entrar em contato comigo</strong> sobre atendimento.
                        Sei que são dados de saúde, que ficam protegidos pela LGPD, que não serão
                        repassados a terceiros e que posso pedir a exclusão a qualquer momento
                        pelo (34) 3212-9269.
                    </span>
                </label>

                <div class="tri-erro" id="tri-erro" style="display:none"></div>
                <button class="tri-btn tri-btn-grande" id="tri-prox">Continuar →</button>
            </div>`;
    }

    function telaEscala(e) {
        const r = state.respostas[e.chave] || {};
        return `
            <div class="tri-card">
                <h2>${esc(e.titulo)}</h2>
                <p class="tri-enunciado">${esc(e.enunciado)}</p>

                ${e.itens.map((txt, i) => `
                    <div class="tri-item" data-item="${i}">
                        <div class="tri-item-txt"><span class="tri-num">${i + 1}</span>${esc(txt)}</div>
                        <div class="tri-opcoes">
                            ${e.opcoes.map(([rot, val]) => `
                                <button class="tri-opc ${r[i] === val ? 'sel' : ''}"
                                        data-escala="${e.chave}" data-i="${i}" data-v="${val}">${esc(rot)}</button>`).join('')}
                        </div>
                    </div>`).join('')}

                <div class="tri-erro" id="tri-erro" style="display:none"></div>
                <div class="tri-nav">
                    <button class="tri-btn tri-btn-fraco" id="tri-voltar">← Voltar</button>
                    <button class="tri-btn" id="tri-prox">${state.passo === 4 ? 'Finalizar' : 'Continuar →'}</button>
                </div>
            </div>`;
    }

    function telaFim() {
        return `
            <div class="tri-card tri-fim">
                <div class="tri-check">✓</div>
                <h1>Obrigado!</h1>
                <p>
                    Suas respostas foram registradas. <strong>Nossa equipe vai entrar em
                    contato com você</strong> para conversar sobre o resultado e explicar
                    como podemos ajudar.
                </p>
                <p class="tri-ajuda">
                    Se quiser falar com alguém agora, procure a nossa equipe aqui no estande.
                </p>
                <div class="tri-marca">Grupo Equilibrium</div>
            </div>`;
    }

    // ── Eventos ─────────────────────────────────────────────────────────────

    function ligar() {
        const c = el('tri-comecar');
        if (c) c.onclick = () => { state.passo = 1; render(); };

        const v = el('tri-voltar');
        if (v) v.onclick = () => { state.passo--; render(); };

        const p = el('tri-prox');
        if (p) p.onclick = avancar;

        document.querySelectorAll('.tri-opc').forEach(b => {
            b.onclick = () => {
                const { escala, i, v } = b.dataset;
                state.respostas[escala] = state.respostas[escala] || {};
                state.respostas[escala][Number(i)] = Number(v);

                b.parentElement.querySelectorAll('.tri-opc').forEach(o => o.classList.remove('sel'));
                b.classList.add('sel');
                b.closest('.tri-item').classList.remove('faltando');

                // Leva à próxima pergunta sozinho: no celular, evita rolar
                const prox = b.closest('.tri-item').nextElementSibling;
                if (prox && prox.classList.contains('tri-item')) {
                    prox.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            };
        });
    }

    function erro(msg) {
        const e = el('tri-erro');
        if (!e) return;
        e.textContent = msg;
        e.style.display = '';
        e.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function avancar() {
        if (state.passo === 1) {
            const nome = el('d-nome').value.trim();
            const tel = el('d-tel').value.trim();
            const aceite = el('d-aceite').checked;
            if (nome.length < 3) return erro('Por favor, informe seu nome completo.');
            if (tel.replace(/\D/g, '').length < 10) return erro('Por favor, informe um telefone com DDD.');
            if (!aceite) return erro('Para continuar, é preciso autorizar o contato.');

            state.dados = {
                nome,
                telefone: tel,
                cpf: el('d-cpf').value.trim() || null,
                data_nascimento: el('d-nasc').value || null,
                sexo: el('d-sexo').value || null,
                empresa: el('d-empresa').value.trim() || null,
                consentimento: true
            };
            state.passo = 2;
            return render();
        }

        // Escalas: todas as perguntas precisam de resposta
        const e = ESCALAS[state.passo - 2];
        const r = state.respostas[e.chave] || {};
        const faltando = [];
        for (let i = 0; i < e.itens.length; i++) if (r[i] === undefined) faltando.push(i);

        if (faltando.length) {
            document.querySelectorAll('.tri-item').forEach(x => x.classList.remove('faltando'));
            faltando.forEach(i => {
                const d = document.querySelector(`.tri-item[data-item="${i}"]`);
                if (d) d.classList.add('faltando');
            });
            const primeiro = document.querySelector('.tri-item.faltando');
            if (primeiro) primeiro.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return erro(faltando.length === 1
                ? 'Falta responder 1 pergunta.'
                : `Faltam responder ${faltando.length} perguntas.`);
        }

        if (state.passo < 4) { state.passo++; return render(); }
        enviar();
    }

    async function enviar() {
        if (state.enviando) return;
        state.enviando = true;

        const btn = el('tri-prox');
        if (btn) { btn.disabled = true; btn.textContent = 'Enviando…'; }

        try {
            const escores = calcular();
            const { error } = await sb.from('triagens_evento').insert({
                evento: 'NR-1',
                ...state.dados,
                respostas: state.respostas,
                ...escores,
                consentido_em: new Date().toISOString()
            });
            if (error) throw error;

            state.passo = 5;
            render();
        } catch (err) {
            console.error('[triagem] enviar:', err);
            state.enviando = false;
            if (btn) { btn.disabled = false; btn.textContent = 'Finalizar'; }
            erro('Não conseguimos enviar. Verifique a conexão e tente de novo.');
        }
    }

    // ── Máscaras ────────────────────────────────────────────────────────────

    document.addEventListener('input', (ev) => {
        const t = ev.target;
        if (t.id === 'd-tel') {
            let v = t.value.replace(/\D/g, '').slice(0, 11);
            if (v.length > 6)      v = `(${v.slice(0,2)}) ${v.slice(2,7)}-${v.slice(7)}`;
            else if (v.length > 2) v = `(${v.slice(0,2)}) ${v.slice(2)}`;
            else if (v.length)     v = `(${v}`;
            t.value = v;
        }
        if (t.id === 'd-cpf') {
            let v = t.value.replace(/\D/g, '').slice(0, 11);
            if (v.length > 9)      v = `${v.slice(0,3)}.${v.slice(3,6)}.${v.slice(6,9)}-${v.slice(9)}`;
            else if (v.length > 6) v = `${v.slice(0,3)}.${v.slice(3,6)}.${v.slice(6)}`;
            else if (v.length > 3) v = `${v.slice(0,3)}.${v.slice(3)}`;
            t.value = v;
        }
    });

    // ── Início ──────────────────────────────────────────────────────────────

    function iniciar() {
        if (typeof SUPABASE_CONFIG === 'undefined') {
            el('tri-conteudo').innerHTML =
                '<div class="tri-card"><p>Configuração não disponível.</p></div>';
            return;
        }
        sb = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
        render();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', iniciar);
    } else {
        iniciar();
    }
})();

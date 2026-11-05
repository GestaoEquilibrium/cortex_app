// ============================================================================
// CORTEX — aviso_migracao.js
// Trava de tela: o CORTEX mudou para o CORTEX +EQUILIBRIUM.
// Não apaga nada. Só cobre a tela com o aviso e o botão para o sistema novo.
// Para tirar a trava: apagar a linha <script ... aviso_migracao.js> das páginas
// (ou trocar ATIVO para false aqui embaixo).
// ============================================================================
(function () {
    'use strict';
    var ATIVO = true;
    var NOVO_ENDERECO = 'https://eq.cortexmais.com.br';
    if (!ATIVO || window.__cortexAvisoMigracao) return;
    window.__cortexAvisoMigracao = true;

    var ID = 'cx-migracao';

    // páginas de paciente, família e escola: aviso de "aguarde, estamos migrando"
    var caminho = location.pathname;
    var EH_PACIENTE = /^\/(portal|l|escola)(\/|$)/.test(caminho)
        || /^\/frontend\/(portal|responder|anamnese-publica|pre-cadastro|escola|triagem)(\/|$)/.test(caminho);

    var css = ''
        + 'html.cx-mig-trava, html.cx-mig-trava body{overflow:hidden!important;}'
        + '#' + ID + '{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;'
        + 'padding:20px;box-sizing:border-box;overflow-y:auto;'
        + 'background:radial-gradient(1200px 600px at 15% -10%,rgba(47,111,237,.35),transparent 60%),'
        + 'radial-gradient(900px 500px at 110% 110%,rgba(124,77,255,.30),transparent 60%),#0A1428;'
        + 'font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#141F3C;'
        + '-webkit-font-smoothing:antialiased;}'
        + '#' + ID + ' *{box-sizing:border-box;}'
        + '#' + ID + ' .cxm-card{width:100%;max-width:520px;background:#fff;border-radius:22px;padding:36px 32px 28px;'
        + 'box-shadow:0 30px 80px rgba(0,0,0,.45);text-align:center;margin:auto;}'
        + '#' + ID + ' .cxm-icone{width:68px;height:68px;margin:0 auto 18px;border-radius:20px;display:flex;align-items:center;'
        + 'justify-content:center;background:linear-gradient(135deg,#2F6FED,#7C4DFF);box-shadow:0 10px 24px rgba(47,111,237,.35);}'
        + '#' + ID + ' .cxm-selo{display:inline-block;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;'
        + 'color:#2F6FED;background:#E8F0FE;border-radius:999px;padding:5px 12px;margin-bottom:14px;}'
        + '#' + ID + ' h1{font-size:25px;line-height:1.25;font-weight:800;margin:0 0 12px;color:#141F3C;}'
        + '#' + ID + ' h1 span{background:linear-gradient(90deg,#2F6FED,#7C4DFF);-webkit-background-clip:text;background-clip:text;color:transparent;}'
        + '#' + ID + ' p{font-size:15.5px;line-height:1.6;color:#475569;margin:0 0 12px;}'
        + '#' + ID + ' .cxm-suporte{display:flex;gap:12px;align-items:flex-start;text-align:left;background:#FEF3C7;border:1px solid #FCD34D;'
        + 'border-radius:14px;padding:13px 15px;margin:18px 0 22px;font-size:14.5px;line-height:1.5;color:#78350F;}'
        + '#' + ID + ' .cxm-suporte b{color:#78350F;}'
        + '#' + ID + ' .cxm-botao{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;min-height:54px;'
        + 'border-radius:14px;background:linear-gradient(135deg,#2F6FED,#7C4DFF);color:#fff!important;font-size:16.5px;font-weight:700;'
        + 'text-decoration:none!important;border:0;cursor:pointer;box-shadow:0 12px 26px rgba(47,111,237,.35);transition:transform .15s,box-shadow .15s;}'
        + '#' + ID + ' .cxm-botao:hover{transform:translateY(-1px);box-shadow:0 16px 32px rgba(47,111,237,.45);}'
        + '#' + ID + ' .cxm-botao:focus-visible{outline:3px solid #A78BFA;outline-offset:3px;}'
        + '#' + ID + ' .cxm-endereco{margin-top:12px;font-size:13.5px;color:#64748B;}'
        + '#' + ID + ' .cxm-endereco b{color:#141F3C;}'
        + '#' + ID + ' .cxm-espera{display:flex;justify-content:center;gap:8px;margin:20px 0 6px;}'
        + '#' + ID + ' .cxm-espera i{width:10px;height:10px;border-radius:50%;background:#2F6FED;animation:cxmPulo 1.2s infinite ease-in-out;}'
        + '#' + ID + ' .cxm-espera i:nth-child(2){animation-delay:.15s;background:#5B6CF6;}'
        + '#' + ID + ' .cxm-espera i:nth-child(3){animation-delay:.3s;background:#7C4DFF;}'
        + '@keyframes cxmPulo{0%,80%,100%{transform:translateY(0);opacity:.45}40%{transform:translateY(-7px);opacity:1}}'
        + '@media (prefers-reduced-motion:reduce){#' + ID + ' .cxm-espera i{animation:none;opacity:.8}}'
        + '@media (max-width:480px){#' + ID + ' .cxm-card{padding:28px 20px 22px;border-radius:18px;}#' + ID + ' h1{font-size:21px;}}';

    function htmlEquipe() {
        return ''
            + '<div class="cxm-card">'
            +   '<div class="cxm-icone" aria-hidden="true">'
            +     '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">'
            +       '<path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg>'
            +   '</div>'
            +   '<div class="cxm-selo">Sistema novo</div>'
            +   '<h1 id="cxm-titulo">O CORTEX agora é o <span>CORTEX +EQUILIBRIUM</span></h1>'
            +   '<p>Este sistema não está mais em uso. Todos os dados já foram levados para o sistema novo, e a partir de agora vamos usar só ele.</p>'
            +   '<div class="cxm-suporte"><span aria-hidden="true" style="font-size:20px;line-height:1">💬</span>'
            +     '<div><b>Entre em contato com o suporte</b> para receber o seu acesso ao sistema novo ou para tirar qualquer dúvida.</div></div>'
            +   '<a class="cxm-botao" href="' + NOVO_ENDERECO + '" rel="noopener">Ir para o novo CORTEX'
            +     '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg></a>'
            +   '<div class="cxm-endereco">Endereço: <b>eq.cortexmais.com.br</b></div>'
            + '</div>';
    }

    function htmlPaciente() {
        return ''
            + '<div class="cxm-card">'
            +   '<div class="cxm-icone" aria-hidden="true">'
            +     '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">'
            +       '<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/></svg>'
            +   '</div>'
            +   '<div class="cxm-selo">Em atualização</div>'
            +   '<h1 id="cxm-titulo">Estamos migrando o <span>nosso sistema</span></h1>'
            +   '<p>' + (/portal/.test(caminho) ? 'O Portal do Paciente está' : 'Esta página está') + ' passando por uma atualização para ficar ainda melhor. Por favor, aguarde: em breve ele volta a funcionar.</p>'
            +   '<p>Seus dados estão seguros e nada foi perdido.</p>'
            +   '<div class="cxm-espera" aria-hidden="true"><i></i><i></i><i></i></div>'
            +   '<div class="cxm-endereco">Precisa de algo com urgência? <b>Fale com a clínica.</b></div>'
            +   '<div class="cxm-endereco" style="margin-top:4px">Grupo Equilibrium</div>'
            + '</div>';
    }

    function montar() {
        var el = document.createElement('div');
        el.id = ID;
        el.setAttribute('role', 'alertdialog');
        el.setAttribute('aria-modal', 'true');
        el.setAttribute('aria-labelledby', 'cxm-titulo');
        el.innerHTML = EH_PACIENTE ? htmlPaciente() : htmlEquipe();
        return el;
    }

    function travarFundo() {
        if (!document.body) return;
        var filhos = document.body.children;
        for (var i = 0; i < filhos.length; i++) {
            var f = filhos[i];
            if (f.id !== ID && !f.hasAttribute('inert')) {
                f.setAttribute('inert', '');
                f.setAttribute('aria-hidden', 'true');
            }
        }
    }

    function garantir() {
        document.documentElement.classList.add('cx-mig-trava');
        if (!document.getElementById(ID + '-css')) {
            var st = document.createElement('style');
            st.id = ID + '-css';
            st.textContent = css;
            (document.head || document.documentElement).appendChild(st);
        }
        if (!document.body) return;
        var el = document.getElementById(ID);
        if (!el) {
            el = montar();
            document.body.appendChild(el);
        } else if (el.parentNode !== document.body || el !== document.body.lastElementChild) {
            // fica sempre por cima de qualquer modal que a página abrir
            document.body.appendChild(el);
        }
        travarFundo();
    }

    // estilo na hora, aviso assim que existir <body>
    garantir();
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', garantir);
    }
    window.addEventListener('load', garantir);

    // se alguma página reescrever a tela, o aviso volta
    var agendado = false;
    function observar() {
        if (!document.body || observar.feito) return;
        observar.feito = true;
        new MutationObserver(function () {
            if (agendado) return;
            agendado = true;
            setTimeout(function () { agendado = false; garantir(); }, 50);
        }).observe(document.body, { childList: true });
    }
    if (document.body) observar();
    else document.addEventListener('DOMContentLoaded', observar);
    setInterval(garantir, 2000);
})();

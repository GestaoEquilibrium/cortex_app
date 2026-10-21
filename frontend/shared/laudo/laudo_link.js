/* ============================================================================
   CORTEX · Laudo Online — LINK CURTO  (frontend/shared/laudo/laudo_link.js)
   ----------------------------------------------------------------------------
   Sprint LO-9. Botão "🔗 Enviar link": um link curto (cortexneuro.com.br/l/?…)
   que abre só a página online do laudo finalizado, sem login e sem acesso a
   nada do sistema. Copiar, WhatsApp, QR, prazo, contagem de aberturas,
   gerar outro e tirar do ar.
   Expõe: window.LaudoLink.abrir({ laudoId, versao, pacienteNome, pacienteId })
   ============================================================================ */
(function () {
    'use strict';
    const BASE_PUBLICA = 'https://cortexneuro.com.br';
    const sb = () => window.cortexClient;
    const toast = (m, t) => { if (window.CortexUI && window.CortexUI.toast) window.CortexUI.toast(m, t || 'info'); };
    const esc = s => { const d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; };
    const data = iso => iso ? new Date(iso).toLocaleDateString('pt-BR') : '';
    const quando = iso => iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '';
    const urlDe = cod => `${BASE_PUBLICA}/l/?${cod}`;

    function estilos() {
        if (document.getElementById('ll-css')) return;
        const s = document.createElement('style'); s.id = 'll-css';
        s.textContent = `
        .ll-fundo { position: fixed; inset: 0; z-index: 1000; background: rgba(6, 11, 24, .55); backdrop-filter: blur(4px); display: grid; place-items: center; padding: 16px; font-family: Inter, system-ui, sans-serif; }
        .ll-card { width: min(520px, 100%); max-height: calc(100vh - 32px); overflow: auto; background: #fff; color: #0F172A; border-radius: 18px; box-shadow: 0 30px 80px -20px rgba(0,0,0,.5); padding: 22px; }
        .ll-card h2 { margin: 0 0 4px; font-size: 18px; } .ll-card .ll-sub { margin: 0 0 16px; font-size: 13px; color: #64748B; text-align: justify; }
        .ll-url { display: flex; gap: 8px; } .ll-url input { flex: 1; min-width: 0; height: 40px; border: 1px solid #CBD5E1; border-radius: 10px; padding: 0 12px; font: 600 14px Inter, sans-serif; color: #1F3864; background: #F8FAFC; }
        .ll-bt { height: 40px; padding: 0 14px; border-radius: 10px; border: 1px solid #CBD5E1; background: #fff; color: #0F172A; font: 600 13px Inter, sans-serif; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; text-decoration: none; }
        .ll-bt:hover { background: #F1F5F9; } .ll-bt.prim { background: #2E75B6; border-color: #2E75B6; color: #fff; } .ll-bt.prim:hover { background: #1F4E79; }
        .ll-bt.zap { background: #25D366; border-color: #25D366; color: #fff; } .ll-bt.perigo { color: #B91C1C; border-color: #FCA5A5; }
        .ll-linha { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
        .ll-qr { display: flex; gap: 16px; align-items: center; margin-top: 16px; padding: 12px; border: 1px solid #E2E8F0; border-radius: 14px; }
        .ll-qr svg { width: 120px; height: 120px; flex: none; } .ll-qr p { margin: 0; font-size: 13px; color: #475569; text-align: justify; }
        .ll-info { margin-top: 14px; font-size: 12.5px; color: #475569; background: #F1F5F9; border-radius: 10px; padding: 10px 12px; }
        .ll-campo { display: grid; gap: 6px; font-size: 13px; font-weight: 600; } .ll-campo select { height: 40px; border: 1px solid #CBD5E1; border-radius: 10px; padding: 0 10px; font: 500 14px Inter, sans-serif; }
        .ll-rodape { display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap; margin-top: 18px; border-top: 1px solid #E2E8F0; padding-top: 14px; }`;
        document.head.appendChild(s);
    }

    async function abrir(o) {
        estilos();
        const fundo = document.createElement('div');
        fundo.className = 'll-fundo';
        fundo.innerHTML = '<div class="ll-card" role="dialog" aria-modal="true"><p class="ll-sub">Carregando…</p></div>';
        document.body.appendChild(fundo);
        const fechar = () => { fundo.remove(); document.removeEventListener('keydown', tecla); };
        const tecla = ev => { if (ev.key === 'Escape') fechar(); };
        document.addEventListener('keydown', tecla);
        fundo.addEventListener('click', ev => { if (ev.target === fundo) fechar(); });
        const card = fundo.querySelector('.ll-card');
        const primeiro = String(o.pacienteNome || '').trim().split(/\s+/)[0] || '';
        let link = null;

        async function carregar() {
            const { data: rows } = await sb().from('laudo_links').select('codigo, expira_em, acessos, created_at, ultimo_acesso_em')
                .eq('laudo_online_id', o.laudoId).is('revogado_em', null).order('created_at', { ascending: false }).limit(1);
            const r = (rows || [])[0];
            link = r && (!r.expira_em || new Date(r.expira_em) > new Date()) ? r : null;
        }

        function cab() {
            return `<h2>🔗 Link do laudo${o.versao ? ` v${esc(o.versao)}` : ''}</h2>
                <p class="ll-sub">Quem abrir o link vê só a página online do laudo: não precisa de senha e não acessa nada do sistema.</p>`;
        }

        function desenhar() {
            if (!link) {
                card.innerHTML = `${cab()}
                    <label class="ll-campo">Vale por
                        <select id="ll-dias"><option value="7">7 dias</option><option value="30" selected>30 dias</option><option value="90">90 dias</option><option value="0">Sem prazo</option></select>
                    </label>
                    <div class="ll-rodape"><button class="ll-bt" data-x="fechar">Cancelar</button><button class="ll-bt prim" id="ll-criar">Criar link</button></div>`;
                card.querySelector('#ll-criar').addEventListener('click', () => criar(false));
            } else {
                const url = urlDe(link.codigo);
                const msg = `Olá! Segue o link para ver o laudo${primeiro ? ' de ' + primeiro : ''}, do Grupo Equilibrium: ${url}`;
                const qr = window.LaudoImpressao && window.LaudoImpressao.qrSVG ? window.LaudoImpressao.qrSVG(url, 120) : '';
                card.innerHTML = `${cab()}
                    <div class="ll-url"><input id="ll-url" readonly value="${esc(url)}"><button class="ll-bt prim" id="ll-copiar">Copiar</button></div>
                    <div class="ll-linha">
                        <a class="ll-bt zap" href="https://wa.me/?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">WhatsApp</a>
                        <button class="ll-bt" id="ll-copiar-msg">Copiar com mensagem</button>
                        <a class="ll-bt" href="${esc(url)}" target="_blank" rel="noopener">Abrir ↗</a>
                    </div>
                    ${qr ? `<div class="ll-qr">${qr}<p>Também dá para mostrar este QR na devolutiva: a pessoa aponta a câmera do celular e o laudo abre.</p></div>` : ''}
                    <div class="ll-info">${link.expira_em ? `Vale até <b>${esc(data(link.expira_em))}</b>` : '<b>Sem prazo</b>'} ·
                        aberto <b>${esc(link.acessos || 0)}</b> ${link.acessos === 1 ? 'vez' : 'vezes'}${link.ultimo_acesso_em ? ` (último: ${esc(quando(link.ultimo_acesso_em))})` : ''}</div>
                    <div class="ll-rodape">
                        <span style="display:flex;gap:8px;flex-wrap:wrap"><button class="ll-bt" id="ll-novo" title="O link atual para de funcionar e sai um novo">↻ Gerar outro link</button>
                        <button class="ll-bt perigo" id="ll-tirar" title="O link para de abrir">Tirar do ar</button></span>
                        <button class="ll-bt" data-x="fechar">Fechar</button>
                    </div>`;
                const copiar = async (txt, ok) => {
                    try { await navigator.clipboard.writeText(txt); toast(ok, 'success'); }
                    catch (e) { const i = card.querySelector('#ll-url'); i.select(); document.execCommand('copy'); toast(ok, 'success'); }
                };
                card.querySelector('#ll-copiar').addEventListener('click', () => copiar(url, 'Link copiado.'));
                card.querySelector('#ll-copiar-msg').addEventListener('click', () => copiar(msg, 'Mensagem com o link copiada.'));
                card.querySelector('#ll-url').addEventListener('focus', ev => ev.target.select());
                card.querySelector('#ll-novo').addEventListener('click', () => confirmar('Gerar outro link?', 'O link que você já mandou para de abrir. Quem precisar ver terá que receber o novo.', 'Sim, gerar outro', () => criar(true)));
                card.querySelector('#ll-tirar').addEventListener('click', () => confirmar('Tirar o link do ar?', 'Quem tiver o link não consegue mais abrir o laudo.', 'Sim, tirar do ar', tirar, true));
            }
            card.querySelectorAll('[data-x="fechar"]').forEach(b => b.addEventListener('click', fechar));
        }

        function confirmar(titulo, texto, sim, acao, perigo) {
            if (window.CortexConfirm && window.CortexConfirm.mostrar) {
                window.CortexConfirm.mostrar({ icone: '🔗', titulo, texto, btnSim: sim, btnNao: 'Cancelar', btnSimDanger: !!perigo, onSim: acao });
            } else if (window.confirm(titulo + '\n\n' + texto)) acao();
        }

        async function criar(novo) {
            const sel = card.querySelector('#ll-dias');
            const dias = sel ? Number(sel.value) : 30;
            const { data: r, error } = await sb().rpc('laudo_link_criar', { p_laudo_id: o.laudoId, p_dias: dias, p_novo: !!novo });
            if (error || !r || !r.ok) { toast('Não consegui criar o link: ' + ((r && r.mensagem) || (error && error.message) || ''), 'danger'); return; }
            link = { codigo: r.codigo, expira_em: r.expira_em, acessos: r.acessos || 0, created_at: r.criado_em, ultimo_acesso_em: r.ultimo_acesso_em };
            if (r.novo && window.CortexAudit) window.CortexAudit.log('criacao', 'laudo_links', o.laudoId, { pacienteId: o.pacienteId || null, detalhes: { evento: 'link_laudo', dias, outro: !!novo } });
            desenhar();
            toast(novo ? 'Link novo criado. O anterior parou de abrir.' : 'Link criado.', 'success');
        }

        async function tirar() {
            const { data: r, error } = await sb().rpc('laudo_link_revogar', { p_laudo_id: o.laudoId });
            if (error || !r || !r.ok) { toast('Não consegui tirar do ar: ' + ((r && r.mensagem) || (error && error.message) || ''), 'danger'); return; }
            window.CortexAudit && window.CortexAudit.log('edicao', 'laudo_links', o.laudoId, { pacienteId: o.pacienteId || null, detalhes: { evento: 'link_laudo_tirado_do_ar' } });
            link = null;
            desenhar();
            toast('Link tirado do ar.', 'success');
        }

        try { await carregar(); } catch (e) { console.warn('[link do laudo]', e); }
        desenhar();
    }

    window.LaudoLink = { abrir };
})();

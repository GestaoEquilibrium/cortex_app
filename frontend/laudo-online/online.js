/* ============================================================================
   CORTEX · Laudo Online — PÁGINA ONLINE dentro do CORTEX (frontend/laudo-online/online.js)
   ----------------------------------------------------------------------------
   Sprint LO-5 (Documento 3, §6.4). A equipe vê aqui a mesma página que o
   paciente e o médico externo veem, desenhada por shared/laudo/laudo_portfolio.js.
     - em construção (só admin clínico): documento atual + números do banco;
     - finalizado (qualquer profissional ativo): só do snapshot.
   "Ver como o paciente" esconde pendências e avisos internos, como no portal.
   URL: online.html?paciente=<uuid>&laudo=<uuid>
   ============================================================================ */
(function () {
    'use strict';
    const sb = () => window.cortexClient;
    const esc = s => window.LaudoCore.esc(s);
    const params = new URLSearchParams(location.search);
    const st = { pacienteId: params.get('paciente'), laudoId: params.get('laudo'), publico: params.get('publico') === '1' };

    window.addEventListener('cortex:auth-ready', iniciar);

    function estado(titulo, texto) {
        document.getElementById('p-raiz').innerHTML = `<div class="p-estado"><div><h1>${esc(titulo)}</h1><p>${texto}</p></div></div>`;
    }

    async function iniciar() {
        st.perfil = (window.cortexProfissional || {}).perfil || null;
        st.admClin = st.perfil === 'admin_clinico';
        if (!st.pacienteId || !st.laudoId) return estado('Laudo não informado', 'Abra a página online pelo Laudo Online da pasta do paciente.');
        try {
            const { data, error } = await sb().from('laudos_online').select('*').eq('id', st.laudoId).maybeSingle();
            if (error) throw error;
            if (!data) return estado('Sem acesso a este laudo', 'Laudos em construção só o admin clínico abre. Quando o laudo for finalizado, ele aparece para toda a equipe.');
            st.laudo = data;
            const snap = data.status !== 'em_construcao' && data.snapshot && data.snapshot.formato === window.LaudoSnapshot.FORMATO ? data.snapshot : null;
            const glos = await sb().from('laudo_glossario').select('termo, titulo, texto').eq('ativo', true);
            const vivo = {};
            ((glos && glos.data) || []).forEach(g => { vivo[g.termo.toLowerCase()] = g; });
            if (snap) {
                st.doc = snap.documento;
                st.banco = window.LaudoSnapshot.bancoDe(snap);
                st.glossario = Object.assign({}, vivo, snap.glossario || {});
                try { st.banco.paciente.foto_assinada = await window.LaudoDados.fotoAssinada(st.banco.paciente.foto_url); } catch (e) { /* sem foto */ }
            } else {
                st.doc = data.documento;
                st.banco = await window.LaudoDados.carregar(st.pacienteId);
                st.glossario = vivo;
            }
            st.link = null;
            if (st.perfil === 'admin_clinico' || st.perfil === 'admin_gestor') {
                try {
                    const r = await sb().rpc('qr_prontuario_token', { p_paciente_id: st.pacienteId });
                    if (!r.error && r.data) st.link = 'https://cortexneuro.com.br/e/?t=' + encodeURIComponent(r.data);
                } catch (e) { /* QR sai sem link */ }
            }
            st.imagens = {};
            const arqs = [];
            window.LaudoCore.cadaBloco(st.doc, b => { if (b.tipo === 'imagem' && b.arquivo) arqs.push(b.arquivo); });
            Object.values(st.doc.figuras || {}).forEach(f => (f.blocos || []).forEach(b => { if (b.arquivo) arqs.push(b.arquivo); }));
            for (const a of arqs) {
                try { const r = await sb().storage.from('laudos-midia').createSignedUrl(a, 900); if (r.data) st.imagens[a] = r.data.signedUrl; } catch (e) { /* segue */ }
            }
            window.CortexAudit && window.CortexAudit.log('leitura', 'laudos_online', data.id, {
                pacienteId: st.pacienteId, detalhes: { versao: data.versao, status: data.status, visao: 'online' }
            });
            desenhar();
        } catch (err) {
            console.error('[online]', err);
            estado('Não consegui abrir a página', esc(err.message || 'erro desconhecido'));
        }
    }

    function barra() {
        const l = st.laudo;
        const fin = l.status !== 'em_construcao';
        const volta = `laudo-online.html?paciente=${encodeURIComponent(st.pacienteId)}&laudo=${encodeURIComponent(l.id)}`;
        const situacao = !fin ? '<span class="p-barra-info amb">Em construção · prévia</span>'
            : l.online_liberado_em ? '<span class="p-barra-info ok">● Liberado no portal e para o médico externo</span>'
                : '<span class="p-barra-info longo">Finalizado · ainda <b>não liberado</b> para o paciente</span>';
        return `<div class="p-barra">
            <a href="${volta}" title="Voltar ao Laudo Online">← Laudo Online v${esc(l.versao)}</a>
            ${situacao}
            ${fin && st.admClin && window.LaudoLink ? '<button type="button" id="p-link" title="Link curto que abre só esta página, sem senha e sem acesso ao sistema">🔗 Enviar link</button>' : ''}
            <label class="dir" title="Esconde pendências e avisos internos, como o paciente vê"><input type="checkbox" id="p-publico" ${st.publico ? 'checked' : ''}> Ver como o paciente</label>
        </div>`;
    }

    function desenhar() {
        const raiz = document.getElementById('p-raiz');
        raiz.innerHTML = '<div id="p-alvo"></div>' + barra();
        window.LaudoPortfolio.desenhar(document.getElementById('p-alvo'), {
            doc: st.doc, banco: st.banco, glossario: st.glossario, publico: st.publico,
            linkProntuario: st.publico ? null : st.link, imagens: st.imagens
        });
        const bl = document.getElementById('p-link');
        if (bl) bl.addEventListener('click', () => window.LaudoLink.abrir({ laudoId: st.laudo.id, versao: st.laudo.versao, pacienteId: st.pacienteId, pacienteNome: (st.banco.paciente || {}).nome_completo }));
        const chk = document.getElementById('p-publico');
        if (chk) chk.addEventListener('change', () => {
            st.publico = chk.checked;
            const y = window.scrollY;
            desenhar();
            window.scrollTo(0, y);
        });
    }
})();

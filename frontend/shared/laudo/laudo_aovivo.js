/* ============================================================================
   CORTEX · Laudo Online — AO VIVO  (frontend/shared/laudo/laudo_aovivo.js)
   ----------------------------------------------------------------------------
   Sprint LO-8. Duas pessoas no mesmo laudo em construção:
     - mesclar(base, local, remoto): junta as mudanças de cada um por bloco.
       base = o que esta tela gravou/recebeu por último; local = esta tela agora;
       remoto = o que está no banco. O que esta tela mudou em cima da base
       vai por cima do remoto; o resto fica como o outro deixou.
     - conectar(...): canal do Supabase Realtime por laudo (avisos "gravei a
       revisão N" e quem está com o laudo aberto) e, por segurança, uma
       conferência leve da revisão a cada 20 s com a aba visível.
   Expõe: window.LaudoAoVivo = { mesclar, conectar }
   ============================================================================ */
(function () {
    'use strict';
    const J = x => JSON.stringify(x === undefined ? null : x);
    const clonar = x => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
    const ehObj = x => !!x && typeof x === 'object' && !Array.isArray(x);

    // ── mesclar ───────────────────────────────────────────────────────────────
    function mapaBlocos(doc) {
        const m = new Map();
        (doc.secoes || []).forEach(sec => (sec.blocos || []).forEach((b, i) => m.set(b.id, { sec: sec.id, i, b })));
        return m;
    }
    // bloco anterior (na mesma seção) que também existe no outro documento
    function anteriorComum(blocos, i, existe) {
        for (let k = i - 1; k >= 0; k--) if (existe(blocos[k].id)) return blocos[k].id;
        return null;
    }
    function acharEm(doc, id) {
        for (const sec of doc.secoes || []) {
            const i = (sec.blocos || []).findIndex(b => b.id === id);
            if (i >= 0) return { sec, i };
        }
        return null;
    }

    function mesclar(base, local, remoto) {
        base = base || {}; local = local || {};
        const R = clonar(remoto) || {};
        const mudancas = { blocos: 0, mesmos: [] };

        // 1) chaves do documento (meta, figuras, …): por subchave quando é objeto
        const chaves = new Set(Object.keys(local).concat(Object.keys(base)));
        ['secoes', 'lixeira'].forEach(k => chaves.delete(k));
        chaves.forEach(k => {
            if (J(local[k]) === J(base[k])) return;
            if (ehObj(local[k]) && ehObj(base[k])) {
                if (!ehObj(R[k])) R[k] = {};
                new Set(Object.keys(local[k]).concat(Object.keys(base[k]))).forEach(s => {
                    if (J(local[k][s]) === J(base[k][s])) return;
                    if (local[k][s] === undefined) delete R[k][s]; else R[k][s] = clonar(local[k][s]);
                });
            } else if (local[k] === undefined) delete R[k];
            else R[k] = clonar(local[k]);
        });

        // 2) seções: apagadas, novas, propriedades e ordem
        R.secoes = R.secoes || [];
        const secB = new Map((base.secoes || []).map(s => [s.id, s]));
        const secL = new Map((local.secoes || []).map(s => [s.id, s]));
        R.secoes = R.secoes.filter(s => !(secB.has(s.id) && !secL.has(s.id)));
        (local.secoes || []).forEach((s, i) => {
            if (secB.has(s.id) || R.secoes.some(x => x.id === s.id)) return;
            const ant = i > 0 ? local.secoes[i - 1].id : null;
            const k = ant ? R.secoes.findIndex(x => x.id === ant) : -1;
            R.secoes.splice(k + 1, 0, Object.assign(clonar(s), { blocos: [] }));
        });
        R.secoes.forEach(s => {
            const l = secL.get(s.id), b = secB.get(s.id);
            if (!l || !b) return;
            new Set(Object.keys(l).concat(Object.keys(b))).forEach(p => {
                if (p === 'blocos' || J(l[p]) === J(b[p])) return;
                if (l[p] === undefined) delete s[p]; else s[p] = clonar(l[p]);
            });
        });
        const ordB = (base.secoes || []).map(s => s.id).filter(id => secL.has(id));
        const ordL = (local.secoes || []).map(s => s.id).filter(id => secB.has(id));
        if (J(ordB) !== J(ordL)) {
            const pos = new Map((local.secoes || []).map((s, i) => [s.id, i]));
            const minhas = R.secoes.filter(s => pos.has(s.id)).sort((a, b) => pos.get(a.id) - pos.get(b.id));
            const novo = minhas.slice();
            R.secoes.forEach((s, i) => {
                if (pos.has(s.id)) return;
                const ant = i > 0 ? R.secoes[i - 1].id : null;
                const k = ant ? novo.findIndex(x => x.id === ant) : -1;
                novo.splice(k + 1, 0, s);
            });
            R.secoes = novo;
        }

        // 3) blocos
        const B = mapaBlocos(base), L = mapaBlocos(local);
        B.forEach((v, id) => {                        // apagados aqui
            if (L.has(id)) return;
            const r = acharEm(R, id);
            if (r) { r.sec.blocos.splice(r.i, 1); mudancas.blocos++; }
        });
        (local.secoes || []).forEach(secLoc => (secLoc.blocos || []).forEach((b, i) => {
            const vb = B.get(b.id);
            const conteudo = !vb || J(vb.b) !== J(b);
            const secBase = vb ? (base.secoes || []).find(s => s.id === vb.sec) : null;
            const antL = anteriorComum(secLoc.blocos, i, id => B.has(id));
            const antB = vb ? anteriorComum(secBase.blocos, vb.i, id => L.has(id)) : null;
            const moveu = !!vb && (vb.sec !== secLoc.id || antL !== antB);
            if (!conteudo && !moveu) return;
            mudancas.blocos++;
            const achado = acharEm(R, b.id);
            if (vb && conteudo && achado && J(achado.sec.blocos[achado.i]) !== J(vb.b)) mudancas.mesmos.push(b.id);
            const obj = conteudo || !achado ? clonar(b) : achado.sec.blocos[achado.i];
            if (achado && !moveu) { achado.sec.blocos[achado.i] = obj; return; }
            const alvo = R.secoes.find(s => s.id === secLoc.id);
            if (!alvo) return;                         // a outra pessoa apagou a seção inteira
            alvo.blocos = alvo.blocos || [];
            if (achado) achado.sec.blocos.splice(achado.i, 1);
            let k = -1;
            for (let j = i - 1; j >= 0 && k < 0; j--) k = alvo.blocos.findIndex(x => x.id === secLoc.blocos[j].id);
            alvo.blocos.splice(k + 1, 0, obj);
        }));

        // 4) lixeira: entra o que foi apagado aqui, sai o que foi restaurado aqui
        const chave = x => (x && x.bloco ? x.bloco.id : '') + '|' + (x && x.apagado_em || '');
        const lxB = new Set((base.lixeira || []).map(chave));
        const lxL = new Set((local.lixeira || []).map(chave));
        R.lixeira = (R.lixeira || []).filter(x => !(lxB.has(chave(x)) && !lxL.has(chave(x))));
        const temR = new Set(R.lixeira.map(chave));
        (local.lixeira || []).forEach(x => { if (!lxB.has(chave(x)) && !temR.has(chave(x))) R.lixeira.push(clonar(x)); });

        return { doc: R, mudancas };
    }

    // ── canal ao vivo ─────────────────────────────────────────────────────────
    // o: { client, laudoId, eu: {id, nome}, revisao(): número local,
    //      aoMudarRemoto(info), aoPresenca(lista de outras pessoas) }
    function conectar(o) {
        const client = o.client;
        let canal = null, vivo = true, ticker = null;
        const chave = (o.eu && o.eu.id ? o.eu.id : 'anon') + ':' + Math.random().toString(36).slice(2, 8);

        function outros() {
            if (!canal) return [];
            const est = canal.presenceState ? canal.presenceState() : {};
            const lista = [];
            Object.keys(est).forEach(k => {
                if (k === chave) return;
                const p = (est[k] || [])[0] || {};
                lista.push({ id: p.id || null, nome: p.nome || 'Alguém', mesmaPessoa: !!(o.eu && p.id && p.id === o.eu.id) });
            });
            return lista;
        }
        try {
            if (client && client.channel) {
                canal = client.channel('laudo-online-' + o.laudoId, { config: { broadcast: { self: false }, presence: { key: chave } } });
                canal.on('broadcast', { event: 'gravou' }, msg => {
                    const p = (msg && msg.payload) || {};
                    if (vivo && Number(p.revisao) > Number(o.revisao())) o.aoMudarRemoto({ revisao: Number(p.revisao), nome: p.nome || null, via: 'aviso' });
                });
                canal.on('presence', { event: 'sync' }, () => { if (vivo && o.aoPresenca) o.aoPresenca(outros()); });
                canal.subscribe(status => {
                    if (status === 'SUBSCRIBED' && vivo) {
                        try { canal.track({ id: o.eu && o.eu.id, nome: (o.eu && o.eu.nome) || 'Alguém', desde: new Date().toISOString() }); } catch (e) { /* sem presença */ }
                    }
                });
            }
        } catch (e) { console.warn('[ao vivo] canal', e); canal = null; }

        // rede de segurança: confere só o número da revisão
        async function conferir() {
            if (!vivo || document.hidden) return;
            try {
                const { data } = await client.from('laudos_online').select('revisao, status').eq('id', o.laudoId).maybeSingle();
                if (vivo && data && (Number(data.revisao) > Number(o.revisao()) || data.status !== 'em_construcao')) {
                    o.aoMudarRemoto({ revisao: Number(data.revisao), status: data.status, via: 'conferencia' });
                }
            } catch (e) { /* sem rede: tenta na próxima */ }
        }
        ticker = setInterval(conferir, 20000);
        const aoVoltar = () => { if (!document.hidden) conferir(); };
        document.addEventListener('visibilitychange', aoVoltar);
        window.addEventListener('focus', aoVoltar);

        return {
            avisar(revisao) {
                if (!canal || !vivo) return;
                try { canal.send({ type: 'broadcast', event: 'gravou', payload: { revisao, nome: (o.eu && o.eu.nome) || null } }); } catch (e) { /* segue */ }
            },
            outros,
            desligar() {
                vivo = false;
                clearInterval(ticker);
                document.removeEventListener('visibilitychange', aoVoltar);
                window.removeEventListener('focus', aoVoltar);
                if (canal) { try { client.removeChannel(canal); } catch (e) { /* já fechado */ } }
                canal = null;
            }
        };
    }

    window.LaudoAoVivo = { mesclar, conectar };
})();

// ============================================================================
// CORTEX_APP — permissoes_admin.js
// ----------------------------------------------------------------------------
// Aba "Perfis e permissões" em Configurações. Só admin clínico.
//
// Três estados por item, como na tela do CORTEX Gestão:
//   oculto · ver · editar   (+ herdar, nos filhos)
//
// Herança: um item filho sem configuração própria segue o pai. A resolução
// acontece no banco, em tem_permissao(), subindo a árvore pela chave
// ('pasta.correcao.corrigir' → 'pasta.correcao' → 'pasta').
//
// O QUE NÃO ESTÁ AQUI, de propósito: o escopo por vínculo. "Aplicador vê os
// pacientes vinculados a ele" continua no código e nas políticas de RLS. Se
// virasse caixinha, um clique distraído abriria todos os prontuários da
// clínica. A tela mostra essa regra como informação, não como opção.
// ============================================================================

window.CortexPermissoesAdmin = (function () {
    'use strict';

    const PERFIS = [
        { id: 'admin_clinico',           nome: 'Admin Clínico',  desc: 'Acesso total. Não é configurável.' },
        { id: 'admin_gestor',            nome: 'Admin Gestor',   desc: 'Gestão da clínica' },
        { id: 'neuropsicologo_aplicador',nome: 'Aplicador',      desc: 'Neuropsicólogo que aplica e avalia' },
        { id: 'corretor',                nome: 'Corretor',       desc: 'Corrige instrumentos' },
        { id: 'estagiario',              nome: 'Estagiário',     desc: 'Sob supervisão' }
    ];

    // Árvore de permissões. A chave é hierárquica e o banco usa os pontos
    // para resolver a herança — mudar uma chave aqui muda o comportamento lá.
    const ARVORE = [
        { chave: 'dashboard', ic: '▦', nome: 'Dashboard' },
        { chave: 'pacientes', ic: '👥', nome: 'Pacientes', filhos: [
            { chave: 'pacientes.cadastrar', nome: 'Cadastrar paciente' },
            { chave: 'pacientes.editar',    nome: 'Editar dados do paciente' },
            { chave: 'pacientes.designar',  nome: 'Designar aplicador' },
            { chave: 'pacientes.portal',    nome: 'Enviar acesso e resetar senha do portal' }
        ]},
        { chave: 'pasta', ic: '📁', nome: 'Prontuário', filhos: [
            { chave: 'pasta.evolucao',   nome: 'Evolução' },
            { chave: 'pasta.anamnese',   nome: 'Anamnese' },
            { chave: 'pasta.hipoteses',  nome: 'Hipóteses' },
            { chave: 'pasta.checklist',  nome: 'Checklist' },
            { chave: 'pasta.bateria',    nome: 'Bateria' },
            { chave: 'pasta.correcao',   nome: 'Correção' },
            { chave: 'pasta.laudo',      nome: 'Laudo' },
            { chave: 'pasta.devolutiva', nome: 'Devolutiva' }
        ]},
        { chave: 'agenda',   ic: '📅', nome: 'Agenda' },
        { chave: 'graficos', ic: '📊', nome: 'Gráficos' },
        { chave: 'estoque',  ic: '📦', nome: 'Estoque', filhos: [
            { chave: 'estoque.movimentar', nome: 'Lançar entrada e saída' },
            { chave: 'estoque.excluir',    nome: 'Excluir lançamento' }
        ]},
        { chave: 'relatorios',       ic: '📈', nome: 'Relatórios' },
        { chave: 'auditoria',        ic: '🛡', nome: 'Auditoria' },
        { chave: 'ferramentas_laudo',ic: '🧰', nome: 'Ferramentas de Laudo' },
        { chave: 'instrumentos',     ic: '🗂', nome: 'Instrumentos (catálogo)' },
        { chave: 'configuracoes',    ic: '⚙️', nome: 'Configurações' }
    ];

    const NIVEIS = ['oculto', 'ver', 'editar'];

    let perfilAtivo = 'admin_gestor';
    let mapa = {};          // chave -> nivel
    let sujo = false;

    const c = () => window.cortexClient;
    const esc = (t) => { const d = document.createElement('div'); d.textContent = t ?? ''; return d.innerHTML; };
    const toast = (m, t) => { if (window.CortexUI?.toast) window.CortexUI.toast(m, t); };

    // ── Carga ───────────────────────────────────────────────────────────────

    async function carregar(perfil) {
        perfilAtivo = perfil || perfilAtivo;
        mapa = {};
        try {
            const { data, error } = await c()
                .from('permissoes')
                .select('chave, nivel')
                .eq('perfil', perfilAtivo);
            if (error) throw error;
            (data || []).forEach(p => { mapa[p.chave] = p.nivel; });
        } catch (err) {
            console.error('[permissoes] carregar:', err);
            toast('Erro ao carregar permissões: ' + (err.message || ''), 'danger');
        }
    }

    // ── Render ──────────────────────────────────────────────────────────────

    function render() {
        return `
            <div class="perm-wrap">
                <div class="perm-lateral">
                    <div class="perm-lateral-tit">Perfis</div>
                    ${PERFIS.map(p => `
                        <button class="perm-perfil ${p.id === perfilAtivo ? 'ativo' : ''} ${p.id === 'admin_clinico' ? 'travado' : ''}"
                                data-perfil="${p.id}" ${p.id === 'admin_clinico' ? 'disabled' : ''}>
                            <span class="perm-perfil-nome">${esc(p.nome)}</span>
                            <span class="perm-perfil-desc">${esc(p.desc)}</span>
                            ${p.id === 'admin_clinico' ? '<span class="perm-selo">Acesso total</span>' : ''}
                        </button>`).join('')}
                </div>

                <div class="perm-painel">
                    <div class="perm-painel-topo">
                        <div>
                            <h3>Permissões do perfil ${esc(PERFIS.find(p => p.id === perfilAtivo)?.nome || '')}</h3>
                            <p>Escolha o que este perfil enxerga e o que pode alterar.</p>
                        </div>
                        <button class="btn btn-primary btn-sm" id="perm-salvar" disabled>Salvar alterações</button>
                    </div>

                    <div class="perm-regra-fixa">
                        <span>🔒</span>
                        <div>
                            <strong>Regra do sistema, não configurável aqui.</strong>
                            Aplicador e estagiário só acessam pacientes vinculados a eles, e o
                            corretor só as aplicações que corrige. Marcar “Ver” abaixo respeita
                            esse limite — não abre a clínica inteira.
                        </div>
                    </div>

                    <div class="perm-lista" id="perm-lista">
                        ${ARVORE.map(linhaHtml).join('')}
                    </div>
                </div>
            </div>`;
    }

    function linhaHtml(item, ehFilho) {
        const atual = mapa[item.chave] || (ehFilho ? 'herdar' : 'oculto');
        const opcoes = ehFilho ? ['herdar', ...NIVEIS] : NIVEIS;

        const filhos = (item.filhos || []).map(f => linhaHtml(f, true)).join('');

        return `
            <div class="perm-linha ${ehFilho ? 'filho' : ''}">
                <span class="perm-nome">
                    ${item.ic ? `<span class="perm-ic">${item.ic}</span>` : ''}
                    ${esc(item.nome)}
                </span>
                <span class="perm-opcoes">
                    ${opcoes.map(n => `
                        <button class="perm-op ${atual === n ? 'sel ' + n : ''}"
                                data-chave="${item.chave}" data-nivel="${n}">${rotulo(n)}</button>`).join('')}
                </span>
            </div>
            ${filhos}`;
    }

    function rotulo(n) {
        return { herdar: 'Herdar', oculto: 'Oculto', ver: 'Ver', editar: 'Editar' }[n] || n;
    }

    // ── Eventos ─────────────────────────────────────────────────────────────

    function bind() {
        document.querySelectorAll('[data-perfil]').forEach(b =>
            b.addEventListener('click', async () => {
                if (sujo && !confirm('Há alterações não salvas. Trocar de perfil vai descartá-las. Continuar?')) return;
                sujo = false;
                await carregar(b.dataset.perfil);
                repintar();
            }));

        ligarBotoesNivel();

        const salvar = document.getElementById('perm-salvar');
        if (salvar) salvar.addEventListener('click', gravar);
    }

    function ligarBotoesNivel() {
        document.querySelectorAll('.perm-op').forEach(b =>
            b.addEventListener('click', () => {
                const { chave, nivel } = b.dataset;
                mapa[chave] = nivel;
                sujo = true;

                // Repinta só a linha, para não perder a rolagem numa árvore longa.
                b.closest('.perm-linha').querySelectorAll('.perm-op').forEach(o => {
                    o.className = 'perm-op' + (o.dataset.nivel === nivel ? ' sel ' + nivel : '');
                });
                const s = document.getElementById('perm-salvar');
                if (s) s.disabled = false;
            }));
    }

    function repintar() {
        const cont = document.getElementById('cfg-conteudo');
        if (!cont) return;
        cont.innerHTML = render();
        bind();
    }

    async function gravar() {
        const btn = document.getElementById('perm-salvar');
        const txt = btn ? btn.textContent : '';
        if (btn) { btn.disabled = true; btn.textContent = 'Salvando…'; }

        try {
            const linhas = Object.entries(mapa).map(([chave, nivel]) => ({
                perfil: perfilAtivo,
                chave: chave,
                nivel: nivel,
                updated_at: new Date().toISOString(),
                updated_by: window.cortexProfissional?.id || null
            }));

            if (linhas.length) {
                const { error } = await c()
                    .from('permissoes')
                    .upsert(linhas, { onConflict: 'perfil,chave' });
                if (error) throw error;
            }

            if (window.CortexAudit) {
                window.CortexAudit.log('edicao', 'permissoes', null, {
                    detalhes: { operacao: 'configurar_permissoes',
                                perfil: perfilAtivo,
                                itens: linhas.length }
                });
            }

            sujo = false;
            toast('Permissões salvas.', 'success');
        } catch (err) {
            console.error('[permissoes] gravar:', err);
            toast('Erro ao salvar: ' + (err.message || ''), 'danger');
        } finally {
            if (btn) { btn.textContent = txt; btn.disabled = !sujo; }
        }
    }

    return { carregar, render, bind, ARVORE, PERFIS };
})();

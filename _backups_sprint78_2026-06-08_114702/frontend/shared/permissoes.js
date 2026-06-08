// ============================================================================
// CORTEX_APP — Permissões de UI (Sprint 78)
// ============================================================================
// Módulo central de checagem de perfil para gating da INTERFACE.
//
// ⚠️ Sprint 78 trata APENAS da UI (esconder/desabilitar botões e telas).
//    RLS e filtros de dados no banco ficam para a Sprint 79 — este módulo
//    NÃO é uma barreira de segurança, é só conveniência visual.
//
// Lê o perfil de window.cortexProfissional.perfil (preenchido pelo
// auth_guard.js antes do evento cortex:auth-ready). Todas as funções leem
// o valor no momento da chamada (lazy), então funcionam dentro de qualquer
// handler de auth-ready.
//
// Perfis válidos (enum perfil_usuario):
//   admin_clinico · admin_gestor · neuropsicologo_aplicador · corretor · estagiario
//
// Matriz aprovada (Sprint 78):
//   Tela              | adm_clin | adm_gest | aplicador | corretor | estagiario
//   ------------------|----------|----------|-----------|----------|-----------
//   Pasta — editar    |    ✅    |    ✅    |    ✅     |    ❌    |    ❌
//   Cadastrar pac.    |    ✅    |    ✅    |    ✅     |    ❌    |    ❌
//   Checklist (marcar)|    ✅    |    ✅    |    ✅     |    ❌    |    ❌
//   Checklist (faixa) |    ✅    |    ✅    |    ❌     |    ❌    |    ❌
//   Correção          |    ✅    |    ✅    |    ✅     |    ✅    |    ❌
//   Anamnese (editar) |    ✅    |    ✅    |    ✅     |    ❌    |    ❌
//   Designar aplicador|    ✅    |    ✅    |    ❌     |    ❌    |    ❌
//   Relatórios        |    ✅    |    ✅    |    ❌     |    ❌    |    ❌
//   Configurações     |    ✅    |    ✅    |    ❌     |    ❌    |    ❌
// ============================================================================

window.CortexPerfil = (function () {
    'use strict';

    const ADMINS = ['admin_clinico', 'admin_gestor'];

    function perfilAtual() {
        return (window.cortexProfissional && window.cortexProfissional.perfil) || null;
    }

    // ── Identidade de perfil ────────────────────────────────────────────────
    function isAdmin()      { return ADMINS.includes(perfilAtual()); }
    function isAplicador()  { return perfilAtual() === 'neuropsicologo_aplicador'; }
    function isCorretor()   { return perfilAtual() === 'corretor'; }
    function isEstagiario() { return perfilAtual() === 'estagiario'; }

    // ── Capacidades de UI ─────────────────────────────────────────────────────
    // Pasta — editar dados/fotos/agendar/capa/portal: admin + aplicador
    function podeEditarPasta()           { return isAdmin() || isAplicador(); }

    // Cadastrar / pré-cadastrar paciente: admin + aplicador
    function podeCadastrarPaciente()     { return isAdmin() || isAplicador(); }

    // Checklist — marcar/desmarcar instrumentos: admin + aplicador
    function podeUsarChecklist()         { return isAdmin() || isAplicador(); }

    // Checklist — alterar faixa (override manual): só admin
    function podeAlterarFaixaChecklist() { return isAdmin(); }

    // Correção: todos menos estagiário
    function podeCorrigir() {
        const p = perfilAtual();
        return p === 'admin_clinico' || p === 'admin_gestor'
            || p === 'neuropsicologo_aplicador' || p === 'corretor';
    }

    // Anamnese — editar: admin + aplicador
    function podeEditarAnamnese()        { return isAdmin() || isAplicador(); }

    // Designar aplicador a um paciente (ação de coordenação): só admin
    function podeDesignarAplicador()     { return isAdmin(); }

    // Relatórios: só admin
    function podeVerRelatorios()         { return isAdmin(); }

    // Configurações: só admin
    function podeVerConfiguracoes()      { return isAdmin(); }

    // ── Label amigável do perfil ──────────────────────────────────────────────
    function labelPerfil(perfil) {
        const p = perfil || perfilAtual();
        return (window.CortexUI && window.CortexUI.PERFIL_LABELS[p]) || p || '—';
    }

    return {
        perfilAtual,
        isAdmin, isAplicador, isCorretor, isEstagiario,
        podeEditarPasta, podeCadastrarPaciente,
        podeUsarChecklist, podeAlterarFaixaChecklist,
        podeCorrigir, podeEditarAnamnese, podeDesignarAplicador,
        podeVerRelatorios, podeVerConfiguracoes,
        labelPerfil
    };
})();

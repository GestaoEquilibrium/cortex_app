// ============================================================================
// CORTEX_APP — Helper de Auditoria
// ============================================================================
// Função utilitária para registrar ações na tabela auditoria_acessos.
// Uso:
//   await CortexAudit.log('leitura', 'pacientes', pacienteId);
//   await CortexAudit.log('criacao', 'pacientes', pacienteId, { detalhes: {...} });
// ============================================================================

window.CortexAudit = (function() {
    'use strict';

    async function log(acao, tabela, registroId = null, opcoes = {}) {
        if (!window.cortexClient || !window.cortexProfissional) {
            console.warn('CortexAudit: cliente ou profissional não inicializado.');
            return;
        }

        try {
            const payload = {
                profissional_id: window.cortexProfissional.id,
                acao: acao,
                tabela: tabela,
                user_agent: navigator.userAgent
            };

            if (registroId) payload.registro_id = registroId;
            if (opcoes.pacienteId) payload.paciente_id = opcoes.pacienteId;
            if (opcoes.detalhes) payload.detalhes = opcoes.detalhes;

            const { error } = await window.cortexClient
                .from('auditoria_acessos')
                .insert(payload);

            if (error) {
                console.warn('CortexAudit: falha ao registrar log:', error.message);
            }
        } catch (err) {
            console.warn('CortexAudit: erro inesperado:', err);
        }
    }

    return { log };
})();

// ============================================================================
// CORTEX_APP — Banner de Respondente (compartilhado)
// ============================================================================
// Gera caixa colorida destacada que indica QUEM deve responder o questionário.
// Usado em:
//   - frontend/responder/<sigla>.js  → renderConsentimento() insere o banner
//   - portal/portal.js               → card de cada teste pendente
//
// Lê tipo_respondente do catálogo (cinco valores possíveis):
//   - paciente                 : próprio paciente responde sobre si
//   - responsavel              : pais/cuidador sobre paciente
//   - professor                : professor sobre aluno
//   - paciente_ou_responsavel  : adulto autorresponde, se menor pai junto
//   - responsavel_ou_professor : manual permite os dois
//
// API pública:
//   window.CortexRespondente.gerarBanner(tipo)        → string HTML
//   window.CortexRespondente.LABEL[tipo]              → label curto pra cards
//   window.CortexRespondente.descrever(tipo)          → texto descritivo
// ============================================================================

(function() {
    'use strict';

    const DADOS = {
        paciente: {
            cor:        '#0c4a6e',
            bg:         '#e0f2fe',
            borda:      '#7dd3fc',
            icone:      '👤',
            label:      'Para o(a) próprio(a) paciente responder',
            titulo:     'Para o(a) próprio(a) paciente responder',
            descricao:  'Este questionário deve ser respondido pelo(a) próprio(a) paciente sobre si mesmo(a).'
        },
        responsavel: {
            cor:        '#581c87',
            bg:         '#f3e8ff',
            borda:      '#c4b5fd',
            icone:      '👨‍👩‍👧',
            label:      'Para pai, mãe ou responsável',
            titulo:     'Para pai, mãe ou responsável responder',
            descricao:  'Este questionário deve ser respondido pelo(a) pai, mãe ou responsável legal sobre a criança / adolescente avaliado(a).'
        },
        professor: {
            cor:        '#92400e',
            bg:         '#fef3c7',
            borda:      '#fcd34d',
            icone:      '🎓',
            label:      'Para o(a) professor(a) responder',
            titulo:     'Para o(a) professor(a) responder',
            descricao:  'Este questionário deve ser respondido pelo(a) professor(a) ou profissional do contexto educacional que acompanha o(a) aluno(a).'
        },
        paciente_ou_responsavel: {
            cor:        '#9a3412',
            bg:         '#ffedd5',
            borda:      '#fdba74',
            icone:      '👤 / 👨‍👩‍👧',
            label:      'Para o paciente — com ajuda do responsável, se necessário',
            titulo:     'Para o(a) paciente responder',
            descricao:  'Pode ser respondido pelo(a) próprio(a) paciente. Se for menor de idade ou tiver dificuldade, peça ajuda ao pai, mãe ou responsável.'
        },
        responsavel_ou_professor: {
            cor:        '#134e4a',
            bg:         '#ccfbf1',
            borda:      '#5eead4',
            icone:      '👨‍👩‍👧 / 🎓',
            label:      'Para pai, mãe, responsável OU professor(a)',
            titulo:     'Para pai, mãe, responsável ou professor(a) responder',
            descricao:  'Este questionário pode ser respondido pelo(a) pai/mãe/responsável OU pelo(a) professor(a) que convive diariamente com a criança / adolescente.'
        }
    };

    function dados(tipo) {
        return DADOS[tipo] || DADOS.paciente;  // fallback seguro
    }

    /**
     * Retorna o HTML da caixa colorida do banner.
     * @param {string} tipo - um dos valores de tipo_respondente
     * @returns {string} HTML pronto pra injetar
     */
    function gerarBanner(tipo) {
        const d = dados(tipo);
        return `
            <div class="cortex-banner-respondente" style="
                background: ${d.bg};
                border: 1.5px solid ${d.borda};
                border-radius: 10px;
                padding: 14px 16px;
                margin: 0 0 20px 0;
                display: flex;
                gap: 12px;
                align-items: flex-start;
            ">
                <div style="
                    font-size: 22px;
                    line-height: 1;
                    flex-shrink: 0;
                    min-width: 28px;
                ">${d.icone}</div>
                <div style="flex: 1; min-width: 0;">
                    <div style="
                        font-size: 11.5px;
                        font-weight: 800;
                        color: ${d.cor};
                        letter-spacing: 0.06em;
                        text-transform: uppercase;
                        margin-bottom: 4px;
                    ">${escapeHtml(d.titulo)}</div>
                    <div style="
                        font-size: 13px;
                        line-height: 1.5;
                        color: #1e293b;
                    ">${escapeHtml(d.descricao)}</div>
                </div>
            </div>
        `;
    }

    /**
     * Versão compacta — pra cards do portal do paciente
     * @param {string} tipo
     * @returns {string} HTML compacto (uma linha)
     */
    function gerarTag(tipo) {
        const d = dados(tipo);
        return `
            <span class="cortex-tag-respondente" style="
                display: inline-flex;
                gap: 6px;
                align-items: center;
                background: ${d.bg};
                border: 1px solid ${d.borda};
                color: ${d.cor};
                padding: 4px 10px;
                border-radius: 999px;
                font-size: 11px;
                font-weight: 700;
                letter-spacing: 0.03em;
                white-space: nowrap;
            ">
                <span>${d.icone}</span>
                <span>${escapeHtml(d.label)}</span>
            </span>
        `;
    }

    function descrever(tipo) {
        return dados(tipo).descricao;
    }

    function escapeHtml(text) {
        if (text === null || text === undefined) return '';
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }

    // Exporta a API
    window.CortexRespondente = {
        gerarBanner,
        gerarTag,
        descrever,
        LABEL: Object.fromEntries(Object.entries(DADOS).map(([k, v]) => [k, v.label])),
        TITULO: Object.fromEntries(Object.entries(DADOS).map(([k, v]) => [k, v.titulo]))
    };
})();

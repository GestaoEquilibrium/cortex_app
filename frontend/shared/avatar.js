// ============================================================================
// CORTEX_APP — Helper de Avatar
// ============================================================================
// Gera o HTML do avatar do paciente:
//  - Se tem foto_url: imagem real (via signed URL do Supabase Storage)
//  - Se não tem foto: ícone SVG por sexo (♀/♂/⊙) em fundo colorido sutil
// ============================================================================

window.CortexAvatar = (function() {
    'use strict';

    /**
     * Gera HTML de um avatar para um paciente
     * @param {Object} paciente - { foto_url, sexo, nome_completo }
     * @param {Object} opcoes - { tamanho: 'sm'|'md'|'lg', signedUrl: string }
     */
    function render(paciente, opcoes = {}) {
        const tamanho = opcoes.tamanho || 'md';
        const signedUrl = opcoes.signedUrl || null;

        const tamanhoClass = `avatar-${tamanho}`;
        const altText = (paciente.nome_completo || 'Paciente').replace(/"/g, '&quot;');

        // Se tem foto (URL assinada disponível), exibe a imagem
        if (signedUrl) {
            return `
                <div class="avatar ${tamanhoClass} avatar-com-foto" title="${altText}">
                    <img src="${signedUrl}" alt="${altText}" loading="lazy" />
                </div>
            `;
        }

        // Senão, exibe ícone por sexo
        return renderIconePorSexo(paciente.sexo, tamanhoClass, altText);
    }

    function renderIconePorSexo(sexo, tamanhoClass, altText) {
        let icone, corClass;

        switch (sexo) {
            case 'Masculino':
                icone = svgMasculino();
                corClass = 'avatar-masculino';
                break;
            case 'Feminino':
                icone = svgFeminino();
                corClass = 'avatar-feminino';
                break;
            default:
                icone = svgOutro();
                corClass = 'avatar-outro';
        }

        return `
            <div class="avatar ${tamanhoClass} avatar-icone ${corClass}" title="${altText}">
                ${icone}
            </div>
        `;
    }

    function svgMasculino() {
        return `
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="11" cy="13" r="5.5" stroke="currentColor" stroke-width="1.8"/>
                <line x1="14.9" y1="9.1" x2="20" y2="4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                <polyline points="15,4 20,4 20,9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
            </svg>
        `;
    }

    function svgFeminino() {
        return `
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="9" r="5.5" stroke="currentColor" stroke-width="1.8"/>
                <line x1="12" y1="14.5" x2="12" y2="22" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                <line x1="9" y1="19" x2="15" y2="19" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
            </svg>
        `;
    }

    function svgOutro() {
        return `
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="6" stroke="currentColor" stroke-width="1.8"/>
                <circle cx="12" cy="12" r="2" fill="currentColor"/>
            </svg>
        `;
    }

    /**
     * Busca a URL assinada da foto do paciente no Supabase Storage.
     * Retorna null se não houver foto ou der erro.
     */
    async function buscarUrlAssinada(pacienteId, fotoUrl) {
        if (!fotoUrl || !window.cortexClient) return null;

        try {
            // fotoUrl no banco é o path relativo (ex: "abc123.../perfil.jpg")
            const { data, error } = await window.cortexClient
                .storage
                .from('pacientes-fotos')
                .createSignedUrl(fotoUrl, 60); // URL válida por 60s

            if (error || !data) return null;
            return data.signedUrl;
        } catch (err) {
            console.warn('Erro ao buscar foto:', err);
            return null;
        }
    }

    return {
        render,
        buscarUrlAssinada
    };
})();

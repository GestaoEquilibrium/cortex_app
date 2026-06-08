// ============================================================================
// CORTEX_APP — Helper de Avatar
// ============================================================================
// Gera o HTML do avatar do paciente:
//  - Se tem foto: imagem real (via signed URL do Supabase Storage)
//  - Se não tem foto: iniciais (ex: "AM" pra "André Marques")
//                     com gradient por sexo:
//                       Masculino  → azul → verde   (--gradient-primary)
//                       Feminino   → rosa → verde   (--gradient-primary-fem)
//                       Outro/null → azul → verde   (default)
// ============================================================================

window.CortexAvatar = (function() {
    'use strict';

    /**
     * Gera HTML de um avatar para um paciente
     * @param {Object} paciente - { foto_url, sexo, nome_completo }
     * @param {Object} opcoes - { tamanho: 'sm'|'md'|'lg'|'xl', signedUrl: string }
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

        // Sem foto: iniciais com gradient por sexo
        return renderIniciais(paciente.nome_completo, paciente.sexo, tamanhoClass, altText);
    }

    function renderIniciais(nomeCompleto, sexo, tamanhoClass, altText) {
        const iniciais = extrairIniciais(nomeCompleto);
        const sexoClass = classeGradientPorSexo(sexo);
        return `
            <div class="avatar ${tamanhoClass} avatar-iniciais ${sexoClass}" title="${altText}">
                <span>${iniciais}</span>
            </div>
        `;
    }

    /**
     * Retorna a classe CSS do gradient baseado no sexo.
     *  - Feminino → avatar-iniciais-fem  (rosa → verde)
     *  - Masculino e qualquer outro → sem classe extra (usa --gradient-primary default)
     */
    function classeGradientPorSexo(sexo) {
        if (sexo === 'Feminino') return 'avatar-iniciais-fem';
        return '';
    }

    /**
     * Extrai 1 ou 2 letras iniciais de um nome completo.
     *
     * Regras:
     *  - "André Marques"           → "AM"
     *  - "André"                   → "A"
     *  - "André Felipe Marques"    → "AM"  (primeiro + último, ignora meio)
     *  - "André de Marques"        → "AM"  (ignora preposições do tipo "de", "da", "dos")
     *  - "" ou null                → "?"
     */
    function extrairIniciais(nome) {
        if (!nome || typeof nome !== 'string') return '?';
        const PREPOSICOES = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);
        const palavras = nome
            .trim()
            .split(/\s+/)
            .filter(p => p.length > 0 && !PREPOSICOES.has(p.toLowerCase()));

        if (palavras.length === 0) return '?';
        if (palavras.length === 1) return palavras[0][0].toUpperCase();

        // 2+ palavras: pega primeira letra da primeira e da última
        const inicial1 = palavras[0][0];
        const inicial2 = palavras[palavras.length - 1][0];
        return (inicial1 + inicial2).toUpperCase();
    }

    /**
     * Busca a URL assinada da foto do paciente no Supabase Storage.
     * Retorna null se não houver foto ou der erro.
     */
    async function buscarUrlAssinada(pacienteId, fotoUrl) {
        if (!fotoUrl || !window.cortexClient) return null;

        try {
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
        buscarUrlAssinada,
        extrairIniciais
    };
})();

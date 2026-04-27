// ============================================================================
// CORTEX_APP — UI Helpers
// ============================================================================
// Funções de formatação reutilizáveis em todo o frontend.
// ============================================================================

window.CortexUI = (function() {
    'use strict';

    /**
     * Formata CPF: 12345678900 -> 123.456.789-00
     */
    function formatarCPF(valor) {
        if (!valor) return '';
        const numeros = valor.replace(/\D/g, '').slice(0, 11);
        return numeros
            .replace(/(\d{3})(\d)/, '$1.$2')
            .replace(/(\d{3})(\d)/, '$1.$2')
            .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
    }

    /**
     * Aplica máscara de CPF em tempo real em um input
     */
    function aplicarMascaraCPF(input) {
        input.addEventListener('input', (e) => {
            e.target.value = formatarCPF(e.target.value);
        });
    }

    /**
     * Formata telefone: 34999998888 -> (34) 99999-8888
     */
    function formatarTelefone(valor) {
        if (!valor) return '';
        const numeros = valor.replace(/\D/g, '').slice(0, 11);
        if (numeros.length <= 10) {
            return numeros
                .replace(/(\d{2})(\d)/, '($1) $2')
                .replace(/(\d{4})(\d)/, '$1-$2');
        }
        return numeros
            .replace(/(\d{2})(\d)/, '($1) $2')
            .replace(/(\d{5})(\d)/, '$1-$2');
    }

    function aplicarMascaraTelefone(input) {
        input.addEventListener('input', (e) => {
            e.target.value = formatarTelefone(e.target.value);
        });
    }

    /**
     * Formata CEP: 38400000 -> 38400-000
     */
    function formatarCEP(valor) {
        if (!valor) return '';
        return valor.replace(/\D/g, '').slice(0, 8).replace(/(\d{5})(\d)/, '$1-$2');
    }

    function aplicarMascaraCEP(input) {
        input.addEventListener('input', (e) => {
            e.target.value = formatarCEP(e.target.value);
        });
    }

    /**
     * Formata data ISO para BR: 2026-04-27 -> 27/04/2026
     */
    function formatarDataBR(dataIso) {
        if (!dataIso) return '';
        const [ano, mes, dia] = dataIso.substring(0, 10).split('-');
        return `${dia}/${mes}/${ano}`;
    }

    /**
     * Calcula idade humanizada a partir da data de nascimento
     * Espelha o que a função SQL formatar_idade_humanizada faz.
     */
    function calcularIdadeHumanizada(dataNasc) {
        if (!dataNasc) return '';

        const nasc = new Date(dataNasc);
        const hoje = new Date();

        let anos = hoje.getFullYear() - nasc.getFullYear();
        let meses = hoje.getMonth() - nasc.getMonth();
        const dias = hoje.getDate() - nasc.getDate();

        if (dias < 0) meses--;
        if (meses < 0) {
            anos--;
            meses += 12;
        }

        if (anos === 0) {
            if (meses === 1) return '1 mês';
            if (meses === 0) return 'recém-nascido';
            return `${meses} meses`;
        }
        if (anos === 1 && meses === 0) return '1 ano';
        if (anos === 1) return `1 ano e ${meses} meses`;
        if (meses === 0) return `${anos} anos`;
        return `${anos} anos e ${meses} meses`;
    }

    /**
     * Validação básica de CPF (algoritmo dos dígitos verificadores)
     */
    function validarCPF(cpf) {
        if (!cpf) return true; // CPF é opcional
        const numeros = cpf.replace(/\D/g, '');
        if (numeros.length !== 11) return false;
        if (/^(\d)\1+$/.test(numeros)) return false; // Todos iguais

        let soma = 0;
        for (let i = 0; i < 9; i++) soma += parseInt(numeros[i]) * (10 - i);
        let resto = (soma * 10) % 11;
        if (resto === 10 || resto === 11) resto = 0;
        if (resto !== parseInt(numeros[9])) return false;

        soma = 0;
        for (let i = 0; i < 10; i++) soma += parseInt(numeros[i]) * (11 - i);
        resto = (soma * 10) % 11;
        if (resto === 10 || resto === 11) resto = 0;
        return resto === parseInt(numeros[10]);
    }

    /**
     * Mostra um toast de notificação
     */
    function toast(mensagem, tipo = 'info', duracao = 3500) {
        // Remove toast anterior se existir
        const existente = document.querySelector('.cortex-toast');
        if (existente) existente.remove();

        const div = document.createElement('div');
        div.className = `cortex-toast cortex-toast-${tipo}`;
        div.textContent = mensagem;
        document.body.appendChild(div);

        setTimeout(() => div.classList.add('show'), 10);
        setTimeout(() => {
            div.classList.remove('show');
            setTimeout(() => div.remove(), 300);
        }, duracao);
    }

    /**
     * Labels amigáveis dos perfis
     */
    const PERFIL_LABELS = {
        'admin_clinico': 'Admin Clínico',
        'admin_gestor': 'Admin Gestor',
        'neuropsicologo_aplicador': 'Neuropsicólogo',
        'estagiario': 'Estagiário',
        'corretor': 'Corretor'
    };

    /**
     * Labels amigáveis dos status do paciente
     */
    const STATUS_LABELS = {
        'cadastrado': 'Cadastrado',
        'em_avaliacao': 'Em avaliação',
        'pronto_para_laudo': 'Pronto para laudo',
        'laudo_pronto': 'Laudo pronto',
        'devolutiva_agendada': 'Devolutiva agendada',
        'devolutiva_realizada': 'Devolutiva realizada',
        'entregue': 'Entregue',
        'pendente': 'Pendente',
        'arquivado': 'Arquivado'
    };

    /**
     * Cores do badge de status (CSS classes)
     */
    const STATUS_CLASSES = {
        'cadastrado': 'status-info',
        'em_avaliacao': 'status-warning',
        'pronto_para_laudo': 'status-info',
        'laudo_pronto': 'status-success',
        'devolutiva_agendada': 'status-warning',
        'devolutiva_realizada': 'status-success',
        'entregue': 'status-success',
        'pendente': 'status-danger',
        'arquivado': 'status-muted'
    };

    return {
        formatarCPF,
        aplicarMascaraCPF,
        formatarTelefone,
        aplicarMascaraTelefone,
        formatarCEP,
        aplicarMascaraCEP,
        formatarDataBR,
        calcularIdadeHumanizada,
        validarCPF,
        toast,
        PERFIL_LABELS,
        STATUS_LABELS,
        STATUS_CLASSES
    };
})();

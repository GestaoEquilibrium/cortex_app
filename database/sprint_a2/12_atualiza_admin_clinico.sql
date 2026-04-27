-- ============================================================================
-- CORTEX_APP — Sprint A2 — Arquivo 12 de 12
-- Atualiza dados do admin clínico após o primeiro cadastro
-- ============================================================================
-- IMPORTANTE: este arquivo precisa ser EDITADO antes de rodar.
-- Substitua 'SEU-EMAIL@dominio.com' pelo e-mail que você usou para se
-- cadastrar no painel Authentication.
-- ============================================================================

-- ============================================================================
-- ATUALIZA OS DADOS COMPLETOS DO ADMIN CLÍNICO
-- ============================================================================

UPDATE profissionais
SET
    nome_completo = 'Wessilon Marques de Sousa',
    crp = '04/53832',
    formacao = 'Psicólogo, Neuropsicólogo',
    especialidade = 'Neuropsicologia, Avaliação Neuropsicológica, ABA',
    -- garante que o perfil é admin_clinico (deveria estar pelo trigger,
    -- mas reforçamos aqui caso tenha sido sobrescrito)
    perfil = 'admin_clinico'::perfil_usuario,
    ativo = true
WHERE email = 'SEU-EMAIL@dominio.com';  -- 👈 SUBSTITUA PELO SEU E-MAIL

-- ============================================================================
-- VERIFICAÇÃO: confere se o registro foi atualizado
-- ============================================================================

SELECT
    nome_completo,
    crp,
    email,
    perfil,
    formacao,
    especialidade,
    ativo,
    created_at
FROM profissionais
WHERE email = 'SEU-EMAIL@dominio.com';  -- 👈 SUBSTITUA PELO SEU E-MAIL

-- Esperado: 1 linha com os dados completos do Wessilon

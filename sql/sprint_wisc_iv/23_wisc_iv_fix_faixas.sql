-- ═══════════════════════════════════════════════════════════════════════════
-- 23_wisc_iv_fix_faixas.sql — Corrigir faixas_aplicaveis do WISC-IV
-- ═══════════════════════════════════════════════════════════════════════════
-- BUG ORIGINAL:
--   No 22_wisc_iv_setup.sql, cadastrei o WISC-IV com:
--      faixas_aplicaveis = ['infantil', 'adolescente']
--
--   MAS o sistema só conhece 3 faixas (frontend/checklist/checklist.js:113-122):
--      'pre_escolar' (< 6 anos)
--      'escolar'     (6-15 anos)
--      'adulto'      (16+ anos)
--
--   Resultado: WISC-IV nunca apareceu no checklist porque o filtro
--   .includes('escolar') no array ['infantil','adolescente'] retornava false.
--
-- CORREÇÃO:
--   WISC-IV cobre idades 6:0 a 16:11. Precisa estar em:
--     - 'escolar': 6-15 anos (a maior parte do range)
--     - 'adulto':  16:0-16:11 (último ano cobre quem tem 16)
--
-- LIÇÃO REGISTRADA:
--   Sempre confirmar valores válidos de enums/listas existentes ANTES de
--   cadastrar dados novos. Mesma lição da Sprint SRS-2 e WAIS-III (slug).
--   Disciplina #1: ler antes de gerar.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

UPDATE instrumentos_catalogo
SET faixas_aplicaveis = ARRAY['escolar', 'adulto']::text[]
WHERE sigla = 'WISC-IV';

COMMIT;


-- ═══════════════════════════════════════════════════════════════════════════
-- VALIDAÇÃO
-- ═══════════════════════════════════════════════════════════════════════════

-- Confirma a correção
SELECT
    sigla,
    faixas_aplicaveis,
    faixa_etaria_min_meses,
    faixa_etaria_max_meses
FROM instrumentos_catalogo
WHERE sigla = 'WISC-IV';

-- Esperado: faixas_aplicaveis = {escolar,adulto}

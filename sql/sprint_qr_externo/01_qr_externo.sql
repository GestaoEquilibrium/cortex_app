-- ============================================================================
-- CORTEX — sprint_qr_externo
-- ----------------------------------------------------------------------------
-- QR do prontuário impresso no laudo + autocadastro do profissional de fora
-- + solicitação de acesso ao prontuário. Nada é liberado sem o admin autorizar.
--
-- Fluxo:
--   1. O laudo sai com um QR que aponta para /e/?t=TOKEN.
--   2. Quem escaneia e ainda não tem conta faz o autocadastro. Ele entra como
--      'pendente' e não vê nada até o admin aprovar.
--   3. Quem já tem conta aprovada e escaneia, pede acesso àquele paciente
--      (ou já entra, se o paciente estiver liberado para ele).
--   4. O admin aprova cadastro e solicitação em Configurações → Acesso externo.
--
-- O profissional externo NÃO ganha usuário no auth do Supabase: a sessão dele
-- vive em `sessoes_externas` e só a Edge Function (service_role) fala com estas
-- funções. Assim ele fica fora de qualquer policy do CORTEX.
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── 1. usuarios_externos: estados novos ─────────────────────────────────────
-- `ativo` continua sendo "tem acesso"; `situacao` diz em que ponto do fluxo
-- ele está. As linhas que já existem nascem como aprovadas, então a tela
-- atual de Configurações continua funcionando sem mudar nada.

ALTER TABLE usuarios_externos
    ADD COLUMN IF NOT EXISTS situacao               text NOT NULL DEFAULT 'aprovado',
    ADD COLUMN IF NOT EXISTS origem                 text NOT NULL DEFAULT 'cadastro_interno',
    ADD COLUMN IF NOT EXISTS senha_hash             text,
    ADD COLUMN IF NOT EXISTS cpf                    text,
    ADD COLUMN IF NOT EXISTS clinica_nome_informado text,
    ADD COLUMN IF NOT EXISTS solicitado_em          timestamptz,
    ADD COLUMN IF NOT EXISTS aprovado_em            timestamptz,
    ADD COLUMN IF NOT EXISTS aprovado_por           uuid,
    ADD COLUMN IF NOT EXISTS recusa_motivo          text,
    ADD COLUMN IF NOT EXISTS aceite_lgpd_em         timestamptz,
    ADD COLUMN IF NOT EXISTS ultimo_login_em        timestamptz;

-- Quem se autocadastra ainda não tem clínica cadastrada por nós.
ALTER TABLE usuarios_externos ALTER COLUMN clinica_externa_id DROP NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'usuarios_externos_situacao_chk') THEN
        ALTER TABLE usuarios_externos
            ADD CONSTRAINT usuarios_externos_situacao_chk
            CHECK (situacao IN ('pendente', 'aprovado', 'recusado', 'suspenso'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'usuarios_externos_origem_chk') THEN
        ALTER TABLE usuarios_externos
            ADD CONSTRAINT usuarios_externos_origem_chk
            CHECK (origem IN ('cadastro_interno', 'autocadastro'));
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS usuarios_externos_email_uniq
    ON usuarios_externos (lower(email));

CREATE INDEX IF NOT EXISTS usuarios_externos_situacao_idx
    ON usuarios_externos (situacao);

-- ── 2. QR do prontuário ─────────────────────────────────────────────────────
-- Um token por paciente. Se um laudo impresso vazar, o admin rotaciona: o
-- token antigo morre e o QR daquele papel deixa de abrir.

CREATE TABLE IF NOT EXISTS qr_prontuario (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    paciente_id   uuid NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
    token         text NOT NULL UNIQUE,
    ativo         boolean NOT NULL DEFAULT true,
    criado_em     timestamptz NOT NULL DEFAULT now(),
    criado_por    uuid,
    revogado_em   timestamptz,
    revogado_por  uuid
);

CREATE UNIQUE INDEX IF NOT EXISTS qr_prontuario_um_ativo
    ON qr_prontuario (paciente_id) WHERE ativo;

-- ── 3. Solicitações de acesso a um prontuário ───────────────────────────────

CREATE TABLE IF NOT EXISTS solicitacoes_acesso_externo (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_externo_id uuid NOT NULL REFERENCES usuarios_externos(id) ON DELETE CASCADE,
    paciente_id        uuid NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
    origem             text NOT NULL DEFAULT 'qr',
    mensagem           text,
    situacao           text NOT NULL DEFAULT 'pendente'
                       CHECK (situacao IN ('pendente', 'aprovada', 'recusada')),
    solicitado_em      timestamptz NOT NULL DEFAULT now(),
    respondido_em      timestamptz,
    respondido_por     uuid,
    resposta_motivo    text,
    acesso_id          uuid
);

CREATE UNIQUE INDEX IF NOT EXISTS solic_ext_uma_pendente
    ON solicitacoes_acesso_externo (usuario_externo_id, paciente_id)
    WHERE situacao = 'pendente';

CREATE INDEX IF NOT EXISTS solic_ext_situacao_idx
    ON solicitacoes_acesso_externo (situacao, solicitado_em DESC);

-- ── 4. Sessões da área externa ──────────────────────────────────────────────
-- Guardamos só o hash do token de sessão. Vazou o banco, não vazou sessão.

CREATE TABLE IF NOT EXISTS sessoes_externas (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_externo_id uuid NOT NULL REFERENCES usuarios_externos(id) ON DELETE CASCADE,
    token_hash         text NOT NULL UNIQUE,
    criado_em          timestamptz NOT NULL DEFAULT now(),
    expira_em          timestamptz NOT NULL DEFAULT now() + interval '12 hours',
    encerrada_em       timestamptz,
    ip                 text,
    user_agent         text
);

CREATE INDEX IF NOT EXISTS sessoes_externas_usuario_idx
    ON sessoes_externas (usuario_externo_id);

-- ── 5. Auditoria da área externa ────────────────────────────────────────────
-- Separada de auditoria_acessos, que exige profissional_id do CORTEX.

CREATE TABLE IF NOT EXISTS auditoria_externa (
    id                 bigserial PRIMARY KEY,
    usuario_externo_id uuid REFERENCES usuarios_externos(id) ON DELETE SET NULL,
    acao               text NOT NULL,
    paciente_id        uuid,
    detalhes           jsonb,
    ip                 text,
    user_agent         text,
    criado_em          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auditoria_externa_usuario_idx
    ON auditoria_externa (usuario_externo_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS auditoria_externa_paciente_idx
    ON auditoria_externa (paciente_id, criado_em DESC);

-- ── 6. RLS: só admin do CORTEX enxerga estas tabelas ────────────────────────
-- A área externa não usa policy nenhuma: ela passa pela Edge Function, que
-- usa service_role e chama as funções abaixo.

ALTER TABLE qr_prontuario               ENABLE ROW LEVEL SECURITY;
ALTER TABLE solicitacoes_acesso_externo ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessoes_externas            ENABLE ROW LEVEL SECURITY;
ALTER TABLE auditoria_externa           ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS qr_prontuario_admin      ON qr_prontuario;
DROP POLICY IF EXISTS solic_ext_admin          ON solicitacoes_acesso_externo;
DROP POLICY IF EXISTS sessoes_externas_admin   ON sessoes_externas;
DROP POLICY IF EXISTS auditoria_externa_admin  ON auditoria_externa;

CREATE POLICY qr_prontuario_admin ON qr_prontuario
    FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY solic_ext_admin ON solicitacoes_acesso_externo
    FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY sessoes_externas_admin ON sessoes_externas
    FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY auditoria_externa_admin ON auditoria_externa
    FOR SELECT TO authenticated USING (is_admin());

COMMIT;

-- ============================================================================
-- FUNÇÕES
-- ============================================================================

BEGIN;

-- ── Helpers ─────────────────────────────────────────────────────────────────

-- Token curto (22 caracteres, 128 bits) para o QR caber num quadradinho
-- pequeno no laudo e ainda ser impossível de adivinhar.
CREATE OR REPLACE FUNCTION externo_novo_token()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = public, extensions, pg_temp
AS $$
    SELECT rtrim(translate(encode(gen_random_bytes(16), 'base64'), '+/', '-_'), '=');
$$;

-- "Maria S. R." — o bastante para o profissional confirmar que é o paciente
-- dele, sem escrever o nome inteiro numa tela que qualquer um pode abrir.
CREATE OR REPLACE FUNCTION externo_rotulo_paciente(p_nome text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    partes text[];
    saida  text;
    i      int;
BEGIN
    partes := regexp_split_to_array(btrim(coalesce(p_nome, '')), '\s+');
    IF partes IS NULL OR array_length(partes, 1) IS NULL
       OR btrim(coalesce(partes[1], '')) = '' THEN
        RETURN '—';
    END IF;
    saida := partes[1];
    FOR i IN 2 .. array_length(partes, 1) LOOP
        IF length(partes[i]) > 2 THEN
            saida := saida || ' ' || upper(left(partes[i], 1)) || '.';
        END IF;
    END LOOP;
    RETURN saida;
END $$;

-- ── QR: gerar e rotacionar (chamado pelo CORTEX, só admin) ──────────────────

CREATE OR REPLACE FUNCTION qr_prontuario_token(p_paciente_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_token text;
    v_prof  uuid;
BEGIN
    IF NOT is_admin() THEN
        RAISE EXCEPTION 'Somente administradores podem gerar o QR do prontuário.';
    END IF;

    SELECT token INTO v_token
      FROM qr_prontuario
     WHERE paciente_id = p_paciente_id AND ativo;

    IF v_token IS NOT NULL THEN
        RETURN v_token;
    END IF;

    SELECT id INTO v_prof FROM profissionais WHERE auth_user_id = auth.uid();

    INSERT INTO qr_prontuario (paciente_id, token, criado_por)
    VALUES (p_paciente_id, externo_novo_token(), v_prof)
    RETURNING token INTO v_token;

    RETURN v_token;
END $$;

CREATE OR REPLACE FUNCTION qr_prontuario_rotacionar(p_paciente_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_token text;
    v_prof  uuid;
BEGIN
    IF NOT is_admin() THEN
        RAISE EXCEPTION 'Somente administradores podem trocar o QR do prontuário.';
    END IF;

    SELECT id INTO v_prof FROM profissionais WHERE auth_user_id = auth.uid();

    UPDATE qr_prontuario
       SET ativo = false, revogado_em = now(), revogado_por = v_prof
     WHERE paciente_id = p_paciente_id AND ativo;

    INSERT INTO qr_prontuario (paciente_id, token, criado_por)
    VALUES (p_paciente_id, externo_novo_token(), v_prof)
    RETURNING token INTO v_token;

    RETURN v_token;
END $$;

-- ── Área externa: resolver o QR (sem login) ─────────────────────────────────

CREATE OR REPLACE FUNCTION externo_qr_resolver(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_pac record;
BEGIN
    SELECT p.id, p.nome_completo
      INTO v_pac
      FROM qr_prontuario q
      JOIN pacientes p ON p.id = q.paciente_id
     WHERE q.token = p_token AND q.ativo;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'erro', 'token_invalido');
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'paciente_id', v_pac.id,
        'rotulo', externo_rotulo_paciente(v_pac.nome_completo)
    );
END $$;

-- ── Área externa: autocadastro ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION externo_autocadastro(
    p_token         text,
    p_nome          text,
    p_email         text,
    p_senha         text,
    p_telefone      text DEFAULT NULL,
    p_conselho      text DEFAULT NULL,
    p_registro      text DEFAULT NULL,
    p_especialidade text DEFAULT NULL,
    p_clinica_nome  text DEFAULT NULL,
    p_cpf           text DEFAULT NULL,
    p_ip            text DEFAULT NULL,
    p_ua            text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_pac_id uuid;
    v_id     uuid;
BEGIN
    IF btrim(coalesce(p_nome, '')) = '' OR btrim(coalesce(p_email, '')) = '' THEN
        RETURN jsonb_build_object('ok', false, 'erro', 'dados_incompletos');
    END IF;
    IF length(coalesce(p_senha, '')) < 8 THEN
        RETURN jsonb_build_object('ok', false, 'erro', 'senha_curta');
    END IF;

    -- O paciente do QR é opcional: dá para se cadastrar sem ter escaneado.
    IF p_token IS NOT NULL THEN
        SELECT paciente_id INTO v_pac_id
          FROM qr_prontuario WHERE token = p_token AND ativo;
    END IF;

    IF EXISTS (SELECT 1 FROM usuarios_externos WHERE lower(email) = lower(btrim(p_email))) THEN
        RETURN jsonb_build_object('ok', false, 'erro', 'email_existe');
    END IF;

    INSERT INTO usuarios_externos (
        nome_completo, email, telefone, conselho, registro, especialidade,
        cpf, clinica_nome_informado, senha_hash,
        situacao, origem, ativo, solicitado_em, aceite_lgpd_em
    ) VALUES (
        btrim(p_nome), lower(btrim(p_email)), p_telefone,
        nullif(btrim(coalesce(p_conselho, '')), ''), nullif(btrim(coalesce(p_registro, '')), ''),
        nullif(btrim(coalesce(p_especialidade, '')), ''), nullif(btrim(coalesce(p_cpf, '')), ''),
        nullif(btrim(coalesce(p_clinica_nome, '')), ''),
        crypt(p_senha, gen_salt('bf', 10)),
        'pendente', 'autocadastro', false, now(), now()
    )
    RETURNING id INTO v_id;

    -- Escaneou o QR de um paciente? Já entra a solicitação junto, para o admin
    -- resolver as duas coisas de uma vez.
    IF v_pac_id IS NOT NULL THEN
        INSERT INTO solicitacoes_acesso_externo (usuario_externo_id, paciente_id, origem)
        VALUES (v_id, v_pac_id, 'qr');
    END IF;

    INSERT INTO auditoria_externa (usuario_externo_id, acao, paciente_id, detalhes, ip, user_agent)
    VALUES (v_id, 'autocadastro', v_pac_id,
            jsonb_build_object('email', lower(btrim(p_email)), 'com_qr', v_pac_id IS NOT NULL),
            p_ip, p_ua);

    RETURN jsonb_build_object('ok', true, 'situacao', 'pendente',
                              'com_solicitacao', v_pac_id IS NOT NULL);
END $$;

-- ── Área externa: login ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION externo_login(
    p_email text,
    p_senha text,
    p_ip    text DEFAULT NULL,
    p_ua    text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_u     record;
    v_token text;
BEGIN
    SELECT * INTO v_u
      FROM usuarios_externos
     WHERE lower(email) = lower(btrim(coalesce(p_email, '')));

    IF NOT FOUND OR v_u.senha_hash IS NULL
       OR crypt(coalesce(p_senha, ''), v_u.senha_hash) <> v_u.senha_hash THEN
        RETURN jsonb_build_object('ok', false, 'erro', 'credenciais');
    END IF;

    IF v_u.situacao = 'recusado' THEN
        RETURN jsonb_build_object('ok', false, 'erro', 'recusado',
                                  'motivo', v_u.recusa_motivo);
    END IF;

    -- Pendente entra: ele precisa ver a tela dizendo que está em análise.
    v_token := externo_novo_token() || externo_novo_token();

    INSERT INTO sessoes_externas (usuario_externo_id, token_hash, ip, user_agent)
    VALUES (v_u.id, encode(digest(v_token, 'sha256'), 'hex'), p_ip, p_ua);

    UPDATE usuarios_externos SET ultimo_login_em = now() WHERE id = v_u.id;

    INSERT INTO auditoria_externa (usuario_externo_id, acao, detalhes, ip, user_agent)
    VALUES (v_u.id, 'login', jsonb_build_object('situacao', v_u.situacao), p_ip, p_ua);

    RETURN jsonb_build_object('ok', true, 'sessao', v_token,
                              'nome', v_u.nome_completo, 'situacao', v_u.situacao);
END $$;

CREATE OR REPLACE FUNCTION externo_logout(p_sessao text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
    UPDATE sessoes_externas
       SET encerrada_em = now()
     WHERE token_hash = encode(digest(coalesce(p_sessao, ''), 'sha256'), 'hex')
       AND encerrada_em IS NULL;
    RETURN jsonb_build_object('ok', true);
END $$;

-- ── Área externa: painel ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION externo_painel(p_sessao text, p_token text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_uid        uuid;
    v_u          record;
    v_pac_id     uuid;
    v_rotulo     text;
    v_qr_estado  text;
    v_liberados  jsonb;
    v_pendentes  jsonb;
BEGIN
    SELECT s.usuario_externo_id INTO v_uid
      FROM sessoes_externas s
     WHERE s.token_hash = encode(digest(coalesce(p_sessao, ''), 'sha256'), 'hex')
       AND s.encerrada_em IS NULL AND s.expira_em > now();

    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'erro', 'sessao_invalida');
    END IF;

    SELECT * INTO v_u FROM usuarios_externos WHERE id = v_uid;

    IF v_u.situacao <> 'aprovado' OR NOT v_u.ativo THEN
        RETURN jsonb_build_object('ok', true, 'situacao', v_u.situacao,
                                  'nome', v_u.nome_completo,
                                  'motivo', v_u.recusa_motivo);
    END IF;

    -- Pacientes já liberados para ele, com prazo em pé.
    SELECT coalesce(jsonb_agg(jsonb_build_object(
               'acesso_id', a.id,
               'paciente_id', p.id,
               'nome', p.nome_completo,
               'escopo', a.escopo,
               'expira_em', a.expira_em
           ) ORDER BY p.nome_completo), '[]'::jsonb)
      INTO v_liberados
      FROM acessos_externos a
      JOIN pacientes p ON p.id = a.paciente_id
     WHERE a.usuario_externo_id = v_uid AND a.ativo
       AND (a.expira_em IS NULL OR a.expira_em > now());

    SELECT coalesce(jsonb_agg(jsonb_build_object(
               'id', s.id,
               'rotulo', externo_rotulo_paciente(p.nome_completo),
               'solicitado_em', s.solicitado_em
           ) ORDER BY s.solicitado_em DESC), '[]'::jsonb)
      INTO v_pendentes
      FROM solicitacoes_acesso_externo s
      JOIN pacientes p ON p.id = s.paciente_id
     WHERE s.usuario_externo_id = v_uid AND s.situacao = 'pendente';

    -- Veio de um QR? Diz em que pé está aquele paciente específico.
    IF p_token IS NOT NULL THEN
        SELECT paciente_id INTO v_pac_id FROM qr_prontuario
         WHERE token = p_token AND ativo;

        IF v_pac_id IS NOT NULL THEN
            SELECT externo_rotulo_paciente(nome_completo) INTO v_rotulo
              FROM pacientes WHERE id = v_pac_id;

            IF EXISTS (SELECT 1 FROM acessos_externos
                        WHERE usuario_externo_id = v_uid AND paciente_id = v_pac_id
                          AND ativo AND (expira_em IS NULL OR expira_em > now())) THEN
                v_qr_estado := 'liberado';
            ELSIF EXISTS (SELECT 1 FROM solicitacoes_acesso_externo
                           WHERE usuario_externo_id = v_uid AND paciente_id = v_pac_id
                             AND situacao = 'pendente') THEN
                v_qr_estado := 'pendente';
            ELSE
                v_qr_estado := 'pode_solicitar';
            END IF;
        ELSE
            v_qr_estado := 'token_invalido';
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'ok', true, 'situacao', 'aprovado', 'nome', v_u.nome_completo,
        'liberados', v_liberados, 'solicitacoes', v_pendentes,
        'qr', CASE WHEN p_token IS NULL THEN NULL ELSE jsonb_build_object(
                  'estado', v_qr_estado, 'rotulo', v_rotulo,
                  'paciente_id', v_pac_id) END
    );
END $$;

-- ── Área externa: pedir acesso a um prontuário ──────────────────────────────

CREATE OR REPLACE FUNCTION externo_solicitar_acesso(
    p_sessao   text,
    p_token    text,
    p_mensagem text DEFAULT NULL,
    p_ip       text DEFAULT NULL,
    p_ua       text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_uid    uuid;
    v_sit    text;
    v_pac_id uuid;
BEGIN
    SELECT s.usuario_externo_id INTO v_uid
      FROM sessoes_externas s
     WHERE s.token_hash = encode(digest(coalesce(p_sessao, ''), 'sha256'), 'hex')
       AND s.encerrada_em IS NULL AND s.expira_em > now();

    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'erro', 'sessao_invalida');
    END IF;

    SELECT situacao INTO v_sit FROM usuarios_externos WHERE id = v_uid AND ativo;
    IF v_sit IS DISTINCT FROM 'aprovado' THEN
        RETURN jsonb_build_object('ok', false, 'erro', 'nao_aprovado');
    END IF;

    SELECT paciente_id INTO v_pac_id FROM qr_prontuario WHERE token = p_token AND ativo;
    IF v_pac_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'erro', 'token_invalido');
    END IF;

    IF EXISTS (SELECT 1 FROM acessos_externos
                WHERE usuario_externo_id = v_uid AND paciente_id = v_pac_id
                  AND ativo AND (expira_em IS NULL OR expira_em > now())) THEN
        RETURN jsonb_build_object('ok', true, 'estado', 'liberado');
    END IF;

    INSERT INTO solicitacoes_acesso_externo (usuario_externo_id, paciente_id, origem, mensagem)
    VALUES (v_uid, v_pac_id, 'qr', nullif(btrim(coalesce(p_mensagem, '')), ''))
    ON CONFLICT DO NOTHING;

    INSERT INTO auditoria_externa (usuario_externo_id, acao, paciente_id, detalhes, ip, user_agent)
    VALUES (v_uid, 'solicitar_acesso', v_pac_id, NULL, p_ip, p_ua);

    RETURN jsonb_build_object('ok', true, 'estado', 'pendente');
END $$;

-- ── Admin: aprovar / recusar cadastro ───────────────────────────────────────

CREATE OR REPLACE FUNCTION externo_aprovar_cadastro(
    p_usuario_externo_id uuid,
    p_clinica_externa_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_prof uuid;
BEGIN
    IF NOT is_admin() THEN
        RAISE EXCEPTION 'Somente administradores podem aprovar cadastros externos.';
    END IF;

    SELECT id INTO v_prof FROM profissionais WHERE auth_user_id = auth.uid();

    UPDATE usuarios_externos
       SET situacao = 'aprovado', ativo = true,
           aprovado_em = now(), aprovado_por = v_prof, recusa_motivo = NULL,
           clinica_externa_id = coalesce(p_clinica_externa_id, clinica_externa_id)
     WHERE id = p_usuario_externo_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Profissional externo não encontrado.';
    END IF;

    INSERT INTO auditoria_externa (usuario_externo_id, acao, detalhes)
    VALUES (p_usuario_externo_id, 'cadastro_aprovado',
            jsonb_build_object('por', v_prof));

    RETURN jsonb_build_object('ok', true);
END $$;

CREATE OR REPLACE FUNCTION externo_recusar_cadastro(
    p_usuario_externo_id uuid,
    p_motivo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_prof uuid;
BEGIN
    IF NOT is_admin() THEN
        RAISE EXCEPTION 'Somente administradores podem recusar cadastros externos.';
    END IF;

    SELECT id INTO v_prof FROM profissionais WHERE auth_user_id = auth.uid();

    UPDATE usuarios_externos
       SET situacao = 'recusado', ativo = false, recusa_motivo = p_motivo
     WHERE id = p_usuario_externo_id;

    UPDATE solicitacoes_acesso_externo
       SET situacao = 'recusada', respondido_em = now(), respondido_por = v_prof,
           resposta_motivo = 'cadastro recusado'
     WHERE usuario_externo_id = p_usuario_externo_id AND situacao = 'pendente';

    UPDATE sessoes_externas SET encerrada_em = now()
     WHERE usuario_externo_id = p_usuario_externo_id AND encerrada_em IS NULL;

    INSERT INTO auditoria_externa (usuario_externo_id, acao, detalhes)
    VALUES (p_usuario_externo_id, 'cadastro_recusado',
            jsonb_build_object('por', v_prof, 'motivo', p_motivo));

    RETURN jsonb_build_object('ok', true);
END $$;

-- ── Admin: responder solicitação de prontuário ──────────────────────────────
-- Aprovar aqui é o mesmo que liberar pela pasta do paciente: cria a linha em
-- acessos_externos com escopo e prazo.

CREATE OR REPLACE FUNCTION externo_responder_solicitacao(
    p_solicitacao_id uuid,
    p_aprovar        boolean,
    p_escopo         text[] DEFAULT ARRAY['resultados', 'evolucoes', 'laudos'],
    p_dias           integer DEFAULT 90,
    p_motivo         text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_prof   uuid;
    v_s      record;
    v_acesso uuid;
BEGIN
    IF NOT is_admin() THEN
        RAISE EXCEPTION 'Somente administradores podem responder solicitações.';
    END IF;

    SELECT * INTO v_s FROM solicitacoes_acesso_externo WHERE id = p_solicitacao_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Solicitação não encontrada.';
    END IF;
    IF v_s.situacao <> 'pendente' THEN
        RETURN jsonb_build_object('ok', false, 'erro', 'ja_respondida');
    END IF;

    SELECT id INTO v_prof FROM profissionais WHERE auth_user_id = auth.uid();

    IF p_aprovar THEN
        -- Se já existe acesso ativo, reaproveita em vez de duplicar.
        SELECT id INTO v_acesso FROM acessos_externos
         WHERE usuario_externo_id = v_s.usuario_externo_id
           AND paciente_id = v_s.paciente_id AND ativo
           AND (expira_em IS NULL OR expira_em > now())
         LIMIT 1;

        IF v_acesso IS NULL THEN
            INSERT INTO acessos_externos (usuario_externo_id, paciente_id, escopo,
                                          concedido_por, expira_em)
            VALUES (v_s.usuario_externo_id, v_s.paciente_id,
                    coalesce(p_escopo, ARRAY['resultados', 'evolucoes', 'laudos']),
                    v_prof, now() + make_interval(days => coalesce(p_dias, 90)))
            RETURNING id INTO v_acesso;
        END IF;

        UPDATE solicitacoes_acesso_externo
           SET situacao = 'aprovada', respondido_em = now(),
               respondido_por = v_prof, acesso_id = v_acesso
         WHERE id = p_solicitacao_id;
    ELSE
        UPDATE solicitacoes_acesso_externo
           SET situacao = 'recusada', respondido_em = now(),
               respondido_por = v_prof, resposta_motivo = p_motivo
         WHERE id = p_solicitacao_id;
    END IF;

    INSERT INTO auditoria_externa (usuario_externo_id, acao, paciente_id, detalhes)
    VALUES (v_s.usuario_externo_id,
            CASE WHEN p_aprovar THEN 'solicitacao_aprovada' ELSE 'solicitacao_recusada' END,
            v_s.paciente_id,
            jsonb_build_object('por', v_prof, 'dias', p_dias, 'escopo', p_escopo,
                               'motivo', p_motivo));

    RETURN jsonb_build_object('ok', true, 'acesso_id', v_acesso);
END $$;

-- ── Permissões ──────────────────────────────────────────────────────────────
-- As funções da área externa só podem ser chamadas pela Edge Function
-- (service_role). Ninguém com a anon key chega nelas.

REVOKE ALL ON FUNCTION externo_qr_resolver(text)                        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION externo_autocadastro(text,text,text,text,text,text,text,text,text,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION externo_login(text,text,text,text)               FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION externo_logout(text)                             FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION externo_painel(text,text)                        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION externo_solicitar_acesso(text,text,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION externo_novo_token()                             FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION externo_qr_resolver(text)                        TO service_role;
GRANT EXECUTE ON FUNCTION externo_autocadastro(text,text,text,text,text,text,text,text,text,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION externo_login(text,text,text,text)               TO service_role;
GRANT EXECUTE ON FUNCTION externo_logout(text)                             TO service_role;
GRANT EXECUTE ON FUNCTION externo_painel(text,text)                        TO service_role;
GRANT EXECUTE ON FUNCTION externo_solicitar_acesso(text,text,text,text,text) TO service_role;

-- Estas são do CORTEX: exigem admin logado e checam is_admin() por dentro.
REVOKE ALL ON FUNCTION qr_prontuario_token(uuid)                        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION qr_prontuario_rotacionar(uuid)                   FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION externo_aprovar_cadastro(uuid,uuid)              FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION externo_recusar_cadastro(uuid,text)              FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION externo_responder_solicitacao(uuid,boolean,text[],integer,text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION qr_prontuario_token(uuid)                     TO authenticated;
GRANT EXECUTE ON FUNCTION qr_prontuario_rotacionar(uuid)                TO authenticated;
GRANT EXECUTE ON FUNCTION externo_aprovar_cadastro(uuid,uuid)           TO authenticated;
GRANT EXECUTE ON FUNCTION externo_recusar_cadastro(uuid,text)           TO authenticated;
GRANT EXECUTE ON FUNCTION externo_responder_solicitacao(uuid,boolean,text[],integer,text) TO authenticated;

COMMIT;

-- ============================================================================
-- CONFERÊNCIA
-- ============================================================================
SELECT
    (SELECT count(*) FROM information_schema.columns
      WHERE table_name = 'usuarios_externos'
        AND column_name IN ('situacao','origem','senha_hash','solicitado_em','aprovado_em')) AS colunas_novas_5,
    (SELECT count(*) FROM information_schema.tables
      WHERE table_name IN ('qr_prontuario','solicitacoes_acesso_externo','sessoes_externas','auditoria_externa')) AS tabelas_novas_4,
    (SELECT count(*) FROM pg_proc WHERE proname LIKE 'externo\_%' OR proname LIKE 'qr\_prontuario\_%') AS funcoes_13;

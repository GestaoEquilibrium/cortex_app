# Guia 11 — Cadastro do primeiro usuário (Admin-clínico)

**Tempo estimado:** 5 minutos.
**Quando fazer:** APÓS rodar todos os SQLs (02 a 10) do Sprint A2.

---

## Por que fazer pelo painel, não pelo SQL

Quando você cria um usuário pelo painel **Authentication → Users**, o Supabase:
1. Cria um registro em `auth.users` (tabela interna do Supabase)
2. Dispara o trigger `handle_new_user` (que rodamos no SQL 03)
3. O trigger cria automaticamente um registro em `profissionais` com perfil padrão

Se você criasse direto via SQL, ia precisar manipular `auth.users` manualmente — risco de bagunçar a autenticação.

---

## Passo 1 — Acessa o painel de Users

1. No projeto Supabase, menu lateral → **🔒 Authentication** → **Users**
2. Clica no botão **"+ Add user"** no canto superior direito
3. Escolhe **"Create new user"**

---

## Passo 2 — Cadastra você

Preenche:

| Campo | Valor sugerido |
|---|---|
| **Email** | seu e-mail principal (o que você usa profissionalmente) |
| **Password** | senha forte (mínimo 8 caracteres, com letras, números) |
| **Auto Confirm User?** | ✅ **Marcar** (importante!) |

⚠️ **"Auto Confirm User" é obrigatório.** Se você não marcar, o Supabase manda um e-mail de confirmação que você precisaria abrir antes de fazer login. Como desabilitamos confirmação de e-mail no Guia 01, marcar essa caixa é o equivalente.

Clica em **"Create user"**.

---

## Passo 3 — Verifica se o trigger funcionou

O trigger `handle_new_user` deve ter criado um registro em `profissionais` automaticamente.

Vai no **SQL Editor** e roda:

```sql
SELECT
    p.id,
    p.nome_completo,
    p.email,
    p.perfil,
    p.ativo,
    p.created_at,
    u.email AS auth_email,
    u.id AS auth_user_id
FROM profissionais p
JOIN auth.users u ON u.id = p.auth_user_id
ORDER BY p.created_at DESC;
```

**Deve aparecer 1 linha** com:
- `nome_completo`: provavelmente vazio ou igual ao seu e-mail
- `email`: seu e-mail
- `perfil`: `admin_clinico` (o trigger atribui isso por padrão para o primeiro usuário, que é você)
- `ativo`: `true`

Se não aparecer nada, **pare aqui e me avise**.

---

## Passo 4 — Atualiza seu cadastro com nome e CRP

Agora roda o **arquivo `12_atualiza_admin_clinico.sql`**, que vai atualizar seu registro com seu nome completo, CRP e foto se quiser.

**IMPORTANTE:** abre o arquivo e edita o e-mail antes de rodar — você precisa colocar SEU e-mail (o mesmo que você acabou de cadastrar) na linha indicada.

---

## Passo 5 — Confirma os dados finais

Roda novamente:

```sql
SELECT
    nome_completo,
    crp,
    email,
    perfil,
    ativo
FROM profissionais
WHERE email = 'SEU-EMAIL@dominio.com';
```

Deve aparecer:
- Nome: Wessilon Marques de Sousa
- CRP: 04/53832
- Email: o seu
- Perfil: admin_clinico
- Ativo: true

---

## Pronto, você está cadastrado!

Próximo passo: configurar o **frontend/config.js** com a URL e a anon key do projeto, depois abrir o `index.html` para fazer login.

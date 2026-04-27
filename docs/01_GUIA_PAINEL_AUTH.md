# Guia 01 — Configuração do Painel Supabase Auth

**Tempo estimado:** 5 minutos.
**Quando fazer:** ANTES de rodar qualquer SQL do Sprint A2.

---

## O que vamos fazer

Configurar o Supabase Auth (sistema de login) com **e-mail + senha**. Decidimos por senha em vez de magic link (link mágico) para evitar dependência de e-mail no dia a dia da clínica.

---

## Passo 1 — Acessa o projeto

1. Entra em https://supabase.com e faz login
2. Abre o projeto **`cortex-app`**

---

## Passo 2 — Configurações de Authentication

No menu lateral esquerdo, clica em **🔒 Authentication** → **Providers**.

### 2.1 Email Provider

Você verá um card **"Email"**. Clica nele.

Configurações que você deve garantir:

| Configuração | Valor | Observação |
|---|---|---|
| **Enable email provider** | ✅ Ativado | Habilita login por e-mail |
| **Confirm email** | ❌ Desativado | Para clínica interna, simplifica vida da equipe |
| **Secure email change** | ✅ Ativado | Protege contra mudança de e-mail sem confirmação |
| **Secure password change** | ✅ Ativado | Pede senha atual antes de trocar |

Clica em **Save** no canto inferior do card.

### 2.2 Outros Providers

**Não habilita** Magic Link, Google, GitHub, etc. agora. Mantém só o email/senha pra simplicidade.

---

## Passo 3 — Configurações de URL e Site

No menu lateral, ainda em **Authentication**, clica em **URL Configuration**.

### 3.1 Site URL

Por enquanto, como vamos rodar o frontend localmente:

```
http://localhost:8000
```

(quando publicarmos no GitHub Pages, troca para `https://gestaoequilibrium.github.io/cortex_app`)

### 3.2 Redirect URLs

Adiciona estas duas URLs (clica em **Add URL** para cada):

```
http://localhost:8000/**
http://localhost:8000/dashboard.html
```

Clica em **Save**.

---

## Passo 4 — Pega as credenciais do projeto (CRÍTICO)

Você vai precisar de duas informações pra conectar o frontend ao Supabase. **Anota com cuidado**, vamos usar mais tarde no `config.js`.

No menu lateral, clica no **ícone de engrenagem (⚙️ Project Settings)** → **API**.

### 4.1 Project URL

Aparece algo como:
```
https://abcdefghij.supabase.co
```

**Copia isso.** É a URL única do seu projeto.

### 4.2 anon / public key

Logo abaixo, você verá uma chave bem longa começando com `eyJhbGc...`. Tem 3 chaves na página:

| Nome | Usar onde | Sensibilidade |
|---|---|---|
| **anon / public** | ✅ Frontend (vai no config.js) | Pública, segura para HTML |
| **service_role** | ❌ NUNCA no frontend | Permissão total, ignora RLS |
| **JWT secret** | ❌ Não toque agora | Avançado |

**Copia a `anon / public` key.** Ela é a única que vai no frontend.

---

## Passo 5 — Salva tudo num arquivo de notas seguro

Cria um arquivo só seu (gerenciador de senhas, OneNote privado, etc.) com:

```
========================================
CORTEX_APP — Credenciais Supabase
========================================

Project URL: https://abcdefghij.supabase.co
Anon key: eyJhbGc...
DB password: (a que você definiu na criação do projeto)

Painel: https://supabase.com/dashboard/project/abcdefghij
========================================
```

**NUNCA commit isso em repositório público.** A `service_role` key, em particular, dá acesso TOTAL ao banco ignorando todas as proteções de RLS.

---

## Validação

Ao final, no painel **Authentication → Users**, você deve ver uma lista vazia (nenhum usuário ainda — vamos cadastrar você no Guia 11).

Se chegou até aqui sem erro, **passa para a Parte 2** do Sprint A2:

> Próximo arquivo: `database/02_funcoes_auxiliares_rls.sql`

---

## Em caso de dúvida

- **Não vejo "Authentication" no menu lateral:** confere se está no projeto certo (deve aparecer "cortex-app" no topo)
- **"Email Provider" já está ativo:** ótimo, é o padrão. Só confere as outras configurações.
- **Confundi as keys:** volta no Settings → API e copia novamente. As keys nunca expiram (só mudam se você gerar novas manualmente).

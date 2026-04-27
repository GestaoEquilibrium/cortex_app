# Guia 14 — Como rodar o frontend localmente

**Tempo estimado:** 5 minutos.
**Quando fazer:** APÓS configurar o `config.js` com suas credenciais Supabase.

---

## Por que precisamos rodar com servidor local

Você poderia tentar abrir o `index.html` direto com duplo clique, mas o navegador bloqueia muitas operações por segurança (CORS, módulos JS, requisições para APIs). A solução é rodar um **servidor local simples** em 1 minuto.

Vou te dar **3 opções** — escolhe a mais fácil pra você.

---

## Opção 1 — Python (mais fácil, geralmente já instalado)

### 1. Verifica se tem Python

Abre o **PowerShell** e roda:

```powershell
python --version
```

Se aparecer `Python 3.X.X`, está instalado. Se não, pula para a Opção 2.

### 2. Vai para a pasta do frontend

No PowerShell, navega até a pasta `frontend` do projeto:

```powershell
cd "D:\NOVO CORTEX\cortex_app_inicial\cortex_app\frontend"
```

(ajusta o caminho conforme sua pasta real)

### 3. Inicia o servidor

```powershell
python -m http.server 8000
```

Saída esperada:
```
Serving HTTP on :: port 8000 (http://[::]:8000/) ...
```

### 4. Abre no navegador

Abre o navegador (Chrome, Firefox, Edge) e vai pra:

```
http://localhost:8000
```

A tela de login do CORTEX_APP deve aparecer.

### 5. Para parar o servidor

No PowerShell, tecla `Ctrl + C`.

---

## Opção 2 — VS Code com Live Server (recomendado se você usar VS Code)

### 1. Instala VS Code

Se ainda não tem: https://code.visualstudio.com/

### 2. Instala a extensão Live Server

- Abre o VS Code
- Aba lateral esquerda → ícone de blocos (Extensions)
- Pesquisa: `Live Server` (autor: Ritwick Dey)
- Clica em **Install**

### 3. Abre a pasta do projeto

- Menu **File → Open Folder**
- Navega até a pasta `frontend` do CORTEX
- Abre

### 4. Inicia o Live Server

- Clica com botão direito em `index.html`
- Seleciona **"Open with Live Server"**

O navegador abre automaticamente em `http://127.0.0.1:5500/index.html`.

⚠️ **Atenção:** se usar Live Server, a porta padrão é `5500`, não `8000`.
Você precisa adicionar `http://127.0.0.1:5500/**` nas Redirect URLs do Supabase
(painel Authentication → URL Configuration).

---

## Opção 3 — Node.js (se tiver instalado)

```powershell
npx serve -l 8000
```

Mesma URL: `http://localhost:8000`

---

## Validação: o que você deve ver

Quando abrir `http://localhost:8000`:

✅ Tela de login com:
- Logo do pinwheel Equilibrium (4 pétalas em azul/teal)
- Título "CORTEX_APP"
- Subtítulo "Equilibrium · Movimento que Acolhe"
- Campos de e-mail e senha
- Botão "Entrar"
- Lado direito com fundo navy + citação + badges

❌ Se aparecer erro no console do navegador (F12 → Console):
- "config.js precisa ser preenchido" → você não substituiu a URL/key
- "Failed to fetch" → URL do Supabase está errada
- "Invalid API key" → anon key está errada

---

## Fazendo o primeiro login

1. Coloca o e-mail e senha que você cadastrou no painel Authentication
2. Clica em **Entrar**
3. Botão muda para "Verificando..."
4. Se tudo certo: redireciona para `dashboard.html`
5. No dashboard, deve aparecer:
   - "Bem-vindo ao CORTEX_APP, Wessilon 👋"
   - Badge "Admin Clínico" abaixo
   - Mensagem sobre o marco do primeiro login
   - Lista dos próximos passos do projeto

---

## Se algo der errado

### Login não funciona — "E-mail ou senha incorretos"

- Confere se o e-mail é exatamente o cadastrado em Authentication → Users
- Se esqueceu a senha, no painel Authentication → Users, clica nos 3 pontinhos do seu usuário → "Send password recovery"

### Login funciona mas dashboard mostra "Carregando..." infinito

- Abre F12 → Console no navegador
- Procura erros relacionados a RLS ou "row level security"
- **Se aparecer "Permission denied" ao buscar profissionais:** o trigger `handle_new_user` não funcionou — me avise

### Erro "Refused to connect" ou "ERR_BLOCKED_BY_CLIENT"

- Provavelmente é uma extensão do navegador bloqueando (adblock, privacy)
- Tenta no modo anônimo / janela privada

### Outro erro

- Copia a mensagem do console
- Tira print da tela inteira
- Me manda

# Guia de Deploy em Produção: DocFlow

Este documento descreve o procedimento passo a passo para colocar a aplicação **DocFlow** em produção utilizando o **Render** (para a aplicação Express via Docker) e o **Clever Cloud** (para o banco de dados gerenciado MySQL 8 no plano gratuito/DEV), conforme especificado em `SPECIFICATION.md` (Seção 1.3).

---

## 1. Visão Geral da Arquitetura em Produção

```
┌────────────────────────────────────────────────────────┐
│  Render (Web Service Free)                             │
│  - Build a partir do Dockerfile                        │
│  - Node.js 20+ / Express                               │
│  - Executa migrações automáticas: prisma migrate deploy │
│  - Criptografia AES-256-GCM em nível de aplicação      │
│  - HTTPS nativo gerido pelo Render                     │
└──────────────────────────┬─────────────────────────────┘
                           │ Conexão SSL / DATABASE_URL
                           ▼
┌────────────────────────────────────────────────────────┐
│  Clever Cloud (Add-on MySQL - Plano DEV)               │
│  - MySQL 8.x gerenciado                                │
│  - Armazena dados e arquivos cifrados (arquivoConteudo)│
│  - Sessões persistidas na tabela Session               │
└────────────────────────────────────────────────────────┘
```

---

## 2. Passo 1: Criação e Configuração do Banco no Clever Cloud

1. **Acessar o Painel do Clever Cloud:**
   - Acesse [https://console.clever-cloud.com/](https://console.clever-cloud.com/) e faça login (ou crie sua conta gratuita).
2. **Criar um novo Add-on MySQL:**
   - No painel principal (*Dashboard*), clique em **Create** > **an add-on**.
   - Selecione a opção **MySQL**.
   - Escolha o plano **DEV** (plano gratuito sem custo).
   - Escolha a região mais próxima (ex: *Paris / Gravelines* ou *Montreal*).
   - Dê um nome ao add-on (ex.: `docflow-mysql-prod`) e confirme a criação.
3. **Obter as Credenciais e a `DATABASE_URL`:**
   - Acesse a página do add-on MySQL recém-criado.
   - No menu lateral, clique em **Environment Variables** ou **Connection details**.
   - O Clever Cloud disponibiliza a variável `MYSQL_ADDON_URI` (ou exibe *Host*, *Database*, *User*, *Password* e *Port*).
   - A string de conexão do Prisma deve seguir o formato:
     ```
     mysql://<USER>:<PASSWORD>@<HOST>:<PORT>/<DATABASE>
     ```
   - **Exemplo real Clever Cloud:**
     ```
     mysql://ukmq35lhg4e64lzz:Udhnt7PUip5CHu1myz3@bv7ooagllra63fgmjlmg-mysql.services.clever-cloud.com:20288/bv7ooagllra63fgmjlmg
     ```
   - *Guarde essa URL, ela será utilizada no Render como `DATABASE_URL`.*

---

## 3. Passo 2: Configuração e Deploy do Web Service no Render

1. **Garantir o Repositório no GitHub:**
   - Certifique-se de que o código do projeto DocFlow está versionado e atualizado no seu repositório no GitHub (incluindo o `Dockerfile`, `prisma/schema.prisma` e `prisma/migrations`).
2. **Criar o Web Service no Render:**
   - Acesse o painel do [Render Dashboard](https://dashboard.render.com/).
   - Clique em **New +** no canto superior direito e selecione **Web Service**.
   - Escolha a opção **Build and deploy from a Git repository**.
   - Conecte sua conta do GitHub e selecione o repositório `docflow`.
3. **Configurações Básicas do Serviço:**
   - **Name:** `docflow-app` (ou o nome desejado).
   - **Region:** Escolha a região mais próxima ao seu banco (ex: *Frankfurt* ou *Ohio*).
   - **Branch:** `main` (ou a branch principal).
   - **Runtime:** Selecione **Docker** (o Render detectará automaticamente o `Dockerfile` na raiz).
   - **Instance Type:** Selecione o plano **Free**.
4. **Configuração das Variáveis de Ambiente:**
   - No formulário de criação (ou em **Environment** após criar), adicione as seguintes variáveis:

| Chave | Descrição | Exemplo de Valor |
|---|---|---|
| `NODE_ENV` | Modo de execução da aplicação | `production` |
| `PORT` | Porta onde a aplicação escuta no container | `3000` |
| `DATABASE_URL` | String de conexão MySQL do Clever Cloud | `mysql://user:pass@host:3306/dbname` |
| `SESSION_SECRET` | Chave forte para assinatura de sessões | `generate-a-strong-random-secret-string` |
| `ENCRYPTION_KEY` | Chave de 32 bytes em hexadecimal para AES-256-GCM | `f748968a35e54c9e22435a3b2ac07b2e068be160197c83f3120bc9622bf699c0` |
| `BASE_URL` | URL pública da sua aplicação no Render | `https://docflow-app.onrender.com` |

> [!IMPORTANT]
> **Como gerar uma `ENCRYPTION_KEY` válida (64 caracteres hexadecimais = 32 bytes):**
> Execute no seu terminal:
> ```bash
> node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
> ```
> Copie o valor gerado e cole no campo `ENCRYPTION_KEY` no painel do Render.

5. **Deploy Automático e Execução de Migrações:**
   - Clique em **Create Web Service**.
   - O Render iniciará o build da imagem Docker:
     - Instalará as dependências (`npm ci`).
     - Gerará o Prisma Client (`npx prisma generate`).
     - Iniciará o container com o comando `CMD ["sh", "-c", "npx prisma migrate deploy && node server.js"]`.
   - O comando de inicialização executa automaticamente todas as migrations pendentes no Clever Cloud antes de subir o servidor Express, garantindo que o schema esteja sempre atualizado.

---

## 4. Passo 3: Verificação e Testes Pós-Deploy

1. **Acompanhar os Logs:**
   - No painel do Render, vá até a aba **Logs**.
   - Você verá a saída da execução da migration:
     ```
     Applying migration `20260925234851_init`
     All migrations have been successfully applied.
     [DocFlow] Servidor rodando na porta 3000
     [DocFlow] Acesso local: http://localhost:3000
     ```
2. **Acessar a Aplicação:**
   - Acesse a URL fornecida pelo Render: `https://<seu-app>.onrender.com`.
   - Verifique:
     - Redirecionamento correto para `/login`.
     - Cadastro de nova Empresa em `/empresas/cadastro`.
     - Login com sessão persistida no banco MySQL.
     - Criação de cliente e checklist de processo.
     - Upload de arquivo cifrado (AES-256-GCM) no banco e download decifrado.

---

## 5. Particularidades e Boas Práticas do Ambiente Gratuito

- **Cold-Start do Render (Plano Free):**
  - O Render coloca o Web Service em modo de espera (*sleep*) após ~15 minutos sem receber requisições HTTP.
  - A primeira requisição após o modo de espera pode levar entre 30 e 60 segundos para acordar o container. Isso é o comportamento esperado do tier gratuito.
- **Persistência Segura sem Escrita em Disco:**
  - Como o disco do Render é efêmero (arquivos em disco são perdidos ao reiniciar), o DocFlow grava todos os documentos enviados pelos clientes diretamente na coluna `DocumentoChecklist.arquivoConteudo` (`LONGBLOB`) do MySQL cifrados com AES-256-GCM, garantindo persistência duradoura e segurança total.

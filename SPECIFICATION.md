# Especificação Técnica: Sistema de Gestão de Coleta de Documentos (DocFlow)

---

## 0. Preparação do Projeto

Este arquivo deve ser executado a partir da raiz do diretório `docflow`.

Se o Node.js (LTS 20+) ainda não estiver instalado, instale-o antes de continuar.

Se o `package.json` não existir, inicialize o projeto:

```bash
npm init -y
```

Instale as dependências principais:

```bash
npm install express ejs express-session bcrypt multer express-validator connect-flash uuid dotenv @prisma/client @quixo3/prisma-session-store
npm install --save-dev nodemon jest supertest prisma eslint prettier
```

Inicialize o Prisma (cria `prisma/schema.prisma` e um `.env` com `DATABASE_URL` de exemplo):

```bash
npx prisma init --datasource-provider mysql
```

Se ainda não existir, crie a estrutura inicial de pastas nesta raiz:

```
docflow/
├── controllers/           # orquestram request/response, chamam services e renderizam views
├── middlewares/            # requireAuth, upload (multer), tratamento de erros
├── prisma/
│   ├── schema.prisma       # entidades, relações e constraints (Seção 2.1)
│   └── migrations/          # geradas pelo Prisma Migrate
├── routes/                  # Express Router, um arquivo por recurso
├── services/                 # regras de negócio (Seção 4) e operações atômicas
├── views/                     # templates EJS
│   └── partials/              # navbar.ejs, _messages.ejs, etc.
├── public/                     # CSS/JS estáticos
├── lib/
│   └── prisma.js               # instância única do PrismaClient
├── app.js
├── server.js
├── Dockerfile
├── docker-compose.yml           # serviços "app" (Node/Express) e "db" (MySQL)
└── .env                          # DATABASE_URL, SESSION_SECRET
```

Não recrie o projeto ou arquivos já existentes; se a estrutura já estiver presente, continue a implementação nela. Depois de criar ou alterar os models em `prisma/schema.prisma`, gere a migration e o client:

```bash
npx prisma migrate dev --name init
npx prisma generate
```

Para subir a aplicação e o banco via Docker:

```bash
docker compose up --build
```

---

## 1. Visão Geral e Stack

### 1.1 Objetivo
O **DocFlow** é um sistema web responsável por organizar a coleta de documentos entre empresas e seus clientes. O sistema permite que uma empresa cadastre clientes, monte uma checklist personalizada de documentos por cliente, gere um link único de envio e acompanhe, em um painel único, quais documentos já foram recebidos e quais ainda estão pendentes — até a conclusão automática do processo.

### 1.2 Stack Tecnológica
* **Linguagem:** JavaScript (Node.js 20+ LTS)
* **Framework Web:** Express 4.x
* **ORM:** Prisma 5.x (Prisma Client + Prisma Migrate)
* **Banco de Dados:** MySQL 8.x
* **Template Engine:** EJS, com Bootstrap 5 para estilo
* **Autenticação:** `express-session` (sessão) + `bcrypt` (hash da senha), sessão persistida no MySQL via `@quixo3/prisma-session-store`
* **Upload de Arquivos:** `multer`
* **Validação de Entrada:** `express-validator`
* **Mensagens Flash:** `connect-flash`
* **Containerização:** Docker + Docker Compose (serviço `app` + serviço `db` MySQL)
* **Testes:** Jest + Supertest

### 1.3 Arquitetura e Restrições
* **Padrão Arquitetural:** Express organizado em camadas, com toda regra de negócio numerada na Seção 4 concentrada em `services/`.
* **Camadas:**
  1. `Models` (`prisma/schema.prisma`): entidades, relações e constraints declaradas no schema Prisma; acesso em runtime via `@prisma/client`, instanciado uma única vez em `lib/prisma.js`.
  2. `Services` (`services/`): geração de token, transições de status, verificação de conclusão automática, envio de lembretes/links e todas as regras RN-XX.
  3. `Controllers` (`controllers/`): recebem `req`/`res`, chamam os services, renderizam views ou fazem `redirect`; nunca contêm regra de negócio.
  4. `Routes` (`routes/`): ligam método + URL ao controller correspondente.
  5. `Views` (`views/*.ejs`): apresentação, Bootstrap 5, mensagens do sistema.
  6. `Middlewares` (`middlewares/`): `requireAuth` (sessão), `upload` (multer), tratamento de erros.
* **Restrição de Camadas:** é proibido alterar o `status` de `Processo`/`DocumentoChecklist`, gerar `tokenAcesso`, ou executar qualquer regra da Seção 4 diretamente em controllers, rotas ou views — essas operações devem obrigatoriamente passar por `services/`.
* **Sem adições fora do escopo:** não introduza TypeScript, um frontend desacoplado (React/Vue), outro ORM (ex.: Sequelize, TypeORM) ou outro banco sem necessidade explícita; use a stack definida acima.
* **Multi-tenant lógico:** todo dado de `Cliente`, `Processo`, `DocumentoChecklist` e `LembreteEnviado` pertence a uma única `Empresa`; nenhum controller pode expor ou alterar dados de outra empresa.

---

## 2. Entidades e Dados

### 2.1 Modelo de Dados (Prisma Schema)

```prisma
// prisma/schema.prisma

enum Plano {
  GRATIS
  PRO
}

enum StatusProcesso {
  EM_ANDAMENTO
  CONCLUIDO
}

enum StatusDocumento {
  PENDENTE
  RECEBIDO
}

model Empresa {
  id          Int       @id @default(autoincrement())
  razaoSocial String    @db.VarChar(150)
  cnpj        String    @unique @db.VarChar(18)
  email       String    @unique @db.VarChar(255)   // login (RF03)
  senhaHash   String    @db.VarChar(255)
  plano       Plano     @default(GRATIS)
  ativa       Boolean   @default(true)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  clientes    Cliente[]
}

model Cliente {
  id        Int        @id @default(autoincrement())
  empresa   Empresa    @relation(fields: [empresaId], references: [id], onDelete: Cascade)
  empresaId Int
  nome      String     @db.VarChar(150)
  cpf       String     @db.VarChar(14)
  email     String?    @db.VarChar(255)
  telefone  String?    @db.VarChar(20)              // envio do link por e-mail/WhatsApp
  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt
  processos Processo[]

  @@unique([empresaId, cpf])
}

model Processo {
  id            Int                  @id @default(autoincrement())
  cliente       Cliente              @relation(fields: [clienteId], references: [id], onDelete: Cascade)
  clienteId     Int
  nomeProcesso  String               @db.VarChar(150)
  tokenAcesso   String               @unique @default(uuid())  // base do link público (RNF01, RNF02)
  status        StatusProcesso       @default(EM_ANDAMENTO)
  dataConclusao DateTime?
  createdAt     DateTime             @default(now())
  updatedAt     DateTime             @updatedAt
  documentos    DocumentoChecklist[]
  lembretes     LembreteEnviado[]
}

model DocumentoChecklist {
  id            Int              @id @default(autoincrement())
  processo      Processo         @relation(fields: [processoId], references: [id], onDelete: Cascade)
  processoId    Int
  nomeDocumento String           @db.VarChar(100)   // ex.: "RG", "Comprovante de Residência"
  status        StatusDocumento  @default(PENDENTE)
  arquivoPath   String?          @db.VarChar(255)   // caminho salvo pelo multer
  dataEnvio     DateTime?
}

// exclusivo do Plano Pro
model LembreteEnviado {
  id            Int       @id @default(autoincrement())
  processo      Processo  @relation(fields: [processoId], references: [id], onDelete: Cascade)
  processoId    Int
  dataHoraEnvio DateTime  @default(now())
}
```

> **Nota de design:** os IDs internos (`Int @id @default(autoincrement())`) nunca são expostos ao cliente final. O acesso do cliente ao processo usa exclusivamente o `tokenAcesso` opaco (UUID), nunca o `id` numérico — para não expor a contagem/sequência de processos da empresa.

### 2.2 Relacionamentos
* **Empresa → Cliente:** 1:N via `Cliente.empresaId`, `onDelete: Cascade`.
* **Cliente → Processo:** 1 Cliente pode ter N Processos ao longo do tempo (histórico), `onDelete: Cascade`.
* **Processo → DocumentoChecklist:** 1:N via `DocumentoChecklist.processoId`, `onDelete: Cascade`.
* **Processo → LembreteEnviado:** 1:N via `LembreteEnviado.processoId`, `onDelete: Cascade`.

---

## 3. Contratos de Rotas e Controllers

**Autenticação:** todas as rotas sob `/empresas`, `/clientes` e `/processos` passam pelo middleware `requireAuth` (sessão de empresa autenticada), exceto `/upload/:token`, que é pública e protegida apenas pelo `tokenAcesso` opaco do processo.

### 3.1 Tabela de Contratos

| URL | Método | Controller | Descrição | Redirecionamento (Sucesso) |
|---|---|---|---|---|
| `/empresas/cadastro` | `GET`, `POST` | `empresaController` | Cadastro de nova empresa (RF01) | `/login` |
| `/empresas/perfil` | `GET`, `POST` | `empresaController` | Alteração dos dados da empresa logada (RF01) | `/empresas/perfil` |
| `/empresas/excluir` | `POST` | `empresaController` | Exclusão da conta da empresa (RF01) | `/login` |
| `/login` | `GET`, `POST` | `authController` | Login da empresa (RF03) | `/processos` |
| `/logout` | `POST` | `authController` | Logout da empresa | `/login` |
| `/clientes` | `GET` | `clienteController` | Lista os clientes da empresa logada (RF02) | - |
| `/clientes/novo` | `GET`, `POST` | `clienteController` | Cadastro de novo cliente (RF02) | `/clientes` |
| `/clientes/:id/editar` | `GET`, `POST` | `clienteController` | Alteração de dados do cliente (RF02) | `/clientes` |
| `/clientes/:id/excluir` | `POST` | `clienteController` | Exclusão do cliente (RF02) | `/clientes` |
| `/clientes/:id/historico` | `GET` | `clienteController` | Histórico de documentos do cliente (RF11, Plano Pro) | - |
| `/processos` | `GET` | `processoController` | Painel de acompanhamento de pendências (RF08) | - |
| `/processos/novo` | `GET`, `POST` | `processoController` | Criação de checklist personalizada (RF04) | `/processos/:id` |
| `/processos/:id` | `GET` | `processoController` | Detalhe do processo: documentos recebidos e pendentes (RF08) | - |
| `/processos/:id/editar` | `GET`, `POST` | `processoController` | Alteração da checklist do processo (RF05) | `/processos/:id` |
| `/processos/:id/excluir` | `POST` | `processoController` | Exclusão do processo (RF05) | `/processos` |
| `/processos/:id/enviar-link` | `POST` | `processoController` | Gera/reenvia o link único e o envia ao cliente (RF06) | `/processos/:id` |
| `/upload/:token` | `GET`, `POST` | `uploadController` | Tela pública onde o cliente envia os documentos (RF07) | `/upload/:token` |

### 3.2 `POST /processos/novo` — Criar Processo (Checklist)
* **Descrição:** A empresa autenticada cria um novo processo vinculado a um cliente já cadastrado, definindo os documentos exigidos.
* **Request (`application/x-www-form-urlencoded`):**
```
clienteId: 12
nomeProcesso: "Admissão - Contrato de Locação"
documentos[]: "RG"
documentos[]: "Comprovante de Residência"
documentos[]: "Comprovante de Renda"
```
* **Respostas:**
  * `302 Found` → `redirect('/processos/12')`, flash `success`: "Processo criado com sucesso."
  * `200 OK` (form re-renderizado), campo `clienteId` com `invalid-feedback`: "Este cliente já possui um processo em andamento." (CB-04)
  * `200 OK` (form re-renderizado), campos obrigatórios ausentes com `invalid-feedback` em cada um (CB-03)

### 3.3 `POST /upload/:token` — Cliente Envia Documento
* **Descrição:** Tela pública (sem login) onde o cliente anexa um arquivo, via `multer`, para um item pendente da checklist do processo identificado pelo token.
* **Request (`multipart/form-data`):**
```
documentoId: 45
arquivo: <upload de arquivo, ex: rg_frente.pdf>
```
* **Respostas:**
  * `200 OK`: documento marcado como `RECEBIDO`, flash `success`: "Documento recebido com sucesso." Se era o último pendente, `Processo.status` muda para `CONCLUIDO` (RN-05) e a mensagem passa a ser "Todos os documentos foram recebidos! Processo concluído."
  * `200 OK` (re-render, `invalid-feedback`): "Formato de arquivo não permitido. Envie PDF, JPG ou PNG." — validado pelo `fileFilter` do `multer` (CB-06)
  * `404 Not Found` (página pública dedicada): "Este link não é mais válido. Solicite um novo link à empresa." — token inexistente ou processo já `CONCLUIDO` (CB-07)

### 3.4 `POST /processos/:id/enviar-link` — Enviar Link ao Cliente
* **Descrição:** Envia ao cliente, pelo canal escolhido, o link de upload construído a partir do `tokenAcesso` do processo.
* **Request (`application/x-www-form-urlencoded`):**
```
canalEnvio: "EMAIL"   # ou "WHATSAPP"
```
* **Respostas:**
  * `302 Found` → `redirect('/processos/:id')`, flash `success`: "Link enviado ao cliente com sucesso."
  * `302 Found` → `redirect('/processos/:id')`, flash `danger`: "Não foi possível enviar o link: verifique o contato cadastrado do cliente." (CB-08)

---

## 4. Regras de Negócio e Casos de Borda

### 4.1 Regras de Negócio (RN)
* **RN-01 (CNPJ único):** Não é permitido cadastrar duas empresas com o mesmo `cnpj`.
* **RN-02 (CPF único por empresa):** Não é permitido cadastrar dois clientes com o mesmo `cpf` na mesma `empresa`.
* **RN-03 (Token único do processo):** Ao criar um `Processo`, o sistema deve gerar automaticamente um `tokenAcesso` único (UUID v4), base do link individual de envio.
* **RN-04 (Processo único em aberto por cliente):** Não é permitido criar um novo `Processo` com status `EM_ANDAMENTO` para um cliente que já possua outro processo em aberto.
* **RN-05 (Conclusão automática):** Quando o último `DocumentoChecklist` de um `Processo` mudar de `PENDENTE` para `RECEBIDO`, o `status` do processo deve mudar automaticamente para `CONCLUIDO`, preenchendo `dataConclusao`.
* **RN-06 (Recursos exclusivos do Plano Pro):** Lembrete automático (RF10) e histórico de documentos (RF11) só podem ser executados/exibidos quando `Empresa.plano === 'PRO'`.
* **RN-07 (Autenticação obrigatória):** Toda ação administrativa (clientes, processos, envio de link, acompanhamento) exige `Empresa` autenticada via sessão.
* **RN-08 (Link individual):** Cada `Processo` possui exatamente um `tokenAcesso`, nunca reaproveitado por outro cliente ou processo.

### 4.2 Casos de Borda (CB)
* **CB-01 (Empresa já cadastrada):** CNPJ já existente → bloquear cadastro, `invalid-feedback` no campo `cnpj`.
* **CB-02 (Cliente já cadastrado):** CPF já existente na mesma empresa → bloquear cadastro, `invalid-feedback` no campo `cpf`.
* **CB-03 (Campos obrigatórios ausentes):** Qualquer formulário submetido incompleto deve ser rejeitado com `invalid-feedback` por campo, mantendo os dados já preenchidos.
* **CB-04 (Processo duplicado):** Cliente com processo `EM_ANDAMENTO` não pode receber um novo processo — mensagem informando o processo já existente.
* **CB-05 (Busca sem resultado):** Buscas por CPF, id de processo ou nome de cliente sem resultado devem exibir mensagem de "não encontrado", sem erro não tratado (sem stack trace exposta).
* **CB-06 (Formato de arquivo inválido):** Upload com extensão/tipo não aceito pelo `fileFilter` do `multer` deve ser rejeitado, sem marcar o documento como recebido.
* **CB-07 (Link expirado ou inválido):** Token inexistente, ou de processo já `CONCLUIDO`, deve retornar página de "link inválido/expirado".
* **CB-08 (Falha no envio do link):** Contato do cliente vazio/inválido deve impedir o envio, com mensagem pedindo para conferir os dados de contato.
* **CB-09 (Login inválido):** E-mail/senha incorretos (comparação via `bcrypt.compare`) → mensagem de erro, sem criar sessão.
* **CB-10 (Lembrete fora do Plano Pro):** Empresas no Plano Grátis nunca geram `LembreteEnviado`, mesmo com documentos pendentes há muito tempo.

---

## 5. Critérios de Aceite (Exemplos para Testes Automatizados)

Estes cenários devem orientar a geração de testes automatizados com **Jest** e **Supertest**, usando um banco MySQL de teste isolado (ex.: `docflow_test`), resetado antes de cada suíte com `npx prisma migrate reset --force` (ambiente de teste).

### Cenário 1: Sucesso na Criação de Processo
* **Dado** que a empresa está autenticada (sessão válida) e possui um cliente cadastrado com `id=12`
* **Quando** enviar `POST /processos/novo` com `clienteId=12`, `nomeProcesso="Admissão"`, `documentos[]=["RG", "CPF"]`
* **Então** o processo deve ser criado com `status="EM_ANDAMENTO"`
* **E** um `tokenAcesso` único deve ser gerado automaticamente
* **E** a resposta deve redirecionar para `/processos/:id` com mensagem de sucesso

### Cenário 2: Falha por Cliente com Processo em Aberto (CB-04)
* **Dado** que o cliente `id=12` já possui um processo com `status="EM_ANDAMENTO"`
* **Quando** a empresa tentar criar um novo processo para o mesmo cliente
* **Então** o formulário deve ser re-renderizado com o erro "Este cliente já possui um processo em andamento"
* **E** nenhum novo registro de `Processo` deve ser criado

### Cenário 3: Conclusão Automática do Processo (RN-05)
* **Dado** um processo com 3 documentos na checklist, sendo 2 já `RECEBIDO` e 1 `PENDENTE`
* **Quando** o cliente enviar o arquivo do último documento `PENDENTE` via `POST /upload/:token`
* **Então** o documento deve mudar para `status="RECEBIDO"`
* **E** o `Processo.status` deve mudar automaticamente para `CONCLUIDO`
* **E** `dataConclusao` deve ser preenchida com o instante da requisição

### Cenário 4: Link Expirado ou Inválido (CB-07)
* **Dado** um token que não corresponde a nenhum processo, ou que corresponde a um processo já `CONCLUIDO`
* **Quando** qualquer pessoa acessar `GET /upload/:token`
* **Então** o sistema deve responder `404` com página informando que o link não é mais válido
* **E** nenhum dado do processo ou do cliente pode ser exposto na resposta

---

## 6. Requisitos de UI/Bootstrap

- **Layout Geral:** `views/partials/layout.ejs` com container responsivo e navbar fixa contendo links para "Processos" (painel de pendências), "Clientes", "Empresa/Perfil" e, quando o plano for Pro, "Histórico".
- **Tela de Login/Cadastro de Empresa:** Formulário centralizado em card único, campos `form-control`, link para alternar entre login e cadastro.
- **Lista de Clientes:** Tabela responsiva com nome, CPF, contato e ações (editar/excluir), com `input-group` para busca por nome ou CPF.
- **Painel de Processos:**
  - Cards (`card`) por processo, com badges: `bg-warning` (Em Andamento), `bg-success` (Concluído).
  - Indicador de progresso (ex.: "3 de 5 documentos recebidos") com `badge bg-success` ou barra de progresso Bootstrap.
- **Detalhe do Processo:**
  - Tabela de documentos com badge por status (`bg-warning` Pendente, `bg-success` Recebido).
  - Botão para gerar/reenviar link, exibindo o link em `input-group` com botão de copiar.
- **Tela Pública de Upload:** Layout simplificado (sem navbar administrativa), documentos pendentes com `input-group` de upload por item, mensagem de conclusão ao final.
- **Formulários:** Inputs com `form-control`/`form-select`; erros em `invalid-feedback`.
- **Mensagens do Sistema:** `views/partials/_messages.ejs` lendo as flash messages do `connect-flash`, usando `alert-success`, `alert-danger`, `alert-warning` e `btn-close`.

---

## 7. Ferramentas e Modelos Recomendados

### 7.1 Modelos Recomendados para Geração de Código
1. **Agente de codificação seguindo `AGENTS.md`** (ex.: Claude Code): indicado para implementar a aplicação Express completa — schema Prisma, services, controllers, rotas e views — respeitando as camadas e os contratos fixados neste documento.
2. **LLM de propósito geral:** útil para gerar templates EJS repetitivos, textos de mensagens do sistema e ajustes de estilo, sempre revisados contra a Seção 6.

### 7.2 Ferramentas de Desenvolvimento e Validação
* **Lint & Formatting:** `eslint` e `prettier`
* **Testes e Cobertura:** `jest` + `supertest`, com `jest --coverage`
* **Migrations:** Prisma Migrate (`npx prisma migrate dev`, `npx prisma migrate deploy`)
* **Ambiente:** Docker + Docker Compose (serviços `app` e `db`)
* **Inspeção de dados:** Prisma Studio (`npx prisma studio`) para inspeção visual, ou `prisma/seed.js` para dados de exemplo — o DocFlow não expõe API pública, portanto não há Swagger/OpenAPI.

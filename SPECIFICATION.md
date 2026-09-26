# Especificação Técnica: Aplicação FullStack de Coleta de Documentos (DocFlow)

---

## 1. Visão Geral e Stack

### 1.1 Objetivo
O **DocFlow** é uma aplicação FullStack com Node.js/Express responsável por organizar a coleta de documentos entre empresas e seus clientes. O sistema permite que a empresa cadastre clientes, monte uma checklist personalizada de documentos por cliente (processo), gere um link único de envio, receba os arquivos com segurança e acompanhe, em um painel único, quais documentos já foram recebidos e quais ainda estão pendentes — até a conclusão automática do processo. No Plano Pro, o sistema também envia lembretes automáticos e mantém o histórico de documentos de cada cliente.

### 1.2 Stack Tecnológica
* **Linguagem:** JavaScript (Node.js 20+ LTS)
* **Framework Web / Servidor de Aplicação:** Express 4.x, com a interface renderizada por EJS (template engine) e estilizada com Bootstrap 5. Em produção, o servidor é o **Render** (Web Service, plano free, build a partir do `Dockerfile`); em desenvolvimento, é o serviço `app` do Docker Compose
* **Persistência / ORM:** MySQL 8.x com Prisma 5.x (Prisma Client + Prisma Migrate), schema único em `prisma/schema.prisma`
* **Banco de Dados dos Documentos:** os arquivos enviados pelos clientes são armazenados **no próprio MySQL**, na coluna `DocumentoChecklist.arquivoConteudo` (`Bytes` / `LONGBLOB`), nunca no disco do servidor. Em desenvolvimento, o banco é o serviço `db` do Docker Compose; em produção, o **Clever Cloud** (add-on MySQL, plano DEV)
* **Autenticação:** `express-session` (sessão) + `bcrypt` (hash da senha), com a sessão persistida no MySQL via `@quixo3/prisma-session-store`
* **Upload de Arquivos:** `multer` com `memoryStorage` (o arquivo vai direto para o banco, nunca para o disco)
* **Criptografia:** módulo nativo `crypto` do Node.js com **AES-256-GCM** para cifrar o conteúdo dos arquivos antes de gravá-los; senhas com `bcrypt`; HTTPS fornecido automaticamente pelo Render em produção
* **Validação de Dados:** `express-validator`
* **Mensagens do Sistema:** `connect-flash`
* **Testes Unitários:** `jest` + `supertest` para os testes automatizados da aplicação
* **Containerização:** Docker e Docker Compose (serviço `app` + serviço `db` MySQL)

### 1.3 Arquitetura e Restrições
* **Padrão Arquitetural:** Express organizado em camadas no estilo MVC, com toda regra de negócio concentrada em `services/`:
  1. `Models` (`prisma/schema.prisma`): entidades, relações, enums e constraints; acesso em runtime via `@prisma/client`, instanciado uma única vez em `lib/prisma.js`.
  2. `Services` (`services/`): regras de negócio da aplicação — geração de token, transições de status, conclusão automática, lembretes/links, criptografia dos arquivos e todas as regras RN-XX.
  3. `Controllers / Routes` (`controllers/`, `routes/`): recebem `req`/`res`, validam a entrada, chamam os services e decidem entre `render` ou `redirect`; as rotas ligam método + URL ao controller.
  4. `Views` (`views/*.ejs`): templates EJS com Bootstrap 5 — apenas apresentação.
  5. `Middlewares` (`middlewares/`): `requireAuth`, configuração do `multer` (`memoryStorage`) e tratamento central de erros.
* **Restrição de Camadas:** É proibido interpor as camadas: views não contêm regra de negócio nem alteram status; controllers e rotas não acessam regras diretamente — alterar `status` de `Processo`/`DocumentoChecklist`, gerar `tokenAcesso` ou cifrar arquivos passa obrigatoriamente por `services/`.
* **Sem adições fora do escopo:** não introduzir TypeScript, frontend desacoplado (React/Vue/Next.js), outro ORM (Sequelize, TypeORM) ou outro banco sem requisito explícito.
* **Multi-tenant lógico:** todo dado de `Cliente`, `Processo`, `DocumentoChecklist` e `LembreteEnviado` pertence a uma única `Empresa`; nenhum controller pode expor ou alterar dados de outra empresa.
* **Sem escrita em disco:** arquivos enviados pelo cliente nunca são salvos no sistema de arquivos do servidor — apenas em `DocumentoChecklist.arquivoConteudo` (banco). Hospedagens gratuitas usam disco **efêmero**: qualquer arquivo gravado localmente é apagado quando o serviço reinicia ou "acorda" do modo de espera, enquanto o banco é persistente.
* **Servidor e Banco em Produção (deploy gratuito):**
  * **Aplicação:** [Render](https://render.com) — Web Service free conectado ao repositório do GitHub, com build a partir do `Dockerfile`. Limitação: o serviço "dorme" após cerca de 15 min sem acesso e leva de 30 a 60 s para acordar no acesso seguinte — aceitável para uma demonstração.
  * **Banco de Dados:** [Clever Cloud](https://www.clever-cloud.com) — add-on MySQL, plano **DEV** (gratuito, indicado para testes: sem backup e sem SLA, mas suficiente para o volume de um projeto acadêmico).
  * **Variáveis de ambiente (Render):** `DATABASE_URL` (string de conexão do Clever Cloud), `SESSION_SECRET` (valor aleatório), `ENCRYPTION_KEY` (32 bytes em hexadecimal, usada no AES-256-GCM) e `BASE_URL` (endereço público da aplicação, usado para montar o link do cliente). Nunca hardcode credenciais ou chaves no código; em desenvolvimento, use `.env` via `dotenv`.
  * **Alternativa mais robusta (opcional):** hospedar app + MySQL juntos numa VM **Oracle Cloud (Always Free)**, rodando o `docker-compose.yml` do projeto como está — sem cold start e com disco persistente. Exige criar a VM, instalar Docker, liberar portas e cadastrar cartão de crédito na Oracle (sem cobrança dentro do Always Free).
* **Estrutura de Diretórios:**

```
docflow/
├── controllers/           # orquestram request/response, chamam services e renderizam views
├── middlewares/            # requireAuth, upload (multer), tratamento de erros
├── prisma/
│   ├── schema.prisma       # entidades, relações e constraints (Seção 2.1)
│   └── migrations/          # geradas pelo Prisma Migrate
├── routes/                  # Express Router, um arquivo por recurso
├── services/                 # regras de negócio (Seção 5), criptografia e operações atômicas
├── views/                     # templates EJS
│   └── partials/              # layout.ejs, navbar.ejs, _messages.ejs, etc.
├── public/                     # CSS/JS estáticos
├── lib/
│   └── prisma.js               # instância única do PrismaClient
├── app.js
├── server.js
├── Dockerfile
├── docker-compose.yml           # serviços "app" (Node/Express) e "db" (MySQL)
└── .env                          # DATABASE_URL, SESSION_SECRET, ENCRYPTION_KEY, BASE_URL
```

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
  email       String    @unique @db.VarChar(255)   // login
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
  tokenAcesso   String               @unique @default(uuid())  // base do link público
  status        StatusProcesso       @default(EM_ANDAMENTO)
  dataConclusao DateTime?
  createdAt     DateTime             @default(now())
  updatedAt     DateTime             @updatedAt
  documentos    DocumentoChecklist[]
  lembretes     LembreteEnviado[]
}

model DocumentoChecklist {
  id              Int              @id @default(autoincrement())
  processo        Processo         @relation(fields: [processoId], references: [id], onDelete: Cascade)
  processoId      Int
  nomeDocumento   String           @db.VarChar(100)   // ex.: "RG", "Comprovante de Residência"
  status          StatusDocumento  @default(PENDENTE)
  arquivoNome     String?          @db.VarChar(255)   // nome original do arquivo enviado
  arquivoTipo     String?          @db.VarChar(100)   // MIME type, ex.: application/pdf
  arquivoConteudo Bytes?           @db.LongBlob       // bytes CIFRADOS (AES-256-GCM), salvos no MySQL — nunca no disco
  dataEnvio       DateTime?
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
* **Empresa -> Cliente:** 1 Empresa possui N Clientes (1:N). Ao excluir uma Empresa, seus Clientes são excluídos em cascata (`CASCADE`).
* **Cliente -> Processo:** 1 Cliente pode ter N Processos ao longo do tempo (histórico). Ao excluir um Cliente, seus Processos são excluídos em cascata (`CASCADE`).
* **Processo -> DocumentoChecklist:** 1 Processo possui N Documentos. Ao excluir um Processo, seus Documentos (incluindo os arquivos armazenados) são excluídos em cascata (`CASCADE`).
* **Processo -> LembreteEnviado:** 1 Processo possui N Lembretes enviados (Plano Pro). Ao excluir um Processo, seus Lembretes são excluídos em cascata (`CASCADE`).
* **Empresa:** é a entidade raiz de todos os dados; não referencia outra entidade.

### 2.3 Status de Processos e Documentos
* **Documento:** o campo `status` aceita `PENDENTE` ou `RECEBIDO`, iniciando em `PENDENTE`.
  * Transição permitida: `PENDENTE` -> `RECEBIDO`, apenas por um upload válido (ver seção 2.5).
  * `RECEBIDO` é um estado final para o fluxo do cliente: um documento já recebido não é marcado como recebido novamente (operação idempotente).
* **Processo:** o campo `status` aceita `EM_ANDAMENTO` ou `CONCLUIDO`, iniciando em `EM_ANDAMENTO`.
  * A transição `EM_ANDAMENTO` -> `CONCLUIDO` é **automática**: ocorre quando o último documento `PENDENTE` do processo passa para `RECEBIDO`, preenchendo `dataConclusao`.
  * `CONCLUIDO` é um estado final; a partir dele, o link público do processo deixa de ser válido.
  * A leitura dos documentos e a atualização do status ocorrem na mesma transação (`prisma.$transaction`), para que dois uploads simultâneos no mesmo processo não deixem o status inconsistente.
* O painel de processos deve exibir cada processo com seu status e o progresso de documentos recebidos.

### 2.4 Autenticação, Sessão e Planos
* O acesso à interface administrativa usa sessão (`express-session`), com login por e-mail e senha e logout. As credenciais ficam na própria `Empresa` (`email` + `senhaHash`).
* A senha é armazenada somente como hash, via `bcrypt.hash`; a verificação usa `bcrypt.compare`.
* O middleware `requireAuth` protege todas as rotas administrativas (`/empresas/perfil`, `/empresas/excluir`, `/clientes/*`, `/processos/*`). São públicas apenas `/empresas/cadastro`, `/login` e `/upload/:token`.
* O campo `plano` aceita `GRATIS` ou `PRO`, iniciando em `GRATIS`. Lembretes automáticos e histórico de documentos são exclusivos do `PRO`. O fluxo de contratação/pagamento do Plano Pro está fora do escopo desta versão.
* Os lembretes automáticos são disparados por uma rotina periódica de verificação, sem reenviar lembrete duplicado dentro da mesma janela, e cada envio é registrado em `LembreteEnviado`.

### 2.5 Armazenamento e Criptografia dos Arquivos
* O arquivo enviado pelo cliente passa pelo `multer` (`memoryStorage`), é validado pelo `fileFilter` (formatos aceitos: PDF, JPG e PNG) e tem tamanho limitado (`limits.fileSize`, 5 MB por arquivo, configurável).
* O `service` cifra o conteúdo com **AES-256-GCM** (módulo `crypto`, chave de `ENCRYPTION_KEY`) e grava o resultado em `DocumentoChecklist.arquivoConteudo`, junto com `arquivoNome` e `arquivoTipo` (texto claro), `dataEnvio` e `status = RECEBIDO`.
* **Formato de `arquivoConteudo`:** `iv` (12 bytes) + `authTag` (16 bytes) + texto cifrado, concatenados no mesmo campo `Bytes` — não é necessária nenhuma coluna adicional.
* No download, o `service` lê o registro, decifra o conteúdo e o entrega com `Content-Type` e `Content-Disposition: attachment`, somente para a empresa autenticada dona do processo.
* Escopo enxuto: ficam **fora** rotação de chaves, KMS/HSM e criptografia de colunas de texto.

### 2.6 Link Público de Upload
* Cada `Processo` recebe um `tokenAcesso` (UUID) gerado automaticamente (`@default(uuid())`), nunca reaproveitado.
* O link do cliente é `{BASE_URL}/upload/{tokenAcesso}` e é enviado por e-mail ou WhatsApp, conforme o contato cadastrado do cliente.
* O link é válido apenas enquanto o processo estiver `EM_ANDAMENTO`; token inexistente ou de processo `CONCLUIDO` resulta em página de link inválido/expirado (sem stack trace).

---

## 3. Interface Gráfica WEB (EJS + Bootstrap 5)

A aplicação disponibiliza uma interface visual completa renderizada via templates EJS e estilizada com Bootstrap 5:

### 3.1 Página Inicial / Painel de Processos (`GET /processos`)
* **Rota:** `/processos` (destino do login; a busca usa `?busca=`)
* **Pré-requisito de inicialização:** antes de acessar a rota, executar `npx prisma migrate deploy`. As migrations criam as tabelas `Empresa`, `Cliente`, `Processo`, `DocumentoChecklist`, `LembreteEnviado` e a tabela de sessões consultadas pelo painel.
* **Recursos visuais:**
  * **Navbar fixa:** links para Processos, Clientes e Empresa/Perfil (e Histórico quando `plano === 'PRO'`), mais o botão de sair.
  * **Painel de Pendências:** um card por processo, com nome do cliente, nome do processo, badge de status (`bg-warning` para `EM_ANDAMENTO`, `bg-success` para `CONCLUIDO`) e indicador de progresso (ex.: "3 de 5 documentos recebidos").
  * **Busca:** por nome de cliente, CPF ou id do processo; sem resultado, exibe "Nenhum processo encontrado.".
  * **Detalhe do Processo (`/processos/:id`):** tabela de documentos com badge por documento (`bg-warning` Pendente, `bg-success` Recebido), botão de download nos documentos recebidos e `input-group` com o link do cliente e botão de copiar.
  * **Clientes (`/clientes`):** tabela com botões *"Editar"* e *"Excluir"* por cliente e, no Plano Pro, botão *"Histórico"*.
  * **Formulários:** inputs com `form-control` ou `form-select`; erros de validação em `invalid-feedback`, mantendo os dados já preenchidos.
  * **Mensagens do sistema:** partial `_messages.ejs` com `alert-success`, `alert-danger` e `alert-warning` e botão `btn-close`.

### 3.2 Ações e Formulários Web
* **Cadastrar Empresa:** `POST /empresas/cadastro` (Campos: `razaoSocial`, `cnpj`, `email`, `senha`). Rota pública; redireciona para `/login`.
* **Alterar Empresa:** `POST /empresas/perfil` (Campos: `razaoSocial`, `cnpj`, `email`, `senha` [opcional; se informada, novo hash com `bcrypt`]). Redireciona para `/empresas/perfil`.
* **Excluir Empresa:** `POST /empresas/excluir` (Sem campos). Exclusão em cascata de clientes, processos, documentos e lembretes; encerra a sessão e redireciona para `/login`.
* **Entrar:** `POST /login` (Campos: `email`, `senha`). Redireciona para `/processos`.
* **Sair:** `POST /logout` (Sem campos). Redireciona para `/login`.
* **Listar Clientes:** `GET /clientes` (Query opcional: `busca`, por nome ou CPF).
* **Cadastrar Cliente:** `POST /clientes/novo` (Campos: `nome`, `cpf`, `email` [opcional], `telefone` [opcional]). Redireciona para `/clientes`.
* **Editar Cliente:** `POST /clientes/:id/editar` (Campos: `nome`, `cpf`, `email`, `telefone`). Redireciona para `/clientes`.
* **Excluir Cliente:** `POST /clientes/:id/excluir` (Sem campos).
  * Exibe confirmação alertando que **processos e documentos do cliente também serão excluídos** (cascata `Cliente` -> `Processo` -> `DocumentoChecklist`).
  * Exclusão permanente e irreversível; redireciona para `/clientes` com mensagem de sucesso.
* **Histórico do Cliente (Plano Pro):** `GET /clientes/:id/historico`. No Plano Grátis, redireciona para `/clientes` com aviso.
* **Painel de Processos:** `GET /processos`.
* **Criar Processo:** `POST /processos/novo` (Campos: `clienteId`, `nomeProcesso`, `documentos[]`). Gera o `tokenAcesso` automaticamente; redireciona para `/processos/:id`.
* **Detalhe do Processo:** `GET /processos/:id`.
* **Editar Processo:** `POST /processos/:id/editar` (Campos: `nomeProcesso`, `documentos[]`). Redireciona para `/processos/:id`.
* **Excluir Processo:** `POST /processos/:id/excluir` (Sem campos). Exclusão em cascata dos documentos e lembretes; redireciona para `/processos`.
* **Enviar Link ao Cliente:** `POST /processos/:id/enviar-link` (Campo: `canalEnvio`, com valores `EMAIL` ou `WHATSAPP`). Redireciona para `/processos/:id`.
* **Baixar Documento:** `GET /processos/:id/documentos/:documentoId/download` (Autenticado).
  * Headers: `Content-Disposition: attachment` (força download em vez de abrir no navegador)
  * Validação: empresa autenticada dona do processo
  * Resposta: arquivo decifrado, com o `Content-Type` original (`arquivoTipo`)
  * Erro: 404 se o documento não tiver arquivo ou pertencer a outra empresa
* **Enviar Documento (cliente):** `POST /upload/:token` (`multipart/form-data`; Campos: `documentoId`, `arquivo`). Rota pública.

### 3.3 Tela Pública de Upload (`GET /upload/:token`)
* Layout simplificado próprio (sem navbar administrativa), acessível sem login.
* Exibe a checklist do processo: para cada documento, o nome, o badge (`bg-warning` Pendente, `bg-success` Recebido) e, nos pendentes, um campo de arquivo com botão de envio.
* Ao enviar o último documento pendente, exibe a mensagem de conclusão do processo.
* Token inexistente ou de processo concluído: página "Este link não é mais válido. Solicite um novo link à empresa.".

---

## 4. Contratos de Rotas HTTP (Server-Side)

O DocFlow é uma aplicação renderizada no servidor e **não expõe API REST/JSON**. Os contratos abaixo descrevem as rotas HTTP principais; os formulários usam `application/x-www-form-urlencoded` (ou `multipart/form-data` no upload) e as respostas são `render` ou `redirect`. As demais rotas seguem o mesmo padrão e estão listadas na seção 3.2.

### 4.1 Cadastrar Empresa
* **Endpoint:** `POST /empresas/cadastro`
* **Descrição:** Cadastra uma nova empresa (conta administradora). Rota pública.
* **Headers:** `Content-Type: application/x-www-form-urlencoded`
* **Request Body:**
```
razaoSocial: "Contabilidade Silva LTDA"
cnpj: "12.345.678/0001-90"
email: "contato@silva.com.br"
senha: "********"
```
* **Respostas:**
  * `302 Found` → `redirect('/login')`, flash `success`: "Empresa cadastrada com sucesso."
  * `200 OK` (form re-renderizado): campo `cnpj` com `invalid-feedback`: "Já existe uma empresa cadastrada com este CNPJ."
  * `200 OK` (form re-renderizado): campos obrigatórios ausentes com `invalid-feedback` em cada um.

### 4.2 Entrar (Login)
* **Endpoint:** `POST /login`
* **Descrição:** Autentica a empresa. A senha é validada com `bcrypt.compare`. Rota pública.
* **Headers:** `Content-Type: application/x-www-form-urlencoded`
* **Request Body:**
```
email: "contato@silva.com.br"
senha: "********"
```
* **Respostas:**
  * `302 Found` → `redirect('/processos')`, sessão criada.
  * `200 OK` (form re-renderizado): flash `danger`: "E-mail ou senha inválidos." — nenhuma sessão é criada.

### 4.3 Cadastrar Cliente
* **Endpoint:** `POST /clientes/novo`
* **Descrição:** Cadastra um cliente da empresa autenticada.
* **Headers:** `Content-Type: application/x-www-form-urlencoded`
* **Request Body:**
```
nome: "Maria Souza"
cpf: "123.456.789-09"
email: "maria@email.com"
telefone: "(82) 99999-0000"
```
* **Campos Opcionais:**
  * `email` e `telefone`: ao menos um contato válido é necessário para o envio do link ao cliente (ver CB-08).
* **Respostas:**
  * `302 Found` → `redirect('/clientes')`, flash `success`: "Cliente cadastrado com sucesso."
  * `200 OK` (form re-renderizado): campo `cpf` com `invalid-feedback`: "Já existe um cliente cadastrado com este CPF."
  * `200 OK` (form re-renderizado): campos obrigatórios ausentes com `invalid-feedback` em cada um.

### 4.4 Criar Processo (Checklist)
* **Endpoint:** `POST /processos/novo`
* **Descrição:** Cria um processo vinculado a um cliente já cadastrado, com a lista de documentos exigidos. O `tokenAcesso` é gerado automaticamente.
* **Headers:** `Content-Type: application/x-www-form-urlencoded`
* **Request Body:**
```
clienteId: 12
nomeProcesso: "Admissão - Contrato de Locação"
documentos[]: "RG"
documentos[]: "Comprovante de Residência"
documentos[]: "Comprovante de Renda"
```
* **Respostas:**
  * `302 Found` → `redirect('/processos/:id')`, flash `success`: "Processo criado com sucesso." O processo nasce `EM_ANDAMENTO`, com todos os documentos `PENDENTE`.
  * `200 OK` (form re-renderizado): campo `clienteId` com `invalid-feedback`: "Este cliente já possui um processo em andamento."
  * `200 OK` (form re-renderizado): campos obrigatórios ausentes com `invalid-feedback` em cada um.
  * `404 Not Found`: cliente inexistente ou pertencente a outra empresa.

### 4.5 Enviar Link ao Cliente
* **Endpoint:** `POST /processos/:id/enviar-link`
* **Descrição:** Envia ao cliente, pelo canal escolhido, o link `{BASE_URL}/upload/{tokenAcesso}` do processo.
* **Path Parameter:** `id` (Int, id do processo)
* **Headers:** `Content-Type: application/x-www-form-urlencoded`
* **Request Body:**
```
canalEnvio: "EMAIL"
```
* **Respostas:**
  * `302 Found` → `redirect('/processos/:id')`, flash `success`: "Link enviado ao cliente com sucesso."
  * `302 Found` → `redirect('/processos/:id')`, flash `danger`: "Não foi possível enviar o link: verifique o contato cadastrado do cliente."
  * `404 Not Found`: processo inexistente ou pertencente a outra empresa.

### 4.6 Enviar Documento (Upload Público)
* **Endpoint:** `POST /upload/:token`
* **Descrição:** O cliente anexa o arquivo de um item da checklist. O `multer` usa `memoryStorage`; o service cifra o conteúdo (AES-256-GCM) e o grava em `DocumentoChecklist.arquivoConteudo`.
* **Path Parameter:** `token` (UUID, `tokenAcesso` do processo)
* **Headers:** `Content-Type: multipart/form-data`
* **Request Body:**
```
documentoId: 45
arquivo: <upload de arquivo, ex: rg_frente.pdf>
```
* **Respostas:**
  * `200 OK`: documento marcado como `RECEBIDO`, flash `success`: "Documento recebido com sucesso." Se era o último pendente, o `Processo.status` muda para `CONCLUIDO` e a mensagem passa a ser "Todos os documentos foram recebidos! Processo concluído."
  * `200 OK` (re-render, `invalid-feedback`): "Formato de arquivo não permitido. Envie PDF, JPG ou PNG."
  * `404 Not Found` (página pública dedicada): "Este link não é mais válido. Solicite um novo link à empresa." — token inexistente ou processo já `CONCLUIDO`.

### 4.7 Baixar Documento Recebido
* **Endpoint:** `GET /processos/:id/documentos/:documentoId/download`
* **Descrição:** A empresa autenticada baixa o arquivo que o cliente enviou para um item da checklist.
* **Path Parameters:** `id` (Int, id do processo), `documentoId` (Int)
* **Respostas:**
  * `200 OK`: conteúdo decifrado do arquivo, com `Content-Type: <arquivoTipo>` e `Content-Disposition: attachment; filename="<arquivoNome>"`.
  * `404 Not Found`: documento ainda `PENDENTE` (sem arquivo) ou pertencente a um processo de outra empresa.

### 4.8 Histórico de Documentos do Cliente (Plano Pro)
* **Endpoint:** `GET /clientes/:id/historico`
* **Descrição:** Exibe o histórico de processos e documentos do cliente. Exclusivo do Plano Pro.
* **Path Parameter:** `id` (Int, id do cliente)
* **Respostas:**
  * `200 OK`: histórico do cliente, quando `Empresa.plano === 'PRO'`.
  * `302 Found` → `redirect('/clientes')`, flash `warning`: "O histórico de documentos está disponível apenas no Plano Pro."
  * `404 Not Found`: cliente inexistente ou pertencente a outra empresa.

---

## 5. Regras de Negócio e Casos de Borda

### 5.1 Regras de Negócio (RN)
* **RN-01 (CNPJ único):** Não é permitido cadastrar duas empresas com o mesmo `cnpj`.
* **RN-02 (CPF único por empresa):** Não é permitido cadastrar dois clientes com o mesmo `cpf` na mesma empresa.
* **RN-03 (Token único do processo):** Ao criar um `Processo`, o sistema deve gerar automaticamente um `tokenAcesso` único (UUID v4), base do link individual de envio.
* **RN-04 (Processo único em aberto por cliente):** Não é permitido criar um novo `Processo` com status `EM_ANDAMENTO` para um cliente que já possua outro processo em aberto.
* **RN-05 (Conclusão automática):** Quando o último `DocumentoChecklist` de um `Processo` mudar de `PENDENTE` para `RECEBIDO`, o `status` do processo deve mudar automaticamente para `CONCLUIDO`, preenchendo `dataConclusao`, na mesma transação da atualização do documento.
* **RN-06 (Recursos exclusivos do Plano Pro):** Lembrete automático e histórico de documentos só podem ser executados/exibidos quando `Empresa.plano === 'PRO'`.
* **RN-07 (Autenticação obrigatória):** Toda ação administrativa (clientes, processos, envio de link, download, acompanhamento) exige `Empresa` autenticada via `requireAuth`.
* **RN-08 (Link individual):** Cada `Processo` possui exatamente um `tokenAcesso`, nunca reaproveitado por outro cliente ou processo.
* **RN-09 (Armazenamento dos arquivos no banco):** O conteúdo de todo arquivo enviado pelo cliente deve ser persistido exclusivamente em `DocumentoChecklist.arquivoConteudo` (MySQL), acompanhado de `arquivoNome` e `arquivoTipo`; é proibido gravá-lo no sistema de arquivos do servidor.
* **RN-10 (Criptografia dos arquivos):** O conteúdo do arquivo deve ser cifrado com AES-256-GCM antes de ser gravado e decifrado apenas no download por empresa autenticada dona do processo (RN-07). A chave vem exclusivamente de `ENCRYPTION_KEY` (variável de ambiente); senhas seguem sempre com `bcrypt.hash`.

### 5.2 Casos de Borda (CB)
* **CB-01 (Empresa já cadastrada):** CNPJ já existente → bloquear cadastro, `invalid-feedback` no campo `cnpj`.
* **CB-02 (Cliente já cadastrado):** CPF já existente na mesma empresa → bloquear cadastro, `invalid-feedback` no campo `cpf`.
* **CB-03 (Campos obrigatórios ausentes):** Qualquer formulário submetido incompleto deve ser rejeitado com `invalid-feedback` por campo, mantendo os dados já preenchidos.
* **CB-04 (Processo duplicado):** Cliente com processo `EM_ANDAMENTO` não pode receber um novo processo — mensagem informando o processo já existente.
* **CB-05 (Busca sem resultado):** Buscas por CPF, id de processo ou nome de cliente sem resultado devem exibir mensagem de "não encontrado", sem erro não tratado (sem stack trace exposta).
* **CB-06 (Formato de arquivo inválido):** Upload com extensão/tipo não aceito pelo `fileFilter` do `multer` (ou acima do limite de tamanho) deve ser rejeitado, sem marcar o documento como recebido.
* **CB-07 (Link expirado ou inválido):** Token inexistente, ou de processo já `CONCLUIDO`, deve retornar página de "link inválido/expirado".
* **CB-08 (Falha no envio do link):** Contato do cliente vazio/inválido deve impedir o envio, com mensagem pedindo para conferir os dados de contato.
* **CB-09 (Login inválido):** E-mail/senha incorretos (comparação via `bcrypt.compare`) → mensagem de erro, sem criar sessão.
* **CB-10 (Lembrete fora do Plano Pro):** Empresas no Plano Grátis nunca geram `LembreteEnviado`, mesmo com documentos pendentes há muito tempo.
* **CB-11 (Chave de criptografia ausente ou inválida):** Se `ENCRYPTION_KEY` não existir ou não tiver 32 bytes, a aplicação deve falhar na inicialização com mensagem clara, nunca gravar arquivos sem cifrar. Se a decifragem falhar (`authTag` inválida), o download retorna erro tratado, sem vazar stack trace.
* **CB-12 (Recurso de outra empresa):** Acessar, editar, excluir ou baixar cliente, processo ou documento pertencente a outra empresa deve retornar `404 Not Found`, sem revelar que o recurso existe.
* **CB-13 (Exclusão em Cascata):** Excluir uma empresa remove automaticamente (via `onDelete: Cascade`) seus clientes e, transitivamente, seus processos, documentos e lembretes; excluir um cliente remove seus processos, documentos e lembretes; excluir um processo remove seus documentos e lembretes, sem afetar o cliente.

---

## 6. Critérios de Aceite (Exemplos para Testes Automatizados)

Estes cenários devem orientar a geração de testes automatizados com **Jest** e **Supertest**, usando um banco MySQL de teste isolado (ex.: `docflow_test`), resetado antes de cada suíte com `npx prisma migrate reset --force` (ambiente de teste).

### Cenário 1: Sucesso na Criação de Processo
* **Dado** que a empresa está autenticada (sessão válida) e possui um cliente cadastrado com `id=12`
* **Quando** enviar `POST /processos/novo` com `clienteId=12`, `nomeProcesso="Admissão"`, `documentos[]=["RG", "CPF"]`
* **Então** o processo deve ser criado com `status="EM_ANDAMENTO"`
* **E** um `tokenAcesso` único deve ser gerado automaticamente
* **E** a resposta deve redirecionar para `/processos/:id` com mensagem de sucesso

### Cenário 2: Falha por Cliente com Processo em Aberto
* **Dado** que o cliente `id=12` já possui um processo com `status="EM_ANDAMENTO"`
* **Quando** a empresa tentar criar um novo processo para o mesmo cliente
* **Então** o formulário deve ser re-renderizado com o erro "Este cliente já possui um processo em andamento"
* **E** nenhum novo registro de `Processo` deve ser criado

### Cenário 3: Conclusão Automática do Processo
* **Dado** um processo com 3 documentos na checklist, sendo 2 já `RECEBIDO` e 1 `PENDENTE`
* **Quando** o cliente enviar o arquivo do último documento `PENDENTE` via `POST /upload/:token`
* **Então** o documento deve mudar para `status="RECEBIDO"`
* **E** o `Processo.status` deve mudar automaticamente para `CONCLUIDO`
* **E** `dataConclusao` deve ser preenchida com o instante da requisição

### Cenário 4: Link Expirado ou Inválido
* **Dado** um token que não corresponde a nenhum processo, ou que corresponde a um processo já `CONCLUIDO`
* **Quando** qualquer pessoa acessar `GET /upload/:token`
* **Então** o sistema deve responder `404` com página informando que o link não é mais válido
* **E** nenhum dado do processo ou do cliente pode ser exposto na resposta

### Cenário 5: Arquivo Armazenado no Banco, Cifrado
* **Dado** um processo `EM_ANDAMENTO` com um documento `PENDENTE`
* **Quando** o cliente enviar um PDF válido via `POST /upload/:token`
* **Então** `DocumentoChecklist.arquivoConteudo` deve estar preenchido com bytes **diferentes** dos bytes originais (conteúdo cifrado), com `arquivoNome` e `arquivoTipo` preenchidos
* **E** nenhum arquivo deve ser criado no sistema de arquivos do servidor
* **E** `GET /processos/:id/documentos/:documentoId/download` deve devolver exatamente o conteúdo original enviado (decifrado)

---

## 7. Requisitos Rastreáveis (Requirements)

Esta seção mantém a rastreabilidade entre os **Requisitos** do documento de requisitos de software (`DocFlow_Trabalho_GQSO.docx`) e os pontos desta especificação que os implementam. A tabela é mantida manualmente: ao alterar um requisito, atualize a linha correspondente.

| Requisito | Descrição | Rotas / Componentes | Regras e Casos de Borda |
| :--- | :--- | :--- | :--- |
| RF01 | Cadastro, alteração e exclusão de empresas | `/empresas/cadastro`, `/empresas/perfil`, `/empresas/excluir` | RN-01, CB-01, CB-03, CB-13 |
| RF02 | Cadastro, alteração e exclusão de clientes | `/clientes`, `/clientes/novo`, `/clientes/:id/editar`, `/clientes/:id/excluir` | RN-02, CB-02, CB-03, CB-12, CB-13 |
| RF03 | Login das empresas | `/login`, `/logout`, `requireAuth` | RN-07, CB-09 |
| RF04 | Criação de checklist personalizada por cliente | `/processos/novo` | RN-03, RN-04, CB-04 |
| RF05 | Alteração e exclusão de processos | `/processos/:id/editar`, `/processos/:id/excluir` | CB-03, CB-12, CB-13 |
| RF06 | Geração de link único de envio | `/processos/:id/enviar-link`, `tokenAcesso` | RN-03, RN-08, CB-08 |
| RF07 | Envio de documentos pelo cliente | `/upload/:token` | RN-09, RN-10, CB-06, CB-07 |
| RF08 | Registro e acompanhamento dos documentos | `/processos`, `/processos/:id`, `/processos/:id/documentos/:documentoId/download` | RN-07, CB-05, CB-12 |
| RF09 | Conclusão automática do processo | service de upload (`/upload/:token`) | RN-05 |
| RF10 | Lembretes automáticos (Plano Pro) | rotina periódica, `LembreteEnviado` | RN-06, CB-10 |
| RF11 | Histórico de documentos (Plano Pro) | `/clientes/:id/historico` | RN-06 |
| RNF01 | Código único por processo e documento | `id` autoincrement, `tokenAcesso` | RN-03 |
| RNF02 | Link individual e exclusivo por cliente | `tokenAcesso` (UUID) | RN-03, RN-08 |
| RNF03 | Arquivos armazenados no MySQL, nunca em disco | `DocumentoChecklist.arquivoConteudo`, `memoryStorage` | RN-09 |
| RNF04 | Hospedagem gratuita (Render + Clever Cloud) | Seção 1.3, `Dockerfile`, variáveis de ambiente | — |
| RNF05 | Criptografia dos arquivos (AES-256-GCM) | service de criptografia, `ENCRYPTION_KEY` | RN-10, CB-11 |
| RNF06 | Senhas com hash (bcrypt) e HTTPS | `bcrypt`, HTTPS do Render | RN-07, CB-09 |

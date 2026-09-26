# AGENTS.md

<!-- 
Configurações de execução do OpenCode para o projeto DocFlow.

No Windows (PowerShell) para chamar o OpenCode via Docker:
docker run --name opencode -it --rm -v "$($PWD.Path):/workspace" -w /workspace ghcr.io/anomalyco/opencode

No Linux/WSL/macOS:
docker run --name opencode -it --rm -v "${PWD}:/workspace" -w /workspace ghcr.io/anomalyco/opencode

Prompt recomendado para o OpenCode:
"Atue como um Engenheiro de Software Sênior. Siga rigorosamente a especificação contida em @SPECIFICATION.md para implementar as camadas da arquitetura, os Services, o armazenamento criptografado dos arquivos e a suíte de testes automatizados."
-->

## 1. Visão Geral do Projeto

**DocFlow** é uma aplicação FullStack desenvolvida em **Node.js/Express** para organizar a coleta de documentos entre empresas e seus clientes (cadastro de clientes, checklists de documentos por processo, link único de envio, recebimento seguro dos arquivos, conclusão automática e, no Plano Pro, lembretes e histórico).

A especificação técnica completa, o schema Prisma, os contratos de rotas e os casos de teste encontram-se em `SPECIFICATION.md`.

### Procedimento obrigatório para qualquer solicitação de alteração

- Identifique primeiro o arquivo, símbolo, requisito ou comportamento mencionado pelo usuário.
- Leia os arquivos relevantes antes de planejar ou editar qualquer coisa. Quando o usuário mencionar `SPECIFICATION.md`, leia o arquivo na raiz deste projeto usando `read`.
- Use somente as ferramentas realmente disponíveis na sessão. Para localizar arquivos e trechos, use `glob`, `grep` e `read`; para alterar arquivos, use `edit` ou `write`.
- Nunca tente chamar uma ferramenta chamada `explore` se ela não estiver explicitamente disponível.
- Nunca emita chamadas no formato XML, como `<function=explore>` ou `<tool_call>`; faça chamadas de ferramentas usando o mecanismo nativo da sessão.
- Escolha o arquivo correto com base no caminho fornecido pelo usuário e no diretório atual do projeto. Não edite uma cópia em outro projeto.
- Execute a alteração solicitada diretamente depois de obter contexto suficiente. Não pare apenas descrevendo o que deveria ser feito.
- Preserve o escopo solicitado e não altere arquivos não relacionados sem necessidade.
- Depois da edição, releia o trecho alterado e execute uma validação adequada, como testes, checagem, lint ou validação de sintaxe.
- Informe ao usuário quais arquivos foram alterados e o resultado da validação.
- Para alterações simples e localizadas, não delegue a tarefa para outro agente; faça a leitura e a edição diretamente.

---

## 2. Stack Tecnológica

- **Linguagem:** JavaScript (Node.js 20+ LTS)
- **Framework Web / Servidor de Aplicação:** Express 4.x (arquitetura MVC + camada de Services). Em produção, o servidor é o **Render** (Web Service free, build a partir do `Dockerfile`)
- **Interface/Views:** EJS estilizado com Bootstrap 5
- **Banco de Dados / Persistência:** MySQL 8.x via Prisma 5.x (`@prisma/client` + Prisma Migrate), schema único em `prisma/schema.prisma`. O banco também armazena os arquivos enviados pelos clientes (`DocumentoChecklist.arquivoConteudo`, `Bytes`/`LONGBLOB`); em produção, é o **MySQL do Clever Cloud** (plano DEV)
- **Autenticação e Segurança:** `express-session` + `@quixo3/prisma-session-store` (sessão), `bcrypt` (hash de senha) e módulo nativo `crypto` do Node.js (AES-256-GCM) para cifrar o conteúdo dos arquivos
- **Upload de Arquivos:** `multer` com `memoryStorage` (nunca `diskStorage`)
- **Validação de Dados:** `express-validator`
- **Mensagens do Sistema:** `connect-flash`
- **Testes Automatizados:** `jest` + `supertest`
- **Containerização:** Docker e Docker Compose (serviços `app` e `db`)

---

## 3. Arquitetura e Estrutura de Camadas

A aplicação deve seguir uma separação clara de responsabilidades:

1. `Models` (`prisma/schema.prisma`): estrutura persistida, relações, enums e constraints; nenhuma lógica de negócio aqui.
2. `Services` (`services/`): regras de negócio da aplicação — geração de token, transições de status do processo, conclusão automática, envio de lembretes/links, criptografia dos arquivos e todas as regras RN-XX, usando o `PrismaClient` importado de `lib/prisma.js`.
3. `Controllers / Routes` (`controllers/`, `routes/`): recebem `req`/`res`, validam a entrada com `express-validator`, chamam os services e decidem entre `render` ou `redirect`; as rotas ligam método + URL ao controller, aplicando `requireAuth` onde exigido.
4. `Views` (`views/*.ejs`): templates EJS com Bootstrap 5, herdando de `views/partials/layout.ejs`; a tela pública de upload usa um layout simplificado próprio.
5. `Middlewares` (`middlewares/`): `requireAuth`, configuração do `multer` (`memoryStorage`) e tratamento central de erros.

**Regra Arquitetural:** É proibido acoplar regras de negócio diretamente nos Controllers, Rotas ou Views. A lógica de transição de status, geração de token, criptografia e validação de negócio deve residir nos Services.

---

## 4. Regras de Negócio e Casos de Borda (SPECIFICATION.md)

### 4.1 Regras de Negócio (RN)
- **RN-01 (CNPJ único):** Não é permitido cadastrar duas empresas com o mesmo `cnpj`.
- **RN-02 (CPF único por empresa):** Não é permitido cadastrar dois clientes com o mesmo `cpf` na mesma empresa (`@@unique([empresaId, cpf])`).
- **RN-03 (Token único do processo):** Ao criar um `Processo`, gerar automaticamente um `tokenAcesso` único (`@default(uuid())`), base do link individual do cliente.
- **RN-04 (Processo único em aberto por cliente):** Não permitir criar um novo processo `EM_ANDAMENTO` para um cliente que já tenha outro processo em aberto.
- **RN-05 (Conclusão automática):** Ao registrar o último documento `PENDENTE` de um processo como `RECEBIDO`, mudar o status do processo para `CONCLUIDO` e preencher `dataConclusao`, na mesma transação (`prisma.$transaction`).
- **RN-06 (Recursos exclusivos do Plano Pro):** Restringir lembretes automáticos e histórico de documentos às empresas com `plano === 'PRO'`.
- **RN-07 (Autenticação obrigatória):** Toda ação administrativa (clientes, processos, envio de link, download, acompanhamento) exige empresa autenticada via `requireAuth`.
- **RN-08 (Link individual):** Cada `Processo` possui exatamente um `tokenAcesso`, nunca reaproveitado.
- **RN-09 (Armazenamento dos arquivos no banco):** Salvar o conteúdo do arquivo sempre em `arquivoConteudo` (MySQL), com `arquivoNome` e `arquivoTipo`; nunca no sistema de arquivos local, pois o disco da hospedagem gratuita é efêmero.
- **RN-10 (Criptografia dos arquivos):** Cifrar o conteúdo com AES-256-GCM antes de gravar e decifrar somente no download por empresa autenticada dona do processo. A chave vem exclusivamente de `ENCRYPTION_KEY`; senhas sempre via `bcrypt.hash`.

Operações que alteram o status do processo (conclusão automática, geração de token, envio de lembrete) devem ser atômicas e idempotentes quando aplicável. Evite marcar o mesmo documento como recebido duas vezes ou reenviar lembretes duplicados na mesma janela de verificação; em caso de concorrência (ex.: dois uploads simultâneos no mesmo processo), proteja a leitura e a atualização do status com `prisma.$transaction`.

### 4.2 Casos de Borda (CB)
- **CB-01 (Empresa já cadastrada):** CNPJ já existente ➔ bloquear cadastro, `invalid-feedback` no campo `cnpj`.
- **CB-02 (Cliente já cadastrado):** CPF já existente na mesma empresa ➔ bloquear cadastro, `invalid-feedback` no campo `cpf`.
- **CB-03 (Campos obrigatórios ausentes):** Formulário incompleto ➔ rejeitar com `invalid-feedback` por campo, mantendo os dados preenchidos.
- **CB-04 (Processo duplicado):** Cliente com processo `EM_ANDAMENTO` não recebe novo processo ➔ mensagem informando o processo existente.
- **CB-05 (Busca sem resultado):** Buscas sem resultado ➔ mensagem de "não encontrado", sem erro não tratado.
- **CB-06 (Formato de arquivo inválido):** Upload rejeitado pelo `fileFilter` do `multer` (formato ou tamanho) ➔ não marcar o documento como recebido.
- **CB-07 (Link expirado ou inválido):** Token inexistente ou de processo `CONCLUIDO` ➔ página de link inválido/expirado (`404`), sem vazar stack trace.
- **CB-08 (Falha no envio do link):** Contato do cliente vazio/inválido ➔ impedir o envio com mensagem orientando conferir o contato.
- **CB-09 (Login inválido):** E-mail/senha incorretos ➔ mensagem de erro, sem criar sessão.
- **CB-10 (Lembrete fora do Plano Pro):** Empresas no Plano Grátis nunca geram `LembreteEnviado`.
- **CB-11 (Chave de criptografia ausente ou inválida):** Sem `ENCRYPTION_KEY` de 32 bytes ➔ a aplicação falha na inicialização e nunca grava arquivo sem cifrar; falha de decifragem no download ➔ erro tratado.
- **CB-12 (Recurso de outra empresa):** Cliente, processo ou documento de outra empresa ➔ `404 Not Found`.
- **CB-13 (Exclusão em Cascata):** Excluir empresa, cliente ou processo remove seus dependentes via `onDelete: Cascade`, sem afetar os níveis acima.

---

## 5. Modelo de Dados

### 5.1 Entidades Principais
- **Empresa:** `id` (Int autoincrement), `razaoSocial` (VARCHAR 150), `cnpj` (VARCHAR 18 UNIQUE), `email` (VARCHAR 255 UNIQUE, login), `senhaHash` (VARCHAR 255), `plano` (`GRATIS` | `PRO`), `ativa`, `createdAt`, `updatedAt`.
- **Cliente:** `id` (Int), `empresaId` (FK Empresa ON DELETE CASCADE), `nome` (VARCHAR 150), `cpf` (VARCHAR 14, único por empresa), `email` (opcional), `telefone` (opcional), `createdAt`, `updatedAt`.
- **Processo:** `id` (Int), `clienteId` (FK Cliente ON DELETE CASCADE), `nomeProcesso` (VARCHAR 150), `tokenAcesso` (UUID UNIQUE), `status` (`EM_ANDAMENTO` | `CONCLUIDO`), `dataConclusao` (opcional), `createdAt`, `updatedAt`.
- **DocumentoChecklist:** `id` (Int), `processoId` (FK Processo ON DELETE CASCADE), `nomeDocumento` (VARCHAR 100), `status` (`PENDENTE` | `RECEBIDO`), `arquivoNome` (opcional), `arquivoTipo` (opcional), `arquivoConteudo` (`Bytes`/LONGBLOB, opcional, conteúdo cifrado), `dataEnvio` (opcional).
- **LembreteEnviado:** `id` (Int), `processoId` (FK Processo ON DELETE CASCADE), `dataHoraEnvio` (DateTime). Exclusivo do Plano Pro.

Toda alteração de schema exige uma migration nova (`npx prisma migrate dev --name <descricao>`); nunca edite uma migration já aplicada.

---

## 6. Diretrizes de Implementação e Código

Antes de modificar ou criar qualquer módulo:
1. Verifique `SPECIFICATION.md` para garantir conformidade de contratos, rotas e nomes de campos.
2. Implemente validações de entrada com `express-validator` e exiba os erros com `invalid-feedback`.
3. Não use blocos `catch` vazios. Trate erros de forma explícita com mensagens informativas e logs adequados, sem vazar stack trace ao usuário.
4. Escreva testes automatizados (`jest` + `supertest`) para cobrir todos os cenários felizes e casos de borda especificados: CNPJ/CPF duplicados, geração e unicidade do token, processo duplicado, conclusão automática, restrição ao Plano Pro, formato de arquivo inválido, arquivo cifrado no banco (sem escrita em disco), link expirado e falha no envio do link.
5. Nunca grave arquivos enviados no disco local, nunca hardcode credenciais ou chaves: leia `DATABASE_URL`, `SESSION_SECRET`, `ENCRYPTION_KEY` (32 bytes em hexadecimal) e `BASE_URL` de `process.env` (via `dotenv` em desenvolvimento).
6. Não introduza TypeScript, frontend desacoplado (React/Vue/Next.js), outro ORM (Sequelize, TypeORM) ou outro banco sem requisito explícito.
7. Não considere a implementação concluída enquanto os testes relevantes não passarem e os fluxos de cadastro de empresa, cadastro de cliente, criação de processo, envio de documentos pelo cliente e conclusão automática não puderem ser verificados.

---

## 7. Comandos Recomendados

### Node.js & Testes
- Instalação das dependências (se não houver `package.json`, execute antes `npm init -y`):
  ```bash
  npm install express ejs express-session bcrypt multer express-validator connect-flash uuid dotenv @prisma/client @quixo3/prisma-session-store
  npm install --save-dev nodemon jest supertest prisma eslint prettier
  ```
- Gerar a chave de criptografia e colocá-la em `ENCRYPTION_KEY` no `.env`:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- Lint:
  ```bash
  npm run lint
  ```
- Executar suíte de testes:
  ```bash
  npm test
  ```
- Executar a aplicação em desenvolvimento:
  ```bash
  npm run dev
  ```

### Prisma
- Criação e execução de migrações:
  ```bash
  npx prisma migrate dev --name init
  npx prisma migrate deploy
  npx prisma generate
  ```

### Docker
- Subir banco de dados e aplicação:
  ```bash
  docker compose up -d
  ```
  ou, para reconstruir as imagens:
  ```bash
  docker compose up --build
  ```

### Hospedagem
- Servidor: **Render** (Web Service free, build a partir do `Dockerfile`). Banco: **MySQL no Clever Cloud** (plano DEV). Detalhes e variáveis de ambiente em `SPECIFICATION.md`, Seção 1.3.

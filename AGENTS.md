# AGENTS.md

## 1. Objetivo e fonte de verdade

Este diretório contém o sistema DocFlow, que organiza a coleta de documentos entre empresas e seus clientes. O sistema deve gerenciar:

- cadastro de empresas (contas administradoras) e login;
- cadastro de clientes de cada empresa;
- criação e acompanhamento de checklists (processos) de documentos por cliente;
- envio de link único para o cliente enviar os documentos solicitados;
- conclusão automática do processo e, no Plano Pro, lembretes automáticos e histórico de documentos.

`SPECIFICATION.md` é a fonte de verdade para requisitos, nomes de entidades, regras de negócio, rotas e requisitos de interface. Antes de implementar ou alterar qualquer comportamento, consulte o trecho correspondente da especificação e preserve seus contratos.

## 2. Stack e convenções

- JavaScript (Node.js 20+ LTS);
- Express 4.x como framework web;
- Prisma 5.x como ORM (`@prisma/client` + Prisma Migrate), schema único em `prisma/schema.prisma`;
- MySQL 8.x como banco de dados;
- EJS como template engine, com Bootstrap 5 para a interface;
- `express-session` + `@quixo3/prisma-session-store` para sessão, `bcrypt` para hash de senha;
- `multer` para upload de arquivos e `express-validator` para validação de formulários;
- `connect-flash` para mensagens do sistema;
- Docker + Docker Compose para ambiente de desenvolvimento (serviços `app` e `db`);
- testes automatizados com `jest` + `supertest`.

Não introduza TypeScript, um frontend desacoplado (React/Vue/Next.js), outro ORM (Sequelize, TypeORM) ou outro banco de dados sem requisito explícito. Use as convenções e os pacotes já adotados pelo projeto.

## 3. Modelo de domínio

Implemente as entidades definidas em `SPECIFICATION.md` (Seção 2.1) diretamente em `prisma/schema.prisma`, com os campos, limites, enums e relações especificados:

- `Empresa`: guarda as próprias credenciais de login (`email` + `senhaHash`), CNPJ único, plano (`GRATIS` ou `PRO`);
- `Cliente`: vinculado a uma empresa, CPF único por empresa (`@@unique([empresaId, cpf])`), contato para envio do link;
- `Processo`: vinculado a um cliente, `tokenAcesso` único (UUID), status (`EM_ANDAMENTO` ou `CONCLUIDO`);
- `DocumentoChecklist`: vinculado a um processo, status (`PENDENTE` ou `RECEBIDO`), caminho do arquivo enviado;
- `LembreteEnviado`: vinculado a um processo, registra os lembretes automáticos enviados (Plano Pro).

Use `onDelete: Cascade` nas relações (`@relation`) exatamente como descrito na especificação. O `tokenAcesso` do `Processo` deve ser gerado com `@default(uuid())` e nunca reaproveitado. Senhas nunca são armazenadas em texto puro — sempre via `bcrypt.hash`. Toda alteração de schema exige uma migration nova (`npx prisma migrate dev --name <descricao>`); nunca edite uma migration já aplicada.

## 4. Regras de negócio obrigatórias

As regras devem ser aplicadas na camada `services/`, nunca somente na apresentação:

1. Não permitir duas empresas com o mesmo CNPJ, nem dois clientes com o mesmo CPF na mesma empresa.
2. Gerar automaticamente um `tokenAcesso` único ao criar cada processo; esse token é a base do link individual do cliente.
3. Não permitir criar um novo processo em aberto para um cliente que já tenha outro processo `EM_ANDAMENTO`.
4. Ao registrar o último documento pendente de um processo como recebido, mudar automaticamente o status do processo para `CONCLUIDO` e preencher `dataConclusao`.
5. Restringir lembretes automáticos e histórico de documentos às empresas com `plano === 'PRO'`.
6. Toda ação administrativa (clientes, processos, envio de link, acompanhamento) exige empresa autenticada via `requireAuth`.
7. Validar o formato do arquivo enviado pelo cliente (via `fileFilter` do `multer`) antes de marcar o documento como recebido.
8. Tratar acesso a token inexistente ou de processo já concluído como link inválido/expirado, nunca como erro não tratado (sem vazar stack trace).

Operações que alteram o status do processo (conclusão automática, geração de token, envio de lembrete) devem ser atômicas e idempotentes quando aplicável — use `prisma.$transaction(...)` para operações que leem e depois escrevem o mesmo registro. Evite marcar o mesmo documento como recebido duas vezes ou reenviar lembretes duplicados na mesma janela de verificação. Quando houver concorrência (ex.: dois uploads simultâneos no mesmo processo), proteja a leitura e atualização do status com transação apropriada do banco.

## 5. Arquitetura e responsabilidades

- **Models (`prisma/schema.prisma`):** estrutura persistida, relações, enums e constraints; nenhuma lógica de negócio aqui.
- **Services (`services/`):** geração de token, transições de status do processo, verificação de conclusão automática e envio de lembretes/links — toda regra numerada da Seção 4 de `SPECIFICATION.md`, usando o `PrismaClient` importado de `lib/prisma.js`.
- **Controllers (`controllers/`):** recebem `req`/`res`, validam entrada com `express-validator`, chamam os services e decidem entre `render` ou `redirect`.
- **Routes (`routes/`):** ligam método + URL ao controller, aplicando `requireAuth` onde exigido.
- **Views (`views/*.ejs`):** apresentação, formulários e mensagens; não devem conter regra de negócio nem alterar status.
- **Middlewares (`middlewares/`):** `requireAuth`, configuração do `multer`, tratamento central de erros.

Não duplique a mesma regra em vários controllers. Erros de validação devem ser explícitos, informativos e exibidos com `invalid-feedback`; não use blocos `catch` vazios nem esconda falhas de persistência ou de upload.

## 6. Contratos de Rotas

Implemente os seguintes contratos:

| URL | Método | Controller | Resultado de sucesso |
|---|---|---|---|
| `/empresas/cadastro` | GET, POST | `empresaController` | redireciona para `/login` |
| `/empresas/perfil` | GET, POST | `empresaController` | redireciona para `/empresas/perfil` |
| `/empresas/excluir` | POST | `empresaController` | redireciona para `/login` |
| `/login` | GET, POST | `authController` | redireciona para `/processos` |
| `/logout` | POST | `authController` | redireciona para `/login` |
| `/clientes` | GET | `clienteController` | lista clientes da empresa |
| `/clientes/novo` | GET, POST | `clienteController` | redireciona para `/clientes` |
| `/clientes/:id/editar` | GET, POST | `clienteController` | redireciona para `/clientes` |
| `/clientes/:id/excluir` | POST | `clienteController` | redireciona para `/clientes` |
| `/clientes/:id/historico` | GET | `clienteController` | exibe histórico (Plano Pro) |
| `/processos` | GET | `processoController` | painel de pendências |
| `/processos/novo` | GET, POST | `processoController` | redireciona para `/processos/:id` |
| `/processos/:id` | GET | `processoController` | exibe documentos do processo |
| `/processos/:id/editar` | GET, POST | `processoController` | redireciona para `/processos/:id` |
| `/processos/:id/excluir` | POST | `processoController` | redireciona para `/processos` |
| `/processos/:id/enviar-link` | POST | `processoController` | redireciona para `/processos/:id` |
| `/upload/:token` | GET, POST | `uploadController` | atualiza a checklist pública |

## 7. Interface

- Todas as views administrativas devem herdar de `views/partials/layout.ejs`; a tela pública de upload pode usar um layout simplificado próprio.
- A navbar fixa deve oferecer links para Processos, Clientes e Empresa/Perfil (e Histórico quando `plano === 'PRO'`).
- O painel de processos deve usar cards e badges: `bg-warning` para `EM_ANDAMENTO` e `bg-success` para `CONCLUIDO`.
- O detalhe do processo deve listar os documentos em tabela, com badge por documento (`bg-warning` Pendente, `bg-success` Recebido) e um `input-group` para copiar o link do cliente.
- Inputs devem usar `form-control` ou `form-select`. Erros devem aparecer em `invalid-feedback`.
- Inclua o partial `_messages.ejs` para as flash messages do `connect-flash`, usando `alert-success`, `alert-danger` e `alert-warning`, além de `btn-close`.

## 8. Testes e validação

Cubra fluxos felizes e casos de borda definidos em `SPECIFICATION.md`, especialmente CNPJ/CPF duplicados, geração e unicidade do token de acesso, processo duplicado para o mesmo cliente, conclusão automática do processo, restrição de recursos ao Plano Pro, formato de arquivo inválido no upload, link expirado/inválido e falha no envio do link.

Execute, a partir deste diretório:

```bash
docker compose up --build
npm run lint
npx prisma migrate deploy
npm test
npm run dev
```

Não considere uma implementação concluída enquanto os testes relevantes não passarem e os fluxos de cadastro de empresa, cadastro de cliente, criação de processo, envio de documentos pelo cliente e conclusão automática não puderem ser verificados.

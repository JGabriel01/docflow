# DocFlow

Sistema Express/EJS para coleta de documentos com checklist, links públicos e conclusão automática.

## Requisitos

- Node.js 20+
- Docker Desktop

## Execução com Docker

```bash
docker compose up --build -d
```

Acesse `http://localhost:3000`. O Compose aguarda o MySQL ficar saudável, aplica as migrations e inicia o app.

## Execução local

Copie o ambiente de exemplo antes de executar comandos locais:

```bash
Copy-Item .env.example .env
npm ci
npx prisma migrate deploy
npm test
npm run dev
```

Se a porta 3000 estiver ocupada pelo Docker, use outra porta no PowerShell:

```powershell
$env:PORT=3001; npm run dev
```

No Linux/macOS:

```bash
cp .env.example .env
PORT=3001 npm run dev
```

O Plano Pro é configurado diretamente no banco para demonstração:

```sql
UPDATE Empresa SET plano = 'PRO' WHERE email = 'empresa@example.com';
```

Para envio real, preencha as variáveis SMTP ou Twilio em `.env`, conforme `.env.example`.

## Validação

```bash
npm run lint
npm test
npx prisma validate
```
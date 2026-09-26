FROM node:20-alpine

# Instalar dependências necessárias para o Prisma em Alpine
RUN apk add --no-cache openssl libc6-compat

WORKDIR /app

# Copiar arquivos de dependências
COPY package*.json ./
COPY prisma ./prisma/

# Instalar dependências de produção
RUN npm ci --only=production

# Gerar o Prisma Client
RUN npx prisma generate

# Copiar o restante da aplicação
COPY . .

# Expor a porta da aplicação
EXPOSE 3000

# Variáveis padrão
ENV NODE_ENV=production
ENV PORT=3000

# Comando de inicialização
CMD ["sh", "-c", "npx prisma migrate deploy && node server.js"]

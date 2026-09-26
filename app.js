require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const { PrismaSessionStore } = require('@quixo3/prisma-session-store');

const prisma = require('./lib/prisma');
const cryptoService = require('./services/cryptoService');
const errorHandler = require('./middlewares/errorHandler');

// Validar chave de criptografia na inicialização (CB-11)
cryptoService.validateEncryptionKey();

const app = express();

// Configurações de View Engine (EJS)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Arquivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Parsers
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Gerenciamento de Sessão via MySQL (PrismaSessionStore)
const sessionOptions = {
  secret: process.env.SESSION_SECRET || 'docflow-secret-fallback-key-2026',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 dias
    httpOnly: true,
  },
};

// Em ambiente de teste ou desenvolvimento, usar PrismaSessionStore
if (process.env.NODE_ENV !== 'test') {
  sessionOptions.store = new PrismaSessionStore(prisma, {
    checkPeriod: 10 * 60 * 1000,
    dbRecordIdIsSessionId: true,
    dbRecordIdFunction: undefined,
  });
}

app.use(session(sessionOptions));
app.use(flash());

// Middleware para variáveis globais nas views
app.use((req, res, next) => {
  res.locals.messages = {
    success: req.flash('success'),
    danger: req.flash('danger'),
    warning: req.flash('warning'),
    info: req.flash('info'),
  };
  res.locals.empresa = req.session && req.session.empresa ? req.session.empresa : null;
  res.locals.currentPath = req.path;
  next();
});

// Importação das Rotas
const authRoutes = require('./routes/authRoutes');
const empresaRoutes = require('./routes/empresaRoutes');
const clienteRoutes = require('./routes/clienteRoutes');
const processoRoutes = require('./routes/processoRoutes');
const uploadRoutes = require('./routes/uploadRoutes');

// Rota raiz
app.get('/', (req, res) => {
  if (req.session && req.session.empresa) {
    return res.redirect('/processos');
  }
  return res.redirect('/login');
});

// Registro dos Módulos de Rotas
app.use('/', authRoutes);
app.use('/empresas', empresaRoutes);
app.use('/clientes', clienteRoutes);
app.use('/processos', processoRoutes);
app.use('/upload', uploadRoutes);

// Tratamento de Rota Não Encontrada (404)
app.use((req, res, next) => {
  const err = new Error('Página não encontrada.');
  err.statusCode = 404;
  next(err);
});

// Tratamento Centralizado de Erros
app.use(errorHandler);

module.exports = app;

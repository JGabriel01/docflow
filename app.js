require("dotenv").config();
require("express-async-errors");
const express = require("express");
const session = require("express-session");
const flash = require("connect-flash");
const { PrismaSessionStore } = require("@quixo3/prisma-session-store");
const prisma = require("./lib/prisma");

const app = express();
const sessionStore = new PrismaSessionStore(prisma, {
  checkPeriod: 2 * 60 * 1000,
  dbRecordIdIsSessionId: true,
});

app.set("view engine", "ejs");
app.set("views", `${__dirname}/views`);
app.use(express.urlencoded({ extended: true }));
app.use(express.static(`${__dirname}/public`));
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
  }),
);
app.use(flash());
app.use((req, res, next) => {
  res.locals.flash =
    req.method === "GET"
      ? {
          success: req.flash("success"),
          danger: req.flash("danger"),
          warning: req.flash("warning"),
        }
      : { success: [], danger: [], warning: [] };
  res.locals.currentPath = req.path;
  res.locals.empresa = req.session.empresa || null;
  res.locals.escapeHtml = (value) => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
  next();
});
app.use("/", require("./routes/auth"));
app.use("/empresas", require("./routes/empresas"));
app.use("/clientes", require("./routes/clientes"));
app.use("/processos", require("./routes/processos"));
app.use("/upload", require("./routes/upload"));
app.get("/", (req, res) =>
  res.redirect(req.session.empresaId ? "/processos" : "/login"),
);
app.use((error, req, res, next) => {
  if (error.code === "LIMIT_FILE_SIZE")
    return res.status(200).render("link-invalido", {
      title: "Arquivo inválido",
      message: "O arquivo deve ter no máximo 10 MB.",
      detail: "Envie um PDF, JPG ou PNG com até 10 MB.",
    });
  next(error);
});
app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).render("not-found", {
    title: "Erro",
    message: "Ocorreu um erro inesperado. Tente novamente.",
  });
});

module.exports = app;
app.sessionStore = sessionStore;

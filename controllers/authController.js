const bcrypt = require("bcrypt");
const prisma = require("../lib/prisma");

async function loginForm(req, res) {
  res.render("login", { title: "Entrar", errors: {}, form: {} });
}

async function login(req, res) {
  const { email, senha } = req.body;
  const empresa = await prisma.empresa.findUnique({ where: { email } });
  if (
    !empresa ||
    !empresa.ativa ||
    !(await bcrypt.compare(senha || "", empresa.senhaHash))
  ) {
    return res.status(422).render("login", {
      title: "Entrar",
      errors: { senha: "E-mail ou senha inválidos." },
      form: req.body,
    });
  }
    req.session.empresaId = empresa.id;
    req.session.empresa = {
      id: empresa.id,
      razaoSocial: empresa.razaoSocial,
      cnpj: empresa.cnpj,
      email: empresa.email,
      plano: empresa.plano,
      ativa: empresa.ativa,
    };
  res.redirect("/processos");
}

function logout(req, res) {
  req.session.destroy(() => res.redirect("/login"));
}

module.exports = { loginForm, login, logout };

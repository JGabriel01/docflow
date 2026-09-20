const prisma = require("../lib/prisma");
const service = require("../services/empresaService");

async function cadastroForm(req, res) {
  res.render("empresa-cadastro", {
    title: "Criar conta",
    errors: {},
    form: {},
  });
}
async function cadastro(req, res) {
  const form = req.body;
  const errors = req.validationErrors || validate(form, true);
  if (Object.keys(errors).length)
    return res
      .status(200)
      .render("empresa-cadastro", { title: "Criar conta", errors, form });
  try {
    await service.criarEmpresa(form);
    res.redirect("/login");
  } catch (error) {
    if (error.code === "P2002")
      return res.status(200).render("empresa-cadastro", {
        title: "Criar conta",
        errors: { cnpj: "CNPJ ou e-mail já cadastrado." },
        form,
      });
    throw error;
  }
}

async function perfilForm(req, res) {
  const empresa = await prisma.empresa.findUnique({
    where: { id: req.session.empresaId },
  });
  res.render("perfil", { title: "Empresa", errors: {}, form: empresa });
}
async function perfil(req, res) {
  const errors = req.validationErrors || {};
  if (Object.keys(errors).length)
    return res
      .status(200)
      .render("perfil", { title: "Empresa", errors, form: req.body });
  try {
    await service.atualizarEmpresa(req.session.empresaId, req.body);
    res.redirect("/empresas/perfil");
  } catch (error) {
    if (error.code === "P2002")
      return res.status(200).render("perfil", {
        title: "Empresa",
        errors: { cnpj: "CNPJ ou e-mail já cadastrado." },
        form: req.body,
      });
    throw error;
  }
}
async function excluir(req, res) {
  await service.excluirEmpresa(req.session.empresaId);
  req.session.destroy(() => res.redirect("/login"));
}
function validate(form, passwordRequired) {
  const errors = {};
  if (!form.razaoSocial) errors.razaoSocial = "Informe a razão social.";
  if (!form.cnpj) errors.cnpj = "Informe o CNPJ.";
  if (!form.email) errors.email = "Informe o e-mail.";
  if (passwordRequired && !form.senha) errors.senha = "Informe a senha.";
  return errors;
}

module.exports = { cadastroForm, cadastro, perfilForm, perfil, excluir };

const service = require("../services/clienteService");
const empresaService = require("../services/empresaService");

async function lista(req, res) {
  const clientes = await service.listarClientes(
    req.session.empresaId,
    req.query.busca,
  );
  res.render("clientes", {
    title: "Clientes",
    clientes,
    busca: req.query.busca || "",
  });
}
async function novoForm(req, res) {
  res.render("cliente-form", {
    title: "Novo cliente",
    form: {},
    errors: {},
    action: "/clientes/novo",
  });
}
async function novo(req, res) {
  const errors = req.validationErrors || validate(req.body);
  if (Object.keys(errors).length)
    return res.status(200).render("cliente-form", {
      title: "Novo cliente",
      form: req.body,
      errors,
      action: "/clientes/novo",
    });
  try {
    await service.criarCliente(req.session.empresaId, req.body);
    res.redirect("/clientes");
  } catch (error) {
    if (error.code === "P2002")
      return res.status(200).render("cliente-form", {
        title: "Novo cliente",
        form: req.body,
        errors: { cpf: "CPF já cadastrado nesta empresa." },
        action: "/clientes/novo",
      });
    throw error;
  }
}
async function editarForm(req, res) {
  const form = await service.obterCliente(
    req.session.empresaId,
    Number(req.params.id),
  );
  if (!form)
    return res.status(404).render("not-found", {
      title: "Não encontrado",
      message: "Cliente não encontrado.",
    });
    res.render("cliente-form", {
      title: "Editar cliente",
      form,
      errors: {},
      action: `/clientes/${Number(form.id)}/editar`,
    });
}
async function editar(req, res) {
  const errors = req.validationErrors || validate(req.body);
  if (Object.keys(errors).length)
    return res.status(200).render("cliente-form", {
      title: "Editar cliente",
      form: { ...req.body, id: req.params.id },
      errors,
      action: `/clientes/${Number(req.params.id)}/editar`,
    });
  try {
    await service.atualizarCliente(
      req.session.empresaId,
      Number(req.params.id),
      req.body,
    );
    res.redirect("/clientes");
  } catch (error) {
    if (error.code === "P2002")
      return res.status(200).render("cliente-form", {
        title: "Editar cliente",
        form: { ...req.body, id: req.params.id },
        errors: { cpf: "CPF já cadastrado nesta empresa." },
        action: `/clientes/${Number(req.params.id)}/editar`,
      });
    throw error;
  }
}
async function excluir(req, res) {
  await service.excluirCliente(req.session.empresaId, Number(req.params.id));
  res.redirect("/clientes");
}
async function historico(req, res) {
  const empresa = await empresaService.obterEmpresa(req.session.empresaId);
  if (empresa.plano !== "PRO")
    return res.status(403).render("not-found", {
      title: "Recurso Pro",
      message: "Este recurso está disponível no Plano Pro.",
    });
  const cliente = await service.historicoCliente(
    req.session.empresaId,
    Number(req.params.id),
  );
  if (!cliente)
    return res.status(404).render("not-found", {
      title: "Não encontrado",
      message: "Cliente não encontrado.",
    });
  res.render("historico", { title: "Histórico", cliente });
}
function validate(form) {
  const errors = {};
  if (!form.nome) errors.nome = "Informe o nome.";
  if (!form.cpf) errors.cpf = "Informe o CPF.";
  return errors;
}

module.exports = {
  lista,
  novoForm,
  novo,
  editarForm,
  editar,
  excluir,
  historico,
};

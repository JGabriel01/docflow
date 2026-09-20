const service = require("../services/processoService");
const clienteService = require("../services/clienteService");
const envioService = require("../services/envioService");
const notificacaoService = require("../services/notificacaoService");

async function lista(req, res) {
  const processos = await service.listarProcessos(req.session.empresaId);
  res.render("processos", { title: "Processos", processos });
}
async function novoForm(req, res) {
  const clientes = await clienteService.listarClientes(req.session.empresaId);
  res.render("processo-form", {
    title: "Novo processo",
    clientes,
    form: { documentos: [""] },
    errors: {},
    action: "/processos/novo",
  });
}
async function novo(req, res) {
  const form = normalize(req.body);
  const errors = req.validationErrors || validate(form);
  if (Object.keys(errors).length)
    return renderForm(
      req,
      res,
      form,
      errors,
      "/processos/novo",
      "Novo processo",
    );
  try {
    const processo = await service.criarProcesso(req.session.empresaId, form);
    req.flash("success", "Processo criado com sucesso.");
    res.redirect(`/processos/${processo.id}`);
  } catch (error) {
    if (error.message === "PROCESSO_EM_ANDAMENTO")
      return renderForm(
        req,
        res,
        form,
        { clienteId: "Este cliente já possui um processo em andamento." },
        "/processos/novo",
        "Novo processo",
      );
    throw error;
  }
}
async function detalhe(req, res) {
  const processo = await service.obterProcesso(
    req.session.empresaId,
    Number(req.params.id),
  );
  if (!processo)
    return res.status(404).render("not-found", {
      title: "Não encontrado",
      message: "Processo não encontrado.",
    });
  res.render("processo-detalhe", {
    title: processo.nomeProcesso,
    processo,
    link: `${req.protocol}://${req.get("host")}/upload/${processo.tokenAcesso}`,
  });
}
async function editarForm(req, res) {
  const processo = await service.obterProcesso(
    req.session.empresaId,
    Number(req.params.id),
  );
  if (!processo)
    return res.status(404).render("not-found", {
      title: "Não encontrado",
      message: "Processo não encontrado.",
    });
  const clientes = await clienteService.listarClientes(req.session.empresaId);
  res.render("processo-form", {
    title: "Editar processo",
    clientes,
    form: {
      ...processo,
      documentos: processo.documentos.map((doc) => doc.nomeDocumento),
    },
    errors: {},
    action: `/processos/${processo.id}/editar`,
  });
}
async function editar(req, res) {
  const form = normalize(req.body);
  const errors = req.validationErrors || validate({ ...form, clienteId: 1 });
  if (Object.keys(errors).length)
    return renderForm(
      req,
      res,
      form,
      errors,
      `/processos/${req.params.id}/editar`,
      "Editar processo",
    );
  await service.atualizarChecklist(
    req.session.empresaId,
    Number(req.params.id),
    form,
  );
  res.redirect(`/processos/${req.params.id}`);
}
async function excluir(req, res) {
  await service.excluirProcesso(req.session.empresaId, Number(req.params.id));
  res.redirect("/processos");
}
async function enviarLink(req, res) {
  const processo = await service.obterProcesso(
    req.session.empresaId,
    Number(req.params.id),
  );
  try {
    const envio = await envioService.enviarLink(processo, req.body.canalEnvio);
    await notificacaoService.enviar(envio);
    req.flash("success", "Link enviado ao cliente com sucesso.");
  } catch {
    req.flash(
      "danger",
      "Não foi possível enviar o link: verifique o contato e a configuração do canal.",
    );
  }
  res.redirect(`/processos/${req.params.id}`);
}
function normalize(body) {
  const raw = Array.isArray(body.documentos)
    ? body.documentos
    : [body.documentos];
  return {
    clienteId: Number(body.clienteId),
    nomeProcesso: body.nomeProcesso,
    documentos: raw
      .filter(Boolean)
      .flatMap((item) => item.split(/\r?\n/))
      .map((item) => item.trim())
      .filter(Boolean),
  };
}
function validate(form) {
  const errors = {};
  if (!form.clienteId) errors.clienteId = "Selecione um cliente.";
  if (!form.nomeProcesso) errors.nomeProcesso = "Informe o nome do processo.";
  if (!form.documentos.length)
    errors.documentos = "Informe ao menos um documento.";
  return errors;
}
async function renderForm(req, res, form, errors, action, title) {
  const clientes = await clienteService.listarClientes(req.session.empresaId);
  res
    .status(422)
    .render("processo-form", { title, clientes, form, errors, action });
}

module.exports = {
  lista,
  novoForm,
  novo,
  detalhe,
  editarForm,
  editar,
  excluir,
  enviarLink,
};

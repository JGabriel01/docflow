const service = require("../services/processoService");

async function tela(req, res) {
  const processo = await service.obterProcessoPublico(req.params.token);
  if (!processo)
    return res.status(404).render("link-invalido", { title: "Link inválido" });
  res.render("upload", {
    title: "Enviar documentos",
    processo,
    error: null,
    success: null,
  });
}
async function enviar(req, res) {
  const processo = await service.obterProcessoPublico(req.params.token);
  if (!processo)
    return res.status(404).render("link-invalido", { title: "Link inválido" });
  if (!req.file)
    return res.status(422).render("upload", {
      title: "Enviar documentos",
      processo,
      error: "Formato de arquivo não permitido. Envie PDF, JPG ou PNG.",
      success: null,
    });
  try {
    const result = await service.registrarUpload(
      req.params.token,
      Number(req.body.documentoId),
      req.file.path,
    );
    const atualizada = await service.obterProcessoPublico(req.params.token);
    res.render("upload", {
      title: "Enviar documentos",
      processo: atualizada || { ...processo, status: "CONCLUIDO" },
      error: null,
      success: result.concluido
        ? "Todos os documentos foram recebidos! Processo concluído."
        : "Documento recebido com sucesso.",
    });
  } catch (error) {
    if (error.message === "LINK_INVALIDO")
      return res
        .status(404)
        .render("link-invalido", { title: "Link inválido" });
    res.status(422).render("upload", {
      title: "Enviar documentos",
      processo,
      error: "Não foi possível registrar este documento.",
      success: null,
    });
  }
}

module.exports = { tela, enviar };

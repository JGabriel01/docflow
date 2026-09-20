const fs = require("fs");
const service = require("../services/processoService");
const upload = require("../middlewares/upload");

async function tela(req, res) {
  const processo = await service.obterProcessoPublico(req.params.token);
  if (!processo)
    return res.status(404).render("link-invalido", { title: "Link inválido" });
  res.render("upload", {
    title: "Enviar documentos",
    processo,
    error: null,
    success: null,
    completed: false,
  });
}
async function enviar(req, res) {
  const processo = await service.obterProcessoPublico(req.params.token);
  if (!processo)
    return res.status(404).render("link-invalido", { title: "Link inválido" });
  if (!req.file || !upload.assinaturaValida(req.file.path, req.file.mimetype)) {
    if (req.file) fs.rmSync(req.file.path, { force: true });
    return res.status(200).render("upload", {
      title: "Enviar documentos",
      processo,
      error: "Formato de arquivo não permitido. Envie PDF, JPG ou PNG.",
      success: null,
      completed: false,
    });
  }
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
      completed: result.concluido,
    });
  } catch (error) {
    fs.rmSync(req.file.path, { force: true });
    if (error.message === "LINK_INVALIDO")
      return res
        .status(404)
        .render("link-invalido", { title: "Link inválido" });
    if (error.code === "P2034")
      return res.status(200).render("upload", {
        title: "Enviar documentos",
        processo,
        error: "Outra operação ocorreu ao mesmo tempo. Envie o arquivo novamente.",
        success: null,
        completed: false,
      });
    res.status(200).render("upload", {
      title: "Enviar documentos",
      processo,
      error: "Não foi possível registrar este documento.",
      success: null,
      completed: false,
    });
  }
}

async function baixar(req, res) {
  const documento = await service.obterDocumento(req.session.empresaId, Number(req.params.id));
  if (!documento || !fs.existsSync(documento.arquivoPath)) return res.status(404).render("not-found", { title: "Não encontrado", message: "Documento não encontrado." });
  res.download(documento.arquivoPath, documento.nomeDocumento + require("path").extname(documento.arquivoPath));
}

module.exports = { tela, enviar, baixar };

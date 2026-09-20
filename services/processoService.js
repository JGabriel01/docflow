const prisma = require("../lib/prisma");

async function criarProcesso(
  empresaId,
  { clienteId, nomeProcesso, documentos },
) {
  return prisma.$transaction(async (tx) => {
    const cliente = await tx.cliente.findFirst({
      where: { id: clienteId, empresaId },
    });
    if (!cliente) throw new Error("CLIENTE_NAO_ENCONTRADO");
    const aberto = await tx.processo.findFirst({
      where: { clienteId, status: "EM_ANDAMENTO" },
    });
    if (aberto) throw new Error("PROCESSO_EM_ANDAMENTO");
    return tx.processo.create({
      data: {
        clienteId,
        nomeProcesso,
        documentos: {
          create: documentos.map((nomeDocumento) => ({ nomeDocumento })),
        },
      },
      include: { cliente: true, documentos: true },
    });
  });
}

async function listarProcessos(empresaId) {
  return prisma.processo.findMany({
    where: { cliente: { empresaId } },
    include: { cliente: true, documentos: true },
    orderBy: { createdAt: "desc" },
  });
}

async function obterProcesso(empresaId, id) {
  return prisma.processo.findFirst({
    where: { id, cliente: { empresaId } },
    include: { cliente: true, documentos: true },
  });
}

async function excluirProcesso(empresaId, id) {
  return prisma.processo.deleteMany({ where: { id, cliente: { empresaId } } });
}

async function atualizarChecklist(empresaId, id, { nomeProcesso, documentos }) {
  return prisma.$transaction(async (tx) => {
    const processo = await tx.processo.findFirst({
      where: { id, cliente: { empresaId }, status: "EM_ANDAMENTO" },
    });
    if (!processo) throw new Error("PROCESSO_NAO_ENCONTRADO");
    await tx.documentoChecklist.deleteMany({ where: { processoId: id } });
    return tx.processo.update({
      where: { id },
      data: {
        nomeProcesso,
        documentos: {
          create: documentos.map((nomeDocumento) => ({ nomeDocumento })),
        },
      },
      include: { cliente: true, documentos: true },
    });
  });
}

async function registrarUpload(tokenAcesso, documentoId, arquivoPath) {
  return prisma.$transaction(async (tx) => {
    const processo = await tx.processo.findUnique({
      where: { tokenAcesso },
      include: { documentos: true },
    });
    if (!processo || processo.status === "CONCLUIDO")
      throw new Error("LINK_INVALIDO");
    const documento = await tx.documentoChecklist.findFirst({
      where: { id: documentoId, processoId: processo.id, status: "PENDENTE" },
    });
    if (!documento) throw new Error("DOCUMENTO_INVALIDO");
    await tx.documentoChecklist.update({
      where: { id: documento.id },
      data: { status: "RECEBIDO", arquivoPath, dataEnvio: new Date() },
    });
    const pendentes = await tx.documentoChecklist.count({
      where: { processoId: processo.id, status: "PENDENTE" },
    });
    const concluido = pendentes === 0;
    if (concluido)
      await tx.processo.update({
        where: { id: processo.id },
        data: { status: "CONCLUIDO", dataConclusao: new Date() },
      });
    return { processo, concluido };
  });
}

async function obterProcessoPublico(tokenAcesso) {
  const processo = await prisma.processo.findUnique({
    where: { tokenAcesso },
    include: { cliente: true, documentos: true },
  });
  if (!processo || processo.status === "CONCLUIDO") return null;
  return processo;
}

module.exports = {
  criarProcesso,
  listarProcessos,
  obterProcesso,
  excluirProcesso,
  atualizarChecklist,
  registrarUpload,
  obterProcessoPublico,
};

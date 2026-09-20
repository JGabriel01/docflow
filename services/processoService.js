const fs = require("fs");
const prisma = require("../lib/prisma");

async function transactionWithRetry(callback) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await prisma.$transaction(callback, {
        isolationLevel: "Serializable",
      });
    } catch (error) {
      if (error.code !== "P2034" || attempt === 3) throw error;
    }
  }
}

async function criarProcesso(
  empresaId,
  { clienteId, nomeProcesso, documentos },
) {
  return transactionWithRetry(async (tx) => {
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
  const resultado = await transactionWithRetry(async (tx) => {
    const processo = await tx.processo.findFirst({
      where: { id, cliente: { empresaId }, status: "EM_ANDAMENTO" },
    });
    if (!processo) throw new Error("PROCESSO_NAO_ENCONTRADO");
    const recebidos = await tx.documentoChecklist.findMany({
      where: { processoId: id, status: "RECEBIDO" },
    });
    await tx.documentoChecklist.deleteMany({ where: { processoId: id } });
    const novosDocumentos = documentos.map((nomeDocumento) => {
      const anterior = recebidos.find(
        (documento) => documento.nomeDocumento === nomeDocumento,
      );
      return anterior
        ? {
            nomeDocumento,
            status: "RECEBIDO",
            arquivoPath: anterior.arquivoPath,
            dataEnvio: anterior.dataEnvio,
          }
        : { nomeDocumento };
    });
    const concluido = novosDocumentos.length > 0 && novosDocumentos.every((documento) => documento.status === "RECEBIDO");
    const atualizado = await tx.processo.update({
      where: { id },
      data: {
        nomeProcesso,
        documentos: {
          create: novosDocumentos,
        },
        status: concluido ? "CONCLUIDO" : "EM_ANDAMENTO",
        dataConclusao: concluido ? new Date() : null,
      },
      include: { cliente: true, documentos: true },
    });
    return { atualizado, arquivosAntigos: recebidos.map((documento) => documento.arquivoPath).filter(Boolean), arquivosMantidos: novosDocumentos.map((documento) => documento.arquivoPath).filter(Boolean) };
  });
  const mantidos = new Set(resultado.arquivosMantidos);
  for (const arquivo of resultado.arquivosAntigos) {
    if (!mantidos.has(arquivo)) fs.rmSync(arquivo, { force: true });
  }
  return resultado.atualizado;
}

async function registrarUpload(tokenAcesso, documentoId, arquivoPath) {
  return transactionWithRetry(async (tx) => {
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
    const atualizado = await tx.documentoChecklist.updateMany({
      where: { id: documento.id, processoId: processo.id, status: "PENDENTE" },
      data: { status: "RECEBIDO", arquivoPath, dataEnvio: new Date() },
    });
    if (atualizado.count !== 1) throw new Error("DOCUMENTO_INVALIDO");
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

async function obterDocumento(empresaId, id) {
  return prisma.documentoChecklist.findFirst({
    where: { id, processo: { cliente: { empresaId } } },
  });
}

module.exports = {
  criarProcesso,
  listarProcessos,
  obterProcesso,
  excluirProcesso,
  atualizarChecklist,
  registrarUpload,
  obterProcessoPublico,
  obterDocumento,
};

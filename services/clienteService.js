const prisma = require("../lib/prisma");

async function listarClientes(empresaId, busca = "") {
  const where = { empresaId };
  if (busca)
    where.OR = [{ nome: { contains: busca } }, { cpf: { contains: busca } }];
  return prisma.cliente.findMany({ where, orderBy: { nome: "asc" } });
}

async function criarCliente(empresaId, data) {
  return prisma.cliente.create({ data: { empresaId, ...data } });
}

async function obterCliente(empresaId, id) {
  return prisma.cliente.findFirst({ where: { id, empresaId } });
}

async function atualizarCliente(empresaId, id, data) {
  return prisma.cliente.updateMany({ where: { id, empresaId }, data });
}

async function excluirCliente(empresaId, id) {
  return prisma.cliente.deleteMany({ where: { id, empresaId } });
}

async function historicoCliente(empresaId, id) {
  return prisma.cliente.findFirst({
    where: { id, empresaId },
    include: {
      processos: {
        include: { documentos: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });
}

module.exports = {
  listarClientes,
  criarCliente,
  obterCliente,
  atualizarCliente,
  excluirCliente,
  historicoCliente,
};

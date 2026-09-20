const bcrypt = require("bcrypt");
const prisma = require("../lib/prisma");

async function criarEmpresa({ razaoSocial, cnpj, email, senha }) {
  const senhaHash = await bcrypt.hash(senha, 12);
  return prisma.empresa.create({
    data: { razaoSocial, cnpj, email, senhaHash },
  });
}

async function atualizarEmpresa(id, data) {
  const update = {
    razaoSocial: data.razaoSocial,
    cnpj: data.cnpj,
    email: data.email,
  };
  if (data.senha) update.senhaHash = await bcrypt.hash(data.senha, 12);
  return prisma.empresa.update({ where: { id }, data: update });
}

async function excluirEmpresa(id) {
  return prisma.empresa.delete({ where: { id } });
}

async function obterEmpresa(id) {
  return prisma.empresa.findUnique({ where: { id } });
}

module.exports = { criarEmpresa, atualizarEmpresa, excluirEmpresa, obterEmpresa };

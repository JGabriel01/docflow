const request = require('supertest');
const prisma = require('../lib/prisma');
const app = require('../app');
const empresaService = require('../services/empresaService');

async function cleanDatabase() {
  await prisma.lembreteEnviado.deleteMany({});
  await prisma.documentoChecklist.deleteMany({});
  await prisma.processo.deleteMany({});
  await prisma.cliente.deleteMany({});
  await prisma.empresa.deleteMany({});
  await prisma.session.deleteMany({});
}

async function createTestEmpresa(custom = {}) {
  const uniqueId = Math.random().toString(36).substring(2, 9);
  const data = {
    razaoSocial: custom.razaoSocial || `Empresa Teste ${uniqueId}`,
    cnpj: custom.cnpj || `${Math.floor(10000000 + Math.random() * 90000000)}/0001-99`,
    email: custom.email || `teste_${uniqueId}@empresa.com.br`,
    senha: custom.senha || 'senha123',
    ...custom,
  };

  const empresa = await empresaService.cadastrarEmpresa(data);

  if (custom.plano && custom.plano !== 'GRATIS') {
    return await prisma.empresa.update({
      where: { id: empresa.id },
      data: { plano: custom.plano },
    });
  }

  return { ...empresa, senhaPlana: data.senha };
}

async function createAuthenticatedAgent(empresa) {
  const agent = request.agent(app);
  await agent
    .post('/login')
    .send({
      email: empresa.email,
      senha: empresa.senhaPlana || 'senha123',
    });
  return agent;
}

module.exports = {
  prisma,
  cleanDatabase,
  createTestEmpresa,
  createAuthenticatedAgent,
};

const bcrypt = require('bcrypt');
const prisma = require('../lib/prisma');

class EmpresaService {
  async cadastrarEmpresa({ razaoSocial, cnpj, email, senha }) {
    // CB-01 & RN-01: CNPJ único
    const existeCnpj = await prisma.empresa.findUnique({
      where: { cnpj },
    });
    if (existeCnpj) {
      const err = new Error('Já existe uma empresa cadastrada com este CNPJ.');
      err.field = 'cnpj';
      err.statusCode = 400;
      throw err;
    }

    // Email único
    const existeEmail = await prisma.empresa.findUnique({
      where: { email },
    });
    if (existeEmail) {
      const err = new Error('Já existe uma empresa cadastrada com este e-mail.');
      err.field = 'email';
      err.statusCode = 400;
      throw err;
    }

    const senhaHash = await bcrypt.hash(senha, 10);

    const empresa = await prisma.empresa.create({
      data: {
        razaoSocial,
        cnpj,
        email,
        senhaHash,
        plano: 'GRATIS',
        ativa: true,
      },
    });

    const { senhaHash: _, ...empresaSemSenha } = empresa;
    return empresaSemSenha;
  }

  async autenticarEmpresa(email, senha) {
    if (!email || !senha) return null;

    const empresa = await prisma.empresa.findUnique({
      where: { email },
    });

    if (!empresa || !empresa.ativa) {
      return null;
    }

    const senhaValida = await bcrypt.compare(senha, empresa.senhaHash);
    if (!senhaValida) {
      return null;
    }

    const { senhaHash: _, ...empresaSemSenha } = empresa;
    return empresaSemSenha;
  }

  async obterEmpresaPorId(id) {
    const empresa = await prisma.empresa.findUnique({
      where: { id: Number(id) },
    });
    if (!empresa) return null;
    const { senhaHash: _, ...empresaSemSenha } = empresa;
    return empresaSemSenha;
  }

  async atualizarPerfil(id, { razaoSocial, cnpj, email, senha }) {
    const empresaAtual = await prisma.empresa.findUnique({
      where: { id: Number(id) },
    });

    if (!empresaAtual) {
      const err = new Error('Empresa não encontrada.');
      err.statusCode = 404;
      throw err;
    }

    // Verificar se CNPJ mudou e já existe
    if (cnpj && cnpj !== empresaAtual.cnpj) {
      const existeCnpj = await prisma.empresa.findUnique({
        where: { cnpj },
      });
      if (existeCnpj) {
        const err = new Error('Já existe uma empresa cadastrada com este CNPJ.');
        err.field = 'cnpj';
        err.statusCode = 400;
        throw err;
      }
    }

    // Verificar se Email mudou e já existe
    if (email && email !== empresaAtual.email) {
      const existeEmail = await prisma.empresa.findUnique({
        where: { email },
      });
      if (existeEmail) {
        const err = new Error('Já existe uma empresa cadastrada com este e-mail.');
        err.field = 'email';
        err.statusCode = 400;
        throw err;
      }
    }

    const dataToUpdate = {
      razaoSocial: razaoSocial || empresaAtual.razaoSocial,
      cnpj: cnpj || empresaAtual.cnpj,
      email: email || empresaAtual.email,
    };

    if (senha && senha.trim().length > 0) {
      dataToUpdate.senhaHash = await bcrypt.hash(senha, 10);
    }

    const empresaAtualizada = await prisma.empresa.update({
      where: { id: Number(id) },
      data: dataToUpdate,
    });

    const { senhaHash: _, ...empresaSemSenha } = empresaAtualizada;
    return empresaSemSenha;
  }

  async excluirEmpresa(id) {
    // CB-13: Exclusão em cascata (onDelete: Cascade no schema)
    return await prisma.empresa.delete({
      where: { id: Number(id) },
    });
  }
}

module.exports = new EmpresaService();

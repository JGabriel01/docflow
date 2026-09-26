const prisma = require('../lib/prisma');

class ClienteService {
  async listarClientes(empresaId, busca) {
    const where = {
      empresaId: Number(empresaId),
    };

    if (busca && busca.trim().length > 0) {
      const termo = busca.trim();
      where.OR = [
        { nome: { contains: termo } },
        { cpf: { contains: termo } },
      ];
    }

    return await prisma.cliente.findMany({
      where,
      include: {
        _count: {
          select: { processos: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async obterClientePorId(empresaId, clienteId) {
    // CB-12: Acesso multi-tenant estrito
    const cliente = await prisma.cliente.findFirst({
      where: {
        id: Number(clienteId),
        empresaId: Number(empresaId),
      },
      include: {
        processos: {
          include: {
            documentos: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    return cliente;
  }

  async cadastrarCliente(empresaId, { nome, cpf, email, telefone }) {
    // RN-02 & CB-02: CPF único por empresa
    const existeCpf = await prisma.cliente.findUnique({
      where: {
        empresaId_cpf: {
          empresaId: Number(empresaId),
          cpf,
        },
      },
    });

    if (existeCpf) {
      const err = new Error('Já existe um cliente cadastrado com este CPF.');
      err.field = 'cpf';
      err.statusCode = 400;
      throw err;
    }

    return await prisma.cliente.create({
      data: {
        empresaId: Number(empresaId),
        nome,
        cpf,
        email: email || null,
        telefone: telefone || null,
      },
    });
  }

  async atualizarCliente(empresaId, clienteId, { nome, cpf, email, telefone }) {
    const clienteAtual = await this.obterClientePorId(empresaId, clienteId);
    if (!clienteAtual) {
      const err = new Error('Cliente não encontrado.');
      err.statusCode = 404;
      throw err;
    }

    if (cpf && cpf !== clienteAtual.cpf) {
      const existeCpf = await prisma.cliente.findUnique({
        where: {
          empresaId_cpf: {
            empresaId: Number(empresaId),
            cpf,
          },
        },
      });

      if (existeCpf) {
        const err = new Error('Já existe um cliente cadastrado com este CPF.');
        err.field = 'cpf';
        err.statusCode = 400;
        throw err;
      }
    }

    return await prisma.cliente.update({
      where: { id: Number(clienteId) },
      data: {
        nome: nome || clienteAtual.nome,
        cpf: cpf || clienteAtual.cpf,
        email: email !== undefined ? (email || null) : clienteAtual.email,
        telefone: telefone !== undefined ? (telefone || null) : clienteAtual.telefone,
      },
    });
  }

  async excluirCliente(empresaId, clienteId) {
    const cliente = await this.obterClientePorId(empresaId, clienteId);
    if (!cliente) {
      const err = new Error('Cliente não encontrado.');
      err.statusCode = 404;
      throw err;
    }

    // CB-13: Cascata automática no banco
    return await prisma.cliente.delete({
      where: { id: Number(clienteId) },
    });
  }

  async obterHistoricoCliente(empresaId, clienteId) {
    // RN-06: Apenas Plano PRO
    const empresa = await prisma.empresa.findUnique({
      where: { id: Number(empresaId) },
    });

    if (!empresa || empresa.plano !== 'PRO') {
      const err = new Error('O histórico de documentos está disponível apenas no Plano Pro.');
      err.statusCode = 403;
      err.isPlanRestriction = true;
      throw err;
    }

    // CB-12: Pertencer à empresa
    const cliente = await this.obterClientePorId(empresaId, clienteId);
    if (!cliente) {
      const err = new Error('Cliente não encontrado.');
      err.statusCode = 404;
      throw err;
    }

    return cliente;
  }
}

module.exports = new ClienteService();

const prisma = require('../lib/prisma');

class PlanoService {
  obterTabelaPlanos() {
    return [
      {
        id: 'GRATIS',
        nome: 'Plano Grátis',
        preco: 'R$ 0,00',
        valorNumerico: 0,
        periodo: 'sempre gratuito',
        descricao: 'Ideal para profissionais autônomos e empresas que estão começando.',
        recursos: [
          'Cadastro ilimitado de clientes',
          'Criação de checklists de processos',
          'Link único de upload para clientes',
          'Armazenamento seguro e criptografado (AES-256-GCM)',
          'Conclusão automática dos processos',
        ],
        bloqueados: [
          'Histórico completo de documentos por cliente',
          'Lembretes automáticos para documentos pendentes',
          'Selo e suporte prioritário Pro',
        ],
      },
      {
        id: 'PRO',
        nome: 'Plano Pro',
        preco: 'R$ 29,90',
        valorNumerico: 29.9,
        periodo: 'por mês',
        descricao: 'Para empresas que precisam de automação completa e histórico organizado.',
        recursos: [
          'Tudo do Plano Grátis',
          'Histórico de processos e documentos por cliente (RF11)',
          'Lembretes automáticos para clientes com pendências (RF10)',
          'Upload e download ilimitados com criptografia no banco',
          'Selo de empresa verificada Pro',
          'Sem fidelidade: cancele quando quiser',
        ],
        bloqueados: [],
        destaque: true,
      },
    ];
  }

  async obterPlanoEmpresa(empresaId) {
    const empresa = await prisma.empresa.findUnique({
      where: { id: Number(empresaId) },
    });
    if (!empresa) {
      const err = new Error('Empresa não encontrada.');
      err.statusCode = 404;
      throw err;
    }
    const { senhaHash: _, ...empresaSemSenha } = empresa;
    return empresaSemSenha;
  }

  async realizarUpgrade(empresaId, { metodoPagamento, detalhesCartao }) {
    const empresa = await prisma.empresa.findUnique({
      where: { id: Number(empresaId) },
    });

    if (!empresa) {
      const err = new Error('Empresa não encontrada.');
      err.statusCode = 404;
      throw err;
    }

    if (empresa.plano === 'PRO') {
      return {
        jaEraPro: true,
        empresa,
        mensagem: 'Sua empresa já possui o Plano Pro ativo.',
      };
    }

    // Validação simples dos dados de pagamento simulados
    if (metodoPagamento === 'CARTAO') {
      if (!detalhesCartao || !detalhesCartao.numeroCartao || detalhesCartao.numeroCartao.replace(/\D/g, '').length < 13) {
        const err = new Error('Número de cartão de crédito inválido.');
        err.statusCode = 400;
        throw err;
      }
    }

    // Ativar Plano PRO no banco de dados
    const empresaAtualizada = await prisma.empresa.update({
      where: { id: Number(empresaId) },
      data: {
        plano: 'PRO',
      },
    });

    const { senhaHash: _, ...empresaSemSenha } = empresaAtualizada;
    return {
      sucesso: true,
      empresa: empresaSemSenha,
      plano: 'PRO',
      metodoPagamento: metodoPagamento || 'PIX',
      valorPago: 'R$ 29,90',
    };
  }

  async cancelarPlanoPro(empresaId) {
    const empresa = await prisma.empresa.findUnique({
      where: { id: Number(empresaId) },
    });

    if (!empresa) {
      const err = new Error('Empresa não encontrada.');
      err.statusCode = 404;
      throw err;
    }

    const empresaAtualizada = await prisma.empresa.update({
      where: { id: Number(empresaId) },
      data: {
        plano: 'GRATIS',
      },
    });

    const { senhaHash: _, ...empresaSemSenha } = empresaAtualizada;
    return empresaSemSenha;
  }
}

module.exports = new PlanoService();

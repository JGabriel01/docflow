const { v4: uuidv4 } = require('uuid');
const prisma = require('../lib/prisma');
const cryptoService = require('./cryptoService');

class ProcessoService {
  async listarProcessos(empresaId, busca) {
    const where = {
      cliente: {
        empresaId: Number(empresaId),
      },
    };

    if (busca && busca.trim().length > 0) {
      const termo = busca.trim();
      const termoId = parseInt(termo, 10);

      const orConditions = [
        { nomeProcesso: { contains: termo } },
        { cliente: { nome: { contains: termo } } },
        { cliente: { cpf: { contains: termo } } },
      ];

      if (!isNaN(termoId)) {
        orConditions.push({ id: termoId });
      }

      where.AND = [{ OR: orConditions }];
    }

    return await prisma.processo.findMany({
      where,
      include: {
        cliente: true,
        documentos: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async obterProcessoPorId(empresaId, processoId) {
    // CB-12: Pertencer à empresa autenticada
    const processo = await prisma.processo.findFirst({
      where: {
        id: Number(processoId),
        cliente: {
          empresaId: Number(empresaId),
        },
      },
      include: {
        cliente: true,
        documentos: true,
        lembretes: {
          orderBy: { dataHoraEnvio: 'desc' },
        },
      },
    });

    return processo;
  }

  async criarProcesso(empresaId, { clienteId, nomeProcesso, documentos }) {
    // CB-12: Verificar se cliente pertence à empresa
    const cliente = await prisma.cliente.findFirst({
      where: {
        id: Number(clienteId),
        empresaId: Number(empresaId),
      },
    });

    if (!cliente) {
      const err = new Error('Cliente não encontrado.');
      err.statusCode = 404;
      throw err;
    }

    // RN-04 & CB-04: Cliente não pode ter dois processos em andamento
    const processoEmAndamento = await prisma.processo.findFirst({
      where: {
        clienteId: Number(clienteId),
        status: 'EM_ANDAMENTO',
      },
    });

    if (processoEmAndamento) {
      const err = new Error('Este cliente já possui um processo em andamento.');
      err.field = 'clienteId';
      err.statusCode = 400;
      throw err;
    }

    // RN-03 & RN-08: Gerar tokenAcesso UUID único
    const tokenAcesso = uuidv4();

    // Normalizar lista de documentos
    let docsArray = [];
    if (Array.isArray(documentos)) {
      docsArray = documentos.filter((d) => d && d.trim().length > 0);
    } else if (typeof documentos === 'string' && documentos.trim().length > 0) {
      docsArray = [documentos.trim()];
    }

    const docsParaCriar = docsArray.map((nome) => ({
      nomeDocumento: nome.trim(),
      status: 'PENDENTE',
    }));

    return await prisma.processo.create({
      data: {
        clienteId: Number(clienteId),
        nomeProcesso,
        tokenAcesso,
        status: 'EM_ANDAMENTO',
        documentos: {
          create: docsParaCriar,
        },
      },
      include: {
        cliente: true,
        documentos: true,
      },
    });
  }

  async editarProcesso(empresaId, processoId, { nomeProcesso, documentos }) {
    const processo = await this.obterProcessoPorId(empresaId, processoId);
    if (!processo) {
      const err = new Error('Processo não encontrado.');
      err.statusCode = 404;
      throw err;
    }

    const updateData = {
      nomeProcesso: nomeProcesso || processo.nomeProcesso,
    };

    // Se novos documentos foram enviados, podemos adicionar os novos
    if (documentos) {
      let docsArray = [];
      if (Array.isArray(documentos)) {
        docsArray = documentos.filter((d) => d && d.trim().length > 0);
      } else if (typeof documentos === 'string' && documentos.trim().length > 0) {
        docsArray = [documentos.trim()];
      }

      // Adicionar apenas os que não existem ainda
      const nomesExistentes = processo.documentos.map((d) => d.nomeDocumento.toLowerCase());
      const novosDocs = docsArray
        .filter((nome) => !nomesExistentes.includes(nome.trim().toLowerCase()))
        .map((nome) => ({
          nomeDocumento: nome.trim(),
          status: 'PENDENTE',
        }));

      if (novosDocs.length > 0) {
        updateData.documentos = {
          create: novosDocs,
        };
      }
    }

    return await prisma.processo.update({
      where: { id: Number(processoId) },
      data: updateData,
      include: {
        cliente: true,
        documentos: true,
      },
    });
  }

  async excluirProcesso(empresaId, processoId) {
    const processo = await this.obterProcessoPorId(empresaId, processoId);
    if (!processo) {
      const err = new Error('Processo não encontrado.');
      err.statusCode = 404;
      throw err;
    }

    // CB-13: Cascata automática
    return await prisma.processo.delete({
      where: { id: Number(processoId) },
    });
  }

  async enviarLink(empresaId, processoId, canalEnvio, baseUrl = process.env.BASE_URL || 'http://localhost:3000') {
    const processo = await this.obterProcessoPorId(empresaId, processoId);
    if (!processo) {
      const err = new Error('Processo não encontrado.');
      err.statusCode = 404;
      throw err;
    }

    const { cliente } = processo;
    const canal = (canalEnvio || '').toUpperCase();

    // CB-08: Contato vazio ou inválido
    if (canal === 'EMAIL') {
      if (!cliente.email || !cliente.email.includes('@')) {
        const err = new Error('Não foi possível enviar o link: verifique o contato cadastrado do cliente.');
        err.statusCode = 400;
        throw err;
      }
    } else if (canal === 'WHATSAPP') {
      if (!cliente.telefone || cliente.telefone.replace(/\D/g, '').length < 8) {
        const err = new Error('Não foi possível enviar o link: verifique o contato cadastrado do cliente.');
        err.statusCode = 400;
        throw err;
      }
    } else {
      // Se não especificado ou inválido
      if (!cliente.email && !cliente.telefone) {
        const err = new Error('Não foi possível enviar o link: verifique o contato cadastrado do cliente.');
        err.statusCode = 400;
        throw err;
      }
    }

    const link = `${baseUrl.replace(/\/+$/, '')}/upload/${processo.tokenAcesso}`;
    return {
      sucesso: true,
      canal,
      link,
      clienteNome: cliente.nome,
      destinatario: canal === 'EMAIL' ? cliente.email : cliente.telefone,
    };
  }

  async obterDocumentoParaDownload(empresaId, processoId, documentoId) {
    // CB-12: Verificar propriedade da empresa
    const processo = await this.obterProcessoPorId(empresaId, processoId);
    if (!processo) {
      const err = new Error('Processo não encontrado.');
      err.statusCode = 404;
      throw err;
    }

    const documento = processo.documentos.find((d) => d.id === Number(documentoId));
    if (!documento) {
      const err = new Error('Documento não encontrado neste processo.');
      err.statusCode = 404;
      throw err;
    }

    if (documento.status !== 'RECEBIDO' || !documento.arquivoConteudo) {
      const err = new Error('Documento ainda pendente ou sem arquivo disponível.');
      err.statusCode = 404;
      throw err;
    }

    // RN-10: Decifrar conteúdo via AES-256-GCM
    const decryptedBuffer = cryptoService.decryptBuffer(documento.arquivoConteudo);

    return {
      arquivoNome: documento.arquivoNome || 'documento',
      arquivoTipo: documento.arquivoTipo || 'application/octet-stream',
      conteudo: decryptedBuffer,
    };
  }
}

module.exports = new ProcessoService();

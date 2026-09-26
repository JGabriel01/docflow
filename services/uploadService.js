const prisma = require('../lib/prisma');
const cryptoService = require('./cryptoService');

class UploadService {
  async obterProcessoPorToken(token) {
    if (!token) return null;

    const processo = await prisma.processo.findUnique({
      where: { tokenAcesso: token },
      include: {
        cliente: true,
        documentos: {
          orderBy: { id: 'asc' },
        },
      },
    });

    // CB-07: Token inexistente ou processo já CONCLUIDO é inválido para upload
    if (!processo || processo.status === 'CONCLUIDO') {
      return null;
    }

    return processo;
  }

  async processarUpload(token, documentoId, file) {
    // CB-07: Validar processo
    const processo = await this.obterProcessoPorToken(token);
    if (!processo) {
      const err = new Error('Este link não é mais válido. Solicite um novo link à empresa.');
      err.statusCode = 404;
      err.isExpiredLink = true;
      throw err;
    }

    const docIdNum = Number(documentoId);
    const documento = processo.documentos.find((d) => d.id === docIdNum);
    if (!documento) {
      const err = new Error('Documento não encontrado neste processo.');
      err.statusCode = 404;
      throw err;
    }

    // Se já estiver RECEBIDO, idempotência: não altera nada
    if (documento.status === 'RECEBIDO') {
      return {
        concluido: false,
        jaRecebido: true,
        documento,
        processo,
        mensagem: 'Este documento já foi recebido anteriormente.',
      };
    }

    if (!file || !file.buffer) {
      const err = new Error('Nenhum arquivo enviado.');
      err.statusCode = 400;
      throw err;
    }

    // RN-09 & RN-10: Cifrar arquivo em memória (AES-256-GCM)
    const encryptedBuffer = cryptoService.encryptBuffer(file.buffer);

    // RN-05: Transação atômica para registrar upload e verificar conclusão automática
    const resultadoTransacao = await prisma.$transaction(async (tx) => {
      // 1. Atualizar o documento
      const docAtualizado = await tx.documentoChecklist.update({
        where: { id: docIdNum },
        data: {
          status: 'RECEBIDO',
          arquivoNome: file.originalname,
          arquivoTipo: file.mimetype,
          arquivoConteudo: encryptedBuffer,
          dataEnvio: new Date(),
        },
      });

      // 2. Verificar se ainda restam documentos PENDENTES para o processo
      const pendentesCount = await tx.documentoChecklist.count({
        where: {
          processoId: processo.id,
          status: 'PENDENTE',
        },
      });

      let processoFinalizado = false;
      let processoAtualizado = processo;

      // 3. Se não restam pendentes, concluir automaticamente o processo
      if (pendentesCount === 0) {
        processoFinalizado = true;
        processoAtualizado = await tx.processo.update({
          where: { id: processo.id },
          data: {
            status: 'CONCLUIDO',
            dataConclusao: new Date(),
          },
          include: {
            cliente: true,
            documentos: true,
          },
        });
      }

      return {
        concluido: processoFinalizado,
        documento: docAtualizado,
        processo: processoAtualizado,
      };
    });

    return resultadoTransacao;
  }
}

module.exports = new UploadService();

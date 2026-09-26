const upload = require('../middlewares/upload');
const uploadService = require('../services/uploadService');
const prisma = require('../lib/prisma');

class UploadController {
  async renderUpload(req, res, next) {
    try {
      const { token } = req.params;
      const processo = await uploadService.obterProcessoPorToken(token);

      // CB-07 & Cenário 4: Token inexistente ou processo CONCLUIDO -> 404 página dedicada
      if (!processo) {
        return res.status(404).render('upload/expirado', {
          title: 'Link Inválido ou Expirado',
          layout: false,
          mensagem: 'Este link não é mais válido. Solicite um novo link à empresa.',
        });
      }

      return res.status(200).render('upload/index', {
        title: `Envio de Documentos - ${processo.nomeProcesso}`,
        layout: false,
        processo,
        token,
        mensagemSucesso: req.flash('success')[0] || null,
        mensagemErro: req.flash('danger')[0] || null,
        erroFormato: null,
      });
    } catch (err) {
      return next(err);
    }
  }

  enviarDocumento(req, res, next) {
    const { token } = req.params;

    // Usar o middleware multer manualmente para capturar e tratar erros de upload inline
    upload.single('arquivo')(req, res, async (err) => {
      try {
        // 1. Verificar se o processo existe e está ativo antes de qualquer coisa
        const processo = await prisma.processo.findUnique({
          where: { tokenAcesso: token },
          include: {
            cliente: true,
            documentos: { orderBy: { id: 'asc' } },
          },
        });

        // CB-07: Se processo não existe ou já está concluído
        if (!processo || processo.status === 'CONCLUIDO') {
          return res.status(404).render('upload/expirado', {
            title: 'Link Inválido ou Expirado',
            layout: false,
            mensagem: 'Este link não é mais válido. Solicite um novo link à empresa.',
          });
        }

        // 2. Tratar erros do multer (formato inválido ou tamanho excedido)
        if (err) {
          let mensagemErro = 'Erro no envio do arquivo.';
          if (err.code === 'INVALID_FILE_FORMAT') {
            mensagemErro = 'Formato de arquivo não permitido. Envie PDF, JPG ou PNG.';
          } else if (err.code === 'LIMIT_FILE_SIZE') {
            mensagemErro = 'O tamanho do arquivo não pode exceder 5 MB.';
          }

          // Seção 4.6: 200 OK (re-render, invalid-feedback)
          return res.status(200).render('upload/index', {
            title: `Envio de Documentos - ${processo.nomeProcesso}`,
            layout: false,
            processo,
            token,
            documentoIdErro: req.body ? req.body.documentoId : null,
            erroFormato: mensagemErro,
            mensagemSucesso: null,
            mensagemErro: null,
          });
        }

        // 3. Validar se arquivo e documentoId foram fornecidos
        const { documentoId } = req.body;
        if (!req.file || !documentoId) {
          return res.status(200).render('upload/index', {
            title: `Envio de Documentos - ${processo.nomeProcesso}`,
            layout: false,
            processo,
            token,
            documentoIdErro: documentoId,
            erroFormato: 'Selecione um arquivo para enviar.',
            mensagemSucesso: null,
            mensagemErro: null,
          });
        }

        // 4. Processar o upload, cifrar e persistir atomicamente
        const resultado = await uploadService.processarUpload(token, documentoId, req.file);

        let mensagemSucesso = 'Documento recebido com sucesso.';
        if (resultado.concluido) {
          mensagemSucesso = 'Todos os documentos foram recebidos! Processo concluído.';
        } else if (resultado.jaRecebido) {
          mensagemSucesso = 'Este documento já foi recebido anteriormente.';
        }

        // Buscar processo atualizado para renderização
        const processoAtualizado = await prisma.processo.findUnique({
          where: { tokenAcesso: token },
          include: {
            cliente: true,
            documentos: { orderBy: { id: 'asc' } },
          },
        });

        return res.status(200).render('upload/index', {
          title: `Envio de Documentos - ${processoAtualizado.nomeProcesso}`,
          layout: false,
          processo: processoAtualizado,
          token,
          mensagemSucesso,
          mensagemErro: null,
          erroFormato: null,
        });
      } catch (uploadErr) {
        if (uploadErr.isExpiredLink || uploadErr.statusCode === 404) {
          return res.status(404).render('upload/expirado', {
            title: 'Link Inválido ou Expirado',
            layout: false,
            mensagem: 'Este link não é mais válido. Solicite um novo link à empresa.',
          });
        }
        return next(uploadErr);
      }
    });
  }
}

module.exports = new UploadController();

const { validationResult } = require('express-validator');
const processoService = require('../services/processoService');
const clienteService = require('../services/clienteService');

class ProcessoController {
  async listar(req, res, next) {
    try {
      const empresaId = req.session.empresa.id;
      const busca = req.query.busca || '';
      const processos = await processoService.listarProcessos(empresaId, busca);

      return res.render('processos/index', {
        title: 'Processos - DocFlow',
        processos,
        busca,
        empresa: req.session.empresa,
      });
    } catch (err) {
      return next(err);
    }
  }

  async renderNovo(req, res, next) {
    try {
      const empresaId = req.session.empresa.id;
      const clientes = await clienteService.listarClientes(empresaId);

      return res.render('processos/novo', {
        title: 'Novo Processo - DocFlow',
        clientes,
        dados: { clienteId: req.query.clienteId || '' },
        errors: {},
        empresa: req.session.empresa,
      });
    } catch (err) {
      return next(err);
    }
  }

  async cadastrar(req, res, next) {
    try {
      const empresaId = req.session.empresa.id;
      const errors = validationResult(req);

      if (!errors.isEmpty()) {
        const errorMap = {};
        errors.array().forEach((err) => {
          errorMap[err.path] = err.msg;
        });

        const clientes = await clienteService.listarClientes(empresaId);
        return res.status(200).render('processos/novo', {
          title: 'Novo Processo - DocFlow',
          clientes,
          dados: req.body,
          errors: errorMap,
          empresa: req.session.empresa,
        });
      }

      const { clienteId, nomeProcesso, documentos } = req.body;

      try {
        const processo = await processoService.criarProcesso(empresaId, {
          clienteId,
          nomeProcesso,
          documentos,
        });

        req.flash('success', 'Processo criado com sucesso.');
        return res.redirect(`/processos/${processo.id}`);
      } catch (serviceErr) {
        if (serviceErr.field) {
          const clientes = await clienteService.listarClientes(empresaId);
          return res.status(200).render('processos/novo', {
            title: 'Novo Processo - DocFlow',
            clientes,
            dados: req.body,
            errors: { [serviceErr.field]: serviceErr.message },
            empresa: req.session.empresa,
          });
        }
        throw serviceErr;
      }
    } catch (err) {
      return next(err);
    }
  }

  async detalhe(req, res, next) {
    try {
      const empresaId = req.session.empresa.id;
      const processoId = req.params.id;

      const processo = await processoService.obterProcessoPorId(empresaId, processoId);
      if (!processo) {
        const err = new Error('Processo não encontrado.');
        err.statusCode = 404;
        return next(err);
      }

      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const linkUpload = `${baseUrl}/upload/${processo.tokenAcesso}`;

      return res.render('processos/detalhe', {
        title: `Processo: ${processo.nomeProcesso} - DocFlow`,
        processo,
        linkUpload,
        empresa: req.session.empresa,
      });
    } catch (err) {
      return next(err);
    }
  }

  async renderEditar(req, res, next) {
    try {
      const empresaId = req.session.empresa.id;
      const processoId = req.params.id;

      const processo = await processoService.obterProcessoPorId(empresaId, processoId);
      if (!processo) {
        const err = new Error('Processo não encontrado.');
        err.statusCode = 404;
        return next(err);
      }

      return res.render('processos/editar', {
        title: `Editar Processo - DocFlow`,
        processo,
        dados: processo,
        errors: {},
        empresa: req.session.empresa,
      });
    } catch (err) {
      return next(err);
    }
  }

  async atualizar(req, res, next) {
    try {
      const empresaId = req.session.empresa.id;
      const processoId = req.params.id;

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        const errorMap = {};
        errors.array().forEach((err) => {
          errorMap[err.path] = err.msg;
        });

        const processo = await processoService.obterProcessoPorId(empresaId, processoId);
        return res.status(200).render('processos/editar', {
          title: `Editar Processo - DocFlow`,
          processo: processo || { id: processoId },
          dados: req.body,
          errors: errorMap,
          empresa: req.session.empresa,
        });
      }

      const { nomeProcesso, documentos } = req.body;
      await processoService.editarProcesso(empresaId, processoId, {
        nomeProcesso,
        documentos,
      });

      req.flash('success', 'Processo atualizado com sucesso.');
      return res.redirect(`/processos/${processoId}`);
    } catch (err) {
      return next(err);
    }
  }

  async excluir(req, res, next) {
    try {
      const empresaId = req.session.empresa.id;
      const processoId = req.params.id;

      await processoService.excluirProcesso(empresaId, processoId);

      req.flash('success', 'Processo excluído com sucesso.');
      return res.redirect('/processos');
    } catch (err) {
      return next(err);
    }
  }

  async enviarLink(req, res, next) {
    try {
      const empresaId = req.session.empresa.id;
      const processoId = req.params.id;
      const { canalEnvio } = req.body;

      const baseUrl = `${req.protocol}://${req.get('host')}`;

      try {
        await processoService.enviarLink(empresaId, processoId, canalEnvio, baseUrl);
        req.flash('success', 'Link enviado ao cliente com sucesso.');
        return res.redirect(`/processos/${processoId}`);
      } catch (serviceErr) {
        if (serviceErr.statusCode === 400) {
          req.flash('danger', serviceErr.message);
          return res.redirect(`/processos/${processoId}`);
        }
        throw serviceErr;
      }
    } catch (err) {
      return next(err);
    }
  }

  async downloadDocumento(req, res, next) {
    try {
      const empresaId = req.session.empresa.id;
      const { id: processoId, documentoId } = req.params;

      const docData = await processoService.obterDocumentoParaDownload(
        empresaId,
        processoId,
        documentoId
      );

      // Configurar cabeçalhos para forçar download
      res.setHeader('Content-Type', docData.arquivoTipo);
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(docData.arquivoNome)}"`);
      res.setHeader('Content-Length', docData.conteudo.length);

      return res.status(200).send(docData.conteudo);
    } catch (err) {
      return next(err);
    }
  }
}

module.exports = new ProcessoController();

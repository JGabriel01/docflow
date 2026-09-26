const { validationResult } = require('express-validator');
const clienteService = require('../services/clienteService');

class ClienteController {
  async listar(req, res, next) {
    try {
      const empresaId = req.session.empresa.id;
      const busca = req.query.busca || '';
      const clientes = await clienteService.listarClientes(empresaId, busca);

      return res.render('clientes/index', {
        title: 'Clientes - DocFlow',
        clientes,
        busca,
        empresa: req.session.empresa,
      });
    } catch (err) {
      return next(err);
    }
  }

  renderNovo(req, res) {
    return res.render('clientes/novo', {
      title: 'Novo Cliente - DocFlow',
      dados: {},
      errors: {},
      empresa: req.session.empresa,
    });
  }

  async cadastrar(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        const errorMap = {};
        errors.array().forEach((err) => {
          errorMap[err.path] = err.msg;
        });

        return res.status(200).render('clientes/novo', {
          title: 'Novo Cliente - DocFlow',
          dados: req.body,
          errors: errorMap,
          empresa: req.session.empresa,
        });
      }

      const empresaId = req.session.empresa.id;
      const { nome, cpf, email, telefone } = req.body;

      try {
        await clienteService.cadastrarCliente(empresaId, {
          nome,
          cpf,
          email,
          telefone,
        });

        req.flash('success', 'Cliente cadastrado com sucesso.');
        return res.redirect('/clientes');
      } catch (serviceErr) {
        if (serviceErr.field) {
          return res.status(200).render('clientes/novo', {
            title: 'Novo Cliente - DocFlow',
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

  async renderEditar(req, res, next) {
    try {
      const empresaId = req.session.empresa.id;
      const clienteId = req.params.id;

      const cliente = await clienteService.obterClientePorId(empresaId, clienteId);
      if (!cliente) {
        const err = new Error('Cliente não encontrado.');
        err.statusCode = 404;
        return next(err);
      }

      return res.render('clientes/editar', {
        title: 'Editar Cliente - DocFlow',
        cliente,
        dados: cliente,
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
      const clienteId = req.params.id;

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        const errorMap = {};
        errors.array().forEach((err) => {
          errorMap[err.path] = err.msg;
        });

        const cliente = await clienteService.obterClientePorId(empresaId, clienteId);
        return res.status(200).render('clientes/editar', {
          title: 'Editar Cliente - DocFlow',
          cliente: cliente || { id: clienteId },
          dados: req.body,
          errors: errorMap,
          empresa: req.session.empresa,
        });
      }

      const { nome, cpf, email, telefone } = req.body;

      try {
        await clienteService.atualizarCliente(empresaId, clienteId, {
          nome,
          cpf,
          email,
          telefone,
        });

        req.flash('success', 'Cliente atualizado com sucesso.');
        return res.redirect('/clientes');
      } catch (serviceErr) {
        if (serviceErr.field) {
          const cliente = await clienteService.obterClientePorId(empresaId, clienteId);
          return res.status(200).render('clientes/editar', {
            title: 'Editar Cliente - DocFlow',
            cliente: cliente || { id: clienteId },
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

  async excluir(req, res, next) {
    try {
      const empresaId = req.session.empresa.id;
      const clienteId = req.params.id;

      await clienteService.excluirCliente(empresaId, clienteId);

      req.flash('success', 'Cliente excluído com sucesso.');
      return res.redirect('/clientes');
    } catch (err) {
      return next(err);
    }
  }

  async historico(req, res, next) {
    try {
      const empresaId = req.session.empresa.id;
      const clienteId = req.params.id;

      // RN-06: Bloquear se não for Plano Pro
      if (req.session.empresa.plano !== 'PRO') {
        req.flash('warning', 'O histórico de documentos está disponível apenas no Plano Pro.');
        return res.redirect('/clientes');
      }

      const cliente = await clienteService.obterHistoricoCliente(empresaId, clienteId);
      if (!cliente) {
        const err = new Error('Cliente não encontrado.');
        err.statusCode = 404;
        return next(err);
      }

      return res.render('clientes/historico', {
        title: `Histórico de ${cliente.nome} - DocFlow`,
        cliente,
        empresa: req.session.empresa,
      });
    } catch (err) {
      if (err.isPlanRestriction) {
        req.flash('warning', err.message);
        return res.redirect('/clientes');
      }
      return next(err);
    }
  }

  async historicoGeral(req, res, next) {
    try {
      const empresaId = req.session.empresa.id;

      // RN-06: Bloquear se não for Plano Pro
      if (req.session.empresa.plano !== 'PRO') {
        req.flash('warning', 'O histórico de documentos está disponível apenas no Plano Pro.');
        return res.redirect('/clientes');
      }

      const primeiroCliente = await clienteService.obterPrimeiroCliente(empresaId);
      if (primeiroCliente) {
        return res.redirect(`/clientes/${primeiroCliente.id}/historico`);
      }

      req.flash('info', 'Cadastre ao menos um cliente para visualizar o histórico de documentos.');
      return res.redirect('/clientes');
    } catch (err) {
      return next(err);
    }
  }
}

module.exports = new ClienteController();

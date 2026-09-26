const { validationResult } = require('express-validator');
const empresaService = require('../services/empresaService');

class EmpresaController {
  renderCadastro(req, res) {
    if (req.session && req.session.empresa) {
      return res.redirect('/processos');
    }
    return res.render('empresas/cadastro', {
      title: 'Cadastrar Empresa - DocFlow',
      layout: false,
      dados: {},
      errors: {},
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

        return res.status(200).render('empresas/cadastro', {
          title: 'Cadastrar Empresa - DocFlow',
          layout: false,
          dados: req.body,
          errors: errorMap,
        });
      }

      const { razaoSocial, cnpj, email, senha } = req.body;

      try {
        await empresaService.cadastrarEmpresa({ razaoSocial, cnpj, email, senha });
        req.flash('success', 'Empresa cadastrada com sucesso.');
        return res.redirect('/login');
      } catch (serviceErr) {
        if (serviceErr.field) {
          return res.status(200).render('empresas/cadastro', {
            title: 'Cadastrar Empresa - DocFlow',
            layout: false,
            dados: req.body,
            errors: { [serviceErr.field]: serviceErr.message },
          });
        }
        throw serviceErr;
      }
    } catch (err) {
      return next(err);
    }
  }

  async renderPerfil(req, res, next) {
    try {
      const empresa = await empresaService.obterEmpresaPorId(req.session.empresa.id);
      if (!empresa) {
        req.flash('danger', 'Empresa não encontrada.');
        return res.redirect('/login');
      }

      return res.render('empresas/perfil', {
        title: 'Perfil da Empresa - DocFlow',
        empresa,
        dados: empresa,
        errors: {},
      });
    } catch (err) {
      return next(err);
    }
  }

  async atualizarPerfil(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        const errorMap = {};
        errors.array().forEach((err) => {
          errorMap[err.path] = err.msg;
        });

        const empresa = await empresaService.obterEmpresaPorId(req.session.empresa.id);
        return res.status(200).render('empresas/perfil', {
          title: 'Perfil da Empresa - DocFlow',
          empresa,
          dados: req.body,
          errors: errorMap,
        });
      }

      const { razaoSocial, cnpj, email, senha } = req.body;
      const empresaId = req.session.empresa.id;

      try {
        const empresaAtualizada = await empresaService.atualizarPerfil(empresaId, {
          razaoSocial,
          cnpj,
          email,
          senha,
        });

        req.session.empresa = empresaAtualizada;
        req.flash('success', 'Perfil atualizado com sucesso.');
        return res.redirect('/empresas/perfil');
      } catch (serviceErr) {
        if (serviceErr.field) {
          const empresa = await empresaService.obterEmpresaPorId(empresaId);
          return res.status(200).render('empresas/perfil', {
            title: 'Perfil da Empresa - DocFlow',
            empresa,
            dados: req.body,
            errors: { [serviceErr.field]: serviceErr.message },
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
      await empresaService.excluirEmpresa(empresaId);

      req.session.destroy((err) => {
        if (err) return next(err);
        return res.redirect('/login');
      });
    } catch (err) {
      return next(err);
    }
  }
}

module.exports = new EmpresaController();

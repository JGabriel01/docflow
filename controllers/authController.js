const empresaService = require('../services/empresaService');

class AuthController {
  renderLogin(req, res) {
    if (req.session && req.session.empresa) {
      return res.redirect('/processos');
    }
    return res.render('auth/login', {
      title: 'Entrar no DocFlow',
      layout: false,
      dados: {},
      errors: {},
    });
  }

  async login(req, res, next) {
    try {
      const { email, senha } = req.body;

      if (!email || !senha) {
        req.flash('danger', 'E-mail e senha são obrigatórios.');
        return res.status(200).render('auth/login', {
          title: 'Entrar no DocFlow',
          layout: false,
          dados: { email },
          errors: {
            email: !email ? 'E-mail é obrigatório' : null,
            senha: !senha ? 'Senha é obrigatória' : null,
          },
        });
      }

      const empresa = await empresaService.autenticarEmpresa(email, senha);

      if (!empresa) {
        // CB-09: E-mail ou senha inválidos
        req.flash('danger', 'E-mail ou senha inválidos.');
        return res.status(200).render('auth/login', {
          title: 'Entrar no DocFlow',
          layout: false,
          dados: { email },
          errors: {},
        });
      }

      // Sessão criada com sucesso
      req.session.empresa = empresa;
      return res.redirect('/processos');
    } catch (err) {
      return next(err);
    }
  }

  logout(req, res, next) {
    req.session.destroy((err) => {
      if (err) return next(err);
      res.clearCookie('connect.sid');
      return res.redirect('/login');
    });
  }
}

module.exports = new AuthController();

class HomeController {
  renderHome(req, res) {
    if (req.session && req.session.empresa) {
      return res.redirect('/processos');
    }
    return res.render('home', {
      title: 'DocFlow - Plataforma Inteligente e Segura de Coleta de Documentos',
    });
  }
}

module.exports = new HomeController();

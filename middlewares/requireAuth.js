function requireAuth(req, res, next) {
  if (req.session && req.session.empresa && req.session.empresa.id) {
    res.locals.empresa = req.session.empresa;
    return next();
  }

  req.flash('danger', 'Acesso restrito. Faça login para continuar.');
  return res.redirect('/login');
}

module.exports = requireAuth;

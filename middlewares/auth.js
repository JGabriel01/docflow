function requireAuth(req, res, next) {
  if (!req.session.empresaId) return res.redirect("/login");
  res.locals.empresa = req.session.empresa;
  next();
}

module.exports = { requireAuth };

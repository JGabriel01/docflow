function errorHandler(err, req, res, next) {
  // Se a resposta já começou a ser enviada ao cliente, delegar para o handler padrão do Express
  if (res.headersSent) {
    return next(err);
  }

  // Detectar falhas de conexão com o banco de dados (Prisma / MySQL offline)
  const isDbError =
    err.name === 'PrismaClientInitializationError' ||
    err.code === 'P1001' ||
    (err.message && (
      err.message.includes("Can't reach database server") ||
      err.message.includes('ECONNREFUSED') ||
      err.message.includes('P1001')
    ));

  if (isDbError) {
    console.error('[DocFlow DB Offline]:', err.message);
    return res.status(503).render('error', {
      title: 'Serviço Temporariamente Indisponível',
      statusCode: 503,
      mensagem: 'Não foi possível conectar ao banco de dados no momento. Verifique se o serviço MySQL está ativo ou tente novamente em instantes.',
    });
  }

  // Tratamento especial para rota de upload pública
  const statusCode = err.statusCode || (err.status ? Number(err.status) : 500);

  if (req.baseUrl.startsWith('/upload') || req.path.startsWith('/upload')) {
    if (statusCode === 404 || err.isExpiredLink) {
      return res.status(404).render('upload/expirado', {
        title: 'Link Inválido ou Expirado',
        mensagem: 'Este link não é mais válido. Solicite um novo link à empresa.',
      });
    }

    if (err.code === 'LIMIT_FILE_SIZE') {
      req.flash('danger', 'O arquivo é muito grande. O limite máximo é de 5 MB.');
      return res.redirect(req.originalUrl);
    }

    if (err.code === 'INVALID_FILE_FORMAT') {
      req.flash('danger', 'Formato de arquivo não permitido. Envie PDF, JPG ou PNG.');
      return res.redirect(req.originalUrl);
    }
  }

  if (statusCode === 404) {
    return res.status(404).render('404', {
      title: 'Página Não Encontrada',
      mensagem: err.message || 'O recurso solicitado não foi encontrado.',
    });
  }

  // Erro interno genérico
  console.error('[DocFlow Error]:', err.message);
  return res.status(statusCode).render('error', {
    title: err.title || 'Erro no Sistema',
    statusCode,
    mensagem: err.message && statusCode < 500 ? err.message : 'Ocorreu um erro inesperado ao processar sua solicitação.',
  });
}

module.exports = errorHandler;

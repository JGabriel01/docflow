const app = require('./app');

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log(`[DocFlow] Servidor rodando na porta ${PORT}`);
  console.log(`[DocFlow] Acesso local: http://localhost:${PORT}`);
});

process.on('SIGTERM', () => {
  console.log('[DocFlow] Recebido SIGTERM, encerrando servidor HTTP...');
  server.close(() => {
    console.log('[DocFlow] Servidor HTTP finalizado.');
  });
});

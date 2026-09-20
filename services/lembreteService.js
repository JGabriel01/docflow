const prisma = require("../lib/prisma");
const envioService = require("./envioService");
const notificacaoService = require("./notificacaoService");

async function enviarLembretesPendentes() {
  const processos = await prisma.processo.findMany({
    where: {
      status: "EM_ANDAMENTO",
      cliente: { empresa: { plano: "PRO", ativa: true } },
    },
    include: {
      cliente: { include: { empresa: true } },
      documentos: true,
      lembretes: { orderBy: { dataHoraEnvio: "desc" }, take: 1 },
    },
  });
  const limite = new Date(Date.now() - 24 * 60 * 60 * 1000);
  let enviados = 0;
  for (const processo of processos) {
    const ultimo = processo.lembretes[0];
    if (ultimo && ultimo.dataHoraEnvio > limite) continue;
    if (!processo.cliente.email && !processo.cliente.telefone) continue;
    const canal = processo.cliente.email ? "EMAIL" : "WHATSAPP";
    if (!notificacaoService.configurado(canal)) continue;
    try {
      const envio = await envioService.enviarLink(processo, canal);
      await notificacaoService.enviar({
        ...envio,
        assunto: "Lembrete do seu checklist DocFlow",
      });
      await prisma.lembreteEnviado.create({ data: { processoId: processo.id } });
      enviados += 1;
    } catch (error) {
      console.error(`Falha ao enviar lembrete do processo ${processo.id}:`, error);
    }
  }
  return enviados;
}

module.exports = { enviarLembretesPendentes };

jest.mock("../lib/prisma", () => ({
  processo: { findMany: jest.fn() },
  lembreteEnviado: { create: jest.fn() },
}));
jest.mock("../services/notificacaoService", () => ({
  configurado: jest.fn(),
  enviar: jest.fn(),
}));
jest.mock("../services/envioService", () => ({ enviarLink: jest.fn() }));

const prisma = require("../lib/prisma");
const notificacao = require("../services/notificacaoService");
const { enviarLembretesPendentes } = require("../services/lembreteService");

describe("lembretes Pro", () => {
  afterEach(() => jest.clearAllMocks());

  test("não cria lembrete para cliente sem contato e continua o lote", async () => {
    prisma.processo.findMany.mockResolvedValue([
      { id: 1, cliente: { email: null, telefone: null }, lembretes: [] },
      { id: 2, cliente: { email: "cliente@example.com", telefone: null }, lembretes: [] },
    ]);
    notificacao.configurado.mockReturnValue(true);
    notificacao.enviar.mockResolvedValue(undefined);
    prisma.lembreteEnviado.create.mockResolvedValue({});

    const enviados = await enviarLembretesPendentes();

    expect(enviados).toBe(1);
    expect(prisma.lembreteEnviado.create).toHaveBeenCalledTimes(1);
  });
});
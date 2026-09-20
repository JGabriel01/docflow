jest.mock("nodemailer", () => ({
  createTransport: jest.fn(() => ({
    sendMail: jest.fn().mockResolvedValue({}),
  })),
}));
jest.mock("twilio", () =>
  jest.fn(() => ({
    messages: { create: jest.fn().mockResolvedValue({ sid: "message-id" }) },
  })),
);

const nodemailer = require("nodemailer");
const twilio = require("twilio");
const service = require("../services/notificacaoService");

describe("notificacaoService", () => {
  afterEach(() => {
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    delete process.env.SMTP_FROM;
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_FROM;
    jest.clearAllMocks();
  });

  test("envia e-mail por SMTP configurado", async () => {
    Object.assign(process.env, {
      SMTP_HOST: "smtp.test",
      SMTP_USER: "user",
      SMTP_PASS: "pass",
      SMTP_FROM: "DocFlow <docflow@test>",
    });
    await service.enviar({
      canal: "EMAIL",
      contato: "cliente@test",
      link: "http://localhost:3000/upload/token",
    });
    expect(nodemailer.createTransport).toHaveBeenCalled();
  });

  test("recusa canal sem configuração", async () => {
    await expect(
      service.enviar({
        canal: "EMAIL",
        contato: "cliente@test",
        link: "http://localhost:3000/upload/token",
      }),
    ).rejects.toThrow("ENVIO_NAO_CONFIGURADO");
    expect(twilio).not.toHaveBeenCalled();
  });
});

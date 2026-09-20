const { enviarLink } = require("../services/envioService");

describe("envioService", () => {
  test("cria link para e-mail quando o contato existe", async () => {
    await expect(
      enviarLink(
        { tokenAcesso: "abc", cliente: { email: "cliente@example.com" } },
        "EMAIL",
      ),
    ).resolves.toEqual({
      canal: "EMAIL",
      contato: "cliente@example.com",
      link: "/upload/abc",
    });
  });

  test("recusa envio quando o contato está ausente", async () => {
    await expect(
      enviarLink({ tokenAcesso: "abc", cliente: {} }, "WHATSAPP"),
    ).rejects.toThrow("CONTATO_AUSENTE");
  });
});

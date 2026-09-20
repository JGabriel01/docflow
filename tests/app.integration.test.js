const request = require("supertest");
const bcrypt = require("bcrypt");
const app = require("../app");
const prisma = require("../lib/prisma");

const email = `integration-${Date.now()}@example.com`;
const cnpj = `99${String(Date.now()).slice(-8)}`;
let empresa;
let cliente;
let processo;

beforeAll(async () => {
  empresa = await prisma.empresa.create({
    data: {
      razaoSocial: "Empresa de Integração",
      cnpj,
      email,
      senhaHash: await bcrypt.hash("senha1234", 10),
    },
  });
  cliente = await prisma.cliente.create({
    data: {
      empresaId: empresa.id,
      nome: "Cliente de Integração",
      cpf: `8${String(Date.now()).slice(-9)}`,
      email: "cliente@example.com",
    },
  });
  processo = await prisma.processo.create({
    data: {
      clienteId: cliente.id,
      nomeProcesso: "Checklist de Integração",
      documentos: {
        create: [{ nomeDocumento: "RG" }, { nomeDocumento: "CPF" }],
      },
    },
    include: { documentos: true },
  });
});

jest.setTimeout(20000);

afterAll(async () => {
  if (empresa) await prisma.empresa.delete({ where: { id: empresa.id } });
  app.sessionStore.stopInterval();
  await prisma.$disconnect();
});

describe("fluxos HTTP do DocFlow", () => {
  test("redireciona acesso administrativo sem sessão", async () => {
    const response = await request(app).get("/processos");
    expect(response.status).toBe(302);
    expect(response.headers.location).toBe("/login");
  });

  test("faz login e abre o painel autenticado", async () => {
    const agent = request.agent(app);
    const login = await agent
      .post("/login")
      .type("form")
      .send({ email, senha: "senha1234" });
    expect(login.status).toBe(302);
    expect(login.headers.location).toBe("/processos");
    const painel = await agent.get("/processos");
    expect(painel.status).toBe(200);
    expect(painel.text).toContain("Checklist de Integração");
  });

  test("bloqueia segundo processo em andamento para o mesmo cliente", async () => {
    const agent = request.agent(app);
    await agent.post("/login").type("form").send({ email, senha: "senha1234" });
    const response = await agent.post("/processos/novo").type("form").send({
      clienteId: cliente.id,
      nomeProcesso: "Duplicado",
      documentos: "RG",
    });
    expect(response.status).toBe(200);
    expect(response.text).toContain(
      "Este cliente já possui um processo em andamento.",
    );
  });

  test("recebe documentos e conclui o processo automaticamente", async () => {
    const primeiro = await request(app)
      .post(`/upload/${processo.tokenAcesso}`)
      .field("documentoId", String(processo.documentos[0].id))
      .attach("arquivo", Buffer.from("%PDF-1.4"), "rg.pdf");
    expect(primeiro.status).toBe(200);
    expect(primeiro.text).toContain("Documento recebido com sucesso.");

    const segundo = await request(app)
      .post(`/upload/${processo.tokenAcesso}`)
      .field("documentoId", String(processo.documentos[1].id))
      .attach("arquivo", Buffer.from("%PDF-1.4"), "cpf.pdf");
    expect(segundo.status).toBe(200);
    expect(segundo.text).toContain(
      "Todos os documentos foram recebidos! Processo concluído.",
    );

    const atualizado = await prisma.processo.findUnique({
      where: { id: processo.id },
    });
    expect(atualizado.status).toBe("CONCLUIDO");
    expect(atualizado.dataConclusao).toBeTruthy();
  });

  test("não expõe dados ao acessar token inválido ou expirado", async () => {
    const response = await request(app).get("/upload/token-inexistente");
    expect(response.status).toBe(404);
    expect(response.text).not.toContain("Cliente de Integração");
  });
});

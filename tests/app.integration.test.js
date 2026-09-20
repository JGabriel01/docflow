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

  test("cadastra empresa, cliente e processo por HTTP", async () => {
    const sufixo = Date.now();
    const novoEmail = `feliz-${sufixo}@example.com`;
    const novoCnpj = `22${String(sufixo).slice(-8)}`;
    const cadastro = await request(app)
      .post("/empresas/cadastro")
      .type("form")
      .send({ razaoSocial: "Empresa Feliz", cnpj: novoCnpj, email: novoEmail, senha: "senha1234" });
    expect(cadastro.status).toBe(302);
    const agent = request.agent(app);
    await agent.post("/login").type("form").send({ email: novoEmail, senha: "senha1234" });
    const novoCliente = await agent.post("/clientes/novo").type("form").send({ nome: "Cliente Feliz", cpf: `7${String(sufixo).slice(-9)}` });
    expect(novoCliente.status).toBe(302);
    const novoClienteRow = await prisma.cliente.findFirst({ where: { cpf: `7${String(sufixo).slice(-9)}` } });
    const novoProcesso = await agent.post("/processos/novo").type("form").send({ clienteId: novoClienteRow.id, nomeProcesso: "Processo Feliz", documentos: "RG" });
    expect(novoProcesso.status).toBe(302);
    expect(novoProcesso.headers.location).toMatch(/^\/processos\/\d+$/);
    const empresaFeliz = await prisma.empresa.findUnique({ where: { email: novoEmail } });
    await prisma.empresa.delete({ where: { id: empresaFeliz.id } });
  });

  test("gera token UUID", async () => {
    expect(processo.tokenAcesso).toMatch(/^[0-9a-f-]{36}$/i);
  });

  test("restringe histórico ao Plano Pro para empresa grátis", async () => {
    const agent = request.agent(app);
    await agent.post("/login").type("form").send({ email, senha: "senha1234" });
    const response = await agent.get(`/clientes/${cliente.id}/historico`);
    expect(response.status).toBe(403);
  });

  test("não repete empresa ou cliente com identificador duplicado", async () => {
    const empresaDuplicada = await request(app)
      .post("/empresas/cadastro")
      .type("form")
      .send({ razaoSocial: "Duplicada", cnpj, email: `outro-${email}`, senha: "senha1234" });
    expect(empresaDuplicada.status).toBe(200);
    expect(empresaDuplicada.text).toContain("CNPJ já cadastrado.");

    const agent = request.agent(app);
    await agent.post("/login").type("form").send({ email, senha: "senha1234" });
    const clienteDuplicado = await agent
      .post("/clientes/novo")
      .type("form")
      .send({ nome: "Duplicado", cpf: cliente.cpf, email: "outro@example.com" });
    expect(clienteDuplicado.status).toBe(200);
    expect(clienteDuplicado.text).toContain("CPF já cadastrado nesta empresa.");
  });

  test("não armazena senha na sessão", async () => {
    await prisma.session.deleteMany({ where: { data: { contains: email } } });
    const agent = request.agent(app);
    await agent.post("/login").type("form").send({ email, senha: "senha1234" });
    const sessoes = await prisma.session.findMany({ where: { data: { contains: email } } });
    expect(sessoes.every((sessao) => !sessao.data.includes("senhaHash"))).toBe(true);
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

  test("retorna falha ao enviar link sem canal configurado", async () => {
    const agent = request.agent(app);
    await agent.post("/login").type("form").send({ email, senha: "senha1234" });
    const response = await agent.post(`/processos/${processo.id}/enviar-link`).type("form").send({ canalEnvio: "EMAIL" }).redirects(1);
    expect(response.status).toBe(200);
    expect(response.text).toContain("Não foi possível enviar o link: verifique o contato cadastrado do cliente.");
  });

  test("reaproveita somente documentos recebidos com o mesmo nome ao editar", async () => {
    const processoRegressao = await prisma.processo.create({ data: { clienteId: cliente.id, nomeProcesso: "Checklist regressão", documentos: { create: [{ nomeDocumento: "RG" }, { nomeDocumento: "CPF" }] } }, include: { documentos: true } });
    await prisma.documentoChecklist.updateMany({ where: { processoId: processoRegressao.id, nomeDocumento: "RG" }, data: { status: "RECEBIDO", arquivoPath: "storage/uploads/rg-original.pdf", dataEnvio: new Date() } });
    await prisma.documentoChecklist.updateMany({ where: { processoId: processoRegressao.id, nomeDocumento: "CPF" }, data: { status: "RECEBIDO", arquivoPath: "storage/uploads/cpf-original.pdf", dataEnvio: new Date() } });
    const agent = request.agent(app);
    await agent.post("/login").type("form").send({ email, senha: "senha1234" });
    const response = await agent.post(`/processos/${processoRegressao.id}/editar`).type("form").send({ nomeProcesso: "Checklist editada", documentos: "Comprovante\nRG\nCPF\nRenda" });
    expect(response.status).toBe(302);
    const documentos = await prisma.documentoChecklist.findMany({ where: { processoId: processoRegressao.id }, orderBy: { id: "asc" } });
    expect(documentos.find((doc) => doc.nomeDocumento === "Comprovante").status).toBe("PENDENTE");
    expect(documentos.find((doc) => doc.nomeDocumento === "RG").arquivoPath).toBe("storage/uploads/rg-original.pdf");
    expect(documentos.find((doc) => doc.nomeDocumento === "CPF").arquivoPath).toBe("storage/uploads/cpf-original.pdf");
    await prisma.processo.delete({ where: { id: processoRegressao.id } });
  });

  test("rejeita documentos vazios ou maiores que 100 caracteres", async () => {
    const agent = request.agent(app);
    await agent.post("/login").type("form").send({ email, senha: "senha1234" });

    const vazio = await agent.post("/processos/novo").type("form").send({
      clienteId: cliente.id,
      nomeProcesso: "Checklist inválido",
      documentos: "   \n  ",
    });
    expect(vazio.status).toBe(200);
    expect(vazio.text).toContain("Informe ao menos um documento.");

    const longo = await agent.post("/processos/novo").type("form").send({
      clienteId: cliente.id,
      nomeProcesso: "Checklist inválido",
      documentos: "x".repeat(101),
    });
    expect(longo.status).toBe(200);
    expect(longo.text).toContain("Cada documento deve ter até 100 caracteres.");
  });

  test("recebe documentos e conclui o processo automaticamente", async () => {
    const invalido = await request(app)
      .post(`/upload/${processo.tokenAcesso}`)
      .field("documentoId", String(processo.documentos[0].id))
      .attach("arquivo", Buffer.from("<html>não é PDF</html>"), "rg.pdf");
    expect(invalido.status).toBe(200);
    expect(invalido.text).toContain("Formato de arquivo não permitido");

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

    const expirado = await request(app).get(`/upload/${processo.tokenAcesso}`);
    expect(expirado.status).toBe(404);
  });

  test("protege histórico grátis e download sem sessão", async () => {
    const historico = await request(app).get(`/clientes/${cliente.id}/historico`);
    expect(historico.status).toBe(302);
    expect(historico.headers.location).toBe("/login");

    const download = await request(app).get(`/upload/documentos/${processo.documentos[0].id}/download`);
    expect(download.status).toBe(302);
    expect(download.headers.location).toBe("/login");
  });

  test("não expõe dados ao acessar token inválido ou expirado", async () => {
    const response = await request(app).get("/upload/token-inexistente");
    expect(response.status).toBe(404);
    expect(response.text).not.toContain("Cliente de Integração");
  });
});

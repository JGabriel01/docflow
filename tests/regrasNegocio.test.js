const request = require('supertest');
const app = require('../app');
const lembreteService = require('../services/lembreteService');
const {
  prisma,
  cleanDatabase,
  createTestEmpresa,
  createAuthenticatedAgent,
} = require('./testHelper');

describe('Regras de Negócio e Casos de Borda (RN-XX e CB-XX)', () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await cleanDatabase();
    await prisma.$disconnect();
  });

  /**
   * RN-01 / CB-01: CNPJ único para empresa
   */
  it('RN-01 / CB-01: deve impedir cadastro de duas empresas com o mesmo CNPJ', async () => {
    const cnpj = '12.345.678/0001-90';
    await createTestEmpresa({ cnpj, email: 'empresa1@teste.com' });

    const res = await request(app)
      .post('/empresas/cadastro')
      .send({
        razaoSocial: 'Segunda Empresa LTDA',
        cnpj,
        email: 'empresa2@teste.com',
        senha: 'senhaForte123',
      });

    expect(res.status).toBe(200);
    expect(res.text).toContain('Já existe uma empresa cadastrada com este CNPJ.');
  });

  /**
   * RN-02 / CB-02: CPF único por empresa
   */
  it('RN-02 / CB-02: deve impedir cadastro de dois clientes com mesmo CPF na mesma empresa', async () => {
    const empresa = await createTestEmpresa();
    const agent = await createAuthenticatedAgent(empresa);

    const cpf = '111.222.333-44';
    await agent.post('/clientes/novo').send({
      nome: 'Primeiro Cliente',
      cpf,
      email: 'cli1@teste.com',
    });

    const resDuplicado = await agent.post('/clientes/novo').send({
      nome: 'Segundo Cliente',
      cpf,
      email: 'cli2@teste.com',
    });

    expect(resDuplicado.status).toBe(200);
    expect(resDuplicado.text).toContain('Já existe um cliente cadastrado com este CPF.');

    const totalClientes = await prisma.cliente.count({
      where: { empresaId: empresa.id },
    });
    expect(totalClientes).toBe(1);
  });

  /**
   * RN-06 / CB-10: Restrição do Plano Pro
   */
  it('RN-06 / CB-10: empresas no Plano Grátis não podem acessar histórico nem gerar lembretes', async () => {
    // Empresa no Plano Grátis
    const empresaGratis = await createTestEmpresa({ plano: 'GRATIS' });
    const agentGratis = await createAuthenticatedAgent(empresaGratis);

    const cliente = await prisma.cliente.create({
      data: {
        empresaId: empresaGratis.id,
        nome: 'Cliente Grátis',
        cpf: '999.888.777-66',
        email: 'gratis@cliente.com',
      },
    });

    const processo = await prisma.processo.create({
      data: {
        clienteId: cliente.id,
        nomeProcesso: 'Processo Grátis',
        status: 'EM_ANDAMENTO',
        tokenAcesso: 'token-plano-gratis',
        documentos: {
          create: [{ nomeDocumento: 'Doc', status: 'PENDENTE' }],
        },
      },
    });

    // 1. Acesso ao histórico deve redirecionar com aviso
    const resHistorico = await agentGratis.get(`/clientes/${cliente.id}/historico`);
    expect(resHistorico.status).toBe(302);
    expect(resHistorico.headers.location).toBe('/clientes');

    // 2. Disparo de lembrete não deve criar LembreteEnviado
    await expect(lembreteService.enviarLembrete(processo.id)).rejects.toThrow(
      'Lembretes automáticos são exclusivos do Plano Pro.'
    );

    const totalLembretes = await prisma.lembreteEnviado.count({
      where: { processoId: processo.id },
    });
    expect(totalLembretes).toBe(0);

    // Agora testar empresa PRO: histórico liberado
    const empresaPro = await createTestEmpresa({ plano: 'PRO' });
    const agentPro = await createAuthenticatedAgent(empresaPro);
    const clientePro = await prisma.cliente.create({
      data: {
        empresaId: empresaPro.id,
        nome: 'Cliente Pro',
        cpf: '555.444.333-22',
        email: 'pro@cliente.com',
      },
    });

    const resHistoricoPro = await agentPro.get(`/clientes/${clientePro.id}/historico`);
    expect(resHistoricoPro.status).toBe(200);
    expect(resHistoricoPro.text).toContain('Histórico de Documentos');
  });

  /**
   * CB-06: Formato de arquivo inválido
   */
  it('CB-06: upload com extensão inválida (ex: .exe, .txt) deve ser rejeitado', async () => {
    const empresa = await createTestEmpresa();
    const cliente = await prisma.cliente.create({
      data: {
        empresaId: empresa.id,
        nome: 'Cliente Upload',
        cpf: '444.333.222-11',
      },
    });

    const processo = await prisma.processo.create({
      data: {
        clienteId: cliente.id,
        nomeProcesso: 'Processo Validação Arquivo',
        tokenAcesso: 'token-arquivo-invalido',
        documentos: {
          create: [{ nomeDocumento: 'Comprovante', status: 'PENDENTE' }],
        },
      },
      include: { documentos: true },
    });

    const docPendente = processo.documentos[0];
    const arquivoInvalido = Buffer.from('arquivo executavel falso');

    const res = await request(app)
      .post(`/upload/${processo.tokenAcesso}`)
      .field('documentoId', docPendente.id)
      .attach('arquivo', arquivoInvalido, 'executavel.exe');

    // Section 4.6: 200 OK (re-render, invalid-feedback)
    expect(res.status).toBe(200);
    expect(res.text).toContain('Formato de arquivo não permitido. Envie PDF, JPG ou PNG.');

    // Documento deve permanecer PENDENTE
    const docVerificado = await prisma.documentoChecklist.findUnique({
      where: { id: docPendente.id },
    });
    expect(docVerificado.status).toBe('PENDENTE');
    expect(docVerificado.arquivoConteudo).toBeNull();
  });

  /**
   * CB-08: Falha no envio do link
   */
  it('CB-08: deve impedir envio do link se o contato do cliente for vazio ou inválido', async () => {
    const empresa = await createTestEmpresa();
    const agent = await createAuthenticatedAgent(empresa);

    const clienteSemContato = await prisma.cliente.create({
      data: {
        empresaId: empresa.id,
        nome: 'Cliente Sem Contato',
        cpf: '777.888.999-00',
        email: null,
        telefone: null,
      },
    });

    const processo = await prisma.processo.create({
      data: {
        clienteId: clienteSemContato.id,
        nomeProcesso: 'Processo Teste Link',
        tokenAcesso: 'token-link-sem-contato',
      },
    });

    const resEmail = await agent
      .post(`/processos/${processo.id}/enviar-link`)
      .send({ canalEnvio: 'EMAIL' });

    expect(resEmail.status).toBe(302);
    expect(resEmail.headers.location).toBe(`/processos/${processo.id}`);

    // Seguir o redirect para conferir a mensagem de flash
    const resDetalhe = await agent.get(`/processos/${processo.id}`);
    expect(resDetalhe.text).toContain(
      'Não foi possível enviar o link: verifique o contato cadastrado do cliente.'
    );
  });

  /**
   * CB-12: Recurso de outra empresa deve retornar 404
   */
  it('CB-12: empresa A não pode acessar cliente, processo ou documento da empresa B', async () => {
    const empresaA = await createTestEmpresa({ email: 'empresaA@teste.com' });
    const empresaB = await createTestEmpresa({ email: 'empresaB@teste.com' });

    const agentA = await createAuthenticatedAgent(empresaA);

    const clienteB = await prisma.cliente.create({
      data: {
        empresaId: empresaB.id,
        nome: 'Cliente Empresa B',
        cpf: '123.123.123-12',
      },
    });

    const processoB = await prisma.processo.create({
      data: {
        clienteId: clienteB.id,
        nomeProcesso: 'Processo B',
        tokenAcesso: 'token-empresa-b',
        documentos: {
          create: [{ nomeDocumento: 'Doc B', status: 'PENDENTE' }],
        },
      },
    });

    // Empresa A tentando acessar cliente B
    const resCliente = await agentA.get(`/clientes/${clienteB.id}/editar`);
    expect(resCliente.status).toBe(404);

    // Empresa A tentando acessar processo B
    const resProcesso = await agentA.get(`/processos/${processoB.id}`);
    expect(resProcesso.status).toBe(404);
  });

  /**
   * CB-13: Exclusão em Cascata
   */
  it('CB-13: excluir cliente deve remover processos e documentos associados em cascata', async () => {
    const empresa = await createTestEmpresa();
    const agent = await createAuthenticatedAgent(empresa);

    const cliente = await prisma.cliente.create({
      data: {
        empresaId: empresa.id,
        nome: 'Cliente Para Deletar',
        cpf: '000.111.222-33',
      },
    });

    const processo = await prisma.processo.create({
      data: {
        clienteId: cliente.id,
        nomeProcesso: 'Processo Cascata',
        tokenAcesso: 'token-cascata-teste',
        documentos: {
          create: [{ nomeDocumento: 'Doc 1', status: 'PENDENTE' }],
        },
      },
    });

    // Excluir cliente via rota autenticada
    const res = await agent.post(`/clientes/${cliente.id}/excluir`);
    expect(res.status).toBe(302);

    // Processos e documentos devem ter sido excluídos
    const processoApos = await prisma.processo.findUnique({
      where: { id: processo.id },
    });
    expect(processoApos).toBeNull();

    const docsApos = await prisma.documentoChecklist.findMany({
      where: { processoId: processo.id },
    });
    expect(docsApos.length).toBe(0);
  });
});

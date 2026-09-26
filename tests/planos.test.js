const request = require('supertest');
const app = require('../app');
const {
  prisma,
  cleanDatabase,
  createTestEmpresa,
  createAuthenticatedAgent,
} = require('./testHelper');

describe('Planos e Checkout de Pagamento (R$ 29,90/mês)', () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await cleanDatabase();
    await prisma.$disconnect();
  });

  it('deve exibir a tabela de planos comparando Grátis e Pro (R$ 29,90)', async () => {
    const empresa = await createTestEmpresa({ plano: 'GRATIS' });
    const agent = await createAuthenticatedAgent(empresa);

    const res = await agent.get('/planos');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Plano Grátis');
    expect(res.text).toContain('Plano Pro');
    expect(res.text).toContain('R$ 29,90');
    expect(res.text).toContain('Seu Plano Atual');
  });

  it('deve carregar a tela de checkout com Pix e Cartão de Crédito', async () => {
    const empresa = await createTestEmpresa({ plano: 'GRATIS' });
    const agent = await createAuthenticatedAgent(empresa);

    const res = await agent.get('/planos/checkout');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Finalizar Assinatura do Plano Pro');
    expect(res.text).toContain('Pix (Instantâneo)');
    expect(res.text).toContain('Cartão de Crédito');
    expect(res.text).toContain('R$ 29,90');
  });

  it('deve processar o pagamento via Pix e atualizar a empresa para o Plano PRO no banco de dados', async () => {
    const empresa = await createTestEmpresa({ plano: 'GRATIS' });
    const agent = await createAuthenticatedAgent(empresa);

    // Enviar confirmação de pagamento Pix
    const res = await agent
      .post('/planos/checkout')
      .send({ metodoPagamento: 'PIX' });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/processos');

    // Conferir no banco de dados se a empresa virou PRO
    const empresaAtualizada = await prisma.empresa.findUnique({
      where: { id: empresa.id },
    });
    expect(empresaAtualizada.plano).toBe('PRO');

    // Criar cliente e verificar que o Histórico agora é liberado (sem redirecionar)
    const cliente = await prisma.cliente.create({
      data: {
        empresaId: empresa.id,
        nome: 'Cliente Pro Verificado',
        cpf: '888.777.666-55',
      },
    });

    const resHistorico = await agent.get(`/clientes/${cliente.id}/historico`);
    expect(resHistorico.status).toBe(200);
    expect(resHistorico.text).toContain('Histórico de Documentos');
  });

  it('deve processar o pagamento via Cartão de Crédito e ativar o Plano Pro', async () => {
    const empresa = await createTestEmpresa({ plano: 'GRATIS' });
    const agent = await createAuthenticatedAgent(empresa);

    const res = await agent.post('/planos/checkout').send({
      metodoPagamento: 'CARTAO',
      numeroCartao: '4532 1122 3344 5566',
      nomeCartao: 'EMPRESA TESTE',
      validade: '12/28',
      cvv: '123',
    });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/processos');

    const empresaAtualizada = await prisma.empresa.findUnique({
      where: { id: empresa.id },
    });
    expect(empresaAtualizada.plano).toBe('PRO');
  });

  it('deve permitir cancelar a assinatura Pro e retornar ao Plano Grátis', async () => {
    const empresa = await createTestEmpresa({ plano: 'PRO' });
    const agent = await createAuthenticatedAgent(empresa);

    const res = await agent.post('/planos/cancelar');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/planos');

    const empresaAtualizada = await prisma.empresa.findUnique({
      where: { id: empresa.id },
    });
    expect(empresaAtualizada.plano).toBe('GRATIS');
  });
});

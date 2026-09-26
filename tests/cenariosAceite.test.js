const request = require('supertest');
const fs = require('fs');
const path = require('path');
const app = require('../app');
const {
  prisma,
  cleanDatabase,
  createTestEmpresa,
  createAuthenticatedAgent,
} = require('./testHelper');

describe('Cenários de Aceite (Seção 6 da SPECIFICATION.md)', () => {
  let empresa;
  let agent;
  let cliente;

  beforeEach(async () => {
    await cleanDatabase();
    empresa = await createTestEmpresa();
    agent = await createAuthenticatedAgent(empresa);

    cliente = await prisma.cliente.create({
      data: {
        empresaId: empresa.id,
        nome: 'Maria Souza',
        cpf: '123.456.789-09',
        email: 'maria@email.com',
        telefone: '(82) 99999-0000',
      },
    });
  });

  afterAll(async () => {
    await cleanDatabase();
    await prisma.$disconnect();
  });

  /**
   * Cenário 1: Sucesso na Criação de Processo
   */
  it('Cenário 1: deve criar processo com status EM_ANDAMENTO, token único e redirecionar para /processos/:id', async () => {
    // Quando enviar POST /processos/novo
    const response = await agent
      .post('/processos/novo')
      .send({
        clienteId: cliente.id,
        nomeProcesso: 'Admissão',
        documentos: ['RG', 'CPF'],
      });

    // Então a resposta deve redirecionar com código 302
    expect(response.status).toBe(302);
    expect(response.headers.location).toMatch(/\/processos\/\d+/);

    // E o processo deve ser criado com status EM_ANDAMENTO e tokenAcesso único
    const processoCriado = await prisma.processo.findFirst({
      where: { clienteId: cliente.id },
      include: { documentos: true },
    });

    expect(processoCriado).not.toBeNull();
    expect(processoCriado.nomeProcesso).toBe('Admissão');
    expect(processoCriado.status).toBe('EM_ANDAMENTO');
    expect(processoCriado.tokenAcesso).toBeDefined();
    expect(processoCriado.tokenAcesso.length).toBeGreaterThan(10);
    expect(processoCriado.documentos.length).toBe(2);
    expect(processoCriado.documentos.map((d) => d.nomeDocumento)).toEqual(
      expect.arrayContaining(['RG', 'CPF'])
    );
    expect(processoCriado.documentos.every((d) => d.status === 'PENDENTE')).toBe(true);
  });

  /**
   * Cenário 2: Falha por Cliente com Processo em Aberto
   */
  it('Cenário 2: deve impedir criação de novo processo se o cliente já possui processo EM_ANDAMENTO', async () => {
    // Dado que o cliente já possui um processo com status="EM_ANDAMENTO"
    await prisma.processo.create({
      data: {
        clienteId: cliente.id,
        nomeProcesso: 'Processo Inicial',
        status: 'EM_ANDAMENTO',
        tokenAcesso: 'token-existente-123',
      },
    });

    // Quando a empresa tentar criar um novo processo para o mesmo cliente
    const response = await agent
      .post('/processos/novo')
      .send({
        clienteId: cliente.id,
        nomeProcesso: 'Segundo Processo',
        documentos: ['RG'],
      });

    // Então o formulário deve ser re-renderizado com status 200 e erro
    expect(response.status).toBe(200);
    expect(response.text).toContain('Este cliente já possui um processo em andamento.');

    // E nenhum novo registro de Processo deve ser criado
    const totalProcessos = await prisma.processo.count({
      where: { clienteId: cliente.id },
    });
    expect(totalProcessos).toBe(1);
  });

  /**
   * Cenário 3: Conclusão Automática do Processo
   */
  it('Cenário 3: deve concluir o processo automaticamente na mesma transação ao receber o último documento pendente', async () => {
    // Dado um processo com 3 documentos na checklist, sendo 2 já RECEBIDO e 1 PENDENTE
    const processo = await prisma.processo.create({
      data: {
        clienteId: cliente.id,
        nomeProcesso: 'Contrato de Locação',
        status: 'EM_ANDAMENTO',
        tokenAcesso: 'token-cenario-3-unique',
        documentos: {
          create: [
            {
              nomeDocumento: 'RG',
              status: 'RECEBIDO',
              arquivoNome: 'rg.pdf',
              arquivoTipo: 'application/pdf',
              arquivoConteudo: Buffer.from('conteudo-cifrado-1'),
              dataEnvio: new Date(),
            },
            {
              nomeDocumento: 'Comprovante de Residência',
              status: 'RECEBIDO',
              arquivoNome: 'residencia.pdf',
              arquivoTipo: 'application/pdf',
              arquivoConteudo: Buffer.from('conteudo-cifrado-2'),
              dataEnvio: new Date(),
            },
            {
              nomeDocumento: 'Comprovante de Renda',
              status: 'PENDENTE',
            },
          ],
        },
      },
      include: { documentos: true },
    });

    const docPendente = processo.documentos.find((d) => d.status === 'PENDENTE');
    expect(docPendente).toBeDefined();

    const pdfBuffer = Buffer.from('%PDF-1.4 Mocked PDF File Content for Testing');

    // Quando o cliente enviar o arquivo do último documento PENDENTE via POST /upload/:token
    const response = await request(app)
      .post(`/upload/${processo.tokenAcesso}`)
      .field('documentoId', docPendente.id)
      .attach('arquivo', pdfBuffer, 'renda.pdf');

    expect(response.status).toBe(200);
    expect(response.text).toContain('Todos os documentos foram recebidos! Processo concluído.');

    // Então o documento deve mudar para status="RECEBIDO"
    const docAtualizado = await prisma.documentoChecklist.findUnique({
      where: { id: docPendente.id },
    });
    expect(docAtualizado.status).toBe('RECEBIDO');
    expect(docAtualizado.arquivoNome).toBe('renda.pdf');

    // E o Processo.status deve mudar automaticamente para CONCLUIDO
    // E dataConclusao deve ser preenchida com o instante da requisição
    const processoAtualizado = await prisma.processo.findUnique({
      where: { id: processo.id },
    });
    expect(processoAtualizado.status).toBe('CONCLUIDO');
    expect(processoAtualizado.dataConclusao).not.toBeNull();
    expect(new Date(processoAtualizado.dataConclusao).getTime()).toBeLessThanOrEqual(Date.now());
  });

  /**
   * Cenário 4: Link Expirado ou Inválido
   */
  it('Cenário 4: deve retornar 404 sem vazar dados se token for inexistente ou de processo já concluído', async () => {
    // 1. Token inexistente
    const resInexistente = await request(app).get('/upload/token-inexistente-xyz');
    expect(resInexistente.status).toBe(404);
    expect(resInexistente.text).toContain('Este link não é mais válido. Solicite um novo link à empresa.');

    // 2. Processo CONCLUIDO
    const processoConcluido = await prisma.processo.create({
      data: {
        clienteId: cliente.id,
        nomeProcesso: 'Processo Já Finalizado',
        status: 'CONCLUIDO',
        dataConclusao: new Date(),
        tokenAcesso: 'token-concluido-999',
      },
    });

    const resConcluido = await request(app).get(`/upload/${processoConcluido.tokenAcesso}`);
    expect(resConcluido.status).toBe(404);
    expect(resConcluido.text).toContain('Este link não é mais válido. Solicite um novo link à empresa.');
    // E nenhum dado do processo ou do cliente pode ser exposto na resposta
    expect(resConcluido.text).not.toContain(processoConcluido.nomeProcesso);
    expect(resConcluido.text).not.toContain(cliente.nome);
    expect(resConcluido.text).not.toContain(cliente.cpf);
  });

  /**
   * Cenário 5: Arquivo Armazenado no Banco, Cifrado
   */
  it('Cenário 5: deve salvar conteúdo cifrado no banco, sem criar arquivo em disco, e devolver original decifrado no download', async () => {
    // Dado um processo EM_ANDAMENTO com um documento PENDENTE
    const processo = await prisma.processo.create({
      data: {
        clienteId: cliente.id,
        nomeProcesso: 'Processo Documento Cifrado',
        status: 'EM_ANDAMENTO',
        tokenAcesso: 'token-cenario-5-unique',
        documentos: {
          create: [{ nomeDocumento: 'Identidade', status: 'PENDENTE' }],
        },
      },
      include: { documentos: true },
    });

    const docPendente = processo.documentos[0];
    const conteudoOriginalTexto = '%PDF-1.4 Este é um arquivo de RG ultra-secreto.';
    const conteudoOriginalBuffer = Buffer.from(conteudoOriginalTexto, 'utf-8');

    // Registrar arquivos existentes antes do upload para verificar que nada novo foi salvo no disco
    const snapshotArquivosAntes = fs.readdirSync(process.cwd());

    // Quando o cliente enviar um PDF válido via POST /upload/:token
    const resUpload = await request(app)
      .post(`/upload/${processo.tokenAcesso}`)
      .field('documentoId', docPendente.id)
      .attach('arquivo', conteudoOriginalBuffer, 'documento_identidade.pdf');

    expect(resUpload.status).toBe(200);

    // Então DocumentoChecklist.arquivoConteudo deve estar preenchido com bytes DIFERENTES dos originais
    const docNoBanco = await prisma.documentoChecklist.findUnique({
      where: { id: docPendente.id },
    });

    expect(docNoBanco).not.toBeNull();
    expect(docNoBanco.arquivoNome).toBe('documento_identidade.pdf');
    expect(docNoBanco.arquivoTipo).toBe('application/pdf');
    expect(docNoBanco.arquivoConteudo).not.toBeNull();
    // Os bytes devem ser DIFERENTES do original (cifrados)
    expect(Buffer.compare(docNoBanco.arquivoConteudo, conteudoOriginalBuffer)).not.toBe(0);

    // E nenhum arquivo deve ser criado no sistema de arquivos do servidor
    const snapshotArquivosDepois = fs.readdirSync(process.cwd());
    expect(snapshotArquivosDepois).toEqual(snapshotArquivosAntes);

    // E GET /processos/:id/documentos/:documentoId/download deve devolver exatamente o conteúdo original decifrado
    const resDownload = await agent
      .get(`/processos/${processo.id}/documentos/${docPendente.id}/download`)
      .expect(200);

    expect(resDownload.headers['content-type']).toContain('application/pdf');
    expect(resDownload.headers['content-disposition']).toContain('attachment');
    expect(resDownload.headers['content-disposition']).toContain('documento_identidade.pdf');
    // Conteúdo binário idêntico ao original
    expect(resDownload.body).toEqual(conteudoOriginalBuffer);
  });
});

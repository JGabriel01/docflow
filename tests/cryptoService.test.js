const cryptoService = require('../services/cryptoService');

describe('Serviço de Criptografia (AES-256-GCM)', () => {
  it('deve cifrar e decifrar um buffer com fidelidade total aos dados originais', () => {
    const textoOriginal = 'Documento confidencial: RG 12.345.678-9 SSP/SP';
    const bufferOriginal = Buffer.from(textoOriginal, 'utf-8');

    const bufferCifrado = cryptoService.encryptBuffer(bufferOriginal);

    // O buffer cifrado deve ser diferente do original
    expect(bufferCifrado).not.toEqual(bufferOriginal);
    // Deve conter no mínimo 12 (IV) + 16 (AuthTag) + tamanho dos dados
    expect(bufferCifrado.length).toBeGreaterThanOrEqual(28 + bufferOriginal.length);

    const bufferDecifrado = cryptoService.decryptBuffer(bufferCifrado);
    expect(bufferDecifrado.toString('utf-8')).toBe(textoOriginal);
  });

  it('deve falhar de forma tratada caso o dado cifrado seja corrompido (falha na authTag)', () => {
    const bufferOriginal = Buffer.from('Conteúdo sensível de teste');
    const bufferCifrado = cryptoService.encryptBuffer(bufferOriginal);

    // Corromper um byte do texto cifrado
    bufferCifrado[bufferCifrado.length - 1] ^= 0xff;

    expect(() => {
      cryptoService.decryptBuffer(bufferCifrado);
    }).toThrow('Falha ao decifrar o arquivo: integridade comprometida.');
  });

  it('deve falhar caso o buffer tenha menos de 28 bytes (formato inválido)', () => {
    const bufferInvalido = Buffer.from('pequeno');
    expect(() => {
      cryptoService.decryptBuffer(bufferInvalido);
    }).toThrow('Conteúdo cifrado inválido ou corrompido.');
  });
});

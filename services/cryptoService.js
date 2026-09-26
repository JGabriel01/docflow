const crypto = require('crypto');

function getEncryptionKey() {
  const keyStr = process.env.ENCRYPTION_KEY;
  if (!keyStr) {
    throw new Error('ENCRYPTION_KEY is required in environment variables.');
  }

  let keyBuffer;
  if (/^[0-9a-fA-F]{64}$/.test(keyStr)) {
    keyBuffer = Buffer.from(keyStr, 'hex');
  } else if (Buffer.byteLength(keyStr, 'utf8') === 32) {
    keyBuffer = Buffer.from(keyStr, 'utf8');
  } else {
    throw new Error('ENCRYPTION_KEY must be a 32-byte hex string (64 characters) or 32-byte raw string.');
  }

  if (keyBuffer.length !== 32) {
    throw new Error('ENCRYPTION_KEY must be exactly 32 bytes.');
  }

  return keyBuffer;
}

function validateEncryptionKey() {
  getEncryptionKey();
}

/**
 * Ciphers a Buffer using AES-256-GCM
 * Format: IV (12 bytes) + AuthTag (16 bytes) + CipherText
 */
function encryptBuffer(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    buffer = Buffer.from(buffer);
  }
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, encrypted]);
}

/**
 * Deciphers a Buffer that was encrypted with encryptBuffer
 */
function decryptBuffer(encryptedBuffer) {
  if (!Buffer.isBuffer(encryptedBuffer)) {
    encryptedBuffer = Buffer.from(encryptedBuffer);
  }

  if (encryptedBuffer.length < 28) {
    throw new Error('Conteúdo cifrado inválido ou corrompido.');
  }

  const key = getEncryptionKey();
  const iv = encryptedBuffer.subarray(0, 12);
  const authTag = encryptedBuffer.subarray(12, 28);
  const cipherText = encryptedBuffer.subarray(28);

  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(cipherText), decipher.final()]);
  } catch (err) {
    const error = new Error('Falha ao decifrar o arquivo: integridade comprometida.');
    error.statusCode = 400;
    throw error;
  }
}

module.exports = {
  validateEncryptionKey,
  encryptBuffer,
  decryptBuffer,
};

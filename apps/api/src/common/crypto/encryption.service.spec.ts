import { EncryptionService } from './encryption.service';

describe('EncryptionService', () => {
  let service: EncryptionService;

  beforeEach(() => {
    const config = { get: jest.fn().mockReturnValue('a-test-encryption-key-for-specs') };
    service = new EncryptionService(config as any);
  });

  it('round-trips plaintext through encrypt/decrypt', () => {
    const plaintext = 'JBSWY3DPEHPK3PXP'; // looks like a TOTP secret
    const encrypted = service.encrypt(plaintext);

    expect(encrypted).not.toBe(plaintext);
    expect(service.decrypt(encrypted)).toBe(plaintext);
  });

  it('produces different ciphertext for the same plaintext on each call (random IV)', () => {
    const a = service.encrypt('same-value');
    const b = service.encrypt('same-value');

    expect(a).not.toBe(b);
    expect(service.decrypt(a)).toBe('same-value');
    expect(service.decrypt(b)).toBe('same-value');
  });

  it('rejects tampered ciphertext instead of silently returning garbage', () => {
    const encrypted = service.encrypt('secret-value');
    const [iv, tag, data] = encrypted.split('.');
    // Flip a byte in the ciphertext payload
    const tamperedData = Buffer.from(data, 'base64');
    tamperedData[0] ^= 0xff;
    const tampered = [iv, tag, tamperedData.toString('base64')].join('.');

    expect(() => service.decrypt(tampered)).toThrow();
  });

  it('rejects malformed ciphertext missing a segment', () => {
    expect(() => service.decrypt('not-a-valid-payload')).toThrow('Malformed ciphertext');
  });

  it('derives a key from whatever length secret is configured (no exact-32-char requirement)', () => {
    const config = { get: jest.fn().mockReturnValue('short') };
    const shortKeyService = new EncryptionService(config as any);

    const encrypted = shortKeyService.encrypt('value');
    expect(shortKeyService.decrypt(encrypted)).toBe('value');
  });
});

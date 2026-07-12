import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // recommended IV size for GCM

/**
 * Application-level encryption for values that must be recoverable later
 * (webhook signing secrets, MFA TOTP secrets) — per SECURITY.md 5.3
 * ("MFA secrets encrypted with application-level encryption key
 * (AES-256-GCM)"). Not for passwords, which stay one-way hashed via bcrypt.
 */
@Injectable()
export class EncryptionService {
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    const secret = config.get<string>(
      'ENCRYPTION_KEY',
      'dev-only-insecure-default-change-me',
    );
    // Hash the configured secret down to exactly 32 bytes regardless of its
    // raw length, so operators don't need to hand-craft an exact-length key.
    this.key = createHash('sha256').update(secret).digest();
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return [iv, authTag, encrypted].map((buf) => buf.toString('base64')).join('.');
  }

  decrypt(ciphertext: string): string {
    const [ivB64, tagB64, dataB64] = ciphertext.split('.');
    if (!ivB64 || !tagB64 || !dataB64) {
      throw new Error('Malformed ciphertext');
    }
    const iv = Buffer.from(ivB64, 'base64');
    const authTag = Buffer.from(tagB64, 'base64');
    const data = Buffer.from(dataB64, 'base64');
    const decipher = createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  }
}

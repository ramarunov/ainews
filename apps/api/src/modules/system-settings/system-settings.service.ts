import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { EncryptionService } from '../../common/crypto/encryption.service';
import { UpdateAiProviderKeysDto } from './dto/system-settings.dto';
import { AI_PROVIDER_SETTING_KEYS, AiProviderKeyField } from './system-settings.constants';

@Injectable()
export class SystemSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
  ) {}

  /** Which AI providers have a platform-wide key configured — never the key itself. */
  async getAiProviderStatus() {
    const rows = await this.prisma.systemSetting.findMany({
      where: { key: { in: Object.values(AI_PROVIDER_SETTING_KEYS) } },
      select: { key: true },
    });
    const configured = new Set(rows.map((r) => r.key));

    return {
      openai: configured.has(AI_PROVIDER_SETTING_KEYS.openaiApiKey),
      anthropic: configured.has(AI_PROVIDER_SETTING_KEYS.anthropicApiKey),
      google: configured.has(AI_PROVIDER_SETTING_KEYS.googleAiApiKey),
    };
  }

  async updateAiProviderKeys(dto: UpdateAiProviderKeysDto, updatedBy: string) {
    const entries = (Object.entries(dto) as [AiProviderKeyField, string | undefined][]).filter(
      ([, value]) => value !== undefined,
    );

    await Promise.all(
      entries.map(([field, value]) => {
        const key = AI_PROVIDER_SETTING_KEYS[field];
        const encrypted = this.encryption.encrypt(value as string);
        return this.prisma.systemSetting.upsert({
          where: { key },
          create: { key, value: encrypted, updatedBy },
          update: { value: encrypted, updatedBy },
        });
      }),
    );

    return this.getAiProviderStatus();
  }

  /** Decrypted value for a given SystemSetting key, or null if never configured. */
  async getDecryptedValue(key: string): Promise<string | null> {
    const row = await this.prisma.systemSetting.findUnique({ where: { key } });
    if (!row) return null;

    return this.encryption.decrypt(row.value);
  }
}

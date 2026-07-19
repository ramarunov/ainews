import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { EncryptionService } from '../../common/crypto/encryption.service';
import {
  UpdateAiProviderKeysDto,
  UpdateMediaProviderKeysDto,
  UpdateTelegramSettingsDto,
} from './dto/system-settings.dto';
import {
  AI_PROVIDER_SETTING_KEYS,
  AI_SERVICES_ENABLED_KEY,
  AiProviderKeyField,
  MEDIA_PROVIDER_SETTING_KEYS,
  MediaProviderKeyField,
  TELEGRAM_SETTING_KEYS,
} from './system-settings.constants';

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

  /** Which media/stock-photo providers have a platform-wide key configured — never the key itself. */
  async getMediaProviderStatus() {
    const rows = await this.prisma.systemSetting.findMany({
      where: { key: { in: Object.values(MEDIA_PROVIDER_SETTING_KEYS) } },
      select: { key: true },
    });
    const configured = new Set(rows.map((r) => r.key));

    return {
      pexels: configured.has(MEDIA_PROVIDER_SETTING_KEYS.pexelsApiKey),
    };
  }

  async updateMediaProviderKeys(dto: UpdateMediaProviderKeysDto, updatedBy: string) {
    const entries = (Object.entries(dto) as [MediaProviderKeyField, string | undefined][]).filter(
      ([, value]) => value !== undefined,
    );

    await Promise.all(
      entries.map(([field, value]) => {
        const key = MEDIA_PROVIDER_SETTING_KEYS[field];
        const encrypted = this.encryption.encrypt(value as string);
        return this.prisma.systemSetting.upsert({
          where: { key },
          create: { key, value: encrypted, updatedBy },
          update: { value: encrypted, updatedBy },
        });
      }),
    );

    return this.getMediaProviderStatus();
  }

  /** Decrypted value for a given SystemSetting key, or null if never configured. */
  async getDecryptedValue(key: string): Promise<string | null> {
    const row = await this.prisma.systemSetting.findUnique({ where: { key } });
    if (!row) return null;

    return this.encryption.decrypt(row.value);
  }

  /** Whether Telegram is configured, and the (non-secret) chat id — never the bot token itself. */
  async getTelegramStatus() {
    const rows = await this.prisma.systemSetting.findMany({
      where: { key: { in: Object.values(TELEGRAM_SETTING_KEYS) } },
    });
    const byKey = new Map(rows.map((r) => [r.key, r.value]));

    return {
      configured: byKey.has(TELEGRAM_SETTING_KEYS.botToken) && byKey.has(TELEGRAM_SETTING_KEYS.chatId),
      chatId: byKey.get(TELEGRAM_SETTING_KEYS.chatId) ?? null,
    };
  }

  async updateTelegramSettings(dto: UpdateTelegramSettingsDto, updatedBy: string) {
    if (dto.botToken !== undefined) {
      const encrypted = this.encryption.encrypt(dto.botToken);
      await this.prisma.systemSetting.upsert({
        where: { key: TELEGRAM_SETTING_KEYS.botToken },
        create: { key: TELEGRAM_SETTING_KEYS.botToken, value: encrypted, updatedBy },
        update: { value: encrypted, updatedBy },
      });
    }
    if (dto.chatId !== undefined) {
      // Not a secret - stored as plain text, same reasoning as AI_SERVICES_ENABLED_KEY.
      await this.prisma.systemSetting.upsert({
        where: { key: TELEGRAM_SETTING_KEYS.chatId },
        create: { key: TELEGRAM_SETTING_KEYS.chatId, value: dto.chatId, updatedBy },
        update: { value: dto.chatId, updatedBy },
      });
    }

    return this.getTelegramStatus();
  }

  /** Master kill switch for every AI call path. Defaults to enabled if never toggled. */
  async isAiServicesEnabled(): Promise<boolean> {
    const row = await this.prisma.systemSetting.findUnique({ where: { key: AI_SERVICES_ENABLED_KEY } });
    return row?.value !== 'false';
  }

  async setAiServicesEnabled(enabled: boolean, updatedBy: string) {
    await this.prisma.systemSetting.upsert({
      where: { key: AI_SERVICES_ENABLED_KEY },
      create: { key: AI_SERVICES_ENABLED_KEY, value: String(enabled), updatedBy },
      update: { value: String(enabled), updatedBy },
    });

    return { enabled };
  }
}

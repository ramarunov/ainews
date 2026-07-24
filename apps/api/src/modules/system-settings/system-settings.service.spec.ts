import { BadRequestException } from '@nestjs/common';
import { SystemSettingsService } from './system-settings.service';
import { EncryptionService } from '../../common/crypto/encryption.service';
import {
  AI_PROVIDER_SETTING_KEYS,
  AI_SERVICES_ENABLED_KEY,
  GOOGLE_INDEXING_SETTING_KEYS,
  MEDIA_PROVIDER_SETTING_KEYS,
  TELEGRAM_SETTING_KEYS,
} from './system-settings.constants';

describe('SystemSettingsService', () => {
  let service: SystemSettingsService;
  let prisma: any;
  let encryption: EncryptionService;

  beforeEach(() => {
    prisma = {
      systemSetting: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
    };
    encryption = new EncryptionService({
      get: jest.fn().mockReturnValue('a-test-encryption-key-for-specs'),
    } as any);
    service = new SystemSettingsService(prisma, encryption);
  });

  describe('getAiProviderStatus', () => {
    it('reports only the providers that have a row configured', async () => {
      prisma.systemSetting.findMany.mockResolvedValue([
        { key: AI_PROVIDER_SETTING_KEYS.openaiApiKey },
      ]);

      const result = await service.getAiProviderStatus();

      expect(result).toEqual({ openai: true, anthropic: false, google: false });
    });
  });

  describe('updateAiProviderKeys', () => {
    it('encrypts each provided key before storing, never the plaintext', async () => {
      prisma.systemSetting.upsert.mockResolvedValue({});
      prisma.systemSetting.findMany.mockResolvedValue([
        { key: AI_PROVIDER_SETTING_KEYS.openaiApiKey },
      ]);

      await service.updateAiProviderKeys({ openaiApiKey: 'sk-real-secret-key' }, 'user-1');

      const upsertCall = prisma.systemSetting.upsert.mock.calls[0][0];
      expect(upsertCall.where).toEqual({ key: AI_PROVIDER_SETTING_KEYS.openaiApiKey });
      expect(upsertCall.create.value).not.toBe('sk-real-secret-key');
      expect(encryption.decrypt(upsertCall.create.value)).toBe('sk-real-secret-key');
      expect(upsertCall.create.updatedBy).toBe('user-1');
    });

    it('only touches keys that were actually provided', async () => {
      prisma.systemSetting.upsert.mockResolvedValue({});
      prisma.systemSetting.findMany.mockResolvedValue([]);

      await service.updateAiProviderKeys({ anthropicApiKey: 'sk-ant-key' }, 'user-1');

      expect(prisma.systemSetting.upsert).toHaveBeenCalledTimes(1);
      expect(prisma.systemSetting.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { key: AI_PROVIDER_SETTING_KEYS.anthropicApiKey } }),
      );
    });
  });

  describe('getMediaProviderStatus', () => {
    it('reports pexels as configured only when a row exists', async () => {
      prisma.systemSetting.findMany.mockResolvedValue([]);

      expect(await service.getMediaProviderStatus()).toEqual({ pexels: false });

      prisma.systemSetting.findMany.mockResolvedValue([
        { key: MEDIA_PROVIDER_SETTING_KEYS.pexelsApiKey },
      ]);

      expect(await service.getMediaProviderStatus()).toEqual({ pexels: true });
    });
  });

  describe('updateMediaProviderKeys', () => {
    it('encrypts the Pexels key before storing, never the plaintext', async () => {
      prisma.systemSetting.upsert.mockResolvedValue({});
      prisma.systemSetting.findMany.mockResolvedValue([
        { key: MEDIA_PROVIDER_SETTING_KEYS.pexelsApiKey },
      ]);

      await service.updateMediaProviderKeys({ pexelsApiKey: 'pexels-real-key' }, 'user-1');

      const upsertCall = prisma.systemSetting.upsert.mock.calls[0][0];
      expect(upsertCall.where).toEqual({ key: MEDIA_PROVIDER_SETTING_KEYS.pexelsApiKey });
      expect(upsertCall.create.value).not.toBe('pexels-real-key');
      expect(encryption.decrypt(upsertCall.create.value)).toBe('pexels-real-key');
    });
  });

  describe('getDecryptedValue', () => {
    it('returns null when the key was never configured', async () => {
      prisma.systemSetting.findUnique.mockResolvedValue(null);

      await expect(service.getDecryptedValue('ai.openai_api_key')).resolves.toBeNull();
    });

    it('decrypts a stored value back to its original plaintext', async () => {
      const encrypted = encryption.encrypt('sk-round-trip');
      prisma.systemSetting.findUnique.mockResolvedValue({ value: encrypted });

      await expect(service.getDecryptedValue('ai.openai_api_key')).resolves.toBe(
        'sk-round-trip',
      );
    });
  });

  describe('getTelegramStatus', () => {
    it('is unconfigured until both the bot token and chat id rows exist', async () => {
      prisma.systemSetting.findMany.mockResolvedValue([
        { key: TELEGRAM_SETTING_KEYS.botToken, value: 'irrelevant-encrypted-value' },
      ]);

      expect(await service.getTelegramStatus()).toEqual({ configured: false, chatId: null });
    });

    it('reports configured and the (non-secret) chat id once both are set', async () => {
      prisma.systemSetting.findMany.mockResolvedValue([
        { key: TELEGRAM_SETTING_KEYS.botToken, value: 'irrelevant-encrypted-value' },
        { key: TELEGRAM_SETTING_KEYS.chatId, value: '@my-news-channel' },
      ]);

      expect(await service.getTelegramStatus()).toEqual({
        configured: true,
        chatId: '@my-news-channel',
      });
    });
  });

  describe('updateTelegramSettings', () => {
    it('encrypts the bot token but stores the chat id as plain text', async () => {
      prisma.systemSetting.upsert.mockResolvedValue({});
      prisma.systemSetting.findMany.mockResolvedValue([
        { key: TELEGRAM_SETTING_KEYS.botToken },
        { key: TELEGRAM_SETTING_KEYS.chatId, value: '@my-news-channel' },
      ]);

      await service.updateTelegramSettings(
        { botToken: '123456:real-bot-token', chatId: '@my-news-channel' },
        'user-1',
      );

      expect(prisma.systemSetting.upsert).toHaveBeenCalledTimes(2);
      const tokenCall = prisma.systemSetting.upsert.mock.calls.find(
        (c: any) => c[0].where.key === TELEGRAM_SETTING_KEYS.botToken,
      )[0];
      expect(tokenCall.create.value).not.toBe('123456:real-bot-token');
      expect(encryption.decrypt(tokenCall.create.value)).toBe('123456:real-bot-token');

      const chatIdCall = prisma.systemSetting.upsert.mock.calls.find(
        (c: any) => c[0].where.key === TELEGRAM_SETTING_KEYS.chatId,
      )[0];
      expect(chatIdCall.create.value).toBe('@my-news-channel');
    });

    it('only touches the field that was actually provided', async () => {
      prisma.systemSetting.upsert.mockResolvedValue({});
      prisma.systemSetting.findMany.mockResolvedValue([]);

      await service.updateTelegramSettings({ chatId: '@only-this' }, 'user-1');

      expect(prisma.systemSetting.upsert).toHaveBeenCalledTimes(1);
      expect(prisma.systemSetting.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { key: TELEGRAM_SETTING_KEYS.chatId } }),
      );
    });
  });

  describe('getGoogleIndexingStatus', () => {
    it('is unconfigured when no row exists', async () => {
      prisma.systemSetting.findUnique.mockResolvedValue(null);

      expect(await service.getGoogleIndexingStatus()).toEqual({ configured: false, clientEmail: null });
    });

    it('reports configured and the (non-secret) client email once a service account is stored', async () => {
      const encrypted = encryption.encrypt(
        JSON.stringify({ client_email: 'indexer@example.iam.gserviceaccount.com', private_key: 'fake' }),
      );
      prisma.systemSetting.findUnique.mockResolvedValue({ value: encrypted });

      expect(await service.getGoogleIndexingStatus()).toEqual({
        configured: true,
        clientEmail: 'indexer@example.iam.gserviceaccount.com',
      });
    });
  });

  describe('updateGoogleIndexingSettings', () => {
    it('rejects a value that is not valid JSON', async () => {
      await expect(
        service.updateGoogleIndexingSettings({ serviceAccountJson: 'not json' }, 'user-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.systemSetting.upsert).not.toHaveBeenCalled();
    });

    it('rejects JSON missing client_email or private_key', async () => {
      await expect(
        service.updateGoogleIndexingSettings({ serviceAccountJson: JSON.stringify({ type: 'service_account' }) }, 'user-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.systemSetting.upsert).not.toHaveBeenCalled();
    });

    it('encrypts the full JSON before storing, never the plaintext', async () => {
      prisma.systemSetting.upsert.mockResolvedValue({});
      const validJson = JSON.stringify({ client_email: 'indexer@example.iam.gserviceaccount.com', private_key: 'fake' });
      prisma.systemSetting.findUnique.mockResolvedValue(null);

      await service.updateGoogleIndexingSettings({ serviceAccountJson: validJson }, 'user-1');

      const upsertCall = prisma.systemSetting.upsert.mock.calls[0][0];
      expect(upsertCall.where).toEqual({ key: GOOGLE_INDEXING_SETTING_KEYS.serviceAccountJson });
      expect(upsertCall.create.value).not.toBe(validJson);
      expect(encryption.decrypt(upsertCall.create.value)).toBe(validJson);
    });
  });

  describe('isAiServicesEnabled', () => {
    it('defaults to enabled when the flag was never toggled', async () => {
      prisma.systemSetting.findUnique.mockResolvedValue(null);

      await expect(service.isAiServicesEnabled()).resolves.toBe(true);
    });

    it('is disabled only when explicitly set to "false"', async () => {
      prisma.systemSetting.findUnique.mockResolvedValue({ value: 'false' });

      await expect(service.isAiServicesEnabled()).resolves.toBe(false);
    });

    it('is enabled when explicitly set to "true"', async () => {
      prisma.systemSetting.findUnique.mockResolvedValue({ value: 'true' });

      await expect(service.isAiServicesEnabled()).resolves.toBe(true);
    });
  });

  describe('setAiServicesEnabled', () => {
    it('stores the flag as a plain (unencrypted) string, not via the API-key encryption path', async () => {
      prisma.systemSetting.upsert.mockResolvedValue({});

      const result = await service.setAiServicesEnabled(false, 'user-1');

      expect(prisma.systemSetting.upsert).toHaveBeenCalledWith({
        where: { key: AI_SERVICES_ENABLED_KEY },
        create: { key: AI_SERVICES_ENABLED_KEY, value: 'false', updatedBy: 'user-1' },
        update: { value: 'false', updatedBy: 'user-1' },
      });
      expect(result).toEqual({ enabled: false });
    });
  });
});

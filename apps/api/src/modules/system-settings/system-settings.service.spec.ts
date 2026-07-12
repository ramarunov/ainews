import { SystemSettingsService } from './system-settings.service';
import { EncryptionService } from '../../common/crypto/encryption.service';
import { AI_PROVIDER_SETTING_KEYS } from './system-settings.constants';

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
});

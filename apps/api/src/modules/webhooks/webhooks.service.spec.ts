import { createHmac } from 'crypto';
import { NotFoundException } from '@nestjs/common';
import axios from 'axios';
import { WebhooksService } from './webhooks.service';
import { EncryptionService } from '../../common/crypto/encryption.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('WebhooksService', () => {
  let service: WebhooksService;
  let prisma: any;
  let encryption: EncryptionService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      webhook: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      webhookDelivery: {
        create: jest.fn().mockResolvedValue({}),
        findMany: jest.fn(),
        count: jest.fn(),
      },
    };
    encryption = new EncryptionService({
      get: jest.fn().mockReturnValue('a-test-encryption-key-for-specs'),
    } as any);
    service = new WebhooksService(prisma, encryption);
  });

  describe('create', () => {
    it('returns the plaintext secret exactly once, storing only the encrypted form', async () => {
      prisma.webhook.create.mockResolvedValue({ id: 'wh-1' });

      const result = await service.create(
        { name: 'My Webhook', url: 'https://example.com/hook', events: ['article.published'] } as any,
        'org-1',
      );

      const createCallData = prisma.webhook.create.mock.calls[0][0].data;
      expect(typeof createCallData.secretEncrypted).toBe('string');
      expect(createCallData.secretEncrypted).not.toBe(result.secret);
      // The stored value must be genuinely reversible back to the returned secret.
      expect(encryption.decrypt(createCallData.secretEncrypted)).toBe(result.secret);
      expect(typeof result.secret).toBe('string');
      expect(result.secret.length).toBeGreaterThan(0);
    });
  });

  describe('findOne / update / remove', () => {
    it('throws NotFoundException for a webhook outside this org', async () => {
      prisma.webhook.findFirst.mockResolvedValue(null);

      await expect(service.findOne('wh-1', 'org-1')).rejects.toThrow(NotFoundException);
    });

    it('remove() deletes only after confirming ownership', async () => {
      prisma.webhook.findFirst.mockResolvedValue({ id: 'wh-1' });
      prisma.webhook.delete.mockResolvedValue({});

      const result = await service.remove('wh-1', 'org-1');

      expect(prisma.webhook.delete).toHaveBeenCalledWith({ where: { id: 'wh-1' } });
      expect(result).toEqual({ success: true, message: 'Webhook deleted' });
    });
  });

  describe('dispatch', () => {
    const webhookRow = (id: string, url: string) => ({
      id,
      url,
      secretEncrypted: encryption.encrypt('a-known-webhook-secret'),
    });

    it('only delivers to active webhooks subscribed to the given event', async () => {
      prisma.webhook.findMany.mockResolvedValue([
        webhookRow('wh-1', 'https://a.example.com'),
        webhookRow('wh-2', 'https://b.example.com'),
      ]);
      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });
      prisma.webhook.update.mockResolvedValue({});

      await service.dispatch('org-1', 'article.published', { articleId: 'a1' });

      expect(prisma.webhook.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-1', isActive: true, events: { has: 'article.published' } },
      });
      expect(mockedAxios.post).toHaveBeenCalledTimes(2);
    });

    it('signs the payload with HMAC-SHA256 of the webhook-specific secret', async () => {
      const payload = { articleId: 'a1' };
      prisma.webhook.findMany.mockResolvedValue([webhookRow('wh-1', 'https://a.example.com')]);
      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });
      prisma.webhook.update.mockResolvedValue({});

      await service.dispatch('org-1', 'article.published', payload);

      const [, body, options] = mockedAxios.post.mock.calls[0];
      const expectedSignature =
        'sha256=' + createHmac('sha256', 'a-known-webhook-secret').update(body as string).digest('hex');
      expect(options!.headers!['X-Webhook-Signature']).toBe(expectedSignature);
      expect(options!.headers!['X-Webhook-Event']).toBe('article.published');
    });

    it('records a successful delivery and updates lastTriggeredAt', async () => {
      prisma.webhook.findMany.mockResolvedValue([webhookRow('wh-1', 'https://a.example.com')]);
      mockedAxios.post.mockResolvedValue({ status: 200, data: { ok: true } });
      prisma.webhook.update.mockResolvedValue({});

      await service.dispatch('org-1', 'article.published', { articleId: 'a1' });

      expect(prisma.webhookDelivery.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ webhookId: 'wh-1', statusCode: 200, success: true }),
        }),
      );
      expect(prisma.webhook.update).toHaveBeenCalledWith({
        where: { id: 'wh-1' },
        data: { lastTriggeredAt: expect.any(Date) },
      });
    });

    it('records a failed delivery and increments failureCount instead of throwing', async () => {
      prisma.webhook.findMany.mockResolvedValue([webhookRow('wh-1', 'https://a.example.com')]);
      mockedAxios.post.mockRejectedValue({
        response: { status: 500, data: { error: 'server error' } },
        message: 'Request failed with status code 500',
      });
      prisma.webhook.update.mockResolvedValue({});

      // Should resolve, not reject — a single subscriber failing must not
      // break dispatch() for the other subscribers or the caller.
      await expect(
        service.dispatch('org-1', 'article.published', { articleId: 'a1' }),
      ).resolves.toBeUndefined();

      expect(prisma.webhookDelivery.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ webhookId: 'wh-1', statusCode: 500, success: false }),
        }),
      );
      expect(prisma.webhook.update).toHaveBeenCalledWith({
        where: { id: 'wh-1' },
        data: { failureCount: { increment: 1 }, lastTriggeredAt: expect.any(Date) },
      });
    });
  });
});

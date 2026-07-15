/**
 * @jest-environment jsdom
 *
 * Transitively imports providers/ai-providers -> the real openai SDK, which
 * probes for Web Fetch API globals (fetch/Request/Response/...) at *module
 * load* time (even with jest.mock('openai'), automocking still requires
 * loading the real module to inspect its shape) and throws under
 * jest-environment-jsdom, which doesn't expose these. The providers are
 * always mocked in these tests (plain objects, never instantiated) so
 * these are load-bearing stubs only, never actually invoked. See
 * autonomous-publishing.service.spec.ts for the same requirement.
 */
jest.mock('openai');
jest.mock('@anthropic-ai/sdk');
jest.mock('@google/generative-ai');
for (const name of ['fetch', 'Request', 'Response', 'Headers', 'FormData', 'Blob', 'ReadableStream']) {
  (global as any)[name] = (global as any)[name] || class {};
}

import { ServiceUnavailableException } from '@nestjs/common';
import { AIGatewayService } from './ai-gateway.service';

describe('AIGatewayService', () => {
  let service: AIGatewayService;
  let openai: any;
  let anthropic: any;
  let google: any;
  let config: any;
  let prisma: any;
  let systemSettings: any;
  let redis: any;

  const fakeResponse = {
    content: 'hello',
    model: 'gpt-4o',
    usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCostUsd: 0.01 },
    latencyMs: 10,
    provider: 'openai',
  };

  beforeEach(() => {
    openai = { complete: jest.fn().mockResolvedValue(fakeResponse), embed: jest.fn().mockResolvedValue({}) };
    anthropic = { complete: jest.fn().mockResolvedValue(fakeResponse) };
    google = { complete: jest.fn().mockResolvedValue(fakeResponse) };
    config = { get: jest.fn((_key: string, def: any) => def) };
    prisma = { articleAiAnalysis: { create: jest.fn().mockResolvedValue({}) } };
    systemSettings = { isAiServicesEnabled: jest.fn().mockResolvedValue(true) };
    redis = {
      get: jest.fn().mockResolvedValue(null),
      setex: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
      multi: jest.fn(() => ({ incr: jest.fn().mockReturnThis(), expire: jest.fn().mockReturnThis(), exec: jest.fn() })),
    };

    service = new AIGatewayService(openai, anthropic, google, config, prisma, systemSettings, redis);
  });

  describe('emergency kill switch', () => {
    it('refuses to complete a request when AI services are disabled, without touching cache/providers', async () => {
      systemSettings.isAiServicesEnabled.mockResolvedValue(false);

      await expect(
        service.complete({ messages: [{ role: 'user', content: 'hi' }] }),
      ).rejects.toThrow(ServiceUnavailableException);

      expect(redis.get).not.toHaveBeenCalled();
      expect(openai.complete).not.toHaveBeenCalled();
    });

    it('refuses to embed when AI services are disabled', async () => {
      systemSettings.isAiServicesEnabled.mockResolvedValue(false);

      await expect(service.embed('some text')).rejects.toThrow(ServiceUnavailableException);
      expect(openai.embed).not.toHaveBeenCalled();
    });

    it('proceeds normally when AI services are enabled', async () => {
      const result = await service.complete({ messages: [{ role: 'user', content: 'hi' }] });

      expect(result).toEqual(expect.objectContaining({ content: 'hello' }));
      expect(openai.complete).toHaveBeenCalled();
    });
  });
});

import { HttpException, HttpStatus } from '@nestjs/common';

import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;
  let healthService: any;

  beforeEach(() => {
    healthService = { checkReadiness: jest.fn() };
    controller = new HealthController(healthService);
  });

  describe('readiness', () => {
    it('returns the result directly with a 200 when every dependency is up', async () => {
      const result = { status: 'ok', checks: { database: 'up', redis: 'up', opensearch: 'up' } };
      healthService.checkReadiness.mockResolvedValue(result);

      await expect(controller.readiness()).resolves.toEqual(result);
    });

    it('throws a 503 (not a silent 200) when a dependency is down', async () => {
      const result = { status: 'degraded', checks: { database: 'down', redis: 'up', opensearch: 'up' } };
      healthService.checkReadiness.mockResolvedValue(result);

      await expect(controller.readiness()).rejects.toMatchObject({
        status: HttpStatus.SERVICE_UNAVAILABLE,
        response: result,
      });
    });

    it('the thrown exception is a real HttpException carrying the check details', async () => {
      const result = { status: 'degraded', checks: { database: 'up', redis: 'down', opensearch: 'up' } };
      healthService.checkReadiness.mockResolvedValue(result);

      try {
        await controller.readiness();
        fail('expected readiness() to throw');
      } catch (err) {
        expect(err).toBeInstanceOf(HttpException);
        expect((err as HttpException).getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
        expect((err as HttpException).getResponse()).toEqual(result);
      }
    });
  });
});

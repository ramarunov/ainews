import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { MetricsGuard } from './metrics.guard';

describe('MetricsGuard', () => {
  const buildContext = (authorization?: string): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ headers: { authorization } }),
      }),
    }) as unknown as ExecutionContext;

  it('allows any request when no METRICS_TOKEN is configured', () => {
    const config = { get: jest.fn().mockReturnValue('') };
    const guard = new MetricsGuard(config as any);

    expect(guard.canActivate(buildContext())).toBe(true);
  });

  it('rejects a request with no bearer token when METRICS_TOKEN is configured', () => {
    const config = { get: jest.fn().mockReturnValue('secret-token') };
    const guard = new MetricsGuard(config as any);

    expect(() => guard.canActivate(buildContext())).toThrow(UnauthorizedException);
  });

  it('rejects a request with the wrong token', () => {
    const config = { get: jest.fn().mockReturnValue('secret-token') };
    const guard = new MetricsGuard(config as any);

    expect(() => guard.canActivate(buildContext('Bearer wrong'))).toThrow(UnauthorizedException);
  });

  it('allows a request with the correct bearer token', () => {
    const config = { get: jest.fn().mockReturnValue('secret-token') };
    const guard = new MetricsGuard(config as any);

    expect(guard.canActivate(buildContext('Bearer secret-token'))).toBe(true);
  });
});

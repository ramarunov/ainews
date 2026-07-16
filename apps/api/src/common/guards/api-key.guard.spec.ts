import { HttpException, UnauthorizedException, ExecutionContext } from '@nestjs/common';
import { ApiKeyGuard } from './api-key.guard';

describe('ApiKeyGuard', () => {
  let guard: ApiKeyGuard;
  let apiKeysService: any;
  let redis: any;

  const buildContext = (headers: Record<string, string>): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ headers }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    apiKeysService = { validateKey: jest.fn() };
    redis = { incr: jest.fn(), expire: jest.fn() };
    guard = new ApiKeyGuard(apiKeysService, redis);
  });

  it('rejects a request with no X-API-Key header', async () => {
    await expect(guard.canActivate(buildContext({}))).rejects.toThrow(UnauthorizedException);
    expect(apiKeysService.validateKey).not.toHaveBeenCalled();
  });

  it('rejects an invalid or expired key', async () => {
    apiKeysService.validateKey.mockResolvedValue(null);

    await expect(
      guard.canActivate(buildContext({ 'x-api-key': 'ak_bogus' })),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('populates request.user from the key, never inheriting isSuperadmin', async () => {
    const key = {
      id: 'key-1',
      organizationId: 'org-1',
      userId: 'user-1',
      permissions: ['articles:read'],
      rateLimit: 1000,
    };
    apiKeysService.validateKey.mockResolvedValue(key);
    redis.incr.mockResolvedValue(1);

    const request: any = { headers: { 'x-api-key': 'ak_valid' } };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(request.user).toEqual({
      id: 'user-1',
      organizationId: 'org-1',
      permissions: ['articles:read'],
      isSuperadmin: false,
      apiKeyId: 'key-1',
    });
  });

  it('sets a 1-hour expiry on the very first request in a rate-limit window', async () => {
    apiKeysService.validateKey.mockResolvedValue({
      id: 'key-1',
      organizationId: 'org-1',
      userId: 'user-1',
      permissions: [],
      rateLimit: 5,
    });
    redis.incr.mockResolvedValue(1);

    await guard.canActivate(buildContext({ 'x-api-key': 'ak_valid' }));

    expect(redis.expire).toHaveBeenCalledWith(expect.stringContaining('key-1'), 3600);
  });

  it('does not reset the expiry on subsequent requests within the window', async () => {
    apiKeysService.validateKey.mockResolvedValue({
      id: 'key-1',
      organizationId: 'org-1',
      userId: 'user-1',
      permissions: [],
      rateLimit: 5,
    });
    redis.incr.mockResolvedValue(2);

    await guard.canActivate(buildContext({ 'x-api-key': 'ak_valid' }));

    expect(redis.expire).not.toHaveBeenCalled();
  });

  it('rejects once the per-key rate limit is exceeded', async () => {
    apiKeysService.validateKey.mockResolvedValue({
      id: 'key-1',
      organizationId: 'org-1',
      userId: 'user-1',
      permissions: [],
      rateLimit: 5,
    });
    redis.incr.mockResolvedValue(6);

    await expect(
      guard.canActivate(buildContext({ 'x-api-key': 'ak_valid' })),
    ).rejects.toThrow(HttpException);
  });
});

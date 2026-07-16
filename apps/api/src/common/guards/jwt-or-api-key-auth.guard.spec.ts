import { ExecutionContext } from '@nestjs/common';
import { JwtOrApiKeyAuthGuard } from './jwt-or-api-key-auth.guard';

describe('JwtOrApiKeyAuthGuard', () => {
  let guard: JwtOrApiKeyAuthGuard;
  let jwtAuthGuard: any;
  let apiKeyGuard: any;

  const buildContext = (headers: Record<string, string>): ExecutionContext =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ headers }) }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    jwtAuthGuard = { canActivate: jest.fn().mockResolvedValue(true) };
    apiKeyGuard = { canActivate: jest.fn().mockResolvedValue(true) };
    guard = new JwtOrApiKeyAuthGuard(jwtAuthGuard, apiKeyGuard);
  });

  it('delegates to ApiKeyGuard when an X-API-Key header is present', async () => {
    await guard.canActivate(buildContext({ 'x-api-key': 'ak_test' }));

    expect(apiKeyGuard.canActivate).toHaveBeenCalled();
    expect(jwtAuthGuard.canActivate).not.toHaveBeenCalled();
  });

  it('delegates to JwtAuthGuard when there is no X-API-Key header', async () => {
    await guard.canActivate(buildContext({ authorization: 'Bearer some.jwt.token' }));

    expect(jwtAuthGuard.canActivate).toHaveBeenCalled();
    expect(apiKeyGuard.canActivate).not.toHaveBeenCalled();
  });

  it('falls through to JwtAuthGuard (and its own "Authentication required" error) with no credentials at all', async () => {
    await guard.canActivate(buildContext({}));

    expect(jwtAuthGuard.canActivate).toHaveBeenCalled();
  });
});

import { CallHandler, ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';
import { OrgContextInterceptor } from './org-context.interceptor';
import { orgContextStorage } from '../../infrastructure/prisma/org-context';

describe('OrgContextInterceptor', () => {
  let interceptor: OrgContextInterceptor;
  let reflector: any;
  let config: any;

  const buildContext = (user: any): ExecutionContext =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
      getHandler: () => ({}),
      getClass: () => ({}),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) };
    config = { get: jest.fn().mockReturnValue('') };
    interceptor = new OrgContextInterceptor(reflector, config);
  });

  function captureContext(user: any): Promise<any> {
    return new Promise((resolve) => {
      const handler: CallHandler = {
        handle: () => {
          resolve(orgContextStorage.getStore());
          return of('ok');
        },
      };
      interceptor.intercept(buildContext(user), handler).subscribe();
    });
  }

  it('establishes context from a regular user\'s own organizationId', async () => {
    const ctx = await captureContext({ id: 'u1', organizationId: 'org-1', isSuperadmin: false });
    expect(ctx).toEqual({ organizationId: 'org-1' });
  });

  it('establishes context from a SUPERADMIN\'s own organizationId too — not none', async () => {
    // Regression test: superadmin used to get NO context at all, which
    // broke every write a superadmin makes in their own org once RLS's
    // FORCE ROW LEVEL SECURITY started rejecting inserts with no matching
    // WITH CHECK context. Superadmin only means "bypass permission
    // checks", not "act with no organization at all".
    const ctx = await captureContext({ id: 'u1', organizationId: 'org-1', isSuperadmin: true });
    expect(ctx).toEqual({ organizationId: 'org-1' });
  });

  it('establishes no context for an unauthenticated request', async () => {
    const ctx = await captureContext(undefined);
    expect(ctx).toBeUndefined();
  });

  it('uses PUBLIC_SITE_ORG_ID for an unauthenticated @PublicSiteRead() route', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    config.get.mockReturnValue('public-org-1');

    const ctx = await captureContext(undefined);
    expect(ctx).toEqual({ organizationId: 'public-org-1' });
  });

  it('does not fall back to PUBLIC_SITE_ORG_ID for an authenticated request', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    config.get.mockReturnValue('public-org-1');

    const ctx = await captureContext({ id: 'u1', organizationId: 'org-1', isSuperadmin: false });
    expect(ctx).toEqual({ organizationId: 'org-1' });
  });
});

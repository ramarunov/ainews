import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';

describe('PermissionsGuard', () => {
  let guard: PermissionsGuard;
  let reflector: Reflector;

  const buildContext = (user: any): ExecutionContext =>
    ({
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new PermissionsGuard(reflector);
  });

  it('allows the request when the handler has no required permissions', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    expect(guard.canActivate(buildContext(undefined))).toBe(true);
  });

  it('allows the request when required permissions is an empty array', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([]);
    expect(guard.canActivate(buildContext({ permissions: [] }))).toBe(true);
  });

  it('throws ForbiddenException when there is no authenticated user', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['articles:create']);
    expect(() => guard.canActivate(buildContext(undefined))).toThrow(
      ForbiddenException,
    );
  });

  it('allows superadmins to bypass all permission checks', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['articles:delete']);
    const context = buildContext({ isSuperadmin: true, permissions: [] });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows a user who has every required permission', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['articles:create']);
    const context = buildContext({ permissions: ['articles:create', 'articles:read'] });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('throws ForbiddenException when the user is missing a required permission', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([
      'articles:create',
      'articles:publish',
    ]);
    const context = buildContext({ permissions: ['articles:create'] });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('treats a missing permissions array on the user as no permissions', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['articles:create']);
    const context = buildContext({});
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});

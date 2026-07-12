import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { SuperadminGuard } from './superadmin.guard';

describe('SuperadminGuard', () => {
  let guard: SuperadminGuard;

  const buildContext = (user: any): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    guard = new SuperadminGuard();
  });

  it('throws ForbiddenException when there is no authenticated user', () => {
    expect(() => guard.canActivate(buildContext(undefined))).toThrow(ForbiddenException);
  });

  it('throws ForbiddenException for a regular (non-superadmin) user', () => {
    expect(() => guard.canActivate(buildContext({ isSuperadmin: false }))).toThrow(
      ForbiddenException,
    );
  });

  it('allows a superadmin user through', () => {
    expect(guard.canActivate(buildContext({ isSuperadmin: true }))).toBe(true);
  });
});

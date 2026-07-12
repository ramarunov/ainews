import { of } from 'rxjs';
import { AuditInterceptor, isUuid, resolveEntityTypeAndAction } from './audit.interceptor';

describe('resolveEntityTypeAndAction', () => {
  it('splits a permission string into entityType and action', () => {
    expect(resolveEntityTypeAndAction(['articles:publish'], 'ArticlesController', '/api/v1/articles/:id/publish')).toEqual({
      entityType: 'articles',
      action: 'publish',
    });
  });

  it('falls back to the controller name and last route segment when no permission metadata exists', () => {
    expect(resolveEntityTypeAndAction(undefined, 'AuthController', '/api/v1/auth/register')).toEqual({
      entityType: 'auth',
      action: 'register',
    });
  });

  it('falls back for an empty permissions array too', () => {
    expect(resolveEntityTypeAndAction([], 'AuthController', '/api/v1/auth/login')).toEqual({
      entityType: 'auth',
      action: 'login',
    });
  });
});

describe('isUuid', () => {
  it('accepts a real UUID', () => {
    expect(isUuid('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
  });

  it('rejects non-UUID values', () => {
    expect(isUuid('not-a-uuid')).toBe(false);
    expect(isUuid(undefined)).toBe(false);
    expect(isUuid(123)).toBe(false);
  });
});

describe('AuditInterceptor', () => {
  let reflector: any;
  let auditLog: any;
  let interceptor: AuditInterceptor;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    auditLog = { record: jest.fn().mockResolvedValue(undefined) };
    interceptor = new AuditInterceptor(reflector, auditLog);
  });

  const buildContext = (req: any, className = 'ArticlesController') =>
    ({
      switchToHttp: () => ({ getRequest: () => req }),
      getHandler: () => ({}),
      getClass: () => ({ name: className }),
    }) as any;

  it('skips non-mutating requests entirely', (done) => {
    reflector.getAllAndOverride.mockReturnValue(['articles:read']);
    const req = { method: 'GET' };
    const context = buildContext(req);
    const handler = { handle: () => of({ id: 'article-1' }) };

    interceptor.intercept(context, handler).subscribe(() => {
      expect(auditLog.record).not.toHaveBeenCalled();
      done();
    });
  });

  it('records an audit entry for a mutating request using the permission metadata', (done) => {
    reflector.getAllAndOverride.mockReturnValue(['articles:publish']);
    const req = {
      method: 'PATCH',
      params: { id: '550e8400-e29b-41d4-a716-446655440000' },
      user: { id: 'user-1', organizationId: 'org-1' },
      headers: { 'user-agent': 'jest', 'x-request-id': 'req-1' },
      ip: '127.0.0.1',
    };
    const context = buildContext(req);
    const responseBody = { id: '550e8400-e29b-41d4-a716-446655440000', status: 'PUBLISHED' };
    const handler = { handle: () => of(responseBody) };

    interceptor.intercept(context, handler).subscribe(() => {
      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-1',
          userId: 'user-1',
          action: 'articles:publish',
          entityType: 'articles',
          entityId: '550e8400-e29b-41d4-a716-446655440000',
          afterState: responseBody,
          ipAddress: '127.0.0.1',
          userAgent: 'jest',
          requestId: 'req-1',
        }),
      );
      done();
    });
  });

  it('falls back to the response body user for register/login, which have no req.user yet', (done) => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    const req = {
      method: 'POST',
      params: {},
      user: undefined,
      headers: {},
      route: { path: '/api/v1/auth/register' },
    };
    const context = buildContext(req, 'AuthController');
    const responseBody = { user: { id: 'new-user-1', organizationId: 'org-2' } };
    const handler = { handle: () => of(responseBody) };

    interceptor.intercept(context, handler).subscribe(() => {
      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-2',
          userId: 'new-user-1',
          action: 'auth:register',
        }),
      );
      done();
    });
  });
});

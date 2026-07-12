import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';

import { orgContextStorage } from '../../infrastructure/prisma/org-context';

/**
 * Establishes the Row-Level Security org context (see
 * infrastructure/prisma/org-context.ts + rls-extension.ts) for the
 * duration of a request, based on the authenticated user's
 * organizationId. Must run BEFORE AuditInterceptor in the interceptor
 * chain (registration order in app.module.ts) so that
 * AuditLogService.record() — called from within the same request's
 * downstream pipeline — executes inside this context too.
 *
 * Superadmin requests and requests with no authenticated user (public
 * endpoints like /auth/login, /auth/register, /health) intentionally get
 * no context: RLS-protected tables then deny all rows for those requests,
 * except wherever a service explicitly opts back in via
 * runWithOrgContext() — see AuthService.register(), which needs to write
 * rows for the brand-new organization it just created before any
 * request-level context could otherwise exist for it.
 */
@Injectable()
export class OrgContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const user = req.user;

    const organizationId = user && !user.isSuperadmin ? user.organizationId : null;

    if (!organizationId) {
      return next.handle();
    }

    return new Observable((subscriber) => {
      orgContextStorage.run({ organizationId }, () => {
        next.handle().subscribe(subscriber);
      });
    });
  }
}

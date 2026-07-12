import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';

import { orgContextStorage } from '../../infrastructure/prisma/org-context';
import { IS_PUBLIC_SITE_READ_KEY } from '../decorators/public-site-read.decorator';

/**
 * Establishes the Row-Level Security org context (see
 * infrastructure/prisma/org-context.ts + rls-extension.ts) for the
 * duration of a request, based on the authenticated user's
 * organizationId. Must run BEFORE AuditInterceptor in the interceptor
 * chain (registration order in app.module.ts) so that
 * AuditLogService.record() — called from within the same request's
 * downstream pipeline — executes inside this context too.
 *
 * A superadmin's OWN organizationId is used too, same as any other user —
 * superadmin only means "bypass permission checks" (PermissionsGuard) and
 * "may look up another org's Organization record"
 * (organizations.controller.ts), neither of which is an RLS-protected
 * table. Setting no context at all for superadmins was tried first and was
 * wrong: it broke every write a superadmin makes in their own org, since
 * FORCE ROW LEVEL SECURITY's WITH CHECK then has nothing to match against.
 *
 * Requests with no authenticated user at all intentionally get no context:
 * RLS-protected tables then deny all rows, by design (fail closed) — with
 * one exception: routes marked `@PublicSiteRead()` (the public reader
 * site's article endpoints, which have no user at all) get the configured
 * PUBLIC_SITE_ORG_ID instead, since that's the one org whose published
 * content is meant to be public.
 */
@Injectable()
export class OrgContextInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const user = req.user;

    let organizationId: string | null = user?.organizationId ?? null;

    if (!organizationId) {
      const isPublicSiteRead = this.reflector.getAllAndOverride<boolean>(
        IS_PUBLIC_SITE_READ_KEY,
        [context.getHandler(), context.getClass()],
      );
      if (isPublicSiteRead) {
        organizationId = this.config.get<string>('PUBLIC_SITE_ORG_ID', '') || null;
      }
    }

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

import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { AuditLogService } from './audit-log.service';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function resolveEntityTypeAndAction(
  permissions: string[] | undefined,
  controllerName: string,
  routePath: string | undefined,
): { entityType: string; action: string } {
  if (permissions && permissions.length > 0) {
    const [entityType, action] = permissions[0].split(':');
    return { entityType, action: action ?? 'unknown' };
  }

  const entityType = controllerName.replace(/Controller$/, '').toLowerCase();
  const segments = (routePath ?? '').split('/').filter((s) => s && !s.startsWith(':'));
  const action = segments[segments.length - 1] ?? 'unknown';
  return { entityType, action };
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditLog: AuditLogService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();

    if (!MUTATING_METHODS.has(req.method)) {
      return next.handle();
    }

    const permissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const { entityType, action } = resolveEntityTypeAndAction(
      permissions,
      context.getClass().name,
      req.route?.path,
    );

    return next.handle().pipe(
      tap((responseBody: any) => {
        const user = req.user;
        const entityId = [req.params?.id, responseBody?.id, responseBody?.user?.id].find(
          isUuid,
        );

        void this.auditLog.record({
          organizationId: user?.organizationId ?? responseBody?.user?.organizationId,
          userId: user?.id ?? responseBody?.user?.id,
          action: `${entityType}:${action}`,
          entityType,
          entityId,
          afterState: responseBody,
          ipAddress: req.ip,
          userAgent: req.headers?.['user-agent'],
          requestId: req.headers?.['x-request-id'],
        });
      }),
    );
  }
}

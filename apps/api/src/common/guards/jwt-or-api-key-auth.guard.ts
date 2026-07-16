import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';

import { JwtAuthGuard } from '../../modules/auth/guards/jwt-auth.guard';
import { ApiKeyGuard } from './api-key.guard';

/**
 * Lets a controller accept either a dashboard JWT or a programmatic API key,
 * without duplicating every route. Dispatches on which credential header is
 * present rather than try-JWT-then-fallback, so a request with neither gets
 * JwtAuthGuard's normal "Authentication required" error instead of an
 * API-key-shaped one.
 */
@Injectable()
export class JwtOrApiKeyAuthGuard implements CanActivate {
  constructor(
    private readonly jwtAuthGuard: JwtAuthGuard,
    private readonly apiKeyGuard: ApiKeyGuard,
  ) {}

  canActivate(context: ExecutionContext): Promise<boolean> | boolean {
    const request = context.switchToHttp().getRequest();
    if (request.headers['x-api-key']) {
      return this.apiKeyGuard.canActivate(context);
    }
    return this.jwtAuthGuard.canActivate(context) as Promise<boolean> | boolean;
  }
}

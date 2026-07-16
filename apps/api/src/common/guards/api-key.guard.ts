import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  HttpException,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { Redis } from 'ioredis';

import { ApiKeysService } from '../../modules/api-keys/api-keys.service';
import { REDIS_CLIENT } from '../../infrastructure/redis/redis.module';

const RATE_LIMIT_PREFIX = 'api_key:rate:';
const RATE_LIMIT_WINDOW_SECONDS = 3600; // 1 hour, matching ApiKey.rateLimit's "requests per hour" semantics.

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly apiKeysService: ApiKeysService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const rawKey = request.headers['x-api-key'];

    if (!rawKey || typeof rawKey !== 'string') {
      throw new UnauthorizedException('Missing X-API-Key header');
    }

    const key = await this.apiKeysService.validateKey(rawKey);
    if (!key) {
      throw new UnauthorizedException('Invalid or expired API key');
    }

    const rateLimitKey = `${RATE_LIMIT_PREFIX}${key.id}`;
    const count = await this.redis.incr(rateLimitKey);
    if (count === 1) {
      await this.redis.expire(rateLimitKey, RATE_LIMIT_WINDOW_SECONDS);
    }
    if (count > key.rateLimit) {
      throw new HttpException(
        `API key rate limit exceeded (${key.rateLimit} requests/hour)`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    request.user = {
      id: key.userId,
      organizationId: key.organizationId,
      permissions: key.permissions,
      isSuperadmin: false,
      apiKeyId: key.id,
    };

    return true;
  }
}

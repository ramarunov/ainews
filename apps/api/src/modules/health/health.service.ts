import { Inject, Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';
import { Client } from '@opensearch-project/opensearch';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { REDIS_CLIENT } from '../../infrastructure/redis/redis.module';
import { OPENSEARCH_CLIENT } from '../../infrastructure/opensearch/opensearch.module';

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(OPENSEARCH_CLIENT) private readonly opensearch: Client,
  ) {}

  checkLiveness() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  async checkReadiness() {
    const [database, redis, opensearch] = await Promise.allSettled([
      this.prisma.$queryRaw`SELECT 1`,
      this.redis.ping(),
      this.opensearch.ping(),
    ]);

    const checks = {
      database: database.status === 'fulfilled' ? 'up' : 'down',
      redis: redis.status === 'fulfilled' ? 'up' : 'down',
      opensearch: opensearch.status === 'fulfilled' ? 'up' : 'down',
    };

    const status = Object.values(checks).every((c) => c === 'up') ? 'ok' : 'degraded';

    return { status, checks };
  }
}

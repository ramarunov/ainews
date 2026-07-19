import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import type { Redis } from 'ioredis';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { runWithOrgContext } from '../../infrastructure/prisma/org-context';
import { REDIS_CLIENT } from '../../infrastructure/redis/redis.module';
import { runWithSchedulerLock } from '../../common/scheduler-lock.util';
import { AutonomousPublishingService } from './autonomous-publishing.service';

const INTERVAL_NAME = 'autonomous-publishing-sweep';
const LOCK_KEY = 'scheduler-lock:autonomous-publishing-sweep';
// AutonomousPublishingService already claims a per-cluster lock before
// doing any real work, so two instances' ticks overlapping can't actually
// double-process the same cluster - this coarser lock is just to stop
// every instance from redundantly re-querying clusters/settings for every
// org on every tick. 10 minutes matches the default interval itself.
const LOCK_TTL_SECONDS = 600;

/**
 * Periodic sweep for the autonomous "discover -> AI rewrite -> quality-gated
 * publish" pipeline. Same periodic-sweep-across-orgs shape as
 * RssIngestionSchedulerService/ScheduledPublishSchedulerService — off by
 * default per org (AutonomousPublishingService.runCycle checks the org's
 * own opt-in setting first and no-ops immediately if disabled).
 */
@Injectable()
export class AutonomousPublishingSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(AutonomousPublishingSchedulerService.name);

  constructor(
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly autonomousPublishingService: AutonomousPublishingService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  onModuleInit() {
    const minutes = this.config.get<number>('AUTONOMOUS_PIPELINE_INTERVAL_MINUTES', 10);
    const interval = setInterval(() => {
      runWithSchedulerLock(this.redis, LOCK_KEY, LOCK_TTL_SECONDS, () =>
        this.runAllOrganizations(),
      ).catch((err) => this.logger.error('Autonomous publishing sweep failed', err));
    }, minutes * 60_000);
    this.schedulerRegistry.addInterval(INTERVAL_NAME, interval);
    this.logger.log(`Scheduled autonomous publishing sweep every ${minutes} minute(s)`);
  }

  async runAllOrganizations(): Promise<void> {
    const organizations = await this.prisma.organization.findMany({ select: { id: true } });

    for (const org of organizations) {
      try {
        await runWithOrgContext(org.id, () => this.autonomousPublishingService.runCycle(org.id));
      } catch (err) {
        this.logger.error(`Autonomous publishing cycle failed for org ${org.id}`, err);
      }
    }
  }
}

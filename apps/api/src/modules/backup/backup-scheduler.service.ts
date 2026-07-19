import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import type { Redis } from 'ioredis';

import { REDIS_CLIENT } from '../../infrastructure/redis/redis.module';
import { runWithSchedulerLock } from '../../common/scheduler-lock.util';
import { BackupService } from './backup.service';

const INTERVAL_NAME = 'db-backup-sweep';
const LOCK_KEY = 'scheduler-lock:db-backup-sweep';
// Unlike the other sweeps, a real pg_dump of a large database can
// legitimately run for minutes - this only needs to stay well clear of the
// 24h default interval, not the couple of minutes a normal run takes, so
// it's set generously high rather than tight.
const LOCK_TTL_SECONDS = 7200;

/**
 * Until this existed, the Postgres volume had zero backup/DR story at all —
 * losing the docker volume meant losing every article, user, and org
 * permanently. Same periodic-sweep shape as the other scheduler services
 * (RssIngestionSchedulerService, ScheduledPublishSchedulerService).
 */
@Injectable()
export class BackupSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(BackupSchedulerService.name);

  constructor(
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly config: ConfigService,
    private readonly backupService: BackupService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  onModuleInit() {
    const hours = this.config.get<number>('BACKUP_INTERVAL_HOURS', 24);
    const interval = setInterval(() => {
      runWithSchedulerLock(this.redis, LOCK_KEY, LOCK_TTL_SECONDS, () =>
        this.backupService.runBackup(),
      ).catch((err) => this.logger.error('Scheduled database backup failed', err));
    }, hours * 60 * 60_000);
    this.schedulerRegistry.addInterval(INTERVAL_NAME, interval);
    this.logger.log(`Scheduled database backup every ${hours} hour(s)`);
  }
}

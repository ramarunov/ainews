import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';

import { BackupService } from './backup.service';

const INTERVAL_NAME = 'db-backup-sweep';

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
  ) {}

  onModuleInit() {
    const hours = this.config.get<number>('BACKUP_INTERVAL_HOURS', 24);
    const interval = setInterval(() => {
      this.backupService.runBackup().catch((err) => this.logger.error('Scheduled database backup failed', err));
    }, hours * 60 * 60_000);
    this.schedulerRegistry.addInterval(INTERVAL_NAME, interval);
    this.logger.log(`Scheduled database backup every ${hours} hour(s)`);
  }
}

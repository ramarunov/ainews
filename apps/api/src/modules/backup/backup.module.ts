import { Module } from '@nestjs/common';

import { BackupService } from './backup.service';
import { BackupSchedulerService } from './backup-scheduler.service';
import { BackupController } from './backup.controller';

@Module({
  controllers: [BackupController],
  providers: [BackupService, BackupSchedulerService],
})
export class BackupModule {}

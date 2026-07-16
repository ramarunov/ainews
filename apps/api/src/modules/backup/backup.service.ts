import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  BackupFileInfo,
  createDatabaseBackup,
  listBackupFiles,
  pruneOldBackups,
} from './pg-dump.util';

@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);

  constructor(private readonly config: ConfigService) {}

  private get backupDir(): string {
    return this.config.get<string>('BACKUP_DIR', './backups');
  }

  private get retentionDays(): number {
    return this.config.get<number>('BACKUP_RETENTION_DAYS', 30);
  }

  async runBackup(): Promise<{ filename: string; sizeBytes: number; removed: string[] }> {
    const connectionUrl = this.config.get<string>('DIRECT_DATABASE_URL');
    if (!connectionUrl) {
      throw new Error('DIRECT_DATABASE_URL is not configured — cannot take a superuser-level backup');
    }

    const { filename, sizeBytes } = await createDatabaseBackup({
      connectionUrl,
      backupDir: this.backupDir,
    });
    this.logger.log(`Backup created: ${filename} (${(sizeBytes / 1024 / 1024).toFixed(2)} MB)`);

    const removed = await pruneOldBackups(this.backupDir, this.retentionDays);
    if (removed.length > 0) {
      this.logger.log(`Pruned ${removed.length} backup(s) older than ${this.retentionDays} day(s)`);
    }

    return { filename, sizeBytes, removed };
  }

  listBackups(): Promise<BackupFileInfo[]> {
    return listBackupFiles(this.backupDir);
  }
}

import 'dotenv/config';
import { createDatabaseBackup, pruneOldBackups } from '../src/modules/backup/pg-dump.util';

const backupDir = process.env.BACKUP_DIR || './backups';
const retentionDays = Number(process.env.BACKUP_RETENTION_DAYS || 30);

(async () => {
  const connectionUrl = process.env.DIRECT_DATABASE_URL;
  if (!connectionUrl) {
    console.error('DIRECT_DATABASE_URL is not set — cannot back up.');
    process.exit(1);
  }

  const { filename, sizeBytes } = await createDatabaseBackup({ connectionUrl, backupDir });
  console.log(`Backup created: ${filename} (${(sizeBytes / 1024 / 1024).toFixed(2)} MB)`);

  const removed = await pruneOldBackups(backupDir, retentionDays);
  if (removed.length > 0) {
    console.log(`Pruned ${removed.length} backup(s) older than ${retentionDays} day(s): ${removed.join(', ')}`);
  }
})().catch((err) => {
  console.error('Backup failed:', err);
  process.exit(1);
});

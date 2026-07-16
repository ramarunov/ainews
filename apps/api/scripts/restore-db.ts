import 'dotenv/config';
import { join, isAbsolute } from 'path';
import { restoreDatabaseBackup } from '../src/modules/backup/pg-dump.util';

const backupDir = process.env.BACKUP_DIR || './backups';
const arg = process.argv[2];

(async () => {
  if (!arg) {
    console.error('Usage: pnpm db:restore <backup-filename-or-path>');
    console.error(`Looks up bare filenames inside ${backupDir}`);
    process.exit(1);
  }

  const connectionUrl = process.env.DIRECT_DATABASE_URL;
  if (!connectionUrl) {
    console.error('DIRECT_DATABASE_URL is not set — cannot restore.');
    process.exit(1);
  }

  const backupFilePath = isAbsolute(arg) ? arg : join(backupDir, arg);
  console.log(`Restoring ${backupFilePath} into the database at DIRECT_DATABASE_URL...`);
  console.log('This overwrites existing data. Make sure the app is stopped before continuing.');

  await restoreDatabaseBackup({ connectionUrl, backupFilePath });
  console.log('Restore complete.');
})().catch((err) => {
  console.error('Restore failed:', err);
  process.exit(1);
});

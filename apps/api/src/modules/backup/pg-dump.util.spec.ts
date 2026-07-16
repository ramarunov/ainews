import { mkdtemp, writeFile, utimes, readdir } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import { parseDbUrl, listBackupFiles, pruneOldBackups } from './pg-dump.util';

describe('parseDbUrl', () => {
  it('extracts host/port/database/user/password, decoding percent-encoded credentials', () => {
    const conn = parseDbUrl('postgresql://ainews:str%40ngpass@localhost:5433/ainews_db');

    expect(conn).toEqual({
      host: 'localhost',
      port: '5433',
      database: 'ainews_db',
      user: 'ainews',
      password: 'str@ngpass',
    });
  });

  it('defaults to port 5432 when the URL omits it', () => {
    const conn = parseDbUrl('postgresql://ainews:pw@localhost/ainews_db');
    expect(conn.port).toBe('5432');
  });
});

describe('listBackupFiles / pruneOldBackups', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'backup-test-'));
  });

  async function makeBackup(name: string, ageDays: number) {
    const filePath = join(dir, name);
    await writeFile(filePath, 'fake-dump-content');
    const time = new Date(Date.now() - ageDays * 24 * 60 * 60 * 1000);
    await utimes(filePath, time, time);
  }

  it('only lists files matching the backup_*.sql.gz naming convention', async () => {
    await makeBackup('backup_2026-01-01.sql.gz', 1);
    await writeFile(join(dir, 'not-a-backup.txt'), 'irrelevant');

    const files = await listBackupFiles(dir);

    expect(files).toHaveLength(1);
    expect(files[0].filename).toBe('backup_2026-01-01.sql.gz');
  });

  it('sorts newest first', async () => {
    await makeBackup('backup_old.sql.gz', 10);
    await makeBackup('backup_new.sql.gz', 1);

    const files = await listBackupFiles(dir);

    expect(files.map((f) => f.filename)).toEqual(['backup_new.sql.gz', 'backup_old.sql.gz']);
  });

  it('removes only backups older than the retention window', async () => {
    await makeBackup('backup_recent.sql.gz', 5);
    await makeBackup('backup_ancient.sql.gz', 40);

    const removed = await pruneOldBackups(dir, 30);

    expect(removed).toEqual(['backup_ancient.sql.gz']);
    const remaining = await readdir(dir);
    expect(remaining).toEqual(['backup_recent.sql.gz']);
  });
});

import { mkdtemp, writeFile, utimes, readdir, mkdir, stat } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';

const actualFsPromises = jest.requireActual('fs/promises');

jest.mock('child_process');
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  createWriteStream: jest.fn(),
  createReadStream: jest.fn(),
}));
jest.mock('zlib', () => ({
  ...jest.requireActual('zlib'),
  createGzip: jest.fn(),
  createGunzip: jest.fn(),
}));
// mkdir/stat are real by default (delegated below) so the pre-existing
// listBackupFiles/pruneOldBackups tests keep working against real temp
// files - createDatabaseBackup's own tests below swap in fakes just for
// their own beforeEach, since they don't touch the real filesystem at all.
jest.mock('fs/promises', () => ({
  ...jest.requireActual('fs/promises'),
  mkdir: jest.fn(),
  stat: jest.fn(),
}));

import { spawn } from 'child_process';
import { createWriteStream, createReadStream } from 'fs';
import { createGzip, createGunzip } from 'zlib';
import {
  parseDbUrl,
  listBackupFiles,
  pruneOldBackups,
  createDatabaseBackup,
  restoreDatabaseBackup,
} from './pg-dump.util';

function fakeChildProcess() {
  const child: any = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.stdin = new PassThrough();
  return child;
}

// hasLocalPgDump() probes with `where`/`which` before the real command -
// route that probe to an immediately-successful fake so every test's real
// spawnPgDump/spawnPsql call gets the controllable fake instead.
function mockSpawnRoutingProbeToSuccess(realChild: any) {
  (spawn as unknown as jest.Mock).mockImplementation((cmd: string) => {
    if (cmd === 'where' || cmd === 'which') {
      const probe = fakeChildProcess();
      setImmediate(() => probe.emit('close', 0));
      return probe;
    }
    return realChild;
  });
}

// Several real async hops happen before createDatabaseBackup/
// restoreDatabaseBackup reach the point of registering stream listeners
// (the hasLocalPgDump() probe's own setImmediate, then its Promise
// resolving, then mkdir/parseDbUrl) - a short real delay is a more
// reliable way to let all of that settle than chaining a fixed number of
// setImmediate/microtask ticks.
function flush() {
  return new Promise((r) => setTimeout(r, 20));
}

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
    (mkdir as jest.Mock).mockImplementation(actualFsPromises.mkdir);
    (stat as jest.Mock).mockImplementation(actualFsPromises.stat);
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

describe('createDatabaseBackup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (mkdir as jest.Mock).mockResolvedValue(undefined);
    (stat as jest.Mock).mockResolvedValue({ size: 123 });
  });

  it('rejects on a failed pg_dump even when the output stream finishes first (the exact race this bug hit)', async () => {
    const dump = fakeChildProcess();
    mockSpawnRoutingProbeToSuccess(dump);
    (createGzip as jest.Mock).mockReturnValue(new PassThrough());
    const out = new PassThrough();
    (createWriteStream as jest.Mock).mockReturnValue(out);

    const promise = createDatabaseBackup({
      connectionUrl: 'postgresql://u:p@h:5432/db',
      backupDir: '/tmp/whatever',
    });
    promise.catch(() => {}); // asserted below; silences the unhandled-rejection warning for the gap before that

    await flush();
    // Simulate pg_dump dying partway: the output stream reports 'finish'
    // before the process itself reports the nonzero exit code - the exact
    // ordering that used to make this resolve() successfully.
    out.emit('finish');
    await flush();
    dump.emit('close', 1);

    await expect(promise).rejects.toThrow('pg_dump exited with code 1');
  });

  it('resolves once both the exit code is 0 and the output stream has finished', async () => {
    const dump = fakeChildProcess();
    mockSpawnRoutingProbeToSuccess(dump);
    (createGzip as jest.Mock).mockReturnValue(new PassThrough());
    const out = new PassThrough();
    (createWriteStream as jest.Mock).mockReturnValue(out);

    const promise = createDatabaseBackup({
      connectionUrl: 'postgresql://u:p@h:5432/db',
      backupDir: '/tmp/whatever',
    });

    await flush();
    out.emit('finish');
    await flush();
    dump.emit('close', 0);

    await expect(promise).resolves.toEqual({ filename: expect.any(String), sizeBytes: 123 });
  });
});

describe('restoreDatabaseBackup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects instead of hanging forever when the backup file stream errors', async () => {
    const psql = fakeChildProcess();
    mockSpawnRoutingProbeToSuccess(psql);
    const input = new PassThrough();
    (createReadStream as jest.Mock).mockReturnValue(input);
    (createGunzip as jest.Mock).mockReturnValue(new PassThrough());

    const promise = restoreDatabaseBackup({
      connectionUrl: 'postgresql://u:p@h:5432/db',
      backupFilePath: '/tmp/missing.sql.gz',
    });
    promise.catch(() => {});

    await flush();
    input.emit('error', new Error('ENOENT: no such file'));

    await expect(promise).rejects.toThrow('ENOENT: no such file');
  });
});

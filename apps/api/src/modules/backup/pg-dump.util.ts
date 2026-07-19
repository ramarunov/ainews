import { spawn } from 'child_process';
import { createWriteStream, createReadStream } from 'fs';
import { mkdir, readdir, stat, unlink } from 'fs/promises';
import { join } from 'path';
import { createGzip, createGunzip } from 'zlib';

export interface DbConnectionInfo {
  host: string;
  port: string;
  database: string;
  user: string;
  password: string;
}

/**
 * pg_dump must run as the superuser (DIRECT_DATABASE_URL), never the RLS-scoped
 * app role — dumping through a role subject to row-level security would silently
 * produce a backup missing every row outside whatever org context happened to be
 * active, which defeats the point of a disaster-recovery backup.
 */
export function parseDbUrl(url: string): DbConnectionInfo {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parsed.port || '5432',
    database: parsed.pathname.replace(/^\//, ''),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
  };
}

function findContainerFallback(): string {
  return process.env.BACKUP_DOCKER_CONTAINER || 'ainews_postgres';
}

/** Runs pg_dump directly if the client is on PATH, otherwise falls back to `docker exec` against the local compose Postgres container (dev convenience only). */
function spawnPgDump(conn: DbConnectionInfo, useDocker: boolean) {
  const args = ['-h', conn.host, '-p', conn.port, '-U', conn.user, '-Fp', '--no-owner', '--no-privileges', conn.database];

  if (useDocker) {
    const container = findContainerFallback();
    return spawn('docker', [
      'exec',
      '-e',
      `PGPASSWORD=${conn.password}`,
      container,
      'pg_dump',
      '-h',
      'localhost',
      '-U',
      conn.user,
      '-Fp',
      '--no-owner',
      '--no-privileges',
      conn.database,
    ]);
  }

  return spawn('pg_dump', args, { env: { ...process.env, PGPASSWORD: conn.password } });
}

function spawnPsql(conn: DbConnectionInfo, useDocker: boolean) {
  if (useDocker) {
    const container = findContainerFallback();
    return spawn('docker', ['exec', '-i', '-e', `PGPASSWORD=${conn.password}`, container, 'psql', '-h', 'localhost', '-U', conn.user, conn.database]);
  }
  return spawn('psql', ['-h', conn.host, '-p', conn.port, '-U', conn.user, conn.database], {
    env: { ...process.env, PGPASSWORD: conn.password },
  });
}

async function hasLocalPgDump(): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = spawn(process.platform === 'win32' ? 'where' : 'which', ['pg_dump']);
    probe.on('error', () => resolve(false));
    probe.on('close', (code) => resolve(code === 0));
  });
}

export async function createDatabaseBackup(opts: {
  connectionUrl: string;
  backupDir: string;
}): Promise<{ filename: string; sizeBytes: number }> {
  await mkdir(opts.backupDir, { recursive: true });
  const conn = parseDbUrl(opts.connectionUrl);
  const useDocker = !(await hasLocalPgDump());

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `backup_${timestamp}.sql.gz`;
  const filePath = join(opts.backupDir, filename);

  await new Promise<void>((resolve, reject) => {
    const dump = spawnPgDump(conn, useDocker);
    const gzip = createGzip();
    const out = createWriteStream(filePath);

    // Node gives no ordering guarantee between a child process's 'close'
    // event and 'finish' on a stream downstream of a piped transform - if
    // pg_dump fails partway (dropped connection, a table read error), its
    // stdout still closes, which can flush `out` to 'finish' *before* the
    // 'close' handler below has reported the nonzero exit code. Resolving
    // on whichever fires first meant a failed dump could resolve() before
    // the reject() ever ran, reporting success on a truncated backup - and
    // pruneOldBackups() would then delete good backups on schedule,
    // trusting the corrupt one. Only resolve once BOTH the exit code is
    // known-zero and the file is known-flushed; any failure signal wins
    // regardless of arrival order and is never overridden by a later one.
    let stderr = '';
    let settled = false;
    let dumpExitedZero = false;
    let outFinished = false;

    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      reject(err);
    };
    const maybeResolve = () => {
      if (settled || !dumpExitedZero || !outFinished) return;
      settled = true;
      resolve();
    };

    dump.stderr.on('data', (chunk) => (stderr += chunk.toString()));
    dump.on('error', fail);

    dump.stdout.pipe(gzip).pipe(out);

    gzip.on('error', fail);
    out.on('error', fail);
    dump.on('close', (code) => {
      if (code !== 0) {
        fail(new Error(`pg_dump exited with code ${code}: ${stderr}`));
        return;
      }
      dumpExitedZero = true;
      maybeResolve();
    });
    out.on('finish', () => {
      outFinished = true;
      maybeResolve();
    });
  });

  const { size } = await stat(filePath);
  return { filename, sizeBytes: size };
}

export async function restoreDatabaseBackup(opts: { connectionUrl: string; backupFilePath: string }): Promise<void> {
  const conn = parseDbUrl(opts.connectionUrl);
  const useDocker = !(await hasLocalPgDump());

  await new Promise<void>((resolve, reject) => {
    const psql = spawnPsql(conn, useDocker);
    const gunzip = createGunzip();
    const input = createReadStream(opts.backupFilePath);

    let stderr = '';
    let settled = false;
    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      reject(err);
    };

    psql.stderr?.on('data', (chunk) => (stderr += chunk.toString()));
    psql.on('error', fail);
    // A missing/corrupt backup file errors here, breaking the pipe to
    // psql's stdin - without these handlers psql just sits waiting on
    // stdin forever, and the promise never settles either way.
    input.on('error', fail);
    gunzip.on('error', fail);

    input.pipe(gunzip).pipe(psql.stdin);

    psql.on('close', (code) => {
      if (settled) return;
      settled = true;
      if (code !== 0) reject(new Error(`psql restore exited with code ${code}: ${stderr}`));
      else resolve();
    });
  });
}

export interface BackupFileInfo {
  filename: string;
  sizeBytes: number;
  createdAt: Date;
}

export async function listBackupFiles(backupDir: string): Promise<BackupFileInfo[]> {
  await mkdir(backupDir, { recursive: true });
  const entries = await readdir(backupDir);
  const files = await Promise.all(
    entries
      .filter((name) => name.startsWith('backup_') && name.endsWith('.sql.gz'))
      .map(async (name) => {
        const s = await stat(join(backupDir, name));
        return { filename: name, sizeBytes: s.size, createdAt: s.mtime };
      }),
  );
  return files.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function pruneOldBackups(backupDir: string, retentionDays: number): Promise<string[]> {
  const files = await listBackupFiles(backupDir);
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const removed: string[] = [];
  for (const file of files) {
    if (file.createdAt.getTime() < cutoff) {
      await unlink(join(backupDir, file.filename));
      removed.push(file.filename);
    }
  }
  return removed;
}

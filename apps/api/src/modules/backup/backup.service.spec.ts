import { BackupService } from './backup.service';
import * as pgDumpUtil from './pg-dump.util';

jest.mock('./pg-dump.util');

describe('BackupService', () => {
  let service: BackupService;
  let config: any;

  beforeEach(() => {
    jest.clearAllMocks();
    config = {
      get: jest.fn((key: string, fallback?: unknown) => {
        if (key === 'DIRECT_DATABASE_URL') return 'postgresql://ainews:pw@localhost:5433/ainews_db';
        if (key === 'BACKUP_DIR') return './backups';
        if (key === 'BACKUP_RETENTION_DAYS') return 30;
        return fallback;
      }),
    };
    service = new BackupService(config);
  });

  describe('runBackup', () => {
    it('throws without ever shelling out if DIRECT_DATABASE_URL is not configured', async () => {
      config.get.mockImplementation((key: string, fallback?: unknown) =>
        key === 'DIRECT_DATABASE_URL' ? undefined : fallback,
      );

      await expect(service.runBackup()).rejects.toThrow(/DIRECT_DATABASE_URL/);
      expect(pgDumpUtil.createDatabaseBackup).not.toHaveBeenCalled();
    });

    it('creates a backup then prunes using the configured retention window', async () => {
      (pgDumpUtil.createDatabaseBackup as jest.Mock).mockResolvedValue({
        filename: 'backup_x.sql.gz',
        sizeBytes: 1024,
      });
      (pgDumpUtil.pruneOldBackups as jest.Mock).mockResolvedValue(['backup_old.sql.gz']);

      const result = await service.runBackup();

      expect(pgDumpUtil.createDatabaseBackup).toHaveBeenCalledWith({
        connectionUrl: 'postgresql://ainews:pw@localhost:5433/ainews_db',
        backupDir: './backups',
      });
      expect(pgDumpUtil.pruneOldBackups).toHaveBeenCalledWith('./backups', 30);
      expect(result).toEqual({
        filename: 'backup_x.sql.gz',
        sizeBytes: 1024,
        removed: ['backup_old.sql.gz'],
      });
    });
  });

  describe('listBackups', () => {
    it('delegates to listBackupFiles with the configured directory', async () => {
      (pgDumpUtil.listBackupFiles as jest.Mock).mockResolvedValue([]);

      await service.listBackups();

      expect(pgDumpUtil.listBackupFiles).toHaveBeenCalledWith('./backups');
    });
  });
});

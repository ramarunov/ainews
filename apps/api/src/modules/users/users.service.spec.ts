import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: any;
  let eventEmitter: any;

  beforeEach(() => {
    prisma = {
      user: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      article: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      mediaFile: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      auditLog: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      refreshToken: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    eventEmitter = { emit: jest.fn() };
    service = new UsersService(prisma, eventEmitter);
  });

  describe('exportOwnData', () => {
    it('throws NotFoundException for a missing or already-deleted user', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(service.exportOwnData('missing')).rejects.toThrow(NotFoundException);
    });

    it('assembles profile, articles, media, and recent activity into one export', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'user-1', email: 'jane@example.com' });
      prisma.article.findMany.mockResolvedValue([{ id: 'a1', title: 'My Article' }]);
      prisma.mediaFile.findMany.mockResolvedValue([{ id: 'm1', filename: 'photo.png' }]);
      prisma.auditLog.findMany.mockResolvedValue([{ id: 'log-1', action: 'articles:write' }]);

      const result = await service.exportOwnData('user-1');

      expect(prisma.article.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { primaryAuthorId: 'user-1' } }),
      );
      expect(prisma.mediaFile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { uploadedBy: 'user-1', deletedAt: null } }),
      );
      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-1' } }),
      );
      expect(result).toEqual(
        expect.objectContaining({
          profile: expect.objectContaining({ id: 'user-1' }),
          articles: [{ id: 'a1', title: 'My Article' }],
          mediaFiles: [{ id: 'm1', filename: 'photo.png' }],
          recentActivity: [{ id: 'log-1', action: 'articles:write' }],
          exportedAt: expect.any(String),
        }),
      );
    });
  });

  describe('eraseOwnAccount', () => {
    it('throws NotFoundException for a missing user', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(service.eraseOwnAccount('missing', 'whatever')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('requires a password when the account has one and none is provided', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: 'user-1',
        organizationId: 'org-1',
        passwordHash: 'some-hash',
      });

      await expect(service.eraseOwnAccount('user-1')).rejects.toThrow(BadRequestException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('rejects an incorrect password without modifying the account', async () => {
      const passwordHash = await bcrypt.hash('correct-password', 4);
      prisma.user.findFirst.mockResolvedValue({
        id: 'user-1',
        organizationId: 'org-1',
        passwordHash,
      });

      await expect(
        service.eraseOwnAccount('user-1', 'wrong-password'),
      ).rejects.toThrow(UnauthorizedException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('skips the password check entirely for an OAuth-only account (no passwordHash)', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: 'user-1',
        organizationId: 'org-1',
        passwordHash: null,
      });
      prisma.user.update.mockResolvedValue({});

      await expect(service.eraseOwnAccount('user-1')).resolves.toEqual(
        expect.objectContaining({ success: true }),
      );
    });

    it('pseudonymizes every PII field and revokes all refresh tokens on success', async () => {
      const passwordHash = await bcrypt.hash('correct-password', 4);
      prisma.user.findFirst.mockResolvedValue({
        id: 'user-1',
        organizationId: 'org-1',
        passwordHash,
      });
      prisma.user.update.mockResolvedValue({});

      await service.eraseOwnAccount('user-1', 'correct-password');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: expect.objectContaining({
          email: 'deleted-user-1@deleted.local',
          firstName: 'Deleted',
          lastName: 'User',
          displayName: 'Deleted User',
          avatarUrl: null,
          bio: null,
          passwordHash: null,
          mfaEnabled: false,
          mfaSecret: null,
          mfaBackupCodes: [],
          isActive: false,
          deletedAt: expect.any(Date),
        }),
      });
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', revokedAt: null },
        data: { revokedAt: expect.any(Date), revokeReason: 'account_erased' },
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'user.erased',
        expect.objectContaining({ userId: 'user-1', organizationId: 'org-1' }),
      );
    });
  });
});

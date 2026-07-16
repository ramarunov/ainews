import { NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { ApiKeysService } from './api-keys.service';

describe('ApiKeysService', () => {
  let service: ApiKeysService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      apiKey: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    service = new ApiKeysService(prisma);
  });

  describe('create', () => {
    it('returns the plaintext key exactly once, and stores only its hash', async () => {
      prisma.apiKey.create.mockImplementation((args: any) => {
        // Mirrors the real `select: LIST_SELECT` clause - keyHash is never
        // part of what Prisma would actually return here.
        const rest = { ...args.data };
        delete rest.keyHash;
        return Promise.resolve({ id: 'key-1', ...rest });
      });

      const result = await service.create({ name: 'CI key' }, 'user-1', 'org-1');

      expect(result.key).toMatch(/^ak_[0-9a-f]{64}$/);
      const createArgs = prisma.apiKey.create.mock.calls[0][0];
      expect(createArgs.data.keyHash).toBe(
        createHash('sha256').update(result.key).digest('hex'),
      );
      expect(createArgs.data.keyPrefix).toBe(result.key.slice(0, 12));
      // The response given back to the caller must never include keyHash.
      expect(result).not.toHaveProperty('keyHash');
    });

    it('defaults permissions to an empty array and rateLimit to 1000', async () => {
      prisma.apiKey.create.mockResolvedValue({ id: 'key-1' });

      await service.create({ name: 'Default key' }, 'user-1', 'org-1');

      const createArgs = prisma.apiKey.create.mock.calls[0][0];
      expect(createArgs.data.permissions).toEqual([]);
      expect(createArgs.data.rateLimit).toBe(1000);
    });
  });

  describe('findAll', () => {
    it('scopes by organizationId and excludes soft-deleted keys', async () => {
      prisma.apiKey.findMany.mockResolvedValue([]);

      await service.findAll('org-1');

      expect(prisma.apiKey.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: 'org-1', deletedAt: null } }),
      );
    });
  });

  describe('revoke', () => {
    it('throws if the key does not belong to this organization', async () => {
      prisma.apiKey.findFirst.mockResolvedValue(null);

      await expect(service.revoke('key-1', 'org-1')).rejects.toThrow(NotFoundException);
      expect(prisma.apiKey.update).not.toHaveBeenCalled();
    });

    it('sets isActive false and stamps deletedAt', async () => {
      prisma.apiKey.findFirst.mockResolvedValue({ id: 'key-1' });

      await service.revoke('key-1', 'org-1');

      expect(prisma.apiKey.update).toHaveBeenCalledWith({
        where: { id: 'key-1' },
        data: { isActive: false, deletedAt: expect.any(Date) },
      });
    });
  });

  describe('validateKey', () => {
    it('rejects a key without the ak_ prefix without ever querying the DB', async () => {
      const result = await service.validateKey('not-a-real-key');

      expect(result).toBeNull();
      expect(prisma.apiKey.findUnique).not.toHaveBeenCalled();
    });

    it('rejects an unknown key hash', async () => {
      prisma.apiKey.findUnique.mockResolvedValue(null);

      await expect(service.validateKey('ak_bogus')).resolves.toBeNull();
    });

    it('rejects a revoked (isActive: false) key', async () => {
      prisma.apiKey.findUnique.mockResolvedValue({ id: 'key-1', isActive: false, deletedAt: null });

      await expect(service.validateKey('ak_revoked')).resolves.toBeNull();
    });

    it('rejects an expired key', async () => {
      prisma.apiKey.findUnique.mockResolvedValue({
        id: 'key-1',
        isActive: true,
        deletedAt: null,
        expiresAt: new Date('2020-01-01'),
      });

      await expect(service.validateKey('ak_expired')).resolves.toBeNull();
    });

    it('accepts a valid, active, unexpired key and stamps lastUsedAt', async () => {
      const key = {
        id: 'key-1',
        organizationId: 'org-1',
        userId: 'user-1',
        permissions: ['articles:read'],
        rateLimit: 1000,
        isActive: true,
        deletedAt: null,
        expiresAt: null,
      };
      prisma.apiKey.findUnique.mockResolvedValue(key);

      const result = await service.validateKey('ak_valid');

      expect(result).toEqual(key);
      expect(prisma.apiKey.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'key-1' }, data: { lastUsedAt: expect.any(Date) } }),
      );
    });
  });
});

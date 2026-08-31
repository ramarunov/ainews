import { ConflictException, NotFoundException } from '@nestjs/common';
import { validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { RedirectsService } from './redirects.service';
import { CreateRedirectDto, UpdateRedirectDto } from './dto/redirect.dto';

describe('redirect DTO toUrl validation (open-redirect guard)', () => {
  const check = (cls: any, toUrl: string) =>
    validateSync(plainToInstance(cls, { fromPath: '/x', toUrl }));

  it.each(['/new-slug', '/', '/a/b/c?x=1', '/x#frag'])('accepts root-relative %s', (v) => {
    expect(check(CreateRedirectDto, v)).toHaveLength(0);
  });

  it.each([
    'https://evil.example/phish',
    'http://evil.example',
    '//evil.example',
    '/\\evil.example',
    'javascript:alert(1)',
    'evil.example/x',
  ])('rejects non-root-relative %s', (v) => {
    expect(check(CreateRedirectDto, v).length).toBeGreaterThan(0);
    expect(check(UpdateRedirectDto, v).length).toBeGreaterThan(0);
  });
});

describe('RedirectsService', () => {
  let service: RedirectsService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      redirect: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      notFoundLog: {
        upsert: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };
    service = new RedirectsService(prisma);
  });

  describe('create', () => {
    it('rejects a duplicate fromPath in the same org', async () => {
      prisma.redirect.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(
        service.create({ fromPath: '/old', toUrl: '/new' } as any, 'org-1', 'user-1'),
      ).rejects.toThrow(ConflictException);
      expect(prisma.redirect.create).not.toHaveBeenCalled();
    });

    it('creates a redirect defaulting statusCode to 301', async () => {
      prisma.redirect.findUnique.mockResolvedValue(null);
      const created = { id: 'r-1', fromPath: '/old', toUrl: '/new', statusCode: 301 };
      prisma.redirect.create.mockResolvedValue(created);

      const result = await service.create(
        { fromPath: '/old', toUrl: '/new' } as any,
        'org-1',
        'user-1',
      );

      expect(prisma.redirect.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: 'org-1',
          fromPath: '/old',
          toUrl: '/new',
          statusCode: 301,
          createdBy: 'user-1',
        }),
      });
      expect(result).toBe(created);
    });
  });

  describe('update', () => {
    it('throws NotFoundException when the redirect does not belong to the org', async () => {
      prisma.redirect.findFirst.mockResolvedValue(null);

      await expect(
        service.update('r-1', { toUrl: '/new-2' } as any, 'org-1'),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.redirect.update).not.toHaveBeenCalled();
    });

    it('only patches the fields provided', async () => {
      prisma.redirect.findFirst.mockResolvedValue({ id: 'r-1' });
      prisma.redirect.update.mockResolvedValue({ id: 'r-1', isActive: false });

      await service.update('r-1', { isActive: false } as any, 'org-1');

      expect(prisma.redirect.update).toHaveBeenCalledWith({
        where: { id: 'r-1' },
        data: { isActive: false },
      });
    });
  });

  describe('remove', () => {
    it('throws NotFoundException instead of deleting a redirect from another org', async () => {
      prisma.redirect.findFirst.mockResolvedValue(null);

      await expect(service.remove('r-1', 'org-1')).rejects.toThrow(NotFoundException);
      expect(prisma.redirect.delete).not.toHaveBeenCalled();
    });

    it('deletes when found in the org', async () => {
      prisma.redirect.findFirst.mockResolvedValue({ id: 'r-1' });
      prisma.redirect.delete.mockResolvedValue({});

      const result = await service.remove('r-1', 'org-1');

      expect(prisma.redirect.delete).toHaveBeenCalledWith({ where: { id: 'r-1' } });
      expect(result).toEqual({ success: true, message: 'Redirect deleted' });
    });
  });

  describe('resolve', () => {
    it('increments hit stats and returns the target when an active redirect matches', async () => {
      const redirect = { id: 'r-1', toUrl: '/new', statusCode: 301 };
      prisma.redirect.findFirst.mockResolvedValue(redirect);
      prisma.redirect.update.mockResolvedValue(redirect);

      const result = await service.resolve('/old', 'org-1', 'https://google.com');

      expect(prisma.redirect.findFirst).toHaveBeenCalledWith({
        where: { organizationId: 'org-1', fromPath: '/old', isActive: true },
      });
      expect(prisma.redirect.update).toHaveBeenCalledWith({
        where: { id: 'r-1' },
        data: { hitCount: { increment: 1 }, lastHitAt: expect.any(Date) },
      });
      expect(prisma.notFoundLog.upsert).not.toHaveBeenCalled();
      expect(result).toEqual({ toUrl: '/new', statusCode: 301 });
    });

    it('records a NotFoundLog miss and returns null when nothing matches', async () => {
      prisma.redirect.findFirst.mockResolvedValue(null);
      prisma.notFoundLog.upsert.mockResolvedValue({});

      const result = await service.resolve('/missing', 'org-1', 'https://google.com');

      expect(prisma.notFoundLog.upsert).toHaveBeenCalledWith({
        where: { organizationId_path: { organizationId: 'org-1', path: '/missing' } },
        create: { organizationId: 'org-1', path: '/missing', referrer: 'https://google.com' },
        update: expect.objectContaining({
          hitCount: { increment: 1 },
          referrer: 'https://google.com',
        }),
      });
      expect(prisma.redirect.update).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it('returns null without recording a NotFoundLog for automated scanner probes', async () => {
      prisma.redirect.findFirst.mockResolvedValue(null);

      for (const path of ['/xmlrpc.php', '/wp-login.php', '/.env', '/2.php', '/wp-admin', '/.git/config']) {
        expect(await service.resolve(path, 'org-1', 'https://example.com')).toBeNull();
      }

      expect(prisma.notFoundLog.upsert).not.toHaveBeenCalled();
    });

    it('returns null without recording a NotFoundLog for spam-crawler canned URL lists', async () => {
      prisma.redirect.findFirst.mockResolvedValue(null);

      for (const path of [
        '/Coins___Paper_Money',
        '/Pottery___Glass',
        '/sports_mem__cards___fan_shop',
        '/hand_picked_lists',
        '/my-account-liberty_case',
        '/2025',
        '/2025/page/157',
      ]) {
        expect(await service.resolve(path, 'org-1', 'https://example.com')).toBeNull();
      }

      expect(prisma.notFoundLog.upsert).not.toHaveBeenCalled();
    });

    it('still records a NotFoundLog for a plausible content path', async () => {
      prisma.redirect.findFirst.mockResolvedValue(null);
      prisma.notFoundLog.upsert.mockResolvedValue({});

      await service.resolve('/berita-lama-yang-hilang', 'org-1');

      expect(prisma.notFoundLog.upsert).toHaveBeenCalledTimes(1);
    });

    it('still records a kebab-case miss even when it contains a 4-digit run mid-path', async () => {
      prisma.redirect.findFirst.mockResolvedValue(null);
      prisma.notFoundLog.upsert.mockResolvedValue({});

      // only a *leading* /YYYY segment is a date-archive crawl; a year inside a
      // real headline slug must still be logged
      await service.resolve('/hasil-liga-1-persib-vs-persija-2025', 'org-1');

      expect(prisma.notFoundLog.upsert).toHaveBeenCalledTimes(1);
    });
  });

  describe('dismissNotFoundLog', () => {
    it('throws NotFoundException when the log entry does not belong to the org', async () => {
      prisma.notFoundLog.findFirst.mockResolvedValue(null);

      await expect(service.dismissNotFoundLog('log-1', 'org-1')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.notFoundLog.update).not.toHaveBeenCalled();
    });

    it('marks the entry resolved when found', async () => {
      prisma.notFoundLog.findFirst.mockResolvedValue({ id: 'log-1' });
      prisma.notFoundLog.update.mockResolvedValue({ id: 'log-1', resolved: true });

      const result = await service.dismissNotFoundLog('log-1', 'org-1');

      expect(prisma.notFoundLog.update).toHaveBeenCalledWith({
        where: { id: 'log-1' },
        data: { resolved: true },
      });
      expect(result).toEqual({ id: 'log-1', resolved: true });
    });
  });
});

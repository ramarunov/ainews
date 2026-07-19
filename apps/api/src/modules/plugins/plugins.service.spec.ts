import { ConflictException, NotFoundException } from '@nestjs/common';
import { PluginsService } from './plugins.service';

describe('PluginsService', () => {
  let service: PluginsService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      plugin: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    service = new PluginsService(prisma);
  });

  describe('install', () => {
    it('installs a plugin as inactive by default', async () => {
      prisma.plugin.findUnique.mockResolvedValue(null);
      prisma.plugin.create.mockResolvedValue({ id: 'p1' });

      await service.install({ name: 'SEO Booster', slug: 'seo-booster', version: '1.0.0' } as any, 'org-1');

      expect(prisma.plugin.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ isActive: false }) }),
      );
    });

    it('rejects with a clean 409 instead of a raw DB error when the slug is already installed for this org', async () => {
      prisma.plugin.findUnique.mockResolvedValue({ id: 'p1', slug: 'seo-booster' });

      await expect(
        service.install({ name: 'SEO Booster', slug: 'seo-booster', version: '1.0.0' } as any, 'org-1'),
      ).rejects.toThrow(ConflictException);
      expect(prisma.plugin.create).not.toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException when the plugin does not belong to this org', async () => {
      prisma.plugin.findFirst.mockResolvedValue(null);

      await expect(service.findOne('p1', 'org-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('activate / deactivate', () => {
    it('activate() flips isActive to true', async () => {
      prisma.plugin.findFirst.mockResolvedValue({ id: 'p1' });
      prisma.plugin.update.mockResolvedValue({});

      await service.activate('p1', 'org-1');

      expect(prisma.plugin.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { isActive: true },
      });
    });

    it('deactivate() flips isActive to false', async () => {
      prisma.plugin.findFirst.mockResolvedValue({ id: 'p1' });
      prisma.plugin.update.mockResolvedValue({});

      await service.deactivate('p1', 'org-1');

      expect(prisma.plugin.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { isActive: false },
      });
    });

    it('throws NotFoundException instead of activating a plugin from another org', async () => {
      prisma.plugin.findFirst.mockResolvedValue(null);

      await expect(service.activate('p1', 'org-1')).rejects.toThrow(NotFoundException);
      expect(prisma.plugin.update).not.toHaveBeenCalled();
    });
  });

  describe('uninstall', () => {
    it('throws NotFoundException instead of deleting a plugin from another org', async () => {
      prisma.plugin.findFirst.mockResolvedValue(null);

      await expect(service.uninstall('p1', 'org-1')).rejects.toThrow(NotFoundException);
      expect(prisma.plugin.delete).not.toHaveBeenCalled();
    });

    it('deletes the plugin when found', async () => {
      prisma.plugin.findFirst.mockResolvedValue({ id: 'p1' });
      prisma.plugin.delete.mockResolvedValue({});

      const result = await service.uninstall('p1', 'org-1');

      expect(prisma.plugin.delete).toHaveBeenCalledWith({ where: { id: 'p1' } });
      expect(result).toEqual({ success: true, message: 'Plugin uninstalled' });
    });
  });
});

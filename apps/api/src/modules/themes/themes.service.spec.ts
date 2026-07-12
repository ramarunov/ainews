import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ThemesService } from './themes.service';

describe('ThemesService', () => {
  let service: ThemesService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      theme: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
      },
      $transaction: jest.fn(async (cb: any) => cb(prisma)),
    };
    service = new ThemesService(prisma);
  });

  describe('activate', () => {
    it('throws NotFoundException for a theme outside this org', async () => {
      prisma.theme.findFirst.mockResolvedValue(null);

      await expect(service.activate('theme-1', 'org-1')).rejects.toThrow(NotFoundException);
    });

    it('deactivates every other theme before activating the requested one, in a single transaction', async () => {
      prisma.theme.findFirst.mockResolvedValue({ id: 'theme-1' });
      prisma.theme.updateMany.mockResolvedValue({ count: 2 });
      prisma.theme.update.mockResolvedValue({ id: 'theme-1', isActive: true });

      const result = await service.activate('theme-1', 'org-1');

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.theme.updateMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-1', id: { not: 'theme-1' } },
        data: { isActive: false },
      });
      expect(prisma.theme.update).toHaveBeenCalledWith({
        where: { id: 'theme-1' },
        data: { isActive: true },
      });
      expect(result).toEqual({ id: 'theme-1', isActive: true });
    });
  });

  describe('uninstall', () => {
    it('refuses to uninstall the currently active theme', async () => {
      prisma.theme.findFirst.mockResolvedValue({ id: 'theme-1', isActive: true });

      await expect(service.uninstall('theme-1', 'org-1')).rejects.toThrow(BadRequestException);
      expect(prisma.theme.delete).not.toHaveBeenCalled();
    });

    it('deletes an inactive theme', async () => {
      prisma.theme.findFirst.mockResolvedValue({ id: 'theme-1', isActive: false });
      prisma.theme.delete.mockResolvedValue({});

      const result = await service.uninstall('theme-1', 'org-1');

      expect(prisma.theme.delete).toHaveBeenCalledWith({ where: { id: 'theme-1' } });
      expect(result).toEqual({ success: true, message: 'Theme uninstalled' });
    });

    it('throws NotFoundException before even checking isActive when the theme does not exist', async () => {
      prisma.theme.findFirst.mockResolvedValue(null);

      await expect(service.uninstall('missing', 'org-1')).rejects.toThrow(NotFoundException);
    });
  });
});

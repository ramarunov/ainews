import { SettingsService } from './settings.service';

describe('SettingsService', () => {
  let service: SettingsService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      setting: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
        findMany: jest.fn(),
        delete: jest.fn(),
      },
    };
    service = new SettingsService(prisma);
  });

  describe('get', () => {
    it('returns null when the setting does not exist, rather than throwing', async () => {
      prisma.setting.findUnique.mockResolvedValue(null);

      await expect(service.get('org-1', 'theme.color')).resolves.toBeNull();
    });

    it('returns the stored value when the setting exists', async () => {
      prisma.setting.findUnique.mockResolvedValue({ value: { hex: '#ff0000' } });

      await expect(service.get('org-1', 'theme.color')).resolves.toEqual({ hex: '#ff0000' });
    });
  });

  describe('set', () => {
    it('upserts using the composite organizationId_key key', async () => {
      prisma.setting.upsert.mockResolvedValue({});

      await service.set('org-1', 'theme.color', { hex: '#000' }, 'user-1', true);

      expect(prisma.setting.upsert).toHaveBeenCalledWith({
        where: { organizationId_key: { organizationId: 'org-1', key: 'theme.color' } },
        create: expect.objectContaining({
          organizationId: 'org-1',
          key: 'theme.color',
          value: { hex: '#000' },
          isPublic: true,
          updatedBy: 'user-1',
        }),
        update: expect.objectContaining({
          value: { hex: '#000' },
          isPublic: true,
          updatedBy: 'user-1',
        }),
      });
    });
  });

  describe('list', () => {
    it('filters to public-only settings when requested', async () => {
      prisma.setting.findMany.mockResolvedValue([]);

      await service.list('org-1', true);

      expect(prisma.setting.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: 'org-1', isPublic: true },
        }),
      );
    });

    it('returns all settings when publicOnly is not set', async () => {
      prisma.setting.findMany.mockResolvedValue([]);

      await service.list('org-1');

      expect(prisma.setting.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: 'org-1' } }),
      );
    });
  });

  describe('remove', () => {
    it('deletes by the composite key and confirms success', async () => {
      prisma.setting.delete.mockResolvedValue({});

      const result = await service.remove('org-1', 'theme.color');

      expect(prisma.setting.delete).toHaveBeenCalledWith({
        where: { organizationId_key: { organizationId: 'org-1', key: 'theme.color' } },
      });
      expect(result).toEqual({ success: true, message: 'Setting removed' });
    });
  });
});

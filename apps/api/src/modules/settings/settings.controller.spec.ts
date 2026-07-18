import { ForbiddenException } from '@nestjs/common';

import { SettingsController } from './settings.controller';

describe('SettingsController', () => {
  let controller: SettingsController;
  let settingsService: any;

  beforeEach(() => {
    settingsService = {
      set: jest.fn().mockResolvedValue({}),
      remove: jest.fn().mockResolvedValue({ success: true }),
    };
    controller = new SettingsController(settingsService);
  });

  describe('site.* keys (superadmin-only Site Settings namespace)', () => {
    it('rejects a non-superadmin write to a site.* key, even with settings:write', () => {
      const user = { organizationId: 'org-1', id: 'user-1', isSuperadmin: false };

      expect(() =>
        controller.set('site.custom_scripts', { value: {} } as any, user),
      ).toThrow(ForbiddenException);
      expect(settingsService.set).not.toHaveBeenCalled();
    });

    it('rejects a non-superadmin delete of a site.* key', () => {
      const user = { organizationId: 'org-1', id: 'user-1', isSuperadmin: false };

      expect(() => controller.remove('site.footer', user)).toThrow(ForbiddenException);
      expect(settingsService.remove).not.toHaveBeenCalled();
    });

    it('allows a superadmin to write a site.* key through this endpoint too', async () => {
      const user = { organizationId: 'org-1', id: 'user-1', isSuperadmin: true };

      await controller.set('site.footer', { value: { links: [] } } as any, user);

      expect(settingsService.set).toHaveBeenCalledWith(
        'org-1',
        'site.footer',
        { links: [] },
        'user-1',
        false,
      );
    });
  });

  describe('non-site keys', () => {
    it('is unaffected by the superadmin check for ordinary keys', async () => {
      const user = { organizationId: 'org-1', id: 'user-1', isSuperadmin: false };

      await controller.set('ads.header', { value: { enabled: true } } as any, user);

      expect(settingsService.set).toHaveBeenCalledWith(
        'org-1',
        'ads.header',
        { enabled: true },
        'user-1',
        false,
      );
    });
  });
});

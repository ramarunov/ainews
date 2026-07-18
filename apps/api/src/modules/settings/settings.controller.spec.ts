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

  describe('ads.* keys (superadmin-only Ad Widgets namespace)', () => {
    it('rejects a non-superadmin write to an ads.* key, even with settings:write', () => {
      const user = { organizationId: 'org-1', id: 'user-1', isSuperadmin: false };

      expect(() =>
        controller.set('ads.header', { value: { enabled: true } } as any, user),
      ).toThrow(ForbiddenException);
      expect(settingsService.set).not.toHaveBeenCalled();
    });

    it('allows a superadmin to write an ads.* key through this endpoint too', async () => {
      const user = { organizationId: 'org-1', id: 'user-1', isSuperadmin: true };

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

  describe('ordinary (non-superadmin-only) keys', () => {
    it('is unaffected by the superadmin check', async () => {
      const user = { organizationId: 'org-1', id: 'user-1', isSuperadmin: false };

      await controller.set('theme.color', { value: { hex: '#000' } } as any, user);

      expect(settingsService.set).toHaveBeenCalledWith(
        'org-1',
        'theme.color',
        { hex: '#000' },
        'user-1',
        false,
      );
    });
  });
});

import { SiteSettingsService } from './site-settings.service';
import { SITE_SETTING_KEYS } from './site-settings.constants';

describe('SiteSettingsService', () => {
  let service: SiteSettingsService;
  let settingsService: any;
  let config: any;

  beforeEach(() => {
    settingsService = {
      get: jest.fn(),
      set: jest.fn(),
    };
    config = {
      get: jest.fn().mockReturnValue('public-org-1'),
    };
    service = new SiteSettingsService(settingsService, config);
  });

  describe('getFooter / updateFooter', () => {
    it('reads the footer setting for the public-site org', async () => {
      settingsService.get.mockResolvedValue({ description: 'x', links: [] });

      await service.getFooter();

      expect(settingsService.get).toHaveBeenCalledWith('public-org-1', SITE_SETTING_KEYS.footer);
    });

    it('writes the footer setting as public, regardless of caller intent', async () => {
      settingsService.set.mockResolvedValue({});
      const dto = { description: 'Hi', links: [{ label: 'Contact', url: 'https://example.com' }] };

      await service.updateFooter(dto as any, 'user-1');

      expect(settingsService.set).toHaveBeenCalledWith(
        'public-org-1',
        SITE_SETTING_KEYS.footer,
        dto,
        'user-1',
        true,
      );
    });
  });

  describe('getHomepageWidgets / updateHomepageWidgets', () => {
    it('round-trips the widgets array', async () => {
      settingsService.set.mockResolvedValue({});
      const dto = { widgets: [{ type: 'trending', enabled: true }] };

      await service.updateHomepageWidgets(dto as any, 'user-1');

      expect(settingsService.set).toHaveBeenCalledWith(
        'public-org-1',
        SITE_SETTING_KEYS.homepageWidgets,
        dto,
        'user-1',
        true,
      );
    });
  });

  describe('getHomepageSeo / updateHomepageSeo', () => {
    it('writes the SEO override as public', async () => {
      settingsService.set.mockResolvedValue({});
      const dto = { title: 'Custom title' };

      await service.updateHomepageSeo(dto as any, 'user-1');

      expect(settingsService.set).toHaveBeenCalledWith(
        'public-org-1',
        SITE_SETTING_KEYS.homepageSeo,
        dto,
        'user-1',
        true,
      );
    });
  });

  describe('getCustomScripts / updateCustomScripts', () => {
    it('writes both header and footer slots as public', async () => {
      settingsService.set.mockResolvedValue({});
      const dto = {
        header: { enabled: true, html: '<script>1</script>' },
        footer: { enabled: false, html: '' },
      };

      await service.updateCustomScripts(dto as any, 'user-1');

      expect(settingsService.set).toHaveBeenCalledWith(
        'public-org-1',
        SITE_SETTING_KEYS.customScripts,
        dto,
        'user-1',
        true,
      );
    });
  });

  describe('getBranding / updateBranding', () => {
    it('writes the logo/favicon URLs as public', async () => {
      settingsService.set.mockResolvedValue({});
      const dto = { logoUrl: 'https://example.com/logo.png', faviconUrl: 'https://example.com/icon.png' };

      await service.updateBranding(dto as any, 'user-1');

      expect(settingsService.set).toHaveBeenCalledWith(
        'public-org-1',
        SITE_SETTING_KEYS.branding,
        dto,
        'user-1',
        true,
      );
    });

    it('reads the branding setting for the public-site org', async () => {
      settingsService.get.mockResolvedValue({ logoUrl: 'https://example.com/logo.png' });

      await service.getBranding();

      expect(settingsService.get).toHaveBeenCalledWith('public-org-1', SITE_SETTING_KEYS.branding);
    });
  });

  describe('when the public site is not configured', () => {
    it('propagates the NotFoundException from the shared org resolver', () => {
      config.get.mockReturnValue('');

      // orgId is resolved synchronously (a getter, not awaited), so the
      // exception is thrown before any Promise is created - assert on the
      // synchronous call, not `rejects`.
      expect(() => service.getFooter()).toThrow('Public site is not configured');
    });
  });
});

// Well-known Setting keys for the public reader site's superadmin-managed
// presentation content (footer, homepage sidebar widgets, homepage SEO meta
// tags, custom header/footer scripts). Stored via the existing generic
// Setting table (JSON value, isPublic flag) - not SystemSetting, since these
// aren't secrets and must be readable by the unauthenticated public site.
export const SITE_SETTING_KEYS = {
  footer: 'site.footer',
  homepageWidgets: 'site.homepage_widgets',
  homepageSeo: 'site.homepage_seo',
  customScripts: 'site.custom_scripts',
} as const;

export type SiteSettingKey = (typeof SITE_SETTING_KEYS)[keyof typeof SITE_SETTING_KEYS];

// Any Setting key under this prefix is superadmin-only to write, even
// through the generic /settings/:key endpoint - see settings.controller.ts.
export const SITE_SETTING_KEY_PREFIX = 'site.';

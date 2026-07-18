import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Single-tenant by design (see docs/PRD.md's SEO/GEO requirements vs. no
 * documented multi-tenant routing strategy for a public site — subdomain
 * vs. path-prefix vs. custom domain is a product decision left for a
 * later, deliberate pass, not guessed at here). One organization's
 * published content is public; which one is a deploy-time config choice.
 *
 * Shared by anything that needs to resolve "the" public-site organization —
 * PublicSiteService (public reads) and SiteSettingsService (superadmin
 * writes to that same site's settings) both call this instead of each
 * duplicating the env lookup.
 */
export function getPublicSiteOrgId(config: ConfigService): string {
  const orgId = config.get<string>('PUBLIC_SITE_ORG_ID', '');
  if (!orgId) {
    throw new NotFoundException('Public site is not configured');
  }
  return orgId;
}

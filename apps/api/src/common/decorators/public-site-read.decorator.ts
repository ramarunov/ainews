import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_SITE_READ_KEY = 'isPublicSiteRead';

/**
 * Marks a route as part of the public reader site — combined with
 * `@Public()` (which bypasses JwtAuthGuard entirely), this tells
 * OrgContextInterceptor to establish the RLS org context from the
 * configured PUBLIC_SITE_ORG_ID instead of an authenticated user's
 * organizationId, since these routes have no user at all.
 */
export const PublicSiteRead = () => SetMetadata(IS_PUBLIC_SITE_READ_KEY, true);

/**
 * Centralized public-URL construction for categories/articles. Every place
 * that used to hand-template `${siteUrl}/news/${slug}` (SeoService's
 * canonical-URL and sitemap-entry builders disagreed with each other before
 * this existed — one hardcoded `/news/:slug`, the other `/${category.slug}/
 * :slug`) should call these instead.
 *
 * A category without a `subdomain` assigned yet falls back to an
 * apex-relative URL — this is what keeps every *existing* category/article
 * resolving unchanged until an admin explicitly opts a category into
 * subdomain routing (see docs/DEVOPS.md's category-subdomain rollout notes).
 *
 * apps/web/lib/site-url.ts is the frontend's copy of this same shape. Keep
 * both in sync — there's no shared workspace package here since the two
 * apps consume this with different inputs (Nest DI'd ConfigService vs. a
 * Next.js runtime env read) and the logic is small enough that duplicating
 * it beats standing up a `packages/*` workspace for three functions.
 */

import { ConfigService } from '@nestjs/config';

export function getRootDomain(config: ConfigService): string {
  return config.get<string>('ROOT_DOMAIN', 'beritabot.com');
}

export function getCategoryUrl(
  category: { slug: string; subdomain?: string | null },
  rootDomain: string,
): string {
  if (category.subdomain) {
    return `https://${category.subdomain}.${rootDomain}`;
  }
  return `https://${rootDomain}/category/${category.slug}`;
}

export function getArticleUrl(
  article: {
    slug: string;
    primaryCategory?: { slug: string; subdomain?: string | null } | null;
  },
  rootDomain: string,
): string {
  const subdomain = article.primaryCategory?.subdomain;
  if (subdomain) {
    return `https://${subdomain}.${rootDomain}/news/${article.slug}`;
  }
  return `https://${rootDomain}/news/${article.slug}`;
}

export function getAbsoluteUrl(path: string, hostname: string): string {
  return `https://${hostname}${path.startsWith('/') ? path : `/${path}`}`;
}

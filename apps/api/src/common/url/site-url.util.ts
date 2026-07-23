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

// A category's own subdomain always wins; a subcategory (no subdomain of
// its own) inherits its parent's subdomain and lives at a path underneath
// it instead - e.g. gizi (child of kesehatan) resolves to
// kesehatan.beritabot.com/gizi, not a subdomain of its own. This keeps a
// topic's link equity concentrated on one host instead of fragmenting
// across a subdomain per subcategory. Returns null (apex) when neither the
// category nor its parent has a subdomain assigned.
function getCategoryHost(
  category: { subdomain?: string | null; parent?: { subdomain?: string | null } | null },
  rootDomain: string,
): string | null {
  if (category.subdomain) return `${category.subdomain}.${rootDomain}`;
  if (category.parent?.subdomain) return `${category.parent.subdomain}.${rootDomain}`;
  return null;
}

export function getCategoryUrl(
  category: { slug: string; subdomain?: string | null; parent?: { subdomain?: string | null } | null },
  rootDomain: string,
): string {
  const host = getCategoryHost(category, rootDomain);
  if (!host) return `https://${rootDomain}/category/${category.slug}`;
  // A top-level category subdomain's own root IS its homepage; a
  // subcategory is a path underneath its parent's subdomain.
  return category.subdomain ? `https://${host}` : `https://${host}/${category.slug}`;
}

export function getArticleUrl(
  article: {
    slug: string;
    primaryCategory?: {
      slug: string;
      subdomain?: string | null;
      parent?: { subdomain?: string | null } | null;
    } | null;
  },
  rootDomain: string,
): string {
  const host = article.primaryCategory ? getCategoryHost(article.primaryCategory, rootDomain) : null;
  if (host) return `https://${host}/news/${article.slug}`;
  return `https://${rootDomain}/news/${article.slug}`;
}

export function getAbsoluteUrl(path: string, hostname: string): string {
  return `https://${hostname}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * Centralized public-URL construction for categories/articles — the
 * frontend counterpart of apps/api/src/common/url/site-url.util.ts (kept in
 * sync manually, see that file's header comment for why there's no shared
 * package).
 *
 * Six places in this app used to independently template
 * `${SITE_URL}/news/${slug}`-style strings (sitemap.ts, robots.ts,
 * news-sitemap.xml/route.ts, image-sitemap.xml/route.ts,
 * news/[slug]/page.tsx, components/article-form.tsx) — all of them should
 * go through these functions now, since "the URL for an article" depends on
 * its category's subdomain, not a single site-wide constant.
 *
 * ROOT_DOMAIN is a plain (non-NEXT_PUBLIC_) runtime env var deliberately —
 * NEXT_PUBLIC_SITE_URL etc. are baked into the Docker image at build time
 * (see docker-compose.prod.yml's web.build.args), but category subdomains
 * are admin-managed at runtime and must not require an image rebuild.
 * NEXT_PUBLIC_ROOT_DOMAIN is only used by client components that need it
 * for display (e.g. the admin subdomain-field URL preview).
 */

export function getRootDomain(): string {
  // process.env.NEXT_PUBLIC_ROOT_DOMAIN is statically replaced with a string
  // literal at build time by Next's compiler wherever it's referenced, so
  // it's always safe to read here regardless of server/client context.
  // Plain process.env.ROOT_DOMAIN is NOT rewritten that way - this module is
  // imported from both Server Components/Route Handlers and at least one
  // "use client" component (article-form.tsx's view-live link), and in the
  // latter `process` itself may not exist as a browser global, so that read
  // is guarded instead of risking a "process is not defined" crash.
  const serverOnlyRootDomain =
    typeof process !== "undefined" ? process.env.ROOT_DOMAIN : undefined;
  return process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? serverOnlyRootDomain ?? "beritabot.com";
}

// Master kill-switch (see proxy.ts) - checked here too so that assigning a
// subdomain to a category ahead of Phase 5's DNS/TLS being live can't leak
// a not-yet-reachable subdomain URL into a sitemap, canonical tag, or
// redirect. Flipping this back to false immediately reverts every URL this
// module builds to its apex-relative form, with no rebuild required.
export function isCategorySubdomainsEnabled(): boolean {
  if (process.env.NEXT_PUBLIC_ENABLE_CATEGORY_SUBDOMAINS === "true") return true;
  if (typeof process !== "undefined" && process.env.ENABLE_CATEGORY_SUBDOMAINS === "true") {
    return true;
  }
  return false;
}

export function getCategoryUrl(
  category: { slug: string; subdomain?: string | null },
  rootDomain: string = getRootDomain(),
): string {
  if (category.subdomain && isCategorySubdomainsEnabled()) {
    return `https://${category.subdomain}.${rootDomain}`;
  }
  return `https://${rootDomain}/category/${category.slug}`;
}

export function getArticleUrl(
  article: { slug: string; primaryCategory?: { slug: string; subdomain?: string | null } | null },
  rootDomain: string = getRootDomain(),
): string {
  const subdomain = article.primaryCategory?.subdomain;
  if (subdomain && isCategorySubdomainsEnabled()) {
    return `https://${subdomain}.${rootDomain}/news/${article.slug}`;
  }
  return `https://${rootDomain}/news/${article.slug}`;
}

export function getAbsoluteUrl(path: string, hostname: string): string {
  return `https://${hostname}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * Maps an incoming request's `Host` header to the category it belongs to
 * (or undefined for the apex/an unrecognized host) - the one piece of
 * host-matching logic every per-host route (sitemap.ts, robots.ts, the
 * sitemap/feed route handlers, proxy.ts, the article page's wrong-host
 * redirect) shares, so it's centralized here instead of re-derived at each
 * call site.
 */
export function resolveHostCategory<T extends { subdomain?: string | null }>(
  hostname: string,
  rootDomain: string,
  categories: T[],
): T | undefined {
  if (!hostname || hostname === rootDomain) return undefined;
  const label = hostname.endsWith(`.${rootDomain}`)
    ? hostname.slice(0, -(rootDomain.length + 1))
    : hostname;
  return categories.find((c) => c.subdomain && c.subdomain === label);
}

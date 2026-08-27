import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getCategories } from "@/lib/public-api";
import { getRootDomain, resolveHostCategory } from "@/lib/site-url";
import { DASHBOARD_PATHS } from "@/lib/dashboard-routes";
import type { Category } from "@/lib/types";

// Route groups like (public)/(dashboard) don't appear in the URL, so this
// is an explicit allowlist of path prefixes that stay reachable on the
// root/apex domain (the public reader site) - everything else is
// dashboard/CMS and only makes sense on the app subdomain. Deliberately an
// allowlist of public paths, not a blocklist of dashboard ones: a new
// dashboard page added later without updating this file gets redirected by
// default instead of silently becoming reachable on the public domain.
// Admin-created static pages (About, Contact, ...) and articles (rusdimedia
// carries over its previous WordPress site's flat `/{slug}` permalinks -
// see lib/site-url.ts) are NOT listed here - they're both arbitrary
// single-segment slugs that [slug]/page.tsx resolves (Page, then Article)
// and 404s itself if neither matches, the same way category subdomains are
// checked against real category data rather than a hardcoded list.
const PUBLIC_PATH_PREFIXES = [
  "/author",
  "/category",
  "/tag",
  "/news",
  "/search",
  "/feed",
  "/robots.txt",
  "/ads.txt",
  "/sitemap.xml",
  "/image-sitemap.xml",
  "/news-sitemap.xml",
  "/llms.txt",
  "/icon",
  "/apple-icon",
];

// A static page's URL is exactly one path segment with no trailing slash
// (e.g. "/kontak", not "/kontak/" or "/kontak/foo") - matches the flat
// (non-nested) [slug]/page.tsx route. Deliberately broad (any character but
// `/`, not just lowercase-alnum-hyphen): a migrated site's old URLs being
// redirected (see scripts/generate-redirect-suggestions.ts) aren't
// necessarily shaped like a normal slug - confirmed live that a Redirect
// row for e.g. `/sitemap_index.xml` (Yoast's old sitemap path) never even
// got a chance to fire while this excluded `.`/`_` from matching, since
// isPublicPath rejected the request before it ever reached [slug]/page.tsx
// (and therefore before ArticleView's resolveRedirect() lookup) at all.
const SINGLE_SEGMENT_PATTERN = /^\/([^/]+)$/;

function isPublicPath(pathname: string): boolean {
  if (pathname === "/") return true;
  // Checked before the generic single-segment pass below: Next's router
  // always matches a static route (e.g. `(dashboard)/login/page.tsx`) over
  // the public site's `[slug]/page.tsx` dynamic catch-all for the exact
  // same path, regardless of what proxy.ts decides here - so without this
  // exclusion, a request for one of these exact paths on the apex would
  // silently render the dashboard page instead of ever reaching
  // [slug]/page.tsx's Page/Article/redirect resolution. See
  // lib/dashboard-routes.ts's header comment for the full explanation.
  if ((DASHBOARD_PATHS as string[]).includes(pathname)) return false;
  if (PUBLIC_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return true;
  }
  // A single-segment path could be either a static Page or an Article slug -
  // [slug]/page.tsx resolves which one (and 404s itself if neither matches),
  // so there's no fixed slug list to check against here the way there was
  // when this only had to account for Pages (an org can have thousands of
  // article slugs; caching them all just to answer "is this public" would
  // cost more than it saves).
  return SINGLE_SEGMENT_PATTERN.test(pathname);
}

// proxy.ts runs on every request, so a bare fetch per-request would double
// the API's read load for no benefit - the category/page lists change
// rarely (only when an admin edits one). Plain in-module caches rather than
// relying on Next's fetch-cache behaving a particular way inside
// middleware, which isn't something documented to depend on.
let categoryCache: { data: Category[]; expiresAt: number } | null = null;
const CATEGORY_CACHE_TTL_MS = 60_000;

async function getCachedCategories(): Promise<Category[]> {
  const now = Date.now();
  if (categoryCache && categoryCache.expiresAt > now) return categoryCache.data;
  try {
    const categories = await getCategories();
    categoryCache = { data: categories, expiresAt: now + CATEGORY_CACHE_TTL_MS };
    return categories;
  } catch {
    // Fail open on the last known-good list rather than treating every
    // category subdomain as unknown just because one fetch hiccuped.
    return categoryCache?.data ?? [];
  }
}

// WordPress's own archive pagination (`/page/2/`, `/category/tekno/page/2/`)
// has no equivalent route here - this app paginates with `?page=N` (see
// category/[slug]/page.tsx) - so a migrated site's already-indexed page-2+
// URLs would otherwise 404. A plain 301 to the query-string equivalent is
// an acceptable trade-off (Google mostly only indexes page 1 of an archive
// anyway), rather than adding a native `/page/N` route just for this.
const PAGE_NUMBER_PATTERN = /^(.*)\/page\/(\d+)\/?$/;

// The prior WordPress install used slightly different archive-path prefixes
// than this app's routes: a plural "/tags/" instead of "/tag/", the
// Indonesian "/kategori/" instead of "/category/", static Pages served
// under "/pages/{slug}" instead of flat "/{slug}", and an even older
// "/berita/{category}" news-prefix structure the site apparently used before
// "/kategori/" - all confirmed live from real Google Search Console traffic
// (see scripts/analyze-gsc-redirects.ts), not a guess. Rather than
// enumerating every individual old tag/category URL
// as a Redirect row (which could never cover a slug outside the one GSC
// sample happened to catch), alias the whole prefix the same way trailing-
// slash/pagination are normalized below. WordPress tag archives aren't
// nested, but its category archives can be ("/kategori/berita/olahraga") -
// taking the last path segment handles both uniformly, the same way
// generate-redirect-suggestions.ts already flattens nested /category/ paths.
const WP_PREFIX_ALIASES: Array<[string, string]> = [
  ["/kategori/", "/category/"],
  ["/tags/", "/tag/"],
  ["/pages/", "/"],
  ["/berita/", "/category/"],
];

function redirectForPrefixAlias(request: NextRequest): NextResponse | null {
  const { pathname } = request.nextUrl;
  for (const [from, to] of WP_PREFIX_ALIASES) {
    if (!pathname.startsWith(from)) continue;
    const segments = pathname.slice(from.length).split("/").filter(Boolean);
    const lastSegment = segments[segments.length - 1];
    if (!lastSegment) return null;
    const redirectUrl = new URL(request.nextUrl);
    redirectUrl.pathname = `${to}${lastSegment}`;
    return NextResponse.redirect(redirectUrl, 301);
  }
  return null;
}

// WordPress permalinks always carry a trailing slash; this app's routes
// don't expect one (no `trailingSlash` in next.config.ts) - normalize so
// already-indexed WP URLs (`/judul-artikel/`, `/category/tekno/`) don't
// 404 post-migration. Scoped to public-site hosts only (see call site) -
// the dashboard/app host's own routes are unrelated to any WP migration.
function redirectForPathNormalization(request: NextRequest): NextResponse | null {
  const { pathname } = request.nextUrl;

  const pageMatch = PAGE_NUMBER_PATTERN.exec(pathname);
  if (pageMatch) {
    const [, base, pageNum] = pageMatch;
    const redirectUrl = new URL(request.nextUrl);
    redirectUrl.pathname = base || "/";
    redirectUrl.search = "";
    redirectUrl.searchParams.set("page", pageNum);
    return NextResponse.redirect(redirectUrl, 301);
  }

  // Belt-and-suspenders, not the primary mechanism: confirmed live that
  // this Next.js version's own dev server already 308s a trailing-slash
  // request (stripping the slash) BEFORE Proxy ever runs, ahead of even
  // the "Proxy" step in its documented execution order - so a WordPress
  // URL like `/category/tekno/page/2/` actually resolves in two redirect
  // hops (Next's own slash-strip, then the PAGE_NUMBER_PATTERN branch
  // above on the second, slash-free request), not the one hop this
  // function alone would suggest. Kept anyway as a fallback for whatever
  // reaches this function with a trailing slash some other way (e.g.
  // `skipTrailingSlashRedirect`, or a future Next version).
  if (pathname.length > 1 && pathname.endsWith("/")) {
    const redirectUrl = new URL(request.nextUrl);
    redirectUrl.pathname = pathname.replace(/\/+$/, "");
    return NextResponse.redirect(redirectUrl, 301);
  }

  const aliased = redirectForPrefixAlias(request);
  if (aliased) return aliased;

  return null;
}

function redirectToApp(request: NextRequest, appUrl: URL) {
  const redirectUrl = new URL(request.nextUrl);
  redirectUrl.hostname = appUrl.hostname;
  redirectUrl.protocol = appUrl.protocol;
  redirectUrl.port = appUrl.port;
  return NextResponse.redirect(redirectUrl, 307);
}

export async function proxy(request: NextRequest) {
  // NEXT_PUBLIC_SITE_URL is already the single source of truth for "where
  // the app/dashboard lives" (next.config.ts's CSP, canonical URLs,
  // sitemaps) - reuse it here instead of hardcoding a domain, so this keeps
  // working if the app subdomain ever changes without a code edit.
  const appUrl = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3100");
  // request.nextUrl.hostname doesn't reliably reflect the client-facing Host
  // header behind a reverse proxy (confirmed live: it fell back to the
  // server's own bind address instead) - the Host header itself is what
  // Caddy actually forwards, so read that directly instead.
  const hostname = (request.headers.get("host") ?? "").split(":")[0];
  const { pathname } = request.nextUrl;
  const rootDomain = getRootDomain();

  // www -> apex, permanent. Independent of the category-subdomain feature
  // flag below (this is "pick one canonical domain version", not part of
  // the subdomain rollout) - checked first, before the kill switch, so it
  // always applies even while ENABLE_CATEGORY_SUBDOMAINS is off.
  if (hostname === `www.${rootDomain}`) {
    const redirectUrl = new URL(request.nextUrl);
    redirectUrl.hostname = rootDomain;
    redirectUrl.protocol = "https:";
    redirectUrl.port = "";
    return NextResponse.redirect(redirectUrl, 308);
  }

  // Public reader-facing content (articles, categories, tags, author pages,
  // static Pages, sitemaps/feed, ...) has exactly one canonical URL - the
  // apex - regardless of which host the request came in on. Both branches
  // below let the dashboard host (app.{rootDomain}) through unconditionally
  // for ITS OWN paths, so without this check a public content path would
  // ALSO render there (a second, non-canonical copy). This used to be
  // caught per-page instead, via a runtime `headers()` call in each of
  // article-view.tsx, category/[slug]/page.tsx, tag/[slug]/page.tsx, and
  // [slug]/page.tsx's static-page branch - which forced every single one of
  // those pages (i.e. nearly all real reader traffic) to opt out of static
  // rendering/ISR just to answer a question this function already has the
  // answer to for free, from the Host header read above. Checked before the
  // kill-switch branch below so it applies the same way regardless of
  // whether category subdomains are enabled.
  if (hostname === appUrl.hostname && isPublicPath(pathname)) {
    const redirectUrl = new URL(request.nextUrl);
    redirectUrl.hostname = rootDomain;
    redirectUrl.protocol = "https:";
    redirectUrl.port = "";
    return NextResponse.redirect(redirectUrl, 308);
  }

  // Trailing-slash/pagination normalization only applies to public-site
  // hosts (apex or a category subdomain) - the dashboard host's own routes
  // (e.g. a legitimately trailing-slash-free /login) are unrelated.
  if (hostname !== appUrl.hostname) {
    const normalized = redirectForPathNormalization(request);
    if (normalized) return normalized;
  }

  // Kill switch for the whole category-subdomain feature - while this is
  // false (the default until Phase 6's rollout flips it on), behavior is
  // the original binary apex/app split, EXCEPT for one addition: once
  // wildcard DNS/TLS for *.{rootDomain} exists (see docs/DEPLOY.md §7.1),
  // literally any subdomain becomes reachable at this server regardless of
  // this flag - isPublicPath("/") being unconditionally true was only safe
  // back when app.{rootDomain}/​{rootDomain} were the only hostnames that
  // could physically reach this deployment. Confirmed live: a wildcard
  // cert being issued for *.{rootDomain} alone was enough for a
  // never-configured name like sembarang.{rootDomain} to start serving the
  // apex homepage. So an unrecognized hostname still 404s here, same as
  // the enabled branch below - the flag only controls whether a *known*
  // category ever resolves to its own subdomain, not whether guessable
  // subdomains produce a fake site.
  if (process.env.ENABLE_CATEGORY_SUBDOMAINS !== "true") {
    if (hostname === appUrl.hostname) {
      return NextResponse.next();
    }
    if (hostname === rootDomain) {
      if (!isPublicPath(pathname)) return redirectToApp(request, appUrl);
      return NextResponse.next();
    }
    return new NextResponse("Not Found", { status: 404 });
  }

  // The dashboard host's existing behavior is untouched - every path stays
  // reachable there regardless of the public-path allowlist.
  if (hostname === appUrl.hostname) {
    return NextResponse.next();
  }

  // Apex: cross-category aggregator, same public-path allowlist as always.
  if (hostname === rootDomain) {
    if (!isPublicPath(pathname)) return redirectToApp(request, appUrl);
    return NextResponse.next();
  }

  // Anything else must be a known, active category subdomain - unrecognized
  // hosts get a real 404, not a redirect (no fake/guessable sites).
  const categories = await getCachedCategories();
  const category = resolveHostCategory(hostname, rootDomain, categories);

  if (!category) {
    return new NextResponse("Not Found", { status: 404 });
  }

  // A category subdomain's own root renders that category's homepage
  // directly (internally the same page category/[slug]/page.tsx already
  // renders for /category/:slug) rather than forcing a further redirect -
  // the URL bar stays at "/", only the internal routing changes.
  if (pathname === "/") {
    const rewriteUrl = new URL(request.nextUrl);
    rewriteUrl.pathname = `/category/${category.slug}`;
    return NextResponse.rewrite(rewriteUrl);
  }

  // A subcategory has no subdomain of its own - it lives at a single-segment
  // path directly under its parent's subdomain (kesehatan.rusdimedia.com/gizi,
  // see getCategoryUrl in lib/site-url.ts), rewritten to the same
  // category/[slug] page a top-level category renders. Checked before the
  // generic isPublicPath/static-page check below so it isn't shadowed by an
  // admin-created static page happening to share the same single-segment
  // slug - a subcategory of the current host takes priority over a page on
  // a category subdomain (pages are apex content anyway, see [slug]/page.tsx).
  const childMatch = SINGLE_SEGMENT_PATTERN.exec(pathname);
  if (childMatch) {
    const child = categories.find(
      (c) => c.parentId === category.id && c.slug === childMatch[1] && c.isActive !== false,
    );
    if (child) {
      const rewriteUrl = new URL(request.nextUrl);
      rewriteUrl.pathname = `/category/${child.slug}`;
      return NextResponse.rewrite(rewriteUrl);
    }
  }

  if (!isPublicPath(pathname)) return redirectToApp(request, appUrl);

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|brand/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};

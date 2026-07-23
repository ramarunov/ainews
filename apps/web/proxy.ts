import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getCategories, getPages } from "@/lib/public-api";
import { getRootDomain, resolveHostCategory } from "@/lib/site-url";
import type { Category } from "@/lib/types";

// Route groups like (public)/(dashboard) don't appear in the URL, so this
// is an explicit allowlist of path prefixes that stay reachable on the
// root/apex domain (the public reader site) - everything else is
// dashboard/CMS and only makes sense on the app subdomain. Deliberately an
// allowlist of public paths, not a blocklist of dashboard ones: a new
// dashboard page added later without updating this file gets redirected by
// default instead of silently becoming reachable on the public domain.
// Admin-created static pages (About, Contact, ...) are NOT listed here -
// they're arbitrary, admin-chosen single-segment slugs (see
// getCachedPageSlugs below), checked against real published-page data
// instead of a fixed prefix, the same way category subdomains are checked
// against real category data rather than a hardcoded list.
const PUBLIC_PATH_PREFIXES = [
  "/author",
  "/category",
  "/news",
  "/search",
  "/feed",
  "/robots.txt",
  "/sitemap.xml",
  "/image-sitemap.xml",
  "/news-sitemap.xml",
  "/icon",
  "/apple-icon",
];

// A static page's URL is exactly one path segment with no trailing slash
// (e.g. "/kontak", not "/kontak/" or "/kontak/foo") - matches the flat
// (non-nested) [slug]/page.tsx route.
const SINGLE_SEGMENT_PATTERN = /^\/([a-z0-9-]+)$/;

async function isPublicPath(pathname: string): Promise<boolean> {
  if (pathname === "/") return true;
  if (PUBLIC_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return true;
  }
  const match = SINGLE_SEGMENT_PATTERN.exec(pathname);
  if (!match) return false;
  const pageSlugs = await getCachedPageSlugs();
  return pageSlugs.has(match[1]);
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

let pageSlugCache: { data: Set<string>; expiresAt: number } | null = null;
const PAGE_SLUG_CACHE_TTL_MS = 60_000;

async function getCachedPageSlugs(): Promise<Set<string>> {
  const now = Date.now();
  if (pageSlugCache && pageSlugCache.expiresAt > now) return pageSlugCache.data;
  try {
    const pages = await getPages();
    const slugs = new Set(pages.map((p) => p.slug));
    pageSlugCache = { data: slugs, expiresAt: now + PAGE_SLUG_CACHE_TTL_MS };
    return slugs;
  } catch {
    // Fail open on the last known-good set rather than 404ing/redirecting
    // every static page away just because one fetch hiccuped.
    return pageSlugCache?.data ?? new Set();
  }
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
      if (!(await isPublicPath(pathname))) return redirectToApp(request, appUrl);
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
    if (!(await isPublicPath(pathname))) return redirectToApp(request, appUrl);
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
  // path directly under its parent's subdomain (kesehatan.beritabot.com/gizi,
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

  if (!(await isPublicPath(pathname))) return redirectToApp(request, appUrl);

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|brand/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};

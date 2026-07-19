import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Route groups like (public)/(dashboard) don't appear in the URL, so this
// is an explicit allowlist of path prefixes that stay reachable on the
// root/apex domain (the public reader site) - everything else is
// dashboard/CMS and only makes sense on the app subdomain. Deliberately an
// allowlist of public paths, not a blocklist of dashboard ones: a new
// dashboard page added later without updating this file gets redirected by
// default instead of silently becoming reachable on the public domain.
const PUBLIC_PATH_PREFIXES = [
  "/about",
  "/author",
  "/category",
  "/news",
  "/search",
  "/robots.txt",
  "/sitemap.xml",
  "/image-sitemap.xml",
  "/news-sitemap.xml",
  "/icon",
  "/apple-icon",
];

function isPublicPath(pathname: string): boolean {
  if (pathname === "/") return true;
  return PUBLIC_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function proxy(request: NextRequest) {
  // NEXT_PUBLIC_SITE_URL is already the single source of truth for "where
  // the app lives" (next.config.ts's CSP, canonical URLs, sitemaps) - reuse
  // it here instead of hardcoding a domain, so this keeps working if the
  // app subdomain ever changes without a code edit.
  const appUrl = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3100");
  // request.nextUrl.hostname doesn't reliably reflect the client-facing Host
  // header behind a reverse proxy (confirmed live: it fell back to the
  // server's own bind address instead) - the Host header itself is what
  // Caddy actually forwards, so read that directly instead.
  const hostname = (request.headers.get("host") ?? "").split(":")[0];
  const { pathname } = request.nextUrl;

  if (hostname !== appUrl.hostname && !isPublicPath(pathname)) {
    const redirectUrl = new URL(request.nextUrl);
    redirectUrl.hostname = appUrl.hostname;
    redirectUrl.protocol = appUrl.protocol;
    redirectUrl.port = appUrl.port;
    return NextResponse.redirect(redirectUrl, 307);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|brand/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};

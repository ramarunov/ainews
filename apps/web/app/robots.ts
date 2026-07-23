import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { getAbsoluteUrl } from "@/lib/site-url";

// The admin dashboard and the public reader site share this one Next.js
// app/domain (route groups like `(dashboard)`/`(public)` don't add a URL
// segment) - none of the internal editorial tool pages are content worth
// indexing, and auth guards already keep them inaccessible without a
// session regardless, so this is belt-and-suspenders, not a security
// boundary in itself.
const DASHBOARD_PATHS = [
  "/login", "/register", "/forgot-password", "/reset-password", "/oauth-callback",
  "/articles", "/categories", "/tags", "/series", "/media", "/article-search",
  "/workflow", "/calendar", "/news-intelligence", "/analytics", "/redirects",
  "/users", "/api-keys", "/activity", "/system-settings", "/account",
];

// Each host (apex or a category subdomain) gets its own robots.txt pointing
// at its own sitemap/feed - see sitemap.ts and app/feed/route.ts, both of
// which already branch on the same `Host` header.
export default async function robots(): Promise<MetadataRoute.Robots> {
  const hostname = (await headers()).get("host")?.split(":")[0] ?? "";

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: DASHBOARD_PATHS,
    },
    sitemap: [
      getAbsoluteUrl("/sitemap.xml", hostname),
      getAbsoluteUrl("/news-sitemap.xml", hostname),
      getAbsoluteUrl("/image-sitemap.xml", hostname),
    ],
  };
}

import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3100";

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

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: DASHBOARD_PATHS,
    },
    sitemap: [
      `${SITE_URL}/sitemap.xml`,
      `${SITE_URL}/news-sitemap.xml`,
      `${SITE_URL}/image-sitemap.xml`,
    ],
  };
}

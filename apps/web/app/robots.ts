import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { getAbsoluteUrl } from "@/lib/site-url";
import { DASHBOARD_PATHS } from "@/lib/dashboard-routes";

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

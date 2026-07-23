import { headers } from "next/headers";
import { getCategories, getPublishedArticles } from "@/lib/public-api";
import { getArticleUrl, getCategoryUrl, getRootDomain, resolveHostCategory } from "@/lib/site-url";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/brand";

// Escapes the five XML special characters - titles/excerpts are free-text
// editorial content, not something we control the shape of (same helper as
// the sitemap route handlers, duplicated rather than shared per this app's
// existing convention for these small per-route XML builders).
function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// RSS 2.0 feed, host-scoped exactly like sitemap.ts/robots.ts: the apex
// feed is the cross-category aggregator, a category subdomain's feed is
// that category's articles only - never a mix of both under one URL.
export async function GET() {
  const hostname = (await headers()).get("host")?.split(":")[0] ?? "";
  const rootDomain = getRootDomain();
  const categories = await getCategories();
  const activeCategory = resolveHostCategory(hostname, rootDomain, categories);

  const { data: articles } = await getPublishedArticles({
    limit: 50,
    categorySlug: activeCategory?.slug,
  });

  const channelTitle = activeCategory ? `${activeCategory.name} — ${SITE_NAME}` : SITE_NAME;
  const channelDescription = activeCategory
    ? (activeCategory.description ?? `Latest ${activeCategory.name} stories from ${SITE_NAME}.`)
    : SITE_TAGLINE;
  const channelLink = activeCategory ? getCategoryUrl(activeCategory, rootDomain) : `https://${rootDomain}`;
  const selfUrl = `${channelLink.replace(/\/$/, "")}/feed`;

  const items = articles
    .map((article) => {
      const url = getArticleUrl(article, rootDomain);
      const categoryName = article.primaryCategory?.name;
      return `    <item>
      <title>${escapeXml(article.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      ${article.publishedAt ? `<pubDate>${new Date(article.publishedAt).toUTCString()}</pubDate>` : ""}
      ${article.excerpt ? `<description>${escapeXml(article.excerpt)}</description>` : ""}
      ${categoryName ? `<category>${escapeXml(categoryName)}</category>` : ""}
    </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(channelTitle)}</title>
    <link>${channelLink}</link>
    <description>${escapeXml(channelDescription)}</description>
    <language>id</language>
    <atom:link href="${selfUrl}" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
}

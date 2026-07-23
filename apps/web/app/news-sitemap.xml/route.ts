import { headers } from "next/headers";
import { getCategories, getPublishedArticles } from "@/lib/public-api";
import { getArticleUrl, getRootDomain, resolveHostCategory } from "@/lib/site-url";
import { SITE_NAME } from "@/lib/brand";

const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

// Escapes the five XML special characters - titles/excerpts are free-text
// editorial content, not something we control the shape of.
function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Google News Sitemap spec: only articles published in the last 48 hours
// belong here - this is deliberately NOT a general sitemap (see
// sitemap.ts for that), Google explicitly recommends against listing
// older content in a news sitemap.
export async function GET() {
  const hostname = (await headers()).get("host")?.split(":")[0] ?? "";
  const rootDomain = getRootDomain();
  const categories = await getCategories();
  const activeCategory = resolveHostCategory(hostname, rootDomain, categories);

  const { data: articles } = await getPublishedArticles({
    limit: 50,
    categorySlug: activeCategory?.slug,
  });
  const cutoff = Date.now() - TWO_DAYS_MS;

  const recentArticles = articles.filter(
    (article) => article.publishedAt && new Date(article.publishedAt).getTime() >= cutoff,
  );

  const urls = recentArticles
    .map(
      (article) => `  <url>
    <loc>${getArticleUrl(article, rootDomain)}</loc>
    <news:news>
      <news:publication>
        <news:name>${escapeXml(SITE_NAME)}</news:name>
        <news:language>${escapeXml(article.language ?? "en")}</news:language>
      </news:publication>
      <news:publication_date>${new Date(article.publishedAt!).toISOString()}</news:publication_date>
      <news:title>${escapeXml(article.title)}</news:title>
    </news:news>
  </url>`,
    )
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${urls}
</urlset>`;

  return new Response(xml, {
    headers: { "Content-Type": "application/xml" },
  });
}

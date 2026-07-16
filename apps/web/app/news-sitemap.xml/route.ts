import { getPublishedArticles } from "@/lib/public-api";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3100";
const SITE_NAME = "AI News CMS";
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
  const { data: articles } = await getPublishedArticles({ limit: 50 });
  const cutoff = Date.now() - TWO_DAYS_MS;

  const recentArticles = articles.filter(
    (article) => article.publishedAt && new Date(article.publishedAt).getTime() >= cutoff,
  );

  const urls = recentArticles
    .map(
      (article) => `  <url>
    <loc>${SITE_URL}/news/${article.slug}</loc>
    <news:news>
      <news:publication>
        <news:name>${escapeXml(SITE_NAME)}</news:name>
        <news:language>en</news:language>
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

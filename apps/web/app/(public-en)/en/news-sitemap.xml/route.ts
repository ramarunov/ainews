import { getPublishedArticles } from "@/lib/public-api";
import { getRootDomain } from "@/lib/site-url";
import { SITE_NAME } from "@/lib/brand";

const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Google News sitemap for the English edition - same 48-hour window rule as
// app/news-sitemap.xml/route.ts, scoped to language=en and /en/{slug} URLs.
export async function GET() {
  const rootDomain = getRootDomain();
  const { data: articles } = await getPublishedArticles({ language: "en", limit: 50 });
  const cutoff = Date.now() - TWO_DAYS_MS;

  const recentArticles = articles.filter(
    (article) => article.publishedAt && new Date(article.publishedAt).getTime() >= cutoff,
  );

  const urls = recentArticles
    .map(
      (article) => `  <url>
    <loc>https://${rootDomain}/en/${article.slug}</loc>
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

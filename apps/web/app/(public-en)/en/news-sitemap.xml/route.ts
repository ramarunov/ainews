import { getPublishedArticles } from "@/lib/public-api";
import { getRootDomain } from "@/lib/site-url";
import { SITE_NAME } from "@/lib/brand";
import type { PublicArticle } from "@/lib/types";

export const revalidate = 3600;

const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;
const PAGE_SIZE = 100;
const MAX_PAGES = 10;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Pages newest-first until it passes the 48h cutoff (or runs out) - same
// non-truncating logic as the Indonesian news sitemap.
async function recentEnglishArticles(cutoff: number): Promise<PublicArticle[]> {
  const out: PublicArticle[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data } = await getPublishedArticles({
      page,
      limit: PAGE_SIZE,
      sortBy: "publishedAt",
      language: "en",
    });
    const inWindow = data.filter(
      (a) => a.publishedAt && new Date(a.publishedAt).getTime() >= cutoff,
    );
    out.push(...inWindow);
    if (inWindow.length < data.length || data.length < PAGE_SIZE) break;
  }
  return out;
}

// Google News sitemap for the English edition (/en/{slug}), 48-hour window.
export async function GET() {
  const rootDomain = getRootDomain();
  const articles = await recentEnglishArticles(Date.now() - TWO_DAYS_MS);

  const urls = articles
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

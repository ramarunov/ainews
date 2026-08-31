import { getPublishedArticles } from "@/lib/public-api";
import { getArticleUrl, getRootDomain } from "@/lib/site-url";
import { SITE_NAME } from "@/lib/brand";
import type { PublicArticle } from "@/lib/types";

// Regenerated at most hourly - a news sitemap doesn't need to be
// request-fresh, and this route otherwise ran a fan-out of API calls on
// every crawler hit.
export const revalidate = 3600;

const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;
const PAGE_SIZE = 100; // API caps a page at 100 (PublicArticlesQueryDto @Max)
const MAX_PAGES = 10; // safety valve: never scan more than 1000 articles

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Pages newest-first until it hits an article published before `cutoff`
// (or runs out) - so a busy 48h window with >100 articles isn't silently
// truncated the way a single `limit: 50` fetch was.
async function recentArticles(cutoff: number, language?: "id" | "en"): Promise<PublicArticle[]> {
  const out: PublicArticle[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data } = await getPublishedArticles({
      page,
      limit: PAGE_SIZE,
      sortBy: "publishedAt",
      ...(language && { language }),
    });
    const inWindow = data.filter(
      (a) => a.publishedAt && new Date(a.publishedAt).getTime() >= cutoff,
    );
    out.push(...inWindow);
    // Reached older content, or the last page.
    if (inWindow.length < data.length || data.length < PAGE_SIZE) break;
  }
  return out;
}

// Google News Sitemap spec: only articles published in the last 48 hours
// belong here (see sitemap.ts for the general sitemap). Apex-only - the
// category-subdomain feature is off and proxy.ts guarantees only the apex
// host reaches this route.
export async function GET() {
  const rootDomain = getRootDomain();
  const articles = await recentArticles(Date.now() - TWO_DAYS_MS, "id");

  const urls = articles
    .map(
      (article) => `  <url>
    <loc>${getArticleUrl(article, rootDomain)}</loc>
    <news:news>
      <news:publication>
        <news:name>${escapeXml(SITE_NAME)}</news:name>
        <news:language>${escapeXml(article.language ?? "id")}</news:language>
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

import { headers } from "next/headers";
import { getCategories, getPublishedArticles } from "@/lib/public-api";
import { getArticleUrl, getRootDomain, resolveHostCategory } from "@/lib/site-url";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Unlike news-sitemap.xml, this isn't time-limited - Google's image
// sitemap extension is for image discovery generally, not a "recent news"
// signal. Only articles that actually have a featured image are listed.
export async function GET() {
  const hostname = (await headers()).get("host")?.split(":")[0] ?? "";
  const rootDomain = getRootDomain();
  const categories = await getCategories();
  const activeCategory = resolveHostCategory(hostname, rootDomain, categories);

  const { data: articles } = await getPublishedArticles({
    limit: 100,
    categorySlug: activeCategory?.slug,
  });
  const articlesWithImages = articles.filter((article) => article.featuredImageUrl);

  const urls = articlesWithImages
    .map(
      (article) => `  <url>
    <loc>${getArticleUrl(article, rootDomain)}</loc>
    <image:image>
      <image:loc>${escapeXml(article.featuredImageUrl!)}</image:loc>
      <image:title>${escapeXml(article.featuredImageAlt || article.title)}</image:title>
    </image:image>
  </url>`,
    )
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls}
</urlset>`;

  return new Response(xml, {
    headers: { "Content-Type": "application/xml" },
  });
}

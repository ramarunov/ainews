import type { MetadataRoute } from "next";
import { getAllPublishedArticles, getCategories, getPages } from "@/lib/public-api";
import { getArticleUrl, getCategoryUrl, getRootDomain } from "@/lib/site-url";

// Regenerated at most hourly - the full-catalogue fan-out below (paging the
// public API ~25x) is far too heavy to run per crawler request, and a
// sitemap doesn't need to be request-fresh.
export const revalidate = 3600;

// Apex-only. The category-subdomain feature is off (ENABLE_CATEGORY_SUBDOMAINS)
// and proxy.ts 404s any non-apex host, so this route only ever serves the
// apex today - the previous per-host `headers()` branch was dead code (and
// a Dynamic API that blocked this route from ever being cached). If
// subdomains are ever enabled, per-subdomain sitemaps need their own
// mechanism (a dynamic `[host]` route or the feature shipping its own).
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const rootDomain = getRootDomain();
  const categories = await getCategories();

  // Apex: aggregator homepage + a pointer to every category's own site,
  // plus every published article site-wide (see getAllPublishedArticles -
  // this used to silently cap at the newest 20 forever). `enArticles` is the
  // English translation edition, served at /en/{slug} (see app/(public-en)).
  const [articles, enArticles, pages] = await Promise.all([
    getAllPublishedArticles(),
    getAllPublishedArticles({ language: "en" }),
    getPages(),
  ]);
  const apexUrl = `https://${rootDomain}`;

  return [
    {
      url: apexUrl,
      lastModified: new Date(),
      changeFrequency: "hourly",
      priority: 1.0,
    },
    {
      url: `${apexUrl}/news`,
      lastModified: new Date(),
      changeFrequency: "hourly",
      priority: 0.8,
    },
    ...(enArticles.length > 0
      ? [
          {
            url: `${apexUrl}/en`,
            lastModified: new Date(),
            changeFrequency: "hourly" as const,
            priority: 0.7,
          },
          {
            url: `${apexUrl}/en/news`,
            lastModified: new Date(),
            changeFrequency: "hourly" as const,
            priority: 0.6,
          },
        ]
      : []),
    ...pages.map((page) => ({
      url: `${apexUrl}/${page.slug}`,
      lastModified: new Date(page.updatedAt),
      changeFrequency: "monthly" as const,
      priority: 0.3,
    })),
    // Lists every category flatly, including subcategories (each is a real
    // indexable page - see getCategoryUrl) - slightly lower priority than a
    // top-level category, mirroring how deep a page sits in the site's
    // topic hierarchy.
    ...categories.map((category) => ({
      url: getCategoryUrl(category, rootDomain),
      lastModified: new Date(),
      changeFrequency: "daily" as const,
      priority: category.parentId ? 0.5 : 0.7,
    })),
    ...articles.map((article) => ({
      url: getArticleUrl(article, rootDomain),
      lastModified: article.publishedAt ? new Date(article.publishedAt) : new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
    ...enArticles.map((article) => ({
      url: `${apexUrl}/en/${article.slug}`,
      lastModified: article.publishedAt ? new Date(article.publishedAt) : new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
  ];
}

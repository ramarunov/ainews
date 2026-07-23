import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { getCategories, getPages, getPublishedArticles } from "@/lib/public-api";
import { getArticleUrl, getCategoryUrl, getRootDomain, resolveHostCategory } from "@/lib/site-url";

// Per-host: the apex sitemap lists apex-only pages plus a cross-category
// pointer to each category's own homepage (its full article list now lives
// under that category's own sitemap, not here) - a category subdomain's
// sitemap lists only that category's own articles. See proxy.ts for how
// `Host` maps to "apex" vs. a specific category.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const hostname = (await headers()).get("host")?.split(":")[0] ?? "";
  const rootDomain = getRootDomain();
  const categories = await getCategories();
  const activeCategory = resolveHostCategory(hostname, rootDomain, categories);

  if (activeCategory) {
    // getPublishedArticles already rolls subcategory articles up onto their
    // parent's listing (see PublicSiteService.listPublished) - the
    // subcategories themselves also need their own <url> entries here,
    // since each one is a real indexable page at this same host.
    const children = categories.filter(
      (c) => c.parentId === activeCategory.id && c.isActive !== false,
    );
    const { data: articles } = await getPublishedArticles({
      categorySlug: activeCategory.slug,
      limit: 20,
    });
    return [
      {
        url: getCategoryUrl(activeCategory, rootDomain),
        lastModified: new Date(),
        changeFrequency: "hourly",
        priority: 1.0,
      },
      ...children.map((child) => ({
        url: getCategoryUrl(child, rootDomain),
        lastModified: new Date(),
        changeFrequency: "daily" as const,
        priority: 0.7,
      })),
      ...articles.map((article) => ({
        url: getArticleUrl(article, rootDomain),
        lastModified: article.publishedAt ? new Date(article.publishedAt) : new Date(),
        changeFrequency: "weekly" as const,
        priority: 0.6,
      })),
    ];
  }

  // Apex: aggregator homepage + a pointer to every category's own site
  // (first page only, up to 20 articles across the whole aggregator — fine
  // for now given how few published articles exist; paginate this once
  // that stops being true).
  const [{ data: articles }, pages] = await Promise.all([getPublishedArticles(), getPages()]);
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
  ];
}

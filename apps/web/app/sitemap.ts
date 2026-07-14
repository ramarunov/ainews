import type { MetadataRoute } from "next";
import { getCategories, getPublishedArticles } from "@/lib/public-api";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3100";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // First page only (up to 20 articles) — fine for now given how few
  // published articles exist; paginate this once that stops being true.
  const [{ data: articles }, categories] = await Promise.all([
    getPublishedArticles(),
    getCategories(),
  ]);

  return [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: "hourly",
      priority: 1.0,
    },
    {
      url: `${SITE_URL}/news`,
      lastModified: new Date(),
      changeFrequency: "hourly",
      priority: 0.8,
    },
    ...categories.map((category) => ({
      url: `${SITE_URL}/category/${category.slug}`,
      lastModified: new Date(),
      changeFrequency: "daily" as const,
      priority: 0.7,
    })),
    ...articles.map((article) => ({
      url: `${SITE_URL}/news/${article.slug}`,
      lastModified: article.publishedAt ? new Date(article.publishedAt) : new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
  ];
}

import type { MetadataRoute } from "next";
import { getPublishedArticles } from "@/lib/public-api";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3100";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // First page only (up to 20 articles) — fine for now given how few
  // published articles exist; paginate this once that stops being true.
  const { data: articles } = await getPublishedArticles();

  return [
    {
      url: `${SITE_URL}/news`,
      lastModified: new Date(),
      changeFrequency: "hourly",
      priority: 0.8,
    },
    ...articles.map((article) => ({
      url: `${SITE_URL}/news/${article.slug}`,
      lastModified: article.publishedAt ? new Date(article.publishedAt) : new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
  ];
}

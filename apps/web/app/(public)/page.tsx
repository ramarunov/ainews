import type { Metadata } from "next";
import Link from "next/link";
import { ArticleCard } from "@/components/public/article-card";
import { BreakingNewsBanner } from "@/components/public/breaking-news-banner";
import { TrendingList } from "@/components/public/trending-list";
import { AdSlot } from "@/components/public/ad-slot";
import { getCategoryColors } from "@/lib/category-colors";
import {
  getCategories,
  getPublicSettings,
  getPublishedArticles,
} from "@/lib/public-api";
import type { PublicSetting } from "@/lib/types";

export const metadata: Metadata = {
  title: "Pulse Daily — Independent, fast, and to the point",
  description: "The latest breaking news, analysis, and stories from Pulse Daily.",
};

function findSetting(settings: PublicSetting[], key: string) {
  return settings.find((s) => s.key === key)?.value as
    | { enabled?: boolean; html?: string }
    | undefined;
}

export default async function HomePage() {
  const [breaking, featured, latest, trending, categories, settings] = await Promise.all([
    getPublishedArticles({ isBreaking: true, limit: 5 }),
    getPublishedArticles({ isFeatured: true, limit: 1 }),
    getPublishedArticles({ limit: 13 }),
    getPublishedArticles({ sortBy: "viewCount", limit: 5 }),
    getCategories(),
    getPublicSettings(),
  ]);

  const heroArticle = featured.data[0] ?? latest.data[0];
  const secondaryArticles = latest.data
    .filter((a) => a.id !== heroArticle?.id)
    .slice(0, 4);
  const latestStrip = latest.data
    .filter((a) => a.id !== heroArticle?.id)
    .slice(4, 9);

  const categorySections = await Promise.all(
    categories.slice(0, 4).map(async (category) => ({
      category,
      articles: (await getPublishedArticles({ categorySlug: category.slug, limit: 5 })).data,
    })),
  );

  return (
    <div className="flex flex-col gap-10 pb-16">
      <BreakingNewsBanner articles={breaking.data} />

      {heroArticle && (
        <section className="mx-auto grid w-full max-w-6xl gap-8 px-4 pt-8 lg:grid-cols-3">
          <ArticleCard article={heroArticle} variant="hero" className="lg:col-span-2" />
          <div className="flex flex-col gap-5 divide-y">
            {secondaryArticles.map((article) => (
              <ArticleCard
                key={article.id}
                article={article}
                variant="secondary"
                className="pt-5 first:pt-0"
              />
            ))}
          </div>
        </section>
      )}

      <div className="mx-auto w-full max-w-6xl px-4">
        <AdSlot value={findSetting(settings, "ads.header")} className="flex justify-center" />
      </div>

      {latestStrip.length > 0 && (
        <section className="border-y bg-[var(--zone)] py-6">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4">
            <div className="flex items-center gap-2">
              <span className="h-4 w-1 rounded-full bg-primary" />
              <h2 className="text-base font-black tracking-tight uppercase">Berita Terkini</h2>
            </div>
            <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              {latestStrip.map((article) => (
                <ArticleCard key={article.id} article={article} variant="list" />
              ))}
            </div>
          </div>
        </section>
      )}

      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-10">
          {categorySections.map(({ category, articles }) => {
            if (articles.length === 0) return null;
            const colors = getCategoryColors(category.slug ?? category.name);
            const [lead, ...rest] = articles;
            return (
              <section key={category.id} className="flex flex-col gap-5">
                <div className={`flex items-center justify-between border-b-2 pb-2 ${colors.border}`}>
                  <h2 className={`text-xl font-black tracking-tight uppercase ${colors.text}`}>
                    {category.name}
                  </h2>
                  <Link
                    href={`/category/${category.slug}`}
                    className={`text-sm font-semibold hover:underline ${colors.text}`}
                  >
                    Lihat semua &rarr;
                  </Link>
                </div>
                <div className="grid gap-6 lg:grid-cols-2">
                  {lead && <ArticleCard article={lead} variant="horizontal" className="lg:row-span-2" />}
                  <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-1">
                    {rest.slice(0, 4).map((article) => (
                      <ArticleCard key={article.id} article={article} variant="secondary" />
                    ))}
                  </div>
                </div>
              </section>
            );
          })}

          {categorySections.every(({ articles }) => articles.length === 0) && (
            <p className="py-12 text-center text-muted-foreground">
              No published articles yet — check back soon.
            </p>
          )}
        </div>

        <aside className="flex flex-col gap-6">
          <TrendingList articles={trending.data} />
          <AdSlot value={findSetting(settings, "ads.sidebar")} />
        </aside>
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import { ArticleCard } from "@/components/public/article-card";
import { BreakingNewsBanner } from "@/components/public/breaking-news-banner";
import { AdSlot } from "@/components/public/ad-slot";
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
  const [breaking, featured, latest, categories, settings] = await Promise.all([
    getPublishedArticles({ isBreaking: true, limit: 5 }),
    getPublishedArticles({ isFeatured: true, limit: 1 }),
    getPublishedArticles({ limit: 9 }),
    getCategories(),
    getPublicSettings(),
  ]);

  const heroArticle = featured.data[0] ?? latest.data[0];
  const secondaryArticles = latest.data
    .filter((a) => a.id !== heroArticle?.id)
    .slice(0, 4);

  const categorySections = await Promise.all(
    categories.slice(0, 3).map(async (category) => ({
      category,
      articles: (await getPublishedArticles({ categorySlug: category.slug, limit: 4 })).data,
    })),
  );

  return (
    <div className="flex flex-col gap-10 pb-16">
      <BreakingNewsBanner articles={breaking.data} />

      {heroArticle && (
        <section className="mx-auto grid w-full max-w-6xl gap-8 px-4 pt-8 lg:grid-cols-3">
          <ArticleCard article={heroArticle} variant="hero" className="lg:col-span-2" />
          <div className="flex flex-col gap-6 divide-y">
            {secondaryArticles.map((article) => (
              <ArticleCard key={article.id} article={article} variant="list" className="pt-6 first:pt-0" />
            ))}
          </div>
        </section>
      )}

      <div className="mx-auto w-full max-w-6xl px-4">
        <AdSlot value={findSetting(settings, "ads.header")} className="flex justify-center" />
      </div>

      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 lg:grid-cols-[1fr_300px]">
        <div className="flex flex-col gap-10">
          {categorySections.map(
            ({ category, articles }) =>
              articles.length > 0 && (
                <section key={category.id} className="flex flex-col gap-4">
                  <div className="flex items-center justify-between border-b-2 border-primary pb-2">
                    <h2 className="text-xl font-black uppercase tracking-tight">{category.name}</h2>
                    <a
                      href={`/category/${category.slug}`}
                      className="text-sm font-semibold text-primary hover:underline"
                    >
                      See all &rarr;
                    </a>
                  </div>
                  <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                    {articles.map((article) => (
                      <ArticleCard key={article.id} article={article} variant="medium" />
                    ))}
                  </div>
                </section>
              ),
          )}

          {categorySections.every(({ articles }) => articles.length === 0) && (
            <p className="py-12 text-center text-muted-foreground">
              No published articles yet — check back soon.
            </p>
          )}
        </div>

        <aside className="flex flex-col gap-4">
          <AdSlot value={findSetting(settings, "ads.sidebar")} />
        </aside>
      </div>
    </div>
  );
}

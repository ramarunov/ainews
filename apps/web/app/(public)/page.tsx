import type { Metadata } from "next";
import Link from "next/link";
import { ArticleCard } from "@/components/public/article-card";
import { BreakingNewsBanner } from "@/components/public/breaking-news-banner";
import { HomepageWidget } from "@/components/public/homepage-widget";
import { CategoryMosaicCard } from "@/components/public/category-mosaic-card";
import { AdSlot } from "@/components/public/ad-slot";
import { getCategoryColors } from "@/lib/category-colors";
import { getCategoryUrl, getRootDomain } from "@/lib/site-url";
import {
  findPublicSetting,
  getCategories,
  getPublicSettings,
  getPublishedArticles,
} from "@/lib/public-api";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/brand";
import type { HomepageSeoSetting, HomepageWidgetsSetting, SiteBrandingSetting } from "@/lib/types";

// Only this many categories get the full lead+grid treatment on the
// homepage - the rest still get real visibility via the compact mosaic
// section below, so a growing category list (finance, sports, politics,
// tech, automotive, health, travel, celebrity, "and other topics"...)
// never turns the homepage into an endless scroll of full sections.
const FEATURED_CATEGORY_COUNT = 3;

const DEFAULT_HOMEPAGE_WIDGETS: HomepageWidgetsSetting = {
  widgets: [{ type: "trending", enabled: true }],
};

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getPublicSettings();
  const seo = findPublicSetting<HomepageSeoSetting>(settings, "site.homepage_seo");

  return {
    title: seo?.title || `${SITE_NAME} — ${SITE_TAGLINE}`,
    description:
      seo?.description || `The latest breaking news, analysis, and stories from ${SITE_NAME}.`,
    alternates: {
      canonical: `https://${getRootDomain()}`,
      types: { "application/rss+xml": `https://${getRootDomain()}/feed` },
    },
    ...(seo?.ogImageUrl && { openGraph: { images: [seo.ogImageUrl] } }),
  };
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

  // getCategories() now returns subcategories flatly alongside top-level
  // ones (see public-api.ts) - the homepage's category sections are for
  // the site's main sections only, same as the footer's category widget.
  const topLevelCategories = categories.filter((c) => !c.parentId);
  const featuredCategories = topLevelCategories.slice(0, FEATURED_CATEGORY_COUNT);
  const otherCategories = topLevelCategories.slice(FEATURED_CATEGORY_COUNT);

  const [categorySections, mosaicSections] = await Promise.all([
    Promise.all(
      featuredCategories.map(async (category) => ({
        category,
        articles: (await getPublishedArticles({ categorySlug: category.slug, limit: 5 })).data,
      })),
    ),
    Promise.all(
      otherCategories.map(async (category) => ({
        category,
        articles: (await getPublishedArticles({ categorySlug: category.slug, limit: 4 })).data,
      })),
    ),
  ]);

  const rootDomain = getRootDomain();
  const apexUrl = `https://${rootDomain}`;
  const branding = findPublicSetting<SiteBrandingSetting>(settings, "site.branding");
  // Organization/WebSite (with a sitelinks-search-box SearchAction) — the
  // homepage-level schema.org types; NewsArticle lives on the article page
  // itself, CollectionPage/BreadcrumbList on category pages.
  const homeSchema = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: SITE_NAME,
      url: apexUrl,
      ...(branding?.logoUrl && { logo: branding.logoUrl }),
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: SITE_NAME,
      url: apexUrl,
      potentialAction: {
        "@type": "SearchAction",
        target: `${apexUrl}/search?q={search_term_string}`,
        "query-input": "required name=search_term_string",
      },
    },
  ];

  return (
    <div className="flex flex-col gap-10 pb-16">
      <script
        type="application/ld+json"
        // Static, app-defined values only (SITE_NAME/URLs) - no
        // user-authored content flows through here, unlike the article
        // page's schema, so no "</script>"-breakout escaping is needed.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(homeSchema) }}
      />
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
        <AdSlot value={findPublicSetting(settings, "ads.header")} className="flex justify-center" />
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
                    href={getCategoryUrl(category)}
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

          {categorySections.every(({ articles }) => articles.length === 0) &&
            mosaicSections.every(({ articles }) => articles.length === 0) && (
              <p className="py-12 text-center text-muted-foreground">
                Belum ada artikel yang diterbitkan — cek kembali nanti.
              </p>
            )}
        </div>

        <aside className="flex flex-col gap-6">
          {(
            findPublicSetting<HomepageWidgetsSetting>(settings, "site.homepage_widgets") ??
            DEFAULT_HOMEPAGE_WIDGETS
          ).widgets.map((widget, idx) => (
            <HomepageWidget
              key={idx}
              widget={widget}
              trendingArticles={trending.data}
              categories={categories}
            />
          ))}
          <AdSlot value={findPublicSetting(settings, "ads.sidebar")} />
        </aside>
      </div>

      {mosaicSections.some(({ articles }) => articles.length > 0) && (
        <section className="border-t bg-[var(--zone)] py-8">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4">
            <div className="flex items-center gap-2">
              <span className="h-4 w-1 rounded-full bg-primary" />
              <h2 className="text-base font-black tracking-tight uppercase">Kanal Lainnya</h2>
            </div>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {mosaicSections.map(
                ({ category, articles }) =>
                  articles.length > 0 && (
                    <CategoryMosaicCard key={category.id} category={category} articles={articles} />
                  ),
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

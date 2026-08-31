import type { Metadata } from "next";
import Link from "next/link";
import { ArticleCard } from "@/components/public/article-card";
import { BreakingNewsBanner } from "@/components/public/breaking-news-banner";
import { FootballScheduleWidget } from "@/components/public/football-schedule-widget";
import { GoldPriceWidget } from "@/components/public/gold-price-widget";
import { HomepageWidget } from "@/components/public/homepage-widget";
import { CategoryMosaicCard } from "@/components/public/category-mosaic-card";
import { AdSlot } from "@/components/public/ad-slot";
import { getCategoryColors } from "@/lib/category-colors";
import { getRootDomain } from "@/lib/site-url";
import {
  findPublicSetting,
  getCategories,
  getPublicSettings,
  getPublishedArticles,
} from "@/lib/public-api";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/brand";
import { getT, categoryLabel, type Locale } from "@/lib/i18n";
import type { HomepageSeoSetting, HomepageWidgetsSetting, SiteBrandingSetting } from "@/lib/types";

// Shared homepage view for both editions. app/(public)/page.tsx renders it
// with locale="id" (the real homepage), app/(public-en)/en/page.tsx with
// locale="en" (the English edition, every list scoped to language="en").

const FEATURED_CATEGORY_COUNT = 3;

const DEFAULT_HOMEPAGE_WIDGETS: HomepageWidgetsSetting = {
  widgets: [{ type: "trending", enabled: true }],
};

export async function buildHomeMetadata(locale: Locale): Promise<Metadata> {
  const rootDomain = getRootDomain();
  const apex = `https://${rootDomain}`;
  const t = getT(locale);

  if (locale === "en") {
    return {
      title: { absolute: `${SITE_NAME} — English Edition` },
      description: `${t("home.metaDescription")} ${SITE_NAME}.`,
      alternates: {
        canonical: `${apex}/en`,
        types: { "application/rss+xml": `${apex}/en/feed` },
        languages: { id: `${apex}/`, en: `${apex}/en`, "x-default": `${apex}/` },
      },
      openGraph: {
        title: `${SITE_NAME} — English Edition`,
        description: `${t("home.metaDescription")} ${SITE_NAME}.`,
        url: `${apex}/en`,
        siteName: SITE_NAME,
        locale: "en_US",
        type: "website",
      },
    };
  }

  const settings = await getPublicSettings();
  const seo = findPublicSetting<HomepageSeoSetting>(settings, "site.homepage_seo");
  return {
    title: seo?.title || `${SITE_NAME} — ${SITE_TAGLINE}`,
    description:
      seo?.description || `The latest breaking news, analysis, and stories from ${SITE_NAME}.`,
    alternates: {
      canonical: apex,
      types: { "application/rss+xml": `${apex}/feed` },
    },
    ...(seo?.ogImageUrl && { openGraph: { images: [seo.ogImageUrl] } }),
  };
}

export async function HomePage({ locale = "id" }: { locale?: Locale }) {
  const t = getT(locale);
  const lang = locale === "en" ? "en" : undefined;
  const catHref = (slug: string) => (locale === "en" ? `/en/category/${slug}` : `/category/${slug}`);

  const [breaking, featured, latest, trending, categories, settings] = await Promise.all([
    getPublishedArticles({ isBreaking: true, limit: 5, language: lang }),
    getPublishedArticles({ isFeatured: true, limit: 1, language: lang }),
    getPublishedArticles({ limit: 13, language: lang }),
    getPublishedArticles({ sortBy: "viewCount", limit: 5, language: lang }),
    getCategories(),
    getPublicSettings(),
  ]);

  const heroArticle = featured.data[0] ?? latest.data[0];
  const secondaryArticles = latest.data.filter((a) => a.id !== heroArticle?.id).slice(0, 4);
  const latestStrip = latest.data.filter((a) => a.id !== heroArticle?.id).slice(4, 9);

  const topLevelCategories = categories.filter((c) => !c.parentId);
  const featuredCategories = topLevelCategories.slice(0, FEATURED_CATEGORY_COUNT);
  const otherCategories = topLevelCategories.slice(FEATURED_CATEGORY_COUNT);

  const [categorySections, mosaicSections] = await Promise.all([
    Promise.all(
      featuredCategories.map(async (category) => ({
        category,
        articles: (await getPublishedArticles({ categorySlug: category.slug, limit: 5, language: lang }))
          .data,
      })),
    ),
    Promise.all(
      otherCategories.map(async (category) => ({
        category,
        articles: (await getPublishedArticles({ categorySlug: category.slug, limit: 4, language: lang }))
          .data,
      })),
    ),
  ]);

  const rootDomain = getRootDomain();
  const apexUrl = `https://${rootDomain}${locale === "en" ? "/en" : ""}`;
  const branding = findPublicSetting<SiteBrandingSetting>(settings, "site.branding");
  const publisher = findPublicSetting<{
    sameAs?: string[];
    foundingDate?: string;
    ethicsPolicyUrl?: string;
    correctionsPolicyUrl?: string;
    diversityPolicyUrl?: string;
  }>(settings, "site.publisher");

  const homeSchema = [
    {
      "@context": "https://schema.org",
      "@type": "NewsMediaOrganization",
      name: SITE_NAME,
      url: `https://${rootDomain}`,
      ...(branding?.logoUrl && { logo: { "@type": "ImageObject", url: branding.logoUrl } }),
      ...(publisher?.sameAs?.length && { sameAs: publisher.sameAs }),
      ...(publisher?.foundingDate && { foundingDate: publisher.foundingDate }),
      ...(publisher?.ethicsPolicyUrl && { ethicsPolicy: publisher.ethicsPolicyUrl }),
      ...(publisher?.correctionsPolicyUrl && { correctionsPolicy: publisher.correctionsPolicyUrl }),
      ...(publisher?.diversityPolicyUrl && { diversityPolicy: publisher.diversityPolicyUrl }),
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: locale === "en" ? `${SITE_NAME} — English` : SITE_NAME,
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
        dangerouslySetInnerHTML={{ __html: JSON.stringify(homeSchema).replace(/</g, "\\u003c") }}
      />
      <BreakingNewsBanner articles={breaking.data} locale={locale} />

      {heroArticle && (
        <section className="mx-auto grid w-full max-w-6xl gap-8 px-4 pt-8 lg:grid-cols-3">
          <ArticleCard article={heroArticle} variant="hero" locale={locale} className="lg:col-span-2" />
          <div className="flex flex-col gap-5 divide-y">
            {secondaryArticles.map((article) => (
              <ArticleCard
                key={article.id}
                article={article}
                variant="secondary"
                locale={locale}
                className="pt-5 first:pt-0"
              />
            ))}
          </div>
        </section>
      )}

      <FootballScheduleWidget locale={locale} />

      <div className="mx-auto w-full max-w-6xl px-4">
        <AdSlot
          value={findPublicSetting(settings, "ads.header")}
          className="flex min-h-[50px] items-center justify-center sm:min-h-[90px]"
        />
      </div>

      {latestStrip.length > 0 && (
        <section className="border-y bg-[var(--zone)] py-6">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4">
            <div className="flex items-center gap-2">
              <span className="h-4 w-1 rounded-full bg-primary" />
              <h2 className="text-base font-black tracking-tight uppercase">{t("home.latestNews")}</h2>
            </div>
            <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              {latestStrip.map((article) => (
                <ArticleCard key={article.id} article={article} variant="list" locale={locale} />
              ))}
            </div>
          </div>
        </section>
      )}

      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-10">
          {categorySections.map(({ category, articles }, index) => {
            if (articles.length === 0) return null;
            const colors = getCategoryColors(category.slug ?? category.name);
            const [lead, ...rest] = articles;
            const template = index % 3;

            return (
              <section key={category.id} className="flex flex-col gap-5">
                <div className={`flex items-center justify-between border-b-2 pb-2 ${colors.border}`}>
                  <h2 className={`text-xl font-black tracking-tight uppercase ${colors.text}`}>
                    {categoryLabel(category, locale)}
                  </h2>
                  <Link
                    href={catHref(category.slug)}
                    className={`text-sm font-semibold hover:underline ${colors.text}`}
                  >
                    {t("home.viewAll")} &rarr;
                  </Link>
                </div>

                {template === 0 && (
                  <div className="flex flex-col gap-5">
                    {lead && <ArticleCard article={lead} variant="horizontal" locale={locale} />}
                    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                      {rest.slice(0, 4).map((article) => (
                        <ArticleCard key={article.id} article={article} variant="medium" locale={locale} />
                      ))}
                    </div>
                  </div>
                )}

                {template === 1 && (
                  <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
                    {articles.slice(0, 5).map((article) => (
                      <ArticleCard key={article.id} article={article} variant="list" locale={locale} />
                    ))}
                  </div>
                )}

                {template === 2 && (
                  <div className="grid gap-6 lg:grid-cols-2">
                    {lead && (
                      <ArticleCard
                        article={lead}
                        variant="horizontal"
                        locale={locale}
                        className="lg:row-span-2"
                      />
                    )}
                    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-1">
                      {rest.slice(0, 4).map((article) => (
                        <ArticleCard
                          key={article.id}
                          article={article}
                          variant="secondary"
                          locale={locale}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </section>
            );
          })}

          {categorySections.every(({ articles }) => articles.length === 0) &&
            mosaicSections.every(({ articles }) => articles.length === 0) && (
              <p className="py-12 text-center text-muted-foreground">{t("home.noArticles")}</p>
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
              locale={locale}
            />
          ))}
          <AdSlot
            value={findPublicSetting(settings, "ads.sidebar")}
            className="flex min-h-[250px] items-center justify-center"
          />
          <GoldPriceWidget locale={locale} />
        </aside>
      </div>

      {mosaicSections.some(({ articles }) => articles.length > 0) && (
        <section className="border-t bg-[var(--zone)] py-8">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4">
            <div className="flex items-center gap-2">
              <span className="h-4 w-1 rounded-full bg-primary" />
              <h2 className="text-base font-black tracking-tight uppercase">{t("home.otherChannels")}</h2>
            </div>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {mosaicSections.map(
                ({ category, articles }) =>
                  articles.length > 0 && (
                    <CategoryMosaicCard
                      key={category.id}
                      category={category}
                      articles={articles}
                      locale={locale}
                    />
                  ),
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound, permanentRedirect } from "next/navigation";
import { ArticleCard } from "@/components/public/article-card";
import { TrendingList } from "@/components/public/trending-list";
import { Breadcrumb } from "@/components/public/breadcrumb";
import { Pagination } from "@/components/public/pagination";
import { getCategoryColors } from "@/lib/category-colors";
import { getCategoryBySlug, getPublishedArticles } from "@/lib/public-api";
import { getCategoryUrl, getRootDomain, isCategorySubdomainsEnabled } from "@/lib/site-url";
import { SITE_NAME } from "@/lib/brand";
import { getT, categoryLabel, type Locale } from "@/lib/i18n";

// Shared category-archive view. app/(public)/category/[slug]/page.tsx renders
// it with locale="id"; app/(public-en)/en/category/[slug]/page.tsx with
// locale="en" (articles scoped to language="en", /en/* URLs, apex-only so
// no category-subdomain redirect).

interface Args {
  slug: string;
  page: number;
  locale: Locale;
}

function categoryPath(slug: string, locale: Locale) {
  return locale === "en" ? `/en/category/${slug}` : `/category/${slug}`;
}

export async function buildCategoryMetadata({ slug, page, locale }: Args): Promise<Metadata> {
  const category = await getCategoryBySlug(slug);
  if (!category) return {};
  const t = getT(locale);
  const rootDomain = getRootDomain();
  const base =
    locale === "en"
      ? `https://${rootDomain}/en/category/${category.slug}`
      : getCategoryUrl(category);
  const canonical = page > 1 ? `${base}?page=${page}` : base;
  const idBase = getCategoryUrl(category);
  const label = categoryLabel(category, locale);
  return {
    title: category.metaTitle || label,
    description:
      category.metaDescription ||
      category.description ||
      `${label} ${t("category.latestToday")} | ${SITE_NAME}`,
    alternates: {
      canonical,
      types: {
        "application/rss+xml": `${idBase.replace(/\/$/, "")}/feed${locale === "en" ? "?lang=en" : ""}`,
      },
      ...(locale === "en" && {
        languages: {
          id: idBase,
          en: `https://${rootDomain}/en/category/${category.slug}`,
          "x-default": idBase,
        },
      }),
    },
  };
}

export async function CategoryPage({ slug, page, locale }: Args) {
  const t = getT(locale);
  const lang = locale === "en" ? "en" : undefined;

  const category = await getCategoryBySlug(slug);
  if (!category) notFound();

  // Wrong-host canonical redirect only applies to the Indonesian edition
  // (category subdomains); the English edition is apex-only.
  if (locale !== "en" && isCategorySubdomainsEnabled()) {
    const requestHostname = (await headers()).get("host")?.split(":")[0] ?? "";
    const canonicalCategoryUrl = getCategoryUrl(category, getRootDomain());
    const canonicalHostname = new URL(canonicalCategoryUrl).hostname;
    if (requestHostname && requestHostname !== canonicalHostname) {
      const redirectUrl = new URL(canonicalCategoryUrl);
      if (page > 1) redirectUrl.searchParams.set("page", String(page));
      permanentRedirect(redirectUrl.toString());
    }
  }

  const [{ data: articles, meta }, trending] = await Promise.all([
    getPublishedArticles({ categorySlug: slug, page, limit: 13, language: lang }),
    getPublishedArticles({ categorySlug: slug, sortBy: "viewCount", limit: 5, language: lang }),
  ]);

  const colors = getCategoryColors(category.slug ?? category.name);
  const label = categoryLabel(category, locale);
  const [lead, ...rest] = articles;
  const rootDomain = getRootDomain();
  const categoryUrl =
    locale === "en"
      ? `https://${rootDomain}/en/category/${category.slug}`
      : getCategoryUrl(category, rootDomain);
  const children = category.children ?? [];
  const homeHref = locale === "en" ? `https://${rootDomain}/en` : `https://${rootDomain}`;
  const breadcrumbItems = [
    { label: t("nav.home"), href: homeHref },
    ...(category.parent
      ? [
          {
            label: categoryLabel(category.parent, locale),
            href:
              locale === "en"
                ? `https://${rootDomain}/en/category/${category.parent.slug}`
                : getCategoryUrl(category.parent, rootDomain),
          },
        ]
      : []),
    { label },
  ];

  const categorySchema = [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: category.metaTitle || label,
      description: category.metaDescription || category.description || undefined,
      url: categoryUrl,
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: breadcrumbItems.map((item, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: item.label,
        item: item.href ?? categoryUrl,
      })),
    },
  ];

  return (
    <div className="flex flex-col gap-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(categorySchema) }}
      />
      <div className={`${colors.badge} py-10`}>
        <div className="mx-auto w-full max-w-6xl px-4">
          <Breadcrumb className="mb-3 text-white" items={breadcrumbItems} />
          <h1 className="text-4xl font-black tracking-tight text-white uppercase md:text-5xl">
            {label}
          </h1>
          {category.description && (
            <p className="mt-2 max-w-2xl text-white/80">{category.description}</p>
          )}
          {children.length > 0 && (
            <nav className="mt-4 flex flex-wrap gap-2">
              {children.map((child) => (
                <Link
                  key={child.id}
                  href={
                    locale === "en"
                      ? `/en/category/${child.slug}`
                      : getCategoryUrl(child, rootDomain)
                  }
                  className="rounded-full border border-white/40 px-3 py-1 text-xs font-bold tracking-wide text-white uppercase hover:bg-white/10"
                >
                  {categoryLabel(child, locale)}
                </Link>
              ))}
            </nav>
          )}
        </div>
      </div>

      <div className="mx-auto w-full max-w-6xl px-4 pb-16">
        {articles.length === 0 && (
          <p className="py-12 text-center text-muted-foreground">{t("category.emptyCategory")}</p>
        )}

        {articles.length > 0 && (
          <div className="grid gap-10 lg:grid-cols-[1fr_320px]">
            <div className="flex flex-col gap-8">
              {page === 1 && lead && <ArticleCard article={lead} variant="hero" locale={locale} />}
              <div className="grid gap-8 sm:grid-cols-2">
                {(page === 1 ? rest : articles).map((article) => (
                  <ArticleCard key={article.id} article={article} variant="medium" locale={locale} />
                ))}
              </div>

              <Pagination
                currentPage={page}
                totalPages={meta.totalPages}
                basePath={categoryPath(slug, locale)}
                locale={locale}
              />
            </div>

            <aside className="flex flex-col gap-6">
              <TrendingList
                articles={trending.data}
                title={`${t("category.popularIn")} ${label}`}
                locale={locale}
              />
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}

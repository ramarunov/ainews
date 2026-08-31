import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArticleCard } from "@/components/public/article-card";
import { TrendingList } from "@/components/public/trending-list";
import { Breadcrumb } from "@/components/public/breadcrumb";
import { Pagination } from "@/components/public/pagination";
import { getTagBySlug, getPublishedArticles } from "@/lib/public-api";
import { getRootDomain } from "@/lib/site-url";
import { SITE_NAME } from "@/lib/brand";
import { getT, type Locale } from "@/lib/i18n";

interface Args {
  slug: string;
  page: number;
  locale: Locale;
}

function tagPath(slug: string, locale: Locale) {
  return locale === "en" ? `/en/tag/${slug}` : `/tag/${slug}`;
}

export async function buildTagMetadata({ slug, page, locale }: Args): Promise<Metadata> {
  const tag = await getTagBySlug(slug);
  if (!tag) return {};
  const t = getT(locale);
  const rootDomain = getRootDomain();
  const idUrl = `https://${rootDomain}/tag/${tag.slug}`;
  const enUrl = `https://${rootDomain}/en/tag/${tag.slug}`;
  const base = locale === "en" ? enUrl : idUrl;
  const canonical = page > 1 ? `${base}?page=${page}` : base;
  return {
    title: `#${tag.name}`,
    description: tag.description || `${t("tag.topicNews")} ${tag.name} · ${SITE_NAME}.`,
    alternates: {
      canonical,
      ...(locale === "en" && {
        languages: { id: idUrl, en: enUrl, "x-default": idUrl },
      }),
    },
  };
}

export async function TagPage({ slug, page, locale }: Args) {
  const t = getT(locale);
  const lang = locale === "en" ? "en" : undefined;

  const tag = await getTagBySlug(slug);
  if (!tag) notFound();

  const rootDomain = getRootDomain();

  const [{ data: articles, meta }, trending] = await Promise.all([
    getPublishedArticles({ tagSlug: slug, page, limit: 13, language: lang }),
    getPublishedArticles({ sortBy: "viewCount", limit: 5, language: lang }),
  ]);

  const tagUrl =
    locale === "en"
      ? `https://${rootDomain}/en/tag/${tag.slug}`
      : `https://${rootDomain}/tag/${tag.slug}`;
  const homeHref = locale === "en" ? `https://${rootDomain}/en` : `https://${rootDomain}`;

  const breadcrumbItems = [
    { label: t("nav.home"), href: homeHref },
    { label: `#${tag.name}` },
  ];

  const tagSchema = [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: `#${tag.name}`,
      description: tag.description || undefined,
      url: tagUrl,
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: breadcrumbItems.map((item, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: item.label,
        item: item.href ?? tagUrl,
      })),
    },
  ];

  return (
    <div className="flex flex-col gap-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(tagSchema) }}
      />
      <div className="bg-[var(--zone)] py-10">
        <div className="mx-auto w-full max-w-6xl px-4">
          <Breadcrumb className="mb-3" items={breadcrumbItems} />
          <h1 className="text-4xl font-black tracking-tight uppercase md:text-5xl">#{tag.name}</h1>
          {tag.description && (
            <p className="mt-2 max-w-2xl text-muted-foreground">{tag.description}</p>
          )}
        </div>
      </div>

      <div className="mx-auto w-full max-w-6xl px-4 pb-16">
        {articles.length === 0 && (
          <p className="py-12 text-center text-muted-foreground">{t("tag.empty")}</p>
        )}

        {articles.length > 0 && (
          <div className="grid gap-10 lg:grid-cols-[1fr_320px]">
            <div className="flex flex-col gap-8">
              <div className="grid gap-8 sm:grid-cols-2">
                {articles.map((article) => (
                  <ArticleCard key={article.id} article={article} variant="medium" locale={locale} />
                ))}
              </div>

              <Pagination
                currentPage={page}
                totalPages={meta.totalPages}
                basePath={tagPath(slug, locale)}
                locale={locale}
              />
            </div>

            <aside className="flex flex-col gap-6">
              <TrendingList articles={trending.data} locale={locale} />
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}

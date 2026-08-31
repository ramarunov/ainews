import type { Metadata } from "next";
import { ArticleCard } from "@/components/public/article-card";
import { Pagination } from "@/components/public/pagination";
import { getPublishedArticles } from "@/lib/public-api";
import { SITE_NAME } from "@/lib/brand";
import { getT, type Locale } from "@/lib/i18n";

export function buildNewsMetadata(locale: Locale): Metadata {
  const t = getT(locale);
  return {
    title: t("news.title"),
    description: `${t("news.metaDescription")} ${SITE_NAME}.`,
  };
}

export async function NewsPage({ page, locale }: { page: number; locale: Locale }) {
  const t = getT(locale);
  const { data: articles, meta } = await getPublishedArticles({
    page,
    limit: 18,
    ...(locale === "en" && { language: "en" }),
  });
  const basePath = locale === "en" ? "/en/news" : "/news";

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10">
      <h1 className="text-3xl font-black tracking-tight">{t("news.title")}</h1>

      {articles.length === 0 && (
        <p className="py-12 text-center text-muted-foreground">{t("home.noArticles")}</p>
      )}

      <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {articles.map((article) => (
          <ArticleCard key={article.id} article={article} variant="medium" locale={locale} />
        ))}
      </div>

      <Pagination
        currentPage={page}
        totalPages={meta.totalPages}
        basePath={basePath}
        locale={locale}
      />
    </div>
  );
}

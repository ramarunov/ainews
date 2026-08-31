import type { Metadata } from "next";
import { Search as SearchIcon } from "lucide-react";
import { ArticleCard } from "@/components/public/article-card";
import { searchPublishedArticles } from "@/lib/public-api";
import { SITE_NAME } from "@/lib/brand";
import { getT, type Locale } from "@/lib/i18n";

export function buildSearchMetadata(locale: Locale): Metadata {
  return {
    title: getT(locale)("nav.search"),
    // Internal search results are low-value duplicate-content pages from a
    // crawler's perspective - noindex, same as the Indonesian edition.
    robots: { index: false, follow: true },
  };
}

export async function SearchPage({
  q,
  page,
  locale,
}: {
  q: string;
  page: number;
  locale: Locale;
}) {
  const t = getT(locale);
  const { data: results, meta } = q.trim()
    ? await searchPublishedArticles(q, page)
    : { data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0 } };

  // The public search endpoint isn't language-scoped; on the English
  // edition, keep only rows that carry language==="en" (falls back to
  // showing nothing rather than linking /en/{slug} to a non-existent
  // translation).
  const filtered = locale === "en" ? results.filter((r) => r.language === "en") : results;

  return (
    <div className="flex flex-col gap-8">
      <div className="bg-[var(--zone)] py-10">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-4">
          <h1 className="text-3xl font-black tracking-tight">
            {t("search.title")} {SITE_NAME}
          </h1>
          <form method="GET" className="flex gap-2">
            <div className="relative flex-1">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                name="q"
                defaultValue={q}
                placeholder={t("search.placeholder")}
                className="w-full rounded-md border bg-background py-2.5 pr-4 pl-10 text-base focus:border-primary focus:outline-none"
              />
            </div>
            <button
              type="submit"
              className="rounded-md bg-primary px-6 py-2.5 font-bold text-primary-foreground hover:opacity-90"
            >
              {t("search.button")}
            </button>
          </form>
        </div>
      </div>

      <div className="mx-auto w-full max-w-4xl px-4 pb-16">
        {!q.trim() && (
          <p className="py-12 text-center text-muted-foreground">{t("search.prompt")}</p>
        )}

        {q.trim() && filtered.length === 0 && (
          <p className="py-12 text-center text-muted-foreground">
            {t("search.noResults")} &ldquo;{q}&rdquo;.
          </p>
        )}

        {filtered.length > 0 && (
          <>
            <p className="mb-6 text-sm text-muted-foreground">
              {locale === "en" ? filtered.length : meta.total} {t("search.resultsFor")} &ldquo;{q}
              &rdquo;
            </p>
            <div className="grid gap-8 sm:grid-cols-2">
              {filtered.map((article) => (
                <ArticleCard key={article.id} article={article} variant="medium" locale={locale} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

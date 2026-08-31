import Link from "next/link";
import type { Category, PublicArticle } from "@/lib/types";
import { getCategoryColors } from "@/lib/category-colors";
import { getArticleUrl, getCategoryUrl } from "@/lib/site-url";
import { getT, type Locale } from "@/lib/i18n";
import { SmartArticleImage, CategoryPlaceholder } from "./smart-article-image";

function PreviewCard({ article, locale }: { article: PublicArticle; locale: Locale }) {
  const url = article.featuredImageUrl;
  return (
    <Link
      href={locale === "en" ? `/en/${article.slug}` : getArticleUrl(article)}
      className="group flex flex-col gap-2"
    >
      {url ? (
        <SmartArticleImage
          src={url}
          alt={article.featuredImageAlt ?? article.title}
          categoryName={article.primaryCategory?.name}
          categorySlug={article.primaryCategory?.slug}
          className="aspect-video w-full rounded-md"
        />
      ) : (
        <CategoryPlaceholder
          categoryName={article.primaryCategory?.name}
          categorySlug={article.primaryCategory?.slug}
          className="aspect-video w-full rounded-md"
        />
      )}
      <h3 className="line-clamp-2 text-sm font-bold leading-snug group-hover:text-primary">
        {article.title}
      </h3>
      {article.excerpt && (
        <p className="line-clamp-2 text-xs text-muted-foreground">{article.excerpt}</p>
      )}
    </Link>
  );
}

function PreviewSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-2">
      <div className="aspect-video w-full rounded-md bg-muted" />
      <div className="h-3.5 w-full rounded bg-muted" />
      <div className="h-3.5 w-2/3 rounded bg-muted" />
    </div>
  );
}

// The flyout panel shown below the desktop category nav strip on hover —
// swaps content based on whichever category is currently hovered (see
// PublicHeader), rather than each nav item owning its own dropdown, which
// is how real mega menus stay visually simple with many categories.
export function CategoryMegaPanel({
  category,
  articles,
  loading,
  locale = "id",
}: {
  category: Category;
  articles: PublicArticle[] | undefined;
  loading: boolean;
  locale?: Locale;
}) {
  const colors = getCategoryColors(category.slug ?? category.name);
  const t = getT(locale);
  const categoryHref =
    locale === "en" ? `/en/category/${category.slug}` : getCategoryUrl(category);

  return (
    <div className={`absolute top-full left-0 z-50 w-full border-t-2 bg-background shadow-lg ${colors.border}`}>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6">
        <div className="flex items-center justify-between">
          <span className={`text-xs font-black tracking-wide uppercase ${colors.text}`}>
            {category.name}
          </span>
          <Link
            href={categoryHref}
            className={`text-xs font-semibold hover:underline ${colors.text}`}
          >
            {t("megapanel.viewAll")} &rarr;
          </Link>
        </div>

        {loading && (
          <div className="grid grid-cols-3 gap-6">
            <PreviewSkeleton />
            <PreviewSkeleton />
            <PreviewSkeleton />
          </div>
        )}

        {!loading && articles && articles.length > 0 && (
          <div className="grid grid-cols-3 gap-6">
            {articles.map((article) => (
              <PreviewCard key={article.id} article={article} locale={locale} />
            ))}
          </div>
        )}

        {!loading && articles && articles.length === 0 && (
          <p className="py-4 text-sm text-muted-foreground">{t("megapanel.empty")}</p>
        )}
      </div>
    </div>
  );
}

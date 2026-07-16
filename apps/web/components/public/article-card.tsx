import Link from "next/link";
import type { PublicArticle, PublicSearchResult } from "@/lib/types";
import { cn } from "@/lib/utils";
import { getCategoryColors } from "@/lib/category-colors";
import { SmartArticleImage, CategoryPlaceholder } from "./smart-article-image";

type CardArticle = PublicArticle | PublicSearchResult;

function formatDate(value?: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function CardImage({
  article,
  className,
}: {
  article: CardArticle;
  className?: string;
}) {
  const url = article.featuredImageUrl;
  const category = "primaryCategory" in article ? article.primaryCategory : null;

  if (!url) {
    return <CategoryPlaceholder categoryName={category?.name} categorySlug={category?.slug} className={className} />;
  }

  return (
    <SmartArticleImage
      src={url}
      alt={"featuredImageAlt" in article ? (article.featuredImageAlt ?? article.title) : article.title}
      categoryName={category?.name}
      categorySlug={category?.slug}
      className={className}
    />
  );
}

function CategoryTag({ article }: { article: CardArticle }) {
  const category = "primaryCategory" in article ? article.primaryCategory : null;
  if (!category) return null;
  const colors = getCategoryColors(category.slug ?? category.name);
  return (
    <span className={cn("text-xs font-black tracking-wide uppercase", colors.text)}>
      {category.name}
    </span>
  );
}

export function ArticleCard({
  article,
  variant = "medium",
  className,
}: {
  article: CardArticle;
  variant?: "hero" | "secondary" | "medium" | "list" | "horizontal";
  className?: string;
}) {
  const author = "primaryAuthor" in article ? article.primaryAuthor : null;
  const isBreaking = "isBreaking" in article ? article.isBreaking : false;

  if (variant === "list") {
    return (
      <Link href={`/news/${article.slug}`} className={cn("group flex gap-3", className)}>
        <CardImage article={article} className="aspect-square h-16 w-16 shrink-0 rounded-md" />
        <div className="flex min-w-0 flex-col justify-center gap-1">
          <CategoryTag article={article} />
          <h3 className="line-clamp-2 leading-snug font-bold group-hover:underline">
            {article.title}
          </h3>
          {formatDate(article.publishedAt) && (
            <span className="text-xs text-muted-foreground">{formatDate(article.publishedAt)}</span>
          )}
        </div>
      </Link>
    );
  }

  if (variant === "horizontal") {
    return (
      <Link href={`/news/${article.slug}`} className={cn("group flex gap-4", className)}>
        <CardImage article={article} className="aspect-4/3 w-36 shrink-0 rounded-md sm:w-48" />
        <div className="flex min-w-0 flex-col justify-center gap-1.5">
          <CategoryTag article={article} />
          <h3 className="line-clamp-2 text-lg leading-snug font-bold group-hover:underline">
            {article.title}
          </h3>
          {article.excerpt && (
            <p className="line-clamp-2 hidden text-sm text-muted-foreground sm:block">
              {article.excerpt}
            </p>
          )}
          {formatDate(article.publishedAt) && (
            <span className="text-xs text-muted-foreground">{formatDate(article.publishedAt)}</span>
          )}
        </div>
      </Link>
    );
  }

  if (variant === "secondary") {
    return (
      <Link href={`/news/${article.slug}`} className={cn("group flex gap-3", className)}>
        <CardImage article={article} className="aspect-square h-20 w-20 shrink-0 rounded-md" />
        <div className="flex min-w-0 flex-col justify-center gap-1">
          <CategoryTag article={article} />
          <h3 className="line-clamp-2 leading-snug font-bold group-hover:underline">
            {article.title}
          </h3>
          {formatDate(article.publishedAt) && (
            <span className="text-xs text-muted-foreground">{formatDate(article.publishedAt)}</span>
          )}
        </div>
      </Link>
    );
  }

  if (variant === "hero") {
    return (
      <Link href={`/news/${article.slug}`} className={cn("group flex flex-col gap-4", className)}>
        <CardImage article={article} className="aspect-video w-full rounded-xl shadow-sm" />
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            {isBreaking && (
              <span className="flex items-center gap-1.5 rounded bg-[var(--breaking)] px-2 py-0.5 text-xs font-black tracking-wide text-white uppercase">
                <span className="h-1.5 w-1.5 rounded-full bg-white animate-live-pulse" />
                Breaking
              </span>
            )}
            <CategoryTag article={article} />
          </div>
          <h2 className="text-3xl leading-[1.1] font-black tracking-tight group-hover:underline md:text-4xl">
            {article.title}
          </h2>
          {article.excerpt && (
            <p className="line-clamp-2 text-lg text-muted-foreground">{article.excerpt}</p>
          )}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {author?.displayName && <span className="font-semibold text-foreground">{author.displayName}</span>}
            {author?.displayName && formatDate(article.publishedAt) && <span>&middot;</span>}
            {formatDate(article.publishedAt) && <span>{formatDate(article.publishedAt)}</span>}
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link href={`/news/${article.slug}`} className={cn("group flex flex-col gap-3", className)}>
      <CardImage article={article} className="aspect-video w-full rounded-lg shadow-sm" />
      <div className="flex flex-col gap-1.5">
        <CategoryTag article={article} />
        <h3 className="line-clamp-3 text-lg leading-snug font-bold group-hover:underline">
          {article.title}
        </h3>
        {formatDate(article.publishedAt) && (
          <span className="text-xs text-muted-foreground">{formatDate(article.publishedAt)}</span>
        )}
      </div>
    </Link>
  );
}

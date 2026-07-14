import Image from "next/image";
import Link from "next/link";
import type { PublicArticle, PublicSearchResult } from "@/lib/types";
import { cn } from "@/lib/utils";

type CardArticle = PublicArticle | PublicSearchResult;

function formatDate(value?: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
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
  if (!url) {
    // No image: a solid brand-tinted block instead of a broken-image icon
    // or blank space — common treatment for text-only wire pieces.
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-gradient-to-br from-primary/90 to-primary/60 text-primary-foreground",
          className,
        )}
      >
        <span className="px-4 text-center text-sm font-semibold uppercase tracking-wide opacity-80">
          Pulse Daily
        </span>
      </div>
    );
  }

  return (
    <div className={cn("relative overflow-hidden bg-muted", className)}>
      <Image
        src={url}
        alt={"featuredImageAlt" in article ? (article.featuredImageAlt ?? article.title) : article.title}
        fill
        className="object-cover"
        unoptimized
      />
    </div>
  );
}

export function ArticleCard({
  article,
  variant = "medium",
  className,
}: {
  article: CardArticle;
  variant?: "hero" | "medium" | "list";
  className?: string;
}) {
  const category = "primaryCategory" in article ? article.primaryCategory : null;
  const author = "primaryAuthor" in article ? article.primaryAuthor : null;
  const isBreaking = "isBreaking" in article ? article.isBreaking : false;

  if (variant === "list") {
    return (
      <Link
        href={`/news/${article.slug}`}
        className={cn("group flex gap-4", className)}
      >
        <CardImage article={article} className="aspect-square h-20 w-20 shrink-0 rounded-md" />
        <div className="flex min-w-0 flex-col justify-center gap-1">
          {category && (
            <span className="text-xs font-bold uppercase tracking-wide text-primary">
              {category.name}
            </span>
          )}
          <h3 className="line-clamp-2 font-bold leading-snug group-hover:underline">
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
        <CardImage article={article} className="aspect-video w-full rounded-lg" />
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            {isBreaking && (
              <span className="rounded bg-primary px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-primary-foreground">
                Breaking
              </span>
            )}
            {category && (
              <span className="text-sm font-bold uppercase tracking-wide text-primary">
                {category.name}
              </span>
            )}
          </div>
          <h2 className="text-3xl font-black leading-tight tracking-tight group-hover:underline md:text-4xl">
            {article.title}
          </h2>
          {article.excerpt && (
            <p className="line-clamp-2 text-lg text-muted-foreground">{article.excerpt}</p>
          )}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {author?.displayName && <span className="font-medium">{author.displayName}</span>}
            {author?.displayName && formatDate(article.publishedAt) && <span>·</span>}
            {formatDate(article.publishedAt) && <span>{formatDate(article.publishedAt)}</span>}
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link href={`/news/${article.slug}`} className={cn("group flex flex-col gap-3", className)}>
      <CardImage article={article} className="aspect-video w-full rounded-md" />
      <div className="flex flex-col gap-1">
        {category && (
          <span className="text-xs font-bold uppercase tracking-wide text-primary">
            {category.name}
          </span>
        )}
        <h3 className="line-clamp-3 text-lg font-bold leading-snug group-hover:underline">
          {article.title}
        </h3>
        {formatDate(article.publishedAt) && (
          <span className="text-xs text-muted-foreground">{formatDate(article.publishedAt)}</span>
        )}
      </div>
    </Link>
  );
}

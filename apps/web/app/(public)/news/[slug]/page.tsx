import Link from "next/link";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ArticleCard } from "@/components/public/article-card";
import { ShareButtons } from "@/components/public/share-buttons";
import { AdSlot } from "@/components/public/ad-slot";
import { AuthorBox } from "@/components/public/author-box";
import { CommentSection } from "@/components/public/comment-section";
import { SmartArticleImage, CategoryPlaceholder } from "@/components/public/smart-article-image";
import { Badge } from "@/components/ui/badge";
import { getCategoryColors } from "@/lib/category-colors";
import {
  getArticleComments,
  getPublicSettings,
  getPublishedArticleBySlug,
  getPublishedArticles,
  resolveRedirect,
} from "@/lib/public-api";
import type { PublicSetting } from "@/lib/types";

interface Props {
  params: Promise<{ slug: string }>;
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3100";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const article = await getPublishedArticleBySlug(slug);
  if (!article) return {};

  const seo = article.seoData;
  const title = seo?.metaTitle ?? article.title;
  const description = seo?.metaDescription ?? article.excerpt ?? undefined;
  const ogImage = seo?.ogImageUrl ?? article.featuredImageUrl ?? undefined;

  return {
    title,
    description,
    alternates: seo?.canonicalUrl ? { canonical: seo.canonicalUrl } : undefined,
    openGraph: {
      title: seo?.ogTitle ?? title,
      description: seo?.ogDescription ?? description,
      type: "article",
      images: ogImage ? [ogImage] : undefined,
    },
  };
}

function findSetting(settings: PublicSetting[], key: string) {
  return settings.find((s) => s.key === key)?.value as
    | { enabled?: boolean; html?: string }
    | undefined;
}

function AuthorAvatar({ name }: { name?: string | null }) {
  const initial = name?.trim()?.[0]?.toUpperCase() ?? "?";
  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-black text-primary-foreground">
      {initial}
    </div>
  );
}

export default async function NewsArticlePage({ params }: Props) {
  const { slug } = await params;
  const article = await getPublishedArticleBySlug(slug);

  if (!article) {
    const referrer = (await headers()).get("referer") ?? undefined;
    const match = await resolveRedirect(`/news/${slug}`, referrer);
    if (match && match.statusCode !== 410) {
      redirect(match.toUrl);
    }
    notFound();
  }

  const [related, settings, comments] = await Promise.all([
    article.primaryCategory
      ? getPublishedArticles({
          categorySlug: article.primaryCategory.slug,
          excludeId: article.id,
          limit: 4,
        })
      : Promise.resolve({ data: [], meta: { total: 0, page: 1, limit: 4, totalPages: 0 } }),
    getPublicSettings(),
    getArticleComments(slug),
  ]);

  const colors = getCategoryColors(article.primaryCategory?.slug ?? article.primaryCategory?.name);
  const tags = article.articleTags ?? [];

  return (
    <article className="flex flex-col">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 pt-10">
        {article.primaryCategory && (
          <Link
            href={`/category/${article.primaryCategory.slug}`}
            className={`w-fit rounded px-2.5 py-1 text-xs font-black tracking-wide text-white uppercase ${colors.badge}`}
          >
            {article.primaryCategory.name}
          </Link>
        )}

        <h1 className="text-4xl leading-[1.05] font-black tracking-tight md:text-5xl">
          {article.title}
        </h1>
        {article.subtitle && (
          <p className="text-xl leading-snug text-muted-foreground">{article.subtitle}</p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-4 border-y py-4">
          <div className="flex items-center gap-3">
            <AuthorAvatar name={article.primaryAuthor?.displayName} />
            <div className="flex flex-col text-sm">
              {article.primaryAuthor?.displayName && (
                <Link
                  href={`/author/${article.primaryAuthor.id}`}
                  className="font-bold hover:text-primary hover:underline"
                >
                  {article.primaryAuthor.displayName}
                </Link>
              )}
              <div className="flex items-center gap-2 text-muted-foreground">
                {article.publishedAt && (
                  <time dateTime={article.publishedAt}>
                    {new Date(article.publishedAt).toLocaleDateString("id-ID", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                )}
                {article.readingTime && <span>&middot; {article.readingTime} menit baca</span>}
                {article.isAiAssisted && (
                  <Badge variant="outline" title="Drafted with AI assistance" className="ml-1">
                    AI-assisted
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <ShareButtons url={`${SITE_URL}/news/${article.slug}`} title={article.title} />
        </div>
      </div>

      <div className="mx-auto mt-6 w-full max-w-4xl px-4">
        {article.featuredImageUrl ? (
          <SmartArticleImage
            src={article.featuredImageUrl}
            alt={article.featuredImageAlt ?? article.title}
            categoryName={article.primaryCategory?.name}
            categorySlug={article.primaryCategory?.slug}
            className="aspect-video w-full rounded-xl shadow-sm"
          />
        ) : (
          <CategoryPlaceholder
            categoryName={article.primaryCategory?.name}
            categorySlug={article.primaryCategory?.slug}
            className="aspect-video w-full rounded-xl"
          />
        )}
      </div>

      <div className="mx-auto w-full max-w-3xl px-4">
        {/* Content is sanitized server-side (DOMPurify) at write time, before
            it's ever stored — see ArticlesService.sanitizeContent(). */}
        <div
          className="mt-8 flex flex-col gap-5 text-lg leading-relaxed [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-4 [&_blockquote]:border-primary [&_blockquote]:pl-4 [&_blockquote]:text-xl [&_blockquote]:font-medium [&_blockquote]:text-foreground/80 [&_blockquote]:italic [&_h2]:mt-2 [&_h2]:text-2xl [&_h2]:font-black [&_h3]:text-xl [&_h3]:font-bold [&_img]:rounded-lg [&_li]:ml-5 [&_ol]:list-decimal [&_ul]:list-disc"
          dangerouslySetInnerHTML={{ __html: article.content ?? "" }}
        />

        {tags.length > 0 && (
          <div className="mt-8 flex flex-wrap items-center gap-2 border-t pt-6">
            {tags.map(({ tag }) => (
              <Link
                key={tag.id}
                href={`/search?q=${encodeURIComponent(tag.name)}`}
                className="rounded-full border bg-muted px-3 py-1 text-sm font-medium text-muted-foreground hover:border-primary hover:text-primary"
              >
                #{tag.name}
              </Link>
            ))}
          </div>
        )}

        <AdSlot value={findSetting(settings, "ads.in_article")} className="my-8 flex justify-center" />

        {article.primaryAuthor && article.primaryAuthor.displayName && (
          <AuthorBox author={article.primaryAuthor} />
        )}
      </div>

      {related.data.length > 0 && (
        <section className="border-t bg-[var(--zone)] py-10">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4">
            <div className="flex items-center gap-2">
              <span className="h-4 w-1 rounded-full bg-primary" />
              <h2 className="text-lg font-black tracking-tight uppercase">Baca Juga</h2>
            </div>
            <div className="grid gap-6 sm:grid-cols-2">
              {related.data.map((item) => (
                <ArticleCard key={item.id} article={item} variant="horizontal" />
              ))}
            </div>
          </div>
        </section>
      )}

      <div className="mx-auto w-full max-w-3xl px-4 pb-16">
        <CommentSection articleSlug={article.slug} initialComments={comments} />
      </div>
    </article>
  );
}

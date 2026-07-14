import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ArticleCard } from "@/components/public/article-card";
import { ShareButtons } from "@/components/public/share-buttons";
import { AdSlot } from "@/components/public/ad-slot";
import {
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

  const [related, settings] = await Promise.all([
    article.primaryCategory
      ? getPublishedArticles({
          categorySlug: article.primaryCategory.slug,
          excludeId: article.id,
          limit: 4,
        })
      : Promise.resolve({ data: [], meta: { total: 0, page: 1, limit: 4, totalPages: 0 } }),
    getPublicSettings(),
  ]);

  return (
    <article className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10">
      {article.primaryCategory && (
        <Link
          href={`/category/${article.primaryCategory.slug}`}
          className="text-sm font-bold uppercase tracking-wide text-primary hover:underline"
        >
          {article.primaryCategory.name}
        </Link>
      )}

      <h1 className="text-4xl font-black leading-tight tracking-tight md:text-5xl">
        {article.title}
      </h1>
      {article.subtitle && (
        <p className="text-xl text-muted-foreground">{article.subtitle}</p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4 border-y py-3">
        <div className="flex items-center gap-3 text-sm">
          {article.primaryAuthor?.displayName && (
            <Link
              href={`/author/${article.primaryAuthor.id}`}
              className="font-semibold hover:text-primary hover:underline"
            >
              {article.primaryAuthor.displayName}
            </Link>
          )}
          {article.publishedAt && (
            <time dateTime={article.publishedAt} className="text-muted-foreground">
              {new Date(article.publishedAt).toLocaleDateString(undefined, {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </time>
          )}
          {article.readingTime && (
            <span className="text-muted-foreground">{article.readingTime} min read</span>
          )}
        </div>
        <ShareButtons url={`${SITE_URL}/news/${article.slug}`} title={article.title} />
      </div>

      {article.featuredImageUrl && (
        <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-muted">
          <Image
            src={article.featuredImageUrl}
            alt={article.featuredImageAlt ?? article.title}
            fill
            className="object-cover"
            unoptimized
            priority
          />
        </div>
      )}

      {/* Content is sanitized server-side (DOMPurify) at write time, before
          it's ever stored — see ArticlesService.sanitizeContent(). */}
      <div
        className="mt-2 flex flex-col gap-4 text-lg leading-relaxed [&_a]:text-primary [&_a]:underline [&_h2]:text-2xl [&_h2]:font-black [&_h3]:text-xl [&_h3]:font-bold [&_img]:rounded-md [&_li]:ml-5 [&_ol]:list-decimal [&_ul]:list-disc"
        dangerouslySetInnerHTML={{ __html: article.content ?? "" }}
      />

      <AdSlot value={findSetting(settings, "ads.in_article")} className="my-4 flex justify-center" />

      {related.data.length > 0 && (
        <section className="mt-8 flex flex-col gap-4 border-t pt-8">
          <h2 className="text-xl font-black uppercase tracking-tight">Related Stories</h2>
          <div className="grid gap-6 sm:grid-cols-2">
            {related.data.map((item) => (
              <ArticleCard key={item.id} article={item} variant="medium" />
            ))}
          </div>
        </section>
      )}
    </article>
  );
}

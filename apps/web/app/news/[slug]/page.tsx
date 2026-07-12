import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublishedArticleBySlug } from "@/lib/public-api";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const article = await getPublishedArticleBySlug(slug);
  if (!article) return {};

  const seo = article.seoData;
  const title = seo?.metaTitle ?? article.title;
  const description = seo?.metaDescription ?? article.excerpt ?? undefined;
  const ogImage = seo?.ogImageUrl ?? undefined;

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

export default async function NewsArticlePage({ params }: Props) {
  const { slug } = await params;
  const article = await getPublishedArticleBySlug(slug);

  if (!article) notFound();

  return (
    <article className="mx-auto flex max-w-3xl flex-col gap-4 px-6 py-12">
      <Link href="/news" className="text-sm text-muted-foreground hover:underline">
        ← Back to News
      </Link>

      <h1 className="text-3xl font-bold">{article.title}</h1>
      {article.subtitle && (
        <p className="text-lg text-muted-foreground">{article.subtitle}</p>
      )}

      <div className="text-sm text-muted-foreground">
        {article.primaryAuthor?.displayName && (
          <span>{article.primaryAuthor.displayName} · </span>
        )}
        {article.publishedAt && (
          <time dateTime={article.publishedAt}>
            {new Date(article.publishedAt).toLocaleDateString()}
          </time>
        )}
      </div>

      {/* Content is sanitized server-side (DOMPurify) at write time, before
          it's ever stored — see ArticlesService.sanitizeContent(). */}
      <div
        className="mt-4 flex flex-col gap-4 leading-relaxed [&_a]:underline [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:text-lg [&_h3]:font-semibold [&_img]:rounded-md [&_li]:ml-5 [&_ol]:list-decimal [&_ul]:list-disc"
        dangerouslySetInnerHTML={{ __html: article.content ?? "" }}
      />
    </article>
  );
}

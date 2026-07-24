import Link from "next/link";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import { ArticleCard } from "@/components/public/article-card";
import { ShareButtons } from "@/components/public/share-buttons";
import { AdSlot } from "@/components/public/ad-slot";
import { AuthorBox } from "@/components/public/author-box";
import { CommentSection } from "@/components/public/comment-section";
import { SmartArticleImage, CategoryPlaceholder } from "@/components/public/smart-article-image";
import { TrendingList } from "@/components/public/trending-list";
import { Breadcrumb } from "@/components/public/breadcrumb";
import { Badge } from "@/components/ui/badge";
import { getCategoryColors } from "@/lib/category-colors";
import {
  getArticleComments,
  getPublicSettings,
  getPublishedArticleBySlug,
  getPublishedArticles,
  resolveRedirect,
} from "@/lib/public-api";
import { SITE_NAME } from "@/lib/brand";
import { getArticleUrl, getCategoryUrl, getRootDomain } from "@/lib/site-url";
import type { PublicSetting } from "@/lib/types";

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
  const ogImage = seo?.ogImageUrl ?? article.featuredImageUrl ?? undefined;
  const rootDomain = getRootDomain();
  const feedUrl = article.primaryCategory
    ? `${getCategoryUrl(article.primaryCategory, rootDomain).replace(/\/$/, "")}/feed`
    : `https://${rootDomain}/feed`;

  return {
    title,
    description,
    robots: seo?.robots ?? undefined,
    alternates: {
      canonical: seo?.canonicalUrl ?? getArticleUrl(article),
      types: { "application/rss+xml": feedUrl },
    },
    openGraph: {
      title: seo?.ogTitle ?? title,
      description: seo?.ogDescription ?? description,
      siteName: SITE_NAME,
      type: "article",
      publishedTime: article.publishedAt ?? undefined,
      modifiedTime: article.updatedAt ?? undefined,
      authors: article.primaryAuthor?.displayName ? [article.primaryAuthor.displayName] : undefined,
      images: ogImage ? [ogImage] : undefined,
    },
    twitter: {
      card: (seo?.twitterCard as "summary" | "summary_large_image" | undefined) ?? "summary_large_image",
      title: seo?.ogTitle ?? title,
      description: seo?.ogDescription ?? description,
      images: ogImage ? [ogImage] : undefined,
    },
  };
}

function findSetting(settings: PublicSetting[], key: string) {
  return settings.find((s) => s.key === key)?.value as
    | { enabled?: boolean; html?: string }
    | undefined;
}

// Splits sanitized article HTML in two at the block-level closing tag
// closest to the midpoint, so the "mid-content" ad slot lands between two
// blocks instead of inside one. Checks several tag types, not just </p> -
// AI-drafted articles in this app often come back as bare text nodes
// separated by blank lines with only <h2>/<h3> headings as markup (no <p>
// wrapping at all), so </p>-only splitting would silently never fire for
// most of them. Returns null when there's fewer than two candidate
// boundaries - a very short/unstructured article has no meaningful
// "middle", so that ad slot is skipped rather than forced in awkwardly.
const MID_CONTENT_SPLIT_TAGS = ["</p>", "</h2>", "</h3>", "</h4>", "</blockquote>", "</ul>", "</ol>"];

function splitContentAtMidpoint(html: string): { before: string; after: string } | null {
  const positions: number[] = [];
  for (const tag of MID_CONTENT_SPLIT_TAGS) {
    for (let idx = html.indexOf(tag); idx !== -1; idx = html.indexOf(tag, idx + tag.length)) {
      positions.push(idx + tag.length);
    }
  }
  if (positions.length < 2) return null;

  const midpoint = html.length / 2;
  const cut = positions.reduce((best, pos) =>
    Math.abs(pos - midpoint) < Math.abs(best - midpoint) ? pos : best,
  );
  return { before: html.slice(0, cut), after: html.slice(cut) };
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

  // The article exists, but this host isn't its category's own subdomain
  // (or is the apex/an unassigned category) - send the visitor to the one
  // canonical URL for this article instead of rendering it twice under two
  // hostnames. Categories without a subdomain assigned yet resolve to the
  // apex via getArticleUrl's fallback, so this is a no-op for them.
  const requestHostname = (await headers()).get("host")?.split(":")[0] ?? "";
  const canonicalArticleUrl = getArticleUrl(article, getRootDomain());
  const canonicalHostname = new URL(canonicalArticleUrl).hostname;
  if (requestHostname && requestHostname !== canonicalHostname) {
    permanentRedirect(canonicalArticleUrl);
  }

  const [related, settings, comments, trending] = await Promise.all([
    article.primaryCategory
      ? getPublishedArticles({
          categorySlug: article.primaryCategory.slug,
          excludeId: article.id,
          limit: 4,
        })
      : Promise.resolve({ data: [], meta: { total: 0, page: 1, limit: 4, totalPages: 0 } }),
    getPublicSettings(),
    getArticleComments(slug),
    getPublishedArticles({ sortBy: "viewCount", excludeId: article.id, limit: 5 }),
  ]);

  const colors = getCategoryColors(article.primaryCategory?.slug ?? article.primaryCategory?.name);
  const tags = article.articleTags ?? [];
  const contentSplit = splitContentAtMidpoint(article.content ?? "");
  const contentProseClassName =
    "flex flex-col gap-5 text-lg leading-relaxed break-words [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-4 [&_blockquote]:border-primary [&_blockquote]:pl-4 [&_blockquote]:text-xl [&_blockquote]:font-medium [&_blockquote]:text-foreground/80 [&_blockquote]:italic [&_h2]:mt-2 [&_h2]:text-2xl [&_h2]:font-black [&_h3]:text-xl [&_h3]:font-bold [&_img]:rounded-lg [&_li]:ml-5 [&_ol]:list-decimal [&_ul]:list-disc";
  const rootDomain = getRootDomain();
  const breadcrumbItems = [
    { label: "Beranda", href: `https://${rootDomain}` },
    ...(article.primaryCategory?.parent
      ? [{ label: article.primaryCategory.parent.name, href: getCategoryUrl(article.primaryCategory.parent, rootDomain) }]
      : []),
    ...(article.primaryCategory
      ? [{ label: article.primaryCategory.name, href: getCategoryUrl(article.primaryCategory, rootDomain) }]
      : []),
    { label: article.title },
  ];
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: breadcrumbItems.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.label,
      item: item.href ?? canonicalArticleUrl,
    })),
  };

  return (
    <article className="flex flex-col">
      {article.seoData?.schemaJsonld && (
        <script
          type="application/ld+json"
          // NewsArticle JSON-LD generated server-side by SeoService and
          // stored verbatim on ArticleSeo.schemaJsonld - rendered as-is, not
          // reconstructed here, so the page always matches what SeoService
          // actually produced. `<` is escaped so a literal "</script>"
          // inside a headline/description (user- or AI-authored content)
          // can't prematurely close this tag - the browser's HTML parser
          // scans for that sequence before the JSON is ever parsed.
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(article.seoData.schemaJsonld).replace(/</g, "\\u003c"),
          }}
        />
      )}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(breadcrumbSchema).replace(/</g, "\\u003c"),
        }}
      />
      <div className="mx-auto w-full max-w-6xl px-4 pt-6">
        <Breadcrumb items={breadcrumbItems} />
      </div>
      <div className="mx-auto w-full max-w-6xl px-4">
        <AdSlot value={findSetting(settings, "ads.article_top")} className="my-3 flex justify-center" />
      </div>
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 pt-4 lg:grid-cols-[1fr_320px]">
        <div className="flex min-w-0 flex-col gap-5">
          {article.primaryCategory && (
            <Link
              href={getCategoryUrl(article.primaryCategory)}
              className={`w-fit rounded px-2.5 py-1 text-xs font-black tracking-wide text-white uppercase ${colors.badge}`}
            >
              {article.primaryCategory.name}
            </Link>
          )}

          <h1 className="text-4xl leading-[1.05] font-black tracking-tight md:text-5xl">
            {article.title}
          </h1>
          {article.subtitle && (
            <p data-speakable="summary" className="text-xl leading-snug text-muted-foreground">
              {article.subtitle}
            </p>
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
            <ShareButtons url={getArticleUrl(article)} title={article.title} />
          </div>

          <div className="mt-1">
            {article.featuredImageUrl ? (
              <SmartArticleImage
                src={article.featuredImageUrl}
                alt={article.featuredImageAlt ?? article.title}
                categoryName={article.primaryCategory?.name}
                categorySlug={article.primaryCategory?.slug}
                className="aspect-video w-full rounded-xl shadow-sm"
                sizes="(min-width: 1024px) 760px, 100vw"
                priority
              />
            ) : (
              <CategoryPlaceholder
                categoryName={article.primaryCategory?.name}
                categorySlug={article.primaryCategory?.slug}
                className="aspect-video w-full rounded-xl"
              />
            )}
          </div>

          <AdSlot value={findSetting(settings, "ads.article_after_image")} className="my-3 flex justify-center" />

          {/* Content is sanitized server-side (DOMPurify) at write time, before
              it's ever stored — see ArticlesService.sanitizeContent(). Split in
              two around a mid-content ad slot when there's a good paragraph
              boundary to split at (see splitContentAtMidpoint above). */}
          {contentSplit ? (
            <>
              <div
                className={`mt-3 ${contentProseClassName}`}
                dangerouslySetInnerHTML={{ __html: contentSplit.before }}
              />
              <AdSlot value={findSetting(settings, "ads.article_middle")} className="my-3 flex justify-center" />
              <div
                className={contentProseClassName}
                dangerouslySetInnerHTML={{ __html: contentSplit.after }}
              />
            </>
          ) : (
            <div
              className={`mt-3 ${contentProseClassName}`}
              dangerouslySetInnerHTML={{ __html: article.content ?? "" }}
            />
          )}

          {tags.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-t pt-6">
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

          <AdSlot value={findSetting(settings, "ads.in_article")} className="my-3 flex justify-center" />

          {article.primaryAuthor && article.primaryAuthor.displayName && (
            <AuthorBox author={article.primaryAuthor} />
          )}

          {article.sourceUrl && (
            <p className="border-t pt-4 text-sm break-all text-muted-foreground">
              Sumber: {article.sourceUrl}
            </p>
          )}
        </div>

        <aside className="flex flex-col gap-6">
          <AdSlot value={findSetting(settings, "ads.sidebar")} />
          <TrendingList articles={trending.data} />
        </aside>
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
        <CommentSection
          articleSlug={article.slug}
          initialComments={comments}
          commentsEnabled={article.commentsEnabled ?? true}
        />
      </div>
    </article>
  );
}

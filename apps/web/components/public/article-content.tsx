import Link from "next/link";
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
import { getArticleUrl, getCategoryUrl, getRootDomain } from "@/lib/site-url";
import type { CommentNode, PaginatedResponse, PublicArticle, PublicSetting } from "@/lib/types";

// Extracted from article-view.tsx's ArticleView so the exact same rendering
// can be reused both for the server-rendered initial article AND for
// subsequent articles appended client-side by InfiniteArticleFeed as the
// reader scrolls - this component itself does no data fetching and no
// redirect/notFound handling (that stays in ArticleView, which only ever
// runs once, for the initially-requested slug), it just renders whatever
// data it's given.

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

// The API drops up to 3 inline "Baca juga: <headline>" paragraphs into
// published article bodies (ArticleInternalLinkingService.insertReadAlso).
// The stored markup is a plain <p> — the content sanitizer's attribute
// allowlist has no `class` — so tag those paragraphs here for the callout
// styling defined in contentProseClassName below.
function styleReadAlso(html: string): string {
  return html.replace(/<p>(\s*Baca juga:)/gi, '<p class="baca-juga">$1');
}

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

export function ArticleContent({
  article,
  related,
  settings,
  comments,
  trending,
}: {
  article: PublicArticle;
  related: PaginatedResponse<PublicArticle>;
  settings: PublicSetting[];
  comments: CommentNode[];
  trending: PaginatedResponse<PublicArticle>;
}) {
  const colors = getCategoryColors(article.primaryCategory?.slug ?? article.primaryCategory?.name);
  const tags = article.articleTags ?? [];
  // Split the one category-scoped fetch above between the sidebar's compact
  // list and the full-width "Baca Juga" band below, instead of showing the
  // exact same 4 articles in both places.
  const sidebarRelated = related.data.slice(4, 8);
  const bandRelated = related.data.slice(0, 4);
  const articleHtml = styleReadAlso(article.content ?? "");
  const contentSplit = splitContentAtMidpoint(articleHtml);
  // Not `flex flex-col` - AI-drafted articles often come back as bare text
  // nodes with no <p> wrapping at all (see splitContentAtMidpoint's comment
  // above), separated only by a blank line. A flex column container treats
  // every inline element (a/strong/em) as its own flex item, which visibly
  // shatters a single sentence into one fragment per formatted word -
  // confirmed live against real imported content. Plain block flow plus
  // `whitespace-pre-line` (so a source blank line still reads as a
  // paragraph break for that untagged text) fixes both properly-<p>-tagged
  // and bare-text content the same way.
  const contentProseClassName =
    "whitespace-pre-line text-lg leading-relaxed break-words [&_p]:mb-5 [&_a]:text-primary [&_a]:underline [&_blockquote]:my-5 [&_blockquote]:border-l-4 [&_blockquote]:border-primary [&_blockquote]:pl-4 [&_blockquote]:text-xl [&_blockquote]:font-medium [&_blockquote]:text-foreground/80 [&_blockquote]:italic [&_h2]:mt-8 [&_h2]:mb-3 [&_h2]:text-2xl [&_h2]:font-black [&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:text-xl [&_h3]:font-bold [&_img]:my-5 [&_img]:rounded-lg [&_ul]:mb-5 [&_ol]:mb-5 [&_li]:ml-5 [&_ol]:list-decimal [&_ul]:list-disc [&_.baca-juga]:my-6 [&_.baca-juga]:border-l-4 [&_.baca-juga]:border-primary [&_.baca-juga]:bg-primary/5 [&_.baca-juga]:py-2 [&_.baca-juga]:pr-3 [&_.baca-juga]:pl-4 [&_.baca-juga]:text-base [&_.baca-juga]:font-semibold [&_.baca-juga]:not-italic [&_.baca-juga_a]:font-bold [&_.baca-juga_a]:no-underline hover:[&_.baca-juga_a]:underline";
  const rootDomain = getRootDomain();
  const canonicalArticleUrl = getArticleUrl(article, rootDomain);
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
      {/* min-h-* on every AdSlot below reserves space matching each slot's
          recommended size (see the Ads admin page's per-slot descriptions)
          up front - AdSlot's container has no height of its own until its
          client-side effect actually injects the ad, so without this every
          ad load is a Cumulative Layout Shift event (one of Core Web
          Vitals' 3 metrics, affects SEO ranking directly) - same fix
          already applied to the top-of-page banner (top-banner-ad.tsx). */}
      <div className="mx-auto w-full max-w-6xl px-4">
        <AdSlot
          value={findSetting(settings, "ads.article_top")}
          className="my-3 flex min-h-[50px] items-center justify-center sm:min-h-[90px]"
        />
      </div>
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 pt-4 pb-10 lg:grid-cols-[1fr_320px]">
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
                    href={`/author/${article.primaryAuthor.slug ?? article.primaryAuthor.id}`}
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

          {/* "Poin Penting" — the GEO engine's machine-readable summary +
              key claims (article_geo, populated a beat after first publish).
              Doubles as a reader-facing TL;DR and as the exact
              directly-answerable content AI Overviews / featured snippets
              lift. Rendered only when the GEO pass has produced something. */}
          {(article.geoData?.structuredSummary ||
            (article.geoData?.keyClaims?.length ?? 0) > 0) && (
            <aside
              className="mt-4 rounded-xl border border-primary/25 bg-primary/5 p-4 sm:p-5"
              aria-label="Poin penting"
            >
              <h2 className="mb-2 text-xs font-black tracking-widest text-primary uppercase">
                Poin Penting
              </h2>
              {article.geoData?.structuredSummary && (
                <p
                  data-speakable="summary"
                  className="text-base leading-relaxed text-foreground/90"
                >
                  {article.geoData.structuredSummary}
                </p>
              )}
              {(article.geoData?.keyClaims?.length ?? 0) > 0 && (
                <ul className="mt-3 flex list-disc flex-col gap-1.5 pl-5 text-base text-foreground/80 marker:text-primary">
                  {article.geoData!.keyClaims!.slice(0, 5).map((claim, i) => (
                    <li key={i}>{claim}</li>
                  ))}
                </ul>
              )}
            </aside>
          )}

          <AdSlot
            value={findSetting(settings, "ads.article_after_image")}
            className="my-3 flex min-h-[250px] items-center justify-center sm:min-h-[280px]"
          />

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
              <AdSlot
                value={findSetting(settings, "ads.article_middle")}
                className="my-3 flex min-h-[250px] items-center justify-center sm:min-h-[280px]"
              />
              <div
                className={contentProseClassName}
                dangerouslySetInnerHTML={{ __html: contentSplit.after }}
              />
            </>
          ) : (
            <div
              className={`mt-3 ${contentProseClassName}`}
              dangerouslySetInnerHTML={{ __html: articleHtml }}
            />
          )}

          {tags.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-t pt-6">
              {tags.map(({ tag }) => (
                <Link
                  key={tag.id}
                  href={`/tag/${tag.slug}`}
                  className="rounded-full border bg-muted px-3 py-1 text-sm font-medium text-muted-foreground hover:border-primary hover:text-primary"
                >
                  #{tag.name}
                </Link>
              ))}
            </div>
          )}

          <AdSlot
            value={findSetting(settings, "ads.in_article")}
            className="my-3 flex min-h-[90px] items-center justify-center sm:min-h-[250px]"
          />

          {article.primaryAuthor && article.primaryAuthor.displayName && (
            <AuthorBox author={article.primaryAuthor} />
          )}
        </div>

        <aside className="flex flex-col gap-6">
          <AdSlot
            value={findSetting(settings, "ads.sidebar")}
            className="flex min-h-[250px] items-center justify-center"
          />
          {sidebarRelated.length > 0 && article.primaryCategory && (
            <div className="flex flex-col gap-4 rounded-lg border bg-card p-4">
              <h2 className={`flex items-center gap-2 text-base font-black tracking-tight uppercase ${colors.text}`}>
                <span className={`h-4 w-1 rounded-full ${colors.badge}`} />
                Lainnya di {article.primaryCategory.name}
              </h2>
              <div className="flex flex-col divide-y">
                {sidebarRelated.map((item) => (
                  <ArticleCard key={item.id} article={item} variant="list" className="py-3 first:pt-0 last:pb-0" />
                ))}
              </div>
            </div>
          )}
          <TrendingList articles={trending.data} />
        </aside>
      </div>

      {bandRelated.length > 0 && (
        <section className="border-t bg-[var(--zone)] py-10">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4">
            <div className="flex items-center gap-2">
              <span className="h-4 w-1 rounded-full bg-primary" />
              <h2 className="text-lg font-black tracking-tight uppercase">Baca Juga</h2>
            </div>
            <div className="grid gap-6 sm:grid-cols-2">
              {bandRelated.map((item) => (
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

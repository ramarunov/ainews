import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import { ArticleContent } from "@/components/public/article-content";
import { InfiniteArticleFeed } from "@/components/public/infinite-article-feed";
import {
  getArticleComments,
  getPublicSettings,
  getPublishedArticleBySlug,
  getPublishedArticles,
  resolveRedirect,
} from "@/lib/public-api";
import { SITE_NAME } from "@/lib/brand";
import type { Locale } from "@/lib/i18n";
import { getArticleUrl, getCategoryUrl, getRootDomain, isCategorySubdomainsEnabled } from "@/lib/site-url";

// Shared between apps/web/app/(public)/news/[slug]/page.tsx (this app's
// default article URL) and apps/web/app/(public)/[slug]/page.tsx (the flat
// `/{slug}` URL used when FLAT_ARTICLE_URLS is enabled - see
// lib/site-url.ts) - one route renders this, the other redirects to it,
// depending on that flag, but the SEO/JSON-LD/ads/related-articles logic
// itself doesn't depend on which URL shape is active.

export async function buildArticleMetadata(
  slug: string,
  locale: "id" | "en" = "id",
): Promise<Metadata> {
  const article = await getPublishedArticleBySlug(slug, locale);
  if (!article) return {};

  const seo = article.seoData;
  const title = seo?.metaTitle ?? article.title;
  const description = seo?.metaDescription ?? article.excerpt ?? undefined;
  const ogImage = seo?.ogImageUrl ?? article.featuredImageUrl ?? undefined;
  const rootDomain = getRootDomain();
  const feedUrl = article.primaryCategory
    ? `${getCategoryUrl(article.primaryCategory, rootDomain).replace(/\/$/, "")}/feed${locale === "en" ? "?lang=en" : ""}`
    : `https://${rootDomain}${locale === "en" ? "/en" : ""}/feed`;

  // Each language version is canonical to itself (never cross-canonical -
  // that de-indexes one side). hreflang wires the pair together.
  const selfUrl =
    locale === "en"
      ? `https://${rootDomain}/en/${article.slug}`
      : seo?.canonicalUrl ?? getArticleUrl(article);
  const languages: Record<string, string> = {};
  if (article.hreflang?.id) languages["id"] = `https://${rootDomain}/${article.hreflang.id}`;
  if (article.hreflang?.en) languages["en"] = `https://${rootDomain}/en/${article.hreflang.en}`;
  // x-default -> the Indonesian original (primary market) when it exists.
  if (languages["id"]) languages["x-default"] = languages["id"];

  return {
    // Article <title> is the headline itself, not run through the root
    // layout's "%s — RusdiMedia.com" template - the headline is the SEO
    // asset and appending the brand only eats into Google's title budget.
    // The brand still travels via og:site_name and the publisher schema.
    title: { absolute: title },
    description,
    // Spread conditionally, not `robots: seo?.robots ?? undefined` - Next's
    // metadata inheritance checks whether the `robots` KEY is present on
    // this segment's metadata, not whether its value is truthy. A present-
    // but-undefined key still counts as "this segment sets robots" and
    // blocks falling through to the root layout's default (which is what
    // carries max-image-preview:large) - confirmed live, articles without
    // their own SEO-panel robots value were rendering with NO <meta
    // name="robots"> tag at all instead of inheriting the default.
    ...(seo?.robots && { robots: seo.robots }),
    alternates: {
      canonical: selfUrl,
      types: { "application/rss+xml": feedUrl },
      ...(Object.keys(languages).length > 1 && { languages }),
    },
    openGraph: {
      title: seo?.ogTitle ?? title,
      description: seo?.ogDescription ?? description,
      url: selfUrl,
      siteName: SITE_NAME,
      locale: locale === "en" ? "en_US" : "id_ID",
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

export async function ArticleView({
  slug,
  locale = "id",
}: {
  slug: string;
  locale?: Locale;
}) {
  const article = await getPublishedArticleBySlug(slug, locale);

  if (!article) {
    // The Redirect table is keyed on the migrated WordPress site's own
    // Indonesian `/{slug}` permalinks - it has no `/en/*` rows, so a missing
    // English translation is just a 404, no redirect lookup.
    if (locale === "en") notFound();
    // The path actually requested for this article - rusdimedia.com's
    // articles live at this bare `/{slug}` (see lib/site-url.ts), which is
    // what a migrated site's Redirect rows (e.g. WordPress URLs that
    // changed/were removed) are keyed on.
    const requestedPath = `/${slug}`;
    const referrer = (await headers()).get("referer") ?? undefined;
    const match = await resolveRedirect(requestedPath, referrer);
    if (match) {
      // Google (and browsers) only treat 301/308 as "permanently moved,
      // transfer ranking signals" - next/navigation's plain redirect()
      // always sends a 307 regardless of what's asked for, which silently
      // downgraded every migrated-site 301 in the Redirect table to a
      // temporary one. permanentRedirect() sends 308, which Google's own
      // documentation says it treats the same as 301 for this purpose.
      if (match.statusCode === 301) permanentRedirect(match.toUrl);
      if (match.statusCode === 302) redirect(match.toUrl);
      // statusCode === 410 (Gone) falls through to notFound() below -
      // Next has no native way to send a real 410, so this is a 404
      // instead, which search engines still eventually treat as "remove
      // from the index."
    }
    notFound();
  }

  // The article exists, but this host isn't its category's own subdomain
  // (or is the apex/an unassigned category) - send the visitor to the one
  // canonical URL for this article instead of rendering it twice under two
  // hostnames. Categories without a subdomain assigned yet resolve to the
  // apex via getArticleUrl's fallback, so this is a no-op for them.
  //
  // Only worth the headers() call (a Dynamic API - see the layout.tsx
  // comment on why this matters) when the subdomain feature can actually
  // produce a mismatch: with it off, getArticleUrl always resolves to the
  // apex and proxy.ts already guarantees every request reaching this
  // component is on the apex (it 404s any other host, and redirects the
  // dashboard host's own public-path hits there before this ever renders),
  // so the check below would be comparing the apex to itself on every
  // single article view for nothing.
  if (locale !== "en" && isCategorySubdomainsEnabled()) {
    const requestHostname = (await headers()).get("host")?.split(":")[0] ?? "";
    const canonicalArticleUrl = getArticleUrl(article, getRootDomain());
    const canonicalHostname = new URL(canonicalArticleUrl).hostname;
    if (requestHostname && requestHostname !== canonicalHostname) {
      permanentRedirect(canonicalArticleUrl);
    }
  }

  const emptyRelated = { data: [], meta: { total: 0, page: 1, limit: 8, totalPages: 0 } };

  // The English edition is a lean, self-contained translation view - no
  // infinite-scroll feed (that's an ad-impression play tuned for the
  // Indonesian edition's much larger catalogue) and every related/trending
  // query is scoped to `language: "en"` so it never links out to an
  // untranslated Indonesian article.
  if (locale === "en") {
    const [related, settings, comments, trending] = await Promise.all([
      article.primaryCategory
        ? getPublishedArticles({
            language: "en",
            categorySlug: article.primaryCategory.slug,
            excludeId: article.id,
            limit: 8,
          })
        : Promise.resolve(emptyRelated),
      getPublicSettings(),
      getArticleComments(slug),
      getPublishedArticles({ language: "en", sortBy: "viewCount", excludeId: article.id, limit: 5 }),
    ]);

    return (
      <ArticleContent
        article={article}
        related={related}
        settings={settings}
        comments={comments}
        trending={trending}
        locale="en"
      />
    );
  }

  const [related, settings, comments, trending] = await Promise.all([
    article.primaryCategory
      ? getPublishedArticles({
          categorySlug: article.primaryCategory.slug,
          excludeId: article.id,
          limit: 8,
        })
      : Promise.resolve(emptyRelated),
    getPublicSettings(),
    getArticleComments(slug),
    getPublishedArticles({ sortBy: "viewCount", excludeId: article.id, limit: 5 }),
  ]);

  return (
    <InfiniteArticleFeed
      initialArticle={article}
      initialRelated={related}
      initialComments={comments}
      initialTrending={trending}
      settings={settings}
    />
  );
}

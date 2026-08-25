import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";
import { ArticleView, buildArticleMetadata } from "@/components/public/article-view";
import { isFlatArticleUrlsEnabled } from "@/lib/site-url";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return buildArticleMetadata(slug);
}

export default async function NewsArticlePage({ params }: Props) {
  const { slug } = await params;

  // When this deployment serves articles at a bare `/{slug}` (see
  // FLAT_ARTICLE_URLS in lib/site-url.ts - used for a WordPress migration
  // that needs `/%postname%/`-style permalinks preserved), `/news/{slug}`
  // is a legacy alias, not the canonical URL. Redirect unconditionally
  // rather than rendering a second copy here, so there's exactly one
  // indexable URL per article; apps/web/app/(public)/[slug]/page.tsx
  // handles the actual 404/not-found-redirect resolution for it.
  if (isFlatArticleUrlsEnabled()) {
    permanentRedirect(`/${slug}`);
  }

  return <ArticleView slug={slug} />;
}

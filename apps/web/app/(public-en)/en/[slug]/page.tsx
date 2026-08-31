import type { Metadata } from "next";
import { ArticleView, buildArticleMetadata } from "@/components/public/article-view";

// ISR: cache the rendered page at the edge, revalidate in the background.
export const revalidate = 60;
// Empty list = prerender nothing at build, but generate + cache each
// path on its first request (on-demand ISR). Required for revalidate to
// take effect on a route with no build-time params (Next docs).
export function generateStaticParams() {
  return [];
}

interface Props {
  params: Promise<{ slug: string }>;
}

// The English translation edition of an article. Unlike the Indonesian
// `/{slug}` route, this is article-only - there's no static-Page branch
// (Pages live on the apex, in Indonesian) and no Redirect-table lookup
// (those rows are keyed on the old WordPress Indonesian permalinks).
// ArticleView/buildArticleMetadata handle the not-found case themselves.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return buildArticleMetadata(slug, "en");
}

export default async function EnglishArticle({ params }: Props) {
  const { slug } = await params;
  return <ArticleView slug={slug} locale="en" />;
}

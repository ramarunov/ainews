import { permanentRedirect } from "next/navigation";

interface Props {
  params: Promise<{ slug: string }>;
}

// Legacy alias only - rusdimedia.com's articles live at the bare `/{slug}`
// it carried over from its previous WordPress site (see lib/site-url.ts),
// not `/news/{slug}`. Redirects unconditionally rather than rendering
// anything here, so there's exactly one indexable URL per article;
// apps/web/app/(public)/[slug]/page.tsx handles the actual article lookup,
// 404, and not-found-redirect resolution.
export default async function NewsArticlePage({ params }: Props) {
  const { slug } = await params;
  permanentRedirect(`/${slug}`);
}

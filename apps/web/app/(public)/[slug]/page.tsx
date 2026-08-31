import type { Metadata } from "next";
import { getPageBySlug } from "@/lib/public-api";
import { getRootDomain } from "@/lib/site-url";
import { SITE_NAME } from "@/lib/brand";
import { ArticleView, buildArticleMetadata } from "@/components/public/article-view";

// ISR: cache the rendered page at the edge, revalidate in the background.
// Covers both the flat article route and the static-Page route this file
// also serves.
export const revalidate = 60;

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = await getPageBySlug(slug);
  if (page) {
    // No manual "— SITE_NAME" suffix - the root layout's title template
    // already appends it to every page title.
    const title = page.metaTitle || page.title;
    const description = page.metaDescription || undefined;
    return {
      title,
      description,
      alternates: { canonical: `https://${getRootDomain()}/${page.slug}` },
      openGraph: { title, description, siteName: SITE_NAME },
    };
  }

  // A single-segment path that isn't a known static page is an article -
  // rusdimedia.com's articles live at this bare `/{slug}` (see
  // lib/site-url.ts), not `/news/{slug}`. ArticleView/buildArticleMetadata
  // handle the not-found case themselves.
  return buildArticleMetadata(slug);
}

// Admin-created static pages (About, Contact, Disclaimer, Privacy Policy,
// ...) and articles both live at this single-segment path - proxy.ts lets
// any such path through unconditionally (it could be either), so a 404 here
// only happens for a genuinely unknown slug, a race (page/article
// deleted/unpublished between the middleware check and this render), or a
// direct hit outside the matcher.
export default async function StaticPageOrArticle({ params }: Props) {
  const { slug } = await params;
  const page = await getPageBySlug(slug);

  if (page) {
    // Static pages are apex-only content (not per-category), same reasoning
    // as the article/category canonical redirect - one URL, not one per
    // host. No headers()-based check needed to enforce that: proxy.ts's own
    // Host-based routing already guarantees nothing but the apex ever
    // reaches this branch (see tag/[slug]/page.tsx's equivalent comment),
    // so calling a Dynamic API here would only cost every static-page view
    // its eligibility for static rendering/ISR for no benefit.
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-12 pb-20">
        <h1 className="text-3xl font-black tracking-tight md:text-4xl">{page.title}</h1>
        <div
          className="flex flex-col gap-5 text-base leading-relaxed break-words text-muted-foreground [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-4 [&_blockquote]:border-primary [&_blockquote]:pl-4 [&_blockquote]:italic [&_h2]:mt-2 [&_h2]:text-xl [&_h2]:font-black [&_h2]:text-foreground [&_h3]:text-lg [&_h3]:font-bold [&_h3]:text-foreground [&_img]:rounded-lg [&_li]:ml-5 [&_ol]:list-decimal [&_ul]:list-disc"
          dangerouslySetInnerHTML={{ __html: page.content }}
        />
      </div>
    );
  }

  return <ArticleView slug={slug} />;
}

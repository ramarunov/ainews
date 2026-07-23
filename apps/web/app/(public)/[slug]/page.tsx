import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, permanentRedirect } from "next/navigation";
import { getPageBySlug } from "@/lib/public-api";
import { getRootDomain } from "@/lib/site-url";
import { SITE_NAME } from "@/lib/brand";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = await getPageBySlug(slug);
  if (!page) return {};

  const title = page.metaTitle || `${page.title} — ${SITE_NAME}`;
  const description = page.metaDescription || undefined;

  return {
    title,
    description,
    alternates: { canonical: `https://${getRootDomain()}/${page.slug}` },
    openGraph: { title, description, siteName: SITE_NAME },
  };
}

// Admin-created static pages (About, Contact, Disclaimer, Privacy Policy,
// ...) - apps/web/proxy.ts already checked this slug against real published
// pages before letting the request reach here (see getCachedPageSlugs), so
// a 404 here only happens for a race (page deleted/unpublished between the
// middleware check and this render) or a direct hit outside the matcher.
export default async function StaticPage({ params }: Props) {
  const { slug } = await params;
  const page = await getPageBySlug(slug);

  if (!page) notFound();

  // Static pages are apex-only content (not per-category), same reasoning
  // as the article/category canonical redirect - one URL, not one per host.
  const rootDomain = getRootDomain();
  const requestHostname = (await headers()).get("host")?.split(":")[0] ?? "";
  if (requestHostname && requestHostname !== rootDomain) {
    permanentRedirect(`https://${rootDomain}/${page.slug}`);
  }

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

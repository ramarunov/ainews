import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArticleCard } from "@/components/public/article-card";
import { TrendingList } from "@/components/public/trending-list";
import { Breadcrumb } from "@/components/public/breadcrumb";
import { Pagination } from "@/components/public/pagination";
import { getTagBySlug, getPublishedArticles } from "@/lib/public-api";
import { getRootDomain } from "@/lib/site-url";
import { SITE_NAME } from "@/lib/brand";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const tag = await getTagBySlug(slug);
  if (!tag) return {};
  const tagUrl = `https://${getRootDomain()}/tag/${tag.slug}`;
  // Same reasoning as category/[slug]/page.tsx's canonical: a distinct
  // canonical per page, not collapsed to page 1 - each page lists genuinely
  // different articles.
  const canonical = page > 1 ? `${tagUrl}?page=${page}` : tagUrl;
  return {
    title: `#${tag.name}`,
    description: tag.description || `Berita terbaru bertopik ${tag.name} di ${SITE_NAME}.`,
    alternates: { canonical },
  };
}

// Tag archives are apex-only (not per-category-subdomain) - a tag isn't
// scoped to one category, so unlike category/[slug]/page.tsx there's no
// per-tag subdomain to resolve, just one canonical apex URL.
export default async function TagPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  const tag = await getTagBySlug(slug);
  if (!tag) notFound();

  // No headers()-based wrong-host redirect here - tags are apex-only,
  // unconditionally (no subdomain a tag could ever canonicalize to, unlike
  // category/[slug]/page.tsx), and proxy.ts's own Host-based routing
  // already guarantees nothing but the apex ever reaches this component
  // (it 404s any other host and redirects the dashboard host's own
  // public-path hits to the apex before this ever renders). headers() is a
  // Dynamic API - calling it here regardless would force every tag page
  // view to opt out of static rendering/ISR just to reconfirm something
  // already guaranteed one layer up.
  const rootDomain = getRootDomain();

  const [{ data: articles, meta }, trending] = await Promise.all([
    getPublishedArticles({ tagSlug: slug, page, limit: 13 }),
    getPublishedArticles({ sortBy: "viewCount", limit: 5 }),
  ]);

  const breadcrumbItems = [
    { label: "Beranda", href: `https://${rootDomain}` },
    { label: `#${tag.name}` },
  ];

  const tagSchema = [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: `#${tag.name}`,
      description: tag.description || undefined,
      url: `https://${rootDomain}/tag/${tag.slug}`,
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: breadcrumbItems.map((item, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: item.label,
        item: item.href ?? `https://${rootDomain}/tag/${tag.slug}`,
      })),
    },
  ];

  return (
    <div className="flex flex-col gap-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(tagSchema) }}
      />
      <div className="bg-[var(--zone)] py-10">
        <div className="mx-auto w-full max-w-6xl px-4">
          <Breadcrumb className="mb-3" items={breadcrumbItems} />
          <h1 className="text-4xl font-black tracking-tight uppercase md:text-5xl">
            #{tag.name}
          </h1>
          {tag.description && (
            <p className="mt-2 max-w-2xl text-muted-foreground">{tag.description}</p>
          )}
        </div>
      </div>

      <div className="mx-auto w-full max-w-6xl px-4 pb-16">
        {articles.length === 0 && (
          <p className="py-12 text-center text-muted-foreground">
            Belum ada artikel dengan tag ini.
          </p>
        )}

        {articles.length > 0 && (
          <div className="grid gap-10 lg:grid-cols-[1fr_320px]">
            <div className="flex flex-col gap-8">
              <div className="grid gap-8 sm:grid-cols-2">
                {articles.map((article) => (
                  <ArticleCard key={article.id} article={article} variant="medium" />
                ))}
              </div>

              <Pagination currentPage={page} totalPages={meta.totalPages} />
            </div>

            <aside className="flex flex-col gap-6">
              <TrendingList articles={trending.data} />
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}

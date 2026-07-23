import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { notFound, permanentRedirect } from "next/navigation";
import { ArticleCard } from "@/components/public/article-card";
import { TrendingList } from "@/components/public/trending-list";
import { Breadcrumb } from "@/components/public/breadcrumb";
import { getCategoryColors } from "@/lib/category-colors";
import { getCategoryBySlug, getPublishedArticles } from "@/lib/public-api";
import { getCategoryUrl, getRootDomain } from "@/lib/site-url";
import { SITE_NAME } from "@/lib/brand";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const category = await getCategoryBySlug(slug);
  if (!category) return {};
  const categoryUrl = getCategoryUrl(category);
  // Self-referencing canonical per page, not collapsed to page 1 - each
  // page lists genuinely different articles, so telling Google "this
  // content actually lives at page 1's URL" would suppress page 2+ from
  // ever being indexed under its own URL (Google deprecated rel=next/prev
  // in 2019; a distinct canonical per page is its current guidance).
  const canonical = page > 1 ? `${categoryUrl}?page=${page}` : categoryUrl;
  return {
    title: category.metaTitle || `${category.name} — ${SITE_NAME}`,
    description:
      category.metaDescription ||
      category.description ||
      `${category.name} Terbaru Hari Ini | ${SITE_NAME}`,
    alternates: {
      canonical,
      types: { "application/rss+xml": `${categoryUrl.replace(/\/$/, "")}/feed` },
    },
  };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  const category = await getCategoryBySlug(slug);
  if (!category) notFound();

  // Same reasoning as the article page's wrong-host redirect: this route is
  // reachable from every host (apex, any category subdomain) via
  // PUBLIC_PATH_PREFIXES' "/category" entry, but a category only has one
  // canonical URL - its own subdomain if it has one, else the apex. Visiting
  // it from any other host must redirect there, not render a second copy.
  const requestHostname = (await headers()).get("host")?.split(":")[0] ?? "";
  const canonicalCategoryUrl = getCategoryUrl(category, getRootDomain());
  const canonicalHostname = new URL(canonicalCategoryUrl).hostname;
  if (requestHostname && requestHostname !== canonicalHostname) {
    const redirectUrl = new URL(canonicalCategoryUrl);
    if (page > 1) redirectUrl.searchParams.set("page", String(page));
    permanentRedirect(redirectUrl.toString());
  }

  const [{ data: articles, meta }, trending] = await Promise.all([
    getPublishedArticles({ categorySlug: slug, page, limit: 13 }),
    getPublishedArticles({ categorySlug: slug, sortBy: "viewCount", limit: 5 }),
  ]);

  const colors = getCategoryColors(category.slug ?? category.name);
  const [lead, ...rest] = articles;
  const rootDomain = getRootDomain();
  const categoryUrl = getCategoryUrl(category, rootDomain);
  const children = category.children ?? [];

  const breadcrumbItems = [
    { label: "Beranda", href: `https://${rootDomain}` },
    ...(category.parent
      ? [{ label: category.parent.name, href: getCategoryUrl(category.parent, rootDomain) }]
      : []),
    { label: category.name },
  ];

  const categorySchema = [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: category.metaTitle || category.name,
      description: category.metaDescription || category.description || undefined,
      url: categoryUrl,
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: breadcrumbItems.map((item, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: item.label,
        item: item.href ?? categoryUrl,
      })),
    },
  ];

  return (
    <div className="flex flex-col gap-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(categorySchema) }}
      />
      <div className={`${colors.badge} py-10`}>
        <div className="mx-auto w-full max-w-6xl px-4">
          <Breadcrumb className="mb-3 text-white" items={breadcrumbItems} />
          <h1 className="text-4xl font-black tracking-tight text-white uppercase md:text-5xl">
            {category.name}
          </h1>
          {category.description && (
            <p className="mt-2 max-w-2xl text-white/80">{category.description}</p>
          )}
          {children.length > 0 && (
            <nav className="mt-4 flex flex-wrap gap-2">
              {children.map((child) => (
                <Link
                  key={child.id}
                  href={getCategoryUrl(child, rootDomain)}
                  className="rounded-full border border-white/40 px-3 py-1 text-xs font-bold tracking-wide text-white uppercase hover:bg-white/10"
                >
                  {child.name}
                </Link>
              ))}
            </nav>
          )}
        </div>
      </div>

      <div className="mx-auto w-full max-w-6xl px-4 pb-16">
        {articles.length === 0 && (
          <p className="py-12 text-center text-muted-foreground">
            No published articles in this category yet.
          </p>
        )}

        {articles.length > 0 && (
          <div className="grid gap-10 lg:grid-cols-[1fr_320px]">
            <div className="flex flex-col gap-8">
              {page === 1 && lead && (
                <ArticleCard article={lead} variant="hero" />
              )}
              <div className="grid gap-8 sm:grid-cols-2">
                {(page === 1 ? rest : articles).map((article) => (
                  <ArticleCard key={article.id} article={article} variant="medium" />
                ))}
              </div>

              {meta.totalPages > 1 && (
                <div className="flex items-center justify-center gap-4 border-t pt-6">
                  <Link
                    href={`?page=${page - 1}`}
                    aria-disabled={page <= 1}
                    className={`flex items-center gap-1 text-sm font-semibold hover:text-primary ${page <= 1 ? "pointer-events-none opacity-30" : ""}`}
                  >
                    <ChevronLeft className="h-4 w-4" /> Sebelumnya
                  </Link>
                  <span className="text-sm text-muted-foreground">
                    Halaman {page} dari {meta.totalPages}
                  </span>
                  <Link
                    href={`?page=${page + 1}`}
                    aria-disabled={page >= meta.totalPages}
                    className={`flex items-center gap-1 text-sm font-semibold hover:text-primary ${page >= meta.totalPages ? "pointer-events-none opacity-30" : ""}`}
                  >
                    Selanjutnya <ChevronRight className="h-4 w-4" />
                  </Link>
                </div>
              )}
            </div>

            <aside className="flex flex-col gap-6">
              <TrendingList articles={trending.data} title={`Populer di ${category.name}`} />
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}

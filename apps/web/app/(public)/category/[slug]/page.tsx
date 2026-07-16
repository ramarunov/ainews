import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { notFound } from "next/navigation";
import { ArticleCard } from "@/components/public/article-card";
import { TrendingList } from "@/components/public/trending-list";
import { getCategoryColors } from "@/lib/category-colors";
import { getCategoryBySlug, getPublishedArticles } from "@/lib/public-api";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);
  if (!category) return {};
  return {
    title: `${category.name} — Pulse Daily`,
    description: category.description ?? `Latest ${category.name} stories from Pulse Daily.`,
  };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  const category = await getCategoryBySlug(slug);
  if (!category) notFound();

  const [{ data: articles, meta }, trending] = await Promise.all([
    getPublishedArticles({ categorySlug: slug, page, limit: 13 }),
    getPublishedArticles({ categorySlug: slug, sortBy: "viewCount", limit: 5 }),
  ]);

  const colors = getCategoryColors(category.slug ?? category.name);
  const [lead, ...rest] = articles;

  return (
    <div className="flex flex-col gap-8">
      <div className={`${colors.badge} py-10`}>
        <div className="mx-auto w-full max-w-6xl px-4">
          <h1 className="text-4xl font-black tracking-tight text-white uppercase md:text-5xl">
            {category.name}
          </h1>
          {category.description && (
            <p className="mt-2 max-w-2xl text-white/80">{category.description}</p>
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
                    href={`/category/${slug}?page=${page - 1}`}
                    aria-disabled={page <= 1}
                    className={`flex items-center gap-1 text-sm font-semibold hover:text-primary ${page <= 1 ? "pointer-events-none opacity-30" : ""}`}
                  >
                    <ChevronLeft className="h-4 w-4" /> Sebelumnya
                  </Link>
                  <span className="text-sm text-muted-foreground">
                    Halaman {page} dari {meta.totalPages}
                  </span>
                  <Link
                    href={`/category/${slug}?page=${page + 1}`}
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

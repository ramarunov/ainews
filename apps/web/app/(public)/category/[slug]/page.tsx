import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArticleCard } from "@/components/public/article-card";
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

  const { data: articles, meta } = await getPublishedArticles({
    categorySlug: slug,
    page,
    limit: 18,
  });

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10">
      <div className="border-b-2 border-primary pb-4">
        <h1 className="text-4xl font-black uppercase tracking-tight">{category.name}</h1>
        {category.description && (
          <p className="mt-2 text-muted-foreground">{category.description}</p>
        )}
      </div>

      {articles.length === 0 && (
        <p className="py-12 text-center text-muted-foreground">
          No published articles in this category yet.
        </p>
      )}

      <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {articles.map((article) => (
          <ArticleCard key={article.id} article={article} variant="medium" />
        ))}
      </div>

      {meta.totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 pt-4">
          {page > 1 && (
            <Link
              href={`/category/${slug}?page=${page - 1}`}
              className="text-sm font-semibold hover:text-primary hover:underline"
            >
              &larr; Previous
            </Link>
          )}
          <span className="text-sm text-muted-foreground">
            Page {page} of {meta.totalPages}
          </span>
          {page < meta.totalPages && (
            <Link
              href={`/category/${slug}?page=${page + 1}`}
              className="text-sm font-semibold hover:text-primary hover:underline"
            >
              Next &rarr;
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

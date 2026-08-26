import type { Metadata } from "next";
import { ArticleCard } from "@/components/public/article-card";
import { Pagination } from "@/components/public/pagination";
import { getPublishedArticles } from "@/lib/public-api";
import { SITE_NAME } from "@/lib/brand";

export const metadata: Metadata = {
  // No manual "— SITE_NAME" suffix - the root layout's title template
  // already appends it to every page title.
  title: "All News",
  description: `Every published story from ${SITE_NAME}, most recent first.`,
};

interface Props {
  searchParams: Promise<{ page?: string }>;
}

export default async function NewsIndexPage({ searchParams }: Props) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const { data: articles, meta } = await getPublishedArticles({ page, limit: 18 });

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10">
      <h1 className="text-3xl font-black tracking-tight">All News</h1>

      {articles.length === 0 && (
        <p className="py-12 text-center text-muted-foreground">No published articles yet.</p>
      )}

      <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {articles.map((article) => (
          <ArticleCard key={article.id} article={article} variant="medium" />
        ))}
      </div>

      <Pagination currentPage={page} totalPages={meta.totalPages} basePath="/news" />
    </div>
  );
}

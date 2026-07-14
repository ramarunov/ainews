import type { Metadata } from "next";
import { ArticleCard } from "@/components/public/article-card";
import { searchPublishedArticles } from "@/lib/public-api";

export const metadata: Metadata = {
  title: "Search — Pulse Daily",
};

interface Props {
  searchParams: Promise<{ q?: string; page?: string }>;
}

export default async function SearchPage({ searchParams }: Props) {
  const { q = "", page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const { data: results, meta } = q.trim()
    ? await searchPublishedArticles(q, page)
    : { data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0 } };

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-10">
      <h1 className="text-3xl font-black tracking-tight">Search Pulse Daily</h1>

      <form method="GET" className="flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search articles…"
          className="flex-1 rounded-md border px-4 py-2 text-base focus:border-primary focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-md bg-primary px-6 py-2 font-bold text-primary-foreground"
        >
          Search
        </button>
      </form>

      {!q.trim() && (
        <p className="text-center text-muted-foreground">Enter a term above to search.</p>
      )}

      {q.trim() && results.length === 0 && (
        <p className="text-center text-muted-foreground">
          No results for &ldquo;{q}&rdquo;.
        </p>
      )}

      {results.length > 0 && (
        <>
          <p className="text-sm text-muted-foreground">
            {meta.total} result{meta.total === 1 ? "" : "s"} for &ldquo;{q}&rdquo;
          </p>
          <div className="grid gap-8 sm:grid-cols-2">
            {results.map((article) => (
              <ArticleCard key={article.id} article={article} variant="medium" />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

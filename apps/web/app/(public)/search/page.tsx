import type { Metadata } from "next";
import { Search as SearchIcon } from "lucide-react";
import { ArticleCard } from "@/components/public/article-card";
import { searchPublishedArticles } from "@/lib/public-api";
import { SITE_NAME } from "@/lib/brand";

export const metadata: Metadata = {
  title: `Cari — ${SITE_NAME}`,
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
    <div className="flex flex-col gap-8">
      <div className="bg-[var(--zone)] py-10">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-4">
          <h1 className="text-3xl font-black tracking-tight">Cari di {SITE_NAME}</h1>
          <form method="GET" className="flex gap-2">
            <div className="relative flex-1">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                name="q"
                defaultValue={q}
                placeholder="Cari berita, topik, atau nama tokoh…"
                className="w-full rounded-md border bg-background py-2.5 pr-4 pl-10 text-base focus:border-primary focus:outline-none"
              />
            </div>
            <button
              type="submit"
              className="rounded-md bg-primary px-6 py-2.5 font-bold text-primary-foreground hover:opacity-90"
            >
              Cari
            </button>
          </form>
        </div>
      </div>

      <div className="mx-auto w-full max-w-4xl px-4 pb-16">
        {!q.trim() && (
          <p className="py-12 text-center text-muted-foreground">
            Masukkan kata kunci di atas untuk mulai mencari.
          </p>
        )}

        {q.trim() && results.length === 0 && (
          <p className="py-12 text-center text-muted-foreground">
            Tidak ada hasil untuk &ldquo;{q}&rdquo;.
          </p>
        )}

        {results.length > 0 && (
          <>
            <p className="mb-6 text-sm text-muted-foreground">
              {meta.total} hasil untuk &ldquo;{q}&rdquo;
            </p>
            <div className="grid gap-8 sm:grid-cols-2">
              {results.map((article) => (
                <ArticleCard key={article.id} article={article} variant="medium" />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

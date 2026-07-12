import Link from "next/link";
import type { Metadata } from "next";
import { getPublishedArticles } from "@/lib/public-api";

export const metadata: Metadata = {
  title: "News",
  description: "Latest published articles.",
};

export default async function NewsIndexPage() {
  const { data: articles } = await getPublishedArticles();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-12">
      <h1 className="text-3xl font-bold">News</h1>

      {articles.length === 0 && (
        <p className="text-muted-foreground">No published articles yet.</p>
      )}

      <div className="flex flex-col gap-6">
        {articles.map((article) => (
          <article key={article.id} className="border-b pb-6 last:border-none">
            <Link href={`/news/${article.slug}`} className="group">
              <h2 className="text-xl font-semibold group-hover:underline">
                {article.title}
              </h2>
            </Link>
            {article.excerpt && (
              <p className="mt-2 text-muted-foreground">{article.excerpt}</p>
            )}
            <div className="mt-2 text-sm text-muted-foreground">
              {article.primaryAuthor?.displayName && (
                <span>{article.primaryAuthor.displayName} · </span>
              )}
              {article.publishedAt && (
                <time dateTime={article.publishedAt}>
                  {new Date(article.publishedAt).toLocaleDateString()}
                </time>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

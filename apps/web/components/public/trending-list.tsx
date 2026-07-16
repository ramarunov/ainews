import Link from "next/link";
import type { PublicArticle } from "@/lib/types";

// The detik.com/kompas.com "Terpopuler" sidebar: a numbered ranking list,
// deliberately text-only (no thumbnails) so the oversized rank number does
// the visual work instead of competing with a small image for attention.
export function TrendingList({ articles, title = "Terpopuler" }: { articles: PublicArticle[]; title?: string }) {
  if (articles.length === 0) return null;

  return (
    <div className="flex flex-col gap-4 rounded-lg border bg-card p-4">
      <h2 className="flex items-center gap-2 text-base font-black tracking-tight uppercase">
        <span className="h-4 w-1 rounded-full bg-primary" />
        {title}
      </h2>
      <ol className="flex flex-col divide-y">
        {articles.map((article, index) => (
          <li key={article.id} className="py-3 first:pt-0 last:pb-0">
            <Link href={`/news/${article.slug}`} className="group flex items-start gap-3">
              <span className="text-3xl leading-none font-black text-muted-foreground/30 group-hover:text-primary/50">
                {index + 1}
              </span>
              <h3 className="line-clamp-3 pt-0.5 leading-snug font-bold group-hover:underline">
                {article.title}
              </h3>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}

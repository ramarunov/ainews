import Link from "next/link";
import type { PublicArticle } from "@/lib/types";

export function BreakingNewsBanner({ articles }: { articles: PublicArticle[] }) {
  if (articles.length === 0) return null;

  return (
    <div className="flex items-center gap-3 bg-primary px-4 py-2 text-primary-foreground">
      <span className="shrink-0 rounded-sm bg-primary-foreground/20 px-2 py-0.5 text-xs font-black uppercase tracking-wider">
        Breaking
      </span>
      <div className="flex min-w-0 flex-1 gap-6 overflow-x-auto">
        {articles.map((article) => (
          <Link
            key={article.id}
            href={`/news/${article.slug}`}
            className="shrink-0 whitespace-nowrap text-sm font-semibold hover:underline"
          >
            {article.title}
          </Link>
        ))}
      </div>
    </div>
  );
}

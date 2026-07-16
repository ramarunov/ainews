import Link from "next/link";
import type { PublicArticle } from "@/lib/types";

export function BreakingNewsBanner({ articles }: { articles: PublicArticle[] }) {
  if (articles.length === 0) return null;

  // Duplicated once so the CSS animation (translateX(0) -> translateX(-50%),
  // see .animate-marquee in globals.css) loops seamlessly instead of
  // snapping back to the start.
  const items = [...articles, ...articles];

  return (
    <div className="flex items-center gap-3 bg-[var(--breaking)] px-4 py-2 text-white">
      <span className="flex shrink-0 items-center gap-1.5 rounded-sm bg-white/15 px-2 py-0.5 text-xs font-black tracking-wider uppercase">
        <span className="h-1.5 w-1.5 rounded-full bg-white animate-live-pulse" />
        Breaking
      </span>
      <div className="min-w-0 flex-1 overflow-hidden">
        <div className="flex w-max animate-marquee gap-10">
          {items.map((article, i) => (
            <Link
              key={`${article.id}-${i}`}
              href={`/news/${article.slug}`}
              className="shrink-0 text-sm font-semibold whitespace-nowrap hover:underline"
            >
              {article.title}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

import Link from "next/link";
import type { PublicArticle } from "@/lib/types";
import type { Category } from "@/lib/types";
import { getCategoryColors } from "@/lib/category-colors";

// The compact "more channels" block real news portals use to give every
// category a presence on the homepage without a full lead-image section
// each — detik.com/kompas.com both fall back to a dense, image-free list
// like this once a category isn't one of the day's headline picks.
export function CategoryMosaicCard({
  category,
  articles,
}: {
  category: Category;
  articles: PublicArticle[];
}) {
  if (articles.length === 0) return null;
  const colors = getCategoryColors(category.slug ?? category.name);

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between">
        <Link
          href={`/category/${category.slug}`}
          className={`text-sm font-black tracking-wide uppercase hover:underline ${colors.text}`}
        >
          {category.name}
        </Link>
        <span className={`h-2 w-2 rounded-full ${colors.badge}`} />
      </div>
      <ul className="flex flex-col divide-y">
        {articles.map((article) => (
          <li key={article.id} className="py-2 first:pt-0 last:pb-0">
            <Link
              href={`/news/${article.slug}`}
              className="line-clamp-2 text-sm leading-snug font-semibold hover:text-primary hover:underline"
            >
              {article.title}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

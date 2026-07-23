import Link from "next/link";
import type { Category, HomepageWidget as HomepageWidgetConfig, PublicArticle } from "@/lib/types";
import { getCategoryColors } from "@/lib/category-colors";
import { getCategoryUrl } from "@/lib/site-url";
import { TrendingList } from "./trending-list";
import { AdSlot } from "./ad-slot";

// Renders one configured homepage sidebar widget (see the superadmin "Site
// Settings" > Homepage Widgets section) by type. Defaults to a single
// `trending` widget when unconfigured - see apps/web/app/(public)/page.tsx.
export function HomepageWidget({
  widget,
  trendingArticles,
  categories,
}: {
  widget: HomepageWidgetConfig;
  trendingArticles: PublicArticle[];
  categories: Category[];
}) {
  if (!widget.enabled) return null;

  if (widget.type === "trending") {
    return <TrendingList articles={trendingArticles} />;
  }

  if (widget.type === "categories") {
    if (categories.length === 0) return null;
    return (
      <div className="rounded-lg border bg-card p-4">
        <h3 className="mb-3 text-xs font-bold tracking-wide uppercase">Kategori Populer</h3>
        <nav className="flex flex-col gap-2">
          {categories.map((category) => {
            const colors = getCategoryColors(category.slug ?? category.name);
            return (
              <Link
                key={category.id}
                href={getCategoryUrl(category)}
                className="flex items-center gap-1.5 text-sm hover:underline"
              >
                <span className={`h-2 w-2 rounded-full ${colors.badge}`} />
                {category.name}
              </Link>
            );
          })}
        </nav>
      </div>
    );
  }

  return <AdSlot value={{ enabled: true, html: widget.html ?? "" }} />;
}

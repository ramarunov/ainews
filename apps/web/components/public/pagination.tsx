import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { getT, type Locale } from "@/lib/i18n";

// Numbered page buttons (1 2 3 … N), detik.com-style, replacing the
// prev/next-only pattern the category/tag/news-index pages used before -
// shared here so the page-number-list logic (including the ellipsis rule)
// isn't duplicated three times across those pages.
function pageNumbers(current: number, total: number): (number | "ellipsis")[] {
  const SIBLINGS = 1; // pages shown on each side of the current page
  const pages = new Set<number>([1, total, current]);
  for (let i = 1; i <= SIBLINGS; i++) {
    if (current - i >= 1) pages.add(current - i);
    if (current + i <= total) pages.add(current + i);
  }
  const sorted = [...pages].sort((a, b) => a - b);

  const result: (number | "ellipsis")[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push("ellipsis");
    result.push(sorted[i]);
  }
  return result;
}

export function Pagination({
  currentPage,
  totalPages,
  basePath = "",
  locale = "id",
}: {
  currentPage: number;
  totalPages: number;
  /**
   * Path the page-number query string is appended to, e.g. "/news" - no
   * trailing "?". Defaults to "" (a bare "?page=N" href, resolved by the
   * browser against the current URL) for dynamic-segment pages
   * (category/tag) that don't need to restate their own slug.
   */
  basePath?: string;
  locale?: Locale;
}) {
  if (totalPages <= 1) return null;
  const t = getT(locale);

  const hrefFor = (page: number) => `${basePath}?page=${page}`;

  return (
    <nav
      aria-label={t("pagination.nav")}
      className="flex items-center justify-center gap-1.5 border-t pt-6"
    >
      <Link
        href={hrefFor(currentPage - 1)}
        aria-disabled={currentPage <= 1}
        aria-label={t("pagination.prev")}
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-md text-sm font-semibold hover:bg-accent hover:text-primary",
          currentPage <= 1 && "pointer-events-none opacity-30",
        )}
      >
        <ChevronLeft className="h-4 w-4" />
      </Link>

      {pageNumbers(currentPage, totalPages).map((page, i) =>
        page === "ellipsis" ? (
          <span key={`ellipsis-${i}`} className="px-1 text-sm text-muted-foreground">
            &hellip;
          </span>
        ) : (
          <Link
            key={page}
            href={hrefFor(page)}
            aria-current={page === currentPage ? "page" : undefined}
            className={cn(
              "flex h-9 min-w-9 items-center justify-center rounded-md px-2 text-sm font-semibold",
              page === currentPage
                ? "bg-primary text-primary-foreground"
                : "hover:bg-accent hover:text-primary",
            )}
          >
            {page}
          </Link>
        ),
      )}

      <Link
        href={hrefFor(currentPage + 1)}
        aria-disabled={currentPage >= totalPages}
        aria-label={t("pagination.next")}
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-md text-sm font-semibold hover:bg-accent hover:text-primary",
          currentPage >= totalPages && "pointer-events-none opacity-30",
        )}
      >
        <ChevronRight className="h-4 w-4" />
      </Link>
    </nav>
  );
}

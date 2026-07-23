import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface BreadcrumbItem {
  label: string;
  // Omitted for the current page - rendered as plain text, not a link.
  href?: string;
}

// Visible breadcrumb trail — the BreadcrumbList JSON-LD emitted alongside
// this on article/category pages carries the same items for search engines;
// this component is the human-visible counterpart, styled via `className`
// (e.g. a light color on a dark category-color band) rather than hardcoding
// one look, since it's reused on both light and colored page headers.
export function Breadcrumb({ items, className }: { items: BreadcrumbItem[]; className?: string }) {
  return (
    <nav
      aria-label="Breadcrumb"
      className={cn("flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground", className)}
    >
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <ChevronRight className="h-3 w-3 shrink-0 opacity-60" />}
          {item.href ? (
            <Link href={item.href} className="opacity-80 hover:opacity-100 hover:underline">
              {item.label}
            </Link>
          ) : (
            <span aria-current="page" className="line-clamp-1 font-medium">
              {item.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}

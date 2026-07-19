"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Menu, Search, X } from "lucide-react";
import type { Category, PublicArticle } from "@/lib/types";
import { getCategoryColors } from "@/lib/category-colors";
import { getPublishedArticles } from "@/lib/public-api";
import { SITE_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { CategoryMegaPanel } from "./category-mega-panel";
import { LoginLink } from "./login-link";

// How long the cursor must stay over a category link before its mega menu
// opens/its preview articles are fetched — avoids firing a request (and a
// jarring flash) for every category the cursor merely passes over while
// scanning the nav strip.
const HOVER_OPEN_DELAY_MS = 150;
// How long to wait before closing after the cursor leaves the nav+panel
// area, so moving from the trigger link down into the panel itself doesn't
// register as "left" and snap the menu shut mid-move.
const HOVER_CLOSE_DELAY_MS = 200;

export function PublicHeader({
  categories,
  today,
  logoUrl,
}: {
  categories: Category[];
  today: string;
  logoUrl?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");

  const [openCategorySlug, setOpenCategorySlug] = useState<string | null>(null);
  const [loadingSlug, setLoadingSlug] = useState<string | null>(null);
  const [previewsBySlug, setPreviewsBySlug] = useState<Record<string, PublicArticle[]>>({});
  const previewsCacheRef = useRef<Record<string, PublicArticle[]>>({});
  const openTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Closing on navigation covers both a nav-link click (which changes
  // pathname while the mouse may still technically be over the strip) and
  // browser back/forward — either way the panel shouldn't linger. Adjusted
  // during render (not in an effect) per React's own guidance for "reset
  // state when a prop changes" — an effect here would setState after the
  // commit and trigger an extra, wasted render pass.
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setOpenCategorySlug(null);
  }

  useEffect(() => {
    return () => {
      clearTimeout(openTimeoutRef.current);
      clearTimeout(closeTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenCategorySlug(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const scheduleOpen = (slug: string) => {
    clearTimeout(closeTimeoutRef.current);
    clearTimeout(openTimeoutRef.current);
    openTimeoutRef.current = setTimeout(() => {
      setOpenCategorySlug(slug);
      // Read the cache ref rather than checking state directly inside a
      // setState updater — React's dev StrictMode deliberately double-
      // invokes functional updaters to catch impure ones, which would fire
      // this fetch twice per hover if the request lived there instead.
      if (previewsCacheRef.current[slug]) return;
      previewsCacheRef.current[slug] = []; // placeholder marks it as "in flight"
      setLoadingSlug(slug);
      getPublishedArticles({ categorySlug: slug, limit: 3 }).then((res) => {
        previewsCacheRef.current = { ...previewsCacheRef.current, [slug]: res.data };
        setPreviewsBySlug(previewsCacheRef.current);
        setLoadingSlug((cur) => (cur === slug ? null : cur));
      });
    }, HOVER_OPEN_DELAY_MS);
  };

  const scheduleClose = () => {
    clearTimeout(openTimeoutRef.current);
    closeTimeoutRef.current = setTimeout(() => setOpenCategorySlug(null), HOVER_CLOSE_DELAY_MS);
  };

  const cancelClose = () => {
    clearTimeout(closeTimeoutRef.current);
  };

  const openCategory = categories.find((c) => c.slug === openCategorySlug);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchValue.trim();
    if (!q) return;
    setSearchOpen(false);
    router.push(`/search?q=${encodeURIComponent(q)}`);
  };

  return (
    <header className="sticky top-0 z-40 bg-background shadow-sm">
      {/* Utility bar — mirrors the slim date/links strip real Indonesian
          news portals run above their main masthead. */}
      <div className="hidden border-b bg-foreground text-background/80 sm:block">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-1.5 text-xs">
          <span>{today}</span>
          <div className="flex items-center gap-4">
            <Link href="/search" className="hover:text-background">
              Bantuan
            </Link>
            <LoginLink className="hover:text-background" />
          </div>
        </div>
      </div>

      {/* Masthead */}
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="md:hidden"
            aria-label="Toggle menu"
            onClick={() => setMenuOpen((o) => !o)}
          >
            {menuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
          <Link href="/" className="flex items-center">
            <Image
              src={logoUrl || "/brand/logo.png"}
              alt={SITE_NAME}
              width={1606}
              height={433}
              unoptimized
              priority
              className="h-9 w-auto"
            />
          </Link>
        </div>

        <button
          type="button"
          aria-label="Search"
          className="rounded-full p-2 hover:bg-muted"
          onClick={() => setSearchOpen((o) => !o)}
        >
          {searchOpen ? <X className="h-5 w-5" /> : <Search className="h-5 w-5" />}
        </button>
      </div>

      {searchOpen && (
        <div className="border-t bg-muted/40 px-4 py-3">
          <form onSubmit={handleSearchSubmit} className="mx-auto flex max-w-6xl gap-2">
            <input
              type="search"
              autoFocus
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              placeholder="Cari berita, topik, atau nama tokoh…"
              className="flex-1 rounded-md border bg-background px-4 py-2 text-base focus:border-primary focus:outline-none"
            />
            <button
              type="submit"
              className="rounded-md bg-primary px-6 py-2 font-bold text-primary-foreground"
            >
              Cari
            </button>
          </form>
        </div>
      )}

      {/* Category nav strip — each channel keeps its own accent color,
          matching how detik.com/kompas.com brand each section distinctly
          rather than one flat nav color throughout. Every category is
          shown (not truncated) since an org can have many; the strip
          scrolls horizontally and the edge fades hint that it does,
          matching how these reference sites handle a long channel list
          instead of hiding items behind a "more" dropdown.

          Hovering a category opens a shared mega-menu panel below the whole
          strip (not a per-item dropdown) showing its 3 latest articles,
          fetched lazily on hover-intent and cached per slug so re-hovering
          the same category doesn't refetch. onMouseLeave/onMouseEnter live
          on this outer wrapper (not the individual links) so moving from a
          trigger link down into the panel itself doesn't register as
          "left" and close it mid-move. */}
      <div
        className="relative hidden md:block"
        onMouseLeave={scheduleClose}
        onMouseEnter={cancelClose}
      >
        <nav className="relative border-t">
          <div className="no-scrollbar mx-auto flex max-w-6xl items-center gap-1 overflow-x-auto px-4">
            {categories.map((category) => {
              const colors = getCategoryColors(category.slug ?? category.name);
              const isActive = pathname === `/category/${category.slug}`;
              return (
                <Link
                  key={category.id}
                  href={`/category/${category.slug}`}
                  onMouseEnter={() => scheduleOpen(category.slug)}
                  className={cn(
                    "shrink-0 border-b-2 px-3 py-2.5 text-sm font-bold tracking-wide uppercase transition-colors hover:border-current",
                    colors.text,
                    isActive ? "border-current" : "border-transparent",
                  )}
                >
                  {category.name}
                </Link>
              );
            })}
          </div>
          <div
            aria-hidden
            className="pointer-events-none absolute top-0 right-0 h-full w-8 bg-gradient-to-l from-background to-transparent"
          />
        </nav>

        {openCategory && (
          <CategoryMegaPanel
            category={openCategory}
            articles={previewsBySlug[openCategory.slug]}
            loading={loadingSlug === openCategory.slug}
          />
        )}
      </div>

      {menuOpen && (
        <nav className="flex flex-col gap-1 border-t bg-background px-4 py-3 md:hidden">
          {categories.map((category) => {
            const colors = getCategoryColors(category.slug ?? category.name);
            const isActive = pathname === `/category/${category.slug}`;
            return (
              <Link
                key={category.id}
                href={`/category/${category.slug}`}
                className={cn(
                  "rounded-md px-2 py-2 text-sm font-bold tracking-wide uppercase hover:bg-muted",
                  isActive && colors.text,
                )}
                onClick={() => setMenuOpen(false)}
              >
                {category.name}
              </Link>
            );
          })}
        </nav>
      )}
    </header>
  );
}

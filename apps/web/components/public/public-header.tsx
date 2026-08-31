"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import type { Category, PublicArticle } from "@/lib/types";
import { getCategoryColors } from "@/lib/category-colors";
import { getCategoryUrl, getRootDomain } from "@/lib/site-url";
import { getPublishedArticles } from "@/lib/public-api";
import { SITE_NAME } from "@/lib/brand";
import { getT, localizePath, type Locale } from "@/lib/i18n";
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
  activeCategory,
  today,
  logoUrl,
  locale = "id",
}: {
  // The nav strip's items - either the site's top-level categories (apex),
  // or the current category's subcategories when browsing its subdomain
  // and it has any (see (public)/layout.tsx).
  categories: Category[];
  // Set only when `categories` above is a subcategory list - lets the
  // header show which section you're in, since its own name no longer
  // appears in the nav strip itself once replaced by its children.
  activeCategory?: Category;
  today: string;
  logoUrl?: string;
  // "en" renders the English-edition header: localized labels, /en/*
  // hrefs, and category previews scoped to the English catalogue.
  locale?: Locale;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const t = getT(locale);
  const homeHref = locale === "en" ? "/en" : "/";
  const catHref = (c: Category) =>
    locale === "en" ? `/en/category/${c.slug}` : getCategoryUrl(c);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");

  const [openCategorySlug, setOpenCategorySlug] = useState<string | null>(null);
  const [loadingSlug, setLoadingSlug] = useState<string | null>(null);
  const [previewsBySlug, setPreviewsBySlug] = useState<Record<string, PublicArticle[]>>({});
  const previewsCacheRef = useRef<Record<string, PublicArticle[]>>({});
  const openTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // The category strip is wider than the viewport for most orgs - a mouse
  // has no native gesture for horizontal scroll (no shift-wheel convention
  // most readers know, unlike a trackpad's two-finger swipe), so without
  // this it just looks "cut off" with no way to reach the rest, which is
  // exactly what was reported. navScrollRef backs both the wheel-to-
  // horizontal conversion below and the two click-to-scroll arrow buttons.
  const navScrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateNavScrollButtons = () => {
    const el = navScrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };

  useEffect(() => {
    updateNavScrollButtons();
    window.addEventListener("resize", updateNavScrollButtons);
    return () => window.removeEventListener("resize", updateNavScrollButtons);
    // categories.length: re-measure if the nav strip's content changes
    // shape (e.g. apex categories vs. a subdomain's shorter subcategory
    // list), not just on window resize.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories.length]);

  const scrollNavBy = (delta: number) => {
    navScrollRef.current?.scrollBy({ left: delta, behavior: "smooth" });
  };

  const handleNavWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const el = navScrollRef.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    // Convert an ordinary vertical mouse-wheel scroll into horizontal
    // movement across the strip - a trackpad's native horizontal swipe
    // already works via overflow-x-auto and is left untouched.
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    }
  };

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
      getPublishedArticles({ categorySlug: slug, limit: 3, language: locale }).then((res) => {
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
    router.push(`${localizePath("/search", locale)}?q=${encodeURIComponent(q)}`);
  };

  return (
    <header className="sticky top-0 z-40 bg-background shadow-sm">
      {/* Utility bar — mirrors the slim date/links strip real Indonesian
          news portals run above their main masthead. On a category
          subdomain whose nav strip below has swapped to its subcategories,
          this is the only remaining indicator of which section you're in
          (its own name no longer appears in the nav strip itself) - plus a
          way back to the cross-category apex, which the logo link no
          longer points to on this host (see (public)/layout.tsx). */}
      <div className="hidden border-b bg-foreground text-background/80 sm:block">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-1.5 text-xs">
          <div className="flex items-center gap-3">
            <span>{today}</span>
            {activeCategory && (
              <>
                <span className="opacity-40">•</span>
                <span
                  className={`font-bold tracking-wide uppercase ${getCategoryColors(activeCategory.slug ?? activeCategory.name).text}`}
                >
                  {activeCategory.name}
                </span>
                <a href={`https://${getRootDomain()}`} className="opacity-70 hover:text-background hover:opacity-100">
                  {t("nav.allChannels")} &rarr;
                </a>
              </>
            )}
          </div>
          <div className="flex items-center gap-4">
            <Link href={localizePath("/search", locale)} className="hover:text-background">
              {t("nav.help")}
            </Link>
            <LoginLink className="hover:text-background" />
          </div>
        </div>
      </div>

      {/* Masthead */}
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <div className="flex items-center gap-3">
          {/* Fixed-size box + fill + object-contain, not a guessed
              width/height pair - an admin can upload a logo of any aspect
              ratio, and hardcoding the original static asset's dimensions
              (1606x433) here stretched/distorted every differently-shaped
              logo uploaded since, confirmed live once a real replacement
              logo (2038x771, a different ratio) was uploaded. */}
          <Link href={homeHref} className="relative flex h-9 w-36 items-center">
            <Image
              src={logoUrl || "/brand/logo.png"}
              alt={SITE_NAME}
              fill
              priority
              className="object-contain object-left"
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
              placeholder={t("search.placeholder")}
              className="flex-1 rounded-md border bg-background px-4 py-2 text-base focus:border-primary focus:outline-none"
            />
            <button
              type="submit"
              className="rounded-md bg-primary px-6 py-2 font-bold text-primary-foreground"
            >
              {t("search.button")}
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
          instead of hiding items behind a "more" dropdown. Visible at every
          viewport width (not just desktop) - on a narrow screen the strip
          itself is the primary way to browse categories, horizontally
          scrollable by touch, rather than hiding them behind a hamburger
          toggle's vertical list.

          Hovering a category opens a shared mega-menu panel below the whole
          strip (not a per-item dropdown) showing its 3 latest articles,
          fetched lazily on hover-intent and cached per slug so re-hovering
          the same category doesn't refetch - this simply never triggers on
          touch (no hover), so a tap just navigates directly via the link's
          href. onMouseLeave/onMouseEnter live on this outer wrapper (not the
          individual links) so moving from a trigger link down into the
          panel itself doesn't register as "left" and close it mid-move. */}
      <div className="relative" onMouseLeave={scheduleClose} onMouseEnter={cancelClose}>
        <nav className="relative border-t">
          <div
            ref={navScrollRef}
            onScroll={updateNavScrollButtons}
            onWheel={handleNavWheel}
            className="no-scrollbar mx-auto flex max-w-6xl items-center gap-1 overflow-x-auto px-4"
          >
            {categories.map((category) => {
              const colors = getCategoryColors(category.slug ?? category.name);
              const isActive =
                pathname === `${locale === "en" ? "/en" : ""}/category/${category.slug}`;
              return (
                <Link
                  key={category.id}
                  href={catHref(category)}
                  onMouseEnter={() => scheduleOpen(category.slug)}
                  className={cn(
                    "shrink-0 border-b-2 px-3 py-3 text-sm font-bold tracking-wide uppercase transition-colors hover:border-current",
                    colors.text,
                    isActive ? "border-current" : "border-transparent",
                  )}
                >
                  {category.name}
                </Link>
              );
            })}
          </div>

          {canScrollLeft && (
            <>
              <div
                aria-hidden
                className="pointer-events-none absolute top-0 left-0 h-full w-10 bg-gradient-to-r from-background to-transparent"
              />
              <button
                type="button"
                aria-label={t("nav.scrollLeft")}
                onClick={() => scrollNavBy(-240)}
                className="absolute top-1/2 left-1 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border bg-background shadow-sm hover:bg-muted"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            </>
          )}

          {canScrollRight && (
            <>
              <div
                aria-hidden
                className="pointer-events-none absolute top-0 right-0 h-full w-10 bg-gradient-to-l from-background to-transparent"
              />
              <button
                type="button"
                aria-label={t("nav.scrollRight")}
                onClick={() => scrollNavBy(240)}
                className="absolute top-1/2 right-1 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border bg-background shadow-sm hover:bg-muted"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </>
          )}
        </nav>

        {openCategory && (
          <CategoryMegaPanel
            category={openCategory}
            articles={previewsBySlug[openCategory.slug]}
            loading={loadingSlug === openCategory.slug}
            locale={locale}
          />
        )}
      </div>

    </header>
  );
}

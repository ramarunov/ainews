"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { Menu, Search, X } from "lucide-react";
import type { Category } from "@/lib/types";
import { getCategoryColors } from "@/lib/category-colors";
import { cn } from "@/lib/utils";

export function PublicHeader({
  categories,
  today,
}: {
  categories: Category[];
  today: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");

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
            <Link href="/login" className="hover:text-background">
              Login Redaksi
            </Link>
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
          <Link href="/" className="text-2xl font-black tracking-tight">
            Pulse<span className="text-primary">Daily</span>
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
          instead of hiding items behind a "more" dropdown. */}
      <nav className="relative hidden border-t md:block">
        <div className="no-scrollbar mx-auto flex max-w-6xl items-center gap-1 overflow-x-auto px-4">
          {categories.map((category) => {
            const colors = getCategoryColors(category.slug ?? category.name);
            const isActive = pathname === `/category/${category.slug}`;
            return (
              <Link
                key={category.id}
                href={`/category/${category.slug}`}
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

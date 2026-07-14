"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, Search, X } from "lucide-react";
import type { Category } from "@/lib/types";

export function PublicHeader({ categories }: { categories: Category[] }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b bg-background">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <div className="flex items-center gap-4">
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

        <nav className="hidden items-center gap-6 md:flex">
          {categories.slice(0, 6).map((category) => (
            <Link
              key={category.id}
              href={`/category/${category.slug}`}
              className="text-sm font-bold uppercase tracking-wide hover:text-primary"
            >
              {category.name}
            </Link>
          ))}
        </nav>

        <Link href="/search" aria-label="Search" className="shrink-0">
          <Search className="h-5 w-5 hover:text-primary" />
        </Link>
      </div>

      {menuOpen && (
        <nav className="flex flex-col gap-1 border-t bg-background px-4 py-3 md:hidden">
          {categories.map((category) => (
            <Link
              key={category.id}
              href={`/category/${category.slug}`}
              className="rounded-md px-2 py-2 text-sm font-bold uppercase tracking-wide hover:bg-muted"
              onClick={() => setMenuOpen(false)}
            >
              {category.name}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}

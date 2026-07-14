import Link from "next/link";
import type { Category } from "@/lib/types";

export function PublicFooter({ categories }: { categories: Category[] }) {
  return (
    <footer className="mt-12 border-t bg-muted/30">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between">
          <div>
            <p className="text-xl font-black tracking-tight">
              Pulse<span className="text-primary">Daily</span>
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Independent, fast, and to the point.
            </p>
          </div>
          <nav className="flex flex-wrap gap-x-6 gap-y-2">
            {categories.map((category) => (
              <Link
                key={category.id}
                href={`/category/${category.slug}`}
                className="text-sm font-medium text-muted-foreground hover:text-primary"
              >
                {category.name}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex flex-col gap-2 border-t pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>&copy; {new Date().getFullYear()} Pulse Daily. All rights reserved.</p>
          <Link href="/login" className="hover:text-primary hover:underline">
            Staff Login
          </Link>
        </div>
      </div>
    </footer>
  );
}

import Link from "next/link";
import type { Category } from "@/lib/types";
import { getCategoryColors } from "@/lib/category-colors";

export function PublicFooter({ categories }: { categories: Category[] }) {
  return (
    <footer className="mt-12 border-t bg-foreground text-background/80">
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-3 lg:col-span-2">
          <p className="text-2xl font-black tracking-tight text-background">
            Pulse<span className="text-primary">Daily</span>
          </p>
          <p className="max-w-sm text-sm">
            Independent, fast, and to the point — berita terkini yang akurat dan mudah dipahami,
            kapan saja Anda butuhkan.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="text-xs font-bold tracking-wide text-background uppercase">Kategori</h3>
          <nav className="flex flex-col gap-2">
            {categories.slice(0, 6).map((category) => {
              const colors = getCategoryColors(category.slug ?? category.name);
              return (
                <Link
                  key={category.id}
                  href={`/category/${category.slug}`}
                  className="w-fit text-sm hover:text-background"
                >
                  <span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${colors.badge}`} />
                  {category.name}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="text-xs font-bold tracking-wide text-background uppercase">Tautan</h3>
          <nav className="flex flex-col gap-2">
            <Link href="/search" className="w-fit text-sm hover:text-background">
              Cari Berita
            </Link>
            <Link href="/login" className="w-fit text-sm hover:text-background">
              Login Redaksi
            </Link>
          </nav>
        </div>
      </div>

      <div className="border-t border-background/10">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-5 text-xs sm:flex-row sm:items-center sm:justify-between">
          <p>&copy; {new Date().getFullYear()} Pulse Daily. Seluruh hak cipta dilindungi.</p>
          <p>Didukung oleh AI Native News CMS</p>
        </div>
      </div>
    </footer>
  );
}

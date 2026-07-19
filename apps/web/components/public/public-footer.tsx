import Link from "next/link";
import type { Category, SiteFooterSetting } from "@/lib/types";
import { getCategoryColors } from "@/lib/category-colors";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/brand";
import { LoginLink } from "./login-link";

export function PublicFooter({
  categories,
  footerSetting,
}: {
  categories: Category[];
  footerSetting?: SiteFooterSetting;
}) {
  const customLinks = footerSetting?.links ?? [];

  return (
    <footer className="mt-12 border-t bg-foreground text-background/80">
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-12 sm:grid-cols-2 lg:grid-cols-5">
        <div className="flex flex-col gap-3 lg:col-span-2">
          <p className="text-2xl font-black tracking-tight text-background">
            berita<span className="text-primary">bot</span>.com
          </p>
          <p className="max-w-sm text-sm">{footerSetting?.description || `${SITE_TAGLINE}.`}</p>
        </div>

        <div className="flex flex-col gap-3 lg:col-span-2">
          <h3 className="text-xs font-bold tracking-wide text-background uppercase">Kategori</h3>
          <nav className="grid grid-cols-2 gap-x-4 gap-y-2">
            {categories.map((category) => {
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
            <Link href="/about" className="w-fit text-sm hover:text-background">
              Tentang Kami
            </Link>
            <LoginLink className="w-fit text-sm hover:text-background" />
            {customLinks.map((link, idx) => (
              <Link key={idx} href={link.url} className="w-fit text-sm hover:text-background">
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>

      <div className="border-t border-background/10">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-5 text-xs sm:flex-row sm:items-center sm:justify-between">
          <p>&copy; {new Date().getFullYear()} {SITE_NAME}. Seluruh hak cipta dilindungi.</p>
          <p>Didukung oleh AI Native News CMS</p>
        </div>
      </div>
    </footer>
  );
}

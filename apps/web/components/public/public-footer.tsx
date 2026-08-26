import Image from "next/image";
import Link from "next/link";
import type { Category, FooterWidget, Page, SiteFooterSetting } from "@/lib/types";
import { getCategoryColors } from "@/lib/category-colors";
import { getCategoryUrl, getRootDomain } from "@/lib/site-url";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/brand";
import { LoginLink } from "./login-link";

// Shown until an admin ever saves a footer configuration - matches the
// original hardcoded 3-section footer this replaced (brand blurb / category
// list / links), with each section now expressed as an editable widget and
// a 4th "Halaman" column added for the Pages feature, so a first-run site
// still looks fully populated with zero admin setup required.
const DEFAULT_FOOTER_COLUMNS: { widgets: FooterWidget[] }[] = [
  { widgets: [{ id: "default-text", type: "text", title: "", content: `${SITE_TAGLINE}.` }] },
  { widgets: [{ id: "default-categories", type: "categories", title: "Kategori" }] },
  {
    widgets: [
      {
        id: "default-links",
        type: "links",
        title: "Tautan",
        links: [{ label: "Cari Berita", url: "/search" }],
      },
    ],
  },
  { widgets: [{ id: "default-pages", type: "pages", title: "Halaman" }] },
];

function FooterWidgetView({
  widget,
  categories,
  pages,
  rootDomain,
}: {
  widget: FooterWidget;
  categories: Category[];
  pages: Page[];
  rootDomain: string;
}) {
  const heading = widget.title && (
    <h3 className="text-xs font-bold tracking-wide text-background uppercase">{widget.title}</h3>
  );

  if (widget.type === "text") {
    return (
      <div className="flex flex-col gap-3">
        {heading}
        {/* Superadmin-authored content, same trust boundary as Custom
            Scripts / Ad Widgets elsewhere in Site Settings - not
            sanitized, by design, for the same reason those aren't. */}
        <div className="max-w-sm text-sm" dangerouslySetInnerHTML={{ __html: widget.content ?? "" }} />
      </div>
    );
  }

  if (widget.type === "links") {
    if (!widget.links || widget.links.length === 0) return null;
    return (
      <div className="flex flex-col gap-3">
        {heading}
        <nav className="flex flex-col gap-2">
          {widget.links.map((link, idx) => (
            <Link key={idx} href={link.url} className="w-fit text-sm hover:text-background">
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    );
  }

  if (widget.type === "categories") {
    // Top-level only - `categories` here is the site-wide flat list, which
    // now includes subcategories too (see getCategories() in
    // public-api.ts). The footer's category widget is meant to mirror the
    // main section list, not enumerate every subcategory alongside it.
    const topLevel = categories.filter((c) => !c.parentId);
    if (topLevel.length === 0) return null;
    return (
      <div className="flex flex-col gap-3">
        {heading}
        <nav className="grid grid-cols-2 gap-x-4 gap-y-2">
          {topLevel.map((category) => {
            const colors = getCategoryColors(category.slug ?? category.name);
            return (
              <Link
                key={category.id}
                href={getCategoryUrl(category)}
                className="w-fit text-sm hover:text-background"
              >
                <span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${colors.badge}`} />
                {category.name}
              </Link>
            );
          })}
        </nav>
      </div>
    );
  }

  if (widget.type === "pages") {
    if (pages.length === 0) return null;
    return (
      <div className="flex flex-col gap-3">
        {heading}
        <nav className="flex flex-col gap-2">
          {pages.map((page) => (
            <Link
              key={page.id}
              href={`https://${rootDomain}/${page.slug}`}
              className="w-fit text-sm hover:text-background"
            >
              {page.title}
            </Link>
          ))}
        </nav>
      </div>
    );
  }

  return null;
}

export function PublicFooter({
  categories,
  pages,
  footerSetting,
  logoUrl,
}: {
  categories: Category[];
  pages: Page[];
  footerSetting?: SiteFooterSetting;
  logoUrl?: string;
}) {
  const rootDomain = getRootDomain();
  // Defensive against a partially-saved or stale value (fewer/more than 4
  // columns) rather than assuming the admin-managed JSON is always exactly
  // shaped right - pads with empty columns, ignores anything past the 4th.
  const columns = Array.from({ length: 4 }, (_, i) => footerSetting?.columns?.[i] ?? DEFAULT_FOOTER_COLUMNS[i]);

  return (
    <footer className="mt-12 border-t bg-foreground text-background/80">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-12">
        {logoUrl ? (
          // Fixed-size box + fill + object-contain, not a guessed
          // width/height pair - same reasoning as public-header.tsx's logo:
          // an admin can upload a logo of any aspect ratio, and hardcoding
          // the original static asset's dimensions stretched/distorted it.
          // No color/invert filter applied - shows the admin-uploaded logo
          // exactly as uploaded, same as the header. If it doesn't read
          // well against this dark footer background, that's a "upload a
          // footer-suited variant" concern, not something to paper over
          // with a filter that would flatten an intentionally-colored logo.
          <div className="relative h-9 w-36">
            <Image src={logoUrl} alt={SITE_NAME} fill className="object-contain object-left" />
          </div>
        ) : (
          <p className="text-2xl font-black tracking-tight text-background">{SITE_NAME}</p>
        )}
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {columns.map((column, i) => (
            <div key={i} className="flex flex-col gap-6">
              {column.widgets.map((widget) => (
                <FooterWidgetView
                  key={widget.id}
                  widget={widget}
                  categories={categories}
                  pages={pages}
                  rootDomain={rootDomain}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-background/10">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-5 text-xs sm:flex-row sm:items-center sm:justify-between">
          <p>&copy; {new Date().getFullYear()} {SITE_NAME}. Seluruh hak cipta dilindungi.</p>
          <div className="flex items-center gap-4">
            <p>Didukung oleh AI Native News CMS</p>
            <LoginLink className="hover:text-background" />
          </div>
        </div>
      </div>
    </footer>
  );
}

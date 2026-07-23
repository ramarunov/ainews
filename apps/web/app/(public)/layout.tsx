import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import { PublicHeader } from "@/components/public/public-header";
import { PublicFooter } from "@/components/public/public-footer";
import { AdSlot } from "@/components/public/ad-slot";
import { findPublicSetting, getCategories, getPages, getPublicSettings } from "@/lib/public-api";
import { getRootDomain, resolveHostCategory } from "@/lib/site-url";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/brand";
import type { CustomScriptsSetting, SiteBrandingSetting, SiteFooterSetting } from "@/lib/types";
import "../globals.css";

// Own root layout (see route-groups.md's "multiple root layouts" pattern) -
// the reader-facing site is Indonesian, but shares this Next.js app with
// the (English) admin dashboard, which has its own separate root layout
// under app/(dashboard)/layout.tsx. A single shared app/layout.tsx can only
// ever declare one <html lang>, which is wrong for one side or the other -
// this is what lets each side declare its own.
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: SITE_NAME, template: `%s — ${SITE_NAME}` },
  description: SITE_TAGLINE,
};

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [categories, pages, settings] = await Promise.all([
    getCategories(),
    getPages(),
    getPublicSettings(),
  ]);
  // Rendered once per request/revalidate on the server and passed down as a
  // plain string — avoids a client-side `new Date()` in PublicHeader, which
  // would mismatch between server and client render (hydration warning).
  const today = new Date().toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const footerSetting = findPublicSetting<SiteFooterSetting>(settings, "site.footer");
  const customScripts = findPublicSetting<CustomScriptsSetting>(settings, "site.custom_scripts");
  const branding = findPublicSetting<SiteBrandingSetting>(settings, "site.branding");

  // On a category's own subdomain, the header nav swaps from the full
  // top-level category list to that category's subcategories (topical
  // authority: each subdomain's nav stays scoped to its own topic) - see
  // PublicHeader's activeCategory prop. Falls back to the top-level list
  // when the category has no subcategories yet, so the nav is never empty.
  const hostname = (await headers()).get("host")?.split(":")[0] ?? "";
  const rootDomain = getRootDomain();
  const activeCategory = resolveHostCategory(hostname, rootDomain, categories);
  const children_ = activeCategory
    ? categories.filter((c) => c.parentId === activeCategory.id && c.isActive !== false)
    : [];
  const navCategories = children_.length > 0 ? children_ : categories.filter((c) => !c.parentId);

  return (
    <html
      lang="id"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <div className="pulse-daily flex min-h-full flex-1 flex-col bg-background text-foreground">
          <AdSlot value={customScripts?.header} />
          <PublicHeader
            categories={navCategories}
            activeCategory={children_.length > 0 ? activeCategory : undefined}
            today={today}
            logoUrl={branding?.logoUrl}
          />
          <main className="flex flex-1 flex-col">{children}</main>
          <PublicFooter categories={categories} pages={pages} footerSetting={footerSetting} />
          <AdSlot value={customScripts?.footer} />
        </div>
      </body>
    </html>
  );
}

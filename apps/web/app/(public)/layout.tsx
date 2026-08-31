import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { PublicHeader } from "@/components/public/public-header";
import { PublicFooter } from "@/components/public/public-footer";
import { AdSlot } from "@/components/public/ad-slot";
import { TopBannerAd } from "@/components/public/top-banner-ad";
import { findPublicSetting, getCategories, getPages, getPublicSettings } from "@/lib/public-api";
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
  // Google Discover explicitly requires max-image-preview:large to ever
  // show the large-image card format (the default without this is a small
  // thumbnail, in both Discover and regular Search results) - this was
  // missing sitewide before, costing nothing to add and pure upside.
  // Individual pages (e.g. buildArticleMetadata's per-article `robots` from
  // the SEO panel, or /search's noindex) still override this when they
  // explicitly set their own `robots`.
  robots: {
    index: true,
    follow: true,
    "max-image-preview": "large",
    "max-snippet": -1,
    "max-video-preview": -1,
  },
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

  // Apex-only in this deployment: the category-subdomain feature is off
  // (ENABLE_CATEGORY_SUBDOMAINS) and proxy.ts 404s every non-apex host, so
  // the header nav is always the site's top-level categories. This used to
  // read the Host header (`headers()`, a Dynamic API) to swap the nav to a
  // subdomain's subcategories - which forced every dynamic-segment page
  // under this layout (articles, /category/[slug], /tag/[slug],
  // /author/[slug]) to render on-demand with Cache-Control: no-store.
  // Dropping the call is what makes those pages CDN/ISR-cacheable. If
  // subdomains are ever enabled, the per-host nav + canonical redirect
  // move to proxy.ts (middleware doesn't taint page caching).
  const navCategories = categories.filter((c) => !c.parentId);

  return (
    <html
      lang="id"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <div className="pulse-daily flex min-h-full flex-1 flex-col bg-background text-foreground">
          <AdSlot value={customScripts?.header} />
          {/* Genuinely fixed-position, mobile-only banner + close button -
              see top-banner-ad.tsx's own comment for the full mechanism
              (why it needs to be `fixed` + a spacer, not just placed above
              the sticky header, to get the "header covers the banner once
              scrolled" effect kompas.com uses, and why that classifies it
              as a "sticky ad" requiring a close button under Google's
              Better Ads Standard). */}
          <TopBannerAd value={findPublicSetting(settings, "ads.top_banner")} />
          <PublicHeader
            categories={navCategories}
            today={today}
            logoUrl={branding?.logoUrl}
          />
          <main className="flex flex-1 flex-col">{children}</main>
          <PublicFooter
            categories={categories}
            pages={pages}
            footerSetting={footerSetting}
            logoUrl={branding?.logoUrl}
          />
          <AdSlot value={customScripts?.footer} />
        </div>
      </body>
    </html>
  );
}

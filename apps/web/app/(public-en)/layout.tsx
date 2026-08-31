import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { PublicHeader } from "@/components/public/public-header";
import { PublicFooter } from "@/components/public/public-footer";
import { AdSlot } from "@/components/public/ad-slot";
import { TopBannerAd } from "@/components/public/top-banner-ad";
import { findPublicSetting, getCategories, getPages, getPublicSettings } from "@/lib/public-api";
import { SITE_NAME } from "@/lib/brand";
import type { CustomScriptsSetting, SiteBrandingSetting, SiteFooterSetting } from "@/lib/types";
import "../globals.css";

// Third root layout for this Next.js app, alongside app/(public)/layout.tsx
// (the Indonesian reader site) and app/(dashboard)/layout.tsx (the English
// admin UI) - see route-groups.md's "multiple root layouts". This is the
// English translation edition served under /en/*: same PublicHeader /
// PublicFooter chrome as the Indonesian site but with locale="en" (English
// labels, /en/* hrefs, English-catalogue category previews), and its own
// <html lang="en">. Apex-only - no category-subdomain routing here.
const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: `${SITE_NAME} — English`, template: `%s — ${SITE_NAME}` },
  description: "English translations of the latest Indonesian news from RusdiMedia.com.",
  robots: {
    index: true,
    follow: true,
    "max-image-preview": "large",
    "max-snippet": -1,
    "max-video-preview": -1,
  },
};

export default async function PublicEnLayout({ children }: { children: React.ReactNode }) {
  const [categories, pages, settings] = await Promise.all([
    getCategories(),
    getPages(),
    getPublicSettings(),
  ]);
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const footerSetting = findPublicSetting<SiteFooterSetting>(settings, "site.footer");
  const customScripts = findPublicSetting<CustomScriptsSetting>(settings, "site.custom_scripts");
  const branding = findPublicSetting<SiteBrandingSetting>(settings, "site.branding");

  // Apex-only: the English edition never runs on a category subdomain, so
  // the nav strip is always the site's top-level categories.
  const navCategories = categories.filter((c) => !c.parentId);

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <div className="pulse-daily flex min-h-full flex-1 flex-col bg-background text-foreground">
          <AdSlot value={customScripts?.header} />
          <TopBannerAd value={findPublicSetting(settings, "ads.top_banner")} />
          <PublicHeader
            categories={navCategories}
            today={today}
            logoUrl={branding?.logoUrl}
            locale="en"
          />
          <main className="flex flex-1 flex-col">{children}</main>
          <PublicFooter
            categories={categories}
            pages={pages}
            footerSetting={footerSetting}
            logoUrl={branding?.logoUrl}
            locale="en"
          />
          <AdSlot value={customScripts?.footer} />
        </div>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Image from "next/image";
import Link from "next/link";
import { AdSlot } from "@/components/public/ad-slot";
import { findPublicSetting, getPages, getPublicSettings } from "@/lib/public-api";
import { getRootDomain } from "@/lib/site-url";
import { SITE_NAME } from "@/lib/brand";
import { getT } from "@/lib/i18n";
import type { CustomScriptsSetting, Page, SiteBrandingSetting } from "@/lib/types";
import "../globals.css";

// Third root layout for this Next.js app, alongside app/(public)/layout.tsx
// (the Indonesian reader site) and app/(dashboard)/layout.tsx (the English
// admin UI) - see route-groups.md's "multiple root layouts". This one is
// the English translation edition served under /en/*; it needs its own
// <html lang="en"> and its own (English) chrome, which a shared layout
// can't express.
const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

const t = getT("en");

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

// The stable editorial/legal strip, same slugs as the Indonesian footer
// (public-footer.tsx). No English versions of these pages exist yet, so
// they point at the apex Indonesian originals for now.
const EDITORIAL_SLUGS = [
  "tentang-kami",
  "metodologi-redaksi",
  "kebijakan-koreksi",
  "pedoman-media-siber",
  "kebijakan-privasi",
  "disclaimer-2",
  "hubungi-kami",
];

export default async function PublicEnLayout({ children }: { children: React.ReactNode }) {
  const [pages, settings] = await Promise.all([getPages(), getPublicSettings()]);
  const rootDomain = getRootDomain();
  const branding = findPublicSetting<SiteBrandingSetting>(settings, "site.branding");
  const customScripts = findPublicSetting<CustomScriptsSetting>(settings, "site.custom_scripts");
  const editorialLinks = EDITORIAL_SLUGS.map((slug) => pages.find((p) => p.slug === slug)).filter(
    (p): p is Page => Boolean(p),
  );

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <div className="pulse-daily flex min-h-full flex-1 flex-col bg-background text-foreground">
          <AdSlot value={customScripts?.header} />
          <header className="border-b">
            <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-4">
              <Link href="/en" className="flex items-center gap-2">
                {branding?.logoUrl ? (
                  <span className="relative block h-8 w-36">
                    <Image src={branding.logoUrl} alt={SITE_NAME} fill className="object-contain object-left" />
                  </span>
                ) : (
                  <span className="text-xl font-black tracking-tight">{SITE_NAME}</span>
                )}
                <span className="rounded bg-primary px-1.5 py-0.5 text-[10px] font-black tracking-widest text-primary-foreground uppercase">
                  EN
                </span>
              </Link>
              <Link
                href={`https://${rootDomain}/`}
                className="text-sm font-semibold text-muted-foreground hover:text-primary"
              >
                {t("lang.switchTo")}
              </Link>
            </div>
          </header>
          <main className="flex flex-1 flex-col">{children}</main>
          <footer className="mt-12 border-t bg-foreground text-background/80">
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-10">
              <p className="text-2xl font-black tracking-tight text-background">{SITE_NAME}</p>
              <p className="max-w-lg text-sm">
                English translations of the latest Indonesian news, for the diaspora, expats and
                anyone following Indonesia from abroad.
              </p>
              {editorialLinks.length > 0 && (
                <nav className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-xs">
                  {editorialLinks.map((p) => (
                    <Link
                      key={p.slug}
                      href={`https://${rootDomain}/${p.slug}`}
                      className="hover:text-background"
                    >
                      {p.title}
                    </Link>
                  ))}
                </nav>
              )}
              <p className="mt-2 text-xs">
                &copy; {new Date().getFullYear()} {SITE_NAME}. {t("footer.rights")}
              </p>
            </div>
          </footer>
          <AdSlot value={customScripts?.footer} />
        </div>
      </body>
    </html>
  );
}

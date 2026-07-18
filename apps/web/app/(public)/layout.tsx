import { PublicHeader } from "@/components/public/public-header";
import { PublicFooter } from "@/components/public/public-footer";
import { AdSlot } from "@/components/public/ad-slot";
import { findPublicSetting, getCategories, getPublicSettings } from "@/lib/public-api";
import type { CustomScriptsSetting, SiteBrandingSetting, SiteFooterSetting } from "@/lib/types";

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [categories, settings] = await Promise.all([getCategories(), getPublicSettings()]);
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

  return (
    <div className="pulse-daily flex min-h-full flex-1 flex-col bg-background text-foreground">
      <AdSlot value={customScripts?.header} />
      <PublicHeader categories={categories} today={today} logoUrl={branding?.logoUrl} />
      <main className="flex flex-1 flex-col">{children}</main>
      <PublicFooter categories={categories} footerSetting={footerSetting} />
      <AdSlot value={customScripts?.footer} />
    </div>
  );
}

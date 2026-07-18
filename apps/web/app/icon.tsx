import { readFile } from "node:fs/promises";
import path from "node:path";
import { findPublicSetting, getPublicSettings } from "@/lib/public-api";
import type { SiteBrandingSetting } from "@/lib/types";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

// Dynamic rather than the static app/icon.png file convention, so a
// superadmin-uploaded favicon (Site Settings > Branding) takes effect
// without a rebuild. Falls back to the bundled default whenever no custom
// favicon is set, or the custom one fails to fetch.
export default async function Icon() {
  const settings = await getPublicSettings();
  const branding = findPublicSetting<SiteBrandingSetting>(settings, "site.branding");

  if (branding?.faviconUrl) {
    try {
      const res = await fetch(branding.faviconUrl);
      if (res.ok) {
        const buffer = await res.arrayBuffer();
        const type = res.headers.get("content-type") ?? contentType;
        return new Response(buffer, { headers: { "Content-Type": type } });
      }
    } catch {
      // Falls through to the default below.
    }
  }

  const defaultPath = path.join(process.cwd(), "public", "brand", "default-icon.png");
  const buffer = await readFile(defaultPath);
  return new Response(new Uint8Array(buffer), { headers: { "Content-Type": contentType } });
}

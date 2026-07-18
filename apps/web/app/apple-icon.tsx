import { readFile } from "node:fs/promises";
import path from "node:path";
import { findPublicSetting, getPublicSettings } from "@/lib/public-api";
import type { SiteBrandingSetting } from "@/lib/types";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// See app/icon.tsx - same dynamic-favicon reasoning, just for the
// apple-touch-icon variant iOS/iPadOS home-screen bookmarks use.
export default async function AppleIcon() {
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

  const defaultPath = path.join(process.cwd(), "public", "brand", "default-apple-icon.png");
  const buffer = await readFile(defaultPath);
  return new Response(new Uint8Array(buffer), { headers: { "Content-Type": contentType } });
}

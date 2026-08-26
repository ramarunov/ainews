"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { AdSlot } from "./ad-slot";

const DISMISS_KEY = "top-banner-ad-dismissed";

// Mobile-only (md:hidden) top banner. This is a "sticky ad" under Google's
// own Better Ads Standard definition (an ad that stays in a fixed position
// while the page scrolls) - that classification is why a close button is a
// policy requirement here, not optional UX polish.
//
// Mechanism (confirmed against real kompas.com behavior - a scrolled-past
// element's TOP edge exits the viewport before its bottom does, so a plain
// non-sticky banner would get covered top-first, the opposite of the
// desired effect): this banner is `position: sticky; top: 0` with a LOWER
// z-index than the header (public-header.tsx, `sticky top-0 z-40`). Both
// start in normal document flow, banner first. On scroll, the sticky
// banner "catches" at y=0 immediately (it's the first thing on the page)
// and stays fully visible there. The header, still in normal flow at that
// point, slides upward with the rest of the page as the user scrolls -
// its rising top edge reaches the banner's box from BELOW, and because the
// header comes later in the DOM (paints over earlier content by default)
// with an opaque background, it progressively covers the banner from the
// bottom up as it rises, until the header's own sticky point kicks in at
// y=0 and it takes over the top of the screen completely. No manual
// spacer div is needed - `position: sticky` (unlike `fixed`) already
// reserves its own space in normal flow.
//
// Dismissal is remembered for the rest of this browser tab's session
// (sessionStorage), not permanently - it reappears on the next visit,
// rather than being turned off forever after one click.
export function TopBannerAd({
  value,
}: {
  value: { enabled?: boolean; html?: string } | null | undefined;
}) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem(DISMISS_KEY) === "1") setDismissed(true);
  }, []);

  if (!value?.enabled || !value.html || dismissed) return null;

  const handleDismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  };

  return (
    <div className="sticky top-0 z-30 border-b bg-background md:hidden">
      <div className="relative mx-auto flex min-h-[60px] w-full max-w-6xl items-center justify-center px-4">
        <AdSlot value={value} />
        <button
          type="button"
          aria-label="Tutup iklan"
          onClick={handleDismiss}
          className="absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-muted text-muted-foreground hover:bg-muted-foreground/20"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

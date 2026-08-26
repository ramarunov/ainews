"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { AdSlot } from "./ad-slot";

const DISMISS_KEY = "top-banner-ad-dismissed";
// Single source of truth for the banner's height, shared by the spacer (so
// content isn't pushed down by the wrong amount) and the banner itself (so
// there's nothing above/below the ad within its own box) - keeping these
// two in sync by construction instead of two independently hardcoded
// numbers that could drift apart.
const BANNER_HEIGHT_PX = 60;

// Mobile-only (md:hidden) top banner, genuinely `position: fixed` - this is
// a "sticky ad" under Google's own Better Ads Standard definition (an ad
// that stays in a fixed position while the page scrolls), NOT the earlier
// "scrolls away normally" banner this replaced. That classification is why
// a close button is a policy requirement here, not optional UX polish -
// Google can restrict a site's ad serving over a non-closable sticky ad.
//
// Mechanism: this element is `fixed top-0`, completely out of document
// flow, so a separate spacer div reserves its height in normal flow to
// push the header (and everything else) down initially, revealing the
// banner above it. The header (public-header.tsx) is `sticky top-0 z-40`;
// once scrolled past the spacer's height, the header's sticky point lands
// at the exact same y=0 the banner is fixed at - since the header has a
// higher z-index (this banner uses z-30) and an opaque background, it
// visually overlaps and covers the banner at that point, even though the
// banner itself never actually moved.
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
    <div className="md:hidden">
      <div style={{ height: BANNER_HEIGHT_PX }} aria-hidden />
      <div className="fixed inset-x-0 top-0 z-30 border-b bg-background">
        <div
          className="relative mx-auto flex w-full max-w-6xl items-center justify-center px-4"
          style={{ minHeight: BANNER_HEIGHT_PX }}
        >
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
    </div>
  );
}

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useSetting, useUpdateSetting } from "@/hooks/use-settings";
import { useAuthStore } from "@/lib/auth-store";
import { SettingScriptForm } from "@/components/setting-script-form";
import type { ScriptSlot } from "@/lib/types";

// Backend enforcement lives in apps/api/src/modules/settings/settings.controller.ts's
// assertNotSuperadminOnlyKey - any "ads."-prefixed setting key is
// superadmin-write-only regardless of what the frontend does, so the
// superadmin guard below is UX (hide the page), not the actual boundary.
// Recommended sizes below match this slot's actual container width in the
// public site's layout (see apps/web/app/(public)/page.tsx and
// components/public/article-view.tsx) - a banner wider than its container
// just gets constrained/cropped by the layout, and a "Responsive" AdSense
// ad unit (data-ad-format="auto", data-full-width-responsive="true" - see
// components/public/ad-slot.tsx) auto-adapts to any of these instead of
// requiring a fixed size at all, which is what every slot here is
// currently configured with.
const AD_SLOTS = [
  {
    key: "ads.header",
    label: "Header Ad",
    description:
      "Shown below the hero section on the homepage, full page width. Recommended: Leaderboard 728×90 or Billboard 970×250 (desktop), 320×50/320×100 (mobile) - or a Responsive unit.",
  },
  {
    key: "ads.sidebar",
    label: "Sidebar Ad",
    description:
      "Shown in the fixed 320px-wide sidebar column (homepage and article pages). Recommended: Medium Rectangle 300×250 or Half Page 300×600 - or a Responsive unit.",
  },
  {
    key: "ads.article_top",
    label: "Article Top Ad",
    description:
      "Shown below the navigation menu, above the headline, full page width, on every article page. Recommended: Leaderboard 728×90 or Billboard 970×250 (desktop), 320×50/320×100 (mobile) - or a Responsive unit.",
  },
  {
    key: "ads.article_after_image",
    label: "Article Featured Image Ad",
    description:
      "Shown directly below the featured image, inside the ~760px-wide article column (not full page width) on every article page. Recommended: Large Rectangle 336×280 or Medium Rectangle 300×250 - or a Responsive unit.",
  },
  {
    key: "ads.article_middle",
    label: "Article Mid-Content Ad",
    description:
      "Shown spliced into the middle of the article body, between two paragraphs, inside the ~760px-wide article column. Skipped on very short articles with no good split point. Recommended: Large Rectangle 336×280 or Medium Rectangle 300×250 - or a Responsive unit.",
  },
  {
    key: "ads.in_article",
    label: "End of Article Ad",
    description:
      "Shown after the content (and tags), inside the ~760px-wide article column, on every article page. Recommended: Large Rectangle 336×280 or Leaderboard 728×90 - or a Responsive unit.",
  },
] as const;

function AdWidgetSlot({ label, description, settingKey }: { label: string; description: string; settingKey: string }) {
  const { data: saved, isLoading } = useSetting<ScriptSlot>(settingKey);
  const updateSetting = useUpdateSetting(settingKey);

  if (isLoading) {
    return <div className="h-24 animate-pulse rounded-md bg-muted" />;
  }

  return (
    <SettingScriptForm
      idPrefix={settingKey}
      label={label}
      description={description}
      placeholder="Paste raw ad network HTML/script tag here…"
      initial={saved ?? { enabled: false, html: "" }}
      onSave={(value) => updateSetting.mutateAsync({ value, isPublic: true })}
    />
  );
}

export default function AdsPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const isSuperadmin = user?.isSuperadmin ?? false;

  useEffect(() => {
    if (user && !isSuperadmin) {
      router.replace("/articles");
    }
  }, [user, isSuperadmin, router]);

  if (!isSuperadmin) return null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Ads</h1>
        <p className="text-sm text-muted-foreground">
          Ad widget placements across the public reader site, visible only to superadmins.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ad Widgets</CardTitle>
          <CardDescription>
            Raw HTML/script snippets for the public reader site. Paste an ad
            network&apos;s tag (e.g. Google AdSense) and enable the slot to make
            it live.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {AD_SLOTS.map((slot) => (
            <AdWidgetSlot
              key={slot.key}
              settingKey={slot.key}
              label={slot.label}
              description={slot.description}
            />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

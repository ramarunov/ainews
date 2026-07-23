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
const AD_SLOTS = [
  { key: "ads.header", label: "Header Ad", description: "Shown below the hero section on the homepage." },
  { key: "ads.sidebar", label: "Sidebar Ad", description: "Shown in the homepage sidebar." },
  { key: "ads.article_top", label: "Article Top Ad", description: "Shown below the navigation menu, above the headline, on every article page." },
  { key: "ads.article_after_image", label: "Article Featured Image Ad", description: "Shown directly below the featured image on every article page." },
  { key: "ads.article_middle", label: "Article Mid-Content Ad", description: "Shown spliced into the middle of the article body, between two paragraphs. Skipped on very short articles with no good split point." },
  { key: "ads.in_article", label: "End of Article Ad", description: "Shown after the content (and tags) on every article page." },
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

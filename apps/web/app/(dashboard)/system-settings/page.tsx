"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAiProviderStatus, useUpdateAiProviderKeys } from "@/hooks/use-system-settings";
import { useSetting, useUpdateSetting } from "@/hooks/use-settings";
import { useOrgMembers } from "@/hooks/use-org-users";
import { useAuthStore } from "@/lib/auth-store";
import { ApiError } from "@/lib/api-client";

interface AdSlotValue {
  enabled: boolean;
  html: string;
}

const AD_SLOTS = [
  { key: "ads.header", label: "Header Ad", description: "Shown below the hero section on the homepage." },
  { key: "ads.sidebar", label: "Sidebar Ad", description: "Shown in the homepage sidebar." },
  { key: "ads.in_article", label: "In-Article Ad", description: "Shown after the content on every article page." },
] as const;

function AdWidgetSlot({ label, description, settingKey }: { label: string; description: string; settingKey: string }) {
  const { data: saved, isLoading } = useSetting<AdSlotValue>(settingKey);

  if (isLoading) {
    return <div className="h-24 animate-pulse rounded-md bg-muted" />;
  }

  return (
    <AdWidgetSlotForm label={label} description={description} settingKey={settingKey} initial={saved ?? null} />
  );
}

function AdWidgetSlotForm({
  label,
  description,
  settingKey,
  initial,
}: {
  label: string;
  description: string;
  settingKey: string;
  initial: AdSlotValue | null;
}) {
  const updateSetting = useUpdateSetting(settingKey);
  // Seeded once from `initial` at mount — AdWidgetSlot only renders this
  // component after the query has already resolved, so there's no later
  // async update to resync from (no effect needed).
  const [html, setHtml] = useState(initial?.html ?? "");
  const [enabled, setEnabled] = useState(initial?.enabled ?? false);

  const handleSave = async () => {
    try {
      await updateSetting.mutateAsync({
        value: { enabled, html },
        isPublic: true,
      });
      toast.success(`${label} saved`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to save");
    }
  };

  return (
    <div className="flex flex-col gap-2 border-t pt-4 first:border-t-0 first:pt-0">
      <div className="flex items-center justify-between">
        <div>
          <Label htmlFor={settingKey}>{label}</Label>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id={`${settingKey}-enabled`}
            checked={enabled}
            onCheckedChange={(v) => setEnabled(!!v)}
          />
          <Label htmlFor={`${settingKey}-enabled`} className="text-sm font-normal">
            Enabled
          </Label>
        </div>
      </div>
      <Textarea
        id={settingKey}
        rows={4}
        placeholder="Paste raw ad network HTML/script tag here…"
        value={html}
        onChange={(e) => setHtml(e.target.value)}
        className="font-mono text-xs"
      />
      <Button
        variant="outline"
        size="sm"
        className="self-end"
        disabled={updateSetting.isPending}
        onClick={handleSave}
      >
        {updateSetting.isPending ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}

const AUTONOMOUS_ENABLED_KEY = "news.autonomous_pipeline.enabled";
const AUTONOMOUS_AUTHOR_KEY = "news.autonomous_pipeline.author_user_id";

function AutonomousPublishingCard({ aiConfigured }: { aiConfigured: boolean }) {
  const { data: enabledSaved, isLoading: enabledLoading } = useSetting<boolean>(AUTONOMOUS_ENABLED_KEY);
  const { data: authorSaved, isLoading: authorLoading } = useSetting<string>(AUTONOMOUS_AUTHOR_KEY);
  const { data: members, isLoading: membersLoading } = useOrgMembers({ isActive: true, limit: 100 });
  const updateEnabled = useUpdateSetting(AUTONOMOUS_ENABLED_KEY);
  const updateAuthor = useUpdateSetting(AUTONOMOUS_AUTHOR_KEY);

  // Gate the first paint on every query the Select's value/options depend
  // on - Select only resolves its trigger's display label from SelectItems
  // present at mount, so rendering it before `members` has loaded would
  // permanently show the placeholder even after the real value arrives.
  if (enabledLoading || authorLoading || membersLoading) {
    return <div className="h-32 animate-pulse rounded-md bg-muted" />;
  }

  const enabled = enabledSaved ?? false;
  const authorUserId = authorSaved ?? "";

  const handleToggle = async (checked: boolean) => {
    try {
      await updateEnabled.mutateAsync({ value: checked });
      toast.success(checked ? "Autonomous publishing enabled" : "Autonomous publishing disabled");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to save");
    }
  };

  const handleAuthorChange = async (userId: string | null) => {
    if (!userId) return;
    try {
      await updateAuthor.mutateAsync({ value: userId });
      toast.success("AI byline author saved");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to save");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Autonomous Publishing</CardTitle>
        <CardDescription>
          Let AI discover clustered news stories, write a new article in your
          brand voice, and publish it automatically when it passes an
          automatic fact-check and quality gate. Anything that doesn&apos;t
          pass is routed to human review instead of being published blind.
          Off by default.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex items-center gap-2">
          <span className="text-sm">AI provider</span>
          <Badge variant={aiConfigured ? "default" : "outline"}>
            {aiConfigured ? "Configured" : "Not configured — pipeline will no-op"}
          </Badge>
        </div>

        <div className="flex items-center justify-between border-t pt-4">
          <div>
            <Label htmlFor="autonomous-enabled">Enable autonomous pipeline</Label>
            <p className="text-xs text-muted-foreground">
              Runs on a periodic sweep across all your ingested news clusters.
            </p>
          </div>
          <Checkbox
            id="autonomous-enabled"
            checked={enabled}
            onCheckedChange={(v) => handleToggle(!!v)}
          />
        </div>

        <div className="flex flex-col gap-2 border-t pt-4">
          <Label htmlFor="autonomous-author">AI byline / author</Label>
          <p className="text-xs text-muted-foreground">
            Autonomously published articles are attributed to this account.
          </p>
          <Select value={authorUserId || undefined} onValueChange={handleAuthorChange}>
            <SelectTrigger id="autonomous-author">
              {/* Resolved from the already-loaded `members` list directly,
                  rather than relying on Select's own item-label lookup,
                  which only registers labels for items rendered while the
                  popup has been opened at least once - the trigger would
                  otherwise show the placeholder for a value that was set
                  before this select was ever opened (e.g. loaded from a
                  saved setting). */}
              <SelectValue placeholder="Select an author…">
                {(value: string) =>
                  members?.data.find((m) => m.id === value)?.displayName ||
                  "Select an author…"
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {members?.data.map((member) => (
                <SelectItem key={member.id} value={member.id}>
                  {member.displayName || `${member.firstName ?? ""} ${member.lastName ?? ""}`.trim() || member.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}

const PROVIDERS = [
  { field: "openaiApiKey", statusKey: "openai", label: "OpenAI", placeholder: "sk-..." },
  { field: "anthropicApiKey", statusKey: "anthropic", label: "Anthropic", placeholder: "sk-ant-..." },
  { field: "googleAiApiKey", statusKey: "google", label: "Google AI", placeholder: "AIza..." },
] as const;

export default function SystemSettingsPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const isSuperadmin = user?.isSuperadmin ?? false;

  useEffect(() => {
    if (user && !isSuperadmin) {
      router.replace("/articles");
    }
  }, [user, isSuperadmin, router]);

  const { data: status, isLoading } = useAiProviderStatus(isSuperadmin);
  const updateKeys = useUpdateAiProviderKeys();
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  if (!isSuperadmin) return null;

  const handleSave = async (field: string, label: string) => {
    const value = drafts[field]?.trim();
    if (!value) return;

    try {
      await updateKeys.mutateAsync({ [field]: value });
      setDrafts((d) => ({ ...d, [field]: "" }));
      toast.success(`${label} key saved`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to save key");
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">System Settings</h1>
        <p className="text-sm text-muted-foreground">
          Platform-wide configuration, visible only to superadmins.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">AI Provider API Keys</CardTitle>
          <CardDescription>
            Applies to the whole deployment. Keys are encrypted at rest and never
            shown again once saved — only whether a key is configured. Leaving a
            provider unconfigured falls back to the server&apos;s environment
            variable, if any.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {PROVIDERS.map(({ field, statusKey, label, placeholder }) => {
            const configured = status?.[statusKey];
            return (
              <div key={field} className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor={field}>{label}</Label>
                  {!isLoading && (
                    <Badge variant={configured ? "default" : "outline"}>
                      {configured ? "Configured" : "Not configured"}
                    </Badge>
                  )}
                </div>
                <div className="flex gap-2">
                  <Input
                    id={field}
                    type="password"
                    placeholder={configured ? "•••••••••••••••• (unchanged)" : placeholder}
                    value={drafts[field] ?? ""}
                    onChange={(e) =>
                      setDrafts((d) => ({ ...d, [field]: e.target.value }))
                    }
                  />
                  <Button
                    variant="outline"
                    disabled={!drafts[field]?.trim() || updateKeys.isPending}
                    onClick={() => handleSave(field, label)}
                  >
                    Save
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <AutonomousPublishingCard aiConfigured={Boolean(status?.openai || status?.anthropic || status?.google)} />

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

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  useAiProviderStatus,
  useUpdateAiProviderKeys,
  useAiServicesEnabled,
  useSetAiServicesEnabled,
  useMediaProviderStatus,
  useUpdateMediaProviderKeys,
} from "@/hooks/use-system-settings";
import { useSetting, useUpdateSetting } from "@/hooks/use-settings";
import { useOrgMembers } from "@/hooks/use-org-users";
import { useAutonomousPipelineUsage } from "@/hooks/use-news-intelligence";
import { useAuthStore } from "@/lib/auth-store";
import { ApiError } from "@/lib/api-client";
import { SettingScriptForm } from "@/components/setting-script-form";
import type { ScriptSlot } from "@/lib/types";

const AD_SLOTS = [
  { key: "ads.header", label: "Header Ad", description: "Shown below the hero section on the homepage." },
  { key: "ads.sidebar", label: "Sidebar Ad", description: "Shown in the homepage sidebar." },
  { key: "ads.in_article", label: "In-Article Ad", description: "Shown after the content on every article page." },
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

const AUTONOMOUS_ENABLED_KEY = "news.autonomous_pipeline.enabled";
const AUTONOMOUS_AUTHOR_KEY = "news.autonomous_pipeline.author_user_id";
const AUTONOMOUS_LANGUAGE_KEY = "news.autonomous_pipeline.output_language";
const AUTONOMOUS_DAILY_LIMIT_KEY = "news.autonomous_pipeline.daily_limit";
const AUTONOMOUS_HOURLY_LIMIT_KEY = "news.autonomous_pipeline.hourly_limit";

const SAME_AS_SOURCE = "same";
const OUTPUT_LANGUAGES = [
  { value: SAME_AS_SOURCE, label: "Same as source (default)" },
  { value: "en", label: "English" },
  { value: "id", label: "Indonesian (Bahasa Indonesia)" },
] as const;

function PublishQuotaFields({
  enabled,
  dailyLimitInitial,
  hourlyLimitInitial,
}: {
  enabled: boolean;
  dailyLimitInitial: number | null;
  hourlyLimitInitial: number | null;
}) {
  const updateDailyLimit = useUpdateSetting(AUTONOMOUS_DAILY_LIMIT_KEY);
  const updateHourlyLimit = useUpdateSetting(AUTONOMOUS_HOURLY_LIMIT_KEY);
  const { data: usage } = useAutonomousPipelineUsage(enabled);
  // Seeded once at mount from already-resolved settings data, same as
  // AdWidgetSlotForm - plain inputs, no later async update to resync from.
  const [dailyLimit, setDailyLimit] = useState(dailyLimitInitial != null ? String(dailyLimitInitial) : "");
  const [hourlyLimit, setHourlyLimit] = useState(hourlyLimitInitial != null ? String(hourlyLimitInitial) : "");

  const handleSave = async () => {
    try {
      await Promise.all([
        updateDailyLimit.mutateAsync({ value: dailyLimit ? Number(dailyLimit) : null }),
        updateHourlyLimit.mutateAsync({ value: hourlyLimit ? Number(hourlyLimit) : null }),
      ]);
      toast.success("Publish quota saved");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to save");
    }
  };

  return (
    <div className="flex flex-col gap-2 border-t pt-4">
      <Label>Publish quota</Label>
      <p className="text-xs text-muted-foreground">
        Caps how many articles the pipeline auto-publishes, so it can&apos;t
        flood the site (or the AI bill). Once a cap is hit, the pipeline
        pauses and resumes automatically next hour/day. Blank = unlimited.
      </p>
      <div className="flex gap-2">
        <div className="flex flex-1 items-center gap-2">
          <Input
            type="number"
            min={0}
            placeholder="e.g. 50"
            value={dailyLimit}
            onChange={(e) => setDailyLimit(e.target.value)}
          />
          <span className="text-xs whitespace-nowrap text-muted-foreground">per day</span>
        </div>
        <div className="flex flex-1 items-center gap-2">
          <Input
            type="number"
            min={0}
            placeholder="e.g. 5"
            value={hourlyLimit}
            onChange={(e) => setHourlyLimit(e.target.value)}
          />
          <span className="text-xs whitespace-nowrap text-muted-foreground">per hour</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={updateDailyLimit.isPending || updateHourlyLimit.isPending}
          onClick={handleSave}
        >
          Save
        </Button>
      </div>
      {enabled && usage && (
        <p className="text-xs text-muted-foreground">
          {usage.draftedToday}{usage.dailyLimit != null ? `/${usage.dailyLimit}` : ""} drafted today ·{" "}
          {usage.draftedThisHour}{usage.hourlyLimit != null ? `/${usage.hourlyLimit}` : ""} this hour
        </p>
      )}
    </div>
  );
}

function AutonomousPublishingCard({ aiConfigured }: { aiConfigured: boolean }) {
  const { data: enabledSaved, isLoading: enabledLoading } = useSetting<boolean>(AUTONOMOUS_ENABLED_KEY);
  const { data: authorSaved, isLoading: authorLoading } = useSetting<string>(AUTONOMOUS_AUTHOR_KEY);
  const { data: languageSaved, isLoading: languageLoading } = useSetting<string>(AUTONOMOUS_LANGUAGE_KEY);
  const { data: dailyLimitSaved, isLoading: dailyLimitLoading } = useSetting<number>(AUTONOMOUS_DAILY_LIMIT_KEY);
  const { data: hourlyLimitSaved, isLoading: hourlyLimitLoading } = useSetting<number>(AUTONOMOUS_HOURLY_LIMIT_KEY);
  const { data: members, isLoading: membersLoading } = useOrgMembers({ isActive: true, limit: 100 });
  const updateEnabled = useUpdateSetting(AUTONOMOUS_ENABLED_KEY);
  const updateAuthor = useUpdateSetting(AUTONOMOUS_AUTHOR_KEY);
  const updateLanguage = useUpdateSetting(AUTONOMOUS_LANGUAGE_KEY);

  // Gate the first paint on every query the Select's value/options depend
  // on - Select only resolves its trigger's display label from SelectItems
  // present at mount, so rendering it before `members` has loaded would
  // permanently show the placeholder even after the real value arrives.
  if (enabledLoading || authorLoading || languageLoading || dailyLimitLoading || hourlyLimitLoading || membersLoading) {
    return <div className="h-32 animate-pulse rounded-md bg-muted" />;
  }

  const enabled = enabledSaved ?? false;
  const authorUserId = authorSaved ?? "";
  const outputLanguage = languageSaved ?? "";

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

  const handleLanguageChange = async (language: string | null) => {
    if (!language) return;
    try {
      await updateLanguage.mutateAsync({ value: language === SAME_AS_SOURCE ? "" : language });
      toast.success(
        language === SAME_AS_SOURCE
          ? "Will write in whatever language the sources are in"
          : "Output language saved",
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to save");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Autonomous Publishing</CardTitle>
        <CardDescription>
          Let AI discover clustered news stories and write a new article in
          your brand voice — every draft lands in Review for a human to check
          before it goes live, never published automatically. An automatic
          fact-check and quality gate still runs on each draft, so reviewers
          can see at a glance which ones passed. Off by default.
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
            Articles the pipeline drafts are attributed to this account.
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

        <div className="flex flex-col gap-2 border-t pt-4">
          <Label htmlFor="autonomous-language">Output language</Label>
          <p className="text-xs text-muted-foreground">
            Rewrites and translates in one pass — e.g. an English-language
            source can be published as a native Indonesian article.
          </p>
          <Select
            value={outputLanguage || SAME_AS_SOURCE}
            onValueChange={handleLanguageChange}
          >
            <SelectTrigger id="autonomous-language">
              {/* See the author Select above for why this can't rely on
                  Select's own item-label lookup. */}
              <SelectValue>
                {(value: string) =>
                  OUTPUT_LANGUAGES.find((l) => l.value === value)?.label ?? value
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {OUTPUT_LANGUAGES.map((lang) => (
                <SelectItem key={lang.value} value={lang.value}>
                  {lang.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <PublishQuotaFields
          enabled={enabled}
          dailyLimitInitial={dailyLimitSaved ?? null}
          hourlyLimitInitial={hourlyLimitSaved ?? null}
        />
      </CardContent>
    </Card>
  );
}

const PROVIDERS = [
  { field: "openaiApiKey", statusKey: "openai", label: "OpenAI", placeholder: "sk-..." },
  { field: "anthropicApiKey", statusKey: "anthropic", label: "Anthropic", placeholder: "sk-ant-..." },
  { field: "googleAiApiKey", statusKey: "google", label: "Google AI", placeholder: "AIza..." },
] as const;

function MediaProviderKeysCard() {
  const { data: status, isLoading } = useMediaProviderStatus();
  const updateKeys = useUpdateMediaProviderKeys();
  const [draft, setDraft] = useState("");

  const handleSave = async () => {
    const value = draft.trim();
    if (!value) return;
    try {
      await updateKeys.mutateAsync({ pexelsApiKey: value });
      setDraft("");
      toast.success("Pexels key saved");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to save key");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Media Providers</CardTitle>
        <CardDescription>
          Powers automatic featured-image sourcing: real (not AI-generated)
          stock photos, searched by keyword, for the &quot;Search Stock
          Photos&quot; tool in the article editor and for the autonomous
          publishing pipeline. Get a free key at pexels.com/api.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Label htmlFor="pexelsApiKey">Pexels</Label>
            {!isLoading && (
              <Badge variant={status?.pexels ? "default" : "outline"}>
                {status?.pexels ? "Configured" : "Not configured"}
              </Badge>
            )}
          </div>
          <div className="flex gap-2">
            <Input
              id="pexelsApiKey"
              type="password"
              placeholder={status?.pexels ? "•••••••••••••••• (unchanged)" : "563..."}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <Button
              variant="outline"
              disabled={!draft.trim() || updateKeys.isPending}
              onClick={handleSave}
            >
              Save
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

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

  const { data: aiServicesStatus, isLoading: aiServicesLoading } = useAiServicesEnabled(isSuperadmin);
  const setAiServicesEnabled = useSetAiServicesEnabled();

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

  const handleToggleAiServices = async (checked: boolean) => {
    try {
      await setAiServicesEnabled.mutateAsync(checked);
      toast.success(
        checked
          ? "AI services re-enabled"
          : "AI services disabled — every AI-backed feature will refuse calls until turned back on",
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to save");
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

      <Card className={aiServicesStatus?.enabled === false ? "border-destructive" : undefined}>
        <CardHeader>
          <CardTitle className="text-base">AI Services</CardTitle>
          <CardDescription>
            Emergency on/off switch for every AI-backed feature (autonomous
            publishing, AI Tools in the article editor, alt-text generation,
            news clustering). Turning this off does not remove your
            configured API keys below — it just makes every AI call refuse
            immediately until switched back on.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="ai-services-enabled">
                {aiServicesStatus?.enabled === false ? "AI services are OFF" : "AI services are ON"}
              </Label>
              <p className="text-xs text-muted-foreground">
                Off = every AI feature across the whole deployment stops working immediately.
              </p>
            </div>
            {!aiServicesLoading && (
              <Checkbox
                id="ai-services-enabled"
                checked={aiServicesStatus?.enabled ?? true}
                onCheckedChange={(v) => handleToggleAiServices(!!v)}
              />
            )}
          </div>
        </CardContent>
      </Card>

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

      <MediaProviderKeysCard />

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

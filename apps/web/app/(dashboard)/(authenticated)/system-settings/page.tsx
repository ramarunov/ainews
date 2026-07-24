"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  useGoogleIndexingStatus,
  useTelegramStatus,
  useUpdateGoogleIndexingSettings,
  useUpdateTelegramSettings,
} from "@/hooks/use-system-settings";
import { useAuthStore } from "@/lib/auth-store";
import { ApiError } from "@/lib/api-client";

function TelegramSettingsCard() {
  const { data: status, isLoading } = useTelegramStatus();
  const updateSettings = useUpdateTelegramSettings();
  const [botToken, setBotToken] = useState("");
  const [chatId, setChatId] = useState("");

  const handleSave = async () => {
    const payload: { botToken?: string; chatId?: string } = {};
    if (botToken.trim()) payload.botToken = botToken.trim();
    if (chatId.trim()) payload.chatId = chatId.trim();
    if (!payload.botToken && !payload.chatId) return;

    try {
      await updateSettings.mutateAsync(payload);
      setBotToken("");
      setChatId("");
      toast.success("Telegram settings saved");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to save");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Telegram Publish Notifications</CardTitle>
        <CardDescription>
          Posts to a Telegram channel the moment an article is first published
          (manually or via the scheduled-publish sweep) — not on later edits.
          Create a bot with @BotFather on Telegram, add it as an admin of your
          channel, then enter its token and the channel below.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Label>Status</Label>
          {!isLoading && (
            <Badge variant={status?.configured ? "default" : "outline"}>
              {status?.configured ? "Configured" : "Not configured"}
            </Badge>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="telegram-bot-token">Bot token</Label>
          <Input
            id="telegram-bot-token"
            type="password"
            placeholder={status?.configured ? "•••••••••••••••• (unchanged)" : "123456:ABC-DEF..."}
            value={botToken}
            onChange={(e) => setBotToken(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="telegram-chat-id">Channel</Label>
          <Input
            id="telegram-chat-id"
            placeholder={status?.chatId ?? "@your_channel or -100123456789"}
            value={chatId}
            onChange={(e) => setChatId(e.target.value)}
          />
        </div>
        <Button
          variant="outline"
          className="self-end"
          disabled={(!botToken.trim() && !chatId.trim()) || updateSettings.isPending}
          onClick={handleSave}
        >
          Save
        </Button>
      </CardContent>
    </Card>
  );
}

function GoogleIndexingSettingsCard() {
  const { data: status, isLoading } = useGoogleIndexingStatus();
  const updateSettings = useUpdateGoogleIndexingSettings();
  const [serviceAccountJson, setServiceAccountJson] = useState("");

  const handleSave = async () => {
    if (!serviceAccountJson.trim()) return;

    try {
      await updateSettings.mutateAsync({ serviceAccountJson: serviceAccountJson.trim() });
      setServiceAccountJson("");
      toast.success("Google Indexing settings saved");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to save");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Google Auto-Indexing</CardTitle>
        <CardDescription>
          Submits an article&apos;s canonical URL to Google&apos;s Indexing API every time
          it&apos;s published or removed, instead of waiting for Google&apos;s own crawl
          schedule. Note: Google only officially documents this API for JobPosting/
          BroadcastEvent pages — using it for regular articles is common practice but
          unofficial, and not a guarantee of faster indexing. Default quota is 200
          URL submissions/day.
          <br />
          <br />
          Setup: in Google Cloud Console, create a project, enable the &quot;Web Search
          Indexing API&quot;, create a service account, and download its JSON key. Then
          add that service account&apos;s email as an <strong>Owner</strong> of your
          domain&apos;s property in Search Console. Paste the full JSON key file below.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Label>Status</Label>
          {!isLoading && (
            <Badge variant={status?.configured ? "default" : "outline"}>
              {status?.configured ? "Configured" : "Not configured"}
            </Badge>
          )}
          {status?.clientEmail && (
            <span className="text-sm text-muted-foreground">{status.clientEmail}</span>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="google-indexing-json">Service account JSON key</Label>
          <Textarea
            id="google-indexing-json"
            rows={6}
            className="font-mono text-xs"
            placeholder={
              status?.configured
                ? "•••••••••••••••• (unchanged)"
                : '{\n  "type": "service_account",\n  "client_email": "...",\n  "private_key": "...",\n  ...\n}'
            }
            value={serviceAccountJson}
            onChange={(e) => setServiceAccountJson(e.target.value)}
          />
        </div>
        <Button
          variant="outline"
          className="self-end"
          disabled={!serviceAccountJson.trim() || updateSettings.isPending}
          onClick={handleSave}
        >
          Save
        </Button>
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

  if (!isSuperadmin) return null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">System Settings</h1>
        <p className="text-sm text-muted-foreground">
          Platform-wide configuration, visible only to superadmins. AI configuration
          now lives under its own AI Settings menu.
        </p>
      </div>

      <TelegramSettingsCard />
      <GoogleIndexingSettingsCard />
    </div>
  );
}

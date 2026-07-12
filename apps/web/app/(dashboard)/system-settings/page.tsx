"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAiProviderStatus, useUpdateAiProviderKeys } from "@/hooks/use-system-settings";
import { useAuthStore } from "@/lib/auth-store";
import { ApiError } from "@/lib/api-client";

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
    </div>
  );
}

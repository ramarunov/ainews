"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Plus, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useApiKeys, useCreateApiKey, useRevokeApiKey } from "@/hooks/use-api-keys";
import { ApiError } from "@/lib/api-client";
import { hasPermission, useAuthStore } from "@/lib/auth-store";
import type { CreatedApiKey } from "@/lib/types";

const createKeySchema = z.object({
  name: z.string().min(1, "Required").max(255),
});

type CreateKeyForm = z.infer<typeof createKeySchema>;

function CreateApiKeyDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: (key: CreatedApiKey) => void;
}) {
  const createApiKey = useCreateApiKey();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateKeyForm>({ resolver: zodResolver(createKeySchema) });

  const onSubmit = async (values: CreateKeyForm) => {
    try {
      const created = await createApiKey.mutateAsync({ name: values.name });
      onOpenChange(false);
      reset();
      onCreated(created);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to create API key");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create API key</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="api-key-name">Name</Label>
            <Input id="api-key-name" placeholder="CI pipeline" {...register("name")} />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={createApiKey.isPending}>
              {createApiKey.isPending ? "Creating…" : "Create key"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NewKeyRevealDialog({
  apiKey,
  onClose,
}: {
  apiKey: CreatedApiKey | null;
  onClose: () => void;
}) {
  const handleCopy = () => {
    if (!apiKey) return;
    navigator.clipboard.writeText(apiKey.key);
    toast.success("Copied to clipboard");
  };

  return (
    <Dialog open={apiKey !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Your new API key</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Copy this now - for your security, it won&apos;t be shown again. Send it as an{" "}
          <code>X-API-Key</code> header.
        </p>
        <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-3 font-mono text-sm break-all">
          {apiKey?.key}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleCopy}>
            <Copy className="h-4 w-4" />
            Copy
          </Button>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ApiKeysPage() {
  const user = useAuthStore((s) => s.user);
  const canManage = hasPermission(user, "settings:write");

  const { data: apiKeys, isLoading } = useApiKeys();
  const revokeApiKey = useRevokeApiKey();
  const [createOpen, setCreateOpen] = useState(false);
  const [newKey, setNewKey] = useState<CreatedApiKey | null>(null);

  const handleRevoke = async (id: string) => {
    try {
      await revokeApiKey.mutateAsync(id);
      toast.success("API key revoked");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to revoke key");
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">API Keys</h1>
        <p className="text-sm text-muted-foreground">
          Programmatic access for scripts and integrations. Send a key as an{" "}
          <code>X-API-Key</code> header instead of a login token.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Your keys</CardTitle>
          {canManage && (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              Create key
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {isLoading && <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>}
          {!isLoading && (apiKeys ?? []).length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No API keys yet.
            </p>
          )}
          {(apiKeys ?? []).length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead>Rate limit</TableHead>
                  <TableHead>Last used</TableHead>
                  <TableHead>Status</TableHead>
                  {canManage && <TableHead className="w-24" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {apiKeys!.map((key) => (
                  <TableRow key={key.id}>
                    <TableCell className="font-medium">{key.name}</TableCell>
                    <TableCell className="font-mono text-muted-foreground">
                      {key.keyPrefix}…
                    </TableCell>
                    <TableCell>{key.rateLimit}/hr</TableCell>
                    <TableCell className="text-muted-foreground">
                      {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString() : "Never"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={key.isActive ? "default" : "outline"}>
                        {key.isActive ? "Active" : "Revoked"}
                      </Badge>
                    </TableCell>
                    {canManage && (
                      <TableCell>
                        {key.isActive && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleRevoke(key.id)}
                          >
                            Revoke
                          </Button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <CreateApiKeyDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={setNewKey} />
      <NewKeyRevealDialog apiKey={newKey} onClose={() => setNewKey(null)} />
    </div>
  );
}

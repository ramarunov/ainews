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
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  useWebhooks,
  useCreateWebhook,
  useUpdateWebhook,
  useDeleteWebhook,
  useWebhookDeliveries,
} from "@/hooks/use-webhooks";
import { ApiError } from "@/lib/api-client";
import type { CreatedWebhook, Webhook } from "@/lib/types";

// article.published is the only event the backend actually dispatches
// today (WebhooksService.handleArticlePublished) - listed as the sole
// checkbox option rather than implying broader coverage that doesn't
// exist yet (article.created/updated/deleted are emitted internally but
// have no dispatch listener wired up).
const AVAILABLE_EVENTS = ["article.published"];

const createWebhookSchema = z.object({
  name: z.string().min(1, "Required").max(255),
  url: z.string().url("Must be a valid URL"),
});

type CreateWebhookForm = z.infer<typeof createWebhookSchema>;

function CreateWebhookDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: (webhook: CreatedWebhook) => void;
}) {
  const createWebhook = useCreateWebhook();
  const [events, setEvents] = useState<string[]>([]);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateWebhookForm>({ resolver: zodResolver(createWebhookSchema) });

  const onSubmit = async (values: CreateWebhookForm) => {
    if (events.length === 0) {
      toast.error("Select at least one event");
      return;
    }
    try {
      const created = await createWebhook.mutateAsync({ ...values, events });
      onOpenChange(false);
      reset();
      setEvents([]);
      onCreated(created);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to create webhook");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Register a webhook</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="webhook-name">Name</Label>
            <Input id="webhook-name" placeholder="Slack notifier" {...register("name")} />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="webhook-url">URL</Label>
            <Input
              id="webhook-url"
              placeholder="https://example.com/webhooks/incoming"
              {...register("url")}
            />
            {errors.url && <p className="text-sm text-destructive">{errors.url.message}</p>}
          </div>
          <div className="flex flex-col gap-2">
            <Label>Events</Label>
            {AVAILABLE_EVENTS.map((event) => (
              <div key={event} className="flex items-center gap-2">
                <Checkbox
                  id={`event-${event}`}
                  checked={events.includes(event)}
                  onCheckedChange={(checked) =>
                    setEvents((prev) =>
                      checked ? [...prev, event] : prev.filter((e) => e !== event),
                    )
                  }
                />
                <Label htmlFor={`event-${event}`} className="font-normal">
                  {event}
                </Label>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={createWebhook.isPending}>
              {createWebhook.isPending ? "Creating…" : "Register webhook"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NewSecretRevealDialog({
  webhook,
  onClose,
}: {
  webhook: CreatedWebhook | null;
  onClose: () => void;
}) {
  const handleCopy = () => {
    if (!webhook) return;
    navigator.clipboard.writeText(webhook.secret);
    toast.success("Copied to clipboard");
  };

  return (
    <Dialog open={webhook !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Webhook signing secret</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Copy this now - for your security, it won&apos;t be shown again. Every
          delivery is signed with this via the <code>X-Webhook-Signature</code>{" "}
          header (HMAC-SHA256) so you can verify it really came from us.
        </p>
        <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-3 font-mono text-sm break-all">
          {webhook?.secret}
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

function DeliveriesDialog({ webhook, onClose }: { webhook: Webhook | null; onClose: () => void }) {
  const { data, isLoading } = useWebhookDeliveries(webhook?.id ?? null);

  return (
    <Dialog open={webhook !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Delivery log — {webhook?.name}</DialogTitle>
        </DialogHeader>
        {isLoading && <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && (data?.data.length ?? 0) === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No deliveries yet.
          </p>
        )}
        {!isLoading && (data?.data.length ?? 0) > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Event</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data!.data.map((delivery) => (
                <TableRow key={delivery.id}>
                  <TableCell className="font-medium">{delivery.event}</TableCell>
                  <TableCell>
                    <Badge variant={delivery.success ? "default" : "destructive"}>
                      {delivery.statusCode ?? "Failed"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {delivery.duration != null ? `${delivery.duration}ms` : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(delivery.attemptedAt).toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function WebhooksPage() {
  const { data: webhooks, isLoading } = useWebhooks();
  const deleteWebhook = useDeleteWebhook();
  const [createOpen, setCreateOpen] = useState(false);
  const [newWebhook, setNewWebhook] = useState<CreatedWebhook | null>(null);
  const [deliveriesFor, setDeliveriesFor] = useState<Webhook | null>(null);

  const handleDelete = async (id: string) => {
    try {
      await deleteWebhook.mutateAsync(id);
      toast.success("Webhook deleted");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to delete webhook");
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Webhooks</h1>
        <p className="text-sm text-muted-foreground">
          Notify external systems when events happen in this organization.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Registered webhooks</CardTitle>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            Register webhook
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading && <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>}
          {!isLoading && (webhooks ?? []).length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No webhooks registered yet.
            </p>
          )}
          {(webhooks ?? []).length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>URL</TableHead>
                  <TableHead>Events</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-56" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {webhooks!.map((webhook) => (
                  <WebhookRow
                    key={webhook.id}
                    webhook={webhook}
                    onDelete={() => handleDelete(webhook.id)}
                    onViewDeliveries={() => setDeliveriesFor(webhook)}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <CreateWebhookDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={setNewWebhook} />
      <NewSecretRevealDialog webhook={newWebhook} onClose={() => setNewWebhook(null)} />
      <DeliveriesDialog webhook={deliveriesFor} onClose={() => setDeliveriesFor(null)} />
    </div>
  );
}

function WebhookRow({
  webhook,
  onDelete,
  onViewDeliveries,
}: {
  webhook: Webhook;
  onDelete: () => void;
  onViewDeliveries: () => void;
}) {
  const updateWebhook = useUpdateWebhook(webhook.id);

  const handleToggleActive = async () => {
    try {
      await updateWebhook.mutateAsync({ isActive: !webhook.isActive });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Update failed");
    }
  };

  return (
    <TableRow>
      <TableCell className="font-medium">{webhook.name}</TableCell>
      <TableCell className="max-w-64 truncate text-muted-foreground">{webhook.url}</TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-1">
          {webhook.events.map((event) => (
            <Badge key={event} variant="outline" className="text-[10px]">
              {event}
            </Badge>
          ))}
        </div>
      </TableCell>
      <TableCell>
        <Badge variant={webhook.isActive ? "default" : "outline"}>
          {webhook.isActive ? "Active" : "Disabled"}
        </Badge>
        {webhook.failureCount > 0 && (
          <span className="ml-2 text-xs text-destructive">
            {webhook.failureCount} failure(s)
          </span>
        )}
      </TableCell>
      <TableCell className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={onViewDeliveries}>
          Deliveries
        </Button>
        <Button size="sm" variant="ghost" onClick={handleToggleActive}>
          {webhook.isActive ? "Disable" : "Enable"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDelete}>
          Delete
        </Button>
      </TableCell>
    </TableRow>
  );
}

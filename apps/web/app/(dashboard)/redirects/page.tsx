"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Plus, MoreHorizontal } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useCreateRedirect,
  useDeleteRedirect,
  useDismissNotFoundLog,
  useNotFoundLogs,
  useRedirects,
  useUpdateRedirect,
} from "@/hooks/use-redirects";
import { ApiError } from "@/lib/api-client";
import { hasPermission, useAuthStore } from "@/lib/auth-store";

const redirectSchema = z.object({
  fromPath: z.string().min(1, "Required").max(1000).startsWith("/", "Must start with /"),
  toUrl: z.string().min(1, "Required").max(2000),
  note: z.string().max(500).optional(),
});

type RedirectFormValues = z.infer<typeof redirectSchema>;

function AddRedirectDialog({
  open,
  onOpenChange,
  defaultFromPath,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaultFromPath?: string;
}) {
  const createRedirect = useCreateRedirect();
  const [statusCode, setStatusCode] = useState("301");
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<RedirectFormValues>({
    resolver: zodResolver(redirectSchema),
    values: { fromPath: defaultFromPath ?? "", toUrl: "", note: "" },
  });

  const onSubmit = async (values: RedirectFormValues) => {
    try {
      await createRedirect.mutateAsync({
        fromPath: values.fromPath,
        toUrl: values.toUrl,
        statusCode: Number(statusCode),
        note: values.note || undefined,
      });
      toast.success("Redirect created");
      onOpenChange(false);
      reset({ fromPath: "", toUrl: "", note: "" });
      setStatusCode("301");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to create redirect");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a redirect</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="redirect-from">From path</Label>
            <Input
              id="redirect-from"
              placeholder="/old-article-slug"
              {...register("fromPath")}
            />
            {errors.fromPath && (
              <p className="text-sm text-destructive">{errors.fromPath.message}</p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="redirect-to">To URL</Label>
            <Input
              id="redirect-to"
              placeholder="/news/new-article-slug"
              {...register("toUrl")}
            />
            {errors.toUrl && <p className="text-sm text-destructive">{errors.toUrl.message}</p>}
          </div>
          <div className="flex flex-col gap-2">
            <Label>Status code</Label>
            <Select value={statusCode} onValueChange={(v) => setStatusCode(v as string)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="301">301 — Permanent</SelectItem>
                <SelectItem value="302">302 — Temporary</SelectItem>
                <SelectItem value="410">410 — Gone</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="redirect-note">Note (optional)</Label>
            <Input id="redirect-note" placeholder="Why this redirect exists" {...register("note")} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={createRedirect.isPending}>
              {createRedirect.isPending ? "Creating…" : "Create Redirect"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RedirectsTab({ canManage }: { canManage: boolean }) {
  const { data: redirects, isLoading } = useRedirects();
  const updateRedirect = useUpdateRedirect();
  const deleteRedirect = useDeleteRedirect();
  const [addOpen, setAddOpen] = useState(false);

  const handleToggleActive = async (id: string, isActive: boolean) => {
    try {
      await updateRedirect.mutateAsync({ id, isActive: !isActive });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Update failed");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteRedirect.mutateAsync(id);
      toast.success("Redirect removed");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Delete failed");
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Redirects</CardTitle>
        {canManage && (
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" />
            Add Redirect
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {isLoading && <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && (redirects ?? []).length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No redirects configured yet.
          </p>
        )}
        {(redirects ?? []).length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>From</TableHead>
                <TableHead>To</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Hits</TableHead>
                <TableHead>Status</TableHead>
                {canManage && <TableHead className="w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {redirects!.map((redirect) => (
                <TableRow key={redirect.id}>
                  <TableCell className="font-medium">{redirect.fromPath}</TableCell>
                  <TableCell className="text-muted-foreground">{redirect.toUrl}</TableCell>
                  <TableCell>{redirect.statusCode}</TableCell>
                  <TableCell>{redirect.hitCount}</TableCell>
                  <TableCell>
                    <Badge variant={redirect.isActive ? "default" : "outline"}>
                      {redirect.isActive ? "Active" : "Disabled"}
                    </Badge>
                  </TableCell>
                  {canManage && (
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          className={buttonVariants({ variant: "ghost", size: "icon" })}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => handleToggleActive(redirect.id, redirect.isActive)}
                          >
                            {redirect.isActive ? "Disable" : "Enable"}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => handleDelete(redirect.id)}
                          >
                            Remove
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
      <AddRedirectDialog open={addOpen} onOpenChange={setAddOpen} />
    </Card>
  );
}

function NotFoundMonitorTab({ canManage }: { canManage: boolean }) {
  const { data: logs, isLoading } = useNotFoundLogs();
  const dismissLog = useDismissNotFoundLog();
  const [redirectFromPath, setRedirectFromPath] = useState<string | null>(null);

  const handleDismiss = async (id: string) => {
    try {
      await dismissLog.mutateAsync(id);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to dismiss");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">404 Monitor</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading && <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && (logs ?? []).length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No unresolved 404s tracked yet.
          </p>
        )}
        {(logs ?? []).length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Path</TableHead>
                <TableHead>Hits</TableHead>
                <TableHead>Referrer</TableHead>
                <TableHead>Last seen</TableHead>
                {canManage && <TableHead className="w-48" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs!.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="font-medium">{log.path}</TableCell>
                  <TableCell>{log.hitCount}</TableCell>
                  <TableCell className="max-w-64 truncate text-muted-foreground">
                    {log.referrer ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(log.lastSeenAt).toLocaleString()}
                  </TableCell>
                  {canManage && (
                    <TableCell className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setRedirectFromPath(log.path)}
                      >
                        Create Redirect
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleDismiss(log.id)}>
                        Dismiss
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
      <AddRedirectDialog
        open={redirectFromPath !== null}
        onOpenChange={(o) => !o && setRedirectFromPath(null)}
        defaultFromPath={redirectFromPath ?? undefined}
      />
    </Card>
  );
}

export default function RedirectsPage() {
  const user = useAuthStore((s) => s.user);
  const canManage = hasPermission(user, "articles:write");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Redirects &amp; 404s</h1>
        <p className="text-sm text-muted-foreground">
          Manage URL redirects and monitor broken links on the public site.
        </p>
      </div>

      <Tabs defaultValue="redirects">
        <TabsList>
          <TabsTrigger value="redirects">Redirects</TabsTrigger>
          <TabsTrigger value="not-found">404 Monitor</TabsTrigger>
        </TabsList>
        <TabsContent value="redirects" className="pt-4">
          <RedirectsTab canManage={canManage} />
        </TabsContent>
        <TabsContent value="not-found" className="pt-4">
          <NotFoundMonitorTab canManage={canManage} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

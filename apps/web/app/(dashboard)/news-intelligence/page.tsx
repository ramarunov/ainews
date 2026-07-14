"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  useCreateNewsSource,
  useDeleteNewsSource,
  useIgnoreNewsItem,
  useIngestNewsSource,
  useCreateDraftFromItem,
  useNewsClusterDetail,
  useNewsClusters,
  useNewsItems,
  useNewsSources,
  useUpdateNewsSource,
} from "@/hooks/use-news-intelligence";
import { ApiError } from "@/lib/api-client";
import { hasPermission, useAuthStore } from "@/lib/auth-store";
import { cn } from "@/lib/utils";
import type { NewsItemStatus, NewsSourceType } from "@/lib/types";

const SOURCE_TYPES: NewsSourceType[] = ["RSS", "ATOM", "NEWSAPI", "GNEWS", "WEBSITE", "MANUAL"];
const ITEM_STATUSES: NewsItemStatus[] = ["NEW", "ANALYZED", "DRAFTED", "PUBLISHED", "IGNORED"];

const sourceSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  url: z.string().url("Must be a valid URL"),
});

type SourceFormValues = z.infer<typeof sourceSchema>;

// Google News (news.google.com) is a different product from the "GNEWS"
// source type above (gnews.io, a paid API requiring its own key, not yet
// wired up). Google publishes its own results as plain public RSS feeds
// with no API key needed, so a "Google News" source is really just an RSS
// source with a specially-constructed URL — no backend changes needed,
// the existing RSS ingestion path handles it as-is.
const GOOGLE_NEWS_TOPICS = [
  { value: "TOP", label: "Top Stories" },
  { value: "WORLD", label: "World" },
  { value: "NATION", label: "Nation" },
  { value: "BUSINESS", label: "Business" },
  { value: "TECHNOLOGY", label: "Technology" },
  { value: "ENTERTAINMENT", label: "Entertainment" },
  { value: "SPORTS", label: "Sports" },
  { value: "SCIENCE", label: "Science" },
  { value: "HEALTH", label: "Health" },
] as const;

function buildGoogleNewsUrl(topic: string, keyword: string): string {
  const params = "hl=en-US&gl=US&ceid=US:en";
  if (keyword.trim()) {
    return `https://news.google.com/rss/search?q=${encodeURIComponent(keyword.trim())}&${params}`;
  }
  if (topic && topic !== "TOP") {
    return `https://news.google.com/rss/headlines/section/topic/${topic}?${params}`;
  }
  return `https://news.google.com/rss?${params}`;
}

function AddSourceDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const createSource = useCreateNewsSource();
  const [type, setType] = useState<NewsSourceType>("RSS");
  const [mode, setMode] = useState<"custom" | "google-news">("custom");
  const [gnTopic, setGnTopic] = useState("TOP");
  const [gnKeyword, setGnKeyword] = useState("");
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<SourceFormValues>({
    resolver: zodResolver(sourceSchema),
    defaultValues: { name: "", url: "" },
  });

  const resetAll = () => {
    reset({ name: "", url: "" });
    setType("RSS");
    setMode("custom");
    setGnTopic("TOP");
    setGnKeyword("");
  };

  const onSubmit = async (values: SourceFormValues) => {
    try {
      await createSource.mutateAsync({ ...values, type });
      toast.success("News source added");
      onOpenChange(false);
      resetAll();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to add source");
    }
  };

  const handleAddGoogleNews = async () => {
    const topicLabel = GOOGLE_NEWS_TOPICS.find((t) => t.value === gnTopic)?.label ?? "Top Stories";
    const name = gnKeyword.trim()
      ? `Google News: "${gnKeyword.trim()}"`
      : `Google News: ${topicLabel}`;
    try {
      await createSource.mutateAsync({
        name,
        url: buildGoogleNewsUrl(gnTopic, gnKeyword),
        type: "RSS",
      });
      toast.success("Google News source added");
      onOpenChange(false);
      resetAll();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to add source");
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) resetAll();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a news source</DialogTitle>
        </DialogHeader>

        <div className="flex gap-1 rounded-md bg-muted p-1">
          <button
            type="button"
            onClick={() => setMode("custom")}
            className={cn(
              "flex-1 rounded px-3 py-1.5 text-sm font-medium transition-colors",
              mode === "custom" ? "bg-background shadow-sm" : "text-muted-foreground",
            )}
          >
            Custom Feed
          </button>
          <button
            type="button"
            onClick={() => setMode("google-news")}
            className={cn(
              "flex-1 rounded px-3 py-1.5 text-sm font-medium transition-colors",
              mode === "google-news" ? "bg-background shadow-sm" : "text-muted-foreground",
            )}
          >
            Google News
          </button>
        </div>

        {mode === "custom" ? (
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4 pt-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="source-name">Name</Label>
              <Input id="source-name" placeholder="e.g. TechCrunch RSS" {...register("name")} />
              {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
            </div>
            <div className="flex flex-col gap-2">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as NewsSourceType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SOURCE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="source-url">Feed URL</Label>
              <Input id="source-url" placeholder="https://example.com/feed" {...register("url")} />
              {errors.url && <p className="text-sm text-destructive">{errors.url.message}</p>}
            </div>
            <DialogFooter>
              <Button type="submit" disabled={createSource.isPending}>
                {createSource.isPending ? "Adding…" : "Add Source"}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="flex flex-col gap-4 pt-2">
            <div className="flex flex-col gap-2">
              <Label>Topic</Label>
              <Select value={gnTopic} onValueChange={(v) => setGnTopic(v ?? "TOP")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GOOGLE_NEWS_TOPICS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="gn-keyword">Or search by keyword (overrides topic)</Label>
              <Input
                id="gn-keyword"
                placeholder="e.g. artificial intelligence"
                value={gnKeyword}
                onChange={(e) => setGnKeyword(e.target.value)}
              />
            </div>
            <p className="break-all text-xs text-muted-foreground">
              Pulls Google News&apos; public RSS feed directly — no API key needed.
              <br />
              {buildGoogleNewsUrl(gnTopic, gnKeyword)}
            </p>
            <DialogFooter>
              <Button type="button" disabled={createSource.isPending} onClick={handleAddGoogleNews}>
                {createSource.isPending ? "Adding…" : "Add Google News Source"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SourcesTab({ canManage }: { canManage: boolean }) {
  const { data: sources, isLoading } = useNewsSources();
  const updateSource = useUpdateNewsSource();
  const deleteSource = useDeleteNewsSource();
  const ingestSource = useIngestNewsSource();
  const [addOpen, setAddOpen] = useState(false);
  const [ingestingId, setIngestingId] = useState<string | null>(null);

  const handleIngest = async (id: string) => {
    setIngestingId(id);
    try {
      const result = await ingestSource.mutateAsync(id);
      toast.success(
        `Ingested: ${result.itemsCreated} new, ${result.itemsSkipped} already seen`,
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Ingestion failed");
    } finally {
      setIngestingId(null);
    }
  };

  const handleToggleActive = async (id: string, isActive: boolean) => {
    try {
      await updateSource.mutateAsync({ id, isActive: !isActive });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Update failed");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteSource.mutateAsync(id);
      toast.success("Source removed");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Delete failed");
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">News Sources</CardTitle>
        {canManage && (
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" />
            Add Source
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {isLoading && <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && (sources ?? []).length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No news sources configured yet.
          </p>
        )}
        {(sources ?? []).length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last fetched</TableHead>
                <TableHead>Errors</TableHead>
                {canManage && <TableHead className="w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sources!.map((source) => (
                <TableRow key={source.id}>
                  <TableCell className="font-medium">{source.name}</TableCell>
                  <TableCell>{source.type}</TableCell>
                  <TableCell>
                    <Badge variant={source.isActive ? "default" : "outline"}>
                      {source.isActive ? "Active" : "Paused"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {source.lastFetchedAt
                      ? new Date(source.lastFetchedAt).toLocaleString()
                      : "Never"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {source.errorCount > 0 ? (
                      <span className="text-destructive" title={source.lastError ?? undefined}>
                        {source.errorCount}
                      </span>
                    ) : (
                      "0"
                    )}
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
                            disabled={ingestingId === source.id}
                            onClick={() => handleIngest(source.id)}
                          >
                            {ingestingId === source.id ? "Ingesting…" : "Ingest Now"}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleToggleActive(source.id, source.isActive)}
                          >
                            {source.isActive ? "Pause" : "Resume"}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => handleDelete(source.id)}
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
      <AddSourceDialog open={addOpen} onOpenChange={setAddOpen} />
    </Card>
  );
}

function ItemsTab({ canWrite }: { canWrite: boolean }) {
  const router = useRouter();
  const [status, setStatus] = useState<NewsItemStatus | "ALL">("NEW");
  const [sourceId, setSourceId] = useState<string>("ALL");
  const [page, setPage] = useState(1);
  const { data: sources } = useNewsSources();
  const { data, isLoading } = useNewsItems({
    status: status === "ALL" ? undefined : status,
    sourceId: sourceId === "ALL" ? undefined : sourceId,
    page,
    limit: 30,
  });
  const ignoreItem = useIgnoreNewsItem();
  const createDraft = useCreateDraftFromItem();
  const [creatingId, setCreatingId] = useState<string | null>(null);

  // A feed with older articles (e.g. a lower-volume RSS source) can get
  // pushed off the default "newest first, no source filter" view entirely
  // once enough sources are feeding in — the item is really there, just on
  // a page these controls previously had no way to reach.
  const handleStatusChange = (value: NewsItemStatus | "ALL") => {
    setStatus(value);
    setPage(1);
  };

  const handleSourceChange = (value: string | null) => {
    setSourceId(value ?? "ALL");
    setPage(1);
  };

  const handleIgnore = async (id: string) => {
    try {
      await ignoreItem.mutateAsync(id);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to ignore item");
    }
  };

  const handleCreateDraft = async (id: string) => {
    setCreatingId(id);
    try {
      const article = await createDraft.mutateAsync(id);
      toast.success("Draft created");
      router.push(`/articles/${article.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to create draft");
      setCreatingId(null);
    }
  };

  const items = data?.data ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">News Feed</CardTitle>
        <div className="flex gap-2">
          <Select value={sourceId} onValueChange={handleSourceChange}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All sources</SelectItem>
              {(sources ?? []).map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(v) => handleStatusChange(v as NewsItemStatus | "ALL")}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All statuses</SelectItem>
              {ITEM_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading && <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && items.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No news items for this filter yet — add a source and ingest it from the Sources tab.
          </p>
        )}
        <div className="flex flex-col divide-y">
          {items.map((item) => (
            <div key={item.id} className="flex items-start justify-between gap-4 py-3">
              <div className="flex flex-col gap-1">
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium hover:underline"
                >
                  {item.title}
                </a>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline">{item.status}</Badge>
                  {item.sourceName && <span>{item.sourceName}</span>}
                  {item.publishedAt && (
                    <span>{new Date(item.publishedAt).toLocaleDateString()}</span>
                  )}
                </div>
              </div>
              {canWrite && item.status !== "DRAFTED" && item.status !== "IGNORED" && (
                <div className="flex shrink-0 gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={creatingId === item.id}
                    onClick={() => handleCreateDraft(item.id)}
                  >
                    {creatingId === item.id ? "Creating…" : "Create Draft"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => handleIgnore(item.id)}>
                    Ignore
                  </Button>
                </div>
              )}
              {item.status === "DRAFTED" && item.articleId && (
                <Link
                  href={`/articles/${item.articleId}`}
                  className="shrink-0 text-sm text-muted-foreground hover:underline"
                >
                  View draft
                </Link>
              )}
            </div>
          ))}
        </div>
        {data && data.meta.totalPages > 1 && (
          <div className="flex items-center justify-between pt-4">
            <p className="text-sm text-muted-foreground">
              Page {data.meta.page} of {data.meta.totalPages} · {data.meta.total} total
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= data.meta.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ClusterDetailDialog({
  clusterId,
  onOpenChange,
}: {
  clusterId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { data, isLoading } = useNewsClusterDetail(clusterId ?? undefined);

  return (
    <Dialog open={!!clusterId} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{data?.title ?? "Cluster"}</DialogTitle>
        </DialogHeader>
        {isLoading && <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>}
        {data && (
          <div className="flex flex-col gap-4">
            {data.entities.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {data.entities.map((entity) => (
                  <Badge key={entity.text} variant="outline">
                    {entity.text}
                  </Badge>
                ))}
              </div>
            )}
            <ul className="flex flex-col gap-2">
              {data.newsItems.map((item) => (
                <li key={item.id} className="text-sm">
                  <a href={item.url} target="_blank" rel="noreferrer" className="hover:underline">
                    {item.title}
                  </a>
                  <span className="ml-2 text-xs text-muted-foreground">{item.sourceName}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ClustersTab() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useNewsClusters(page, 20);
  const [viewingId, setViewingId] = useState<string | null>(null);

  const clusters = data?.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Story Clusters</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading && <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && clusters.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No clusters yet — ingest some news sources and related stories will group here
            automatically.
          </p>
        )}
        {clusters.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Story</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Key entities</TableHead>
                <TableHead>Last updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clusters.map((cluster) => (
                <TableRow key={cluster.id}>
                  <TableCell className="font-medium">
                    <button
                      type="button"
                      className="text-left hover:underline"
                      onClick={() => setViewingId(cluster.id)}
                    >
                      {cluster.title ?? "Untitled cluster"}
                    </button>
                  </TableCell>
                  <TableCell>{cluster.itemCount}</TableCell>
                  <TableCell className="max-w-64 truncate text-muted-foreground">
                    {cluster.entities.map((e) => e.text).join(", ") || "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(cluster.lastUpdatedAt).toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {data && data.meta.totalPages > 1 && (
          <div className="flex justify-end gap-2 pt-4">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= data.meta.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </CardContent>
      <ClusterDetailDialog clusterId={viewingId} onOpenChange={() => setViewingId(null)} />
    </Card>
  );
}

export default function NewsIntelligencePage() {
  const user = useAuthStore((s) => s.user);
  const canManageSources = hasPermission(user, "news:manage-sources");
  const canWrite = hasPermission(user, "news:write");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">News Intelligence</h1>
        <p className="text-sm text-muted-foreground">
          Monitor RSS/Atom feeds and turn incoming stories into article drafts with one click.
        </p>
      </div>

      <Tabs defaultValue="sources">
        <TabsList>
          <TabsTrigger value="sources">Sources</TabsTrigger>
          <TabsTrigger value="items">News Feed</TabsTrigger>
          <TabsTrigger value="clusters">Clusters</TabsTrigger>
        </TabsList>
        <TabsContent value="sources" className="pt-4">
          <SourcesTab canManage={canManageSources} />
        </TabsContent>
        <TabsContent value="items" className="pt-4">
          <ItemsTab canWrite={canWrite} />
        </TabsContent>
        <TabsContent value="clusters" className="pt-4">
          <ClustersTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

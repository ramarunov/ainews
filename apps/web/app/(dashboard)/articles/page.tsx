"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import {
  useArticles,
  useDeleteArticle,
  usePublishArticle,
  useUnpublishArticle,
} from "@/hooks/use-articles";
import type { ArticleStatus } from "@/lib/types";
import { ApiError } from "@/lib/api-client";

const STATUS_OPTIONS: { value: ArticleStatus | "ALL"; label: string }[] = [
  { value: "ALL", label: "All statuses" },
  { value: "DRAFT", label: "Draft" },
  { value: "IN_REVIEW", label: "In review" },
  { value: "APPROVED", label: "Approved" },
  { value: "SCHEDULED", label: "Scheduled" },
  { value: "PUBLISHED", label: "Published" },
  { value: "ARCHIVED", label: "Archived" },
  { value: "REJECTED", label: "Rejected" },
];

const STATUS_VARIANT: Record<ArticleStatus, "default" | "secondary" | "outline" | "destructive"> = {
  DRAFT: "secondary",
  IN_REVIEW: "outline",
  APPROVED: "outline",
  SCHEDULED: "outline",
  PUBLISHED: "default",
  ARCHIVED: "secondary",
  REJECTED: "destructive",
};

export default function ArticlesPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ArticleStatus | "ALL">("ALL");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkActionPending, setBulkActionPending] = useState(false);

  const { data, isLoading, isError } = useArticles({
    page,
    limit: 20,
    search: search || undefined,
    status: status === "ALL" ? undefined : status,
  });

  const publishMutation = usePublishArticle();
  const unpublishMutation = useUnpublishArticle();
  const deleteMutation = useDeleteArticle();

  const handleAction = async (
    action: "publish" | "unpublish" | "delete",
    id: string,
  ) => {
    try {
      if (action === "publish") await publishMutation.mutateAsync(id);
      if (action === "unpublish") await unpublishMutation.mutateAsync(id);
      if (action === "delete") await deleteMutation.mutateAsync(id);
      toast.success("Done");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Action failed");
    }
  };

  const toggleSelected = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleSelectAll = (checked: boolean) => {
    setSelectedIds(checked ? new Set(data?.data.map((a) => a.id) ?? []) : new Set());
  };

  // Archiving reuses the existing unpublish endpoint - it already just sets
  // status to ARCHIVED without soft-deleting, which is exactly "archive"
  // regardless of the article's current status, not only when PUBLISHED.
  const handleBulkAction = async (action: "archive" | "delete") => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;

    setBulkActionPending(true);
    try {
      const mutation = action === "archive" ? unpublishMutation : deleteMutation;
      const results = await Promise.allSettled(ids.map((id) => mutation.mutateAsync(id)));
      const failed = results.filter((r) => r.status === "rejected").length;
      const succeeded = ids.length - failed;

      if (failed === 0) {
        toast.success(
          action === "archive"
            ? `${succeeded} article(s) archived`
            : `${succeeded} article(s) deleted`,
        );
      } else {
        toast.error(`${succeeded} succeeded, ${failed} failed`);
      }
      setSelectedIds(new Set());
    } finally {
      setBulkActionPending(false);
    }
  };

  const allOnPageSelected =
    (data?.data.length ?? 0) > 0 && data!.data.every((a) => selectedIds.has(a.id));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Articles</h1>
        <Button onClick={() => router.push("/articles/new")}>
          <Plus className="h-4 w-4" />
          New Article
        </Button>
      </div>

      <Card>
        <CardHeader className="flex-row items-center gap-4 space-y-0">
          <Input
            placeholder="Search articles…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="max-w-xs"
          />
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v as ArticleStatus | "ALL");
              setPage(1);
            }}
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <CardTitle className="sr-only">Articles</CardTitle>
        </CardHeader>
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-3 border-b bg-muted/50 px-6 py-3">
            <p className="text-sm font-medium">{selectedIds.size} selected</p>
            <Button
              variant="outline"
              size="sm"
              disabled={bulkActionPending}
              onClick={() => handleBulkAction("archive")}
            >
              Archive
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={bulkActionPending}
              onClick={() => handleBulkAction("delete")}
            >
              Delete
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={bulkActionPending}
              onClick={() => setSelectedIds(new Set())}
            >
              Clear selection
            </Button>
          </div>
        )}
        <CardContent>
          {isLoading && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Loading…
            </p>
          )}
          {isError && (
            <p className="py-8 text-center text-sm text-destructive">
              Failed to load articles.
            </p>
          )}
          {data && data.data.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No articles yet.
            </p>
          )}
          {data && data.data.length > 0 && (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={allOnPageSelected}
                        onCheckedChange={(v) => toggleSelectAll(!!v)}
                        aria-label="Select all on this page"
                      />
                    </TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Updated</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.data.map((article) => (
                    <TableRow key={article.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(article.id)}
                          onCheckedChange={(v) => toggleSelected(article.id, !!v)}
                          aria-label={`Select ${article.title}`}
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        <Link
                          href={`/articles/${article.id}`}
                          className="hover:underline"
                        >
                          {article.title}
                        </Link>
                      </TableCell>
                      <TableCell>
                        {article.primaryCategory?.name ?? (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[article.status]}>
                          {article.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(article.updatedAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            className={buttonVariants({
                              variant: "ghost",
                              size: "icon",
                            })}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() =>
                                router.push(`/articles/${article.id}`)
                              }
                            >
                              Edit
                            </DropdownMenuItem>
                            {article.status === "PUBLISHED" ? (
                              <DropdownMenuItem
                                onClick={() => handleAction("unpublish", article.id)}
                              >
                                Unpublish
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                onClick={() => handleAction("publish", article.id)}
                              >
                                Publish
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => handleAction("delete", article.id)}
                            >
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex items-center justify-between pt-4">
                <p className="text-sm text-muted-foreground">
                  Page {data.meta.page} of {Math.max(data.meta.totalPages, 1)} ·{" "}
                  {data.meta.total} total
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
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

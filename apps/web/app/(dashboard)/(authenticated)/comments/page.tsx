"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { MoreHorizontal } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useComments, useDeleteComment, useModerateComment } from "@/hooks/use-comments";
import { ApiError } from "@/lib/api-client";
import type { CommentStatus } from "@/lib/types";

const STATUS_VARIANT: Record<CommentStatus, "default" | "outline" | "destructive" | "secondary"> = {
  PENDING: "outline",
  APPROVED: "default",
  REJECTED: "secondary",
  SPAM: "destructive",
};

function CommentsTable({ status }: { status: CommentStatus | "ALL" }) {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useComments(status, page, 20);
  const moderate = useModerateComment();
  const deleteComment = useDeleteComment();

  const handleModerate = async (id: string, next: CommentStatus) => {
    try {
      await moderate.mutateAsync({ id, status: next });
      toast.success("Comment updated");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Update failed");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteComment.mutateAsync(id);
      toast.success("Comment deleted");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Delete failed");
    }
  };

  const comments = data?.data ?? [];

  return (
    <Card>
      <CardContent className="pt-6">
        {isLoading && <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && comments.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">No comments here.</p>
        )}
        {comments.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Comment</TableHead>
                <TableHead>Author</TableHead>
                <TableHead>Article</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {comments.map((comment) => (
                <TableRow key={comment.id}>
                  <TableCell className="max-w-xs">
                    <p className="line-clamp-2 text-sm">{comment.content}</p>
                  </TableCell>
                  <TableCell className="text-sm">
                    <p className="font-medium">{comment.authorName}</p>
                    <p className="text-xs text-muted-foreground">{comment.authorEmail}</p>
                  </TableCell>
                  <TableCell className="max-w-40">
                    <Link
                      href={`/news/${comment.article.slug}`}
                      target="_blank"
                      className="line-clamp-2 text-sm hover:underline"
                    >
                      {comment.article.title}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[comment.status]}>{comment.status}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(comment.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger className={buttonVariants({ variant: "ghost", size: "icon" })}>
                        <MoreHorizontal className="h-4 w-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {comment.status !== "APPROVED" && (
                          <DropdownMenuItem onClick={() => handleModerate(comment.id, "APPROVED")}>
                            Approve
                          </DropdownMenuItem>
                        )}
                        {comment.status !== "REJECTED" && (
                          <DropdownMenuItem onClick={() => handleModerate(comment.id, "REJECTED")}>
                            Reject
                          </DropdownMenuItem>
                        )}
                        {comment.status !== "SPAM" && (
                          <DropdownMenuItem onClick={() => handleModerate(comment.id, "SPAM")}>
                            Mark as spam
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem variant="destructive" onClick={() => handleDelete(comment.id)}>
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {data && data.meta.totalPages > 1 && (
          <div className="flex items-center justify-between pt-4">
            <p className="text-sm text-muted-foreground">
              Page {data.meta.page} of {data.meta.totalPages} · {data.meta.total} total
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= data.meta.totalPages}
                onClick={() => setPage((p) => p + 1)}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function CommentsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Comments</h1>
        <p className="text-sm text-muted-foreground">
          Moderate reader comments submitted on published articles.
        </p>
      </div>

      <Tabs defaultValue="PENDING">
        <TabsList>
          <TabsTrigger value="PENDING">Pending</TabsTrigger>
          <TabsTrigger value="APPROVED">Approved</TabsTrigger>
          <TabsTrigger value="REJECTED">Rejected</TabsTrigger>
          <TabsTrigger value="SPAM">Spam</TabsTrigger>
          <TabsTrigger value="ALL">All</TabsTrigger>
        </TabsList>
        <TabsContent value="PENDING" className="pt-4">
          <CommentsTable status="PENDING" />
        </TabsContent>
        <TabsContent value="APPROVED" className="pt-4">
          <CommentsTable status="APPROVED" />
        </TabsContent>
        <TabsContent value="REJECTED" className="pt-4">
          <CommentsTable status="REJECTED" />
        </TabsContent>
        <TabsContent value="SPAM" className="pt-4">
          <CommentsTable status="SPAM" />
        </TabsContent>
        <TabsContent value="ALL" className="pt-4">
          <CommentsTable status="ALL" />
        </TabsContent>
      </Tabs>
    </div>
  );
}

"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAddComment, useComments, useResolveComment } from "@/hooks/use-workflow";
import { ApiError } from "@/lib/api-client";
import { hasPermission, useAuthStore } from "@/lib/auth-store";
import type { EditorialComment } from "@/lib/types";

function CommentItem({
  comment,
  onResolve,
  canWrite,
}: {
  comment: EditorialComment;
  onResolve: (id: string) => void;
  canWrite: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 border-l-2 pl-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="font-medium text-foreground">
          {comment.author?.displayName ?? "Unknown"}
        </span>
        <span>{new Date(comment.createdAt).toLocaleString()}</span>
      </div>
      <p className="text-sm">{comment.content}</p>
      {comment.resolvedAt ? (
        <span className="text-xs text-muted-foreground">Resolved</span>
      ) : (
        canWrite && (
          <button
            type="button"
            onClick={() => onResolve(comment.id)}
            className="w-fit text-xs text-muted-foreground hover:underline"
          >
            Mark resolved
          </button>
        )
      )}
      {comment.replies?.length > 0 && (
        <div className="mt-2 flex flex-col gap-2 pl-2">
          {comment.replies.map((reply) => (
            <CommentItem key={reply.id} comment={reply} onResolve={onResolve} canWrite={canWrite} />
          ))}
        </div>
      )}
    </div>
  );
}

export function WorkflowCommentsDialog({
  articleId,
  articleTitle,
  open,
  onOpenChange,
}: {
  articleId: string;
  articleTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const user = useAuthStore((s) => s.user);
  const canWrite = hasPermission(user, "workflow:write");
  const { data: comments, isLoading } = useComments(articleId);
  const addComment = useAddComment(articleId);
  const resolveComment = useResolveComment(articleId);
  const [draft, setDraft] = useState("");

  const handleSubmit = async () => {
    if (!draft.trim()) return;
    try {
      await addComment.mutateAsync({ content: draft.trim() });
      setDraft("");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to add comment");
    }
  };

  const handleResolve = async (commentId: string) => {
    try {
      await resolveComment.mutateAsync(commentId);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to resolve comment");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="line-clamp-2">{articleTitle}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {isLoading && <p className="text-sm text-muted-foreground">Loading comments…</p>}
          {comments && comments.length === 0 && (
            <p className="text-sm text-muted-foreground">No comments yet.</p>
          )}
          {comments?.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              onResolve={handleResolve}
              canWrite={canWrite}
            />
          ))}

          {canWrite && (
            <div className="flex flex-col gap-2 border-t pt-4">
              <Textarea
                placeholder="Add an editorial comment…"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={3}
              />
              <Button
                onClick={handleSubmit}
                disabled={!draft.trim() || addComment.isPending}
                className="self-end"
              >
                Comment
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

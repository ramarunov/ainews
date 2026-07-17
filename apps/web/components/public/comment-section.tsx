"use client";

import { useState } from "react";
import { submitArticleComment } from "@/lib/public-api";
import type { CommentNode } from "@/lib/types";
import { cn } from "@/lib/utils";

// Reply threads visually stop indenting past this depth (they still nest
// data-wise / can still be replied to) so a long back-and-forth can't push
// the content into a sliver on the right edge of the page.
const MAX_VISUAL_DEPTH = 4;

function CommentAvatar({ name }: { name: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-black text-primary-foreground">
      {initial}
    </div>
  );
}

function formatRelativeDate(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "baru saja";
  if (diffMin < 60) return `${diffMin} menit lalu`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} jam lalu`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay} hari lalu`;
  return date.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

interface CommentFormProps {
  articleSlug: string;
  parentId?: string;
  onDone?: () => void;
  autoFocus?: boolean;
}

function CommentForm({ articleSlug, parentId, onDone, autoFocus }: CommentFormProps) {
  const [authorName, setAuthorName] = useState("");
  const [authorEmail, setAuthorEmail] = useState("");
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);
    const res = await submitArticleComment(articleSlug, { authorName, authorEmail, content, parentId });
    setSubmitting(false);
    if (res.ok) {
      setResult({ ok: true, message: res.message });
      setContent("");
      onDone?.();
    } else {
      setResult({ ok: false, message: res.error });
    }
  };

  if (result?.ok) {
    return (
      <p className="rounded-lg border border-primary/30 bg-accent px-4 py-3 text-sm text-accent-foreground">
        {result.message}
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          type="text"
          required
          minLength={2}
          maxLength={100}
          placeholder="Nama"
          value={authorName}
          onChange={(e) => setAuthorName(e.target.value)}
          className="rounded-md border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
        />
        <input
          type="email"
          required
          maxLength={255}
          placeholder="Email (tidak ditampilkan publik)"
          value={authorEmail}
          onChange={(e) => setAuthorEmail(e.target.value)}
          className="rounded-md border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
        />
      </div>
      <textarea
        required
        minLength={2}
        maxLength={2000}
        rows={parentId ? 2 : 3}
        autoFocus={autoFocus}
        placeholder={parentId ? "Tulis balasan Anda…" : "Tulis komentar Anda…"}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        className="resize-none rounded-md border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
      />
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Komentar tidak boleh berisi tautan/link dan akan tampil setelah disetujui moderator.
        </p>
        <div className="flex shrink-0 gap-2">
          {onDone && (
            <button
              type="button"
              onClick={onDone}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted"
            >
              Batal
            </button>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-primary px-4 py-1.5 text-sm font-bold text-primary-foreground disabled:opacity-60"
          >
            {submitting ? "Mengirim…" : parentId ? "Balas" : "Kirim Komentar"}
          </button>
        </div>
      </div>
      {result && !result.ok && <p className="text-sm text-destructive">{result.message}</p>}
    </form>
  );
}

function CommentItem({
  comment,
  articleSlug,
  depth,
}: {
  comment: CommentNode;
  articleSlug: string;
  depth: number;
}) {
  const [replying, setReplying] = useState(false);
  const visualDepth = Math.min(depth, MAX_VISUAL_DEPTH);

  return (
    <div className={cn(visualDepth > 0 && "mt-4 border-l-2 pl-4")}>
      <div className="flex gap-3">
        <CommentAvatar name={comment.authorName} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-baseline gap-2">
            <span className="font-bold">{comment.authorName}</span>
            <time className="text-xs text-muted-foreground">{formatRelativeDate(comment.createdAt)}</time>
          </div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{comment.content}</p>
          <button
            type="button"
            onClick={() => setReplying((r) => !r)}
            className="mt-1 w-fit text-xs font-bold text-muted-foreground hover:text-primary"
          >
            {replying ? "Batal" : "Balas"}
          </button>
          {replying && (
            <div className="mt-2">
              <CommentForm
                articleSlug={articleSlug}
                parentId={comment.id}
                autoFocus
                onDone={() => setReplying(false)}
              />
            </div>
          )}
        </div>
      </div>

      {comment.replies.map((reply) => (
        <CommentItem key={reply.id} comment={reply} articleSlug={articleSlug} depth={depth + 1} />
      ))}
    </div>
  );
}

function countComments(nodes: CommentNode[]): number {
  return nodes.reduce((sum, n) => sum + 1 + countComments(n.replies), 0);
}

export function CommentSection({
  articleSlug,
  initialComments,
}: {
  articleSlug: string;
  initialComments: CommentNode[];
}) {
  const total = countComments(initialComments);

  return (
    <section className="mt-10 flex flex-col gap-6 border-t pt-8">
      <div className="flex items-center gap-2">
        <span className="h-4 w-1 rounded-full bg-primary" />
        <h2 className="text-lg font-black tracking-tight uppercase">
          Komentar {total > 0 && `(${total})`}
        </h2>
      </div>

      <CommentForm articleSlug={articleSlug} />

      {initialComments.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Belum ada komentar. Jadilah yang pertama berkomentar!
        </p>
      ) : (
        <div className="flex flex-col">
          {initialComments.map((comment) => (
            <CommentItem key={comment.id} comment={comment} articleSlug={articleSlug} depth={0} />
          ))}
        </div>
      )}
    </section>
  );
}

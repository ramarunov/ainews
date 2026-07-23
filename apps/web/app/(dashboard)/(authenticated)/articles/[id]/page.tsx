"use client";

import { useParams } from "next/navigation";
import { ArticleForm } from "@/components/article-form";
import { useArticle } from "@/hooks/use-articles";

export default function EditArticlePage() {
  const params = useParams<{ id: string }>();
  const { data: article, isLoading, isError } = useArticle(params.id);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Edit Article</h1>
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {isError && (
        <p className="text-sm text-destructive">Failed to load article.</p>
      )}
      {article && <ArticleForm article={article} />}
    </div>
  );
}

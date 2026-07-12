"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { useSeoScore } from "@/hooks/use-seo";
import { ApiError } from "@/lib/api-client";

const DETAIL_LABELS: Record<string, string> = {
  keywordInTitle: "Keyword in title",
  keywordInFirstParagraph: "Keyword in first paragraph",
  keywordDensity: "Keyword density",
  metaDescription: "Meta description",
  headingStructure: "Heading structure",
  wordCount: "Word count",
  internalLinks: "Internal links",
  imageAltText: "Image alt text",
  urlStructure: "URL structure",
  schemaMarkup: "Schema markup",
  readability: "Readability",
};

function scoreColor(total: number) {
  if (total >= 80) return "text-green-600 dark:text-green-500";
  if (total >= 50) return "text-yellow-600 dark:text-yellow-500";
  return "text-destructive";
}

export function SeoPanel({
  articleId,
  title,
  content,
  slug,
}: {
  articleId: string;
  title: string;
  content: string;
  slug: string;
}) {
  const [focusKeyword, setFocusKeyword] = useState("");
  const seoScore = useSeoScore(articleId);

  const onCheck = async () => {
    try {
      await seoScore.mutateAsync({ content, title, focusKeyword: focusKeyword || undefined, slug });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "SEO score failed");
    }
  };

  const result = seoScore.data;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="focusKeyword">Focus keyword</Label>
        <Input
          id="focusKeyword"
          placeholder="e.g. artificial intelligence"
          value={focusKeyword}
          onChange={(e) => setFocusKeyword(e.target.value)}
        />
      </div>
      <Button type="button" onClick={onCheck} disabled={seoScore.isPending}>
        {seoScore.isPending ? "Checking…" : "Check SEO Score"}
      </Button>

      {result && (
        <div className="flex flex-col gap-3 border-t pt-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Score</span>
            <span className={`text-2xl font-bold ${scoreColor(result.total)}`}>
              {result.total}/100
            </span>
          </div>
          <Progress value={result.total} />

          <div className="flex flex-col gap-1 text-sm">
            {Object.entries(result.details).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  {DETAIL_LABELS[key] ?? key}
                </span>
                <span>{value}</span>
              </div>
            ))}
          </div>

          {result.recommendations.length > 0 && (
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium">Recommendations</p>
              <ul className="list-inside list-disc text-sm text-muted-foreground">
                {result.recommendations.map((rec, i) => (
                  <li key={i}>{rec}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

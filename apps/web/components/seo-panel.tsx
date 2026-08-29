"use client";

import { toast } from "sonner";
import type { UseFormRegister } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { useSeoScore } from "@/hooks/use-seo";
import { ApiError } from "@/lib/api-client";
import type { ArticleFormValues } from "@/components/article-form";
import { ROBOTS_OPTIONS } from "@/components/article-form";

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

// The public <title> gets " — RusdiMedia.com" (17 chars) appended sitewide,
// and Google shows ~60 - so the useful budget for a stored meta title is ~43.
const META_TITLE_BUDGET = 43;
const META_DESCRIPTION_BUDGET = 160;

function scoreColor(total: number) {
  if (total >= 80) return "text-green-600 dark:text-green-500";
  if (total >= 50) return "text-yellow-600 dark:text-yellow-500";
  return "text-destructive";
}

function counterClass(len: number, budget: number) {
  if (len === 0) return "text-muted-foreground";
  if (len > budget) return "text-destructive";
  if (len > budget * 0.7) return "text-yellow-600 dark:text-yellow-500";
  return "text-green-600 dark:text-green-500";
}

export function SeoPanel({
  articleId,
  title,
  content,
  slug,
  register,
  metaTitle,
  metaDescription,
  focusKeyword,
}: {
  articleId: string;
  title: string;
  content: string;
  slug: string;
  register: UseFormRegister<ArticleFormValues>;
  metaTitle: string;
  metaDescription: string;
  focusKeyword: string;
}) {
  const seoScore = useSeoScore(articleId);

  const onCheck = async () => {
    try {
      await seoScore.mutateAsync({
        content,
        title,
        focusKeyword: focusKeyword || undefined,
        slug,
      });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "SEO score failed");
    }
  };

  const result = seoScore.data;

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted-foreground">
        Leave a field blank to have it generated automatically when the article is
        published. Anything you enter here overrides that and is kept on later
        edits.
      </p>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="metaTitle">Meta title</Label>
          <span className={`text-xs ${counterClass(metaTitle.length, META_TITLE_BUDGET)}`}>
            {metaTitle.length}/{META_TITLE_BUDGET}
          </span>
        </div>
        <Input
          id="metaTitle"
          placeholder={title || "Uses the article title"}
          {...register("metaTitle")}
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="metaDescription">Meta description</Label>
          <span
            className={`text-xs ${counterClass(
              metaDescription.length,
              META_DESCRIPTION_BUDGET,
            )}`}
          >
            {metaDescription.length}/{META_DESCRIPTION_BUDGET}
          </span>
        </div>
        <Textarea
          id="metaDescription"
          rows={3}
          placeholder="Auto-generated from the article body on publish"
          {...register("metaDescription")}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="focusKeyword">Focus keyword</Label>
        <Input
          id="focusKeyword"
          placeholder="e.g. harga emas hari ini"
          {...register("focusKeyword")}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="robots">Search engine indexing</Label>
        <select
          id="robots"
          className="border-input bg-background h-9 rounded-md border px-3 text-sm shadow-sm focus:border-primary focus:outline-none"
          {...register("robots")}
        >
          {ROBOTS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <Button
        type="button"
        variant="secondary"
        onClick={onCheck}
        disabled={seoScore.isPending}
      >
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

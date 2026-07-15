"use client";

import { Badge } from "@/components/ui/badge";
import { useArticleAiAnalyses } from "@/hooks/use-articles";

const RECOMMENDATION_VARIANT: Record<string, "default" | "outline" | "destructive"> = {
  SAFE_TO_PUBLISH: "default",
  REVIEW_BEFORE_PUBLISH: "outline",
  DO_NOT_PUBLISH: "destructive",
};

export function AiPipelinePanel({ articleId }: { articleId: string }) {
  const { data: analyses, isLoading } = useArticleAiAnalyses(articleId);

  if (isLoading) {
    return <div className="h-32 animate-pulse rounded-md bg-muted" />;
  }

  const gate = analyses?.find((a) => a.analysisType === "autonomous_gate");

  if (!gate) {
    return (
      <p className="text-sm text-muted-foreground">
        This article was AI-assisted but has no autonomous pipeline record
        (likely created via the manual News Intelligence draft flow).
      </p>
    );
  }

  const { hallucination, qualityScore, decision } = gate.result;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">Autonomous pipeline decision</span>
        <Badge variant={decision === "published" ? "default" : "outline"}>
          {decision === "published" ? "Auto-published" : "Flagged for review"}
        </Badge>
      </div>

      {hallucination && (
        <div className="flex flex-col gap-2 border-t pt-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Fact-check</span>
            <Badge variant={RECOMMENDATION_VARIANT[hallucination.recommendation] ?? "outline"}>
              {hallucination.recommendation.replaceAll("_", " ")}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {Math.round(hallucination.overallConfidence * 100)}% confidence
            </span>
          </div>
          {hallucination.claims.filter((c) => c.flag !== "VERIFIED" && c.flag !== "LIKELY_TRUE").length > 0 && (
            <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
              {hallucination.claims
                .filter((c) => c.flag !== "VERIFIED" && c.flag !== "LIKELY_TRUE")
                .map((claim, i) => (
                  <li key={i} className="rounded-md border border-dashed p-2">
                    <span className="font-medium text-foreground">{claim.flag.replaceAll("_", " ")}: </span>
                    {claim.text}
                    <div className="mt-1 italic">{claim.reason}</div>
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}

      {qualityScore && (
        <div className="flex flex-col gap-2 border-t pt-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Quality score</span>
            <Badge variant={qualityScore.canPublish ? "default" : "outline"}>
              {qualityScore.overall}/100
            </Badge>
          </div>
          {qualityScore.issues.length > 0 && (
            <ul className="list-disc pl-4 text-xs text-muted-foreground">
              {qualityScore.issues.map((issue, i) => (
                <li key={i}>{issue}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {new Date(gate.createdAt).toLocaleString()}
      </p>
    </div>
  );
}

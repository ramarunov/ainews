"use client";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useGeoScore } from "@/hooks/use-seo";
import { ApiError } from "@/lib/api-client";

const BREAKDOWN_LABELS: Record<string, string> = {
  llmReadability: "LLM readability",
  semanticRichness: "Semantic richness",
  entityCoverage: "Entity coverage",
  evidence: "Evidence",
  qaCoverage: "Q&A coverage",
  citationFriendliness: "Citation friendliness",
};

export function GeoPanel({
  articleId,
  title,
  content,
}: {
  articleId: string;
  title: string;
  content: string;
}) {
  const geoScore = useGeoScore(articleId);

  const onAnalyze = async () => {
    try {
      await geoScore.mutateAsync({ content, title });
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.message
          : "GEO analysis failed",
      );
    }
  };

  const result = geoScore.data;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Generative Engine Optimization — how well this article can be read,
        summarized, and cited by AI search engines.
      </p>
      <Button type="button" onClick={onAnalyze} disabled={geoScore.isPending}>
        {geoScore.isPending ? "Analyzing…" : "Analyze GEO"}
      </Button>

      {result && (
        <div className="flex flex-col gap-3 border-t pt-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Score</span>
            <span className="text-2xl font-bold">{result.total}/100</span>
          </div>
          <Progress value={result.total} />

          <div className="flex flex-col gap-1 text-sm">
            {Object.entries(result.breakdown).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  {BREAKDOWN_LABELS[key] ?? key}
                </span>
                <span>{value}</span>
              </div>
            ))}
          </div>

          {result.structuredSummary && (
            <div>
              <p className="text-sm font-medium">Structured summary</p>
              <p className="text-sm text-muted-foreground">
                {result.structuredSummary}
              </p>
            </div>
          )}

          {result.keyClaims.length > 0 && (
            <div>
              <p className="text-sm font-medium">Key claims</p>
              <ul className="list-inside list-disc text-sm text-muted-foreground">
                {result.keyClaims.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          )}

          {result.recommendations.length > 0 && (
            <div>
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

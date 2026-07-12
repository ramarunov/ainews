import { useMutation } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type { GeoScore, SeoScoreBreakdown } from "@/lib/types";

export function useSeoScore(articleId: string) {
  return useMutation({
    mutationFn: (input: {
      content: string;
      title: string;
      focusKeyword?: string;
      slug?: string;
    }) =>
      apiClient.post<SeoScoreBreakdown>(`/seo/articles/${articleId}/score`, input),
  });
}

export function useGeoScore(articleId: string) {
  return useMutation({
    mutationFn: (input: { content: string; title: string }) =>
      apiClient.post<GeoScore>(`/geo/articles/${articleId}/score`, input),
  });
}

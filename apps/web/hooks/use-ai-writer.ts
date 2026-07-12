import { useMutation } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type {
  ExtractedEntity,
  FaqItem,
  HallucinationResult,
  QualityScoreResult,
} from "@/lib/types";

export function useGenerateDraft(articleId: string) {
  return useMutation({
    mutationFn: (input: {
      title: string;
      outline?: string[];
      tone?: "formal" | "casual" | "authoritative" | "conversational";
      targetLength?: number;
      focusKeyword?: string;
    }) =>
      apiClient
        .post<{ draft: string }>(`/ai/articles/${articleId}/draft`, input)
        .then((r) => r.draft),
  });
}

export function useGenerateTitles(articleId: string) {
  return useMutation({
    mutationFn: (input: { content: string; focusKeyword?: string; count?: number }) =>
      apiClient
        .post<{ titles: string[] }>(`/ai/articles/${articleId}/titles`, input)
        .then((r) => r.titles),
  });
}

export function useGenerateMetaDescription(articleId: string) {
  return useMutation({
    mutationFn: (input: { content: string; focusKeyword?: string }) =>
      apiClient
        .post<{ metaDescription: string }>(
          `/ai/articles/${articleId}/meta-description`,
          input,
        )
        .then((r) => r.metaDescription),
  });
}

export function useGenerateFaqs(articleId: string) {
  return useMutation({
    mutationFn: (input: { content: string; count?: number }) =>
      apiClient
        .post<{ faqs: FaqItem[] }>(`/ai/articles/${articleId}/faqs`, input)
        .then((r) => r.faqs),
  });
}

export function useRewrite(articleId: string) {
  return useMutation({
    mutationFn: (input: { content: string; instruction: string }) =>
      apiClient
        .post<{ rewritten: string }>(`/ai/articles/${articleId}/rewrite`, input)
        .then((r) => r.rewritten),
  });
}

export function useHallucinationCheck(articleId: string) {
  return useMutation({
    mutationFn: (input: { content: string }) =>
      apiClient.post<HallucinationResult>(
        `/ai/articles/${articleId}/hallucination-check`,
        input,
      ),
  });
}

export function useQualityScore(articleId: string) {
  return useMutation({
    mutationFn: (input: { content: string; title: string }) =>
      apiClient.post<QualityScoreResult>(
        `/ai/articles/${articleId}/quality-score`,
        input,
      ),
  });
}

export function useExtractEntities(articleId: string) {
  return useMutation({
    mutationFn: (input: { content: string }) =>
      apiClient
        .post<{ entities: ExtractedEntity[] }>(
          `/ai/articles/${articleId}/entities`,
          input,
        )
        .then((r) => r.entities),
  });
}

export function useImagePrompt(articleId: string) {
  return useMutation({
    mutationFn: (input: { title: string; excerpt: string }) =>
      apiClient
        .post<{ prompt: string }>(`/ai/articles/${articleId}/image-prompt`, input)
        .then((r) => r.prompt),
  });
}

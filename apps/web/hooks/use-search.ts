import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type { Article, ArticleStatus, PaginatedResponse } from "@/lib/types";

export interface SearchFilters {
  q: string;
  status?: ArticleStatus;
  page?: number;
  limit?: number;
}

function buildQuery(filters: SearchFilters) {
  const params = new URLSearchParams();
  params.set("q", filters.q);
  if (filters.status) params.set("status", filters.status);
  if (filters.page) params.set("page", String(filters.page));
  if (filters.limit) params.set("limit", String(filters.limit));
  return `?${params.toString()}`;
}

export function useArticleSearch(filters: SearchFilters) {
  return useQuery({
    queryKey: ["search", filters],
    queryFn: () =>
      apiClient.get<PaginatedResponse<Article>>(
        `/search/articles${buildQuery(filters)}`,
      ),
    enabled: filters.q.trim().length > 0,
  });
}

export interface SearchAnalytics {
  period: { days: number; since: string };
  totalSearches: number;
  topQueries: Array<{ query: string; count: number }>;
  zeroResultQueries: Array<{ query: string; count: number }>;
}

export function useSearchAnalytics(days = 30) {
  return useQuery({
    queryKey: ["search-analytics", days],
    queryFn: () => apiClient.get<SearchAnalytics>(`/search/analytics?days=${days}`),
  });
}

export interface SemanticSearchResult {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  publishedAt: string | null;
  similarity: number;
}

export function useSemanticSearch(query: string, limit = 10) {
  return useQuery({
    queryKey: ["semantic-search", query, limit],
    queryFn: () =>
      apiClient.get<SemanticSearchResult[]>(
        `/search/semantic?q=${encodeURIComponent(query)}&limit=${limit}`,
      ),
    enabled: query.trim().length > 0,
  });
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type {
  Article,
  ArticleAiAnalysis,
  ArticleStatus,
  CreateArticleInput,
  PaginatedResponse,
} from "@/lib/types";

export interface ArticleFilters {
  page?: number;
  limit?: number;
  status?: ArticleStatus;
  search?: string;
}

function buildQuery(filters: ArticleFilters) {
  const params = new URLSearchParams();
  if (filters.page) params.set("page", String(filters.page));
  if (filters.limit) params.set("limit", String(filters.limit));
  if (filters.status) params.set("status", filters.status);
  if (filters.search) params.set("search", filters.search);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function useArticles(filters: ArticleFilters) {
  return useQuery({
    queryKey: ["articles", filters],
    queryFn: () =>
      apiClient.get<PaginatedResponse<Article>>(`/articles${buildQuery(filters)}`),
  });
}

export interface CalendarArticle {
  id: string;
  title: string;
  slug: string;
  status: ArticleStatus;
  scheduledAt: string | null;
  publishedAt: string | null;
  primaryAuthor: { id: string; displayName?: string | null } | null;
  primaryCategory: { id: string; name: string } | null;
}

export function useArticleCalendar(year: number, month: number) {
  return useQuery({
    queryKey: ["articles", "calendar", year, month],
    queryFn: () =>
      apiClient.get<CalendarArticle[]>(`/articles/calendar?year=${year}&month=${month}`),
  });
}

export function useArticle(id: string | undefined) {
  return useQuery({
    queryKey: ["articles", id],
    queryFn: () => apiClient.get<Article>(`/articles/${id}`),
    enabled: !!id,
  });
}

export function useArticleAiAnalyses(id: string | undefined) {
  return useQuery({
    queryKey: ["articles", id, "ai-analyses"],
    queryFn: () => apiClient.get<ArticleAiAnalysis[]>(`/articles/${id}/ai-analyses`),
    enabled: !!id,
  });
}

export function useCreateArticle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateArticleInput) =>
      apiClient.post<Article>("/articles", input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["articles"] });
    },
  });
}

export function useUpdateArticle(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<CreateArticleInput>) =>
      apiClient.patch<Article>(`/articles/${id}`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["articles"] });
      queryClient.invalidateQueries({ queryKey: ["articles", id] });
    },
  });
}

export function usePublishArticle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.patch<Article>(`/articles/${id}/publish`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["articles"] }),
  });
}

export function useUnpublishArticle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.patch<Article>(`/articles/${id}/unpublish`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["articles"] }),
  });
}

export function useDeleteArticle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete<Article>(`/articles/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["articles"] }),
  });
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type {
  NewsItem,
  NewsItemStatus,
  NewsSource,
  NewsSourceType,
  PaginatedResponse,
} from "@/lib/types";

export function useNewsSources() {
  return useQuery({
    queryKey: ["news-sources"],
    queryFn: () => apiClient.get<NewsSource[]>("/news-intelligence/sources"),
    staleTime: 30_000,
  });
}

export function useCreateNewsSource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; type: NewsSourceType; url: string }) =>
      apiClient.post<NewsSource>("/news-intelligence/sources", input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["news-sources"] }),
  });
}

export function useUpdateNewsSource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string; isActive?: boolean }) =>
      apiClient.patch<NewsSource>(`/news-intelligence/sources/${id}`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["news-sources"] }),
  });
}

export function useDeleteNewsSource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/news-intelligence/sources/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["news-sources"] }),
  });
}

export function useIngestNewsSource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sourceId: string) =>
      apiClient.post<{ itemsFound: number; itemsCreated: number; itemsSkipped: number }>(
        `/news-intelligence/sources/${sourceId}/ingest`,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["news-sources"] });
      queryClient.invalidateQueries({ queryKey: ["news-items"] });
    },
  });
}

export interface NewsItemFilters {
  status?: NewsItemStatus;
  sourceId?: string;
  page?: number;
  limit?: number;
}

function buildQuery(filters: NewsItemFilters) {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.sourceId) params.set("sourceId", filters.sourceId);
  if (filters.page) params.set("page", String(filters.page));
  if (filters.limit) params.set("limit", String(filters.limit));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function useNewsItems(filters: NewsItemFilters) {
  return useQuery({
    queryKey: ["news-items", filters],
    queryFn: () =>
      apiClient.get<PaginatedResponse<NewsItem>>(
        `/news-intelligence/items${buildQuery(filters)}`,
      ),
    staleTime: 15_000,
  });
}

export function useIgnoreNewsItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.patch(`/news-intelligence/items/${id}/ignore`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["news-items"] }),
  });
}

export function useCreateDraftFromItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post<{ id: string; slug: string }>(`/news-intelligence/items/${id}/draft`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["news-items"] }),
  });
}

export interface NewsClusterEntity {
  text: string;
  type: string;
  confidence: number;
}

export interface NewsCluster {
  id: string;
  title: string | null;
  summary: string | null;
  itemCount: number;
  trendScore: string;
  entities: NewsClusterEntity[];
  firstSeenAt: string;
  lastUpdatedAt: string;
}

export interface NewsClusterDetail extends NewsCluster {
  newsItems: NewsItem[];
}

export function useNewsClusters(page = 1, limit = 20) {
  return useQuery({
    queryKey: ["news-clusters", page, limit],
    queryFn: () =>
      apiClient.get<PaginatedResponse<NewsCluster>>(
        `/news-intelligence/clusters?page=${page}&limit=${limit}`,
      ),
    staleTime: 15_000,
  });
}

export function useNewsClusterDetail(id: string | undefined) {
  return useQuery({
    queryKey: ["news-clusters", id],
    queryFn: () => apiClient.get<NewsClusterDetail>(`/news-intelligence/clusters/${id}`),
    enabled: !!id,
  });
}

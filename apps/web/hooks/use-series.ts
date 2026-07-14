import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type { ArticleSeries, ArticleSeriesDetail, CreateSeriesInput } from "@/lib/types";

export function useSeriesList() {
  return useQuery({
    queryKey: ["series"],
    queryFn: () => apiClient.get<ArticleSeries[]>("/series"),
    staleTime: 30_000,
  });
}

export function useSeriesDetail(id: string | undefined) {
  return useQuery({
    queryKey: ["series", id],
    queryFn: () => apiClient.get<ArticleSeriesDetail>(`/series/${id}`),
    enabled: !!id,
  });
}

export function useCreateSeries() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSeriesInput) => apiClient.post<ArticleSeries>("/series", input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["series"] }),
  });
}

export function useUpdateSeries(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<CreateSeriesInput>) =>
      apiClient.patch<ArticleSeries>(`/series/${id}`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["series"] }),
  });
}

export function useDeleteSeries() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/series/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["series"] }),
  });
}

export function useAssignArticleToSeries() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      articleId,
      seriesId,
      seriesOrder,
    }: {
      articleId: string;
      seriesId: string | null;
      seriesOrder?: number;
    }) => apiClient.patch(`/series/articles/${articleId}`, { seriesId, seriesOrder }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["series"] });
      queryClient.invalidateQueries({ queryKey: ["articles"] });
    },
  });
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type { MediaFile, PaginatedResponse } from "@/lib/types";

export interface MediaFilters {
  page?: number;
  limit?: number;
  type?: string;
  search?: string;
}

function buildQuery(filters: MediaFilters) {
  const params = new URLSearchParams();
  if (filters.page) params.set("page", String(filters.page));
  if (filters.limit) params.set("limit", String(filters.limit));
  if (filters.type) params.set("type", filters.type);
  if (filters.search) params.set("search", filters.search);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function useMediaList(filters: MediaFilters) {
  return useQuery({
    queryKey: ["media-list", filters],
    queryFn: () =>
      apiClient.get<PaginatedResponse<MediaFile>>(`/media${buildQuery(filters)}`),
  });
}

export function useMediaFile(id: string | undefined) {
  return useQuery({
    queryKey: ["media", id],
    queryFn: () => apiClient.get<MediaFile>(`/media/${id}`),
    enabled: !!id,
  });
}

export function useUploadMedia() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder", "articles");
      return apiClient.post<MediaFile>("/media/upload", formData, {
        isFormData: true,
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["media-list"] }),
  });
}

export function useDeleteMedia() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete<MediaFile>(`/media/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["media-list"] }),
  });
}

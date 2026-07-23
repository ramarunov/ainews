import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type { CreatePageInput, PaginatedResponse, Page } from "@/lib/types";

export function usePages() {
  return useQuery({
    queryKey: ["pages"],
    queryFn: () => apiClient.get<PaginatedResponse<Page>>("/pages?limit=100"),
    staleTime: 60_000,
  });
}

export function useCreatePage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePageInput) => apiClient.post<Page>("/pages", input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pages"] }),
  });
}

export function useUpdatePage(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<CreatePageInput>) => apiClient.patch<Page>(`/pages/${id}`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pages"] }),
  });
}

export function useDeletePage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete<Page>(`/pages/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pages"] }),
  });
}

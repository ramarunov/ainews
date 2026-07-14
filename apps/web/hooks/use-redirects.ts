import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type { NotFoundLogEntry, Redirect } from "@/lib/types";

export function useRedirects() {
  return useQuery({
    queryKey: ["redirects"],
    queryFn: () => apiClient.get<Redirect[]>("/seo/redirects"),
    staleTime: 30_000,
  });
}

export function useCreateRedirect() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      fromPath: string;
      toUrl: string;
      statusCode?: number;
      note?: string;
    }) => apiClient.post<Redirect>("/seo/redirects", input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["redirects"] });
      queryClient.invalidateQueries({ queryKey: ["not-found-logs"] });
    },
  });
}

export function useUpdateRedirect() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...input
    }: {
      id: string;
      toUrl?: string;
      statusCode?: number;
      note?: string;
      isActive?: boolean;
    }) => apiClient.patch<Redirect>(`/seo/redirects/${id}`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["redirects"] }),
  });
}

export function useDeleteRedirect() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/seo/redirects/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["redirects"] }),
  });
}

export function useNotFoundLogs() {
  return useQuery({
    queryKey: ["not-found-logs"],
    queryFn: () =>
      apiClient.get<NotFoundLogEntry[]>("/seo/redirects/not-found-logs?resolved=false"),
    staleTime: 15_000,
  });
}

export function useDismissNotFoundLog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.patch(`/seo/redirects/not-found-logs/${id}/dismiss`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["not-found-logs"] }),
  });
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

export function useSetting<T = unknown>(key: string) {
  return useQuery({
    queryKey: ["settings", key],
    queryFn: () => apiClient.get<T | null>(`/settings/${key}`),
  });
}

export function useUpdateSetting(key: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { value: unknown; isPublic?: boolean }) =>
      apiClient.put(`/settings/${key}`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["settings", key] }),
  });
}

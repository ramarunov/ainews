import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type { AdminComment, CommentStatus, PaginatedResponse } from "@/lib/types";

export function useComments(status?: CommentStatus | "ALL", page = 1, limit = 20) {
  return useQuery({
    queryKey: ["comments", status, page, limit],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (status && status !== "ALL") params.set("status", status);
      return apiClient.get<PaginatedResponse<AdminComment>>(`/comments?${params.toString()}`);
    },
    staleTime: 15_000,
  });
}

export function useModerateComment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: CommentStatus }) =>
      apiClient.patch(`/comments/${id}`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["comments"] }),
  });
}

export function useDeleteComment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/comments/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["comments"] }),
  });
}

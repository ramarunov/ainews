import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type { OrgMember, OrgRole, PaginatedResponse } from "@/lib/types";

export interface OrgMemberFilters {
  search?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
}

function buildQuery(filters: OrgMemberFilters) {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.isActive !== undefined) params.set("isActive", String(filters.isActive));
  if (filters.page) params.set("page", String(filters.page));
  if (filters.limit) params.set("limit", String(filters.limit));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function useOrgMembers(filters: OrgMemberFilters) {
  return useQuery({
    queryKey: ["org-members", filters],
    queryFn: () => apiClient.get<PaginatedResponse<OrgMember>>(`/users${buildQuery(filters)}`),
    staleTime: 15_000,
  });
}

export function useOrgRoles() {
  return useQuery({
    queryKey: ["org-roles"],
    queryFn: () => apiClient.get<OrgRole[]>("/organizations/me/roles"),
    staleTime: 60_000,
  });
}

export function useUpdateOrgMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string; firstName?: string; lastName?: string }) =>
      apiClient.patch<OrgMember>(`/users/${id}`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["org-members"] }),
  });
}

export function useDeactivateOrgMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.patch(`/users/${id}/deactivate`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["org-members"] }),
  });
}

export function useReactivateOrgMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.patch(`/users/${id}/reactivate`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["org-members"] }),
  });
}

export function useDeleteOrgMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/users/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["org-members"] }),
  });
}

export function useAssignRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, roleId }: { userId: string; roleId: string }) =>
      apiClient.post(`/users/${userId}/roles`, { roleId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["org-members"] }),
  });
}

export function useRevokeRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, roleId }: { userId: string; roleId: string }) =>
      apiClient.delete(`/users/${userId}/roles/${roleId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["org-members"] }),
  });
}

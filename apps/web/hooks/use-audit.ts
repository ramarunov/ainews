import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type { AuditLogEntry, PaginatedResponse } from "@/lib/types";

export interface AuditFilters {
  page?: number;
  limit?: number;
  entityType?: string;
}

function buildQuery(filters: AuditFilters) {
  const params = new URLSearchParams();
  if (filters.page) params.set("page", String(filters.page));
  if (filters.limit) params.set("limit", String(filters.limit));
  if (filters.entityType) params.set("entityType", filters.entityType);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function useAuditLogs(filters: AuditFilters) {
  return useQuery({
    queryKey: ["audit-logs", filters],
    queryFn: () =>
      apiClient.get<PaginatedResponse<AuditLogEntry>>(
        `/audit-logs${buildQuery(filters)}`,
      ),
  });
}

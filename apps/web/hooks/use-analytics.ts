import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type { AnalyticsDashboard } from "@/lib/types";

export function useAnalyticsDashboard(days: number) {
  return useQuery({
    queryKey: ["analytics-dashboard", days],
    queryFn: () => apiClient.get<AnalyticsDashboard>(`/analytics/dashboard?days=${days}`),
    staleTime: 60_000,
  });
}

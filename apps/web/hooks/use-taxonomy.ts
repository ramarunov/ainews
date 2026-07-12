import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type { Category, PaginatedResponse, Tag } from "@/lib/types";

export function useCategories() {
  return useQuery({
    queryKey: ["categories"],
    queryFn: () =>
      apiClient.get<PaginatedResponse<Category>>(
        "/categories?flat=true&limit=100",
      ),
    staleTime: 60_000,
  });
}

export function useTags() {
  return useQuery({
    queryKey: ["tags"],
    queryFn: () => apiClient.get<PaginatedResponse<Tag>>("/tags?limit=100"),
    staleTime: 60_000,
  });
}

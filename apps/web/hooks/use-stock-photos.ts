import { useMutation } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type { MediaFile, StockPhotoResult } from "@/lib/types";

// Both are user-triggered (search button / pick a result), not reactive
// queries - a mutation-shaped hook fits that better than useQuery here.

export function useSearchStockPhotos() {
  return useMutation({
    mutationFn: (query: string) => {
      const params = new URLSearchParams({ query, perPage: "9" });
      return apiClient.get<StockPhotoResult[]>(`/media/stock-photos/search?${params.toString()}`);
    },
  });
}

export function useAttachStockPhoto() {
  return useMutation({
    mutationFn: (result: Pick<StockPhotoResult, "fullUrl" | "photographer" | "alt">) =>
      apiClient.post<MediaFile>("/media/stock-photos/attach", result),
  });
}

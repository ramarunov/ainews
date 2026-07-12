import { useMutation, useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type { MediaFile } from "@/lib/types";

export function useMediaFile(id: string | undefined) {
  return useQuery({
    queryKey: ["media", id],
    queryFn: () => apiClient.get<MediaFile>(`/media/${id}`),
    enabled: !!id,
  });
}

export function useUploadMedia() {
  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder", "articles");
      return apiClient.post<MediaFile>("/media/upload", formData, {
        isFormData: true,
      });
    },
  });
}

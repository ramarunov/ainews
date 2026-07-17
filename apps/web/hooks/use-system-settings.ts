import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type { AiProviderStatus, MediaProviderStatus } from "@/lib/types";

export interface UpdateAiProviderKeysInput {
  openaiApiKey?: string;
  anthropicApiKey?: string;
  googleAiApiKey?: string;
}

export interface UpdateMediaProviderKeysInput {
  pexelsApiKey?: string;
}

export function useMediaProviderStatus(enabled = true) {
  return useQuery({
    queryKey: ["system-settings", "media-providers"],
    queryFn: () => apiClient.get<MediaProviderStatus>("/system-settings/media-providers"),
    enabled,
  });
}

export function useUpdateMediaProviderKeys() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateMediaProviderKeysInput) =>
      apiClient.put<MediaProviderStatus>("/system-settings/media-providers", input),
    onSuccess: (data) => {
      queryClient.setQueryData(["system-settings", "media-providers"], data);
    },
  });
}

export function useAiProviderStatus(enabled = true) {
  return useQuery({
    queryKey: ["system-settings", "ai-providers"],
    queryFn: () => apiClient.get<AiProviderStatus>("/system-settings/ai-providers"),
    enabled,
  });
}

export function useUpdateAiProviderKeys() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateAiProviderKeysInput) =>
      apiClient.put<AiProviderStatus>("/system-settings/ai-providers", input),
    onSuccess: (data) => {
      queryClient.setQueryData(["system-settings", "ai-providers"], data);
    },
  });
}

export function useAiServicesEnabled(enabled = true) {
  return useQuery({
    queryKey: ["system-settings", "ai-services-enabled"],
    queryFn: () => apiClient.get<{ enabled: boolean }>("/system-settings/ai-services-enabled"),
    enabled,
  });
}

export function useSetAiServicesEnabled() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) =>
      apiClient.put<{ enabled: boolean }>("/system-settings/ai-services-enabled", { enabled }),
    onSuccess: (data) => {
      queryClient.setQueryData(["system-settings", "ai-services-enabled"], data);
    },
  });
}

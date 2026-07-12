import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type { AiProviderStatus } from "@/lib/types";

export interface UpdateAiProviderKeysInput {
  openaiApiKey?: string;
  anthropicApiKey?: string;
  googleAiApiKey?: string;
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

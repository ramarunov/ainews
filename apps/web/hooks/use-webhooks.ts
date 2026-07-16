import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type {
  CreatedWebhook,
  CreateWebhookInput,
  PaginatedResponse,
  UpdateWebhookInput,
  Webhook,
  WebhookDelivery,
} from "@/lib/types";

export function useWebhooks() {
  return useQuery({
    queryKey: ["webhooks"],
    queryFn: () => apiClient.get<Webhook[]>("/webhooks"),
  });
}

export function useCreateWebhook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateWebhookInput) =>
      apiClient.post<CreatedWebhook>("/webhooks", input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["webhooks"] }),
  });
}

export function useUpdateWebhook(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateWebhookInput) =>
      apiClient.patch<Webhook>(`/webhooks/${id}`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["webhooks"] }),
  });
}

export function useDeleteWebhook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete<{ success: boolean }>(`/webhooks/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["webhooks"] }),
  });
}

export function useWebhookDeliveries(webhookId: string | null) {
  return useQuery({
    queryKey: ["webhooks", webhookId, "deliveries"],
    queryFn: () =>
      apiClient.get<PaginatedResponse<WebhookDelivery>>(`/webhooks/${webhookId}/deliveries`),
    enabled: !!webhookId,
  });
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type { MfaSetupResponse } from "@/lib/types";

export function useMfaStatus() {
  return useQuery({
    queryKey: ["mfa-status"],
    queryFn: () => apiClient.get<{ enabled: boolean }>("/auth/mfa/status"),
  });
}

export function useSetupMfa() {
  return useMutation({
    mutationFn: () => apiClient.post<MfaSetupResponse>("/auth/mfa/setup"),
  });
}

export function useEnableMfa() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (token: string) =>
      apiClient.post<{ backupCodes: string[] }>("/auth/mfa/enable", { token }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mfa-status"] }),
  });
}

export function useDisableMfa() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (password: string) =>
      apiClient.post<{ disabled: boolean }>("/auth/mfa/disable", { password }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mfa-status"] }),
  });
}

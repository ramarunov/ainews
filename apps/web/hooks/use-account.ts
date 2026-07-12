import { useMutation } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

export function useExportMyData() {
  return useMutation({
    mutationFn: () => apiClient.get<unknown>("/users/me/export"),
  });
}

export function useEraseMyAccount() {
  return useMutation({
    mutationFn: (password?: string) =>
      apiClient.post<{ success: boolean; message: string }>("/users/me/erase", {
        password,
      }),
  });
}

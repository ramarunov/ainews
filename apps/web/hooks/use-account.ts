import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/lib/auth-store";
import type { AuthUser, MyProfile } from "@/lib/types";

export interface UpdateProfileInput {
  firstName?: string;
  lastName?: string;
  displayName?: string;
  bio?: string;
  avatarUrl?: string;
  timezone?: string;
  locale?: string;
}

// The login response (AuthUser, kept in the auth store) is deliberately
// slim - no bio/timezone/locale - so the profile form needs the real
// `/users/me` row to show current values correctly on first load instead
// of blank fields.
export function useMyProfile() {
  return useQuery({
    queryKey: ["my-profile"],
    queryFn: () => apiClient.get<MyProfile>("/users/me"),
    staleTime: 15_000,
  });
}

function useSyncProfileToSession() {
  const queryClient = useQueryClient();
  const updateUser = useAuthStore((s) => s.updateUser);
  const currentUser = useAuthStore((s) => s.user);

  return (updated: MyProfile) => {
    queryClient.setQueryData(["my-profile"], updated);
    // The auth store's slim AuthUser only needs the fields it actually
    // declares (name/avatar) kept in sync, for the sidebar/header - merge
    // onto it rather than replacing, so `permissions`/`organizationId`
    // (not present in this response) survive.
    if (currentUser) {
      updateUser({
        ...currentUser,
        firstName: updated.firstName,
        lastName: updated.lastName,
        displayName: updated.displayName,
        avatarUrl: updated.avatarUrl,
      } as AuthUser);
    }
  };
}

export function useUpdateMyProfile() {
  const syncSession = useSyncProfileToSession();

  return useMutation({
    mutationFn: (input: UpdateProfileInput) => apiClient.patch<MyProfile>("/users/me", input),
    onSuccess: syncSession,
  });
}

export function useUploadMyAvatar() {
  const syncSession = useSyncProfileToSession();

  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      return apiClient.post<MyProfile>("/users/me/avatar", formData, { isFormData: true });
    },
    onSuccess: syncSession,
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (input: { currentPassword: string; newPassword: string }) =>
      apiClient.post<{ message: string }>("/auth/change-password", input),
  });
}

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

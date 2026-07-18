import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type {
  CustomScriptsSetting,
  HomepageSeoSetting,
  HomepageWidgetsSetting,
  SiteBrandingSetting,
  SiteFooterSetting,
} from "@/lib/types";

export function useSiteFooter(enabled = true) {
  return useQuery({
    queryKey: ["site-settings", "footer"],
    queryFn: () => apiClient.get<SiteFooterSetting | null>("/site-settings/footer"),
    enabled,
  });
}

export function useUpdateSiteFooter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SiteFooterSetting) =>
      apiClient.put<SiteFooterSetting>("/site-settings/footer", input),
    onSuccess: (data) => queryClient.setQueryData(["site-settings", "footer"], data),
  });
}

export function useHomepageWidgets(enabled = true) {
  return useQuery({
    queryKey: ["site-settings", "homepage-widgets"],
    queryFn: () =>
      apiClient.get<HomepageWidgetsSetting | null>("/site-settings/homepage-widgets"),
    enabled,
  });
}

export function useUpdateHomepageWidgets() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: HomepageWidgetsSetting) =>
      apiClient.put<HomepageWidgetsSetting>("/site-settings/homepage-widgets", input),
    onSuccess: (data) => queryClient.setQueryData(["site-settings", "homepage-widgets"], data),
  });
}

export function useHomepageSeo(enabled = true) {
  return useQuery({
    queryKey: ["site-settings", "homepage-seo"],
    queryFn: () => apiClient.get<HomepageSeoSetting | null>("/site-settings/homepage-seo"),
    enabled,
  });
}

export function useUpdateHomepageSeo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: HomepageSeoSetting) =>
      apiClient.put<HomepageSeoSetting>("/site-settings/homepage-seo", input),
    onSuccess: (data) => queryClient.setQueryData(["site-settings", "homepage-seo"], data),
  });
}

export function useCustomScripts(enabled = true) {
  return useQuery({
    queryKey: ["site-settings", "custom-scripts"],
    queryFn: () => apiClient.get<CustomScriptsSetting | null>("/site-settings/custom-scripts"),
    enabled,
  });
}

export function useUpdateCustomScripts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CustomScriptsSetting) =>
      apiClient.put<CustomScriptsSetting>("/site-settings/custom-scripts", input),
    onSuccess: (data) => queryClient.setQueryData(["site-settings", "custom-scripts"], data),
  });
}

export function useSiteBranding(enabled = true) {
  return useQuery({
    queryKey: ["site-settings", "branding"],
    queryFn: () => apiClient.get<SiteBrandingSetting | null>("/site-settings/branding"),
    enabled,
  });
}

export function useUpdateSiteBranding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SiteBrandingSetting) =>
      apiClient.put<SiteBrandingSetting>("/site-settings/branding", input),
    onSuccess: (data) => queryClient.setQueryData(["site-settings", "branding"], data),
  });
}

// Unauthenticated variant for places that render before/without a session
// (login page, the dashboard shell before the auth check resolves) - reads
// through the public settings endpoint rather than the superadmin-gated one.
export function usePublicBranding() {
  return useQuery({
    queryKey: ["public-settings", "branding"],
    queryFn: async () => {
      const settings = await apiClient.get<{ key: string; value: unknown }[]>(
        "/public/settings",
        { skipAuth: true },
      );
      return (
        (settings.find((s) => s.key === "site.branding")?.value as
          | SiteBrandingSetting
          | undefined) ?? null
      );
    },
    staleTime: 5 * 60 * 1000,
  });
}

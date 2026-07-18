import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type {
  CustomScriptsSetting,
  HomepageSeoSetting,
  HomepageWidgetsSetting,
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

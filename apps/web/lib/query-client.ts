import { QueryClient } from "@tanstack/react-query";

// A module-level singleton (rather than one created inside a component) so
// that non-component code — clearSession() in auth-store.ts — can clear
// cached query data on logout. Without this, TanStack Query's cache is keyed
// only by filters (e.g. ["articles", {page:1}]), not by user/org, so a
// second user logging in on the same browser session would see the first
// user's org-scoped data until each query happened to refetch.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 10_000 },
  },
});

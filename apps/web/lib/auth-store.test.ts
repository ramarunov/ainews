import { describe, it, expect, beforeEach, vi } from "vitest";
import { useAuthStore, hasPermission } from "./auth-store";
import { queryClient } from "./query-client";

const STORAGE_KEY = "ainews-auth";

const sampleUser = {
  id: "user-1",
  email: "jane@example.com",
  organizationId: "org-1",
  permissions: ["articles:read", "articles:write"],
};

describe("hasPermission", () => {
  it("returns false for a null user", () => {
    expect(hasPermission(null, "articles:read")).toBe(false);
  });

  it("returns true when the permission is present", () => {
    expect(hasPermission(sampleUser, "articles:read")).toBe(true);
  });

  it("returns false when the permission is absent", () => {
    expect(hasPermission(sampleUser, "users:delete")).toBe(false);
  });
});

describe("useAuthStore", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useAuthStore.setState({ accessToken: null, refreshToken: null, user: null });
  });

  it("setSession persists to localStorage and updates state", () => {
    useAuthStore.getState().setSession({
      accessToken: "access-1",
      refreshToken: "refresh-1",
      user: sampleUser,
    });

    expect(useAuthStore.getState().accessToken).toBe("access-1");
    expect(useAuthStore.getState().user).toEqual(sampleUser);

    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY)!);
    expect(stored.accessToken).toBe("access-1");
    expect(stored.user).toEqual(sampleUser);
  });

  it("setSession clears the query cache - preventing cross-user data leakage", () => {
    const clearSpy = vi.spyOn(queryClient, "clear");

    useAuthStore.getState().setSession({
      accessToken: "access-1",
      refreshToken: "refresh-1",
      user: sampleUser,
    });

    expect(clearSpy).toHaveBeenCalledTimes(1);
    clearSpy.mockRestore();
  });

  it("clearSession wipes state, localStorage, and the query cache", () => {
    useAuthStore.getState().setSession({
      accessToken: "access-1",
      refreshToken: "refresh-1",
      user: sampleUser,
    });
    const clearSpy = vi.spyOn(queryClient, "clear");

    useAuthStore.getState().clearSession();

    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(clearSpy).toHaveBeenCalledTimes(1);
    clearSpy.mockRestore();
  });
});

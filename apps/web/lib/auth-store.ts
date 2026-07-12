import { create } from "zustand";
import { queryClient } from "./query-client";
import type { AuthUser } from "./types";

const STORAGE_KEY = "ainews-auth";

interface PersistedSession {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
}

interface AuthState extends PersistedSession {
  setSession: (session: {
    accessToken: string;
    refreshToken: string;
    user: AuthUser;
  }) => void;
  clearSession: () => void;
}

// Reads localStorage synchronously so the very first client render already
// has the real session — no async "rehydration" step, and therefore no
// window where an auth guard can see a false `null` and bounce a logged-in
// user to /login (zustand's `persist` middleware hydrates asynchronously
// and caused exactly that race).
function loadSession(): PersistedSession {
  if (typeof window === "undefined") {
    return { accessToken: null, refreshToken: null, user: null };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { accessToken: null, refreshToken: null, user: null };
    const parsed = JSON.parse(raw);
    return {
      accessToken: parsed.accessToken ?? null,
      refreshToken: parsed.refreshToken ?? null,
      user: parsed.user ?? null,
    };
  } catch {
    return { accessToken: null, refreshToken: null, user: null };
  }
}

function saveSession(session: PersistedSession) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export const useAuthStore = create<AuthState>()((set) => ({
  ...loadSession(),
  setSession: ({ accessToken, refreshToken, user }) => {
    // Query cache is keyed by filters, not by user/org — always drop it
    // when the identity behind the session changes (login, or a different
    // user signing in without explicitly logging out first) so cached data
    // from a previous session's org can never leak into this one.
    queryClient.clear();
    set({ accessToken, refreshToken, user });
    saveSession({ accessToken, refreshToken, user });
  },
  clearSession: () => {
    queryClient.clear();
    set({ accessToken: null, refreshToken: null, user: null });
    if (typeof window !== "undefined") window.localStorage.removeItem(STORAGE_KEY);
  },
}));

export function hasPermission(user: AuthUser | null, permission: string) {
  return user?.permissions.includes(permission) ?? false;
}

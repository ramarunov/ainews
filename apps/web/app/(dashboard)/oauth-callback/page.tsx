"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { useAuthStore } from "@/lib/auth-store";
import type { AuthUser } from "@/lib/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

function OauthCallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setSession = useAuthStore((s) => s.setSession);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const accessToken = searchParams.get("accessToken");
  const refreshToken = searchParams.get("refreshToken");
  const missingTokens = !accessToken || !refreshToken;

  useEffect(() => {
    // Derived directly from render above, not set as state in the effect -
    // nothing to fetch without both tokens.
    if (missingTokens) return;

    // The callback only carries tokens (a full user profile in a redirect
    // URL is both ugly and a data-exposure smell) - fetch it the same way
    // any other authenticated request would, then build the session.
    fetch(`${API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load user profile");
        return res.json() as Promise<AuthUser>;
      })
      .then((user) => {
        setSession({ accessToken, refreshToken, user });
        router.replace("/articles");
      })
      .catch(() => setFetchError("Failed to complete sign-in"));
    // Runs once on mount - re-running on searchParams/router identity
    // changes would refetch with the same tokens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const error = missingTokens ? "Missing tokens in OAuth callback" : fetchError;

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center px-4">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4">
      <p className="text-sm text-muted-foreground">Signing you in…</p>
    </div>
  );
}

export default function OauthCallbackPage() {
  return (
    <Suspense fallback={null}>
      <OauthCallbackHandler />
    </Suspense>
  );
}

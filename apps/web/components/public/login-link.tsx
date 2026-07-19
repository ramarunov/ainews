"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuthStore } from "@/lib/auth-store";

// Shared by the public header and footer - the auth store reads localStorage
// synchronously, so the very first client render already "knows" whether a
// session exists, but the server-rendered HTML never can. Gating on
// `mounted` keeps the first client paint identical to the server's (always
// "Login Redaksi" -> /login) and only swaps to the real destination after
// that, avoiding a hydration mismatch.
export function LoginLink({ className }: { className?: string }) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- standard client-mount detection for hydration-safe rendering
  useEffect(() => setMounted(true), []);
  const isLoggedIn = mounted && !!accessToken;

  return (
    <Link href={isLoggedIn ? "/articles" : "/login"} className={className}>
      {isLoggedIn ? "Dashboard Redaksi" : "Login Redaksi"}
    </Link>
  );
}

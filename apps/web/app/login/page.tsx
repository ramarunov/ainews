"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { apiClient, ApiError } from "@/lib/api-client";
import { useAuthStore } from "@/lib/auth-store";
import { SITE_NAME } from "@/lib/brand";
import type { AuthResponse, LoginResponse } from "@/lib/types";

const loginSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);
  const [submitting, setSubmitting] = useState(false);
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });

  const onSubmit = async (values: LoginForm) => {
    setSubmitting(true);
    try {
      const res = await apiClient.post<LoginResponse>("/auth/login", values, {
        skipAuth: true,
      });
      if ("mfaRequired" in res) {
        setChallengeToken(res.challengeToken);
        return;
      }
      setSession(res);
      router.push("/articles");
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Login failed";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const onSubmitMfaCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!challengeToken) return;
    setSubmitting(true);
    try {
      const res = await apiClient.post<AuthResponse>(
        "/auth/mfa/verify-login",
        { challengeToken, code: mfaCode },
        { skipAuth: true },
      );
      setSession(res);
      router.push("/articles");
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Invalid code";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (challengeToken) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 bg-muted/40 px-4">
        <Image
          src="/brand/logo.png"
          alt={SITE_NAME}
          width={1606}
          height={433}
          unoptimized
          priority
          className="h-10 w-auto"
        />
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Two-factor verification</CardTitle>
            <CardDescription>
              Enter the 6-digit code from your authenticator app, or a backup code.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmitMfaCode} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="mfa-code">Code</Label>
                <Input
                  id="mfa-code"
                  autoComplete="one-time-code"
                  autoFocus
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value)}
                />
              </div>
              <Button type="submit" disabled={submitting || !mfaCode}>
                {submitting ? "Verifying…" : "Verify"}
              </Button>
              <button
                type="button"
                className="text-xs text-muted-foreground underline underline-offset-4"
                onClick={() => {
                  setChallengeToken(null);
                  setMfaCode("");
                }}
              >
                Back to login
              </button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 bg-muted/40 px-4">
      <Image
        src="/brand/logo.png"
        alt={SITE_NAME}
        width={1606}
        height={433}
        unoptimized
        priority
        className="h-10 w-auto"
      />
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>BeritaBot CMS — editorial dashboard</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                {...register("email")}
              />
              {errors.email && (
                <p className="text-sm text-destructive">{errors.email.message}</p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link
                  href="/forgot-password"
                  className="text-xs text-muted-foreground underline underline-offset-4"
                >
                  Forgot password?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                {...register("password")}
              />
              {errors.password && (
                <p className="text-sm text-destructive">
                  {errors.password.message}
                </p>
              )}
            </div>
            <Button type="submit" disabled={submitting} className="mt-2">
              {submitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

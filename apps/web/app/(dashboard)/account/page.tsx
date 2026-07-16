"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, Trash2, ShieldCheck, ShieldOff } from "lucide-react";

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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useEraseMyAccount, useExportMyData } from "@/hooks/use-account";
import {
  useMfaStatus,
  useSetupMfa,
  useEnableMfa,
  useDisableMfa,
} from "@/hooks/use-mfa";
import { useAuthStore } from "@/lib/auth-store";
import { ApiError } from "@/lib/api-client";
import type { MfaSetupResponse } from "@/lib/types";

export default function AccountPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const clearSession = useAuthStore((s) => s.clearSession);

  const exportData = useExportMyData();
  const eraseAccount = useEraseMyAccount();
  const mfaStatus = useMfaStatus();
  const setupMfa = useSetupMfa();
  const enableMfa = useEnableMfa();
  const disableMfa = useDisableMfa();

  const [eraseDialogOpen, setEraseDialogOpen] = useState(false);
  const [password, setPassword] = useState("");

  const [mfaSetup, setMfaSetup] = useState<MfaSetupResponse | null>(null);
  const [mfaToken, setMfaToken] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [disableDialogOpen, setDisableDialogOpen] = useState(false);
  const [disablePassword, setDisablePassword] = useState("");

  const handleStartMfaSetup = async () => {
    try {
      const result = await setupMfa.mutateAsync();
      setMfaSetup(result);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to start MFA setup");
    }
  };

  const handleConfirmMfaEnable = async () => {
    try {
      const result = await enableMfa.mutateAsync(mfaToken);
      setBackupCodes(result.backupCodes);
      setMfaSetup(null);
      setMfaToken("");
      toast.success("Two-factor authentication enabled");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Invalid code");
    }
  };

  const handleDisableMfa = async () => {
    try {
      await disableMfa.mutateAsync(disablePassword);
      toast.success("Two-factor authentication disabled");
      setDisableDialogOpen(false);
      setDisablePassword("");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Incorrect password");
    }
  };

  const handleExport = async () => {
    try {
      const data = await exportData.mutateAsync();
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "my-data-export.json";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Your data export has downloaded");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Export failed");
    }
  };

  const handleErase = async () => {
    try {
      await eraseAccount.mutateAsync(password || undefined);
      toast.success("Your account has been erased");
      clearSession();
      router.replace("/login");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erasure failed");
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Account &amp; Privacy</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {user?.displayName ?? user?.email}
          <br />
          {user?.email}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Two-factor authentication</CardTitle>
          <CardDescription>
            Require a code from an authenticator app (or a backup code) in
            addition to your password when signing in.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {mfaStatus.isLoading && (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}

          {!mfaStatus.isLoading && mfaSetup && (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                Scan this QR code with your authenticator app, then enter the
                6-digit code it generates.
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={mfaSetup.qrCodeUrl}
                alt="MFA QR code"
                className="h-40 w-40 rounded-md border"
              />
              <p className="text-xs text-muted-foreground">
                Can&apos;t scan it? Enter this code manually: <code>{mfaSetup.secret}</code>
              </p>
              <div className="flex flex-col gap-2">
                <Label htmlFor="mfa-enable-token">6-digit code</Label>
                <Input
                  id="mfa-enable-token"
                  autoFocus
                  value={mfaToken}
                  onChange={(e) => setMfaToken(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleConfirmMfaEnable}
                  disabled={enableMfa.isPending || mfaToken.length !== 6}
                >
                  {enableMfa.isPending ? "Verifying…" : "Confirm and enable"}
                </Button>
                <Button variant="outline" onClick={() => setMfaSetup(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {!mfaStatus.isLoading && !mfaSetup && backupCodes && (
            <div className="flex flex-col gap-3">
              <p className="text-sm font-medium">
                Save these backup codes somewhere safe. Each one can be used
                once if you lose access to your authenticator app.
              </p>
              <div className="grid grid-cols-2 gap-2 rounded-md border bg-muted/40 p-3 font-mono text-sm">
                {backupCodes.map((code) => (
                  <span key={code}>{code}</span>
                ))}
              </div>
              <Button onClick={() => setBackupCodes(null)} className="self-start">
                Done
              </Button>
            </div>
          )}

          {!mfaStatus.isLoading && !mfaSetup && !backupCodes && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                {mfaStatus.data?.enabled ? (
                  <>
                    <ShieldCheck className="h-4 w-4 text-emerald-600" />
                    Enabled
                  </>
                ) : (
                  <>
                    <ShieldOff className="h-4 w-4 text-muted-foreground" />
                    Not enabled
                  </>
                )}
              </div>
              {mfaStatus.data?.enabled ? (
                <Button variant="outline" onClick={() => setDisableDialogOpen(true)}>
                  Disable
                </Button>
              ) : (
                <Button onClick={handleStartMfaSetup} disabled={setupMfa.isPending}>
                  {setupMfa.isPending ? "Starting…" : "Enable two-factor authentication"}
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Export your data</CardTitle>
          <CardDescription>
            Download a JSON copy of your profile, authored articles, uploaded
            media, and recent activity.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleExport} disabled={exportData.isPending}>
            <Download className="h-4 w-4" />
            {exportData.isPending ? "Preparing…" : "Export my data"}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-base text-destructive">Delete account</CardTitle>
          <CardDescription>
            Permanently anonymizes your profile and revokes all sessions. This
            cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" onClick={() => setEraseDialogOpen(true)}>
            <Trash2 className="h-4 w-4" />
            Delete my account
          </Button>
        </CardContent>
      </Card>

      <Dialog open={eraseDialogOpen} onOpenChange={setEraseDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm account deletion</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="erase-password">Enter your password to confirm</Label>
            <Input
              id="erase-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              variant="destructive"
              onClick={handleErase}
              disabled={eraseAccount.isPending}
            >
              {eraseAccount.isPending ? "Deleting…" : "Permanently delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={disableDialogOpen} onOpenChange={setDisableDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disable two-factor authentication</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="disable-mfa-password">Enter your password to confirm</Label>
            <Input
              id="disable-mfa-password"
              type="password"
              value={disablePassword}
              onChange={(e) => setDisablePassword(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              variant="destructive"
              onClick={handleDisableMfa}
              disabled={disableMfa.isPending}
            >
              {disableMfa.isPending ? "Disabling…" : "Disable"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

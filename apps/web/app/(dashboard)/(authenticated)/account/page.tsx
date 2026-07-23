"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Download, Trash2, ShieldCheck, ShieldOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import {
  useChangePassword,
  useEraseMyAccount,
  useExportMyData,
  useMyProfile,
  useUpdateMyProfile,
  useUploadMyAvatar,
} from "@/hooks/use-account";
import {
  useMfaStatus,
  useSetupMfa,
  useEnableMfa,
  useDisableMfa,
} from "@/hooks/use-mfa";
import { useAuthStore } from "@/lib/auth-store";
import { ApiError } from "@/lib/api-client";
import type { MfaSetupResponse } from "@/lib/types";

const profileSchema = z.object({
  firstName: z.string().max(100).optional().or(z.literal("")),
  lastName: z.string().max(100).optional().or(z.literal("")),
  displayName: z.string().max(200).optional().or(z.literal("")),
  bio: z.string().max(2000).optional().or(z.literal("")),
  timezone: z.string().max(100).optional().or(z.literal("")),
  locale: z.string().max(20).optional().or(z.literal("")),
});
type ProfileFormValues = z.infer<typeof profileSchema>;

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Required"),
    newPassword: z.string().min(12, "At least 12 characters"),
    confirmPassword: z.string().min(1, "Required"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });
type PasswordFormValues = z.infer<typeof passwordSchema>;

function ProfileCard() {
  const { data: profile, isLoading } = useMyProfile();
  const updateProfile = useUpdateMyProfile();
  const uploadAvatar = useUploadMyAvatar();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { isDirty },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    values: {
      firstName: profile?.firstName ?? "",
      lastName: profile?.lastName ?? "",
      displayName: profile?.displayName ?? "",
      bio: profile?.bio ?? "",
      timezone: profile?.timezone ?? "",
      locale: profile?.locale ?? "",
    },
  });

  const onSubmit = async (values: ProfileFormValues) => {
    try {
      await updateProfile.mutateAsync(values);
      toast.success("Profile updated");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to update profile");
    }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarUploading(true);
    try {
      await uploadAvatar.mutateAsync(file);
      toast.success("Avatar updated");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to upload avatar");
    } finally {
      setAvatarUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const initial = (profile?.displayName ?? profile?.email ?? "?").charAt(0).toUpperCase();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading…</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Profile</CardTitle>
        <CardDescription>
          Your name and bio are visible to other members of your organization.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex items-center gap-4">
          {profile?.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.avatarUrl}
              alt=""
              className="h-16 w-16 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-xl font-black text-primary-foreground">
              {initial}
            </div>
          )}
          <div className="flex flex-col gap-1">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarChange}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={avatarUploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {avatarUploading ? "Uploading…" : "Change avatar"}
            </Button>
            <p className="text-xs text-muted-foreground">{profile?.email}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="profile-first-name">First name</Label>
              <Input id="profile-first-name" {...register("firstName")} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="profile-last-name">Last name</Label>
              <Input id="profile-last-name" {...register("lastName")} />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="profile-display-name">Display name</Label>
            <Input id="profile-display-name" {...register("displayName")} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="profile-bio">Bio</Label>
            <Textarea id="profile-bio" rows={3} {...register("bio")} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="profile-timezone">Timezone</Label>
              <Input id="profile-timezone" placeholder="Asia/Jakarta" {...register("timezone")} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="profile-locale">Locale</Label>
              <Input id="profile-locale" placeholder="id" {...register("locale")} />
            </div>
          </div>
          <Button type="submit" disabled={!isDirty || updateProfile.isPending} className="self-start">
            {updateProfile.isPending ? "Saving…" : "Save changes"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function ChangePasswordCard() {
  const changePassword = useChangePassword();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  const onSubmit = async (values: PasswordFormValues) => {
    try {
      await changePassword.mutateAsync({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      toast.success("Password changed — you'll need to sign in again on other devices");
      reset();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to change password");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Change password</CardTitle>
        <CardDescription>Changing your password signs you out everywhere else.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="flex max-w-sm flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="current-password">Current password</Label>
            <Input id="current-password" type="password" {...register("currentPassword")} />
            {errors.currentPassword && (
              <p className="text-sm text-destructive">{errors.currentPassword.message}</p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-password">New password</Label>
            <Input id="new-password" type="password" {...register("newPassword")} />
            {errors.newPassword && (
              <p className="text-sm text-destructive">{errors.newPassword.message}</p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="confirm-password">Confirm new password</Label>
            <Input id="confirm-password" type="password" {...register("confirmPassword")} />
            {errors.confirmPassword && (
              <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>
            )}
          </div>
          <Button type="submit" disabled={changePassword.isPending} className="self-start">
            {changePassword.isPending ? "Changing…" : "Change password"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export default function AccountPage() {
  const router = useRouter();
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

      <ProfileCard />
      <ChangePasswordCard />

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

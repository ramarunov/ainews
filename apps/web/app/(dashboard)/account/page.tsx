"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, Trash2 } from "lucide-react";

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
import { useAuthStore } from "@/lib/auth-store";
import { ApiError } from "@/lib/api-client";

export default function AccountPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const clearSession = useAuthStore((s) => s.clearSession);

  const exportData = useExportMyData();
  const eraseAccount = useEraseMyAccount();

  const [eraseDialogOpen, setEraseDialogOpen] = useState(false);
  const [password, setPassword] = useState("");

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
    </div>
  );
}

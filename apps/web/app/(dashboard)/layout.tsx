"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Newspaper, FolderTree, Tags, Image as ImageIcon, Search, History, UserCircle, LogOut, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { hasPermission, useAuthStore } from "@/lib/auth-store";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/articles", label: "Articles", icon: Newspaper },
  { href: "/categories", label: "Categories", icon: FolderTree },
  { href: "/tags", label: "Tags", icon: Tags },
  { href: "/media", label: "Media", icon: ImageIcon },
  { href: "/search", label: "Search", icon: Search },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const clearSession = useAuthStore((s) => s.clearSession);
  // The static shell is prerendered with no session; delay rendering
  // auth-dependent content until after the first client-only effect so
  // that render matches the server output and React doesn't have to
  // discard/regenerate the tree (a "hydration mismatch" warning).
  const [mounted, setMounted] = useState(false);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- standard client-mount detection for hydration-safe rendering
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (mounted && !accessToken) {
      router.replace("/login");
    }
  }, [mounted, accessToken, router]);

  if (!mounted || !accessToken) return null;

  return (
    <div className="flex flex-1">
      <aside className="flex w-64 flex-col border-r bg-muted/20">
        <div className="border-b px-6 py-4">
          <p className="font-semibold">AI News CMS</p>
          <p className="truncate text-xs text-muted-foreground">
            {user?.displayName ?? user?.email}
          </p>
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-muted",
                pathname.startsWith(href) && "bg-muted text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
          {hasPermission(user, "audit:read") && (
            <Link
              href="/activity"
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-muted",
                pathname.startsWith("/activity") && "bg-muted text-foreground",
              )}
            >
              <History className="h-4 w-4" />
              Activity
            </Link>
          )}
          {user?.isSuperadmin && (
            <Link
              href="/system-settings"
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-muted",
                pathname.startsWith("/system-settings") && "bg-muted text-foreground",
              )}
            >
              <ShieldCheck className="h-4 w-4" />
              System Settings
            </Link>
          )}
        </nav>
        <div className="flex flex-col gap-1 border-t p-3">
          <Link
            href="/account"
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-muted",
              pathname.startsWith("/account") && "bg-muted text-foreground",
            )}
          >
            <UserCircle className="h-4 w-4" />
            Account
          </Link>
          <Button
            variant="ghost"
            className="w-full justify-start gap-2"
            onClick={() => {
              clearSession();
              router.replace("/login");
            }}
          >
            <LogOut className="h-4 w-4" />
            Log out
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto p-8">{children}</main>
    </div>
  );
}

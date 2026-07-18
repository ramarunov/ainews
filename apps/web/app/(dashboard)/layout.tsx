"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Newspaper, FolderTree, Tags, Layers, Image as ImageIcon, Search, History, UserCircle, LogOut, ShieldCheck, Globe, KanbanSquare, Radio, BarChart3, Users, Link2, KeyRound, CalendarDays, Webhook, MessageSquare } from "lucide-react";

import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/notification-bell";
import { hasPermission, useAuthStore } from "@/lib/auth-store";
import { cn } from "@/lib/utils";
import { SITE_NAME } from "@/lib/brand";

const navItems = [
  { href: "/articles", label: "Articles", icon: Newspaper },
  { href: "/categories", label: "Categories", icon: FolderTree },
  { href: "/tags", label: "Tags", icon: Tags },
  { href: "/series", label: "Series", icon: Layers },
  { href: "/media", label: "Media", icon: ImageIcon },
  { href: "/article-search", label: "Search", icon: Search },
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
        <div className="flex items-center justify-between gap-2 border-b px-6 py-4">
          <div className="min-w-0">
            <Image
              src="/brand/logo.png"
              alt={SITE_NAME}
              width={1606}
              height={433}
              unoptimized
              className="h-7 w-auto"
            />
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {user?.displayName ?? user?.email}
            </p>
          </div>
          <NotificationBell />
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
          {hasPermission(user, "workflow:read") && (
            <Link
              href="/workflow"
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-muted",
                pathname.startsWith("/workflow") && "bg-muted text-foreground",
              )}
            >
              <KanbanSquare className="h-4 w-4" />
              Workflow
            </Link>
          )}
          {hasPermission(user, "articles:read") && (
            <Link
              href="/calendar"
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-muted",
                pathname.startsWith("/calendar") && "bg-muted text-foreground",
              )}
            >
              <CalendarDays className="h-4 w-4" />
              Calendar
            </Link>
          )}
          {hasPermission(user, "news:read") && (
            <Link
              href="/news-intelligence"
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-muted",
                pathname.startsWith("/news-intelligence") && "bg-muted text-foreground",
              )}
            >
              <Radio className="h-4 w-4" />
              News Intelligence
            </Link>
          )}
          {hasPermission(user, "analytics:read") && (
            <Link
              href="/analytics"
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-muted",
                pathname.startsWith("/analytics") && "bg-muted text-foreground",
              )}
            >
              <BarChart3 className="h-4 w-4" />
              Analytics
            </Link>
          )}
          {hasPermission(user, "articles:read") && (
            <Link
              href="/redirects"
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-muted",
                pathname.startsWith("/redirects") && "bg-muted text-foreground",
              )}
            >
              <Link2 className="h-4 w-4" />
              Redirects
            </Link>
          )}
          {hasPermission(user, "users:read") && (
            <Link
              href="/users"
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-muted",
                pathname.startsWith("/users") && "bg-muted text-foreground",
              )}
            >
              <Users className="h-4 w-4" />
              Users
            </Link>
          )}
          {hasPermission(user, "settings:read") && (
            <Link
              href="/api-keys"
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-muted",
                pathname.startsWith("/api-keys") && "bg-muted text-foreground",
              )}
            >
              <KeyRound className="h-4 w-4" />
              API Keys
            </Link>
          )}
          {hasPermission(user, "webhooks:read") && (
            <Link
              href="/webhooks"
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-muted",
                pathname.startsWith("/webhooks") && "bg-muted text-foreground",
              )}
            >
              <Webhook className="h-4 w-4" />
              Webhooks
            </Link>
          )}
          {hasPermission(user, "comments:read") && (
            <Link
              href="/comments"
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-muted",
                pathname.startsWith("/comments") && "bg-muted text-foreground",
              )}
            >
              <MessageSquare className="h-4 w-4" />
              Comments
            </Link>
          )}
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
          {user?.isSuperadmin && (
            <Link
              href="/site-settings"
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-muted",
                pathname.startsWith("/site-settings") && "bg-muted text-foreground",
              )}
            >
              <Globe className="h-4 w-4" />
              Site Settings
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

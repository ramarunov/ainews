"use client";

import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  useNotifications,
  useUnreadNotificationCount,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
} from "@/hooks/use-notifications";
import type { Notification } from "@/lib/types";
import { cn } from "@/lib/utils";

export function NotificationBell() {
  const router = useRouter();
  const { data: unread } = useUnreadNotificationCount();
  const { data: notifications } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const count = unread?.count ?? 0;

  const handleClick = async (notification: Notification) => {
    if (!notification.readAt) {
      markRead.mutate(notification.id);
    }
    if (notification.data?.articleId) {
      router.push(`/articles/${notification.data.articleId}`);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "relative")}
      >
        <Bell className="h-4 w-4" />
        {count > 0 && (
          <span className="absolute top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between px-2 py-1.5">
          <p className="text-xs font-medium text-muted-foreground">Notifications</p>
          {count > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto p-0 text-xs"
              onClick={() => markAllRead.mutate()}
            >
              Mark all read
            </Button>
          )}
        </div>
        <DropdownMenuSeparator />
        {(!notifications || notifications.data.length === 0) && (
          <p className="px-2 py-4 text-center text-sm text-muted-foreground">
            No notifications yet.
          </p>
        )}
        <div className="max-h-96 overflow-y-auto">
          {notifications?.data.map((notification) => (
            <DropdownMenuItem
              key={notification.id}
              className={cn(
                "flex flex-col items-start gap-0.5 whitespace-normal",
                !notification.readAt && "bg-accent/50",
              )}
              onClick={() => handleClick(notification)}
            >
              <p className="text-sm font-medium">{notification.title}</p>
              {notification.body && (
                <p className="text-xs text-muted-foreground">{notification.body}</p>
              )}
              <p className="text-xs text-muted-foreground">
                {new Date(notification.createdAt).toLocaleString()}
              </p>
            </DropdownMenuItem>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

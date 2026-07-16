import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

const markReadMock = vi.fn();
const markAllReadMock = vi.fn();
let unreadCount = 0;
let notifications: unknown[] = [];

vi.mock("@/hooks/use-notifications", () => ({
  useUnreadNotificationCount: () => ({ data: { count: unreadCount } }),
  useNotifications: () => ({ data: { data: notifications } }),
  useMarkNotificationRead: () => ({ mutate: markReadMock }),
  useMarkAllNotificationsRead: () => ({ mutate: markAllReadMock }),
}));

import { NotificationBell } from "./notification-bell";

describe("NotificationBell", () => {
  beforeEach(() => {
    unreadCount = 0;
    notifications = [];
    pushMock.mockClear();
    markReadMock.mockClear();
    markAllReadMock.mockClear();
  });

  it("shows no badge when there are zero unread notifications", () => {
    render(<NotificationBell />);
    expect(screen.queryByText(/^\d+\+?$/)).not.toBeInTheDocument();
  });

  it("shows the exact unread count when 9 or fewer", () => {
    unreadCount = 3;
    render(<NotificationBell />);
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("caps the displayed badge at '9+' for large unread counts", () => {
    unreadCount = 42;
    render(<NotificationBell />);
    expect(screen.getByText("9+")).toBeInTheDocument();
    expect(screen.queryByText("42")).not.toBeInTheDocument();
  });

  it("marks a notification read and navigates when an unread item with an articleId is clicked", async () => {
    unreadCount = 1;
    notifications = [
      {
        id: "notif-1",
        title: "Article published",
        body: "Your article is live",
        readAt: null,
        createdAt: new Date().toISOString(),
        data: { articleId: "article-42" },
      },
    ];
    const user = userEvent.setup();
    render(<NotificationBell />);

    await user.click(screen.getByRole("button", { expanded: false }));
    await user.click(await screen.findByText("Article published"));

    expect(markReadMock).toHaveBeenCalledWith("notif-1");
    expect(pushMock).toHaveBeenCalledWith("/articles/article-42");
  });

  it("does not re-mark an already-read notification as read on click", async () => {
    unreadCount = 0;
    notifications = [
      {
        id: "notif-2",
        title: "Already read",
        body: "Old news",
        readAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        data: { articleId: "article-1" },
      },
    ];
    const user = userEvent.setup();
    render(<NotificationBell />);

    await user.click(screen.getByRole("button", { expanded: false }));
    await user.click(await screen.findByText("Already read"));

    expect(markReadMock).not.toHaveBeenCalled();
    expect(pushMock).toHaveBeenCalledWith("/articles/article-1");
  });
});

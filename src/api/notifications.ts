import type { NotificationItem } from "@/api/types";
import { apiClient } from "@/api/client";

export async function fetchNotifications(): Promise<NotificationItem[]> {
  const data = await apiClient<NotificationItem[]>("/api/notifications");
  return Array.isArray(data) ? data.slice(0, 8) : [];
}

export async function markNotificationsRead(): Promise<void> {
  await apiClient("/api/notifications/mark-read", { method: "POST" });
}

import type { NotificationItem } from "@/api/types";
import { apiClient } from "@/api/client";
import { getDataSourceMode } from "@/data/source";

export const NOTIFICATIONS_CHANGED_EVENT = "notifications-changed";

export async function fetchNotifications(): Promise<NotificationItem[]> {
  const data = await apiClient<NotificationItem[]>("/api/notifications");
  return Array.isArray(data) ? data.slice(0, 8) : [];
}

export async function markNotificationsRead(): Promise<void> {
  await apiClient("/api/notifications/mark-read", { method: "POST" });
}

/** Bildirim başlıkları "…: <talep konusu>" biçimindedir; talep kimliği tutulmaz. */
export function ticketNotificationIds(items: NotificationItem[], subject: string): number[] {
  const konu = subject.trim();
  if (!konu) return [];
  return items
    .filter((item) => {
      if (item.read || item.type !== "ticket") return false;
      const title = (item.title || "").trim();
      const sep = title.indexOf(": ");
      return sep >= 0 && title.slice(sep + 2).trim() === konu;
    })
    .map((item) => item.id);
}

/** Açılan destek talebine ait okunmamış bildirimleri okundu yapar; diğer bildirimlere dokunmaz. */
export async function markTicketNotificationsRead(subject: string): Promise<void> {
  if (getDataSourceMode() !== "api") return;
  try {
    const data = await apiClient<NotificationItem[]>("/api/notifications");
    const ids = ticketNotificationIds(Array.isArray(data) ? data : [], subject);
    if (ids.length === 0) return;
    await apiClient("/api/notifications/mark-read-ids", { method: "POST", body: { ids } });
    window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
  } catch {
    /* sessiz */
  }
}

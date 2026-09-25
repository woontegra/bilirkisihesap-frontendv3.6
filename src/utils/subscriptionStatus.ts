import type { SubscriptionProgress } from "@/utils/subscription";

export type SubscriptionUiStatus = "active" | "expired" | "unknown";

export function resolveSubscriptionUiStatus(
  sub: SubscriptionProgress,
  licenseActive?: boolean | null,
  licenseStatus?: string | null,
): SubscriptionUiStatus {
  if (!sub.hasSubscription) {
    return "unknown";
  }

  const status = (licenseStatus ?? "").toUpperCase();

  if (status === "EXPIRED" || status === "INACTIVE") {
    return "expired";
  }

  if (sub.endDate && sub.endDate.getTime() <= Date.now()) {
    return "expired";
  }

  if (sub.daysRemaining > 0) {
    return "active";
  }

  if (licenseActive === false) {
    return "expired";
  }

  return "unknown";
}

export function subscriptionStatusLabel(status: SubscriptionUiStatus): string {
  switch (status) {
    case "active":
      return "Aktif";
    case "expired":
      return "Süresi doldu";
    default:
      return "Bilgi alınamadı";
  }
}

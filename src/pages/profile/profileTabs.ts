import type { LucideIcon } from "lucide-react";
import {
  Bookmark,
  CreditCard,
  MessageSquare,
  Settings,
  User,
  Users,
} from "lucide-react";

export type ProfileTabKey =
  | "info"
  | "saved"
  | "subscription"
  | "tickets"
  | "subusers"
  | "settings";

export type ProfileTabItem = {
  key: ProfileTabKey;
  label: string;
  icon: LucideIcon;
  /** "all" = her tenant; sayı = yalnızca o tenant */
  tenantFilter: "all" | number;
};

export const PROFILE_TABS: ProfileTabItem[] = [
  { key: "info", label: "Profilim", icon: User, tenantFilter: "all" },
  { key: "saved", label: "Kayıtlı Hesaplamalar", icon: Bookmark, tenantFilter: "all" },
  { key: "subscription", label: "Abonelik Bilgilerim", icon: CreditCard, tenantFilter: "all" },
  { key: "tickets", label: "Destek Talepleri", icon: MessageSquare, tenantFilter: "all" },
  { key: "subusers", label: "Alt Kullanıcılar", icon: Users, tenantFilter: 1 },
  { key: "settings", label: "Ayarlar", icon: Settings, tenantFilter: "all" },
];

export function getVisibleProfileTabs(tenantId: number): ProfileTabItem[] {
  return PROFILE_TABS.filter((item) => {
    if (item.tenantFilter === "all") return true;
    return tenantId === item.tenantFilter;
  });
}

export function isValidProfileTab(
  tab: string | null,
  tenantId: number,
): tab is ProfileTabKey {
  if (!tab) return false;
  return getVisibleProfileTabs(tenantId).some((item) => item.key === tab);
}

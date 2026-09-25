const ROLE_LABELS: Record<string, string> = {
  admin: "Yönetici",
  user: "Kullanıcı",
  customer: "Kullanıcı",
  client: "Kullanıcı",
  member: "Kullanıcı",
  guest: "Misafir",
  editor: "Editör",
  viewer: "İzleyici",
};

/** JWT/backend rol kodunu kullanıcı arayüzü etiketine çevirir. İç değerleri değiştirmez. */
export function formatUserRoleLabel(role: string | null | undefined): string {
  if (!role?.trim()) return "";
  const normalized = role.trim().toLowerCase();
  if (ROLE_LABELS[normalized]) return ROLE_LABELS[normalized];

  // Bilinmeyen kodları ham İngilizce/UPPERCASE olarak gösterme; kelime biçimine çevir.
  return role
    .trim()
    .replace(/_/g, " ")
    .split(/\s+/)
    .map((word) => word.charAt(0).toLocaleUpperCase("tr-TR") + word.slice(1).toLocaleLowerCase("tr-TR"))
    .join(" ");
}

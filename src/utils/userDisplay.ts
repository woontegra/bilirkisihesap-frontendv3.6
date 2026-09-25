/** Üst bar / profil başlığı — yalnızca ad-soyad; e-posta karıştırılmaz. */
export function resolveUserDisplayName(name: string | null | undefined): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) {
    return "Kullanıcı";
  }

  if (trimmed.includes("@")) {
    // Bozuk kayıt: "Ferdi tayfuradmin@domain.com" gibi name+email birleşimi
    const localPart = trimmed.slice(0, trimmed.indexOf("@"));
    const cleaned = localPart.replace(/admin$/i, "").trim();
    if (cleaned && !cleaned.includes("@")) {
      return cleaned;
    }
    return "Kullanıcı";
  }

  return trimmed;
}

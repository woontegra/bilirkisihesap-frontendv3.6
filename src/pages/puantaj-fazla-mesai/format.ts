/** Türkçe biçimlendirme yardımcıları (para, saat, tarih). */

export function formatTL(value: number): string {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value ?? 0);
}

export function formatHours(value: number): string {
  return `${new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    value ?? 0,
  )} saat`;
}

export function formatNumber(value: number, digits = 2): string {
  return new Intl.NumberFormat("tr-TR", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(
    value ?? 0,
  );
}

/** ISO (YYYY-MM-DD) → "DD.MM.YYYY"; geçersizse olduğu gibi döner. */
export function formatDateTR(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  if (!m) return iso ?? "";
  return `${m[3]}.${m[2]}.${m[1]}`;
}

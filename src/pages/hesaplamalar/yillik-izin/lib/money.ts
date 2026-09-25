/**
 * Yıllık Ücretli İzin — sayı/para yardımcıları.
 * Yalnızca ihbar-tazminati modülü içinde paylaşılır. İş mantığı (vergi/hafta) İÇERMEZ.
 */

/** Backend `round2` ile birebir. */
export function round2(n: number): number {
  return Math.round((n || 0) * 100) / 100;
}

/** Türkçe para: binlik noktaları sil, virgülü ondalığa çevir. Geçersiz/negatif → 0. */
export function parseNum(v: string | number | undefined | null): number {
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 ? v : 0;
  const n = Number(String(v ?? "").replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

export function formatMoney(n: number): string {
  const safe = Number.isFinite(n) ? n : 0;
  return new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(safe);
}

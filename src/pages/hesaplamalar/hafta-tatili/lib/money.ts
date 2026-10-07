export function round2(n: number): number {
  return Math.round((n || 0) * 100) / 100;
}

export function parseNum(v: string): number {
  const n = Number(String(v ?? "").replace(/\./g, "").replace(",", ".").replace("₺", "").trim());
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

export function formatMoney(n: number): string {
  const safe = Number.isFinite(n) ? n : 0;
  return new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(safe);
}

export const fmtTR = formatMoney;

export function formatDateTR(iso: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

/** Geçerli YYYY-MM-DD uç değeri. Yarım veya sayıya dönmeyen gün toISOString fırlatmaz. */
export function boundedIso(values: string[], edge: "min" | "max"): string {
  const real = values
    .map((value) => String(value ?? "").slice(0, 10))
    .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)));
  if (!real.length) return "";
  real.sort();
  return edge === "min" ? real[0] : real[real.length - 1];
}

export function clampYear(value: string): string {
  if (!value || !value.includes("-")) return value;
  const parts = value.split("-");
  if (parts[0] && parts[0].length > 4) parts[0] = parts[0].substring(0, 4);
  return parts.join("-");
}

export function newLocalId(prefix = "ht"): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

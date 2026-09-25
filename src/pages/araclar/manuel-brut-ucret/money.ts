/** Türk lirası giriş/çıkış yardımcıları — yalnızca bu sayfa. */

export function parseMoneyInput(value: string): number {
  const normalized = String(value).trim().replace(/\./g, "").replace(",", ".");
  if (!normalized) return 0;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

export function formatMoneyInput(value: number): string {
  if (!value || !Number.isFinite(value)) return "";
  return value.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatFloorDisplay(value: number): string {
  return value.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export { sanitizeMoneyTyping } from "@/utils/moneyInput";

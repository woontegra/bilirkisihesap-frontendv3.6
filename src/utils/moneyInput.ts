/**
 * Türkçe para girişi: binlik nokta, ondalık virgül.
 * Tüm hesaplama sayfalarında ortak kullanılır.
 */

/** "30.000,50" → 30000.5 */
export function parseMoneyInput(value: string): number {
  const normalized = String(value ?? "")
    .trim()
    .replace(/\./g, "")
    .replace(",", ".");
  if (!normalized) return 0;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

/** Sonuç gösterimi: 30000.5 → "30.000,50" */
export function formatMoneyAmount(value: number): string {
  return new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

/**
 * Yazarken binlik/ondalık ayraç uygular.
 * Örn: 30000 → 30.000 · 30000,5 → 30.000,5
 */
export function sanitizeMoneyTyping(raw: string): string {
  if (raw === "") return "";

  const cleaned = raw.replace(/[^\d,]/g, "");
  const commaIndex = cleaned.indexOf(",");
  const hasComma = commaIndex >= 0;
  const intDigits = (hasComma ? cleaned.slice(0, commaIndex) : cleaned).replace(/\D/g, "");
  const decDigits = hasComma ? cleaned.slice(commaIndex + 1).replace(/\D/g, "").slice(0, 2) : "";
  const trailingComma = hasComma && cleaned.endsWith(",");

  if (!intDigits && !decDigits && !trailingComma) return "";

  const normalizedInt = intDigits.replace(/^0+(?=\d)/, "");
  const intForFormat = normalizedInt || (decDigits || trailingComma ? "0" : "");
  if (!intForFormat && !decDigits && !trailingComma) return "";

  const formattedInt = intForFormat.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  if (trailingComma && !decDigits) return `${formattedInt},`;
  if (hasComma) return `${formattedInt},${decDigits}`;
  return formattedInt;
}

/** Kayıt/backend'den gelen ham değeri input'ta gösterilebilir hale getirir. */
export function formatMoneyFieldValue(value: unknown): string {
  const raw = value === null || value === undefined ? "" : String(value).trim();
  if (!raw) return "";
  return sanitizeMoneyTyping(raw);
}

export function formatMoneyExtraValues<T extends { value: string }>(items: T[]): T[] {
  return items.map((item) => ({ ...item, value: formatMoneyFieldValue(item.value) }));
}
